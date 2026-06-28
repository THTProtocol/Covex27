# Connecting an oracle to Covex

Covex is not an oracle. It runs no oracle key as a trusted party and decides no outcome. Users
bring an external oracle provider and bind it to a covenant; Covex ships the connector and the
on-chain verification only. This document is the exact, provider-agnostic formula any Kaspa oracle
operator follows to connect. It names no specific provider and endorses none.

There are two binding paths. Path 1 is the fully working, zero-custom-code path today. Path 2 is
specified for completeness but is not yet wired for external operators (see the honest status note).

## Path 1 - hashlock reveal (recommended; the only zero-custom-code path today)

The provider commits to two secrets and reveals exactly one to settle. The chain enforces the
reveal with `OpBlake2b`; the provider signs nothing per spend and is never in the payout
transaction.

1. COMMIT. For each binary market generate two independent 32-byte secrets `s_A`, `s_B` from a
   CSPRNG. Publish only `h_A = blake2b256(s_A)` and `h_B = blake2b256(s_B)` as lowercase 64-hex.
   Never publish a secret early; never reuse a secret across markets.
2. DEPLOY. The creator deploys kind `binary_oracle_select` with redeem fields `hash_a_hex = h_A`,
   `hash_b_hex = h_B`, the two winner x-only secp256k1 (BIP340) keys, and a funder refund key. On
   mainnet the published-hash path is mandatory (deployer-preimage self-resolve is disabled).
3. RESOLVE. When outcome A occurs, reveal exactly one secret `s_A`. The winner spends on-chain:
   `OpBlake2b(revealed) == committed-hash` AND their `OpCheckSig`.
4. NO-SHOW. Reveal neither secret and the funder reclaims via the refund key after the BIP68 CSV
   delay. Trustless by construction; provider silence can never strand funds.

Parity rules: hash is `blake2b256` (NOT sha256) of the raw 32-byte secret; hashes are lowercase
64-hex; the chain enforces `blake2b256(secret) == hash` at spend.

## Path 2 - signature cosign (oracle_enforced / oracle_escrow) - not yet connectable for external operators

Honest status: today the spend handler signs with the built-in default key, so an externally bound
key cannot produce the matching signature at spend and that branch is unspendable. Until the
external-cosign endpoint ships, bind an external key only on a `*_refundable` kind (so silence
cannot freeze funds) and treat this path as not-yet-wired. The spec below is what it will require.

1. KEY. Hold a 32-byte x-only secp256k1 BIP340 key; expose it as a 64-hex `provider_pubkey`.
2. BIND. The creator deploys with `redeem.oracle_pubkey_hex = <your 64-hex x-only key>`, always a
   `*_refundable` kind.
3. COSIGN. At settlement, produce a BIP340 Schnorr signature over the Kaspa spend sighash
   `calc_schnorr_signature_hash(spend_tx, input_idx, SIG_HASH_ALL)`. Verify the transaction pays the
   correct winner before signing (SIG_HASH_ALL commits that output). Serialize as the 65-byte
   witness push `0x41 || sig64 || 0x01`.
4. REQUEST_ID (proposed, key-free, recomputable by both sides):
   `request_id = blake2b256( "kaspa-covenant-resolve:v1" || covenant_tx_id || input_idx || winner_xonly || amount_le )`,
   lowercase 64-hex.

## Off-chain attestation format (informational only; never spendable)

A provider may publish a public attestation for UIs and audits. It is never consumed by any
covenant's `OpCheckSig`, so it must not be advertised as on-chain enforcement.

```
message   = ASCII  resolver-attest:v1:{request_id}:{outcome}:{timestamp}
digest    = sha256(message)
signature = BIP340 Schnorr over digest, verified against the x-only provider key
```

`outcome` is `0` (A / proven), `1` (B / rejected), or `2` (draw); `timestamp` is unix seconds.
For k-of-n, publish one signature per provider over the same digest and require a threshold.

## The checklist (what "flawless" requires)

- secp256k1 BIP340 x-only key, published as 64-hex.
- For Path 1: `blake2b256` commit/reveal, lowercase 64-hex hashes, one-secret-per-outcome, never
  early, never reused.
- For Path 2 (when wired): BIP340 over the spend sighash with SIG_HASH_ALL, the `0x41||sig64||0x01`
  witness serialization, and winner-output verification before signing.
- Always pair an external binding with a `*_refundable` kind so the funder can reclaim on silence.
- Covex binds by key alone; no shared code, no Covex key, no Covex outcome decision.

## Status

- Path 1 (hashlock reveal) is live and is the supported way to connect any oracle with zero custom
  code.
- Path 2 (signature cosign) needs the external-cosign endpoint (`prepare` returns the sighash;
  `submit-external` ingests the provider's signature) plus the key-free `request_id` above. Until
  then the deploy UI restricts external-key binding to `*_refundable` kinds and says so.
- The KIP-16 on-chain ZK path (`zk_game_settle`) verifies a RISC0-Groth16 proof in Kaspa consensus
  and needs no oracle for a self-contained provable statement; it is testnet-gated until proven
  live. See `docs/ZK_ONCHAIN_PLAN.md`.
