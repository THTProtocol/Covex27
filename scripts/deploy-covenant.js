// Covex27 CLI Deployment Script — Node.js + kaspa-wasm (WASM-aware)
// Deploy a MAX-tier (1,000 KAS) covenant from Dev Wallet 1 programmatically.
//
// Transaction structure:
//   Output 0: Covenant payload (1 KAS locked in contract)
//   Output 1: 1,000 KAS → Treasury  
//   Output 2: Change → Deployer
//
// Must be run from: /mnt/HC_Volume_105579109/Covex27/frontend/node_modules/@onekeyfe/kaspa-wasm/
// because the WASM module resolves relative to __dirname.

const path = require('path');
const fs = require('fs');

// WASM module lives in the kaspa-wasm package dir
const KASPA_DIR = '/mnt/HC_Volume_105579109/Covex27/frontend/node_modules/@onekeyfe/kaspa-wasm';

async function main() {
    console.log(`\n=== Covex27 CLI Covenant Deployer (MAX Tier) ===\n`);

    // 1. Load kaspa-wasm — it auto-initializes the WASM via __wbg_init
    const kaspa_wasm = require(path.join(KASPA_DIR, 'kaspa.js'));
    
    // In Node.js, the WASM needs explicit initialization
    // The module exports a default init function, or we can use the sync path
    const { default: initWasm, PrivateKey, createTransaction, signTransaction } = kaspa_wasm;
    
    // Load the WASM binary and initialize
    const wasmBytes = fs.readFileSync(path.join(KASPA_DIR, 'kaspa_bg.wasm.bin'));
    const wasmModule = await WebAssembly.compile(wasmBytes);
    
    // The default export is the init function
    if (typeof kaspa_wasm.default === 'function') {
        await kaspa_wasm.default(wasmModule);
    } else {
        // Try the __wbg_init path
        await kaspa_wasm.__wbg_init(wasmModule);
    }
    
    console.log('WASM initialized ✓');

    // ── Hardcoded wallet identities ──
    const PK_HEX = '549cd5a5426360da67b66edd561d37b348a026708d01b519d396b868cda267c9';
    const ADDR = 'kaspatest:qrh603rmy6v0jsq58jrh2yr4ewdk02gctjhxg9feg7uwdl98t04dqmzlrt353';
    const TREASURY = 'kaspatest:qpyfz03k6quxwf2jglwkhczvt758d8xrq99gl37p6h3vsqur27ltjhn68354m';

    // 2. Verify key
    const pk = new PrivateKey(PK_HEX);
    const derived = pk.toAddress('testnet-12').toString();
    if (derived !== ADDR) {
        console.error(`ADDRESS MISMATCH: derived=${derived} expected=${ADDR}`);
        process.exit(1);
    }
    console.log(`Address verified: ${ADDR.slice(0,20)}... ✓\n`);

    // 3. Fetch UTXOs
    const utxoUrl = `http://127.0.0.1:3005/utxos/${encodeURIComponent(ADDR)}`;
    console.log(`Fetching UTXOs...`);
    const utxoResp = await fetch(utxoUrl);
    const utxoData = await utxoResp.json();
    
    if (!utxoData.utxos?.length) {
        console.error('No UTXOs! Fund Wallet 1 on TN12 first.');
        process.exit(1);
    }
    
    const sorted = utxoData.utxos.sort((a, b) => b.amount - a.amount);
    const utxo = sorted[0];
    const inputAmount = BigInt(utxo.amount);
    console.log(`UTXO: ${utxo.tx_id.slice(0,16)}... index=${utxo.index} amt=${Number(inputAmount)/1e8} TKAS\n`);

    // 4. Calculate costs
    const TX_FEE = 10_000n;
    const COVENANT_AMT = 100_000_000n;  // 1 TKAS locked
    const TIER_FEE = 100_000_000_000n;   // 1,000 TKAS for MAX
    const TOTAL = COVENANT_AMT + TIER_FEE + TX_FEE;
    const CHANGE = inputAmount - TOTAL;

    console.log(`Cost: lock=1 TKAS  tier=1,000 TKAS  tx_fee=0.0001 TKAS  total=${Number(TOTAL)/1e8} TKAS`);
    console.log(`Change: ${Number(CHANGE)/1e8} TKAS\n`);

    if (inputAmount < TOTAL) {
        console.error(`INSUFFICIENT FUNDS! Need ${Number(TOTAL)/1e8}, have ${Number(inputAmount)/1e8}`);
        process.exit(1);
    }

    // 5. Covenant payload (SilverScript source as bytes)
    const covenantSource = `// pragma silverscript 2026.0;\ncontract TransferWithTimeout {\n    state {\n        payee: Address,\n        amount: u64,\n        timeout: DaaScore\n    }\n    entrypoint function claim() {\n        require(opTx.outputs[0].address == state.payee);\n        require(opTx.outputs[0].amount == state.amount);\n    }\n    entrypoint function refund() {\n        require(opTx.daaScore > state.timeout);\n    }\n}`;

    // 6. Build UTXO entry (plain JS object matching WASM interface)
    const utxoEntry = {
        amount: inputAmount,
        outpoint: { transactionId: utxo.tx_id, index: utxo.index },
        scriptPublicKey: { version: 0, script: utxo.script_hex },
        blockDaaScore: 0n,
    };

    // 7. Multi-output structure
    // Output[0] = covenant lock, Output[1] = treasury payment, Output[2] = change
    const outputs = [
        { address: ADDR, amount: COVENANT_AMT },
        { address: TREASURY, amount: TIER_FEE },
    ];
    if (CHANGE > 0n) {
        outputs.push({ address: ADDR, amount: CHANGE });
    }

    console.log(`Outputs:`);
    outputs.forEach((o, i) => console.log(`  [${i}] ${Number(o.amount)/1e8} TKAS → ${o.address.slice(0,25)}...`));
    console.log();

    // 8. Build + sign
    console.log(`Building transaction...`);
    const tx = createTransaction([utxoEntry], outputs, TX_FEE, covenantSource, 0);
    const signedTx = signTransaction(tx, [pk], false);

    // 9. Serialize to hex
    const txBytes = signedTx.serializeTo();
    const txHex = Array.from(new Uint8Array(txBytes))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    console.log(`Tx hex: ${txHex.slice(0,64)}... (${txHex.length} chars)\n`);

    // 10. Broadcast via Covex backend
    console.log(`Broadcasting...`);
    const broadcastResp = await fetch('http://127.0.0.1:3005/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            tx_hex: txHex,
            deployer_addr: ADDR,
            script_hex: Buffer.from(covenantSource).toString('hex'),
            script_name: 'TransferWithTimeout (MAX Tier Test)',
            tier: 'MAX',
        }),
    });
    const result = await broadcastResp.json();

    console.log(`\n=== RESULT ===`);
    console.log(`Success: ${result.success}`);
    console.log(`TX ID:   ${result.tx_id || 'N/A'}`);
    if (result.error) console.log(`Error:   ${result.error}`);
    
    if (result.success && result.tx_id) {
        console.log(`\nExplorer: https://tn12.kaspa.stream/txs/${result.tx_id}`);
        console.log(`\nMonitor crawler:`);
        console.log(`  journalctl -u covex-backend -f | grep -E "Crawler.*found|Output"`);
        console.log(`\nCheck DB after indexing:`);
        console.log(`  sqlite3 /mnt/HC_Volume_105579109/Covex27/covex.db "SELECT tx_id, verified_tier FROM covenants;"`);
    }

    pk.free();
}

main().catch(e => {
    console.error('FATAL:', e.message || e);
    process.exit(1);
});
