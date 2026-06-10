#!/usr/bin/env bash
# Build only newly added / refreshed priority circuits (chess-safe, low CPU).
set -euo pipefail
ZK="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ZK"
SNARKJS="$ZK/node_modules/.bin/snarkjs"
PTAU="$ZK/pot10_final.ptau"
NICE="nice -n 19"
CHESS_PID="${CHESS_SETUP_PID:-30259}"
LOG="$ZK/output/build_priority.log"
mkdir -p "$ZK/output"
exec > >(tee -a "$LOG") 2>&1

log() { echo "[$(date -Iseconds)] $*"; }

wait_chess() {
  while ps -p "$CHESS_PID" -o %cpu= 2>/dev/null | awk '{exit ($1+0 < 80)}'; do
    log "chess busy — sleep 60s"
    sleep 60
  done
}

build_one() {
  local base="$1"
  log "=== $base ==="
  [[ -f "${base}.circom" ]] || { log "skip missing ${base}.circom"; return 0; }
  if [[ ! -f "${base}_js/${base}.wasm" || ! -f "${base}.r1cs" ]]; then
    wait_chess
    $NICE circom2 "${base}.circom" --r1cs --wasm -o .
  fi
  if [[ ! -f "${base}.zkey" ]]; then
    wait_chess
    $NICE "$SNARKJS" groth16 setup "${base}.r1cs" "$PTAU" "${base}.zkey"
    $NICE "$SNARKJS" zkey export verificationkey "${base}.zkey" "${base}_vkey.json"
  fi
  local prove="prove_${base}.js"
  if [[ -f "$prove" ]]; then
    wait_chess
    $NICE node "$prove" || log "prove failed: $base"
  fi
}

log "build_priority start"
for c in age_verification escrow_2party financial_formula loan_health collateral_ltv auction_clearing poker_vrf_deal; do
  build_one "$c"
done
log "build_priority done"