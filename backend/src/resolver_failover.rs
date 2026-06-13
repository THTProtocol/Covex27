//! Public-resolver failover for Kaspa wRPC clients.
//!
//! Each indexed network normally connects to OUR OWN kaspad over a direct wRPC
//! URL (a local node, a reverse tunnel, or a server-resident node). If that node
//! goes down, covenant indexing for the network stalls. This module adds an
//! automatic backup: for networks the public Kaspa Resolver actually serves
//! (mainnet + testnet-10), a background supervisor detects a sustained outage of
//! our own node and reconnects the SAME client to a public node obtained from
//! `Resolver::default()`; when our node recovers it switches back. testnet-12 is
//! a custom Toccata testnet with no public resolver coverage, so it stays
//! direct-only (logged once at startup).
//!
//! Mechanism (kaspa-wrpc-client 0.15): the `url` passed to `connect()` "overrides
//! the use of resolver" (see ConnectOptions docs). So a resolver-eligible client
//! is constructed with `url: None` + `Resolver::default()` + `network_id`; it
//! boots PINNED to the direct URL (`connect` with `url: Some(direct)`), and the
//! supervisor fails over by reconnecting with `url: None` (-> resolver) and
//! recovers with `url: Some(direct)`. The client's own background Retry loop
//! re-runs `resolve_url` on every reconnect, so while pinned to direct it always
//! self-heals back to direct; only an explicit `url: None` connect flips it.
//!
//! A single source-of-truth DESIRED map records each network's current target so
//! the indexer's own reconnect (indexer.rs) never accidentally flips a healthy
//! resolver-eligible client onto a public node during a transient drop.

use std::collections::HashMap;
use std::str::FromStr;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;

use kaspa_rpc_core::api::rpc::RpcApi;
use kaspa_wrpc_client::prelude::{ConnectOptions, ConnectStrategy, NetworkId};
use kaspa_wrpc_client::{KaspaRpcClient, Resolver, WrpcEncoding};
use tracing::{info, warn};

// --- Supervisor tunables ---
const TICK_SECS: u64 = 30; // how often the supervisor evaluates each network
const STARTUP_GRACE: i64 = 240; // never fail over a network that has NEVER connected until this long after boot
const UNHEALTHY_AGE: i64 = 150; // our node silent (no successful dag_info) this long => consider failover
const HEALTHY_AGE: i64 = 90; // our node fresh within this => treated as healthy
const SWITCH_COOLDOWN: i64 = 120; // minimum seconds between mode switches per network (anti-flap)
const NO_RESOLVER_WARN_EVERY: i64 = 300; // rate-limit the "no public node available" warning

/// Networks the public Kaspa Resolver actually serves. testnet-12 (the custom
/// Toccata testnet) is intentionally excluded -- no public nodes exist for it,
/// so failing over there would only ever reach a dead end.
pub fn network_is_resolver_eligible(network: &str) -> bool {
    matches!(network, "mainnet" | "mainnet-1" | "testnet-10")
}

fn network_id_for(network: &str) -> Option<NetworkId> {
    let norm = if network == "mainnet-1" { "mainnet" } else { network };
    NetworkId::from_str(norm).ok()
}

// --- DESIRED target registry: network -> Some(direct_url) (Direct mode) or None (Resolver mode) ---
static DESIRED: OnceLock<Mutex<HashMap<String, Option<String>>>> = OnceLock::new();
fn desired_reg() -> &'static Mutex<HashMap<String, Option<String>>> {
    DESIRED.get_or_init(|| Mutex::new(HashMap::new()))
}

/// The URL a (re)connect for `network` should target right now: `Some(direct)` in
/// Direct mode, `None` to use the public resolver. Read by the indexer's reconnect
/// path and by the supervisor so both always drive toward the same target.
pub fn desired_url(network: &str) -> Option<String> {
    desired_reg().lock().unwrap().get(network).cloned().flatten()
}

fn set_desired(network: &str, url: Option<String>) {
    desired_reg().lock().unwrap().insert(network.to_string(), url);
}

/// Build a wRPC client for `network` that will boot on `direct_url`. Resolver-
/// eligible networks are constructed with `url: None` + resolver + network_id so
/// the supervisor can later fail them over to a public node; others are pinned to
/// the direct URL in the constructor. Registers the network's DESIRED target as
/// the direct URL. The caller must then run `initial_connect`.
pub fn build_client(network: &str, direct_url: &str) -> Result<Arc<KaspaRpcClient>, String> {
    set_desired(network, Some(direct_url.to_string()));
    let (ctor_url, resolver, net_id) = if network_is_resolver_eligible(network) {
        // url:None so resolve_url can fall through to the resolver; network_id is
        // required by the resolver to pick a node for the right network.
        (None, Some(Resolver::default()), network_id_for(network))
    } else {
        // Non-eligible: pin the direct URL in the constructor (no resolver path).
        (Some(direct_url), None, None)
    };
    KaspaRpcClient::new(WrpcEncoding::Borsh, ctor_url, resolver, net_id, None)
        .map(Arc::new)
        .map_err(|e| e.to_string())
}

/// Non-blocking initial connect, pinned to the direct node so a freshly-built
/// resolver-eligible client starts on OUR node (not a random public one). Returns
/// immediately; the client retries in the background.
pub async fn initial_connect(client: &KaspaRpcClient, network: &str, direct_url: &str) {
    let opts = ConnectOptions {
        block_async_connect: false,
        strategy: ConnectStrategy::Retry,
        url: Some(direct_url.to_string()),
        connect_timeout: None,
        retry_interval: None,
    };
    match client.connect(Some(opts)).await {
        Ok(_) => info!("{} wRPC connect initiated (direct node {}, non-blocking)", network, direct_url),
        Err(e) => warn!("{} wRPC connect failed (will retry in background): {}", network, e),
    }
}

/// One network placed under failover supervision.
pub struct Supervised {
    pub network: String,
    pub client: Arc<KaspaRpcClient>,
    pub direct_url: String,
}

#[derive(Clone, Copy, PartialEq)]
enum Mode {
    Direct,
    Resolver,
}

/// Spawn the background supervisor. Only resolver-eligible networks are actively
/// watched; non-eligible ones get a one-time "direct-only" log. Disable entirely
/// with COVEX_RESOLVER_FALLBACK=0.
pub fn spawn_supervisor(nets: Vec<Supervised>) {
    for n in &nets {
        if !network_is_resolver_eligible(&n.network) {
            info!(
                "Resolver failover: {} has no public resolver coverage -- direct-only (our own node is the sole source)",
                n.network
            );
        }
    }

    if std::env::var("COVEX_RESOLVER_FALLBACK")
        .map(|v| v == "0" || v.eq_ignore_ascii_case("false"))
        .unwrap_or(false)
    {
        info!("Resolver failover disabled via COVEX_RESOLVER_FALLBACK=0");
        return;
    }

    let eligible: Vec<Supervised> =
        nets.into_iter().filter(|n| network_is_resolver_eligible(&n.network)).collect();
    if eligible.is_empty() {
        return;
    }
    let names: Vec<String> = eligible.iter().map(|n| n.network.clone()).collect();
    info!("Resolver failover supervisor watching: {}", names.join(", "));

    tokio::spawn(async move {
        let started = chrono::Utc::now().timestamp();
        let mut mode: HashMap<String, Mode> = HashMap::new();
        let mut last_switch: HashMap<String, i64> = HashMap::new();
        let mut last_no_resolver_warn: HashMap<String, i64> = HashMap::new();
        for n in &eligible {
            mode.insert(n.network.clone(), Mode::Direct);
            last_switch.insert(n.network.clone(), 0);
        }

        let mut ticker = tokio::time::interval(Duration::from_secs(TICK_SECS));
        loop {
            ticker.tick().await;
            let now = chrono::Utc::now().timestamp();
            let uptime = now - started;

            for n in &eligible {
                let net = n.network.as_str();
                let cur = *mode.get(net).unwrap();
                // None => the crawler has never reported a successful dag_info for
                // this network (node down / still in IBD).
                let age = crate::node_status::last_ok_age(net);
                let healthy = matches!(age, Some(a) if a < HEALTHY_AGE);
                let want_failover = match age {
                    Some(a) => a > UNHEALTHY_AGE,
                    None => uptime > STARTUP_GRACE,
                };
                let cooled =
                    now - last_switch.get(net).copied().unwrap_or(0) >= SWITCH_COOLDOWN;

                match cur {
                    Mode::Direct if want_failover && cooled => {
                        let nid = match network_id_for(net) {
                            Some(x) => x,
                            None => continue,
                        };
                        match probe_resolver(nid).await {
                            Some(url) => {
                                set_desired(net, None);
                                reconnect(&n.client, None).await;
                                mode.insert(net.to_string(), Mode::Resolver);
                                last_switch.insert(net.to_string(), now);
                                let silent = age
                                    .map(|a| format!("{}s", a))
                                    .unwrap_or_else(|| "since boot".to_string());
                                warn!(
                                    "FAILOVER {}: own node unavailable ({}) -- switched to PUBLIC resolver node {}",
                                    net, silent, url
                                );
                            }
                            None => {
                                let lw = last_no_resolver_warn.get(net).copied().unwrap_or(0);
                                if now - lw >= NO_RESOLVER_WARN_EVERY {
                                    last_no_resolver_warn.insert(net.to_string(), now);
                                    warn!(
                                        "{}: own node unavailable but no public resolver node reachable right now -- staying on direct (will retry)",
                                        net
                                    );
                                }
                            }
                        }
                    }
                    Mode::Resolver if cooled => {
                        // Currently served by a public node. Prefer our own node:
                        // probe it and switch back the moment it is reachable.
                        if probe_direct(&n.direct_url).await {
                            set_desired(net, Some(n.direct_url.clone()));
                            reconnect(&n.client, Some(n.direct_url.clone())).await;
                            mode.insert(net.to_string(), Mode::Direct);
                            last_switch.insert(net.to_string(), now);
                            info!(
                                "RECOVERED {}: own node reachable again -- switched back from public resolver",
                                net
                            );
                        } else if !healthy {
                            // Even the public node is failing; force a re-resolve to
                            // a different public node by reconnecting with url:None.
                            warn!("{}: public resolver node unhealthy -- re-resolving to another public node", net);
                            reconnect(&n.client, None).await;
                            last_switch.insert(net.to_string(), now);
                        }
                    }
                    _ => {}
                }
            }
        }
    });
}

/// Reconnect the supervised client toward `url` (Some = direct, None = resolver),
/// non-blocking so the supervisor loop is never wedged.
async fn reconnect(client: &KaspaRpcClient, url: Option<String>) {
    let opts = ConnectOptions {
        block_async_connect: false,
        strategy: ConnectStrategy::Retry,
        url,
        connect_timeout: Some(Duration::from_secs(15)),
        retry_interval: None,
    };
    if let Err(e) = client.connect(Some(opts)).await {
        warn!("resolver_failover: reconnect failed (will retry): {}", e);
    }
}

/// Ask the public resolver for a node serving `network_id`. Returns the node URL,
/// or None if the resolver has no node / does not answer in time.
async fn probe_resolver(network_id: NetworkId) -> Option<String> {
    let resolver = Resolver::default();
    match tokio::time::timeout(
        Duration::from_secs(10),
        resolver.get_url(WrpcEncoding::Borsh, network_id),
    )
    .await
    {
        Ok(Ok(url)) => Some(url),
        _ => None,
    }
}

/// Probe OUR OWN node at `direct_url` with a short-lived throwaway client. True if
/// it both connects and answers get_block_dag_info within the timeouts. Uses the
/// Fallback strategy so the probe fails fast instead of retrying forever.
async fn probe_direct(direct_url: &str) -> bool {
    let client = match KaspaRpcClient::new(WrpcEncoding::Borsh, Some(direct_url), None, None, None) {
        Ok(c) => c,
        Err(_) => return false,
    };
    let opts = ConnectOptions {
        block_async_connect: true,
        strategy: ConnectStrategy::Fallback,
        url: None,
        connect_timeout: Some(Duration::from_secs(8)),
        retry_interval: None,
    };
    let ok = match tokio::time::timeout(Duration::from_secs(10), client.connect(Some(opts))).await {
        Ok(Ok(_)) => matches!(
            tokio::time::timeout(Duration::from_secs(8), client.get_block_dag_info()).await,
            Ok(Ok(_))
        ),
        _ => false,
    };
    let _ = client.disconnect().await;
    ok
}
