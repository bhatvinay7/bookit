use dashmap::{DashMap, DashSet};
use futures::StreamExt;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::mpsc::UnboundedSender;

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(tag = "event")]
pub enum PubSubEvent {
    Register {
        user_id: i32,
        socket_id: String,
    },
    Disconnect {
        user_id: i32,
        socket_id: String,
    },
    SeatLocked {
        user_id: i32,
        showtime_id: i32,
        seat_id: i32,
    },
    SeatUnlocked {
        user_id: i32,
        showtime_id: i32,
        seat_id: i32,
    },
    LockSlotsResponse {
        user_id: i32,
        showtime_id: i32,
        success: bool,
        locked_seat_ids: Vec<i32>,
        failed_seat_ids: Vec<i32>,
    },
    PaymentConfirmed {
        user_id: i32,
        showtime_id: i32,
        seat_ids: Vec<i32>,
    },
    PaymentTimeout {
        showtime_id: i32,
        seat_ids: Vec<i32>,
    },
}

#[derive(Clone)]
pub struct RedisSocketAdapter {
    pub redis_url: String,
    pub sockets: Arc<DashMap<String, UnboundedSender<String>>>,
    pub user_sockets: Arc<DashMap<i32, DashSet<String>>>,
    pub show_sockets: Arc<DashMap<i32, DashSet<String>>>,
    pub socket_shows: Arc<DashMap<String, DashSet<i32>>>,
}

impl RedisSocketAdapter {
    pub fn new(redis_url: String) -> Self {
        Self {
            redis_url,
            sockets: Arc::new(DashMap::new()),
            user_sockets: Arc::new(DashMap::new()),
            show_sockets: Arc::new(DashMap::new()),
            socket_shows: Arc::new(DashMap::new()),
        }
    }

    pub fn add_local_connection(
        &self,
        socket_id: String,
        user_id: i32,
        tx: UnboundedSender<String>,
    ) {
        self.sockets.insert(socket_id.clone(), tx);
        self.user_sockets
            .entry(user_id)
            .or_default()
            .insert(socket_id.clone());
        self.socket_shows.insert(socket_id, DashSet::new());
    }

    pub fn remove_local_connection(&self, socket_id: &str, user_id: i32) {
        self.sockets.remove(socket_id);

        if let Some(user_set) = self.user_sockets.get(&user_id) {
            user_set.remove(socket_id);
        }

        if let Some((_, shows)) = self.socket_shows.remove(socket_id) {
            for show_id in shows.iter() {
                if let Some(sockets) = self.show_sockets.get(&*show_id) {
                    sockets.remove(socket_id);
                }
            }
        }
    }

    pub fn subscribe_local(&self, socket_id: &str, showtime_id: i32) {
        self.show_sockets
            .entry(showtime_id)
            .or_default()
            .insert(socket_id.to_string());

        if let Some(shows) = self.socket_shows.get(socket_id) {
            shows.insert(showtime_id);
        }
    }

    pub fn unsubscribe_local(&self, socket_id: &str, showtime_id: i32) {
        if let Some(sockets) = self.show_sockets.get(&showtime_id) {
            sockets.remove(socket_id);
        }
        if let Some(shows) = self.socket_shows.get(socket_id) {
            shows.remove(&showtime_id);
        }
    }

    pub fn broadcast_to_room_local(&self, showtime_id: i32, message: &str) {
        if let Some(sockets) = self.show_sockets.get(&showtime_id) {
            for socket_id in sockets.iter() {
                if let Some(tx) = self.sockets.get(&*socket_id) {
                    let _ = tx.send(message.to_string());
                }
            }
        }
    }

    /// Broadcast a message to all sockets in a room except those belonging to `excluded_user_id`.
    pub fn broadcast_to_room_excluding_user(
        &self,
        showtime_id: i32,
        excluded_user_id: i32,
        message: &str,
    ) {
        // Collect socket_ids owned by the excluded user so we can skip them
        let excluded_sockets: std::collections::HashSet<String> = self
            .user_sockets
            .get(&excluded_user_id)
            .map(|set| set.iter().map(|s| s.clone()).collect())
            .unwrap_or_default();

        if let Some(sockets) = self.show_sockets.get(&showtime_id) {
            for socket_id in sockets.iter() {
                if excluded_sockets.contains(&*socket_id) {
                    continue;
                }
                if let Some(tx) = self.sockets.get(&*socket_id) {
                    let _ = tx.send(message.to_string());
                }
            }
        }
    }

    pub fn send_to_user_local(&self, user_id: i32, message: &str) {
        if let Some(sockets) = self.user_sockets.get(&user_id) {
            for socket_id in sockets.iter() {
                if let Some(tx) = self.sockets.get(&*socket_id) {
                    let _ = tx.send(message.to_string());
                }
            }
        }
    }

    /// Run the background subscriber for Redis Pub/Sub events
    pub async fn run_subscriber(&self) {
        let redis_url = self.redis_url.clone();
        let adapter = self.clone();

        loop {
            tracing::info!("Starting Redis PubSub subscriber loop for: {}", redis_url);
            match redis::Client::open(redis_url.clone()) {
                Ok(client) => match client.get_async_pubsub().await {
                    Ok(mut pubsub_conn) => {
                        if let Err(e) = pubsub_conn.psubscribe("room:*").await {
                            tracing::error!("Failed to psubscribe to room:*: {:?}", e);
                            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                            continue;
                        }
                        if let Err(e) = pubsub_conn
                            .subscribe(crate::keys::global_events_channel())
                            .await
                        {
                            tracing::error!("Failed to subscribe to global_events: {:?}", e);
                            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                            continue;
                        }

                        tracing::info!("Successfully subscribed to Redis PubSub channels");
                        let mut stream = pubsub_conn.into_on_message();

                        while let Some(msg) = stream.next().await {
                            let channel_name = msg.get_channel_name().to_string();
                            if let Ok(payload) = msg.get_payload::<String>() {
                                // Handle room-scoped events
                                if let Some(id_str) = channel_name.strip_prefix("room:") {
                                    if let Ok(showtime_id) = id_str.parse::<i32>() {
                                        // Try to parse as a known PubSubEvent for smart routing
                                        if let Ok(event) =
                                            serde_json::from_str::<PubSubEvent>(&payload)
                                        {
                                            match event {
                                                PubSubEvent::SeatLocked {
                                                    user_id,
                                                    seat_id,
                                                    ..
                                                } => {
                                                    let notify = serde_json::json!({
                                                        "event": "seat_locked",
                                                        "seat_id": seat_id,
                                                        "showtime_id": showtime_id,
                                                        "user_id": user_id,
                                                    })
                                                    .to_string();
                                                    adapter.broadcast_to_room_local(
                                                        showtime_id,
                                                        &notify,
                                                    );
                                                }
                                                PubSubEvent::SeatUnlocked { seat_id, .. } => {
                                                    let notify = serde_json::json!({
                                                        "event": "seat_unlocked",
                                                        "seat_id": seat_id,
                                                        "showtime_id": showtime_id,
                                                    })
                                                    .to_string();
                                                    adapter.broadcast_to_room_local(
                                                        showtime_id,
                                                        &notify,
                                                    );
                                                }
                                                _ => {
                                                    // For all other room events broadcast as-is
                                                    adapter.broadcast_to_room_local(
                                                        showtime_id,
                                                        &payload,
                                                    );
                                                }
                                            }
                                        } else {
                                            adapter.broadcast_to_room_local(showtime_id, &payload);
                                        }
                                    }
                                } else if channel_name == crate::keys::global_events_channel()
                                    && let Ok(event) = serde_json::from_str::<PubSubEvent>(&payload)
                                {
                                    match event {
                                        PubSubEvent::LockSlotsResponse {
                                            user_id,
                                            showtime_id,
                                            success,
                                            locked_seat_ids,
                                            failed_seat_ids,
                                        } => {
                                            let response_payload = serde_json::json!({
                                                "event": "lock_slots_response",
                                                "showtime_id": showtime_id,
                                                "success": success,
                                                "locked_seat_ids": locked_seat_ids,
                                                "failed_seat_ids": failed_seat_ids,
                                            })
                                            .to_string();
                                            adapter.send_to_user_local(user_id, &response_payload);
                                        }
                                        PubSubEvent::Register { .. }
                                        | PubSubEvent::Disconnect { .. } => {}
                                        _ => {}
                                    }
                                }
                            }
                        }
                        tracing::warn!("Redis PubSub stream ended unexpectedly");
                    }
                    Err(e) => {
                        tracing::error!("Failed to get async pubsub from Redis: {:?}", e);
                    }
                },
                Err(e) => {
                    tracing::error!("Failed to open Redis client for pubsub: {:?}", e);
                }
            }
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
        }
    }
}
