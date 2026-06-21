// covex-games-prover: the open-source CLI around the Covex zkVM games prover.
//
// This turns the proven Covex zkVM games prover into a usable tool so that ANYONE can prove their
// own staked game and ANYONE can verify a receipt. It is the trustless "winner generates the proof,
// the counterparty (or an external verifier) checks it" baseline.
//
// Subcommands
//   prove  <input.json> <out_receipt.bin>
//       Read a GameInput as JSON, prove it with the default RISC0 prover (a REAL STARK proof when
//       RISC0_DEV_MODE=0), and write the serialized receipt to <out_receipt.bin>. Prints the
//       committed GameResult (winner, reason, num_plies, moves_digest) and the guest image id.
//       An illegal / unfinished / forged-deck game makes covex_games::replay return Err, which
//       panics the guest, so NO receipt can be produced (the honesty gate).
//
//   verify <receipt.bin>
//       Deserialize the receipt, verify() it against the embedded GAMES_GUEST_ID, decode and print
//       the committed GameResult. Exits non-zero if verification fails. This is the piece a
//       counterparty or any external party runs to TRUST the result without replaying the game.
//       Because the image id is embedded in this binary and committed by the guest, receipts are
//       portable: the image id printed by `prove` is the one `verify` checks.
//
// Trust model (honest): Kaspa has no on-chain pairing/STARK verifier. The receipt is verified
// OFF-CHAIN, here, by the counterparty or by the Covex oracle, and that verification is what gates
// the co-signature on the 2-of-2 staked covenant. A timeout-forfeit backstop covers a no-show.

use std::process::ExitCode;

use anyhow::{anyhow, bail, Context, Result};
use covex_games::{GameInput, GameResult, GameType, WINNER_DRAW, WINNER_P1, WINNER_P2};
use methods::{GAMES_GUEST_ELF, GAMES_GUEST_ID};
use risc0_zkvm::{default_prover, ExecutorEnv, Receipt};
use serde::Deserialize;
use sha2::{Digest, Sha256};

// ----------------------------------------------------------------------------------------------
// The JSON input schema (a friendly wrapper over covex_games::GameInput).
//
// 32-byte id fields (players, covenant_id, deck_commitment) are written as 64-char hex strings in
// the JSON, which is far more usable than raw [u8; 32] number arrays. A short non-hex string for a
// player is hashed (sha256) into a 32-byte id, so "alice" / "bob" work as opaque seat labels.
//
// For card games, deck_commitment is OPTIONAL in the JSON: if omitted, the CLI fills in the honest
// sha256(deck). This is only convenience for the prover. It does NOT weaken soundness: the guest
// always re-verifies sha256(deck) == deck_commitment inside the proof, so a wrong commitment can
// never produce a receipt.
// ----------------------------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct JsonGameInput {
    /// Free-form human note, ignored by the prover (so example files can document themselves).
    #[serde(rename = "_comment", default)]
    _comment: Option<String>,
    /// "chess" | "connect4" | "tic_tac_toe" | "checkers" | "blackjack" | "poker" (case-insensitive).
    game_type: String,
    /// The ordered plies in game-specific notation (chess UCI "e2e4"; connect4 column "0".."6";
    /// blackjack "hit"/"stand"; the universal sentinel "resign" forfeits for the side to move).
    moves: Vec<String>,
    /// elapsed_ms[i] = ms the mover thought before moves[i]. If omitted, defaults to all-zero (an
    /// untimed game). If present, MUST have the same length as moves.
    #[serde(default)]
    elapsed_ms: Option<Vec<u64>>,
    /// Each side's starting clock, in ms. 0 (default) disables the clock (untimed game).
    #[serde(default)]
    initial_clock_ms: u64,
    /// Fischer increment added to the mover's clock after each non-terminal move, in ms.
    #[serde(default)]
    increment_ms: u64,
    /// [player1, player2]. Each is either a 64-char hex string (32 bytes) or a short label that is
    /// sha256-hashed into a 32-byte id. Defaults to a "player1"/"player2" pair if omitted.
    #[serde(default)]
    players: Option<[String; 2]>,
    /// Staked amount, in sompi. Public; carried through for the settlement covenant.
    #[serde(default)]
    stake_sompi: u64,
    /// Binds the proof to THIS match (the deploy tx id). 64-char hex, or a short label that is
    /// sha256-hashed. Defaults to all-zero if omitted.
    #[serde(default)]
    covenant_id: Option<String>,

    // ---- card games only ----
    /// The 52-card committed permutation (card id = suit*13 + rank). Required for blackjack/poker,
    /// empty/omitted for board games.
    #[serde(default)]
    deck: Vec<u8>,
    /// sha256(deck) as 64-char hex. OPTIONAL: if omitted for a card game, the CLI computes the
    /// honest sha256(deck). The guest re-checks it inside the proof regardless.
    #[serde(default)]
    deck_commitment: Option<String>,

    /// OPTIONAL custom starting position (e.g. checkers 65-byte descriptor). Empty = default opening.
    #[serde(default)]
    setup: Vec<u8>,
}

/// Parse a game-type string (case-insensitive, accepting a couple of common spellings).
fn parse_game_type(s: &str) -> Result<GameType> {
    let key: String = s.to_ascii_lowercase().chars().filter(|c| c.is_ascii_alphanumeric()).collect();
    Ok(match key.as_str() {
        "chess" => GameType::Chess,
        "connect4" | "connectfour" => GameType::Connect4,
        "tictactoe" | "ttt" => GameType::TicTacToe,
        "checkers" | "draughts" => GameType::Checkers,
        "blackjack" | "bj" => GameType::Blackjack,
        "poker" | "holdem" | "texasholdem" => GameType::Poker,
        other => bail!(
            "unknown game_type {other:?} (expected one of: chess, connect4, tic_tac_toe, checkers, blackjack, poker)"
        ),
    })
}

/// Resolve a 32-byte id from JSON: a 64-char hex string is decoded literally; any other string is
/// sha256-hashed into 32 bytes (so a human label like "alice" becomes a stable opaque id).
fn id32_from_str(s: &str) -> Result<[u8; 32]> {
    let trimmed = s.trim();
    let hexbody = trimmed.strip_prefix("0x").unwrap_or(trimmed);
    if hexbody.len() == 64 && hexbody.bytes().all(|b| b.is_ascii_hexdigit()) {
        let bytes = hex::decode(hexbody).context("decode 32-byte hex id")?;
        let mut out = [0u8; 32];
        out.copy_from_slice(&bytes);
        Ok(out)
    } else {
        // Stable, opaque id from an arbitrary label.
        let mut h = Sha256::new();
        h.update(trimmed.as_bytes());
        let d = h.finalize();
        let mut out = [0u8; 32];
        out.copy_from_slice(&d);
        Ok(out)
    }
}

/// honest sha256 of the deck bytes (the SAME hash covex_games::verify_committed_deck recomputes).
fn sha256(bytes: &[u8]) -> [u8; 32] {
    let mut h = Sha256::new();
    h.update(bytes);
    let d = h.finalize();
    let mut out = [0u8; 32];
    out.copy_from_slice(&d);
    out
}

/// Convert the friendly JSON shape into the exact covex_games::GameInput the guest reads.
fn build_game_input(j: JsonGameInput) -> Result<GameInput> {
    let game_type = parse_game_type(&j.game_type)?;

    // elapsed_ms: default to all-zero (untimed) and length-match moves.
    let elapsed_ms = match j.elapsed_ms {
        Some(v) => {
            if v.len() != j.moves.len() {
                bail!(
                    "elapsed_ms length {} != moves length {} (omit elapsed_ms for an untimed game)",
                    v.len(),
                    j.moves.len()
                );
            }
            v
        }
        None => vec![0u64; j.moves.len()],
    };

    let players = match j.players {
        Some([a, b]) => [id32_from_str(&a)?, id32_from_str(&b)?],
        None => [id32_from_str("player1")?, id32_from_str("player2")?],
    };

    let covenant_id = match j.covenant_id {
        Some(s) => id32_from_str(&s)?,
        None => [0u8; 32],
    };

    // deck_commitment: explicit hex if given, else (for a card game) the honest sha256(deck).
    let deck_commitment = match j.deck_commitment {
        Some(s) => id32_from_str(&s)?,
        None if game_type.is_card_game() => sha256(&j.deck),
        None => [0u8; 32],
    };

    Ok(GameInput {
        game_type,
        moves: j.moves,
        elapsed_ms,
        initial_clock_ms: j.initial_clock_ms,
        increment_ms: j.increment_ms,
        players,
        stake_sompi: j.stake_sompi,
        covenant_id,
        deck: j.deck,
        deck_commitment,
        setup: j.setup,
    })
}

/// Lowercase hex of a 32-byte digest.
fn hex32(b: &[u8; 32]) -> String {
    let mut s = String::with_capacity(64);
    for byte in b {
        s.push_str(&format!("{byte:02x}"));
    }
    s
}

/// Render the guest image id ([u32; 8]) as a single 64-char hex string (little-endian per word,
/// the canonical RISC0 digest hex). This is stable across machines for a given guest ELF, so it is
/// the portable identity a verifier checks. Both `prove` and `verify` print it the same way.
fn image_id_hex() -> String {
    let mut s = String::with_capacity(64);
    for word in GAMES_GUEST_ID.iter() {
        for byte in word.to_le_bytes() {
            s.push_str(&format!("{byte:02x}"));
        }
    }
    s
}

/// Human label for a winner code.
fn winner_label(w: u8) -> &'static str {
    match w {
        WINNER_P1 => "player 1 (first mover)",
        WINNER_P2 => "player 2",
        WINNER_DRAW => "draw / push",
        _ => "unknown",
    }
}

fn print_result(result: &GameResult) {
    println!("  winner       : {} ({})", result.winner, winner_label(result.winner));
    println!("  reason       : {}", result.reason);
    println!("  num_plies    : {}", result.num_plies);
    println!("  moves_digest : {}", hex32(&result.moves_digest));
    // The optional verifiable per-player score (reversi disc count, mancala store stones,
    // dots-and-boxes boxes). Part of the same proof; absent for scoreless games.
    match result.score {
        Some([p1, p2]) => println!("  score        : P1 {p1} - P2 {p2} (verified by the proof)"),
        None => println!("  score        : (none - this game is win/loss only)"),
    }
}

// ----------------------------------------------------------------------------------------------
// prove
// ----------------------------------------------------------------------------------------------

fn cmd_prove(input_path: &str, out_path: &str) -> Result<()> {
    let json = std::fs::read_to_string(input_path)
        .with_context(|| format!("read input JSON {input_path}"))?;
    let parsed: JsonGameInput =
        serde_json::from_str(&json).with_context(|| format!("parse input JSON {input_path}"))?;
    let input = build_game_input(parsed)?;

    println!("Covex games prover - prove");
    println!("  image id     : {}", image_id_hex());
    println!("  game_type    : {:?}", input.game_type);
    println!("  moves        : {:?}", input.moves);
    println!("  dev_mode     : {}", dev_mode_str());
    println!("Proving (this is CPU heavy; a real proof takes ~15-27s and ~16GB RAM)...");

    let env = ExecutorEnv::builder()
        .write(&input)
        .context("serialize GameInput into the executor env")?
        .build()
        .context("build executor env")?;

    let prover = default_prover();
    let t0 = std::time::Instant::now();
    // An illegal / unfinished / forged-deck game makes the guest panic, so prove() returns Err and
    // NO receipt is written. That is the honesty gate working as designed.
    let prove_info = prover
        .prove(env, GAMES_GUEST_ELF)
        .map_err(|e| anyhow!("proving failed (illegal/unfinished/forged game cannot be proven): {e}"))?;
    let elapsed = t0.elapsed().as_secs_f64();

    let receipt = prove_info.receipt;

    // Sanity: the freshly produced receipt must verify against our own image id before we save it.
    receipt
        .verify(GAMES_GUEST_ID)
        .context("freshly produced receipt failed self-verification (toolchain mismatch?)")?;

    let result: GameResult = receipt.journal.decode().context("decode the GameResult journal")?;

    let bytes = bincode::serialize(&receipt).context("serialize receipt with bincode")?;
    std::fs::write(out_path, &bytes).with_context(|| format!("write receipt to {out_path}"))?;

    println!("PROVED + self-verified in {elapsed:.2}s");
    print_result(&result);
    println!("  receipt      : {out_path} ({} bytes)", bytes.len());
    println!(
        "\nShare {out_path} with the counterparty / Covex oracle. They run:\n  covex-games-prover verify {out_path}"
    );
    Ok(())
}

// ----------------------------------------------------------------------------------------------
// verify
// ----------------------------------------------------------------------------------------------

fn cmd_verify(receipt_path: &str) -> Result<GameResult> {
    let bytes = std::fs::read(receipt_path)
        .with_context(|| format!("read receipt file {receipt_path}"))?;
    let receipt: Receipt =
        bincode::deserialize(&bytes).with_context(|| format!("deserialize receipt {receipt_path}"))?;

    println!("Covex games prover - verify");
    println!("  receipt      : {receipt_path} ({} bytes)", bytes.len());
    println!("  image id     : {}", image_id_hex());
    println!("  dev_mode     : {}", dev_mode_str());

    // THE check. Fails if the receipt does not correspond to THIS exact guest program (image id),
    // or if the journal was tampered with (the seal no longer matches). This is what a counterparty
    // or the Covex oracle runs before co-signing the staked-covenant payout.
    receipt
        .verify(GAMES_GUEST_ID)
        .context("receipt verification FAILED - the proof does not attest to this guest program (rejected)")?;

    let result: GameResult = receipt.journal.decode().context("decode the GameResult journal")?;

    println!("VERIFIED - this is a genuine proof for the Covex games guest. Committed result:");
    print_result(&result);
    Ok(result)
}

// ----------------------------------------------------------------------------------------------
// tamper-journal (soundness self-test helper)
//
// Deserialize a receipt, flip one byte of the COMMITTED journal, and re-serialize. The journal
// still decodes structurally, but the STARK seal no longer matches it, so `verify` on the output
// MUST be rejected. This mirrors the host's tamper_must_be_rejected gate and lets anyone confirm
// the seal binds the journal (you cannot re-label a winning receipt to claim the other player won).
// ----------------------------------------------------------------------------------------------

fn cmd_tamper_journal(in_path: &str, out_path: &str) -> Result<()> {
    let bytes = std::fs::read(in_path).with_context(|| format!("read receipt {in_path}"))?;
    let mut receipt: Receipt =
        bincode::deserialize(&bytes).with_context(|| format!("deserialize receipt {in_path}"))?;
    if receipt.journal.bytes.is_empty() {
        bail!("receipt journal is empty; nothing to tamper");
    }
    receipt.journal.bytes[0] ^= 0xFF;
    let out = bincode::serialize(&receipt).context("re-serialize tampered receipt")?;
    std::fs::write(out_path, &out).with_context(|| format!("write tampered receipt {out_path}"))?;
    println!("wrote tampered receipt to {out_path} (flipped journal byte 0); verify MUST reject it");
    Ok(())
}

fn dev_mode_str() -> String {
    match std::env::var("RISC0_DEV_MODE") {
        Ok(v) if v != "0" && !v.is_empty() => format!("ON ({v}) - NOT a real proof; receipts carry no cryptographic seal"),
        _ => "OFF (RISC0_DEV_MODE=0) - real STARK proof".to_string(),
    }
}

// ----------------------------------------------------------------------------------------------
// entry
// ----------------------------------------------------------------------------------------------

fn usage() -> String {
    "covex-games-prover - prove a Covex staked game and verify the receipt off-chain.\n\
     \n\
     USAGE:\n\
     \x20 covex-games-prover prove  <input.json> <out_receipt.bin>\n\
     \x20 covex-games-prover verify <receipt.bin>\n\
     \n\
     prove   read a GameInput as JSON, produce a real zk receipt (RISC0_DEV_MODE=0), print the\n\
     \x20       committed GameResult + image id, and write the receipt to <out_receipt.bin>.\n\
     verify  verify a receipt against the embedded guest image id, print the GameResult, and exit\n\
     \x20       non-zero if verification fails (the trustless check anyone can run).\n"
        .to_string()
}

fn run() -> Result<()> {
    let args: Vec<String> = std::env::args().collect();
    let cmd = args.get(1).map(|s| s.as_str()).unwrap_or("");
    match cmd {
        "prove" => {
            let input = args.get(2).ok_or_else(|| anyhow!("prove: missing <input.json>\n\n{}", usage()))?;
            let out = args.get(3).ok_or_else(|| anyhow!("prove: missing <out_receipt.bin>\n\n{}", usage()))?;
            cmd_prove(input, out)
        }
        "verify" => {
            let receipt = args.get(2).ok_or_else(|| anyhow!("verify: missing <receipt.bin>\n\n{}", usage()))?;
            cmd_verify(receipt).map(|_| ())
        }
        // Soundness self-test helper (documented in the README): flip a journal byte so `verify`
        // is forced to reject the result. Not part of the normal prove/verify flow.
        "tamper-journal" => {
            let in_path = args.get(2).ok_or_else(|| anyhow!("tamper-journal: missing <in_receipt.bin>"))?;
            let out_path = args.get(3).ok_or_else(|| anyhow!("tamper-journal: missing <out_receipt.bin>"))?;
            cmd_tamper_journal(in_path, out_path)
        }
        "-h" | "--help" | "help" | "" => {
            print!("{}", usage());
            Ok(())
        }
        other => Err(anyhow!("unknown subcommand {other:?}\n\n{}", usage())),
    }
}

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("error: {e:#}");
            ExitCode::FAILURE
        }
    }
}
