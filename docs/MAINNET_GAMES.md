# De-oracled games on mainnet (Toccata) readiness checklist

This is the operator checklist for running the de-oracled games money path on Kaspa
mainnet at the Toccata covenant hard fork. It is honest about what is trustless, what
is trust-minimized, and what residual trust cannot be removed on Kaspa.

The de-oracled path is `settle_mode="hashlock"` (the default for new game pots). A pot
is a `binary_oracle_select` covenant that holds two referee outcome hashlocks and the
two player keys. The Covex oracle key and the referee key appear NOWHERE in the redeem:
the winner spends the covenant with their OWN signature after the referee reveals the
winning outcome's secret. See `docs/DEORACLE_PLAN.md` for the staged design.

## The covenant (what the chain enforces)

Redeem script built by `redeem_binary_oracle_select` (backend/src/covenant_builder.rs):

```
OP_IF                       # branch A: player1 / outcome A wins
  OP_BLAKE2B <H_A> OP_EQUALVERIFY     # reveal the secret whose blake2b256 == H_A
  <winner_a_xonly> OP_CHECKSIG        # spent by winner A's OWN key
OP_ELSE
  OP_IF                     # branch B: player2 / outcome B wins
    OP_BLAKE2B <H_B> OP_EQUALVERIFY   # reveal the secret whose blake2b256 == H_B
    <winner_b_xonly> OP_CHECKSIG      # spent by winner B's OWN key
  OP_ELSE
    <min_sequence> OP_CHECKSEQUENCEVERIFY   # CSV relative timelock (refund window)
    <refund_xonly> OP_CHECKSIG              # funder (player1) reclaims on referee silence
  OP_ENDIF
OP_ENDIF
```

### Opcodes used (all standard Toccata-covenant opcodes)

`OP_IF`, `OP_ELSE`, `OP_ENDIF`, `OP_BLAKE2B`, `OP_EQUALVERIFY`, `OP_CHECKSIG`,
`OP_CHECKSEQUENCEVERIFY` (CSV / BIP68 relative locktime), plus data pushes.

There are NO covenant introspection opcodes (no OpTxInputAmount / OpTxOutputSpk / etc.)
in this redeem. `OP_BLAKE2B`, `OP_CHECKSIG`, and `OP_CHECKSEQUENCEVERIFY` are standard
script opcodes available on mainnet since Crescendo; CSV is proven live on TN12 (see the
`rcsv` primitive). The covenant is valid the moment the Toccata covenant-enabled kaspad
is live on mainnet.

## Environment to set before running games on mainnet

| Env var | Required on mainnet | Purpose |
| --- | --- | --- |
| `REFEREE_KEY` | YES, a 64-hex (32-byte) secret | The referee's hashlock-secret root. MUST be set on mainnet: the referee FAILS CLOSED without it (no publicly-derivable dev seed on mainnet). MUST be DISTINCT from `COVEX_ORACLE_KEY` (the code panics if they are equal). The referee key is NOT a covenant signer; it never appears in a redeem. |
| `COVEX_ORACLE_KEY` | Set if any legacy oracle path is used | The Covex oracle secret. Separate trust root from the referee. The de-oracled hashlock path does not use it; keep it distinct from `REFEREE_KEY`. |
| `COVEX_GAMES_PROVER_BIN` | YES on mainnet | Absolute path to a built `covex-games-prover` binary that can `verify <receipt>` a RISC0 receipt against its pinned guest image id. Without it, the mainnet ZK gate cannot verify a supplied proof and a proofless settle is refused, so mainnet games cannot settle. Provision it on a host that has the binary built (the WSL/RISC0 build method in the zkVM games notes). |
| `COVEX_GAMES_ZK_REQUIRE` | Not needed on mainnet | Forces a verified receipt mandatory on testnets. On MAINNET a verified receipt is FORCED mandatory regardless of this flag (`zk_required_for_network` returns true for any `mainnet*` label). Set it to `true` on a testnet only if you want to exercise the require path there. |
| `COVEX_MAINNET_COVENANTS_ENABLED` | YES, `true`, ONLY once Toccata is live | The Toccata node gate. Until set, the backend refuses to deploy ANY mainnet covenant and the crawler indexes zero mainnet covenants. Do not flip until the covenant-enabled kaspad is actually live on mainnet. |

## The mainnet money gates (both must pass; fail closed)

`settle-pot-hashlock` (backend/src/games.rs) enforces two gates before the referee
reveals any secret:

1. SERVER GATE (`game_pot_outcome`): a server-authoritative replay of the recorded
   move log, fail closed. Decides the winning side. This is a SERVER CHECK; it is
   sound only if you trust the server's replay of the recorded moves.
2. ZK GATE (`referee_zk::run_gate_for_network`): a real RISC0 zkVM receipt, verified by
   `COVEX_GAMES_PROVER_BIN` against the prover-pinned guest image id, with its committed
   journal bound to THIS match (committed winner == server outcome AND committed
   moves_digest == sha256 of this match's move log). On MAINNET this gate is FORCED
   mandatory: a missing receipt, an unconfigured prover binary, or an unverifiable
   receipt all FAIL CLOSED and no referee secret is revealed. Real money never settles
   on the server replay alone.

On a testnet the ZK gate is optional defense-in-depth (a supplied receipt is still
verified and bound; absence falls back to the server gate, disclosed honestly in the
response) unless `COVEX_GAMES_ZK_REQUIRE=true`.

## What is trustless vs trust-minimized vs residual trust

TRUSTLESS (the inscribed redeem, chain-enforced, no Covex/referee key in it):
- The two spend branches require revealing the secret whose `blake2b256` equals the
  committed hashlock (`OP_BLAKE2B ... OP_EQUALVERIFY`) AND a signature from the named
  winner's OWN key (`OP_CHECKSIG`). The chain decides who can spend.
- The refund branch is a CSV relative timelock to the funder (player1). If the referee
  stays silent, the funder reclaims the stake after the lock window with their OWN key.
  No Covex action is needed or possible to refund.
- Covex holds no key on this spend path and signs nothing on the settle or the refund.

TRUST-MINIMIZED (the referee reveal, gated by the ZK proof on mainnet):
- The referee is a secret-REVEALER, not a covenant signer. It reveals only the WINNING
  outcome's secret once the gates pass. On mainnet that reveal is released only when a
  real zkVM proof attests the move log is a legal, terminal game the named winner won
  and the proof binds this exact match. So the referee cannot, on mainnet, release a
  secret for a game it cannot cryptographically justify.

RESIDUAL TRUST that cannot be removed on Kaspa (state plainly, no overclaim):
- A LYING-BUT-LIVE referee. Kaspa has no introspection opcodes that could force a
  winner-takes-all forfeit on-chain, so a single non-player revealer is the only sound
  forced winner-takes-all construction. A referee that is online but dishonest could, in
  principle, collude. The ZK proof on mainnet binds the reveal to a legal terminal game
  with the named winner, which sharply narrows this (the referee cannot release a secret
  for a result the proof does not support), but the game-result-to-secret mapping is
  still performed by the referee. CSV covers SILENCE (the funder reclaims), NOT a liar.
- Off-chain ZK soundness. Kaspa has no on-chain pairing/STARK verifier; the RISC0 receipt
  is verified off-chain by the prover binary. Moving verification off a third party would
  change WHO verifies, not make it on-chain.

## Pre-flight checklist

- [ ] `COVEX_MAINNET_COVENANTS_ENABLED=true` ONLY after the Toccata covenant-enabled
      kaspad is live on mainnet (the node gate; until then all mainnet covenants are
      refused by design).
- [ ] `REFEREE_KEY` set to a real 64-hex secret, DISTINCT from `COVEX_ORACLE_KEY`, stored
      securely (it is the referee's hashlock root for all mainnet game pots).
- [ ] `COVEX_GAMES_PROVER_BIN` points at a working `covex-games-prover verify` binary on
      the backend host (mainnet settles refuse without it).
- [ ] A mainnet game pot lock + settle proven end to end: lock a `hashlock` pot, finish a
      game, generate a RISC0 receipt, and confirm settle reveals the winner secret only
      with a verified receipt (and refuses without one). Run this on TN12 first; never
      rush a fund-path change to mainnet.
- [ ] Confirm the deployed `binary_oracle_select` pot redeem embeds NEITHER the Covex
      oracle key NOR the referee key (the lock path asserts this and refuses otherwise).
