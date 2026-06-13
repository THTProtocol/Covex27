#!/usr/bin/env bash
# build_live_keys.sh - generate LIVE Groth16 proving + verifying keys for EVERY
# Covex circuit that has a compiled r1cs, using the existing powers-of-tau
# ceremonies (pot10 for <=1024 constraints, pot16 for the few larger ones).
#
# Output is server-only and gitignored (keys are regenerated like node_modules):
#   <circuit_dir>/<name>_final.zkey   proving key
#   <circuit_dir>/<name>_vkey.json    verifying key
# plus shotgun copies into the zk/ root (<name>.zkey, <name>_final.zkey,
# <name>_vkey.json) so every prove_*.js / verify_*.js path convention is satisfied.
#
# Idempotent: re-running overwrites. A circuit whose setup fails is reported and
# skipped (the verifier then stays fail-closed for it - never a fake pass).
set -uo pipefail
cd "$(dirname "$0")" # zk/
SNARKJS="node node_modules/.bin/snarkjs"
POT_SMALL="pot10_final.ptau" # 2^10 = 1024 constraints
POT_BIG="pot16_final.ptau"   # 2^16 = 65536 constraints
ENTROPY="covex-live-keys-$(date +%s)"

if [ ! -f "$POT_SMALL" ]; then echo "FATAL: missing $POT_SMALL"; exit 1; fi
if [ ! -f "$POT_BIG" ]; then echo "WARN: missing $POT_BIG (large circuits will fail)"; fi

ok=0; fail=0; skipped=0; failed_names=""
mapfile -t R1CS < <(find . -path ./node_modules -prune -o -name "*.r1cs" -print | sed 's|^\./||' | sort -u)

setup_one() {
  local r="$1" ptau="$2" N="$3" D="$4"
  $SNARKJS groth16 setup "$r" "$ptau" "/tmp/${N}_0000.zkey" >/dev/null 2>&1 \
    && $SNARKJS zkey contribute "/tmp/${N}_0000.zkey" "$D/${N}_final.zkey" -e="$ENTROPY-$N" -n="covex" >/dev/null 2>&1 \
    && $SNARKJS zkey export verificationkey "$D/${N}_final.zkey" "$D/${N}_vkey.json" >/dev/null 2>&1
}

for r in "${R1CS[@]}"; do
  N="$(basename "$r" .r1cs)"
  D="$(dirname "$r")"
  C="$($SNARKJS r1cs info "$r" 2>/dev/null | grep -i 'of Constraints' | grep -oE '[0-9]+' | head -1)"
  if [ -z "$C" ]; then echo "SKIP $N (no constraint info)"; skipped=$((skipped+1)); continue; fi
  if [ "$C" -le 1024 ]; then PTAU="$POT_SMALL"; else PTAU="$POT_BIG"; fi
  echo "== $N ($C constraints) via $PTAU =="
  if setup_one "$r" "$PTAU" "$N" "$D"; then :;
  elif [ "$PTAU" = "$POT_SMALL" ] && [ -f "$POT_BIG" ] && setup_one "$r" "$POT_BIG" "$N" "$D"; then
    echo "  (retried with $POT_BIG)";
  else
    echo "  FAIL $N"; fail=$((fail+1)); failed_names="$failed_names $N"; rm -f "/tmp/${N}_0000.zkey"; continue
  fi
  cp -f "$D/${N}_final.zkey" "./${N}.zkey" 2>/dev/null || true
  cp -f "$D/${N}_final.zkey" "./${N}_final.zkey" 2>/dev/null || true
  cp -f "$D/${N}_vkey.json" "./${N}_vkey.json" 2>/dev/null || true
  rm -f "/tmp/${N}_0000.zkey"
  echo "  OK -> $D/${N}_final.zkey + ${N}_vkey.json"
  ok=$((ok+1))
done

echo "============================================================"
echo "DONE: ok=$ok fail=$fail skipped=$skipped"
[ -n "$failed_names" ] && echo "FAILED:$failed_names"
echo "Live vkeys in zk/ root:"; ls -1 *_vkey.json 2>/dev/null | wc -l
