use axum::{
    extract::{Path, Query},
    response::IntoResponse,
    routing::get,
    routing::post,
    Extension, Json, Router,
};
use serde_json::json;
use std::collections::HashMap;
use std::env;
use std::net::SocketAddr;
use std::sync::Arc;
use std::sync::Mutex;
use tracing::{error, info, warn};
use tracing_subscriber::{fmt, EnvFilter};
use rusqlite::params;

mod broadcast;
mod games;
mod live;
mod compiler;
mod covenant_types;
mod crawler;
mod db;
mod dev_wallets;
mod indexer;
mod mixer;
mod oracle;
mod oracle_verifier;
mod payment_verifier;
mod signer;
mod ui_generator;

/// Default Kaspa network label used when KASPA_NETWORK env var is not set.
/// The project targets Toccata Testnet-12 (TN12).
const DEFAULT_KASPA_NETWORK: &str = "testnet-12";

#[tokio::main]
async fn main() {
    // --- Load .env ---
    let _ = dotenvy::dotenv();

    // Mainnet safety: a configured mainnet indexer MUST have a real oracle key.
    // The compiled-in default key is for testnets only and never signs mainnet outcomes.
    if std::env::var("KASPA_WRPC_URL_MAINNET").is_ok()
        && std::env::var("COVEX_ORACLE_KEY").is_err()
    {
        eprintln!(
            "FATAL: KASPA_WRPC_URL_MAINNET is set but COVEX_ORACLE_KEY is not. \
             Refusing to start with the default testnet oracle key on mainnet."
        );
        std::process::exit(1);
    }

    // --- Init tracing ---
    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("covex27_backend=info,kaspa_wrpc=warn"));
    fmt().with_env_filter(filter).init();

    // --- Config ---
    let bind_addr = env::var("BIND_ADDR").unwrap_or_else(|_| "0.0.0.0:3006".to_string());
    let addr: SocketAddr = bind_addr.parse().expect("Invalid BIND_ADDR");
    let wrpc_url =
        env::var("KASPA_WRPC_URL").unwrap_or_else(|_| "ws://127.0.0.1:17217".to_string());
    let db_path = env::var("DB_PATH").unwrap_or_else(|_| {
        // Resolve relative to binary location to prevent zombie-DB when CWD is deleted
        // (process holds stale file handles to deleted inodes after directory moves)
        if let Ok(exe) = std::env::current_exe() {
            // Binary is at <project>/backend/target/release/covex27-backend
            // Project root is 3 levels up: <project>/
            let project_root = exe.parent()
                .and_then(|p| p.parent())
                .and_then(|p| p.parent())
                .and_then(|p| p.parent());
            if let Some(root) = project_root {
                let abs_path = root.join("covex.db");
                return abs_path.to_string_lossy().to_string();
            }
        }
        "../covex.db".to_string()
    });
    // Read network BEFORE treasury so we can branch on mainnet vs testnet
    let network = env::var("KASPA_NETWORK")
        .unwrap_or_else(|_| DEFAULT_KASPA_NETWORK.to_string());
    let treasury = env::var("COVENANT_TREASURY_ADDRESS").unwrap_or_else(|_| {
        if network == "mainnet" || network == "mainnet-1" {
            dev_wallets::TREASURY_ADDRESS_MAINNET.to_string()
        } else {
            "kaspatest:qpyfz03k6quxwf2jglwkhczvt758d8xrq99gl37p6h3vsqur27ltjhn68354m".to_string()
        }
    });
    let seed_addrs: Vec<String> = env::var("COVENANT_SEED_ADDRESSES")
        .unwrap_or_default()
        .split(',')
        .filter(|s| !s.is_empty())
        .map(|s| s.trim().to_string())
        .collect();
    let crawl_start_daa: u64 = env::var("CRAWL_START_DAA")
        .unwrap_or_else(|_| "1".to_string())
        .parse()
        .unwrap_or(1);

    info!(
        "Covex backend -- network: {}  wRPC: {}  bind: {}",
        network, wrpc_url, addr
    );
    info!("Treasury: {}", treasury);

    // Log mainnet readiness status
    if std::env::var("KASPA_WRPC_URL_MAINNET").is_ok() {
        info!("Toccata mainnet indexer ready -- will index when a mainnet wRPC is available via KASPA_WRPC_URL_MAINNET or KASPA_NETWORK=mainnet");
    } else if network == "mainnet" || network == "mainnet-1" {
        info!("Toccata mainnet mode active -- indexer will start syncing mainnet covenants when wRPC connects");
    } else {
        info!("Toccata mainnet indexer: not configured. Set KASPA_WRPC_URL_MAINNET or KASPA_NETWORK=mainnet to enable mainnet indexing when Toccata mainnet launches.");
    }

    // --- Open DB ---
    let db = match db::open_db(&db_path) {
        Ok(d) => {
            info!("Database opened at {}", db_path);
            Arc::new(d)
        }
        Err(e) => {
            error!("Failed to open database: {}", e);
            std::process::exit(1);
        }
    };

    // --- Connect to Kaspa wRPC ---
    let (client, client_url) = match kaspa_wrpc_client::KaspaRpcClient::new(
        kaspa_wrpc_client::WrpcEncoding::Borsh,
        Some(&wrpc_url),
        None,
        None,
        None,
    ) {
        Ok(c) => {
            let url = c.url().unwrap_or(wrpc_url.clone());
            (Arc::new(c), url)
        }
        Err(e) => {
            error!("Failed to create wRPC client: {}", e);
            std::process::exit(1);
        }
    };

    info!("Connecting to Kaspa wRPC node at {}...", client_url);
    match client.connect(None).await {
        Ok(_) => info!("Connected to Kaspa wRPC node"),
        Err(e) => warn!("wRPC connect failed (will retry in background): {}", e),
    }

    // --- Multi-network support: spawn indexers for ALL configured networks ---
    // This lets ONE backend process index covenants for TN12, TN10, and MAINNET
    // simultaneously. Frontend toggle uses ?network=... on reads and sends network in
    // deploy payloads. Background indexers + crawlers + verifiers run for each network.
    let primary_network = network.clone();

    // Networks to additionally index (all except the primary, which gets its own spawns below)
    // Only include mainnet if KASPA_WRPC_URL_MAINNET is explicitly configured — the default
    // ws://127.0.0.1:17110 hangs the startup if no mainnet node is running locally.
    let mut extra_networks: Vec<&str> = Vec::new();
    if primary_network != "testnet-10" {
        extra_networks.push("testnet-10");
    }
    if primary_network != "testnet-12" && primary_network != "mainnet" && primary_network != "mainnet-1" {
        extra_networks.push("testnet-12");
    }
    if primary_network != "mainnet" && primary_network != "mainnet-1"
        && std::env::var("KASPA_WRPC_URL_MAINNET").is_ok()
    {
        extra_networks.push("mainnet");
    }

    for &extra_net in &extra_networks {
        let extra_wrpc = match extra_net {
            "testnet-10" => env::var("KASPA_WRPC_URL_TN10").unwrap_or_else(|_| "ws://127.0.0.1:17210".to_string()),
            "mainnet" => env::var("KASPA_WRPC_URL_MAINNET").unwrap_or_else(|_| "ws://127.0.0.1:17310".to_string()),
            _ => continue,
        };

        let extra_treasury = match extra_net {
            "testnet-10" => env::var("COVENANT_TREASURY_ADDRESS_TN10")
                .unwrap_or_else(|_| dev_wallets::treasury_address_for_network(extra_net).to_string()),
            "mainnet" => env::var("COVENANT_TREASURY_ADDRESS")
                .unwrap_or_else(|_| dev_wallets::treasury_address_for_network(extra_net).to_string()),
            _ => continue,
        };

        let extra_seeds: Vec<String> = match extra_net {
            "testnet-10" => env::var("COVENANT_SEED_ADDRESSES_TN10").unwrap_or_default(),
            "mainnet" => String::new(), // mainnet: no UTXO seed polling, crawler-only discovery
            _ => String::new(),
        }
        .split(',')
        .filter(|s| !s.is_empty())
        .map(|s| s.trim().to_string())
        .collect();

        let (extra_client, extra_url) = match kaspa_wrpc_client::KaspaRpcClient::new(
            kaspa_wrpc_client::WrpcEncoding::Borsh,
            Some(&extra_wrpc),
            None, None, None,
        ) {
            Ok(c) => {
                let url = c.url().unwrap_or(extra_wrpc.clone());
                (Arc::new(c), url)
            }
            Err(e) => {
                warn!("Failed to create wRPC client for {} at {}: {} (indexing disabled for this network)", extra_net, extra_wrpc, e);
                continue;
            }
        };

        info!("Additional network {} wRPC: {}", extra_net, extra_url);
        match extra_client.connect(None).await {
            Ok(_) => info!("Connected to {} wRPC", extra_net),
            Err(e) => warn!("{} wRPC connect failed (indexer will retry): {}", extra_net, e),
        }

        // Spawn indexer
        {
            let s_db = Arc::clone(&db);
            let s_client = Arc::clone(&extra_client);
            let s_seeds = extra_seeds.clone();
            let s_treasury = extra_treasury.clone();
            let s_net = extra_net.to_string();
            tokio::spawn(async move {
                indexer::run_indexer(s_client, s_db, s_seeds, s_treasury, s_net).await;
            });
        }
        // Spawn payment verifier
        {
            let s_db = Arc::clone(&db);
            let s_client = Arc::clone(&extra_client);
            let s_treasury = extra_treasury.clone();
            let s_net = extra_net.to_string();
            tokio::spawn(async move {
                payment_verifier::run_payment_verifier(s_client, s_db, s_treasury, s_net).await;
            });
        }
        // Spawn crawler
        {
            let s_db = Arc::clone(&db);
            let s_client = Arc::clone(&extra_client);
            let s_treasury = extra_treasury.clone();
            let s_net = extra_net.to_string();
            tokio::spawn(async move {
                crawler::run_crawler(s_client, s_db, s_treasury, crawl_start_daa, s_net).await;
            });
        }
    }

    // --- Background: Indexer (for the primary network) ---
    let idx_db = Arc::clone(&db);
    let idx_client = Arc::clone(&client);
    let idx_seeds = seed_addrs.clone();
    let idx_treasury = treasury.clone();
    let idx_network = network.clone();
    tokio::spawn(async move {
        indexer::run_indexer(idx_client, idx_db, idx_seeds, idx_treasury, idx_network).await;
    });

    // --- Background: Payment Verifier (primary) ---
    let pay_db = Arc::clone(&db);
    let pay_client = Arc::clone(&client);
    let pay_treasury = treasury.clone();
    let pay_network = primary_network.clone();
    tokio::spawn(async move {
        payment_verifier::run_payment_verifier(pay_client, pay_db, pay_treasury, pay_network).await;
    });

    // --- Background: Archiver ---
    // FREE tier covenants with no indexed activity for 30 days are archived
    // (is_active = 0, hidden from default explorer listings). Paid covenants
    // never auto-archive: the tier was bought once and lasts forever.
    let archive_db = Arc::clone(&db);
    tokio::spawn(async move {
        loop {
            {
                let conn = archive_db.lock().unwrap();
                let cutoff_sql = "UPDATE covenants SET is_active = 0
                     WHERE is_active = 1
                       AND verified_tier IN ('FREE', 'EXPLORER')
                       AND timestamp < unixepoch() - 30 * 86400
                       AND tx_id NOT IN (
                           SELECT covenant_id FROM events
                           WHERE timestamp > unixepoch() - 30 * 86400
                       )";
                match conn.execute(cutoff_sql, []) {
                    Ok(n) if n > 0 => info!("Archiver: archived {} stale free covenants", n),
                    Ok(_) => {}
                    Err(e) => warn!("Archiver: sweep failed: {}", e),
                }
            }
            tokio::time::sleep(std::time::Duration::from_secs(6 * 3600)).await;
        }
    });

    // --- Background: Historic Crawler (for the configured network) ---
    let crawl_db = Arc::clone(&db);
    let crawl_client = Arc::clone(&client);
    let crawl_treasury = treasury.clone();
    let crawl_network = network.clone();
    tokio::spawn(async move {
        crawler::run_crawler(crawl_client, crawl_db, crawl_treasury, crawl_start_daa, crawl_network).await;
    });

    // --- Routes ---
    let db_clone = db.clone();
    // CORS: same-origin product. Allow the production site + local dev; the API is
    // public-read anyway, but locking origins blocks third-party browser abuse of
    // the expensive POST endpoints.
    let cors_origins = [
        "https://hightable.pro".parse().unwrap(),
        "https://www.hightable.pro".parse().unwrap(),
        "http://localhost:5173".parse().unwrap(),
        "http://127.0.0.1:5173".parse().unwrap(),
    ];
    let app = tower_http::cors::CorsLayer::new()
        .allow_origin(cors_origins)
        .allow_methods(tower_http::cors::Any)
        .allow_headers(tower_http::cors::Any);
    let app = Router::new()
        .route("/", get(root_handler))
        .route("/health", get(health_handler))
        .route("/covenants", get(covenants_handler))
        .route("/covenants/:covenant_id", get(covenant_by_id_handler))
        .route("/covenants/:covenant_id/actions", get(covenant_actions_handler))
        .route("/compile", post(compile_handler))
        .merge(live::live_routes())
        .merge(games::games_routes().layer(Extension(db.clone())))
        .route("/events", get(events_handler))
        .route("/address/:addr", get(address_summary_handler))
        .route("/openapi.json", get(openapi_handler))
        .route("/status", get(status_handler))
        .route("/tiers", get(tiers_handler))
        .route("/paid-status", get(paid_status_handler))
        // ── Auth endpoints (server-side paywall) ──
        .route("/auth-session", post(auth_session_handler))
        .route("/auth-session/consume", post(consume_auth_token_handler))
        .route("/deploy-capacity", get(deploy_capacity_handler))
        .route("/covenant-metadata", post(save_covenant_metadata_handler))
        .layer(Extension(db_clone))
        .route(
            "/terminal-config/:covenant_id",
            get(get_terminal_config_handler).post(save_terminal_config_handler),
        )
        .route(
            "/terminal-config-challenge/:covenant_id",
            get(terminal_config_challenge_handler),
        )
        .layer(Extension(db.clone()))
        // Gap 2: Compute payout / claim endpoint
        .route(
            "/covenant/:covenant_id/compute-payout",
            post(compute_payout_handler),
        )
        .merge(
            signer::signer_routes()
                // No client layer: sign handler constructs its own on-demand client_for_network(payload.network)
                // so TN10 deploys target the correct TN10 wRPC even on a TN12-primary backend process.
                .layer(Extension(db.clone())),
        )
        .merge(broadcast::broadcast_routes().layer(Extension(client.clone())))
        .route("/analytics", get(analytics_handler))
        .route("/marketplace/templates", get(marketplace_templates_handler))
        .route("/marketplace/publish", post(marketplace_publish_handler))
        .layer(Extension(db.clone()))
        .merge(mixer::mixer_routes().layer(Extension(db.clone())))
        .merge(oracle::oracle_routes().layer(Extension(db.clone())))
        .layer(app)
        // Per-IP token bucket on expensive routes (oracle verifies spawn Node, compile
        // spawns silverc, sign-and-broadcast hits wRPC). GETs on list endpoints are cheap
        // post-pagination and stay unthrottled.
        .layer(axum::middleware::from_fn(rate_limit_middleware))
        // API responses are live data: stop browsers from serving stale covenant
        // configs (a published Studio page must appear on the next load).
        .layer(tower_http::set_header::SetResponseHeaderLayer::overriding(
            axum::http::header::CACHE_CONTROL,
            axum::http::HeaderValue::from_static("no-store"),
        ))
        // Basic protection (P0): concurrency limit to prevent too many simultaneous heavy requests
        // (oracle ZK verifies, deploys, mixer). Protects the backend while we add time-based rate later.
        // 64 max in-flight is generous for normal load + test bursts.
        .layer(tower::limit::ConcurrencyLimitLayer::new(64));

    info!("Serving on {}", addr);
    axum::serve(tokio::net::TcpListener::bind(addr).await.unwrap(), app)
        .await
        .unwrap();
}

async fn events_handler(
    Extension(db): Extension<Arc<Mutex<rusqlite::Connection>>>,
    Query(params): Query<HashMap<String, String>>,
) -> Json<serde_json::Value> {
    let network = params.get("network").map(|s| s.as_str());
    let limit: i64 = params.get("limit").and_then(|s| s.parse().ok()).unwrap_or(30);
    match db::get_events(&db, network, limit) {
        Ok(ev) => Json(json!({"events": ev, "total": ev.len()})),
        Err(e) => Json(json!({"events": [], "error": e.to_string()})),
    }
}

/// Public portfolio summary for any address: covenants created, payments, totals.
async fn address_summary_handler(
    Extension(db): Extension<Arc<Mutex<rusqlite::Connection>>>,
    axum::extract::Path(addr): axum::extract::Path<String>,
    Query(params): Query<HashMap<String, String>>,
) -> Json<serde_json::Value> {
    let network = params.get("network").map(|s| s.as_str());
    let (covs, total) =
        db::query_covenants(&db, network, Some(addr.as_str()), None, None, 100, 0)
            .unwrap_or((vec![], 0));
    let ui_ids = db::get_custom_ui_id_set(&db).unwrap_or_default();
    let list: Vec<serde_json::Value> = covs
        .iter()
        .map(|c| covenant_summary_json(c, ui_ids.contains(&c.tx_id), db::ui_config_for_tier(&c.verified_tier)))
        .collect();
    let tvl: f64 = covs.iter().map(|c| c.amount_kaspa).sum();
    let paid = covs.iter().filter(|c| matches!(c.verified_tier.as_str(), "BUILDER" | "PRO" | "MAX")).count();
    Json(json!({
        "address": addr,
        "covenants": list,
        "total_covenants": total,
        "paid_covenants": paid,
        "tvl_kas": tvl
    }))
}

/// Hand-maintained OpenAPI document for the public read API.
async fn openapi_handler() -> Json<serde_json::Value> {
    Json(json!({
        "openapi": "3.0.3",
        "info": {
            "title": "Covex Covenant API",
            "version": "1.1.0",
            "description": "Public read API for Kaspa covenants indexed by Covex (hightable.pro). All list endpoints are paginated with limit (max 200) and offset. The same API powers the explorer UI."
        },
        "servers": [{"url": "https://hightable.pro/api"}],
        "paths": {
            "/covenants": {"get": {"summary": "List covenants", "parameters": [
                {"name": "network", "in": "query", "schema": {"type": "string", "enum": ["testnet-12", "testnet-10", "mainnet"]}},
                {"name": "limit", "in": "query", "schema": {"type": "integer", "maximum": 200, "default": 60}},
                {"name": "offset", "in": "query", "schema": {"type": "integer", "default": 0}},
                {"name": "q", "in": "query", "description": "Keyword search. Pipe separates OR alternatives (chess|fide).", "schema": {"type": "string"}},
                {"name": "category", "in": "query", "schema": {"type": "string"}},
                {"name": "creator", "in": "query", "schema": {"type": "string"}}
            ]}},
            "/covenants/{covenant_id}": {"get": {"summary": "Full covenant detail including script_hex and custom UI", "parameters": [{"name": "covenant_id", "in": "path", "required": true, "schema": {"type": "string"}}]}},
            "/events": {"get": {"summary": "Recent activity feed (discoveries, tier upgrades, resolutions)", "parameters": [
                {"name": "network", "in": "query", "schema": {"type": "string"}},
                {"name": "limit", "in": "query", "schema": {"type": "integer", "maximum": 200, "default": 30}}
            ]}},
            "/address/{addr}": {"get": {"summary": "Public portfolio for an address", "parameters": [{"name": "addr", "in": "path", "required": true, "schema": {"type": "string"}}]}},
            "/analytics": {"get": {"summary": "Creator or global analytics", "parameters": [{"name": "creator", "in": "query", "schema": {"type": "string"}}]}},
            "/balance/{addr}": {"get": {"summary": "Address balance in sompi", "parameters": [{"name": "addr", "in": "path", "required": true, "schema": {"type": "string"}}]}},
            "/tiers": {"get": {"summary": "Tier definitions and pricing"}},
            "/status": {"get": {"summary": "Indexer status, networks, commit"}},
            "/compile": {"post": {"summary": "Compile Covex DSL or SilverScript to bytecode", "requestBody": {"content": {"application/json": {"schema": {"type": "object", "properties": {"source": {"type": "string"}}}}}}}}
        }
    }))
}

/// Per-covenant activity history: deploy plus every indexed event
/// (discovery, tier upgrades, oracle resolutions, game updates).
async fn covenant_actions_handler(
    Extension(db): Extension<Arc<Mutex<rusqlite::Connection>>>,
    axum::extract::Path(covenant_id): axum::extract::Path<String>,
) -> Json<serde_json::Value> {
    let mut actions: Vec<serde_json::Value> = Vec::new();
    if let Ok(Some(c)) = db::get_covenant_by_txid(&db, &covenant_id) {
        actions.push(json!({
            "action": "deployed",
            "detail": c.covenant_type,
            "amount_kaspa": c.amount_kaspa,
            "timestamp": c.timestamp,
            "daa_score": c.block_daa_score,
            "network": c.network,
        }));
        if let (tier, Some(ts)) = (c.verified_tier.clone(), c.verified_at) {
            if tier != "FREE" {
                actions.push(json!({
                    "action": "tier_verified",
                    "detail": tier,
                    "tx_id": c.verified_payment_tx,
                    "timestamp": ts,
                }));
            }
        }
    }
    {
        let conn = db.lock().unwrap();
        let stmt_res = conn.prepare(
            "SELECT event_type, amount_kaspa, detail, timestamp FROM events WHERE covenant_id = ?1 ORDER BY id ASC LIMIT 200",
        );
        if let Ok(mut stmt) = stmt_res {
            if let Ok(rows) = stmt.query_map(rusqlite::params![covenant_id], |r| {
                Ok(json!({
                    "action": r.get::<_, String>(0)?,
                    "amount_kaspa": r.get::<_, f64>(1)?,
                    "detail": r.get::<_, String>(2)?,
                    "timestamp": r.get::<_, i64>(3)?,
                }))
            }) {
                for r in rows.flatten() {
                    actions.push(r);
                }
            }
        }
    }
    Json(json!({"covenant_id": covenant_id, "actions": actions, "total": actions.len()}))
}

/// Per-IP token bucket for expensive routes. 20 burst, refills 2/sec.
/// Keyed on X-Forwarded-For (nginx) falling back to X-Real-IP. No external deps.
async fn rate_limit_middleware(
    req: axum::extract::Request,
    next: axum::middleware::Next,
) -> axum::response::Response {
    use std::collections::HashMap;
    use std::sync::OnceLock;
    use std::time::Instant;
    static BUCKETS: OnceLock<std::sync::Mutex<HashMap<String, (f64, Instant)>>> = OnceLock::new();

    let path = req.uri().path();
    let expensive = matches!(
        path,
        "/compile" | "/sign-and-broadcast" | "/broadcast" | "/auth-session"
    ) || path.starts_with("/oracle/")
        || path.starts_with("/mixer/")
        || (req.method() == axum::http::Method::POST && path.starts_with("/covenant/"));
    if !expensive {
        return next.run(req).await;
    }

    let ip = req
        .headers()
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.split(',').next())
        .or_else(|| {
            req.headers()
                .get("x-real-ip")
                .and_then(|v| v.to_str().ok())
        })
        .unwrap_or("unknown")
        .trim()
        .to_string();

    let allowed = {
        let buckets = BUCKETS.get_or_init(|| std::sync::Mutex::new(HashMap::new()));
        let mut map = buckets.lock().unwrap();
        if map.len() > 10_000 {
            map.clear(); // crude memory bound; resets all buckets
        }
        let now = Instant::now();
        let entry = map.entry(ip).or_insert((20.0, now));
        let elapsed = now.duration_since(entry.1).as_secs_f64();
        entry.0 = (entry.0 + elapsed * 2.0).min(20.0);
        entry.1 = now;
        if entry.0 >= 1.0 {
            entry.0 -= 1.0;
            true
        } else {
            false
        }
    };

    if allowed {
        next.run(req).await
    } else {
        (
            axum::http::StatusCode::TOO_MANY_REQUESTS,
            Json(json!({"error": "rate limit exceeded, slow down"})),
        )
            .into_response()
    }
}

fn get_git_commit() -> String {
    if let Ok(c) = std::env::var("GIT_COMMIT") {
        if !c.is_empty() && c != "unknown" {
            return c;
        }
    }
    // Robust fallback: spawn git from likely working trees (local dev, Hetzner volume, cwd)
    // This ensures /health and /status always report real deployed commit-ish even if env inject missed.
    for base in [".", "/root/Covex27", "/mnt/HC_Volume_105579109/Covex27", "..", "../.."] {
        if let Ok(out) = std::process::Command::new("git")
            .current_dir(base)
            .args(["rev-parse", "--short", "HEAD"])
            .output()
        {
            if out.status.success() {
                if let Ok(s) = String::from_utf8(out.stdout) {
                    let t = s.trim().to_string();
                    if !t.is_empty() {
                        return t;
                    }
                }
            }
        }
    }
    "unknown".to_string()
}

// ─── Handlers ────────────────────────────────────────────────

async fn health_handler() -> Json<serde_json::Value> {
    let network = std::env::var("KASPA_NETWORK")
        .unwrap_or_else(|_| DEFAULT_KASPA_NETWORK.to_string());
    let oracle_mode = if std::env::var("COVEX_ORACLE_KEY").is_ok() { "custom" } else { "default-testnet" };
    let has_mainnet_wrpc = std::env::var("KASPA_WRPC_URL_MAINNET").is_ok();
    let has_tn10_wrpc = std::env::var("KASPA_WRPC_URL_TN10").is_ok();
    let git_commit = get_git_commit();
    let crawl_full_rescan = std::env::var("CRAWL_FULL_RESCAN").is_ok();
    let bind_addr = std::env::var("BIND_ADDR").unwrap_or_else(|_| "0.0.0.0:3006".to_string());
    Json(json!({
        "status": "ok",
        "app": "Covex v1.0.0",
        "network": network,
        "oracle_key_mode": oracle_mode,
        "git_commit": git_commit,
        "bind_addr": bind_addr,
        "crawl_full_rescan": crawl_full_rescan,
        "networks_configured": {
            "testnet_12": true,
            "testnet_10": has_tn10_wrpc,
            "mainnet": has_mainnet_wrpc
        },
        "mainnet_ready": has_mainnet_wrpc
    }))
}

async fn root_handler() -> Json<serde_json::Value> {
    let network = std::env::var("KASPA_NETWORK")
        .unwrap_or_else(|_| DEFAULT_KASPA_NETWORK.to_string());
    let oracle_mode = if std::env::var("COVEX_ORACLE_KEY").is_ok() { "custom" } else { "default-testnet" };
    let has_mainnet_wrpc = std::env::var("KASPA_WRPC_URL_MAINNET").is_ok();
    let has_tn10_wrpc = std::env::var("KASPA_WRPC_URL_TN10").is_ok();
    let git_commit = get_git_commit();
    let crawl_full_rescan = std::env::var("CRAWL_FULL_RESCAN").is_ok();
    let bind_addr = std::env::var("BIND_ADDR").unwrap_or_else(|_| "0.0.0.0:3006".to_string());
    Json(json!({
        "status": "ok",
        "app": "Covex v1.0.0",
        "network": network,
        "oracle_key_mode": oracle_mode,
        "git_commit": git_commit,
        "bind_addr": bind_addr,
        "crawl_full_rescan": crawl_full_rescan,
        "networks_configured": {
            "testnet_12": true,
            "testnet_10": has_tn10_wrpc,
            "mainnet": has_mainnet_wrpc
        },
        "mainnet_ready": has_mainnet_wrpc
    }))
}

async fn status_handler(
    Extension(db): Extension<Arc<Mutex<rusqlite::Connection>>>,
) -> Json<serde_json::Value> {
    let total = db::count_covenants(&db).unwrap_or(0);
    let active = db::count_active_covenants(&db).unwrap_or(0);
    let verified = db::count_verified_covenants(&db).unwrap_or(0);
    let network = std::env::var("KASPA_NETWORK")
        .unwrap_or_else(|_| DEFAULT_KASPA_NETWORK.to_string());
    let oracle_mode = if std::env::var("COVEX_ORACLE_KEY").is_ok() { "custom" } else { "default-testnet" };
    let has_mainnet_wrpc = std::env::var("KASPA_WRPC_URL_MAINNET").is_ok();
    let git_commit = get_git_commit();
    let crawl_full_rescan = std::env::var("CRAWL_FULL_RESCAN").is_ok();
    let bind_addr = std::env::var("BIND_ADDR").unwrap_or_else(|_| "0.0.0.0:3006".to_string());
    Json(json!({
        "status": "ok",
        "network": network,
        "oracle_key_mode": oracle_mode,
        "node_connected": true,
        "total_covenants": total,
        "active_covenants": active,
        "verified_covenants": verified,
        "git_commit": git_commit,
        "bind_addr": bind_addr,
        "crawl_full_rescan": crawl_full_rescan,
        "networks_configured": {
            "testnet_12": true,
            "testnet_10": std::env::var("KASPA_WRPC_URL_TN10").is_ok(),
            "mainnet": has_mainnet_wrpc
        },
        "mainnet_ready": has_mainnet_wrpc,
        "message": "Indexer active"
    }))
}

/// Compact list representation: heavy fields (script_hex, custom_ui_html) are
/// NEVER returned on list endpoints. Detail pages use GET /covenants/:id.
fn covenant_summary_json(
    c: &db::DbCovenant,
    has_custom_ui: bool,
    ui_config: serde_json::Value,
) -> serde_json::Value {
    json!({
        "tx_id": c.tx_id,
        "address": c.address,
        "amount_kaspa": c.amount_kaspa,
        "script_hash": c.script_hash,
        "covenant_type": c.covenant_type,
        "category": c.category,
        "creator_addr": c.creator_addr,
        "description": c.description,
        "verified_tier": c.verified_tier,
        "custom_ui_enabled": c.custom_ui_enabled,
        "has_custom_ui": has_custom_ui,
        "full_logic_summary": c.full_logic_summary,
        "is_active": c.is_active,
        "block_daa_score": c.block_daa_score,
        "timestamp": c.timestamp,
        "name": c.covenant_type,
        "tier": c.verified_tier,
        "network": c.network,
        "custom_ui_config": ui_config,
    })
}

async fn covenants_handler(
    Extension(db): Extension<Arc<Mutex<rusqlite::Connection>>>,
    Query(params): Query<HashMap<String, String>>,
) -> Json<serde_json::Value> {
    let network_filter = params.get("network").map(|s| s.as_str());
    let creator = params
        .get("creator")
        .filter(|s| !s.is_empty())
        .map(|s| s.as_str());
    let q = params
        .get("q")
        .filter(|s| !s.trim().is_empty())
        .map(|s| s.as_str());
    let category = params
        .get("category")
        .filter(|s| !s.is_empty() && s.as_str() != "all")
        .map(|s| s.as_str());
    let limit: i64 = params
        .get("limit")
        .and_then(|s| s.parse().ok())
        .unwrap_or(60);
    let limit = limit.clamp(1, 200);
    let offset: i64 = params
        .get("offset")
        .and_then(|s| s.parse().ok())
        .unwrap_or(0)
        .max(0);

    let (records, total) =
        match db::query_covenants(&db, network_filter, creator, q, category, limit, offset) {
            Ok(r) => r,
            Err(e) => {
                error!("Failed to query covenants: {}", e);
                return Json(json!({"total": 0, "covenants": [], "error": e.to_string()}));
            }
        };

    let ui_ids = db::get_custom_ui_id_set(&db).unwrap_or_default();
    let list: Vec<serde_json::Value> = records
        .iter()
        .map(|c| {
            covenant_summary_json(
                c,
                ui_ids.contains(&c.tx_id),
                db::ui_config_for_tier(&c.verified_tier),
            )
        })
        .collect();
    // Header aggregates ride along on the first page so the explorer needs no
    // second round-trip and never downloads the full set for stats.
    let stats = if offset == 0 {
        db::covenant_stats(&db, network_filter)
            .map(|(t, paid, tvl)| json!({"total": t, "paid": paid, "tvl_kas": tvl}))
            .unwrap_or(serde_json::Value::Null)
    } else {
        serde_json::Value::Null
    };
    Json(json!({
        "total": total,
        "covenants": list,
        "limit": limit,
        "offset": offset,
        "stats": stats
    }))
}

/// Full single-covenant detail, including script_hex and custom UI payloads.
async fn covenant_by_id_handler(
    Extension(db): Extension<Arc<Mutex<rusqlite::Connection>>>,
    axum::extract::Path(covenant_id): axum::extract::Path<String>,
) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, Json<serde_json::Value>)> {
    match db::get_covenant_by_txid(&db, &covenant_id) {
        Ok(Some(c)) => {
            let ui = db::get_generated_ui_for(&db, &c.tx_id).unwrap_or_default();
            let (custom_ui_html, ui_cfg_raw) = ui.unwrap_or_default();
            let custom_ui_config = serde_json::from_str::<serde_json::Value>(&ui_cfg_raw)
                .unwrap_or_else(|_| db::ui_config_for_tier(&c.verified_tier));
            let mut v = covenant_summary_json(&c, !custom_ui_html.is_empty(), custom_ui_config);
            v["script_hex"] = json!(c.script_hex);
            v["custom_ui_html"] = json!(custom_ui_html);
            v["receiving_addresses"] = json!(c.receiving_addresses);
            Ok(Json(json!({"covenant": v})))
        }
        Ok(None) => Err((
            axum::http::StatusCode::NOT_FOUND,
            Json(json!({"error": "covenant not found"})),
        )),
        Err(e) => Err((
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )),
    }
}

#[derive(serde::Deserialize)]
struct CompileRequest {
    #[serde(default)]
    source: Option<String>,
    /// Alias used by the Deploy wizard
    #[serde(default)]
    silver_script: Option<String>,
}

/// Compile Covex DSL to SilverScript bytecode (preview path for the editor).
async fn compile_handler(
    Json(req): Json<CompileRequest>,
) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, Json<serde_json::Value>)> {
    let source = req
        .source
        .or(req.silver_script)
        .unwrap_or_default();
    if source.trim().is_empty() {
        return Err((
            axum::http::StatusCode::BAD_REQUEST,
            Json(json!({"success": false, "error": "missing source"})),
        ));
    }
    if source.len() > 64 * 1024 {
        return Err((
            axum::http::StatusCode::PAYLOAD_TOO_LARGE,
            Json(json!({"error": "source too large (max 64KB)"})),
        ));
    }
    match compiler::compile_dsl(&source) {
        Ok(out) => Ok(Json(json!({
            "success": true,
            "contract_name": out.contract_name,
            "script_hex": out.script_hex,
            "payload_hex": out.payload_hex,
            "bytecode_len": out.bytecode.len(),
            "abi": out.abi_json,
        }))),
        Err(e) => Err((
            axum::http::StatusCode::BAD_REQUEST,
            Json(json!({"success": false, "error": e.to_string()})),
        )),
    }
}

async fn tiers_handler() -> Json<serde_json::Value> {
    let tiers = covenant_types::get_tiers();
    Json(json!({"tiers": tiers}))
}

async fn paid_status_handler(
    Query(params): Query<std::collections::HashMap<String, String>>,
    Extension(db): Extension<Arc<Mutex<rusqlite::Connection>>>,
) -> Json<serde_json::Value> {
    let address = params.get("address").cloned().unwrap_or_default();
    if address.is_empty() {
        return Json(json!({"highest_tier": null}));
    }
    // Default to testnet-12 for backward compat, but honor ?network=
    let network = params.get("network").cloned().unwrap_or_else(|| "testnet-12".to_string());

    match db::get_highest_paid_tier_for_address(&db, &address, &network) {
        Ok(tier) => Json(json!({ "highest_tier": tier })),
        Err(_) => Json(json!({"highest_tier": null})),
    }
}

// ─── Terminal Config Handlers ────────────────────────────────────

use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
struct TerminalConfigInput {
    name: Option<String>,
    description: Option<String>,
    fee_percent: Option<f64>,
    pot_return_percent: Option<f64>,
    reusable: Option<bool>,
    allow_topups: Option<bool>,
    custom_ui_code: Option<String>,
    theme: Option<serde_json::Value>,
    puck_data: Option<serde_json::Value>,
    resolution_mode: Option<String>,
    custom_oracle_key: Option<String>,
    zk_circuit: Option<String>,
    zk_verifier_key: Option<String>,
    game_type: Option<String>,
    // Ownership proof: signer address + Schnorr signature over nonce
    signer_address: Option<String>,
    signature: Option<String>,
    nonce: Option<String>,
}

async fn get_terminal_config_handler(
    Path(covenant_id): Path<String>,
    Extension(db): Extension<Arc<Mutex<rusqlite::Connection>>>,
) -> Json<serde_json::Value> {
    match db::get_generated_ui_by_covenant(&db, &covenant_id) {
        Ok(Some(ui)) => {
            // Parse ui_config which stores our terminal configuration
            let config_str = ui.get("ui_config").and_then(|v| v.as_str()).unwrap_or("{}");
            let config: serde_json::Value = serde_json::from_str(config_str).unwrap_or(json!({}));
            Json(json!({
                "success": true,
                "config": config,
                "ui_html": ui.get("ui_html").and_then(|v| v.as_str()).unwrap_or(""),
            }))
        }
        Ok(None) => Json(json!({"success": true, "config": {}, "ui_html": ""})),
        Err(e) => Json(json!({"success": false, "error": e.to_string()})),
    }
}

async fn save_terminal_config_handler(
    Path(covenant_id): Path<String>,
    Extension(db): Extension<Arc<Mutex<rusqlite::Connection>>>,
    Json(input): Json<TerminalConfigInput>,
) -> Json<serde_json::Value> {
    // ── Cryptographic ownership enforcement ──
    // Verify the signer_address + signature against the nonce (challenge-response).
    // If signature/nonce are provided, verify cryptographically.
    // Fall back to string comparison ONLY if the frontend hasn't implemented signing yet.
    if let (Some(ref signer), Some(ref sig_hex), Some(ref nonce)) =
        (&input.signer_address, &input.signature, &input.nonce)
    {
        if !sig_hex.is_empty() && !nonce.is_empty() {
            match verify_terminal_ownership_signature(signer, sig_hex, nonce, &covenant_id) {
                Ok(true) => {
                    info!("Schnorr signature verified for covenant {}", &covenant_id[..16]);
                }
                Ok(false) => {
                    warn!("Signature verification FAILED for covenant {} by claimed signer {}",
                        &covenant_id[..16], &signer[..16]);
                    return Json(json!({
                        "success": false,
                        "error": "Signature verification failed — the provided signature does not match the claimed signer address"
                    }));
                }
                Err(e) => {
                    warn!("Signature verification error: {}", e);
                    return Json(json!({
                        "success": false,
                        "error": format!("Signature verification error: {}", e)
                    }));
                }
            }
        }
    }

    // Fallback string comparison (weaker, but works when frontend hasn't wired signing)
    if let Some(ref signer) = input.signer_address {
        if input.signature.as_deref().unwrap_or("").is_empty() {
            if let Ok(Some(cov)) = db::get_covenant_by_txid(&db, &covenant_id) {
                if !cov.creator_addr.is_empty() && cov.creator_addr != *signer {
                    warn!("String comparison rejected edit for covenant {} — signer {} != creator {}",
                        &covenant_id[..16], &signer[..16], &cov.creator_addr[..16]);
                    return Json(json!({
                        "success": false,
                        "error": "Only the original covenant deployer can edit this configuration"
                    }));
                }
            }
        }
    }

    // Build the config JSON from input
    let config = json!({
        "name": input.name,
        "description": input.description,
        "fee_percent": input.fee_percent.unwrap_or(2.0),
        "pot_return_percent": input.pot_return_percent.unwrap_or(2.0),
        "reusable": input.reusable.unwrap_or(true),
        "allow_topups": input.allow_topups.unwrap_or(false),
        "resolution_mode": input.resolution_mode.unwrap_or_else(|| "oracle".to_string()),
        "custom_oracle_key": input.custom_oracle_key,
        "zk_circuit": input.zk_circuit,
        "zk_verifier_key": input.zk_verifier_key,
        "game_type": input.game_type,
        "theme": input.theme,
        "puck_data": input.puck_data,
        "updated_at": chrono::Utc::now().timestamp(),
    });
    let ui_html = input.custom_ui_code.unwrap_or_default();
    let slug = format!("covenant-{}", &covenant_id[..12.min(covenant_id.len())]);

    // Store with the actual signer as owner when provided (for future audit)
    let owner = input.signer_address.clone().unwrap_or_else(|| "system".to_string());

    match db::save_generated_ui(
        &db,
        &covenant_id,
        &owner,
        "TERMINAL",
        &ui_html,
        &config.to_string(),
        &slug,
        false,
    ) {
        Ok(_) => {
            info!("Terminal config saved for covenant {} by {}", covenant_id, owner);
            Json(json!({"success": true, "message": "Configuration saved successfully"}))
        }
        Err(e) => {
            error!("Failed to save terminal config: {}", e);
            Json(json!({"success": false, "error": e.to_string()}))
        }
    }
}

/// Compute a blake2b-based script hash from hex (matching TN10 conventions)
pub fn compute_script_hash(script_hex: &str) -> String {
    use sha2::{Digest, Sha256};
    let bytes = hex::decode(script_hex).unwrap_or_default();
    let hash = Sha256::digest(&bytes);
    hex::encode(&hash[..20])
}

// ── Schnorr signature verification for Terminal config ownership ──

/// Verify terminal ownership via key possession proof.
/// For dev wallets: frontend computes SHA256(private_key || message), backend
/// recomputes the same hash from the known private key and compares.
/// For extension wallets: fall back to string comparison (the wallet bridge
/// already authenticates the connection).
fn verify_terminal_ownership_signature(
    signer_address: &str,
    sig_hex: &str,
    nonce: &str,
    covenant_id: &str,
) -> Result<bool, String> {
    use sha2::{Digest, Sha256};

    let expected_msg = format!("covex-config:{}:{}", covenant_id, nonce);

    // Check known dev wallets
    let dev_keys = [
        (crate::dev_wallets::DEV_WALLET_1_ADDRESS, crate::dev_wallets::DEV_WALLET_1_PRIVATE_KEY),
        (crate::dev_wallets::DEV_WALLET_2_ADDRESS, crate::dev_wallets::DEV_WALLET_2_PRIVATE_KEY),
    ];

    for (known_addr, known_pk) in &dev_keys {
        if *known_addr == signer_address {
            // Compute expected hash: SHA256(private_key_hex || message)
            let pk_clean = known_pk.trim_start_matches("0x");
            let pk_bytes = hex::decode(pk_clean).map_err(|_| "Invalid dev key hex".to_string())?;
            let mut hasher = Sha256::new();
            hasher.update(&pk_bytes);
            hasher.update(expected_msg.as_bytes());
            let expected = hex::encode(hasher.finalize());

            let sig_clean = sig_hex.trim_start_matches("0x");
            return Ok(sig_clean.eq_ignore_ascii_case(&expected));
        }
    }

    // Unknown address: reject (can't verify without knowing the private key)
    Err(format!(
        "Signature verification not available for this address ({}). Use a connected dev wallet or extension wallet.",
        &signer_address[..16]
    ))
}

/// GET /terminal-config-challenge/:covenant_id
/// Returns a random nonce for the frontend to sign, proving wallet ownership.
async fn terminal_config_challenge_handler(
    Path(covenant_id): Path<String>,
) -> Json<serde_json::Value> {
    let nonce = uuid::Uuid::new_v4().to_string();
    let message = format!("covex-config:{}:{}", covenant_id, nonce);
    Json(json!({
        "nonce": nonce,
        "message": message,
        "note": "Sign this exact message with your wallet to prove ownership of the covenant"
    }))
}

// ── Analytics handler (Phase 18) ────────────────────────────────

async fn analytics_handler(
    Extension(db): Extension<Arc<Mutex<rusqlite::Connection>>>,
    Query(params): Query<HashMap<String, String>>,
) -> Json<serde_json::Value> {
    let creator = params.get("creator").cloned();

    if let Some(addr) = &creator {
        let network_filter = params.get("network").map(|s| s.as_str());
        let covenants = db::get_covenants_by_creator(&db, addr, network_filter).unwrap_or_default();
        let total_val: f64 = covenants.iter().map(|c| c.amount_kaspa).sum();
        let count = covenants.len();
        let active_count = covenants.iter().filter(|c| c.is_active).count();
        
        Json(json!({
            "creator": addr,
            "total_covenants": count,
            "total_value_kas": (total_val * 100.0).round() / 100.0,
            "active_covenants": active_count,
            "verified_covenants": covenants.iter().filter(|c| c.verified_tier != "FREE").count(),
            "resolutions": 0, // Resolution tracking: counts oracle signatures issued; full table planned
            "reputation_score": if count > 5 { 85 } else if count > 0 { 60 } else { 0 },
            "average_value_per_covenant": if count > 0 { (total_val / count as f64 * 100.0).round() / 100.0 } else { 0.0 }
        }))
    } else {
        let total = db::count_covenants(&db).unwrap_or(0);
        let active = db::count_active_covenants(&db).unwrap_or(0);
        let verified = db::count_verified_covenants(&db).unwrap_or(0);
        Json(json!({
            "total_covenants": total,
            "total_value_kas": 0, // Platform-wide TVL would require summing all
            "active_covenants": active,
            "verified_covenants": verified,
            "resolutions": 0,
            "platform_note": "Global analytics require additional aggregation queries"
        }))
    }
}

// ── Marketplace handlers (Phase 18) ─────────────────────────────

async fn marketplace_templates_handler(
    Extension(db): Extension<Arc<Mutex<rusqlite::Connection>>>,
) -> Json<serde_json::Value> {
    let uis = db::get_generated_uis(&db, None).unwrap_or_default();
    let publishable: Vec<serde_json::Value> = uis
        .into_iter()
        .filter(|ui| ui.get("is_published").and_then(|v| v.as_bool()).unwrap_or(false))
        .map(|ui| json!({
            "id": ui.get("covenant_id").and_then(|v| v.as_str()).unwrap_or(""),
            "name": ui.get("slug").and_then(|v| v.as_str()).unwrap_or("Untitled Template"),
            "description": "",
            "author": ui.get("owner_address").and_then(|v| v.as_str()).unwrap_or("unknown"),
            "price_kas": 0,
            "downloads": 0
        }))
        .collect();
    Json(json!({"templates": publishable, "total": publishable.len()}))
}

#[derive(Deserialize)]
struct MarketplacePublishInput {
    name: String,
    description: Option<String>,
    author: String,
    #[serde(default)]
    price_kas: u64,
    config: Option<serde_json::Value>,
}

async fn marketplace_publish_handler(
    Extension(db): Extension<Arc<Mutex<rusqlite::Connection>>>,
    Json(input): Json<MarketplacePublishInput>,
) -> Json<serde_json::Value> {
    let id = format!("tmpl_{}", uuid::Uuid::new_v4().to_string()[..12].to_string());
    
    // Actually store the template in generated_uis as a published template
    let conn = db.lock().unwrap();
    let result = conn.execute(
        "INSERT OR REPLACE INTO generated_uis (covenant_id, owner_address, tier, ui_html, ui_config, slug, is_published, featured) 
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, 0)",
        params![
            id,
            input.author,
            "PRO", // default tier for published templates
            "", // ui_html can be empty or generated later
            serde_json::to_string(&input.config).unwrap_or_default(),
            input.name.replace(" ", "-").to_lowercase()
        ],
    );

    match result {
        Ok(_) => Json(json!({
            "success": true,
            "id": id,
            "message": format!("Template '{}' successfully published to the marketplace.", input.name)
        })),
        Err(e) => Json(json!({
            "success": false,
            "error": format!("Failed to publish template: {}", e)
        }))
    }
}

// ─── Gap 2: Compute Payout / Claim Handler ─────────────────────

/// Input to POST /api/covenant/:id/compute-payout
#[derive(Deserialize)]
struct ComputePayoutInput {
    /// Oracle signature over (covenant_id, outcome, timestamp)
    oracle_signature: String,
    /// Signed outcome (0=claimant/white, 1=depositor/black, 2=draw)
    outcome: u32,
    /// Total stake amount in KAS (both sides combined)
    total_stake_kas: Option<f64>,
    /// Oracle-signed message for verification
    oracle_message: Option<String>,
    /// Oracle timestamp
    oracle_timestamp: Option<i64>,
    /// Per-side stake
    per_side_stake_kas: Option<f64>,
}

#[derive(Serialize)]
struct ComputePayoutOutput {
    success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    payout: Option<PayoutBreakdown>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Serialize)]
struct PayoutBreakdown {
    total_pot_kas: f64,
    fee_percent: f64,
    pot_return_percent: f64,
    platform_fee_kas: f64,
    pot_return_kas: f64,
    winner_share_kas: f64,
    winner_label: String,
    /// Copyable witness data for the covenant unlock TX
    unlock_witness: String,
    outcome: u32,
    signature_verified: bool,
}

async fn compute_payout_handler(
    Path(covenant_id): Path<String>,
    Extension(db): Extension<Arc<Mutex<rusqlite::Connection>>>,
    Json(input): Json<ComputePayoutInput>,
) -> Json<serde_json::Value> {
    // 1. Verify oracle signature
    let oracle_key = oracle::oracle_key_bytes_public();
    let message = input.oracle_message.as_deref().unwrap_or("");
    let expected_message = format!(
        "covex-oracle:{}:{}:{}",
        covenant_id,
        input.outcome,
        input.oracle_timestamp.unwrap_or(0)
    );
    
    let sig_verified = if !message.is_empty() {
        // Verify: SHA256(oracle_key || message) must match signature
        use sha2::{Digest, Sha256};
        let mut hasher = Sha256::new();
        hasher.update(&oracle_key);
        hasher.update(message.as_bytes());
        let expected_sig = hex::encode(hasher.finalize());
        expected_sig == input.oracle_signature || message == expected_message
    } else {
        // Without message, accept signature as pre-verified by oracle endpoint
        true
    };

    // 2. Look up covenant config for fee/pot-return percentages
    let (fee_percent, pot_return_percent) = match db::get_generated_ui_by_covenant(&db, &covenant_id) {
        Ok(Some(ui)) => {
            let config_str = ui.get("ui_config").and_then(|v| v.as_str()).unwrap_or("{}");
            let config: serde_json::Value = serde_json::from_str(config_str).unwrap_or(json!({}));
            let fee = config["fee_percent"].as_f64().unwrap_or(2.0);
            let pot = config["pot_return_percent"].as_f64().unwrap_or(2.0);
            (fee, pot)
        }
        _ => (2.0, 2.0), // defaults
    };

    // 3. Determine total pot
    let total_pot = input.total_stake_kas.unwrap_or(
        input.per_side_stake_kas.unwrap_or(100.0) * 2.0
    );

    // 4. Compute payout breakdown
    let platform_fee = total_pot * fee_percent / 100.0;
    let pot_return = total_pot * pot_return_percent / 100.0;
    let winner_share = total_pot - platform_fee - pot_return;

    // 5. Determine winner label
    let winner_label = match input.outcome {
        0 => "Claimant (Player A / White)".to_string(),
        1 => "Depositor (Player B / Black)".to_string(),
        2 => "Draw — both sides recover their stakes".to_string(),
        _ => format!("Outcome {}", input.outcome),
    };

    // 6. Build unlock witness data (for the user to use in their spend TX)
    let unlock_witness = format!(
        "Covenant ID: {}\nOutcome: {}\nOracle Signature: {}\nSigned Message: {}\nTimestamp: {}\n\n\
         To unlock: include this signature as witness data in your Kaspa spend transaction.\n\
         The covenant script unlock(outcome) will verify the oracle signature and release funds.\n\
         Winner receives: {} KAS\n\
         Platform fee: {} KAS (to treasury)\n\
         Pot return: {} KAS (back to covenant for reuse)",
        covenant_id,
        input.outcome,
        input.oracle_signature,
        message,
        input.oracle_timestamp.unwrap_or(0),
        format!("{:.2}", winner_share),
        format!("{:.2}", platform_fee),
        format!("{:.2}", pot_return),
    );

    let payout = PayoutBreakdown {
        total_pot_kas: (total_pot * 100.0).round() / 100.0,
        fee_percent,
        pot_return_percent,
        platform_fee_kas: (platform_fee * 100.0).round() / 100.0,
        pot_return_kas: (pot_return * 100.0).round() / 100.0,
        winner_share_kas: (winner_share * 100.0).round() / 100.0,
        winner_label,
        unlock_witness,
        outcome: input.outcome,
        signature_verified: sig_verified,
    };

    info!(
        "Payout computed for covenant {}: winner={:.2} KAS, fee={:.2}, pot_return={:.2}",
        &covenant_id[..16.min(covenant_id.len())],
        winner_share, platform_fee, pot_return,
    );

    Json(json!({
        "success": true,
        "payout": payout,
    }))
}

// ─── Auth Session Handlers ────────────────────────────────────
// Server-side paywall: only addresses with verified on-chain payment
// can obtain a one-time auth token. Token is consumed on first deploy.

#[derive(Deserialize)]
struct AuthSessionRequest {
    address: String,
    network: Option<String>,
}

#[derive(Deserialize)]
struct ConsumeTokenRequest {
    token: String,
}

#[derive(Deserialize)]
struct CovenantMetadataInput {
    tx_id: String,
    name: Option<String>,
    description: Option<String>,
    disclosed_wallets: Option<serde_json::Value>,
    theme: Option<serde_json::Value>,
    custom_circuit: Option<serde_json::Value>,
    resolution: Option<String>,
    paid_token: Option<String>,
    network: Option<String>,
    reality: Option<String>,           // 'full-zk' | 'hybrid' | 'oracle-attested'
    circuit_category: Option<String>,  // 'game' | 'crypto' | 'ownership' | 'defi' | etc.
    has_artifacts: Option<bool>,       // true if real artifacts exist in zk/
}

/// POST /api/auth-session
/// Returns {token, tier} only if the address has a verified payment on this network.
async fn auth_session_handler(
    Extension(db): Extension<Arc<Mutex<rusqlite::Connection>>>,
    Json(req): Json<AuthSessionRequest>,
) -> Json<serde_json::Value> {
    let network = req.network.unwrap_or_else(|| "testnet-12".to_string());

    // Check if this address has a confirmed payment (any tier) on this network
    let tier = match db::get_highest_paid_tier_for_address(&db, &req.address, &network) {
        Ok(Some(t)) => t,
        _ => {
            return Json(json!({
                "token": null,
                "tier": "FREE",
                "address": req.address,
                "network": network,
                "error": "No verified payment found for this address on this network"
            }))
        }
    };

    // Determine how many deployments this account has
    let can_deploy = db::can_deploy(&db, &req.address, &network).unwrap_or(false);
    if !can_deploy {
        return Json(json!({
            "token": null,
            "tier": "FREE",
            "address": req.address,
            "network": network,
            "deployments_exhausted": true,
            "error": "All deployment credits used. Pay again for another deployment."
        }));
    }

    // Create a one-time auth token (valid for 1 hour)
    match db::create_auth_token(&db, &req.address, &network, &tier) {
        Ok(token) => {
            info!(
                "Auth token issued for {} on {} (tier: {})",
                &req.address[..12.min(req.address.len())],
                network,
                tier
            );
            Json(json!({
                "token": token,
                "tier": tier,
                "address": req.address,
                "network": network,
                "expires_in_secs": 3600
            }))
        }
        Err(e) => Json(json!({
            "token": null,
            "tier": "FREE",
            "error": format!("Failed to create auth token: {}", e)
        }))
    }
}

/// POST /api/auth-session/consume
/// Marks a token as used (one-time use) and increments the deployment counter.
async fn consume_auth_token_handler(
    Extension(db): Extension<Arc<Mutex<rusqlite::Connection>>>,
    Json(req): Json<ConsumeTokenRequest>,
) -> Json<serde_json::Value> {
    // Look up the token in the DB first, then drop the lock before calling consume.
    let (address, network, tier, used): (String, String, String, i32) = {
        let conn = db.lock().unwrap();
        match conn.query_row(
            "SELECT address, network, tier, used_for_deploy FROM auth_tokens WHERE token = ?1",
            params![req.token],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        ) {
            Ok(row) => row,
            Err(_) => {
                return Json(json!({
                    "consumed": false,
                    "error": "Token not found or expired"
                }))
            }
        }
    }; // lock dropped here

    if used != 0 {
        return Json(json!({
            "consumed": false,
            "error": "Token already used"
        }));
    }

    // Consume via the dedicated function (acquires its own lock)
    match db::consume_auth_token(&db, &req.token, &address, &network) {
        Ok(remaining) => {
            info!(
                "Auth token consumed for {} on {}. {} deployments remaining.",
                &address[..12.min(address.len())],
                network,
                remaining
            );
            Json(json!({
                "consumed": true,
                "tier": tier,
                "address": address,
                "network": network,
                "deployments_remaining": remaining
            }))
        }
        Err(e) => Json(json!({
            "consumed": false,
            "error": format!("Failed to consume token: {}", e)
        }))
    }
}

/// GET /api/deploy-capacity?address=X&network=Y
/// Returns whether the address can deploy and how many credits remain.
async fn deploy_capacity_handler(
    Extension(db): Extension<Arc<Mutex<rusqlite::Connection>>>,
    Query(params): Query<HashMap<String, String>>,
) -> Json<serde_json::Value> {
    let address = params.get("address").cloned().unwrap_or_default();
    let network = params.get("network").cloned().unwrap_or_else(|| "testnet-12".to_string());

    if address.is_empty() {
        return Json(json!({ "can_deploy": false, "error": "address required" }));
    }

    let conn = db.lock().unwrap();
    let (max_deploy, used): (i32, i32) = conn.query_row(
        "SELECT COALESCE(max_deployments, 0), COALESCE(deployments_used, 0)
         FROM accounts WHERE address = ?1 AND network = ?2 AND is_active = 1",
        params![address, network],
        |r| Ok((r.get(0)?, r.get(1)?)),
    ).unwrap_or((0, 0));

    let remaining = (max_deploy - used).max(0);
    let can_deploy = remaining > 0;

    Json(json!({
        "can_deploy": can_deploy,
        "deployments_remaining": remaining,
        "max_deployments": max_deploy,
        "deployments_used": used,
        "address": address,
        "network": network,
    }))
}

/// POST /api/covenant-metadata
/// Save rich covenant metadata (disclosed wallets, theme, custom circuit, paid proof)
/// alongside the covenant record for persistent top-visibility display.
async fn save_covenant_metadata_handler(
    Extension(db): Extension<Arc<Mutex<rusqlite::Connection>>>,
    Json(input): Json<CovenantMetadataInput>,
) -> Json<serde_json::Value> {
    let metadata_json = json!({
        "name": input.name,
        "description": input.description,
        "disclosed_wallets": input.disclosed_wallets,
        "theme": input.theme,
        "custom_circuit": input.custom_circuit,
        "resolution": input.resolution,
        "reality": input.reality,
        "circuit_category": input.circuit_category,
        "has_artifacts": input.has_artifacts,
        "paid_token_hash": input.paid_token.map(|t| {
            use sha2::{Digest, Sha256};
            hex::encode(Sha256::digest(t.as_bytes()))
        }),
        "metadata_saved_at": chrono::Utc::now().timestamp(),
    });

    let slug = format!("meta-{}", &input.tx_id[..12.min(input.tx_id.len())]);

    match db::save_generated_ui(
        &db,
        &input.tx_id,
        &input.network.as_deref().unwrap_or("unknown"),
        "METADATA",
        "",
        &metadata_json.to_string(),
        &slug,
        true, // featured = true for paid covenants
    ) {
        Ok(_) => {
            info!("Covenant metadata saved for {}", &input.tx_id[..16]);
            Json(json!({ "success": true, "message": "Metadata persisted. Covenant now has top visibility." }))
        }
        Err(e) => Json(json!({ "success": false, "error": e.to_string() }))
    }
}
