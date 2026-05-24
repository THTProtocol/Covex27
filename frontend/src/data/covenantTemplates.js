// Covex Covenant Template Registry — hundreds of ready-made interactive covenant UIs
// Each template maps to a React component via game_type. All share the same backend skill_games endpoints.

import ChessGameBoard from '../components/ChessGameBoard';
import TicTacToeGame from '../components/TicTacToeGame';
import Connect4Game from '../components/Connect4Game';
import CheckersGame from '../components/CheckersGame';
import RockPaperScissorsGame from '../components/RockPaperScissorsGame';
import BattleshipGame from '../components/BattleshipGame';
import GenericTurnBasedGame from '../components/GenericTurnBasedGame';
import GenericCardGame from '../components/GenericCardGame';
import GenericAuctionGame from '../components/GenericAuctionGame';
import GenericEscrowGame from '../components/GenericEscrowGame';
import GenericLotteryGame from '../components/GenericLotteryGame';

// ─── CATEGORIES ──────────────────────────────────────────
export const CATEGORIES = {
  skill_games:    { label: 'Skill Games',      icon: '🎮', color: '#49EACB', order: 1 },
  casino:         { label: 'Casino & Cards',    icon: '🃏', color: '#E8AF34', order: 2 },
  auction:        { label: 'Auctions',          icon: '🔨', color: '#7e14ff', order: 3 },
  lottery:        { label: 'Lottery & Raffles', icon: '🎰', color: '#ff6b6b', order: 4 },
  escrow:         { label: 'Escrow & Vesting',  icon: '🔐', color: '#3B82F6', order: 5 },
  bounty:         { label: 'Bounties & Puzzles',icon: '🏆', color: '#f59e0b', order: 6 },
  multisig:       { label: 'Multi-Sig & Pools', icon: '👥', color: '#A855F7', order: 7 },
  general:        { label: 'General Purpose',   icon: '📋', color: '#6B7280', order: 8 },
};

// ─── COMPONENT MAP ───────────────────────────────────────
const COMPONENTS = {
  chess:       ChessGameBoard,
  tictactoe:   TicTacToeGame,
  connect4:    Connect4Game,
  checkers:    CheckersGame,
  rps:         RockPaperScissorsGame,
  battleship:  BattleshipGame,
  generic_turnbased: GenericTurnBasedGame,
  generic_card:     GenericCardGame,
  generic_auction:  GenericAuctionGame,
  generic_escrow:   GenericEscrowGame,
  generic_lottery:  GenericLotteryGame,
};

// ─── MASSIVE TEMPLATE REGISTRY ──────────────────────────
// Each entry: { id, name, category, icon, desc, component, players, config? }

const TEMPLATES = [
  // ═══ SKILL GAMES ═══════════════════════════════════════
  { id: 'chess',        category: 'skill_games', name: 'Winner-Takes-All Chess',       icon: '♟️', desc: 'Full chess match. Winner claims the entire pot.', players: '2', component: 'chess' },
  { id: 'tictactoe',    category: 'skill_games', name: 'Tic-Tac-Toe Arena',            icon: '⭕', desc: 'Classic 3x3 grid. First to align three wins the pot.', players: '2', component: 'tictactoe' },
  { id: 'connect4',     category: 'skill_games', name: 'Connect 4 Duel',               icon: '🔴', desc: 'Drop discs strategically. Connect 4 to win.', players: '2', component: 'connect4' },
  { id: 'checkers',     category: 'skill_games', name: 'Checkers Showdown',            icon: '⚫', desc: 'Standard checkers. Capture all or force a blockade.', players: '2', component: 'checkers' },
  { id: 'rps',          category: 'skill_games', name: 'Rock-Paper-Scissors Duel',     icon: '✊', desc: 'Best of 1. Instant resolution — winner takes all.', players: '2', component: 'rps' },
  { id: 'battleship',   category: 'skill_games', name: 'Battleship Strike',            icon: '🚢', desc: 'Sink the fleet. 5×5 grid — simplified naval combat.', players: '2', component: 'battleship' },
  { id: 'memory_match', category: 'skill_games', name: 'Memory Match Arena',           icon: '🧠', desc: 'Flip cards. Match pairs. Fastest memory wins the pot.', players: '2', component: 'generic_turnbased', config: { variant: 'memory', size: 4 } },
  { id: 'reversi',      category: 'skill_games', name: 'Reversi / Othello',            icon: '⚪', desc: 'Classic reversi. Flip discs. Most pieces wins.', players: '2', component: 'generic_turnbased', config: { variant: 'reversi', size: 8 } },
  { id: 'go_9x9',       category: 'skill_games', name: 'Go (9×9 Starter)',             icon: '♟️', desc: 'Simplified Go on a 9×9 board. Territory capture.', players: '2', component: 'generic_turnbased', config: { variant: 'go', size: 9 } },
  { id: 'mancala',      category: 'skill_games', name: 'Mancala Duel',                 icon: '🕳️', desc: 'Ancient seed-sowing game. Collect more stones.', players: '2', component: 'generic_turnbased', config: { variant: 'mancala' } },
  { id: 'dots_boxes',   category: 'skill_games', name: 'Dots & Boxes',                icon: '📦', desc: 'Connect dots to claim boxes. Most boxes wins.', players: '2', component: 'generic_turnbased', config: { variant: 'dots', size: 5 } },
  { id: 'nim',          category: 'skill_games', name: 'Nim Challenge',                icon: '📊', desc: 'Remove counters. Last move wins the pot.', players: '2', component: 'generic_turnbased', config: { variant: 'nim', piles: 4 } },

  // ═══ CASINO & CARD GAMES ══════════════════════════════
  { id: 'blackjack',    category: 'casino', name: 'Blackjack Showdown',                icon: '🃏', desc: 'Classic 21. Beat the house or another player.', players: '1-2', component: 'generic_card', config: { variant: 'blackjack' } },
  { id: 'poker_heads',  category: 'casino', name: 'Texas Hold\'em Heads-Up',           icon: '♠️', desc: 'Two-player poker. Community cards. All-in pot.', players: '2', component: 'generic_card', config: { variant: 'poker', rounds: 4 } },
  { id: 'hilo',         category: 'casino', name: 'Higher or Lower',                  icon: '🔺', desc: 'Guess if next card is higher. Streak for the pot.', players: '1-2', component: 'generic_card', config: { variant: 'hilo', deck: 1 } },
  { id: 'coin_flip',    category: 'casino', name: 'Coin Flip Duel',                   icon: '🪙', desc: 'Choose heads or tails. Instant 50/50 resolution.', players: '2', component: 'generic_card', config: { variant: 'coinflip' } },
  { id: 'war',           category: 'casino', name: 'Card War',                         icon: '⚔️', desc: 'Highest card wins the round. Last card standing.', players: '2', component: 'generic_card', config: { variant: 'war' } },
  { id: 'roulette',     category: 'casino', name: 'Covenant Roulette',                icon: '🎡', desc: 'Provably fair roulette. Bet on color or number.', players: '2-8', component: 'generic_card', config: { variant: 'roulette', slots: 37 } },
  { id: 'dice_duel',    category: 'casino', name: 'Dice Duel',                        icon: '🎲', desc: 'Roll against opponent. Highest roll wins.', players: '2', component: 'generic_card', config: { variant: 'dice', dice: 2 } },
  { id: 'baccarat',     category: 'casino', name: 'Baccarat Mini',                    icon: '9️⃣', desc: 'Simplified baccarat. Closest to 9 wins.', players: '2', component: 'generic_card', config: { variant: 'baccarat' } },
  { id: 'craps_simple', category: 'casino', name: 'Craps (Simplified)',                icon: '🎲', desc: 'Pass line bet. First-roll 7/11 wins.', players: '2-6', component: 'generic_card', config: { variant: 'craps' } },

  // ═══ AUCTIONS ═════════════════════════════════════════
  { id: 'blind_auction', category: 'auction', name: 'Blind/Sealed-Bid Auction',        icon: '🤐', desc: 'Submit sealed bids. Highest bid wins. All-or-nothing reveal.', players: '2-50', component: 'generic_auction', config: { variant: 'blind', revealTime: 86400 } },
  { id: 'dutch_auction', category: 'auction', name: 'Dutch Auction',                   icon: '⬇️', desc: 'Price descends until someone accepts. First taker wins.', players: '1-50', component: 'generic_auction', config: { variant: 'dutch', startPrice: 1000, minPrice: 1, step: 10 } },
  { id: 'english_auction', category: 'auction', name: 'English Auction',                icon: '🔨', desc: 'Ascending bids. Highest bidder wins when time expires.', players: '2-50', component: 'generic_auction', config: { variant: 'english', duration: 86400, minBidInc: 5 } },
  { id: 'vickrey', category: 'auction', name: 'Vickrey Auction',                       icon: '🤫', desc: 'Second-price sealed bid. Winner pays second-highest bid.', players: '2-50', component: 'generic_auction', config: { variant: 'vickrey' } },
  { id: 'penny_auction', category: 'auction', name: 'Penny Auction',                    icon: '💸', desc: 'Each bid raises price by 1¢. Last bidder wins.', players: '2-100', component: 'generic_auction', config: { variant: 'penny', bidCost: 1, increment: 0.01 } },
  { id: 'reverse_auction', category: 'auction', name: 'Reverse Auction',                 icon: '🔄', desc: 'Sellers compete. Lowest price wins the contract.', players: '2-50', component: 'generic_auction', config: { variant: 'reverse' } },
  { id: 'all_pay_auction', category: 'auction', name: 'All-Pay Auction',                 icon: '💰', desc: 'Everyone pays their bid. Highest bidder wins.', players: '3-20', component: 'generic_auction', config: { variant: 'allpay' } },
  { id: 'japanese_auction', category: 'auction', name: 'Japanese Auction',                icon: '🏯', desc: 'Price climbs. Drop out when it exceeds your limit.', players: '2-30', component: 'generic_auction', config: { variant: 'japanese', startPrice: 1, increment: 5 } },

  // ═══ LOTTERY & RAFFLES ════════════════════════════════
  { id: 'simple_raffle', category: 'lottery', name: 'Simple Raffle',                     icon: '🎟️', desc: 'Buy tickets. Random draw picks winner.', players: '1-1000', component: 'generic_lottery', config: { variant: 'raffle', ticketPrice: 10, maxTickets: 1000 } },
  { id: 'jackpot_lotto', category: 'lottery', name: 'Jackpot Lottery',                   icon: '💎', desc: 'Growing jackpot. Pick numbers. Match to win.', players: '1-10000', component: 'generic_lottery', config: { variant: 'jackpot', numCount: 6, maxNum: 49, ticketPrice: 5 } },
  { id: 'no_loss_lottery', category: 'lottery', name: 'No-Loss Lottery',                 icon: '🛡️', desc: 'Buy tickets. Winner gets interest. Everyone gets stake back.', players: '1-5000', component: 'generic_lottery', config: { variant: 'noloss', ticketPrice: 100 } },
  { id: 'provably_fair_lotto', category: 'lottery', name: 'Provably Fair Lottery',        icon: '🔮', desc: 'Hash-committed randomness. Fully verifiable draw.', players: '1-5000', component: 'generic_lottery', config: { variant: 'provablyfair', saltBits: 256 } },
  { id: 'sweepstakes', category: 'lottery', name: 'Sweepstakes Pool',                   icon: '🎁', desc: 'Free entry. Weighted random selection. Community-funded.', players: '1-100000', component: 'generic_lottery', config: { variant: 'sweepstakes' } },
  { id: 'combo_lotto', category: 'lottery', name: 'Combination Lotto',                   icon: '🔢', desc: 'Pick 3 numbers. Exact match = jackpot. Partial = smaller prizes.', players: '1-10000', component: 'generic_lottery', config: { variant: 'combo', numCount: 3, maxNum: 10 } },
  { id: 'leaderboard_lotto', category: 'lottery', name: 'Leaderboard Lottery',            icon: '🏅', desc: 'Top ticket buyers get bonus entries. Tiered prizes.', players: '1-5000', component: 'generic_lottery', config: { variant: 'leaderboard' } },
  { id: 'instant_win', category: 'lottery', name: 'Instant Win Scratch',                 icon: '✨', desc: 'Buy and reveal instantly. Pre-determined winners.', players: '1-1000', component: 'generic_lottery', config: { variant: 'instant', winRate: 0.1 } },

  // ═══ ESCROW & VESTING ══════════════════════════════════
  { id: 'simple_escrow', category: 'escrow', name: 'Simple Two-Party Escrow',           icon: '🤝', desc: 'Both parties deposit. Released on mutual approval.', players: '2', component: 'generic_escrow', config: { variant: 'escrow', releaseType: 'mutual' } },
  { id: 'arbitrated_escrow', category: 'escrow', name: 'Arbitrated Escrow',               icon: '⚖️', desc: 'Third-party arbitrator resolves disputes. 2-of-3 release.', players: '3', component: 'generic_escrow', config: { variant: 'arbitrated' } },
  { id: 'timed_escrow', category: 'escrow', name: 'Timed Auto-Release Escrow',          icon: '⏰', desc: 'Funds auto-release after timelock expires if not disputed.', players: '2', component: 'generic_escrow', config: { variant: 'timed', duration: 604800 } },
  { id: 'milestone_escrow', category: 'escrow', name: 'Milestone Escrow',                icon: '📋', desc: 'Funds released in phases as milestones are approved.', players: '2', component: 'generic_escrow', config: { variant: 'milestone', phases: 5 } },
  { id: 'linear_vesting', category: 'escrow', name: 'Linear Vesting Schedule',          icon: '📈', desc: 'Tokens unlock linearly over time. Claimable each block.', players: '1', component: 'generic_escrow', config: { variant: 'linear_vesting', duration: 31536000 } },
  { id: 'cliff_vesting', category: 'escrow', name: 'Cliff Vesting',                     icon: '🧗', desc: 'Full lockup for N days, then full release. Classic startup vesting.', players: '1', component: 'generic_escrow', config: { variant: 'cliff', cliffDays: 365, totalDays: 1460 } },
  { id: 'reversible_vesting', category: 'escrow', name: 'Reversible Vesting',            icon: '↩️', desc: 'Vesting can be revoked by admin. Used for employee grants.', players: '2', component: 'generic_escrow', config: { variant: 'reversible', adminCanRevoke: true } },
  { id: 'subscription_escrow', category: 'escrow', name: 'Subscription Escrow',           icon: '🔄', desc: 'Recurring payments held in escrow. Auto-released monthly.', players: '2', component: 'generic_escrow', config: { variant: 'subscription', interval: 2592000 } },

  // ═══ BOUNTIES & CHALLENGES ═════════════════════════════
  { id: 'puzzle_bounty', category: 'bounty', name: 'Puzzle Bounty',                     icon: '🧩', desc: 'Post a puzzle. First correct solution claims the pot.', players: '1-50', component: 'generic_escrow', config: { variant: 'puzzle', solutionType: 'hash' } },
  { id: 'bug_bounty', category: 'bounty', name: 'Bug Bounty Program',                   icon: '🐛', desc: 'Report valid bugs. Creator approves and pays from pool.', players: '2-1000', component: 'generic_escrow', config: { variant: 'bugbounty', minPayout: 100 } },
  { id: 'prediction_yesno', category: 'bounty', name: 'Prediction Market (Yes/No)',      icon: '📊', desc: 'Bet on yes/no outcomes. Resolved by oracle or vote.', players: '2-1000', component: 'generic_escrow', config: { variant: 'predict_yesno', resolveBy: 'oracle' } },
  { id: 'prediction_multi', category: 'bounty', name: 'Prediction Market (Multi-Outcome)', icon: '📈', desc: 'Bet on 3-8 possible outcomes. Proportional payout.', players: '2-1000', component: 'generic_escrow', config: { variant: 'predict_multi', outcomes: 5 } },
  { id: 'tournament_bracket', category: 'bounty', name: 'Tournament Bracket Pool',       icon: '🏁', desc: 'Single-elimination bracket. Entry fee + pot distribution.', players: '4-64', component: 'generic_escrow', config: { variant: 'tournament', rounds: 6, split: [0.6, 0.25, 0.15] } },
  { id: 'hackathon', category: 'bounty', name: 'Hackathon Prize Pool',                  icon: '💻', desc: 'Multiple prizes for best submissions. Community voting.', players: '5-100', component: 'generic_escrow', config: { variant: 'hackathon', prizeCount: 3 } },
  { id: 'crowdfund_goal', category: 'bounty', name: 'Crowdfund Goal',                    icon: '🎯', desc: 'Funds held until goal met. Refunded if goal not reached.', players: '1-10000', component: 'generic_escrow', config: { variant: 'crowdfund', goalKas: 10000, deadline: 2592000 } },
  { id: 'sports_bet', category: 'bounty', name: 'Sports Match Bet',                     icon: '⚽', desc: 'Pick winner/margin. Oracle resolves after match ends.', players: '2-100', component: 'generic_escrow', config: { variant: 'sports', marginBet: true } },

  // ═══ MULTI-SIG & POOLS ════════════════════════════════
  { id: 'multisig_2of3', category: 'multisig', name: '2-of-3 Multi-Sig Wallet',          icon: '🔑', desc: 'Two of three signers must approve any withdrawal.', players: '3', component: 'generic_escrow', config: { variant: 'multisig', required: 2, total: 3 } },
  { id: 'multisig_3of5', category: 'multisig', name: '3-of-5 Multi-Sig DAO Treasury',   icon: '🏛️', desc: 'Three of five key holders required. DAO treasury standard.', players: '5', component: 'generic_escrow', config: { variant: 'multisig', required: 3, total: 5 } },
  { id: 'multisig_mofn', category: 'multisig', name: 'M-of-N Multi-Sig (Custom)',       icon: '⚙️', desc: 'Configurable threshold. Any M of N signers can release.', players: '2-20', component: 'generic_escrow', config: { variant: 'multisig_custom' } },
  { id: 'community_pool', category: 'multisig', name: 'Community Treasury Pool',         icon: '🏊', desc: 'Stake-weighted voting. Proposals funded from shared treasury.', players: '2-1000', component: 'generic_escrow', config: { variant: 'communitypool', votingPeriod: 604800 } },
  { id: 'liquidity_pool', category: 'multisig', name: 'Liquidity Pool (Simple AMM)',     icon: '🌊', desc: 'Deposit pairs. Auto-market-maker with fee distribution.', players: '2-500', component: 'generic_escrow', config: { variant: 'liquidity', feeBps: 30 } },
  { id: 'staking_pool', category: 'multisig', name: 'Staking Reward Pool',               icon: '📈', desc: 'Lock KAS for rewards. Proportional yield distribution.', players: '2-1000', component: 'generic_escrow', config: { variant: 'staking', lockPeriod: 2592000, apy: 12 } },
  { id: 'grant_dao', category: 'multisig', name: 'Grant DAO Pool',                      icon: '🎓', desc: 'Apply for grants. Token-weighted voting decides funding.', players: '5-1000', component: 'generic_escrow', config: { variant: 'grantdao', minQuorum: 0.2 } },
  { id: 'revenue_split', category: 'multisig', name: 'Revenue Split Contract',           icon: '📊', desc: 'Auto-split incoming funds by fixed percentages.', players: '2-10', component: 'generic_escrow', config: { variant: 'revenuesplit', shares: [0.5, 0.3, 0.2] } },

  // ═══ GENERAL PURPOSE ═════════════════════════════════
  { id: 'timelock_simple', category: 'general', name: 'Simple Timelock',                  icon: '🔒', desc: 'Lock funds until a specific block height or timestamp.', players: '1', component: 'generic_escrow', config: { variant: 'timelock', lockType: 'block' } },
  { id: 'streaming_payment', category: 'general', name: 'Streaming Payment',               icon: '💧', desc: 'Continuous money stream per block. Cancel anytime.', players: '2', component: 'generic_escrow', config: { variant: 'streaming', ratePerBlock: 0.001 } },
  { id: 'conditional_payment', category: 'general', name: 'Conditional Payment',           icon: '❓', desc: 'Pay on condition. Oracle or multisig determines outcome.', players: '2-3', component: 'generic_escrow', config: { variant: 'conditional' } },
  { id: 'htlc', category: 'general', name: 'Hash Timelock Contract (HTLC)',              icon: '⛓️', desc: 'Atomic swap-compatible HTLC. Reveal preimage to claim.', players: '2', component: 'generic_escrow', config: { variant: 'htlc', hashAlgo: 'sha256' } },
  { id: 'charity_pool', category: 'general', name: 'Charity / Donation Pool',            icon: '💝', desc: 'Transparent donation pool. Community votes on disbursement.', players: '1-10000', component: 'generic_escrow', config: { variant: 'charitypool' } },
  { id: 'savings_lock', category: 'general', name: 'Savings Lock',                       icon: '🏦', desc: 'Self-lock your own funds. Break penalty goes to charity.', players: '1', component: 'generic_escrow', config: { variant: 'savings', penaltyPct: 10 } },
  { id: 'inheritance', category: 'general', name: 'Digital Inheritance',                 icon: '📜', desc: 'Auto-transfer to heir after inactivity period.', players: '2', component: 'generic_escrow', config: { variant: 'inheritance', inactivityDays: 365 } },
  { id: 'subscription', category: 'general', name: 'Recurring Subscription',             icon: '📆', desc: 'Auto-deduct subscription payments. Cancelable with notice.', players: '2', component: 'generic_escrow', config: { variant: 'subscription_simple', interval: 2592000 } },
  { id: 'kickstarter', category: 'general', name: 'All-or-Nothing Fundraiser',           icon: '🚀', desc: 'Goal-based fundraising. 100% refund if goal not met.', players: '1-10000', component: 'generic_escrow', config: { variant: 'kickstarter', goalKas: 5000 } },
  { id: 'payroll', category: 'general', name: 'Automated Payroll',                       icon: '💼', desc: 'Batch salary disbursement. Multi-recipient auto-pay.', players: '2-500', component: 'generic_escrow', config: { variant: 'payroll', payInterval: 604800 } },
  { id: 'royalty_split', category: 'general', name: 'NFT / IP Royalty Split',            icon: '🎨', desc: 'Auto-distribute royalties to multiple creators.', players: '2-20', component: 'generic_escrow', config: { variant: 'royalty', shares: [0.4, 0.3, 0.2, 0.1] } },
  { id: 'decentralized_will', category: 'general', name: 'Decentralized Will',             icon: '⚰️', desc: 'Multi-sig inheritance. Heirs + executor release funds.', players: '3-10', component: 'generic_escrow', config: { variant: 'will', executors: ['heir1', 'heir2', 'lawyer'] } },
  { id: 'airdrop', category: 'general', name: 'Token Airdrop Manager',                   icon: '🪂', desc: 'Batch airdrop tokens to a list of addresses.', players: '1', component: 'generic_escrow', config: { variant: 'airdrop', recipientsMax: 1000 } },

  // ═══ EXTRA GAMES & EXPERIMENTS ═══════════════════════
  { id: 'wordle_duel', category: 'skill_games', name: 'Wordle Duel',                     icon: '📝', desc: 'Guess the word in 6 tries. Fastest guess wins.', players: '2', component: 'generic_turnbased', config: { variant: 'wordle', wordLen: 5, maxGuesses: 6 } },
  { id: 'hangman', category: 'skill_games', name: 'Hangman Wager',                      icon: '🪢', desc: 'Guess the word letter by letter. Lose a life each miss.', players: '2', component: 'generic_turnbased', config: { variant: 'hangman' } },
  { id: 'sudoku_race', category: 'skill_games', name: 'Sudoku Race',                    icon: '🔢', desc: 'Solve the same puzzle. Fastest solution wins.', players: '2', component: 'generic_turnbased', config: { variant: 'sudoku', difficulty: 'medium' } },
  { id: 'trivia', category: 'bounty', name: 'Trivia Challenge',                         icon: '❓', desc: 'Answer questions correctly. Most points wins pot.', players: '2-20', component: 'generic_escrow', config: { variant: 'trivia', questionCount: 10 } },
  { id: 'keno', category: 'lottery', name: 'Keno Quick-Draw',                           icon: '🎯', desc: 'Pick up to 10 numbers. Match to win from pot.', players: '1-100', component: 'generic_lottery', config: { variant: 'keno', maxPicks: 10, numRange: 80 } },
  { id: 'bingo', category: 'lottery', name: 'Bingo Hall',                                icon: '🅱️', desc: 'Classic bingo. First to complete a line wins.', players: '2-200', component: 'generic_lottery', config: { variant: 'bingo', cardSize: 5 } },
];

// ─── EXPORTS ─────────────────────────────────────────────

export function getTemplatesByCategory(cat) {
  return TEMPLATES.filter(t => t.category === cat);
}

export function getTemplateById(id) {
  return TEMPLATES.find(t => t.id === id) || null;
}

export function getComponentForTemplate(templateId) {
  const t = getTemplateById(templateId);
  if (!t) return COMPONENTS.chess;
  return COMPONENTS[t.component] || COMPONENTS.chess;
}

export function getAllTemplates() {
  return TEMPLATES;
}

export function getPopularTemplates(limit = 12) {
  return TEMPLATES.slice(0, limit);
}

export function searchTemplates(query) {
  const q = query.toLowerCase();
  return TEMPLATES.filter(t =>
    t.name.toLowerCase().includes(q) ||
    t.desc.toLowerCase().includes(q) ||
    t.category.includes(q) ||
    (t.id && t.id.includes(q))
  );
}

export default TEMPLATES;
