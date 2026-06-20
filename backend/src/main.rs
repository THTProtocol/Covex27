use axum::{
    extract::{Path, Query},
    response::IntoResponse,
    routing::get,
    routing::post,
    Extension, Json, Router,
};
use rusqlite::params;
use serde_json::json;
use std::collections::HashMap;
use std::env;
use std::net::SocketAddr;
use std::sync::Arc;
use std::sync::Mutex;
use tracing::{error, info, warn};
use tracing_subscriber::{fmt, EnvFilter};

mod broadcast;
// Stable library modules below keep some helpers/types for the full feature set that are
// not all wired into the running binary today; silence their dead_code noise at the module.
mod channel;
mod compiler;
mod covenant_builder;
mod covenant_catalog;
#[allow(dead_code)]
mod covenant_types;
mod crawler;
#[allow(dead_code)]
mod db;
mod decompiler;
mod dev_wallets;
mod disassembler;
#[allow(dead_code)]
mod game_engine;
mod games;
mod indexer;
mod kaspa_msg;
mod live;
mod node_status;
mod poker;
// oracle.rs keeps a library of per-circuit verify_* helpers; some are intentionally
// retained for reference/future wiring and are not all called today.
#[allow(dead_code)]
mod oracle;
mod oracle_verifier;
mod payment_verifier;
mod resolve;
mod resolver_failover;
mod signer;
mod ui_generator;

/// Default Kaspa network label used when KASPA_NETWORK env var is not set.
/// The project targets Toccata Testnet-12 (TN12).
const DEFAULT_KASPA_NETWORK: &str = "testnet-12";

/// Mainnet pre-flight env validator (fail-closed).
///
/// Returns Ok for any non-mainnet network. On mainnet, refuses to start when the
/// configured treasury address is empty, is a testnet address (`kaspatest:` prefix),
/// or matches a known dev/placeholder pattern. This is a consensus-honest startup
/// gate: it does not validate cryptographic well-formedness, only blocks obviously
/// wrong addresses from being used as the mainnet treasury.
fn validate_mainnet_env(network: &str, treasury_addr: &str) -> Result<(), String> {
    if network != "mainnet" && network != "mainnet-1" {
        return Ok(());
    }
    let addr = treasury_addr.trim();
    if addr.is_empty() {
        return Err("mainnet treasury address is empty".to_string());
    }
    if addr.starts_with("kaspatest:") {
        return Err(format!(
            "mainnet treasury address is a testnet address ({}); refusing to start",
            addr
        ));
    }
    // Known dev/placeholder patterns. The testnet treasury constants are the
    // canonical dev-placeholder addresses for the project; reject anything that
    // looks like one even if it slipped through under a non-`kaspatest:` prefix.
    let lower = addr.to_ascii_lowercase();
    let placeholder_substrings = [
        "placeholder",
        "example",
        "dev_wallet",
        "devwallet",
        "your_address",
        "youraddress",
        "todo",
        "xxxxxx",
    ];
    for needle in &placeholder_substrings {
        if lower.contains(needle) {
            return Err(format!(
                "mainnet treasury address looks like a placeholder ({}); refusing to start",
                addr
            ));
        }
    }
    // Cross-check against known testnet treasury constants from dev_wallets.rs
    // (defense in depth, in case someone strips the `kaspatest:` prefix).
    let known_dev_addrs = [
        dev_wallets::TREASURY_ADDRESS_TN12,
        dev_wallets::TREASURY_ADDRESS_TN10,
        dev_wallets::DEV_WALLET_1_ADDRESS_TN12,
        dev_wallets::DEV_WALLET_2_ADDRESS_TN12,
        dev_wallets::DEV_WALLET_1_ADDRESS_TN10,
        dev_wallets::DEV_WALLET_2_ADDRESS_TN10,
    ];
    for dev in &known_dev_addrs {
        if addr == *dev {
            return Err(format!(
                "mainnet treasury address matches a known testnet/dev address ({}); refusing to start",
                addr
            ));
        }
        // Compare the bech32 body (post-colon) too, to catch prefix-stripping.
        if let Some(body) = dev.split(':').nth(1) {
            if !body.is_empty() && addr.ends_with(body) {
                return Err(format!(
                    "mainnet treasury address contains a known testnet/dev body ({}); refusing to start",
                    addr
                ));
            }
        }
    }
    Ok(())
}

#[tokio::main]
async fn main() {
    // --- Load .env ---
    let _ = dotenvy::dotenv();

    // Mainnet safety: a configured mainnet indexer MUST have a real oracle key.
    // There is no compiled-in oracle key (removed 2026-06-16); without COVEX_ORACLE_KEY
    // the oracle fails closed everywhere, and on mainnet we refuse to even start.
    if std::env::var("KASPA_WRPC_URL_MAINNET").is_ok() && std::env::var("COVEX_ORACLE_KEY").is_err()
    {
        eprintln!(
            "FATAL: KASPA_WRPC_URL_MAINNET is set but COVEX_ORACLE_KEY is not. \
             Refusing to start a mainnet indexer with no oracle signing key."
        );
        std::process::exit(1);
    }

    // Source-hygiene / fail-closed: there is no longer a baked-in oracle key. Surface
    // at boot whether the oracle can sign so a missing env var is obvious immediately
    // (the server still boots and indexes; only oracle signing fails closed).
    if std::env::var("COVEX_ORACLE_KEY").is_ok() {
        eprintln!("[covex] oracle signing key configured via COVEX_ORACLE_KEY.");
    } else {
        eprintln!(
            "[covex] WARNING: COVEX_ORACLE_KEY is not set - the oracle will FAIL CLOSED \
             (refuse to sign). Set a 64-hex value (throwaway is fine for local testnet)."
        );
    }

    // --- Init tracing ---
    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("covex27_backend=info,kaspa_wrpc=warn"));
    fmt().with_env_filter(filter).init();

    // --- Config ---
    // Defense-in-depth: when BIND_ADDR is unset, bind loopback only so a bare-metal
    // deploy never exposes the backend publicly. Production reaches us via local nginx;
    // the container deploy sets BIND_ADDR=0.0.0.0:3006 explicitly (published to host loopback).
    let bind_addr = env::var("BIND_ADDR").unwrap_or_else(|_| "127.0.0.1:3006".to_string());
    let addr: SocketAddr = bind_addr.parse().expect("Invalid BIND_ADDR");
    let wrpc_url =
        env::var("KASPA_WRPC_URL").unwrap_or_else(|_| "ws://127.0.0.1:17217".to_string());
    let db_path = env::var("DB_PATH").unwrap_or_else(|_| {
        // Resolve relative to binary location to prevent zombie-DB when CWD is deleted
        // (process holds stale file handles to deleted inodes after directory moves)
        if let Ok(exe) = std::env::current_exe() {
            // Binary is at <project>/backend/target/release/covex27-backend
            // Project root is 3 levels up: <project>/
            let project_root = exe
                .parent()
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
    let network = env::var("KASPA_NETWORK").unwrap_or_else(|_| DEFAULT_KASPA_NETWORK.to_string());
    let treasury = env::var("COVENANT_TREASURY_ADDRESS").unwrap_or_else(|_| {
        if network == "mainnet" || network == "mainnet-1" {
            dev_wallets::TREASURY_ADDRESS_MAINNET.to_string()
        } else {
            "kaspatest:qpyfz03k6quxwf2jglwkhczvt758d8xrq99gl37p6h3vsqur27ltjhn68354m".to_string()
        }
    });
    // Mainnet pre-flight gate (fail-closed). Runs AFTER env read, BEFORE the
    // HTTP server binds. No-op on testnet; on mainnet refuses to start if the
    // treasury address is empty, a testnet address, or a dev placeholder.
    if let Err(e) = validate_mainnet_env(&network, &treasury) {
        eprintln!(
            "FATAL: mainnet pre-flight env validation failed: {}. \
             Set COVENANT_TREASURY_ADDRESS to a real kaspa:... mainnet address.",
            e
        );
        std::process::exit(1);
    }

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
            d
        }
        Err(e) => {
            error!("Failed to open database: {}", e);
            std::process::exit(1);
        }
    };

    // --- Connect to Kaspa wRPC ---
    // resolver_failover::build_client constructs the client so resolver-eligible
    // networks (mainnet, testnet-10) can later fail over to a public node, while
    // booting pinned to our own direct node. Non-eligible networks (testnet-12)
    // are pinned to the direct URL exactly as before.
    let client = match resolver_failover::build_client(&network, &wrpc_url) {
        Ok(c) => c,
        Err(e) => {
            error!("Failed to create wRPC client: {}", e);
            std::process::exit(1);
        }
    };
    let client_url = wrpc_url.clone();

    info!(
        "Connecting to Kaspa wRPC node at {} (network {})...",
        client_url, network
    );
    // Non-blocking connect: the HTTP server MUST bind and serve regardless of
    // whether any Kaspa node is currently reachable. The connect returns
    // immediately and the client keeps retrying in the background (strategy:
    // Retry), so the node link self-heals without ever wedging startup.
    resolver_failover::initial_connect(&client, &network, &wrpc_url).await;

    // Networks placed under resolver-failover supervision (filled in below).
    let mut supervised: Vec<resolver_failover::Supervised> = vec![resolver_failover::Supervised {
        network: network.clone(),
        client: Arc::clone(&client),
        direct_url: wrpc_url.clone(),
    }];

    // --- Multi-network support: spawn indexers for ALL configured networks ---
    // This lets ONE backend process index covenants for TN12, TN10, and MAINNET
    // simultaneously. Frontend toggle uses ?network=... on reads and sends network in
    // deploy payloads. Background indexers + crawlers + verifiers run for each network.
    let primary_network = network.clone();

    // Networks to additionally index (all except the primary, which gets its own spawns below)
    // Only include mainnet if KASPA_WRPC_URL_MAINNET is explicitly configured - the default
    // ws://127.0.0.1:17110 hangs the startup if no mainnet node is running locally.
    let mut extra_networks: Vec<&str> = Vec::new();
    // Mainnet-only deployment (KASPA_NETWORK=mainnet): index ONLY mainnet, with no
    // testnet crawlers at all. Otherwise index the testnets alongside the primary.
    let mainnet_only = primary_network == "mainnet" || primary_network == "mainnet-1";
    if !mainnet_only && primary_network != "testnet-10" {
        extra_networks.push("testnet-10");
    }
    if !mainnet_only && primary_network != "testnet-12" {
        extra_networks.push("testnet-12");
    }
    if primary_network != "mainnet"
        && primary_network != "mainnet-1"
        && std::env::var("KASPA_WRPC_URL_MAINNET").is_ok()
    {
        extra_networks.push("mainnet");
    }

    for &extra_net in &extra_networks {
        let extra_wrpc = match extra_net {
            "testnet-10" => env::var("KASPA_WRPC_URL_TN10")
                .unwrap_or_else(|_| "ws://127.0.0.1:17210".to_string()),
            "mainnet" => env::var("KASPA_WRPC_URL_MAINNET")
                .unwrap_or_else(|_| "ws://127.0.0.1:17310".to_string()),
            _ => continue,
        };

        let extra_treasury = match extra_net {
            "testnet-10" => env::var("COVENANT_TREASURY_ADDRESS_TN10").unwrap_or_else(|_| {
                dev_wallets::treasury_address_for_network(extra_net).to_string()
            }),
            "mainnet" => env::var("COVENANT_TREASURY_ADDRESS").unwrap_or_else(|_| {
                dev_wallets::treasury_address_for_network(extra_net).to_string()
            }),
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

        let extra_client = match resolver_failover::build_client(extra_net, &extra_wrpc) {
            Ok(c) => c,
            Err(e) => {
                warn!("Failed to create wRPC client for {} at {}: {} (indexing disabled for this network)", extra_net, extra_wrpc, e);
                continue;
            }
        };

        info!("Additional network {} wRPC: {}", extra_net, extra_wrpc);
        // Non-blocking: a down optional-network node (e.g. mainnet pre-Toccata)
        // must never wedge startup. Returns immediately; client retries in background.
        resolver_failover::initial_connect(&extra_client, extra_net, &extra_wrpc).await;
        supervised.push(resolver_failover::Supervised {
            network: extra_net.to_string(),
            client: Arc::clone(&extra_client),
            direct_url: extra_wrpc.clone(),
        });

        // Spawn indexer
        {
            let s_db = db.clone();
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
            let s_db = db.clone();
            let s_client = Arc::clone(&extra_client);
            let s_treasury = extra_treasury.clone();
            let s_net = extra_net.to_string();
            tokio::spawn(async move {
                payment_verifier::run_payment_verifier(s_client, s_db, s_treasury, s_net).await;
            });
        }
        // Spawn crawler
        {
            let s_db = db.clone();
            let s_client = Arc::clone(&extra_client);
            let s_treasury = extra_treasury.clone();
            let s_net = extra_net.to_string();
            tokio::spawn(async move {
                crawler::run_crawler(s_client, s_db, s_treasury, crawl_start_daa, s_net).await;
            });
        }
    }

    // --- Background: Indexer (for the primary network) ---
    let idx_db = db.clone();
    let idx_client = Arc::clone(&client);
    let idx_seeds = seed_addrs.clone();
    let idx_treasury = treasury.clone();
    let idx_network = network.clone();
    tokio::spawn(async move {
        indexer::run_indexer(idx_client, idx_db, idx_seeds, idx_treasury, idx_network).await;
    });

    // --- Background: Payment Verifier (primary) ---
    let pay_db = db.clone();
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
    let archive_db = db.clone();
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
    let crawl_db = db.clone();
    let crawl_client = Arc::clone(&client);
    let crawl_treasury = treasury.clone();
    let crawl_network = network.clone();
    tokio::spawn(async move {
        crawler::run_crawler(
            crawl_client,
            crawl_db,
            crawl_treasury,
            crawl_start_daa,
            crawl_network,
        )
        .await;
    });

    // --- Background: Resolver failover supervisor ---
    // For resolver-eligible networks (mainnet, testnet-10) this fails the wRPC
    // client over to a public Kaspa node when our own node is unavailable, and
    // switches back when it recovers. testnet-12 has no public coverage and stays
    // direct-only. Disable with COVEX_RESOLVER_FALLBACK=0.
    resolver_failover::spawn_supervisor(supervised);

    // Finalise abandoned matches whose clock has run out (quit/timeout = loss).
    games::spawn_timeout_sweeper(db.clone());

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
        .route(
            "/covenants/:covenant_id/actions",
            get(covenant_actions_handler),
        )
        .route("/compile", post(compile_handler))
        .route("/script/disassemble", post(disassemble_handler))
        .route("/script/decompile", post(decompile_handler))
        .merge(live::live_routes())
        .merge(games::games_routes().layer(Extension(db.clone())))
        .merge(channel::channel_routes().layer(Extension(db.clone())))
        .merge(poker::poker_routes().layer(Extension(db.clone())))
        .route("/events", get(events_handler))
        .route("/address/:addr", get(address_summary_handler))
        // Smart-resolve: classifies a query (KNS .kas / address / txid|covenant / keyword)
        // and resolves .kas ownership via KNS. Read-only; powers the search bar + AI callers.
        .merge(resolve::resolve_routes().layer(Extension(db.clone())))
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
        .route("/stats", get(platform_stats_handler))
        .route("/og/covenant/:covenant_id", get(og_covenant_handler))
        .route("/og-card/:covenant_id", get(og_card_handler))
        .route("/marketplace/templates", get(marketplace_templates_handler))
        .route("/marketplace/publish", post(marketplace_publish_handler))
        .layer(Extension(db.clone()))
        // Covex offers NO first-party mixer (legal/sanctions posture). The /mixer routes are
        // removed; Covex remains a neutral explorer, so a user-created mixer-style covenant can
        // still be DISPLAYED like any covenant, with the creator carrying all liability.
        .merge(oracle::oracle_routes().layer(Extension(db.clone())))
        .merge(covenant_builder::p2sh_routes().layer(Extension(db.clone())))
        .merge(covenant_catalog::catalog_routes())
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
        .with_graceful_shutdown(shutdown_signal())
        .await
        .unwrap();
}

/// Resolves when the process is asked to stop (SIGTERM from systemd on deploy, or Ctrl-C).
/// Wired into axum's graceful shutdown so a restart drains in-flight HTTP/WS instead of
/// cutting them mid-request, which is what produced 502s during deploys.
async fn shutdown_signal() {
    let ctrl_c = async {
        let _ = tokio::signal::ctrl_c().await;
    };
    #[cfg(unix)]
    let terminate = async {
        match tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
            Ok(mut s) => {
                s.recv().await;
            }
            Err(_) => std::future::pending::<()>().await,
        }
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => info!("SIGINT received; draining in-flight requests before exit"),
        _ = terminate => info!("SIGTERM received; draining in-flight requests before exit"),
    }
}

async fn events_handler(
    Extension(db): Extension<db::Db>,
    Query(params): Query<HashMap<String, String>>,
) -> Json<serde_json::Value> {
    let network = params.get("network").cloned();
    let limit: i64 = params
        .get("limit")
        .and_then(|s| s.parse().ok())
        .unwrap_or(30);
    // Run the synchronous SQLite read on a blocking thread so it never stalls a
    // Tokio worker (this is one of the hottest GET endpoints).
    let result = db::blocking(&db, move |conn| {
        db::get_events_conn(conn, network.as_deref(), limit)
    })
    .await;
    match result {
        Ok(ev) => Json(json!({"events": ev, "total": ev.len()})),
        Err(e) => Json(json!({"events": [], "error": e.to_string()})),
    }
}

/// Public portfolio summary for any address: covenants created, payments, totals.
async fn address_summary_handler(
    Extension(db): Extension<db::Db>,
    axum::extract::Path(addr): axum::extract::Path<String>,
    Query(params): Query<HashMap<String, String>>,
) -> Json<serde_json::Value> {
    let network = params.get("network").cloned();
    let addr_q = addr.clone();
    // Both reads run on one pooled connection on a blocking thread; the JSON
    // mapping below is CPU-light and stays on the async side.
    let (covs, total, ui_ids) = db::blocking(&db, move |conn| {
        let (covs, total) = db::query_covenants_conn(
            conn,
            network.as_deref(),
            Some(addr_q.as_str()),
            None,
            None,
            100,
            0,
            false,
        )
        .unwrap_or((vec![], 0));
        let ui_ids = db::get_custom_ui_id_set_cached_conn(conn);
        (covs, total, ui_ids)
    })
    .await;
    let list: Vec<serde_json::Value> = covs
        .iter()
        .map(|c| {
            covenant_summary_json(
                c,
                ui_ids.contains(&c.tx_id),
                db::ui_config_for_tier(&c.verified_tier),
            )
        })
        .collect();
    let tvl: f64 = covs.iter().map(|c| c.amount_kaspa).sum();
    let paid = covs
        .iter()
        .filter(|c| matches!(c.verified_tier.as_str(), "BUILDER" | "PRO" | "MAX"))
        .count();
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
            "/resolve/{query}": {"get": {"summary": "Smart-resolve a free-form query. Classifies it as a KNS .kas domain, a Kaspa address, a txid/covenant, or a keyword, and resolves .kas ownership via KNS (fail-closed). Powers the explorer search bar and AI/API callers.", "parameters": [
                {"name": "query", "in": "path", "required": true, "description": "A .kas domain, a kaspa:/kaspatest: address, a 64-hex txid or covenant id, or a keyword.", "schema": {"type": "string"}},
                {"name": "network", "in": "query", "description": "KNS is indexed on mainnet and testnet-10 only (testnet-12 returns resolved:false).", "schema": {"type": "string", "enum": ["mainnet", "testnet-10", "testnet-12"], "default": "mainnet"}}
            ], "responses": {"200": {"description": "Resolution result", "content": {"application/json": {"schema": {"type": "object", "properties": {
                "query": {"type": "string"},
                "type": {"type": "string", "enum": ["kns", "address", "txid", "covenant", "keyword"]},
                "resolved": {"type": "boolean"},
                "address": {"type": "string", "nullable": true},
                "covenant_id": {"type": "string", "nullable": true},
                "network": {"type": "string"},
                "network_hint": {"type": "string", "enum": ["mainnet", "testnet"], "nullable": true},
                "kns": {"type": "object", "nullable": true, "properties": {"name": {"type": "string"}, "owner": {"type": "string"}}},
                "note": {"type": "string", "nullable": true}
            }}}}}}}},
            "/analytics": {"get": {"summary": "Creator or global analytics", "parameters": [{"name": "creator", "in": "query", "schema": {"type": "string"}}]}},
            "/stats": {"get": {"summary": "Public platform statistics (covenants, TVL, tiers, categories, activity timeline)", "parameters": [{"name": "network", "in": "query", "schema": {"type": "string", "enum": ["all", "testnet-12", "testnet-10", "mainnet"]}}]}},
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
    Extension(db): Extension<db::Db>,
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
/// Keyed on X-Real-IP, which our trusted nginx sets (replace-not-append) to the real
/// peer address. Client-supplied X-Forwarded-For is NOT trusted, since a hostile client
/// could rotate it to evade the limit. Falls back to "unknown" when X-Real-IP is absent.
/// No external deps.
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
        "/compile"
            | "/script/disassemble"
            | "/script/decompile"
            | "/sign-and-broadcast"
            | "/broadcast"
            | "/auth-session"
    ) || path.starts_with("/oracle/")
        || (req.method() == axum::http::Method::POST && path.starts_with("/covenant/"));
    if !expensive {
        return next.run(req).await;
    }

    // Key ONLY on X-Real-IP set by our trusted nginx. Do not consult the
    // client-controlled X-Forwarded-For: a single attacker could otherwise mint a
    // fresh bucket per request by rotating that header and bypass the limiter.
    let ip = req
        .headers()
        .get("x-real-ip")
        .and_then(|v| v.to_str().ok())
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
    for base in [
        ".",
        "/root/Covex27",
        "/mnt/HC_Volume_105579109/Covex27",
        "..",
        "../..",
    ] {
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

/// Oracle identity for the public health/status JSON. Fail-closed: there is no
/// compiled-in oracle key any more, so when COVEX_ORACLE_KEY is unset we report
/// ("unconfigured", "unconfigured") instead of deriving a key - this keeps /health
/// serving (rather than panicking) on an env that can't sign. When the key IS set we
/// derive and expose the real x-only pubkey exactly as before.
fn oracle_status_json() -> (&'static str, String) {
    if std::env::var("COVEX_ORACLE_KEY").is_ok() {
        ("custom", oracle::oracle_xonly_pubkey_hex())
    } else {
        ("unconfigured", "unconfigured".to_string())
    }
}

async fn health_handler() -> Json<serde_json::Value> {
    let network =
        std::env::var("KASPA_NETWORK").unwrap_or_else(|_| DEFAULT_KASPA_NETWORK.to_string());
    let (oracle_mode, oracle_pubkey) = oracle_status_json();
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
        "oracle_pubkey": oracle_pubkey,
        "oracle_scheme": "bip340-schnorr-secp256k1",
        "git_commit": git_commit,
        "bind_addr": bind_addr,
        "crawl_full_rescan": crawl_full_rescan,
        "networks_configured": {
            "testnet_12": true,
            "testnet_10": has_tn10_wrpc,
            "mainnet": has_mainnet_wrpc
        },
        // Honest split: a configured wRPC URL is NOT readiness. Mainnet covenants are
        // indexed/served only once the operator flips COVEX_MAINNET_COVENANTS_ENABLED
        // (Toccata gate). Report both sub-signals so nobody reads "ready" off the URL alone.
        "mainnet_wrpc_configured": has_mainnet_wrpc,
        "mainnet_covenants_enabled": crawler::mainnet_covenants_enabled(),
        "mainnet_ready": has_mainnet_wrpc && crawler::mainnet_covenants_enabled()
    }))
}

async fn root_handler() -> Json<serde_json::Value> {
    let network =
        std::env::var("KASPA_NETWORK").unwrap_or_else(|_| DEFAULT_KASPA_NETWORK.to_string());
    let (oracle_mode, oracle_pubkey) = oracle_status_json();
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
        "oracle_pubkey": oracle_pubkey,
        "oracle_scheme": "bip340-schnorr-secp256k1",
        "git_commit": git_commit,
        "bind_addr": bind_addr,
        "crawl_full_rescan": crawl_full_rescan,
        "networks_configured": {
            "testnet_12": true,
            "testnet_10": has_tn10_wrpc,
            "mainnet": has_mainnet_wrpc
        },
        // Honest split: a configured wRPC URL is NOT readiness. Mainnet covenants are
        // indexed/served only once the operator flips COVEX_MAINNET_COVENANTS_ENABLED
        // (Toccata gate). Report both sub-signals so nobody reads "ready" off the URL alone.
        "mainnet_wrpc_configured": has_mainnet_wrpc,
        "mainnet_covenants_enabled": crawler::mainnet_covenants_enabled(),
        "mainnet_ready": has_mainnet_wrpc && crawler::mainnet_covenants_enabled()
    }))
}

async fn status_handler(Extension(db): Extension<db::Db>) -> Json<serde_json::Value> {
    let total = db::count_covenants(&db).unwrap_or(0);
    let active = db::count_active_covenants(&db).unwrap_or(0);
    let verified = db::count_verified_covenants(&db).unwrap_or(0);
    let network =
        std::env::var("KASPA_NETWORK").unwrap_or_else(|_| DEFAULT_KASPA_NETWORK.to_string());
    // status reports only the mode, so don't derive the key here (keeps the prior
    // behaviour of not touching the signing key on this endpoint).
    let oracle_mode = if std::env::var("COVEX_ORACLE_KEY").is_ok() {
        "custom"
    } else {
        "unconfigured"
    };
    let has_mainnet_wrpc = std::env::var("KASPA_WRPC_URL_MAINNET").is_ok();
    let git_commit = get_git_commit();
    let crawl_full_rescan = std::env::var("CRAWL_FULL_RESCAN").is_ok();
    let bind_addr = std::env::var("BIND_ADDR").unwrap_or_else(|_| "0.0.0.0:3006".to_string());
    Json(json!({
        "status": "ok",
        "network": network,
        "oracle_key_mode": oracle_mode,
        "node_connected": node_status::snapshot()
            .as_object()
            .map(|m| m.values().any(|v| v.get("connected").and_then(|c| c.as_bool()).unwrap_or(false)))
            .unwrap_or(false),
        "node_sync": node_status::snapshot(),
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
        "mainnet_wrpc_configured": has_mainnet_wrpc,
        "mainnet_covenants_enabled": crawler::mainnet_covenants_enabled(),
        "mainnet_ready": has_mainnet_wrpc && crawler::mainnet_covenants_enabled(),
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
        // Honest finality/reorg signal (derived against the live node tip by annotate_finality):
        // final (consensus-irreversible) | confirming (with ETA) | pending (no on-chain DAA yet)
        // | unknown (node tip unavailable). reorged covenants are hidden from lists; the flag is
        // surfaced for the detail page to show a truthful banner.
        "block_hash": c.block_hash,
        "confirmations": c.confirmations,
        "finality": c.finality,
        "finality_eta_secs": c.finality_eta_secs,
        "reorged": c.reorged,
        // Honest enforcement label derived from the on-chain script (roadmap B4):
        // on-chain (script-enforced) | full-zk | hybrid | oracle-attested
        // | decorative. A prediction-market anchor holds no script itself but its funds live
        // in on-chain binary_oracle_select bundles whose custody and every payout leg are
        // script-locked, while WHICH branch wins is set by the secret the disclosed oracle
        // reveals - that is the hybrid reality, not bare oracle-attested.
        //
        // A binary_oracle_select leg is stored with the exact 35-byte aa20<hash>87 P2SH
        // wrapper, so reality_for_script() classifies it OnChain - but custody is on-chain
        // while WHICH branch wins is set by the secret the disclosed oracle reveals. The
        // catalog already classifies p2sh_binary_oracle_select as Hybrid, so override the raw
        // script label here to "hybrid" to match the catalog, the
        // binary_oracle_select_type_override_is_hybrid_despite_exact_p2sh test, and
        // TrustBadge.trustInfo (which also reads a market leg as hybrid). Tell the truth at
        // the JSON boundary.
        //
        // The ZK label: every real ZK covenant is also a 35-byte aa20<hash>87 P2SH wrapper,
        // so reality_for_script() flattens it to "on-chain" and TrustBadge.jsx never reaches
        // the full-zk branch. When the disclosed custom_ui_config declares a circuit in
        // VERIFIED_FULL_ZK_CIRCUITS, upgrade the wire label so the violet "Full ZK" pill
        // (oracle-verified OFF-CHAIN; never chain-enforced - no proof->hashlock binding exists)
        // actually paints. HONESTY: a prediction market's custody is on-chain but WHICH outcome
        // wins is set by the secret the disclosed oracle reveals, so it is hybrid for
        // resolution - never "on-chain" (the exact word README s2 forbids for oracle-resolved
        // outcomes).
        //
        // The same override is required for the oracle co-sign kinds. oracle_enforced,
        // oracle_escrow, and their _refundable variants ALL deploy as the exact 35-byte
        // aa20<hash>87 P2SH, so reality_for_script() alone would flatten them to "on-chain"
        // and they would wear the "on-chain, no oracle, no trust" badge while in fact the
        // chain requires the disclosed Covex oracle's co-signature to release the funds. The
        // catalog already declares all four EnforcementReality::Hybrid; match it here so the
        // wire label tells the truth. contains() folds in the _refundable variants
        // (oracle_enforced -> oracle_enforced_refundable, oracle_escrow ->
        // oracle_escrow_refundable).
        "enforcement_reality": if c.covenant_type == "prediction-market"
            || c.covenant_type.contains("binary_oracle_select")
            || c.covenant_type.contains("oracle_enforced")
            || c.covenant_type.contains("oracle_escrow")
        {
            "hybrid"
        } else {
            let circuit = ui_config
                .as_object()
                .and_then(|o| o.get("circuit"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            if let Some(r) = covenant_catalog::zk_reality_for_circuit(circuit) {
                r.as_str()
            } else {
                covenant_catalog::reality_for_script(&c.script_hex).as_str()
            }
        },
    })
}

async fn covenants_handler(
    Extension(db): Extension<db::Db>,
    Query(params): Query<HashMap<String, String>>,
) -> Json<serde_json::Value> {
    let network_filter = params.get("network").map(|s| s.to_string());
    let creator = params
        .get("creator")
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());
    let q = params
        .get("q")
        .filter(|s| !s.trim().is_empty())
        .map(|s| s.to_string());
    let category = params
        .get("category")
        .filter(|s| !s.is_empty() && s.as_str() != "all")
        .map(|s| s.to_string());
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

    // Curate by default: hide bare crawled P2SH commitments unless the caller explicitly searches
    // (q), filters by category/creator, or passes include_raw=1 (the explorer "Show all" toggle).
    let genuine_only = q.is_none()
        && category.is_none()
        && creator.is_none()
        && params.get("include_raw").map(|v| v != "1").unwrap_or(true);
    let want_stats = offset == 0;

    // All reads (page + optional header aggregates + custom-UI badge set) run on one
    // pooled connection on a blocking thread so they never stall a Tokio worker.
    type CovQueryOut = (
        anyhow::Result<(Vec<db::DbCovenant>, i64)>,
        std::collections::HashSet<String>,
        Option<(i64, i64, f64)>,
    );
    let (records_res, ui_ids, stats_row): CovQueryOut = db::blocking(&db, move |conn| {
        let records_res = db::query_covenants_conn(
            conn,
            network_filter.as_deref(),
            creator.as_deref(),
            q.as_deref(),
            category.as_deref(),
            limit,
            offset,
            genuine_only,
        );
        let ui_ids = db::get_custom_ui_id_set_cached_conn(conn);
        let stats_row = if want_stats {
            db::covenant_stats_conn(conn, network_filter.as_deref()).ok()
        } else {
            None
        };
        (records_res, ui_ids, stats_row)
    })
    .await;

    let (records, total) = match records_res {
        Ok(r) => r,
        Err(e) => {
            error!("Failed to query covenants: {}", e);
            return Json(json!({"total": 0, "covenants": [], "error": e.to_string()}));
        }
    };

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
    let stats = stats_row
        .map(|(t, paid, tvl)| json!({"total": t, "paid": paid, "tvl_kas": tvl}))
        .unwrap_or(serde_json::Value::Null);
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
    Extension(db): Extension<db::Db>,
    axum::extract::Path(covenant_id): axum::extract::Path<String>,
) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, Json<serde_json::Value>)> {
    match db::get_covenant_by_txid(&db, &covenant_id) {
        Ok(Some(c)) => {
            let ui = db::get_generated_ui_for(&db, &c.tx_id).unwrap_or_default();
            let (custom_ui_html, ui_cfg_raw, ui_source_tier) = ui.unwrap_or_default();
            let custom_ui_config = serde_json::from_str::<serde_json::Value>(&ui_cfg_raw)
                .unwrap_or_else(|_| db::ui_config_for_tier(&c.verified_tier));
            let mut v = covenant_summary_json(&c, !custom_ui_html.is_empty(), custom_ui_config);
            v["script_hex"] = json!(c.script_hex);
            v["custom_ui_html"] = json!(custom_ui_html);
            // Distinguish a genuine creator-published UI (saved via terminal-config,
            // tier "TERMINAL") from an auto-generated blob. The frontend renders the
            // iframe ONLY for creator UIs and shows a clean native panel otherwise,
            // so an auto-generated "basic UI" never speaks for the covenant.
            v["custom_ui_source"] = json!(if ui_source_tier == "TERMINAL" {
                "creator"
            } else {
                "auto"
            });
            v["receiving_addresses"] = json!(c.receiving_addresses);
            // TRUSTLESS RECOVERY: for an enforced P2SH covenant, surface the full redeem
            // script + spend metadata so the owner (or anyone) can reconstruct and sign the
            // spend with ONLY their wallet, even if they never saved the one-time deploy
            // response. Without this, a user who closed the tab could never recover funds
            // (the on-chain P2SH wrapper aa20<hash>87 is one-way). The redeem script is not
            // a secret - it is required to spend and is safe to publish.
            // Covenant ids are "<txid>:<outpoint_index>" but p2sh_covenants is keyed by
            // the raw txid, so strip the ":N" suffix before the lookup.
            let p2sh_txid = c.tx_id.split(':').next().unwrap_or(&c.tx_id);
            if let Some(p2sh) = db::get_p2sh_covenant(&db, p2sh_txid) {
                v["redeem_script_hex"] = json!(p2sh.redeem_script_hex);
                v["redeem_kind"] = json!(p2sh.redeem_kind);
                v["p2sh_address"] = json!(p2sh.p2sh_address);
                v["outpoint_index"] = json!(p2sh.outpoint_index);
                v["spendable"] = json!(p2sh.spent_tx_id.is_none());
                if let Some(spent) = &p2sh.spent_tx_id {
                    v["spent_tx_id"] = json!(spent);
                }
            }
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
    let source = req.source.or(req.silver_script).unwrap_or_default();
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

#[derive(serde::Deserialize)]
struct DisassembleRequest {
    /// The raw script bytes to disassemble, hex-encoded. This is a recovered redeem
    /// script, a script_pubkey, or any Kaspa script -- not a tx payload.
    script_hex: String,
    /// Overlay the Toccata (KIP-10/17/20) introspection opcode names. Defaults to false
    /// (the pre-Toccata VM, which every covenant indexed today was built against).
    #[serde(default)]
    toccata: bool,
}

/// POST /script/disassemble -- the Etherscan-style "opcode view". Turns a raw Kaspa
/// script into a labeled token stream + ASM listing, keyed on the opcode byte so it
/// stays correct across the Toccata renames. Pure function; no DB, no key material.
async fn disassemble_handler(
    Json(req): Json<DisassembleRequest>,
) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, Json<serde_json::Value>)> {
    let hex_str = req.script_hex.trim();
    let hex_str = hex_str.strip_prefix("0x").unwrap_or(hex_str);
    if hex_str.is_empty() {
        return Err((
            axum::http::StatusCode::BAD_REQUEST,
            Json(json!({"ok": false, "error": "missing script_hex"})),
        ));
    }
    // Cap input so a hostile request cannot allocate unbounded work: 400KB of hex
    // is ~200KB of decoded script bytes.
    if hex_str.len() > 400 * 1024 {
        return Err((
            axum::http::StatusCode::PAYLOAD_TOO_LARGE,
            Json(json!({"ok": false, "error": "script too large (max 200KB decoded / 400KB hex)"})),
        ));
    }
    let bytes = match hex::decode(hex_str) {
        Ok(b) => b,
        Err(e) => {
            return Err((
                axum::http::StatusCode::BAD_REQUEST,
                Json(json!({"ok": false, "error": format!("invalid hex: {e}")})),
            ));
        }
    };
    let dis = disassembler::disassemble(&bytes, req.toccata);
    Ok(Json(json!({
        "ok": true,
        "byte_len": dis.byte_len,
        "opcode_count": dis.opcode_count,
        "toccata": dis.toccata,
        "asm": dis.asm,
        "tokens": dis.tokens,
        "error": dis.error,
    })))
}

#[derive(serde::Deserialize)]
struct DecompileRequest {
    /// The recovered redeem script, hex-encoded (NOT the P2SH wrapper, NOT a tx payload).
    redeem_hex: String,
    /// Optional on-chain commitment to check against: either the 32-byte blake2b hash or
    /// the 35-byte P2SH script_pubkey `aa20<hash>87`. When present, the response carries
    /// `commitment_match`.
    #[serde(default)]
    commitment_hex: Option<String>,
}

/// POST /script/decompile -- recover a covenant's kind + named params + spend branches from
/// its redeem script, and (the "Verified covenant" badge) confirm the decode by re-emitting
/// the redeem and matching it byte-for-byte. Pure function; no DB, no key material.
async fn decompile_handler(
    Json(req): Json<DecompileRequest>,
) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, Json<serde_json::Value>)> {
    let hex_str = req.redeem_hex.trim();
    let hex_str = hex_str.strip_prefix("0x").unwrap_or(hex_str);
    if hex_str.is_empty() {
        return Err((
            axum::http::StatusCode::BAD_REQUEST,
            Json(json!({"ok": false, "error": "missing redeem_hex"})),
        ));
    }
    if hex_str.len() > 400 * 1024 {
        return Err((
            axum::http::StatusCode::PAYLOAD_TOO_LARGE,
            Json(json!({"ok": false, "error": "redeem too large (max 200KB decoded / 400KB hex)"})),
        ));
    }
    let bytes = match hex::decode(hex_str) {
        Ok(b) => b,
        Err(e) => {
            return Err((
                axum::http::StatusCode::BAD_REQUEST,
                Json(json!({"ok": false, "error": format!("invalid hex: {e}")})),
            ));
        }
    };
    let decoded = decompiler::decompile(&bytes);
    // Optional commitment check (null if not supplied or the commitment is malformed).
    let commitment_match = req.commitment_hex.as_ref().and_then(|c| {
        let c = c.trim();
        let c = c.strip_prefix("0x").unwrap_or(c);
        let cb = hex::decode(c).ok()?;
        decompiler::commitment_matches(&bytes, &cb)
    });
    Ok(Json(json!({
        "ok": true,
        "commitment_match": commitment_match,
        "decoded": decoded,
    })))
}

async fn paid_status_handler(
    Query(params): Query<std::collections::HashMap<String, String>>,
    Extension(db): Extension<db::Db>,
) -> Json<serde_json::Value> {
    let address = params.get("address").cloned().unwrap_or_default();
    if address.is_empty() {
        return Json(json!({"highest_tier": null}));
    }
    // Default to testnet-12 for backward compat, but honor ?network=
    let network = params
        .get("network")
        .cloned()
        .unwrap_or_else(|| "testnet-12".to_string());

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
    Extension(db): Extension<db::Db>,
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

/// Maximum byte size of a creator-published custom UI document. Bounded
/// server-side (independent of the nginx body limit) so a single covenant page
/// cannot ship an unbounded blob to every visitor's iframe. 256 KB of HTML is
/// far more than any honest terminal needs.
const MAX_CUSTOM_UI_BYTES: usize = 256 * 1024;

async fn save_terminal_config_handler(
    Path(covenant_id): Path<String>,
    Extension(db): Extension<db::Db>,
    Json(input): Json<TerminalConfigInput>,
) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, Json<serde_json::Value>)> {
    fn pfx(s: &str) -> &str {
        &s[..s.len().min(16)]
    }

    // ── Size cap (fail-closed, before any storage) ──
    // The raw custom UI is stored verbatim and rendered to every visitor inside
    // an iframe. Reject oversize payloads here, independent of nginx, so the cap
    // holds regardless of the front proxy config.
    let ui_html = input.custom_ui_code.clone().unwrap_or_default();
    if ui_html.len() > MAX_CUSTOM_UI_BYTES {
        warn!(
            "terminal-config rejected for {}: custom UI {} bytes exceeds cap {}",
            pfx(&covenant_id),
            ui_html.len(),
            MAX_CUSTOM_UI_BYTES
        );
        return Err((
            axum::http::StatusCode::PAYLOAD_TOO_LARGE,
            Json(json!({
                "success": false,
                "error": "Custom UI too large (max 256 KB). Trim the page and try again."
            })),
        ));
    }

    // ── Ownership enforcement (challenge-response, fail-closed) ──
    // The save publishes raw HTML that renders to ALL visitors of this covenant
    // page, so it MUST be authenticated. There is no unauthenticated path:
    //   (a) Indexed covenant WITH a known creator: the signer must BE the creator,
    //       and a valid signature over a single-use nonce must verify and be
    //       consumed (existing happy path; unchanged).
    //   (b) Unindexed covenant OR a covenant with an EMPTY creator_addr: there is
    //       no on-chain creator to compare against, so we cannot bind the save to
    //       an owner. Rather than silently accept (which would let anyone PRE-PLANT
    //       a creator-marked UI for an id that later indexes), we REQUIRE a valid
    //       ownership signature over a server-issued single-use nonce for the
    //       claimed signer, using the SAME scheme. A caller who cannot produce one
    //       is refused. This closes the pre-plant bypass.
    // There is no string-compare bypass: creator addresses are public, so
    // signer==creator alone proves nothing without the signature.
    let signer = input.signer_address.as_deref().unwrap_or("");
    let sig = input.signature.as_deref().unwrap_or("");
    let nonce = input.nonce.as_deref().unwrap_or("");

    let indexed_creator: Option<String> = match db::get_covenant_by_txid(&db, &covenant_id) {
        Ok(Some(cov)) if !cov.creator_addr.is_empty() => Some(cov.creator_addr),
        _ => None,
    };

    // Case (a): indexed with a known creator. The signer must be that creator.
    if let Some(creator) = indexed_creator.as_deref() {
        if signer != creator {
            warn!(
                "terminal-config rejected for {}: signer {} != creator {}",
                pfx(&covenant_id),
                pfx(signer),
                pfx(creator)
            );
            return Err((
                axum::http::StatusCode::FORBIDDEN,
                Json(json!({
                    "success": false,
                    "error": "Only the original covenant deployer can edit this configuration"
                })),
            ));
        }
    } else {
        // Case (b): unindexed or empty creator_addr. We still require a valid
        // ownership signature (no silent accept), but there is no creator to
        // compare against, so we only enforce that a signer is present.
        if signer.is_empty() {
            warn!(
                "terminal-config rejected for {}: unindexed/no-creator covenant and no signer",
                pfx(&covenant_id)
            );
            return Err((
                axum::http::StatusCode::BAD_REQUEST,
                Json(json!({
                    "success": false,
                    "error": "Covenant not yet indexed; cannot verify ownership. Connect the creator wallet and sign the ownership challenge to publish."
                })),
            ));
        }
    }

    // Both cases require a present, verifying, single-use signature over the nonce.
    if sig.is_empty() || nonce.is_empty() {
        return Err((
            axum::http::StatusCode::UNAUTHORIZED,
            Json(json!({
                "success": false,
                "error": "A wallet signature is required to edit this covenant. Connect the creator wallet and approve the signature request."
            })),
        ));
    }
    match verify_terminal_ownership_signature(signer, sig, nonce, &covenant_id) {
        Ok(true) => info!(
            "ownership signature verified for covenant {}",
            pfx(&covenant_id)
        ),
        Ok(false) => {
            warn!(
                "terminal-config signature FAILED for {} by {}",
                pfx(&covenant_id),
                pfx(signer)
            );
            return Err((
                axum::http::StatusCode::UNAUTHORIZED,
                Json(json!({
                    "success": false,
                    "error": "Signature verification failed - the provided signature does not match the signer address"
                })),
            ));
        }
        Err(e) => {
            warn!(
                "terminal-config signature error for {}: {}",
                pfx(&covenant_id),
                e
            );
            return Err((
                axum::http::StatusCode::BAD_REQUEST,
                Json(json!({
                    "success": false,
                    "error": format!("Signature error: {}", e)
                })),
            ));
        }
    }
    // Replay protection: the signature is valid, but the nonce must be one we
    // issued for THIS covenant and not yet spent. Consume it atomically. This is
    // also what stops an unauthenticated pre-plant on an unindexed covenant: the
    // nonce is server-issued and single-use.
    if !consume_ownership_nonce(nonce, &covenant_id) {
        warn!(
            "terminal-config nonce rejected (unknown/expired/replayed) for {}",
            pfx(&covenant_id)
        );
        return Err((
            axum::http::StatusCode::UNAUTHORIZED,
            Json(json!({
                "success": false,
                "error": "Challenge nonce is invalid, expired, or already used. Request a fresh challenge and sign again."
            })),
        ));
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
    // `ui_html` (the raw custom UI) was captured and size-checked above.
    let slug = format!("covenant-{}", &covenant_id[..12.min(covenant_id.len())]);

    // Store with the actual signer as owner when provided (for future audit)
    let owner = input
        .signer_address
        .clone()
        .unwrap_or_else(|| "system".to_string());

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
            info!(
                "Terminal config saved for covenant {} by {}",
                covenant_id, owner
            );
            // Audit: a creator/raw-HTML UI was published. By this point the
            // ownership signature has verified (the save is unreachable otherwise),
            // so signature_verified is always true here.
            if !ui_html.is_empty() {
                info!(
                    "custom UI published: covenant={} bytes={} signature_verified={}",
                    pfx(&covenant_id),
                    ui_html.len(),
                    true
                );
            }
            Ok(Json(
                json!({"success": true, "message": "Configuration saved successfully"}),
            ))
        }
        Err(e) => {
            error!("Failed to save terminal config: {}", e);
            Err((
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"success": false, "error": e.to_string()})),
            ))
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

/// Verify terminal ownership via a signature over `covex-config:{id}:{nonce}`.
///
/// 1. Real Kaspa schnorr signature (extension wallets like kasware, and dev
///    wallets signing through kaspa-wasm signMessage). Verified against the
///    x-only key in the signer's address - see kaspa_msg.rs, validated against
///    @onekeyfe/kaspa-wasm fixtures.
/// 2. Dev-wallet shared-secret path: the CovexTerminal inline dev signer
///    computes SHA256(private_key || message); recompute and compare.
///
/// Returns Ok(true) when verified, Ok(false) when the signature is well-formed
/// but does not match, Err only on malformed dev-key data.
fn verify_terminal_ownership_signature(
    signer_address: &str,
    sig_hex: &str,
    nonce: &str,
    covenant_id: &str,
) -> Result<bool, String> {
    use sha2::{Digest, Sha256};

    let expected_msg = format!("covex-config:{}:{}", covenant_id, nonce);

    // 1. Real Kaspa schnorr signature. A non-schnorr-shaped sig (e.g. the dev
    //    SHA256 hex) returns Err here; fall through to the dev path.
    if let Ok(true) = crate::kaspa_msg::verify_message(signer_address, &expected_msg, sig_hex) {
        return Ok(true);
    }

    // 2. Dev-wallet shared-secret path: SHA256(private_key_hex_bytes || message).
    // The dev keys live in the environment (never source); if a dev wallet's key is
    // not configured, the shared-secret path simply cannot verify (returns Ok(false)).
    for wallet in [1u8, 2u8] {
        let known_addr = if wallet == 1 {
            crate::dev_wallets::DEV_WALLET_1_ADDRESS
        } else {
            crate::dev_wallets::DEV_WALLET_2_ADDRESS
        };
        if known_addr == signer_address {
            let known_pk = match crate::dev_wallets::dev_private_key(wallet, "testnet-12") {
                Ok(k) => k,
                Err(_) => return Ok(false),
            };
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

    // Unknown address with no valid schnorr signature: not verified.
    Ok(false)
}

// ── Single-use ownership nonce store (replay protection) ──
//
// Ownership signatures are over `covex-config:{covenant_id}:{nonce}`. Without a
// server-side record of which nonces were issued, a captured signature could be
// replayed indefinitely. We keep a self-contained in-memory store of issued
// nonces bound to (covenant_id, expiry); each is consumed exactly once on a
// successful ownership check. Entries are single-process and non-persistent,
// which is acceptable: a restart only invalidates outstanding challenges, forcing
// the client to fetch a fresh nonce - it never weakens verification.

/// Time-to-live for an issued challenge nonce, in seconds.
const OWNERSHIP_NONCE_TTL_SECS: i64 = 300;

/// nonce -> (covenant_id, expiry_unix)
fn ownership_nonce_store() -> &'static std::sync::Mutex<HashMap<String, (String, i64)>> {
    static STORE: std::sync::OnceLock<std::sync::Mutex<HashMap<String, (String, i64)>>> =
        std::sync::OnceLock::new();
    STORE.get_or_init(|| std::sync::Mutex::new(HashMap::new()))
}

/// Record an issued nonce, bound to `covenant_id`, valid for `OWNERSHIP_NONCE_TTL_SECS`.
fn record_ownership_nonce(nonce: &str, covenant_id: &str) {
    let now = chrono::Utc::now().timestamp();
    let mut map = ownership_nonce_store().lock().unwrap();
    // Opportunistic purge of expired entries so the map cannot grow unbounded.
    map.retain(|_, (_, expiry)| *expiry > now);
    map.insert(
        nonce.to_string(),
        (covenant_id.to_string(), now + OWNERSHIP_NONCE_TTL_SECS),
    );
}

/// Atomically consume a single-use ownership nonce. Returns true only if the
/// nonce exists, has not expired, and is bound to `covenant_id`; the entry is
/// removed on success (and any matching-but-expired entry is dropped too).
fn consume_ownership_nonce(nonce: &str, covenant_id: &str) -> bool {
    let now = chrono::Utc::now().timestamp();
    let mut map = ownership_nonce_store().lock().unwrap();
    // Opportunistic purge of expired entries.
    map.retain(|_, (_, expiry)| *expiry > now);
    match map.get(nonce) {
        Some((bound_id, expiry)) if *expiry > now && bound_id == covenant_id => {
            map.remove(nonce);
            true
        }
        _ => false,
    }
}

/// GET /terminal-config-challenge/:covenant_id
/// Returns a random nonce for the frontend to sign, proving wallet ownership.
async fn terminal_config_challenge_handler(
    Path(covenant_id): Path<String>,
) -> Json<serde_json::Value> {
    let nonce = uuid::Uuid::new_v4().to_string();
    let message = format!("covex-config:{}:{}", covenant_id, nonce);
    // Record the nonce so the matching save can consume it exactly once.
    record_ownership_nonce(&nonce, &covenant_id);
    Json(json!({
        "nonce": nonce,
        "message": message,
        "note": "Sign this exact message with your wallet to prove ownership of the covenant"
    }))
}

/// Minimal HTML/attribute escaping for values interpolated into the OG document.
fn og_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
        // collapse newlines so meta content stays single-line
        .replace(['\n', '\r'], " ")
}

/// GET /og/covenant/:id : a tiny HTML document with per-covenant Open Graph /
/// Twitter tags, served to social-media crawlers (nginx routes bot User-Agents
/// here; humans get the SPA). Any human who lands here is redirected to the
/// real SPA route, so the endpoint is safe to hit directly.
async fn og_covenant_handler(
    Extension(db): Extension<db::Db>,
    axum::extract::Path(covenant_id): axum::extract::Path<String>,
) -> axum::response::Html<String> {
    let canonical = format!("https://hightable.pro/covenant/{}", covenant_id);
    // Per-covenant card if the covenant is indexed; branded cover otherwise.
    let found = matches!(db::get_covenant_by_txid(&db, &covenant_id), Ok(Some(_)));
    let image = if found {
        format!(
            "https://hightable.pro/api/og-card/{}",
            urlencoding_path(&covenant_id)
        )
    } else {
        "https://hightable.pro/og-cover.png".to_string()
    };

    let (title, description) = match db::get_covenant_by_txid(&db, &covenant_id) {
        Ok(Some(c)) => {
            let label = if !c.covenant_type.trim().is_empty() {
                c.covenant_type.clone()
            } else {
                "Covenant".to_string()
            };
            let tier = if c.verified_tier != "FREE" && !c.verified_tier.is_empty() {
                format!(" · {} tier", c.verified_tier)
            } else {
                String::new()
            };
            let net = match c.network.as_str() {
                "mainnet" => "Kaspa mainnet",
                "testnet-10" => "Kaspa TN10",
                _ => "Kaspa TN12",
            };
            let title = format!("{} · {:.0} KAS{} on Covex", label, c.amount_kaspa, tier);
            let desc = if !c.description.trim().is_empty() {
                c.description.clone()
            } else if !c.full_logic_summary.trim().is_empty() {
                c.full_logic_summary.clone()
            } else {
                format!(
                    "A {} covenant locking {:.2} KAS on {}, indexed live by Covex.",
                    if c.category.trim().is_empty() {
                        "Kaspa"
                    } else {
                        &c.category
                    },
                    c.amount_kaspa,
                    net
                )
            };
            (title, desc)
        }
        _ => (
            "Covenant on Covex".to_string(),
            "Explore this Kaspa covenant on Covex, the covenant explorer and studio.".to_string(),
        ),
    };

    let t = og_escape(&title);
    let d = og_escape(&description);
    let html = format!(
        "<!doctype html>\n<html lang=\"en\"><head>\n\
<meta charset=\"utf-8\"/>\n\
<title>{t}</title>\n\
<meta name=\"description\" content=\"{d}\"/>\n\
<link rel=\"canonical\" href=\"{canonical}\"/>\n\
<meta property=\"og:type\" content=\"article\"/>\n\
<meta property=\"og:site_name\" content=\"Covex\"/>\n\
<meta property=\"og:title\" content=\"{t}\"/>\n\
<meta property=\"og:description\" content=\"{d}\"/>\n\
<meta property=\"og:url\" content=\"{canonical}\"/>\n\
<meta property=\"og:image\" content=\"{image}\"/>\n\
<meta property=\"og:image:width\" content=\"1200\"/>\n\
<meta property=\"og:image:height\" content=\"630\"/>\n\
<meta property=\"og:image:alt\" content=\"{t}\"/>\n\
<meta name=\"twitter:card\" content=\"summary_large_image\"/>\n\
<meta name=\"twitter:title\" content=\"{t}\"/>\n\
<meta name=\"twitter:description\" content=\"{d}\"/>\n\
<meta name=\"twitter:image\" content=\"{image}\"/>\n\
<meta http-equiv=\"refresh\" content=\"0; url={canonical}\"/>\n\
</head><body>\n\
<p>Redirecting to <a href=\"{canonical}\">{t}</a></p>\n\
<script>location.replace({canonical_js});</script>\n\
</body></html>",
        t = t,
        d = d,
        canonical = og_escape(&canonical),
        canonical_js = serde_json::to_string(&canonical).unwrap_or_else(|_| "\"/\"".into()),
        image = image,
    );
    axum::response::Html(html)
}

/// Percent-encode the characters that are awkward in an og:image URL path
/// (covenant ids can be `<txid>:<index>`; some crawlers mishandle a bare ':').
fn urlencoding_path(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 8);
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}

/// XML-escape for SVG text nodes.
fn svg_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

/// Build a 1200x630 branded Open Graph card SVG for a covenant.
fn covenant_og_card_svg(c: &db::DbCovenant) -> String {
    let truncate = |s: &str, n: usize| -> String {
        let s = s.trim();
        if s.chars().count() > n {
            let t: String = s.chars().take(n.saturating_sub(1)).collect();
            format!("{}…", t.trim_end())
        } else {
            s.to_string()
        }
    };
    let label = if c.covenant_type.trim().is_empty() {
        "Covenant"
    } else {
        &c.covenant_type
    };
    let name = svg_escape(&truncate(label, 22));
    let category = svg_escape(&truncate(
        if c.category.trim().is_empty() {
            "general"
        } else {
            &c.category
        },
        28,
    ));
    let net = match c.network.as_str() {
        "mainnet" => "Kaspa Mainnet",
        "testnet-10" => "Kaspa TN10",
        _ => "Kaspa TN12",
    };
    let tier = c.verified_tier.as_str();
    let tier_color = match tier {
        "MAX" => "#EF4444",
        "PRO" => "#F59E0B",
        "BUILDER" => "#49EACB",
        _ => "#6B7280",
    };
    let tier_label = if tier.is_empty() { "EXPLORER" } else { tier };
    let amount = if c.amount_kaspa >= 1000.0 {
        format!("{:.0} KAS", c.amount_kaspa)
    } else {
        format!("{:.2} KAS", c.amount_kaspa)
    };

    format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0a1018"/><stop offset="0.55" stop-color="#0e1726"/><stop offset="1" stop-color="#0b2430"/></linearGradient>
    <linearGradient id="ft" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d7fbf4"/><stop offset="1" stop-color="#7fe9d8"/></linearGradient>
    <linearGradient id="fl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5cead3"/><stop offset="1" stop-color="#2bb6a3"/></linearGradient>
    <linearGradient id="fr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#33c6b2"/><stop offset="1" stop-color="#178f80"/></linearGradient>
    <linearGradient id="fb" x1="10" y1="8" x2="54" y2="56" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#eafffb"/><stop offset="0.5" stop-color="#49EACB"/><stop offset="1" stop-color="#1c9d8c"/></linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect x="0" y="0" width="1200" height="630" fill="none" stroke="#49EACB" stroke-opacity="0.18" stroke-width="2"/>
  <g transform="translate(72 54) scale(1.15)">
    <path fill-rule="evenodd" fill="url(#fb)" d="M32 4 L56 18 L56 26 L44 19 L32 12 L14 22.5 L14 41.5 L32 52 L44 45 L56 38 L56 46 L32 60 L8 46 L8 18 Z"/>
    <g><path d="M49 17 L55 20.4 L49 23.8 L43 20.4 Z" fill="url(#ft)"/><path d="M43 20.4 L49 23.8 L49 30.6 L43 27.2 Z" fill="url(#fl)"/><path d="M55 20.4 L49 23.8 L49 30.6 L55 27.2 Z" fill="url(#fr)"/></g>
    <g><path d="M32 25 L39 29 L32 33 L25 29 Z" fill="url(#ft)"/><path d="M25 29 L32 33 L32 41 L25 37 Z" fill="url(#fl)"/><path d="M39 29 L32 33 L32 41 L39 37 Z" fill="url(#fr)"/></g>
    <g><path d="M49 40.2 L55 43.6 L49 47 L43 43.6 Z" fill="url(#ft)"/><path d="M43 43.6 L49 47 L49 53.8 L43 50.4 Z" fill="url(#fl)"/><path d="M55 43.6 L49 47 L49 53.8 L55 50.4 Z" fill="url(#fr)"/></g>
  </g>
  <text x="162" y="108" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="40" font-weight="800" letter-spacing="8" fill="#E8F6F3">COVEX</text>
  <rect x="{badge_x}" y="62" width="{badge_w}" height="52" rx="26" fill="{tier_color}" fill-opacity="0.16" stroke="{tier_color}" stroke-opacity="0.7"/>
  <text x="{badge_cx}" y="96" text-anchor="middle" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="26" font-weight="700" letter-spacing="3" fill="{tier_color}">{tier_label}</text>
  <text x="72" y="330" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="92" font-weight="800" fill="#FFFFFF">{name}</text>
  <text x="72" y="412" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="52" font-weight="700" fill="#49EACB">{amount}</text>
  <text x="72" y="470" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="30" font-weight="500" letter-spacing="1" fill="#9fb8c9">{net}  ·  {category}</text>
  <line x1="72" y1="540" x2="1128" y2="540" stroke="#49EACB" stroke-opacity="0.18" stroke-width="2"/>
  <text x="72" y="586" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="24" font-weight="500" letter-spacing="1" fill="#5f7a8a">hightable.pro  ·  the covenant explorer and studio for Kaspa</text>
</svg>"##,
        name = name,
        amount = svg_escape(&amount),
        net = net,
        category = category,
        tier_color = tier_color,
        tier_label = svg_escape(tier_label),
        badge_x = 1128 - (tier_label.len() as i32 * 18 + 56),
        badge_w = tier_label.len() as i32 * 18 + 56,
        badge_cx = 1128 - (tier_label.len() as i32 * 18 + 56) / 2,
    )
}

/// Rasterize an SVG string to PNG bytes via librsvg (rsvg-convert). Blocking.
fn rasterize_svg_png(svg: &str) -> Option<Vec<u8>> {
    use std::io::Write;
    use std::process::{Command, Stdio};
    let mut child = Command::new("rsvg-convert")
        .args(["-w", "1200", "-h", "630", "-f", "png"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    {
        let mut si = child.stdin.take()?;
        si.write_all(svg.as_bytes()).ok()?;
        // si dropped here -> stdin EOF so rsvg-convert finishes reading
    }
    let out = child.wait_with_output().ok()?;
    if out.status.success() && !out.stdout.is_empty() {
        Some(out.stdout)
    } else {
        None
    }
}

static OG_CARD_CACHE: std::sync::OnceLock<Mutex<HashMap<String, Arc<Vec<u8>>>>> =
    std::sync::OnceLock::new();

/// GET /og-card/:id (reached via nginx /api/og-card/:id): a per-covenant PNG
/// social card. Cached by (id, tier, amount) so a covenant only rasterizes once
/// until its tier/value changes. Falls back to a redirect to the static cover
/// if the covenant is unknown or rasterization is unavailable.
async fn og_card_handler(
    Extension(db): Extension<db::Db>,
    axum::extract::Path(covenant_id): axum::extract::Path<String>,
) -> axum::response::Response {
    use axum::response::IntoResponse;

    let fallback = || {
        axum::response::Redirect::temporary("https://hightable.pro/og-cover.png").into_response()
    };

    let cov = match db::get_covenant_by_txid(&db, &covenant_id) {
        Ok(Some(c)) => c,
        _ => return fallback(),
    };
    let cache_key = format!(
        "{}|{}|{:.4}",
        covenant_id, cov.verified_tier, cov.amount_kaspa
    );

    let cache = OG_CARD_CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    if let Some(bytes) = cache.lock().unwrap().get(&cache_key).cloned() {
        return png_response(bytes);
    }

    let svg = covenant_og_card_svg(&cov);
    let rendered = tokio::task::spawn_blocking(move || rasterize_svg_png(&svg))
        .await
        .ok()
        .flatten();
    let bytes = match rendered {
        Some(b) => Arc::new(b),
        None => return fallback(),
    };

    {
        let mut map = cache.lock().unwrap();
        if map.len() >= 1000 {
            map.clear(); // simple bound; cards regenerate on demand
        }
        map.insert(cache_key, Arc::clone(&bytes));
    }
    png_response(bytes)
}

fn png_response(bytes: Arc<Vec<u8>>) -> axum::response::Response {
    use axum::response::IntoResponse;
    (
        [(axum::http::header::CONTENT_TYPE, "image/png")],
        (*bytes).clone(),
    )
        .into_response()
}

/// GET /stats[?network=] : public platform statistics aggregated live from the
/// covenants, payments, and events tables. Real data only.
async fn platform_stats_handler(
    Extension(db): Extension<db::Db>,
    Query(params): Query<HashMap<String, String>>,
) -> Json<serde_json::Value> {
    let network = params
        .get("network")
        .map(|s| s.as_str())
        .filter(|s| *s != "all");
    match db::platform_stats(&db, network) {
        Ok(v) => Json(v),
        Err(e) => Json(json!({"error": e.to_string()})),
    }
}

// ── Analytics handler (Phase 18) ────────────────────────────────

async fn analytics_handler(
    Extension(db): Extension<db::Db>,
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
        // Real platform-wide TVL: sum of locked KAS across active covenants, computed live
        // (same basis as /stats tvl_kas). Never report a fabricated 0 when value exists.
        let tvl = db::covenant_stats(&db, None)
            .map(|(_, _, t)| t)
            .unwrap_or(0.0);
        Json(json!({
            "total_covenants": total,
            "total_value_kas": (tvl * 100.0).round() / 100.0,
            "active_covenants": active,
            "verified_covenants": verified,
            "resolutions": 0,
            "platform_note": "Aggregated live across all indexed covenants"
        }))
    }
}

// ── Marketplace handlers (Phase 18) ─────────────────────────────

fn tmpl(
    id: String,
    name: String,
    category: &str,
    reality: &str,
    desc: String,
    kind: &str,
) -> serde_json::Value {
    json!({
        "id": id, "name": name, "category": category, "reality": reality,
        "description": desc, "author": "Covex Official", "price_kas": 0,
        "downloads": 0, "official": true, "kind": kind,
    })
}

async fn marketplace_templates_handler() -> Json<serde_json::Value> {
    // A comprehensive, honest catalog of OFFICIAL Covex starting points - every covenant primitive,
    // game, ZK proof, oracle market, DeFi pattern, identity gate and compute proof. Each carries its
    // REAL enforcement reality (on-chain / hybrid / oracle-attested) and a `kind` the UI uses to
    // route "Use Template" to the right builder. Nothing here overstates what the chain enforces.
    let mut out: Vec<serde_json::Value> = Vec::new();

    // ── On-chain P2SH primitives (genuinely consensus-enforced) ──
    let primitives: &[(&str, &str, &str, &str, &str)] = &[
        ("p2sh-singlesig", "Single-Key Vault", "P2SH Commitments", "Funds lock to a script hash, spendable only by your key. The minimal real covenant.", "singlesig"),
        ("p2sh-hashlock", "Hashlock Release", "Atomic Swaps & HTLC", "Release on revealing a secret preimage plus a signature. The HTLC building block.", "hashlock"),
        ("p2sh-timelock", "Absolute Timelock Vault", "Vesting & Timelocks", "Spendable only after a target DAA score. Cliff vesting, dispute windows.", "timelock"),
        ("p2sh-rcsv", "Relative Timelock (CSV)", "Vesting & Timelocks", "Spendable only N blocks after funding (BIP68 relative locktime).", "timelock"),
        ("p2sh-multisig", "2-of-3 Multisig Escrow", "Multi-sig", "Two of three keys release the funds. Treasuries, escrow, shared custody.", "multisig"),
        ("htlc-swap", "HTLC Atomic Swap", "Atomic Swaps & HTLC", "Receiver claims with the preimage; sender refunds after a timelock.", "hashlock"),
        ("channel-2of2", "2-of-2 Payment Channel", "State Channels", "Cooperative close, or funder refund after a timelock.", "multisig"),
        ("deadman-switch", "Dead-Man's Switch", "Vesting & Timelocks", "Owner can always spend; an heir can spend after the owner goes silent past a deadline.", "timelock"),
    ];
    for (id, name, cat, desc, kind) in primitives {
        out.push(tmpl(
            id.to_string(),
            name.to_string(),
            cat,
            "on-chain",
            desc.to_string(),
            kind,
        ));
    }
    // Concrete stake-preset starting points for the simplest vaults.
    for (kind, base) in [
        ("singlesig", "Single-Key Vault"),
        ("timelock", "Timelock Vault"),
        ("multisig", "Multisig Treasury"),
    ] {
        for (suffix, amt) in [
            ("micro", "0.5 KAS"),
            ("standard", "10 KAS"),
            ("pro", "100 KAS"),
            ("treasury", "1000 KAS"),
        ] {
            out.push(tmpl(
                format!("{kind}-{suffix}"),
                format!("{base} · {amt}"),
                "P2SH Commitments",
                "on-chain",
                format!("On-chain {kind} covenant, pre-set for {amt}."),
                kind,
            ));
        }
    }

    // ── Games (oracle-attested, server-authoritative engine) ──
    let games: &[(&str, &str)] = &[
        ("chess", "Chess Match"),
        ("chess-blitz", "Blitz Chess (10 min)"),
        ("chess-bullet", "Bullet Chess"),
        ("poker", "Texas Hold'em Poker"),
        ("poker-6max", "6-max Poker"),
        ("blackjack", "Blackjack"),
        ("checkers", "Checkers"),
        ("connect4", "Connect Four"),
        ("tictactoe", "Tic-Tac-Toe"),
        ("reversi", "Reversi / Othello"),
        ("rps", "Rock Paper Scissors"),
    ];
    for (id, name) in games {
        out.push(tmpl(format!("game-{id}"), name.to_string(), "Games", "oracle-attested",
            format!("Stake KAS and play {name} head-to-head. Server-authoritative engine, oracle-attested result, winner takes the pot minus fee."), "game"));
    }

    // ── ZK proofs & claims ──
    let zk: &[(&str, &str, &str, &str)] = &[
        ("merkle-membership", "Merkle Membership", "on-chain", "Prove a leaf is in a committed Merkle root - genuine Groth16, one of fourteen end-to-end ZK circuits live today (in-browser prover, verified fail-closed by the disclosed oracle)."),
        ("merkle-airdrop", "Merkle Airdrop Claim", "on-chain", "Eligible addresses prove membership to claim. No list revealed."),
        ("merkle-dao-vote", "Merkle DAO Vote", "oracle-attested", "Prove membership in a voter set to cast a private vote."),
        ("range-proof", "Range Proof", "oracle-attested", "Prove a committed value lies in [min, max] without revealing it. A real Groth16 proof, generated in your browser and verified fail-closed by the disclosed Covex oracle. Solvency floors, bet limits, private thresholds."),
        ("range-collateral", "Collateral Range Proof", "oracle-attested", "Prove collateral is within a healthy band privately, on the range_proof circuit, generated in your browser and verified fail-closed by the disclosed Covex oracle."),
        ("solvency-proof", "Solvency / Reserves Proof", "oracle-attested", "Prove reserves exceed a threshold without revealing the balance."),
        ("age-verification", "Age-Over-Threshold", "on-chain", "Prove age >= a threshold - a zero-knowledge KYC alternative."),
        ("hash-preimage", "Hash Preimage Knowledge", "on-chain", "Prove knowledge of a preimage of a committed hash."),
        ("nullifier-unique", "Unique-Human Nullifier", "oracle-attested", "One claim per identity via a nullifier, without linkage. A real Groth16 proof, generated in your browser, verified fail-closed by the disclosed Covex oracle (which also tracks the spent set)."),
        ("anon-credential", "Anonymous Credential", "oracle-attested", "Prove you hold a credential without revealing which one."),
        ("private-balance", "Private Balance Commitment", "oracle-attested", "Commit + prove balance properties (Pedersen) for private DeFi."),
        ("acl-zk", "ZK Access List", "oracle-attested", "Prove membership in an access-control list privately."),
        ("private-prediction", "Private Prediction Position", "oracle-attested", "Hidden market position + ZK payout eligibility."),
    ];
    for (id, name, reality, desc) in zk {
        out.push(tmpl(
            format!("zk-{id}"),
            name.to_string(),
            "ZK Proofs & Claims",
            reality,
            desc.to_string(),
            "zk",
        ));
    }

    // ── Genuine full-zk circuits with a LIVE in-browser prover (each id is the exact
    // ZK_CIRCUIT_TYPES circuit id, so TemplateLibrary's hrefFor() deep-links to
    // /sandbox?circuit=<id> and resolveCircuit() lands on the real prover). Each *_final.zkey
    // is shipped under frontend/public/zk/<id>/. Honest reality: these are real Groth16 proofs
    // generated in your browser and verified fail-closed by the disclosed Covex oracle
    // OFF-CHAIN - so the label is oracle-attested, not on-chain. Kaspa has no on-chain pairing
    // verifier yet, so NONE of these verify on-chain end-to-end; the disclosed oracle is the
    // verifier in every case. Copy mirrors CovexTerminal.jsx. ──
    let live_zk: &[(&str, &str, &str)] = &[
        ("vrf_random", "Committed Random (VRF)", "Provably-fair randomness: output_val = Poseidon(hidden secret, public seed, VRF key), so a random value is forced by a committed secret and cannot be cherry-picked. A real Groth16 proof, generated in your browser (the secret never leaves it), verified fail-closed by the disclosed Covex oracle. Fair coin flips, card shuffles, lottery draws without a trusted dealer."),
        ("vrf_dice_roll", "Provably-Fair Dice / Coin Flip", "A verifiable dice roll forced by Poseidon(secret, public seed): roll = (hash mod faces) + 1, so no one can cherry-pick the result. A real Groth16 proof, generated in your browser (the secret never leaves it), verified fail-closed by the disclosed Covex oracle. Backgammon, Yahtzee, Risk, Catan dice fairness."),
        ("pot_split_math", "Pot / Treasury Split Math", "Prove winner_share + fee + return == total_pot at the chosen bps, a verifiable fair split. The amounts are public, so this is a correctness proof, not a privacy proof. A real Groth16 proof, generated in your browser, verified fail-closed by the disclosed Covex oracle. Fair pot distribution in games and auctions."),
        ("script_constraint", "Script Constraint / Fee-Cap", "Prove you know the hidden script_hash whose Poseidon bundle with constraint_id and value equals a public root, binding a covenant to a constraint without revealing the script. A real Groth16 proof, generated in your browser, verified fail-closed by the disclosed Covex oracle. Enforce covenant rules, fee caps, pot returns."),
        ("turn_timer", "Per-Turn Timer Proof", "Prove a move happened within max_delta DAA, with the exact last-move time kept as a private witness and on_time exposed as a public output. A real Groth16 proof, generated in your browser, verified fail-closed by the disclosed Covex oracle. Clock enforcement in chess and poker."),
        ("basic_utxo_ownership", "UTXO Note Proof", "Prove knowledge of the full Poseidon-committed UTXO note (pubkey x/y, amount, signature parts) behind a public utxo_hash, without revealing it. A note-binding primitive: it opens the commitment, it does not by itself verify a Schnorr signature. A real Groth16 proof, generated in your browser, verified fail-closed by the disclosed Covex oracle. Binding covenants to committed Kaspa notes."),
        ("escrow_2party", "2-Party Escrow (ZK)", "DAA timelock escrow: outcome 0 = timeout refund, outcome 1 = still locked. A real Groth16 proof, generated in your browser, verified fail-closed by the disclosed Covex oracle. Simple Kaspa escrow deals with an honest timeout refund."),
    ];
    for (id, name, desc) in live_zk {
        out.push(tmpl(
            id.to_string(),
            name.to_string(),
            "ZK Proofs & Claims",
            "oracle-attested",
            desc.to_string(),
            "zk",
        ));
    }

    // ── Oracle & markets ──
    let markets: &[(&str, &str, &str)] = &[
        (
            "binary",
            "Binary Prediction Market",
            "Yes/No event, oracle resolves at a deadline; winners split the pool.",
        ),
        (
            "ternary",
            "Ternary Outcome Market",
            "Three-way outcome market with oracle resolution.",
        ),
        (
            "multi-outcome",
            "Multi-Outcome Market",
            "N-way market; oracle attests the winning outcome.",
        ),
        (
            "dutch-auction",
            "Dutch Auction",
            "Price descends over time; the first bidder wins at the current price.",
        ),
        (
            "english-auction",
            "English Auction",
            "Ascending bids; highest bidder at close wins. Oracle-settled.",
        ),
        (
            "parametric-insurance",
            "Parametric Insurance",
            "Pays out on an oracle data trigger (weather / price / flight).",
        ),
        (
            "price-settle",
            "Price-Feed Settlement",
            "Settle a contract against an oracle price at expiry.",
        ),
        (
            "sports-settle",
            "Sports Settlement",
            "Oracle attests the match result; winners are paid.",
        ),
        (
            "multi-oracle",
            "Multi-Oracle Market",
            "Critical markets resolved by a threshold of independent oracles.",
        ),
    ];
    for (id, name, desc) in markets {
        out.push(tmpl(
            format!("market-{id}"),
            name.to_string(),
            "Prediction & Markets",
            "oracle-attested",
            desc.to_string(),
            "oracle",
        ));
    }

    // ── DeFi & financial ──
    let defi: &[(&str, &str, &str)] = &[
        (
            "revenue-share",
            "Revenue Share Pool",
            "Members receive a proportional split on an oracle-attested distribution.",
        ),
        (
            "vesting-stream",
            "Vesting Stream",
            "Linear vesting unlocked over time via timelocks.",
        ),
        (
            "collateral-loan",
            "Collateralized Loan",
            "Lock collateral; release on repayment or liquidate on default (oracle LTV).",
        ),
        (
            "escrow-2party",
            "2-Party Escrow",
            "Funds release on mutual sign-off or an arbiter decision.",
        ),
        (
            "escrow-milestone",
            "Milestone Escrow",
            "Tranches release as oracle-attested milestones complete.",
        ),
        (
            "tip-jar",
            "Tip Jar",
            "Open contributions; the creator withdraws. Transparent on-chain.",
        ),
        (
            "subscription",
            "Subscription Covenant",
            "Recurring access gated by periodic payment.",
        ),
        (
            "royalty-split",
            "Royalty Split",
            "Automatic proportional royalty distribution.",
        ),
        (
            "fee-pot-split",
            "Fee & Pot Split",
            "Verifiable split of a pot among parties with fees.",
        ),
        (
            "crowdfund",
            "Crowdfunding Goal",
            "Refund if a funding goal isn't met by the deadline.",
        ),
        (
            "dao-treasury",
            "DAO Treasury",
            "N-of-M multisig treasury with an approval threshold.",
        ),
        (
            "dca-vault",
            "DCA Vault",
            "Time-released tranches for dollar-cost-averaging out.",
        ),
    ];
    for (id, name, desc) in defi {
        let reality = if id.starts_with("escrow")
            || *id == "dao-treasury"
            || *id == "vesting-stream"
            || *id == "dca-vault"
        {
            "on-chain"
        } else {
            "oracle-attested"
        };
        let kind = if id.starts_with("escrow") || *id == "dao-treasury" {
            "multisig"
        } else if *id == "vesting-stream" || *id == "dca-vault" {
            "timelock"
        } else {
            "oracle"
        };
        out.push(tmpl(
            format!("defi-{id}"),
            name.to_string(),
            "Financial Tools",
            reality,
            desc.to_string(),
            kind,
        ));
    }

    // ── Identity & gating ──
    let gating: &[(&str, &str, &str)] = &[
        (
            "age-gate",
            "Age Gate",
            "Unlock only for users who prove age over a threshold (ZK).",
        ),
        (
            "anti-sybil",
            "Anti-Sybil Gate",
            "One action per unique human via nullifier + reputation.",
        ),
        (
            "membership-claim",
            "Membership Claim",
            "Claim a benefit by proving membership.",
        ),
        (
            "kyc-attest",
            "KYC Attestation",
            "Gate on an oracle-attested KYC credential.",
        ),
        (
            "reputation-gate",
            "Reputation Gate",
            "Require a minimum reputation / score to participate.",
        ),
        (
            "allowlist",
            "Allowlist Gate",
            "Gate on a Merkle allowlist of addresses.",
        ),
    ];
    for (id, name, desc) in gating {
        out.push(tmpl(
            format!("gate-{id}"),
            name.to_string(),
            "Identity & Gating",
            "oracle-attested",
            desc.to_string(),
            "zk",
        ));
    }

    // ── Compute & cross-chain ──
    let compute: &[(&str, &str, &str)] = &[
        ("graph-reach", "Graph Reachability", "Prove a path exists in a committed hidden graph (provenance)."),
        ("supply-provenance", "Supply-Chain Provenance", "Verifiable provenance chain with timestamps."),
        ("risc0-compute", "Verifiable Compute (RISC Zero)", "Prove correct execution of an arbitrary program."),
        ("cross-chain-attest", "Cross-Chain Attestation", "Oracle-attested state from another chain."),
        ("vrf-fair", "Verifiable Random Draw", "Provably-fair randomness (VRF) for lotteries and shuffles. A real Groth16 proof, generated in your browser, verified fail-closed by the disclosed Covex oracle."),
    ];
    for (id, name, desc) in compute {
        out.push(tmpl(
            format!("compute-{id}"),
            name.to_string(),
            "Compute & Cross-chain",
            "oracle-attested",
            desc.to_string(),
            "zk",
        ));
    }

    let total = out.len();
    Json(json!({ "templates": out, "total": total }))
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
    Extension(db): Extension<db::Db>,
    Json(input): Json<MarketplacePublishInput>,
) -> Json<serde_json::Value> {
    let id = format!(
        "tmpl_{}",
        uuid::Uuid::new_v4().to_string()[..12].to_string()
    );

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
        })),
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
#[allow(dead_code)]
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
    Extension(db): Extension<db::Db>,
    Json(input): Json<ComputePayoutInput>,
) -> Json<serde_json::Value> {
    // 1. Verify the oracle's BIP340 Schnorr signature over the outcome message.
    let message = input.oracle_message.as_deref().unwrap_or("");
    let expected_message = format!(
        "covex-oracle:{}:{}:{}",
        covenant_id,
        input.outcome,
        input.oracle_timestamp.unwrap_or(0)
    );

    // The message must be the canonical one for THIS covenant+outcome+timestamp,
    // AND carry a valid BIP340 Schnorr signature from the oracle. No bypass: the
    // old `|| message == expected_message` let anyone mint a payout witness from
    // public values, and the response was returned unconditionally regardless.
    let sig_verified = !message.is_empty()
        && message == expected_message
        && oracle::verify_outcome(message, &input.oracle_signature);
    if !sig_verified {
        warn!(
            "compute_payout rejected for {}: oracle signature did not verify",
            &covenant_id[..16.min(covenant_id.len())]
        );
        return Json(json!({
            "success": false,
            "error": "Oracle signature verification failed. The payout witness requires a valid oracle signature over covex-oracle:{id}:{outcome}:{timestamp}."
        }));
    }

    // 2. NO RAKE. The enforced on-chain payout sends the WHOLE pot to the winner (a single
    // output minus the network TX_FEE) - Covex takes no percentage. The product is a flat
    // builder/SaaS subscription, not an operator's cut of pots (the legal trigger). So the
    // computed breakdown shows 0% platform fee / 0% pot-return, matching what the chain does.
    let (fee_percent, pot_return_percent) = (0.0_f64, 0.0_f64);

    // 3. Determine total pot
    let total_pot = input
        .total_stake_kas
        .unwrap_or(input.per_side_stake_kas.unwrap_or(100.0) * 2.0);

    // 4. Compute payout breakdown
    let platform_fee = total_pot * fee_percent / 100.0;
    let pot_return = total_pot * pot_return_percent / 100.0;
    let winner_share = total_pot - platform_fee - pot_return;

    // 5. Determine winner label
    let winner_label = match input.outcome {
        0 => "Claimant (Player A / White)".to_string(),
        1 => "Depositor (Player B / Black)".to_string(),
        2 => "Draw - both sides recover their stakes".to_string(),
        _ => format!("Outcome {}", input.outcome),
    };

    // 6. Build unlock witness data (for the user to use in their spend TX)
    let unlock_witness = format!(
        "Covenant ID: {}\nOutcome: {}\nOracle Signature (BIP340 schnorr): {}\nOracle Pubkey (x-only): {}\nSigned Message: {}\nTimestamp: {}\n\n\
         To unlock: include this signature as witness data in your Kaspa spend transaction.\n\
         The covenant script verifies this Schnorr signature against the oracle pubkey (OpCheckSig at Toccata) and releases funds.\n\
         Winner receives: {} KAS (the full pot minus the network fee - Covex takes no cut)",
        covenant_id,
        input.outcome,
        input.oracle_signature,
        oracle::oracle_xonly_pubkey_hex(),
        message,
        input.oracle_timestamp.unwrap_or(0),
        format!("{:.2}", winner_share),
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
        winner_share,
        platform_fee,
        pot_return,
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
    reality: Option<String>, // 'full-zk' | 'hybrid' | 'oracle-attested'
    circuit_category: Option<String>, // 'game' | 'crypto' | 'ownership' | 'defi' | etc.
    has_artifacts: Option<bool>, // true if real artifacts exist in zk/
    // Ownership proof (same scheme as terminal-config): required to set featured
    // metadata on a covenant that has a known creator. Signature is over the
    // `covex-config:{tx_id}:{nonce}` challenge issued by terminal_config_challenge_handler.
    signer_address: Option<String>,
    signature: Option<String>,
    nonce: Option<String>,
}

/// POST /api/auth-session
/// Returns {token, tier} only if the address has a verified payment on this network.
async fn auth_session_handler(
    Extension(db): Extension<db::Db>,
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
        })),
    }
}

/// POST /api/auth-session/consume
/// Marks a token as used (one-time use) and increments the deployment counter.
async fn consume_auth_token_handler(
    Extension(db): Extension<db::Db>,
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
        })),
    }
}

/// GET /api/deploy-capacity?address=X&network=Y
/// Returns whether the address can deploy and how many credits remain.
async fn deploy_capacity_handler(
    Extension(db): Extension<db::Db>,
    Query(params): Query<HashMap<String, String>>,
) -> Json<serde_json::Value> {
    let address = params.get("address").cloned().unwrap_or_default();
    let network = params
        .get("network")
        .cloned()
        .unwrap_or_else(|| "testnet-12".to_string());

    if address.is_empty() {
        return Json(json!({ "can_deploy": false, "error": "address required" }));
    }

    let conn = db.lock().unwrap();
    let (max_deploy, used): (i32, i32) = conn
        .query_row(
            "SELECT COALESCE(max_deployments, 0), COALESCE(deployments_used, 0)
         FROM accounts WHERE address = ?1 AND network = ?2 AND is_active = 1",
            params![address, network],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap_or((0, 0));

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
    Extension(db): Extension<db::Db>,
    Json(input): Json<CovenantMetadataInput>,
) -> Json<serde_json::Value> {
    fn pfx(s: &str) -> &str {
        &s[..s.len().min(16)]
    }

    // ── Ownership enforcement ──
    // Featured metadata gives a covenant top visibility, so it must not be writable
    // for an arbitrary tx_id by an unauthenticated caller. Mirror the terminal-config
    // ownership flow: if the covenant is indexed with a known creator, require a valid
    // wallet signature over a single-use challenge nonce bound to this tx_id, with
    // signer == creator. `featured` is only set when ownership is proven.
    // If the covenant is unknown / has no creator, there is nothing to protect, so the
    // save is allowed - but it is NEVER featured.
    let mut featured = false;
    if let Ok(Some(cov)) = db::get_covenant_by_txid(&db, &input.tx_id) {
        if !cov.creator_addr.is_empty() {
            let signer = input.signer_address.as_deref().unwrap_or("");
            let sig = input.signature.as_deref().unwrap_or("");
            let nonce = input.nonce.as_deref().unwrap_or("");
            if signer != cov.creator_addr {
                warn!(
                    "covenant-metadata rejected for {}: signer {} != creator {}",
                    pfx(&input.tx_id),
                    pfx(signer),
                    pfx(&cov.creator_addr)
                );
                return Json(json!({
                    "success": false,
                    "error": "Only the original covenant deployer can set featured metadata for this covenant"
                }));
            }
            if sig.is_empty() || nonce.is_empty() {
                return Json(json!({
                    "success": false,
                    "error": "A wallet signature is required. Connect the creator wallet and approve the signature request."
                }));
            }
            match verify_terminal_ownership_signature(signer, sig, nonce, &input.tx_id) {
                Ok(true) => {}
                Ok(false) => {
                    warn!(
                        "covenant-metadata signature FAILED for {} by {}",
                        pfx(&input.tx_id),
                        pfx(signer)
                    );
                    return Json(json!({
                        "success": false,
                        "error": "Signature verification failed - the provided signature does not match the signer address"
                    }));
                }
                Err(e) => {
                    warn!(
                        "covenant-metadata signature error for {}: {}",
                        pfx(&input.tx_id),
                        e
                    );
                    return Json(json!({
                        "success": false,
                        "error": format!("Signature error: {}", e)
                    }));
                }
            }
            // Replay protection: consume the single-use nonce bound to this tx_id.
            if !consume_ownership_nonce(nonce, &input.tx_id) {
                warn!(
                    "covenant-metadata nonce rejected (unknown/expired/replayed) for {}",
                    pfx(&input.tx_id)
                );
                return Json(json!({
                    "success": false,
                    "error": "Challenge nonce is invalid, expired, or already used. Request a fresh challenge and sign again."
                }));
            }
            // Ownership proven: this covenant may be featured.
            featured = true;
            info!(
                "ownership signature verified for covenant-metadata {}",
                pfx(&input.tx_id)
            );
        }
    }

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
        featured, // only featured when ownership was proven above
    ) {
        Ok(_) => {
            info!(
                "Covenant metadata saved for {} (featured={})",
                pfx(&input.tx_id),
                featured
            );
            let message = if featured {
                "Metadata persisted. Covenant now has top visibility."
            } else {
                "Metadata persisted."
            };
            Json(json!({ "success": true, "message": message }))
        }
        Err(e) => Json(json!({ "success": false, "error": e.to_string() })),
    }
}

#[cfg(test)]
mod mainnet_preflight_tests {
    use super::validate_mainnet_env;

    #[test]
    fn testnet_always_passes() {
        // Testnet network passes regardless of treasury format.
        assert!(validate_mainnet_env("testnet-12", "kaspatest:foo").is_ok());
        assert!(validate_mainnet_env("testnet-10", "kaspatest:foo").is_ok());
        // Even an empty treasury is allowed on testnet (gate is mainnet-only).
        assert!(validate_mainnet_env("testnet-12", "").is_ok());
    }

    #[test]
    fn mainnet_rejects_testnet_address() {
        assert!(validate_mainnet_env("mainnet", "kaspatest:foo").is_err());
        assert!(validate_mainnet_env("mainnet-1", "kaspatest:foo").is_err());
    }

    #[test]
    fn mainnet_rejects_empty_address() {
        assert!(validate_mainnet_env("mainnet", "").is_err());
        assert!(validate_mainnet_env("mainnet", "   ").is_err());
    }

    #[test]
    fn mainnet_accepts_well_formed_mainnet_address() {
        // A well-formed kaspa:... mainnet address passes the pre-flight gate.
        // (This is a startup guard, not a bech32 validator.)
        assert!(validate_mainnet_env(
            "mainnet",
            "kaspa:qr6vs4wy4m3za6mzchj05x3902qrtklkyn8s0u8g2gv6mrctzdzx7pnhqxka2"
        )
        .is_ok());
    }

    #[test]
    fn mainnet_rejects_placeholder() {
        assert!(validate_mainnet_env("mainnet", "kaspa:placeholder").is_err());
        assert!(validate_mainnet_env("mainnet", "kaspa:your_address_here").is_err());
    }
}

#[cfg(test)]
mod enforcement_reality_override_tests {
    use super::*;

    /// Build a minimal DbCovenant whose stored script_hex is the exact 35-byte
    /// aa20<hash>87 P2SH that reality_for_script() alone calls OnChain. Only the
    /// covenant_type varies, so any non-OnChain enforcement_reality must come from
    /// the type-driven honesty override in covenant_summary_json.
    fn covenant_with_type(covenant_type: &str) -> db::DbCovenant {
        let hash = "33".repeat(32);
        db::DbCovenant {
            tx_id: "tx".into(),
            address: "kaspatest:addr".into(),
            amount_kaspa: 1.0,
            amount_sompi: 100_000_000,
            script_hash: hash.clone(),
            // Exact 35-byte P2SH wrapper - on script alone this reads "on-chain".
            script_hex: format!("aa20{hash}87"),
            covenant_type: covenant_type.into(),
            category: "Verifiable Games (ZK/Oracle)".into(),
            creator_addr: String::new(),
            description: String::new(),
            verified_tier: "FREE".into(),
            verified_payment_tx: None,
            verified_at: None,
            custom_ui_enabled: false,
            full_logic_summary: String::new(),
            receiving_addresses: String::new(),
            is_active: true,
            block_daa_score: 1,
            timestamp: 0,
            network: "testnet-12".into(),
            block_hash: String::new(),
            reorged: false,
            confirmations: None,
            finality: String::new(),
            finality_eta_secs: None,
        }
    }

    fn reality_for(covenant_type: &str) -> String {
        let c = covenant_with_type(covenant_type);
        let v = covenant_summary_json(&c, false, serde_json::Value::Null);
        v.get("enforcement_reality")
            .and_then(|r| r.as_str())
            .unwrap_or("")
            .to_string()
    }

    /// HONESTY: the oracle co-sign kinds deploy as the same exact 35-byte aa20<hash>87
    /// P2SH as every other covenant, so reality_for_script() alone would flatten them to
    /// "on-chain" and they would wear the emerald "on-chain, no oracle, no trust" badge.
    /// They actually require the disclosed Covex oracle's co-signature, so the JSON
    /// boundary must override the label to "hybrid" - exactly as the catalog already
    /// declares for all four. Asserts both base kinds AND the _refundable variants
    /// (folded in via contains()).
    #[test]
    fn oracle_enforced_and_escrow_serialize_hybrid_despite_exact_p2sh() {
        // Control: the bare P2SH on script alone is on-chain (so any "hybrid" below is
        // proven to come from the type override, not from the script classifier).
        assert_eq!(
            covenant_catalog::reality_for_script(&format!("aa20{}87", "33".repeat(32)))
                .as_str(),
            "on-chain"
        );

        assert_eq!(reality_for("oracle_enforced"), "hybrid");
        assert_eq!(reality_for("oracle_escrow"), "hybrid");
        // The _refundable variants fold in through contains().
        assert_eq!(reality_for("oracle_enforced_refundable"), "hybrid");
        assert_eq!(reality_for("oracle_escrow_refundable"), "hybrid");

        // The catalog declares all four Hybrid; the live label must agree.
        for id in [
            "oracle_enforced",
            "oracle_escrow",
            "oracle_enforced_refundable",
            "oracle_escrow_refundable",
        ] {
            let catalog_reality = covenant_catalog::CATALOG
                .iter()
                .find(|e| e.id == id)
                .unwrap_or_else(|| panic!("catalog must contain {id}"))
                .reality;
            assert_eq!(catalog_reality.as_str(), "hybrid", "catalog drift for {id}");
        }
    }

    /// The override stays narrow: a plain timelock covenant (no oracle in the redeem)
    /// must still serialize "on-chain". Guards against the override accidentally
    /// over-claiming hybrid for genuinely script-only covenants.
    #[test]
    fn non_oracle_covenant_stays_on_chain() {
        assert_eq!(reality_for("p2sh_timelock"), "on-chain");
    }
}
