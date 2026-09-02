use crate::grpc_client::GrpcLockClient;
use crate::locking::{confirm_payment, sync_locks_from_zset, sync_room_state_snapshot};
use bookit_db::{
    db::DbPool,
    models::Schedule,
    schema::{schedule_seats, schedules},
};
use dashmap::{DashMap, mapref::entry::Entry};
use diesel::prelude::*;
use redis::AsyncCommands;
use redis_conn::{
    RedisPool, SeatLock,
    adapter::{PubSubEvent, RedisSocketAdapter},
    keys,
};
use serde_json::json;
use std::{collections::HashMap, sync::Arc};
use tracing::{error, info};

pub struct WsHooks {
    pub adapter: RedisSocketAdapter,
    pub redis_pool: RedisPool,
    pub db_pool: DbPool,
    pub grpc_client: GrpcLockClient,
    pub single_node_lock: Arc<dyn SeatLock>,
    schedule_metadata: DashMap<i32, Arc<tokio::sync::OnceCell<Arc<ScheduleSeatMetadata>>>>,
}

struct ScheduleSeatMetadata {
    total_seat_count: i32,
    seat_indices: HashMap<i32, i32>,
}

impl WsHooks {
    pub fn new(
        adapter: RedisSocketAdapter,
        redis_pool: RedisPool,
        db_pool: DbPool,
        grpc_client: GrpcLockClient,
        single_node_lock: Arc<dyn SeatLock>,
    ) -> Self {
        Self {
            adapter,
            redis_pool,
            db_pool,
            grpc_client,
            single_node_lock,
            schedule_metadata: DashMap::new(),
        }
    }

    async fn verified_seat_metadata(
        &self,
        schedule_id: i32,
        seat_ids: &[i32],
        seat_indices: &[i32],
        total_seat_count: i32,
    ) -> Result<(Vec<i32>, i32), String> {
        if seat_ids.is_empty() || seat_ids.len() != seat_indices.len() {
            return Err("seat ids and indices must be non-empty and aligned".into());
        }

        // A per-schedule OnceCell provides async single-flight initialization:
        // a burst of first requests waits on one database load instead of
        // producing a thundering herd of identical queries.
        let metadata_cell = if let Some(cell) = self.schedule_metadata.get(&schedule_id) {
            Arc::clone(cell.value())
        } else {
            let new_cell = Arc::new(tokio::sync::OnceCell::new());
            match self.schedule_metadata.entry(schedule_id) {
                Entry::Occupied(entry) => Arc::clone(entry.get()),
                Entry::Vacant(entry) => {
                    entry.insert(Arc::clone(&new_cell));
                    new_cell
                }
            }
        };
        let pool = self.db_pool.clone();
        let metadata = metadata_cell
            .get_or_try_init(|| async move {
                tokio::task::spawn_blocking(move || {
                    let mut conn = pool
                        .get()
                        .map_err(|error| format!("database pool unavailable: {error}"))?;
                    let schedule = schedules::table
                        .find(schedule_id)
                        .filter(schedules::deleted_at.is_null())
                        .first::<Schedule>(&mut conn)
                        .map_err(|_| "schedule not found".to_string())?;
                    if schedule.booking_open_at > chrono::Utc::now() {
                        return Err("schedule is not open for booking".to_string());
                    }
                    let rows = schedule_seats::table
                        .filter(schedule_seats::schedule_id.eq(schedule_id))
                        .select((schedule_seats::id, schedule_seats::seat_index))
                        .load::<(i32, i32)>(&mut conn)
                        .map_err(|error| format!("unable to load schedule seats: {error}"))?;
                    let total_seat_count = i32::try_from(rows.len())
                        .map_err(|_| "schedule contains too many seats".to_string())?;
                    if total_seat_count == 0 {
                        return Err("schedule has no seats".to_string());
                    }
                    Ok::<_, String>(Arc::new(ScheduleSeatMetadata {
                        total_seat_count,
                        seat_indices: rows.into_iter().collect(),
                    }))
                })
                .await
                .map_err(|error| format!("seat metadata task failed: {error}"))?
            })
            .await
            .map(Arc::clone)?;

        if total_seat_count != metadata.total_seat_count {
            return Err("total seat count does not match the schedule".into());
        }
        for (&seat_id, &seat_index) in seat_ids.iter().zip(seat_indices) {
            if metadata.seat_indices.get(&seat_id) != Some(&seat_index) {
                return Err(format!("seat {seat_id} has an invalid schedule seat index"));
            }
        }
        Ok((seat_indices.to_vec(), metadata.total_seat_count))
    }

    pub async fn on_lock_request(
        &self,
        user_id: i32,
        showtime_id: i32,
        seat_ids: Vec<i32>,
        seat_indices: Vec<i32>,
        total_seat_count: i32,
    ) {
        let verified = self
            .verified_seat_metadata(showtime_id, &seat_ids, &seat_indices, total_seat_count)
            .await;
        let (seat_indices, total_seat_count) = match verified {
            Ok(metadata) => metadata,
            Err(error) => {
                error!(showtime_id, %error, "invalid lock seat metadata");
                let response_payload = json!({
                    "event": "lock_slots_response",
                    "showtime_id": showtime_id,
                    "success": false,
                    "message": error,
                    "locked_seat_ids": [],
                    "failed_seat_ids": seat_ids,
                });
                self.adapter
                    .send_to_user_local(user_id, &response_payload.to_string());
                return;
            }
        };
        if let Err(err) = self
            .grpc_client
            .lock_slot(
                showtime_id,
                seat_ids.clone(),
                seat_indices,
                total_seat_count,
                user_id,
            )
            .await
        {
            error!(?err, "gateway keeper rejected lock request");
            let response_payload = json!({
                "event": "lock_slots_response",
                "showtime_id": showtime_id,
                "success": false,
                "locked_seat_ids": [],
                "failed_seat_ids": seat_ids,
            });
            self.adapter
                .send_to_user_local(user_id, &response_payload.to_string());
        }
    }

    pub async fn on_unlock_request(
        &self,
        user_id: i32,
        showtime_id: i32,
        seat_ids: Vec<i32>,
        seat_indices: Vec<i32>,
        total_seat_count: i32,
    ) {
        let verified = self
            .verified_seat_metadata(showtime_id, &seat_ids, &seat_indices, total_seat_count)
            .await;
        let (seat_indices, total_seat_count) = match verified {
            Ok(metadata) => metadata,
            Err(error) => {
                error!(showtime_id, %error, "invalid unlock seat metadata");
                let response_payload = json!({
                    "event": "unlock_slots_response",
                    "showtime_id": showtime_id,
                    "success": false,
                    "message": error,
                    "unlocked_seat_ids": [],
                });
                self.adapter
                    .send_to_user_local(user_id, &response_payload.to_string());
                return;
            }
        };
        let response_payload = match self
            .grpc_client
            .unlock_slot(
                showtime_id,
                seat_ids,
                seat_indices,
                total_seat_count,
                user_id,
            )
            .await
        {
            Ok((success, _, unlocked_seat_ids)) => json!({
                "event": "unlock_slots_response",
                "showtime_id": showtime_id,
                "success": success,
                "unlocked_seat_ids": unlocked_seat_ids,
            }),
            Err(err) => {
                error!(?err, "gateway keeper rejected cancellation request");
                json!({ "event": "unlock_slots_response", "showtime_id": showtime_id, "success": false, "unlocked_seat_ids": [] })
            }
        };
        self.adapter
            .send_to_user_local(user_id, &response_payload.to_string());
    }

    pub async fn on_register(&self, user_id: i32, socket_id: &str) {
        info!(
            "Hook on_register: user_id={}, socket_id={}",
            user_id, socket_id
        );
        let event = PubSubEvent::Register {
            user_id,
            socket_id: socket_id.to_string(),
        };
        self.publish_global(event).await;
    }

    pub async fn on_disconnect(&self, user_id: i32, socket_id: &str) {
        info!(
            "Hook on_disconnect: user_id={}, socket_id={}",
            user_id, socket_id
        );
        let event = PubSubEvent::Disconnect {
            user_id,
            socket_id: socket_id.to_string(),
        };
        self.publish_global(event).await;
    }

    pub async fn on_subscribe(&self, user_id: i32, socket_id: &str, showtime_id: i32) {
        info!(
            "Hook on_subscribe: socket_id={}, showtime_id={}",
            socket_id, showtime_id
        );
        self.adapter.subscribe_local(socket_id, showtime_id);
        self.send_room_state_snapshot(user_id, showtime_id).await;
    }

    pub async fn on_unsubscribe(&self, socket_id: &str, showtime_id: i32) {
        info!(
            "Hook on_unsubscribe: socket_id={}, showtime_id={}",
            socket_id, showtime_id
        );
        self.adapter.unsubscribe_local(socket_id, showtime_id);
    }

    pub async fn on_sync_locks_request(&self, user_id: i32, showtime_id: i32) {
        info!(
            "Hook on_sync_locks_request: user_id={}, showtime_id={}",
            user_id, showtime_id
        );

        let locked_seat_ids = sync_locks_from_zset(&self.redis_pool, user_id, showtime_id).await;
        let response_payload = json!({
            "event": "sync_locks_response",
            "success": true,
            "locked_seat_ids": locked_seat_ids,
        })
        .to_string();

        self.adapter.send_to_user_local(user_id, &response_payload);
    }

    pub async fn on_payment_confirm(&self, user_id: i32, showtime_id: i32, seat_ids: Vec<i32>) {
        info!(
            "Hook on_payment_confirm: user_id={}, showtime_id={}, seats={:?}",
            user_id, showtime_id, seat_ids
        );

        let success = confirm_payment(
            &self.redis_pool,
            self.single_node_lock.as_ref(),
            user_id,
            showtime_id,
            seat_ids.clone(),
        )
        .await;
        if success {
            let event = PubSubEvent::PaymentConfirmed {
                user_id,
                showtime_id,
                seat_ids,
            };
            self.publish_room(showtime_id, event).await;
        } else {
            error!("Payment confirmation failed - seats may have timed out");
        }
    }

    pub async fn on_payment_timeout(&self, user_id: i32, showtime_id: i32, seat_ids: Vec<i32>) {
        info!(
            "Hook on_payment_timeout: user_id={}, showtime_id={}, seats={:?}",
            user_id, showtime_id, seat_ids
        );

        // This is typically handled actively by redis expiration, but if called manually:
        // We can publish to room
        let event = PubSubEvent::PaymentTimeout {
            showtime_id,
            seat_ids,
        };
        self.publish_room(showtime_id, event).await;
    }

    async fn send_room_state_snapshot(&self, user_id: i32, showtime_id: i32) {
        let (seats, locked_seat_ids) =
            sync_room_state_snapshot(&self.redis_pool, user_id, showtime_id).await;
        let response_payload = json!({
            "event": "room_state_snapshot",
            "showtime_id": showtime_id,
            "seats": seats,
            "locked_seat_ids": locked_seat_ids,
        })
        .to_string();

        self.adapter.send_to_user_local(user_id, &response_payload);
    }

    async fn publish_global(&self, event: PubSubEvent) {
        if let Ok(mut cli) = self.redis_pool.get().await {
            let payload = serde_json::to_string(&event).unwrap_or_default();
            let channel = keys::global_events_channel();
            let _: redis::RedisResult<()> = cli.publish(&channel, &payload).await;
        }
    }

    async fn publish_room(&self, showtime_id: i32, event: PubSubEvent) {
        if let Ok(mut cli) = self.redis_pool.get().await {
            let payload = serde_json::to_string(&event).unwrap_or_default();
            let channel = keys::room_channel(showtime_id);
            let _: redis::RedisResult<()> = cli.publish(&channel, &payload).await;
        }
    }
}
