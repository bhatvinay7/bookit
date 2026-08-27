mod es;
mod grpc;
mod stream;
mod types;

use axum::{Router, routing::get};
use bookit_mongo::models::show::Show;
use bookit_proto::search::search_service_server::SearchServiceServer;
use dotenvy::dotenv;
use mongodb::{Client as MongoClient, options::ClientOptions};
use reqwest::Client as HttpClient;
use std::env;
use std::net::SocketAddr;
use std::sync::Arc;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;

use crate::types::AppState;

#[tokio::main]
async fn main() {
    let _ = dotenvy::dotenv();
    bookit_telemetry::init_telemetry("bookit-search-server");
    dotenv().ok();

    // Setup Elasticsearch Client
    let es_url =
        env::var("ELASTICSEARCH_URL").unwrap_or_else(|_| "http://localhost:9200".to_string());
    let es_client = HttpClient::new();

    // Setup MongoDB Client
    let mongo_url = env::var("MONGODB_URL").expect("MONGODB_URL must be set");
    let db_name = env::var("MONGODB_DB").unwrap_or_else(|_| "bookit".to_string());

    let mut client_options = ClientOptions::parse(&mongo_url).await.unwrap();
    client_options.app_name = Some("search-server".to_string());
    let mongo_client = MongoClient::with_options(client_options).unwrap();

    // Setup Postgres DB Pool
    let db_pool = bookit_db::db::create_db_pool();

    let app_state = Arc::new(AppState {
        es_client: es_client.clone(),
        es_url: es_url.clone(),
        mongo_client: mongo_client.clone(),
        db_name: db_name.clone(),
        db_pool,
    });

    // Initialize ES Index & Sync
    let shows_coll = mongo_client.database(&db_name).collection::<Show>("shows");
    es::init_es_index(&es_client, &es_url).await;
    es::initial_sync(&shows_coll, &es_client, &es_url).await;

    // Start Redis Change Stream Consumer in background
    let state_clone = app_state.clone();
    tokio::spawn(async move {
        stream::watch_redis_stream(state_clone).await;
    });

    // Start gRPC Server
    let grpc_state = app_state.clone();
    let grpc_port = env::var("SEARCH_GRPC_PORT")
        .unwrap_or_else(|_| "50051".into())
        .parse::<u16>()
        .expect("SEARCH_GRPC_PORT must be a valid TCP port");
    let grpc_addr = SocketAddr::from(([0, 0, 0, 0], grpc_port));
    tokio::spawn(async move {
        tracing::info!(%grpc_addr, "Search gRPC server listening");
        tonic::transport::Server::builder()
            .add_service(SearchServiceServer::new(grpc::GrpcSearchService::new(
                grpc_state,
            )))
            .serve(grpc_addr)
            .await
            .expect("Search gRPC server failed");
    });

    let cors = CorsLayer::permissive();
    let app = Router::new()
        .route("/health", get(|| async { "OK" }))
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(app_state);

    let http_port = env::var("SEARCH_HTTP_PORT")
        .unwrap_or_else(|_| "8084".into())
        .parse::<u16>()
        .expect("SEARCH_HTTP_PORT must be a valid TCP port");
    let addr = SocketAddr::from(([0, 0, 0, 0], http_port));
    tracing::info!(%addr, "Search HTTP health server listening");
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
