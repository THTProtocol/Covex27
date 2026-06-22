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

## TIER 0 - DONE (19 real circuits, in-browser prover works, validity is a CONSTRAINED output)

No circuit work needed. These compute `output valid`/`output spent` from real constraints and
node-verify accept + tamper-reject:

`merkle_membership`, `age_verification`, `escrow_2party`, `range_proof`, `vrf_dice_roll`,
`nullifier_set`, `basic_utxo_ownership` (alias `utxo_ownership`), `hash_preimage`,
`timelock_absolute`, `relative_timelock`, `vrf_random`, `turn_timer`, `script_constraint`,
`pot_split_math`, `commitment_open`, `balance_threshold`, `solvency_sum`, `set_non_membership`,
`anon_membership_nullifier`.

Chores (not circuit-building):
- **Regenerate stale sample proofs.** 14 of these ship a `demo_proof.json` that no longer
  verifies against the current key (stale vector; the stack itself is consistent - vkey
  re-exported from the zkey matches the served vkey). Re-run fullProve and commit fresh samples.
- **Recover missing circom source** for `range_proof`, `hash_preimage`, `timelock_absolute`:
  the wasm/zkey are shipped and working, but there is NO `.circom` of that name in `zk/`. Commit
  the real source so these can be audited + rebuilt (currently un-rebuildable).

---

## TIER 1 - STUB CIRCUITS, MUST BE REWRITTEN (HIGH PRIORITY - they currently prove a tautology)

These have a `.circom` + `.r1cs`, but `valid` (or the conclusion) is a **public INPUT** that the
prover supplies, and the body does `valid === 1` while the real comparator output dangles
unused. **The proof proves nothing.** Rewrite each so the computation drives `output valid`
(e.g. `valid <== cmp.out;`), constrain the division/inequality properly, then build + ship.

| Circuit | Statement it MUST prove | Public signals (target) | Notes |
|---|---|---|---|
| `collateral_ltv` | debt*1e4 / collateral < maxLtv | currentLtv, **valid(out)**, covenantId | LessThan output is dangling; constrain LTV |
| `loan_health` | collateral*liqThreshold / debt > 1 | healthFactor, **valid(out)**, covenantId | same dangling-comparator bug |
| `collateral_liquidation` | debt >= threshold (liquidatable) | debt, threshold, **valid(out)** | |
| `financial_formula` | computed == f(principal,rate,periods) | computed, **valid(out)** | constrain the formula, not `valid===1` |
| `black_scholes_approx` | price within bound of BS(spot,strike,...) | spot, strike, price, bound, **valid(out)** | spot/price are EXTERNAL -> oracle provider feeds them |
| `auction_clearing` | clearPrice == 2nd-price rule(bids,reserve) | clearPrice, **valid(out)** | |
| `multi_sig_gating` | gateOpen == (sigCount >= threshold) | gateOpen, **valid(out)** | |
| `anon_credential` | attrValue >= minAttr under committed cred | credNullifier, **valid(out)** | constrain attr + nullifier derivation |
| `ml_inference_stub` | claimedOutput == model(privateInput) | claimedOutput, **valid(out)** | only meaningful for a tiny fixed model |
| `election_feed` | winner == argmax(tallyA,tallyB) >= threshold | winner, **valid(out)** | tallies are EXTERNAL -> oracle provider |

After rewrite, ALSO add the `covenantId` public input (cross-covenant replay binding) to any of
these meant to release a covenant, matching the Tier 0 pattern.

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

1. **Tier 1 rewrites** (10 circuits) - they currently lie; highest honesty value, small circuits.
2. **Tier 0 chores** - regenerate 14 stale samples + recover 3 missing sources.
3. **Tier 2 authoring** - `tictactoe_v1`, `connect4_v1` (small), reconcile `nullifier_v1`,
   `privacy_mixer_v1` (gated on legal).
4. **Tier 3 zkVM** - games, owner-scope, separate toolchain.

Honesty rule (absolute): do not register a circuit as full-zk / in-browser-prover until a real
proof node-verifies accept + tamper-reject, and never claim on-chain/chain-enforced ZK (Kaspa has
no pairing verifier; see `frontend/src/lib/zk/circuits.js` CHAIN_ENFORCED_ZK = empty).
