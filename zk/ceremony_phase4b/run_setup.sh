#!/usr/bin/env bash
. "$HOME/.cargo/env" 2>/dev/null
cd /root/Covex27/zk
SNARKJS="node node_modules/snarkjs/build/cli.cjs"
PTAU="ceremony_phase4b/pot16_final.ptau"
ENTROPY="covex-phase4b-dev-ceremony-$(date +%s)-$RANDOM-single-contributor"
LOG=ceremony_phase4b/setup_run.log
echo "START $(date)" > $LOG
setup_one() {
  local R1CS="$1" OUTDIR="$2" NAME="$3" VKEY_OUT="$4"
  echo "=== setup $NAME $(date) ===" >> $LOG
  $SNARKJS groth16 setup "$R1CS" "$PTAU" "$OUTDIR/${NAME}_0000.zkey" >> $LOG 2>&1
  echo "  setup rc=$? $(date)" >> $LOG
  $SNARKJS zkey contribute "$OUTDIR/${NAME}_0000.zkey" "$OUTDIR/${NAME}_final.zkey" --name="covex-dev-phase4b-${NAME}" -e="$ENTROPY-$NAME" >> $LOG 2>&1
  echo "  contribute rc=$? $(date)" >> $LOG
  $SNARKJS zkey export verificationkey "$OUTDIR/${NAME}_final.zkey" "$VKEY_OUT" >> $LOG 2>&1
  echo "  vkey rc=$? -> $VKEY_OUT" >> $LOG
}
setup_one "games/tictactoe/output/tictactoe_v1.r1cs" "games/tictactoe/output" "tictactoe_v1" "tictactoe_v1_vkey.json"
setup_one "games/connect4/output/connect4_v1.r1cs" "games/connect4/output" "connect4_v1" "connect4_v1_vkey.json"
setup_one "privacy_mixer/output/privacy_mixer_v1.r1cs" "privacy_mixer/output" "privacy_mixer_v1" "privacy_mixer_v1_vkey.json"
echo "ALL_DONE $(date)" >> $LOG
