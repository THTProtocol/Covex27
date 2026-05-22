use crate::db;
use crate::indexer;
use kaspa_rpc_core::api::rpc::RpcApi;
use kaspa_wrpc_client::KaspaRpcClient;
use std::sync::Arc;
use std::sync::Mutex;
use tracing::{info, warn, error, debug};

/// Historic BlockDAG Crawler
/// Walks blocks from CRAWL_START_DAA forward to discover covenant UTXOs
/// persisted in the DAG before Covex went live. Persists checkpoint to
/// crawler_state table so it survives restarts.

const BATCH_SIZE: u64 = 50;
const TICK_SLEEP_MS: u64 = 200;

pub async fn run_crawler(
    client: Arc<KaspaRpcClient>,
    db: Arc<Mutex<rusqlite::Connection>>,
    start_daa: u64,
) {
    info!("Historic Crawler started (start_daa={})", start_daa);

    // Resume from checkpoint or start from env
    let current_daa = match db::get_last_scanned_daa(&db) {
        Ok(daa) if daa > 0 => {
            info!("Crawler: resuming from checkpoint DAA {}", daa);
            daa
        }
        _ => {
            info!("Crawler: starting from CRAWL_START_DAA={}", start_daa);
            start_daa
        }
    };

    let mut scan_daa = current_daa;
    let mut total_found: u64 = 0;

    loop {
        // Ensure client is connected
        if !client.is_connected() {
            warn!("Crawler: wRPC disconnected, attempting reconnect...");
            if let Err(e) = client.connect(None).await {
                warn!("Crawler: reconnect failed: {}, retrying in 5s", e);
                tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                continue;
            }
            info!("Crawler: reconnected to wRPC node");
        }

        // Get current virtual DAA to avoid ahead-of-chain scanning
        let virtual_daa = match client.get_block_dag_info().await {
            Ok(info) => info.virtual_daa_score,
            Err(e) => {
                warn!("Crawler: get_block_dag_info failed: {}", e);
                tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                continue;
            }
        };

        // Don't scan past the virtual DAA
        if scan_daa >= virtual_daa {
            debug!(
                "Crawler: at tip (scan_daa={}, virtual={}), sleeping 60s",
                scan_daa, virtual_daa
            );
            tokio::time::sleep(std::time::Duration::from_secs(60)).await;
            continue;
        }

        let end_daa = (scan_daa + BATCH_SIZE).min(virtual_daa);
        let requested = end_daa - scan_daa;

        info!(
            "Crawler: scanning blocks {} → {} ({} blocks, total found: {})",
            scan_daa, end_daa, requested, total_found
        );

        // Fetch blocks
        match client
            .get_blocks(Some(scan_daa), Some(requested), true)
            .await
        {
            Ok(blocks_response) => {
                let blocks = blocks_response.blocks;
                let mut batch_found = 0usize;

                for block in blocks {
                    let block_daa = block.header.daa_score;
                    // Skip header-only blocks
                    if block.transactions.is_empty() {
                        continue;
                    }

                    for tx in &block.transactions {
                        for (idx, output) in tx.outputs.iter().enumerate() {
                            let spk_bytes = output.script_public_key.script();
                            let spk_hex = hex::encode(spk_bytes);

                            // Check if this output looks like a covenant
                            if !looks_like_covenant(&spk_hex) {
                                continue;
                            }

                            // Build a unique ID from transaction hash + output index
                            let tx_hash = tx.id().to_string();
                            let tx_id = format!("{}:{}", tx_hash, idx);
                            let amount_sompi = output.value;

                            let covenant_type = classify_covenant(&spk_hex);
                            let category = categorize(&spk_hex);
                            let address = format!(
                                "kaspatest:{}",
                                &tx_hash[..32]
                            );
                            let script_hash = crate::compute_script_hash(&spk_hex);

                            if let Err(e) = db::insert_covenant(
                                &db,
                                &tx_id,
                                &address,
                                amount_sompi,
                                &script_hash,
                                &spk_hex,
                                &covenant_type,
                                &category,
                                &address,
                                "",
                                block_daa,
                            ) {
                                // "UNIQUE constraint failed" is expected for duplicates
                                if !e.to_string().contains("UNIQUE") {
                                    error!("Crawler: insert failed {}: {}", &tx_id[..16], e);
                                }
                            } else {
                                batch_found += 1;
                                debug!(
                                    "Crawler: found {} {} @ DAA {} ({} KAS)",
                                    covenant_type,
                                    &tx_id[..16],
                                    block_daa,
                                    amount_sompi as f64 / 100_000_000.0
                                );
                            }
                        }
                    }
                }

                if batch_found > 0 {
                    total_found += batch_found as u64;
                    info!(
                        "Crawler: tick {} new (total: {})",
                        batch_found, total_found
                    );
                }
            }
            Err(e) => {
                warn!("Crawler: get_blocks failed: {}", e);
                tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                continue;
            }
        }

        // Advance checkpoint
        scan_daa = end_daa;
        if let Err(e) = db::update_last_scanned_daa(&db, scan_daa) {
            error!("Crawler: failed to update checkpoint: {}", e);
        }

        // Pace the crawler to avoid overloading the node
        tokio::time::sleep(std::time::Duration::from_millis(TICK_SLEEP_MS)).await;
    }
}

/// Quick heuristic to detect covenant-like scripts
fn looks_like_covenant(spk_hex: &str) -> bool {
    if spk_hex.len() < 4 {
        return false;
    }
    // Covenant scripts contain aa20/aa21/aa22/aa23 opcodes
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
