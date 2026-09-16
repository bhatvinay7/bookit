use anyhow::{Context, Result};
use mongodb::{
    Database, IndexModel,
    bson::{Bson, Document, doc},
    options::IndexOptions,
};
use serde_json::Value;

const OUTBOX_COLLECTION: &str = "search_outbox_events";
const CHECKPOINT_COLLECTION: &str = "search_outbox_checkpoints";

#[derive(Debug, Clone)]
pub struct ClaimedSearchEvent {
    pub sequence: i64,
    pub show_id: String,
    pub operation: String,
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
                .keys(doc! { "created_at": 1_i32 })
                .options(
                    IndexOptions::builder()
                        .expire_after(std::time::Duration::from_secs(7 * 24 * 60 * 60))
                        .build()
                )
                .build(),
        )
        .await
        .context("failed to create MongoDB search outbox TTL index")?;
    Ok(())
}

pub async fn claim_next(database: &Database) -> Result<Option<ClaimedSearchEvent>> {
    let checkpoints = database.collection::<Document>(CHECKPOINT_COLLECTION);
    let checkpoint = checkpoints
        .find_one(doc! { "_id": "elasticsearch" })
        .await
        .context("failed to read MongoDB search outbox checkpoint")?;
    
    let last_sequence = checkpoint
        .and_then(|doc| doc.get_i64("last_sequence").ok())
        .unwrap_or(0);

    let outbox = database.collection::<Document>(OUTBOX_COLLECTION);
    let candidate = outbox
        .find_one(doc! { "sequence": { "$gt": last_sequence } })
        .sort(doc! { "sequence": 1_i32 })
        .await
        .context("failed to read MongoDB search outbox")?;

    match candidate {
        Some(doc) => Ok(Some(parse_claimed_event(doc)?)),
        None => Ok(None),
    }
}

pub async fn mark_indexed(database: &Database, event: &ClaimedSearchEvent) -> Result<()> {
    let checkpoints = database.collection::<Document>(CHECKPOINT_COLLECTION);
    checkpoints
        .update_one(
            doc! { "_id": "elasticsearch" },
            doc! { "$set": { "last_sequence": event.sequence } },
        )
        .upsert(true)
        .await
        .context("failed to acknowledge MongoDB search outbox event")?;
    Ok(())
}

fn parse_claimed_event(document: Document) -> Result<ClaimedSearchEvent> {
    let value = |name| document.get(name).cloned().unwrap_or(Bson::Null);
    Ok(ClaimedSearchEvent {
        sequence: document
            .get_i64("sequence")
            .context("MongoDB search outbox event has invalid sequence")?,
        show_id: document
            .get_str("show_id")
            .context("MongoDB search outbox event has invalid show ID")?
            .to_owned(),
        operation: document
            .get_str("operation")
            .context("MongoDB search outbox event has invalid operation")?
            .to_owned(),
        document: match value("document") {
            Bson::Null => None,
            val => {
                Some(mongodb::bson::from_bson(val).context("invalid search document payload")?)
            }
        },
        trace_context: mongodb::bson::from_bson(value("trace_context"))
            .unwrap_or_else(|_| Value::Null),
    })
}
