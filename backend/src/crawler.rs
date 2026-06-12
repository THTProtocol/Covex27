use crate::covenant_types;
use crate::db;
use crate::ui_generator;
use kaspa_addresses::Address;
use kaspa_rpc_core::api::rpc::RpcApi;
use kaspa_rpc_core::RpcTransaction;
use kaspa_wrpc_client::KaspaRpcClient;
use std::sync::Arc;
use std::sync::Mutex;
use tracing::{debug, error, info, warn};

/// Historic BlockDAG Crawler — walks the selected-parent chain backward from tip.
///
/// Detects *ALL* possible covenants (to match/exceed the official Kaspa TN12 explorer)
/// by scanning BOTH tx.payload AND every output's script_public_key for the
/// Toccata covenant opcodes (aa20/aa21/aa22/aa23).
///
/// Raw/non-Covex covenants get "EXPLORER" tier + basic auto UI.
/// Covex-enhanced ones (treasury payment) get full tiered treatment + rich UIs.
///
/// Tier determined by Output[1] → treasury P2PKH address (Covex-specific).
///
/// THIS IS THE ONLY CODE ALLOWED TO WRITE TO covex.db.

const MAX_WALK_DISTANCE: u64 = 5_000_000;  // Increased to catch more historic covenants on TN10/TN12 (full DAG coverage)
const MAX_THRESHOLD: u64 = 100_000_000_000;
const PRO_THRESHOLD: u64 = 50_000_000_000;
const BUILDER_THRESHOLD: u64 = 10_000_000_000;

fn treasury_script_hex(treasury_addr: &Address) -> Option<String> {
    let payload = treasury_addr.payload.as_slice();
    // For 32-byte payloads (Schnorr P2PK), the script is 20<key>ac
    // For 20-byte payloads (P2PKH), the script is 76a914<hash160>88ac
    match payload.len() {
        32 => Some(format!("20{}ac", hex::encode(payload))),
        20 => Some(format!("76a914{}88ac", hex::encode(payload))),
        _ => None,
    }
}

/// Extract a testnet address from a Schnorr P2PK output script (20<32-byte-pubkey>ac).
/// Returns None if the script is not a recognizable Schnorr P2PK.
fn address_from_p2pk_script(spk_hex: &str) -> Option<String> {
    if spk_hex.len() == 68 && spk_hex.starts_with("20") && spk_hex.ends_with("ac") {
        let payload = hex::decode(&spk_hex[2..66]).ok()?;
        let addr = Address::new(
            kaspa_addresses::Prefix::Testnet,
            kaspa_addresses::Version::PubKey,
            &payload,
        );
        Some(addr.to_string())
    } else {
        None
    }
}

fn determine_tier_from_outputs(tx: &RpcTransaction, treasury_script: &str) -> (String, u64) {
    if tx.outputs.len() < 2 {
        return ("EXPLORER".to_string(), 0);
    }
    let o1 = &tx.outputs[1];
    let spk_hex = hex::encode(o1.script_public_key.script());
    let amount = o1.value;
    // Match either P2PKH (50 hex: 76a914<hash160>88ac) or Schnorr P2PK (68 hex: 20<key>ac)
    let is_treasury = spk_hex == treasury_script
        || (spk_hex.len() == 50
            && treasury_script.len() >= 46
            && spk_hex.starts_with("76a914")
            && spk_hex.ends_with("88ac")
            && &spk_hex[6..46] == &treasury_script[6..46])
        || (spk_hex.len() == 68
            && treasury_script.len() >= 66
            && spk_hex.starts_with("20")
            && spk_hex.ends_with("ac")
            && &spk_hex[2..66] == &treasury_script[2..66]);
    if !is_treasury {
        return ("EXPLORER".to_string(), 0); // Raw / unverified covenant visible to all
    }
    let tier = if amount >= MAX_THRESHOLD {
        "MAX"
    } else if amount >= PRO_THRESHOLD {
        "PRO"
    } else if amount >= BUILDER_THRESHOLD {
        "BUILDER"
    } else {
        return ("EXPLORER".to_string(), 0);
    };
    (tier.to_string(), amount)
}

/// Auto-generate a logic summary from covenant type, category and amount
fn auto_summary(covenant_type: &str, category: &str, amount_sompi: u64, network_label: &str) -> String {
    let kas = amount_sompi as f64 / 100_000_000.0;
    format!("{} covenant (category: {}) locking {:.2} KAS on Kaspa BlockDAG {}. Extracted automatically from on-chain UTXO data.", covenant_type, category, kas, network_label)
}

pub async fn run_crawler(
    client: Arc<KaspaRpcClient>,
    db: Arc<Mutex<rusqlite::Connection>>,
    treasury_address: String,
    start_daa: u64,
    network: String,
) {
    let treasury_addr = match Address::try_from(treasury_address.as_str()) {
        Ok(a) => a,
        Err(e) => {
            error!("Crawler: invalid treasury: {}", e);
            return;
        }
    };
    let treasury_script = match treasury_script_hex(&treasury_addr) {
        Some(s) => s,
        None => {
            error!("Crawler: treasury script fail");
            return;
        }
    };
    info!(
        "Crawler started: treasury={}, start_daa={}, network={}",
        treasury_address, start_daa, network
    );

    // Support CRAWL_FULL_RESCAN=1 env to force start from DAA=0.
    // This guarantees full historic coverage of *all* on-chain covenants from TN10/TN12
    // (opcode scan in tx payload and output scripts). Use on restart if gaps vs official explorers.
    let mut scan_daa = if std::env::var("CRAWL_FULL_RESCAN").is_ok() {
        info!("CRAWL_FULL_RESCAN=1 for {} - forcing full scan from DAA 0", network);
        0u64
    } else {
        db::get_last_scanned_daa(&db, &network).unwrap_or(start_daa)
    };
    let mut total_found: u64 = 0;

    loop {
        if !client.is_connected() {
            crate::node_status::report_err(&network, "node wRPC not connected (syncing or down)");
            tokio::time::sleep(std::time::Duration::from_secs(5)).await;
            continue;
        }
        let dag = match tokio::time::timeout(
            std::time::Duration::from_secs(15),
            client.get_block_dag_info(),
        )
        .await
        {
            Ok(Ok(d)) => d,
            Ok(Err(e)) => {
                warn!("Crawler: dag_info: {}", e);
                crate::node_status::report_err(&network, &format!("dag_info error: {}", e));
                tokio::time::sleep(std::time::Duration::from_secs(10)).await;
                continue;
            }
            Err(_) => {
                warn!("Crawler: dag_info timeout");
                crate::node_status::report_err(&network, "dag_info timeout (node likely mid-sync)");
                tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                continue;
            }
        };
        let virtual_daa = dag.virtual_daa_score;
        crate::node_status::report_ok(&network, virtual_daa, scan_daa);
        if scan_daa >= virtual_daa {
            let _ = db::update_last_scanned_daa(&db, scan_daa, &network);
            tokio::time::sleep(std::time::Duration::from_secs(60)).await;
            continue;
        }
        let tip_hash = match dag.virtual_parent_hashes.first() {
            Some(h) => h.clone(),
            None => {
                warn!("Crawler: no tip");
                tokio::time::sleep(std::time::Duration::from_secs(30)).await;
                continue;
            }
        };
        info!("Crawler: tip DAA {} | scanned={}", virtual_daa, scan_daa);

        let mut cur = tip_hash;
        let mut walked = 0u64;
        let mut batch = 0usize;
        let mut lowest = virtual_daa;

        for _ in 0..MAX_WALK_DISTANCE {
            if !client.is_connected() {
                break;
            }
            // A node mid-IBD answers get_block_dag_info but hangs on get_block
            // (it does not yet have the block bodies). Without a timeout here the
            // whole crawler wedges on a single await and silently stops indexing
            // until process restart. Time-bounding it lets the crawler report the
            // stall and retry each cycle, so it auto-resumes the moment the node
            // finishes syncing.
            let block = match tokio::time::timeout(
                std::time::Duration::from_secs(12),
                client.get_block(cur.clone(), true),
            )
            .await
            {
                Ok(Ok(b)) => b,
                Ok(Err(e)) => {
                    debug!("Crawler: block fail at {}: {}", cur, e);
                    break;
                }
                Err(_) => {
                    warn!("Crawler[{}]: get_block timeout (node likely mid-sync); retrying", network);
                    crate::node_status::report_err(&network, "get_block timeout (node serving dag_info but not block bodies; still syncing)");
                    break;
                }
            };
            let daa = block.header.daa_score;
            lowest = daa.min(lowest);

            // Broad scan for *ALL* covenants: check payload + every output script for opcodes.
            // This captures raw covenants (manual deploys, other tools, experiments) in addition
            // to Covex-structured ones. Matches the volume seen on the official Kaspa explorer.
            for tx in &block.transactions {
                let pl = hex::encode(&tx.payload);
                let mut covenant_script = pl.clone();
                // The SilverScript covenant envelope is a payload PREFIX (aa20..aa23 +
                // payload). A substring match false-positives on arbitrary payload
                // bytes (inscriptions, KRC-20 envelopes) - critical on mainnet where
                // honest data matters most.
                let is_envelope = |h: &str| {
                    h.starts_with("aa20") || h.starts_with("aa21") || h.starts_with("aa22") || h.starts_with("aa23")
                };
                let mut has_covenant_opcode = is_envelope(&pl);

                // Output scripts: covenants are P2SH-wrapped, so the envelope may sit
                // mid-script (after preceding opcodes). Scripts are small and structured,
                // so substring matching is safe here - unlike free-form payloads, where
                // only a prefix match avoids inscription false positives.
                for out in &tx.outputs {
                    let sh = hex::encode(out.script_public_key.script());
                    if sh.contains("aa20") || sh.contains("aa21") || sh.contains("aa22") || sh.contains("aa23")
                    {
                        has_covenant_opcode = true;
                        // Prefer the first output script that carries the opcode for classification
                        if covenant_script == pl {
                            covenant_script = sh;
                        }
                        break;
                    }
                }

                if !has_covenant_opcode {
                    continue;
                }

                // Mainnet honesty gate. SilverScript covenants are INVALID on mainnet
                // until the Toccata hard fork activates (June 2026 window). Any aa20-aa23
                // match on mainnet today is a coincidental ordinary output (standard P2SH,
                // multisig, inscription bytes), NOT a covenant. We index ZERO mainnet
                // covenants until the operator confirms Toccata is live by setting
                // COVEX_MAINNET_COVENANTS_ENABLED=true. The crawler keeps walking so it is
                // ready to backfill the instant real covenants appear.
                if network.starts_with("mainnet")
                    && std::env::var("COVEX_MAINNET_COVENANTS_ENABLED").as_deref() != Ok("true")
                {
                    continue;
                }

                // Paid tiers are assigned exclusively by the payment guardian when a
                // confirmed treasury payment exists. The crawler never infers them:
                // a covenant is "paid" only if it was deployed through the paid flow.
                let _ = determine_tier_from_outputs(tx, &treasury_script);
                let tier = "EXPLORER".to_string();

                let amt = tx.outputs[0].value;
                let txh = tx
                    .verbose_data
                    .as_ref()
                    .map(|v| v.transaction_id.to_string())
                    .unwrap_or_else(|| format!("{}-tx", block.header.hash));
                let tid = format!("{}:{}", txh, 0);
                let ctype = classify(&covenant_script);
                let cat = categorize(&covenant_script);
                let addr_prefix = if network.starts_with("mainnet") { "kaspa" } else { "kaspatest" };
                let addr = format!("{}:{}", addr_prefix, &txh[..32]);
                // Extract the real deployer wallet address from output[0]'s Schnorr P2PK script
                let deployer_script_hex = hex::encode(tx.outputs[0].script_public_key.script());
                let creator =
                    address_from_p2pk_script(&deployer_script_hex).unwrap_or_else(|| addr.clone());
                let shash = crate::compute_script_hash(&covenant_script);

                let nlabel = match network.as_str() {
                    "testnet-10" => "TN-10",
                    "mainnet" | "mainnet-1" => "Mainnet",
                    _ => "TN-12",
                };
                let summary = auto_summary(&ctype, &cat, amt, nlabel);
                if total_found % 100 == 0 {
                    info!("[CRAWLER-{}] discovered {} covenants so far (latest DAA {})", network, total_found, daa);
                }
                let recv_addrs = serde_json::to_string(&[&addr]).unwrap_or_default();
                // Store the best script (output script preferred over payload for raw detection)
                let stored_script = &covenant_script;
                match db::insert_covenant(
                    &db,
                    &tid,
                    &addr,
                    amt,
                    &shash,
                    stored_script,
                    &ctype,
                    &cat,
                    &creator,
                    "",
                    daa,
                    &tier,
                    &summary,
                    &recv_addrs,
                    &network,
                ) {
                    Ok(_) => {
                        batch += 1;
                        info!(
                            "Crawler: FOUND {} {} DAA={} amt={}K tier={} script={}",
                            ctype,
                            &tid[..16],
                            daa,
                            amt as f64 / 1e8,
                            tier,
                            &stored_script[..40.min(stored_script.len())]
                        );
                        let (gdb, gid, gty, gcat, ghash, _gaddr, gcreator, gt) = (
                            Arc::clone(&db),
                            tid.clone(),
                            ctype.clone(),
                            cat.clone(),
                            shash.clone(),
                            addr.clone(),
                            creator.clone(),
                            tier.to_string(),
                        );
                        tokio::spawn(async move {
                            let p = ui_generator::extract_parameters_from_script("aa20", &ghash);
                            let cfg = covenant_types::UiGenerationConfig {
                                covenant_id: gid.clone(),
                                covenant_name: format!("{} {}", gty, &gid[..8]),
                                category: gcat,
                                script_hash: ghash,
                                parameters: p,
                                is_enhanced: gt != "FREE" && gt != "EXPLORER",
                                disclosure_level: if gt == "FREE" || gt == "EXPLORER" {
                                    "limited".into()
                                } else {
                                    "full".into()
                                },
                                creator_addr: gcreator,
                            };
                            let html = ui_generator::generate_basic_ui(&cfg);
                            let slug = format!("covenant-{}", &gid[..16]);
                            let feat = gt == "MAX" || gt == "PRO";
                            let pri: i32 = match gt.as_str() {
                                "MAX" => 100,
                                "PRO" => 50,
                                "BUILDER" => 10,
                                "EXPLORER" => 0, // raw but visible
                                _ => 0,
                            };
                            let _ = db::save_generated_ui(
                                &gdb, &gid, &gid, &gt, &html, "{}", &slug, feat,
                            );
                            let _ = db::set_visibility(&gdb, &gid, &gt, feat, pri, None);
                        });
                    }
                    Err(e) if e.to_string().contains("UNIQUE") => {}
                    Err(e) => {
                        error!("Crawler: insert fail {}: {}", &tid[..16], e);
                    }
                }
            }

            walked += 1;
            // Follow selected parent
            match block
                .header
                .parents_by_level
                .first()
                .and_then(|v| v.first())
            {
                Some(ph) => cur = *ph,
                None => {
                    debug!("Crawler: genesis at DAA {}", daa);
                    break;
                }
            }
        }

        total_found += batch as u64;
        info!(
            "Crawler: walked={} found={} total={} lowest_daa={}",
            walked, batch, total_found, lowest
        );
        // Advance past the floor — lowest is the minimum DAA seen in this batch.
        // Without this decrement, the next cycle hits the same floor and makes zero net progress.
        scan_daa = lowest.saturating_sub(1);
        let _ = db::update_last_scanned_daa(&db, scan_daa, &network);
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
    }
}

fn classify(hex: &str) -> String {
    crate::covenant_types::CovenantCategory::covenant_type(hex)
}
fn categorize(hex: &str) -> String {
    crate::covenant_types::CovenantCategory::from_script_ops(hex)
        .label()
        .to_string()
}