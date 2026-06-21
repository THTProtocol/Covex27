//! Heads-up Blackjack vs an auto-playing dealer, dealt from a COMMITTED deck.
//!
//! ## Why a committed deck
//!
//! In a staked game neither side may pick cards after seeing the table. The 52-card permutation is
//! fixed before play and bound by `sha256(deck) == deck_commitment` (verified in [`crate::replay`]
//! BEFORE this module is ever called). A forged or reordered deck fails that check, so no proof can
//! be produced for it. This module therefore trusts that `deck` is already a verified permutation
//! of cards `0..52`.
//!
//! ## Card encoding
//!
//! A card id is `0..52`. `rank = card % 13` with `0..=8` = 2..10, `9` = Jack, `10` = Queen,
//! `11` = King, `12` = Ace. Suit (`card / 13`) is irrelevant to blackjack scoring. Face cards
//! (J/Q/K) and tens all count 10. An Ace counts 11 unless that would bust the hand, in which case
//! it counts 1 (a "soft" vs "hard" total). The standard soft-ace logic is implemented in [`hand_value`].
//!
//! ## Deal order (standard heads-up)
//!
//! Cards are dealt off the TOP of the committed deck in casino order: player, dealer, player,
//! dealer. So `deck[0]`,`deck[2]` are the player's two cards and `deck[1]`,`deck[3]` are the
//! dealer's. Subsequent hits draw the next undealt card (`deck[4]`, `deck[5]`, ...), the player
//! drawing first (during their decisions) and then the dealer.
//!
//! ## Moves and play
//!
//! `moves` is the player's ordered decisions, each `"hit"` or `"stand"`. The player hits (drawing
//! the next card) until they `"stand"` or bust. Any unrecognized move is illegal -> `Err`. After the
//! player finishes WITHOUT busting, the DEALER auto-plays by a fixed rule and the player's move list
//! must be exactly consumed.
//!
//! ## Dealer rule (documented, fixed)
//!
//! The dealer hits while their total is below 17, and STANDS on 17 or more INCLUDING soft 17
//! (i.e. "dealer stands on soft 17", the player-favorable S17 rule). This is deterministic given
//! the committed deck, so the dealer takes no `moves`.
//!
//! ## Outcome
//!
//! - Player busts (>21): dealer wins (`WINNER_P2`).
//! - Else dealer busts (>21): player wins (`WINNER_P1`).
//! - Else higher total wins; equal totals are a PUSH (`WINNER_DRAW`).
//! - A two-card 21 (blackjack) is just a total of 21 here (v1 does not pay a blackjack bonus); a
//!   player blackjack still beats a dealer non-blackjack 21-via-3-cards only if totals differ, and
//!   ties push. This is a deliberate, documented v1 simplification.

use crate::{WINNER_DRAW, WINNER_P1, WINNER_P2};

/// The blackjack point value contributed by a card's rank, treating every Ace as 11 for now.
/// `rank` is `card % 13`: 0..=8 -> 2..10, 9/10/11 (J/Q/K) -> 10, 12 (Ace) -> 11.
fn card_points(card: u8) -> u8 {
    let rank = card % 13;
    match rank {
        0..=8 => rank + 2, // 2..10
        9 | 10 | 11 => 10, // J, Q, K
        12 => 11,          // Ace (soft, adjusted in hand_value)
        _ => unreachable!("rank is card % 13, always 0..13"),
    }
}

/// Is this card an Ace? (rank 12)
fn is_ace(card: u8) -> bool {
    card % 13 == 12
}

/// The best blackjack total of a hand: sum cards counting each Ace as 11, then demote Aces to 1
/// (subtract 10) one at a time while the total busts. Returns the final total (which may be > 21
/// if even all-Aces-as-1 busts, i.e. a genuine bust).
pub fn hand_value(cards: &[u8]) -> u32 {
    let mut total: u32 = 0;
    let mut aces: u32 = 0;
    for &c in cards {
        total += card_points(c) as u32;
        if is_ace(c) {
            aces += 1;
        }
    }
    // Each Ace currently counts 11; demote to 1 (subtract 10) while busting and aces remain.
    while total > 21 && aces > 0 {
        total -= 10;
        aces -= 1;
    }
    total
}

/// A simple cursor over the committed deck so dealing and hitting draw distinct cards in order.
struct Shoe<'a> {
    deck: &'a [u8],
    next: usize,
}

impl<'a> Shoe<'a> {
    fn new(deck: &'a [u8]) -> Self {
        Shoe { deck, next: 0 }
    }
    /// Draw the next card off the top, or `Err` if the deck is exhausted (cannot happen with a
    /// 52-card deck and at most ~a dozen draws, but checked so the function is total).
    fn draw(&mut self) -> Result<u8, String> {
        let card = *self
            .deck
            .get(self.next)
            .ok_or_else(|| "deck exhausted while dealing blackjack".to_string())?;
        self.next += 1;
        Ok(card)
    }
}

/// Resolve a heads-up blackjack hand from a verified committed deck and the player's decisions.
///
/// Returns `(winner, reason, num_plies)`. `num_plies` counts the player's decisions actually
/// processed (each "hit"/"stand"). The deck is assumed already verified by [`crate::replay`].
pub fn resolve(deck: &[u8], moves: &[String]) -> Result<(u8, String, u32), String> {
    // Standard heads-up deal off the top of the committed deck: player, dealer, player, dealer.
    let mut shoe = Shoe::new(deck);
    let p0 = shoe.draw()?;
    let d0 = shoe.draw()?;
    let p1 = shoe.draw()?;
    let d1 = shoe.draw()?;
    let mut player = vec![p0, p1];
    let mut dealer = vec![d0, d1];

    // ---- Player phase: process each decision in order. ----
    let mut plies: u32 = 0;
    let mut player_stood = false;
    let mut player_busted = false;
    let mut idx = 0usize;
    while idx < moves.len() {
        let mv = moves[idx].as_str();
        plies += 1;
        idx += 1; // this decision is now consumed
        match mv {
            "hit" => {
                let c = shoe.draw()?;
                player.push(c);
                if hand_value(&player) > 21 {
                    player_busted = true;
                    break;
                }
            }
            "stand" => {
                player_stood = true;
                break;
            }
            other => {
                return Err(format!(
                    "illegal blackjack move \"{other}\" (expected \"hit\" or \"stand\")"
                ));
            }
        }
    }

    // The player must have terminated their turn explicitly (stood or busted). A move list that
    // runs out while the player is still "live" is an unfinished game -> Err.
    if !player_stood && !player_busted {
        return Err(
            "blackjack hand is unfinished: player neither stood nor busted (add a \"stand\")"
                .to_string(),
        );
    }
    // Extra player moves after a stand/bust are illegal (the player's turn is over).
    if idx < moves.len() {
        return Err(format!(
            "blackjack has {} trailing move(s) after the player's turn ended",
            moves.len() - idx
        ));
    }

    // Player bust -> dealer wins immediately (dealer does not need to draw).
    if player_busted {
        return Ok((WINNER_P2, "player_bust".to_string(), plies));
    }

    // ---- Dealer phase: auto-play. Hit below 17, STAND on 17+ including soft 17 (S17). ----
    loop {
        let total = hand_value(&dealer);
        if total >= 17 {
            break; // stands on hard or soft 17+
        }
        let c = shoe.draw()?;
        dealer.push(c);
    }

    let player_total = hand_value(&player);
    let dealer_total = hand_value(&dealer);

    // ---- Settle. ----
    let (winner, reason) = if dealer_total > 21 {
        (WINNER_P1, "dealer_bust".to_string())
    } else if player_total > dealer_total {
        (WINNER_P1, "player_higher".to_string())
    } else if dealer_total > player_total {
        (WINNER_P2, "dealer_higher".to_string())
    } else {
        (WINNER_DRAW, "push".to_string())
    };

    Ok((winner, reason, plies))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{replay, sha256_bytes, GameInput, GameType, WINNER_DRAW, WINNER_P1, WINNER_P2};

    /// Build a GameInput for blackjack from an explicit deck order + player moves.
    /// `deck` must be a permutation of 0..52; the commitment is the honest sha256 of it.
    fn game(deck: Vec<u8>, moves: &[&str]) -> GameInput {
        let moves: Vec<String> = moves.iter().map(|s| s.to_string()).collect();
        let n = moves.len();
        let commit = sha256_bytes(&deck);
        GameInput {
            game_type: GameType::Blackjack,
            moves,
            elapsed_ms: vec![0u64; n],
            initial_clock_ms: 0,
            increment_ms: 0,
            players: [[1u8; 32], [2u8; 32]],
            stake_sompi: 4_000,
            covenant_id: [11u8; 32],
            deck,
            deck_commitment: commit,
            setup: vec![],
            commitments: vec![],
        }
    }

    /// Card ids for convenience. rank: 0..=8 -> 2..10, 9=J,10=Q,11=K,12=A. suit s in 0..4.
    /// id = s*13 + rank.
    fn card(rank: u8, suit: u8) -> u8 {
        suit * 13 + rank
    }

    /// Helper: assemble a 52-card permutation whose first cards are the ones we want dealt, with the
    /// remaining cards filling out the rest of the deck so it stays a valid permutation.
    fn deck_with_prefix(prefix: &[u8]) -> Vec<u8> {
        let mut deck: Vec<u8> = prefix.to_vec();
        for c in 0u8..52 {
            if !prefix.contains(&c) {
                deck.push(c);
            }
        }
        assert_eq!(deck.len(), 52, "prefix must contain only distinct 0..52 cards");
        deck
    }

    // ---- hand_value unit checks ----

    #[test]
    fn ace_counts_eleven_then_one() {
        // A + 9 = 20 (ace as 11).
        assert_eq!(hand_value(&[card(12, 0), card(7, 1)]), 20);
        // A + 9 + 5 would be 25 with ace 11 -> demote ace to 1 -> 15.
        assert_eq!(hand_value(&[card(12, 0), card(7, 1), card(3, 2)]), 15);
        // A + A = 12 (one ace 11, one ace 1), not 22.
        assert_eq!(hand_value(&[card(12, 0), card(12, 1)]), 12);
    }

    // ---- known-winner games ----

    /// Player stands on 20, dealer ends on 18 -> player (P1) wins.
    /// Deal order is player, dealer, player, dealer:
    ///   player: deck[0]=10, deck[2]=K  -> 20
    ///   dealer: deck[1]=9,  deck[3]=8  -> 17 (dealer stands on 17)
    #[test]
    fn player_higher_wins() {
        let deck = deck_with_prefix(&[
            card(8, 0),  // p0 = 10
            card(7, 1),  // d0 = 9
            card(11, 2), // p1 = King (10) -> player 20
            card(6, 3),  // d1 = 8 -> dealer 17, stands
        ]);
        let input = game(deck, &["stand"]);
        let r = replay(&input).expect("legal blackjack");
        assert_eq!(r.winner, WINNER_P1, "reason {}", r.reason);
        assert_eq!(r.num_plies, 1);
    }

    /// Dealer ends higher -> dealer (P2) wins.
    ///   player: deck[0]=10, deck[2]=7 -> 17, player stands
    ///   dealer: deck[1]=10, deck[3]=9 -> 19 -> dealer higher
    #[test]
    fn dealer_higher_wins() {
        let deck = deck_with_prefix(&[
            card(8, 0), // p0 = 10
            card(8, 1), // d0 = 10
            card(5, 2), // p1 = 7 -> player 17
            card(7, 3), // d1 = 9 -> dealer 19
        ]);
        let input = game(deck, &["stand"]);
        let r = replay(&input).expect("legal blackjack");
        assert_eq!(r.winner, WINNER_P2, "reason {}", r.reason);
    }

    /// Equal totals -> push (draw).
    ///   player: 10 + 9 = 19 ; dealer: 10 + 9 = 19
    #[test]
    fn equal_totals_push() {
        let deck = deck_with_prefix(&[
            card(8, 0), // p0 = 10
            card(8, 1), // d0 = 10
            card(7, 2), // p1 = 9 -> player 19
            card(7, 3), // d1 = 9 -> dealer 19
        ]);
        let input = game(deck, &["stand"]);
        let r = replay(&input).expect("legal blackjack");
        assert_eq!(r.winner, WINNER_DRAW, "reason {}", r.reason);
    }

    /// Player hits into a bust -> dealer wins, dealer need not draw.
    ///   player: 10 + 6 = 16, hits deck[4]=10 -> 26 bust.
    #[test]
    fn player_bust_loses() {
        let deck = deck_with_prefix(&[
            card(8, 0), // p0 = 10
            card(4, 1), // d0 = 6
            card(4, 2), // p1 = 6 -> player 16
            card(5, 3), // d1 = 7 -> dealer 13
            card(8, 2), // hit card = 10 -> player 26 bust
        ]);
        let input = game(deck, &["hit"]);
        let r = replay(&input).expect("legal blackjack with a hit");
        assert_eq!(r.winner, WINNER_P2);
        assert_eq!(r.reason, "player_bust");
    }

    /// Dealer draws into a bust -> player wins.
    ///   player: 10 + 10 = 20 stand.
    ///   dealer: 10 + 6 = 16 (must hit), next card deck[4]=10 -> 26 bust.
    #[test]
    fn dealer_bust_player_wins() {
        let deck = deck_with_prefix(&[
            card(8, 0), // p0 = 10
            card(8, 1), // d0 = 10
            card(11, 2), // p1 = K(10) -> player 20
            card(4, 3), // d1 = 6 -> dealer 16, must hit
            card(8, 2), // dealer hit = 10 -> 26 bust
        ]);
        let input = game(deck, &["stand"]);
        let r = replay(&input).expect("legal blackjack");
        assert_eq!(r.winner, WINNER_P1);
        assert_eq!(r.reason, "dealer_bust");
    }

    // ---- negative tests (the honesty gate) ----

    /// FORGED DECK: the committed deck's hash does not match the supplied deck -> Err, no proof.
    #[test]
    fn forged_deck_is_err() {
        let mut input = game(deck_with_prefix(&[card(8, 0), card(7, 1), card(11, 2), card(6, 3)]), &["stand"]);
        // Tamper with the deck AFTER the (honest) commitment was computed: swap two cards.
        input.deck.swap(0, 10);
        let err = replay(&input).unwrap_err();
        assert!(err.contains("commitment mismatch"), "got: {err}");
    }

    /// FORGED DECK (invalid permutation with matching hash): duplicate card -> Err.
    #[test]
    fn non_permutation_deck_is_err() {
        let mut deck = deck_with_prefix(&[card(8, 0), card(7, 1), card(11, 2), card(6, 3)]);
        deck[51] = deck[0]; // duplicate the first card; deck[51]'s old card now missing
        let commit = sha256_bytes(&deck); // honest hash of the BAD deck
        let input = GameInput {
            game_type: GameType::Blackjack,
            moves: vec!["stand".to_string()],
            elapsed_ms: vec![0],
            initial_clock_ms: 0,
            increment_ms: 0,
            players: [[1u8; 32], [2u8; 32]],
            stake_sompi: 4_000,
            covenant_id: [11u8; 32],
            deck,
            deck_commitment: commit,
            setup: vec![],
            commitments: vec![],
        };
        let err = replay(&input).unwrap_err();
        assert!(err.contains("permutation") || err.contains("twice"), "got: {err}");
    }

    /// ILLEGAL MOVE: an unrecognized decision (not hit/stand) -> Err.
    #[test]
    fn illegal_move_is_err() {
        let deck = deck_with_prefix(&[card(8, 0), card(7, 1), card(11, 2), card(6, 3)]);
        let input = game(deck, &["double"]);
        let err = replay(&input).unwrap_err();
        assert!(err.contains("illegal blackjack move"), "got: {err}");
    }

    /// UNFINISHED: the player never stands or busts (empty move list) -> Err.
    #[test]
    fn unfinished_hand_is_err() {
        let deck = deck_with_prefix(&[card(8, 0), card(7, 1), card(11, 2), card(6, 3)]);
        let input = game(deck, &[]);
        let err = replay(&input).unwrap_err();
        assert!(err.contains("unfinished"), "got: {err}");
    }

    /// TRAILING MOVE: a decision after the player already stood is illegal.
    #[test]
    fn trailing_move_after_stand_is_err() {
        let deck = deck_with_prefix(&[card(8, 0), card(7, 1), card(11, 2), card(6, 3)]);
        let input = game(deck, &["stand", "hit"]);
        let err = replay(&input).unwrap_err();
        assert!(err.contains("trailing"), "got: {err}");
    }
}
