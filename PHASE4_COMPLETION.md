# PHASE 4 COMPLETION REPORT
## Covex27 — Mainnet Readiness + Automatic Post-HF Migration

**Date:** 2026-05-29  
**Status:** COMPLETE ✓

### Scope Delivered

**Phase 4 Goal:** Make the entire system production-ready for mainnet launch immediately after the Toccata hard fork, with one-command migration paths.

### Completed Deliverables

| # | Deliverable | Evidence |
|---|-------------|----------|
| 1 | Backend supports clean testnet ↔ mainnet switching | `DEFAULT_KASPA_NETWORK` constant + dynamic treasury logic in `main.rs` |
| 2 | Robust production restart helper | `deploy/start-covex-backend.sh` (always forces correct TN12 env) |
| 3 | One-command post-HF mainnet migration script | `deploy/switch-to-mainnet.sh` — stops backend, updates treasury + network, restarts |
| 4 | Updated systemd service template | Comments + mainnet guidance in `deploy/covex-backend.service` |
| 5 | Documentation | Major update to README "Phase 4 Status" section + migration instructions |
| 6 | Frontend network awareness | Visible `MAINNET` / `TESTNET-12` badge in CovexTerminal (with color coding) |
| 7 | Docker Compose alignment | Default changed to `testnet-12` |

### Key Files Changed / Created

- `backend/src/main.rs` — constant + mainnet treasury logic
- `deploy/start-covex-backend.sh` (improved)
- `deploy/switch-to-mainnet.sh` **(new — the key automation)**
- `deploy/covex-backend.service` (updated)
- `docker-compose.yml`
- `README.md` (new Phase 4 section)
- `frontend/src/components/CovexTerminal.jsx` (network badge)
- `PHASE4_COMPLETION.md` (this file)

### How to Migrate to Mainnet After Hard Fork (Recommended Path)

1. On the production server:
   ```bash
   cd /root/Covex27
   ./deploy/switch-to-mainnet.sh
   ```

2. Edit the script (or `.env.production`) first to set the **correct mainnet treasury address**.

3. Point `KASPA_WRPC_URL` at a healthy mainnet node.

4. The script handles stop → config update → restart automatically.

### Verification Commands (Production)

```bash
# After running switch script
curl -s https://hightable.pro/api/health | jq

# Check logs
tail -30 /tmp/covex27.log | grep -E "(network|treasury|Connected)"

# Confirm no testnet-10 references in running process
curl -s https://hightable.pro/api/status | jq .network
```

### Honest Remaining Gaps (Post Phase 4)

- Only `merkle_membership` has full end-to-end oracle resolution today (Chess still uses client-side + oracle attestation).
- Actual on-chain payout logic is still limited by silverc v0.1.0 (no native `VerifyPayout`).
- Mainnet treasury address must be manually confirmed before launch.

### Phase 4 Sign-off

All major mainnet-readiness and automation goals from the original roadmap have been delivered.

**Phase 4 = COMPLETE**

Next logical work (Phase 5 / ongoing):
- Full UI wiring of oracle resolution for multiple circuits (Hermes Phase 3 work)
- Mainnet launch after HF
- Additional real ZK circuits

---
*Generated during parallel execution while Hermes agent was running Phase 3.*