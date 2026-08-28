use axum::extract::ws::{Message, WebSocket};
use futures::{sink::SinkExt, stream::StreamExt};
use serde::Deserialize;
use std::sync::Arc;

use crate::AppState;

#[derive(Deserialize, Debug)]
#[serde(tag = "type")]
pub enum WsRequest {
    Subscribe {
        #[serde(alias = "showtime_id")]
        room_id: i32,
    },
    Unsubscribe {
        #[serde(alias = "showtime_id")]
        room_id: i32,
    },
    LockSeats {
        #[serde(alias = "showtime_id")]
        room_id: i32,
        seat_ids: Vec<i32>,
    },
    UnlockSeats {
        #[serde(alias = "showtime_id")]
        room_id: i32,
        seat_ids: Vec<i32>,
    },
    SyncLocks {
        #[serde(alias = "showtime_id")]
        room_id: i32,
    },
}

pub async fn handle_socket(
    socket: WebSocket,
    state: Arc<AppState>,
    user_id: i32,
    socket_id: String,
) {
    let (mut sender, mut receiver) = socket.split();
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<String>();

    // Register connection locally
    state
        .hooks
        .adapter
        .add_local_connection(socket_id.clone(), user_id, tx.clone());
    state.hooks.on_register(user_id, &socket_id).await;

    let ack_msg = serde_json::json!({
        "event": "auth_ack",
        "user_id": user_id
    });
    let _ = tx.send(ack_msg.to_string());

    // Send task
    let mut send_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if sender.send(Message::Text(msg.into())).await.is_err() {
                break;
            }
        }
    });

    let state_clone = state.clone();
    let socket_id_clone = socket_id.clone();

    // Receive task
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(Message::Text(text))) = receiver.next().await {
            if let Ok(req) = serde_json::from_str::<WsRequest>(&text) {
                match req {
                    WsRequest::Subscribe { room_id } => {
                        state_clone
                            .hooks
                            .on_subscribe(user_id, &socket_id_clone, room_id)
                            .await;
                    }
                    WsRequest::Unsubscribe { room_id } => {
                        state_clone
                            .hooks
                            .on_unsubscribe(&socket_id_clone, room_id)
                            .await;
                    }
                    WsRequest::LockSeats { room_id, seat_ids } => {
                        state_clone
                            .hooks
                            .on_lock_request(user_id, room_id, seat_ids)
                            .await;
                    }
                    WsRequest::UnlockSeats { room_id, seat_ids } => {
                        state_clone
                            .hooks
                            .on_unlock_request(user_id, room_id, seat_ids)
                            .await;
                    }
                    WsRequest::SyncLocks { room_id } => {
                        state_clone
                            .hooks
                            .on_sync_locks_request(user_id, room_id)
                            .await;
                    }
                }
            }
        }
    });

    // Wait for either task to finish
    tokio::select! {
        _ = (&mut send_task) => recv_task.abort(),
        _ = (&mut recv_task) => send_task.abort(),
    };

    // Disconnect handling
    state
        .hooks
        .adapter
        .remove_local_connection(&socket_id, user_id);
    state.hooks.on_disconnect(user_id, &socket_id).await;
}
