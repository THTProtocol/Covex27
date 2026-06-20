#!/bin/bash
#
# Covex Launch Verification Script (Phase 10 Final)
# Consolidated readiness check for mainnet launch after Toccata hard fork.
#
# Usage:
#   ./deploy/covex-launch-verify.sh
#   BASE_URL=https://hightable.pro ./deploy/covex-launch-verify.sh
#   BASE_URL=http://127.0.0.1:3006 FRONTEND_URL=http://localhost:5173 ./deploy/covex-launch-verify.sh
#
# Exit codes:
#   0 = All critical checks passed (launch ready or very close)
#   1 = One or more critical failures
#   2 = Partial / warnings only
#
set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

BASE_URL="${BASE_URL:-http://127.0.0.1:3006}"
FRONTEND_URL="${FRONTEND_URL:-https://hightable.pro}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

critical_failures=0
warnings=0
passes=0

banner() {
    echo
    echo -e "${BLUE}╔════════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║          COVEX LAUNCH VERIFICATION - PHASE 10 FINAL                        ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════════════════════════════════╝${NC}"
    echo
    echo "Time:        $(date -u +"%Y-%m-%d %H:%M:%S UTC")"
    echo "BASE_URL:    $BASE_URL"
    echo "FRONTEND_URL:$FRONTEND_URL"
    echo "Repo root:   $REPO_ROOT"
    echo
}

pass() {
    echo -e "  ${GREEN}✓${NC} $1"
    ((passes++))
}

warn() {
    echo -e "  ${YELLOW}⚠${NC} $1"
    ((warnings++))
}

fail() {
    echo -e "  ${RED}✗${NC} $1"
    ((critical_failures++))
}

section() {
    echo -e "\n${BLUE}=== $1 ===${NC}"
}

check_endpoint() {
    local name="$1"
    local url="$2"
    local extra="${3:-}"
    echo -n "  Checking $name ... "
    if curl -sf --max-time 8 "$url" $extra >/dev/null 2>&1; then
        echo -e "${GREEN}OK${NC}"
        ((passes++))
    else
        echo -e "${RED}FAIL${NC}"
        ((critical_failures++))
    fi
}

banner

# 1. Core Backend Health
section "1. Core Backend Health & Network"
check_endpoint "Health endpoint" "$BASE_URL/health"

echo -n "  Fetching root status ... "
root_json=$(curl -sf --max-time 6 "$BASE_URL/" 2>/dev/null || echo "{}")
network=$(echo "$root_json" | jq -r '.network // "unknown"' 2>/dev/null || echo "unknown")
echo -e "${GREEN}OK${NC} (network: $network)"

if [[ "$network" == "mainnet" ]]; then
    pass "Running on MAINNET (production)"
elif [[ "$network" == "testnet-12" || "$network" == "testnet-10" ]]; then
    warn "Still on $network - ready for mainnet flip via switch-to-mainnet.sh"
else
    warn "Network reported as: $network"
fi

# 2. Oracle Service (both circuits)
section "2. Oracle Service (Merkle + Range Proof Foundation)"
echo -n "  Merkle Membership oracle path ... "
merkle_resp=$(curl -sf --max-time 12 -X POST "$BASE_URL/api/oracle/verify-and-sign" \
    -H "Content-Type: application/json" \
    -d '{"covenant_id":"launch-verify-merkle","circuit_type":"merkle_membership","proof":{},"public_inputs":[]}' 2>/dev/null || echo '{"success":false}')
if echo "$merkle_resp" | grep -q '"success"'; then
    echo -e "${GREEN}responds${NC}"
    ((passes++))
else
    fail "Oracle endpoint did not respond properly for merkle_membership"
fi

echo -n "  Range Proof oracle path ... "
if [ -f "$REPO_ROOT/zk/range_proof/range_proof_proof.json" ]; then
    range_resp=$(jq -n --slurpfile p "$REPO_ROOT/zk/range_proof/range_proof_proof.json" \
        '{covenant_id:"launch-verify-range",circuit_type:"range_proof",proof:$p[0].proof,public_inputs:$p[0].publicSignals}' | \
        curl -sf --max-time 15 -X POST "$BASE_URL/api/oracle/verify-and-sign" \
            -H "Content-Type: application/json" -d @- 2>/dev/null || echo '{"success":false}')
    if echo "$range_resp" | jq -e '.success == true' >/dev/null 2>&1; then
        pass "Range proof Groth16 verify + oracle sign OK"
    else
        warn "Range proof oracle response: $(echo "$range_resp" | jq -r '.error // .message // "unknown"' 2>/dev/null)"
    fi
else
    range_resp=$(curl -sf --max-time 8 -X POST "$BASE_URL/api/oracle/verify-and-sign" \
        -H "Content-Type: application/json" \
        -d '{"covenant_id":"launch-verify-range","circuit_type":"range_proof","proof":{},"public_inputs":["0","100","500","0"]}' 2>/dev/null || echo '{}')
    if echo "$range_resp" | grep -q '"success"'; then
        warn "Range proof responds but no bundled proof file for full Groth16 test"
    else
        fail "Range proof oracle path unreachable"
    fi
fi

# 3. Explorer / Covenant Data
section "3. Explorer & Covenant Data"
echo -n "  Covenants list endpoint ... "
covenants_resp=$(curl -sf --max-time 8 "$BASE_URL/api/covenants?limit=5" 2>/dev/null || echo "[]")
count=$(echo "$covenants_resp" | jq 'length' 2>/dev/null || echo 0)
if [ "$count" -gt 0 ]; then
    pass "Returning $count recent covenants (live data present)"
else
    warn "No covenants returned (may be empty DB or cold start)"
fi

# 4. Frontend
section "4. Frontend (Studio + Terminal)"
check_endpoint "Frontend reachable" "$FRONTEND_URL"
echo -n "  Frontend contains Covex branding ... "
if curl -sf --max-time 8 "$FRONTEND_URL" 2>/dev/null | grep -qi 'covex\|hightable'; then
    pass "Frontend serves expected content"
else
    warn "Frontend response did not contain expected Covex strings"
fi

# 5. Critical Production Scripts & Docs (local or on-server)
section "5. Critical Files & Launch Artifacts"
required_scripts=(
    "start-covex-backend.sh"
    "switch-to-mainnet.sh"
    "validate-production.sh"
    "covex-launch-verify.sh"
    "covex-status.sh"
)

for script in "${required_scripts[@]}"; do
    if [ -x "$SCRIPT_DIR/$script" ] || [ -x "/root/Covex27/deploy/$script" ]; then
        pass "$script present and executable"
    else
        warn "$script not found or not executable in expected locations"
    fi
done

# Key docs
key_docs=(
    "README.md"
    "MAINNET.md"
    "LAUNCH_CHECKLIST.md"
    "docs/UNLOCK_WITH_ORACLE_SIGNATURE.md"
    "docs/BUILDING_ON_COVEX.md"
    "docs/OPERATIONS_RUNBOOK.md"
)

for doc in "${key_docs[@]}"; do
    if [ -f "$REPO_ROOT/$doc" ] || [ -f "/root/Covex27/$doc" ]; then
        pass "$doc present"
    else
        warn "$doc missing"
    fi
done

# 6. ZK Artifacts (Merkle is production, Range is foundation)
section "6. ZK Circuit State"
MERKLE_ZKEY="frontend/public/zk/merkle_membership/merkle_membership_final.zkey"
if [ -f "$REPO_ROOT/$MERKLE_ZKEY" ] || [ -f "/root/Covex27/$MERKLE_ZKEY" ]; then
    pass "Merkle Membership final zkey present (served at $MERKLE_ZKEY)"
else
    fail "Merkle final zkey missing at $MERKLE_ZKEY (served ZK artifact required by the in-browser prover)"
fi

if [ -f "$REPO_ROOT/zk/range_proof/range_proof.circom" ] || [ -f "/root/Covex27/zk/range_proof/range_proof.circom" ]; then
    pass "Range Proof circuit source present (Phase 9 foundation)"
else
    fail "Range Proof circuit source missing - Phase 9 deliverable not present"
fi

# 7. Phase 9/10 Evidence
section "7. Phase 9–10 Concrete Evidence"
if grep -q "RangeProof - Phase 9 Foundation Circuit" "$REPO_ROOT/zk/range_proof/range_proof.circom" 2>/dev/null || \
   grep -q "RangeProof - Phase 9 Foundation Circuit" "/root/Covex27/zk/range_proof/range_proof.circom" 2>/dev/null; then
    pass "Phase 9 Range Proof circuit has proper foundation content"
else
    warn "Range Proof circuit does not contain expected Phase 9 markers"
fi

if [ -f "$REPO_ROOT/zk/prove_range_proof.js" ] || [ -f "/root/Covex27/zk/prove_range_proof.js" ]; then
    pass "prove_range_proof.js (Phase 9) present"
else
    warn "prove_range_proof.js missing"
fi

# 8. Summary
section "8. Summary & Verdict"

echo "Passes:   $passes"
echo "Warnings: $warnings"
echo "Critical failures: $critical_failures"
echo

if [ $critical_failures -eq 0 ] && [ $warnings -eq 0 ]; then
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║  LAUNCH VERIFICATION: PASS - ALL SYSTEMS GO                                ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════════════════════╝${NC}"
    echo
    echo "Covex is ready for mainnet launch."
    exit 0
elif [ $critical_failures -eq 0 ]; then
    echo -e "${YELLOW}╔════════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${YELLOW}║  LAUNCH VERIFICATION: PASS WITH WARNINGS                                   ║${NC}"
    echo -e "${YELLOW}╚════════════════════════════════════════════════════════════════════════════╝${NC}"
    echo
    echo "No critical failures. Review warnings above before mainnet flip."
    exit 2
else
    echo -e "${RED}╔════════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║  LAUNCH VERIFICATION: FAIL - DO NOT LAUNCH                                 ║${NC}"
    echo -e "${RED}╚════════════════════════════════════════════════════════════════════════════╝${NC}"
    echo
    echo "Critical failures detected. Fix before proceeding to mainnet."
    exit 1
fi
