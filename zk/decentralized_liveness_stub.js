#!/usr/bin/env node
// Phase 3 decentralized oracle liveness stub (executable entrypoint for /oracle/liveness)
// Delegates to shared check fn in oracle_liveness_stub.js for the canonical response.
// Also re-exports checkLiveness() for direct require() usage (honest stub returns fixed Phase 3 obj).
// Enhanced for Sprint 2: supports ?simulate=partial|down via args or env for covenant testing (e.g. node decentralized_liveness_stub.js partial).
const { checkLiveness, checkMultiOracleLiveness } = require('./oracle_liveness_stub.js');

const simulate = process.argv[2] || process.env.SIMULATE_LIVENESS || null;
const opts = simulate ? { simulate } : undefined;

console.log(JSON.stringify(checkLiveness()));
// Also support direct call with opts for advanced use
if (require.main === module && simulate) {
  console.log('With simulate:', JSON.stringify(checkMultiOracleLiveness(null, null, opts)));
}

module.exports = { checkLiveness, checkMultiOracleLiveness };
// Real: BLS threshold, heartbeats, staking. Current: dynamic sim for covenant testing.
// Real: BLS threshold, heartbeats, staking. Current: dynamic sim for covenant testing.
// Real: BLS threshold, heartbeats, staking. Current: dynamic sim for covenant testing.
// Real: BLS threshold, heartbeats, staking. Current: dynamic sim for covenant testing.
// Real: BLS threshold, heartbeats, staking. Current: dynamic sim for covenant testing.
// Real: BLS threshold, heartbeats, staking. Current: dynamic sim for covenant testing.
// Real: BLS threshold, heartbeats, staking. Current: dynamic sim for covenant testing.
// Real: BLS threshold, heartbeats, staking. Current: dynamic sim for covenant testing.
// Real: BLS threshold, heartbeats, staking. Current: dynamic sim for covenant testing.
