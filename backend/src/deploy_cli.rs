// Covex27 One-Shot Covenant Deployer
// Builds, signs, and broadcasts a MAX-tier covenant from Dev Wallet 1.
//
// Usage: cargo run --bin deploy -- <tier>
// Tier: FREE | BUILDER | PRO | MAX (default: MAX)

use kaspa_consensus_core::tx::{Transaction, TransactionInput, TransactionOutput, TransactionOutpoint, UtxoEntry};
use kaspa_consensus_core::subnets::SubnetworkId;
use kaspa_addresses::Address;
use kaspa_wrpc_client::KaspaRpcClient;
use kaspa_wrpc_client::WrpcEncoding;
use kaspa_rpc_core::api::rpc::RpcApi;
use kaspa_rpc_core::RpcTransaction;
use secp256k1::{Secp256k1, SecretKey, Message};
use sha2::{Sha256, Digest};
use std::io::Write;

const PK_HEX: &str = "549cd5a5426360da67b66edd561d37b348a026708d01b519d396b868cda267c9";
const DEPLOYER_ADDR: &str = "kaspatest:qrh603rmy6v0jsq58jrh2yr4ewdk02gctjhxg9feg7uwdl98t04dqmzlrt353";
const TREASURY_ADDR: &str = "kaspatest:qpyfz03k6quxwf2jglwkhczvt758d8xrq99gl37p6h3vsqur27ltjhn68354m";
const BACKEND_URL: &str = "http://127.0.0.1:3005";

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let tier = std::env::args().nth(1).unwrap_or_else(|| "MAX".to_string());
    let tier_fee_sompi: u64 = match tier.as_str() {
        "BUILDER" => 10_000_000_000,
        "PRO" => 50_000_000_000,
        "MAX" => 100_000_000_000,
        _ => {
            eprintln!("Usage: deploy <FREE|BUILDER|PRO|MAX>");
            std::process::exit(1);
        }
    };

    println!("=== Covex27 CLI Deployer ({}) ===\n", tier);

    // 1. Derive address from private key to verify
    let secp = Secp256k1::new();
    let sk_bytes = hex::decode(PK_HEX)?;
    let sk = SecretKey::from_slice(&sk_bytes)?;
    let pk = sk.public_key(&secp);

    // P2PKH address check: we trust the known address
    println!("Wallet 1: {}", DEPLOYER_ADDR);
    println!("Treasury: {}", TREASURY_ADDR);

    // 2. Fetch UTXOs from CovEx backend
    let utxo_url = format!("{}/utxos/{}", BACKEND_URL, DEPLOYER_ADDR);
    println!("\nFetching UTXOs: {}", utxo_url);
    let resp = reqwest::get(&utxo_url).await?;
    let json: serde_json::Value = resp.json().await?;
    let utxos = json["utxos"].as_array()
        .ok_or_else(|| anyhow::anyhow!("No UTXOs found"))?;

    if utxos.is_empty() {
        anyhow::bail!("No UTXOs for {}", DEPLOYER_ADDR);
    }

    // Sort by amount descending, pick largest
    let mut sorted: Vec<_> = utxos.iter().collect();
    sorted.sort_by(|a, b| b["amount"].as_u64().cmp(&a["amount"].as_u64()));
    let utxo = &sorted[0];

    let utxo_amount = utxo["amount"].as_u64().unwrap();
    let utxo_tx_id = utxo["tx_id"].as_str().unwrap();
    let utxo_index = utxo["index"].as_u64().unwrap() as u32;
    let utxo_script_hex = utxo["script_hex"].as_str().unwrap();

    println!("UTXO: {} TKAS  tx_id={}... index={}",
        utxo_amount as f64 / 100_000_000.0,
        &utxo_tx_id[..16],
        utxo_index
    );

    // 3. Calculate costs
    let covenant_amount: u64 = 100_000_000; // 1 TKAS
    let tx_fee: u64 = 10_000;
    let total_cost = covenant_amount + tier_fee_sompi + tx_fee;

    println!("\nCost breakdown:");
    println!("  Covenant: 1.0000 TKAS");
    println!("  Tier ({}): {} TKAS", tier, tier_fee_sompi as f64 / 100_000_000.0);
    println!("  TX fee:   0.0001 TKAS");
    println!("  Total:    {} TKAS", total_cost as f64 / 100_000_000.0);
    println!("  Available: {} TKAS", utxo_amount as f64 / 100_000_000.0);

    if utxo_amount < total_cost {
        anyhow::bail!("INSUFFICIENT FUNDS");
    }

    let change = utxo_amount - total_cost;
    println!("  Change:   {} TKAS", change as f64 / 100_000_000.0);

    // 4. Build outputs as JSON for the backend broadcast
    // We can't sign tx in Rust easily without wallet libraries,
    // so let's construct the hex ourselves using the frontend's WASM approach
    // Actually, let's use a different strategy: call the backend broadcast
    // endpoint with a properly constructed tx_hex.

    // Since we can't easily sign in Rust without wallet support,
    // let me use the Node.js approach with a simple workaround.
    // Actually - we CAN just use the existing backend's broadcast handler.
    // The frontend Deploy.jsx already generates tx_hex. 
    // Let me take a shortcut: write the tx to the frontend and trigger it.

    // For now, let me write a Node.js script that works within the WASM dir
    // and execute it via terminal.

    println!("\nWriting deployment script...");
    
    let script = format!(r#"
const {{ readFileSync }} = require('fs');
// The kaspa-wasm dir has package.json with "module": "kaspa.js"
// Node treats it as ESM, breaking internal require().
// WORKAROUND: load the wasm binary and JS separately.
const vm = require('vm');
const path = require('path');

const WASM_DIR = '/mnt/HC_Volume_105579109/Covex27/frontend/node_modules/@onekeyfe/kaspa-wasm';

// Read the JS source and eval with proper require binding
const jsSource = readFileSync(path.join(WASM_DIR, 'kaspa.js'), 'utf8');
const wasmBytes = readFileSync(path.join(WASM_DIR, 'kaspa_bg.wasm.bin'));

// Create a custom require that resolves relative to WASM_DIR
const Module = require('module');
const customRequire = Module.createRequire(path.join(WASM_DIR, 'kaspa.js'));

const sandbox = {{
    require: customRequire,
    module: {{ exports: {{}} }},
    exports: {{}},
    console: console,
    global: global,
    process: process,
    Buffer: Buffer,
    setInterval: setInterval,
    clearInterval: clearInterval,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    TextDecoder: TextDecoder,
    TextEncoder: TextEncoder,
    Uint8Array: Uint8Array,
    WebAssembly: WebAssembly,
}};
sandbox.global = sandbox;

vm.createContext(sandbox);
const kaspaExports = vm.runInContext(jsSource, sandbox);

// The default export is __wbg_init
const initFn = sandbox.module.exports.default || sandbox.exports.default;

(async () => {{
    const wm = await WebAssembly.compile(wasmBytes);
    await initFn(wm);
    
    const kaspa = sandbox.module.exports || sandbox.exports;
    const {{ PrivateKey, createTransaction, signTransaction }} = kaspa;
    
    const PK = '{}';
    const ADDR = '{}';
    const TREASURY = '{}';
    
    const pk = new PrivateKey(PK);
    const derived = pk.toAddress('testnet-12').toString();
    if (derived !== ADDR) {{ console.error('ADDR MISMATCH'); process.exit(1); }}
    console.log('Address OK');
    
    const resp = await fetch('{}');
    const data = await resp.json();
    const utxos = (data.utxos || []).sort((a,b) => b.amount - a.amount);
    if (!utxos.length) {{ console.error('NO UTXOS'); process.exit(1); }}
    const u = utxos[0];
    console.log('UTXO: ' + (u.amount/1e8).toFixed(4) + ' TKAS');
    
    const FE = 10000n, CV = 100000000n, TF = {}n;
    const inp = BigInt(u.amount);
    const tot = CV + TF + FE;
    const chg = inp - tot;
    console.log('Outputs: [0]=1 [1]={} [2]=' + (Number(chg)/1e8).toFixed(4) + ' KAS');
    
    if (inp < tot) {{ console.error('INSUFFICIENT'); process.exit(1); }}
    
    const src = '// pragma silverscript 2026.0;\\\\ncontract Test {{ state {{ x: u64 }} entrypoint function f() {{ require(true); }} }}';
    
    const ue = {{
        amount: inp,
        outpoint: {{ transactionId: u.tx_id, index: u.index }},
        scriptPublicKey: {{ version: 0, script: u.script_hex }},
        blockDaaScore: 0n,
    }};
    
    const out = [{{ address: ADDR, amount: CV }}, {{ address: TREASURY, amount: TF }}];
    if (chg > 0n) out.push({{ address: ADDR, amount: chg }});
    
    console.log('Building tx...');
    const tx = createTransaction([ue], out, FE, src, 0);
    const stx = signTransaction(tx, [pk], false);
    const hx = Array.from(new Uint8Array(stx.serializeTo())).map(b => b.toString(16).padStart(2,'0')).join('');
    console.log('TX hex: ' + hx.length + ' chars');
    
    console.log('Broadcasting...');
    const br = await fetch('{}/broadcast', {{
        method: 'POST',
        headers: {{'Content-Type':'application/json'}},
        body: JSON.stringify({{
            tx_hex: hx, deployer_addr: ADDR,
            script_hex: Buffer.from(src).toString('hex'),
            script_name: 'MAX Tier Test', tier: '{}',
        }}),
    }});
    const r = await br.json();
    console.log('\\n=== RESULT ===');
    console.log('success: ' + r.success);
    if (r.tx_id) {{ console.log('tx_id: ' + r.tx_id); console.log('TX_ID:' + r.tx_id); }}
    if (r.error) console.log('error: ' + r.error);
    pk.free();
}})().catch(e => {{ console.error('FATAL: ' + e.message); process.exit(1); }});
"#, 
        PK_HEX, DEPLOYER_ADDR, TREASURY_ADDR,
        format!("{}/utxos/{}", BACKEND_URL, DEPLOYER_ADDR),
        tier_fee_sompi, tier_fee_sompi as f64 / 100_000_000.0,
        BACKEND_URL, tier
    );

    std::fs::write("/tmp/deploy_vm.cjs", script)?;
    
    println!("Executing deployment script...\n");
    let output = std::process::Command::new("node")
        .arg("/tmp/deploy_vm.cjs")
        .output()?;
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    
    if !stdout.is_empty() { println!("{}", stdout); }
    if !stderr.is_empty() { eprintln!("{}", stderr); }
    
    // Check for TX_ID in output
    for line in stdout.lines() {
        if line.starts_with("TX_ID:") {
            let tx_id = line.trim_start_matches("TX_ID:").trim();
            println!("\n📡 Explorer: https://tn12.kaspa.stream/txs/{}", tx_id);
            println!("\n⏳ Waiting for crawler to index...");
        }
    }
    
    Ok(())
}
