use anyhow::{Context, Result};
use mongodb::{Client, bson::doc, options::ClientOptions};
use std::{env, time::Duration};

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

    let attempts = env_u32("CONNECTION_RETRY_ATTEMPTS", 30);
    let mut delay = Duration::from_millis(env_u64("CONNECTION_RETRY_INITIAL_MS", 500));
    let max_delay = Duration::from_millis(env_u64("CONNECTION_RETRY_MAX_MS", 30_000));

    for attempt in 1..=attempts {
        let client =
            Client::with_options(opts.clone()).context("Failed to build MongoDB client")?;
        match client
            .database("admin")
            .run_command(doc! { "ping": 1 })
            .await
        {
            Ok(_) => return Ok(client),
            Err(error) if attempt < attempts => {
                eprintln!(
                    "MongoDB connection attempt {attempt}/{attempts} failed: {error}; retrying in {delay:?}"
                );
                tokio::time::sleep(delay).await;
                delay = delay.saturating_mul(2).min(max_delay);
            }
            Err(error) => return Err(error).context("MongoDB did not become ready"),
        }
    }

    unreachable!("connection retry attempts must be at least one")
}

fn env_u64(name: &str, default: u64) -> u64 {
    env::var(name)
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(default)
}

fn env_u32(name: &str, default: u32) -> u32 {
    env_u64(name, u64::from(default)).clamp(1, u64::from(u32::MAX)) as u32
}
