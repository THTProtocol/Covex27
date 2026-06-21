//! Per-game rules implementations.
//!
//! Board games each expose a struct implementing [`crate::GameRules`] (driven by the per-ply loop
//! in [`crate::replay`]): chess, connect4, tic_tac_toe, checkers. Card games are committed-deck
//! showdowns resolved directly by `replay` (after it verifies `sha256(deck) == deck_commitment`)
//! and expose a `resolve(deck, moves)` function instead: blackjack, poker.

pub mod chess;
pub mod connect4;
pub mod tic_tac_toe;
pub mod checkers;
pub mod blackjack;
pub mod poker;
