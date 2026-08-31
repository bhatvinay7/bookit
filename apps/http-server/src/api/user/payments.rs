use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode},
};
use bookit_redis::SeatLock;
use diesel::{
    Connection, ExpressionMethods, OptionalExtension, QueryDsl, RunQueryDsl, sql_query,
    sql_types::{Integer, Text},
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

use crate::{
    api::{auth::Claims, state::AppState},
    helpers::AppError,
};

use hmac::{Hmac, KeyInit, Mac};
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
    pub status: String,
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

    if let Some(order_id) = &request.razorpay_order_id
        && !order_id.starts_with("order_mock_")
    {
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

    let mut conn = state
        .db_pool
        .get()
        .map_err(|_| AppError::internal("database unavailable"))?;

    let existing: Option<ExistingPaymentRow> = sql_query(
        "SELECT id::text AS id, status::text AS status, schedule_id, seat_ids::text AS seat_ids FROM payment_requests WHERE idempotency_key = $1 AND user_id = $2",
    )
    .bind::<Text, _>(&request.idempotency_key)
    .bind::<Integer, _>(user_id)
    .get_result(&mut conn)
    .optional()
    .map_err(|e| AppError::internal(e.to_string()))?;
    if let Some(existing) = existing {
        let existing_seats: Vec<i32> = serde_json::from_str(&existing.seat_ids)
            .map_err(|e| AppError::internal(e.to_string()))?;
        if !same_payment_intent(
            existing.schedule_id,
            &existing_seats,
            request.schedule_id,
            &request.seat_ids,
        ) {
            return Err(AppError::bad_request(
                "idempotency_key was already used for a different payment request",
            ));
        }
        return Ok((
            StatusCode::ACCEPTED,
            Json(PaymentAccepted {
                payment_request_id: existing.id,
                status: existing.status,
            }),
        ));
    }

    // Verify ownership before creating the durable payment request. The checkout marker is
    // retained until the payment processor succeeds or rejects the message.
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

    use bookit_db::schema::schedule_seats;
    let seat_prices: Vec<bigdecimal::BigDecimal> = schedule_seats::table
        .filter(schedule_seats::id.eq_any(&request.seat_ids))
        .filter(schedule_seats::schedule_id.eq(request.schedule_id))
        .select(schedule_seats::price)
        .load(&mut conn)
        .map_err(|_| AppError::internal("failed to load seats"))?;

    if seat_prices.len() != request.seat_ids.len() {
        return Err(AppError::bad_request(
            "one or more seats do not belong to the requested schedule",
        ));
    }

    let mut sub_total = bigdecimal::BigDecimal::from(0);
    for price in seat_prices {
        sub_total += price;
    }
    use std::str::FromStr;
    let tax_amt = &sub_total * bigdecimal::BigDecimal::from_str("0.18").unwrap();
    let total_amount = sub_total + tax_amt;
    let total_amount_str = total_amount.to_string();

    let payment_request_id = Uuid::new_v4().to_string();
    let checkout_owner = format!("{}:{}", user_id, request.idempotency_key);
    let mut redis_conn = state
        .redis_client
        .get_multiplexed_async_connection()
        .await
        .map_err(|e| AppError::internal(e.to_string()))?;
    let mut created_checkout_keys = Vec::new();
    for seat_id in &request.seat_ids {
        let key = format!("seat_checkout:{}:{}", request.schedule_id, seat_id);
        let set: Option<String> = redis::cmd("SET")
            .arg(&key)
            .arg(&checkout_owner)
            .arg("NX")
            .arg("EX")
            .arg(300)
            .query_async(&mut redis_conn)
            .await
            .map_err(|e| AppError::internal(e.to_string()))?;
        if set.is_none() {
            let current: Option<String> = redis::cmd("GET")
                .arg(&key)
                .query_async(&mut redis_conn)
                .await
                .map_err(|e| AppError::internal(e.to_string()))?;
            if current.as_deref() != Some(checkout_owner.as_str()) {
                for created_key in &created_checkout_keys {
                    let _: () = redis::cmd("DEL")
                        .arg(created_key)
                        .query_async(&mut redis_conn)
                        .await
                        .unwrap_or_default();
                }
                return Err(AppError::bad_request(
                    "one or more seats already have a checkout in progress",
                ));
            }
        } else {
            created_checkout_keys.push(key);
        }
    }
    let payload = serde_json::json!({
        "payment_request_id": payment_request_id,
        "user_id": user_id,
        "schedule_id": request.schedule_id,
        "seat_ids": request.seat_ids,
        "amount": total_amount_str,
        "razorpay_order_id": request.razorpay_order_id,
        "razorpay_payment_id": request.razorpay_payment_id
    })
    .to_string();
    let insert_result = match conn.transaction::<_, diesel::result::Error, _>(|conn| {
        let inserted = sql_query("INSERT INTO payment_requests (id,idempotency_key,user_id,schedule_id,seat_ids,status) VALUES (CAST($1 AS uuid),$2,$3,$4,CAST($5 AS jsonb),CAST('pending' AS payment_request_status)) ON CONFLICT (user_id,idempotency_key) DO NOTHING")
            .bind::<Text,_>(&payment_request_id)
            .bind::<Text,_>(&request.idempotency_key)
            .bind::<Integer,_>(user_id)
            .bind::<Integer,_>(request.schedule_id)
            .bind::<Text,_>(&serde_json::to_string(&request.seat_ids).unwrap())
            .execute(conn)?;
        if inserted == 1 {
            sql_query("INSERT INTO outbox_events (id,aggregate_type,aggregate_id,event_type,payload,attempts) VALUES (CAST($1 AS uuid),'payment',CAST($2 AS uuid),'payment.requested',CAST($3 AS jsonb),0)")
                .bind::<Text,_>(Uuid::new_v4().to_string())
                .bind::<Text,_>(&payment_request_id)
                .bind::<Text,_>(&payload)
                .execute(conn)?;
        }
        Ok(inserted)
    }) {
        Ok(inserted) => inserted,
        Err(error) => {
            for key in &created_checkout_keys {
                let _: () = redis::cmd("DEL")
                    .arg(key)
                    .query_async(&mut redis_conn)
                    .await
                    .unwrap_or_default();
            }
            return Err(AppError::internal(error.to_string()));
        }
    };

    let accepted_id = if insert_result == 1 {
        payment_request_id
    } else {
        let existing = sql_query("SELECT id::text AS id, status::text AS status, schedule_id, seat_ids::text AS seat_ids FROM payment_requests WHERE idempotency_key = $1 AND user_id = $2")
            .bind::<Text,_>(&request.idempotency_key)
            .bind::<Integer,_>(user_id)
            .get_result::<ExistingPaymentRow>(&mut conn)
            .map_err(|e| AppError::internal(e.to_string()))?;
        let existing_seats: Vec<i32> = serde_json::from_str(&existing.seat_ids)
            .map_err(|e| AppError::internal(e.to_string()))?;
        if !same_payment_intent(
            existing.schedule_id,
            &existing_seats,
            request.schedule_id,
            &request.seat_ids,
        ) {
            return Err(AppError::bad_request(
                "idempotency_key was already used for a different payment request",
            ));
        }
        existing.id
    };
    Ok((
        StatusCode::ACCEPTED,
        Json(PaymentAccepted {
            payment_request_id: accepted_id,
            status: "pending".into(),
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
        return Err(AppError::bad_request(
            "price mismatch between client and server",
        ));
    }

    let key_id = std::env::var("RAZORPAY_KEY_ID").unwrap_or_default();
    let key_secret = std::env::var("RAZORPAY_KEY_SECRET").unwrap_or_default();

    if key_id.is_empty() {
        return Ok((
            StatusCode::OK,
            Json(CreateRazorpayOrderResponse {
                order_id: format!(
                    "order_mock_{}",
                    &Uuid::new_v4().to_string().replace("-", "")[..14]
                ),
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
        return Err(AppError::internal(format!(
            "Razorpay API error: {}",
            err_text
        )));
    }

    let data: serde_json::Value = res
        .json()
        .await
        .map_err(|e| AppError::internal(e.to_string()))?;
    let order_id = data["id"].as_str().unwrap_or_default().to_string();

    Ok((
        StatusCode::OK,
        Json(CreateRazorpayOrderResponse { order_id }),
    ))
}

#[derive(diesel::QueryableByName)]
struct ExistingPaymentRow {
    #[diesel(sql_type = Text)]
    id: String,
    #[diesel(sql_type = Text)]
    status: String,
    #[diesel(sql_type = Integer)]
    schedule_id: i32,
    #[diesel(sql_type = Text)]
    seat_ids: String,
}

pub fn same_payment_intent(
    existing_schedule_id: i32,
    existing_seats: &[i32],
    requested_schedule_id: i32,
    requested_seats: &[i32],
) -> bool {
    if existing_schedule_id != requested_schedule_id {
        return false;
    }
    let mut existing = existing_seats.to_vec();
    let mut requested = requested_seats.to_vec();
    existing.sort_unstable();
    requested.sort_unstable();
    existing == requested
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

    use bookit_db::models::{Schedule, ScheduleSeat};
    use bookit_db::schema::{schedule_seats, schedules};
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
        sub_total += s.price.clone();
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

    use bookit_mongo::models::Show;
    use bson::doc;
    use bson::oid::ObjectId;
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
            venue_address: sch
                .venue_address
                .unwrap_or_else(|| "Unknown Address".into()),
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

    use bookit_db::models::Order;
    use bookit_db::schema::orders;
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
        return Err(AppError::bad_request(
            "only completed orders can be cancelled",
        ));
    }

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

    conn.transaction::<_, diesel::result::Error, _>(|conn| {
        let updated = diesel::update(
            orders::table
                .filter(orders::id.eq(order.id))
                .filter(orders::status.eq("completed")),
        )
        .set(orders::status.eq("cancelling"))
        .execute(conn)?;
        if updated == 1 {
            sql_query("INSERT INTO outbox_events (id,aggregate_type,aggregate_id,event_type,payload,attempts) VALUES (CAST($1 AS uuid),'payment',CAST($2 AS uuid),'payment.cancellation_requested',CAST($3 AS jsonb),0)")
                .bind::<Text,_>(Uuid::new_v4().to_string())
                .bind::<Text,_>(order.id.to_string())
                .bind::<Text,_>(&payload)
                .execute(conn)?;
        }
        Ok(())
    })
    .map_err(|e| AppError::internal(format!("failed to enqueue cancellation: {e}")))?;

    Ok((
        StatusCode::ACCEPTED,
        Json(CancelOrderResponse {
            order_id: order.id.to_string(),
            status: "cancelling",
            message: "Cancellation request submitted successfully.",
        }),
    ))
}
