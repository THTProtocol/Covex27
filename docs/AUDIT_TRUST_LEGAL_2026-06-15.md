# Covex Trustless + Legal Audit — 2026-06-15 (35-agent, code-grounded)

**Headline:** the **enforced money path is genuinely trustless-by-removal** — every real KAS value
path funds the P2SH script-hash, returns change to the deployer, or pays the user's own destination
minus the network TX_FEE; settlement (p2sh_spend, oracle_payout, settle_pot/channel) takes **no rake**.
The only Covex value sink is the **flat tier subscription** (tool/SaaS, not operator). The gaps are
**honesty + integrity**, and most are codeable with no product decision.

**Through-line:** (1) make Covex *provably removable* from the money path; (2) make its money behave
like a **tool fee, not an operator's cut of pots**; (3) **gate every type honestly** by what the chain
actually enforces — the user verifies the math, not Covex's framing.

## Ranked codeable-now plan (no decision needed) — execution order

1. **In-browser sighash recompute + output/address assertion before signing** (L) — close the core
   trust vector (today the browser blind-signs a server-computed digest over a server-built tx).
2. **Client-side P2SH-address recompute + redeem-owner-key match before funding** (M).
3. **SRI on entry/preload/style + externalize the inline bootstrap** (M) — supply-chain integrity.
4. **Shared enforcement-reality helper + per-deploy ack + honest success panels** (M) — PaidDeploy/
   PremiumBuilder currently print "ON-CHAIN ENFORCED / NON-CUSTODIAL" even for oracle/zk resolution.
5. **Delete fabricated `_AUDITED` verifier-key literals + deleted-circuit chess ZK claims** (M).
6. **Mount the (dead-code) LegalModal consent gate + server-side OFAC/SDN address screen** (M).
7. **Downloadable self-recovery bundle at deploy + broadcast-through-any-node docs** (S).
8. **Standalone off-Covex spend builder (`tools/spend-covenant.mjs`)** (L).
9. **Pin shakmaty in Cargo.lock + `cargo --locked` CI gate** (S) — byte-deterministic chess winner.
10. **Disclose the channel-liveness deadline + funder-reclaim grief** (S).
11. **Per-action poker clock + auto-fold sweeper + independently-recomputable winner** (M).
12. **Remove the percentage platform-fee from the payout calculator + the pot-rake UI** (M) —
    revenue Decision A (recommended; the user has already signaled "no rake").
13. **Strip the baked-in fee constant + "to treasury" comment from the DSL emitter + CI invariant** (S).
14. **Report the SERVED artifact identity (build stamp + `/version`) + signed release transparency log** (M).
15. **Honest per-type relabel pass across the catalog (drive reality from the verifier registry)** (L).

## Decisions that are genuinely yours (the audit recommends, but it's your call)

- **Revenue model** — flat subscription vs a pot rake. *Rec: A — keep only the flat tier fee; delete
  every percentage-of-pot concept (the 2% default is the exact legal trigger this audit exists to catch).*
- **Chance games** (poker, blackjack, RPS-for-stakes, dice/card) — drop vs geofence vs license.
  *Rec: relabel oracle-trusted + no real-money chance on mainnet at launch; revisit with counsel + entity.*
- **Derivative/prediction/insurance** templates (black_scholes, options, prediction_market, IRR/VaR,
  parametric_insurance, sports/election/price feeds) — *Rec: cut the worst, relabel the rest as
  "simulation / not financial advice" + geo/KYC-gate, pending counsel.*
- **Channel timeout semantics** — funder-takes-all vs split/return-stake vs 2-of-2. *Rec: disclose now,
  return-each-stake as the structural fix when the updatable state channel lands.*
- **Poker randomness** — *Rec: bind both players' nonces into the deck seed; disclose as the interim label.*
- **Hashlock preimage custody** — *Rec: user-held default (loud irrecoverability warning), optional
  key-derived re-derivable preimage as a convenience.*
- **Geo-block layer + jurisdiction list** — *Rec: backend axum middleware + bundled .mmdb; legal supplies
  the country list + OFAC source.*  · **KYC posture** — *Rec: attestation-only for the tool launch.*
- **Oracle decentralization** — *Rec: OracleSigner trait + HSM + on-chain k-of-n + signed rotation log.*
- **Entity / jurisdiction** — *Rec: form an entity + counsel before any rake / real-money chance /
  derivative product ships on mainnet.*

## External / operator (need a third party or infra)

- Independent third-party **security/script audit** (covenant_builder redeem construction + signer/broadcast).
- **Legal counsel** (money-transmitter / gambling / securities-CFTC posture; OFAC + GDPR framing).
- **Entity formation**; **HSM/KMS** for the mainnet oracle key + an independent k-of-n signer set.
- **Second mainnet node + a public submit endpoint** the recovery docs can name.
- **Off-box backup** of the release manifest + OFAC blocklist + GeoIP DB; periodic OFAC/GeoIP refresh.
- **Reproducible-build CI off the prod box** (npm ci / cargo --locked under pinned toolchains).
- **MPC trusted-setup ceremony** for merkle_membership (+ promoted circuits) before mainnet.
- **Licensed GeoIP + OFAC SDN feeds** on the host.

*(Full 42k-char report incl. the complete 40-row matrix retained in the run transcript; this is the
actionable distillation.)*
