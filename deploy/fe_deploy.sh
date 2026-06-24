#!/bin/bash
# Covex canonical FRONTEND deploy script (npm build + copy to nginx root).
#
# This is the version-controlled source of truth for the script that runs ON THE
# SERVER as /tmp/fe_deploy.sh. The live /tmp copy is NOT in git; if the box is
# rebuilt, copy this file to /tmp/fe_deploy.sh (or run it from the repo). See
# docs/RUNBOOK.md ("Frontend deploy") for the full procedure.
#
# NOTE on asset pruning: this faithful copy performs a plain `rsync -a dist/`
# WITHOUT --delete (so it never drops og-cover.png / logo pngs that vite copies
# into dist/). That means stale content-hashed chunks ACCUMULATE in
# /root/htp/public/assets/. For a clean served bundle (atomic assets dir-swap to
# prune orphaned chunks, recommended for the launch deploy) run the manual
# dir-swap block documented in docs/RUNBOOK.md "asset prune" after this script.
#
# Run it:  ssh root@hightable.pro 'bash /tmp/fe_deploy.sh'   (or bash deploy/fe_deploy.sh)
# Secrets: none.

cd /mnt/HC_Volume_105579109/Covex27
{
git fetch origin --quiet && git reset --hard origin/master >/dev/null
echo "repo at $(git rev-parse --short HEAD)"
cd frontend
# Pick up new deps (react-colorful, embla-carousel-react, snarkdown) from the updated lockfile.
npm install --no-audit --no-fund 2>&1 | tail -3; IE=${PIPESTATUS[0]}; echo "NPM_INSTALL_EXIT=$IE"
npm run build 2>&1 | tail -4; BE=${PIPESTATUS[0]}; echo "FE_BUILD_EXIT=$BE"
if [ "$BE" != "0" ]; then echo "FE BUILD FAILED - served dir untouched"; echo "FE_DEPLOY_DONE"; exit 0; fi
rsync -a dist/ /root/htp/public/
echo "synced -> /root/htp/public"
echo "served main bundle: $(grep -oE 'index-[A-Za-z0-9_-]+\.js' /root/htp/public/index.html | head -1)"
echo "FE_DEPLOY_DONE"
} > /tmp/fe_deploy.log 2>&1
