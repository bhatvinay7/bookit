use redis::AsyncCommands;
use std::sync::Arc;

use crate::types::AppState;

pub async fn watch_redis_stream(state: Arc<AppState>) {
    let redis_pool = redis_conn::establish_pool()
        .await
        .expect("Failed to create Redis pool for search-server");

    let stream_key = "cdc:shows";
    let group_name = "search-server-group";
    let consumer_name = "search-server-1";

    println!("Watching Redis Stream '{}' for CDC events...", stream_key);

    // Initialize group. Ignore error if it already exists.
    let mut redis_cli = redis_pool.get().await.unwrap();
    let _: redis::RedisResult<()> = redis_cli
        .xgroup_create_mkstream(stream_key, group_name, "0")
        .await;

    loop {
        let mut conn = match redis_pool.get().await {
            Ok(c) => c,
            Err(e) => {
                eprintln!("Failed to get Redis connection: {}", e);
                tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                continue;
            }
        };

        let opts = redis::streams::StreamReadOptions::default()
            .group(group_name, consumer_name)
            .block(5000)
            .count(10);

        let result: redis::RedisResult<redis::streams::StreamReadReply> =
            conn.xread_options(&[stream_key], &[">"], &opts).await;

        match result {
            Ok(reply) => {
                for key in reply.keys {
                    for id in key.ids {
                        if let Some(payload_str) = id.map.get("payload")
                            && let Ok(json_str) =
                                redis::from_redis_value::<String>(payload_str.clone())
                            && let Ok(event) = serde_json::from_str::<serde_json::Value>(&json_str)
                        {
                            process_cdc_event(&state, &event).await;
                        }
                        // ACK the message
                        let _: () = conn.xack(stream_key, group_name, &[&id.id]).await.unwrap();
                    }
                }
            }
            Err(e) => {
                eprintln!("Redis stream read error: {}", e);
                tokio::time::sleep(std::time::Duration::from_secs(2)).await;
            }
        }
    }
}

pub async fn process_cdc_event(state: &AppState, event: &serde_json::Value) {
    if let (Some(op), Some(id)) = (event["op"].as_str(), event["id"].as_str()) {
        let doc_url = format!("{}/shows/_doc/{}", state.es_url, id);

        match op {
            "insert" | "update" | "replace" => {
                if let Some(doc) = event.get("full_document") {
                    let _ = state.es_client.put(&doc_url).json(doc).send().await;
                    println!("Synced to ES ({}): {}", op, id);
                }
            }
            "delete" => {
                let _ = state.es_client.delete(&doc_url).send().await;
                println!("Deleted from ES: {}", id);
            }
            _ => {}
        }
    }
}
