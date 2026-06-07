#!/usr/bin/env bash
# finish_phase2.sh — export vkey, prove demo move, verify (run after chess_v1.zkey exists)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
OUT="$ROOT/games/chess/output"
SNARKJS="$ROOT/node_modules/.bin/snarkjs"
ZKEY="$OUT/chess_v1.zkey"
VKEY_OUT="$OUT/chess_v1_vkey.json"
VKEY_REPO="$ROOT/chess_v1_vkey.json"

if [ ! -f "$ZKEY" ]; then
  echo "ERROR: $ZKEY not found — wait for groth16 setup to finish"
  exit 1
fi

echo "[1/4] Export verification key..."
"$SNARKJS" zkey export verificationkey "$ZKEY" "$VKEY_OUT"
cp "$VKEY_OUT" "$VKEY_REPO"
echo "      vkey: $VKEY_REPO"

echo "[2/4] Generate demo proof (e2e4: sq 12 -> 28)..."
cd "$ROOT/games/chess"
node scripts/prove_move.js 12 28

PROOF="$OUT/proofs/move_12_28.json"

echo "[3/4] Local Groth16 verify..."
node "$ROOT/verify_chess.js" "$PROOF"

echo "[4/4] Phase 2 artifacts ready."
echo "Next: flip chess_v1 to full-zk in CovexTerminal.jsx, commit, deploy."