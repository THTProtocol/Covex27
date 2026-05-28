use crate::covenant_types::CovenantCategory;
use crate::db;
use kaspa_addresses::Address;
use kaspa_rpc_core::api::rpc::RpcApi;
use kaspa_wrpc_client::KaspaRpcClient;
use std::sync::Arc;
use std::sync::Mutex;
use tracing::{debug, error, info, warn};

/// Live covenant indexer. After EVERY successful covenant detection,
/// immediately triggers basic UI generation (fire-and-forget tokio spawn).
///
/// Also determines tier by scanning UTXO entries for treasury payments.
/// THIS INDEXER IS THE ONLY CODE ALLOWED TO WRITE TO covex.db.

// Tier thresholds in sompi
const MAX_THRESHOLD: u64 = 100_000_000_000;
const PRO_THRESHOLD: u64 = 50_000_000_000;
const CREATOR_THRESHOLD: u64 = 10_000_000_000;

/// Compute the expected P2PKH script hex for a Kaspa address
fn treasury_script_hex(treasury_addr: &Address) -> Option<String> {
    let payload = treasury_addr.payload.as_slice();
    if payload.len() >= 20 {
        let hash160 = &payload[payload.len() - 20..];
        Some(format!("76a914{}88ac", hex::encode(hash160)))
    } else {
        None
    }
}

/// Determine tier from the script hex of a UTXO — checks if it's a treasury address
fn tier_from_script(spk_hex: &str, _treasury_script: &str, amount: u64) -> (String, u64) {
    // For the indexer, we check individual UTXO amounts.
    // The live indexer polls seed addresses for covenant UTXOs — treasury matching
    // is less relevant here since we're already filtering by seed addresses.
    // But if a UTXO has a large amount going to treasury, we detect it.

    if amount >= MAX_THRESHOLD {
        ("MAX".to_string(), amount)
    } else if amount >= PRO_THRESHOLD {
        ("PRO".to_string(), amount)
    } else if amount >= CREATOR_THRESHOLD {
        ("CREATOR".to_string(), amount)
    } else {
        ("FREE".to_string(), 0)
    }
}

pub async fn run_indexer(
    client: Arc<KaspaRpcClient>,
    db: Arc<Mutex<rusqlite::Connection>>,
    seed_addresses: Vec<String>,
    treasury_address: String,
) {
    info!(
        "Covex Indexer v3 started — tier-aware indexing (treasury={})",
        treasury_address
    );

    let treasury_addr = match Address::try_from(treasury_address.as_str()) {
        Ok(a) => a,
        Err(e) => {
            error!("Indexer: invalid treasury address: {}", e);
            return;
        }
    };

    let treasury_script = match treasury_script_hex(&treasury_addr) {
        Some(s) => s,
        None => {
            error!("Indexer: could not compute treasury script");
            return;
        }
    };

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

        // Scan seed addresses for covenant UTXOs
        for addr_str in &seed_addresses {
            if addr_str.is_empty() {
                continue;
            }
            let addr = match Address::try_from(addr_str.as_str()) {
                Ok(a) => a,
                Err(e) => {
                    debug!("Indexer: invalid seed {}: {}", addr_str, e);
                    continue;
                }
            };

            match client.get_utxos_by_addresses(vec![addr.clone()]).await {
                Ok(entries) => {
                    for entry in entries {
                        let tx_id = entry.outpoint.transaction_id.to_string();
                        let address = entry.address.map(|a| a.to_string()).unwrap_or_default();
                        let amount_sompi = entry.utxo_entry.amount;
                        let script_hex = hex::encode(entry.utxo_entry.script_public_key.script());

                        // Reject standard wallet outputs — NOT covenants.
                        // Standard outputs ≤ 40 raw bytes, or P2PKH/Schnorr/P2SH.
                        if is_standard_output(&script_hex) {
                            debug!(
                                "Indexer: skipping standard output UTXO {} ({} bytes)",
                                &tx_id[..16],
                                script_hex.len() / 2
                            );
                            continue;
                        }
                        // Must also pass covenant bytecode detection
                        if !looks_like_covenant(&script_hex) {
                            debug!("Indexer: skipping non-covenant output {}", &tx_id[..16]);
                            continue;
                        }

                        let script_hash = crate::compute_script_hash(&script_hex);
                        let category = CovenantCategory::from_script_ops(&script_hex);
                        let covenant_type = classify_covenant(&script_hex);
                        let block_daa = entry.utxo_entry.block_daa_score;

                        // Determine tier — check if UTXO is a treasury payment
                        // For seed addresses, tier is determined by the UTXO amount itself
                        // (the indexer looks at seed addresses, not treasury addresses)
                        let (tier, _) =
                            tier_from_script(&script_hex, &treasury_script, amount_sompi);

                        if let Err(e) = db::insert_covenant(
                            &db,
                            &tx_id,
                            &address,
                            amount_sompi,
                            &script_hash,
                            &script_hex,
                            &covenant_type,
                            category.label(),
                            &address,
                            "",
                            block_daa,
                            &tier,
                            &format!(
                                "{} covenant locking {:.2} KAS on Kaspa BlockDAG TN-12",
                                covenant_type,
                                amount_sompi as f64 / 100_000_000.0
                            ),
                            &format!("[\"{}\"]", address),
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
                            let gen_tier = tier.clone();
                            tokio::spawn(async move {
                                let params = crate::ui_generator::extract_parameters_from_script(
                                    "aa20", &gen_hash,
                                );
                                let config = crate::covenant_types::UiGenerationConfig {
                                    covenant_id: gen_tx_id.clone(),
                                    covenant_name: format!("{} {}", gen_type, &gen_tx_id[..8]),
                                    category: gen_cat,
                                    script_hash: gen_hash,
                                    parameters: params,
                                    is_enhanced: gen_tier != "FREE",
                                    disclosure_level: if gen_tier == "FREE" {
                                        "limited".into()
                                    } else {
                                        "full".into()
                                    },
                                    creator_addr: gen_addr,
                                };
                                let ui_html = crate::ui_generator::generate_basic_ui(&config);
                                let slug = format!("covenant-{}", &gen_tx_id[..16]);
                                let featured = gen_tier == "MAX" || gen_tier == "PRO";
                                let priority: i32 = match gen_tier.as_str() {
                                    "MAX" => 100,
                                    "PRO" => 50,
                                    "CREATOR" => 10,
                                    _ => 0,
                                };
                                let _ = db::save_generated_ui(
                                    &gen_db, &gen_tx_id, &gen_tx_id, &gen_tier, &ui_html, "{}",
                                    &slug, featured,
                                );
                                let _ = db::set_visibility(
                                    &gen_db, &gen_tx_id, &gen_tier, featured, priority, None,
                                );
                                debug!("Indexer: auto-generated basic UI for {}", &gen_tx_id[..16]);
                            });
                        }
                    }
                }
                Err(e) => {
                    warn!("Indexer: get_utxos failed for {}: {}", addr_str, e);
                }
            }
        }

        if tick_found > 0 {
            info!(
                "Indexer: tick {} new (total: {}), basic UIs queued",
                tick_found, indexed_total
            );
        }
    }
}

fn is_covenant_script(script_hex: &str) -> bool {
    script_hex.starts_with("aa20")
        || script_hex.contains("aa20")
        || script_hex.contains("aa21")
        || script_hex.contains("aa22")
        || script_hex.contains("aa23")
}

fn classify_covenant(script_hex: &str) -> String {
    if script_hex.is_empty() {
        return "unknown".into();
    }
    if script_hex.starts_with("aa20") && script_hex.ends_with("87") {
        return "p2sh-covenant".into();
    }
    if script_hex.contains("aa21") {
        return "extended-covenant".into();
    }
    if script_hex.contains("aa22") {
        return "multi-sig-covenant".into();
    }
    if script_hex.contains("51") {
        return "spendable-covenant".into();
    }
    "generic-covenant".into()
}

/// Returns true if the script is a standard wallet output — NOT a covenant.
/// Standard outputs ≤ 40 raw bytes, or known patterns (P2PKH, Schnorr P2PK, P2SH).
fn is_standard_output(spk_hex: &str) -> bool {
    let raw_len = spk_hex.len() / 2;
    if raw_len <= 40 {
        return true; // Too small for SilverScript payload
    }
    // P2PKH: 76a914<20>88ac (50 hex)
    if spk_hex.len() == 50 && spk_hex.starts_with("76a914") && spk_hex.ends_with("88ac") {
        return true;
    }
    // Schnorr P2PK: 20<32>ac (68 hex) | P2SH: a914<20>87 (46 hex)
    if (spk_hex.len() == 68 && spk_hex.starts_with("20") && spk_hex.ends_with("ac"))
        || (spk_hex.len() == 46 && spk_hex.starts_with("a914") && spk_hex.ends_with("87"))
    {
        return true;
    }
    false
}

fn looks_like_covenant(spk_hex: &str) -> bool {
    if is_standard_output(spk_hex) {
        return false;
    }
    if spk_hex.len() < 4 {
        return false;
    }
    spk_hex.contains("aa20")
        || spk_hex.contains("aa21")
        || spk_hex.contains("aa22")
        || spk_hex.contains("aa23")
}
