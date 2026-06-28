//! Live per-network node sync registry. Each network's crawler reports the
//! result of its periodic get_block_dag_info call here; the /status endpoint
//! reads a snapshot. This replaces a previously hardcoded `node_connected:true`
//! with a real signal: whether each Kaspa node is serving wRPC, its tip DAA,
//! and how far the indexer has scanned. A node mid-sync (IBD) does not serve
//! dag_info, so it shows connected=false with the last error until it catches
//! up, at which point the crawler resumes and tip_daa starts advancing.

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

#[derive(Clone, Default)]
pub struct NetStat {
    pub connected: bool,
    pub tip_daa: u64,
    pub scanned_daa: u64,
    pub last_ok: i64,
    pub last_error: String,
    pub updated: i64,
    /// Watchdog (GATE 1): the last time tip_daa / scanned_daa actually CHANGED, so a
    /// node that answers dag_info but has a frozen tip, or an indexer stuck while the
    /// chain advances, is detected instead of reading "healthy while frozen".
    pub tip_changed_at: i64,
    pub scanned_changed_at: i64,
}

// A healthy Kaspa node advances its tip ~10x/second, so a tip unchanged this long while
// the node still answers means the node is frozen (the deterministic TN10/TN12 failure).
const NODE_STALL_SECS: i64 = 600;
// The crawler advances scanned_daa every cycle; if the tip keeps moving but scanned is
// stuck this long with a real gap, the INDEXER is frozen (not the node).
const INDEXER_STALL_SECS: i64 = 300;
const INDEXER_STALL_BEHIND: u64 = 2_000;

static REG: OnceLock<Mutex<HashMap<String, NetStat>>> = OnceLock::new();

fn reg() -> &'static Mutex<HashMap<String, NetStat>> {
    REG.get_or_init(|| Mutex::new(HashMap::new()))
}

fn now() -> i64 {
    chrono::Utc::now().timestamp()
}

/// The last-known virtual DAA tip for a network, if the crawler has reported one.
/// Used to compute live confirmation depth / finality for indexed covenants without
/// storing a stale per-row value. Returns None when no node has reported yet (so
/// callers can honestly say "unknown" rather than fabricate a confirmation count).
pub fn tip_daa(network: &str) -> Option<u64> {
    let m = reg().lock().unwrap();
    m.get(network).map(|s| s.tip_daa).filter(|&d| d > 0)
}

/// A successful dag_info: the node is serving and we know the tip + scan point.
pub fn report_ok(network: &str, tip_daa: u64, scanned_daa: u64) {
    let mut m = reg().lock().unwrap();
    let t = now();
    let e = m.entry(network.to_string()).or_default();
    e.connected = true;
    // Watchdog: stamp the moment each value last advanced (first report counts as a change).
    if tip_daa != e.tip_daa || e.tip_changed_at == 0 {
        e.tip_changed_at = t;
    }
    if scanned_daa != e.scanned_daa || e.scanned_changed_at == 0 {
        e.scanned_changed_at = t;
    }
    e.tip_daa = tip_daa;
    e.scanned_daa = scanned_daa;
    e.last_ok = t;
    e.updated = t;
    e.last_error.clear();
}

/// The node is not serving wRPC yet (syncing / down / timed out).
pub fn report_err(network: &str, err: &str) {
    let mut m = reg().lock().unwrap();
    let e = m.entry(network.to_string()).or_default();
    e.connected = false;
    e.last_error = err.chars().take(160).collect();
    e.updated = now();
}

/// JSON snapshot of every network that has reported, for /status.
pub fn snapshot() -> serde_json::Value {
    let m = reg().lock().unwrap();
    let now_ts = now();
    let mut out = serde_json::Map::new();
    for (net, s) in m.iter() {
        // "indexing" = served wRPC within the last 3 minutes (crawler cycles
        // are well under that when the node is healthy)
        let fresh = s.last_ok > 0 && (now_ts - s.last_ok) < 180;
        let connected = s.connected && fresh;
        let behind = s.tip_daa.saturating_sub(s.scanned_daa);
        let tip_age = if s.tip_changed_at > 0 {
            now_ts - s.tip_changed_at
        } else {
            -1
        };
        let scanned_age = if s.scanned_changed_at > 0 {
            now_ts - s.scanned_changed_at
        } else {
            -1
        };
        // Watchdog: classify a stall so the operator (and the gate-flip decision) never
        // reads green while frozen. A quiet-but-alive node still advances its tip, so a
        // long-unchanged tip is a genuine freeze, not low activity.
        let (stalled, stall_reason) = if !connected {
            (true, "disconnected")
        } else if tip_age > NODE_STALL_SECS {
            (true, "node_tip_frozen")
        } else if scanned_age > INDEXER_STALL_SECS && behind > INDEXER_STALL_BEHIND {
            (true, "indexer_frozen")
        } else {
            (false, "")
        };
        out.insert(
            net.clone(),
            serde_json::json!({
                "connected": connected,
                "tip_daa": s.tip_daa,
                "scanned_daa": s.scanned_daa,
                "behind_daa": behind,
                "last_ok_age_secs": if s.last_ok > 0 { now_ts - s.last_ok } else { -1 },
                "tip_unchanged_secs": tip_age,
                "scanned_unchanged_secs": scanned_age,
                "stalled": stalled,
                "stall_reason": stall_reason,
                "last_error": s.last_error,
            }),
        );
    }
    serde_json::Value::Object(out)
}
