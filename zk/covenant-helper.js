#!/usr/bin/env node
/**
 * covenant-helper.js
 * Makes it dead simple to go from Covex oracle response → covenant witness data + .sil snippet.
 *
 * Usage:
 *   node zk/covenant-helper.js --covenant-id my-game-99 --circuit turn_timer --outcome 0 --sig 0xabc... --ts 1717000000 --max-delta 300
 *   node zk/covenant-helper.js --circuit relative_timelock --lock-duration 1000 --reference-daa 1000000
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
let publicInputs = null;
let maxDelta = null;
let lockDuration = null;
let referenceDaa = null;
let lockThreshold = null;
let fromStdin = false;

function buildPublicInputs(circ) {
  if (publicInputs) return JSON.parse(publicInputs);
  if (circ === 'turn_timer' && maxDelta != null) {
    return ['1', String(maxDelta)];
  }
  if (circ === 'relative_timelock' && lockDuration != null) {
    const ref = referenceDaa != null ? referenceDaa : '1000000';
    return ['1', ref, String(lockDuration)];
  }
  if (circ === 'timelock_absolute' && lockThreshold != null) {
    return ['1', String(lockThreshold)];
  }
  return [];
}

for (let i=0; i<args.length; i++) {
  if (args[i] === '--covenant-id') covenantId = args[++i];
  else if (args[i] === '--circuit') circuit = args[++i];
  else if (args[i] === '--outcome') outcome = args[++i];
  else if (args[i] === '--sig') sig = args[++i];
  else if (args[i] === '--ts') ts = args[++i];
  else if (args[i] === '--public-inputs') publicInputs = args[++i];
  else if (args[i] === '--max-delta') maxDelta = args[++i];
  else if (args[i] === '--lock-duration') lockDuration = args[++i];
  else if (args[i] === '--reference-daa') referenceDaa = args[++i];
  else if (args[i] === '--lock-threshold') lockThreshold = args[++i];
  else if (args[i] === '--from-stdin') fromStdin = true;
  else if (args[i] === '--help') { printHelp(); process.exit(0); }
}

let data = { covenant_id: covenantId, circuit_type: circuit, outcome: parseInt(outcome), signature: sig, timestamp: parseInt(ts), public_inputs: buildPublicInputs(circuit) };

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
  public_inputs: data.public_inputs || buildPublicInputs(data.circuit_type || circuit),
  timelock: {
    mode: (data.circuit_type || circuit) === 'turn_timer' ? 'turn_timer'
      : (data.circuit_type || circuit) === 'relative_timelock' ? 'relative'
      : (data.circuit_type || circuit) === 'timelock_absolute' ? 'absolute' : null,
    max_delta_daa: maxDelta != null ? parseInt(maxDelta, 10) : undefined,
    lock_duration_daa: lockDuration != null ? parseInt(lockDuration, 10) : undefined,
    reference_daa: referenceDaa != null ? parseInt(referenceDaa, 10) : undefined,
    lock_threshold_daa: lockThreshold != null ? parseInt(lockThreshold, 10) : undefined,
  },
  covenant_hint: `Use message+signature for covenant_id '${data.covenant_id || covenantId}'. circuit=${data.circuit_type || circuit}. Set timelock public signals from timelock block above.`
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
