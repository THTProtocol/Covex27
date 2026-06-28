#!/usr/bin/env bash
# Covex neutrality + separation gate.
#
# Covex is provider-neutral: it ships oracle connectors but is never itself a provider and
# advertises no specific one. Two classes of name must NEVER appear anywhere in the tree:
#   1. The separate, independent oracle project that happens to share infrastructure. There must
#      be no link from Covex to it in either direction.
#   2. Any specific third-party oracle product, named as a connectable or comparable resolver.
#
# This is a FULL-TREE gate (not forward-only): the names must be zero. It excludes vendored deps,
# build output, lockfiles, and this script itself (which necessarily lists the names).
#
#   scripts/check-forbidden-names.sh
set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 2

# Curated, distinctive patterns chosen to avoid false positives (no generic words).
PATTERN='[Kk]oracle|Kaskad|Chainlink|RedStone|Tellor|Switchboard|Band Protocol'

HITS=$(git grep -nIE "$PATTERN" -- \
  ':!**/node_modules/**' ':!**/dist/**' ':!**/*-lock.json' ':!**/package-lock.json' \
  ':!scripts/check-forbidden-names.sh' 2>/dev/null || true)

if [ -n "$HITS" ]; then
  echo "FAIL: a forbidden project/product name appears in the tree. Covex must stay"
  echo "provider-neutral and must not name the separate oracle project or any specific"
  echo "third-party oracle product. Use generic wording (the oracle service, an external"
  echo "resolver, a provider) instead:"
  echo "$HITS"
  exit 1
fi
echo "OK: no forbidden project/product names."
exit 0
