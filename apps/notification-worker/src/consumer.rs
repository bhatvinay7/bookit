use bigdecimal::BigDecimal;
use bookit_db::{
    db::DbPool,
    models::{NewTicket, NewUserAudit, ScheduleSeat, Ticket},
    schema::{
        schedule_seats::dsl as ss, schedules::dsl as sd, tickets::dsl as tk, user_audits::dsl as ua,
    },
};

use diesel::prelude::*;
use futures::StreamExt;
use lapin::{
    Consumer,
    options::{BasicAckOptions, BasicNackOptions},
};
use serde_json::json;
use std::env;
use std::str::FromStr;
use uuid::Uuid;

use crate::{
    db::get_user_email,
    email::{
        BookingEmailData, CancellationEmailData, send_booking_confirmation,
        send_cancellation_confirmation,
    },
};

fn parse_seat_ids(payload: &serde_json::Value) -> Vec<i32> {
    if let Some(arr) = payload["seat_ids"].as_array() {
        arr.iter()
            .filter_map(|v| v.as_i64().map(|x| x as i32))
            .collect()
    } else if let Some(id) = payload["seat_id"].as_i64() {
        vec![id as i32]
    } else {
        vec![]
    }
}

pub async fn process_messages(mut consumer: Consumer, db_pool: DbPool) {
    println!("Listening for Fanout Booking Events...");

    while let Some(delivery) = consumer.next().await {
        if let Ok(delivery) = delivery {
            if let Ok(payload) = serde_json::from_slice::<serde_json::Value>(&delivery.data) {
                let event_type = payload["event_type"].as_str().unwrap_or_default();
                println!("Received event_type: {}", event_type);

                if event_type == "OrderCompleted" || event_type == "BookingSuccess" {
                    let order_id_str = payload["order_id"].as_str().unwrap_or_default();
                    let user_id_val = payload["user_id"].as_i64().unwrap_or(0) as i32;
                    let schedule_id_val = payload["schedule_id"]
                        .as_i64()
                        .or_else(|| payload["showtime_id"].as_i64())
                        .unwrap_or(0) as i32;
                    let seat_ids = parse_seat_ids(&payload);
                    let amount_val = payload["amount"].clone();
                    let amount_str = amount_val
                        .as_str()
                        .map(|s| s.to_string())
                        .or_else(|| amount_val.as_f64().map(|f| f.to_string()))
                        .unwrap_or_else(|| "0".to_string());

                    let Ok(order_uuid) = Uuid::from_str(order_id_str) else {
                        println!(
                            "Invalid order UUID in OrderCompleted event: {}",
                            order_id_str
                        );
                        let _ = delivery.ack(BasicAckOptions::default()).await;
                        continue;
                    };

                    let mut db_conn = match db_pool.get() {
                        Ok(c) => c,
                        Err(_) => {
                            println!("DB connection failed, routing to DLQ");
                            let _ = delivery
                                .nack(BasicNackOptions {
                                    multiple: false,
                                    requeue: false,
                                })
                                .await;
                            continue;
                        }
                    };

                    // Check idempotency: Never duplicate the ticket!
                    let existing_ticket: Option<Ticket> = tk::tickets
                        .filter(tk::order_id.eq(order_uuid))
                        .first(&mut db_conn)
                        .optional()
                        .unwrap_or(None);

                    if existing_ticket.is_some() {
                        println!(
                            "Ticket for order {} already exists! Idempotent skip.",
                            order_uuid
                        );
                        let _ = delivery.ack(BasicAckOptions::default()).await;
                        continue;
                    }

                    // Fetch venue and date from the schedule for the email summary.
                    let schedule_details = sd::schedules
                        .find(schedule_id_val)
                        .select((sd::venue_name, sd::start_time))
                        .first::<(Option<String>, chrono::DateTime<chrono::Utc>)>(&mut db_conn)
                        .optional()
                        .unwrap_or(None);
                    let venue_name = schedule_details
                        .as_ref()
                        .and_then(|(venue, _)| venue.clone())
                        .unwrap_or_else(|| "BookIt Venue".into());
                    let show_time = schedule_details
                        .map(|(_, start)| {
                            let ist = chrono::FixedOffset::east_opt(5 * 3600 + 30 * 60)
                                .expect("valid IST offset");
                            start
                                .with_timezone(&ist)
                                .format("%A, %d %B %Y at %I:%M %p IST")
                                .to_string()
                        })
                        .unwrap_or_else(|| "See your ticket for schedule details".into());

                    // Build seat labels (e.g. "A1", "B3") from the DB so the
                    // PDF shows human-readable seat names, not raw IDs.
                    let seat_labels: Vec<String> = {
                        let mut conn_opt = db_pool.get().ok();
                        if let Some(ref mut conn) = conn_opt {
                            ss::schedule_seats
                                .filter(ss::id.eq_any(&seat_ids))
                                .load::<ScheduleSeat>(conn)
                                .unwrap_or_default()
                                .into_iter()
                                .map(|s| format!("{}{}", s.row_letter, s.seat_number))
                                .collect()
                        } else {
                            seat_ids.iter().map(|id| id.to_string()).collect()
                        }
                    };

                    let pdf_req_body = json!({
                        "order_id": order_uuid.to_string(),
                        "user_id": user_id_val,
                        "show_name": "BookIt Show Ticket",
                        "show_time": show_time,
                        "place": "Main Theater",
                        "venue": venue_name.clone(),
                        "price": &amount_str,
                        "seat_numbers": seat_labels.clone()
                    });

                    let http_server_url = env::var("HTTP_SERVER_URL")
                        .unwrap_or_else(|_| "http://127.0.0.1:8082".to_string());
                    let pdf_endpoint = format!(
                        "{}/api/internal/tickets/generate-pdf",
                        http_server_url.trim_end_matches('/')
                    );

                    let http_client = reqwest::Client::new();
                    let pdf_url_res = http_client
                        .post(&pdf_endpoint)
                        .json(&pdf_req_body)
                        .send()
                        .await;

                    let fallback_base = env::var("CLOUDFLARE_R2_PUBLIC_URL")
                        .or_else(|_| env::var("NEXT_PUBLIC_R2_PUBLIC_URL"))
                        .unwrap_or_else(|_| "https://thepipe.shop".to_string());
                    let fallback_base = fallback_base.trim_end_matches('/');

                    let pdf_url = match pdf_url_res {
                        Ok(res) if res.status().is_success() => {
                            if let Ok(json_res) = res.json::<serde_json::Value>().await {
                                json_res["pdf_url"]
                                    .as_str()
                                    .unwrap_or(&format!("{}/tickets/default.pdf", fallback_base))
                                    .to_string()
                            } else {
                                format!("{}/tickets/default.pdf", fallback_base)
                            }
                        }
                        Ok(res) => {
                            let status = res.status();
                            let body = res.text().await.unwrap_or_default();
                            println!("PDF generation API failed: HTTP {} — {}", status, body);
                            format!(
                                "{}/tickets/default_ticket_{}.pdf",
                                fallback_base, order_uuid
                            )
                        }
                        Err(e) => {
                            println!("PDF generation API request error: {}", e);
                            format!(
                                "{}/tickets/default_ticket_{}.pdf",
                                fallback_base, order_uuid
                            )
                        }
                    };

                    let tx_res: Result<(), diesel::result::Error> = db_conn.transaction(|conn| {
                        let new_ticket = NewTicket {
                            id: Uuid::new_v4(),
                            order_id: order_uuid,
                            user_id: user_id_val,
                            schedule_id: schedule_id_val,
                            seat_ids: json!(seat_ids),
                            pdf_url: pdf_url.clone(),
                            status: "active".into(),
                        };
                        diesel::insert_into(tk::tickets)
                            .values(&new_ticket)
                            .execute(conn)?;

                        let new_audit = NewUserAudit {
                            id: Uuid::new_v4(),
                            user_id: user_id_val,
                            action: "ticket_created".into(),
                            order_id: order_uuid,
                            amount: BigDecimal::from_str(&amount_str)
                                .unwrap_or(BigDecimal::from(0)),
                            details: json!({ "pdf_url": pdf_url, "seat_ids": seat_ids }),
                        };
                        diesel::insert_into(ua::user_audits)
                            .values(&new_audit)
                            .execute(conn)?;

                        Ok(())
                    });

                    if tx_res.is_ok() {
                        let user_email = get_user_email(&mut db_conn, user_id_val);
                        let email_data = BookingEmailData {
                            order_id: order_uuid.to_string(),
                            venue: venue_name,
                            show_time,
                            seat_count: seat_labels.len(),
                            seats: seat_labels,
                            amount: amount_str.to_string(),
                            ticket_url: pdf_url,
                            support_email: env::var("SUPPORT_EMAIL")
                                .unwrap_or_else(|_| "support@bookit4u.shop".into()),
                        };
                        if let Err(error) =
                            send_booking_confirmation(&user_email, &email_data).await
                        {
                            eprintln!("Booking email failed for order {}: {}", order_uuid, error);
                            println!("Ticket generated but email failed for order {}", order_uuid);
                        } else {
                            println!(
                                "Ticket generated and email sent successfully for order {}",
                                order_uuid
                            );
                        }
                        let _ = delivery.ack(BasicAckOptions::default()).await;
                    } else {
                        println!("Failed to insert ticket into database, sending to DLQ");
                        let _ = delivery
                            .nack(BasicNackOptions {
                                multiple: false,
                                requeue: false,
                            })
                            .await;
                    }
                } else if event_type == "TicketCancelled" {
                    let order_id_str = payload["order_id"].as_str().unwrap_or_default();
                    let user_id_val = payload["user_id"].as_i64().unwrap_or(0) as i32;
                    let seat_ids = parse_seat_ids(&payload);
                    let amount_val = payload["amount"].clone();
                    let amount_str = amount_val
                        .as_str()
                        .map(|s| s.to_string())
                        .or_else(|| amount_val.as_f64().map(|f| f.to_string()))
                        .unwrap_or_else(|| "0".to_string());

                    if let Ok(mut db_conn) = db_pool.get() {
                        let user_email = get_user_email(&mut db_conn, user_id_val);
                        let seat_labels: Vec<String> = {
                            ss::schedule_seats
                                .filter(ss::id.eq_any(&seat_ids))
                                .load::<ScheduleSeat>(&mut db_conn)
                                .unwrap_or_default()
                                .into_iter()
                                .map(|s| format!("{}{}", s.row_letter, s.seat_number))
                                .collect()
                        };
                        let seats = if seat_labels.is_empty() {
                            seat_ids.iter().map(ToString::to_string).collect::<Vec<_>>()
                        } else {
                            seat_labels
                        };
                        let email_data = CancellationEmailData {
                            order_id: order_id_str.to_string(),
                            seat_count: seats.len(),
                            seats,
                            refund_amount: amount_str.to_string(),
                            support_email: env::var("SUPPORT_EMAIL")
                                .unwrap_or_else(|_| "support@bookit4u.shop".into()),
                        };
                        if let Err(error) =
                            send_cancellation_confirmation(&user_email, &email_data).await
                        {
                            eprintln!(
                                "Cancellation email failed for order {}: {}",
                                order_id_str, error
                            );
                        }
                    }

                    let _ = delivery.ack(BasicAckOptions::default()).await;
                    println!("Cancellation email sent for order {}", order_id_str);
                } else {
                    let _ = delivery.ack(BasicAckOptions::default()).await;
                }
            } else {
                let _ = delivery
                    .nack(BasicNackOptions {
                        multiple: false,
                        requeue: false,
                    })
                    .await;
            }
        }
    }
}
