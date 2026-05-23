use crate::db;
use crate::ui_generator;
use crate::covenant_types;
use kaspa_addresses::Address;
use kaspa_rpc_core::api::rpc::RpcApi;
use kaspa_rpc_core::RpcTransaction;
use kaspa_wrpc_client::KaspaRpcClient;
use std::sync::Arc;
use std::sync::Mutex;
use tracing::{info, warn, error, debug};

/// Historic BlockDAG Crawler — walks the selected-parent chain backward from tip.
///
/// Covenant opcodes (aa20/aa21/aa22/aa23) are in tx.payload, NOT output scripts.
/// Tier determined by Output[1] → treasury P2PKH address.
///
/// THIS IS THE ONLY CODE ALLOWED TO WRITE TO covex.db.

const MAX_WALK_DISTANCE: u64 = 2000;
const MAX_THRESHOLD: u64 = 100_000_000_000;
const PRO_THRESHOLD: u64 = 50_000_000_000;
const CREATOR_THRESHOLD: u64 = 10_000_000_000;

fn treasury_script_hex(treasury_addr: &Address) -> Option<String> {
    let payload = treasury_addr.payload.as_slice();
    if payload.len() >= 20 {
        Some(format!("76a914{}88ac", hex::encode(&payload[payload.len()-20..])))
    } else {
        None
    }
}

fn determine_tier_from_outputs(tx: &RpcTransaction, treasury_script: &str) -> (String, u64) {
    if tx.outputs.len() < 2 { return ("FREE".to_string(), 0); }
    let o1 = &tx.outputs[1];
    let spk_hex = hex::encode(o1.script_public_key.script());
    let amount = o1.value;
    let is_treasury = spk_hex == treasury_script
        || (spk_hex.len()==50 && spk_hex.starts_with("76a914") && spk_hex.ends_with("88ac")
            && spk_hex[6..46] == treasury_script[6..46]);
    if !is_treasury { return ("FREE".to_string(), 0); }
    let tier = if amount >= MAX_THRESHOLD { "MAX" }
               else if amount >= PRO_THRESHOLD { "PRO" }
               else if amount >= CREATOR_THRESHOLD { "CREATOR" }
               else { return ("FREE".to_string(), 0); };
    (tier.to_string(), amount)
}

pub async fn run_crawler(
    client: Arc<KaspaRpcClient>,
    db: Arc<Mutex<rusqlite::Connection>>,
    treasury_address: String,
    start_daa: u64,
) {
    let treasury_addr = match Address::try_from(treasury_address.as_str()) {
        Ok(a) => a, Err(e) => { error!("Crawler: invalid treasury: {}", e); return; }
    };
    let treasury_script = match treasury_script_hex(&treasury_addr) {
        Some(s) => s, None => { error!("Crawler: treasury script fail"); return; }
    };
    info!("Crawler started: treasury={}, start_daa={}", treasury_address, start_daa);

    let mut scan_daa = db::get_last_scanned_daa(&db).unwrap_or(start_daa);
    let mut total_found: u64 = 0;

    loop {
        if !client.is_connected() { tokio::time::sleep(std::time::Duration::from_secs(5)).await; continue; }
        let dag = match tokio::time::timeout(std::time::Duration::from_secs(15), client.get_block_dag_info()).await {
            Ok(Ok(d)) => d, Ok(Err(e)) => { warn!("Crawler: dag_info: {}", e); tokio::time::sleep(std::time::Duration::from_secs(10)).await; continue; }
            Err(_) => { warn!("Crawler: dag_info timeout"); tokio::time::sleep(std::time::Duration::from_secs(5)).await; continue; }
        };
        let virtual_daa = dag.virtual_daa_score;
        if scan_daa >= virtual_daa { let _ = db::update_last_scanned_daa(&db, scan_daa); tokio::time::sleep(std::time::Duration::from_secs(60)).await; continue; }
        let tip_hash = match dag.virtual_parent_hashes.first() {
            Some(h) => h.clone(), None => { warn!("Crawler: no tip"); tokio::time::sleep(std::time::Duration::from_secs(30)).await; continue; }
        };
        info!("Crawler: tip DAA {} | scanned={}", virtual_daa, scan_daa);

        let mut cur = tip_hash;
        let mut walked = 0u64;
        let mut batch = 0usize;
        let mut lowest = virtual_daa;

        for _ in 0..MAX_WALK_DISTANCE {
            if !client.is_connected() { break; }
            let block = match client.get_block(cur.clone(), true).await {
                Ok(b) => b, Err(e) => { debug!("Crawler: block fail at {}: {}", cur, e); break; }
            };
            let daa = block.header.daa_score;
            if daa <= scan_daa { break; }
            lowest = daa.min(lowest);

            // Scan tx.payload for covenant opcodes
            for tx in &block.transactions {
                let pl = hex::encode(&tx.payload);
                if !pl.contains("aa20") && !pl.contains("aa21") && !pl.contains("aa22") && !pl.contains("aa23") { continue; }
                let (tier, _) = determine_tier_from_outputs(tx, &treasury_script);
                let amt = tx.outputs[0].value;
                let txh = tx.verbose_data.as_ref().map(|v| v.transaction_id.to_string())
                    .unwrap_or_else(|| format!("{}-tx", block.header.hash));
                let tid = format!("{}:{}", txh, 0);
                let ctype = classify(&pl);
                let cat = categorize(&pl);
                let addr = format!("kaspatest:{}", &txh[..32]);
                let shash = crate::compute_script_hash(&pl);

                match db::insert_covenant(&db, &tid, &addr, amt, &shash, &pl, &ctype, &cat, &addr, "", daa, &tier) {
                    Ok(_) => {
                        batch += 1;
                        info!("Crawler: FOUND {} {} DAA={} amt={}K tier={} pl={}", ctype, &tid[..16], daa, amt as f64/1e8, tier, &pl[..40.min(pl.len())]);
                        let (gdb, gid, gty, gcat, ghash, gaddr, gt) = (Arc::clone(&db), tid.clone(), ctype.clone(), cat.clone(), shash.clone(), addr.clone(), tier.to_string());
                        tokio::spawn(async move {
                            let p = ui_generator::extract_parameters_from_script("aa20", &ghash);
                            let cfg = covenant_types::UiGenerationConfig {
                                covenant_id: gid.clone(), covenant_name: format!("{} {}", gty, &gid[..8]),
                                category: gcat, script_hash: ghash, parameters: p,
                                is_enhanced: gt != "FREE", disclosure_level: if gt=="FREE" {"limited".into()} else {"full".into()}, creator_addr: gaddr,
                            };
                            let html = ui_generator::generate_basic_ui(&cfg);
                            let slug = format!("covenant-{}", &gid[..16]);
                            let feat = gt=="MAX"||gt=="PRO"; let pri: i32 = match gt.as_str() {"MAX"=>100,"PRO"=>50,"CREATOR"=>10,_=>0};
                            let _ = db::save_generated_ui(&gdb, &gid, &gid, &gt, &html, "{}", &slug, feat);
                            let _ = db::set_visibility(&gdb, &gid, &gt, feat, pri, None);
                        });
                    }
                    Err(e) if e.to_string().contains("UNIQUE") => {}
                    Err(e) => { error!("Crawler: insert fail {}: {}", &tid[..16], e); }
                }
            }

            walked += 1;
            // Follow selected parent
            match block.header.parents_by_level.first().and_then(|v| v.first()) {
                Some(ph) => cur = *ph,
                None => { debug!("Crawler: genesis at DAA {}", daa); break; }
            }
        }

        total_found += batch as u64;
        info!("Crawler: walked={} found={} total={} lowest_daa={}", walked, batch, total_found, lowest);
        scan_daa = lowest; // advance checkpoint to lowest DAA reached
        let _ = db::update_last_scanned_daa(&db, scan_daa);
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
    }
}

fn classify(hex: &str) -> String {
    if hex.starts_with("aa20") && hex.ends_with("87") { "p2sh-covenant".into() }
    else if hex.contains("aa21") { "extended-covenant".into() }
    else if hex.contains("aa22") { "multi-sig-covenant".into() }
    else { "generic-covenant".into() }
}
fn categorize(hex: &str) -> String {
    if hex.is_empty() { "General".into() }
    else if hex.contains("aa21") { "Escrow & Custody".into() }
    else if hex.contains("aa22") { "Tournaments".into() }
    else { "General".into() }
}
