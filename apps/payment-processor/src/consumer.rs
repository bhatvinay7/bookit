use bigdecimal::BigDecimal;
use diesel::RunQueryDsl;
use futures::StreamExt;
use lapin::{
    Consumer,
    options::{BasicAckOptions, BasicNackOptions},
};
use serde_json::json;
use std::str::FromStr;
use std::sync::Arc;
use uuid::Uuid;

use crate::{
    payment::process_razorpay_refund,
    repository::{self, CancellationCommit, CheckoutCommit},
};
use bookit_db::db::DbPool;
use redis_conn::{RedisPool, SeatLock};

pub fn parse_seat_ids(payload: &serde_json::Value) -> Vec<i32> {
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

pub async fn process_messages(
    mut consumer: Consumer,
    db_pool: DbPool,
    seat_lock: Arc<dyn SeatLock>,
    redis_pool: RedisPool,
) {
    println!("Listening for payment requests...");

    while let Some(delivery) = consumer.next().await {
        if let Ok(delivery) = delivery {
            if let Ok(payload) = serde_json::from_slice::<serde_json::Value>(&delivery.data) {
                let request_type = payload["request_type"].as_str().unwrap_or("checkout");

                if request_type == "cancellation" {
                    // ── Handle Cancellation Request ─────────────────────────────
                    let order_id_str = payload["order_id"].as_str().unwrap_or_default();
                    let user_id_val = payload["user_id"].as_i64().unwrap_or(0) as i32;
                    let schedule_id_val = payload["schedule_id"].as_i64().unwrap_or(0) as i32;
                    let seat_ids = parse_seat_ids(&payload);
                    let razorpay_payment_id = payload["razorpay_payment_id"]
                        .as_str()
                        .map(|s| s.to_string());
                    let amount_str = payload["amount"].as_str().unwrap_or("0");

                    println!(
                        "Processing Cancellation for Order {} (User: {})",
                        order_id_str, user_id_val
                    );

                    let Ok(order_uuid) = Uuid::from_str(order_id_str) else {
                        println!("Invalid order_id UUID: {}", order_id_str);
                        let _ = delivery
                            .nack(BasicNackOptions {
                                multiple: false,
                                requeue: false,
                            })
                            .await;
                        continue;
                    };

                    // Process Refund with Razorpay
                    if let Some(ref payment_id) = razorpay_payment_id {
                        let amount_bd =
                            BigDecimal::from_str(amount_str).unwrap_or(BigDecimal::from(0));
                        // amount in paise = amount * 100
                        let amount_paise =
                            (amount_bd.to_string().parse::<f64>().unwrap_or(0.0) * 100.0) as i64;
                        if let Err(e) = process_razorpay_refund(payment_id, amount_paise).await {
                            println!("Refund processing failed: {:?}", e);
                            let _ = delivery
                                .nack(BasicNackOptions {
                                    multiple: false,
                                    requeue: false,
                                })
                                .await;
                            continue;
                        }
                    }

                    let tx_result = repository::commit_cancellation(
                        &db_pool,
                        CancellationCommit {
                            order_id: order_uuid,
                            user_id: user_id_val,
                            schedule_id: schedule_id_val,
                            seat_ids: seat_ids.clone(),
                            amount: amount_str.to_owned(),
                        },
                    );

                    if tx_result.is_ok() {
                        // Broadcast seat_unlocked to WebSocket Room
                        if let Ok(mut cli) = redis_pool.get().await {
                            let channel_name = format!("room:{}", schedule_id_val);
                            let event_msg = json!({
                                "event": "seat_unlocked",
                                "seat_ids": seat_ids,
                                "user_id": user_id_val
                            })
                            .to_string();
                            let _: () =
                                redis::AsyncCommands::publish(&mut *cli, channel_name, event_msg)
                                    .await
                                    .unwrap_or(());
                        }

                        let _ = delivery.ack(BasicAckOptions::default()).await;
                        println!("Cancellation processed successfully!");
                    } else {
                        println!("DB transaction failed during cancellation");
                        let _ = delivery
                            .nack(BasicNackOptions {
                                multiple: false,
                                requeue: false,
                            })
                            .await;
                    }
                } else {
                    // ── Handle Checkout/Booking Request ─────────────────────────
                    let user_id_val = payload["user_id"].as_i64().unwrap_or(0) as i32;
                    let schedule_id_val = payload["schedule_id"]
                        .as_i64()
                        .or_else(|| payload["showtime_id"].as_i64())
                        .unwrap_or(0) as i32;
                    let seat_ids = parse_seat_ids(&payload);
                    let total_amount = payload["amount"].as_str().unwrap_or("0");
                    let razorpay_order_id = payload["razorpay_order_id"]
                        .as_str()
                        .unwrap_or_default()
                        .to_string();
                    let razorpay_payment_id = payload["razorpay_payment_id"]
                        .as_str()
                        .map(|s| s.to_string());
                    let Some(payment_request_id) = payload["payment_request_id"]
                        .as_str()
                        .and_then(|s| Uuid::parse_str(s).ok())
                    else {
                        let _ = delivery
                            .nack(BasicNackOptions {
                                multiple: false,
                                requeue: false,
                            })
                            .await;
                        continue;
                    };

                    if repository::order_exists(&db_pool, payment_request_id) {
                        let _ = delivery.ack(BasicAckOptions::default()).await;
                        continue;
                    }

                    if seat_ids.is_empty() {
                        let _ = delivery
                            .nack(BasicNackOptions {
                                multiple: false,
                                requeue: false,
                            })
                            .await;
                        continue;
                    }

                    println!(
                        "Processing Checkout for User {} on Seats {:?}",
                        user_id_val, seat_ids
                    );

                    // Check SingleNodeLock for all seats
                    let mut all_locked = true;
                    for &seat_id in &seat_ids {
                        let owner = seat_lock.get_lock_owner(schedule_id_val, seat_id).await;
                        if owner != Some(user_id_val) {
                            println!(
                                "Lock expired or invalid for seat {}! Sending to DLQ.",
                                seat_id
                            );
                            all_locked = false;
                            break;
                        }
                    }

                    if !all_locked {
                        if let Ok(mut db_conn) = db_pool.get() {
                            let _ = diesel::sql_query("UPDATE payment_requests SET status = CAST('failed' AS payment_request_status), failure_reason = 'seat lock expired before processing', updated_at = NOW() WHERE id = $1 AND status <> CAST('succeeded' AS payment_request_status)")
                                .bind::<diesel::sql_types::Uuid,_>(payment_request_id)
                                .execute(&mut db_conn);
                        }
                        if let Ok(mut redis_conn) = redis_pool.get().await {
                            for seat_id in &seat_ids {
                                let key = format!("seat_checkout:{schedule_id_val}:{seat_id}");
                                let _: () = redis::cmd("DEL")
                                    .arg(&key)
                                    .query_async(&mut *redis_conn)
                                    .await
                                    .unwrap_or_default();
                            }
                        }
                        let _ = delivery
                            .nack(BasicNackOptions {
                                multiple: false,
                                requeue: false,
                            })
                            .await;
                        continue;
                    }

                    let order_uuid = Uuid::new_v4();

                    let tx_result = repository::commit_checkout(
                        &db_pool,
                        CheckoutCommit {
                            order_id: order_uuid,
                            payment_request_id,
                            user_id: user_id_val,
                            schedule_id: schedule_id_val,
                            seat_ids: seat_ids.clone(),
                            total_amount: total_amount.to_owned(),
                            razorpay_order_id,
                            razorpay_payment_id,
                        },
                    );

                    if tx_result.is_ok() {
                        // Release Redis locks and mark as booked
                        let bitmap_key = redis_conn::keys::schedule_seat_bitmap(schedule_id_val);
                        for &seat_id in &seat_ids {
                            seat_lock
                                .release_lock(schedule_id_val, seat_id, user_id_val)
                                .await;

                            seat_lock
                                .set_schedule_seat_bitmap_state_cluster(&bitmap_key, seat_id, 0b10)
                                .await;
                        }

                        // Broadcast to Room (WebSocket users)
                        if let Ok(mut cli) = redis_pool.get().await {
                            let channel_name = format!("room:{}", schedule_id_val);
                            let event_msg = json!({
                                "event": "seat_booked",
                                "seat_ids": seat_ids,
                                "user_id": user_id_val
                            })
                            .to_string();
                            let _: () =
                                redis::AsyncCommands::publish(&mut *cli, channel_name, event_msg)
                                    .await
                                    .unwrap_or(());
                        }

                        let _ = delivery.ack(BasicAckOptions::default()).await;
                        println!("Checkout Processed successfully!");
                    } else {
                        println!("DB transaction failed during checkout");
                        let _ = delivery
                            .nack(BasicNackOptions {
                                multiple: false,
                                requeue: false,
                            })
                            .await;
                    }

                    // Clear the checkout locks
                    if let Ok(mut redis_conn) = redis_pool.get().await {
                        for seat_id in &seat_ids {
                            let key = format!("seat_checkout:{}:{}", schedule_id_val, seat_id);
                            let _: () = redis::cmd("DEL")
                                .arg(&key)
                                .query_async(&mut *redis_conn)
                                .await
                                .unwrap_or_default();
                        }
                    }
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
