use anyhow::{Context, Result};
use mongodb::{
    Collection, Database, IndexModel,
    bson::{Bson, DateTime, Document, doc},
    options::{IndexOptions, ReturnDocument},
};
use serde_json::Value;

const CHECKPOINTS_COLLECTION: &str = "cdc_checkpoints";
const OUTBOX_COLLECTION: &str = "search_outbox_events";
const SEQUENCE_COLLECTION: &str = "search_outbox_sequence";

#[derive(Debug, Clone)]
pub struct SearchOutboxEvent {
    pub source_resume_token: String,
    pub show_id: String,
    pub operation: &'static str,
    pub title: Option<String>,
    pub city: Option<String>,
    pub thumbnail_url: Option<String>,
    pub venue: Option<String>,
    pub document: Option<Value>,
    pub trace_context: Value,
}

pub async fn ensure_collections(database: &Database) -> Result<()> {
    let outbox = database.collection::<Document>(OUTBOX_COLLECTION);
    outbox
        .create_index(
            IndexModel::builder()
                .keys(doc! { "sequence": 1_i32 })
                .options(IndexOptions::builder().unique(Some(true)).build())
                .build(),
        )
        .await
        .context("failed to create MongoDB search outbox sequence index")?;
    outbox
        .create_index(
            IndexModel::builder()
                .keys(doc! { "indexed_at": 1_i32, "sequence": 1_i32 })
                .build(),
        )
        .await
        .context("failed to create MongoDB search outbox dispatch index")?;
    Ok(())
}

/// Reads the source checkpoint from MongoDB. No SQL or PostgreSQL connection is
/// involved in the MongoDB search-outbox path.
pub async fn load_mongo_checkpoint(
    database: &Database,
    consumer_id: &str,
) -> Result<Option<String>> {
    let checkpoints = database.collection::<Document>(CHECKPOINTS_COLLECTION);
    let checkpoint = checkpoints
        .find_one(doc! { "_id": format!("shows:{consumer_id}") })
        .await
        .context("failed to load MongoDB CDC checkpoint")?;
    Ok(
        checkpoint
            .and_then(|checkpoint| checkpoint.get_str("resume_token").ok().map(str::to_owned)),
    )
}

/// Writes the event first, then moves the checkpoint. A crash between those
/// operations replays the MongoDB change; the resume token is also the outbox
/// document ID, so the replay is a harmless duplicate and then advances the
/// checkpoint. This makes the hand-off durable without querying MongoDB by SQL.
pub async fn record_mongo_outbox_event(
    database: &Database,
    consumer_id: &str,
    event: &SearchOutboxEvent,
) -> Result<()> {
    let outbox = database.collection::<Document>(OUTBOX_COLLECTION);
    let checkpoints = database.collection::<Document>(CHECKPOINTS_COLLECTION);

    if outbox
        .find_one(doc! { "_id": &event.source_resume_token })
        .await
        .context("failed to check MongoDB search outbox duplicate")?
        .is_none()
    {
        let sequence = next_sequence(database).await?;
        let mut document = doc! {
            "_id": &event.source_resume_token,
            "sequence": sequence,
            "show_id": &event.show_id,
            "operation": event.operation,
            "created_at": DateTime::now(),
            "next_attempt_at": DateTime::now(),
            "attempts": 0_i32,
            "trace_context": mongodb::bson::to_bson(&event.trace_context)?,
        };
        insert_optional_string(&mut document, "title", &event.title);
        insert_optional_string(&mut document, "city", &event.city);
        insert_optional_string(&mut document, "thumbnail_url", &event.thumbnail_url);
        insert_optional_string(&mut document, "venue", &event.venue);
        document.insert(
            "document",
            event
                .document
                .as_ref()
                .map(mongodb::bson::to_bson)
                .transpose()?
                .unwrap_or(Bson::Null),
        );

        match outbox.insert_one(document).await {
            Ok(_) => {}
            // Another CDC replica may have persisted this source event first.
            // The unique `_id` makes that race safe; we can still checkpoint it.
            Err(error) if error.to_string().contains("E11000") => {}
            Err(error) => return Err(error).context("failed to write MongoDB search outbox event"),
        }
    }

    checkpoints
        .update_one(
            doc! { "_id": format!("shows:{consumer_id}") },
            doc! { "$set": { "resume_token": &event.source_resume_token, "updated_at": DateTime::now() } },
        )
        .upsert(true)
        .await
        .context("failed to advance MongoDB CDC checkpoint")?;
    Ok(())
}

async fn next_sequence(database: &Database) -> Result<i64> {
    let counters: Collection<Document> = database.collection(SEQUENCE_COLLECTION);
    let counter = counters
        .find_one_and_update(doc! { "_id": "shows" }, doc! { "$inc": { "value": 1_i64 } })
        .upsert(true)
        .return_document(ReturnDocument::After)
        .await
        .context("failed to allocate MongoDB search outbox sequence")?
        .context("MongoDB search outbox sequence counter was not returned")?;
    counter
        .get_i64("value")
        .context("MongoDB search outbox sequence counter is invalid")
}

fn insert_optional_string(document: &mut Document, key: &str, value: &Option<String>) {
    document.insert(
        key,
        value
            .as_ref()
            .map(|value| Bson::String(value.clone()))
            .unwrap_or(Bson::Null),
    );
}
