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

/// Historic BlockDAG Crawler
///
/// Polls the virtual tip periodically and walks the selected-parent chain
/// backwards to discover covenant UTXOs that predate the live indexer.
///
/// Checkpointed via crawler_state table — survives restarts.
///
/// THIS IS THE ONLY CODE ALLOWED TO WRITE TO covex.db.
/// Tier determination: scans all transaction outputs for a transfer to
/// COVENANT_TREASURY_ADDRESS, then maps the amount to a tier.

const MAX_WALK_DISTANCE: u64 = 500;

// Tier thresholds in sompi (1 KAS = 100_000_000 sompi)
const MAX_THRESHOLD: u64 = 100_000_000_000;
const PRO_THRESHOLD: u64 = 50_000_000_000;
const CREATOR_THRESHOLD: u64 = 10_000_000_000;

/// Compute the expected P2PKH script hex for a Kaspa address.
/// P2PKH script: OP_DUP OP_HASH160 <20-byte pubkey-hash> OP_EQUALVERIFY OP_CHECKSIG
/// = 76a914 + <20-byte hash> + 88ac
fn treasury_script_hex(treasury_addr: &Address) -> Option<String> {
    let payload = treasury_addr.payload.as_slice();
    // Kaspa testnet addresses have a version byte + 20-byte pubkey hash
    // Payload is: [version] [20-byte hash]
    if payload.len() >= 20 {
        let hash160 = &payload[payload.len() - 20..];
        Some(format!("76a914{}88ac", hex::encode(hash160)))
    } else {
        None
    }
}

/// PROTOCOL ENFORCEMENT: Output-position-based tier determination.
///
/// A valid paid-tier covenant transaction MUST follow this structure:
///   Output 0: Covenant payload (1 KAS locked in contract script)
///   Output 1: Tier Payment → Treasury (100/500/1000 KAS)
///   Output 2: Change → Deployer
///
/// If Output 1 does not exist or does not go to the treasury,
/// the transaction is indexed as "FREE" — no tier benefits.
///
/// This is the ON-CHAIN TRUTH. A covenant with no treasury output
/// at position 1 has no paid tier, regardless of what any API claims.
fn determine_tier_from_outputs(
    tx: &RpcTransaction,
    treasury_script: &str,
) -> (String, u64) {
    // Output 1 MUST exist and MUST be a treasury payment
    if tx.outputs.len() < 2 {
        return ("FREE".to_string(), 0);
    }

    let output_1 = &tx.outputs[1];
    let spk_hex = hex::encode(output_1.script_public_key.script());
    let amount = output_1.value;

    // Verify this is the treasury address (P2PKH match)
    let is_treasury = spk_hex == treasury_script
        || (spk_hex.starts_with("76a914")
            && spk_hex.ends_with("88ac")
            && spk_hex.len() == 50
            && spk_hex[6..46] == treasury_script[6..46]);

    if !is_treasury {
        debug!(
            "Crawler: Output[1] is NOT treasury (got {} hex), marking FREE",
            &spk_hex[..16]
        );
        return ("FREE".to_string(), 0);
    }

    // Output 1 IS treasury — determine tier by amount
    let tier = if amount >= MAX_THRESHOLD {
        "MAX"
    } else if amount >= PRO_THRESHOLD {
        "PRO"
    } else if amount >= CREATOR_THRESHOLD {
        "CREATOR"
    } else {
        // Payment to treasury but below minimum tier threshold
        debug!(
            "Crawler: treasury Output[1] below tier minimum ({} sompi, need >= {}), marking FREE",
            amount, CREATOR_THRESHOLD
        );
        return ("FREE".to_string(), 0);
    };

    debug!(
        "Crawler: Output[1] treasury payment verified: {} sompi ({} KAS) → tier={}",
        amount,
        amount as f64 / 100_000_000.0,
        tier
    );

    (tier.to_string(), amount)
}

pub async fn run_crawler(
    client: Arc<KaspaRpcClient>,
    db: Arc<Mutex<rusqlite::Connection>>,
    treasury_address: String,
    start_daa: u64,
) {
    let treasury_addr = match Address::try_from(treasury_address.as_str()) {
        Ok(a) => a,
        Err(e) => {
            error!("Crawler: invalid treasury address '{}': {}", treasury_address, e);
            return;
        }
    };

    let treasury_script = match treasury_script_hex(&treasury_addr) {
        Some(s) => s,
        None => {
            error!("Crawler: could not compute treasury script from address");
            return;
        }
    };

    info!("Historic Crawler started (treasury={}, script_prefix={:?}, start_daa={})",
        treasury_address, &treasury_script[..12], start_daa);

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
            if !client.is_connected() {
                break;
            }

            let block = match client.get_block(current_hash.clone(), false).await {
                Ok(b) => b,
                Err(e) => {
                    debug!("Crawler: get_block failed at {}: {}", current_hash, e);
                    break;
                }
            };

            let block_daa = block.header.daa_score;

            if block_daa <= scan_daa {
                scan_daa = scan_daa.max(block_daa);
                break;
            }

            // Extract covenant outputs from this block
            for tx in &block.transactions {
                // First, check if this transaction has a treasury payment →
                // this determines tier for ALL covenant outputs in this tx
                let (tx_tier, _treasury_amount) = determine_tier_from_outputs(tx, &treasury_script);

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
                        &tx_tier,
                    ) {
                        Ok(_) => {
                            batch_found += 1;
                            debug!(
                                "Crawler: found {} {} @ DAA {} ({} KAS) tier={}",
                                covenant_type, &tx_id[..16],
                                block_daa,
                                amount_sompi as f64 / 100_000_000.0,
                                tx_tier
                            );

                            // Auto-generate basic UI for every discovered covenant
                            let gen_db = Arc::clone(&db);
                            let gen_tx_id = tx_id.clone();
                            let gen_type = covenant_type.clone();
                            let gen_cat = category.clone();
                            let gen_hash = script_hash.clone();
                            let gen_addr = address.clone();
                            let gen_tier = tx_tier.to_string();
                            tokio::spawn(async move {
                                let params = ui_generator::extract_parameters_from_script("aa20", &gen_hash);
                                let config = covenant_types::UiGenerationConfig {
                                    covenant_id: gen_tx_id.clone(),
                                    covenant_name: format!("{} {}", gen_type, &gen_tx_id[..8]),
                                    category: gen_cat,
                                    script_hash: gen_hash,
                                    parameters: params,
                                    is_enhanced: gen_tier != "FREE",
                                    disclosure_level: if gen_tier == "FREE" { "limited".into() } else { "full".into() },
                                    creator_addr: gen_addr,
                                };
                                let ui_html = ui_generator::generate_basic_ui(&config);
                                let slug = format!("covenant-{}", &gen_tx_id[..16]);
                                let featured = gen_tier == "MAX" || gen_tier == "PRO";
                                let priority: i32 = match gen_tier.as_str() {
                                    "MAX" => 100, "PRO" => 50, "CREATOR" => 10, _ => 0
                                };
                                let _ = db::save_generated_ui(&gen_db, &gen_tx_id, &gen_tx_id, &gen_tier, &ui_html, "{}", &slug, featured);
                                let _ = db::set_visibility(&gen_db, &gen_tx_id, &gen_tier, featured, priority, None);
                                debug!("Crawler: auto-generated basic UI + visibility for {} (tier={})", &gen_tx_id[..16], gen_tier);
                            });
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

/// Returns true if the script is a standard wallet output that should NEVER be indexed as a covenant.
/// Standard Kaspa outputs are always ≤ 40 hex chars (20 raw bytes max for P2PKH/P2PK/P2SH/script-hash).
/// Real SilverScript covenant payloads start at 100+ bytes.
fn is_standard_output(spk_hex: &str) -> bool {
    let raw_len = spk_hex.len() / 2; // hex chars → raw bytes
    if raw_len <= 40 {
        return true; // Too small to be a real covenant
    }
    // P2PKH: 76a914<20>88ac (25 raw bytes = 50 hex)
    if spk_hex.len() == 50 && spk_hex.starts_with("76a914") && spk_hex.ends_with("88ac") {
        return true;
    }
    // Schnorr P2PK: 20<32-byte-pubkey>ac (34 raw bytes = 68 hex)
    // P2SH: a914<20-byte-hash>87 (23 raw bytes = 46 hex)
    if (spk_hex.len() == 68 && spk_hex.starts_with("20") && spk_hex.ends_with("ac"))
        || (spk_hex.len() == 46 && spk_hex.starts_with("a914") && spk_hex.ends_with("87"))
    {
        return true;
    }
    false
}

fn looks_like_covenant(spk_hex: &str) -> bool {
    // Reject standard wallet transfers first — they are NOT covenants.
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
