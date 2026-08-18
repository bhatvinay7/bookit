mod stream;

use dotenvy::dotenv;
use mongodb::{bson::Document, options::ClientOptions, Client as MongoClient};
use redis_conn::establish_pool;
use std::env;
use tracing::info;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenv().ok();
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env().add_directive("cdc_worker=info".parse()?))
        .init();

    info!("Starting CDC Worker...");

    // Setup MongoDB
    let mongo_url = env::var("MONGODB_URL").expect("MONGODB_URL must be set");
    let db_name = env::var("MONGODB_DB").unwrap_or_else(|_| "bookit".to_string());

    let mut client_options = ClientOptions::parse(&mongo_url).await?;
    client_options.app_name = Some("cdc-worker".to_string());
    let mongo_client = MongoClient::with_options(client_options)?;
    let coll = mongo_client.database(&db_name).collection::<Document>("shows");

    // Setup Redis
    let redis_pool = establish_pool().await?;

    let resume_token_key = "cdc:shows:resume_token";
    let stream_key = "cdc:shows";

    stream::watch_redis_stream(coll, redis_pool, resume_token_key, stream_key).await;

    Ok(())
}
