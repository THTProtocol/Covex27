#!/usr/bin/env bash
# Covex honesty gate: forbid any NEW use of the dishonest "payment_just_confirmed"
# sessionStorage key. That key claimed payment was confirmed at broadcast time,
# before the funding tx was on-chain. It was deleted from the live tree as a
# functional no-op (no live reader). Stale copies still exist in agent worktrees
# under repo/.claude/worktrees/agent-*/; this gate stops them being resurrected
# by a future copy-from-worktree.
#
# Forward gate (same pattern as scripts/check-no-emdash.sh): only inspects ADDED
# lines in a diff, so legacy occurrences in stale worktrees / archived docs are
# grandfathered until those files are touched.
#
# Usage:
#   scripts/check-no-payment-just-confirmed.sh                 # local: staged
#   scripts/check-no-payment-just-confirmed.sh <base-ref>      # CI: <base>...HEAD
#
# Exit 1 (and print offending added lines) if a new write or read shows up.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 2

BASE="${1:-}"
if [ -n "$BASE" ] && [ "$BASE" != "0000000000000000000000000000000000000000" ]; then
  DIFF=$(git diff "$BASE"...HEAD 2>/dev/null || git diff "$BASE" HEAD 2>/dev/null || git diff HEAD~1 HEAD)
else
  DIFF=$(git diff --cached)
  [ -z "$DIFF" ] && DIFF=$(git diff)
fi

# Added content lines only (start with a single +, not the +++ file header).
# Match only the WRITE/READ forms (sessionStorage / localStorage .setItem/.getItem/
# .removeItem with the literal key). This way prose mentions in this repo's own
# docs ("the dead `payment_just_confirmed` marker was removed") and the script
# self-reference in ci-local.sh do not trip the gate; only resurrected USES do.
HITS=$(printf '%s\n' "$DIFF" \
  | grep -E '^\+([^+]|$)' \
  | LC_ALL=C grep -nE $'(setItem|getItem|removeItem)[[:space:]]*\\([[:space:]]*[\x27"]payment_just_confirmed[\x27"]' \
  || true)

if [ -n "$HITS" ]; then
  echo "FAIL: this change ADDS a use of 'payment_just_confirmed'."
  echo "That key is a dishonest 'confirmed at broadcast' claim and was deleted."
  echo "Use 'payment_broadcast_tx' (a pending HINT) and let /api/paid-status decide tier:"
  echo "------------------------------------------------------------------"
  printf '%s\n' "$HITS" | head -50
  echo "------------------------------------------------------------------"
  exit 1
fi
echo "OK: no new 'payment_just_confirmed' uses introduced."
