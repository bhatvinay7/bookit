use anyhow::{Context, Result};
use mongodb::{options::ClientOptions, Client};
use std::env;

/// Shared alias — wrap in Arc in AppState
pub type MongoClient = Client;

/// Creates a MongoDB client from `MONGODB_URL` env var.
pub async fn create_mongo_client() -> Result<MongoClient> {
    let url = env::var("MONGODB_URL").context("MONGODB_URL environment variable not set")?;

    let mut opts = ClientOptions::parse(&url)
        .await
        .context("Failed to parse MONGODB_URL")?;

    // Helpful server description: bookit app
    opts.app_name = Some("bookit".to_string());

    Client::with_options(opts).context("Failed to build MongoDB client")
}
