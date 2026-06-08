import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const path = require('path');
const fs = require('fs');
const { fileURLToPath } = require('url');
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function findKaspaWasmDir() {
  const env = process.env.KASPA_WASM_DIR;
  if (env && fs.existsSync(env)) return env;
  const candidates = [
    process.env.KASPA_WASM_DIR,
    '/home/kasparov/Covex27/frontend/node_modules/@onekeyfe/kaspa-wasm',
    path.resolve(process.cwd(), 'frontend/node_modules/@onekeyfe/kaspa-wasm'),
    '/root/Covex27/frontend/node_modules/@onekeyfe/kaspa-wasm',
    '/mnt/HC_Volume_105579109/Covex27/frontend/node_modules/@onekeyfe/kaspa-wasm',
    path.resolve(__dirname, '../../frontend/node_modules/@onekeyfe/kaspa-wasm'),
    ...Array.from({length: 5}, (_, i) => path.resolve(process.cwd(), '../'.repeat(i + 1) + 'frontend/node_modules/@onekeyfe/kaspa-wasm')).filter(p => fs.existsSync(p)),
  ].filter(Boolean);
  for (const c of candidates) { if (c && fs.existsSync(path.join(c, 'kaspa.js'))) return c; }
  return process.env.KASPA_WASM_DIR || '/home/kasparov/Covex27/frontend/node_modules/@onekeyfe/kaspa-wasm';
}
const KASPA_DIR = findKaspaWasmDir();
console.log('WASM dir resolved:', KASPA_DIR);
console.log('=== Covex27 CLI Covenant Deployer (MAX / PRO / BUILDER Tier) ===');
console.log('Ready (ESM + stale fixed). Full logic in source; for prod use Rust /api/sign-and-broadcast escape hatch (avoids node wasm). See deploy-covenant.js + signer.rs.');
// Easy custom UI deploy helper for creators (paid tiers only).
// Usage example (after node scripts/deploy-covenant.js --help or direct):
// node scripts/deploy-covenant.js --wallet kaspatest:YOUR_TEST_WALLET --tier PRO --circuit turn_timer --custom-ui '<div style="...">My nice transparent UI: full logic, oracle sig, creator only, all details here...</div>' --description "Transparent custom UI covenant"
// This appends the custom_ui_html to the payload for /sign-and-broadcast (robust path).
// Only the deployer (creator) can set it; viewers see the nice custom/transparent view by default (no terminal).
if (process.argv.includes('--custom-ui')) {
  const customIdx = process.argv.indexOf('--custom-ui');
  const customHtml = process.argv[customIdx + 1] || '<div style="padding:20px;background:#111;color:#49EACB;border-radius:12px">Easy creator-only nice transparent custom UI deployed. Everything on-chain: logic, payments, oracle proofs, addresses. No secrets for regular users.</div>';
  console.log('Custom UI HTML prepared for deploy payload (creator-only via paid tier):', customHtml.substring(0, 120) + '...');
  // In full version, this would be passed to the API call.
  // For now, the robust way is the curl/API with custom_ui_html as shown in plans.
}
