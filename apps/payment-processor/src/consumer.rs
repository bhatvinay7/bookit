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

/// Adjust the cache only when HTTP Server has already populated it. PostgreSQL
/// remains the source of truth and repopulates an absent cache key. This runs
/// only after the booking/cancellation transaction has committed.
async fn adjust_cached_available_seats(redis_pool: &RedisPool, schedule_id: i32, delta: i64) {
    let Ok(mut connection) = redis_pool.get().await else {
        return;
    };

    let available_key = redis_conn::keys::cache_schedule_available_seats_key(schedule_id);
    let script = redis::Script::new(
        r#"
        if redis.call('EXISTS', KEYS[1]) == 0 then
            return nil
        end
        return redis.call('INCRBY', KEYS[1], ARGV[1])
        "#,
    );
    let _: redis::RedisResult<Option<i64>> = script
        .key(available_key)
        .arg(delta)
        .invoke_async(&mut *connection)
        .await;
}

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
    tracing::info!("Listening for payment requests...");

    while let Some(delivery) = consumer.next().await {
        if let Ok(delivery) = delivery {
            let span = rmq_conn::delivery_span(&delivery, "payment_processing");
            bookit_telemetry::in_span(span, async {
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

                    tracing::info!(
                        "Processing Cancellation for Order {} (User: {})",
                        order_id_str, user_id_val
                    );

                    let Ok(order_uuid) = Uuid::from_str(order_id_str) else {
                        tracing::error!("Invalid order_id UUID: {}", order_id_str);
                        let _ = delivery
                            .nack(BasicNackOptions {
                                multiple: false,
                                requeue: false,
                            })
                            .await;
                        return;
                    };

                    // Process Refund with Razorpay
                    if let Some(ref payment_id) = razorpay_payment_id {
                        let amount_bd =
                            BigDecimal::from_str(amount_str).unwrap_or(BigDecimal::from(0));
                        // amount in paise = amount * 100
                        let amount_paise =
                            (amount_bd.to_string().parse::<f64>().unwrap_or(0.0) * 100.0) as i64;
                        if let Err(e) = process_razorpay_refund(payment_id, amount_paise).await {
                            tracing::error!("Refund processing failed: {:?}", e);
                            let _ = delivery
                                .nack(BasicNackOptions {
                                    multiple: false,
                                    requeue: false,
                                })
                                .await;
                            return;
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
                        adjust_cached_available_seats(
                            &redis_pool,
                            schedule_id_val,
                            i64::try_from(seat_ids.len()).unwrap_or(0),
                        )
                        .await;
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
                        tracing::info!("Cancellation processed successfully!");
                    } else {
                        tracing::error!("DB transaction failed during cancellation");
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
                        return;
                    };

                    if repository::order_exists(&db_pool, payment_request_id) {
                        let _ = delivery.ack(BasicAckOptions::default()).await;
                        return;
                    }

                    if seat_ids.is_empty() {
                        let _ = delivery
                            .nack(BasicNackOptions {
                                multiple: false,
                                requeue: false,
                            })
                            .await;
                        return;
                    }

                    tracing::info!(
                        "Processing Checkout for User {} on Seats {:?}",
                        user_id_val, seat_ids
                    );

                    // Dual-key validation: both Key 1 (ownership) and Key 2 (user context)
                    // must be present and belong to the correct user.
                    // Since both keys are written/deleted atomically in Lua, if they diverge
                    // it means the lock expired between the HTTP pre-flight and now.
                    let mut lock_failure_reason: Option<String> = None;
                    for &seat_id in &seat_ids {
                        // Key 1: general lock ownership
                        let owner = seat_lock.get_lock_owner(schedule_id_val, seat_id).await;
                        match owner {
                            None => {
                                tracing::error!(
                                    user_id = user_id_val,
                                    schedule_id = schedule_id_val,
                                    seat_id,
                                    "Seat lock (Key 1) does not exist (expired or never acquired); marking payment failed."
                                );
                                lock_failure_reason = Some(format!(
                                    "seat lock not found for seat {} (user {})",
                                    seat_id, user_id_val
                                ));
                                break;
                            }
                            Some(actual_owner) if actual_owner != user_id_val => {
                                tracing::error!(
                                    user_id = user_id_val,
                                    schedule_id = schedule_id_val,
                                    seat_id,
                                    actual_owner,
                                    "Seat lock belongs to a different user; marking payment failed."
                                );
                                lock_failure_reason = Some(format!(
                                    "seat {} is locked by user {} not user {}",
                                    seat_id, actual_owner, user_id_val
                                ));
                                break;
                            }
                            Some(_) => {} // Key 1 OK — proceed to Key 2 check
                        }

                        // Key 2: per-user context key (O(1) existence check)
                        let ctx_ok = seat_lock
                            .user_holds_lock(schedule_id_val, seat_id, user_id_val)
                            .await;
                        if !ctx_ok {
                            tracing::error!(
                                user_id = user_id_val,
                                schedule_id = schedule_id_val,
                                seat_id,
                                "User context key (Key 2) missing for seat; lock may have expired mid-flight."
                            );
                            lock_failure_reason = Some(format!(
                                "user context lock not found for seat {} (user {})",
                                seat_id, user_id_val
                            ));
                            break;
                        }
                    }


                    if let Some(reason) = lock_failure_reason {
                        if let Ok(mut db_conn) = db_pool.get() {
                            let _ = diesel::sql_query("UPDATE payment_requests SET status = CAST('failed' AS payment_request_status), failure_reason = $2, updated_at = NOW() WHERE id = $1 AND status <> CAST('succeeded' AS payment_request_status)")
                                .bind::<diesel::sql_types::Uuid, _>(payment_request_id)
                                .bind::<diesel::sql_types::Text, _>(&reason)
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
                        return;
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
                        adjust_cached_available_seats(
                            &redis_pool,
                            schedule_id_val,
                            -i64::try_from(seat_ids.len()).unwrap_or(0),
                        )
                        .await;
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
                        tracing::info!("Checkout Processed successfully!");
                    } else {
                        tracing::error!("DB transaction failed during checkout");
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
            }).await;
        }
    }
}
