use anyhow::{Context, Result, anyhow};
use bookit_db::db::{DbPool, create_db_pool};
use diesel_migrations::{EmbeddedMigrations, MigrationHarness, embed_migrations};
use outbox_server::{publisher, run};
use tracing::{error, info};

const MIGRATIONS: EmbeddedMigrations = embed_migrations!("../../packages/db/migrations");

async fn run_migrations(pool: DbPool) -> Result<()> {
    tokio::task::spawn_blocking(move || -> Result<()> {
        pool.get()
            .context("database pool unavailable for migrations")?
            .run_pending_migrations(MIGRATIONS)
            .map_err(|error| anyhow!(error.to_string()))?;
        Ok(())
    })
    .await??;
    Ok(())
}

#[tokio::main]
async fn main() -> Result<()> {
    dotenvy::dotenv().ok();
    bookit_telemetry::init_telemetry("bookit-outbox-server");
    let _ = rustls::crypto::ring::default_provider().install_default();
    let pool = create_db_pool();
    run_migrations(pool.clone()).await?;
    info!("database migrations are current");
    if std::env::args().any(|argument| argument == "--migrate-only") {
        return Ok(());
    }

    loop {
        match rmq_conn::connect_with_retry().await {
            Ok(connection) => {
                let channel = connection.create_channel().await?;
                publisher::declare_topology(&channel).await?;
                info!("outbox publisher connected");
                if let Err(error) = run(pool.clone(), channel).await {
                    error!(%error, "outbox publisher disconnected; reconnecting");
                }
            }
            Err(error) => error!(%error, "RabbitMQ unavailable; outbox remains durable"),
        }
        tokio::time::sleep(std::time::Duration::from_secs(5)).await;
    }
}
