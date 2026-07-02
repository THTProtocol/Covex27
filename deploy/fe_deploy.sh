#!/bin/bash
# Covex canonical FRONTEND deploy script (npm build + copy to nginx root).
#
# This is the version-controlled source of truth for the script that runs ON THE
# SERVER as /tmp/fe_deploy.sh. The live /tmp copy is NOT in git; if the box is
# rebuilt, copy this file to /tmp/fe_deploy.sh (or run it from the repo). See
# docs/RUNBOOK.md ("Frontend deploy") for the full procedure.
#
# Asset pruning: the whole-dist rsync below runs WITHOUT --delete (so it never drops
# og-cover.png / logo pngs / sw.js that vite copies into dist/ root), then a SECOND rsync
# mirrors ONLY dist/assets/ WITH --delete to prune orphaned content-hashed chunks. Hashed
# chunks are immutable and index.html is network-first, so pruning never serves a stale entry,
# and the assets-dir-only --delete cannot touch the dist/ root files. No manual prune needed.
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

# Precompress static assets so nginx (brotli_static on; gzip_static on; already enabled in
# conf.d/htp-headers.conf) serves prebuilt .br/.gz at ZERO per-request CPU instead of
# dynamically recompressing the ~1MB vendor-zk bundle and ~89MB of /zk zkey/wasm on every
# cold request (NGX-2/NGX-3). brotli -q11 + gzip -9 are a one-time build cost (~30-60s); the
# siblings land INSIDE dist/ so the rsync lines below carry them, and the assets --delete
# prunes them in lockstep with their parents (never orphaned).
echo "precompressing dist assets (brotli -q11 + gzip -9)..."
PC=0
while IFS= read -r -d '' f; do
  brotli -q 11 -f -k -o "$f.br" "$f" 2>/dev/null || true
  gzip -9 -f -k -c "$f" > "$f.gz" 2>/dev/null || true
  PC=$((PC+1))
done < <(find dist -type f \( -name '*.js' -o -name '*.mjs' -o -name '*.css' \
  -o -name '*.wasm' -o -name '*.bin' -o -name '*.json' -o -name '*.svg' \
  -o -name '*.zkey' -o -name '*.html' -o -name '*.txt' -o -name '*.xml' \) -print0)
echo "PRECOMPRESSED=$PC files (.br + .gz)"

rsync -a dist/ /root/htp/public/
# Prune stale content-hashed chunks: mirror ONLY the assets dir so orphaned old bundles do not
# accumulate (hashed chunks are immutable and index.html is network-first, so this never serves a
# stale entry). dist/ root files (og-cover.png, logo pngs, sw.js) live OUTSIDE dist/assets and are
# synced by the line above, so this --delete removes orphaned chunks ONLY, never those.
rsync -a --delete dist/assets/ /root/htp/public/assets/
echo "synced -> /root/htp/public (stale assets pruned)"
echo "served main bundle: $(grep -oE 'index-[A-Za-z0-9_-]+\.js' /root/htp/public/index.html | head -1)"
echo "FE_DEPLOY_DONE"
} > /tmp/fe_deploy.log 2>&1
