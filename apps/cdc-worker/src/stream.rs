use futures::StreamExt;
use mongodb::{
    Collection,
    bson::{Document, doc},
    options::ChangeStreamOptions,
};
use redis::AsyncCommands;
use redis_conn::RedisPool;
use tracing::{error, info};

pub async fn watch_redis_stream(
    coll: Collection<Document>,
    redis_pool: RedisPool,
    resume_token_key: &str,
    stream_key: &str,
) {
    loop {
        // Try to fetch last resume token
        let mut redis_cli = match redis_pool.get().await {
            Ok(cli) => cli,
            Err(e) => {
                error!("Failed to get redis connection: {}. Retrying in 5s...", e);
                tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                continue;
            }
        };

        let resume_token_str: Option<String> =
            redis_cli.get(resume_token_key).await.unwrap_or(None);

        let mut options = ChangeStreamOptions::builder()
            .full_document(Some(mongodb::options::FullDocumentType::UpdateLookup))
            .build();

        if let Some(token_str) = resume_token_str {
            if let Ok(token_doc) =
                serde_json::from_str::<mongodb::change_stream::event::ResumeToken>(&token_str)
            {
                info!("Resuming change stream from token: {}", token_str);
                options.resume_after = Some(token_doc);
            }
        } else {
            info!("Starting change stream from now");
        }

        let pipeline = vec![
            doc! { "$match": { "operationType": { "$in": ["insert", "update", "replace", "delete"] } } },
        ];

        match coll.watch().with_options(options).pipeline(pipeline).await {
            Ok(mut stream) => {
                info!("Change stream established successfully");
                while let Some(event_result) = stream.next().await {
                    match event_result {
                        Ok(event) => {
                            let op_type = event.operation_type;
                            let doc_id = event
                                .document_key
                                .as_ref()
                                .and_then(|key| key.get("_id"))
                                .and_then(|id| id.as_object_id())
                                .map(|oid| oid.to_hex());

                            if let Some(id) = doc_id {
                                info!("Processing {:?} on document {}", op_type, id);

                                let payload = serde_json::json!({
                                    "op": format!("{:?}", op_type).to_lowercase(),
                                    "id": id,
                                    "full_document": event.full_document,
                                });

                                // Push to Redis Stream
                                if let Ok(payload_str) = serde_json::to_string(&payload) {
                                    let _: Result<(), _> = redis_cli
                                        .xadd(stream_key, "*", &[("payload", &payload_str)])
                                        .await;
                                }

                                // Save resume token
                                if let Ok(token_json) = mongodb::bson::to_document(&event.id)
                                    && let Ok(token_str) = serde_json::to_string(&token_json)
                                {
                                    let _: Result<(), _> =
                                        redis_cli.set(resume_token_key, token_str).await;
                                }
                            }
                        }
                        Err(e) => {
                            error!("Change stream error: {}", e);
                            break; // Reconnect
                        }
                    }
                }
            }
            Err(e) => {
                error!("Failed to start change stream: {}. Retrying in 5s...", e);
            }
        }
        tokio::time::sleep(std::time::Duration::from_secs(5)).await;
    }
}
