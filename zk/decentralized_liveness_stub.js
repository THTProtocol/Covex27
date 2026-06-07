#!/usr/bin/env node
// Phase 3 decentralized oracle liveness stub (executable entrypoint for /oracle/liveness)
// Delegates to shared check fn in oracle_liveness_stub.js for the canonical response.
// Also re-exports checkLiveness() for direct require() usage (honest stub returns fixed Phase 3 obj).
// Enhanced: now also re-exports checkMultiOracleLiveness for multi-oracle stub usage.
const { checkLiveness, checkMultiOracleLiveness } = require('./oracle_liveness_stub.js');
console.log(JSON.stringify(checkLiveness()));
module.exports = { checkLiveness, checkMultiOracleLiveness };
