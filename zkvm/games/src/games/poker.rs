//! 2-player Texas Hold'em SHOWDOWN, dealt from a COMMITTED deck. **v1: NO betting rounds.**
//!
//! ## v1 scope (documented honestly)
//!
//! This is a SHOWDOWN-ONLY Hold'em: the deck is committed, both players are dealt two hole cards,
//! five community cards come out, and the best 5-of-7 hand wins. There are NO betting rounds, no
//! folding, no blinds, no pot in this module (the stake is settled by the covenant). A future v2 can
//! add betting as a backward-compatible move stream; v1 takes NO `moves` and the move list must be
//! empty. This keeps the proof about the one thing that must be honest here: the hand was dealt from
//! a fixed committed deck and the higher hand genuinely wins.
//!
//! ## Card encoding
//!
//! A card id is `0..52`. `rank = card % 13` with `0..=8` = 2..10, `9` = J, `10` = Q, `11` = K,
//! `12` = A (Ace high; it also plays low only in the wheel A-2-3-4-5, handled in straight detection).
//! `suit = card / 13` (`0..4`).
//!
//! ## Deal order (committed deck, no burn cards in v1)
//!
//! Off the top of the committed deck: p1 hole, p2 hole, p1 hole, p2 hole, then 5 community cards.
//! So hole(p1) = deck[0],deck[2]; hole(p2) = deck[1],deck[3]; board = deck[4..9]. No burn cards are
//! used in v1 (documented simplification; with a fixed committed deck, burns add nothing to fairness).
//!
//! ## Hand ranking
//!
//! Standard poker, best 5 of the 7 available cards (2 hole + 5 community), evaluated for both
//! players; higher hand wins, exact tie is a draw (`WINNER_DRAW`). Categories, high to low:
//! straight flush, four of a kind, full house, flush, straight, three of a kind, two pair, one
//! pair, high card. Within a category, kickers break ties in descending order. The evaluator is the
//! trusted core: it must be correct, which is why this module ships known-winner and tie tests.

use crate::{WINNER_DRAW, WINNER_P1, WINNER_P2};

/// Rank `0..13` of a card (2..A). Ace is 12 (high).
fn rank_of(card: u8) -> u8 {
    card % 13
}
/// Suit `0..4` of a card.
fn suit_of(card: u8) -> u8 {
    card / 13
}

/// Hand category, ordered so a higher discriminant beats a lower one.
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Debug)]
enum Category {
    HighCard = 0,
    OnePair = 1,
    TwoPair = 2,
    ThreeOfAKind = 3,
    Straight = 4,
    Flush = 5,
    FullHouse = 6,
    FourOfAKind = 7,
    StraightFlush = 8,
}

/// A comparable hand score: the category plus tie-break ranks in DESCENDING significance.
/// Comparing two `HandScore` values with the derived `Ord` gives the correct poker ordering because
/// `category` is the most significant field and `tiebreak` is built in descending importance.
#[derive(Clone, PartialEq, Eq, PartialOrd, Ord, Debug)]
struct HandScore {
    category: Category,
    /// Tie-break ranks, most significant first. E.g. for two pair: [high pair, low pair, kicker].
    /// Ranks are stored as the card rank `0..13` (Ace = 12). For a wheel straight (A-2-3-4-5) the
    /// high card is 5 (rank 3), handled in `straight_high`.
    tiebreak: Vec<u8>,
}

/// All 5-card combinations of a 7-card slice, as index tuples. C(7,5) = 21 combos.
fn combos_5_of_7() -> [[usize; 5]; 21] {
    // Precomputed index combinations of choosing 5 of 7 (the complement of choosing 2 to drop).
    let mut out = [[0usize; 5]; 21];
    let mut k = 0;
    for drop_a in 0..7 {
        for drop_b in (drop_a + 1)..7 {
            let mut five = [0usize; 5];
            let mut j = 0;
            for i in 0..7 {
                if i != drop_a && i != drop_b {
                    five[j] = i;
                    j += 1;
                }
            }
            out[k] = five;
            k += 1;
        }
    }
    out
}

/// If the five rank-sorted (descending) distinct-or-not ranks form a straight, return the high
/// card rank of that straight (for the wheel A-2-3-4-5 the high is 5 -> rank 3). Otherwise `None`.
/// `ranks_desc` must be exactly the 5 ranks (with no duplicates for a straight to exist).
fn straight_high(ranks_desc: &[u8; 5]) -> Option<u8> {
    // Need 5 distinct ranks.
    for w in ranks_desc.windows(2) {
        if w[0] == w[1] {
            return None;
        }
    }
    // Normal straight: each step down by exactly 1.
    let mut consecutive = true;
    for w in ranks_desc.windows(2) {
        if w[0] != w[1] + 1 {
            consecutive = false;
            break;
        }
    }
    if consecutive {
        return Some(ranks_desc[0]);
    }
    // Wheel: A(12),5(3),4(2),3(1),2(0) -> ranks_desc sorted = [12,3,2,1,0]. High card is the 5 (3).
    if ranks_desc == &[12, 3, 2, 1, 0] {
        return Some(3);
    }
    None
}

/// Score exactly five cards into a comparable `HandScore`.
fn score_five(cards: &[u8; 5]) -> HandScore {
    // Ranks descending.
    let mut ranks: [u8; 5] = [
        rank_of(cards[0]),
        rank_of(cards[1]),
        rank_of(cards[2]),
        rank_of(cards[3]),
        rank_of(cards[4]),
    ];
    ranks.sort_unstable_by(|a, b| b.cmp(a));

    let flush = {
        let s0 = suit_of(cards[0]);
        cards.iter().all(|&c| suit_of(c) == s0)
    };
    let straight = straight_high(&ranks);

    // Count occurrences of each rank.
    let mut counts = [0u8; 13];
    for &r in &ranks {
        counts[r as usize] += 1;
    }
    // Build (count, rank) pairs sorted by count desc then rank desc: the standard way to order
    // pairs/trips/quads ahead of kickers.
    let mut by_count: Vec<(u8, u8)> = (0..13u8)
        .filter(|&r| counts[r as usize] > 0)
        .map(|r| (counts[r as usize], r))
        .collect();
    by_count.sort_unstable_by(|a, b| b.0.cmp(&a.0).then(b.1.cmp(&a.1)));

    let pattern: Vec<u8> = by_count.iter().map(|&(c, _)| c).collect();
    // Tie-break ranks in the order the pattern dictates (most significant group first).
    let grouped_ranks: Vec<u8> = by_count.iter().map(|&(_, r)| r).collect();

    // Straight flush.
    if flush {
        if let Some(high) = straight {
            return HandScore { category: Category::StraightFlush, tiebreak: vec![high] };
        }
    }
    // Four of a kind: pattern [4,1]. tiebreak [quad rank, kicker].
    if pattern == [4, 1] {
        return HandScore { category: Category::FourOfAKind, tiebreak: grouped_ranks };
    }
    // Full house: pattern [3,2]. tiebreak [trip rank, pair rank].
    if pattern == [3, 2] {
        return HandScore { category: Category::FullHouse, tiebreak: grouped_ranks };
    }
    // Flush (not straight): all five ranks descending as tiebreak.
    if flush {
        return HandScore { category: Category::Flush, tiebreak: ranks.to_vec() };
    }
    // Straight (not flush).
    if let Some(high) = straight {
        return HandScore { category: Category::Straight, tiebreak: vec![high] };
    }
    // Three of a kind: pattern [3,1,1]. tiebreak [trip, kicker_hi, kicker_lo].
    if pattern == [3, 1, 1] {
        return HandScore { category: Category::ThreeOfAKind, tiebreak: grouped_ranks };
    }
    // Two pair: pattern [2,2,1]. grouped_ranks already [hi pair, lo pair, kicker].
    if pattern == [2, 2, 1] {
        return HandScore { category: Category::TwoPair, tiebreak: grouped_ranks };
    }
    // One pair: pattern [2,1,1,1]. tiebreak [pair, k1, k2, k3].
    if pattern == [2, 1, 1, 1] {
        return HandScore { category: Category::OnePair, tiebreak: grouped_ranks };
    }
    // High card: all distinct ranks descending.
    HandScore { category: Category::HighCard, tiebreak: ranks.to_vec() }
}

/// Best 5-of-7 score from 2 hole cards + 5 community cards.
fn best_of_seven(seven: &[u8; 7]) -> HandScore {
    let combos = combos_5_of_7();
    let mut best: Option<HandScore> = None;
    for combo in combos.iter() {
        let five = [
            seven[combo[0]],
            seven[combo[1]],
            seven[combo[2]],
            seven[combo[3]],
            seven[combo[4]],
        ];
        let s = score_five(&five);
        match &best {
            Some(b) if *b >= s => {}
            _ => best = Some(s),
        }
    }
    best.expect("21 combinations always yield a score")
}

/// Resolve a 2-player Hold'em showdown from a verified committed deck. v1 takes NO moves.
/// Returns `(winner, reason, num_plies)`. `num_plies` is 0 (no decisions in showdown-only v1).
pub fn resolve(deck: &[u8], moves: &[String]) -> Result<(u8, String, u32), String> {
    if !moves.is_empty() {
        return Err(format!(
            "poker v1 is showdown-only (no betting); expected 0 moves, got {}",
            moves.len()
        ));
    }
    if deck.len() < 9 {
        return Err("deck too small to deal Hold'em (need >= 9 cards)".to_string());
    }
    // Deal: p1 hole, p2 hole, p1 hole, p2 hole, then 5 community. No burns in v1.
    let p1_hole = [deck[0], deck[2]];
    let p2_hole = [deck[1], deck[3]];
    let board = [deck[4], deck[5], deck[6], deck[7], deck[8]];

    let p1_seven: [u8; 7] = [
        p1_hole[0], p1_hole[1], board[0], board[1], board[2], board[3], board[4],
    ];
    let p2_seven: [u8; 7] = [
        p2_hole[0], p2_hole[1], board[0], board[1], board[2], board[3], board[4],
    ];

    let p1_score = best_of_seven(&p1_seven);
    let p2_score = best_of_seven(&p2_seven);

    let (winner, reason) = if p1_score > p2_score {
        (WINNER_P1, format!("p1_{:?}", p1_score.category))
    } else if p2_score > p1_score {
        (WINNER_P2, format!("p2_{:?}", p2_score.category))
    } else {
        (WINNER_DRAW, "split_pot".to_string())
    };
    Ok((winner, reason, 0))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{replay, sha256_bytes, GameInput, GameType, WINNER_DRAW, WINNER_P1, WINNER_P2};

    fn card(rank: u8, suit: u8) -> u8 {
        suit * 13 + rank
    }

    /// Build a 52-card permutation whose first 9 cards are the dealt cards we want, the rest filling
    /// out the deck. Order of the first 9 controls the deal (p1,p2,p1,p2,board x5).
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

    fn game(deck: Vec<u8>) -> GameInput {
        let commit = sha256_bytes(&deck);
        GameInput {
            game_type: GameType::Poker,
            moves: vec![],
            elapsed_ms: vec![],
            initial_clock_ms: 0,
            increment_ms: 0,
            players: [[1u8; 32], [2u8; 32]],
            stake_sompi: 6_000,
            covenant_id: [13u8; 32],
            deck,
            deck_commitment: commit,
            setup: vec![],
        }
    }

    // ---- score_five unit checks (the trusted core) ----

    #[test]
    fn category_ordering_is_correct() {
        // straight flush > four of a kind > full house > flush > straight > trips > two pair > pair > high
        let sf = score_five(&[card(8, 0), card(7, 0), card(6, 0), card(5, 0), card(4, 0)]); // 10-9-8-7-6 suited
        let quads = score_five(&[card(5, 0), card(5, 1), card(5, 2), card(5, 3), card(2, 0)]);
        let boat = score_five(&[card(5, 0), card(5, 1), card(5, 2), card(2, 0), card(2, 1)]);
        let flush = score_five(&[card(12, 0), card(9, 0), card(6, 0), card(4, 0), card(2, 0)]);
        let straight = score_five(&[card(8, 0), card(7, 1), card(6, 0), card(5, 0), card(4, 0)]);
        let trips = score_five(&[card(5, 0), card(5, 1), card(5, 2), card(9, 0), card(2, 1)]);
        let two_pair = score_five(&[card(5, 0), card(5, 1), card(9, 2), card(9, 0), card(2, 1)]);
        let pair = score_five(&[card(5, 0), card(5, 1), card(9, 2), card(7, 0), card(2, 1)]);
        let high = score_five(&[card(12, 0), card(9, 1), card(6, 2), card(4, 0), card(2, 1)]);
        assert!(sf > quads);
        assert!(quads > boat);
        assert!(boat > flush);
        assert!(flush > straight);
        assert!(straight > trips);
        assert!(trips > two_pair);
        assert!(two_pair > pair);
        assert!(pair > high);
    }

    #[test]
    fn wheel_straight_is_recognized_and_ranks_below_six_high() {
        let wheel = score_five(&[card(12, 0), card(3, 1), card(2, 2), card(1, 0), card(0, 1)]); // A-5-4-3-2
        let six_high = score_five(&[card(4, 0), card(3, 1), card(2, 2), card(1, 0), card(0, 1)]); // 6-5-4-3-2
        assert_eq!(wheel.category, Category::Straight);
        assert_eq!(six_high.category, Category::Straight);
        assert!(six_high > wheel, "6-high straight beats the wheel");
    }

    // ---- known-winner showdown via replay ----

    /// P1 makes a flush, P2 only a pair -> P1 wins.
    /// Deal: p1 = deck[0],deck[2]; p2 = deck[1],deck[3]; board = deck[4..9].
    /// p1 holes are two spades, board has three more spades -> p1 flush.
    /// p2 holes pair the board low card -> p2 pair only.
    #[test]
    fn p1_flush_beats_p2_pair() {
        let deck = deck_with_prefix(&[
            card(12, 0), // p1 hole A spades
            card(0, 1),  // p2 hole 2 hearts
            card(10, 0), // p1 hole Q spades
            card(0, 2),  // p2 hole 2 diamonds -> p2 pairs the board 2 below
            // board:
            card(8, 0),  // 10 spades
            card(6, 0),  // 8 spades
            card(3, 0),  // 5 spades  -> p1 has A,Q,10,8,5 spades = flush
            card(0, 0),  // 2 spades (also completes p1 flush; p2 uses this 2 too)
            card(9, 3),  // J clubs
        ]);
        // p2 best: pair of 2s (holes 2h,2d + board 2s) + kickers. Definitely below a flush.
        let input = game(deck);
        let r = replay(&input).expect("legal showdown");
        assert_eq!(r.winner, WINNER_P1, "reason {}", r.reason);
        assert_eq!(r.num_plies, 0);
    }

    /// P2 wins with trips over P1's two pair.
    #[test]
    fn p2_trips_beats_p1_two_pair() {
        let deck = deck_with_prefix(&[
            card(11, 0), // p1 hole K spades
            card(5, 1),  // p2 hole 7 hearts
            card(9, 1),  // p1 hole J hearts
            card(5, 2),  // p2 hole 7 diamonds
            // board:
            card(11, 3), // K clubs  -> p1 pairs K
            card(9, 2),  // J diamonds -> p1 pairs J => two pair K & J
            card(5, 0),  // 7 spades -> p2 makes trip 7s
            card(2, 3),  // 4 clubs
            card(0, 0),  // 2 spades
        ]);
        let input = game(deck);
        let r = replay(&input).expect("legal showdown");
        assert_eq!(r.winner, WINNER_P2, "reason {}", r.reason);
    }

    /// Exact tie: both players play the board (a straight on the board, neither hole improves) -> draw.
    #[test]
    fn playing_the_board_ties() {
        // Board is a 10-high straight 10-9-8-7-6, holes are tiny and unconnected/unsuited so both
        // players' best 5 is the board straight -> identical scores -> split.
        let deck = deck_with_prefix(&[
            card(0, 0), // p1 hole 2 spades
            card(1, 1), // p2 hole 3 hearts
            card(0, 1), // p1 hole 2 hearts (pair of 2s, but the straight outranks and both use board)
            card(1, 2), // p2 hole 3 diamonds
            // board straight 10-9-8-7-6 mixed suits (not a flush):
            card(8, 0), // 10 spades
            card(7, 1), // 9 hearts
            card(6, 2), // 8 diamonds
            card(5, 3), // 7 clubs
            card(4, 0), // 6 spades
        ]);
        let input = game(deck);
        let r = replay(&input).expect("legal showdown");
        assert_eq!(r.winner, WINNER_DRAW, "reason {}", r.reason);
    }

    // ---- negative tests (the honesty gate) ----

    /// FORGED DECK: tamper after committing -> hash mismatch -> Err.
    #[test]
    fn forged_deck_is_err() {
        let mut input = game(deck_with_prefix(&[
            card(12, 0), card(0, 1), card(10, 0), card(0, 2),
            card(8, 0), card(6, 0), card(3, 0), card(0, 0), card(9, 3),
        ]));
        input.deck.swap(0, 20); // alter the committed deck
        let err = replay(&input).unwrap_err();
        assert!(err.contains("commitment mismatch"), "got: {err}");
    }

    /// ILLEGAL: poker v1 takes no moves; supplying a move is rejected.
    #[test]
    fn moves_in_showdown_v1_is_err() {
        let mut input = game(deck_with_prefix(&[
            card(12, 0), card(0, 1), card(10, 0), card(0, 2),
            card(8, 0), card(6, 0), card(3, 0), card(0, 0), card(9, 3),
        ]));
        input.moves = vec!["bet".to_string()];
        input.elapsed_ms = vec![0];
        let err = replay(&input).unwrap_err();
        assert!(err.contains("showdown-only"), "got: {err}");
    }
}
