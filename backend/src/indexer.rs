use crate::db;
use kaspa_addresses::Address;
use kaspa_rpc_core::api::rpc::RpcApi;
use kaspa_wrpc_client::KaspaRpcClient;
use std::sync::Arc;
use std::sync::Mutex;
use tracing::{info, warn, error};

pub async fn run_indexer(
    client: Arc<KaspaRpcClient>,
    db: Arc<Mutex<rusqlite::Connection>>,
    seed_addresses: Vec<String>,
) {
    info!("Indexer started -- polling every 30s");
    let mut interval = tokio::time::interval(std::time::Duration::from_secs(30));

    loop {
        interval.tick().await;

        if !client.is_connected() {
            warn!("Indexer: wRPC client not connected, skipping tick");
            continue;
        }

        let mut total_found = 0usize;
        for addr_str in &seed_addresses {
            let addr = match Address::try_from(addr_str.as_str()) {
                Ok(a) => a,
                Err(e) => {
                    warn!("Indexer: invalid seed address {}: {}", addr_str, e);
                    continue;
                }
            };

            match client.get_utxos_by_addresses(vec![addr]).await {
                Ok(entries) => {
                    for entry in entries {
                        let tx_id = entry.outpoint.transaction_id.to_string();
                        let address = entry.address.map(|a| a.to_string()).unwrap_or_default();
                        let amount = entry.utxo_entry.amount;

                        if let Err(e) = db::insert_covenant(&db, &tx_id, &address, amount, "", "") {
                            error!("Indexer: failed to insert {}: {}", tx_id, e);
                        } else {
                            total_found += 1;
                        }
                    }
                }
                Err(e) => {
                    warn!("Indexer: get_utxos_by_addresses failed for {}: {}", addr_str, e);
                }
            }
        }

        if total_found > 0 {
            info!("Indexer: indexed {} covenant UTXOs", total_found);
        }
    }
}
