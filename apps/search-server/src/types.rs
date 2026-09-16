use mongodb::Database;
use reqwest::Client as HttpClient;

#[derive(Clone)]
pub struct AppState {
    pub es_client: HttpClient,
    pub es_url: String,
    pub db_pool: bookit_db::db::DbPool,
    pub mongo_database: Database,
}

#[derive(serde::Deserialize)]
pub struct SearchQuery {
    pub q: String,
    pub city: Option<String>,
}
