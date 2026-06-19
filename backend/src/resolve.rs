//! resolve.rs - one smart-resolve endpoint that powers BOTH the explorer search bar
//! and AI/API callers. It classifies a free-form query (a KNS .kas domain, a Kaspa
//! address, a covenant id / txid, or a plain keyword) and, for .kas domains, resolves
//! ownership via the KNS public API.
//!
//! This is a READ-ONLY resolution path. It never touches funds, never signs, and never
//! mutates state. The only outbound call is the KNS GET, which is bounded (timeout) and
//! FAIL-CLOSED: any network error, non-200, success != true, or missing owner yields
//! resolved:false with an honest note, never a panic and never a fabricated address.
//!
//! KNS API (verified live):
//!   GET https://api.knsdomains.org/{net}/api/v1/{urlencoded-domain}/owner
//!   -> {"success":true,"data":{"owner":"kaspa:qpz2...","asset":"name.kas",...}}
//!   net = "mainnet" for mainnet, "tn10" for testnet-10. testnet-12 has NO KNS index.

use axum::{
    extract::{Path, Query},
    routing::get,
    Extension, Json, Router,
};
use serde_json::json;
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use crate::db;

/// How long a successful KNS resolution is trusted from memory before we re-fetch.
/// Ownership can transfer, so this is deliberately short; it exists only to avoid
/// hammering KNS when the same domain is typed repeatedly in the search bar.
const KNS_CACHE_TTL: Duration = Duration::from_secs(300);

/// Hard ceiling on the outbound KNS GET. A slow/hung KNS must never stall our worker.
const KNS_TIMEOUT: Duration = Duration::from_secs(5);

/// The classified shape of a query, independent of any network call. Pure, testable.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum QueryKind {
    Kns,
    Address,
    Txid,
    Keyword,
}

impl QueryKind {
    pub fn as_str(self) -> &'static str {
        match self {
            QueryKind::Kns => "kns",
            QueryKind::Address => "address",
            QueryKind::Txid => "txid",
            QueryKind::Keyword => "keyword",
        }
    }
}

/// Network hint derived purely from an address prefix. None when the query is not an
/// address (or the prefix is unrecognized).
pub fn address_network_hint(trimmed: &str) -> Option<&'static str> {
    let lower = trimmed.to_lowercase();
    if lower.starts_with("kaspatest:") {
        Some("testnet")
    } else if lower.starts_with("kaspa:") {
        Some("mainnet")
    } else {
        None
    }
}

/// True when the (already trimmed+lowercased) query looks like a txid or covenant id:
/// it contains a ':' (covenant id form like txid:vout) OR it is exactly 64 hex chars.
fn looks_like_txid(lc: &str) -> bool {
    if lc.contains(':') {
        return true;
    }
    lc.len() == 64 && lc.bytes().all(|b| b.is_ascii_hexdigit())
}

/// Pure classifier: given a raw query, return its kind. No network, no DB, no panics.
/// The ordering matters: .kas wins first, then address prefixes, then txid/covenant
/// shapes, else keyword.
pub fn classify_query(raw: &str) -> QueryKind {
    let trimmed = raw.trim();
    let lc = trimmed.to_lowercase();
    if lc.ends_with(".kas") && lc.len() > 4 {
        return QueryKind::Kns;
    }
    if address_network_hint(trimmed).is_some() {
        return QueryKind::Address;
    }
    if looks_like_txid(&lc) {
        return QueryKind::Txid;
    }
    QueryKind::Keyword
}

/// The KNS net path segment for a given Covex network label, or an error string when
/// KNS does not index that network (testnet-12). Pure and testable.
///   mainnet     -> Ok("mainnet")
///   testnet-10  -> Ok("tn10")
///   testnet-12  -> Err(honest note)
pub fn kns_net_for(network: &str) -> Result<&'static str, &'static str> {
    match network {
        "mainnet" => Ok("mainnet"),
        "testnet-10" => Ok("tn10"),
        "testnet-12" => Err("KNS is not indexed on testnet-12"),
        _ => Err("KNS is not indexed on this network"),
    }
}

/// Normalize the optional ?network= param to a canonical Covex network label,
/// defaulting to mainnet. Accepts the same labels the rest of the API uses.
fn normalize_network(raw: Option<&str>) -> String {
    match raw.map(|s| s.trim().to_lowercase()).as_deref() {
        Some("testnet-10") | Some("tn10") => "testnet-10".to_string(),
        Some("testnet-12") | Some("tn12") => "testnet-12".to_string(),
        Some("mainnet") | None | Some("") => "mainnet".to_string(),
        // Unknown labels fall back to mainnet rather than erroring; the resolve
        // endpoint is a convenience and must stay forgiving.
        Some(_) => "mainnet".to_string(),
    }
}

/// A resolved KNS owner, what we cache and return.
#[derive(Clone)]
struct KnsHit {
    name: String,
    owner: String,
}

/// In-memory TTL cache keyed by "net|domain". Successful resolutions only; failures are
/// never cached (so a transient KNS outage does not poison a domain for 5 minutes).
fn kns_cache() -> &'static Mutex<HashMap<String, (KnsHit, Instant)>> {
    use std::sync::OnceLock;
    static CACHE: OnceLock<Mutex<HashMap<String, (KnsHit, Instant)>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn cache_get(key: &str) -> Option<KnsHit> {
    let map = kns_cache().lock().ok()?;
    let (hit, at) = map.get(key)?;
    if at.elapsed() < KNS_CACHE_TTL {
        Some(hit.clone())
    } else {
        None
    }
}

fn cache_put(key: String, hit: KnsHit) {
    if let Ok(mut map) = kns_cache().lock() {
        // Crude unbounded-growth guard: the search bar can only mint so many distinct
        // .kas keys before this is just noise, so clear wholesale past a generous cap.
        if map.len() > 10_000 {
            map.clear();
        }
        map.insert(key, (hit, Instant::now()));
    }
}

/// Base URL for the KNS API. KNS_API_BASE overrides it (default the public host).
/// No trailing slash is assumed; we always join with a leading slash below.
fn kns_api_base() -> String {
    std::env::var("KNS_API_BASE")
        .ok()
        .map(|s| s.trim_end_matches('/').to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "https://api.knsdomains.org".to_string())
}

/// Percent-encode a single path segment (the domain). KNS domains are normally simple
/// (`name.kas`), but a user could paste odd characters; we encode anything that is not a
/// conservative unreserved set so the URL is always well-formed and we never inject a
/// path separator. Lowercase ASCII letters, digits, '.', '-', '_', and '~' pass through.
fn encode_segment(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        let unreserved = b.is_ascii_alphanumeric()
            || matches!(b, b'.' | b'-' | b'_' | b'~');
        if unreserved {
            out.push(b as char);
        } else {
            out.push('%');
            out.push_str(&format!("{:02X}", b));
        }
    }
    out
}

/// Outcome of an attempted KNS resolution. This is the one fn that touches the network.
/// Deliberately NOT exercised by the unit tests (no live calls in tests).
struct KnsResolution {
    hit: Option<KnsHit>,
    note: Option<String>,
}

/// Fetch (or serve from cache) the owner of a .kas domain on the given KNS net.
/// FAIL-CLOSED: every error path returns hit=None plus an honest note. Never panics.
async fn resolve_kns(domain_lc: &str, kns_net: &str) -> KnsResolution {
    let cache_key = format!("{kns_net}|{domain_lc}");
    if let Some(hit) = cache_get(&cache_key) {
        return KnsResolution { hit: Some(hit), note: None };
    }

    let url = format!(
        "{}/{}/api/v1/{}/owner",
        kns_api_base(),
        kns_net,
        encode_segment(domain_lc)
    );

    // A fresh, short-lived client per call keeps state out of AppState; reqwest reuses
    // the process-wide rustls/connection machinery, so this stays cheap for a read path.
    let client = match reqwest::Client::builder().timeout(KNS_TIMEOUT).build() {
        Ok(c) => c,
        Err(_) => {
            return KnsResolution {
                hit: None,
                note: Some("KNS lookup could not be initialized".to_string()),
            }
        }
    };

    let resp = match client.get(&url).send().await {
        Ok(r) => r,
        Err(_) => {
            return KnsResolution {
                hit: None,
                note: Some("KNS lookup failed (network error or timeout)".to_string()),
            }
        }
    };

    if !resp.status().is_success() {
        // 404 from KNS means "no such name"; anything else is an upstream problem. Either
        // way the honest answer is: not resolved.
        let code = resp.status().as_u16();
        let note = if code == 404 {
            "KNS has no owner record for this name".to_string()
        } else {
            format!("KNS lookup returned status {code}")
        };
        return KnsResolution { hit: None, note: Some(note) };
    }

    let body: serde_json::Value = match resp.json().await {
        Ok(v) => v,
        Err(_) => {
            return KnsResolution {
                hit: None,
                note: Some("KNS returned an unparseable response".to_string()),
            }
        }
    };

    let success = body.get("success").and_then(|v| v.as_bool()).unwrap_or(false);
    let owner = body
        .get("data")
        .and_then(|d| d.get("owner"))
        .and_then(|o| o.as_str())
        .map(|s| s.to_string());

    match (success, owner) {
        (true, Some(owner)) if !owner.is_empty() => {
            // KNS echoes the asset/name; fall back to the queried domain if absent.
            let name = body
                .get("data")
                .and_then(|d| d.get("asset"))
                .and_then(|a| a.as_str())
                .filter(|s| !s.is_empty())
                .unwrap_or(domain_lc)
                .to_string();
            let hit = KnsHit { name, owner };
            cache_put(cache_key, hit.clone());
            KnsResolution { hit: Some(hit), note: None }
        }
        _ => KnsResolution {
            hit: None,
            note: Some("KNS has no owner record for this name".to_string()),
        },
    }
}

/// GET /resolve/{query}?network=mainnet|testnet-10|testnet-12  (default mainnet)
/// Returns the exact smart-resolve contract the frontend codes to.
async fn resolve_handler(
    Extension(db): Extension<db::Db>,
    Path(query): Path<String>,
    Query(params): Query<HashMap<String, String>>,
) -> Json<serde_json::Value> {
    let network = normalize_network(params.get("network").map(|s| s.as_str()));
    let trimmed = query.trim().to_string();
    let lc = trimmed.to_lowercase();
    let kind = classify_query(&trimmed);

    // Defaults for the contract; each branch fills what it can.
    let mut resolved = false;
    let mut address: Option<String> = None;
    let mut covenant_id: Option<String> = None;
    let mut network_hint: Option<&'static str> = None;
    let mut kns: Option<serde_json::Value> = None;
    let mut note: Option<String> = None;

    match kind {
        QueryKind::Kns => match kns_net_for(&network) {
            Ok(kns_net) => {
                let res = resolve_kns(&lc, kns_net).await;
                match res.hit {
                    Some(hit) => {
                        resolved = true;
                        address = Some(hit.owner.clone());
                        kns = Some(json!({ "name": hit.name, "owner": hit.owner }));
                    }
                    None => {
                        note = res.note;
                    }
                }
            }
            Err(unsupported) => {
                // testnet-12 (or any non-KNS net): honest, fail-closed, no call made.
                note = Some(unsupported.to_string());
            }
        },
        QueryKind::Address => {
            resolved = true;
            address = Some(trimmed.clone());
            network_hint = address_network_hint(&trimmed);
        }
        QueryKind::Txid => {
            // Optionally upgrade to a known covenant. Read-only lookup; matches the
            // idiom in covenant_actions_handler (get_covenant_by_txid locks its own
            // pooled connection). Any error/None simply leaves it classified as a txid,
            // so the handler never panics on a DB hiccup. Kaspa txids are canonical
            // lowercase hex, so look up the lowercased form to rescue an uppercase paste.
            if let Ok(Some(c)) = db::get_covenant_by_txid(&db, &lc) {
                covenant_id = Some(c.tx_id.clone());
                resolved = true;
                // Surface the covenant's network so callers do not have to guess.
                note = Some(format!("indexed covenant ({})", c.network));
            }
        }
        QueryKind::Keyword => {
            note = Some("free-text keyword; try the /covenants?q= search".to_string());
        }
    }

    // The type string is "covenant" only when we actually matched an indexed covenant
    // (a txid that resolved in the DB); otherwise it is the classified kind.
    let type_str = if covenant_id.is_some() {
        "covenant"
    } else {
        kind.as_str()
    };

    Json(json!({
        "query": query,
        "type": type_str,
        "resolved": resolved,
        "address": address,
        "covenant_id": covenant_id,
        "network": network,
        "network_hint": network_hint,
        "kns": kns,
        "note": note,
    }))
}

pub fn resolve_routes() -> Router {
    Router::new().route("/resolve/:query", get(resolve_handler))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_kaspa_address_with_mainnet_hint() {
        assert_eq!(classify_query("kaspa:qpz2abc"), QueryKind::Address);
        assert_eq!(address_network_hint("kaspa:qpz2abc"), Some("mainnet"));
    }

    #[test]
    fn classifies_kaspatest_address_with_testnet_hint() {
        assert_eq!(classify_query("kaspatest:qpz2abc"), QueryKind::Address);
        assert_eq!(address_network_hint("kaspatest:qpz2abc"), Some("testnet"));
    }

    #[test]
    fn address_prefix_is_case_insensitive_and_trimmed() {
        assert_eq!(classify_query("  KASPA:QPZ2  "), QueryKind::Address);
        assert_eq!(address_network_hint("  KASPA:QPZ2  ".trim()), Some("mainnet"));
    }

    #[test]
    fn classifies_64_hex_as_txid() {
        let h = "a".repeat(64);
        assert_eq!(classify_query(&h), QueryKind::Txid);
        // Uppercase hex also counts (we lowercase first).
        assert_eq!(classify_query(&"AB".repeat(32)), QueryKind::Txid);
    }

    #[test]
    fn classifies_colon_id_as_txid() {
        // A covenant id form (txid:vout) contains a colon and is not an address prefix.
        assert_eq!(classify_query("deadbeef:0"), QueryKind::Txid);
    }

    #[test]
    fn classifies_kas_domain_as_kns() {
        assert_eq!(classify_query("binance06.kas"), QueryKind::Kns);
        assert_eq!(classify_query("  Binance06.KAS  "), QueryKind::Kns);
    }

    #[test]
    fn bare_kas_suffix_is_not_kns() {
        // ".kas" alone (len == 4) is not a domain; falls through to keyword.
        assert_eq!(classify_query(".kas"), QueryKind::Keyword);
    }

    #[test]
    fn classifies_plain_word_as_keyword() {
        assert_eq!(classify_query("chess"), QueryKind::Keyword);
        // 63 or 65 hex chars is NOT a 64-hex txid, and has no colon -> keyword.
        assert_eq!(classify_query(&"a".repeat(63)), QueryKind::Keyword);
        assert_eq!(classify_query(&"a".repeat(65)), QueryKind::Keyword);
        // Non-hex 64-char string is not a txid either.
        assert_eq!(classify_query(&"z".repeat(64)), QueryKind::Keyword);
    }

    #[test]
    fn kns_net_mapping_is_correct() {
        assert_eq!(kns_net_for("mainnet"), Ok("mainnet"));
        assert_eq!(kns_net_for("testnet-10"), Ok("tn10"));
        assert!(kns_net_for("testnet-12").is_err());
        // The testnet-12 note is the honest, contract-specified one.
        assert_eq!(
            kns_net_for("testnet-12"),
            Err("KNS is not indexed on testnet-12")
        );
        assert!(kns_net_for("dogecoin").is_err());
    }

    #[test]
    fn network_normalization_defaults_to_mainnet() {
        assert_eq!(normalize_network(None), "mainnet");
        assert_eq!(normalize_network(Some("")), "mainnet");
        assert_eq!(normalize_network(Some("mainnet")), "mainnet");
        assert_eq!(normalize_network(Some("testnet-10")), "testnet-10");
        assert_eq!(normalize_network(Some("tn10")), "testnet-10");
        assert_eq!(normalize_network(Some("testnet-12")), "testnet-12");
        assert_eq!(normalize_network(Some("tn12")), "testnet-12");
        assert_eq!(normalize_network(Some("bogus")), "mainnet");
    }

    #[test]
    fn encode_segment_passes_simple_and_escapes_unsafe() {
        assert_eq!(encode_segment("binance06.kas"), "binance06.kas");
        assert_eq!(encode_segment("a-b_c.kas"), "a-b_c.kas");
        // A path separator or space must be percent-encoded, never injected raw.
        assert_eq!(encode_segment("a/b"), "a%2Fb");
        assert_eq!(encode_segment("a b"), "a%20b");
    }
}
