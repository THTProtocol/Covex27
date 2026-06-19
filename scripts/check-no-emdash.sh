#!/usr/bin/env bash
# Covex style gate: forbid em dashes (U+2014) and en dashes (U+2013).
#
# Forward gate by design: the ~600 legacy occurrences (old code comments + dated
# docs) are grandfathered. This script only inspects ADDED lines in a diff, so it
# blocks any NEW em/en dash without demanding a noisy retroactive sweep. As legacy
# files are touched they get cleaned, and the count trends to zero.
#
# Usage:
#   scripts/check-no-emdash.sh                 # local: inspect staged changes (pre-commit)
#   scripts/check-no-emdash.sh <base-ref>      # CI: inspect <base-ref>...HEAD
#
# Exit 1 (and print the offending added lines) if any new em/en dash is found.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 2

BASE="${1:-}"
if [ -n "$BASE" ] && [ "$BASE" != "0000000000000000000000000000000000000000" ]; then
  # CI mode: only the lines this push/PR introduced vs its base/parent.
  DIFF=$(git diff "$BASE"...HEAD 2>/dev/null || git diff "$BASE" HEAD 2>/dev/null || git diff HEAD~1 HEAD)
else
  # Local mode: staged changes, falling back to the working tree if nothing staged.
  DIFF=$(git diff --cached)
  [ -z "$DIFF" ] && DIFF=$(git diff)
fi

# Added content lines only (start with a single +, not the +++ file header).
# Match the raw UTF-8 byte sequences for em dash (E2 80 94) and en dash (E2 80 93)
# under LC_ALL=C so it works in both UTF-8 (CI) and non-UTF-8 (git-bash) locales -
# grep -P needs a UTF-8 locale and silently no-ops without one (a false negative).
HITS=$(printf '%s\n' "$DIFF" | grep -E '^\+([^+]|$)' | LC_ALL=C grep -nE $'\xe2\x80\x94|\xe2\x80\x93' || true)

if [ -n "$HITS" ]; then
  echo "FAIL: this change ADDS em/en dashes, which the Covex style rule forbids."
  echo "Replace them with a hyphen, ' - ', a comma, or a sentence break:"
  echo "------------------------------------------------------------------"
  printf '%s\n' "$HITS" | head -50
  echo "------------------------------------------------------------------"
  exit 1
fi
echo "OK: no new em/en dashes introduced."
