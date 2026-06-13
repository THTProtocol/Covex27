//! Public-resolver failover for Kaspa wRPC clients.
//!
//! Each indexed network normally connects to OUR OWN kaspad over a direct wRPC
//! URL (a local node, a reverse tunnel, or a server-resident node). If that node
//! becomes unusable, covenant indexing for the network stalls. This module adds
//! an automatic backup: for networks the public Kaspa Resolver actually serves
//! (mainnet + testnet-10), a background supervisor detects a sustained outage of
//! our own node and reconnects the SAME client to a public node obtained from
//! `Resolver::default()`; when our node recovers it switches back. testnet-12 is
//! a custom Toccata testnet with no public resolver coverage, so it stays
//! direct-only.
//!
//! HEALTH SIGNAL -- why an active block-body probe, not dag_info:
//! a node mid-IBD answers `get_block_dag_info` but HANGS on `get_block` because
//! it does not yet hold block bodies (this codebase relies on exactly that in
//! crawler.rs). So "answers dag_info" does NOT mean "can feed the indexer." The
//! supervisor therefore probes real usability: `get_block_dag_info` -> fetch a
//! recent block body via `get_block(tip, true)` under a timeout. That fires for
//! BOTH a hard-down node and an up-but-IBD-stalled node, and -- crucially -- a
//! healthy node (even one caught up with nothing new to index, or busy on a long
//! catch-up walk) always serves a recent block instantly, so it is never falsely
//! failed over.
//!
//! Mechanism (kaspa-wrpc-client 0.15): the `url` passed to `connect()` "overrides
//! the use of resolver". So a resolver-eligible client is built with `url: None`
//! + `Resolver::default()` + `network_id`; it boots PINNED to the direct URL
//! (`connect` with `url: Some(direct)`), and the supervisor fails over by
//! reconnecting with `url: None` (-> resolver) and recovers with
//! `url: Some(direct)`. The supervisor is the SOLE caller of `connect()` for
//! eligible clients (the indexer skips its own reconnect for them, see
//! indexer.rs), so nothing fights it over the target; the client's background
//! Retry loop reconnects toward whatever target the supervisor last set.

use std::collections::HashMap;
use std::str::FromStr;
use std::sync::Arc;
use std::time::Duration;

use kaspa_rpc_core::api::rpc::RpcApi;
use kaspa_wrpc_client::prelude::{ConnectOptions, ConnectStrategy, NetworkId};
use kaspa_wrpc_client::{KaspaRpcClient, Resolver, WrpcEncoding};
use tracing::{info, warn};

// --- Supervisor tunables ---
const TICK_SECS: u64 = 30; // how often the supervisor probes each watched network
const STARTUP_GRACE: i64 = 240; // a never-yet-usable node is given this long after boot before its first failover
const UNHEALTHY_AGE: i64 = 150; // our node must be un-usable (no block body served) this long before we fail over
const RECOVER_STABLE: i64 = 60; // our node must be usable again this long before we switch back from a public node
const SWITCH_COOLDOWN: i64 = 120; // minimum seconds before failing the SAME node over again (anti-flap, Direct mode only)
const RERESOLVE_EVERY: i64 = 60; // min seconds between rotating to another public node while on the resolver
const NO_RESOLVER_WARN_EVERY: i64 = 300; // rate-limit the "no public node available" warning
const HEARTBEAT_EVERY: i64 = 600; // periodic per-network mode/health heartbeat so prod can see the supervisor is alive

/// Networks the public Kaspa Resolver actually serves. testnet-12 (the custom
/// Toccata testnet) is intentionally excluded -- no public nodes exist for it.
/// Eligible clients are built with the resolver attached (ctor url = None), so
/// the indexer must never issue a bare `connect(None)` on them (it would resolve
/// to a public node); indexer.rs gates its reconnect on this function.
pub fn network_is_resolver_eligible(network: &str) -> bool {
    matches!(network, "mainnet" | "mainnet-1" | "testnet-10")
}

/// Whether the supervisor should ACTIVELY watch this network (probe + fail over).
/// Mainnet is only actively supervised once covenant indexing is enabled
/// (post-Toccata); before that it is not indexing anything, so failing over to a
/// public node would be pointless churn against possibly-not-yet-forked nodes.
fn is_actively_supervised(network: &str) -> bool {
    if !network_is_resolver_eligible(network) {
        return false;
    }
    if network.starts_with("mainnet") {
        return std::env::var("COVEX_MAINNET_COVENANTS_ENABLED").as_deref() == Ok("true");
    }
    true
}

fn network_id_for(network: &str) -> Option<NetworkId> {
    let norm = if network == "mainnet-1" { "mainnet" } else { network };
    NetworkId::from_str(norm).ok()
}

/// Build a wRPC client for `network` that will boot on `direct_url`. Resolver-
/// eligible networks are constructed with `url: None` + resolver + network_id so
/// the supervisor can later fail them over to a public node; others are pinned to
/// the direct URL in the constructor. The caller must then run `initial_connect`.
pub fn build_client(network: &str, direct_url: &str) -> Result<Arc<KaspaRpcClient>, String> {
    // Only enable the resolver when the network is eligible AND its network_id
    // parses -- a resolver client without a network_id panics on connect(url:None).
    let (ctor_url, resolver, net_id) =
        match (network_is_resolver_eligible(network), network_id_for(network)) {
            // url:None so resolve_url can fall through to the resolver; network_id
            // is required by the resolver to pick a node for the right network.
            (true, Some(nid)) => (None, Some(Resolver::default()), Some(nid)),
            // Non-eligible (or unparseable): pin the direct URL, no resolver path.
            _ => (Some(direct_url), None, None),
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

struct NetState {
    mode: Mode,
    ever_usable: bool,          // has our own node ever served a block body since boot
    unhealthy_since: Option<i64>, // Direct mode: when our node first stopped serving blocks
    recover_since: Option<i64>,   // Resolver mode: when our own node first started serving blocks again
    last_switch: i64,           // last Direct<->Resolver mode transition (gates re-failover in Direct mode)
    last_reresolve: i64,        // last rotation to another public node (independent of mode switches)
    last_no_resolver_warn: i64,
    last_heartbeat: i64,
}

/// Spawn the background supervisor. Only actively-supervised networks are probed;
/// others get a one-time direct-only log. Disable entirely with
/// COVEX_RESOLVER_FALLBACK=0.
pub fn spawn_supervisor(nets: Vec<Supervised>) {
    if std::env::var("COVEX_RESOLVER_FALLBACK")
        .map(|v| v == "0" || v.eq_ignore_ascii_case("false"))
        .unwrap_or(false)
    {
        info!("Resolver failover disabled via COVEX_RESOLVER_FALLBACK=0");
        return;
    }

    let mut watched: Vec<Supervised> = Vec::new();
    for n in nets {
        if is_actively_supervised(&n.network) {
            watched.push(n);
        } else if network_is_resolver_eligible(&n.network) {
            info!(
                "Resolver failover: {} is resolver-eligible but not actively supervised yet (mainnet covenant indexing disabled) -- direct-only",
                n.network
            );
        } else {
            info!(
                "Resolver failover: {} has no public resolver coverage -- direct-only (our own node is the sole source)",
                n.network
            );
        }
    }

    if watched.is_empty() {
        info!("Resolver failover: no networks under active supervision (mainnet/testnet-10 not configured for failover)");
        return;
    }
    let names: Vec<String> = watched.iter().map(|n| n.network.clone()).collect();
    info!(
        "Resolver failover supervisor watching: {} (block-body health probe every {}s)",
        names.join(", "),
        TICK_SECS
    );

    tokio::spawn(async move {
        let started = chrono::Utc::now().timestamp();
        let mut st: HashMap<String, NetState> = HashMap::new();
        for n in &watched {
            st.insert(
                n.network.clone(),
                NetState {
                    mode: Mode::Direct,
                    ever_usable: false,
                    unhealthy_since: None,
                    recover_since: None,
                    last_switch: 0,
                    last_reresolve: 0,
                    last_no_resolver_warn: 0,
                    last_heartbeat: 0,
                },
            );
        }

        let mut ticker = tokio::time::interval(Duration::from_secs(TICK_SECS));
        loop {
            ticker.tick().await;
            let now = chrono::Utc::now().timestamp();
            let uptime = now - started;

            for n in &watched {
                let net = n.network.as_str();
                let (mode, last_switch) = {
                    let s = st.get(net).unwrap();
                    (s.mode, s.last_switch)
                };
                let cooled = now - last_switch >= SWITCH_COOLDOWN;

                match mode {
                    Mode::Direct => {
                        // Our node IS the shared client's current target -- probe it directly.
                        let (mut unhealthy_since, ever_usable, last_warn, last_hb) = {
                            let s = st.get(net).unwrap();
                            (s.unhealthy_since, s.ever_usable, s.last_no_resolver_warn, s.last_heartbeat)
                        };

                        let usable = serves_blocks(&n.client).await;
                        let new_ever_usable = ever_usable || usable;
                        if usable {
                            unhealthy_since = None;
                        } else if unhealthy_since.is_none() {
                            unhealthy_since = Some(now);
                        }

                        let down_for = unhealthy_since.map(|t| now - t);
                        let grace_ok = new_ever_usable || uptime > STARTUP_GRACE;
                        let do_failover =
                            matches!(down_for, Some(d) if d >= UNHEALTHY_AGE) && grace_ok && cooled;

                        let do_hb = now - last_hb >= HEARTBEAT_EVERY;
                        if do_hb {
                            info!("Resolver failover [{}]: on OWN node, serving_blocks={}", net, usable);
                        }

                        let mut switched = false;
                        let mut new_warn = last_warn;
                        if do_failover {
                            if let Some(nid) = network_id_for(net) {
                                match probe_resolver(nid).await {
                                    Some(url) => {
                                        reconnect(&n.client, None).await;
                                        switched = true;
                                        warn!(
                                            "FAILOVER {}: own node not serving blocks for >{}s -- switched to PUBLIC resolver node {}",
                                            net, UNHEALTHY_AGE, url
                                        );
                                    }
                                    None => {
                                        if now - last_warn >= NO_RESOLVER_WARN_EVERY {
                                            new_warn = now;
                                            warn!(
                                                "{}: own node not serving blocks but no public resolver node reachable -- staying on direct (will retry)",
                                                net
                                            );
                                        }
                                    }
                                }
                            }
                        }

                        let s = st.get_mut(net).unwrap();
                        s.ever_usable = new_ever_usable;
                        s.last_no_resolver_warn = new_warn;
                        if do_hb {
                            s.last_heartbeat = now;
                        }
                        if switched {
                            s.mode = Mode::Resolver;
                            s.last_switch = now;
                            s.unhealthy_since = None;
                            s.recover_since = None;
                        } else {
                            s.unhealthy_since = unhealthy_since;
                        }
                    }
                    Mode::Resolver => {
                        let (recover_since, last_reresolve, last_hb) = {
                            let s = st.get(net).unwrap();
                            (s.recover_since, s.last_reresolve, s.last_heartbeat)
                        };

                        // Is the public node we're on still serving blocks?
                        let public_ok = serves_blocks(&n.client).await;
                        // Is our OWN node back? Probe it EVERY tick (independent throwaway
                        // client) so the recovery timer can accumulate continuously -- it
                        // must NOT be gated on the switch cooldown, or a flaky public node
                        // (which keeps re-resolving) would starve recovery and strand us.
                        let own_ok = own_node_serves_blocks(&n.direct_url).await;

                        let new_recover_since = if own_ok {
                            recover_since.or(Some(now))
                        } else {
                            None
                        };
                        let recover_for = new_recover_since.map(|t| now - t);
                        // Prefer our own node: switch back once it has served blocks
                        // continuously for RECOVER_STABLE. No cooldown needed -- RECOVER_STABLE
                        // is the anti-flap, and Direct mode then needs UNHEALTHY_AGE before it
                        // could fail over again.
                        let do_recover = matches!(recover_for, Some(d) if d >= RECOVER_STABLE);
                        // Else, if the public node itself is failing, rotate to another public
                        // node -- rate-limited independently of mode switches so it never
                        // resets the recovery cooldown.
                        let do_reresolve =
                            !public_ok && !do_recover && (now - last_reresolve >= RERESOLVE_EVERY);

                        let do_hb = now - last_hb >= HEARTBEAT_EVERY;
                        if do_hb {
                            info!(
                                "Resolver failover [{}]: on PUBLIC node (public_serving={}, own_back={})",
                                net, public_ok, own_ok
                            );
                        }

                        let mut recovered = false;
                        let mut reresolved = false;
                        if do_recover {
                            reconnect(&n.client, Some(n.direct_url.clone())).await;
                            recovered = true;
                            info!(
                                "RECOVERED {}: own node serving blocks again -- switched back from public resolver",
                                net
                            );
                        } else if do_reresolve {
                            warn!("{}: public resolver node not serving blocks -- re-resolving to another public node", net);
                            reconnect(&n.client, None).await;
                            reresolved = true;
                        }

                        let s = st.get_mut(net).unwrap();
                        if do_hb {
                            s.last_heartbeat = now;
                        }
                        if recovered {
                            s.mode = Mode::Direct;
                            s.last_switch = now;
                            s.unhealthy_since = None;
                            s.recover_since = None;
                        } else {
                            s.recover_since = new_recover_since;
                            if reresolved {
                                s.last_reresolve = now;
                            }
                        }
                    }
                }
            }
        }
    });
}

/// True if `client` serves a recent BLOCK BODY within the timeouts -- the real
/// test of "can this node feed the indexer". A node mid-IBD answers
/// get_block_dag_info but hangs on get_block (documented in crawler.rs), so this
/// distinguishes a usable node from a down or still-syncing one. A healthy node
/// (even caught up or busy) returns a recent block instantly.
async fn serves_blocks(client: &KaspaRpcClient) -> bool {
    let dag = match tokio::time::timeout(Duration::from_secs(8), client.get_block_dag_info()).await {
        Ok(Ok(d)) => d,
        _ => return false,
    };
    let hash = match dag.virtual_parent_hashes.first() {
        Some(h) => h.clone(),
        None => return false,
    };
    matches!(
        tokio::time::timeout(Duration::from_secs(12), client.get_block(hash, true)).await,
        Ok(Ok(_))
    )
}

/// Probe OUR OWN node at `direct_url` with a short-lived throwaway client, used
/// during Resolver mode (when the shared client is pointed at a public node) to
/// decide whether our node has recovered. Requires it to actually serve a block
/// body, not merely answer dag_info. Uses Fallback so the probe fails fast.
async fn own_node_serves_blocks(direct_url: &str) -> bool {
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
    let ok = match tokio::time::timeout(Duration::from_secs(12), client.connect(Some(opts))).await {
        Ok(Ok(_)) => serves_blocks(&client).await,
        _ => false,
    };
    let _ = client.disconnect().await;
    ok
}

/// Ask the public resolver for a node serving `network_id`. Returns the node URL
/// (informational -- the subsequent connect(url:None) lets the client's resolver
/// pick a node), or None if the resolver has no node / does not answer in time.
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
