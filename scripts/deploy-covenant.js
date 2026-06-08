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
