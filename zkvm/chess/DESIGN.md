# Covex ZK Chess - design + build spec

Goal: a user creates a staked chess match on Covex; a **zkVM (RISC0) proof** attests that every move
was legal, the clock was respected, and who won; the winner is paid from the on-chain stake. Covex
decides nothing (trustless).

## Why a zkVM (not circom)
Full chess rules (legal moves for every piece, check/checkmate/stalemate, castling, en passant,
promotion, 50-move/repetition draws) are infeasible as a circom arithmetic circuit. A zkVM runs an
ordinary Rust chess engine (the `shakmaty` crate) and produces a succinct proof that the execution
was correct. Prove on a 16-core/15GB machine (WSL); verification is cheap and runs anywhere.

## Hard constraint (drives the payout design)
Kaspa has NO on-chain pairing/STARK verifier, so the chain cannot check the receipt. The proof is
verified OFF chain; the Kaspa covenant release is gated by a co-signature. Trustless options:
- cooperative 2-of-2 (loser co-signs after verifying the winning receipt), with a
- CSV timeout-forfeit backstop (winner sweeps if the loser stalls; the loser's only recourse is to
  present a receipt proving THEY won, which a deterministic game makes impossible if they lost), and/or
- an external verifier/oracle-provider that verifies the receipt and co-signs (Mechanism 3).
See ../../TRUSTLESS_RESOLUTION.md.

## Guest (methods/guest) - the proof

Input (read via env::read), `ChessGameInput`:
```
white_id: [u8;32]      // public: sha256 of white's pubkey (or covenant seat hash)
black_id: [u8;32]      // public
stake_sompi: u64       // public
initial_clock_ms: u64  // public: each side's starting clock
increment_ms: u64      // public: per-move increment (Fischer)
covenant_id: [u8;32]   // public: H4 replay binding (the deploy tx id)
moves: Vec<String>     // witness: UCI moves "e2e4"; sentinels "resign","draw_accept"
elapsed_ms: Vec<u64>   // witness: ms the mover consumed before move i
// v2: move_sigs: Vec<[u8;64]>  // each move signed by the mover (binds the game to real players)
```

Replay algorithm:
```
pos = Chess::default(); wc = bc = initial_clock_ms; winner = None; reason = "";
for i, mv in moves:
    side = if i%2==0 {White} else {Black}; clk = side==White ? &wc : &bc;
    // TIMER: a move that consumes more than the remaining clock is a loss on time
    if elapsed_ms[i] > *clk { winner = other(side); reason = "timeout"; break; }
    *clk -= elapsed_ms[i]; *clk += increment_ms;
    if mv == "resign"     { winner = other(side); reason = "resign"; break; }
    if mv == "draw_accept"{ /* requires prior draw offer in log; v2 */ }
    // LEGALITY: parse + must be a legal move in this position, else the game is invalid
    let m = Uci::from_ascii(mv.as_bytes())?.to_move(&pos)?;   // Err => panic => NO proof exists
    assert!(pos.is_legal(&m));
    pos.play_unchecked(&m);
if winner.is_none():
    match pos.outcome() {                                     // shakmaty rules result
        Some(Outcome::Decisive{winner: w}) => { winner = w; reason = "checkmate"; }
        Some(Outcome::Draw)                => { winner = Draw; reason = "draw"; }
        None => panic!("game unfinished and no resignation/timeout"); // cannot prove a winner
    }
env::commit(&ChessResult {
    winner_code,        // 0=white 1=black 2=draw
    reason,
    white_id, black_id, stake_sompi, covenant_id,
    num_plies: moves.len(),
    moves_digest: sha256(concat(moves)),  // binds the journal to the exact game
});
```
A proof EXISTS only if every move was legal and the clock held; the committed `winner_code` is then
the genuine chess result. The journal (public) carries winner + players + stake + covenant_id.

## Host (host/src/main.rs)
- Build a `ChessGameInput` from a real game (tests: a forced checkmate e.g. Scholar's mate; a timeout
  scenario; an illegal-move input that MUST fail to prove).
- `default_prover().prove(env, CHESS_GUEST_ELF)` -> receipt; `receipt.verify(CHESS_GUEST_ID)`; decode
  the journal; assert winner == expected.
- Emit the receipt (journal + seal) as the settlement artifact.

## On-chain payout (covenant)
- Deploy a 2-of-2 [white_seat, black_seat] stake covenant (Covex already proves 2-of-2 + CSV).
- Settle: winner publishes the receipt; the loser (or an external verifier) verifies it off-chain and
  co-signs the release to the winner. CSV timeout lets the winner sweep if the loser stalls.
- `covenant_id` in the journal binds the proof to THIS match (no cross-match replay).

## Covex builder integration
- New game template "ZK Chess Match": creator sets stake, time control, opponent address -> deploys
  the 2-of-2 covenant. Players play (moves + clocks recorded). On end, winner generates the receipt
  (local open-source prover, or an optional non-custodial Covex proving helper - the proof is
  publicly verifiable either way). Settle screen verifies the receipt and co-signs the payout.

## Build plan
1. `cargo risczero new chess` (scaffold for the installed risc0 version) -> merge into zkvm/chess.
2. Guest deps: `shakmaty`, `sha2` (or risc0 sha accelerator). Implement the replay above.
3. Host: prove + verify the 3 test games. THE GATE: an illegal move or a clock overrun MUST make the
   proof fail to generate (no receipt), and a legal checkmate/timeout MUST verify with the right winner.
4. Covenant template + builder UI (coordinate with the money-path workstream; Kaspa-side is 2-of-2 + CSV).
