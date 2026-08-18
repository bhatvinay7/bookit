use bigdecimal::BigDecimal;
use chrono::Utc;
use diesel::prelude::*;
use futures::StreamExt;
use lapin::{
    options::{BasicAckOptions, BasicNackOptions, BasicPublishOptions},
    BasicProperties, Channel, Consumer,
};
use serde_json::json;
use std::str::FromStr;
use std::sync::Arc;
use uuid::Uuid;

use bookit_db::{
    db::DbPool,
    models::{NewOrder, NewOutboxEvent, NewUserAudit, SeatStatus},
    schema::{
        orders::dsl as od,
        outbox_events::dsl as oe,
        schedule_seats::dsl as ss,
        tickets::dsl as tk,
        user_audits::dsl as ua,
    },
};
use redis_conn::{RedisPool, SeatLock};
use crate::payment::process_razorpay_refund;

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

pub async fn process_messages(
    mut consumer: Consumer,
    db_pool: DbPool,
    channel: Channel,
    seat_lock: Arc<dyn SeatLock>,
    redis_pool: RedisPool,
) {
    println!("Listening for payment requests...");

    while let Some(delivery) = consumer.next().await {
        if let Ok(delivery) = delivery {
            if let Ok(payload) = serde_json::from_slice::<serde_json::Value>(&delivery.data) {
                let request_type = payload["request_type"]
                    .as_str()
                    .unwrap_or("checkout");

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
                        let amount_bd = BigDecimal::from_str(amount_str).unwrap_or(BigDecimal::from(0));
                        // amount in paise = amount * 100
                        let amount_paise = (amount_bd.to_string().parse::<f64>().unwrap_or(0.0) * 100.0) as i64;
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

                    // Database Transaction: update seats, order, tickets, insert audit & outbox
                    let tx_result: Result<(), diesel::result::Error> = {
                        let mut db_conn = match db_pool.get() {
                            Ok(c) => c,
                            Err(_) => return,
                        };
                        db_conn.transaction(|conn| {
                            // 1. Revert seat status to Available
                            diesel::update(
                                ss::schedule_seats.filter(ss::id.eq_any(&seat_ids)),
                            )
                            .set(ss::status.eq(SeatStatus::Available))
                            .execute(conn)?;

                            // 2. Update order status to refunded
                            diesel::update(od::orders.filter(od::id.eq(order_uuid)))
                                .set(od::status.eq("refunded"))
                                .execute(conn)?;

                            // 3. Update ticket status to cancelled
                            diesel::update(tk::tickets.filter(tk::order_id.eq(order_uuid)))
                                .set(tk::status.eq("cancelled"))
                                .execute(conn)?;

                            // 4. Create audit log
                            let audit = NewUserAudit {
                                id: Uuid::new_v4(),
                                user_id: user_id_val,
                                action: "ticket_cancelled".into(),
                                order_id: order_uuid,
                                amount: BigDecimal::from_str(amount_str).unwrap_or(BigDecimal::from(0)),
                                details: json!({ "seat_ids": seat_ids }),
                            };
                            diesel::insert_into(ua::user_audits)
                                .values(&audit)
                                .execute(conn)?;

                            // 5. Create outbox event for TicketCancelled
                            let outbox_event = NewOutboxEvent {
                                id: Uuid::new_v4(),
                                aggregate_type: "Order".into(),
                                aggregate_id: order_uuid,
                                event_type: "TicketCancelled".into(),
                                payload: json!({
                                    "order_id": order_uuid.to_string(),
                                    "user_id": user_id_val,
                                    "schedule_id": schedule_id_val,
                                    "seat_ids": seat_ids,
                                    "amount": amount_str,
                                }),
                                created_at: Utc::now(),
                                published_at: None,
                                attempts: 0,
                            };
                            diesel::insert_into(oe::outbox_events)
                                .values(&outbox_event)
                                .execute(conn)?;

                            Ok(())
                        })
                    };

                    if tx_result.is_ok() {
                        // Fanout event to notification worker
                        let fanout_msg = json!({
                            "event_type": "TicketCancelled",
                            "order_id": order_id_str,
                            "user_id": user_id_val,
                            "schedule_id": schedule_id_val,
                            "seat_ids": seat_ids,
                            "amount": amount_str,
                        })
                        .to_string();

                        let _ = channel
                            .basic_publish(
                                "booking_events_exchange".into(),
                                "".into(),
                                BasicPublishOptions::default(),
                                fanout_msg.as_bytes(),
                                BasicProperties::default().with_delivery_mode(2),
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
                            let _: () = redis::AsyncCommands::publish(&mut *cli, channel_name, event_msg).await.unwrap_or(());
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
                    let payment_request_id = payload["payment_request_id"]
                        .as_str()
                        .and_then(|s| Uuid::parse_str(s).ok())
                        .unwrap_or_else(Uuid::new_v4);

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
                            println!("Lock expired or invalid for seat {}! Sending to DLQ.", seat_id);
                            all_locked = false;
                            break;
                        }
                    }

                    if !all_locked {
                        let _ = delivery
                            .nack(BasicNackOptions {
                                multiple: false,
                                requeue: false,
                            })
                            .await;
                        continue;
                    }

                    let order_uuid = Uuid::new_v4();

                    // Database Transaction: update seats to Booked, insert order, insert audit, insert outbox
                    let tx_result: Result<(), diesel::result::Error> = {
                        let mut db_conn = match db_pool.get() {
                            Ok(c) => c,
                            Err(_) => return,
                        };
                        db_conn.transaction(|conn| {
                            // 1. Update seats to Booked
                            diesel::update(
                                ss::schedule_seats.filter(ss::id.eq_any(&seat_ids)),
                            )
                            .set(ss::status.eq(SeatStatus::Booked))
                            .execute(conn)?;

                            // 2. Create Order
                            let order = NewOrder {
                                id: order_uuid,
                                payment_request_id,
                                user_id: user_id_val,
                                schedule_id: schedule_id_val,
                                seat_ids: json!(seat_ids),
                                total_amount: BigDecimal::from_str(total_amount)
                                    .unwrap_or(BigDecimal::from(0)),
                                razorpay_order_id,
                                razorpay_payment_id,
                                status: "completed".into(),
                            };
                            diesel::insert_into(od::orders)
                                .values(&order)
                                .execute(conn)?;

                            // 3. Create Audit
                            let audit = NewUserAudit {
                                id: Uuid::new_v4(),
                                user_id: user_id_val,
                                action: "order_completed".into(),
                                order_id: order_uuid,
                                amount: BigDecimal::from_str(total_amount)
                                    .unwrap_or(BigDecimal::from(0)),
                                details: json!({ "seat_ids": seat_ids }),
                            };
                            diesel::insert_into(ua::user_audits)
                                .values(&audit)
                                .execute(conn)?;

                            // 4. Create Outbox Event
                            let outbox_event = NewOutboxEvent {
                                id: Uuid::new_v4(),
                                aggregate_type: "Order".into(),
                                aggregate_id: order_uuid,
                                event_type: "OrderCompleted".into(),
                                payload: json!({
                                    "order_id": order_uuid.to_string(),
                                    "user_id": user_id_val,
                                    "schedule_id": schedule_id_val,
                                    "seat_ids": seat_ids,
                                    "amount": total_amount,
                                }),
                                created_at: Utc::now(),
                                published_at: None,
                                attempts: 0,
                            };
                            diesel::insert_into(oe::outbox_events)
                                .values(&outbox_event)
                                .execute(conn)?;

                            Ok(())
                        })
                    };

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
                            let _: () = redis::AsyncCommands::publish(&mut *cli, channel_name, event_msg).await.unwrap_or(());
                        }

                        // Broadcast to Fanout (Emails, Tickets)
                        let fanout_msg = json!({
                            "event_type": "OrderCompleted",
                            "order_id": order_uuid.to_string(),
                            "user_id": user_id_val,
                            "schedule_id": schedule_id_val,
                            "seat_ids": seat_ids,
                            "amount": total_amount,
                        })
                        .to_string();

                        let _ = channel
                            .basic_publish(
                                "booking_events_exchange".into(),
                                "".into(),
                                BasicPublishOptions::default(),
                                fanout_msg.as_bytes(),
                                BasicProperties::default().with_delivery_mode(2),
                            )
                            .await;

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
                            let _: () = redis::cmd("DEL").arg(&key).query_async(&mut *redis_conn).await.unwrap_or_default();
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
