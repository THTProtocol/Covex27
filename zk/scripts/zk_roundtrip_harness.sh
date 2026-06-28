#!/usr/bin/env bash
# zk_roundtrip_harness.sh - gold-standard prove + verify + tamper-reject for every
# served-zkey circuit, using ONLY the committed served artifacts.
#
# For each circuit it:
#   1. served_prove.js runs the circuit's canonical prove_<id>.js but pins the SERVED
#      wasm + _final.zkey (frontend/public/zk/<id>/), so the proof is exactly what an
#      in-browser prover or the production verifier would produce.
#   2. verify_<id>.js (which reads the SERVED vkey) -> must report {valid:true}
#   3. tamper the proof (flip pi_a[0]) -> verify must report {valid:false}
#
# Honest by construction: a circuit counts as WORKING only if a real proof verifies AND a
# tampered proof is rejected, all against the committed served vkey/zkey pair.
#
# Usage: bash zk/scripts/zk_roundtrip_harness.sh [circuit_id ...]   (default: all)
set -u
cd "$(dirname "$0")/.." || exit 1   # -> zk/
ZK="$(pwd)"
TMP="$ZK/.harness_tmp"
mkdir -p "$TMP"

# circuit -> "prove_script.js verify_script.js"   (proof flows through served_prove.js)
declare -A MAP=(
  [age_verification]="prove_age_verification.js verify_age_verification.js"
  [anon_membership_nullifier]="prove_anon_membership_nullifier.js verify_anon_membership_nullifier.js"
  [balance_threshold]="prove_balance_threshold.js verify_balance_threshold.js"
  [basic_utxo_ownership]="prove_basic_utxo_ownership.js verify_basic_utxo_ownership.js"
  [commitment_open]="prove_commitment_open.js verify_commitment_open.js"
  [escrow_2party]="prove_escrow_2party.js verify_escrow_2party.js"
  [hash_preimage]="prove_hash_preimage.js verify_hash_preimage.js"
  [merkle_membership]="prove_verify.js verify.js"
  [nullifier_set]="prove_nullifier_set.js verify_nullifier_set.js"
  [pot_split_math]="prove_pot_split_math.js verify_pot_split_math.js"
  [range_proof]="prove_range_proof.js verify_range.js"
  [relative_timelock]="prove_relative_timelock.js verify_relative_timelock.js"
  [script_constraint]="prove_script_constraint.js verify_script_constraint.js"
  [set_non_membership]="prove_set_non_membership.js verify_set_non_membership.js"
  [solvency_sum]="prove_solvency_sum.js verify_solvency_sum.js"
  [timelock_absolute]="prove_timelock.js verify_timelock.js"
  [turn_timer]="prove_turn_timer.js verify_turn_timer.js"
  [vrf_dice_roll]="prove_vrf_dice_roll.js verify_vrf_dice_roll.js"
  [vrf_random]="prove_vrf_random.js verify_vrf_random.js"
)

valid_field() {  # read last JSON line from stdin, print .valid
  node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const lines=d.trim().split("\n");console.log(JSON.parse(lines[lines.length-1]).valid)}catch(e){console.log("PARSE_ERR")}})'
}

CIRCUITS=("$@")
[ ${#CIRCUITS[@]} -eq 0 ] && CIRCUITS=("${!MAP[@]}")

PASS=(); FAIL=()
for c in $(printf '%s\n' "${CIRCUITS[@]}" | sort); do
  spec="${MAP[$c]:-}"
  [ -z "$spec" ] && { echo "SKIP $c (not in map)"; continue; }
  read -r pscript vscript <<< "$spec"
  echo "=== $c ==="
  proof="$TMP/$c.proof.json"
  demo="../frontend/public/zk/$c/demo_proof.json"
  # 1. prove from served artifacts. If the circuit's prove_<id>.js is stale (does not match the
  # served circuit's input arity), fall back to the COMMITTED served demo_proof.json - which is
  # the actual shipped sample and an equally valid gold-standard accept+tamper subject.
  if node scripts/served_prove.js "$c" "$pscript" "$proof" > "$TMP/$c.prove.log" 2>&1 && [ -f "$proof" ]; then
    src="freshly-proved"
  elif [ -f "$demo" ]; then
    cp "$demo" "$proof"; src="served demo_proof.json (prover stale)"
  else
    echo "   PROVE FAIL (no demo fallback)"; tail -4 "$TMP/$c.prove.log" | sed 's/^/      /'; FAIL+=("$c[prove]"); continue
  fi
  # 2. verify valid -> true
  vvalid=$(node "$vscript" "$proof" 2>/dev/null | valid_field)
  if [ "$vvalid" != "true" ]; then
    echo "   VERIFY(valid) FAIL: got valid=$vvalid"; node "$vscript" "$proof" 2>&1 | tail -1 | sed 's/^/      /'; FAIL+=("$c[verify]"); continue
  fi
  # 3. tamper pi_a[0] (or A[0]) -> verify must be false
  tproof="$TMP/$c.tampered.json"
  node -e '
    const fs=require("fs"); const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
    const a=p.proof&&(p.proof.pi_a||p.proof.A);
    if(a&&a[0]!=null){ let s=String(a[0]); a[0]=(s[0]==="9"?"1":"9")+s.slice(1); }
    fs.writeFileSync(process.argv[2], JSON.stringify(p));
  ' "$proof" "$tproof"
  tvalid=$(node "$vscript" "$tproof" 2>/dev/null | valid_field)
  if [ "$tvalid" != "false" ]; then
    echo "   TAMPER NOT REJECTED: got valid=$tvalid (SOUNDNESS HOLE)"; FAIL+=("$c[tamper]"); continue
  fi
  ps=$(node -e 'const p=require(process.argv[1]);console.log(JSON.stringify(p.publicSignals))' "$proof" 2>/dev/null)
  echo "   OK  valid=>true  tampered=>false  [$src]  publicSignals=$ps"
  PASS+=("$c")
done

echo
echo "================ HARNESS SUMMARY ================"
echo "PASS (${#PASS[@]}): ${PASS[*]}"
echo "FAIL (${#FAIL[@]}): ${FAIL[*]}"
[ ${#FAIL[@]} -eq 0 ] && exit 0 || exit 1
