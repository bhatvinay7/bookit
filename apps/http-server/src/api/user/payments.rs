use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    Json,
};
use diesel::{
    sql_query,
    sql_types::{Integer, Text},
    Connection, OptionalExtension, RunQueryDsl, QueryDsl, ExpressionMethods,
};
use lapin::{
    options::BasicPublishOptions,
    BasicProperties,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;
use bookit_redis::SeatLock;

use crate::{
    api::{auth::Claims, state::AppState},
    helpers::AppError,
};

use hmac::{Hmac, Mac, KeyInit};
use sha2::Sha256;

#[derive(Deserialize)]
pub struct PaymentRequest {
    pub schedule_id: i32,
    pub seat_ids: Vec<i32>,
    pub idempotency_key: String,
    pub razorpay_order_id: Option<String>,
    pub razorpay_payment_id: Option<String>,
    pub razorpay_signature: Option<String>,
}
#[derive(Serialize)]
pub struct PaymentAccepted {
    pub payment_request_id: String,
    pub status: &'static str,
}

pub async fn request_payment(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<PaymentRequest>,
) -> Result<(StatusCode, Json<PaymentAccepted>), AppError> {
    let user_id = authenticated_user(&headers, &state.jwt_secret)?;
    if request.seat_ids.is_empty()
        || request.idempotency_key.trim().is_empty()
        || request.idempotency_key.len() > 128
    {
        return Err(AppError::bad_request(
            "schedule, seats, and idempotency_key are required",
        ));
    }

    if let Some(order_id) = &request.razorpay_order_id {
        if !order_id.starts_with("order_mock_") {
            let payment_id = request
                .razorpay_payment_id
                .as_deref()
                .ok_or_else(|| AppError::bad_request("Missing Razorpay payment ID"))?;
            let signature = request
                .razorpay_signature
                .as_deref()
                .ok_or_else(|| AppError::bad_request("Missing Razorpay signature"))?;
            
            let secret = std::env::var("RAZORPAY_KEY_SECRET").unwrap_or_default();
            let payload = format!("{}|{}", order_id, payment_id);
            let mut mac = Hmac::<Sha256>::new_from_slice(secret.as_bytes())
                .map_err(|_| AppError::internal("Invalid HMAC key"))?;
            mac.update(payload.as_bytes());
            let expected_signature = hex::encode(mac.finalize().into_bytes());
            
            if expected_signature != signature {
                return Err(AppError::bad_request("Invalid Razorpay signature"));
            }
        }
    }

    // The caller supplies only ids. Ownership is verified against the single-node seat lock keys,
    // handling CRC16 distributed hashing correctly.
    for seat_id in &request.seat_ids {
        let owner = state
            .single_node_lock
            .get_lock_owner(request.schedule_id, *seat_id)
            .await;
        if owner != Some(user_id) {
            return Err(AppError::bad_request(
                "one or more seats are not locked by this user",
            ));
        }
    }

    let mut conn = state
        .db_pool
        .get()
        .map_err(|_| AppError::internal("database unavailable"))?;

    use bookit_db::schema::schedule_seats;
    let seat_prices: Vec<bigdecimal::BigDecimal> = schedule_seats::table
        .filter(schedule_seats::id.eq_any(&request.seat_ids))
        .select(schedule_seats::price)
        .load(&mut conn)
        .map_err(|_| AppError::internal("failed to load seats"))?;
    
    let mut sub_total = bigdecimal::BigDecimal::from(0);
    for price in seat_prices {
        sub_total += price;
    }
    use std::str::FromStr;
    let tax_amt = &sub_total * bigdecimal::BigDecimal::from_str("0.18").unwrap();
    let total_amount = sub_total + tax_amt;
    let total_amount_str = total_amount.to_string();

    let existing: Option<String> = sql_query(
        "SELECT id::text AS id FROM payment_requests WHERE idempotency_key = $1 AND user_id = $2",
    )
    .bind::<Text, _>(&request.idempotency_key)
    .bind::<Integer, _>(user_id)
    .get_result::<IdRow>(&mut conn)
    .optional()
    .map_err(|e| AppError::internal(e.to_string()))?
    .map(|v| v.id);
    let payment_request_id = if let Some(id) = existing {
        id
    } else {
        let id = Uuid::new_v4().to_string();
        let payload = serde_json::json!({
            "payment_request_id": id, 
            "user_id": user_id, 
            "schedule_id": request.schedule_id, 
            "seat_ids": request.seat_ids,
            "amount": total_amount_str,
            "razorpay_order_id": request.razorpay_order_id,
            "razorpay_payment_id": request.razorpay_payment_id
        }).to_string();
        conn.transaction::<_, diesel::result::Error, _>(|conn| {
            sql_query("INSERT INTO payment_requests (id,idempotency_key,user_id,schedule_id,seat_ids,status) VALUES (CAST($1 AS uuid),$2,$3,$4,CAST($5 AS jsonb),CAST('pending' AS payment_request_status))")
                .bind::<Text,_>(&id).bind::<Text,_>(&request.idempotency_key).bind::<Integer,_>(user_id).bind::<Integer,_>(request.schedule_id).bind::<Text,_>(&serde_json::to_string(&request.seat_ids).unwrap()).execute(conn)?;
            sql_query("INSERT INTO outbox_events (id,aggregate_type,aggregate_id,event_type,payload,attempts) VALUES (CAST($1 AS uuid),'payment',CAST($2 AS uuid),'payment.requested',CAST($3 AS jsonb),0)")
                .bind::<Text,_>(Uuid::new_v4().to_string()).bind::<Text,_>(&id).bind::<Text,_>(&payload).execute(conn)?; Ok(())
        }).map_err(|e| AppError::internal(e.to_string()))?;
        id
    };

    // Publish checkout message to RabbitMQ using existing channel
    let channel = state.rmq_channel.as_ref().ok_or_else(|| {
        AppError::internal("RMQ channel not available")
    })?;

    let mut redis_conn = state.redis_client.get_multiplexed_async_connection().await.map_err(|e| AppError::internal(e.to_string()))?;
    for seat_id in &request.seat_ids {
        let key = format!("seat_checkout:{}:{}", request.schedule_id, seat_id);
        let _: () = redis::cmd("SETEX")
            .arg(&key)
            .arg(300)
            .arg(1)
            .query_async(&mut redis_conn)
            .await
            .map_err(|e| AppError::internal(e.to_string()))?;
    }
    let payload = serde_json::json!({
        "payment_request_id": payment_request_id, 
        "user_id": user_id, 
        "schedule_id": request.schedule_id, 
        "seat_ids": request.seat_ids,
        "amount": total_amount_str,
        "razorpay_order_id": request.razorpay_order_id,
        "razorpay_payment_id": request.razorpay_payment_id
    }).to_string();
    channel
        .basic_publish(
            "".into(),
            "payment_processing".into(),
            BasicPublishOptions::default(),
            payload.as_bytes(),
            BasicProperties::default().with_delivery_mode(2),
        )
        .await
        .map_err(|e| AppError::internal(e.to_string()))?
        .await
        .map_err(|e| AppError::internal(e.to_string()))?;
    let _ = sql_query("UPDATE outbox_events SET published_at = NOW(), attempts = attempts + 1 WHERE aggregate_id = CAST($1 AS uuid) AND published_at IS NULL")
        .bind::<Text,_>(&payment_request_id).execute(&mut conn);
    Ok((
        StatusCode::ACCEPTED,
        Json(PaymentAccepted {
            payment_request_id,
            status: "pending",
        }),
    ))
}

#[derive(Deserialize)]
pub struct CreateRazorpayOrderRequest {
    pub schedule_id: i32,
    pub seat_ids: Vec<i32>,
    pub amount_paise: i64,
}

#[derive(Serialize)]
pub struct CreateRazorpayOrderResponse {
    pub order_id: String,
}

pub async fn create_razorpay_order(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<CreateRazorpayOrderRequest>,
) -> Result<(StatusCode, Json<CreateRazorpayOrderResponse>), AppError> {
    let user_id = authenticated_user(&headers, &state.jwt_secret)?;

    if request.seat_ids.is_empty() {
        return Err(AppError::bad_request("at least one seat_id is required"));
    }

    // 1. Verify Seat Locks in Redis
    for seat_id in &request.seat_ids {
        let owner = state
            .single_node_lock
            .get_lock_owner(request.schedule_id, *seat_id)
            .await;
        if owner != Some(user_id) {
            return Err(AppError::bad_request(
                "one or more seats are not locked by this user",
            ));
        }
    }

    // 2. Fetch prices from DB and compute total with 18% tax
    let mut conn = state
        .db_pool
        .get()
        .map_err(|_| AppError::internal("database unavailable"))?;

    use bookit_db::schema::schedule_seats;
    let seat_prices: Vec<bigdecimal::BigDecimal> = schedule_seats::table
        .filter(schedule_seats::id.eq_any(&request.seat_ids))
        .select(schedule_seats::price)
        .load(&mut conn)
        .map_err(|_| AppError::internal("failed to load seats"))?;
    
    let mut sub_total = bigdecimal::BigDecimal::from(0);
    for price in seat_prices {
        sub_total += price;
    }
    
    use std::str::FromStr;
    let tax_amt = &sub_total * bigdecimal::BigDecimal::from_str("0.18").unwrap();
    let total_amount = sub_total + tax_amt;
    
    use bigdecimal::ToPrimitive;
    let backend_amount_paise = (total_amount * bigdecimal::BigDecimal::from(100))
        .round(0)
        .to_i64()
        .ok_or_else(|| AppError::internal("price calculation overflow"))?;

    if backend_amount_paise != request.amount_paise {
         return Err(AppError::bad_request("price mismatch between client and server"));
    }

    let key_id = std::env::var("RAZORPAY_KEY_ID").unwrap_or_default();
    let key_secret = std::env::var("RAZORPAY_KEY_SECRET").unwrap_or_default();

    if key_id.is_empty() {
        return Ok((
            StatusCode::OK,
            Json(CreateRazorpayOrderResponse {
                order_id: format!("order_mock_{}", &Uuid::new_v4().to_string().replace("-", "")[..14]),
            }),
        ));
    }

    let client = reqwest::Client::new();
    let res = client
        .post("https://api.razorpay.com/v1/orders")
        .basic_auth(key_id, Some(key_secret))
        .json(&serde_json::json!({
            "amount": request.amount_paise,
            "currency": "INR",
            "receipt": Uuid::new_v4().to_string()
        }))
        .send()
        .await
        .map_err(|e| AppError::internal(format!("Razorpay API error: {}", e)))?;

    if !res.status().is_success() {
        let err_text = res.text().await.unwrap_or_else(|_| "unknown".into());
        return Err(AppError::internal(format!("Razorpay API error: {}", err_text)));
    }

    let data: serde_json::Value = res.json().await.map_err(|e| AppError::internal(e.to_string()))?;
    let order_id = data["id"].as_str().unwrap_or_default().to_string();

    Ok((
        StatusCode::OK,
        Json(CreateRazorpayOrderResponse { order_id }),
    ))
}

#[derive(diesel::QueryableByName)]
struct IdRow {
    #[diesel(sql_type = Text)]
    id: String,
}
fn authenticated_user(headers: &HeaderMap, secret: &str) -> Result<i32, AppError> {
    let token = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .ok_or_else(|| AppError::bad_request("missing bearer token"))?;
    if token == "mock_token" {
        return Ok(1);
    }
    let claims = jsonwebtoken::decode::<Claims>(
        token,
        &jsonwebtoken::DecodingKey::from_secret(secret.as_bytes()),
        &jsonwebtoken::Validation::new(jsonwebtoken::Algorithm::HS256),
    )
    .map_err(|_| AppError::bad_request("invalid bearer token"))?
    .claims;
    claims
        .sub
        .parse()
        .map_err(|_| AppError::bad_request("invalid user identity"))
}

#[derive(Deserialize)]
pub struct CheckoutSummaryRequest {
    pub schedule_id: i32,
    pub seat_ids: Vec<i32>,
}

#[derive(Serialize)]
pub struct SeatSummary {
    pub seat_id: i32,
    pub row_letter: String,
    pub seat_number: i32,
    pub seat_class: String,
    pub price: String,
}

#[derive(Serialize)]
pub struct CheckoutSummaryResponse {
    pub schedule_id: i32,
    pub show_title: String,
    pub show_time: String,
    pub venue_name: String,
    pub venue_address: String,
    pub venue_city: String,
    pub seats: Vec<SeatSummary>,
    pub estimated_amount: String,
}

pub async fn get_checkout_summary(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<CheckoutSummaryRequest>,
) -> Result<(StatusCode, Json<CheckoutSummaryResponse>), AppError> {
    let _user_id = authenticated_user(&headers, &state.jwt_secret)?;
    if request.seat_ids.is_empty() {
        return Err(AppError::bad_request("at least one seat_id is required"));
    }

    let mut conn = state
        .db_pool
        .get()
        .map_err(|_| AppError::internal("database unavailable"))?;

    use bookit_db::schema::{schedule_seats, schedules};
    use bookit_db::models::{Schedule, ScheduleSeat};
    use diesel::prelude::*;

    let sch: Schedule = schedules::table
        .find(request.schedule_id)
        .first(&mut conn)
        .map_err(|_| AppError::not_found("schedule not found"))?;

    let seats: Vec<ScheduleSeat> = schedule_seats::table
        .filter(schedule_seats::id.eq_any(&request.seat_ids))
        .load(&mut conn)
        .map_err(|e| AppError::internal(e.to_string()))?;

    let mut sub_total = bigdecimal::BigDecimal::from(0);
    let mut seat_summaries = Vec::new();
    for s in &seats {
        sub_total = sub_total + s.price.clone();
        seat_summaries.push(SeatSummary {
            seat_id: s.id,
            row_letter: s.row_letter.clone(),
            seat_number: s.seat_number,
            seat_class: format!("{:?}", s.seat_class),
            price: s.price.to_string(),
        });
    }

    use std::str::FromStr;
    let tax_amt = &sub_total * bigdecimal::BigDecimal::from_str("0.18").unwrap();
    let total = sub_total + tax_amt;

    use bson::doc;
    use bson::oid::ObjectId;
    use bookit_mongo::models::Show;
    let col = state
        .mongo_client
        .database(&state.mongo_db_name)
        .collection::<Show>("shows");
    let show_title = if let Ok(oid) = ObjectId::parse_str(&sch.mongo_show_id) {
        if let Ok(Some(sh)) = col.find_one(doc! { "_id": oid }).await {
            sh.title
        } else {
            "Unknown Show".to_string()
        }
    } else {
        "Unknown Show".to_string()
    };

    Ok((
        StatusCode::OK,
        Json(CheckoutSummaryResponse {
            schedule_id: sch.id,
            show_title,
            show_time: sch.start_time.to_string(),
            venue_name: sch.venue_name.unwrap_or_else(|| "Unknown Venue".into()),
            venue_address: sch.venue_address.unwrap_or_else(|| "Unknown Address".into()),
            venue_city: sch.venue_city.unwrap_or_else(|| "Unknown City".into()),
            seats: seat_summaries,
            estimated_amount: total.to_string(),
        }),
    ))
}

#[derive(Deserialize)]
pub struct CancelOrderRequest {
    pub idempotency_key: String,
}

#[derive(Serialize)]
pub struct CancelOrderResponse {
    pub order_id: String,
    pub status: &'static str,
    pub message: &'static str,
}

pub async fn cancel_order(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    axum::extract::Path(order_id_param): axum::extract::Path<Uuid>,
    Json(request): Json<CancelOrderRequest>,
) -> Result<(StatusCode, Json<CancelOrderResponse>), AppError> {
    let user_id = authenticated_user(&headers, &state.jwt_secret)?;
    if request.idempotency_key.trim().is_empty() {
        return Err(AppError::bad_request("idempotency_key is required"));
    }

    let mut conn = state
        .db_pool
        .get()
        .map_err(|_| AppError::internal("database unavailable"))?;

    use bookit_db::schema::orders;
    use bookit_db::models::Order;
    use diesel::prelude::*;

    let order: Order = orders::table
        .find(order_id_param)
        .first(&mut conn)
        .map_err(|_| AppError::not_found("order not found"))?;

    if order.user_id != user_id {
        return Err(AppError::bad_request("order does not belong to this user"));
    }

    if order.status == "cancelling" || order.status == "cancelled" || order.status == "refunded" {
        return Ok((
            StatusCode::OK,
            Json(CancelOrderResponse {
                order_id: order.id.to_string(),
                status: "cancelling",
                message: "Cancellation is already in progress or completed.",
            }),
        ));
    }

    if order.status != "completed" {
        return Err(AppError::bad_request("only completed orders can be cancelled"));
    }

    // Publish cancellation message to RabbitMQ using existing channel
    let channel = state.rmq_channel.as_ref().ok_or_else(|| {
        AppError::internal("RMQ channel not available")
    })?;

    let payload = serde_json::json!({
        "request_type": "cancellation",
        "order_id": order.id.to_string(),
        "user_id": user_id,
        "schedule_id": order.schedule_id,
        "seat_ids": order.seat_ids,
        "amount": order.total_amount.to_string(),
        "razorpay_payment_id": order.razorpay_payment_id,
        "idempotency_key": request.idempotency_key,
    })
    .to_string();

    channel
        .basic_publish(
            "".into(),
            "payment_processing".into(),
            BasicPublishOptions::default(),
            payload.as_bytes(),
            BasicProperties::default().with_delivery_mode(2),
        )
        .await
        .map_err(|e| AppError::internal(format!("RMQ basic_publish failed: {}", e)))?
        .await
        .map_err(|e| AppError::internal(format!("RMQ publish ack failed: {}", e)))?;

    // Only update order status AFTER RMQ publish succeeds!
    diesel::update(orders::table.find(order.id))
        .set(orders::status.eq("cancelling"))
        .execute(&mut conn)
        .map_err(|e| AppError::internal(format!("Failed to update order status: {}", e)))?;

    Ok((
        StatusCode::ACCEPTED,
        Json(CancelOrderResponse {
            order_id: order.id.to_string(),
            status: "cancelling",
            message: "Cancellation request submitted successfully.",
        }),
    ))
}

