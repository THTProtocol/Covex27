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
}

static REG: OnceLock<Mutex<HashMap<String, NetStat>>> = OnceLock::new();

fn reg() -> &'static Mutex<HashMap<String, NetStat>> {
    REG.get_or_init(|| Mutex::new(HashMap::new()))
}

fn now() -> i64 {
    chrono::Utc::now().timestamp()
}

/// A successful dag_info: the node is serving and we know the tip + scan point.
pub fn report_ok(network: &str, tip_daa: u64, scanned_daa: u64) {
    let mut m = reg().lock().unwrap();
    let e = m.entry(network.to_string()).or_default();
    e.connected = true;
    e.tip_daa = tip_daa;
    e.scanned_daa = scanned_daa;
    e.last_ok = now();
    e.updated = now();
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

/// Seconds since the last successful dag_info for `network`, or None if the
/// network has never reported a success (node down or still in IBD). Used by the
/// resolver-failover supervisor to decide when our own node is unavailable.
pub fn last_ok_age(network: &str) -> Option<i64> {
    let m = reg().lock().unwrap();
    m.get(network).filter(|s| s.last_ok > 0).map(|s| now() - s.last_ok)
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
        out.insert(
            net.clone(),
            serde_json::json!({
                "connected": s.connected && fresh,
                "tip_daa": s.tip_daa,
                "scanned_daa": s.scanned_daa,
                "behind_daa": s.tip_daa.saturating_sub(s.scanned_daa),
                "last_ok_age_secs": if s.last_ok > 0 { now_ts - s.last_ok } else { -1 },
                "last_error": s.last_error,
            }),
        );
    }
    serde_json::Value::Object(out)
}
