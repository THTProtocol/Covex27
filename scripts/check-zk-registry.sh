#!/usr/bin/env bash
# check-zk-registry.sh - GATE: the ZK circuit registry must be HONEST.
#
# Fails (exit 1) if ANY of:
#   1. zk/circuit_registry.json is stale (regenerate with gen_circuit_registry.js).
#   2. A circuit listed as full-zk-offchain / in_browser_prover does NOT actually ship a
#      served _final.zkey + wasm + vkey under frontend/public/zk/<id>/ (over-claim).
#   3. A circuit the frontend marks VERIFIED_FULL_ZK has no served _final.zkey (claim with no key).
#   4. A served _final.zkey exists for a circuit that is NOT recorded provable in the registry
#      (silent omission / drift).
#
# This is the #1 honesty gate: the registry + UI may claim a circuit "works" ONLY if a real
# proving key is committed so a proof can actually be generated and verified fail-closed.
#
# No deps beyond node (CI + local both have it). Run: bash scripts/check-zk-registry.sh
set -uo pipefail
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo .)"
cd "$ROOT" || exit 2
REG="zk/circuit_registry.json"
fail=0

node_bin() { command -v node >/dev/null 2>&1 && echo node || { command -v wsl >/dev/null 2>&1 && echo "wsl-node"; }; }
NB=$(node_bin)
runnode() { if [ "$NB" = "wsl-node" ]; then wsl bash -lc "cd '$ROOT' && node $*"; else node "$@"; fi; }

if [ -z "$NB" ]; then echo "check-zk-registry: node not found (need node or wsl)"; exit 2; fi

# 1. registry must be freshly generated from ground truth
if ! runnode zk/scripts/gen_circuit_registry.js --check >/tmp/zkreg_check.out 2>&1; then
  echo "FAIL: $REG is stale or generator errored:"; sed 's/^/   /' /tmp/zkreg_check.out; fail=1
fi

# 2/3/4. cross-check registry claims vs actual served keys vs frontend canonical set.
if ! runnode zk/scripts/check_registry_honesty.js; then fail=1; fi

exit $fail
