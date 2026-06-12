use crate::covenant_types::tier_from_amount;
use crate::db;
use kaspa_rpc_core::api::rpc::RpcApi;
use kaspa_wrpc_client::KaspaRpcClient;
use std::sync::Arc;
use std::sync::Mutex;
use tracing::{debug, error, info, warn};

/// Payment Verifier v2 -- Monitors treasury, matches payments to covenants
/// by from_address == creator_addr, upgrades covenant record with full
/// disclosure fields, and triggers enhanced UI regeneration.
pub async fn run_payment_verifier(
    client: Arc<KaspaRpcClient>,
    db: Arc<Mutex<rusqlite::Connection>>,
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
                        let confirmations = if current_daa > block_daa {
                            current_daa - block_daa
                        } else {
                            0
                        };

                        // MATCH payment to covenant by from_address == creator_addr
                        let matched_covenant =
                            match db::get_covenants_by_creator(&db, &from_address, Some(&network)) {
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

                        if confirmations >= 6 {
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
                                    {
                                        let conn = db.lock().unwrap();
                                        crate::db::record_event_once(&conn, "tier_upgraded", &tx_id, &network, amount_sompi as f64 / 100_000_000.0, tier);
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
                                            let gen_db = Arc::clone(&db);
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
                                "Payment Verifier: Pending payment {} ({} confs, needs 6)",
                                &tx_id[..16],
                                confirmations
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
pub struct PaymentStatus {
    pub tx_id: String,
    pub confirmed: bool,
    pub confirmations: u64,
    pub amount_sompi: u64,
    pub tier: Option<&'static str>,
}
