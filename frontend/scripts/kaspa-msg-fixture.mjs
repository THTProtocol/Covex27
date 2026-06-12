// Generates ground-truth Kaspa message-signature fixtures using
// @onekeyfe/kaspa-wasm (the library kasware is built on), so the Rust
// backend verifier can be validated against the real signing scheme.
// Run from frontend/: node kaspa-msg-fixture.mjs
import { readFileSync } from 'fs';
import * as mod from '../node_modules/@onekeyfe/kaspa-wasm/kaspa.js';

const bytes = readFileSync('../node_modules/@onekeyfe/kaspa-wasm/kaspa_bg.wasm.bin');
const compiled = await WebAssembly.compile(bytes);
mod.initSync({ module: compiled });

const { PrivateKey, signMessage, verifyMessage } = mod;

const keys = [
  '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f',
  '2222222222222222222222222222222222222222222222222222222222222222',
];
const messages = [
  'covex-config:b261d39f5d4766c6da1ffa5fe95d01ff77aea61c575a1d2a665d6bdc78e31132:11111111-2222-3333-4444-555555555555',
  'hello kaspa',
];

const out = [];
for (const k of keys) {
  const pk = new PrivateKey(k);
  const address = pk.toAddress('testnet-10').toString();
  const publicKey = pk.toPublicKey().toString();
  for (const message of messages) {
    const signature = signMessage({ message, privateKey: pk });
    const selfVerify = verifyMessage({ message, signature, publicKey: pk.toPublicKey() });
    out.push({ privateKey: k, address, publicKey, message, signature, selfVerify });
  }
}
console.log(JSON.stringify(out, null, 2));
