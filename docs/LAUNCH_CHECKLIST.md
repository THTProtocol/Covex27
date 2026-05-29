# Covex Launch Checklist (Phase 5)

Use this checklist before going live on mainnet after the Toccata hard fork.

## Pre-Launch (Testnet)

- [ ] All 5 phases completed and documented
- [ ] `deploy/validate-production.sh` passes cleanly against current environment
- [ ] `deploy/covex-status.sh` shows healthy state
- [ ] Oracle endpoint returns valid signatures for real proofs (`zk/merkle_proof.json`)
- [ ] Frontend on hightable.pro shows the new Oracle Resolution UI for merkle_membership
- [ ] `deploy/switch-to-mainnet.sh` has been reviewed and the mainnet treasury address is correct
- [ ] Mainnet wRPC node is ready and tested
- [ ] `COVEX_ORACLE_KEY` (mainnet) is prepared and will be set before launch

## Hard Fork Day / Migration

- [ ] Run `./deploy/switch-to-mainnet.sh` (or equivalent via systemd)
- [ ] Confirm `KASPA_NETWORK=mainnet` in the running process
- [ ] Confirm correct mainnet treasury address is active
- [ ] Backend is successfully connecting to mainnet wRPC
- [ ] Run `validate-production.sh` again on mainnet
- [ ] Monitor `/tmp/covex27.log` for indexing activity

## Post-Launch

- [ ] First real covenants are being indexed on mainnet
- [ ] Oracle service is responding on mainnet
- [ ] Public documentation (README, etc.) reflects mainnet status
- [ ] Monitoring / alerting is in place for the backend

## Emergency Rollback

If something goes wrong:

1. Run the reverse of `switch-to-mainnet.sh` (point back to testnet treasury + network)
2. Restart backend
3. Announce temporary return to testnet

---

**Last updated:** End of Phase 5 (2026-05-30)
