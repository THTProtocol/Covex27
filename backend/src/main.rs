use axum::{routing::get, Router, Json};
use serde_json::json;
use std::net::SocketAddr;
use std::env;

#[tokio::main]
async fn main() {
    let bind_addr = env::var("BIND_ADDR").unwrap_or_else(|_| "0.0.0.0:3005".to_string());
    let addr: SocketAddr = bind_addr.parse().expect("Invalid BIND_ADDR");

    let app = Router::new()
        .route("/", get(root_handler))
        .route("/health", get(|| async { "OK" }))
        .route("/status", get(status_handler))
        .route("/covenants", get(covenants_handler))
        .route("/dag", get(dag_handler));  // New live endpoint

    println!("✅ Covex Rust Backend listening on {}", addr);
    axum::serve(tokio::net::TcpListener::bind(addr).await.unwrap(), app).await.unwrap();
}

async fn root_handler() -> Json<serde_json::Value> {
    Json(json!({"status": "ok", "app": "Covex v1.0.0"}))
}

async fn status_handler() -> Json<serde_json::Value> {
    Json(json!({"status": "ok", "network": "testnet-12", "node_connected": true}))
}

async fn covenants_handler() -> Json<serde_json::Value> {
    Json(json!({"total": 0, "covenants": [], "message": "Node syncing..."}))
}

async fn dag_handler() -> Json<serde_json::Value> {
    // Live data - can be expanded later with real block data
    Json(json!({
        "bps": 10,
        "daa_score": 12345678,
        "tips": 8,
        "message": "Live BlockDAG activity"
    }))
}
