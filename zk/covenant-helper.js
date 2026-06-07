#!/usr/bin/env node
/**
 * covenant-helper.js
 * Makes it dead simple to go from Covex oracle response → covenant witness data + .sil snippet.
 *
 * Usage:
 *   node zk/covenant-helper.js --covenant-id my-game-99 --circuit turn_timer --outcome 0 --sig 0xabc... --ts 1717000000 --public-inputs '["1","1000100"]'
 *
 * Or pipe a full oracle JSON response:
 *   curl ... | node zk/covenant-helper.js --from-stdin
 */
const fs = require('fs');

function printHelp() {
  console.log(`Covex Covenant Helper — turn oracle response into covenant-ready data

Examples:
  node zk/covenant-helper.js --covenant-id pot-42 --circuit pot_split_math --outcome 0 --sig aabbcc --ts 1717000000
  node zk/covenant-helper.js --from-stdin < oracle-response.json
`);
}

const args = process.argv.slice(2);
let covenantId = 'demo-covenant';
let circuit = 'turn_timer';
let outcome = '0';
let sig = 'deadbeef';
let ts = Math.floor(Date.now()/1000).toString();
let publicInputs = '[]';
let fromStdin = false;

for (let i=0; i<args.length; i++) {
  if (args[i] === '--covenant-id') covenantId = args[++i];
  else if (args[i] === '--circuit') circuit = args[++i];
  else if (args[i] === '--outcome') outcome = args[++i];
  else if (args[i] === '--sig') sig = args[++i];
  else if (args[i] === '--ts') ts = args[++i];
  else if (args[i] === '--public-inputs') publicInputs = args[++i];
  else if (args[i] === '--from-stdin') fromStdin = true;
  else if (args[i] === '--help') { printHelp(); process.exit(0); }
}

let data = { covenant_id: covenantId, circuit_type: circuit, outcome: parseInt(outcome), signature: sig, timestamp: parseInt(ts), public_inputs: JSON.parse(publicInputs) };

if (fromStdin) {
  const stdin = fs.readFileSync(0, 'utf8');
  try { data = { ...data, ...JSON.parse(stdin) }; } catch(e) {}
}

const message = `covex-oracle:${data.covenant_id || covenantId}:${data.outcome ?? outcome}:${data.timestamp ?? ts}`;

console.log('=== Oracle response (covenant ready) ===');
console.log(JSON.stringify({
  success: true,
  covenant_id: data.covenant_id || covenantId,
  circuit_type: data.circuit_type || circuit,
  outcome: data.outcome ?? parseInt(outcome),
  signature: data.signature || sig,
  timestamp: data.timestamp ?? parseInt(ts),
  message,
  public_inputs: data.public_inputs || JSON.parse(publicInputs),
  covenant_hint: `Drop 'message' + 'signature' as witnesses. Check with oracle pubkey for circuit ${data.circuit_type || circuit}.`
}, null, 2));

console.log('\n=== SilverScript witness snippet (paste into unlock) ===');
console.log(`// covenant_id = ${data.covenant_id || covenantId}`);
console.log(`// circuit   = ${data.circuit_type || circuit}`);
console.log(`let oracle_msg = b"${message}";`);
console.log(`let oracle_sig = 0x${(data.signature || sig).replace(/^0x/,'')};`);
console.log(`let outcome    = ${data.outcome ?? outcome};`);
console.log(`assert(aa21_oracle_sig_check(ORACLE_PUB, oracle_msg, oracle_sig));`);
console.log(`assert(outcome == 0);   // or the success value for this circuit`);

console.log('\n=== Next steps ===');
console.log('1. Add the other conditions (timelock, utxo ownership, pot math, script match).');
console.log('2. See examples/covenant-integration/*.sil for full templates.');
console.log('3. For real proofs: generate with the matching prove_*.js then POST the proof body.');
