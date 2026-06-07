#!/bin/bash
# Covex Dev Ceremony & Artifact Harness (Sprint 1+)
# Generates dev zkeys using pot10_final.ptau for all circuits that have r1cs.
# These are **developer only**. Production requires real multi-party MPC.
# See docs/RANGE_PROOF_CEREMONY.md and vision for honest status.

set -e
cd "$(dirname "$0")"

echo "=== Covex Dev Ceremony Harness (Sprint 1) ==="
echo "Using pot10_final.ptau (dev only - NOT production MPC)"
echo ""

# 1. Compile any missing .circom that don't have r1cs yet
echo "[1/4] Compiling missing custom circuits..."
for f in *.circom; do
  base=${f%.circom}
  if [ ! -f "${base}.r1cs" ]; then
    echo "  Compiling $f ..."
    (circom2 "$f" --r1cs --wasm -o . 2>&1 | tail -3) || echo "  (skipped or failed - may need manual circom2)"
  fi
done

# 2. Generate dev zkeys + vkeys for every .r1cs that is missing a .zkey
echo ""
echo "[2/4] Generating dev zkeys + vkeys (using pot10_final.ptau)..."
COUNT=0
for r1cs in *.r1cs; do
  base=${r1cs%.r1cs}
  if [ ! -f "${base}.zkey" ]; then
    echo "  Setup dev zkey for $base ..."
    if ./node_modules/.bin/snarkjs groth16 setup "$r1cs" ./pot10_final.ptau "${base}.zkey" > /dev/null 2>&1; then
      ./node_modules/.bin/snarkjs zkey export verificationkey "${base}.zkey" "${base}_vkey.json" > /dev/null 2>&1 || true
      COUNT=$((COUNT+1))
      echo "    -> ${base}.zkey + ${base}_vkey.json created (DEV)"
    else
      echo "    -> FAILED (circuit too large for this dev ptau or missing deps)"
    fi
  fi
done
echo "  New dev zkeys created in this run: $COUNT"

# 3. Generate real proofs for circuits that have prove_*.js and .zkey but no _proof.json
echo ""
echo "[3/4] Generating real proofs where prove scripts + zkeys exist..."
PROOF_COUNT=0
for prove_script in prove_*.js; do
  base=${prove_script#prove_}
  base=${base%.js}
  if [ -f "${base}.zkey" ] && [ ! -f "${base}_proof.json" ]; then
    echo "  Proving $base ..."
    if node "$prove_script" > /dev/null 2>&1; then
      if [ -f "${base}_proof.json" ]; then
        PROOF_COUNT=$((PROOF_COUNT+1))
        echo "    -> ${base}_proof.json generated"
      fi
    else
      echo "    -> prove script ran but no proof produced (may need inputs)"
    fi
  fi
done
echo "  New real proofs generated: $PROOF_COUNT"

# 4. Summary + honesty note
echo ""
echo "[4/4] Summary"
echo "  Total .zkey files now: $(ls -1 *.zkey 2>/dev/null | wc -l)"
echo "  Total *_proof.json (real + fixtures): $(ls -1 *_proof.json 2>/dev/null | wc -l)"
echo ""
echo "=== IMPORTANT (Honest) ==="
echo "All zkeys above were created with pot10_final.ptau (single-contributor dev setup)."
echo "This is NOT a production MPC. See docs/RANGE_PROOF_CEREMONY.md for how to do real ceremonies."
echo "For high-value mainnet covenants, replace with transcripts from independent contributors."
echo ""
echo "Sprint 1 ceremony work complete for this run."
echo "Run this script again after adding new .circom to keep artifacts fresh."
