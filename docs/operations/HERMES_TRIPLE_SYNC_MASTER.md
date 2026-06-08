# Covex27 Triple-Sync Master Prompt

Primary canonical Hermes prompt for deploying Covex27 (`THTProtocol/Covex27`) to production at `https://hightable.pro`.

## Authoritative Infrastructure

| Layer | Value |
|-------|--------|
| Local repo | `/home/kasparov/Covex27` |
| GitHub remote | `https://github.com/THTProtocol/Covex27.git` |
| Branch | `master` |
| Production host | `ssh root@hightable.pro` |
| Hetzner repo | `/root/Covex27` |
| Frontend nginx root | `/root/htp/public` |
| Backend service | `systemctl restart covex-backend` |
| Backend bind | `0.0.0.0:3005` |
| Public URL | `https://hightable.pro` |

## Quick Deploy

```bash
# Local
cd /home/kasparov/Covex27
git fetch origin && git status

# Hetzner
ssh root@hightable.pro 'cd /root/Covex27 && git fetch && git reset --hard origin/master'
ssh root@hightable.pro 'cd /root/Covex27/frontend && npm ci && npm run build && rsync -a --delete dist/ /root/htp/public/'
ssh root@hightable.pro 'source ~/.cargo/env && cd /root/Covex27/backend && cargo build --release && systemctl restart covex-backend'
```

## Verification

```bash
cd /home/kasparov/Covex27/zk && node test_e2e_full_zk.js
curl -s https://hightable.pro/api/health
cd /home/kasparov/Covex27 && BASE_URL=https://hightable.pro ./deploy/covex-launch-verify.sh
```

## Chess Ceremony

- `ps -p 30259` — do NOT kill this
- When `zk/games/chess/output/chess_v1.zkey` appears: run `zk/games/chess/scripts/finish_phase2.sh`
- Only commit `chess_v1_vkey.json` and demo proof (not the multi-GB zkey)

## Reference

- `docs/MASTER_COMPLETION_PLAN.md` — 9-phase roadmap
- `docs/ZK_ORACLE_FULL_STACK_VISION_AND_ROADMAP.md` — full ZK vision
- `docs/SPRINT_TRACKER.md` — sprint status
