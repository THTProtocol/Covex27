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
//! Mechanism (kaspa-wrpc-client 0.15): the `url` passed to `connect()` overrides
//! the use of the resolver. So a resolver-eligible client is built with
//! `url: None` + `Resolver::default()` + `network_id`; it boots PINNED to the
//! direct URL (`connect` with `url: Some(direct)`), and the supervisor fails over
//! by reconnecting with `url: None` (resolver) and recovers with
//! `url: Some(direct)`. The supervisor is the SOLE caller of `connect()` for
//! eligible clients (the indexer skips its own reconnect for them, see
//! indexer.rs), so nothing fights it over the target; the client's background
//! retry loop reconnects toward whatever target the supervisor last set.

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
    let norm = if network == "mainnet-1" {
        "mainnet"
    } else {
        network
    };
    NetworkId::from_str(norm).ok()
}

/// Pure decision for how `build_client` constructs a client for `network`: whether the resolver
/// is attached (and the constructor url is None so connect(url:None) can fall through to it) or
/// the client is pinned to the direct URL (no resolver). Extracted so the routing can be
/// unit-tested without constructing a real wRPC client. A network is resolver-attached ONLY when
/// it is resolver-eligible AND its network_id parses -- a resolver client without a network_id
/// panics on connect(url:None), so an unparseable id falls back to direct-pinned.
#[derive(Debug, PartialEq, Clone, Copy)]
enum CtorPlan {
    /// Attach the resolver (ctor url = None); the supervisor can fail this client over later.
    ResolverAttached,
    /// Pin the direct URL in the constructor; no resolver path.
    DirectPinned,
}

fn ctor_plan_for(network: &str) -> CtorPlan {
    match (
        network_is_resolver_eligible(network),
        network_id_for(network),
    ) {
        (true, Some(_)) => CtorPlan::ResolverAttached,
        _ => CtorPlan::DirectPinned,
    }
}

/// Build a wRPC client for `network` that will boot on `direct_url`. Resolver-
/// eligible networks are constructed with `url: None` + resolver + network_id so
/// the supervisor can later fail them over to a public node; others are pinned to
/// the direct URL in the constructor. The caller must then run `initial_connect`.
pub fn build_client(network: &str, direct_url: &str) -> Result<Arc<KaspaRpcClient>, String> {
    // Only enable the resolver when the network is eligible AND its network_id
    // parses -- a resolver client without a network_id panics on connect(url:None).
    let (ctor_url, resolver, net_id) = match ctor_plan_for(network) {
        // url:None so resolve_url can fall through to the resolver; network_id
        // is required by the resolver to pick a node for the right network.
        CtorPlan::ResolverAttached => (None, Some(Resolver::default()), network_id_for(network)),
        // Non-eligible (or unparseable): pin the direct URL, no resolver path.
        CtorPlan::DirectPinned => (Some(direct_url), None, None),
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
        Ok(_) => info!(
            "{} wRPC connect initiated (direct node {}, non-blocking)",
            network, direct_url
        ),
        Err(e) => warn!(
            "{} wRPC connect failed (will retry in background): {}",
            network, e
        ),
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
    ever_usable: bool, // has our own node ever served a block body since boot
    unhealthy_since: Option<i64>, // Direct mode: when our node first stopped serving blocks
    recover_since: Option<i64>, // Resolver mode: when our own node first started serving blocks again
    last_switch: i64, // last Direct<->Resolver mode transition (gates re-failover in Direct mode)
    last_reresolve: i64, // last rotation to another public node (independent of mode switches)
    last_no_resolver_warn: i64,
    last_heartbeat: i64,
}

// ── Pure state-transition decisions (unit-tested without a live node) ──
//
// These mirror EXACTLY the booleans the supervisor loop computes; the loop calls them so the
// behavior and the tests cannot drift. Each takes already-measured timing inputs (so it is pure)
// and returns whether the corresponding transition should fire this tick.

/// Direct mode: fail over to a public resolver node only when our own node has been un-usable
/// (serving no block body) for at least UNHEALTHY_AGE, the startup grace has passed (the node was
/// usable at some point OR we are past STARTUP_GRACE since boot), AND the anti-flap cooldown since
/// the last mode switch has elapsed. `down_for` is None when the node is currently usable.
fn should_failover(down_for: Option<i64>, grace_ok: bool, cooled: bool) -> bool {
    matches!(down_for, Some(d) if d >= UNHEALTHY_AGE) && grace_ok && cooled
}

/// Whether the startup grace is satisfied: either our node has served a block at least once since
/// boot, or we are past STARTUP_GRACE seconds of uptime. (A never-yet-usable node is given this
/// long before its first failover, so a slow-booting node is not failed over prematurely.)
fn grace_ok(ever_usable: bool, uptime: i64) -> bool {
    ever_usable || uptime > STARTUP_GRACE
}

/// Resolver mode: switch BACK to our own node once it has served blocks continuously for at least
/// RECOVER_STABLE. `recover_for` is None when our node is not currently serving blocks.
fn should_recover(recover_for: Option<i64>) -> bool {
    matches!(recover_for, Some(d) if d >= RECOVER_STABLE)
}

/// Resolver mode: rotate to another public node when the public node we are on is NOT serving
/// blocks, we are not about to recover to our own node, and the independent re-resolve rate-limit
/// has elapsed (so a flaky public node does not reset the recovery timer).
fn should_reresolve(public_ok: bool, do_recover: bool, since_last_reresolve: i64) -> bool {
    !public_ok && !do_recover && since_last_reresolve >= RERESOLVE_EVERY
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
                            (
                                s.unhealthy_since,
                                s.ever_usable,
                                s.last_no_resolver_warn,
                                s.last_heartbeat,
                            )
                        };

                        let usable = serves_blocks(&n.client).await;
                        let new_ever_usable = ever_usable || usable;
                        if usable {
                            unhealthy_since = None;
                        } else if unhealthy_since.is_none() {
                            unhealthy_since = Some(now);
                        }

                        let down_for = unhealthy_since.map(|t| now - t);
                        let do_failover =
                            should_failover(down_for, grace_ok(new_ever_usable, uptime), cooled);

                        let do_hb = now - last_hb >= HEARTBEAT_EVERY;
                        if do_hb {
                            info!(
                                "Resolver failover [{}]: on OWN node, serving_blocks={}",
                                net, usable
                            );
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
                        let do_recover = should_recover(recover_for);
                        // Else, if the public node itself is failing, rotate to another public
                        // node -- rate-limited independently of mode switches so it never
                        // resets the recovery cooldown.
                        let do_reresolve =
                            should_reresolve(public_ok, do_recover, now - last_reresolve);

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
    let dag = match tokio::time::timeout(Duration::from_secs(8), client.get_block_dag_info()).await
    {
        Ok(Ok(d)) => d,
        _ => return false,
    };
    let hash = match dag.virtual_parent_hashes.first() {
        Some(h) => *h,
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
    let client = match KaspaRpcClient::new(WrpcEncoding::Borsh, Some(direct_url), None, None, None)
    {
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

#[cfg(test)]
mod tests {
    use super::*;

    /// Only mainnet + testnet-10 have public resolver coverage; testnet-12 (custom Toccata) and
    /// anything unknown are direct-only. An eligible client is built with the resolver attached
    /// (ctor url None), so the indexer must never issue a bare connect(None) on these.
    #[test]
    fn resolver_eligibility_is_mainnet_and_tn10_only() {
        assert!(network_is_resolver_eligible("mainnet"));
        assert!(network_is_resolver_eligible("mainnet-1"));
        assert!(network_is_resolver_eligible("testnet-10"));
        // No public resolver coverage:
        assert!(!network_is_resolver_eligible("testnet-12"));
        assert!(!network_is_resolver_eligible("testnet-11"));
        assert!(!network_is_resolver_eligible("simnet"));
        assert!(!network_is_resolver_eligible(""));
    }

    /// network_id_for normalizes the mainnet-1 alias to mainnet and rejects junk.
    #[test]
    fn network_id_normalizes_mainnet_alias_and_rejects_junk() {
        assert_eq!(
            network_id_for("mainnet-1"),
            network_id_for("mainnet"),
            "mainnet-1 must normalize to the same NetworkId as mainnet"
        );
        assert!(network_id_for("mainnet").is_some());
        assert!(network_id_for("testnet-10").is_some());
        assert!(network_id_for("not-a-network").is_none());
    }

    /// build_client's pure ctor decision: a network is resolver-attached ONLY when it is
    /// resolver-eligible AND its network_id parses; everything else is pinned to the direct URL
    /// (no resolver). This is the selection build_client makes before constructing the client.
    #[test]
    fn ctor_plan_attaches_resolver_only_for_eligible_parseable_networks() {
        // Eligible + parseable -> resolver attached (ctor url None, supervisor can fail over).
        assert_eq!(ctor_plan_for("mainnet"), CtorPlan::ResolverAttached);
        assert_eq!(ctor_plan_for("mainnet-1"), CtorPlan::ResolverAttached);
        assert_eq!(ctor_plan_for("testnet-10"), CtorPlan::ResolverAttached);
        // Eligible-list miss -> direct-pinned (no public coverage).
        assert_eq!(ctor_plan_for("testnet-12"), CtorPlan::DirectPinned);
        // Unknown / unparseable -> direct-pinned (and a resolver client with no network_id would
        // panic on connect(url:None), which this guard avoids).
        assert_eq!(ctor_plan_for("garbage"), CtorPlan::DirectPinned);
    }

    /// is_actively_supervised: testnet-10 is always actively supervised; mainnet is only
    /// supervised once COVEX_MAINNET_COVENANTS_ENABLED=true (so we do not churn failover against
    /// not-yet-forked nodes before covenant indexing is on); non-eligible networks never are.
    #[test]
    fn active_supervision_gates_mainnet_on_env_flag() {
        // Serialize + restore the env var this test mutates.
        let saved = std::env::var("COVEX_MAINNET_COVENANTS_ENABLED").ok();

        std::env::set_var("COVEX_MAINNET_COVENANTS_ENABLED", "false");
        assert!(
            !is_actively_supervised("mainnet"),
            "mainnet must NOT be actively supervised while covenant indexing is disabled"
        );
        // testnet-10 is supervised regardless of the mainnet flag.
        assert!(is_actively_supervised("testnet-10"));
        // Non-eligible networks are never actively supervised.
        assert!(!is_actively_supervised("testnet-12"));

        std::env::set_var("COVEX_MAINNET_COVENANTS_ENABLED", "true");
        assert!(
            is_actively_supervised("mainnet"),
            "mainnet must be actively supervised once COVEX_MAINNET_COVENANTS_ENABLED=true"
        );
        assert!(is_actively_supervised("mainnet-1"));

        // A value other than exactly "true" leaves mainnet unsupervised (fail-closed parse).
        std::env::set_var("COVEX_MAINNET_COVENANTS_ENABLED", "1");
        assert!(
            !is_actively_supervised("mainnet"),
            "only the exact string 'true' enables mainnet supervision"
        );

        match saved {
            Some(v) => std::env::set_var("COVEX_MAINNET_COVENANTS_ENABLED", v),
            None => std::env::remove_var("COVEX_MAINNET_COVENANTS_ENABLED"),
        }
    }

    /// Direct-mode failover decision: fire only when the node has been down for >= UNHEALTHY_AGE
    /// AND the startup grace is satisfied AND the anti-flap cooldown has elapsed. A currently-
    /// usable node (down_for None) never fails over.
    #[test]
    fn failover_requires_sustained_outage_grace_and_cooldown() {
        // Healthy node: never fails over.
        assert!(!should_failover(None, true, true));
        // Down but not long enough.
        assert!(!should_failover(Some(UNHEALTHY_AGE - 1), true, true));
        // Down long enough, grace + cooldown satisfied: fail over.
        assert!(should_failover(Some(UNHEALTHY_AGE), true, true));
        assert!(should_failover(Some(UNHEALTHY_AGE + 100), true, true));
        // Long enough but still in startup grace (never-usable, fresh boot): hold.
        assert!(!should_failover(Some(UNHEALTHY_AGE + 100), false, true));
        // Long enough but cooldown not elapsed (just switched): hold (anti-flap).
        assert!(!should_failover(Some(UNHEALTHY_AGE + 100), true, false));
    }

    /// grace_ok: satisfied if the node was ever usable, or once uptime passes STARTUP_GRACE.
    #[test]
    fn grace_is_open_once_ever_usable_or_past_startup_window() {
        assert!(grace_ok(true, 0), "ever-usable node is always past grace");
        assert!(
            !grace_ok(false, STARTUP_GRACE),
            "exactly at STARTUP_GRACE is not yet past it (strictly greater)"
        );
        assert!(
            grace_ok(false, STARTUP_GRACE + 1),
            "a never-usable node opens grace just after STARTUP_GRACE"
        );
    }

    /// Resolver-mode recover decision: switch back only after our own node has served blocks
    /// continuously for >= RECOVER_STABLE. None (own node not serving) never recovers.
    #[test]
    fn recover_requires_stable_own_node() {
        assert!(!should_recover(None));
        assert!(!should_recover(Some(RECOVER_STABLE - 1)));
        assert!(should_recover(Some(RECOVER_STABLE)));
        assert!(should_recover(Some(RECOVER_STABLE + 50)));
    }

    /// Resolver-mode re-resolve decision: rotate to another public node only when the current
    /// public node is failing, we are not about to recover, and the rate-limit has elapsed.
    #[test]
    fn reresolve_only_when_public_failing_not_recovering_and_rate_limit_elapsed() {
        // Public node failing, not recovering, rate-limit elapsed: rotate.
        assert!(should_reresolve(false, false, RERESOLVE_EVERY));
        assert!(should_reresolve(false, false, RERESOLVE_EVERY + 10));
        // Public node still serving: do not rotate.
        assert!(!should_reresolve(true, false, RERESOLVE_EVERY + 10));
        // About to recover to our own node: prefer recovery over rotating.
        assert!(!should_reresolve(false, true, RERESOLVE_EVERY + 10));
        // Rate-limit not yet elapsed: hold (do not thrash public nodes).
        assert!(!should_reresolve(false, false, RERESOLVE_EVERY - 1));
    }
}
