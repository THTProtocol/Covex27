#!/usr/bin/env bash
# Low-priority batch build for all non-chess ZK circuits.
# Runs compile → dev zkey (pot10) → vkey → real proofs sequentially.
# Does NOT touch chess_v1 (pot17 ceremony may be running elsewhere).
set -euo pipefail

ZK_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ZK_ROOT"
LOG_DIR="$ZK_ROOT/output"
LOG="$LOG_DIR/build_all_lowpri.log"
mkdir -p "$LOG_DIR"

SNARKJS="$ZK_ROOT/node_modules/.bin/snarkjs"
PTAU="$ZK_ROOT/pot10_final.ptau"
NICE="nice -n 19"
CHESS_SETUP_PID="${CHESS_SETUP_PID:-30259}"

exec > >(tee -a "$LOG") 2>&1

log() { echo "[$(date -Iseconds)] $*"; }

ram_ok() {
  local avail_kb
  avail_kb=$(grep -E '^MemAvailable:' /proc/meminfo | awk '{print $2}')
  [[ "${avail_kb:-0}" -gt 1500000 ]]
}

chess_busy() {
  if ps -p "$CHESS_SETUP_PID" -o comm= 2>/dev/null | grep -q snarkjs; then
    local cpu
    cpu=$(ps -p "$CHESS_SETUP_PID" -o %cpu= 2>/dev/null | tr -d ' ')
    [[ -n "$cpu" && "${cpu%.*}" -ge 80 ]]
  else
    return 1
  fi
}

wait_for_resources() {
  local tries=0
  while ! ram_ok || chess_busy; do
    tries=$((tries + 1))
    if [[ $tries -gt 120 ]]; then
      log "WARN: resources still tight after 60m; continuing anyway"
      return 0
    fi
    log "waiting (RAM or chess zkey busy) — sleep 30s"
    sleep 30
  done
}

compile_circom() {
  local circom_path="$1"
  local out_dir="$2"
  local base
  base=$(basename "$circom_path" .circom)
  if [[ -f "$out_dir/${base}_js/${base}.wasm" && -f "$out_dir/${base}.r1cs" ]]; then
    log "  skip compile (wasm+r1cs exist): $base"
    return 0
  fi
  wait_for_resources
  log "  compile: $circom_path -> $out_dir"
  mkdir -p "$out_dir"
  # Always compile from zk root so relative includes (../node_modules, ../privacy_mixer, etc.) resolve.
  local rel
  rel=$(realpath --relative-to="$ZK_ROOT" "$circom_path")
  $NICE circom2 "$rel" --r1cs --wasm -o "$out_dir" || {
    log "  FAILED compile: $base"
    return 1
  }
}

dev_zkey() {
  local dir="$1"
  local base="$2"
  local r1cs="$dir/${base}.r1cs"
  local zkey="$dir/${base}.zkey"
  [[ -f "$r1cs" ]] || return 0
  if [[ -f "$zkey" ]]; then
    log "  skip zkey: $base"
    return 0
  fi
  wait_for_resources
  log "  groth16 setup (dev pot10): $base"
  $NICE "$SNARKJS" groth16 setup "$r1cs" "$PTAU" "$zkey"
  $NICE "$SNARKJS" zkey export verificationkey "$zkey" "$dir/${base}_vkey.json" || true
}

prove_if_needed() {
  local prove_script="$1"
  local out_proof="$2"
  [[ -f "$prove_script" ]] || return 0
  if [[ -f "$out_proof" ]]; then
    if python3 -c "import json,sys; d=json.load(open(sys.argv[1])); p=d.get('proof',{}); sys.exit(0 if (p.get('pi_a') or p.get('A')) else 1)" "$out_proof" 2>/dev/null; then
      log "  skip prove (real proof exists): $out_proof"
      return 0
    fi
  fi
  wait_for_resources
  log "  prove: $prove_script"
  (cd "$ZK_ROOT" && $NICE node "$(realpath --relative-to="$ZK_ROOT" "$prove_script")") || {
    log "  FAILED prove: $prove_script"
    return 1
  }
}

# Root-level production/stub circuits (exclude test helpers and chess)
ROOT_CIRCUITS=(
  basic_utxo_ownership script_constraint pot_split_math vrf_dice_roll vrf_random
  nullifier_set turn_timer relative_timelock collateral_liquidation onchain_sig_verify
  black_scholes_approx poker_equity ml_inference_stub private_transfer_nullifier
  auction_clearing poker_vrf_deal collateral_ltv loan_health financial_formula
  chess_ai_move election_feed verifiable_poker_solver multi_sig_gating anon_credential
  sorting_proof weather_feed merkle_membership
)

# Nested main circuits
NESTED=(
  "nullifier|nullifier/nullifier_v1.circom"
  "hash_preimage|hash_preimage/hash_preimage.circom"
  "timelock|timelock/timelock_absolute.circom"
  "range_proof|range_proof/range_proof.circom"
  "privacy_mixer/output|privacy_mixer/privacy_mixer_v1.circom"
  "games/tictactoe/output|games/tictactoe/tictactoe_v1.circom"
  "games/connect4/output|games/connect4/connect4_v1.circom"
)

log "=== build_all_circuits_lowpri start (chess PID $CHESS_SETUP_PID untouched) ==="

log "[1/3] Root circuits: compile + dev zkey"
for c in "${ROOT_CIRCUITS[@]}"; do
  [[ -f "$ZK_ROOT/${c}.circom" ]] || { log "  missing circom: $c"; continue; }
  log "circuit: $c"
  compile_circom "$ZK_ROOT/${c}.circom" "$ZK_ROOT" || true
  dev_zkey "$ZK_ROOT" "$c" || true
done

log "[2/3] Nested circuits: compile + dev zkey"
for entry in "${NESTED[@]}"; do
  out_dir="$ZK_ROOT/${entry%%|*}"
  rel="${entry#*|}"
  circom_path="$ZK_ROOT/$rel"
  base=$(basename "$rel" .circom)
  [[ -f "$circom_path" ]] || continue
  log "circuit: $rel"
  compile_circom "$circom_path" "$out_dir" || true
  dev_zkey "$out_dir" "$base" || true
done

log "[3/3] Real proofs (prove_*.js)"
PROVE_SCRIPTS=(
  prove_basic_utxo_ownership.js
  prove_script_constraint.js
  prove_pot_split_math.js
  prove_vrf_dice_roll.js
  prove_vrf_random.js
  prove_nullifier_set.js
  prove_turn_timer.js
  prove_relative_timelock.js
  prove_hash_preimage.js
  prove_timelock.js
  prove_range_proof.js
  prove_poker_equity.js
  prove_ml_inference_stub.js
  prove_private_transfer_nullifier.js
  prove_black_scholes_approx.js
  prove_collateral_liquidation.js
  prove_onchain_sig_verify.js
  prove_nullifier_v1.js
  privacy_mixer/scripts/prove_withdraw.js
  games/tictactoe/scripts/prove_move.js
  games/connect4/scripts/prove_move.js
)

for s in "${PROVE_SCRIPTS[@]}"; do
  path="$ZK_ROOT/$s"
  [[ -f "$path" ]] || continue
  base=$(basename "$s" .js)
  base=${base#prove_}
  skip_prove=0
  case "$s" in
    prove_basic_utxo_ownership.js) out="$ZK_ROOT/ownership/basic_utxo_ownership_proof.json" ;;
    prove_script_constraint.js) out="$ZK_ROOT/script_constraints/script_constraint_proof.json" ;;
    prove_pot_split_math.js) out="$ZK_ROOT/pot_split/pot_split_math_proof.json" ;;
    prove_vrf_dice_roll.js) out="$ZK_ROOT/vrf_dice_proof.json" ;;
    prove_vrf_random.js) out="$ZK_ROOT/vrf/vrf_random_proof.json" ;;
    prove_nullifier_set.js) out="$ZK_ROOT/nullifier/nullifier_set_proof.json" ;;
    prove_hash_preimage.js) out="$ZK_ROOT/hash_preimage/hash_preimage_proof.json" ;;
    prove_timelock.js) out="$ZK_ROOT/timelock/timelock_proof.json" ;;
    prove_range_proof.js) out="$ZK_ROOT/range_proof/range_proof_proof.json" ;;
    prove_nullifier_v1.js) out="$ZK_ROOT/nullifier/nullifier_v1_proof.json" ;;
    privacy_mixer/scripts/prove_withdraw.js) out="$ZK_ROOT/privacy_mixer/output/proofs/withdraw_demo.json" ;;
    games/tictactoe/scripts/prove_move.js)
      if ls "$ZK_ROOT/games/tictactoe/output/proofs/"*.json >/dev/null 2>&1; then
        log "  skip prove (tictactoe proofs exist)"
        skip_prove=1
      else
        out="$ZK_ROOT/games/tictactoe/output/proofs/tt_move_4.json"
      fi
      ;;
    games/connect4/scripts/prove_move.js)
      if ls "$ZK_ROOT/games/connect4/output/proofs/"*.json >/dev/null 2>&1; then
        log "  skip prove (connect4 proofs exist)"
        skip_prove=1
      else
        out="$ZK_ROOT/games/connect4/output/proofs/c4_col3.json"
      fi
      ;;
    *) out="$ZK_ROOT/${base}_proof.json" ;;
  esac
  [[ "$skip_prove" -eq 1 ]] && continue
  prove_if_needed "$path" "$out" || true
done

log "=== build_all_circuits_lowpri complete ==="
log "zkeys: $(find "$ZK_ROOT" -name '*.zkey' -not -path '*/node_modules/*' -not -path '*/games/chess/*' | wc -l)"
log "proofs: $(find "$ZK_ROOT" -name '*_proof.json' -not -path '*/node_modules/*' -not -path '*/games/chess/*' | wc -l)"