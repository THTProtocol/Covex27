use crate::db;
use kaspa_rpc_core::api::rpc::RpcApi;
use kaspa_wrpc_client::KaspaRpcClient;
use std::sync::Arc;
use std::sync::Mutex;
use tracing::{info, warn, error, debug};

/// Historic BlockDAG Crawler
/// Walks blocks from CRAWL_START_DAA forward by requesting the virtual
/// selected parent chain from the tip down to the scanned height, then
/// processes each block for covenant UTXOs.

const BATCH_SIZE: usize = 50;

pub async fn run_crawler(
    client: Arc<KaspaRpcClient>,
    db: Arc<Mutex<rusqlite::Connection>>,
    start_daa: u64,
) {
    info!("Historic Crawler started (start_daa={})", start_daa);

    // Resume from checkpoint or start from env
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

        // Get current state
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
            debug!(
                "Crawler: at tip (scan={}, virtual={}), sleeping 60s",
                scan_daa, virtual_daa
            );
            // Update checkpoint
            let _ = db::update_last_scanned_daa(&db, scan_daa);
            tokio::time::sleep(std::time::Duration::from_secs(60)).await;
            continue;
        }

        // Walk virtual selected parent chain from tip to scan_daa
        let start_tip_hash = dag_info.virtual_parent_hashes.first().cloned();
        match client
            .get_virtual_selected_parent_chain_from_block(
                start_tip_hash.unwrap_or_default(),
                true,
            )
            .await
        {
            Ok(chain_resp) => {
                let hashes: Vec<_> = chain_resp
                    .accepted_transaction_ids
                    .iter()
                    .take(BATCH_SIZE)
                    .cloned()
                    .collect();

                if hashes.is_empty() {
                    tokio::time::sleep(std::time::Duration::from_secs(30)).await;
                    continue;
                }

                let mut batch_found = 0usize;
                let mut max_daa = scan_daa;

                // Process each block
                for hash in &hashes {
                    match client.get_block(hash.clone(), false).await {
                        Ok(block) => {
                            let block_daa = block.header.daa_score;

                            // Skip blocks below our scan position
                            if block_daa <= scan_daa {
                                continue;
                            }

                            if block_daa > max_daa {
                                max_daa = block_daa;
                            }

                            for tx in &block.transactions {
                                for (idx, output) in tx.outputs.iter().enumerate() {
                                    let spk_bytes = output.script_public_key.script();
                                    let spk_hex = hex::encode(spk_bytes);

                                    if !looks_like_covenant(&spk_hex) {
                                        continue;
                                    }

                                    let tx_hash = tx.verbose_data.transaction_id.to_string();
                                    let tx_id = format!("{}:{}", tx_hash, idx);
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
                            warn!("Crawler: get_block failed: {}", e);
                        }
                    }
                }

                // Advance
                scan_daa = max_daa;
                total_found += batch_found as u64;

                if batch_found > 0 || max_daa > scan_daa {
                    info!(
                        "Crawler: scanned to DAA {} (tick: {}, total: {})",
                        scan_daa, batch_found, total_found
                    );
                }
                let _ = db::update_last_scanned_daa(&db, scan_daa);
            }
            Err(e) => {
                warn!("Crawler: get_virtual_selected_parent_chain failed: {}", e);
                tokio::time::sleep(std::time::Duration::from_secs(10)).await;
            }
        }

        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
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
