use crate::db;
use kaspa_rpc_core::api::rpc::RpcApi;
use kaspa_wrpc_client::KaspaRpcClient;
use std::sync::Arc;
use std::sync::Mutex;
use tracing::{info, warn, error, debug};

/// Historic BlockDAG Crawler
///
/// Polls the virtual tip periodically and walks the selected-parent chain
/// backwards to discover covenant UTXOs that predate the live indexer.
///
/// Checkpointed via crawler_state table — survives restarts.

const MAX_WALK_DISTANCE: u64 = 500; // blocks per tick

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
            tokio::time::sleep(std::time::Duration::from_secs(5)).await;
            continue;
        }

        let dag_info = match tokio::time::timeout(
            std::time::Duration::from_secs(15),
            client.get_block_dag_info(),
        )
        .await
        {
            Ok(Ok(info)) => info,
            Ok(Err(e)) => {
                warn!("Crawler: get_block_dag_info failed: {}", e);
                tokio::time::sleep(std::time::Duration::from_secs(10)).await;
                continue;
            }
            Err(_elapsed) => {
                warn!("Crawler: get_block_dag_info timed out after 15s");
                tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                continue;
            }
        };

        let virtual_daa = dag_info.virtual_daa_score;

        // Nothing to scan
        if scan_daa >= virtual_daa {
            // Persist checkpoint
            let _ = db::update_last_scanned_daa(&db, scan_daa);
            tokio::time::sleep(std::time::Duration::from_secs(60)).await;
            continue;
        }

        // Walk selected parent chain backwards from a known tip
        let tip_hash = match dag_info.virtual_parent_hashes.first() {
            Some(h) => h.clone(),
            None => {
                warn!("Crawler: no virtual parent hashes — node still syncing?");
                tokio::time::sleep(std::time::Duration::from_secs(30)).await;
                continue;
            }
        };

        info!(
            "Crawler: walking from tip DAA {} (scanned={})",
            virtual_daa, scan_daa
        );

        // Follow selected parent chain backward
        let mut current_hash = tip_hash;
        let mut walked = 0u64;
        let mut batch_found = 0usize;

        for _step in 0..MAX_WALK_DISTANCE {
            // Check connection
            if !client.is_connected() {
                break;
            }

            // Fetch block
            let block = match client.get_block(current_hash.clone(), false).await {
                Ok(b) => b,
                Err(e) => {
                    debug!("Crawler: get_block failed at {}: {}", current_hash, e);
                    break;
                }
            };

            let block_daa = block.header.daa_score;

            // Stop when we've covered all unscanned blocks
            if block_daa <= scan_daa {
                scan_daa = scan_daa.max(block_daa);
                break;
            }

            // Extract covenant outputs from this block
            for tx in &block.transactions {
                for (out_idx, output) in tx.outputs.iter().enumerate() {
                    let spk_bytes = output.script_public_key.script();
                    let spk_hex = hex::encode(spk_bytes);

                    if !looks_like_covenant(&spk_hex) {
                        continue;
                    }

                    let tx_hash = tx
                        .verbose_data
                        .as_ref()
                        .map(|vd| vd.transaction_id.to_string())
                        .unwrap_or_else(|| format!("{}-tx", block.header.hash.to_string()));
                    let tx_id = format!("{}:{}", tx_hash, out_idx);
                    let amount_sompi = output.value;
                    let covenant_type = classify_covenant(&spk_hex);
                    let category = categorize(&spk_hex);
                    let address = format!("kaspatest:{}", &tx_hash[..32]);
                    let script_hash = crate::compute_script_hash(&spk_hex);

                    match db::insert_covenant(
                        &db, &tx_id, &address, amount_sompi,
                        &script_hash, &spk_hex, &covenant_type,
                        &category, &address, "", block_daa,
                    ) {
                        Ok(_) => {
                            batch_found += 1;
                            debug!(
                                "Crawler: found {} {} @ DAA {} ({} KAS)",
                                covenant_type, &tx_id[..16],
                                block_daa,
                                amount_sompi as f64 / 100_000_000.0
                            );
                        }
                        Err(e) if e.to_string().contains("UNIQUE") => {}
                        Err(e) => {
                            error!("Crawler: insert failed {}: {}", &tx_id[..16], e);
                        }
                    }
                }
            }

            walked += 1;
            scan_daa = scan_daa.max(block_daa);

            // Follow selected parent (first parent in level 0)
            match block.header.parents_by_level.first().and_then(|v| v.first()) {
                Some(parent_hash) => {
                    current_hash = *parent_hash;
                }
                None => {
                    debug!("Crawler: reached genesis at DAA {}", block_daa);
                    break;
                }
            }
        }

        total_found += batch_found as u64;

        info!(
            "Crawler: walked {} blocks, found {} new (total: {}), now at DAA {}",
            walked, batch_found, total_found, scan_daa
        );

        let _ = db::update_last_scanned_daa(&db, scan_daa);

        // Pace the crawler
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
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
