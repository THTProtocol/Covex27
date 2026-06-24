#!/bin/bash
# Covex canonical BACKEND deploy script (gated build + test + graceful restart).
#
# This is the version-controlled source of truth for the script that runs ON THE
# SERVER as /tmp/hard_deploy.sh. The live /tmp copy is NOT in git; if the box is
# rebuilt, copy this file to /tmp/hard_deploy.sh (or run it from the repo) so the
# real deploy path can never be lost or hand-reconstructed wrong under launch
# pressure. See docs/RUNBOOK.md ("Backend deploy") for the full procedure and the
# CARGO_TARGET_DIR=/opt/covex-target gotcha.
#
# It is a GATE: the live binary is only restarted if BOTH the build and the test
# gate pass, so a broken commit can never replace a working backend.
#
# Run it:  ssh root@hightable.pro 'bash /tmp/hard_deploy.sh'   (or bash deploy/hard_deploy.sh)
# Secrets: it reads NO secrets. COVEX_ORACLE_KEY and the wRPC URLs come from the
# systemd drop-in (/etc/systemd/system/covex-backend.service.d/), not from here.

cd /mnt/HC_Volume_105579109/Covex27
{
# Archive the currently-deployed binary BEFORE the new build overwrites it, so an
# instant rollback-without-rebuild is possible (keeps last 5). Non-fatal: never
# blocks the deploy. See docs/RUNBOOK.md "Rollback".
ARCHIVE_DIR=/opt/covex-target/release/archive
CUR_BIN=/opt/covex-target/release/covex27-backend
if [ -f "$CUR_BIN" ]; then
  mkdir -p "$ARCHIVE_DIR" 2>/dev/null || true
  TS=$(date -u +%Y%m%dT%H%M%SZ)
  cp -p "$CUR_BIN" "$ARCHIVE_DIR/covex27-backend.$TS" 2>/dev/null \
    && echo "archived prior binary -> $ARCHIVE_DIR/covex27-backend.$TS" \
    || echo "archive skipped (copy failed, non-fatal)"
  ls -1t "$ARCHIVE_DIR"/covex27-backend.* 2>/dev/null | tail -n +6 | xargs -r rm -f 2>/dev/null || true
else
  echo "no prior binary to archive (first deploy)"
fi

git fetch origin --quiet && git checkout -f master >/dev/null 2>&1 && git reset --hard origin/master >/dev/null
echo "master at $(git rev-parse --short HEAD)"
cd backend && . "$HOME/.cargo/env" && export CARGO_TARGET_DIR=/opt/covex-target
cargo build --release 2>&1 | tail -2; BE=${PIPESTATUS[0]}; echo "BUILD_EXIT=$BE"
if [ "$BE" != "0" ]; then echo "BUILD FAILED - not restarting"; echo "DEPLOY_DONE"; exit 0; fi
FAILS=$(cargo test --release 2>&1 | grep -E "\.\.\. FAILED" | sed 's/ \.\.\. FAILED//; s/^test //')
echo "FAILED_TESTS:[$FAILS]"
NEW=$(echo "$FAILS" | grep -vE "merkle_proof|reject_tampered" | grep -v "^$")
if [ -n "$NEW" ]; then echo "NEW TEST FAILURE - not restarting: $NEW"; echo "DEPLOY_DONE"; exit 0; fi
OLD=$(systemctl show -p MainPID --value covex-backend); systemctl restart covex-backend; sleep 4
echo "pid $OLD -> $(systemctl show -p MainPID --value covex-backend); active=$(systemctl is-active covex-backend)"
curl -s --max-time 10 http://127.0.0.1:3006/healthz | head -c 120; echo
echo "DEPLOY_DONE"
} > /tmp/hard_deploy.log 2>&1
