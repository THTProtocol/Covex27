#!/usr/bin/env bash
# Covex local CI mirror. We push straight to master (no PR gate), so GitHub CI only
# runs AFTER a commit lands. Run this BEFORE pushing a batch so what hits master is
# already green. It mirrors the GitHub CI gates that can run locally fast.
#
#   bash scripts/ci-local.sh
#
# Backend note: cargo build+test --release runs on the GitHub runner and on the
# server's gated deploy (/tmp/hard_deploy.sh build+test-gate). Local Windows cannot
# reliably build the vendored Rust, so this script does NOT attempt it; rely on the
# server gate for backend changes.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 2
fail=0
run() { echo ""; echo "== $1 =="; shift; "$@"; }

run "style: no new em/en dashes (gate)" bash scripts/check-no-emdash.sh || fail=1
run "honesty: no new payment_just_confirmed (gate)" bash scripts/check-no-payment-just-confirmed.sh || fail=1
run "frontend: sandbox guard (gate)" bash -c 'cd frontend && node scripts/check-sandbox.mjs' || fail=1
run "frontend: vitest (gate)" bash -c 'cd frontend && npx vitest run' || fail=1
run "frontend: vite build (gate)" bash -c 'cd frontend && npm run build' || fail=1
run "frontend: eslint (advisory)" bash -c 'cd frontend && npm run lint' || echo "(advisory: eslint reported issues, not blocking)"
if command -v cargo >/dev/null 2>&1; then
  run "backend: cargo test (advisory)" bash -c 'cd backend && cargo test --release -p covex27-backend --bin covex27-backend games:: signer:: main::' || echo "(advisory: cargo test reported issues, not blocking)"
else
  echo ""; echo "== backend: cargo test (advisory) =="; echo "(advisory: cargo not available locally, skipping; server gate runs the real build+test)"
fi

echo ""
if [ "$fail" = 0 ]; then
  echo "============================="
  echo " CI-LOCAL: PASS - safe to push"
  echo "============================="
else
  echo "============================="
  echo " CI-LOCAL: FAIL - fix before pushing"
  echo "============================="
  exit 1
fi
