use crate::covenant_types;
use crate::db;
use crate::ui_generator;
use kaspa_addresses::Address;
use kaspa_rpc_core::api::rpc::RpcApi;
use kaspa_rpc_core::RpcTransaction;
use kaspa_wrpc_client::KaspaRpcClient;
use std::sync::Arc;
use tracing::{debug, error, info, warn};

/// Historic BlockDAG Crawler - walks the selected-parent chain backward from tip.
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

const MAX_WALK_DISTANCE: u64 = 5_000_000; // Increased to catch more historic covenants on TN10/TN12 (full DAG coverage)
                                          // Forward-tail window (C3): when the watermark is far below the tip, walk only this many
                                          // recent DAA each cycle so NEW covenants index immediately and the health signal reflects
                                          // tip coverage, instead of re-walking a million blocks of history every cycle (which
                                          // stalled TN12). The deferred deep history is logged for a later backfill, not silently
                                          // dropped. In steady state the gap is tiny so this never binds.
const FORWARD_WINDOW: u64 = 5_000;
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
fn auto_summary(
    covenant_type: &str,
    category: &str,
    amount_sompi: u64,
    network_label: &str,
) -> String {
    let kas = amount_sompi as f64 / 100_000_000.0;
    format!("{} covenant (category: {}) locking {:.2} KAS on Kaspa BlockDAG {}. Extracted automatically from on-chain UTXO data.", covenant_type, category, kas, network_label)
}

/// True once the operator flips the mainnet covenant gate on (Toccata activation).
pub(crate) fn mainnet_covenants_enabled() -> bool {
    std::env::var("COVEX_MAINNET_COVENANTS_ENABLED").as_deref() == Ok("true")
}

/// The honesty gate (GATE 1 / 1.5): on mainnet, a bare aa20-aa23 output is indistinguishable
/// from an ordinary P2SH/multisig/inscription until Toccata makes covenants valid, so we
/// index ZERO mainnet covenants until the operator flips the gate. Testnets are never gated.
/// Pure + testable so the irreversible gate-flip can be asserted in CI before launch.
fn covenant_indexing_gated(network: &str, mainnet_enabled: bool) -> bool {
    network.starts_with("mainnet") && !mainnet_enabled
}

pub async fn run_crawler(
    client: Arc<KaspaRpcClient>,
    db: db::Db,
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
        info!(
            "CRAWL_FULL_RESCAN=1 for {} - forcing full scan from DAA 0",
            network
        );
        0u64
    } else {
        db::get_last_scanned_daa(&db, &network).unwrap_or(start_daa)
    };
    let mut total_found: u64 = 0;
    // Reorg reconciliation anchor: the selected-chain sink (tip) we last diffed against.
    // Each cycle we ask the node for the chain delta since this hash; removed chain blocks
    // whose covenant txs were not re-accepted are flagged reorged (pre-finality only).
    let mut last_sink: Option<kaspa_rpc_core::RpcHash> = None;

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
        // The node tip can REGRESS below our watermark (e.g. a node resync to a lower
        // tip - exactly what stranded TN10). If we idle as "caught up" above the tip we
        // index nothing new for hours until the node climbs back. Clamp the watermark to
        // the real tip so we always tail the chain the node actually has.
        if scan_daa > virtual_daa {
            warn!(
                "Crawler[{}]: watermark {} is above node tip {} (node resynced lower); clamping to tip",
                network, scan_daa, virtual_daa
            );
            scan_daa = virtual_daa;
            let _ = db::update_last_scanned_daa(&db, scan_daa, &network);
        }
        crate::node_status::report_ok(&network, virtual_daa, scan_daa);

        // Mainnet short-circuit. SilverScript covenants cannot exist on mainnet until
        // Toccata activates, so there is nothing to index there yet. Walking up to
        // MAX_WALK_DISTANCE (~5M) blocks every cycle only to skip every match (below)
        // wastes node CPU/bandwidth and reports a permanently-behind scanned_daa.
        // Probe the tip, report caught-up (scanned == tip), and idle until the
        // operator flips COVEX_MAINNET_COVENANTS_ENABLED=true, at which point this
        // guard falls through to the normal forward walk.
        if covenant_indexing_gated(&network, mainnet_covenants_enabled()) {
            crate::node_status::report_ok(&network, virtual_daa, virtual_daa);
            tokio::time::sleep(std::time::Duration::from_secs(60)).await;
            continue;
        }

        // Reorg/finality reconciliation. Runs every cycle (even when caught up at the tip),
        // independent of the discovery walk: a chain reorg can drop a recently-indexed
        // covenant whether or not new covenants are appearing. Isolated and fail-safe -
        // any node/RPC error just re-anchors and skips the delta; it can never corrupt the
        // discovery watermark.
        last_sink =
            reconcile_reorgs(&client, &db, &network, dag.sink, virtual_daa, last_sink).await;

        if scan_daa >= virtual_daa {
            let _ = db::update_last_scanned_daa(&db, scan_daa, &network);
            tokio::time::sleep(std::time::Duration::from_secs(60)).await;
            continue;
        }
        // Forward-tail floor (C3): if we are far behind, walk only the recent
        // FORWARD_WINDOW so NEW covenants index immediately and the health reflects tip
        // coverage; the deep history below is DEFERRED to a backfill (logged, never
        // silently dropped). In steady state this equals scan_daa, so each cycle walks
        // only the blocks added since the last cycle (no more re-walking a million blocks).
        let walk_floor = if virtual_daa - scan_daa > FORWARD_WINDOW {
            let f = virtual_daa - FORWARD_WINDOW;
            warn!(
                "Crawler[{}]: {} DAA behind; tailing the recent {} and DEFERRING backfill of [{}, {}) so new covenants stay current",
                network, virtual_daa - scan_daa, FORWARD_WINDOW, scan_daa, f
            );
            f
        } else {
            scan_daa
        };
        let tip_hash = match dag.virtual_parent_hashes.first() {
            Some(h) => h.clone(),
            None => {
                warn!("Crawler: no tip");
                tokio::time::sleep(std::time::Duration::from_secs(30)).await;
                continue;
            }
        };
        info!(
            "Crawler: tip DAA {} | scanned={} | walk_floor={}",
            virtual_daa, scan_daa, walk_floor
        );

        let mut cur = tip_hash;
        let mut walked = 0u64;
        let mut batch = 0usize;
        let mut lowest = virtual_daa;
        // True if the walk was cut short by a node stall/disconnect (not a clean
        // completion). Gates the watermark persist below so a partial walk never
        // corrupts the scan pointer.
        let mut walk_interrupted = false;

        for _ in 0..MAX_WALK_DISTANCE {
            if !client.is_connected() {
                walk_interrupted = true;
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
                    warn!(
                        "Crawler[{}]: get_block timeout (node likely mid-sync); retrying",
                        network
                    );
                    crate::node_status::report_err(&network, "get_block timeout (node serving dag_info but not block bodies; still syncing)");
                    walk_interrupted = true;
                    break;
                }
            };
            let daa = block.header.daa_score;
            lowest = daa.min(lowest);
            // Stop once we reach already-covered territory (or the forward-tail floor):
            // everything from here down was scanned in a prior cycle or is deferred
            // backfill, so re-walking it wastes node round-trips and stalls the tail.
            if daa <= walk_floor {
                break;
            }

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
                    h.starts_with("aa20")
                        || h.starts_with("aa21")
                        || h.starts_with("aa22")
                        || h.starts_with("aa23")
                };
                let mut has_covenant_opcode = is_envelope(&pl);

                // Output scripts: covenants are P2SH-wrapped, so the envelope may sit
                // mid-script (after preceding opcodes). Scripts are small and structured,
                // so substring matching is safe here - unlike free-form payloads, where
                // only a prefix match avoids inscription false positives.
                for out in &tx.outputs {
                    let sh = hex::encode(out.script_public_key.script());
                    if sh.contains("aa20")
                        || sh.contains("aa21")
                        || sh.contains("aa22")
                        || sh.contains("aa23")
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
                if covenant_indexing_gated(&network, mainnet_covenants_enabled()) {
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
                let addr_prefix = if network.starts_with("mainnet") {
                    "kaspa"
                } else {
                    "kaspatest"
                };
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
                    info!(
                        "[CRAWLER-{}] discovered {} covenants so far (latest DAA {})",
                        network, total_found, daa
                    );
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
                        // Record the selected-chain block this was discovered in, so the reorg
                        // reconciler can detect if it later leaves the chain. Also clears any
                        // stale reorg flag (re-discovery proves it is back on the chain).
                        let _ = db::mark_covenant_seen_in_block(
                            &db,
                            &tid,
                            &block.header.hash.to_string(),
                        );
                        info!(
                            "Crawler: FOUND {} {} DAA={} amt={}K tier={} script={}",
                            ctype,
                            &tid[..16],
                            daa,
                            amt as f64 / 1e8,
                            tier,
                            &stored_script[..40.min(stored_script.len())]
                        );
                        // Honest enforcement label from the on-chain script, so the
                        // auto-generated UI's trust banner can't call a consensus-
                        // enforced covenant "dangerous". (Mirrors the detail page.)
                        let greality =
                            crate::covenant_catalog::reality_for_script(&covenant_script)
                                .as_str()
                                .to_string();
                        let (gdb, gid, gty, gcat, ghash, _gaddr, gcreator, gt) = (
                            db.clone(),
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
                                enforcement_reality: greality,
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
        // Advance the scan floor ONLY when the walk completed normally. If it was cut
        // short by a node stall/disconnect (walk_interrupted), `lowest` reflects a
        // PARTIAL walk, so persisting scan_daa = lowest-1 would ratchet the watermark
        // past unscanned ranges and corrupt it (the exact TN10 failure: a node serving
        // dag_info but hanging on get_block). Hold the watermark and retry next cycle.
        if walk_interrupted {
            warn!(
                "Crawler[{}]: walk interrupted (node stalled/disconnected) after {} blocks; holding watermark at {}",
                network, walked, scan_daa
            );
        } else {
            // Clean walk: we covered [walk_floor, tip] down the selected-parent chain, so
            // we are current at the tip. Persist scan_daa = tip; any deferred backfill
            // range below walk_floor was logged above for a later pass. (Previously this
            // set scan_daa = lowest-1, which combined with no stop condition re-walked the
            // whole history every cycle and reported a permanently-behind floor.)
            scan_daa = virtual_daa;
            let _ = db::update_last_scanned_daa(&db, scan_daa, &network);
        }
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
    }
}

/// Reconcile the selected chain against the node and flag covenants that were reorged out
/// before finality. Returns the new reconciliation anchor (sink) to diff against next cycle.
///
/// Uses get_virtual_chain_from_block(last_sink, include_accepted=true): the node returns the
/// chain blocks removed since `last_sink` plus the txs the new chain blocks accept. A covenant
/// is flagged ONLY if its discovery block is in `removed_chain_block_hashes` AND its funding tx
/// was not re-accepted by the new chain (so a tx that simply moved to a different chain block is
/// never falsely flagged). Pre-finality only; finalized covenants are untouchable. Never deletes.
async fn reconcile_reorgs(
    client: &KaspaRpcClient,
    db: &db::Db,
    network: &str,
    sink: kaspa_rpc_core::RpcHash,
    virtual_daa: u64,
    last_sink: Option<kaspa_rpc_core::RpcHash>,
) -> Option<kaspa_rpc_core::RpcHash> {
    // First cycle (or after a re-anchor): nothing to diff yet, just record the anchor.
    let start = match last_sink {
        Some(h) => h,
        None => return Some(sink),
    };
    if start == sink {
        return Some(sink); // selected chain unchanged since last cycle
    }
    let resp = match tokio::time::timeout(
        std::time::Duration::from_secs(15),
        client.get_virtual_chain_from_block(start, true),
    )
    .await
    {
        Ok(Ok(r)) => r,
        Ok(Err(e)) => {
            // The anchor itself may have been reorged out ("not a chain block"): re-anchor
            // to the current sink and skip this delta rather than risk a wrong diff.
            debug!("Crawler[{}]: reorg reconcile re-anchored ({})", network, e);
            return Some(sink);
        }
        Err(_) => {
            // Transient: keep the same anchor and retry next cycle (no chain progress lost).
            warn!(
                "Crawler[{}]: reorg reconcile timed out; will retry from same anchor",
                network
            );
            return Some(start);
        }
    };
    if resp.removed_chain_block_hashes.is_empty() {
        return Some(sink); // pure chain extension, no reorg
    }
    let removed: Vec<String> = resp
        .removed_chain_block_hashes
        .iter()
        .map(|h| h.to_string())
        .collect();
    let reaccepted: std::collections::HashSet<String> = resp
        .accepted_transaction_ids
        .iter()
        .flat_map(|a| a.accepted_transaction_ids.iter())
        .map(|t| t.to_string())
        .collect();
    match db::flag_reorged_covenants(
        db,
        network,
        &removed,
        &reaccepted,
        virtual_daa,
        db::FINALITY_DEPTH_DAA,
    ) {
        Ok(n) if n > 0 => warn!(
            "Crawler[{}]: REORG flagged {} pre-finality covenant(s) ({} chain block(s) removed, not re-accepted)",
            network, n, removed.len()
        ),
        Ok(_) => debug!(
            "Crawler[{}]: {} chain block(s) reorged, no indexed covenants affected",
            network,
            removed.len()
        ),
        Err(e) => error!("Crawler[{}]: flag_reorged_covenants failed: {}", network, e),
    }
    Some(sink)
}

fn classify(hex: &str) -> String {
    crate::covenant_types::CovenantCategory::covenant_type(hex)
}
fn categorize(hex: &str) -> String {
    crate::covenant_types::CovenantCategory::from_script_ops(hex)
        .label()
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mainnet_gate_blocks_until_enabled() {
        // Gate OFF (pre-Toccata): mainnet indexes ZERO covenants; testnets always index.
        assert!(
            covenant_indexing_gated("mainnet", false),
            "mainnet must be gated when disabled"
        );
        assert!(
            covenant_indexing_gated("mainnet-1", false),
            "mainnet-1 must be gated when disabled"
        );
        assert!(
            !covenant_indexing_gated("testnet-12", false),
            "testnet-12 is never gated"
        );
        assert!(
            !covenant_indexing_gated("testnet-10", false),
            "testnet-10 is never gated"
        );
        // Gate ON (operator flips it at Toccata activation): mainnet covenants now index.
        assert!(
            !covenant_indexing_gated("mainnet", true),
            "mainnet must index once enabled"
        );
        assert!(
            !covenant_indexing_gated("mainnet-1", true),
            "mainnet-1 must index once enabled"
        );
        assert!(
            !covenant_indexing_gated("testnet-12", true),
            "testnets unaffected by the flag"
        );
    }
}
