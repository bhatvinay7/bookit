use crate::grpc_client::GrpcLockClient;
use crate::locking::{confirm_payment, sync_locks_from_zset, sync_room_state_snapshot};
use redis::AsyncCommands;
use redis_conn::RedisPool;
use redis_conn::adapter::PubSubEvent;
use redis_conn::adapter::RedisSocketAdapter;
use redis_conn::keys;
use serde_json::json;
use tracing::{error, info};

pub struct WsHooks {
    pub adapter: RedisSocketAdapter,
    pub redis_pool: RedisPool,
    pub grpc_client: GrpcLockClient,
}

impl WsHooks {
    pub fn new(
        adapter: RedisSocketAdapter,
        redis_pool: RedisPool,
        grpc_client: GrpcLockClient,
    ) -> Self {
        Self {
            adapter,
            redis_pool,
            grpc_client,
        }
    }

    pub async fn on_lock_request(&self, user_id: i32, showtime_id: i32, seat_ids: Vec<i32>) {
        let response_payload = match self
            .grpc_client
            .lock_slot(showtime_id, seat_ids.clone(), user_id)
            .await
        {
            Ok((success, _, locked_seat_ids, failed_seat_ids)) => json!({
                "event": "lock_slots_response",
                "showtime_id": showtime_id,
                "success": success,
                "locked_seat_ids": locked_seat_ids,
                "failed_seat_ids": failed_seat_ids,
            }),
            Err(err) => {
                error!(?err, "gateway keeper rejected lock request");
                json!({
                    "event": "lock_slots_response",
                    "showtime_id": showtime_id,
                    "success": false,
                    "locked_seat_ids": [],
                    "failed_seat_ids": seat_ids,
                })
            }
        };
        self.adapter
            .send_to_user_local(user_id, &response_payload.to_string());
    }

    pub async fn on_unlock_request(&self, user_id: i32, showtime_id: i32, seat_ids: Vec<i32>) {
        let response_payload = match self
            .grpc_client
            .unlock_slot(showtime_id, seat_ids, user_id)
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

        let success =
            confirm_payment(&self.redis_pool, user_id, showtime_id, seat_ids.clone()).await;
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
