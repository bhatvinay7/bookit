use futures::StreamExt;
use mongodb::{
    Collection, Database,
    bson::{Bson, Document, doc},
    options::ChangeStreamOptions,
};
use serde_json::{Value, json};
use tracing::{error, info};

use crate::outbox::{self, SearchOutboxEvent};

pub async fn watch_search_outbox(coll: Collection<Document>, database: Database) {
    // CDC is deliberately a singleton deployment: one stable checkpoint means
    // a replacement pod resumes the same source stream instead of starting at
    // "now". The outbox is still independently safe to replay.
    let consumer_id = "shows";

    loop {
        if let Err(error) = outbox::ensure_collections(&database).await {
            error!(%error, "Failed to prepare MongoDB search outbox; retrying in 5s");
            tokio::time::sleep(std::time::Duration::from_secs(5)).await;
            continue;
        }
        let resume_token = match outbox::load_mongo_checkpoint(&database, consumer_id).await {
            Ok(token) => token,
            Err(error) => {
                error!(%error, "Failed to load MongoDB CDC checkpoint; retrying in 5s");
                tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                continue;
            }
        };

        let mut options = ChangeStreamOptions::builder()
            .full_document(Some(mongodb::options::FullDocumentType::UpdateLookup))
            .build();

        if let Some(token) = resume_token {
            match serde_json::from_str::<mongodb::change_stream::event::ResumeToken>(&token) {
                Ok(token) => {
                    info!("Resuming MongoDB shows change stream from durable checkpoint");
                    options.resume_after = Some(token);
                }
                Err(error) => {
                    error!(%error, "Stored MongoDB CDC checkpoint is invalid; refusing to skip changes");
                    tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                    continue;
                }
            }
        } else {
            info!("Starting MongoDB shows change stream from now");
        }

        let pipeline = vec![doc! {
            "$match": { "operationType": { "$in": ["insert", "update", "replace", "delete"] } }
        }];

        match coll.watch().with_options(options).pipeline(pipeline).await {
            Ok(mut stream) => {
                info!("MongoDB shows change stream established");
                while let Some(event_result) = stream.next().await {
                    let event = match event_result {
                        Ok(event) => event,
                        Err(error) => {
                            error!(%error, "MongoDB change stream error; reconnecting");
                            break;
                        }
                    };

                    let source_resume_token = match mongodb::bson::to_document(&event.id)
                        .ok()
                        .and_then(|token| serde_json::to_string(&token).ok())
                    {
                        Some(token) => token,
                        None => {
                            error!(
                                "Unable to serialize MongoDB resume token; reconnecting without checkpointing event"
                            );
                            break;
                        }
                    };
                    let show_id = match event
                        .document_key
                        .as_ref()
                        .and_then(|key| key.get("_id"))
                        .and_then(Bson::as_object_id)
                        .map(|id| id.to_hex())
                    {
                        Some(id) => id,
                        None => {
                            error!(
                                "MongoDB show change has no ObjectId document key; reconnecting without checkpointing event"
                            );
                            break;
                        }
                    };

                    let event = match change_to_outbox_event(
                        &format!("{:?}", event.operation_type).to_lowercase(),
                        show_id,
                        source_resume_token,
                        event.full_document,
                    ) {
                        Ok(event) => event,
                        Err(error) => {
                            error!(%error, "Cannot create durable search event; reconnecting without checkpointing change");
                            break;
                        }
                    };

                    // The carrier is persisted with the durable event, so a
                    // replay after an Elasticsearch outage remains connected
                    // to the originating MongoDB change trace.
                    let span =
                        bookit_telemetry::operation_span("mongodb.shows change", "consumer", None);
                    let trace_context = bookit_telemetry::in_span(span, async {
                        serde_json::to_value(bookit_telemetry::current_carrier())
                            .unwrap_or_default()
                    })
                    .await;
                    let mut event = event;
                    event.trace_context = trace_context;

                    let persisted_show_id = event.show_id.clone();
                    let persisted_operation = event.operation;
                    match outbox::record_mongo_outbox_event(&database, consumer_id, &event).await {
                        Ok(()) => {
                            info!(show_id = %persisted_show_id, operation = persisted_operation, "Persisted MongoDB show change in search outbox")
                        }
                        Err(error) => {
                            error!(%error, "Failed to persist search outbox event; reconnecting without advancing checkpoint");
                            break;
                        }
                    }
                }
            }
            Err(error) => error!(%error, "Failed to start MongoDB change stream; retrying in 5s"),
        }
        tokio::time::sleep(std::time::Duration::from_secs(5)).await;
    }
}

fn change_to_outbox_event(
    operation: &str,
    show_id: String,
    source_resume_token: String,
    full_document: Option<Document>,
) -> Result<SearchOutboxEvent, &'static str> {
    if operation == "delete" {
        return Ok(delete_event(show_id, source_resume_token));
    }

    let document = full_document.ok_or("change event did not include full_document")?;
    if document
        .get("deleted_at")
        .is_some_and(|value| !matches!(value, Bson::Null))
    {
        return Ok(delete_event(show_id, source_resume_token));
    }

    let title = string_field(&document, "title");
    if title.as_deref().is_none_or(str::is_empty) {
        return Err("show change does not contain a title");
    }
    let city = string_field(&document, "city");
    let thumbnail_url = string_field(&document, "thumbnail_url");
    let venue = string_field(&document, "venue");

    Ok(SearchOutboxEvent {
        source_resume_token,
        show_id: show_id.clone(),
        operation: "upsert",
        title: title.clone(),
        city: city.clone(),
        thumbnail_url: thumbnail_url.clone(),
        venue: venue.clone(),
        document: Some(json!({
            "id": show_id,
            "title": title,
            "description": string_field(&document, "description"),
            "tags": string_array_field(&document, "tags"),
            "category_ids": string_array_field(&document, "category_ids"),
            "show_type": string_field(&document, "show_type"),
            "city": city,
            "venue": venue,
            "thumbnail_url": thumbnail_url,
            "poster_url": string_field(&document, "poster_url"),
        })),
        trace_context: Value::Null,
    })
}

fn delete_event(show_id: String, source_resume_token: String) -> SearchOutboxEvent {
    SearchOutboxEvent {
        source_resume_token,
        show_id,
        operation: "delete",
        title: None,
        city: None,
        thumbnail_url: None,
        venue: None,
        document: None,
        trace_context: Value::Null,
    }
}

fn string_field(document: &Document, field: &str) -> Option<String> {
    document.get_str(field).ok().map(str::to_owned)
}

fn string_array_field(document: &Document, field: &str) -> Value {
    let values = document
        .get_array(field)
        .ok()
        .into_iter()
        .flatten()
        .filter_map(Bson::as_str)
        .collect::<Vec<_>>();
    json!(values)
}

#[cfg(test)]
mod tests {
    use super::*;
    use mongodb::bson::doc;

    #[test]
    fn search_outbox_materialises_search_fields() {
        let event = change_to_outbox_event(
            "update",
            "65f000000000000000000001".to_string(),
            "resume-token".to_string(),
            Some(doc! {
                "title": "Night Concert",
                "city": "Bengaluru",
                "venue": "Arena",
                "thumbnail_url": "https://cdn.example/thumbnail.jpg",
                "tags": ["music", "live"],
            }),
        )
        .expect("valid show");

        assert_eq!(event.operation, "upsert");
        assert_eq!(event.title.as_deref(), Some("Night Concert"));
        assert_eq!(event.city.as_deref(), Some("Bengaluru"));
        assert_eq!(event.venue.as_deref(), Some("Arena"));
        assert_eq!(
            event.document.as_ref().unwrap()["thumbnail_url"],
            "https://cdn.example/thumbnail.jpg"
        );
    }

    #[test]
    fn soft_delete_becomes_an_idempotent_delete_event() {
        let event = change_to_outbox_event(
            "update",
            "65f000000000000000000001".to_string(),
            "resume-token".to_string(),
            Some(doc! { "title": "Removed", "deleted_at": mongodb::bson::DateTime::now() }),
        )
        .expect("valid soft delete");

        assert_eq!(event.operation, "delete");
        assert!(event.document.is_none());
    }
}
