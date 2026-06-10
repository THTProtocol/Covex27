#!/usr/bin/env bash
# Copy working ZK vkeys + demo proofs to frontend/public/zk for browser + hightable deploy.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
ZK="$REPO/zk"
PUB="$REPO/frontend/public/zk"
mkdir -p "$PUB"

copy_pair() {
  local id="$1" vkey="$2" proof="$3"
  local dir="$PUB/$id"
  mkdir -p "$dir"
  if [[ -f "$vkey" ]]; then
    cp -f "$vkey" "$dir/${id}_vkey.json"
  fi
  if [[ -f "$proof" ]]; then
    cp -f "$proof" "$dir/demo_proof.json"
  fi
}

# Core full-zk
copy_pair merkle_membership "$ZK/merkle_membership_vkey.json" "$ZK/merkle_proof.json"
copy_pair range_proof "$ZK/range_proof/range_proof_vkey.json" "$ZK/range_proof/range_proof_proof.json"
copy_pair age_verification "$ZK/age_verification_vkey.json" "$ZK/age_verification_proof.json"
copy_pair escrow_2party "$ZK/escrow_2party_vkey.json" "$ZK/escrow_2party_proof.json"
copy_pair hash_preimage "$ZK/hash_preimage_vkey.json" "$ZK/hash_preimage/hash_preimage_proof.json"
copy_pair timelock_absolute "$ZK/timelock_absolute_vkey.json" "$ZK/timelock/timelock_proof.json"
copy_pair tictactoe_v1 "$ZK/tictactoe_v1_vkey.json" "$ZK/games/tictactoe/output/proofs/tt_move_4.json"
copy_pair connect4_v1 "$ZK/connect4_v1_vkey.json" "$ZK/games/connect4/output/proofs/c4_col3.json"
copy_pair privacy_mixer_v1 "$ZK/privacy_mixer_v1_vkey.json" "$ZK/privacy_mixer/output/proofs/withdraw_demo.json"

# Phase 1 Kaspa
copy_pair basic_utxo_ownership "$ZK/basic_utxo_ownership_vkey.json" "$ZK/ownership/basic_utxo_ownership_proof.json"
copy_pair script_constraint "$ZK/script_constraint_vkey.json" "$ZK/script_constraints/script_constraint_proof.json"
copy_pair relative_timelock "$ZK/relative_timelock_vkey.json" "$ZK/relative_timelock_proof.json"
copy_pair vrf_dice_roll "$ZK/vrf_dice_roll_vkey.json" "$ZK/vrf_dice_proof.json"
copy_pair vrf_random "$ZK/vrf_random_vkey.json" "$ZK/vrf/vrf_random_proof.json"
copy_pair nullifier_set "$ZK/nullifier_set_vkey.json" "$ZK/nullifier/nullifier_set_proof.json"
copy_pair pot_split_math "$ZK/pot_split_math_vkey.json" "$ZK/pot_split/pot_split_math_proof.json"
copy_pair turn_timer "$ZK/turn_timer_vkey.json" "$ZK/turn_timer_proof.json"
copy_pair nullifier_v1 "$ZK/nullifier/nullifier_v1_vkey.json" "$ZK/nullifier/nullifier_v1_proof.json"

# DeFi / on-chain
copy_pair collateral_liquidation "$ZK/collateral_liquidation_vkey.json" "$ZK/collateral_liquidation_proof.json"
copy_pair onchain_sig_verify "$ZK/onchain_sig_verify_vkey.json" "$ZK/onchain_sig_verify_proof.json"
copy_pair black_scholes_approx "$ZK/black_scholes_approx_vkey.json" "$ZK/black_scholes_proof.json"
copy_pair financial_formula "$ZK/financial_formula_vkey.json" "$ZK/financial_formula_proof.json"
copy_pair loan_health "$ZK/loan_health_vkey.json" "$ZK/loan_health_proof.json"
copy_pair collateral_ltv "$ZK/collateral_ltv_vkey.json" "$ZK/collateral_ltv_proof.json"
copy_pair auction_clearing "$ZK/auction_clearing_vkey.json" "$ZK/auction_clearing_proof.json"
copy_pair poker_vrf_deal "$ZK/poker_vrf_deal_vkey.json" "$ZK/poker_vrf_deal_proof.json"
copy_pair poker_equity "$ZK/poker_equity_vkey.json" "$ZK/poker_equity_proof.json"
copy_pair ml_inference_stub "$ZK/ml_inference_stub_vkey.json" "$ZK/ml_inference_stub_proof.json"
copy_pair private_transfer_nullifier "$ZK/private_transfer_nullifier_vkey.json" "$ZK/private_transfer_nullifier_proof.json"
copy_pair chess_ai_move "$ZK/chess_ai_move_vkey.json" "$ZK/chess_ai_move_proof.json"

# Feeds / gating / compute stubs with real dev proofs
copy_pair election_feed "$ZK/election_feed_vkey.json" "$ZK/election_feed_proof.json"
copy_pair weather_feed "$ZK/weather_feed_vkey.json" "$ZK/weather_feed_proof.json"
copy_pair sorting_proof "$ZK/sorting_proof_vkey.json" "$ZK/sorting_proof_proof.json"
copy_pair multi_sig_gating "$ZK/multi_sig_gating_vkey.json" "$ZK/multi_sig_gating_proof.json"
copy_pair anon_credential "$ZK/anon_credential_vkey.json" "$ZK/anon_credential_proof.json"
copy_pair verifiable_poker_solver "$ZK/verifiable_poker_solver_vkey.json" "$ZK/verifiable_poker_solver_proof.json"

# Legacy paths (keep existing merkle/range wasm+zkey in place)
[[ -f "$PUB/merkle_membership/merkle_membership_vkey.json" ]] || true
[[ -f "$PUB/range_proof/range_proof_vkey.json" ]] || cp -f "$ZK/range_proof/range_proof_vkey.json" "$PUB/range_proof/" 2>/dev/null || true

# Manifest for frontend / ops
python3 - <<'PY' "$PUB/manifest.json"
import json, sys, os, glob
pub = os.path.dirname(sys.argv[1])
entries = []
for d in sorted(glob.glob(os.path.join(pub, "*/"))):
    cid = os.path.basename(d.rstrip("/"))
    vkey = os.path.join(d, f"{cid}_vkey.json")
    demo = os.path.join(d, "demo_proof.json")
    if os.path.isfile(vkey):
        entries.append({
            "id": cid,
            "vkey": f"/zk/{cid}/{cid}_vkey.json",
            "demo_proof": f"/zk/{cid}/demo_proof.json" if os.path.isfile(demo) else None,
            "artifacts": True,
        })
with open(sys.argv[1], "w") as f:
    json.dump({"circuits": entries, "count": len(entries)}, f, indent=2)
    f.write("\n")
print(f"manifest: {len(entries)} circuits")
PY

echo "synced $(find "$PUB" -name '*_vkey.json' | wc -l) vkeys to $PUB"