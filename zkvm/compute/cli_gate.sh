#!/usr/bin/env bash
# THE GATE for the covex-compute-prover CLI. Real proofs (RISC0_DEV_MODE=0). Each step prints its
# exit code so we can confirm: prove+verify of a real program (output correct, exit 0); a tampered
# journal is rejected (verify exit != 0); a wrong claimed output fails to prove (exit != 0, no
# receipt); a trapping program fails to prove; the image id printed by prove matches verify's.
set -uo pipefail
. "$HOME/.cargo/env" 2>/dev/null || true
export PATH="$HOME/.risc0/bin:$PATH"
export CARGO_TARGET_DIR="$HOME/covex-zkvm-target"
export RISC0_DEV_MODE=0
export RUST_LOG="${RUST_LOG:-warn}"

REPO=/mnt/c/Users/User/Desktop/Covex/repo/zkvm/compute
cd "$REPO" || exit 1
BIN="$CARGO_TARGET_DIR/release/covex-compute-prover"
OUT=/tmp/covex_compute_gate
mkdir -p "$OUT"

echo "=== rebuild CLI (release) ==="
cargo build --release -p covex-compute-prover 2>&1 | tail -8
echo "BUILD_RC=${PIPESTATUS[0]}"
echo "bin: $BIN"
echo

echo "############ GATE 1: prove a REAL quadratic f(x,y)=x*x+3*y on [5,7]=46 ############"
"$BIN" prove "$REPO/examples/quadratic.json" "$OUT/quad.bin"
echo "PROVE_QUAD_RC=$?"
echo

echo "############ GATE 2: verify that receipt (output must be 46, exit 0) ############"
"$BIN" verify "$OUT/quad.bin"
echo "VERIFY_QUAD_RC=$?"
echo

echo "############ GATE 3: tamper a journal byte, verify MUST reject (exit != 0) ############"
"$BIN" tamper-journal "$OUT/quad.bin" "$OUT/quad_tampered.bin"
echo "TAMPER_MK_RC=$?"
"$BIN" verify "$OUT/quad_tampered.bin"
echo "VERIFY_TAMPERED_RC=$?  (expected NON-zero)"
echo

echo "############ GATE 4: prove a WRONG claimed output must FAIL, no receipt ############"
rm -f "$OUT/wrong.bin"
"$BIN" prove "$REPO/examples/quadratic_wrong_output.json" "$OUT/wrong.bin"
echo "PROVE_WRONG_RC=$?  (expected NON-zero)"
echo "wrong-output receipt written? :"; ls -la "$OUT/wrong.bin" 2>&1 || echo "  (no receipt - correct)"
echo

echo "############ GATE 5: prove + verify the DOT PRODUCT (zkML primitive), output 32 ############"
"$BIN" prove "$REPO/examples/dot_product.json" "$OUT/dot.bin"
echo "PROVE_DOT_RC=$?"
"$BIN" verify "$OUT/dot.bin"
echo "VERIFY_DOT_RC=$?"
echo

echo "############ GATE 6: prove + verify the THRESHOLD predicate, output 1 ############"
"$BIN" prove "$REPO/examples/threshold_predicate.json" "$OUT/pred.bin"
echo "PROVE_PRED_RC=$?"
"$BIN" verify "$OUT/pred.bin"
echo "VERIFY_PRED_RC=$?"
echo

echo "############ GATE 7: prove + verify the HASH CHAIN (depth 4) ############"
"$BIN" prove "$REPO/examples/hash_chain.json" "$OUT/chain.bin"
echo "PROVE_CHAIN_RC=$?"
"$BIN" verify "$OUT/chain.bin"
echo "VERIFY_CHAIN_RC=$?"
echo

echo "############ GATE 8: image id printed by prove == image id verify checks ############"
ID_PROVE=$("$BIN" prove "$REPO/examples/quadratic.json" "$OUT/quad2.bin" 2>/dev/null | grep -m1 'image id' | tr -d ' ')
ID_VERIFY=$("$BIN" verify "$OUT/quad2.bin" 2>/dev/null | grep -m1 'image id' | tr -d ' ')
echo "prove  image id line: $ID_PROVE"
echo "verify image id line: $ID_VERIFY"
if [ "$ID_PROVE" = "$ID_VERIFY" ] && [ -n "$ID_PROVE" ]; then echo "IMAGE_ID_MATCH=yes"; else echo "IMAGE_ID_MATCH=no"; fi
echo

echo "GATE_DONE"
