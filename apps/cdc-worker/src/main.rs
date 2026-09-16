mod outbox;
mod stream;

use dotenvy::dotenv;
use mongodb::{Client as MongoClient, bson::Document, options::ClientOptions};
use std::env;
use tracing::info;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenv().ok();
    bookit_telemetry::init_telemetry("bookit-cdc-worker");

    info!("Starting CDC Worker...");

    // Setup MongoDB
    let mongo_url = env::var("MONGODB_URL").expect("MONGODB_URL must be set");
    let db_name = env::var("MONGODB_DB").unwrap_or_else(|_| "bookit".to_string());

    let mut client_options = ClientOptions::parse(&mongo_url).await?;
    client_options.app_name = Some("cdc-worker".to_string());
    let mongo_client = MongoClient::with_options(client_options)?;
    let database = mongo_client.database(&db_name);
    let coll = database.collection::<Document>("shows");

    // MongoDB owns both show details and the durable CDC hand-off. The source
    // resume token advances only after the MongoDB search outbox has the event.
    stream::watch_search_outbox(coll, database).await;

    Ok(())
}
