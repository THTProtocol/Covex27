# Covex — Roadmap to a 100% Finished, Trustless, Mainnet Product

Status snapshot: **2026-06-14**. This doc is the honest "what's done / what's left / what to build next."

---

## 1. What is DONE and verified (the hard part)

**Trustlessness — proven, not claimed.**
- Non-custodial enforced redeem: keys never touch the server. `prepare-spend` returns an
  unsigned sighash; the wallet/device signs it (BIP340 Schnorr, `@noble/curves`); only the
  64-byte signature is submitted. **E2E-proven on TN12** (covenant `fcd614…`, spend `1bfe7172…`).
- Funds recover from the chain ALONE: the deploy payload embeds the full redeem script
  (`aa20<hash><redeem>`); `tools/recover-covenant.mjs` reconstructs and validates it with no Covex
  dependency. **Round-trip verified.** This is the acid test: if Covex vanishes, you still spend.
- 7 on-chain/hybrid covenant primitives engine-tested + on-chain: singlesig, hashlock, timelock,
  multisig, HTLC, oracle-enforced (2-of-2), oracle-escrow (2-player pot).

**Security — the audit's fund-drains are closed.**
- Oracle off-chain + on-chain free-signature holes closed (gated on real crypto verification, not
  proof shape). Forged-resign channel-drain closed (game_pot_outcome gate + per-seat move tokens).
- Honest verifiers (fail-closed), honest labels (no fake "Compiled/Published/on-chain"), honest
  `mainnet_ready` (= wRPC configured AND covenant gate open).

**Legal shield.** Terms rewritten: Covex is software/indexer/UI, **not** an operator, custodian,
money transmitter, exchange, or counterparty — grounded in the now-true fact that funds are
recoverable without us.

**Infra.** Data volume resized to 270G; covex.db relocated to the OS disk; nodes recovered.

---

## 2. What's LEFT for "100%" — with concrete plans

### 2.1 ZK circuits: make them all genuinely work
**UPDATE 2026-06-14 — the proving keys are now GENERATED + VERIFIED.** Ran the ceremony
(`zk/setup_live_zk.sh`, re-runnable + idempotent): **37 circuits now have live Groth16
`_final.zkey` + `_vkey.json`** generated from their real r1cs via the pot10 ceremony (all of these
circuits are <1024 constraints, so no pot16 download was needed). Only 3 failed (connect4_v1,
tictactoe_v1, privacy_mixer_v1 — larger, need pot16). End-to-end VERIFIED (real proof generates +
`snarkjs.groth16.verify` passes against the new vkey) for `relative_timelock`,
`basic_utxo_ownership`, and `merkle_membership`. The oracle verifiers (`verify_*.js`) now have real
vkeys, so the backend can verify real proofs for these circuits. **The disk-blocked foundation is
done.** Keys are server-only + gitignored (regenerate with `setup_live_zk.sh`).

**Remaining to make each one usable from a user's browser:**
1. Serve `circuit.wasm` + `circuit_final.zkey` + `circuit_vkey.json` under
   `frontend/public/zk/<circuit>/` (currently only merkle/range are served).
2. Add a per-circuit in-browser generator branch (mirror `merkle_membership`'s `fullProve`) that
   constructs that circuit's inputs (the `zk/prove_*.js` scripts are the reference for inputs).
3. Only then promote each circuit to `full-zk` in `VERIFIED_FULL_ZK` (CovexTerminal.jsx) — the
   label stays honest (oracle-attested) until a real in-browser proof verifies.
5. **Fix `range_proof`**: its in-browser MiMC7 commitment doesn't match the circuit's hasher — use
   the circuit's own `hasher.out` from the witness (drop `mimc_test.wasm`), then re-verify a sample.
6. Promote a circuit's reality label to `full-zk` ONLY after a sample proof verifies (the
   `VERIFIED_FULL_ZK` allowlist in `CovexTerminal.jsx` is the single switch).
7. **New circuits worth adding:** sealed-bid auction, private balance/solvency proof, set
   non-membership (blocklist), VRF dice/deal with a real verifier, age-without-DOB (improve the
   existing one), private voting weight.

### 2.2 Non-custodial signing — widen coverage
- Extend `prepare-spend`/`submit-signed` beyond singlesig to hashlock/timelock/multisig/HTLC
  (emit per-kind sighashes + a satisfier template; accept preimage/extra-sig in submit).
- Real browser-extension wallets don't yet expose raw-sighash BIP340 signing — once one does (or
  via a PSKT flow), route non-dev redeems through it too. Until then dev-key-in-browser is fully
  non-custodial; the custodial path is the labeled fallback.

### 2.3 Mainnet go-live (Toccata, June 30)
- Keep `COVEX_MAINNET_COVENANTS_ENABLED=false` until the indexer is proven HA on a mainnet node.
- GATE 1 (indexer can't silently freeze) + GATE 2 (no value-bearing covenant before Covex is
  removable/licensed) — both now satisfiable given the trustless proof above.

### 2.4 Smaller hardening
- Auth on `/oracle/verify-and-sign` + a hard covenant_id binding (defense in depth).
- Anti-replay nonce on signed oracle outcomes.
- Off-site DB backups (covex.db now on /opt).

---

## 3. Feature upgrades worth building (suggestions)

- **Covenant background images** — DONE (URL or upload; rendered dimmed on the covenant page).
- **"Advanced/cool" visual pass** (next): animated DAG hero, covenant cards with depth/parallax,
  a live "value locked / covenants settled" counter from `/api/stats`, motion on the explorer,
  refined light+dark, an enforced-vs-decorative visual language. Keep it real-data only.
- **Recovery UX in-app**: a "Recover / verify off-chain" button on each enforced covenant that runs
  the `recover-covenant.mjs` logic in-browser — turns the trustless guarantee into a visible feature.
- **Shareable covenant cards / OG unfurls** per covenant (partly done) + a "proof of enforcement"
  badge that links to the on-chain redeem.
- **Builder presets**: a gallery of ready-made covenant templates (escrow, vesting, 2-of-3 treasury,
  HTLC swap, skill-game pot) one-click deployable via the enforced P2SH path.
- **More wallets**: 9 today (added OneKey). Add others as their injected Kaspa providers stabilize.
- **Watch-only / portfolio**: track covenants you created or can spend, with redeem reminders for
  timelocks.

---

## 4. Operating notes
- Build to `/opt` (`CARGO_TARGET_DIR=/opt/covex-target`); covex.db at `/opt/covex-db`. Frontend
  served from `/root/htp/public` (→ volume_root on sdb). See `[[covex-deploy-setup]]`.
- Relocating the DB / deleting node data needs explicit per-action authorization (the auto-mode
  classifier won't accept "continue developing" for those).
