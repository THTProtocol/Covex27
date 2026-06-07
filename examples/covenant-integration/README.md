# Connecting ZK Circuits + Covex Oracle to Kaspa Covenants (Easy Mode)

This folder shows **exactly** how to wire any Covex circuit + oracle signature into a real Kaspa covenant using SilverScript (aa20-aa23 patterns, DAA timelocks, UTXO ownership, pot math, oracle pubkey binding).

## The 5-Minute Covenant Wiring Flow (works for all circuits)

1. **Pick a circuit_type** (canonical name from oracle registry or `zk/test_e2e_full_zk.js` or frontend ZK_CIRCUIT_TYPES):
   - Kaspa primitives: `basic_utxo_ownership`, `script_constraint`, `relative_timelock`, `turn_timer`, `pot_split_math`, `vrf_dice_roll`, `nullifier_set`...
   - Games/DeFi: `auction_clearing`, `poker_vrf_deal`, `collateral_ltv`, `loan_health`, `chess_ai_move`...
   - Feeds/Compute: `election_feed`, `financial_formula`, `verifiable_poker_solver`, `onchain_sig_verify`, `decentralized_liveness`...

2. **Prove or request outcome** (local or off-chain engine):
   - For circuits with artifacts: `node prove_<circuit>.js` (or the specific prove in subdirs).
   - Or just use `requested_outcome` for pure attested (oracle will sign whatever you claim, after any hybrid checks).

3. **Call the oracle** (one HTTP call):
   ```
   POST /api/oracle/verify-and-sign
   {
     "covenant_id": "my-poker-pot-42",
     "circuit_type": "pot_split_math",           // or auction_clearing, turn_timer, etc.
     "proof": { ... groth16 proof or {} ... },
     "public_inputs": ["1", "1000000000", "970000000"],
     "requested_outcome": 0
   }
   ```
   Response (covenant-ready):
   ```json
   {
     "success": true,
     "outcome": 0,
     "signature": "a1b2c3...",
     "timestamp": 1717...,
     "message": "covex-oracle:my-poker-pot-42:0:1717...",
     "public_inputs": [...],
     "circuit_type": "pot_split_math",
     "covenant_hint": "Use signature + outcome for covenant_id 'my-poker-pot-42'. Check against Covex oracle pubkey. circuit=pot_split_math"
   }
   ```

4. **Drop into your SilverScript covenant** (unlock script):
   - The `message` + `signature` (or the raw fields) become witnesses.
   - Use oracle pubkey (dev or future decentralized set) + `OP_CHECKSIG` / custom aa21-aa23 checks.
   - Combine with other conditions: selected-parent DAA timelock, current UTXO ownership (schnorr), pot split math already proven, etc.

5. **(Optional) Use the helper**:
   ```bash
   node zk/covenant-helper.js --covenant-id my-pot-42 --circuit pot_split_math --outcome 0 --sig <sig> --ts <ts>
   ```
   It prints ready-to-paste .sil snippets + witness comments.

## Concrete .sil Examples in this folder
- `turn_timer_covenant.sil` — only current player can act before DAA deadline (oracle + turn_timer proof).
- `pot_split_covenant.sil` — fair pot + fee split (pot_split_math + oracle).
- `collateral_auction_covenant.sil` — liquidation / auction clearing with LTV + price feed.
- `poker_vrf_covenant.sil` — VRF deal + equity + pot (multiple circuits + one oracle round).
- See also `../chess-modes/chess_covenant_mode_oracle.sil` and `../onchain-prep/utxo_ownership_covenant.sil` for more patterns.

## Oracle Signature Format (easy to verify on-chain later)
`covex-oracle:<covenant_id>:<outcome>:<timestamp>`

Dev oracle key is known; production will be decentralized (multi-oracle threshold + liveness endpoint already stubbed at `/api/oracle/liveness`).

## Adding Your Own Circuit (pluggable, everything stays compatible)
1. Add circom + compile (r1cs + wasm) → optional prove_ + verify_ script (copy pattern from `verify_auction_clearing.js` or `basic_utxo_ownership.js`).
2. One line in `backend/src/oracle_verifier.rs` `build_registry()` (HybridGroth16 or Attested).
3. (Optional) Add to `frontend/.../CovexTerminal.jsx` ZK_CIRCUIT_TYPES, `zk/test_e2e_full_zk.js`, `zk/circuit_registry.json`.
4. Add fixture or real proof + E2E case (keeps 0-fail guarantee).
5. Drop a new `xxx_covenant.sil` here + update this README.

The pluggable dispatcher (`verify_proof_for_circuit` + `determine_outcome_for_circuit`) + uniform verify script contract means **everything gets along** — new circuits automatically work with the oracle, E2E, frontend, and covenant examples.

## Current Reality (honest)
- 30+ E2E passes (0 fails), 40 r1cs, many with dev zkey/vkey/wasm.
- Most new circuits are Hybrid (real verify possible when you supply a proof generated with the zkey) or Attested (oracle signs the outcome you request / off-chain result).
- All feed into the exact same signed message format consumable by covenants today.

Run `node zk/test_e2e_full_zk.js` after any addition to prove compatibility.

See the main vision doc and `backend/src/oracle.rs` comments for the full evolution path (oracle sigs today → partial on-chain ZK as Kaspa scripting matures).
