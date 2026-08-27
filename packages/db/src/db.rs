use diesel::pg::PgConnection;
use diesel::r2d2::{ConnectionManager, Pool};
use std::{env, thread, time::Duration};

pub type DbPool = Pool<ConnectionManager<PgConnection>>;

pub fn create_db_pool() -> DbPool {
    dotenvy::dotenv().ok();

    let database_url = env::var("DATABASE_URL").expect("DATABASE_URL must be set");

    let attempts = env_u32("CONNECTION_RETRY_ATTEMPTS", 30);
    let mut delay = Duration::from_millis(env_u64("CONNECTION_RETRY_INITIAL_MS", 500));
    let max_delay = Duration::from_millis(env_u64("CONNECTION_RETRY_MAX_MS", 30_000));
    let connection_timeout = Duration::from_secs(env_u64("DB_CONNECTION_TIMEOUT_SECS", 60));

    for attempt in 1..=attempts {
        let manager = ConnectionManager::<PgConnection>::new(database_url.clone());
        match Pool::builder()
            .test_on_check_out(true)
            .connection_timeout(connection_timeout)
            .build(manager)
        {
            Ok(pool) => return pool,
            Err(error) if attempt < attempts => {
                eprintln!(
                    "PostgreSQL connection attempt {attempt}/{attempts} failed: {error}; retrying in {delay:?}"
                );
                thread::sleep(delay);
                delay = delay.saturating_mul(2).min(max_delay);
            }
            Err(error) => {
                panic!("Failed to create database pool after {attempts} attempts: {error}")
            }
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
