#!/usr/bin/env bash
# Covex performance gate: forbid NEW static `from 'lucide-react'` (barrel) imports.
#
# The lucide-react barrel re-exports ~1960 icons (~603KB raw / ~150KB gzip). A static
# import of it from any chunk drags the whole barrel onto that chunk's load - and from the
# eager graph, onto the HOMEPAGE critical path (modulepreloaded in index.html). To keep
# that off route loads:
#   - The eager shell deep-imports its icons from src/lib/icons.js (per-icon ESM modules).
#   - Lazy routes + the components they pull deep-import from src/lib/routeIcons.js.
#   - The Studio IconPicker, which genuinely needs the full set, loads it LAZILY via
#     src/lib/lucideLazy.jsx's cached `import('lucide-react')` (a dynamic import, allowed).
#
# This gate fails if a NON-allowlisted source file statically imports the barrel, so the
# 603KB chunk can never silently re-enter a route (or the homepage) again. Add the icon to
# icons.js / routeIcons.js instead of importing the barrel.
#
# Usage: scripts/check-no-lucide-barrel.sh
set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 2

# Files allowed to reference 'lucide-react':
#   icons.js / routeIcons.js    - the deep-import shims (per-icon re-exports, tree-shaken)
#   lucideLazy.jsx              - the ONLY dynamic `import('lucide-react')` (lazy, off entry)
#   Markets.jsx                - legacy, owned by another lane + currently routeless (no chunk)
ALLOW='frontend/src/lib/icons\.js|frontend/src/lib/routeIcons\.js|frontend/src/lib/lucideLazy\.jsx|frontend/src/pages/Markets\.jsx'

# STATIC barrel imports only: `... from 'lucide-react'` / `import 'lucide-react'`.
# A dynamic `import('lucide-react')` (lucideLazy) does NOT match this and is fine.
HITS=$(git grep -nE "from[[:space:]]+['\"]lucide-react['\"]|^import[[:space:]]+['\"]lucide-react['\"]" -- 'frontend/src/**/*.js' 'frontend/src/**/*.jsx' 2>/dev/null \
  | grep -vE "^($ALLOW):" \
  || true)

if [ -n "$HITS" ]; then
  echo "FAIL: a source file statically imports the lucide-react barrel (~603KB)."
  echo "Deep-import the icon from src/lib/icons.js (eager shell) or src/lib/routeIcons.js"
  echo "(lazy routes) instead, so the full barrel stays off the route + homepage critical path."
  echo "------------------------------------------------------------------"
  printf '%s\n' "$HITS" | head -50
  echo "------------------------------------------------------------------"
  exit 1
fi
echo "OK: no static lucide-react barrel imports outside the allowed shims."
