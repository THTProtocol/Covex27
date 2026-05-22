use crate::db;
use kaspa_rpc_core::api::rpc::RpcApi;
use kaspa_wrpc_client::KaspaRpcClient;
use std::sync::Arc;
use std::sync::Mutex;
use tracing::{info, warn, error, debug};

/// Historic BlockDAG Crawler
/// Descends the virtual chain from tip toward origin, processing blocks
/// in reverse-DAA order, scanning for covenant UTXOs.
///
/// Uses get_virtual_chain_from_block to walk the selected-parent chain,
/// processes each block's outputs for covenant script patterns, and
/// persists via the shared DB layer. Checkpoint survives restarts.

const CHAIN_DEPTH: u64 = 50;

pub async fn run_crawler(
    client: Arc<KaspaRpcClient>,
    db: Arc<Mutex<rusqlite::Connection>>,
    start_daa: u64,
) {
    info!("Historic Crawler started (start_daa={})", start_daa);

    let mut scan_daa = match db::get_last_scanned_daa(&db) {
        Ok(daa) if daa > 0 => {
            info!("Crawler: resuming from checkpoint DAA {}", daa);
            daa
        }
        _ => {
            info!("Crawler: starting from CRAWL_START_DAA={}", start_daa);
            start_daa
        }
    };

    let mut total_found: u64 = 0;

    loop {
        if !client.is_connected() {
            warn!("Crawler: wRPC disconnected, reconnecting...");
            tokio::time::sleep(std::time::Duration::from_secs(5)).await;
            continue;
        }

        let dag_info = match client.get_block_dag_info().await {
            Ok(info) => info,
            Err(e) => {
                warn!("Crawler: get_block_dag_info failed: {}", e);
                tokio::time::sleep(std::time::Duration::from_secs(10)).await;
                continue;
            }
        };

        let virtual_daa = dag_info.virtual_daa_score;

        if scan_daa >= virtual_daa {
            debug!("Crawler: at tip (scan={}, virtual={})", scan_daa, virtual_daa);
            let _ = db::update_last_scanned_daa(&db, scan_daa);
            tokio::time::sleep(std::time::Duration::from_secs(60)).await;
            continue;
        }

        // Walk the virtual chain from the tip hash downward
        let tip_hash = dag_info.virtual_parent_hashes.first().cloned();
        match client
            .get_virtual_chain_from_block(tip_hash.unwrap_or_default(), true)
            .await
        {
            Ok(chain_resp) => {
                // added_chain_block_hashes: blocks from origin toward tip (DAA ascending)
                let block_hashes = &chain_resp.added_chain_block_hashes;
                if block_hashes.is_empty() {
                    tokio::time::sleep(std::time::Duration::from_secs(30)).await;
                    continue;
                }

                // Take the last CHAIN_DEPTH hashes (closest to tip)
                let start_idx = block_hashes.len().saturating_sub(CHAIN_DEPTH as usize);
                let batch: Vec<_> = block_hashes[start_idx..].to_vec();

                let mut batch_found = 0usize;
                let mut max_daa = scan_daa;

                for block_hash in &batch {
                    match client.get_block(block_hash.clone(), true).await {
                        Ok(block) => {
                            let block_daa = block.header.daa_score;
                            if block_daa <= scan_daa {
                                continue;
                            }
                            if block_daa > max_daa {
                                max_daa = block_daa;
                            }

                            for (tx_idx, tx) in block.transactions.iter().enumerate() {
                                // Build a stable identifier from block hash + position
                                let tx_hash = tx
                                    .verbose_data
                                    .as_ref()
                                    .map(|vd| vd.transaction_id.to_string())
                                    .unwrap_or_else(|| {
                                        format!("{}-{}", block_hash.to_string(), tx_idx)
                                    });

                                for (out_idx, output) in tx.outputs.iter().enumerate() {
                                    let spk_bytes = output.script_public_key.script();
                                    let spk_hex = hex::encode(spk_bytes);

                                    if !looks_like_covenant(&spk_hex) {
                                        continue;
                                    }

                                    let tx_id = format!("{}:{}", tx_hash, out_idx);
                                    let amount_sompi = output.value;
                                    let covenant_type = classify_covenant(&spk_hex);
                                    let category = categorize(&spk_hex);
                                    let address = format!("kaspatest:{}", &tx_hash[..32]);
                                    let script_hash = crate::compute_script_hash(&spk_hex);

                                    if let Err(e) = db::insert_covenant(
                                        &db, &tx_id, &address, amount_sompi,
                                        &script_hash, &spk_hex, &covenant_type,
                                        &category, &address, "", block_daa,
                                    ) {
                                        if !e.to_string().contains("UNIQUE") {
                                            error!("Crawler: insert failed {}: {}", &tx_id[..16], e);
                                        }
                                    } else {
                                        batch_found += 1;
                                        debug!(
                                            "Crawler: found {} {} @ DAA {} ({} KAS)",
                                            covenant_type, &tx_id[..16],
                                            block_daa,
                                            amount_sompi as f64 / 100_000_000.0
                                        );
                                    }
                                }
                            }
                        }
                        Err(e) => {
                            warn!("Crawler: get_block failed for {}: {}", block_hash, e);
                        }
                    }
                }

                if max_daa > scan_daa {
                    scan_daa = max_daa;
                    total_found += batch_found as u64;
                    info!(
                        "Crawler: scanned to DAA {} (tick: {}, total: {})",
                        scan_daa, batch_found, total_found
                    );
                    let _ = db::update_last_scanned_daa(&db, scan_daa);
                }
            }
            Err(e) => {
                warn!("Crawler: get_virtual_chain_from_block failed: {}", e);
                tokio::time::sleep(std::time::Duration::from_secs(10)).await;
            }
        }

        tokio::time::sleep(std::time::Duration::from_millis(300)).await;
    }
}

fn looks_like_covenant(spk_hex: &str) -> bool {
    if spk_hex.len() < 4 {
        return false;
    }
    spk_hex.contains("aa20")
        || spk_hex.contains("aa21")
        || spk_hex.contains("aa22")
        || spk_hex.contains("aa23")
}

fn classify_covenant(spk_hex: &str) -> String {
    if spk_hex.starts_with("aa20") && spk_hex.ends_with("87") {
        "p2sh-covenant".to_string()
    } else if spk_hex.contains("aa21") {
        "extended-covenant".to_string()
    } else if spk_hex.contains("aa22") {
        "multi-sig-covenant".to_string()
    } else if spk_hex.contains("51") {
        "spendable-covenant".to_string()
    } else {
        "generic-covenant".to_string()
    }
}

fn categorize(spk_hex: &str) -> String {
    if spk_hex.is_empty() {
        return "General".to_string();
    }
    if spk_hex.contains("51") {
        "Skill Contests".to_string()
    } else if spk_hex.contains("aa21") {
        "Escrow & Custody".to_string()
    } else if spk_hex.contains("aa22") {
        "Tournaments".to_string()
    } else {
        "General".to_string()
    }
}
