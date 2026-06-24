# Covex27 Security Audit & Remediation

Single cohesive record of the security audit and its fixes. All remediation
is **on `master`** — the work was developed on `security/audit-remediation`
(commit `48e8a2d`) and folded into `master`; that branch is now redundant.

- **Audited baseline:** `master` @ `249d2ab`
- **Remediation commit:** `48e8a2d` — "security: remediate audit findings across backend / zk / deploy" (now an ancestor of `master`)
- **Verification:** `cargo build` green; `kaspa_msg` (3/3) and oracle roundtrip unit tests pass; C1 confirmed live (`verify_poker_equity.js` returns `valid:false`).

## Findings → fixes

| # | Severity | Finding | Status | Where fixed |
|---|----------|---------|--------|-------------|
| C1 | Critical | Rubber-stamp ZK verifiers → forge oracle signature for any outcome/covenant | ✅ Closed | `oracle_verifier.rs` (6 stub circuits → `Attested`); `zk/verify_attested.js` neutered; `zk/verify_{auction_clearing,election_feed,poker_vrf_deal,turn_timer}.js` rewritten fail-closed |
| C2 | Critical | Unauthenticated market resolution reveals winning secret / bricks market | ✅ Closed | `covenant_builder.rs` resolve requires creator signature over `covex-market-resolve:{id}:{outcome}:{nonce}`; `db.rs` `creator_address` column + get/set helpers |
| C3 | Critical | Leaked keys in git history (incl. old oracle key) | ⏭️ Out of scope per owner | Keys already rotated 2026-06-16; history purge intentionally deferred |
| C4 | Critical | Backend / kaspad RPC bound to `0.0.0.0`, no firewall | ✅ Closed | `main.rs` default bind `127.0.0.1`; `docker-compose.yml` loopback publish; `deploy/*` systemd/kaspad loopback + `ufw` |
| H1 | High | `X-Forwarded-For` rate-limit bypass | ✅ Closed | `main.rs` keys limiter on `X-Real-IP`; `deploy/nginx-covex.conf` sets it with replace semantics |
| H2 | High | Mixer withdraw unauth/replayable | ⚠️ Partial | `mixer.rs`/`db.rs` atomic nullifier claim + reuse/deposit gates; per-note ZK bind still needs the circuit (no payout wired) |
| H3 | High | Unauthenticated game money routes | ✅ Closed | `games.rs` all five lock/settle/refund routes require a valid seat token; refund restricted to funder |
| H4 | High | `covenant_id` not bound into proofs (cross-covenant replay) | ✅ Closed (fail-closed default) | `oracle.rs` + `covenant_builder.rs` `enforce_onchain_covenant_binding`: now fail-CLOSED by GLOBAL default. A Strict/Hybrid proof that omits `sha256(covenant_id) mod BN254` is REFUSED unless the circuit is on the explicit no-binding allowlist (`circuit_allows_no_covenant_binding`: only the game / mixer / DeFi-market hybrids whose served vkey cannot carry it). The blanket `COVEX_ALLOW_NO_BINDING=true` escape hatch CANNOT relax a binding-emitting circuit (`&& !circuit_emits_covenant_binding(...)`); `COVEX_REQUIRE_COVENANT_BINDING=true` forces strict everywhere |
| M1 | Medium | No-auth `/covenant-metadata` + reachable panic | ✅ Closed | `main.rs` ownership signature required for `featured`; slice panic guarded |
| M2 | Medium | `settle-pot` trusts stored winner | ✅ Closed | `games.rs` re-derives winner via `game_pot_outcome`, pays verified side |
| M3 | Medium | `kaspa_msg` address-type confusion | ✅ Closed | `kaspa_msg.rs` asserts `Version::PubKey` |
| M4 | Medium | Replayable terminal-config nonce | ✅ Closed | `main.rs` in-memory single-use, 300s-TTL nonce store |
| M5 | Medium | Oracle-secret sprawl | ⚠️ Partial | `covenant_builder.rs` resolve re-derives + commitment-checks; removing plaintext-at-create needs a schema change the matcher depends on |
| L1 | Low | Weak auth-token entropy | ✅ Closed | `db.rs` token = 256-bit CSPRNG |
| L2 | Low | Private key bytes in signer logs | ✅ Closed | `signer.rs` key fragment removed from `[SIGNER-DIAG]` |
| L3 | Low | `sshpass` + `StrictHostKeyChecking=no` deploy | ✅ Closed | canonical `deploy/hard_deploy.sh` + `deploy/fe_deploy.sh` run server-side over key-based SSH (no password, no host-key bypass) |

## Open follow-ups
- **H4 (closed, fail-closed default):** cross-covenant replay is now refused by GLOBAL default; a proof must commit `sha256(covenant_id) mod BN254` or the circuit must be on the explicit no-binding allowlist. Binding-emitting circuits cannot be relaxed by `COVEX_ALLOW_NO_BINDING`. Remaining work is only to widen the set of non-game circuits that emit the binding (so fewer rely on the allowlist), then optionally set `COVEX_REQUIRE_COVENANT_BINDING=true` to force strict everywhere.
- **M5 (partial):** removing the plaintext-at-create secret storage still needs a DB-schema change the matcher depends on.
- **H2 (partial):** wire a real ZK nullifier + denomination membership proof before any on-chain mixer payout.

## Deploy prerequisites (read before shipping to production)
These changes are intentionally fail-closed / breaking and need coordination first:
1. **Frontend** must send the new fields: `{token}` body for `settle-pot`/`settle-channel`/`refund-channel`; `signer_address`/`signature`/`nonce` for `market/create`, `market/resolve`, and `covenant-metadata`.
2. **Oracle host** must have the four hybrid vkeys (`frontend/public/zk/<name>/<name>_vkey.json`) and `snarkjs` installed, or those circuits (and all strict ZK verification) fail closed.
