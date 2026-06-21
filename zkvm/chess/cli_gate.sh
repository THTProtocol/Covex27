#!/usr/bin/env bash
# THE GATE for the covex-games-prover CLI. Real proofs (RISC0_DEV_MODE=0). Each step prints its
# exit code so we can confirm: prove+verify of a real game (winner correct, exit 0); a tampered
# journal is rejected (verify exit != 0); an illegal move fails to prove (exit != 0, no receipt);
# the image id printed by prove matches the one verify checks.
set -uo pipefail
. "$HOME/.cargo/env" 2>/dev/null || true
export PATH="$HOME/.risc0/bin:$PATH"
export CARGO_TARGET_DIR="$HOME/covex-zkvm-target"
export RISC0_DEV_MODE=0
export RUST_LOG="${RUST_LOG:-warn}"

REPO=/mnt/c/Users/User/Desktop/Covex/repo/zkvm/chess
cd "$REPO" || exit 1
BIN="$CARGO_TARGET_DIR/release/covex-games-prover"
OUT=/tmp/covex_cli_gate
mkdir -p "$OUT"

echo "=== rebuild CLI (release) ==="
cargo build --release -p covex-games-prover 2>&1 | tail -8
echo "BUILD_RC=${PIPESTATUS[0]}"
echo "bin: $BIN"
echo

echo "############ GATE 1: prove a REAL chess checkmate ############"
"$BIN" prove "$REPO/examples/chess_checkmate.json" "$OUT/chess.bin"
echo "PROVE_CHESS_RC=$?"
echo

echo "############ GATE 2: verify that receipt (winner must be P1, exit 0) ############"
"$BIN" verify "$OUT/chess.bin"
echo "VERIFY_CHESS_RC=$?"
echo

echo "############ GATE 3: tamper a journal byte, verify MUST reject (exit != 0) ############"
"$BIN" tamper-journal "$OUT/chess.bin" "$OUT/chess_tampered.bin"
echo "TAMPER_MK_RC=$?"
"$BIN" verify "$OUT/chess_tampered.bin"
echo "VERIFY_TAMPERED_RC=$?  (expected NON-zero)"
echo

echo "############ GATE 4: prove an ILLEGAL move must FAIL, no receipt ############"
rm -f "$OUT/illegal.bin"
"$BIN" prove "$REPO/examples/chess_illegal.json" "$OUT/illegal.bin"
echo "PROVE_ILLEGAL_RC=$?  (expected NON-zero)"
echo "illegal receipt written? :"; ls -la "$OUT/illegal.bin" 2>&1 || echo "  (no receipt - correct)"
echo

echo "############ GATE 5: prove + verify a REAL blackjack hand (P1 wins) ############"
"$BIN" prove "$REPO/examples/blackjack_player_win.json" "$OUT/blackjack.bin"
echo "PROVE_BJ_RC=$?"
"$BIN" verify "$OUT/blackjack.bin"
echo "VERIFY_BJ_RC=$?"
echo

echo "############ GATE 6: image id printed by prove == image id verify checks ############"
ID_PROVE=$("$BIN" prove "$REPO/examples/chess_checkmate.json" "$OUT/chess2.bin" 2>/dev/null | grep -m1 'image id' | tr -d ' ' )
ID_VERIFY=$("$BIN" verify "$OUT/chess2.bin" 2>/dev/null | grep -m1 'image id' | tr -d ' ')
echo "prove  image id line: $ID_PROVE"
echo "verify image id line: $ID_VERIFY"
if [ "$ID_PROVE" = "$ID_VERIFY" ] && [ -n "$ID_PROVE" ]; then echo "IMAGE_ID_MATCH=yes"; else echo "IMAGE_ID_MATCH=no"; fi
echo

echo "GATE_DONE"
