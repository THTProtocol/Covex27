#!/usr/bin/env bash
# Covex honesty gate: the first-party privacy-mixer co-sign path is REMOVED for the
# legal / sanctions posture disavowed in backend/src/main.rs ("Covex offers NO first-party
# mixer"). This gate keeps that disavowal and the code from drifting apart: it fails if any
# SIGNING DISPATCH for privacy_mixer_v1 is resurrected in the backend.
#
# It is an ABSOLUTE check on the current backend source (not a diff), because the disavowal
# is a present-tense claim. Prose / comments and the tests that ASSERT the circuit is gone
# (is_none / "must not be" / "was removed") are allowed; only live dispatch is forbidden:
#   - registering privacy_mixer_v1 in the oracle verifier registry (m.insert("privacy_mixer_v1", ...))
#   - branching on circuit_type == "privacy_mixer_v1" in a handler
#   - listing "privacy_mixer_v1" in the no-binding allowlist matches!(...) arm
#   - a compiler emit case "privacy_mixer_v1" =>
#   - the mixer nullifier DB helpers (mixer_record_nullifier / mixer_nullifier_spent)
#
# Usage: scripts/check-no-privacy-mixer.sh
# Exit 1 (and print offenders) if any live dispatch is found.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 2

SRC="backend/src"
if [ ! -d "$SRC" ]; then
  echo "OK: no backend/src tree here (nothing to check)."
  exit 0
fi

# Strip // line comments before matching so prose mentions never trip the gate; we only want
# executable Rust. (Block comments are not used for these patterns in this codebase.)
strip_comments() { sed -E 's://.*$::' "$1"; }

fail=0
hit() { echo "FAIL: $1"; echo "$2" | sed 's/^/    /'; fail=1; }

# 1) Registry registration of the mixer verifier. The insert may be single-line
#    (insert("privacy_mixer_v1", ...)) or split across two lines (insert(\n "privacy_mixer_v1",).
#    pcregrep -M spans lines; fall back to a single-line grep where pcregrep is absent.
if command -v pcregrep >/dev/null 2>&1; then
  M=$(for f in "$SRC"/*.rs; do strip_comments "$f" > /tmp/_nopm.$$ && pcregrep -Mn '\.insert\(\s*"privacy_mixer_v1"' /tmp/_nopm.$$ | sed "s|^|$f:|"; done; rm -f /tmp/_nopm.$$)
else
  M=$(for f in "$SRC"/*.rs; do strip_comments "$f" | grep -nE 'insert\(\s*"privacy_mixer_v1"' | sed "s|^|$f:|"; done)
fi
[ -n "$M" ] && hit 'privacy_mixer_v1 is being registered in the verifier registry (must stay unregistered, fail-closed).' "$M"

# 2) Handler branching on the circuit type (signing dispatch).
M=$(for f in "$SRC"/*.rs; do strip_comments "$f" | grep -nE 'circuit_type\s*==\s*"privacy_mixer_v1"' | sed "s|^|$f:|"; done)
[ -n "$M" ] && hit 'a handler branches on circuit_type == "privacy_mixer_v1" (signing dispatch resurrected).' "$M"

# 3) No-binding allowlist arm or compiler emit case naming the mixer.
M=$(for f in "$SRC"/*.rs; do strip_comments "$f" | grep -nE '"privacy_mixer_v1"\s*(\||=>)' | sed "s|^|$f:|"; done)
[ -n "$M" ] && hit 'privacy_mixer_v1 appears in a matches!/allowlist arm or a compiler emit case (must be gone).' "$M"

# 4) The mixer nullifier DB helpers must not exist or be called.
M=$(for f in "$SRC"/*.rs; do strip_comments "$f" | grep -nE 'mixer_record_nullifier|mixer_nullifier_spent|emit_privacy_mixer' | sed "s|^|$f:|"; done)
[ -n "$M" ] && hit 'a removed mixer helper (mixer_record_nullifier / mixer_nullifier_spent / emit_privacy_mixer) is back.' "$M"

if [ "$fail" = 0 ]; then
  echo "OK: no privacy_mixer_v1 signing dispatch in backend/src (disavowal in main.rs holds)."
  exit 0
fi
echo "------------------------------------------------------------------"
echo "The privacy-mixer co-sign path was removed for the legal/sanctions posture."
echo "Do not resurrect a signing dispatch; main.rs disavows a first-party mixer."
exit 1
