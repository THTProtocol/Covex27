#!/usr/bin/env bash
# check-zk-prove-gate.sh - LOAD-BEARING ZK reproducibility gate.
#
# For EVERY circuit the honest registry (zk/circuit_registry.json) marks provable
# (full-zk-offchain), this:
#   1. generates a REAL Groth16 proof from ONLY the committed SERVED artifacts
#      (frontend/public/zk/<id>/<id>.wasm + <id>_final.zkey),
#   2. VERIFIES it ACCEPTS against the SERVED vkey  -> if the served zkey and vkey
#      ever DRIFT apart, this fails and REDS the build,
#   3. asserts the covenantId public input is BOUND,
#   4. runs a field-overflow tamper (signal + r) -> must REJECT,
#   5. runs a proof byte-flip tamper           -> must REJECT,
#   6. runs a false-predicate flip (output->0)  -> must REJECT.
#
# This is the gate that guarantees the served proving keys are reproducibly provable.
# It needs node + snarkjs + circomlibjs (zk/node_modules). Locally it falls back to
# `wsl node` because the snarkjs CLI shim is broken in git-bash; in GitHub CI node is
# native and `npm ci` is run in zk/ first (see .github/workflows/ci.yml).
#
# Run: bash scripts/check-zk-prove-gate.sh [circuit_id ...]
set -uo pipefail
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo .)"
cd "$ROOT" || exit 2

# Resolve a node that can require snarkjs/circomlibjs from zk/node_modules.
have_deps() { node -e 'require.resolve("snarkjs");require.resolve("circomlibjs")' >/dev/null 2>&1; }
RUNNER=""
if command -v node >/dev/null 2>&1 && ( cd zk && have_deps ); then
  RUNNER="node"
elif command -v wsl >/dev/null 2>&1; then
  # WSL path: the worktree maps under /mnt/c/...; zk/node_modules may be a symlink to the
  # main checkout. Verify deps resolve there before committing to this runner.
  WROOT="$(wsl wslpath "$ROOT" 2>/dev/null | tr -d '\r')"
  if wsl bash -lc "cd '$WROOT/zk' && node -e 'require.resolve(\"snarkjs\");require.resolve(\"circomlibjs\")'" >/dev/null 2>&1; then
    RUNNER="wsl"
  fi
fi

if [ -z "$RUNNER" ]; then
  echo "check-zk-prove-gate: snarkjs/circomlibjs not resolvable (run 'npm ci' in zk/, or install wsl node)."
  echo "  This gate must NOT be skipped silently in CI - install deps so it runs."
  exit 2
fi

if [ "$RUNNER" = "wsl" ]; then
  WROOT="$(wsl wslpath "$ROOT" 2>/dev/null | tr -d '\r')"
  wsl bash -lc "cd '$WROOT' && node zk/scripts/prove_gate.js $*"
else
  node zk/scripts/prove_gate.js "$@"
fi
