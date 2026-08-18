use diesel::pg::PgConnection;
use diesel::r2d2::{self, ConnectionManager, Pool};
use std::env;

pub type DbPool = Pool<ConnectionManager<PgConnection>>;

pub fn create_db_pool() -> DbPool {
    dotenvy::dotenv().ok();

    let database_url = env::var("DATABASE_URL").expect("DATABASE_URL must be set");

    let manager = ConnectionManager::<PgConnection>::new(database_url);
    Pool::builder()
        .test_on_check_out(true)
        .build(manager)
        .expect("Failed to create database pool.")
}
