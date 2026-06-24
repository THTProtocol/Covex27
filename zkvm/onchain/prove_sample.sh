#!/usr/bin/env bash
# Stage 2: produce ONE real RISC0->Groth16 game receipt + the on-chain (KIP-16 tag 0x20) artifacts.
#
# This runs the chess host with COVEX_PROVE_GROTH16=1, which:
#   - proves a decisive chess game with ProverOpts::groth16() (composite STARK -> succinct ->
#     stark2snark wrap via the risczero/risc0-groth16-prover Docker image),
#   - verifies the receipt against the frozen GAMES_GUEST_ID (accept),
#   - confirms a tampered receipt is REJECTED,
#   - converts to the on-chain witness (compressed VK + proof + 5 LE Fr inputs),
#   - writes proof.hex / vk.hex / journal.hex / public_inputs.hex / image_id.hex / manifest.json
#     into zkvm/onchain/samples/.
#
# REQUIREMENTS (the headline operational risk): x86_64 + a RUNNING Docker daemon. The wrap pulls
# risczero/risc0-groth16-prover:v2025-04-03.1 (a few GB) on first run. The 7GB hightable.pro server
# is too small (risks OOMing the live TN12 node); use a dev box with >=12GB free RAM. This script
# was authored to run from the chess workspace on an x86_64 Linux/WSL box with the RISC0 toolchain.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"          # zkvm/onchain
CHESS="$(cd "$HERE/../chess" && pwd)"                          # zkvm/chess (the host workspace)
SAMPLES="$HERE/samples"

export PATH="$HOME/.risc0/bin:$HOME/.cargo/bin:$PATH"
export RISC0_DEV_MODE=0                                        # MUST be a real proof
export COVEX_PROVE_GROTH16=1
export COVEX_SAMPLES_DIR="$SAMPLES"

echo "== preflight =="
uname -m
docker version --format 'docker server {{.Server.Version}}' || { echo "Docker daemon NOT reachable - the stark2snark wrap needs it"; exit 1; }
echo "free RAM:"; free -h | sed -n '1,2p'

echo "== building host (release for speed) =="
( cd "$CHESS" && cargo build --release -p host )

echo "== proving (this is the slow, Docker-backed step) =="
/usr/bin/time -v "$CHESS/target/release/host" 2>&1 || /usr/bin/env time "$CHESS/target/release/host" || "$CHESS/target/release/host"

echo "== artifacts =="
ls -la "$SAMPLES"
