# Covex trustless games: on-chain ZK settlement (KIP-16 OpZkPrecompile)

How a Covex 2-player game pot pays the winner with NO referee and NO Covex co-sign: the winner
proves the game on-chain, and Kaspa consensus (not Covex) verifies the proof. This is Stage 5 of
`docs/ZK_ONCHAIN_PLAN.md`. It states plainly what is PROVEN today and what is still pending the
Stage-4 seal, so nothing here overclaims.

## TL;DR (honest status)

- **PROVEN (Stages 0-3, master 73b926be):** the Kaspa `OpZkPrecompile` opcode (`0xa6`, tag `0x20` =
  BN254 Groth16) is live + active on the Covex TN12 covenant node; a known-good Groth16 proof
  verifies on-chain and a forged one is rejected by consensus, both inside a Covex-built P2SH. See
  `docs/zk_precompile_abi.md` for the byte-exact ABI frozen from the node source.
- **BUILT (this stage, Stage 4 plumbing):** the deploy path can lock a 2-player `ZkGameSettle` pot
  (baked VK + 5 public inputs + winner key + CSV refund), and the non-custodial spend path assembles
  the winner-branch witness (the winner signs in their own wallet; the server signs nothing) and the
  CSV refund-branch witness. The witness byte order and the alt-stack stack choreography are
  unit-tested against the frozen ABI, and the alt-stack reorder is proven on-chain on TN12 with a
  witness-supplied known-good proof (accept) + a forged witness proof (reject).
- **PENDING (Stage 4 decisive):** a LIVE full-game settlement transaction. It needs a real
  RISC0->Groth16 receipt for a real game, which requires the Docker `stark2snark` wrap (the 7GB
  server cannot do it; a dev/GPU/Bonsai box does). The on-chain verification is proven against the
  node verifier, but a complete play -> prove -> settle tx has NOT yet been recorded. The kind is
  gated OFF by default (`KASPA_ZK_PRECOMPILE_ENABLED`) and rejected on mainnet (Toccata is not live
  on Kaspa mainnet yet).

## The model

A finished 2-player game is replayed ONCE in a RISC0 zkVM guest (`covex_games::replay`), which
decides the winner under the real rules of the game plus a chess-style clock. The guest commits a
two-frame journal: the `GameResult`, then a self-sufficient `SettlementJournal`
(`{ covenant_id, winner_code, winner_pubkey = players[winner], stake_sompi, moves_digest }`). The
receipt is wrapped STARK -> Groth16, and the settlement covenant verifies that Groth16 proof
on-chain via `OpZkPrecompile`.

The settlement covenant (winner branch + CSV refund branch):

```
OP_IF
  OpToAltStack                       ; 0x6b: stash the witness-supplied proof
  <in4> <in3> <in2> <in1> <in0>     ; baked Groth16 public inputs (reverse order, in0 nearest top)
  <n=5>                              ; input count
  OpFromAltStack                     ; 0x6c: restore the proof -> stack: in4..in0, n, proof
  <vk>                               ; baked compressed BN254 verifying key
  OpData1 0x20                       ; tag (Groth16)
  0xa6  (OpZkPrecompile)             ; verifies on-chain; aborts the tx on a bad proof; else pushes TRUE
  OP_DROP                            ; consume the TRUE
  <winner_pubkey> OpCheckSig         ; only the journal-bound winner key can spend
OP_ELSE
  <min_sequence> OpCheckSequenceVerify <refund_pubkey> OpCheckSig   ; CSV liveness refund
OP_ENDIF
```

The VK, the 5 public inputs, the winner key, and the refund key are EXACT-DATA pushes baked into the
lock script at deploy. The Groth16 proof is the ONLY witness-supplied item on the winner branch.

### Why the alt-stack ops

A Kaspa P2SH witness (signature_script) runs BEFORE the redeem script, so its items land at the
BOTTOM of the stack. But `OpZkPrecompile` needs the proof BETWEEN the baked `n` and the baked `VK`.
So the winner-branch witness pushes (bottom -> top) `[winner_sig, proof, OP_TRUE]`; `OP_IF` pops the
`OP_TRUE`, `OpToAltStack` lifts the `proof` off the top onto the alt stack (leaving `winner_sig`
inert at the bottom), the baked `in4..in0` + `n` are pushed, `OpFromAltStack` restores `proof` on
top (now `in4..in0, n, proof`), then the baked `VK` + tag complete the exact ABI stack the opcode
pops. After the verify + `OP_DROP`, the baked `winner_pubkey` is pushed and `OpCheckSig` consumes
`[winner_pubkey, winner_sig]`. This is why the inputs are BAKED, not witness-supplied: see the
soundness note below.

## Why a loser cannot forge a win

1. **No receipt for an illegal/unfinished game.** `covex_games::replay` returns `Err` the instant a
   move is illegal, the clock is malformed, or the game is unfinished; the guest turns that into a
   panic, so the prover CANNOT produce a receipt. A valid receipt therefore attests every move was
   legal and the committed winner is genuine. (Card/board-commitment games add a second gate: a
   forged deck / hidden board fails the commitment check inside `replay`, so again no receipt.)
2. **Consensus verifies the proof, not Covex.** `OpZkPrecompile` runs the ark-groth16 verifier
   INSIDE the Kaspa node. A forged Groth16 proof aborts script evaluation and the spend tx is
   rejected by the network. There is no Covex key and no Covex signature anywhere in this path.
3. **The proof is bound to THIS pot + THIS winner.** The 5 Groth16 public inputs include the claim
   digest (`c0`, `c1`), which folds the RISC0 `ReceiptClaim` -> the journal -> `{ covenant_id,
   winner_pubkey, stake, moves_digest }`. Because the inputs are BAKED in the lock script, a spender
   cannot swap in a different game's inputs: a different `covenant_id` or `winner_pubkey` changes the
   claim digest, changes `c0`/`c1`, and the pinned VK no longer verifies. (If the inputs were
   witness-supplied, a spender could pair this pot with an unrelated valid receipt; that is why they
   are baked. This is the single load-bearing soundness decision.)
4. **Only the active player can sign.** The trailing `<winner_pubkey> OpCheckSig` requires a Schnorr
   signature from the journal-named winner key over the spend's sighash (which commits the payout
   output), so even a valid proof cannot redirect the funds to anyone but the winner.
5. **Cross-pot replay is blocked.** `covenant_id` (the deploy tx id) is inside the journal and thus
   inside the baked inputs, so a proof for pot A cannot settle pot B.

## What this RETIRES

- **The referee.** Earlier Covex games settled via a server-side game referee that recomputed the
  winner and the oracle co-signed the payout. With on-chain ZK, the covenant itself verifies the
  winner's proof; no referee recompute is needed for the payout.
- **The Covex oracle co-sign.** The `oracle_escrow` / `oracle_enforced` kinds put the Covex oracle
  key in the payout path (the chain required the disclosed oracle's signature). `ZkGameSettle` has NO
  oracle key in either branch: consensus verifies the proof, and the winner (or, on timeout, the
  funder) signs in their own wallet. The unit test `zk_game_settle_deploy_is_deterministic_and_
  covex_free` asserts the redeem embeds no Covex oracle key.

## Residual trust (stated plainly)

- **The `covex-games` rules crate is the trusted core.** The whole guarantee rests on `replay`
  correctly deciding the winner under each game's real rules + the clock. A rules bug is a real bug;
  the crate ships negative tests (illegal move -> `Err`) and known-result games, but it is the part
  you must trust. The ZK proves the guest ran THESE rules to completion, not that the rules are the
  rules you wanted.
- **Image-id pinning => a guest upgrade needs a covenant redeploy.** The covenant binds one frozen
  guest image (the single shared multi-game image, `GAMES_GUEST_ID`) via the VK + the control-root
  public inputs. Changing the guest changes the image id, which changes the claim, which the pinned
  VK no longer verifies. So upgrading the rules means redeploying new covenants; old pots settle
  under the old image. This is a feature (a guest swap cannot retroactively change a live pot) and a
  constraint (no in-place upgrade).
- **Liveness via the CSV refund.** If no winning proof is ever produced (a stuck game, a lost key, a
  prover outage), the funder reclaims the pot through the `OP_ELSE` relative-timelock (CSV) branch
  after `min_sequence` units. The refund branch is signed entirely by the funder in their own wallet;
  it never pays a false winner, it only returns the stake.
- **Payee-id correspondence is the deployer's job.** The journal's `winner_pubkey` is
  `players[winner]`, a 32-byte player id chosen by the deployer. The covenant's trailing `OpCheckSig`
  verifies a secp256k1 x-only key baked at deploy. The deployer must make the two consistent (bake
  the x-only key that corresponds to `players[winner_index]`); `covex-games-onchain` surfaces both so
  the caller can, but it does not (and cannot) assert the deployer's id scheme. A draw
  (`winner_code == 2`) has an all-zero payee and is a 50/50 split, which the single-winner branch
  does not cover; the helper rejects a draw rather than emit a zero payee.
- **The pre-HF opcode caveat.** `OpZkPrecompile` lives on the rusty-kaspa `toccata` branch and is
  active on TN12 from genesis (`covenants_activation: always()`); on mainnet it activates at the
  Toccata hard fork (not live yet). The opcode number / tags / Fr layout could still change before
  the HF, which is exactly why the kind is env-gated off and mainnet-rejected, and why the backend
  emits `0xa6` (and `0x6b`/`0x6c`) as raw bytes rather than upgrading the whole node to the unaudited
  pre-HF rev.

## The Stage-4 path (what makes it a real game)

Once a real game receipt exists (Docker `stark2snark`):

1. Produce the RISC0->Groth16 `Receipt` for the finished game (guest replays it, commits the
   two-frame journal).
2. Call `covex_games_onchain::game_settle_spend_from_receipt(&receipt)` -> `{ proof, the 5 public
   inputs, covenant_id, winner_pubkey, winner_code, stake }`.
3. Deploy a `ZkGameSettle` covenant baking that VK + those 5 inputs + the winner x-only key + a CSV
   refund (via `POST /covenant/p2sh/deploy` with `kind: "zk_game_settle"`).
4. The winner calls `POST /covenant/p2sh/prepare-spend` (branch `winner`), signs the returned sighash
   in their wallet, and calls `POST /covenant/p2sh/submit-signed` with `signature_hex` + `proof_hex`.
   The server assembles the witness and broadcasts; it holds no key.
5. The node verifies the proof on-chain via `OpZkPrecompile` and pays the winner. On timeout, the
   funder uses branch `refund` (CSV) instead.

## Cross-references

- `docs/ZK_ONCHAIN_PLAN.md` - the full stage plan and the proven Stage 0-3 facts.
- `docs/zk_precompile_abi.md` - the byte-exact KIP-16 ABI frozen from the live TN12 node.
- `zkvm/onchain/src/lib.rs` - `from_receipt` (receipt -> on-chain Groth16 material) and
  `game_settle_spend_from_receipt` (the Stage-4 bridge to the spend plumbing).
- `backend/src/covenant_builder.rs` - `redeem_zk_game_settle` (the settlement lock script),
  `build_zk_game_settle_winner_satisfier` / `build_zk_game_settle_refund_satisfier` (the spend
  witnesses), the deploy dispatch (`kind: "zk_game_settle"`), and the non-custodial prepare/submit
  wiring + the ignored TN12 e2e tests.
- `zkvm/games/src/lib.rs` - `replay` (the honesty gate) and `settle` (the self-sufficient journal).
