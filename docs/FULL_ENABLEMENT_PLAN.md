# Covex Full Enablement Plan (non-custodial, no dev wallet, all functions live)

Goal (owner, full authority granted): every covenant function usable on Kaspa **mainnet** by
signing with the user's own wallet, **no server-signing dev wallet**, and game logic **ZK-attested**.
Website already displays **mainnet only**.

This is the trustless money-path completion. It moves real user funds, so it ships in a safe order:
**build -> test on TN12 -> security review -> deploy -> enable the mainnet gate LAST.** A bug in this
path is irreversible fund loss, so no step skips ahead of its proof.

## Current state (honest, corrected against the code by the 2026-07-02 audit)
- Non-custodial deploy AND spend on mainnet TODAY with the user's own wallet: singlesig, hashlock,
  timelock, relative-timelock (CSV), multisig, htlc, channel, deadman (backend deploy
  covenant_builder.rs:5933-5940/2704-2922; spend whitelist :5273-5289). No dev wallet involved.
- timedecay: mainnet deploys are FROZEN fail-closed (master 7ff208c7) because no Covex spend path
  can redeem the kind yet; unfreeze ships with the spend assembler (reuse
  build_timedecay_signature_script, :1324) plus a TN12 e2e of both threshold branches.
- Game pots: the hashlock pot is the live default and is allowed on mainnet (games.rs:436-441);
  the legacy oracle co-sign settle path stays frozen for value on mainnet.
- Oracle-enforced / oracle-escrow kinds and creator-resolvable binary_oracle_select: frozen for
  value on mainnet until the external-cosign keystone below lands.
- The frontend still dev-wallet-gates multisig / htlc / channel / deadman / timedecay deploys
  (EnforcedDeploy.jsx), so Phase B's remaining work there is frontend wallet-signing deploy flows,
  not new backend capability.
- Games settle via server engine-replay + a co-signature. NOT a ZK proof (correctly not labeled ZK).
- The external-cosign keystone is fully specified below (the binding question is RESOLVED, see the
  Binding verdict) but not built. The RISC0 games-ZK prover box is LIVE with a real verified chess
  Groth16 proof (see Phase C); the remaining games work is wiring + the settle sweep, not hardware.

## The program

### Phase A - External-cosign keystone (unblocks non-custodial for co-signed kinds)
- `POST /covenant/prepare-external`: returns sighash + spend_plan + a key-free
  `request_id = blake2b256("kaspa-covenant-resolve:v1" || covenant_tx_id || input_idx || winner_xonly || amount_le)`.
- `POST /covenant/submit-external`: ingests the resolver's 64-byte BIP340 sig, serializes
  `0x41 || sig64 || 0x01`, broadcasts. Covex contributes ZERO signature material.
- Gate strictly to `*_refundable` kinds (CSV refund so a silent resolver can never freeze funds).
- Build on the server (cargo), prove with a live TN12 end-to-end (deploy -> resolve -> spend), and get
  a focused security review (rubber-stamp verifier / serialization / replay). ONLY THEN mainnet.

### Phase B - Wire each dev-wallet kind to a non-custodial path, then delete the dev wallet
- Route multisig / htlc / channel / deadman / timedecay + markets / oracle-escrow through the keystone
  or client-side signing (the redeemer already supports several redeem paths).
- Once every kind has a proven non-custodial path, remove the server-signing dev wallet entirely.

### Phase C - Games, non-custodial + ZK-attested (prover box LIVE; wiring + sweep remain)
- Finish the `zk_game_settle` sweep + re-link (HIGH-RISK fund-movement; security review required).
- The RISC0 prover already produces a real, verified Groth16 proof on the live prover box; Kaspa
  consensus verifies it at spend (KIP-16 OpZkPrecompile). No oracle, no co-signature in the
  payout -> a loser cannot forge a win. Remaining: authenticated backend->prover wiring + the
  sweep, then TN12 e2e.

### Phase D - Enable on mainnet (LAST)
- Flip the fund gates (`COVEX_MAINNET_COVENANTS_ENABLED`, the per-kind gates, and for games
  `KASPA_ZK_PRECOMPILE_ENABLED`) only after A-C are TN12-proven + reviewed.

## The things authority alone cannot solve

### 1. A prover box - RESOLVED 2026-06-30 (owner provided the Hetzner token; box provisioned)
covex-prover is live at 178.105.179.55 with Docker + the pinned RISC0 toolchain, the built
`covex-games-prover`, a real self-verified chess Groth16 proof, and `prover-service` on
127.0.0.1:7720 (systemd, /healthz ok). What remains is wiring, not hardware: COVEX_PROVER_TOKEN +
a private channel, then backend env (COVEX_PROVER_URL / COVEX_PROVER_TOKEN /
COVEX_PROVER_IMAGE_ID). Standing cost roughly EUR 25/mo; the exposed Hetzner token used to
provision it must still be rotated by the owner.

### 2. Fund-risk acceptance + audit
This path moves real user funds. Before the Phase D mainnet enable, it should have a focused security
review (ideally third-party) and a green TN12 end-to-end. Confirm you accept this gate.

## What I will do (with authority, safely)
- Drive Phase A + B: write the keystone + kind wiring, build + prove on TN12 (server cargo), report
  each step. Hold the Phase D mainnet gate-flip for the safe checkpoint (proven + reviewed).
- Keep the website mainnet-only and the UI/builder at the highest premium level.
- Never claim a kind is live/non-custodial, or a game ZK-attested, until it truly is on a live TN12/
  mainnet transaction.

## Phase A build spec (ready to implement, TN12-safe) - rewritten 2026-07-02 per the audit's binding verdict

Buildable now, on TN12, behind `COVEX_EXTERNAL_COSIGN_ENABLED` (default off), NO prover box, NO mainnet gate:
- `derive_request_id` is a NEW standalone identifier. There is NO in-repo parity target: frontend
  `request.js` hashes canonical JSON with a different preimage, and `referee.rs` derives a
  per-outcome SECRET whose preimage includes private key material; both remain separate schemes and
  must not be merged with this. Exact encoding, with hand-computed unit-test vectors:
  `blake2b256(b"kaspa-covenant-resolve:v1" || covenant_tx_id_bytes(32) || input_idx_u32_LE || winner_xonly(32) || input_amount_u64_LE)`
  where `input_amount` is the LOCKED UTXO VALUE (the covenant input amount), NOT the fee-reduced
  payout output (the built tx pays `amount - TX_FEE`, covenant_builder.rs:4889-4891, so pinning the
  input amount is what keeps two honest implementations deriving the same id).
- `POST /covenant/prepare-external`: gate to `*_refundable` kinds whose embedded first-member key is
  the bound EXTERNAL resolver key (invert assert_covenant_bound_to_covex_oracle,
  covenant_builder.rs:4201); fetch covenant + UTXOs; build the unsigned tx with the SOLE output
  paying the verified winner (mirror :4886-4892); compute the SIG_HASH_ALL sighash (no Covex key);
  derive request_id; return `{sighash, request_id, spend_plan, kind, network}`. `spend_plan` must
  carry everything the resolver needs to reconstruct the digest independently: covenant_tx_id,
  input_idx, the input amount, the covenant script_public_key, the winner address + xonly, the
  payout amount, and the exact output script.
- `pending_external_resolve` session table in db.rs with ALL the guards the proven oracle payout
  path has, not TTL alone: (a) 10-min TTL, (b) SINGLE-USE consumption at submit (mirror
  covenant_builder.rs:5013-5046), (c) submit-time outpoint re-validation so a covenant spent
  between prepare and submit is refused (:4539-4568, :5084-5096), (d) the session row is persisted
  BEFORE any signable material is returned (:4950-4969).
- `POST /covenant/submit-external`: ingest the resolver's 64-byte BIP340 sig; Schnorr-verify it
  against the SIG_HASH_ALL sighash FAIL-CLOSED before any assembly; accept ONLY sighash type byte
  0x01 (the witness type byte is attacker-suppliable and kaspa-txscript's ALLOWED_SIG_HASH_TYPES
  includes NONE/SINGLE, so never serialize or accept any other); collect the WINNER's browser
  co-signature (the `*_refundable` kinds are 2-of-2) and assemble exactly like the oracle path
  (:2152); serialize `0x41||sig64||0x01`; broadcast. Covex key never touches the satisfier.
- Resolver-side rule (anti-blind-signing): the resolver MUST recompute the sighash from
  `spend_plan` and verify the sole output pays its decided winner BEFORE signing. It never signs a
  bare digest handed to it; request_id is only its off-chain decision handle.
- Seams: covenant_builder.rs (types + derivation + prepare/submit), db.rs (session table), main.rs
  (routes), signer.rs (gate the Covex-key path off for the external `*_refundable` path), oracle.rs
  (external xonly passed in, not the Covex key).
- TN12 e2e: deploy OracleEnforcedRefundable -> prepare-external -> external resolver signs ->
  submit broadcasts; the CSV refund-on-silence branch; and the failure modes: bad sig, wrong
  sighash type byte, expired session, REPLAY OF A CONSUMED SESSION, covenant spent between prepare
  and submit, non-refundable kind rejected, mainnet-without-flag rejected.

### Binding verdict (RESOLVED 2026-07-02; audit-verified against kaspa-txscript 0.15.0)
The external resolver signs a BIP340 Schnorr signature over
`calc_schnorr_signature_hash(spend_tx, input_idx, SIG_HASH_ALL)` - exactly what OP_CHECKSIG
recomputes and verifies (kaspa-txscript lib.rs:447) and exactly what the existing Covex-key cosign
path already signs (covenant_builder.rs:4910-4922); the resolver simply replaces the Covex key. The
resolver does NOT sign request_id for the on-chain spend; signing anything but the sighash makes
OP_CHECKSIG fail and freezes funds until the CSV refund.

Replay protection is INHERENT in the sighash, which commits the input outpoint (sighash.rs:172),
the P2SH script_public_key (:173), the input amount (:175), and all outputs (:133-140): a resolver
signature over covenant X cannot validate for covenant Y or for a different payout. The earlier
draft's worry that a sighash signature "could be replayed to spend a different covenant" was
factually wrong. request_id is OFF-CHAIN ONLY (the resolver's decision handle); it is never
embedded in the redeem script (the redeem binds by resolver pubkey,
redeem_oracle_enforced_refundable :1482-1510), and embedding it would produce an unreconstructable
P2SH and frozen funds. The legitimate residual risk is resolver-side blind-signing, addressed by
the anti-blind-signing rule above. This resolution matches docs/CONNECTING_AN_ORACLE.md:41-44,
which already specified it correctly. The focused security review before mainnet enable now checks
the IMPLEMENTATION against this spec (rubber-stamp verifier / serialization / session guards), not
the binding question, which is closed.

### Games-ZK (Phase C) - prover box LIVE 2026-06-30; wiring remains
The hardware blocker is GONE: covex-prover (Hetzner, 178.105.179.55) runs the built
`covex-games-prover` with the pinned RISC0 toolchain and produced a REAL chess Groth16 proof
("PROVED (groth16) + self-verified in 444.34s", RISC0_DEV_MODE=0), `verify` confirms it, and
`settle-spend` emits the on-chain KIP-16 payload. `prover-service` runs as systemd unit
`covex-prover` on :7720, bound to 127.0.0.1, /healthz ok. Remaining, in order: set
COVEX_PROVER_TOKEN + a private channel to the backend (SSH tunnel or WireGuard; never a public
bind without auth), point the backend at it (COVEX_PROVER_URL / COVEX_PROVER_TOKEN /
COVEX_PROVER_IMAGE_ID), finish the `zk_game_settle` sweep + re-link (HIGH-RISK fund movement;
security review required), TN12 e2e, and only then the Phase D gate.
