//! Live event fan-out: a process-wide broadcast channel that pushes indexer
//! and game events to connected WebSocket clients. Senders are non-blocking;
//! if nobody is listening the send is a no-op.

use axum::{
    extract::ws::{Message, WebSocket, WebSocketUpgrade},
    response::IntoResponse,
    routing::get,
    Router,
};
use std::sync::OnceLock;
use tokio::sync::broadcast;

static TX: OnceLock<broadcast::Sender<String>> = OnceLock::new();

fn tx() -> &'static broadcast::Sender<String> {
    TX.get_or_init(|| broadcast::channel::<String>(256).0)
}

/// Publish a JSON event to all connected WebSocket clients. Callable from
/// sync code (indexers hold the DB mutex); never blocks.
pub fn publish(event_type: &str, payload: serde_json::Value) {
    let msg = serde_json::json!({ "type": event_type, "data": payload }).to_string();
    let _ = tx().send(msg);
}

pub fn live_routes() -> Router {
    Router::new().route("/ws", get(ws_handler))
}

async fn ws_handler(ws: WebSocketUpgrade) -> impl IntoResponse {
    ws.on_upgrade(handle_socket)
}

async fn handle_socket(mut socket: WebSocket) {
    let mut rx = tx().subscribe();
    let _ = socket
        .send(Message::Text(
            serde_json::json!({"type": "hello", "data": {"message": "covex live feed"}}).to_string(),
        ))
        .await;
    loop {
        tokio::select! {
            ev = rx.recv() => {
                match ev {
                    Ok(msg) => {
                        if socket.send(Message::Text(msg)).await.is_err() { break; }
                    }
                    Err(broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(_) => break,
                }
            }
            incoming = socket.recv() => {
                match incoming {
                    Some(Ok(Message::Ping(p))) => { let _ = socket.send(Message::Pong(p)).await; }
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Err(_)) => break,
                    _ => {}
                }
            }
        }
    }
}
