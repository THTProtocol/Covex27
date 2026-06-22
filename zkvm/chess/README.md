# covex-games-prover

Open-source CLI to **prove a Covex staked game** with a real RISC0 zk proof and to **verify a
receipt** off-chain. This is the trustless baseline behind Covex staked matches: the winner
generates the proof, and anyone (the counterparty, or an external verifier) checks the receipt to
trust the result without replaying the game.

A receipt is a succinct zero-knowledge proof that the recorded game was played legally under the
real rules plus a chess-style clock, and that the committed winner is the genuine result. Producing
a receipt is only possible for a legal, finished game: an illegal move, an unfinished game, or a
forged card deck makes the guest panic, so no receipt can exist (the honesty gate).

Supported games: chess, connect4, tic_tac_toe, checkers (board games) and blackjack, poker (card
games from a committed 52-card deck).

## Trust model (honest)

Kaspa has **no on-chain pairing or STARK verifier**, so the chain cannot check the receipt itself.
The receipt is verified **off-chain**:

- The two players lock their stakes in a 2-of-2 covenant. After a game ends, the winner produces a
  receipt with `prove`. The counterparty (or the external resolver acting as an external verifier) runs
  `verify`. If it verifies, they co-sign the 2-of-2 release to the winner.
- A losing player cannot forge a receipt that says they won: the games are deterministic, and the
  STARK seal binds the committed result, so a tampered or re-labeled receipt is rejected by
  `verify`.
- A timeout-forfeit backstop covers a no-show: if the loser stalls and refuses to co-sign, the
  winner sweeps the stake after the covenant's relative-timelock (CSV) window, and the only recourse
  the loser would have is a receipt proving THEY won, which a deterministic game makes impossible if
  they lost.

The CLI here is the publicly auditable prover + verifier. You do not have to trust Covex to check a
result: build this tool yourself and run `verify` on any receipt.

## Requirements

- The RISC0 toolchain (rzup / r0vm 3.0.x) and a recent Rust toolchain. On this project they live in
  WSL Ubuntu, not Windows.
- About **16 GB of RAM** for real proving, and roughly **15 to 27 seconds** per game on a 16-core
  machine. Verification is cheap (well under a second) and runs anywhere.

## Build

The CLI is a member of the chess workspace. Build it with cargo. Always set the RISC0 environment
and a fast native target directory first (the `/mnt/c` mount is slow for cargo I/O):

```bash
. "$HOME/.cargo/env"
export PATH="$HOME/.risc0/bin:$PATH"
export CARGO_TARGET_DIR="$HOME/covex-zkvm-target"

cd zkvm/chess
cargo build --release -p covex-games-prover
```

The binary is at `$CARGO_TARGET_DIR/release/covex-games-prover`.

> The first build also compiles the zkVM guest (the RISC-V program that is proven). That can take a
> while; subsequent builds are fast.

## Prove your own game

Write a `GameInput` as JSON, then prove it. Real proofs require `RISC0_DEV_MODE=0` (the default for
the harness; `RISC0_DEV_MODE=1` is a fast dry run that produces a fake receipt with no real seal,
useful only to check that the toolchain builds).

```bash
export RISC0_DEV_MODE=0
covex-games-prover prove examples/chess_checkmate.json chess_receipt.bin
```

This prints the committed `GameResult` (winner, reason, num_plies, moves_digest) and the guest
**image id**, and writes the serialized receipt to `chess_receipt.bin`. Hand that file to your
counterparty.

### Input JSON schema

| field              | type                       | required | meaning |
|--------------------|----------------------------|----------|---------|
| `game_type`        | string                     | yes      | `chess`, `connect4`, `tic_tac_toe`, `checkers`, `blackjack`, or `poker` (case-insensitive). |
| `moves`            | array of strings           | yes      | The ordered plies. Chess uses UCI (`e2e4`); connect4 uses a column `0`..`6`; tic_tac_toe a cell `0`..`8`; blackjack `hit` / `stand`. The sentinel `resign` is universal and forfeits for the side to move. |
| `elapsed_ms`       | array of u64               | no       | `elapsed_ms[i]` is the ms the mover thought before `moves[i]`. Omit for an untimed game (defaults to all zero). If present it must be the same length as `moves`. |
| `initial_clock_ms` | u64                        | no       | Each side's starting clock in ms. `0` (default) disables the clock. |
| `increment_ms`     | u64                        | no       | Fischer increment added to the mover's clock after each non-terminal move, in ms. |
| `players`          | array of 2 strings         | no       | `[player1, player2]`. Each is a 64-char hex (32 bytes) OR a short label that is sha256-hashed into a 32-byte id (so `"alice"` works as an opaque seat id). Defaults to `player1` / `player2`. |
| `stake_sompi`      | u64                        | no       | The staked amount in sompi. Public; carried through to the settlement covenant. |
| `covenant_id`      | string                     | no       | Binds the proof to THIS match (the deploy tx id), preventing cross-match replay. 64-char hex or a short label that is sha256-hashed. Defaults to all-zero. |
| `deck`             | array of u8                | card games | The 52-card committed permutation. Card id = `suit * 13 + rank` (rank `0`..`12` = 2..Ace, suit `0`..`4`). Required for blackjack and poker; omit for board games. |
| `deck_commitment`  | string                     | no       | `sha256(deck)` as 64-char hex. Optional: if omitted for a card game, the CLI fills in the honest `sha256(deck)`. The guest re-verifies `sha256(deck) == deck_commitment` inside the proof regardless, so this convenience never weakens soundness. |
| `setup`            | array of u8                | no       | Optional custom starting position (e.g. a checkers 65-byte descriptor). Omit to use the default opening. |

A minimal untimed chess input:

```json
{
  "game_type": "chess",
  "moves": ["e2e4", "e7e5", "f1c4", "b8c6", "d1h5", "g8f6", "h5f7"],
  "players": ["alice", "bob"],
  "stake_sompi": 100000000,
  "covenant_id": "covex-demo-match-0001"
}
```

See `examples/chess_checkmate.json` (a Scholar's mate, player 1 wins) and
`examples/blackjack_player_win.json` (player 20 vs dealer 17 from a committed deck, player 1 wins).
`examples/chess_illegal.json` is a negative example that cannot be proven.

## Verify someone's receipt

This is the piece a counterparty or an external verifier runs to trust a result without replaying
it:

```bash
covex-games-prover verify chess_receipt.bin
```

`verify` deserializes the receipt, checks it against the guest **image id** embedded in this binary,
decodes the committed `GameResult`, and prints it. It **exits 0** for a genuine proof and **exits
non-zero** (rejecting the receipt) if the proof does not attest to this exact guest program or if
the journal was tampered with.

Receipts are portable: the image id printed by `prove` is the same one `verify` checks, so a receipt
produced on one machine verifies on any other machine running the same guest.

## Confirm soundness yourself

To see that the seal binds the result (you cannot re-label a winning receipt to claim the other
player won), flip a byte of the committed journal and watch `verify` reject it:

```bash
covex-games-prover tamper-journal chess_receipt.bin chess_tampered.bin
covex-games-prover verify chess_tampered.bin   # exits non-zero: rejected
```

And confirm that an illegal game cannot be proven at all (no receipt is written):

```bash
covex-games-prover prove examples/chess_illegal.json /tmp/should_not_exist.bin   # exits non-zero
```

## How it fits together

The prover wraps `covex_games::replay` (in `../games`), the pure-Rust, deterministic rules core. The
guest (`methods/guest`) reads a `GameInput`, calls `replay`, and commits the `GameResult` to the
journal. `replay` returns an error the instant a move is illegal, the clock is malformed, the game is
unfinished, or a card deck does not hash to its commitment, and the guest turns that into a panic, so
no proof can be produced for a dishonest game. A receipt therefore proves the game was legal and the
committed winner is genuine.
