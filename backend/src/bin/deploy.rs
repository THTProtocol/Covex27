//! Covex27 — One-shot covenant deployer binary
//! 
//! Uses the backend's existing Kaspa deps to build, sign, and broadcast
//! a MAX-tier covenant deployment from Dev Wallet 1.
//!
//! Usage: cargo run --bin deploy MAX

use std::io::{self, Read, Write};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let tier = std::env::args().nth(1).unwrap_or_else(|| "MAX".to_string());
    let tier_fee: u64 = match tier.as_str() {
        "CREATOR" => 10_000_000_000,
        "PRO" => 50_000_000_000,
        "MAX" => 100_000_000_000,
        _ => { eprintln!("Usage: deploy <CREATOR|PRO|MAX>"); std::process::exit(1); }
    };

    println!("=== Covex27 CLI Deployer ({tier}) ===\n");

    // We'll execute Node.js with a CommonJS script that uses vm.createContext
    // to load kaspa.js in a CJS sandbox. This bypasses the ESM/CJS conflict.
    
    let script = format!(
r#"const {{ createContext, runInContext }} = require('vm');
const {{ readFileSync }} = require('fs');
const Module = require('module');
const path = require('path');

const WASM_DIR = '/mnt/HC_Volume_105579109/Covex27/frontend/node_modules/@onekeyfe/kaspa-wasm';

(async () => {{
    const jsSource = readFileSync(path.join(WASM_DIR, 'kaspa.js'), 'utf8');
    const wasmBytes = readFileSync(path.join(WASM_DIR, 'kaspa_bg.wasm.bin'));
    
    // The kaspa.js uses `export` keywords. We need to strip them for CJS eval.
    // Replace `export function` and `export const` etc.
    let cjsSource = jsSource;
    // Remove `export default ...` lines and `export {{...}}` 
    cjsSource = cjsSource.replace(/^export\s+default\s+/gm, 'module.exports.default = ');
    cjsSource = cjsSource.replace(/^export\s+(function|const|let|var|class|async\s+function)/gm, '$1');
    cjsSource = cjsSource.replace(/^export\s+\{{([^}}]*)\}}\s*;?\s*$/gm, (_, names) => {{
        const items = names.split(',').map(n => n.trim().replace(/ as .*$/, '').trim()).filter(Boolean);
        return items.map(n => `module.exports.${{n}} = ${{n}};`).join('\n');
    }});
    
    console.log('Converted to CJS:', cjsSource.length, 'chars');
    
    const kaspaReq = Module.createRequire(path.join(WASM_DIR, 'kaspa.js'));
    
    const sandbox = {{
        require: kaspaReq,
        module: {{ exports: {{}} }},
        console, process, Buffer,
        setTimeout, clearTimeout, setInterval, clearInterval,
        TextDecoder, TextEncoder,
        Uint8Array, Float64Array, Int32Array, ArrayBuffer,
        Map, Set, WeakMap, Error, TypeError,
        WebAssembly, Math, JSON, Promise, Date,
        window: undefined, self: undefined,
        navigator: undefined, document: undefined, fetch: undefined,
    }};
    sandbox.global = sandbox;
    createContext(sandbox);
    
    try {{
        runInContext(cjsSource, sandbox, {{ filename: 'kaspa.js' }});
    }} catch(e) {{
        console.error('Eval error:', e.message.slice(0, 200));
        process.exit(1);
    }}
    
    const kaspa = sandbox.module.exports;
    const keys = Object.keys(kaspa);
    console.log('Export keys:', keys.filter(k => typeof kaspa[k] === 'function').slice(0, 20));
    
    const initFn = kaspa.default;
    if (typeof initFn !== 'function') {{
        console.error('No default export found');
        process.exit(1);
    }}
    
    const wm = await WebAssembly.compile(wasmBytes);
    await initFn(wm);
    console.log('WASM initialized');
    
    const {{ PrivateKey, createTransaction, signTransaction }} = kaspa;
    
    const PK = '{pk}';
    const ADDR = '{deployer}';
    const TREASURY = '{treasury}';
    
    const pk = new PrivateKey(PK);
    const d = pk.toAddress('testnet-12').toString();
    if (d !== ADDR) {{ console.error('ADDR MISMATCH:'+d); process.exit(1); }}
    console.log('Address OK');
    
    const r = await fetch('{backend}/utxos/' + encodeURIComponent(ADDR));
    const j = await r.json();
    const utxos = (j.utxos||[]).sort((a,b)=>b.amount-a.amount);
    if (!utxos.length) {{ console.error('NO UTXOS'); process.exit(1); }}
    const u = utxos[0];
    console.log('UTXO:', (u.amount/1e8).toFixed(4), 'TKAS');
    
    const FE = 10000n, CV = 100000000n, TF = {tier_fee}n;
    const inp = BigInt(u.amount), tot = CV + TF + FE, chg = inp - tot;
    if (inp < tot) {{ console.error('INSUFFICIENT'); process.exit(1); }}
    console.log('Cost:', Number(tot)/1e8, 'Change:', Number(chg)/1e8);
    
    const src = '// pragma silverscript 2026.0;\\ncontract Test {{ state {{ x: u64 }} entrypoint function f() {{ require(true); }} }}';
    const ue = {{amount:inp, outpoint:{{transactionId:u.tx_id,index:u.index}}, scriptPublicKey:{{version:0,script:u.script_hex}}, blockDaaScore:0n}};
    const out = [{{address:ADDR,amount:CV}}, {{address:TREASURY,amount:TF}}];
    if (chg>0n) out.push({{address:ADDR,amount:chg}});
    
    console.log('Building tx...');
    const tx = createTransaction([ue], out, FE, src, 0);
    const stx = signTransaction(tx, [pk], false);
    const hx = Array.from(new Uint8Array(stx.serializeTo())).map(b=>b.toString(16).padStart(2,'0')).join('');
    console.log('TX hex:', hx.length, 'chars');
    
    console.log('Broadcasting...');
    const br = await fetch('{backend}/broadcast', {{method:'POST', headers:{{'Content-Type':'application/json'}}, body:JSON.stringify({{tx_hex:hx,deployer_addr:ADDR,script_hex:Buffer.from(src).toString('hex'),script_name:'MAX Tier Test',tier:'{tier}'}})}});
    const result = await br.json();
    console.log('\\n=== RESULT ===');
    console.log('success:', result.success);
    if (result.tx_id) {{ console.log('tx_id:', result.tx_id); console.log('TX_ID=' + result.tx_id); }}
    if (result.error) console.log('error:', result.error);
    pk.free();
}})().catch(e => {{ console.error('FATAL:', e.message||e); process.exit(1); }});
"#,
        pk = "549cd5a5426360da67b66edd561d37b348a026708d01b519d396b868cda267c9",
        deployer = "kaspatest:qrh603rmy6v0jsq58jrh2yr4ewdk02gctjhxg9feg7uwdl98t04dqmzlrt353",
        treasury = "kaspatest:qpyfz03k6quxwf2jglwkhczvt758d8xrq99gl37p6h3vsqur27ltjhn68354m",
        backend = "http://127.0.0.1:3005",
        tier_fee = tier_fee,
        tier = tier,
    );

    std::fs::write("/tmp/deploy.cjs", script)?;
    
    println!("Executing deploy script...\n");
    let output = std::process::Command::new("node")
        .arg("/tmp/deploy.cjs")
        .output()?;
    
    io::stdout().write_all(&output.stdout)?;
    io::stderr().write_all(&output.stderr)?;
    
    Ok(())
}
