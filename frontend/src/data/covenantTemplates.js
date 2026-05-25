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
  { id: "shogi_mini", category: "skill_games", name: "Shogi Mini (5x5)", icon: "🀄", desc: 'Japanese chess on compact board. Capture the king.', players: "2", component: "generic_turnbased" },
  { id: "draughts_intl", category: "skill_games", name: "International Draughts", icon: "⚫", desc: '10x10 draughts with king promotion and flying captures.', players: "2", component: "generic_turnbased" },
  { id: "mastermind", category: "skill_games", name: "Mastermind Codebreaker", icon: "🔍", desc: 'Crack the color code in 10 turns. Feedback on each guess.', players: "2", component: "generic_turnbased" },
  { id: "backgammon", category: "skill_games", name: "Backgammon Blitz", icon: "🎲", desc: 'Race pieces off the board. Doubling cube for high stakes.', players: "2", component: "generic_turnbased" },
  { id: "gomoku", category: "skill_games", name: "Gomoku / 5-in-a-Row", icon: "⚪", desc: 'Place 5 stones in a row before opponent claims it.', players: "2", component: "generic_turnbased" },
  { id: "hex_conquest", category: "skill_games", name: "Hex Board Conquest", icon: "🔷", desc: 'Connect opposite sides of hex grid. Bridge to win.', players: "2", component: "generic_turnbased" },
  { id: "dominoes", category: "skill_games", name: "Dominoes Draft", icon: "🀄", desc: 'Match tiles. First to play all dominoes claims pot.', players: "2-4", component: "generic_turnbased" },
  { id: "scrabble_battle", category: "skill_games", name: "Scrabble Battle", icon: "🔤", desc: 'Form words on the board. Triple word score bonuses.', players: "2-4", component: "generic_turnbased" },
  { id: "block_puzzle", category: "skill_games", name: "Block Puzzle Arena", icon: "🧱", desc: 'Drop tetrominos. Fill rows to clear. Highest score wins.', players: "2", component: "generic_turnbased" },
  { id: "battleship_solo", category: "skill_games", name: "Battleship Solo vs AI", icon: "🤖", desc: 'Solo battleship against escalating AI difficulty.', players: "1", component: "generic_turnbased" },
  { id: "tangram", category: "skill_games", name: "Tangram Challenge", icon: "🔼", desc: 'Arrange 7 shapes to match silhouette. Speed battle.', players: "2", component: "generic_turnbased" },
  { id: "word_search", category: "skill_games", name: "Word Search Race", icon: "🔎", desc: 'Find hidden words in grid. Most found in time wins.', players: "2", component: "generic_turnbased" },
  { id: "video_poker", category: "casino", name: "Video Poker Jackpot", icon: "🃏", desc: 'Jacks or Better. Hold/draw for best hand. Progressive.', players: "1", component: "generic_card" },
  { id: "caribbean_stud", category: "casino", name: "Caribbean Stud", icon: "🏝", desc: 'Beat the dealer with 5 cards. Progressive side bet.', players: "1-5", component: "generic_card" },
  { id: "three_card_poker", category: "casino", name: "Three Card Poker", icon: "3️⃣", desc: 'Fast poker with 3 cards. Pair plus bonus bet.', players: "1-5", component: "generic_card" },
  { id: "pai_gow", category: "casino", name: "Pai Gow Poker", icon: "🀄", desc: 'Split 7 cards into two hands. Beat dealer on both.', players: "1-6", component: "generic_card" },
  { id: "sic_bo", category: "casino", name: "Sic Bo Dice", icon: "🎲", desc: 'Ancient Chinese dice game. Bet on 3-dice combos.', players: "1-10", component: "generic_card" },
  { id: "wheel_fortune", category: "casino", name: "Wheel of Fortune", icon: "🎡", desc: 'Spin the prize wheel. 24 segments, up to 40x multiplier.', players: "1-20", component: "generic_card" },
  { id: "casino_war", category: "casino", name: "Casino War", icon: "⚔", desc: 'Higher card wins. Tie triggers war for double pot.', players: "1-8", component: "generic_card" },
  { id: "pontoon", category: "casino", name: "Pontoon (UK 21)", icon: "🇬🇧", desc: 'British blackjack. 5-card trick pays 2:1.', players: "1-6", component: "generic_card" },
  { id: "red_dog", category: "casino", name: "Red Dog", icon: "🐕", desc: 'Third card falls between first two? Bet the spread.', players: "1-8", component: "generic_card" },
  { id: "spanish21", category: "casino", name: "Spanish 21", icon: "🇪🇸", desc: 'Blackjack with no 10s. Late surrender, double any cards.', players: "1-6", component: "generic_card" },
  { id: "let_it_ride", category: "casino", name: "Let It Ride", icon: "🎰", desc: 'Pull back bets after seeing cards. Up to 3 bets active.', players: "1-7", component: "generic_card" },
  { id: "big_six", category: "casino", name: "Big Six Wheel", icon: "🎯", desc: 'Bet on 1/2/5/10/20/40. Wheel decides payout.', players: "1-20", component: "generic_card" },
  { id: "boule", category: "casino", name: "Boule / Petits Chevaux", icon: "🐴", desc: 'French roulette variant with 25 slots. Simplified odds.', players: "1-8", component: "generic_card" },
  { id: "teen_patti", category: "casino", name: "Teen Patti (Indian Poker)", icon: "🇮🇳", desc: '3-card Indian poker. Blind vs seen play. Side pots.', players: "2-8", component: "generic_card" },
  { id: "faro", category: "casino", name: "Faro Bank", icon: "🏦", desc: '1800s saloon card game. Bet on suit vs rank outcomes.', players: "1-10", component: "generic_card" },
  { id: "silent_auction", category: "auction", name: "Silent Auction", icon: "🤫", desc: 'Submit sealed bids. Highest revealed at end. No live bidding.', players: "2-50", component: "generic_auction" },
  { id: "ascending_clock", category: "auction", name: "Ascending Clock Auction", icon: "🕐", desc: 'Price rises automatically. Bid while you want in.', players: "2-30", component: "generic_auction" },
  { id: "lighthouse", category: "auction", name: "Lighthouse Auction", icon: "🏮", desc: 'Price starts high. First bidder wins at current price.', players: "2-30", component: "generic_auction" },
  { id: "combinatorial", category: "auction", name: "Combinatorial Auction", icon: "🧩", desc: 'Bid on bundles of items. Package deals awarded.', players: "3-30", component: "generic_auction" },
  { id: "double_auction", category: "auction", name: "Double Auction", icon: "↔️", desc: 'Buyers and sellers both submit orders. Continuous match.', players: "3-100", component: "generic_auction" },
  { id: "candle_auction", category: "auction", name: "Candle Auction", icon: "🕯", desc: 'Bidding ends when candle burns out. No fixed end time.', players: "2-50", component: "generic_auction" },
  { id: "bidding_fee", category: "auction", name: "Bidding Fee Auction", icon: "💸", desc: 'Every bid costs a fee. Last bidder wins the item.', players: "2-100", component: "generic_auction" },
  { id: "multi_unit", category: "auction", name: "Multi-Unit Auction", icon: "📦", desc: 'Sell N identical items. Top N bidders each win one.', players: "3-100", component: "generic_auction" },
  { id: "procurement", category: "auction", name: "Procurement Auction", icon: "🏗", desc: 'Reverse auction for services. Lowest bidder wins contract.', players: "2-30", component: "generic_auction" },
  { id: "yankee_auction", category: "auction", name: "Yankee Auction", icon: "⚾", desc: 'Multi-item Dutch. Multiple winners at descending prices.', players: "3-50", component: "generic_auction" },
  { id: "walrasian", category: "auction", name: "Walrasian Tatonnement", icon: "📐", desc: 'Auctioneer adjusts price until supply equals demand.', players: "3-50", component: "generic_auction" },
  { id: "spectrum", category: "auction", name: "Spectrum Auction", icon: "📡", desc: 'FCC-style multi-round auction for divisible goods.', players: "3-100", component: "generic_auction" },
  { id: "powerball_lotto", category: "lottery", name: "Powerball Lotto", icon: "💪", desc: 'Pick 5+1 numbers. Match powerball for bonus payouts.', players: "1-10000", component: "generic_lottery" },
  { id: "scratch_three", category: "lottery", name: "Triple Scratch", icon: "🔄", desc: 'Reveal 3 panels. Match 3 symbols to win the pot.', players: "1-5000", component: "generic_lottery" },
  { id: "lucky_dip", category: "lottery", name: "Lucky Dip", icon: "🍀", desc: 'Random ticket assignment. No picking, pure chance.', players: "1-5000", component: "generic_lottery" },
  { id: "daily_draw", category: "lottery", name: "Daily Draw Lottery", icon: "📅", desc: 'Draws every 24 hours. Auto-enter subscription mode.', players: "1-1000", component: "generic_lottery" },
  { id: "reverse_lotto", category: "lottery", name: "Reverse Lottery", icon: "🔙", desc: 'Everyone buys in. Last standing wins. Losers eliminated.', players: "2-1000", component: "generic_lottery" },
  { id: "charity_raffle", category: "lottery", name: "Charity Raffle", icon: "💝", desc: 'Proceeds to charity. Tax-transparent on-chain receipt.', players: "1-10000", component: "generic_lottery" },
  { id: "airdrop_lotto", category: "lottery", name: "Airdrop Lottery", icon: "🪂", desc: 'Free lottery. Token holders weighted by balance.', players: "1-50000", component: "generic_lottery" },
  { id: "nft_raffle", category: "lottery", name: "NFT Raffle", icon: "🖼", desc: 'Raffle off an NFT. Each ticket is a bid. Provably fair.', players: "1-5000", component: "generic_lottery" },
  { id: "quickdraw", category: "lottery", name: "Quick Draw", icon: "⚡", desc: 'Pick 1-10 numbers. Draw every 5 minutes. Instant.', players: "1-100", component: "generic_lottery" },
  { id: "super_keno", category: "lottery", name: "Super Keno", icon: "🎯", desc: 'Pick 15 from 80. Progressive jackpot carries over.', players: "1-500", component: "generic_lottery" },
  { id: "pick3_lotto", category: "lottery", name: "Pick 3 Lotto", icon: "3️⃣", desc: 'Pick 3 digits. Straight/box/combo bets. Twice daily.', players: "1-5000", component: "generic_lottery" },
  { id: "tontine", category: "lottery", name: "Tontine Pool", icon: "👴", desc: 'Last survivor claims entire pool. Longevity investment.', players: "5-50", component: "generic_lottery" },
  { id: "mega_millions", category: "lottery", name: "Mega Millions", icon: "💎", desc: '5 numbers + mega ball. Huge progressive jackpot.', players: "1-50000", component: "generic_lottery" },
  { id: "block_hash_lotto", category: "lottery", name: "Block Hash Lotto", icon: "⛓", desc: 'Winner by future block hash. Truly random. Verifiable.', players: "1-10000", component: "generic_lottery" },
  { id: "rent_deposit", category: "escrow", name: "Rental Deposit Escrow", icon: "🏠", desc: 'Landlord-tenant deposit. Dispute resolution built in.', players: "2", component: "generic_escrow" },
  { id: "freelance_escrow", category: "escrow", name: "Freelance Escrow", icon: "💼", desc: 'Client funds locked until deliverables approved by client.', players: "2", component: "generic_escrow" },
  { id: "domain_escrow", category: "escrow", name: "Domain Name Escrow", icon: "🌐", desc: 'Secure domain transfer. Funds after registrar confirms.', players: "2-3", component: "generic_escrow" },
  { id: "construction_escrow", category: "escrow", name: "Construction Escrow", icon: "🏗", desc: 'Progress payments at each building phase milestone.', players: "2-5", component: "generic_escrow" },
  { id: "ipo_lockup", category: "escrow", name: "IPO Lockup Escrow", icon: "📈", desc: 'Token lockup for team. Gradual release over 4 years.', players: "1-100", component: "generic_escrow" },
  { id: "insurance_escrow", category: "escrow", name: "Insurance Claim Escrow", icon: "🛡", desc: 'Claim held until adjuster verifies damage. Anti-fraud.', players: "2-5", component: "generic_escrow" },
  { id: "event_ticketing", category: "escrow", name: "Event Ticketing Escrow", icon: "🎫", desc: 'Ticket funds held until event. Refund if canceled.', players: "1-5000", component: "generic_escrow" },
  { id: "carbon_credit", category: "escrow", name: "Carbon Credit Escrow", icon: "🌿", desc: 'Carbon offsets held until verified. Green project funding.', players: "2-50", component: "generic_escrow" },
  { id: "nft_collateral", category: "escrow", name: "NFT Collateral Escrow", icon: "🖼", desc: 'Use NFT as collateral. Returned when loan repaid.', players: "2", component: "generic_escrow" },
  { id: "code_review_bounty", category: "escrow", name: "Code Review Escrow", icon: "👨‍💻", desc: 'Payment held until code review passes. Anti-bug gate.', players: "2-5", component: "generic_escrow" },
  { id: "supply_chain", category: "escrow", name: "Supply Chain Escrow", icon: "🚚", desc: 'Goods shipped. Payment on delivery confirmation.', players: "2-3", component: "generic_escrow" },
  { id: "graded_vest", category: "escrow", name: "Graded Vesting", icon: "📊", desc: '20% unlocks each year for 5 years. Employee equity plan.', players: "1-100", component: "generic_escrow" },
  { id: "m_and_a_escrow", category: "escrow", name: "M&A Holdback Escrow", icon: "🏢", desc: 'Acquisition holdback funds. After earn-out period.', players: "2-5", component: "generic_escrow" },
  { id: "will_executor", category: "escrow", name: "Will Executor Escrow", icon: "⚰", desc: 'Estate held in escrow. Per will conditions distributed.', players: "2-10", component: "generic_escrow" },
  { id: "recurring_vest", category: "escrow", name: "Recurring Vesting", icon: "🔄", desc: 'Monthly vesting unlock. Cancelable. Team allocation.', players: "1-50", component: "generic_escrow" },
  { id: "design_bounty", category: "bounty", name: "Design Contest Bounty", icon: "🎨", desc: 'Best UI/logo design wins. Community voting determines.', players: "3-50", component: "generic_escrow" },
  { id: "translation_bounty", category: "bounty", name: "Translation Bounty", icon: "🌍", desc: 'Translate docs. Best translation wins pot.', players: "3-30", component: "generic_escrow" },
  { id: "meme_bounty", category: "bounty", name: "Meme Contest Bounty", icon: "🤣", desc: 'Best meme wins pot. Viral marketing engine.', players: "3-200", component: "generic_escrow" },
  { id: "data_labeling", category: "bounty", name: "Data Labeling Bounty", icon: "🏷", desc: 'Label datasets. Accuracy-weighted payouts from pool.', players: "5-200", component: "generic_escrow" },
  { id: "vulnerability_bounty", category: "bounty", name: "Vulnerability Bounty", icon: "🐞", desc: 'Report security vulns. Severity-tiered payouts.', players: "1-100", component: "generic_escrow" },
  { id: "research_bounty", category: "bounty", name: "Research Paper Bounty", icon: "📄", desc: 'Solve research problem. Peer-reviewed payout.', players: "3-50", component: "generic_escrow" },
  { id: "art_commission", category: "bounty", name: "Art Commission Bounty", icon: "🎭", desc: 'Commission custom artwork. Artist submits for approval.', players: "1-20", component: "generic_escrow" },
  { id: "music_bounty", category: "bounty", name: "Music Track Bounty", icon: "🎵", desc: 'Best original track wins. Genre-specified community vote.', players: "3-50", component: "generic_escrow" },
  { id: "tutorial_bounty", category: "bounty", name: "Tutorial Guide Bounty", icon: "📖", desc: 'Write best tutorial. Educational content funded.', players: "3-30", component: "generic_escrow" },
  { id: "prediction_sports", category: "bounty", name: "Sports Prediction Market", icon: "⚽", desc: 'Bet on match outcomes. Oracle-resolved after game.', players: "2-1000", component: "generic_escrow" },
  { id: "prediction_election", category: "bounty", name: "Election Prediction", icon: "🗳", desc: 'Predict election results. Oracle/multi-sig resolution.', players: "2-5000", component: "generic_escrow" },
  { id: "prediction_crypto", category: "bounty", name: "Crypto Price Prediction", icon: "📈", desc: 'Bet on KAS/USD at future DAA. Oracle resolved.', players: "2-1000", component: "generic_escrow" },
  { id: "multisig_2of2", category: "multisig", name: "2-of-2 Dual-Key Wallet", icon: "🔐", desc: 'Both parties must sign. Perfect for joint accounts.', players: "2", component: "generic_escrow" },
  { id: "multisig_4of7", category: "multisig", name: "4-of-7 Council Wallet", icon: "🏛", desc: 'Seven-member council. Four signatures to move funds.', players: "7", component: "generic_escrow" },
  { id: "multisig_timed", category: "multisig", name: "Timed Multi-Sig", icon: "⏱", desc: '2-of-3 initially. Becomes 1-of-3 after timeout. Dead man switch.', players: "3", component: "generic_escrow" },
  { id: "multisig_weighted", category: "multisig", name: "Weighted Multi-Sig", icon: "⚖", desc: 'Signers have different weights. Weight-based threshold.', players: "3-10", component: "generic_escrow" },
  { id: "multisig_rotating", category: "multisig", name: "Rotating Signer Pool", icon: "🔄", desc: 'Signing keys rotate every N blocks. Anti-compromise.', players: "5-20", component: "generic_escrow" },
  { id: "dao_treasury", category: "multisig", name: "DAO Treasury (Gov V2)", icon: "🏦", desc: 'Full governance treasury. Propose, vote, execute lifecycle.', players: "10-5000", component: "generic_escrow" },
  { id: "fund_of_funds", category: "multisig", name: "Fund of Funds Pool", icon: "📊", desc: 'Invest in multiple sub-pools. Diversified yield.', players: "5-200", component: "generic_escrow" },
  { id: "mining_pool", category: "multisig", name: "Mining Reward Pool", icon: "⛏", desc: 'Merge mining rewards distributed pro-rata to stakers.', players: "2-1000", component: "generic_escrow" },
  { id: "lending_pool", category: "multisig", name: "Lending Pool", icon: "🏦", desc: 'Deposit KAS to earn interest. Borrowers pay APR.', players: "5-500", component: "generic_escrow" },
  { id: "insurance_pool", category: "multisig", name: "Mutual Insurance Pool", icon: "🛡", desc: 'Members contribute. Claims paid from pooled capital.', players: "10-500", component: "generic_escrow" },
  { id: "oracle_pool", category: "multisig", name: "Decentralized Oracle Pool", icon: "🔮", desc: 'Multiple oracles stake and report. Consensus truth.', players: "5-21", component: "generic_escrow" },
  { id: "validator_bond", category: "multisig", name: "Validator Bond Pool", icon: "⚡", desc: 'Validators stake KAS as bond. Slashed if malicious.', players: "5-100", component: "generic_escrow" },
  { id: "cross_chain_bridge", category: "multisig", name: "Cross-Chain Bridge Pool", icon: "🌉", desc: 'Validators hold bridge collateral. Multi-sig release.', players: "10-100", component: "generic_escrow" },
  { id: "treasury_splitter", category: "multisig", name: "Treasury Splitter", icon: "💸", desc: 'Auto-split treasury by percentage to multiple DAOs.', players: "3-20", component: "generic_escrow" },
  { id: "micro_loan", category: "general", name: "Micro-Loan Contract", icon: "💳", desc: 'Peer-to-peer microloan. Interest + collateral on-chain.', players: "2", component: "generic_escrow" },
  { id: "flash_loan", category: "general", name: "Flash Loan Facility", icon: "⚡", desc: 'Borrow without collateral. Must repay same transaction.', players: "1", component: "generic_escrow" },
  { id: "recurring_donation", category: "general", name: "Recurring Donation", icon: "🤲", desc: 'Auto-donate X KAS per block. Cancel anytime.', players: "1", component: "generic_escrow" },
  { id: "p2p_lending", category: "general", name: "P2P Lending Market", icon: "🤝", desc: 'Lenders offer rates. Borrowers accept. On-chain.', players: "2", component: "generic_escrow" },
  { id: "gaming_guild", category: "general", name: "Gaming Guild Vault", icon: "🎮", desc: 'Shared asset vault for guild. Scholarship management.', players: "5-100", component: "generic_escrow" },
  { id: "content_tipping", category: "general", name: "Content Tipping Jar", icon: "🫙", desc: 'Tip creators directly. Funds on creator claim.', players: "1-10000", component: "generic_escrow" },
  { id: "voting_escrow", category: "general", name: "Vote-Escrowed Token Lock", icon: "🗳", desc: 'Lock tokens for governance power. Longer = more votes.', players: "1-1000", component: "generic_escrow" },
  { id: "scholarship_fund", category: "general", name: "Scholarship Fund", icon: "🎓", desc: 'Donors contribute. Students apply. Community votes.', players: "3-1000", component: "generic_escrow" },
  { id: "atomic_swap", category: "general", name: "Atomic Swap Escrow", icon: "⛓", desc: 'Cross-chain swap with HTLC. Trustless atomic execution.', players: "2", component: "generic_escrow" },
  { id: "time_capsule", category: "general", name: "Time Capsule Wallet", icon: "💊", desc: 'Lock funds with message. Openable only after target date.', players: "1", component: "generic_escrow" },
  { id: "social_recovery", category: "general", name: "Social Recovery Wallet", icon: "👥", desc: 'Guardians recover wallet if key lost. 3-of-5 threshold.', players: "1-5", component: "generic_escrow" },
  { id: "dispute_resolution", category: "general", name: "Dispute Resolution Chamber", icon: "⚖", desc: 'Submit dispute. Jury votes resolution. Staked jurors.', players: "3-21", component: "generic_escrow" },
  { id: "franchise_escrow", category: "general", name: "Franchise Fee Escrow", icon: "🏪", desc: 'Franchise fees held. Released on milestone approval.', players: "2", component: "generic_escrow" },
  { id: "event_insurance", category: "general", name: "Event Cancel Insurance", icon: "🌧", desc: 'Insure against cancellation. Oracle verifies and pays.', players: "1-1000", component: "generic_escrow" },
  { id: "nft_mint_voucher", category: "general", name: "NFT Mint Voucher", icon: "🎫", desc: 'Prepaid mint passes. Redeem voucher for NFT at mint.', players: "1-1000", component: "generic_escrow" },

  { id: "crossword_duel", category: "skill_games", name: "Crossword Duel", icon: "🧩", desc: 'Complete crossword faster than opponent. Clue-based race.', players: "2", component: "generic_turnbased" },
  { id: "boggle", category: "skill_games", name: "Boggle Blitz", icon: "📝", desc: 'Find words in letter grid in 3 minutes. Most words wins.', players: "2-4", component: "generic_turnbased" },
  { id: "pente", category: "skill_games", name: "Pente Classic", icon: "⚪", desc: '5-in-a-row with capture rule. Ancient Greek strategy game.', players: "2", component: "generic_turnbased" },
  { id: "nine_mens_morris", category: "skill_games", name: "Nine Mens Morris", icon: "🟤", desc: 'Mill formation game. Form rows of 3 to capture opponent pieces.', players: "2", component: "generic_turnbased" },
  { id: "xiangqi", category: "skill_games", name: "Xiangqi (Chinese Chess)", icon: "♟️", desc: 'Full Chinese chess with river and palace. Strategy warfare.', players: "2", component: "generic_turnbased" },
  { id: "hnefatafl", category: "skill_games", name: "Hnefatafl (Viking Chess)", icon: "⚔️", desc: 'Viking tafl game. Defend king to escape or capture him.', players: "2", component: "generic_turnbased" },
  { id: "blokus", category: "skill_games", name: "Blokus Territory", icon: "🟥", desc: 'Place polyomino pieces. Corner-to-corner only. Most territory wins.', players: "2-4", component: "generic_turnbased" },
  { id: "quarto", category: "skill_games", name: "Quarto Challenge", icon: "🔲", desc: '4-in-a-row with shared pieces. Multidimensional attribute matching.', players: "2", component: "generic_turnbased" },
  { id: "punto_banco", category: "casino", name: "Punto Banco", icon: "🇲🇴", desc: 'Macao-style baccarat. Banker vs player. Pure chance drama.', players: "1-14", component: "generic_card" },
  { id: "chuck_a_luck", category: "casino", name: "Chuck-a-Luck", icon: "🎲", desc: 'Three dice in cage. Bet on number appearing. Carnival classic.', players: "1-10", component: "generic_card" },
  { id: "acey_deucey", category: "casino", name: "Acey Deucey", icon: "🂡", desc: 'Bet on whether third card falls between two. High volatility.', players: "1-8", component: "generic_card" },
  { id: "poker_omaha", category: "casino", name: "Omaha Poker Hi-Lo", icon: "♣️", desc: '4 hole cards, 5 community. Split pot between high and low hands.', players: "2-10", component: "generic_card" },
  { id: "poker_stud7", category: "casino", name: "7-Card Stud", icon: "🃏", desc: 'Classic 7-card stud. Face up/down cards. Reading opponents key.', players: "2-8", component: "generic_card" },
  { id: "poker_razz", category: "casino", name: "Razz (Lowball)", icon: "7️⃣", desc: 'Lowest hand wins poker. Ace-to-five low ranking. Strategic reversal.', players: "2-8", component: "generic_card" },
  { id: "bingo_casino", category: "casino", name: "Casino Bingo", icon: "🅱️", desc: '90-ball bingo with patterns. Full house, lines, corners.', players: "2-200", component: "generic_card" },
  { id: "video_keno", category: "casino", name: "Video Keno", icon: "🎯", desc: 'Fast-play keno. Pick numbers, watch draw. Multi-card betting.', players: "1", component: "generic_card" },
  { id: "spin_poker", category: "casino", name: "Spin Poker", icon: "🔄", desc: '9-line video poker. Multi-hand play with spin bonus round.', players: "1", component: "generic_card" },
  { id: "klondike_solitaire", category: "casino", name: "Klondike Solitaire Wager", icon: "🃏", desc: 'Classic solitaire with wager. Complete in fewer moves wins more.', players: "1", component: "generic_card" },
  { id: "time_discount", category: "auction", name: "Time-Discount Auction", icon: "⏳", desc: 'Earlier bids valued higher. Time preference built into pricing.', players: "2-50", component: "generic_auction" },
  { id: "sealed_second", category: "auction", name: "Second-Price Sealed", icon: "📬", desc: 'Sealed bids. Winner pays second-highest bid. Truth-revealing.', players: "2-50", component: "generic_auction" },
  { id: "fishery_auction", category: "auction", name: "Fishery Rights Auction", icon: "🎣", desc: 'Seasonal fishing rights. Multi-period allocation. Sustainability.', players: "3-30", component: "generic_auction" },
  { id: "carbon_auction", category: "auction", name: "Carbon Credit Auction", icon: "🏭", desc: 'Trade emission allowances. Cap-and-trade on-chain market.', players: "5-200", component: "generic_auction" },
  { id: "art_auction", category: "auction", name: "Fine Art Auction", icon: "🖼️", desc: 'Prestige auction for digital/physical art. Reserve prices, bidding war.', players: "2-100", component: "generic_auction" },
  { id: "livestock_auction", category: "auction", name: "Livestock Auction", icon: "🐄", desc: 'Cattle/livestock sale. Batch bidding, weight-adjusted pricing.', players: "3-50", component: "generic_auction" },
  { id: "wine_auction", category: "auction", name: "Wine Futures Auction", icon: "🍷", desc: 'En primeur wine futures. Bid on vintages before bottling.', players: "3-50", component: "generic_auction" },
  { id: "estate_auction", category: "auction", name: "Estate Sale Auction", icon: "🏚️", desc: 'Full estate liquidation. Multiple lots, timed bidding, pickup.', players: "3-200", component: "generic_auction" },
  { id: "birthday_lotto", category: "lottery", name: "Birthday Bonus Lotto", icon: "🎂", desc: 'Pick birthday numbers. Bonus prizes for matching birth dates.', players: "1-10000", component: "generic_lottery" },
  { id: "seasonal_jackpot", category: "lottery", name: "Seasonal Jackpot", icon: "🎄", desc: 'Holiday-themed huge jackpot. Quarterly mega-draw event.', players: "1-50000", component: "generic_lottery" },
  { id: "double_roll", category: "lottery", name: "Double Roll Lotto", icon: "🎰", desc: 'Two chances: rollover jackpot + instant win. Double excitement.', players: "1-20000", component: "generic_lottery" },
  { id: "syndicate_lotto", category: "lottery", name: "Syndicate Pool Lotto", icon: "🤝", desc: 'Group ticket buying. Shared cost, shared winnings. Fractional.', players: "2-100", component: "generic_lottery" },
  { id: "lucky_numbers", category: "lottery", name: "Lucky Numbers Draw", icon: "🔢", desc: '7 lucky numbers. Match 3 for min prize, 7 for jackpot.', players: "1-20000", component: "generic_lottery" },
  { id: "fortune_cookie", category: "lottery", name: "Fortune Cookie Lottery", icon: "🥠", desc: 'Open fortune cookie NFTs. Each contains random prize amount.', players: "1-5000", component: "generic_lottery" },
  { id: "mystery_box", category: "lottery", name: "Mystery Box Lottery", icon: "📦", desc: 'Buy mystery boxes. Random items/values inside. Rarity tiers.', players: "1-1000", component: "generic_lottery" },
  { id: "wheel_spin", category: "lottery", name: "Spin & Win Wheel", icon: "🎡", desc: 'Spin a prize wheel. Segments: small prizes to mega jackpot.', players: "1-500", component: "generic_lottery" },
  { id: "crowdfunding_escrow", category: "escrow", name: "Crowdfunding Escrow", icon: "🚀", desc: 'All-or-nothing crowdfunding. Goal not met = full refund.', players: "1-10000", component: "generic_escrow" },
  { id: "royalty_escrow", category: "escrow", name: "Music Royalty Escrow", icon: "🎵", desc: 'Streaming royalties held in escrow. Auto-split to artists.', players: "2-50", component: "generic_escrow" },
  { id: "dividend_distribution", category: "escrow", name: "Dividend Distribution", icon: "💰", desc: 'Corporate dividends paid from escrow. Pro-rata shareholder payout.', players: "2-10000", component: "generic_escrow" },
  { id: "preorder_escrow", category: "escrow", name: "Product Preorder Escrow", icon: "🛒", desc: 'Preorder funds held until product ships. Consumer protection.', players: "2-10000", component: "generic_escrow" },
  { id: "subscription_vest", category: "escrow", name: "Subscription Vesting", icon: "📅", desc: 'Monthly subscription with vesting discount. Long-term commitment.', players: "1-5000", component: "generic_escrow" },
  { id: "royalty_stream", category: "escrow", name: "Royalty Stream Escrow", icon: "💎", desc: 'Continuous royalty payment stream. Auto-distributes per block.', players: "2-50", component: "generic_escrow" },
  { id: "litigation_escrow", category: "escrow", name: "Litigation Settlement", icon: "⚖️", desc: 'Settlement held in escrow. Released per court/jury order.', players: "3-10", component: "generic_escrow" },
  { id: "import_export", category: "escrow", name: "Import/Export Trade Escrow", icon: "🚢", desc: 'International trade. Documents verified before payment release.', players: "2-5", component: "generic_escrow" },
  { id: "sports_contract", category: "escrow", name: "Sports Contract Escrow", icon: "🏈", desc: 'Athlete signing bonus held. Performance milestones unlock.', players: "2-5", component: "generic_escrow" },
  { id: "film_production", category: "escrow", name: "Film Production Escrow", icon: "🎬", desc: 'Film budget held. Tranche release per production phase.', players: "3-20", component: "generic_escrow" },
  { id: "whitepaper_bounty", category: "bounty", name: "Whitepaper Writing Bounty", icon: "📜", desc: 'Commission a whitepaper. Best submission wins. Peer review.', players: "3-30", component: "generic_escrow" },
  { id: "logo_design_bounty", category: "bounty", name: "Logo Design Contest", icon: "🎯", desc: 'Design the best logo. Brand identity competition. Voted.', players: "3-50", component: "generic_escrow" },
  { id: "smart_contract_audit", category: "bounty", name: "Smart Contract Audit", icon: "🔍", desc: 'Find bugs in contract. Severity-weighted payout. Security first.', players: "1-50", component: "generic_escrow" },
  { id: "content_creation", category: "bounty", name: "Content Creation Bounty", icon: "✍️", desc: 'Write blog/video script. Best content marketing wins.', players: "3-30", component: "generic_escrow" },
  { id: "social_media_bounty", category: "bounty", name: "Social Media Campaign", icon: "📱", desc: 'Best viral campaign wins. Engagement metrics determine winner.', players: "3-100", component: "generic_escrow" },
  { id: "testnet_bounty", category: "bounty", name: "Testnet Bug Hunt", icon: "🪲", desc: 'Find testnet bugs. Detailed reports earn tiered bounties.', players: "1-100", component: "generic_escrow" },
  { id: "onchain_analytics", category: "bounty", name: "On-Chain Analytics Bounty", icon: "📊", desc: 'Best Dune/Flipside dashboard of ecosystem data wins.', players: "3-50", component: "generic_escrow" },
  { id: "governance_proposal", category: "bounty", name: "Governance Proposal Bounty", icon: "🏛️", desc: 'Submit best protocol improvement proposal. Token vote.', players: "3-100", component: "generic_escrow" },
  { id: "corporate_treasury", category: "multisig", name: "Corporate Treasury", icon: "🏢", desc: 'Multi-exec treasury for companies. CFO + 2 directors sign.', players: "3-7", component: "generic_escrow" },
  { id: "family_trust", category: "multisig", name: "Family Trust Wallet", icon: "👪", desc: 'Family wealth managed by trustees. Generational multi-sig.', players: "3-7", component: "generic_escrow" },
  { id: "charity_foundation", category: "multisig", name: "Charity Foundation Treasury", icon: "🎗️", desc: 'Donation pool. Board votes on grant allocations quarterly.', players: "5-15", component: "generic_escrow" },
  { id: "startup_vesting", category: "multisig", name: "Startup Employee Vesting", icon: "🌱", desc: 'Employee token vesting pool. 4-year with 1-year cliff standard.', players: "2-200", component: "generic_escrow" },
  { id: "syndicate_investment", category: "multisig", name: "Investment Syndicate", icon: "💼", desc: 'Angel syndicate pooled capital. Lead investor executes deals.', players: "5-99", component: "generic_escrow" },
  { id: "yield_farm_vault", category: "multisig", name: "Yield Farm Vault", icon: "🌾", desc: 'Multi-strategy yield vault. Rebalance through governance vote.', players: "5-500", component: "generic_escrow" },
  { id: "nft_dao_vault", category: "multisig", name: "NFT DAO Vault", icon: "🖼️", desc: 'Community-owned NFT collection. Purchase/sell votes by holders.', players: "5-500", component: "generic_escrow" },
  { id: "metaverse_land", category: "multisig", name: "Metaverse Land DAO", icon: "🌐", desc: 'Virtual land parcel management. Zoning and development votes.', players: "5-200", component: "generic_escrow" },
  { id: "token_buyback", category: "multisig", name: "Token Buyback Pool", icon: "📈", desc: 'Automated token buyback from protocol revenue. Burns or holds.', players: "3-5", component: "generic_escrow" },
  { id: "protocol_fee_split", category: "multisig", name: "Protocol Fee Splitter", icon: "💲", desc: 'Auto-split protocol fees to stakers, treasury, dev fund.', players: "3-5", component: "generic_escrow" },
  { id: "savings_bond", category: "general", name: "Savings Bond Contract", icon: "📜", desc: 'Lock KAS for term. Earn APR bonus for maturity completion.', players: "1", component: "generic_escrow" },
  { id: "mortgage_escrow", category: "general", name: "Mortgage Payment Escrow", icon: "🏡", desc: 'Monthly mortgage held in escrow. Auto-pay to lender.', players: "2", component: "generic_escrow" },
  { id: "college_fund", category: "general", name: "College Fund Escrow", icon: "🏫", desc: 'Education fund. Released at age 18 or for tuition invoices.', players: "1-2", component: "generic_escrow" },
  { id: "pension_fund", category: "general", name: "Pension Fund Pool", icon: "🏦", desc: 'Employer + employee contributions. Vesting and retirement payouts.', players: "2-500", component: "generic_escrow" },
  { id: "gaming_tournament", category: "general", name: "Gaming Tournament Pool", icon: "🏆", desc: 'Esports prize pool. Entry fees + sponsor contributions.', players: "8-256", component: "generic_escrow" },
  { id: "fantasy_sports", category: "general", name: "Fantasy Sports League", icon: "🏟️", desc: 'Season-long fantasy sports. Entry fee, weekly prizes, grand prize.', players: "4-20", component: "generic_escrow" },
  { id: "music_festival", category: "general", name: "Music Festival Pool", icon: "🎪", desc: 'Festival ticket pre-sales in escrow. Refund if rainout.', players: "1-50000", component: "generic_escrow" },
  { id: "charity_marathon", category: "general", name: "Charity Marathon Pledge", icon: "🏃", desc: 'Per-mile pledges. Funds released after race completion proof.', players: "1-10000", component: "generic_escrow" },
  { id: "research_grant", category: "general", name: "Research Grant Pool", icon: "🔬", desc: 'Scientific research funded. Milestone-based disbursement.', players: "3-50", component: "generic_escrow" },
  { id: "book_publishing", category: "general", name: "Book Publishing Advance", icon: "📚", desc: 'Author advance held. Chapter milestones unlock payments.', players: "2", component: "generic_escrow" },
  { id: "farming_coop", category: "general", name: "Farming Cooperative Pool", icon: "🌾", desc: 'Co-op members pool funds. Seasonal crop investment shared.', players: "5-200", component: "generic_escrow" },
  { id: "art_collective", category: "general", name: "Art Collective Fund", icon: "🎨", desc: 'Artist collective shared funds. Exhibition costs, shared revenue.', players: "3-50", component: "generic_escrow" },
  { id: "movie_fund", category: "general", name: "Independent Film Fund", icon: "🎥", desc: 'Film production investment. Profit share pro-rata on release.', players: "5-200", component: "generic_escrow" },
  { id: "green_energy", category: "general", name: "Green Energy Bond", icon: "🌞", desc: 'Solar/wind project funding. Revenue share from energy sold.', players: "5-500", component: "generic_escrow" },
  { id: "universal_income", category: "general", name: "UBI Trial Pool", icon: "🤲", desc: 'Universal basic income experiment. Regular payouts to verified recipients.', players: "2-1000", component: "generic_escrow" },

  { id: "abalone", category: "skill_games", name: "Abalone Sumo", icon: "🟤", desc: 'Push 6 opponent marbles off the board. Strategic shoving game.', players: "2", component: "generic_turnbased" },
  { id: "sequence", category: "skill_games", name: "Sequence Board Battle", icon: "🃏", desc: 'Play cards to place chips. Form sequences of 5 to win.', players: "2-4", component: "generic_turnbased" },
  { id: "catan_duel", category: "skill_games", name: "Catan Duel", icon: "🏝️", desc: 'Settle the island. Trade resources, build settlements. 1v1.', players: "2", component: "generic_turnbased" },
  { id: "carcassonne", category: "skill_games", name: "Carcassonne Tile War", icon: "🏰", desc: 'Place tiles to build cities/roads. Claim territory for points.', players: "2-4", component: "generic_turnbased" },
  { id: "splendor", category: "skill_games", name: "Splendor Gem Trade", icon: "💎", desc: 'Collect gems, buy mines, attract nobles. Economic supremacy.', players: "2-4", component: "generic_turnbased" },
  { id: "azul", category: "skill_games", name: "Azul Tile Mosaic", icon: "🔷", desc: 'Draft colored tiles to complete mosaic patterns. Artisan duel.', players: "2-4", component: "generic_turnbased" },
  { id: "pai_gow_tiles", category: "casino", name: "Pai Gow Tiles", icon: "🀄", desc: 'Chinese domino tiles. Form high and low hands to beat banker.', players: "1-8", component: "generic_card" },
  { id: "super_pan9", category: "casino", name: "Super Pan 9", icon: "9️⃣", desc: 'Three cards closest to 9. Player vs banker. Fast rounds.', players: "1-7", component: "generic_card" },
  { id: "roulette_european", category: "casino", name: "European Roulette", icon: "🇪🇺", desc: 'Single-zero roulette. Better odds. Full inside/outside bets.', players: "1-8", component: "generic_card" },
  { id: "roulette_american", category: "casino", name: "American Roulette", icon: "🇺🇸", desc: 'Double-zero roulette. High energy, 5-number bet option.', players: "1-8", component: "generic_card" },
  { id: "craps_pro", category: "casino", name: "Professional Craps", icon: "🎲", desc: "Full craps table. Pass/don't pass, come/don't come, odds bets.", players: "1-20", component: "generic_card" },
  { id: "poker_pineapple", category: "casino", name: "Crazy Pineapple Poker", icon: "🍍", desc: '3 hole cards, discard one after flop. Action-packed variant.', players: "2-9", component: "generic_card" },
  { id: "poker_courchevel", category: "casino", name: "Courchevel Poker", icon: "🇫🇷", desc: 'First flop card dealt before pre-flop bets. French innovation.', players: "2-9", component: "generic_card" },
  { id: "poker_irish", category: "casino", name: "Irish Poker", icon: "☘️", desc: '4 hole cards. Discard 2 after flop. Double the decisions.', players: "2-9", component: "generic_card" },
  { id: "pick6_lotto", category: "lottery", name: "Pick 6 Classic", icon: "🎱", desc: 'Classic 6/49 format. Match all 6 for jackpot. Tiered prizes.', players: "1-20000", component: "generic_lottery" },
  { id: "lotto_bonanza", category: "lottery", name: "Lotto Bonanza", icon: "💥", desc: 'Triple jackpot lottery. Three separate draws per ticket.', players: "1-30000", component: "generic_lottery" },
  { id: "scratch_frenzy", category: "lottery", name: "Scratch Card Frenzy", icon: "💳", desc: 'Multiple scratch panels. Reveal symbols for instant wins.', players: "1-5000", component: "generic_lottery" },
  { id: "raffle_multiplier", category: "lottery", name: "Multiplier Raffle", icon: "✖️", desc: 'Each ticket has random multiplier. Draw picks winner x boost.', players: "1-10000", component: "generic_lottery" },
  { id: "lucky_draw", category: "lottery", name: "Lucky Draw", icon: "🎯", desc: 'Simple random draw. One winner takes all. Pure chance.', players: "1-5000", component: "generic_lottery" },
  { id: "prize_drop", category: "lottery", name: "Prize Drop", icon: "🪂", desc: 'Random prize distribution. Everyone gets something. Pure luck.', players: "1-2000", component: "generic_lottery" },
  { id: "tombola", category: "lottery", name: "Tombola Classic", icon: "🎟️", desc: 'Italian raffle tradition. Numbered tickets drawn from drum.', players: "1-5000", component: "generic_lottery" },
  { id: "grab_bag", category: "lottery", name: "Grab Bag Surprise", icon: "🛍️", desc: 'Random grab bag. Each bag contains unknown prize. Mystery fun.', players: "1-1000", component: "generic_lottery" },
  { id: "token_vote", category: "multisig", name: "Token-Weighted Vote", icon: "🗳️", desc: '1 token = 1 vote. Proposal passes at quorum threshold.', players: "5-5000", component: "generic_escrow" },
  { id: "quadratic_vote", category: "multisig", name: "Quadratic Voting Pool", icon: "📐", desc: 'Voting power = sqrt(tokens). Anti-whale mechanism.', players: "5-5000", component: "generic_escrow" },
  { id: "conviction_vote", category: "multisig", name: "Conviction Voting", icon: "⏳", desc: 'Votes accumulate over time. Long-term holders gain influence.', players: "5-5000", component: "generic_escrow" },
  { id: "delegation_vote", category: "multisig", name: "Delegated Voting", icon: "🤝", desc: 'Delegate your votes to trusted representatives. Liquid democracy.', players: "5-5000", component: "generic_escrow" },
  { id: "signaling_vote", category: "multisig", name: "Signaling Proposal", icon: "📢", desc: 'Non-binding sentiment poll. Community temperature check.', players: "5-5000", component: "generic_escrow" },
  { id: "budget_vote", category: "multisig", name: "Budget Allocation Vote", icon: "💵", desc: 'Vote on how to spend treasury. Multiple competing proposals.', players: "5-5000", component: "generic_escrow" },
  { id: "election_vote", category: "multisig", name: "DAO Officer Election", icon: "🏛️", desc: 'Elect council members. Term limits, recall options built in.', players: "10-10000", component: "generic_escrow" },
  { id: "emergency_vote", category: "multisig", name: "Emergency Proposal", icon: "🚨", desc: 'Fast-track governance. Reduced voting period for urgent issues.', players: "10-5000", component: "generic_escrow" },
  { id: "grant_vote", category: "multisig", name: "Grant Committee Vote", icon: "🎓", desc: 'Review and approve ecosystem grants. Multi-stage evaluation.', players: "5-200", component: "generic_escrow" },
  { id: "parameter_vote", category: "multisig", name: "Protocol Parameter Vote", icon: "⚙️", desc: 'Adjust protocol parameters via governance. Fee, rate, threshold changes.', players: "10-5000", component: "generic_escrow" },
  { id: "commodity_pred", category: "bounty", name: "Commodity Price Market", icon: "🛢️", desc: 'Predict gold/oil/wheat prices. Oracle feeds resolve.', players: "2-2000", component: "generic_escrow" },
  { id: "weather_pred", category: "bounty", name: "Weather Prediction Market", icon: "🌤️", desc: 'Bet on rain/temperature/hurricane. NWS data resolves.', players: "2-1000", component: "generic_escrow" },
  { id: "awards_pred", category: "bounty", name: "Awards Season Market", icon: "🏆", desc: 'Predict Oscar/Grammy/Emmy winners. Media oracle resolves.', players: "2-5000", component: "generic_escrow" },
  { id: "box_office_pred", category: "bounty", name: "Box Office Prediction", icon: "🎬", desc: 'Predict opening weekend gross. Actuals from Box Office Mojo.', players: "2-2000", component: "generic_escrow" },
  { id: "ipo_pred", category: "bounty", name: "IPO Price Prediction", icon: "📈", desc: 'Predict IPO opening price. Exchange data resolves at listing.', players: "2-1000", component: "generic_escrow" },
  { id: "economic_pred", category: "bounty", name: "Economic Indicator Market", icon: "📊", desc: 'Predict CPI/GDP/unemployment. Gov report oracle resolves.', players: "2-2000", component: "generic_escrow" },
  { id: "tech_release", category: "bounty", name: "Tech Release Date Pool", icon: "📱", desc: 'Predict product launch dates. Manufacturer announcement resolves.', players: "2-1000", component: "generic_escrow" },
  { id: "crypto_halving", category: "bounty", name: "Halving Prediction Market", icon: "⛏️", desc: 'Predict next Bitcoin/Kaspa halving date impact on price.', players: "2-2000", component: "generic_escrow" },
  { id: "regulation_pred", category: "bounty", name: "Regulatory Decision Market", icon: "⚖️", desc: 'Predict SEC/CFTC rulings. Official filing resolves outcome.', players: "2-2000", component: "generic_escrow" },
  { id: "scientific_pred", category: "bounty", name: "Scientific Discovery Pool", icon: "🔬", desc: 'Bet on when discoveries happen. Peer-reviewed paper resolves.', players: "2-500", component: "generic_escrow" },

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
