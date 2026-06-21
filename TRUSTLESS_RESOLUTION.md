# Covex trustless resolution architecture

Principle: **Covex never resolves an outcome as a trusted party.** It runs no oracle key and
makes no server-side outcome decision. Every payout is gated by one of three trust-minimized
mechanisms below. Covex provides the tooling (circuits, covenant templates, provider connectors);
the chain and/or independent parties provide the trust.

Hard constraint that shapes everything: **Kaspa has no on-chain pairing/SNARK verifier.** A ZK
proof can never be checked by Kaspa consensus. So ZK verification happens OFF chain (by the
counterparty, or an external verifier), and the chain enforces only custody + signatures + hashlocks
+ timelocks. See `frontend/src/lib/zk/circuits.js` (CHAIN_ENFORCED_ZK is intentionally empty).

## Mechanism 1 - ZK proof (circom) for bounded provable statements

Use when the claim is a self-contained math/logic/crypto fact with private inputs:
- Privacy/identity: merkle membership, nullifiers, age/balance/solvency thresholds, anon credential.
- DeFi math: LTV, loan health, liquidation, interest formula, option no-arbitrage bounds (the INPUT
  price still comes from Mechanism 3 - the circuit only proves the math over it).
- Bounded games: connect4 / tic-tac-toe win-detection (fixed board), poker hand-ranking + VRF-fair
  deal (bounded combinatorics).

Verification (trustless options, pick per covenant):
- (a) Counterparty verifies the proof off-chain and co-signs a 2-of-2 release. Fully trustless for
  2 parties - the loser is convinced by the proof, signs; a timeout (Mechanism 2) handles refusal.
- (b) An external verifier/oracle-provider network verifies the proof and attests (Mechanism 3
  shape) for pots where a third party (tournament, spectator) must be convinced.

Covex's only role: ship the circuit + a working prover (in-browser or CLI) so anyone can prove and
anyone can verify. It does not verify-and-sign as an authority.

## Mechanism 2 - 2-of-2 + move-log + challenge/timeout covenant (full games, any 2-party deal)

This is the trustless resolution for games whose full rules are impractical as a circuit
(chess, checkers, go, draughts, full multi-street poker). NO zkVM, NO Covex.
- Stake locked in a 2-of-2 [playerA, playerB] covenant (Covex already proves 2-of-2 + custody).
- Each move is a signed tx payload, so the move log is on-chain, ordered by the DAG, and each move
  is authenticated by the mover (binds the game to the real players).
- Settlement: both co-sign the agreed result -> instant payout. If the loser goes silent to grief,
  the winner takes a **relative-timelock (CSV) forfeit path** after the challenge window (Covex has
  the `rcsv` primitive proven on testnet). 
- Dispute (loser claims an illegal move): the on-chain signed move log is the evidence. A light
  ZK/zkVM "legal up to move N" proof can be added later as an enhancement, but the timeout path
  already removes the need to trust Covex - worst case is a forfeit window, never a Covex decision.

Result: trustless chess/checkers/etc. TODAY with primitives Covex already has. zkVM is a future
nice-to-have, not a requirement (and is infeasible to prove on the current 7GB server anyway).

## Mechanism 3 - 3rd-party oracle attestation (real-life events)

For facts no circuit can prove (asset prices, sports, weather, elections), the covenant requires a
signed attestation from an EXTERNAL oracle provider - never Covex. Design = a generic, pluggable
provider registry so any current/future Kaspa oracle works:
- **Kaskad COB oracle** - LIVE today: TEE-attested consolidated-order-book fair price, sub-second.
- **Kaspa L1 miner-vote oracle** - announced, "coming soon" (attestation embedded in PoW consensus).
- **koracle / others** - plug in when they ship.

Covenant config carries `{provider_id, provider_pubkey, feed_id, format}`; the spend path verifies
the provider's BIP340 signature over the attested value (a normal OP_CHECKSIG the chain CAN do).
Multiple providers can be required (M-of-N) for trust-minimization. Covex ships the connector +
verification template; it is never itself a provider.

## What Covex removes (other workstream)

All Covex-run oracle logic: the COVEX_ORACLE_KEY co-sign, server-side determine_outcome, the
oracle_payout_handler / game-pot outcome determination. Those are replaced by Mechanisms 1-3.

## Build status (this workstream = the ZK side)

- 19 real circom circuits already work (in-browser prover, accept + tamper-reject verified).
- The 10 DeFi/feed "stub" circuits (validity was a prover-supplied input + `valid===1`, comparator
  dangling) are being rewritten so validity is a CONSTRAINED output. Reference done + verified:
  `collateral_ltv`. See `zk/ZK_BUILD_LIST.md`.
- Next: bounded game circuits (connect4, tic-tac-toe, poker hand-eval/VRF), regenerate stale
  samples, sync to `frontend/public/zk`, update the catalog honesty sets.
- Mechanism 2 covenant template + Mechanism 3 provider connector: design here; backend
  implementation coordinates with the oracle-removal workstream.
