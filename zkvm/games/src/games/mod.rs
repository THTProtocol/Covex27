//! Per-game rules implementations.
//!
//! Board games each expose a struct implementing [`crate::GameRules`] (driven by the per-ply loop
//! in [`crate::replay`]): chess, connect4, tic_tac_toe, checkers, reversi, mancala, dots_and_boxes,
//! and the two commitment-gated board games battleship (hidden boards, two `sha256` board
//! commitments) and backgammon (VRF dice from a committed seed). Card games are committed-deck
//! showdowns resolved directly by `replay` (after it verifies `sha256(deck) == deck_commitment`)
//! and expose a `resolve(deck, moves)` function instead: blackjack, poker.

pub mod chess;
pub mod connect4;
pub mod tic_tac_toe;
pub mod checkers;
pub mod blackjack;
pub mod poker;
pub mod reversi;
pub mod mancala;
pub mod dots_and_boxes;
pub mod battleship;
pub mod backgammon;
