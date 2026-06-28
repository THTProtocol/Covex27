# Covex ZK build list (trustless pivot)

Generated 2026-06-21 by measurement (ran `snarkjs.groth16.verify` on every served circuit,
re-exported each vkey from its shipped zkey, read every `.circom` interface + body).

## Architecture context (why this list is split the way it is)

Covex is moving to **trustless**: its own enforcement is **ZK only**, and anything not
ZK-provable is resolved by **connecting external oracle providers** (Covex is NOT the oracle).
All Covex-run oracle logic (the co-sign key, server-side outcome determination, oracle payout)
is being removed (separate workstream / other agent).

Two hard facts shape every circuit below:
1. **Kaspa has no on-chain pairing verifier.** A Groth16 proof can never be checked by Kaspa
   consensus. So even a perfect circuit needs an *off-chain verifier* to attest the result on
   chain. Today that verifier is the external resolver (being removed). Trustless replacement =
   an external verifier/oracle-provider network attests the proof, OR the proof is only for a
   counterparty in an off-chain agreement. Building the circuit is necessary but NOT sufficient
   for trustlessness on Kaspa.
2. **A ZK proof can only prove math/logic over its inputs - never that an external real-world
   input is true.** Price, weather, sports, election tallies must come from an external oracle
   provider. The circuit proves the computation; the provider attests the input.

## Standard build pipeline (run on your PC, per circuit)

```
cd zk
circom2 <name>.circom --r1cs --wasm -o build/<name>          # needs circomlib in node_modules
# pick a ptau sized to the constraint count (pot14 ~16k, pot16 ~64k, pot18 ~256k)
snarkjs groth16 setup build/<name>/<name>.r1cs powersOfTau/pot<k>.ptau <name>_0.zkey
snarkjs zkey contribute <name>_0.zkey <name>_final.zkey --name="covex" -e="<entropy>"
snarkjs zkey export verificationkey <name>_final.zkey <name>_vkey.json
# ship: copy <name>.wasm + <name>_final.zkey + <name>_vkey.json -> frontend/public/zk/<name>/
# regenerate the sample so "verify it yourself" passes:
node -e "..." # fullProve a known witness -> frontend/public/zk/<name>/demo_proof.json
```

---

## TIER 0 - DONE (21 real circuits, in-browser prover works, validity is a CONSTRAINED output)

No circuit work needed. These compute `output valid`/`output spent` from real constraints and
node-verify accept + tamper-reject (and, where a false predicate is possible, the false case
produces a verifying proof with valid==0 - never a `valid<==1` stub):

`merkle_membership`, `age_verification`, `escrow_2party`, `range_proof`, `vrf_dice_roll`,
`nullifier_set`, `basic_utxo_ownership` (alias `utxo_ownership`), `hash_preimage`,
`timelock_absolute`, `relative_timelock`, `vrf_random`, `turn_timer`, `script_constraint`,
`pot_split_math`, `commitment_open`, `balance_threshold`, `solvency_sum`, `set_non_membership`,
`anon_membership_nullifier`, `merkle_range_membership`, `equality_of_commitments`.

The last two are new (zkwave 2026-06-28), built with a pot10/pot12 single-contributor dev
ceremony and registered StrictGroth16 only after a real proof verified, a tampered proof was
rejected, and a false-predicate witness (out-of-band value / mismatched commitment) produced a
verifying proof with valid==0:
- `merkle_range_membership` - prove a private (account, value) leaf is in a Poseidon Merkle set
  AND value is inside a public two-sided band [lo, hi]. Two-sided variant of merkle_leaf_threshold.
- `equality_of_commitments` - prove two public Poseidon commitments open to ONE hidden value
  (cross-context linking without disclosing the value).

The whole set is verified by `bash zk/scripts/zk_roundtrip_harness.sh` (prove from the SERVED
wasm+zkey, verify against the SERVED vkey, then tamper-reject) and gated in CI by
`scripts/check-zk-registry.sh` (the registry may not claim a circuit without a served key).

Chores (not circuit-building):
- **Regenerate stale sample proofs.** 14 of these ship a `demo_proof.json` that no longer
  verifies against the current key (stale vector; the stack itself is consistent - vkey
  re-exported from the zkey matches the served vkey). Re-run fullProve and commit fresh samples.
- **Recover missing circom source** for `range_proof`, `hash_preimage`, `timelock_absolute`:
  the wasm/zkey are shipped and working, but there is NO `.circom` of that name in `zk/`. Commit
  the real source so these can be audited + rebuilt (currently un-rebuildable).

---

## TIER 1 - SOURCE REWRITTEN + SOUND, NO SERVED PROVING KEY YET (not-yet-claimable)

UPDATE 2026-06-25: the old "they currently prove a tautology" claim is STALE. The Tier-1
`.circom` sources on `master` have been rewritten so `valid` is a **constrained `signal output`**
driven by the real comparator (e.g. `valid <== withinLtv.out;`, `valid <== healthy.out;`,
`valid <== met.out;`), with per-input `Num2Bits(64/32)` range checks that also reject negative /
field-wrap (p-k) forgeries before the comparator. **The proofs now prove the real relation, not a
tautology.** The remaining gap is artifacts, not soundness: each ships a served `_vkey.json` +
`.wasm` (verify scripts index the validity signal correctly), but there is **NO served
`_final.zkey`**, so an in-browser prover cannot produce a proof yet and the claim is unprovable
end-to-end. Until a trusted setup ships the served zkey, the backend registers these so they are
NOT presented as claimable (see `oracle_verifier.rs`):

- `collateral_ltv`, `loan_health`, `financial_formula` -> registered `SourceOnlyNoZkey`
  (`circuit_requires_crypto_proof == false`; `verify_proof_for_circuit` fails closed; the oracle
  never signs their outcome). NOT Groth16-claimable, NOT attested-with-a-caller-chosen-outcome.
- `multi_sig_gating`, `anon_credential` -> source + served vkey/wasm now exist (the old "NO real
  circuit / rubber-stamp delegator" note is stale), but no served zkey either; left `Attested`
  (oracle refuses to sign their outcome, so never a forgery path) rather than promoted to
  Hybrid/Strict, because a Hybrid with no zkey would falsely advertise them as claimable.

| Circuit | Statement it now PROVES (constrained) | Source | Served vkey/wasm | Served zkey | Backend registration |
|---|---|---|---|---|---|
| `collateral_ltv` | debt*1e4 <= collateral*maxLtv (`valid <== withinLtv.out`) | rewritten, sound | yes | NO | `SourceOnlyNoZkey` |
| `loan_health` | collateral*liqThreshold >= debt (`valid <== healthy.out`) | rewritten, sound | yes | NO | `SourceOnlyNoZkey` |
| `financial_formula` | computed == f(principal,rate,periods) (`valid <== eq.out`) | rewritten, sound | yes | NO | `SourceOnlyNoZkey` |
| `collateral_liquidation` | debt >= threshold (`valid <== liquidatable.out`) | rewritten, sound | yes | NO | Attested (source-only) |
| `auction_clearing` | clearPrice obeys 2nd-price + reserve (`valid <== ...`) | rewritten, sound | yes | NO | HybridGroth16 (downgrade candidate, see below) |
| `multi_sig_gating` | gateOpen == (sigCount >= threshold) (`valid <== met.out`) | rewritten, sound | yes | NO | `Attested` (source exists, not claimable) |
| `anon_credential` | attrValue >= minAttr under committed cred (`valid <== meetsMin.out`) | rewritten, sound | yes | NO | `Attested` (source exists, not claimable) |
| `black_scholes_approx` | price within bound of BS(...) | rewritten | yes | NO | Attested; spot/price are EXTERNAL -> oracle provider |
| `ml_inference_stub` | claimedOutput == model(privateInput) | stub | yes | NO | Attested; only meaningful for a tiny fixed model |
| `election_feed` | winner == argmax(tallies) >= threshold | n/a | yes | NO | HybridGroth16 (downgrade candidate; tallies are EXTERNAL -> oracle provider) |

DOWNGRADE CANDIDATES (same honesty gap, not changed in the 2026-06-25 pass): `auction_clearing`
and `election_feed` are still registered `HybridGroth16` despite shipping no served `_final.zkey`,
so they are presented as Groth16-claimable yet are unprovable. A Hybrid with no zkey fails closed
on a bodyless proof (no forgery path), but the claimable label is dishonest; they should follow
`collateral_ltv` to `SourceOnlyNoZkey` (or get a served zkey). `election_feed` additionally
depends on an EXTERNAL tally, so it belongs with the oracle-provider set regardless.

Remaining work for the rewritten + sound ones is the trusted setup + served `_final.zkey`
(owner/ceremony-gated), then add the `covenantId` public input (cross-covenant replay binding,
matching the Tier 0 pattern) and promote the registration to Strict/Hybrid. Do NOT register any
of these as claimable until a real proof node-verifies accept + tamper-reject against the SERVED
zkey+wasm (a sound `.circom` does not imply sound served artifacts).

---

## TIER 2 - MISSING CIRCOM SOURCE (author from scratch, or recover, before it can be built)

Served (vkey, sometimes wasm/zkey) but NO `.circom` in the repo:

| Circuit | State | Action |
|---|---|---|
| `privacy_mixer_v1` | Hybrid, vkey-only, no source | Author a withdrawal circuit (Merkle membership + nullifier, like `anon_membership_nullifier`). LEGAL/sanctions caveat - owner/counsel gate before shipping |
| `tictactoe_v1` | Hybrid, vkey-only, no source | Author a small board win/legal-move circuit, OR move to zkVM replay (see Tier 3) |
| `connect4_v1` | Hybrid, vkey-only, no source | Same as tictactoe |
| `nullifier_v1` | vkey-only, no source | Almost certainly a stale alias of `nullifier_set` - reconcile or delete, do not rebuild |
| `chess_ai_move` | vkey-only, circuit was REMOVED | Not feasible as circom (rules + checkmate explode constraints). zkVM only if wanted (Tier 3) |

---

## TIER 3 - GAMES: realistically zkVM, not circom

A full game-rules circuit (chess especially) is impractical in circom (the removed
`chess_ai_move` / `risc0_guests/chess_*` attempts prove this). The trustless path for games is a
**zkVM (RISC0 / SP1) proof of a deterministic engine replay of the signed move log**, producing
a succinct proof that "this move log is legal and yields winner W." Candidates:
- chess, tictactoe, connect4, draughts, etc. -> zkVM replay proof.
- `poker_vrf_deal` (VRF shuffle/deal) IS circom-feasible and already verifies a sample - keep.
- `poker_equity`, `verifiable_poker_solver` have circom + r1cs but are heavy; finish trusted
  setup + prover, or move to zkVM if constraint count is prohibitive.

This is a large, owner-scope effort (new prover toolchain) - flag, do not assume.

---

## NOT A CIRCUIT - EXTERNAL ORACLE PROVIDER (do NOT build a ZK for these)

A circom that "proves" an external fact is theater. These resolve via the new external
oracle-provider connector, not a circuit:
- Price / market-data feeds (also feed the DeFi circuits' inputs in Tier 1)
- `weather_feed`, real `election` results/tallies, sports scores
- `decentralized_liveness`, `onchain_sig_verify` (attests an external signature/event)
- The long tail of "vision" attested circuit ids in `ZK_CIRCUIT_TYPES`

---

## Suggested build order on your PC

1. **Tier 1 trusted setup + served zkey** - the rewrites are DONE and sound; the remaining work
   is shipping a served `_final.zkey` for each (owner/ceremony-gated), then binding `covenantId`
   and promoting the backend registration to Strict/Hybrid. Until then they stay not-claimable.
2. **Tier 0 chores** - regenerate 14 stale samples + recover 3 missing sources.
3. **Tier 2 authoring** - `tictactoe_v1`, `connect4_v1` (small), reconcile `nullifier_v1`,
   `privacy_mixer_v1` (gated on legal).
4. **Tier 3 zkVM** - games, owner-scope, separate toolchain.

Honesty rule (absolute): do not register a circuit as full-zk / in-browser-prover until a real
proof node-verifies accept + tamper-reject, and never claim on-chain/chain-enforced ZK (Kaspa has
no pairing verifier; see `frontend/src/lib/zk/circuits.js` CHAIN_ENFORCED_ZK = empty).
