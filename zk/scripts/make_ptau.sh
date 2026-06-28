#!/usr/bin/env bash
# make_ptau.sh <power> - generate a powers-of-tau file pot<power>_final.ptau for the BN128 curve
# via snarkjs (new -> contribute -> prepare phase2). Single-contributor Covex DEV ceremony, NOT a
# production MPC (same honesty caveat as every other key in this suite).
#
#   bash zk/scripts/make_ptau.sh 12     # -> zk/pot12_final.ptau (covers <= 4096 constraints)
set -euo pipefail
P="$1"
cd "$(dirname "$0")/.."          # -> zk/
ZK="$(pwd)"
SNARKJS="node $ZK/node_modules/snarkjs/build/cli.cjs"
OUT="$ZK/pot${P}_final.ptau"
[ -f "$OUT" ] && { echo "$OUT already exists"; exit 0; }

$SNARKJS powersoftau new bn128 "$P" "$ZK/pot${P}_0.ptau" -v
$SNARKJS powersoftau contribute "$ZK/pot${P}_0.ptau" "$ZK/pot${P}_1.ptau" \
  --name="covex-dev-ptau-$P" -e="covex zkwave ptau$P $(date +%s) single-contributor dev ceremony" -v
$SNARKJS powersoftau prepare phase2 "$ZK/pot${P}_1.ptau" "$OUT" -v
rm -f "$ZK/pot${P}_0.ptau" "$ZK/pot${P}_1.ptau"
echo "wrote $OUT"
ls -la "$OUT"
