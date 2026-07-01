#!/usr/bin/env bash
# GATE: the frozen on-chain-ZK guest image id must match the live guest compile.
#
# The settlement covenant for the KIP-16 OpZkPrecompile games path PINS one guest image id on-chain
# (via the verifying key the witness carries). The backend ships that image id as a frozen LITERAL in
# zkvm/onchain/src/lib.rs (GAMES_GUEST_ID). If the RISC0 guest source OR the RISC0 toolchain changes,
# the compiled image id drifts away from that literal. A drifted guest would produce receipts that
# pass the prover's OWN self-verify but get REJECTED on-chain by every deployed covenant (the chain
# pins the old image id) - silently bricking the games payout path until the literal is re-frozen and
# the covenants are redeployed.
#
# This script runs the existing `image_id_matches_methods` dev-test in the `covex-games-onchain`
# crate, which re-derives the image id from a fresh guest compile and asserts it equals the frozen
# literal. It does NOT edit any zkvm source; it only RUNS the check. A failure means: re-freeze
# GAMES_GUEST_ID and redeploy any live ZkGameSettle covenant.
#
# REQUIREMENTS: the RISC0 guest toolchain (rzup / `cargo risczero`) must be installed, because the
# test pulls the `methods` crate whose build.rs runs `risc0_build::embed_methods()` (a guest compile).
# This does NOT need Docker or proving (no stark2snark), only the guest *compile*, so it is light
# enough for CI once the toolchain is present. The pin was last frozen under RISC0 1.94.1 /
# risc0-zkvm 3.0.5; use that toolchain so a toolchain bump does not masquerade as a source drift.
#
#   bash scripts/check-zk-image-id.sh
#
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

ONCHAIN_DIR="zkvm/onchain"
if [ ! -f "$ONCHAIN_DIR/Cargo.toml" ]; then
  echo "ERROR: $ONCHAIN_DIR/Cargo.toml not found (run from the repo root)"
  exit 2
fi

# Make the RISC0 toolchain visible if it is installed in the usual location.
export PATH="$HOME/.risc0/bin:$HOME/.cargo/bin:$PATH"

if ! command -v cargo >/dev/null 2>&1; then
  echo "ERROR: cargo is not on PATH; install the Rust + RISC0 toolchain first (see prover-service/README.md)"
  exit 2
fi

# rzup / the risc0 guest toolchain is required for the methods build.rs guest compile. Warn clearly if
# it is missing rather than emitting a confusing build error deep in risc0-build.
if ! command -v rzup >/dev/null 2>&1 && ! cargo risczero --version >/dev/null 2>&1; then
  echo "ERROR: the RISC0 guest toolchain (rzup / 'cargo risczero') was not found."
  echo "       The image-id check compiles the guest, which needs it. Install with:"
  echo "         curl -L https://risczero.com/install | bash && rzup install"
  echo "       (the pin was frozen under RISC0 1.94.1 / risc0-zkvm 3.0.5)."
  exit 2
fi

echo "== running image_id_matches_methods (re-derives the guest image id and asserts it equals the frozen GAMES_GUEST_ID literal) =="
# The onchain crate is NOT part of a root workspace: cargo must run from zkvm/onchain or
# `-p covex-games-onchain` cannot resolve a manifest (the original invocation ran at the repo
# root, so every run failed with "could not find Cargo.toml" and the old error handling then
# misreported that infrastructure failure as an image-id drift).
cd "$ONCHAIN_DIR"

# --release matches how the constant was frozen; the test compiles the guest via the methods dev-dep.
# Capture output so a real assertion failure (drift) can be told apart from an infrastructure
# failure (toolchain missing, network, disk). A gate that reports infra noise as DRIFT trains
# people to ignore the one alarm that guards the on-chain payout path.
set +e
TEST_OUT=$(cargo test --release -p covex-games-onchain image_id_matches_methods -- --nocapture 2>&1)
TEST_STATUS=$?
set -e
echo "$TEST_OUT" | tail -40

if [ "$TEST_STATUS" -eq 0 ]; then
  echo ""
  echo "OK: the frozen GAMES_GUEST_ID matches the live guest compile (no drift)."
elif echo "$TEST_OUT" | grep -qE "assertion.*failed|test image_id_matches_methods.*FAILED|panicked at"; then
  echo ""
  echo "FAIL: GAMES_GUEST_ID DRIFTED from the compiled guest image id."
  echo "      The on-chain-ZK games path pins this image id; a drift means receipts the prover"
  echo "      produces would be REJECTED on-chain. You must:"
  echo "        1. re-freeze the GAMES_GUEST_ID literal in zkvm/onchain/src/lib.rs to the new value,"
  echo "        2. REDEPLOY any live ZkGameSettle covenant (the old covenant pins the old image id),"
  echo "        3. update COVEX_PROVER_IMAGE_ID on the backend to the new hex."
  exit 1
else
  echo ""
  echo "ERROR: the image-id check could not run (cargo exit $TEST_STATUS was not a test assertion)."
  echo "       This is an infrastructure failure (toolchain / network / manifest), NOT a drift"
  echo "       verdict. Fix the environment and re-run; do not re-freeze anything off this result."
  exit 2
fi
