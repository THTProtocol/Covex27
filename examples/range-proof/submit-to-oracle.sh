#!/bin/bash
#
# Range Proof — Oracle Submission Helper (Phase 9 Foundation)
#
# This script is a placeholder. It will only succeed with a useful signature
# AFTER the full range_proof zkey + verify_range.js have been added to the oracle.
#
# As of end of Phase 9 the oracle will return a clear explanatory error.
#
# Usage:
#   ./submit-to-oracle.sh [path/to/proof.json] [covenant-id]
#

set -euo pipefail

PROOF_FILE="${1:-../../zk/range_proof/range_proof_proof.json}"
COVENANT_ID="${2:-range-proof-demo-001}"

if [ ! -f "$PROOF_FILE" ]; then
    echo "WARNING: Proof file not found at $PROOF_FILE"
    echo "You must generate it first using zk/prove_range_proof.js (once artifacts exist)."
    echo "Continuing with a dummy payload so you can see the exact oracle response..."
    # Provide a structurally valid but meaningless payload so the error path is exercised
    PROOF_JSON='{"pi_a":["0","0","0"],"pi_b":[["0","0"],["0","0"],["0","0"]],"pi_c":["0","0","0"]}'
    PUBLIC_JSON='["123456789","100","500","0"]'
else
    PROOF_JSON=$(cat "$PROOF_FILE" | jq '.proof')
    PUBLIC_JSON=$(cat "$PROOF_FILE" | jq '.publicSignals')
fi

echo "=== Phase 9 Range Proof — Submitting to oracle ==="
echo "Covenant: $COVENANT_ID"
echo "Proof file: $PROOF_FILE (may be placeholder)"
echo ""

curl -s -X POST https://hightable.pro/api/oracle/verify-and-sign \
  -H "Content-Type: application/json" \
  -d @- <<EOF | jq .
{
  "covenant_id": "$COVENANT_ID",
  "circuit_type": "range_proof",
  "proof": $PROOF_JSON,
  "public_inputs": $PUBLIC_JSON,
  "requested_outcome": 0
}
EOF

echo ""
echo "=== Expected (until full artifacts wired) ==="
echo "You should see an error containing: 'Range proof verification is not yet wired in the oracle (Phase 9 circuit foundation only)'"
echo "This is correct and honest behavior."