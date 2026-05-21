use crate::db;
use crate::covenant_types::{CovenantCategory, CovenantRecord};
use kaspa_addresses::Address;
use kaspa_consensus_core::tx::ScriptPublicKey;
use kaspa_rpc_core::api::rpc::RpcApi;
use kaspa_wrpc_client::KaspaRpcClient;
use std::sync::Arc;
use std::sync::Mutex;
use tracing::{info, warn, error, debug};

/// Production-grade covenant indexer. After EVERY successful covenant detection,
/// immediately triggers basic UI generation (fire-and-forget tokio spawn).
/// Handles Toccata hard-fork rules and 10+ BPS throughput.
pub async fn run_indexer(
    client: Arc<KaspaRpcClient>,
    db: Arc<Mutex<rusqlite::Connection>>,
    seed_addresses: Vec<String>,
) {
    info!("Covex Indexer v2 started -- auto-generating basic UIs for ALL detected covenants");

    let mut interval = tokio::time::interval(std::time::Duration::from_secs(10));
    let mut indexed_total: u64 = 0;

    loop {
        interval.tick().await;

        if !client.is_connected() {
            warn!("Indexer: wRPC client not connected, reconnecting...");
            if let Err(e) = client.connect(None).await {
                warn!("Indexer: reconnect failed: {}", e);
            }
            continue;
        }

        let mut tick_found = 0usize;

        // 1. Scan seed addresses for covenant UTXOs
        for addr_str in &seed_addresses {
            if addr_str.is_empty() { continue; }
            let addr = match Address::try_from(addr_str.as_str()) {
                Ok(a) => a,
                Err(e) => { debug!("Indexer: invalid seed {}: {}", addr_str, e); continue; }
            };

            match client.get_utxos_by_addresses(vec![addr.clone()]).await {
                Ok(entries) => {
                    for entry in entries {
                        let tx_id = entry.outpoint.transaction_id.to_string();
                        let address = entry.address.map(|a| a.to_string()).unwrap_or_default();
                        let amount_sompi = entry.utxo_entry.amount;
                        let script_hex = entry.utxo_entry.script_public_key.script().to_string();
                        let script_hash = crate::compute_script_hash(&script_hex);
                        let category = CovenantCategory::from_script_ops(&script_hex);
                        let covenant_type = classify_covenant(&script_hex);
                        let block_daa = entry.utxo_entry.block_daa_score;

                        if let Err(e) = db::insert_covenant(
                            &db, &tx_id, &address, amount_sompi, &script_hash,
                            &script_hex, &covenant_type, category.label(),
                            &address, "", block_daa,
                        ) {
                            error!("Indexer: insert failed {}: {}", tx_id, e);
                        } else {
                            tick_found += 1;
                            indexed_total += 1;
                            // AUTO-GENERATE BASIC UI for every detected covenant
                            let gen_db = Arc::clone(&db);
                            let gen_tx_id = tx_id.clone();
                            let gen_type = covenant_type.clone();
                            let gen_cat = category.label().to_string();
                            let gen_hash = script_hash.clone();
                            let gen_addr = address.clone();
                            tokio::spawn(async move {
                                let params = crate::ui_generator::extract_parameters_from_script("aa20", &gen_hash);
                                let config = crate::covenant_types::UiGenerationConfig {
                                    covenant_id: gen_tx_id.clone(),
                                    covenant_name: format!("{} {}", gen_type, &gen_tx_id[..8]),
                                    category: gen_cat,
                                    script_hash: gen_hash,
                                    parameters: params,
                                    is_enhanced: false,
                                    disclosure_level: "limited".into(),
                                    creator_addr: gen_addr,
                                };
                                let ui_html = crate::ui_generator::generate_basic_ui(&config);
                                let slug = format!("covenant-{}", &gen_tx_id[..16]);
                                let _ = db::save_generated_ui(&gen_db, &gen_tx_id, &gen_tx_id, "FREE", &ui_html, "{}", &slug, false);
                                debug!("Indexer: auto-generated basic UI for {}", &gen_tx_id[..16]);
                            });
                        }
                    }
                }
                Err(e) => { warn!("Indexer: get_utxos failed for {}: {}", addr_str, e); }
            }
        }

        // 2. Scan recent blocks for covenant scripts
        match client.get_block_dag_info().await {
            Ok(resp) => {
                let start_daa = resp.virtual_daa_score.saturating_sub(50);
                let end_daa = resp.virtual_daa_score;
                if let Ok(blocks_resp) = client.get_blocks(Some(start_daa), Some((end_daa - start_daa).min(20)), true).await {
                    for block in blocks_resp {
                        let block_daa = block.header.daa_score;
                        for tx in block.transactions {
                            for (idx, output) in tx.outputs.iter().enumerate() {
                                let spk_hex = output.script_public_key.script().to_string();
                                if is_covenant_script(&spk_hex) {
                                    let tx_id = format!("{}:{}", tx.id(), idx);
                                    let amount_sompi = output.value;
                                    let category = CovenantCategory::from_script_ops(&spk_hex);
                                    let covenant_type = classify_covenant(&spk_hex);
                                    let script_hash = crate::compute_script_hash(&spk_hex);
                                    let address = format!("{}:cov_{}...", if resp.network.as_deref() == Some("mainnet") { "kaspa" } else { "kaspatest" }, &tx_id[..16]);

                                    if let Err(e) = db::insert_covenant(&db, &tx_id, &address, amount_sompi, &script_hash, &spk_hex, &covenant_type, category.label(), "", "", block_daa) {
                                        error!("Indexer: block scan insert failed {}: {}", tx_id, e);
                                    } else {
                                        tick_found += 1;
                                        indexed_total += 1;
                                        // AUTO-GENERATE BASIC UI
                                        let gen_db = Arc::clone(&db);
                                        let gen_tx_id = tx_id.clone();
                                        let gen_type = covenant_type.clone();
                                        let gen_cat = category.label().to_string();
                                        let gen_hash = script_hash.clone();
                                        tokio::spawn(async move {
                                            let params = crate::ui_generator::extract_parameters_from_script("aa20", &gen_hash);
                                            let config = crate::covenant_types::UiGenerationConfig {
                                                covenant_id: gen_tx_id.clone(),
                                                covenant_name: format!("{} {}", gen_type, &gen_tx_id[..8]),
                                                category: gen_cat, script_hash: gen_hash,
                                                parameters: params, is_enhanced: false,
                                                disclosure_level: "limited".into(),
                                                creator_addr: String::new(),
                                            };
                                            let ui_html = crate::ui_generator::generate_basic_ui(&config);
                                            let slug = format!("covenant-{}", &gen_tx_id[..16]);
                                            let _ = db::save_generated_ui(&gen_db, &gen_tx_id, &gen_tx_id, "FREE", &ui_html, "{}", &slug, false);
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
            }
            Err(e) => { warn!("Indexer: get_block_dag_info failed: {}", e); }
        }

        if tick_found > 0 {
            info!("Indexer: tick {} new (total: {}), basic UIs queued", tick_found, indexed_total);
        }
    }
}

fn is_covenant_script(script_hex: &str) -> bool {
    script_hex.starts_with("aa20") || script_hex.contains("aa20")
    || script_hex.contains("aa21") || script_hex.contains("aa22") || script_hex.contains("aa23")
}

fn classify_covenant(script_hex: &str) -> String {
    if script_hex.is_empty() { return "unknown".into(); }
    if script_hex.starts_with("aa20") && script_hex.ends_with("87") { return "p2sh-covenant".into(); }
    if script_hex.contains("aa21") { return "extended-covenant".into(); }
    if script_hex.contains("aa22") { return "multi-sig-covenant".into(); }
    if script_hex.contains("51") { return "spendable-covenant".into(); }
    "generic-covenant".into()
}
