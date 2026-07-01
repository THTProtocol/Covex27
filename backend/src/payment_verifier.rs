use crate::covenant_types::tier_from_amount;
use crate::db;
use kaspa_rpc_core::api::rpc::RpcApi;
use kaspa_wrpc_client::KaspaRpcClient;
use std::sync::Arc;
use tracing::{debug, error, info, warn};

/// Minimum confirmations (DAA depth of the funding UTXO under the virtual DAA score) before a
/// treasury payment is treated as final and a tier upgrade is applied. Below this, the payment is
/// pending and MUST NOT upgrade the account. Single source of truth for the gate and its tests.
pub const MIN_CONFIRMATIONS: u64 = 6;

/// Confirmation depth of a funding UTXO: how far the current virtual DAA score is above the block
/// that included the UTXO. Saturates at 0 (a UTXO from a block at/after the current virtual score,
/// e.g. a transient reorg/race, is treated as 0 confirmations, never a negative or wrapped value).
#[inline]
pub fn confirmations_for(current_daa: u64, block_daa: u64) -> u64 {
    current_daa.saturating_sub(block_daa)
}

/// FAIL-CLOSED finality gate: returns true ONLY when the payment has at least [`MIN_CONFIRMATIONS`]
/// confirmations. The tier upgrade (which grants paid features) is applied only when this is true.
#[inline]
pub fn is_payment_final(confirmations: u64) -> bool {
    confirmations >= MIN_CONFIRMATIONS
}

/// Decide whether a treasury UTXO of `amount_sompi` paid by `from_address`, observed at
/// `confirmations` depth, authorizes a tier upgrade, and to which tier.
///
/// This is the pure verification core the background loop runs, factored out so every reject path
/// is unit-testable and provably FAIL-CLOSED. A payment authorizes an upgrade ONLY when ALL hold:
///   * the amount maps to a real tier (`tier_from_amount` is `Some`) -- an UNDERPAY below the
///     smallest tier threshold yields `None` and is REJECTED;
///   * the payment has reached finality (`is_payment_final`) -- BELOW the confirmation threshold is
///     REJECTED (pending);
///   * the payer address is non-empty -- a missing/unknown sender is REJECTED (the loop also binds
///     the upgrade to `from_address == creator_addr`, so a WRONG address never upgrades a covenant
///     it did not create).
///
/// Returns `Some(tier)` only on the fully-authorized path; `None` on every reject path.
pub fn authorize_tier_upgrade(
    amount_sompi: u64,
    confirmations: u64,
    from_address: &str,
) -> Option<&'static str> {
    // Reject an unknown/empty payer: we can never attribute or bind such a payment.
    if from_address.is_empty() {
        return None;
    }
    // Reject underpay: an amount below the smallest tier threshold maps to no tier.
    let tier = tier_from_amount(amount_sompi)?;
    // Reject pending: below the confirmation threshold the payment is not yet final.
    if !is_payment_final(confirmations) {
        return None;
    }
    Some(tier)
}

/// Payment Verifier v2 -- Monitors treasury, matches payments to covenants
/// by from_address == creator_addr, upgrades covenant record with full
/// disclosure fields, and triggers enhanced UI regeneration.
pub async fn run_payment_verifier(
    client: Arc<KaspaRpcClient>,
    db: db::Db,
    treasury_address: String,
    network: String,
) {
    info!(
        "Payment Verifier v2 started -- monitoring treasury: {} (network={})",
        treasury_address, network
    );

    let mut interval = tokio::time::interval(std::time::Duration::from_secs(15));

    loop {
        interval.tick().await;

        if !client.is_connected() {
            warn!("Payment Verifier: wRPC client disconnected");
            continue;
        }

        let current_daa = match client.get_block_dag_info().await {
            Ok(resp) => resp.virtual_daa_score,
            Err(e) => {
                warn!("Payment Verifier: get_block_dag_info failed: {}", e);
                continue;
            }
        };

        let addr = match kaspa_addresses::Address::try_from(treasury_address.as_str()) {
            Ok(a) => a,
            Err(e) => {
                error!("Payment Verifier: invalid treasury address: {}", e);
                continue;
            }
        };

        match client.get_utxos_by_addresses(vec![addr]).await {
            Ok(entries) => {
                for entry in entries {
                    let tx_id = entry.outpoint.transaction_id.to_string();
                    let from_address = entry.address.map(|a| a.to_string()).unwrap_or_default();
                    let amount_sompi = entry.utxo_entry.amount;
                    let block_daa = entry.utxo_entry.block_daa_score;

                    if let Some(tier) = tier_from_amount(amount_sompi) {
                        let confirmations = confirmations_for(current_daa, block_daa);

                        // MATCH payment to covenant by from_address == creator_addr
                        let matched_covenant = match db::get_covenants_by_creator(
                            &db,
                            &from_address,
                            Some(&network),
                        ) {
                            Ok(list) => list.into_iter().next(),
                            Err(_) => None,
                        };

                        let covenant_id: Option<String> =
                            matched_covenant.as_ref().map(|c| c.tx_id.clone());

                        if let Err(e) = db::insert_payment(
                            &db,
                            &tx_id,
                            &from_address,
                            &treasury_address,
                            amount_sompi,
                            tier,
                            covenant_id.as_deref(),
                            &network,
                        ) {
                            warn!(
                                "Payment Verifier: insert_payment failed for {}: {}",
                                tx_id, e
                            );
                            continue;
                        }

                        // Only run the expensive upgrade + UI-regen ONCE, on the
                        // transition to confirmed. Treasury UTXOs are never swept, so
                        // without this gate every one of them re-ran every cycle forever.
                        // The upgrade authorization runs through the single fail-closed core
                        // (amount maps to a tier, payment is final, payer is a real address);
                        // `tier` here already equals the amount-derived tier, so behavior is
                        // identical to the prior `is_payment_final` gate for any real payer.
                        let authorized =
                            authorize_tier_upgrade(amount_sompi, confirmations, &from_address)
                                .is_some();
                        if authorized && !db::is_payment_confirmed(&db, &tx_id) {
                            if let Err(e) = db::confirm_payment(&db, &tx_id, confirmations as i64) {
                                warn!(
                                    "Payment Verifier: confirm_payment failed for {}: {}",
                                    tx_id, e
                                );
                            } else {
                                // Upgrade the account
                                if let Err(e) =
                                    db::upgrade_account(&db, &from_address, tier, &tx_id, &network)
                                {
                                    error!(
                                        "Payment Verifier: upgrade_account failed for {}: {}",
                                        from_address, e
                                    );
                                } else {
                                    info!("Payment Verifier: Upgraded {} to {} tier ({} KAS, {} confs)",
                                        &from_address[..16], tier, amount_sompi as f64 / 100_000_000.0, confirmations);
                                    // Best-effort activity log: the upgrade itself already
                                    // succeeded, so if the pool is momentarily exhausted just skip
                                    // the event row (conn_or_log records why) instead of panicking
                                    // the background verifier task.
                                    if let Some(conn) = crate::db::conn_or_log(
                                        &db,
                                        "payment_verifier::tier_upgraded_event",
                                    ) {
                                        crate::db::record_event_once(
                                            &conn,
                                            "tier_upgraded",
                                            &tx_id,
                                            &network,
                                            amount_sompi as f64 / 100_000_000.0,
                                            tier,
                                        );
                                    }

                                    // Upgrade matched covenant record with full disclosure
                                    if let Some(ref cid) = covenant_id {
                                        let full_summary = format!(
                                            "Verified {} covenant. Type: {}. Category: {}. Paid tier: {}. Payment tx: {}.",
                                            matched_covenant.as_ref().map(|c| c.covenant_type.as_str()).unwrap_or("unknown"),
                                            matched_covenant.as_ref().map(|c| c.covenant_type.as_str()).unwrap_or(""),
                                            matched_covenant.as_ref().map(|c| c.category.as_str()).unwrap_or("general"),
                                            tier,
                                            &tx_id[..16]
                                        );
                                        let addresses = matched_covenant
                                            .as_ref()
                                            .map(|c| c.address.clone())
                                            .unwrap_or_default();

                                        if let Err(e) = db::upgrade_covenant_record(
                                            &db,
                                            cid,
                                            tier,
                                            &tx_id,
                                            &full_summary,
                                            &addresses,
                                        ) {
                                            error!("Payment Verifier: upgrade_covenant_record failed: {}", e);
                                        } else {
                                            info!("Payment Verifier: Covenant {} upgraded to {} with full disclosure", &cid[..16], tier);

                                            // TRIGGER ENHANCED UI REGENERATION
                                            let gen_db = db.clone();
                                            let gen_cid = cid.clone();
                                            let gen_tier = tier.to_string();
                                            let gen_name = format!(
                                                "Verified {}",
                                                matched_covenant
                                                    .as_ref()
                                                    .map(|c| c.covenant_type.as_str())
                                                    .unwrap_or("Covenant")
                                            );
                                            let gen_cat = matched_covenant
                                                .as_ref()
                                                .map(|c| c.category.clone())
                                                .unwrap_or_else(|| "General".into());
                                            let gen_hash = matched_covenant
                                                .as_ref()
                                                .map(|c| c.script_hash.clone())
                                                .unwrap_or_default();
                                            // Honest enforcement label with the same type-driven
                                            // override as the JSON path (covenant_summary_json) and
                                            // the crawler/indexer auto-pages, so an oracle-resolved
                                            // covenant's regenerated banner never claims "on-chain"
                                            // while it actually needs the Covex oracle co-signature:
                                            // prediction-market / binary_oracle_select /
                                            // oracle_enforced / oracle_escrow -> hybrid, else the raw
                                            // on-chain script classification.
                                            let gen_reality = matched_covenant
                                                .as_ref()
                                                .map(|c| {
                                                    crate::covenant_catalog::enforcement_reality_label(
                                                        &c.covenant_type,
                                                        None,
                                                        &c.script_hex,
                                                    )
                                                    .to_string()
                                                })
                                                .unwrap_or_default();
                                            let gen_addr = from_address.clone();
                                            tokio::spawn(async move {
                                                let params = crate::ui_generator::extract_parameters_from_script("aa20", &gen_hash);
                                                let config =
                                                    crate::covenant_types::UiGenerationConfig {
                                                        covenant_id: gen_cid.clone(),
                                                        covenant_name: gen_name,
                                                        category: gen_cat,
                                                        script_hash: gen_hash,
                                                        parameters: params,
                                                        is_enhanced: true,
                                                        disclosure_level: "full".into(),
                                                        creator_addr: gen_addr,
                                                        enforcement_reality: gen_reality,
                                                    };
                                                let ui_html =
                                                    crate::ui_generator::generate_enhanced_ui(
                                                        &config, &gen_tier,
                                                    );
                                                let slug = format!("covenant-{}", &gen_cid[..16]);
                                                let featured =
                                                    gen_tier == "MAX" || gen_tier == "PRO";
                                                let _ = db::save_generated_ui(
                                                    &gen_db, &gen_cid, &gen_cid, &gen_tier,
                                                    &ui_html, "{}", &slug, featured,
                                                );
                                                let priority: i32 = match gen_tier.as_str() {
                                                    "MAX" => 100,
                                                    "PRO" => 50,
                                                    "BUILDER" => 10,
                                                    _ => 0,
                                                };
                                                let _ = db::set_visibility(
                                                    &gen_db, &gen_cid, &gen_tier, featured,
                                                    priority, None,
                                                );
                                                info!("Payment Verifier: Enhanced UI generated for verified covenant {}", &gen_cid[..16]);
                                            });
                                        }
                                    }
                                }
                            }
                        } else {
                            debug!(
                                "Payment Verifier: Pending payment {} ({} confs, needs {})",
                                &tx_id[..16],
                                confirmations,
                                MIN_CONFIRMATIONS
                            );
                        }
                    }
                }
            }
            Err(e) => {
                warn!("Payment Verifier: get_utxos_by_addresses failed: {}", e);
            }
        }
    }
}

// Single-tx payment status probe, kept as a stub for a future /payment-status endpoint; the live
// verifier scans the treasury in run_payment_verifier instead, so nothing calls this yet.
#[allow(dead_code)]
pub async fn verify_payment(
    _client: &KaspaRpcClient,
    tx_id: &str,
) -> anyhow::Result<PaymentStatus> {
    Ok(PaymentStatus {
        tx_id: tx_id.to_string(),
        confirmed: false,
        confirmations: 0,
        amount_sompi: 0,
        tier: None,
    })
}

#[derive(Debug, serde::Serialize)]
#[allow(dead_code)]
pub struct PaymentStatus {
    pub tx_id: String,
    pub confirmed: bool,
    pub confirmations: u64,
    pub amount_sompi: u64,
    pub tier: Option<&'static str>,
}

#[cfg(test)]
mod tests {
    use super::*;

    // Tier thresholds in sompi (1 KAS = 100_000_000 sompi). These mirror the price_sompi
    // constants in covenant_types::tiers() so the tests pin the real on-chain amounts.
    const KAS: u64 = 100_000_000;
    const BUILDER_SOMPI: u64 = 100 * KAS; // 10_000_000_000
    const PRO_SOMPI: u64 = 500 * KAS; // 50_000_000_000
    const MAX_SOMPI: u64 = 1000 * KAS; // 100_000_000_000

    const GOOD_ADDR: &str = "kaspatest:qqg5d3l3jq7q9j5xq0example0sender0addr0000000000";

    // ── confirmations_for: depth + saturation ────────────────────────────────────

    #[test]
    fn confirmations_for_computes_depth() {
        assert_eq!(confirmations_for(1000, 994), 6);
        assert_eq!(confirmations_for(1000, 1000), 0);
    }

    #[test]
    fn confirmations_for_saturates_when_block_is_ahead() {
        // A UTXO whose block_daa is at/after the current virtual score (transient race/reorg)
        // must read as 0 confirmations, never a wrapped/underflowed huge number that could be
        // mistaken for "final". This is the fail-closed guard on the depth computation.
        assert_eq!(confirmations_for(900, 1000), 0);
        assert_eq!(confirmations_for(0, u64::MAX), 0);
    }

    // ── is_payment_final: the confirmation gate ──────────────────────────────────

    #[test]
    fn is_payment_final_only_at_or_above_threshold() {
        assert!(!is_payment_final(0));
        assert!(!is_payment_final(MIN_CONFIRMATIONS - 1)); // 5 confs: pending
        assert!(is_payment_final(MIN_CONFIRMATIONS)); // exactly 6: final
        assert!(is_payment_final(MIN_CONFIRMATIONS + 100));
    }

    // ── tier_from_amount: accept exact tier amounts, reject underpay ──────────────

    #[test]
    fn tier_from_amount_accepts_exact_tier_amounts() {
        assert_eq!(tier_from_amount(BUILDER_SOMPI), Some("BUILDER"));
        assert_eq!(tier_from_amount(PRO_SOMPI), Some("PRO"));
        assert_eq!(tier_from_amount(MAX_SOMPI), Some("MAX"));
    }

    #[test]
    fn tier_from_amount_rejects_underpay_below_smallest_tier() {
        // One sompi short of BUILDER must NOT grant any tier (underpay -> None).
        assert_eq!(tier_from_amount(BUILDER_SOMPI - 1), None);
        assert_eq!(tier_from_amount(0), None);
        assert_eq!(tier_from_amount(50 * KAS), None); // half of BUILDER
    }

    // ── authorize_tier_upgrade: the full FAIL-CLOSED verification core ────────────

    #[test]
    fn authorize_accepts_exact_amount_and_address_when_final() {
        // The accept path: exact tier amount + a real payer + final confirmations.
        assert_eq!(
            authorize_tier_upgrade(BUILDER_SOMPI, MIN_CONFIRMATIONS, GOOD_ADDR),
            Some("BUILDER")
        );
        assert_eq!(
            authorize_tier_upgrade(PRO_SOMPI, MIN_CONFIRMATIONS, GOOD_ADDR),
            Some("PRO")
        );
        assert_eq!(
            authorize_tier_upgrade(MAX_SOMPI, MIN_CONFIRMATIONS + 50, GOOD_ADDR),
            Some("MAX")
        );
    }

    #[test]
    fn authorize_rejects_underpay() {
        // REJECT underpay: below the smallest tier, even with a real payer and final confs.
        assert_eq!(
            authorize_tier_upgrade(BUILDER_SOMPI - 1, MIN_CONFIRMATIONS, GOOD_ADDR),
            None,
            "an amount one sompi below BUILDER must NOT authorize any upgrade"
        );
        assert_eq!(
            authorize_tier_upgrade(0, MIN_CONFIRMATIONS, GOOD_ADDR),
            None,
            "a zero payment must NOT authorize any upgrade"
        );
    }

    #[test]
    fn authorize_rejects_below_confirmation_threshold() {
        // REJECT pending: a fully-funded MAX payment from a real payer is still refused until it
        // reaches MIN_CONFIRMATIONS. This is the finality gate, fail-closed at every depth below.
        for confs in 0..MIN_CONFIRMATIONS {
            assert_eq!(
                authorize_tier_upgrade(MAX_SOMPI, confs, GOOD_ADDR),
                None,
                "a payment with {confs} confs (< {MIN_CONFIRMATIONS}) must NOT authorize an upgrade"
            );
        }
    }

    #[test]
    fn authorize_rejects_missing_or_unknown_address() {
        // REJECT a missing/unknown payer: a payment we cannot attribute to a sender must never
        // authorize an upgrade. The loop additionally binds the upgrade to from_address ==
        // creator_addr, so a WRONG (non-creator) address can never upgrade a covenant it did not
        // create; an empty/unknown sender is the strongest form of that reject and is gated here.
        assert_eq!(
            authorize_tier_upgrade(MAX_SOMPI, MIN_CONFIRMATIONS, ""),
            None,
            "an empty payer address must NOT authorize any upgrade"
        );
    }

    #[test]
    fn authorize_is_fail_closed_on_every_reject_axis_combined() {
        // Defense in depth: when MULTIPLE reject conditions hold at once, the result is still
        // None. No single satisfied condition can override another's veto.
        assert_eq!(authorize_tier_upgrade(0, 0, ""), None);
        assert_eq!(
            authorize_tier_upgrade(BUILDER_SOMPI - 1, 0, GOOD_ADDR),
            None
        );
        assert_eq!(authorize_tier_upgrade(MAX_SOMPI, 1, ""), None);
    }
}
