#!/usr/bin/env bash
# Run after finish_phase2.sh: flip UI/registry to full-zk, commit vkey+proof, sync Hetzner.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../../../.." && pwd)"
OUT="$REPO/zk/games/chess/output"
VKEY="$OUT/chess_v1_vkey.json"
PROOF="$OUT/proofs/move_12_28.json"
ZKEY="$OUT/chess_v1.zkey"
LOG="$OUT/post_finish.log"

log() { echo "[$(date -Iseconds)] $*" | tee -a "$LOG"; }

[[ -f "$ZKEY" ]] || { log "ERROR: missing $ZKEY"; exit 1; }
[[ -f "$VKEY" ]] || { log "ERROR: missing $VKEY — run finish_phase2.sh first"; exit 1; }
[[ -f "$PROOF" ]] || { log "ERROR: missing $PROOF"; exit 1; }

log "=== post_chess_finish start ==="

# Flip CovexTerminal chess_v1 to full-zk (hybrid mode 0 still available via proving_mode)
TERMINAL="$REPO/frontend/src/components/CovexTerminal.jsx"
if grep -q "id: 'chess_v1'.*reality: 'hybrid'" "$TERMINAL"; then
  sed -i "s/id: 'chess_v1', name: 'Chess (FIDE)', description: 'Hybrid (default, fast) or Full ZK mode/id: 'chess_v1', name: 'Chess (FIDE)', description: 'Full ZK (pot17 Groth16) with optional Hybrid mode/" "$TERMINAL"
  sed -i "s/circuit: 'chess_v1', accent: '#49EACB', category: 'game', reality: 'hybrid', proving_modes/circuit: 'chess_v1', accent: '#49EACB', category: 'game', reality: 'full-zk', artifacts: true, proving_modes/" "$TERMINAL"
  log "Updated CovexTerminal chess_v1 → full-zk"
fi

# Update circuit registry
REGISTRY="$REPO/zk/circuit_registry.json"
python3 - <<'PY' "$REGISTRY"
import json, sys
path = sys.argv[1]
with open(path) as f:
    data = json.load(f)
for c in data.get("circuits", []):
    if c.get("id") == "chess_v1":
        c["reality"] = "full-zk"
        c["artifacts"] = True
        c["note"] = "FIDE chess pot17 zkey + vkey + move_12_28 demo proof. Dual proving_mode 0=Hybrid 1=Full ZK. See CHESS_PROVING_MODES.md."
        break
with open(path, "w") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
print("registry updated")
PY
log "Updated circuit_registry.json"

cd "$REPO"
git add \
  zk/chess_v1_vkey.json \
  zk/games/chess/output/chess_v1_vkey.json \
  zk/games/chess/output/proofs/move_12_28.json \
  frontend/src/components/CovexTerminal.jsx \
  zk/circuit_registry.json 2>/dev/null || true

# vkey + proof only (zkey too large for git; stays on disk at output/chess_v1.zkey)
git commit -m "$(cat <<'EOF'
Chess pot17 ceremony complete: vkey + demo proof + full-zk UI

- chess_v1_vkey.json and move_12_28.json Groth16 proof
- Flip chess_v1 to full-zk in terminal + registry
- Production zkey at zk/games/chess/output/chess_v1.zkey (not in git)
EOF
)" || log "nothing to commit (already committed?)"

git push origin master
log "Pushed to GitHub"

if ssh -o ConnectTimeout=15 -o BatchMode=yes root@hightable.pro 'echo ok' 2>/dev/null; then
  ssh root@hightable.pro bash -s <<'REMOTE'
set -euo pipefail
cd /root/Covex27
git fetch origin && git reset --hard origin/master
# Copy production zkey from build machine if missing (rsync from local in deploy step)
cd frontend && npm run build -s
rsync -a --delete dist/ /root/htp/public/
systemctl restart covex-backend
echo "Hetzner deployed $(git rev-parse --short HEAD)"
REMOTE
  log "Hetzner FE/BE synced"
  # rsync zkey to Hetzner for production proving (large file)
  rsync -av --progress "$ZKEY" root@hightable.pro:/root/Covex27/zk/games/chess/output/chess_v1.zkey 2>>"$LOG" || log "WARN: zkey rsync failed (run manually)"
fi

# Restart kaspad watchdog
if [[ -x /home/kasparov/kaspa/watchdog.sh ]]; then
  nohup /home/kasparov/kaspa/watchdog.sh >> /home/kasparov/kaspa/logs/watchdog.log 2>&1 &
  log "kaspad watchdog restarted"
fi

log "=== post_chess_finish complete ==="