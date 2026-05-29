#!/bin/bash
#
# Simple helper to submit the bundled Merkle proof to the live oracle.
# This is for testing and development only.

set -euo pipefail

PROOF_FILE="${1:-../../zk/merkle_proof.json}"
COVENANT_ID="${2:-example-covenant-001}"

if [ ! -f "$PROOF_FILE" ]; then
    echo "Proof file not found: $PROOF_FILE"
    exit 1
fi

echo "Submitting proof from $PROOF_FILE to oracle for covenant $COVENANT_ID..."

curl -s -X POST https://hightable.pro/api/oracle/verify-and-sign \
  -H "Content-Type: application/json" \
  -d @- <<EOF | jq .
{
  "covenant_id": "$COVENANT_ID",
  "circuit_type": "merkle_membership",
  "proof": $(cat "$PROOF_FILE" | jq '.proof'),
  "public_inputs": $(cat "$PROOF_FILE" | jq '.publicSignals')
}
EOF
