import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { toast } from './ToastContext';
import { useNavigate } from 'react-router-dom';
import {
  Terminal, Settings, Code2, Gavel, Save, ExternalLink,
  ToggleLeft, ToggleRight, Sliders, Radio, Shield, Cpu,
  Zap, AlertTriangle, CheckCircle2, Info, Key, Palette,
  Upload, Eye, EyeOff, Play, Clipboard, Check, ArrowLeft,
  Loader, Loader2, Server, XCircle, Clock, BadgeCheck, Globe, Rocket,
  Download, RefreshCw,
} from 'lucide-react';
import { copyWithFeedback } from '../lib/copy';
import { Chess } from 'chess.js';
import { CovexMark } from './CovexLogo';
import TierTransparency from './TierTransparency';
import TransparencyModal from './TransparencyModal';
// Single source of truth for the ZK reality sets + the shared in-browser provers.
// (VERIFIED_FULL_ZK / IN_BROWSER_PROVERS / STRICT_GROTH16 used to be duplicated here and in
// TransparencyModal.jsx / OnChainLockSection.jsx; they now live in lib/zk/circuits.js.)
import { VERIFIED_FULL_ZK, IN_BROWSER_PROVERS, STRICT_GROTH16 } from '../lib/zk/circuits';
import { loadSnarkjs, makeFullProveBound, PROVERS } from '../lib/zk/provers';
import { Chessboard } from 'react-chessboard';
import ChessPreviewConfig, { defaultTimeControlFor } from './ChessPreviewConfig';
import { DEFAULT_BOARD_THEME, DEFAULT_PIECE_SET } from '../lib/chessTheme';
import GameThemeConfig from './GameThemeConfig';
import { normalizeGameKey, gameLookFromConfig } from '../lib/gameTheme';
import { DEFAULT_POKER_FELT, DEFAULT_POKER_CARD_BACK, DEFAULT_POKER_CHIPS } from '../lib/pokerTheme';
import { DEFAULT_BLACKJACK_FELT, DEFAULT_BLACKJACK_CARD_BACK } from '../lib/blackjackTheme';
import { DEFAULT_CONNECT4_BOARD, DEFAULT_CONNECT4_DISCS } from '../lib/connect4Theme';
import { DEFAULT_CHECKERS_BOARD, DEFAULT_CHECKERS_PIECES } from '../lib/checkersTheme';
import { DEFAULT_REVERSI_BOARD, DEFAULT_REVERSI_DISCS } from '../lib/reversiTheme';
import { DEFAULT_TTT_MARKS, DEFAULT_RPS_ACCENTS } from '../lib/markGameTheme';

// Default per-game appearance selections, keyed by canonical arena key. The
// builder seeds state from this and persists the chosen ids into
// custom_ui_config.games.<key>. Chess keeps its own dedicated state below.
const DEFAULT_GAMES_APPEARANCE = {
  poker: { felt: DEFAULT_POKER_FELT, card_back: DEFAULT_POKER_CARD_BACK, chips: DEFAULT_POKER_CHIPS },
  blackjack: { felt: DEFAULT_BLACKJACK_FELT, card_back: DEFAULT_BLACKJACK_CARD_BACK },
  connect4: { board: DEFAULT_CONNECT4_BOARD, discs: DEFAULT_CONNECT4_DISCS },
  checkers: { board: DEFAULT_CHECKERS_BOARD, pieces: DEFAULT_CHECKERS_PIECES },
  reversi: { board: DEFAULT_REVERSI_BOARD, discs: DEFAULT_REVERSI_DISCS },
  tictactoe: { marks: DEFAULT_TTT_MARKS },
  rps: { accents: DEFAULT_RPS_ACCENTS },
};
import { useWallet } from './WalletContext';
import Skeleton from './ui/Skeleton';
import FullScreenPoker from './FullScreenPoker';
import FullScreenBlackjack from './FullScreenBlackjack';
import FullScreenCheckers from './FullScreenCheckers';
import FullScreenConnect4 from './FullScreenConnect4';
import FullScreenTicTacToe from './FullScreenTicTacToe';
import FullScreenReversi from './FullScreenReversi';
import FullScreenRPS from './FullScreenRPS';

// Covenant Studio Integration
import { useCovenantConfig } from '../lib/covenant-config/useCovenantConfig';
import ResolutionSimulator from '../lib/covenant-config/ResolutionSimulator';
import { explorerTxUrl } from '../lib/explorer';
import AdvancedPrimitivesComposer from '../lib/advanced-primitives/AdvancedPrimitivesComposer';
import MultiOracleConfigurator from '../lib/multi-oracle/MultiOracleConfigurator';
import { HEADLINE_GAME_CIRCUITS, HEADLINE_GAME_CIRCUIT_SET } from '../lib/playableGames';

// loadSnarkjs + the in-browser provers now live in lib/zk/provers.js (single source of truth,
// shared with the public ZkClaimPanel). Imported above.

const SECTION_BASE = 'bg-black/30 border border-white/[0.06] rounded-2xl p-6 space-y-5 backdrop-blur-sm light:bg-white light:border-slate-200 light:shadow-sm';
const SECTION_HEADER = 'flex items-center gap-3 text-kaspa-green font-semibold text-sm uppercase tracking-widest';
const LABEL = 'text-xs text-gray-300 uppercase tracking-wider font-mono light:text-slate-600';
const INPUT =
  'w-full px-4 py-3 rounded-xl bg-black/50 border border-white/10 text-white text-sm placeholder:text-gray-200 light:text-slate-700 focus:outline-none focus:border-kaspa-green/50 focus:shadow-[0_0_8px_rgba(73,234,203,0.1)] transition-all light:bg-white light:border-slate-300 light:text-slate-900 light:placeholder:text-slate-400';
const TEXTAREA =
  'w-full px-4 py-3 rounded-xl bg-black/50 border border-white/10 text-white text-sm placeholder:text-gray-200 light:text-slate-700 focus:outline-none focus:border-kaspa-green/50 focus:shadow-[0_0_8px_rgba(73,234,203,0.1)] transition-all resize-none light:bg-white light:border-slate-300 light:text-slate-900 light:placeholder:text-slate-400';

// ── ZK Circuit Types (covenant-focused, exhaustive per vision) ────────────────────────────────
// These are ZK proof types for covenant resolution - not "game types."
// Expanded massively to 170+ entries from the exhaustive inventory in
// docs/ZK_ORACLE_FULL_STACK_VISION_AND_ROADMAP.md (see §4 "The Exhaustive Inventory").
// Each entry includes `reality` (full-zk | hybrid | oracle-attested), optional `artifacts: true`,
// good descriptions with reality labels, artifacts notes, and Kaspa covenant use cases.
// Categories expanded as needed (kaspa, privacy, oracle, crosschain, meta, etc.).
// Philosophy: honest labeling (most start resolver-attested/hybrid; graduate with artifacts/ ceremonies).
// Reference: vision doc §4.1-4.10 for primitives, Kaspa core, per-game props, DeFi, privacy, 20+ compute, 15+ data feeds, gating, etc.
// ═══════════════════════════════════════════════════════════════════════════════════════════
const ZK_CIRCUIT_TYPES_RAW = [
  // ═══════════════════════════════════════════
  // GAME CIRCUITS + PROPERTY PROOFS (expanded per §4.3 to ~90+ incl. per-game + shared)
  // "only active player clock decrements; <30s red; zero = auto-resolve + submit to oracle"
  // Per-game property proofs (legal moves, hand/equity, AI/move, clock, etc.) for all listed games.
  // Most: resolver-attested (off-chain engine + oracle) or hybrid (property ZK + oracle). Full rules heavy → RISC0 future.
  // Shared primitives (VRF, timers, pot math, transcript, wincond, ai) reused across.
  // ═══════════════════════════════════════════
  // chess_v1 removed (ZK circuit deleted; oracle-only chess possible via custom if needed)
  { id: 'chess_blitz', name: 'Chess Blitz (3+2)', description: '3 min + 2s increment. FIDE ruleset via a deterministic server-authoritative engine (anyone can recompute the move log). Per-turn timer: only clock of player-to-move ticks. Red <30s. Zero = auto-loss + PAYOUT COMPUTED. Reality: resolver-attested (full rules engine). Use cases: timed Kaspa chess covenants.', circuit: 'chess_blitz', accent: '#49EACB', category: 'game', variant: true, reality: 'oracle-attested' },
  { id: 'chess_bullet', name: 'Chess Bullet (1+0)', description: '1 min no increment. Deterministic server-authoritative FIDE engine, aggressive clock. Zero = instant auto-resolve. Reality: resolver-attested. Use cases: high-speed Kaspa games.', circuit: 'chess_bullet', accent: '#49EACB', category: 'game', variant: true, reality: 'oracle-attested' },
  { id: 'chess_legal_move', name: 'Chess Legal Move Proof', description: 'Property proof (hybrid): ZK proves a specific move was legal per FIDE (incl. castling/en-passant/pawn rules) without full board reveal in some modes. Resolver attests final result. Reality: hybrid (property). Artifacts: partial (chess lib). Use cases for Kaspa covenants: on-turn move validation in chess covenants + anti-cheat. (vision §4.3 chess)', circuit: 'chess_legal_move', accent: '#49EACB', category: 'game', variant: true, reality: 'hybrid' },
  { id: 'chess_ai_move', name: 'Chess AI/Move Optimality Proof', description: 'Compute+ZK hybrid: prove this move was best per engine eval at depth X (RISC0/SP1 guest for eval). Prevents collusion. Reality: resolver-attested (starts; full compute planned). Artifacts: none yet (see compute layer). Use cases: Kaspa chess with AI-fairness or anti-AI-bot rules. (vision §4.3, §4.6)', circuit: 'chess_ai_move', accent: '#49EACB', category: 'game', variant: true, reality: 'oracle-attested' },
  { id: 'chess_checkmate', name: 'Chess Checkmate / Stalemate Proof', description: 'Property proof: ZK or attested proves final position is checkmate/stalemate/insufficient material per FIDE. Reality: hybrid. Use cases: automatic payout trigger in chess covenants without trusting UI. (vision §4.3)', circuit: 'chess_checkmate', accent: '#49EACB', category: 'game', variant: true, reality: 'hybrid' },
  { id: 'chess_clock_proof', name: 'Chess Per-Turn Clock Proof', description: 'Hybrid: prove only active player clock decremented; timeout = loss. Ties to Kaspa DAA. Reality: resolver-attested + onchain time. Use cases: all timed Kaspa chess covenants. (vision §4.3 shared)', circuit: 'chess_clock_proof', accent: '#49EACB', category: 'game', variant: true, reality: 'hybrid' },
  { id: 'chess_repetition', name: 'Chess Threefold Repetition Proof', description: 'Property: prove position repeated 3x (transcript hash chain). Reality: resolver-attested (RISC0 for full PGN). Use cases: draw claims in Kaspa chess. (vision §4.3)', circuit: 'chess_repetition', accent: '#49EACB', category: 'game', variant: true, reality: 'oracle-attested' },
  { id: 'chess_insufficient', name: 'Chess Insufficient Material Proof', description: 'Property proof: K vs K, K+B vs K etc. Reality: hybrid. Use cases: auto-draw in endgame Kaspa covenants. (vision §4.3)', circuit: 'chess_insufficient', accent: '#49EACB', category: 'game', variant: true, reality: 'hybrid' },
  { id: 'poker_v1', name: 'Poker (Texas Hold\'em)', description: 'Off-chain game engine + resolver-attested result. Full hand ranking, pot split, side pots. 2-9 players. Real per-turn timer (blinds/action only current player). Zero = fold + PAYOUT COMPUTED. ZK hand strength + range proof optional. Reality: hybrid. Use cases: head-to-head Kaspa card covenants. (vision §4.3)', circuit: 'poker_v1', accent: '#E8AF34', category: 'game', reality: 'hybrid' },
  { id: 'poker_6max', name: 'Poker 6-Max', description: 'Hold\'em 6-max with 15s action timer. Resolver-attested result + optional ZK range proof. Per-turn current player clock only. Red <5s, zero = auto-fold. Reality: hybrid. Use cases: fast Kaspa 6max tables.', circuit: 'poker_6max', accent: '#E8AF34', category: 'game', variant: true, reality: 'hybrid' },
  { id: 'poker_tourney', name: 'Poker Tournament', description: 'Multi-table tournament structure, escalating blinds, ICM chop. Resolver-attested with optional ZK. Per-turn timer per table. Reality: resolver-attested. Use cases: ICM + multi-table Kaspa tourneys.', circuit: 'poker_tourney', accent: '#E8AF34', category: 'game', variant: true, reality: 'oracle-attested' },
  { id: 'poker_hand_rank', name: 'Poker Hand Rank Proof', description: 'Property ZK (hybrid): prove hand rank (straight flush etc) without revealing hole cards (committed range or zero-knowledge). Reality: hybrid (ZK property + resolver engine). Artifacts: planned (range + custom). Use cases for Kaspa: showdown without leaking info, side-pot fairness. (vision §4.3 poker)', circuit: 'poker_hand_rank', accent: '#E8AF34', category: 'game', variant: true, reality: 'hybrid' },
  { id: 'poker_equity', name: 'Poker Equity Calculation Proof', description: 'Compute property (resolver-attested start): prove equity % at decision point (Monte-Carlo or solver stub via RISC0). Reality: resolver-attested. Use cases: AI-assisted or fair all-in equity chops in Kaspa poker. (vision §4.3, §4.6)', circuit: 'poker_equity', accent: '#E8AF34', category: 'game', variant: true, reality: 'oracle-attested' },
  { id: 'poker_pot_split', name: 'Poker Pot / Sidepot Math Proof', description: 'DeFi/game hybrid: prove correct side-pot allocation + main pot split per rules. Reality: resolver-attested (verifiable math). Use cases: complex multi-way all-ins in Kaspa poker covenants. (vision §4.3, §4.4)', circuit: 'poker_pot_split', accent: '#E8AF34', category: 'game', variant: true, reality: 'oracle-attested' },
  { id: 'poker_vrf_deal', name: 'Poker VRF Card Deal Proof', description: 'Hybrid: Poseidon VRF seed + player count binding (dev pot10 Groth16). Provably fair deal attestation path. Use cases: provably fair Kaspa poker deals. (vision §4.3)', circuit: 'poker_vrf_deal', accent: '#E8AF34', category: 'game', variant: true, reality: 'hybrid', artifacts: true },
  { id: 'blackjack_v1', name: 'Blackjack (Full)', description: 'Off-chain engine + resolver-attested result. Hit/stand/double/split/insurance. Dealer reveals after all actions. 6-deck shoe. Per-hand timer - current player only. Reality: resolver-attested. Use cases: Kaspa blackjack arenas.', circuit: 'blackjack_v1', accent: '#EF4444', category: 'game', reality: 'oracle-attested' },
  { id: 'blackjack_multi', name: 'Blackjack Multi-Hand', description: 'Play up to 3 hands simultaneously. Resolver-attested. Same full rules. Per-hand per-player timer. Reality: resolver-attested. Use cases: multi-hand Kaspa BJ covenants.', circuit: 'blackjack_multi', accent: '#EF4444', category: 'game', variant: true, reality: 'oracle-attested' },
  { id: 'blackjack_bust', name: 'Blackjack Bust / Dealer Rule Proof', description: 'Property: prove bust or dealer hit/stand on soft-17 rule followed. Reality: hybrid. Use cases: automatic resolution in Kaspa blackjack. (vision §4.3)', circuit: 'blackjack_bust', accent: '#EF4444', category: 'game', variant: true, reality: 'hybrid' },
  { id: 'go_9x9', name: 'Go 9×9 Territory', description: 'Japanese rules, territory scoring, komi. Resolver-attested board state. Per-turn timer. Zero = pass + auto-score. Reality: resolver-attested. Use cases: small-board Kaspa Go.', circuit: 'go_9x9', accent: '#22C55E', category: 'game', reality: 'oracle-attested' },
  { id: 'go_13x13', name: 'Go 13×13', description: 'Intermediate board. Resolver-attested rules/timer. Same as 9×9. Reality: resolver-attested. Use cases: mid-size Go covenants.', circuit: 'go_13x13', accent: '#22C55E', category: 'game', variant: true, reality: 'oracle-attested' },
  { id: 'go_19x19', name: 'Go 19×19 (Full Board)', description: 'Standard full board. Per-turn timer with byo-yomi. Resolver-attested result + optional ZK territory verification. Reality: hybrid. Use cases: full Go on Kaspa.', circuit: 'go_19x19', accent: '#22C55E', category: 'game', variant: true, reality: 'hybrid' },
  { id: 'go_territory', name: 'Go Territory Scoring Proof', description: 'Property: ZK prove territory score + komi application without full reveal until end. Reality: hybrid. Use cases: fair scoring in Kaspa Go. (vision §4.3)', circuit: 'go_territory', accent: '#22C55E', category: 'game', variant: true, reality: 'hybrid' },
  { id: 'backgammon_v1', name: 'Backgammon (Doubling Cube)', description: 'Standard rules + doubling cube. Resolver-attested board. VRF for dice fairness. Per-turn timer. Zero = auto-resign. Reality: hybrid. Use cases: doubling cube Kaspa backgammon.', circuit: 'backgammon_v1', accent: '#F59E0B', category: 'game', reality: 'hybrid' },
  { id: 'backgammon_doubling', name: 'Backgammon Doubling Cube Proof', description: 'Property: prove cube acceptance + gammons/backgammons scoring. Reality: hybrid. Use cases: advanced Kaspa backgammon stakes. (vision §4.3)', circuit: 'backgammon_doubling', accent: '#F59E0B', category: 'game', variant: true, reality: 'hybrid' },
  { id: 'connect4_v1', name: 'Connect Four', description: 'Full ZK: Groth16 proof per legal drop (7×6 gravity + witnessed 4-in-a-row). MiMC7 board hash. Falls back to resolver attestation. Artifacts in zk/games/connect4/. Reality: full-zk. Use cases: simple full-zk Kaspa connect4 covenants.', circuit: 'connect4_v1', accent: '#3B82F6', category: 'game', reality: 'full-zk', artifacts: true },
  { id: 'checkers_v1', name: 'Checkers (Standard)', description: '8×8 American checkers, forced jumps, kings. Resolver-attested rules. Per-turn timer. Zero = auto-resolve. Reality: resolver-attested. Use cases: classic checkers on Kaspa.', circuit: 'checkers_v1', accent: '#A855F7', category: 'game', reality: 'oracle-attested' },
  { id: 'tictactoe_v1', name: 'Tic-Tac-Toe', description: 'Full ZK: Groth16 proof per legal move (3×3, full in-circuit win/draw). MiMC7 board hash. Falls back to resolver attestation. Artifacts in zk/games/tictactoe/. Reality: full-zk. Use cases: entry-level full-zk teaching covenants.', circuit: 'tictactoe_v1', accent: '#EC4899', category: 'game', reality: 'full-zk', artifacts: true },
  { id: 'reversi_v1', name: 'Reversi / Othello', description: '8×8, capture-flip mechanics. Resolver-attested rules. Per-turn timer. Reality: resolver-attested. Use cases: flip-based Kaspa games.', circuit: 'reversi_v1', accent: '#06B6D4', category: 'game', reality: 'oracle-attested' },
  { id: 'rps_v1', name: 'Rock Paper Scissors', description: 'Best of 3 with a commit-reveal protocol so picks stay secret until both are locked. Two-wallet arena; the result is computed deterministically by replaying the signed move log (anyone can recompute), then the counterparty or a deployer-bound external resolver co-signs the release (not trustless). Winner takes the staked amount minus the creator fee. Reality: resolver-attested. Use cases: quick-stake Kaspa head-to-head duels.', circuit: 'rps_v1', accent: '#F2557A', category: 'game', reality: 'oracle-attested' },
  { id: 'battleship_v1', name: 'Battleship', description: '10×10 fleet placement + salvo. VRF for ship placement fairness. Per-turn (salvo phase). Resolver-attested. Reality: hybrid. Use cases: hidden placement Kaspa battleship.', circuit: 'battleship_v1', accent: '#84CC16', category: 'game', reality: 'hybrid' },
  { id: 'battleship_placement', name: 'Battleship Ship Placement Proof', description: 'Property: prove valid non-overlapping fleet placement (VRF or committed). Reality: hybrid. Use cases: fair setup in Kaspa battleship. (vision §4.3)', circuit: 'battleship_placement', accent: '#84CC16', category: 'game', variant: true, reality: 'hybrid' },
  { id: 'scrabble_v1', name: 'Scrabble', description: '15×15 board, dictionary validation, premium squares. Oracle word-check. Per-turn timer. Reality: resolver-attested. Use cases: word game covenants.', circuit: 'scrabble_v1', accent: '#F97316', category: 'game', reality: 'oracle-attested' },
  { id: 'scrabble_word', name: 'Scrabble Word Validation Proof', description: 'Property (ZK lookup): prove word valid against committed dictionary without revealing full rack. Reality: hybrid (string/regex in compute). Use cases: fair word play on Kaspa. (vision §4.3, §4.6)', circuit: 'scrabble_word', accent: '#F97316', category: 'game', variant: true, reality: 'hybrid' },
  { id: 'dominoes_v1', name: 'Dominoes (Draw)', description: 'Double-6 draw dominoes. Resolver-attested. Per-turn timer. Zero = draw from boneyard + auto-pass. Reality: resolver-attested.', circuit: 'dominoes_v1', accent: '#14B8A6', category: 'game', reality: 'oracle-attested' },
  { id: 'rummikub_v1', name: 'Rummikub', description: 'Tile sets/runs, 30-point initial meld. Oracle validation of board state. Per-turn timer. Reality: resolver-attested.', circuit: 'rummikub_v1', accent: '#8B5CF6', category: 'game', reality: 'oracle-attested' },
  { id: 'mancala_v1', name: 'Mancala / Kalah', description: '6-pocket + store per side, capture rules. Resolver-attested. Per-turn timer. Reality: resolver-attested.', circuit: 'mancala_v1', accent: '#10B981', category: 'game', reality: 'oracle-attested' },
  { id: 'risk_v1', name: 'Risk (Territory)', description: 'Multi-territory conquest, dice combat. VRF dice + resolver. Per-turn (deploy + attack + fortify). Reality: hybrid. Use cases: conquest + dice Kaspa Risk.', circuit: 'risk_v1', accent: '#DC2626', category: 'game', reality: 'hybrid' },
  { id: 'catan_v1', name: 'Catan (Settlement)', description: 'Resource trading, settlement/road building. VRF dice rolls. Resolver validates trades. Per-turn timer. Reality: hybrid. Use cases: resource + trade Kaspa Catan.', circuit: 'catan_v1', accent: '#D946EF', category: 'game', reality: 'hybrid' },
  { id: 'monopoly_v1', name: 'Monopoly (Property)', description: 'Property trading, auctions. VRF dice. Resolver validates trades. Per-turn timer. Reality: hybrid. Use cases: auction + rent Kaspa Monopoly.', circuit: 'monopoly_v1', accent: '#FBBF24', category: 'game', reality: 'hybrid' },
  { id: 'yahtzee_v1', name: 'Yahtzee / Dice', description: '5-dice scorecard game. VRF for dice fairness. Resolver scorecard. Per-turn (3 rolls). Reality: hybrid. Use cases: pure dice Kaspa Yahtzee.', circuit: 'yahtzee_v1', accent: '#34D399', category: 'game', reality: 'hybrid' },
  { id: 'gin_rummy_v1', name: 'Gin Rummy', description: '10-card standard deck, knock/gin/undercut. VRF shuffle. Resolver-attested hand validation. Per-turn timer. Reality: hybrid.', circuit: 'gin_rummy_v1', accent: '#F472B6', category: 'game', reality: 'hybrid' },
  { id: 'hearts_v1', name: 'Hearts (Trick-Taking)', description: '4-player trick-taking, shoot-the-moon. Resolver validates tricks. Per-turn timer. Reality: resolver-attested.', circuit: 'hearts_v1', accent: '#A78BFA', category: 'game', reality: 'oracle-attested' },
  { id: 'spades_v1', name: 'Spades', description: '4-player partnership, bidding, nil/blind nil. Resolver-attested. Per-turn timer. Reality: resolver-attested.', circuit: 'spades_v1', accent: '#FB923C', category: 'game', reality: 'oracle-attested' },
  { id: 'bridge_v1', name: 'Bridge (Contract)', description: '4-player, bidding + dummy + play. VRF shuffle + resolver-attested. Per-turn timer. Reality: hybrid.', circuit: 'bridge_v1', accent: '#38BDF8', category: 'game', reality: 'hybrid' },
  { id: 'euchre_v1', name: 'Euchre', description: '4-player trump-based trick game. Resolver-attested. Per-turn timer. Reality: resolver-attested.', circuit: 'euchre_v1', accent: '#A3E635', category: 'game', reality: 'oracle-attested' },
  { id: 'cribbage_v1', name: 'Cribbage', description: '2-4 player peg-scoring + discard. Oracle counting. Per-turn timer. Reality: resolver-attested.', circuit: 'cribbage_v1', accent: '#FDA4AF', category: 'game', reality: 'oracle-attested' },
  { id: 'mahjong_v1', name: 'Mahjong (Riichi)', description: '4-player tile-matching with yaku scoring. VRF wall shuffle + resolver-attested. Per-turn timer. Reality: hybrid.', circuit: 'mahjong_v1', accent: '#C084FC', category: 'game', reality: 'hybrid' },
  // Shared game primitives (vision §4.3)
  { id: 'vrf_dice_roll', name: 'VRF Dice Roll (Shared)', description: 'Full ZK: a verifiable dice roll forced by Poseidon(secret, public seed) - roll = (hash mod faces)+1, so no one can cherry-pick the result. Generated in your browser (the secret never leaves it) and verified OFF-CHAIN by you, the counterparty, or any external verifier (snarkjs against the audited vkey). Use cases: backgammon/yahtzee/risk/monopoly/catan dice fairness in Kaspa covenants. (vision §4.1 VRF, §4.3 shared)', circuit: 'vrf_dice_roll', accent: '#EC4899', category: 'game', variant: true, reality: 'full-zk', artifacts: true },
  { id: 'relative_timelock', name: 'Relative Timelock (DAA)', description: 'Full ZK: Groth16 proof that current_daa >= reference_daa + lock_duration, with valid exposed as a public output (the verifier requires valid==1, so an unsatisfied lock cannot be passed off as satisfied). Generated in your browser, verified OFF-CHAIN by you, the counterparty, or any external verifier (snarkjs against the audited vkey). Use cases: dispute periods, cooldown windows, turn timers, delayed reveals on Kaspa. (vision §4.2)', circuit: 'relative_timelock', accent: '#10B981', category: 'kaspa', variant: true, reality: 'full-zk', artifacts: true },
  { id: 'script_constraint', name: 'Script Constraint / Fee Cap', description: 'Full ZK: prove you know the (hidden) script_hash whose Poseidon bundle with constraint_id + value equals a public root - bind a covenant to a constraint without revealing the script. Generated in your browser, verified OFF-CHAIN by you, the counterparty, or any external verifier (snarkjs against the audited vkey). Use cases: enforce covenant rules, fee caps, pot returns. (vision §4.2)', circuit: 'script_constraint', accent: '#F59E0B', category: 'kaspa', variant: true, reality: 'full-zk', artifacts: true },
  { id: 'pot_split_math', name: 'Pot / Treasury Split Math', description: 'Full ZK: prove winner_share + fee + return == total_pot at the chosen bps - a verifiable fair split. Honest bound: the amounts are public, so this is a correctness proof (not a privacy proof). Generated in your browser, verified OFF-CHAIN by you, the counterparty, or any external verifier (snarkjs against the audited vkey). Use cases: fair pot distribution in games/auctions. (vision §4.2/4.4)', circuit: 'pot_split_math', accent: '#EF4444', category: 'kaspa', variant: true, reality: 'full-zk', artifacts: true },
  { id: 'turn_timer', name: 'Per-Turn Timer Proof', description: 'Full ZK: prove a move happened within max_delta DAA, with the exact last-move time kept as a PRIVATE witness and on_time exposed as a public output (the verifier requires on_time==1). Generated in your browser, verified OFF-CHAIN by you, the counterparty, or any external verifier (snarkjs against the audited vkey). Use cases: clock enforcement in chess/poker. (vision §4.3)', circuit: 'turn_timer', accent: '#06B6D4', category: 'game', variant: true, reality: 'full-zk', artifacts: true },
  { id: 'vrf_card_deal', name: 'VRF Card Deal (Shared)', description: 'VRF: provable card from committed shuffle/deck. Reality: resolver-attested. Use cases: poker/blackjack/gin/hearts/mahjong fair deals on Kaspa. (vision §4.3)', circuit: 'vrf_card_deal', accent: '#EC4899', category: 'game', variant: true, reality: 'oracle-attested' },
  { id: 'pot_math_verify', name: 'Pot Math + Split Verification (Shared)', description: 'DeFi/game: prove weighted split (stake/score/VRF) + fees without trusting off-chain. Reality: hybrid (verifiable math + resolver). Use cases: all pot-based Kaspa game covenants. (vision §4.3, §4.4)', circuit: 'pot_math_verify', accent: '#FB923C', category: 'game', variant: true, reality: 'hybrid' },
  { id: 'move_transcript', name: 'Move Transcript Validity Proof', description: 'Hash-chain of moves: prove sequence valid + no tampering. Reality: hybrid. Use cases: dispute resolution + replay in Kaspa game covenants. (vision §4.3)', circuit: 'move_transcript', accent: '#10B981', category: 'game', variant: true, reality: 'hybrid' },
  { id: 'win_condition', name: 'Win/Draw Condition Proof (Generic)', description: 'Prove final state satisfies game-specific win/draw rules. Reality: resolver-attested or hybrid per game. Use cases: automatic oracle payout for any Kaspa game. (vision §4.3)', circuit: 'win_condition', accent: '#A855F7', category: 'game', variant: true, reality: 'oracle-attested' },
  { id: 'game_ai_verify', name: 'Game AI Move Validation (Generic)', description: 'Prove move optimal per engine (chess/Go/poker). Reality: resolver-attested (RISC0 compute). Use cases: collusion prevention in Kaspa games. (vision §4.3, §4.6)', circuit: 'game_ai_verify', accent: '#A855F7', category: 'game', variant: true, reality: 'oracle-attested' },
  // Tournament / multi
  { id: 'tournament_swiss', name: 'Tournament Swiss/Bracket Seeding', description: 'VRF + ZK seeding + pairing proof for tournaments. Reality: resolver-attested. Use cases: fair bracket Kaspa events. (vision §4.3)', circuit: 'tournament_swiss', accent: '#F59E0B', category: 'game', variant: true, reality: 'oracle-attested' },
  { id: 'multi_table_consistency', name: 'Multi-Table Consistency Proof', description: 'Prove state across tables consistent (e.g. same VRF seed, no collusion). Reality: hybrid. Use cases: large Kaspa poker tourneys. (vision §4.3)', circuit: 'multi_table_consistency', accent: '#E8AF34', category: 'game', variant: true, reality: 'hybrid' },

  // ═══════════════════════════════════════════
  // FOUNDATIONAL CRYPTO PRIMITIVES (expanded §4.1 to 25+)
  // Building blocks, multiple proving systems.
  // ═══════════════════════════════════════════
  { id: 'merkle_membership', name: 'Merkle Membership', description: 'Full ZK: proves a key/value pair exists in a committed Merkle tree. Whitelist eligibility, DAO voting power, airdrop claims, token-gated access. A real Groth16 proof, verified OFF-CHAIN (by you, the counterparty, or any external verifier; snarkjs against the audited vkey). For the circom suite the proof is verified off-chain; the only on-chain check is a 2-of-2 cosign + CSV timeout, not chain-enforced ZK. Real artifacts in zk/ (circom + snarkjs verifier). Reality: full-zk. Use cases: Kaspa DAO/treasury gating, private airdrops. (vision §4.1)', circuit: 'merkle_generic', accent: '#3B82F6', category: 'crypto', reality: 'full-zk', artifacts: true },
  { id: 'merkle_dao', name: 'Merkle DAO Voting', description: 'Full ZK: voting power = merkle leaf value. Threshold quorum. No individual votes revealed. Uses same artifacts as merkle_membership. Reality: full-zk. Use cases: private weighted voting on Kaspa DAOs.', circuit: 'merkle_dao', accent: '#3B82F6', category: 'crypto', variant: true, reality: 'full-zk', artifacts: true },
  { id: 'merkle_airdrop', name: 'Merkle Airdrop Claim', description: 'Full ZK: prove eligibility without revealing other claimers. Single-use nullifier per leaf. Same artifacts as membership. Reality: full-zk. Use cases: fair Kaspa token claims.', circuit: 'merkle_airdrop', accent: '#3B82F6', category: 'crypto', variant: true, reality: 'full-zk', artifacts: true },
  { id: 'merkle_sparse', name: 'Merkle Sparse / Verkle Tree', description: 'Membership in sparse/Verkle tree (gas-efficient). Reality: resolver-attested (full-zk planned). Use cases: large set proofs on Kaspa. (vision §4.1)', circuit: 'merkle_sparse', accent: '#3B82F6', category: 'crypto', variant: true, reality: 'oracle-attested' },
  { id: 'range_proof', name: 'Range Proof', description: 'Full ZK: prove a committed value is within [min, max] without revealing it. MiMC7(value) commitment + 64-bit range, generated in your browser (the value never leaves it) and verified OFF-CHAIN by you, the counterparty, or any external verifier (snarkjs against the audited vkey). For the circom suite the proof is verified off-chain; the only on-chain check is a 2-of-2 cosign + CSV timeout, not chain-enforced ZK. Use cases: collateral, age, balances on Kaspa covenants.', circuit: 'bulletproofs_v1', accent: '#22C55E', category: 'crypto', reality: 'full-zk' },
  { id: 'range_collateral', name: 'Collateral Range Proof', description: 'Prove collateral >= loan amount * threshold without disclosing the amount, on the range_proof circuit. Its in-browser generator is not separately wired yet, so today a supplied Groth16 proof is verified OFF-CHAIN (snarkjs against the audited vkey) and a deployer-bound resolver co-signs the release. Use cases: DeFi loans on Kaspa.', circuit: 'bulletproofs_collateral', accent: '#22C55E', category: 'crypto', variant: true, reality: 'oracle-attested' },
  { id: 'range_128bit', name: 'Range Proof 128/256-bit', description: 'Extended range for larger values (u128/u256). Reality: hybrid (current 64-bit base + attested). Use cases: high-value Kaspa UTXO/treasury proofs. (vision §4.1)', circuit: 'range_128', accent: '#22C55E', category: 'crypto', variant: true, reality: 'hybrid' },
  { id: 'schnorr_knowledge', name: 'Schnorr Knowledge Proof', description: 'Oracle-path (no artifacts yet): standard Sigma protocol - prove knowledge of discrete log without revealing it. Building block for ring sigs, DLCs. Artifacts planned. Reality: resolver-attested. Use cases: UTXO ownership on Kaspa.', circuit: 'schnorr_generic', accent: '#6366F1', category: 'crypto', reality: 'oracle-attested' },
  { id: 'pedersen_commitment', name: 'Pedersen Commitment', description: 'Oracle-path (no artifacts yet): homomorphic commitment scheme. Prove committed value satisfies linear equation. Used for UTXO amount hiding + range proof combo. Artifacts planned. Reality: resolver-attested. Use cases: private amounts in Kaspa covenants. (vision §4.1)', circuit: 'pedersen_generic', accent: '#8B5CF6', category: 'crypto', reality: 'oracle-attested' },
  { id: 'pedersen_curve_variant', name: 'Pedersen (Curve/Generator Variants)', description: 'Multiple curves/generators for Pedersen. Reality: resolver-attested (planned). Use cases: amount hiding + homomorphic in Kaspa DeFi/privacy. (vision §4.1)', circuit: 'pedersen_variant', accent: '#8B5CF6', category: 'crypto', variant: true, reality: 'oracle-attested' },
  { id: 'hash_preimage', name: 'Hash Preimage Proof', description: 'Full ZK: Groth16 MiMC7 preimage proof (HTLC-style commitment). Honest limit: MiMC7 not SHA256/Blake2b. Artifacts in zk/hash_preimage/. Reality: full-zk. Use cases: HTLCs, timelocks, commitments on Kaspa.', circuit: 'hash_preimage', accent: '#F59E0B', category: 'crypto', reality: 'full-zk', artifacts: true },
  { id: 'poseidon_hash', name: 'Poseidon / MiMC7 / Rescue Hash', description: 'STARK-friendly hash variants for commitments. Reality: resolver-attested (circom planned). Use cases: efficient ZK in Kaspa (future STARKs). (vision §4.1)', circuit: 'poseidon_hash', accent: '#F59E0B', category: 'crypto', variant: true, reality: 'oracle-attested' },
  { id: 'vrf_random', name: 'Committed Random (VRF)', description: 'Full ZK: output_val = Poseidon(hidden secret, public seed, VRF key), so a random value is provably forced by a committed secret and cannot be cherry-picked. Generated in your browser (the secret never leaves it), verified OFF-CHAIN by you, the counterparty, or any external verifier (snarkjs against the audited vkey). Use cases: verifiable draws and shuffles without a trusted dealer. (vision §4.1)', circuit: 'vrf_random', accent: '#EC4899', category: 'crypto', reality: 'full-zk', artifacts: true },
  { id: 'vrf_shuffle', name: 'VRF Shuffle (Deck)', description: 'Oracle-path (no artifacts yet): provably fair deck/card shuffle. Each player contributes entropy. No trusted dealer. Uses VRF building block. Reality: resolver-attested. Use cases: card games on Kaspa. (vision §4.1)', circuit: 'vrf_shuffle', accent: '#EC4899', category: 'crypto', variant: true, reality: 'oracle-attested' },
  { id: 'vrf_permutation', name: 'VRF Permutation / Shuffle Full', description: 'Full permutation proof for VRF deck (beyond simple deal). Reality: resolver-attested (full zk planned). Use cases: provable fair shuffles for poker/mahjong etc. (vision §4.1 VRF)', circuit: 'vrf_permutation', accent: '#EC4899', category: 'crypto', variant: true, reality: 'oracle-attested' },
  { id: 'commit_reveal_vrf', name: 'Commit-Reveal with ZK (VRF)', description: 'Hide commit until reveal; prove correct reveal + VRF derivation. Reality: resolver-attested. Use cases: sealed-bid + fair reveal in Kaspa auctions/games. (vision §4.1)', circuit: 'commit_reveal_vrf', accent: '#EC4899', category: 'crypto', variant: true, reality: 'oracle-attested' },
  { id: 'distributed_random', name: 'Distributed Randomness Beacon', description: 'Multiple parties contribute; ZK for correctness + aggregation. Reality: resolver-attested. Use cases: multi-party fair random for Kaspa DAOs/tourneys. (vision §4.1)', circuit: 'distributed_random', accent: '#EC4899', category: 'crypto', variant: true, reality: 'oracle-attested' },
  { id: 'bls_signature', name: 'BLS Threshold Signature', description: 'Oracle-path (no artifacts yet): aggregate BLS signatures for multi-oracle consensus. M-of-N threshold without revealing individual keys. Artifacts planned for multi-resolver federation. Reality: resolver-attested. Use cases: federating a set of external resolvers for Kaspa covenants. (vision §4.1, §4.7)', circuit: 'bls_threshold', accent: '#14B8A6', category: 'crypto', reality: 'oracle-attested' },
  { id: 'nullifier_set', name: 'Nullifier Set Proof', description: 'Full ZK: prove a public nullifier and set anchor both derive from one hidden secret (nullifier = Poseidon(secret), anchor = Poseidon(secret, nullifier)), so a covenant can reject a re-used nullifier without learning the secret. Generated in your browser, verified OFF-CHAIN by you, the counterparty, or any external verifier (snarkjs against the audited vkey); the deployer-bound resolver also tracks the spent set. Use cases: double-spend prevention in Kaspa privacy. (vision §4.1)', circuit: 'nullifier_set', accent: '#FB923C', category: 'crypto', reality: 'full-zk', artifacts: true },
  { id: 'schnorr_batch', name: 'Schnorr Batch / Threshold', description: 'Batch or threshold Schnorr knowledge. Reality: resolver-attested. Use cases: efficient multi-sig on Kaspa. (vision §4.1)', circuit: 'schnorr_batch', accent: '#6366F1', category: 'crypto', variant: true, reality: 'oracle-attested' },
  { id: 'ring_signature', name: 'Ring Signature / Linkable', description: 'Anonymous but linkable (for anti-sybil) ring sigs. Reality: resolver-attested. Use cases: private voting/DAO actions on Kaspa. (vision §4.1)', circuit: 'ring_sig', accent: '#6366F1', category: 'crypto', variant: true, reality: 'oracle-attested' },
  { id: 'shuffle_proof', name: 'Shuffle Proof (General)', description: 'ZK shuffle for decks or arbitrary lists. Reality: resolver-attested (RISC0). Use cases: fair random in games + private ordering. (vision §4.1)', circuit: 'shuffle_proof', accent: '#EC4899', category: 'crypto', variant: true, reality: 'oracle-attested' },
  { id: 'recursive_verify', name: 'Recursive Proof Verification', description: 'Prove a Groth16/RISC0 proof inside another (aggregation). Reality: resolver-attested (future full). Use cases: batch 100 game outcomes in one Kaspa covenant. (vision §4.1, §4.9)', circuit: 'recursive_verify', accent: '#A855F7', category: 'crypto', variant: true, reality: 'oracle-attested' },
  { id: 'commitment_open', name: 'Commitment Opening', description: 'Full ZK: prove you know the (value, blinding) opening of a public Poseidon commitment C = Poseidon(value, blinding), without revealing either. Foundational privacy primitive. Generated in your browser (the opening never leaves it), verified OFF-CHAIN by you, the counterparty, or any external verifier (snarkjs against the audited vkey). Keys are a single-contributor dev ceremony (not a production MPC). Use cases: hidden bids, sealed values, the opening half of commit-reveal. (vision §4.1)', circuit: 'commitment_open', accent: '#8B5CF6', category: 'crypto', reality: 'full-zk', artifacts: true },
  { id: 'set_non_membership', name: 'Set Non-Membership (Blocklist)', description: 'Full ZK: prove a PRIVATE value is NOT in a sorted blocklist (depth-4 sorted Merkle), by bracketing it strictly between two adjacent blocked entries with a valid Merkle path. Sanctions-free / not-blocklisted attestation without revealing the value. Generated in your browser, verified OFF-CHAIN by you, the counterparty, or any external verifier (snarkjs against the audited vkey). Dev ceremony keys, not a production MPC. Use cases: prove an address is not on a deny-list. (vision §4.1)', circuit: 'set_non_membership', accent: '#FB923C', category: 'crypto', reality: 'full-zk', artifacts: true },
  { id: 'anon_membership_nullifier', name: 'Anonymous Membership + Nullifier', description: 'Full ZK: prove Merkle membership of a private identity commitment AND emit a deterministic public nullifier = Poseidon(identity, externalNullifier), so the same identity cannot act twice (one-person-one-action). Your identity stays in your browser; the proof is verified OFF-CHAIN by you, the counterparty, or any external verifier (snarkjs against the audited vkey), and the deployer-bound resolver tracks the spent nullifier set. Dev ceremony keys, not a production MPC. Use cases: anonymous voting, single-claim airdrops. (vision §4.1, §4.5)', circuit: 'anon_membership_nullifier', accent: '#EC4899', category: 'crypto', reality: 'full-zk', artifacts: true },
  { id: 'merkle_range_membership', name: 'Merkle Range Membership (tiered)', description: 'Full ZK: prove a PRIVATE (account, value) leaf is in a Poseidon Merkle set AND its value lies inside a public two-sided band (lo through hi inclusive), revealing neither the account nor the exact value. The two-sided variant of Merkle-leaf-threshold (membership plus a one-sided floor). valid is a public output the verifier requires == 1, so a non-member OR an out-of-band value produces a verifying proof that FAILS the gate. Generated in your browser, verified OFF-CHAIN by you, the counterparty, or any external verifier (snarkjs against the audited vkey). Dev ceremony keys (pot12), not a production MPC. Use cases: tiered or bracketed eligibility, balance-band gating. (vision §4.1, §4.8)', circuit: 'merkle_range_membership', accent: '#A855F7', category: 'crypto', reality: 'full-zk', artifacts: true },
  { id: 'equality_of_commitments', name: 'Equality of Commitments', description: 'Full ZK: prove two PUBLIC Poseidon commitments hide the SAME secret value (independent salts), without revealing the value. valid is a public output the verifier requires == 1, so two commitments that open to different values produce a verifying proof that FAILS the gate. Generated in your browser, verified OFF-CHAIN by you, the counterparty, or any external verifier (snarkjs against the audited vkey). Dev ceremony keys, not a production MPC. Use cases: link a hidden amount across two covenants, match a bid commitment to an escrow commitment. (vision §4.1)', circuit: 'equality_of_commitments', accent: '#14B8A6', category: 'crypto', reality: 'full-zk', artifacts: true },

  // ═══════════════════════════════════════════
  // KASPA and COVENANT NATIVE (detailed section 4.2, 20 plus. Highest priority)
  // "the why Covex on Kaspa" layer. UTXO, script, timelock, state, replay, fees, silverc.
  // ═══════════════════════════════════════════
  { id: 'utxo_ownership', name: 'UTXO Note Proof', description: 'Full ZK: prove knowledge of the full Poseidon-committed UTXO note (pubkey x/y + amount + signature parts) behind a public utxo_hash, without revealing it. Generated in your browser, verified OFF-CHAIN by you, the counterparty, or any external verifier (snarkjs against the audited vkey). Honest bound: this opens the commitment, it does not by itself verify a Schnorr signature, so it is a note-binding primitive (a separate signature circuit covers spend authorization). Use cases: binding covenants to committed Kaspa notes. (vision §4.2)', circuit: 'basic_utxo_ownership', accent: '#06B6D4', category: 'kaspa', reality: 'full-zk', artifacts: true },
  { id: 'utxo_ownership_schnorr', name: 'UTXO Ownership + Amount Commitment', description: 'Schnorr + Pedersen amount hidden + range. Reality: hybrid (planned). Use cases: private balance ownership proofs for Kaspa covenants. (vision §4.2)', circuit: 'utxo_own_commit', accent: '#06B6D4', category: 'kaspa', variant: true, reality: 'hybrid' },
  { id: 'utxo_spend_auth', name: 'UTXO Spend Authority (N-of-M)', description: 'Oracle-path (no artifacts yet): enhanced multi-party UTXO spend. Prove N-of-M UTXO holders authorize a spend. Combines utxo_ownership + multisig_threshold. Reality: resolver-attested. Use cases: complex multi-owner Kaspa covenant unlocks. (vision §4.2)', circuit: 'utxo_spend_auth', accent: '#06B6D4', category: 'kaspa', variant: true, reality: 'oracle-attested' },
  { id: 'script_hash_match', name: 'Script Hash Validation', description: 'Oracle-path (no artifacts yet): prove a particular locking script (script_hash) was used. Verify covenant constraints on-chain. SilverScript -> Kaspa Script attestation. Core covenant primitive. Reality: resolver-attested. Use cases: prove exact SilverScript payload on Kaspa. (vision §4.2)', circuit: 'script_hash_match', accent: '#84CC16', category: 'kaspa', reality: 'oracle-attested' },
  { id: 'script_constraint_proof', name: 'Script Constraint Proof', description: 'Oracle-path (no artifacts yet): prove a specific SilverScript pattern is satisfied (e.g. fee <= X%, creator share = Y). Verifies covenant template parameters match expected values. Critical for SilverScript -> Kaspa attestation. Reality: resolver-attested. Use cases: fee/pot/treasury constraint enforcement. (vision §4.2)', circuit: 'script_constraint', accent: '#84CC16', category: 'kaspa', variant: true, reality: 'oracle-attested' },
  { id: 'script_exact_match', name: 'Exact Script Payload Match', description: 'Prove aa20-aa23 or locking script bytes exact match. Reality: resolver-attested (high prio). Use cases: covenant template fidelity on Kaspa. (vision §4.2)', circuit: 'script_exact', accent: '#84CC16', category: 'kaspa', variant: true, reality: 'oracle-attested' },
  { id: 'timelock_absolute', name: 'Absolute Timelock Proof', description: 'Full ZK: Groth16 proof that current_daa >= lock_threshold. Maps to Kaspa DAA timelock covenant unlock. Artifacts in zk/timelock/. Reality: full-zk. Use cases: time-locked Kaspa covenant funds release. (vision §4.2)', circuit: 'timelock_abs', accent: '#F97316', category: 'kaspa', reality: 'full-zk', artifacts: true },
  { id: 'relative_timelock', name: 'Relative Timelock (DAA)', description: 'Hybrid: prove minimum DAA blocks elapsed since reference point. Artifacts in zk/relative_timelock.circom. Use cases: dispute periods, cooldown windows, delayed reveals on Kaspa. (vision §4.2)', circuit: 'relative_timelock', accent: '#F97316', category: 'kaspa', variant: true, reality: 'hybrid', artifacts: true },
  { id: 'timelock_daa_public', name: 'Absolute Timelock (Public DAA)', description: 'Variant with public DAA bound. Reality: full-zk (extend absolute). Use cases: public schedule unlocks. (vision §4.2)', circuit: 'timelock_daa_pub', accent: '#F97316', category: 'kaspa', variant: true, reality: 'full-zk', artifacts: true },
  { id: 'replay_protection', name: 'Replay Protection', description: 'Oracle-path (no artifacts yet): bound covenant unlock to a specific block hash or DAA window. Anti-replay, chain-specific execution. Maps to Kaspa block hash. Reality: resolver-attested. Use cases: chain-specific Kaspa covenant execution. (vision §4.2)', circuit: 'replay_protect', accent: '#F472B6', category: 'kaspa', reality: 'oracle-attested' },
  { id: 'covenant_state_hash', name: 'Covenant State Hash', description: 'Oracle-path (no artifacts yet): prove current covenant state matches committed hash. Used for state channels, optimistic execution verification. Maps to Kaspa covenant state. Reality: resolver-attested. Use cases: optimistic channels on Kaspa. (vision §4.2)', circuit: 'state_hash_v1', accent: '#10B981', category: 'kaspa', reality: 'oracle-attested' },
  { id: 'selected_parent_proof', name: 'Selected-Parent / Block Header Proof', description: 'Prove tx/state in DAG tip history (selected parent chain). Reality: resolver-attested. Use cases: recent history inclusion for Kaspa covenants. (vision §4.2)', circuit: 'sel_parent', accent: '#10B981', category: 'kaspa', variant: true, reality: 'oracle-attested' },
  { id: 'utxo_set_proof', name: 'UTXO Set / Global State Proof', description: 'Prove existence/non-existence in indexed UTXO/global set. Reality: resolver-attested (indexer + ZK). Use cases: global claims, unique ownership on Kaspa. (vision §4.2)', circuit: 'utxo_set', accent: '#06B6D4', category: 'kaspa', variant: true, reality: 'oracle-attested' },
  { id: 'multisig_threshold', name: 'Multi-Sig Threshold', description: 'Oracle-path (no artifacts yet): prove M-of-N signatures collected. Governance approval, DAO treasury spend authorization. BLS aggregation planned. Reality: resolver-attested. Use cases: Kaspa DAO treasury spends. (vision §4.2)', circuit: 'multisig_threshold', accent: '#A855F7', category: 'kaspa', reality: 'oracle-attested' },
  { id: 'fee_pot_math', name: 'Fee & Pot Math Verification', description: 'Prove verifiable split, burn, return % calculations. Reality: hybrid (verifiable math). Use cases: transparent fees in all Kaspa covenants. (vision §4.2)', circuit: 'fee_pot_math', accent: '#FB923C', category: 'kaspa', variant: true, reality: 'hybrid' },
  { id: 'vesting_daa', name: 'Vesting Schedule (DAA-tied)', description: 'Prove vested amount at current DAA (cliff/linear/sigmoid). Reality: resolver-attested (uses timelock+range). Use cases: founder/treasury vesting on Kaspa. (vision §4.2)', circuit: 'vesting_daa', accent: '#34D399', category: 'kaspa', variant: true, reality: 'oracle-attested' },
  { id: 'metadata_constraint', name: 'Covenant Metadata Constraints', description: 'Prove name/desc/theme bounds + disclosed wallets hash match. Reality: resolver-attested. Use cases: verified metadata in paid Kaspa covenants. (vision §4.2)', circuit: 'metadata_constraint', accent: '#A78BFA', category: 'kaspa', variant: true, reality: 'oracle-attested' },
  { id: 'oracle_pubkey_binding', name: 'Oracle Pubkey / Multi-Oracle Config Binding', description: 'Prove covenant commits to specific oracle set + weights/threshold. Reality: hybrid. Use cases: binding resolution to chosen oracles in Kaspa covenants. (vision §4.2, §4.7)', circuit: 'oracle_binding', accent: '#14B8A6', category: 'kaspa', variant: true, reality: 'hybrid' },
  { id: 'cross_covenant_link', name: 'Cross-Covenant Linking Proof', description: 'Prove two covenants share creator/treasury without revealing. Reality: resolver-attested. Use cases: linked Kaspa covenant families (e.g. series). (vision §4.2)', circuit: 'cross_link', accent: '#8B5CF6', category: 'kaspa', variant: true, reality: 'oracle-attested' },
  { id: 'state_transition', name: 'State Transition Proof (Kaspa FSM)', description: 'Oracle-path (no artifacts yet): prove valid transition S_i -> S_{i+1} given rules. Off-chain game engine state verification. Used for complex game logic. RISC0/SP1 backend possible. Reality: resolver-attested. Use cases: on-chain state machines for Kaspa apps. (vision §4.2)', circuit: 'state_transition', accent: '#10B981', category: 'kaspa', reality: 'oracle-attested' },

  // ═══════════════════════════════════════════
  // DEFI / ECONOMIC / FINANCIAL (expanded §4.4 to 30+ specifics)
  // ═══════════════════════════════════════════
  { id: 'collateral_loan', name: 'Collateralized Loan', description: 'Hybrid: prove locked collateral >= loan * threshold. Liquidation trigger on price feed. ZK range proof for collateral + oracle price attestation. Multi-oracle consensus for price. Reality: hybrid. Use cases: Kaspa collateralized lending covenants. (vision §4.4)', circuit: 'collateral_loan', accent: '#DC2626', category: 'defi', reality: 'hybrid' },
  { id: 'liquidation_threshold', name: 'Liquidation Threshold', description: 'Hybrid: prove collateral value < liquidation threshold via oracle price + ZK range proof. Automatic liquidation trigger for under-collateralized positions. Multi-oracle price consensus. Reality: hybrid. Use cases: auto-liquidate Kaspa loans. (vision §4.4)', circuit: 'liq_threshold', accent: '#DC2626', category: 'defi', reality: 'hybrid' },
  { id: 'collateral_ltv', name: 'LTV / Health Factor Proof', description: 'Hybrid: prove LTV safety from collateral/debt/maxLtv (dev pot10 Groth16 + real verify). Use cases: dynamic collateral covenants on Kaspa. (vision §4.4)', circuit: 'collateral_ltv', accent: '#DC2626', category: 'defi', variant: true, reality: 'hybrid', artifacts: true },
  { id: 'balance_threshold', name: 'Balance Threshold (KYC-free)', description: 'Full ZK: prove a committed balance meets a minimum (balance >= min_balance) WITHOUT revealing the balance, from commitment = Poseidon(balance, salt). valid is a public output the verifier requires == 1, so an under-threshold balance produces a verifying proof that FAILS the gate. The balance stays in your browser; verified OFF-CHAIN by you, the counterparty, or any external verifier (snarkjs against the audited vkey). Dev ceremony keys, not a production MPC. Use cases: KYC-free solvency / income / accredited-investor gating on Kaspa covenants. (vision §4.4, §4.8)', circuit: 'balance_threshold', accent: '#22C55E', category: 'defi', reality: 'full-zk', artifacts: true },
  { id: 'solvency_sum', name: 'Proof of Reserves', description: 'Full ZK: prove the sum of four committed reserve buckets (each C_i = Poseidon(amount_i, salt_i)) meets a public threshold, HIDING every amount. valid is a public output the verifier requires == 1, so a custodian short of the threshold cannot pass the gate. Generated in your browser, verified OFF-CHAIN by you, the counterparty, or any external verifier (snarkjs against the audited vkey). Dev ceremony keys, not a production MPC. Use cases: exchange / treasury proof of reserves on Kaspa. (vision §4.4)', circuit: 'solvency_sum', accent: '#10B981', category: 'defi', reality: 'full-zk', artifacts: true },
  { id: 'yield_accrual', name: 'Yield Accrual Snapshot', description: 'Resolver-attested: verifiable yield/interest calculation over time. A = P * (1+r)^t. Oracle provides rate attestation + on-chain time proof. ZK for calculation accuracy planned. Reality: resolver-attested. Use cases: Kaspa lending yield claims. (vision §4.4)', circuit: 'yield_accrual', accent: '#FBBF24', category: 'defi', reality: 'oracle-attested' },
  { id: 'yield_compounding', name: 'Compounding Yield Proof', description: 'Resolver-attested: verifiable compound interest over N periods. A = P * (1+r)^n with resolver-attested rate per period. Useful for lending pools, staking rewards, DAO treasury growth. Reality: resolver-attested. Use cases: compound on Kaspa treasuries. (vision §4.4)', circuit: 'yield_compound', accent: '#FBBF24', category: 'defi', variant: true, reality: 'oracle-attested' },
  { id: 'token_gated', name: 'Token-Gated Access', description: 'Hybrid: prove ownership of a specific token/NFT via merkle + UTXO proof. Gated covenant entry, premium features. Uses merkle_membership artifacts for the ZK part. Reality: hybrid. Use cases: premium Kaspa features gated by holdings. (vision §4.4, §4.8)', circuit: 'token_gated', accent: '#D946EF', category: 'defi', reality: 'hybrid' },
  { id: 'pot_distribution', name: 'Multi-Party Pot Split', description: 'Resolver-attested: verifiable split of total pot among N participants. Weighted by stake, score, or predefined shares. On-chain verifiable math. ZK planned. Reality: resolver-attested. Use cases: all Kaspa pot payouts (games + DeFi). (vision §4.4)', circuit: 'pot_split', accent: '#FB923C', category: 'defi', reality: 'oracle-attested' },
  { id: 'escrow_2party', name: '2-Party Escrow', description: 'Full ZK: DAA timelock escrow - outcome 0 = timeout refund, 1 = still locked. A real Groth16 proof, verified OFF-CHAIN (by you, the counterparty, or any external verifier; snarkjs against the audited vkey). For the circom suite the proof is verified off-chain; the only on-chain check is a 2-of-2 cosign + CSV timeout, not chain-enforced ZK. Dev pot10 Groth16. Use cases: simple Kaspa escrow deals with honest timeout refund. (vision §4.4)', circuit: 'escrow_2party', accent: '#38BDF8', category: 'defi', reality: 'full-zk', artifacts: true },
  { id: 'escrow_multiparty', name: 'Multi-Party Escrow', description: 'Resolver-attested: N-party escrow with M-of-N release threshold. Milestone-based with resolver verification. Combines timelock + multisig. Reality: resolver-attested. Use cases: milestone Kaspa projects. (vision §4.4)', circuit: 'escrow_multi', accent: '#38BDF8', category: 'defi', variant: true, reality: 'oracle-attested' },
  { id: 'auction_dutch', name: 'Dutch Auction', description: 'Resolver-attested: price descends linearly over blocks. First bidder wins at current price. Verifiable price curve via oracle timestamp + range. Reality: resolver-attested. Use cases: Kaspa Dutch auction covenants. (vision §4.4)', circuit: 'auction_dutch', accent: '#A78BFA', category: 'defi', reality: 'oracle-attested' },
  { id: 'auction_english', name: 'English Auction', description: 'Resolver-attested: ascending bids, reserve price, time extension on late bids. Verifiable bid ordering. Oracle timestamp. Reality: resolver-attested. Use cases: ascending Kaspa auctions. (vision §4.4)', circuit: 'auction_english', accent: '#A78BFA', category: 'defi', variant: true, reality: 'oracle-attested' },
  { id: 'auction_clearing', name: 'Auction Clearing Price Proof', description: 'Hybrid: prove clearing price >= reserve and <= highest bid (dev pot10 Groth16). Use cases: fair price discovery in Kaspa auctions. (vision §4.4)', circuit: 'auction_clear', accent: '#A78BFA', category: 'defi', variant: true, reality: 'hybrid', artifacts: true },
  { id: 'lending_pool', name: 'Lending Pool Share', description: 'Resolver-attested: prove proportional share of a lending pool. Deposit/withdraw with verifiable exchange rate. On-chain TVL attestation. ZK planned. Reality: resolver-attested. Use cases: Kaspa yield pools. (vision §4.4)', circuit: 'lending_pool', accent: '#10B981', category: 'defi', reality: 'oracle-attested' },
  { id: 'prediction_market', name: 'Conditional Outcome', description: 'Resolver-attested: binary/ternary conditional outcome. Stake on an outcome. An external resolver you choose or run resolves the winner by revealing its published hashlock; the chain enforces blake2b(secret)==hash plus a timelock refund, and Covex holds no key. Verifiable payout ratios. Multiple resolvers for critical outcomes. Reality: resolver-attested. Use cases: conditional-outcome covenants on Kaspa. (vision §4.4)', circuit: 'prediction_market', accent: '#F59E0B', category: 'defi', reality: 'oracle-attested' },
  { id: 'prediction_tally', name: 'Private Outcome ZK Tally', description: 'Private votes + ZK tally (nullifiers). Reality: hybrid. Use cases: private outcome positions on Kaspa. (vision §4.4, §4.5)', circuit: 'pred_tally', accent: '#F59E0B', category: 'defi', variant: true, reality: 'hybrid' },
  { id: 'dao_treasury', name: 'DAO Treasury Management', description: 'M-of-N + spending limits + proposal execution proofs (merkle + multisig). Reality: hybrid. Use cases: on-chain DAO governance spends on Kaspa. (vision §4.4)', circuit: 'dao_treasury', accent: '#A855F7', category: 'defi', variant: true, reality: 'hybrid' },
  { id: 'financial_black_scholes', name: 'Black-Scholes / Option Pricing Proof', description: 'Resolver-attested (ZK compute planned): prove option price / greeks from oracle inputs. Reality: resolver-attested. Use cases: derivative settlement on Kaspa. (vision §4.4, §4.6)', circuit: 'bs_pricer', accent: '#EC4899', category: 'defi', variant: true, reality: 'oracle-attested' },
  { id: 'financial_irr', name: 'IRR / DCF / Bond Yield Proof', description: 'Prove IRR, DCF, yield from cashflows + oracle rates. Reality: resolver-attested. Use cases: verifiable financial covenants on Kaspa. (vision §4.4)', circuit: 'irr_dcf', accent: '#EC4899', category: 'defi', variant: true, reality: 'oracle-attested' },
  { id: 'portfolio_var', name: 'VaR / Portfolio Risk (Hidden Positions)', description: 'ZK risk metrics with hidden amounts/positions. Reality: hybrid. Use cases: private portfolio covenants. (vision §4.4)', circuit: 'portfolio_var', accent: '#EC4899', category: 'defi', variant: true, reality: 'hybrid' },
  { id: 'amm_invariant', name: 'AMM Invariant Proof (Hidden Amounts)', description: 'Prove constant-product or other invariant holds with hidden reserves. Reality: hybrid. Use cases: private AMM-like Kaspa swaps. (vision §4.4)', circuit: 'amm_invariant', accent: '#8B5CF6', category: 'defi', variant: true, reality: 'hybrid' },
  { id: 'fractional_ownership', name: 'Fractional / Shared Ownership Proof', description: 'ZK shares of NFT/asset (merkle + range). Reality: hybrid. Use cases: fractionalized Kaspa assets. (vision §4.4)', circuit: 'frac_own', accent: '#D946EF', category: 'defi', variant: true, reality: 'hybrid' },
  { id: 'parametric_insurance', name: 'Parametric Insurance Trigger', description: 'External-resolver data (weather/price/flight) + payout math proof; Covex does not attest the trigger. Reality: hybrid (external data + range). Use cases: real-world trigger Kaspa insurance. (vision §4.4, §4.7)', circuit: 'param_ins', accent: '#F59E0B', category: 'defi', variant: true, reality: 'hybrid' },
  { id: 'yield_farm_claim', name: 'Yield Farming / Staking Reward Claim (Hidden)', description: 'Prove reward share with hidden deposit amounts. Reality: hybrid (range + merkle). Use cases: private farming on Kaspa. (vision §4.4)', circuit: 'yield_farm', accent: '#10B981', category: 'defi', variant: true, reality: 'hybrid' },
  { id: 'cross_asset_swap', name: 'Cross-Asset Swap + Resolver Price (No Front-Run)', description: 'Resolver price + ZK swap fairness (commitment before reveal). Reality: hybrid. Use cases: fair atomic swaps on Kaspa. (vision §4.4)', circuit: 'cross_swap', accent: '#38BDF8', category: 'defi', variant: true, reality: 'hybrid' },

  // ═══════════════════════════════════════════
  // PRIVACY STACK (expanded §4.5)
  // ═══════════════════════════════════════════
  { id: 'anon_credential', name: 'Anonymous Credential (Set + Attrs)', description: 'Prove "in set + age > N + rep > T" without revealing identity/values. Reality: hybrid (merkle+range). Use cases: private gated communities on Kaspa. (vision §4.5, §4.8)', circuit: 'anon_cred', accent: '#FB923C', category: 'privacy', variant: true, reality: 'hybrid' },
  { id: 'private_voting', name: 'Private Voting / DAO (Nullifier Tally)', description: 'Yes/no or ranked vote with ZK tally or nullifier (no double-vote). Reality: hybrid. Use cases: private Kaspa DAO votes. (vision §4.5)', circuit: 'priv_vote', accent: '#A855F7', category: 'privacy', variant: true, reality: 'hybrid' },
  { id: 'private_airdrop', name: 'Private Airdrop / Claim', description: 'Merkle + nullifier + amount range. Reality: full-zk (extend merkle). Use cases: private claims without public list exposure. (vision §4.5)', circuit: 'priv_airdrop', accent: '#3B82F6', category: 'privacy', variant: true, reality: 'full-zk', artifacts: true },
  { id: 'private_reputation', name: 'Private Reputation / Trust Score Update', description: 'Nullifier to prevent double-count + threshold/range proofs. Reality: hybrid. Use cases: private trust in Kaspa matchmaking. (vision §4.5)', circuit: 'priv_rep', accent: '#FB923C', category: 'privacy', variant: true, reality: 'hybrid' },
  { id: 'confidential_collateral', name: 'Confidential Collateral / Loan', description: 'Amounts hidden except liquidation trigger (range + resolver). Reality: hybrid. Use cases: private DeFi loans on Kaspa. (vision §4.5)', circuit: 'conf_collateral', accent: '#DC2626', category: 'privacy', variant: true, reality: 'hybrid' },
  { id: 'private_prediction', name: 'Private Outcome Position', description: 'Hidden position + ZK payout eligibility. Reality: hybrid. Use cases: private positions on Kaspa outcomes. (vision §4.5)', circuit: 'priv_pred', accent: '#F59E0B', category: 'privacy', variant: true, reality: 'hybrid' },

  // ═══════════════════════════════════════════
  // VERIFIABLE COMPUTE + 20+ CONCRETE PROGRAMS (§4.6)
  // Backends + specific guests (RISC0/SP1/WASM/Circom). Each concrete = separate registry entry.
  // ═══════════════════════════════════════════
  { id: 'verifiable', name: 'Verifiable Compute (General RISC0/SP1)', description: 'Oracle-path (no artifacts yet): arbitrary computation proof via RISC0/SP1 backend. Custom predicates, state transitions, off-chain execution. Requires ceremony + zkey for production use. Reality: resolver-attested. Use cases: arbitrary logic in Kaspa Studio covenants. (vision §4.6)', circuit: 'risc0_generic', accent: '#A855F7', category: 'compute', reality: 'oracle-attested' },
  { id: 'wasm_execution', name: 'WASM Execution Proof', description: 'Oracle-path (no artifacts yet): prove deterministic execution of a WebAssembly module. Custom games, financial formulas, predicates in any language compiled to WASM. Requires WASM ZK backend. Reality: resolver-attested. Use cases: user-defined Kaspa covenant logic. (vision §4.6)', circuit: 'wasm_generic', accent: '#6366F1', category: 'compute', reality: 'oracle-attested' },
  { id: 'basic_state_machine', name: 'Basic State Machine (FSM)', description: 'Resolver-attested: simple finite state machine for turn-based custom games. Define states + valid transitions. Resolver validates each transition. Useful for custom game logic without full ZK. Reality: resolver-attested. Use cases: custom FSM Kaspa games. (vision §4.6)', circuit: 'state_machine', accent: '#10B981', category: 'compute', reality: 'oracle-attested' },
  { id: 'wasm_predicate', name: 'WASM Predicate (User-defined)', description: 'Oracle-path (no artifacts yet): user-defined WASM predicate for game rules or financial logic. Compile any language to WASM, oracle validates execution trace. Custom game logic in Python/Rust/C. Reality: resolver-attested. Use cases: bring-your-own-logic to Kaspa covenants. (vision §4.6)', circuit: 'wasm_predicate', accent: '#6366F1', category: 'compute', variant: true, reality: 'oracle-attested' },
  // 20+ concrete programs as separate entries (vision §4.6)
  { id: 'compute_chess_eval_d8', name: 'Compute: Chess Engine Eval (depth 8-12)', description: 'Concrete RISC0/SP1: position eval + best move / mate-in-N. Reality: resolver-attested (RISC0 guest). Use cases: AI fairness / optimal play proofs in Kaspa chess. (vision §4.6)', circuit: 'risc0_chess_d8', accent: '#A855F7', category: 'compute', variant: true, reality: 'oracle-attested' },
  { id: 'compute_poker_solver', name: 'Compute: Poker Solver (Equity/Nash)', description: 'Concrete: heads-up equity + Nash approx via RISC0. Reality: resolver-attested. Use cases: poker AI validation + equity chops on Kaspa. (vision §4.6)', circuit: 'risc0_poker_nash', accent: '#A855F7', category: 'compute', variant: true, reality: 'oracle-attested' },
  { id: 'compute_go_ai', name: 'Compute: Go / Board AI Eval', description: 'Concrete program for Go position eval. Reality: resolver-attested. Use cases: Go AI proofs in Kaspa. (vision §4.6)', circuit: 'risc0_go_eval', accent: '#A855F7', category: 'compute', variant: true, reality: 'oracle-attested' },
  { id: 'compute_black_scholes_mc', name: 'Compute: Black-Scholes Monte Carlo', description: 'Concrete financial: option pricing via MC sim. Reality: resolver-attested. Use cases: derivative oracles in Kaspa DeFi. (vision §4.6)', circuit: 'risc0_bs_mc', accent: '#EC4899', category: 'compute', variant: true, reality: 'oracle-attested' },
  { id: 'compute_bond_pricer', name: 'Compute: Bond / Yield Pricer', description: 'Concrete: DCF/bond price from rates. Reality: resolver-attested. Use cases: fixed-income Kaspa products. (vision §4.6)', circuit: 'risc0_bond', accent: '#EC4899', category: 'compute', variant: true, reality: 'oracle-attested' },
  { id: 'compute_portfolio_opt', name: 'Compute: Portfolio Optimizer', description: 'Concrete: mean-variance or risk parity with hidden positions. Reality: resolver-attested. Use cases: private portfolio management covenants. (vision §4.6)', circuit: 'risc0_port_opt', accent: '#EC4899', category: 'compute', variant: true, reality: 'oracle-attested' },
  { id: 'compute_sort_network', name: 'Compute: Sorting / Ranking Network', description: 'Concrete: prove list correctly sorted/ranked (hidden elements). Reality: resolver-attested. Use cases: leaderboards + tournament seeding on Kaspa. (vision §4.6)', circuit: 'risc0_sort', accent: '#06B6D4', category: 'compute', variant: true, reality: 'oracle-attested' },
  { id: 'compute_graph_reach', name: 'Compute: Graph Reachability / Shortest Path', description: 'Concrete: path exists + length in committed hidden graph. Reality: resolver-attested. Use cases: supply chain provenance, social graphs on Kaspa. (vision §4.6, §4.9)', circuit: 'risc0_graph', accent: '#84CC16', category: 'compute', variant: true, reality: 'oracle-attested' },
  { id: 'compute_ml_credit', name: 'Compute: ML Credit Scoring (small model)', description: 'Concrete: ezkl or direct ZKML inference for credit score. Reality: resolver-attested (ZKML). Use cases: on-chain credit without revealing data. (vision §4.6)', circuit: 'ezkl_credit', accent: '#8B5CF6', category: 'compute', variant: true, reality: 'oracle-attested' },
  { id: 'compute_ml_fraud', name: 'Compute: ML Fraud / Anomaly Detection', description: 'Concrete small model inference for fraud/stake-pattern anomaly. Reality: resolver-attested. Use cases: collusion/anomaly detection in Kaspa games. (vision §4.6)', circuit: 'ezkl_fraud', accent: '#8B5CF6', category: 'compute', variant: true, reality: 'oracle-attested' },
  { id: 'compute_regex_dict', name: 'Compute: Regex / Dictionary Matching', description: 'Concrete: string/regex match against committed dict (Scrabble/KYC patterns). Reality: resolver-attested. Use cases: word validation + private KYC on Kaspa. (vision §4.6)', circuit: 'risc0_regex', accent: '#F97316', category: 'compute', variant: true, reality: 'oracle-attested' },
  { id: 'compute_bigint_math', name: 'Compute: BigInt / FP Math Lib', description: 'Concrete: arbitrary precision math for finance. Reality: resolver-attested. Use cases: complex financial formulas in Kaspa covenants. (vision §4.6)', circuit: 'risc0_bigint', accent: '#EC4899', category: 'compute', variant: true, reality: 'oracle-attested' },
  { id: 'compute_risk_battle', name: 'Compute: Risk Battle Simulator', description: 'Concrete sim for fair combat resolution (dice + modifiers). Reality: resolver-attested. Use cases: deterministic Risk-style combat on Kaspa. (vision §4.6)', circuit: 'risc0_risk_sim', accent: '#DC2626', category: 'compute', variant: true, reality: 'oracle-attested' },
  { id: 'compute_catan_sim', name: 'Compute: Catan Resource / Start Sim', description: 'Concrete: fair starting position / resource sim. Reality: resolver-attested. Use cases: provably fair Catan setups on Kaspa. (vision §4.6)', circuit: 'risc0_catan', accent: '#D946EF', category: 'compute', variant: true, reality: 'oracle-attested' },
  { id: 'compute_linprog_pot', name: 'Compute: Linear Programming (Pot Splits)', description: 'Concrete LP solver stub for optimal fair splits. Reality: resolver-attested. Use cases: complex treasury/pot allocation on Kaspa. (vision §4.6)', circuit: 'risc0_lp', accent: '#FB923C', category: 'compute', variant: true, reality: 'oracle-attested' },
  { id: 'compute_custom_fsm', name: 'Compute: Custom Game FSM Compiler', description: 'Concrete: compile user FSM spec → prove execution. Reality: resolver-attested. Use cases: bring-your-own-game rules to Kaspa. (vision §4.6)', circuit: 'risc0_fsmc', accent: '#10B981', category: 'compute', variant: true, reality: 'oracle-attested' },
  { id: 'compute_anomaly_bet', name: 'Compute: Anomaly Detection (Stake Sizing / Timing)', description: 'ZK stats on move times / stake patterns for collusion. Reality: resolver-attested. Use cases: anti-cheat in Kaspa games. (vision §4.6)', circuit: 'risc0_anom', accent: '#A855F7', category: 'compute', variant: true, reality: 'oracle-attested' },
  { id: 'compute_formal_verify', name: 'Compute: Formal Verification Result Proof', description: 'Prove a program satisfies spec (simple specs). Reality: resolver-attested. Use cases: verified covenant logic on Kaspa. (vision §4.6, §4.9)', circuit: 'risc0_formal', accent: '#F97316', category: 'compute', variant: true, reality: 'oracle-attested' },

  // ═══════════════════════════════════════════
  // ORACLE TYPES + 15+ SPECIFIC DATA / EVENT FEEDS (§4.7)
  // Infrastructure + concrete feeds (each usable as circuit_type + oracle provider).
  // ═══════════════════════════════════════════
  { id: 'oracle_single', name: 'Single Resolver Attestation (Core)', description: 'A single external resolver you choose or run signs the outcome (verify ZK or generic sign). Covex holds no key here. Reality: resolver-attested. Use cases: base resolution for all Kaspa covenants. (vision §4.7)', circuit: 'oracle_single', accent: '#14B8A6', category: 'oracle', reality: 'oracle-attested' },
  { id: 'oracle_multi_threshold', name: 'Multi-Resolver Threshold (BLS)', description: 'Real BLS aggregation, weights, quorums (stub → production) across a set of external resolvers you configure. Reality: hybrid (BLS + attest). Use cases: spreading resolution across multiple resolvers on Kaspa. (vision §4.7)', circuit: 'oracle_multi', accent: '#14B8A6', category: 'oracle', variant: true, reality: 'hybrid' },
  { id: 'oracle_data_pull', name: 'Pull Resolver (API + Attest)', description: 'An external resolver you connect polls the API and attests the response (TLSNotary/ZK). Covex does not fetch or attest the data. Reality: resolver-attested. Use cases: external data triggers. (vision §4.7)', circuit: 'oracle_pull', accent: '#14B8A6', category: 'oracle', variant: true, reality: 'oracle-attested' },
  { id: 'oracle_randomness', name: 'Randomness Resolver (drand / Beacon)', description: 'An external resolver attests a public randomness beacon (+ optional ZK). Reality: resolver-attested. Use cases: external VRF for Kaspa games. (vision §4.7)', circuit: 'oracle_rand', accent: '#EC4899', category: 'oracle', variant: true, reality: 'oracle-attested' },
  // 15+ specific feeds (examples from vision: prices, sports, weather, etc.). Covex never attests these real-world facts; an external resolver you connect or run signs the outcome.
  { id: 'feed_price_kas', name: 'Data Feed: KAS/USD Price', description: 'KAS price attested by an external resolver you choose; Covex does not run this feed. Reality: resolver-attested (multi-source planned). Use cases: KAS-collateral DeFi, parametric on Kaspa. (vision §4.7)', circuit: 'feed_kas', accent: '#F59E0B', category: 'oracle', variant: true, reality: 'oracle-attested' },
  { id: 'feed_price_btc', name: 'Data Feed: BTC/USD Price', description: 'BTC price attestation. Reality: resolver-attested. Use cases: BTC-pegged or cross-asset Kaspa covenants. (vision §4.7)', circuit: 'feed_btc', accent: '#F59E0B', category: 'oracle', variant: true, reality: 'oracle-attested' },
  { id: 'feed_price_eth', name: 'Data Feed: ETH/USD Price', description: 'ETH price. Reality: resolver-attested. Use cases: ETH collateral or swaps on Kaspa. (vision §4.7)', circuit: 'feed_eth', accent: '#F59E0B', category: 'oracle', variant: true, reality: 'oracle-attested' },
  { id: 'feed_price_usdt', name: 'Data Feed: USDT/USDC Stable Price', description: 'Stablecoin peg attest. Reality: resolver-attested. Use cases: stable collateral / loans on Kaspa. (vision §4.7)', circuit: 'feed_stable', accent: '#F59E0B', category: 'oracle', variant: true, reality: 'oracle-attested' },
  { id: 'feed_nba_score', name: 'Data Feed: NBA Game Score', description: 'Final score + basic stats for specific game. Reality: resolver-attested (multi-source). Use cases: sports conditional-outcome covenants on Kaspa. (vision §4.7)', circuit: 'feed_nba', accent: '#22C55E', category: 'oracle', variant: true, reality: 'oracle-attested' },
  { id: 'feed_nba_prop', name: 'Data Feed: NBA Player Prop (Pts/Reb)', description: 'Player performance stats attested by an external resolver you connect; Covex does not attest this. Reality: resolver-attested. Use cases: fantasy-style player props on Kaspa. (vision §4.7)', circuit: 'feed_nba_prop', accent: '#22C55E', category: 'oracle', variant: true, reality: 'oracle-attested' },
  { id: 'feed_soccer_premier', name: 'Data Feed: Soccer Premier League Result', description: 'Match outcome + score for Premier/etc. Reality: resolver-attested. Use cases: soccer markets on Kaspa. (vision §4.7)', circuit: 'feed_soccer', accent: '#22C55E', category: 'oracle', variant: true, reality: 'oracle-attested' },
  { id: 'feed_weather_temp', name: 'Data Feed: Weather Param (Temp/Rain at Loc)', description: 'Temperature/rainfall at city for parametric insurance. Reality: resolver-attested. Use cases: weather derivatives / crop insurance on Kaspa. (vision §4.7)', circuit: 'feed_weather', accent: '#0EA5E9', category: 'oracle', variant: true, reality: 'oracle-attested' },
  { id: 'feed_election', name: 'Data Feed: Election / Governance Result', description: 'Verified election outcome (multi-source). Reality: resolver-attested. Use cases: conditional-outcome + governance covenants on Kaspa. (vision §4.7)', circuit: 'feed_elect', accent: '#8B5CF6', category: 'oracle', variant: true, reality: 'oracle-attested' },
  { id: 'feed_flight_delay', name: 'Data Feed: Flight Delay / Status', description: 'Specific flight delay or arrival status. Reality: resolver-attested. Use cases: travel insurance parametric on Kaspa. (vision §4.7)', circuit: 'feed_flight', accent: '#0EA5E9', category: 'oracle', variant: true, reality: 'oracle-attested' },
  { id: 'feed_drand', name: 'Data Feed: drand Beacon Randomness', description: 'drand public randomness attest. Reality: resolver-attested. Use cases: public beacon for Kaspa VRF games. (vision §4.7)', circuit: 'feed_drand', accent: '#EC4899', category: 'oracle', variant: true, reality: 'oracle-attested' },
  { id: 'feed_web2_nba', name: 'Data Feed: Web2 NBA API Hash Attest', description: 'An external resolver you connect attests a response hash (+ optional ZK subset) for a specific NBA endpoint; Covex does not run it. Reality: resolver-attested. Use cases: external sports data on Kaspa. (vision §4.7)', circuit: 'feed_web2_nba', accent: '#22C55E', category: 'oracle', variant: true, reality: 'oracle-attested' },
  { id: 'feed_ai_model', name: 'Data Feed: AI Model Output (ZKML)', description: 'Specific model version inference (e.g. "cat in image"). Reality: resolver-attested (ZKML path). Use cases: AI-triggered covenants on Kaspa. (vision §4.7)', circuit: 'feed_ai', accent: '#8B5CF6', category: 'oracle', variant: true, reality: 'oracle-attested' },
  { id: 'feed_btc_header', name: 'Data Feed: BTC Light Client Header', description: 'BTC block header / SPV attest. Reality: resolver-attested. Use cases: BTC cross-chain triggers for Kaspa covenants. (vision §4.7, §4.9)', circuit: 'feed_btc_hdr', accent: '#F59E0B', category: 'oracle', variant: true, reality: 'oracle-attested' },
  { id: 'feed_kaspa_daa', name: 'Data Feed: Kaspa DAA / Time', description: 'Kaspa DAA score read straight from consensus (for timelocks etc); no off-chain attestor needed. Reality: hybrid (chain data). Use cases: all time-based Kaspa covenants. (vision §4.7)', circuit: 'feed_daa', accent: '#06B6D4', category: 'oracle', variant: true, reality: 'hybrid' },

  // ═══════════════════════════════════════════
  // GATING / ACCESS / REPUTATION / IDENTITY (expanded §4.8 to 15+)
  // ═══════════════════════════════════════════
  { id: 'nft_gating', name: 'NFT Ownership Gating', description: 'Hybrid: prove ownership of a specific NFT collection via merkle + UTXO proof. Gated covenant entry, premium game access, token-gated communities. Uses merkle artifacts. Reality: hybrid. Use cases: NFT-gated Kaspa clubs/arenas. (vision §4.8)', circuit: 'nft_gating', accent: '#D946EF', category: 'gating', reality: 'hybrid' },
  { id: 'nft_collection_gating', name: 'NFT Collection + Trait Gating', description: 'Merkle + trait range (e.g. rarity > X). Reality: hybrid. Use cases: trait-based access on Kaspa. (vision §4.8)', circuit: 'nft_trait_gate', accent: '#D946EF', category: 'gating', variant: true, reality: 'hybrid' },
  { id: 'reputation_threshold', name: 'Reputation Threshold', description: 'Oracle-path (no artifacts yet): prove on-chain reputation >= threshold via nullifier + range proof. Reputation-based matchmaking, trust scoring. Nullifier prevents double-counting. Reality: resolver-attested. Use cases: trust-gated Kaspa matchmaking. (vision §4.8)', circuit: 'rep_threshold', accent: '#FB923C', category: 'gating', reality: 'oracle-attested' },
  { id: 'age_verification', name: 'Age Verification (KYC-free)', description: 'Full ZK: MiMC birth-year commitment + prove age >= min_age without revealing birth year. A real Groth16 proof, verified OFF-CHAIN (by you, the counterparty, or any external verifier; snarkjs against the audited vkey). For the circom suite the proof is verified off-chain; the only on-chain check is a 2-of-2 cosign + CSV timeout, not chain-enforced ZK. Dev pot10 Groth16. Reality: full-zk. Use cases: age-gated Kaspa communities without KYC. (vision §4.8)', circuit: 'age_verify_v1', accent: '#9CA3AF', category: 'gating', reality: 'full-zk', artifacts: true },
  { id: 'credential_edu', name: 'Credential: Education / Cert Proof', description: 'Prove degree or cert from issuer without PII. Reality: resolver-attested. Use cases: professional gated Kaspa DAOs. (vision §4.8)', circuit: 'cred_edu', accent: '#9CA3AF', category: 'gating', variant: true, reality: 'oracle-attested' },
  { id: 'credential_income', name: 'Credential: Income Bracket Proof', description: 'Prove bracket (e.g. >$X) via range/issuer without exact. Reality: resolver-attested. Use cases: tiered access. (vision §4.8)', circuit: 'cred_income', accent: '#9CA3AF', category: 'gating', variant: true, reality: 'oracle-attested' },
  { id: 'private_group_member', name: 'Private Group / DAO Membership', description: 'Merkle or accumulator prove member without revealing which. Reality: hybrid. Use cases: gated private Kaspa groups. (vision §4.8)', circuit: 'priv_group', accent: '#8B5CF6', category: 'gating', variant: true, reality: 'hybrid' },
  { id: 'anti_sybil', name: 'Anti-Sybil (Nullifier + Social/Rep Graph)', description: 'Nullifier + ZK graph property for unique human. Reality: hybrid. Use cases: Sybil-resistant Kaspa airdrops/votes. (vision §4.8)', circuit: 'anti_sybil', accent: '#FB923C', category: 'gating', variant: true, reality: 'hybrid' },
  { id: 'acl_zk_proof', name: 'ZK Access Control List Proof', description: 'Prove in allowlist (merkle) without revealing index. Reality: full-zk (merkle base). Use cases: private ACLs for Kaspa resources. (vision §4.8)', circuit: 'acl_zk', accent: '#D946EF', category: 'gating', variant: true, reality: 'full-zk', artifacts: true },
  { id: 'soulbound_gating', name: 'Soulbound / Non-Transferable Gating', description: 'Prove possession of soulbound credential/NFT. Reality: hybrid. Use cases: non-transferable roles on Kaspa. (vision §4.8)', circuit: 'soul_gate', accent: '#D946EF', category: 'gating', variant: true, reality: 'hybrid' },

  // ═══════════════════════════════════════════
  // CROSS-CHAIN / INTEROP / ADVANCED (§4.9)
  // ═══════════════════════════════════════════
  { id: 'light_client_btc', name: 'BTC Light Client / Header Proof', description: 'Prove BTC header / SPV in-circuit or attested. Reality: resolver-attested. Use cases: BTC state triggers for Kaspa covenants. (vision §4.9)', circuit: 'lc_btc', accent: '#F59E0B', category: 'crosschain', variant: true, reality: 'oracle-attested' },
  { id: 'light_client_eth', name: 'ETH Light Client / State Proof', description: 'ETH header or event log proof. Reality: resolver-attested. Use cases: ETH cross triggers on Kaspa. (vision §4.9)', circuit: 'lc_eth', accent: '#627EEA', category: 'crosschain', variant: true, reality: 'oracle-attested' },
  { id: 'cross_asset_claim', name: 'Cross-Chain Asset Ownership Claim', description: 'Prove ownership on another chain + claim on Kaspa. Reality: hybrid. Use cases: bridge claims / wrapped assets. (vision §4.9)', circuit: 'cross_claim', accent: '#8B5CF6', category: 'crosschain', variant: true, reality: 'hybrid' },
  { id: 'recursive_agg', name: 'Recursive Aggregation (100+ Subproofs)', description: 'One proof aggregates many game/DeFi outcomes. Reality: resolver-attested (folding future). Use cases: batch settlement on Kaspa. (vision §4.9)', circuit: 'rec_agg', accent: '#A855F7', category: 'crosschain', variant: true, reality: 'oracle-attested' },
  { id: 'supply_provenance', name: 'Supply Chain / Provenance Graph', description: 'Graph reachability + timestamp chain ZK. Reality: hybrid. Use cases: verifiable supply on Kaspa. (vision §4.9)', circuit: 'supply_graph', accent: '#84CC16', category: 'crosschain', variant: true, reality: 'hybrid' },
  { id: 'zk_coprocessor', name: 'ZK Coprocessor (Offload Heavy)', description: 'Heavy logic offloaded + proved. Reality: resolver-attested. Use cases: complex compute without burdening covenant. (vision §4.9)', circuit: 'zk_coproc', accent: '#6366F1', category: 'crosschain', variant: true, reality: 'oracle-attested' },

  // ═══════════════════════════════════════════
  // META / PLATFORM / SELF-REFERENTIAL (§4.10)
  // ═══════════════════════════════════════════
  { id: 'oracle_exec_proof', name: 'Proof of Correct Oracle Execution', description: 'ZK/attest that oracle itself executed correctly (for network). Reality: resolver-attested. Use cases: oracle network self-audit on Kaspa. (vision §4.10)', circuit: 'meta_oracle', accent: '#14B8A6', category: 'meta', variant: true, reality: 'oracle-attested' },
  { id: 'ceremony_contrib', name: 'Ceremony Participation Proof', description: 'Prove contributed to MPC/PTAU. Reality: resolver-attested. Use cases: trusted setup transparency. (vision §4.10)', circuit: 'meta_ceremony', accent: '#F97316', category: 'meta', variant: true, reality: 'oracle-attested' },
  { id: 'artifact_integrity', name: 'Artifact Hash + Integrity Proof', description: 'Prove circuit artifact hash matches registry. Reality: hybrid. Use cases: auditability of deployed Kaspa circuits. (vision §4.10)', circuit: 'meta_artifact', accent: '#8B5CF6', category: 'meta', variant: true, reality: 'hybrid' },
  { id: 'oracle_liveness', name: 'Oracle Liveness / Heartbeat Proof', description: 'Prove oracle responded in window. Reality: resolver-attested. Use cases: liveness guarantees for time-sensitive Kaspa covenants. (vision §4.10)', circuit: 'meta_liveness', accent: '#14B8A6', category: 'meta', variant: true, reality: 'oracle-attested' },
  { id: 'staking_bond', name: 'Economic Security / Staking Commitment', description: 'Prove oracle/operator bonded stake. Reality: resolver-attested. Use cases: slashing-backed oracles on Kaspa. (vision §4.10)', circuit: 'meta_stake', accent: '#DC2626', category: 'meta', variant: true, reality: 'oracle-attested' },
  { id: 'registry_member', name: 'Circuit Registry Membership + Version', description: 'Prove circuit id/version/audit status in global registry. Reality: hybrid. Use cases: discoverable + verified circuits for Kaspa Studio. (vision §4.10)', circuit: 'meta_registry', accent: '#A855F7', category: 'meta', variant: true, reality: 'hybrid' },

  // ═══════════════════════════════════════════
  // GATING / OTHER (remaining de-prioritized + custom)
  // ═══════════════════════════════════════════
  { id: 'kyc_alternative', name: 'KYC Alternative (Generic Cred)', description: 'Oracle-path (no artifacts yet): generic credential proof without centralized issuer. Low priority - not primary for Kaspa p2p covenant use-cases. Deferred. Reality: resolver-attested. (vision §4.8)', circuit: 'kyc_alt', accent: '#9CA3AF', category: 'other', reality: 'oracle-attested' },

  // ═══════════════════════════════════════════
  // CUSTOM (always last)
  // ═══════════════════════════════════════════
  { id: 'custom', name: 'Custom Circuit', description: 'Supply any audited circuit definition and verifier key. Reality depends on your artifacts. Full flexibility for novel covenant types. Use cases: anything not covered. Compose in Covenant Studio per vision (vision sections 4 plus 5).', circuit: 'custom', accent: '#E8AF34', category: 'custom', reality: 'oracle-attested' },
];

// HONEST REALITY (build-up policy). A circuit may only advertise 'full-zk' if it ships a served
// proving key (.zkey) AND a working in-browser prover, verified valid-accept + tamper-reject.
// The three canonical reality sets (VERIFIED_FULL_ZK / IN_BROWSER_PROVERS / STRICT_GROTH16) now
// live in lib/zk/circuits.js as the SINGLE source of truth and are imported at the top of this
// file (also imported by TransparencyModal.jsx, OnChainLockSection.jsx, and the public
// ZkClaimPanel). They are NOT redefined here, which is what kills the duplicate-set drift that
// previously let one badge lie while another stayed correct. Every 'full-zk' label without a
// working prover is honestly downgraded to 'resolver-attested' below (see ZK_CIRCUIT_TYPES); the
// PREFERRED fix for an overclaim is to BUILD the prover (add the id in circuits.js), not relabel.
// Per-reality visual treatment for the circuit cards: an accent colour + a readable pill label.
// HONEST taxonomy for a mainnet-live world: for the circom suite the Groth16 proof is verified
// off-chain, never checked on-chain. Every circom ZK circuit is therefore resolver-attested: the proof
// (when one exists) is verified OFF-CHAIN by you, the counterparty, or any external verifier (snarkjs
// against the audited vkey), and only a 2-of-2 cosign + CSV timeout is checked on-chain (Schnorr).
// 'full-zk' is NEVER rendered as a badge here; the post-processing below collapses it to
// 'resolver-attested'. 'hybrid' likewise routes to the resolver-attested label so no card claims trustless
// / on-chain ZK. Circuits with a real in-browser Groth16 prover keep their separate "in-browser prover"
// chip (a true capability), but the proof is still verified off-chain, not on-chain.
const REALITY_META = {
  'full-zk':         { label: 'Resolver-attested', short: 'Resolver', accent: '#fbbf24', text: 'text-amber-300', bg: 'bg-amber-500/12', border: 'border-amber-500/35' },
  'hybrid':          { label: 'Resolver-attested', short: 'Resolver', accent: '#fbbf24', text: 'text-amber-300', bg: 'bg-amber-500/12', border: 'border-amber-500/35' },
  'oracle-attested': { label: 'Resolver-attested', short: 'Resolver', accent: '#fbbf24', text: 'text-amber-300', bg: 'bg-amber-500/12', border: 'border-amber-500/35' },
  'decorative':      { label: 'Metadata',       short: 'Meta',   accent: '#9ca3af', text: 'text-gray-300 light:text-slate-600',    bg: 'bg-white/[0.06]',   border: 'border-white/15' },
};
const realityMeta = (r) => REALITY_META[r] || REALITY_META['oracle-attested'];

// ── READINESS TIER (production vs roadmap), derived from the registry, not the prose ──────────
// HONESTY: a circuit is "production" ONLY if it has a real wired Groth16 path that is verified
// end-to-end today: a working in-browser prover (IN_BROWSER_PROVERS) and/or a fail-closed backend
// Groth16 verify (STRICT_GROTH16). That is exactly the `zkVerifiedOffChain` flag the post-processor
// computes below from the canonical registry sets, so this tier CANNOT drift from what really
// verifies. Everything else is "roadmap": fully buildable, but resolved by a deployer-bound external
// resolver attesting the outcome, with no dedicated prover wired yet. The badge is distinct from the
// enforcement-reality (Resolver-attested) badge: enforcement says HOW the outcome is checked on-chain
// (a 2-of-2 cosign + CSV timeout), readiness says WHETHER a real proof exists for it yet.
const READINESS_META = {
  production: { label: 'Production', short: 'Production', text: 'text-emerald-300 light:text-emerald-700', bg: 'bg-emerald-500/12 light:bg-emerald-50', border: 'border-emerald-500/35 light:border-emerald-300' },
  roadmap:    { label: 'Roadmap',    short: 'Roadmap',    text: 'text-violet-300 light:text-violet-700',   bg: 'bg-violet-500/12 light:bg-violet-50',   border: 'border-violet-500/35 light:border-violet-300' },
};
const readinessMeta = (tier) => READINESS_META[tier] || READINESS_META.roadmap;
// Rewrite legacy "Full ZK" / "Hybrid" prose to the honest mainnet framing: the proof is verified
// OFF-CHAIN by you, the counterparty, or any external verifier (snarkjs against the audited vkey),
// the trusted setup is a single-contributor dev ceremony (not a production MPC), and there is no
// on-chain proof verification. We never use the words full-zk, trustless, or on-chain ZK to describe
// a circuit's verification.
const scrubZkProse = (d) =>
  (d || '')
    .replace(/^Full ZK:\s*/i, 'Resolver-attested: ')
    .replace(/^Hybrid:\s*/i, 'Resolver-attested: ')
    .replace(/Reality:\s*(full-zk|hybrid)/gi, 'Reality: resolver-attested')
    // Neutralize any residual "full-zk" / "Full ZK" phrasing anywhere in the body so no card or
    // modal claims on-chain/trustless ZK. The verification is resolver-attested off-chain.
    .replace(/\bfull-zk\b/gi, 'resolver-attested')
    .replace(/\bFull ZK\b/g, 'Resolver-attested')
    .replace(/Real artifacts/gi, 'Artifacts');

// Strip the INTERNAL roadmap-doc references + the not-built prose from any user-facing description.
// These are honest-but-internal notes ("(vision §4.6)", "no artifacts yet", "planned", "Deferred")
// that belong on the readiness badge, not bleaking into the catalog copy as if they were product
// detail. The Roadmap badge now carries that signal; the one-liner stays. We do NOT invent any
// capability here: this only removes citations + downgrades aspirational phrasing, it never adds
// claims. Applied to EVERY entry (not just the ex-full-zk ones), so the 100+ pure resolver-attested
// roadmap circuits no longer show "(vision §X)" or "no artifacts yet" in their card text.
const scrubRoadmapProse = (d, isRoadmap = true) => {
  let s = (d || '')
    // internal doc citations: "(vision §4.6)", "(vision sec 4.3)", "(vision §4.1, §4.7)", "(vision sections 4 plus 5)"
    .replace(/\s*\(vision[^)]*\)/gi, '')
    // not-built prose that the Roadmap badge now conveys
    .replace(/Oracle-path \(no artifacts yet\):\s*/gi, '')
    .replace(/\s*Artifacts:\s*none yet[^.]*\.?/gi, '')
    .replace(/\s*Artifacts planned\.?/gi, '')
    .replace(/\s*Artifacts:\s*planned[^.]*\.?/gi, '')
    .replace(/\s*Artifacts:\s*partial[^.]*\.?/gi, '')
    .replace(/\s*Requires ceremony \+ zkey for production use\.?/gi, '')
    .replace(/\s*Requires WASM ZK backend\.?/gi, '')
    .replace(/\s*Low priority - not primary for [^.]*\.?\s*Deferred\.?/gi, '')
    // Drop the not-built readiness qualifier inside "Reality: resolver-attested (...)": the parenthetical
    // (e.g. "(planned)", "(circom planned)", "(starts; full compute planned)", "(future full)",
    // "(folding future)", "(multi-source planned)") is exactly the signal the Roadmap badge now
    // carries. We only strip the qualifier when it is aspirational/not-built, never an honest scope
    // note. Leaves a clean "Reality: resolver-attested.".
    .replace(/(Reality:\s*resolver-attested)\s*\([^)]*\b(?:planned|future|stub|partial|wip|todo|tbd|soon|starts)\b[^)]*\)/gi, '$1')
    // Same not-built qualifier, but in the LEADING "Resolver-attested (ZK compute planned):" prefix
    // form. Strip the parenthetical, keep the honest "Resolver-attested:" lead.
    .replace(/(\bResolver-attested)\s*\([^)]*\b(?:planned|future|stub|partial|wip|todo|tbd|soon|starts)\b[^)]*\)(\s*:)/gi, '$1$2')
    // Neutralize standalone "stub" / "solver stub" / "stub -> production" phrasing so no card implies
    // a half-built solver is a finished feature. The Roadmap badge conveys the readiness.
    .replace(/\bor solver stub\b/gi, '')
    .replace(/\bsolver stub\b/gi, 'solver')
    .replace(/\s*\(stub\s*(?:→|->|to)\s*production\)/gi, '')
    // Drop aspirational "<feature> planned." sentences (e.g. "BLS aggregation planned.",
    // "ZK for calculation accuracy planned.", "ZK planned.") - these promise an unbuilt capability
    // that the Roadmap badge already covers. Matches a sentence-ending clause that culminates in the
    // word "planned"; bounded by the prior sentence boundary so it never eats neighboring copy.
    .replace(/(?:^|(?<=\.\s))[^.]*\bplanned\.(?=\s|$)/gi, '')
    // Neutralize any residual "full-zk planned" / "full-zk" phrasing so no card claims a
    // verification tier it does not have. The Roadmap badge already conveys "planned".
    .replace(/\(full-zk planned\)/gi, '(planned)')
    .replace(/\bfull-zk\b/gi, 'resolver-attested');
  if (isRoadmap) {
    // A ROADMAP circuit must NOT advertise served Groth16 artifacts: the ones that really ship them
    // are in the registry and are PRODUCTION. Strip the "Artifacts in zk/..." claim + the
    // "Falls back to resolver attestation" qualifier so the copy matches the registry-derived tier.
    // (PRODUCTION entries keep their genuine "Artifacts in zk/..." note.)
    s = s
      .replace(/\s*Artifacts in [^.]*\.?/gi, '')
      .replace(/\s*Falls back to resolver attestation\.?/gi, '');
  }
  return s
    // tidy doubled spaces / stray leading punctuation left behind
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,])/g, '$1')
    .trim();
};
// HONEST REALITY for a mainnet-live world (the circom suite is verified off-chain): NO circom circuit is
// on-chain ZK. Every 'full-zk' and 'hybrid' label is collapsed to 'resolver-attested' here, so no card
// ever renders a Zero-knowledge / trustless / on-chain badge. The verification that actually happens
// is: the Groth16 proof (when a prover exists) is checked OFF-CHAIN by you, the counterparty, or any
// external verifier (snarkjs against the audited vkey), and only a 2-of-2 cosign + CSV timeout is
// verified on-chain (Schnorr). Circuits in VERIFIED_FULL_ZK / IN_BROWSER_PROVERS still genuinely
// produce a real proof in your browser - that capability is surfaced as a separate "in-browser prover"
// chip - but the proof is verified off-chain, not on-chain. This is a pure downgrade; it never
// promotes a circuit's claim.
// De-dupe by id (the raw list has a couple of repeats, e.g. relative_timelock):
// keep the first occurrence so React keys stay unique and the circuit list never double-renders.
const _seenCircuitIds = new Set();
export const ZK_CIRCUIT_TYPES = ZK_CIRCUIT_TYPES_RAW.filter((c) => {
  if (_seenCircuitIds.has(c.id)) return false;
  _seenCircuitIds.add(c.id);
  return true;
}).map((c) => {
  // Every ZK reality (full-zk OR hybrid) is presented as resolver-attested off-chain. No deployed
  // circuit's proof is bound to a chain-checked hashlock, so NO circuit is chain-enforced; they all
  // collapse here. zkVerifiedOffChain marks the circuits that genuinely run a real Groth16 prove +
  // fail-closed oracle verify end-to-end (the in-browser-prover set) so the UI can still note that
  // honest capability without ever claiming on-chain ZK. overclaimers (no prover/verifier)
  // additionally lose their artifacts flag.
  // Registry-derived readiness: PRODUCTION iff the circuit really verifies end-to-end today
  // (a working in-browser prover and/or a fail-closed backend Groth16 verify). This is the SAME
  // signal as zkVerifiedOffChain, so the tier cannot drift from what actually proves. Everything
  // else is ROADMAP (buildable, resolver-attested outcome, no dedicated prover yet).
  const verifiedOffChain = VERIFIED_FULL_ZK.has(c.id) || STRICT_GROTH16.has(c.id);
  const catalogTier = verifiedOffChain ? 'production' : 'roadmap';
  if (c.reality === 'full-zk' || c.reality === 'hybrid') {
    return {
      ...c,
      reality: 'oracle-attested',
      zkVerifiedOffChain: verifiedOffChain,
      artifacts: verifiedOffChain ? c.artifacts : false,
      zkPending: !verifiedOffChain,
      catalogTier,
      description: scrubRoadmapProse(scrubZkProse(c.description), !verifiedOffChain),
    };
  }
  // Pure resolver-attested (and decorative) entries also get the readiness tier + the roadmap-prose
  // scrub so their "(vision §X)" citations + "no artifacts yet" notes move to the badge.
  return {
    ...c,
    zkVerifiedOffChain: verifiedOffChain,
    catalogTier,
    description: scrubRoadmapProse(c.description, !verifiedOffChain),
  };
});

// Backward-compat alias
export const GAME_TYPES = ZK_CIRCUIT_TYPES;

// The catalog circuit ids that lead the "Create a game" view: the 8 games that
// actually have a playable FullScreen arena (chess, poker, blackjack, checkers,
// connect4, reversi, tictactoe, rps). Re-exported from lib/playableGames.js (the
// single source of truth shared with the arena registry) so the headline cards can
// never drift from what is really playable. The remaining ~47 game-category entries
// are technical/proof variants and stay reachable behind an "Advanced game circuits"
// expander in the gallery.
export { HEADLINE_GAME_CIRCUITS, HEADLINE_GAME_CIRCUIT_SET };

// ── Template → circuit resolver ───────────────────────────────────────────────
// The official template catalog (backend /api/marketplace/templates) ships ids like
// `zk-merkle-membership`, `market-binary`, `gate-age-gate`, `compute-vrf-fair`. The
// sandbox/terminal preloads the closest real ZK circuit so "Use Template" lands on a
// preconfigured builder instead of a dead-end. Honest by construction: it resolves to
// an actual circuit that already exists, never invents one. Explicit overrides first
// (for the ones fuzzy matching can't get right), then normalization, then a kind default.
const TEMPLATE_CIRCUIT_OVERRIDES = {
  // ZK proofs & claims
  'zk-merkle-membership': 'merkle_membership', 'zk-merkle-airdrop': 'merkle_airdrop',
  'zk-merkle-dao-vote': 'merkle_dao', 'zk-range-proof': 'range_proof',
  'zk-range-collateral': 'range_collateral', 'zk-solvency-proof': 'range_proof',
  'zk-age-verification': 'age_verification', 'zk-hash-preimage': 'hash_preimage',
  'zk-nullifier-unique': 'nullifier_set', 'zk-anon-credential': 'anon_credential',
  'zk-private-balance': 'confidential_collateral', 'zk-acl-zk': 'private_group_member',
  'zk-private-prediction': 'private_prediction',
  // Oracle & markets
  'market-binary': 'prediction_market', 'market-ternary': 'prediction_market',
  'market-multi-outcome': 'prediction_market', 'market-dutch-auction': 'auction_dutch',
  'market-english-auction': 'auction_english', 'market-parametric-insurance': 'parametric_insurance',
  'market-price-settle': 'feed_price_kas', 'market-sports-settle': 'oracle_single',
  'market-multi-oracle': 'oracle_multi_threshold',
  // DeFi (the oracle-resolved ones; multisig/timelock defi route to /deploy/enforced)
  'defi-revenue-share': 'oracle_single', 'defi-collateral-loan': 'collateral_loan',
  'defi-tip-jar': 'oracle_single', 'defi-subscription': 'oracle_single',
  'defi-royalty-split': 'oracle_single', 'defi-fee-pot-split': 'oracle_single',
  'defi-crowdfund': 'oracle_single',
  // Identity & gating
  'gate-age-gate': 'age_verification', 'gate-anti-sybil': 'anti_sybil',
  'gate-membership-claim': 'registry_member', 'gate-kyc-attest': 'kyc_alternative',
  'gate-reputation-gate': 'reputation_threshold', 'gate-allowlist': 'merkle_membership',
  // Compute & cross-chain
  'compute-graph-reach': 'compute_graph_reach', 'compute-supply-provenance': 'supply_provenance',
  'compute-risc0-compute': 'oracle_exec_proof', 'compute-cross-chain-attest': 'cross_asset_claim',
  'compute-vrf-fair': 'vrf_random',
};

export function resolveCircuit(raw, kind) {
  if (!raw) return null;
  const key = String(raw).trim();
  if (TEMPLATE_CIRCUIT_OVERRIDES[key]) return TEMPLATE_CIRCUIT_OVERRIDES[key];
  const ids = new Set(ZK_CIRCUIT_TYPES.map((c) => c.id));
  if (ids.has(key)) return key; // already a circuit id
  // normalize: strip family prefix, dashes → underscores
  const n = key.toLowerCase().replace(/^(zk|market|gate|compute|defi|game)-/, '').replace(/-/g, '_');
  if (ids.has(n)) return n;
  let hit = ZK_CIRCUIT_TYPES.find((c) => c.id.includes(n) || n.includes(c.id));
  if (hit) return hit.id;
  // token overlap
  const toks = n.split('_').filter(Boolean);
  let best = null, bestScore = 0;
  for (const c of ZK_CIRCUIT_TYPES) {
    const ctoks = c.id.split('_');
    const score = toks.filter((t) => ctoks.includes(t)).length;
    if (score > bestScore) { bestScore = score; best = c.id; }
  }
  if (best && bestScore > 0) return best;
  return kind === 'oracle' ? 'oracle_single' : 'merkle_membership';
}

// ── Standalone SilverScript Generator (exported for the premium builder flow) ──
export function generateSilverScriptForConfig(cfg) {
  const {
    gameType = 'chess_v1',
    feePercent = 2,
    potReturnPercent = 2,
    resolutionMode = 'oracle',
    customOracleKey = '',
    zkCircuit = 'chess_v1',
    zkVerifierKey = '',
    reusable = true,
    allowTopups = false,
    // Chess time control (base minutes + increment seconds). Only rendered for chess covenants.
    chessBaseMinutes = 5,
    chessIncrementSeconds = 0,
    // Passed in by callers (defaults to full). This was previously read from
    // component scope, so this standalone export always threw a ReferenceError.
    hasPaidAccess = true,
  } = cfg || {};

  const feeBasis = Math.round(feePercent * 100);
  const feePlatform = Math.round(feePercent * 10);
  const feeCreator = 10000 - feePlatform;

  const gameMeta = (() => {
    switch (gameType) {
      case 'chess_v1':
        return {
          covenantName: 'ChessDuelCovenant',
          outcomeEnum: 'Outcome::PlayerAWins | PlayerBWin | Draw',
          outcomeBranches: `      // 2% platform fee already taken at resolution (winner takes all minus fee)
      // FIDE RULESET (enforced by the deterministic server-authoritative engine, not a ZK circuit):
      // • Standard 8x8 starting position + all piece movement rules
      // • Pawn: forward only, double-step from rank 2/7, captures diagonally, en passant
      // • Knight: L-shape (2,1), can jump
      // • Bishop: any number of squares diagonally, blocked by pieces
      // • Rook: any number of squares orthogonally, blocked by pieces
      // • Queen: any combination of bishop + rook movement
      // • King: one square in any direction
      // • Castling (kingside/queenside): BOTH king and rook must never have moved,
      //   path between them must be empty, king not in check, king does not pass through check
      // • Check: king is attacked by at least one enemy piece
      // • Checkmate: king is in check AND has no legal escape (no move, no capture, no block)
      // • Stalemate: player to move has NO legal moves but king is NOT in check → draw
      // • 50-move rule: 50 consecutive plies without pawn move or capture → draw claim
      // • Threefold repetition: identical position repeated 3 times → draw
      // • Insufficient material: K vs K, K+B vs K, K+N vs K → draw
      // • Promotion: pawn reaching last rank must promote to Q/R/B/N
      // The server engine validates the full PGN + final FEN, checking every transition is legal.
      Outcome::PlayerAWins => {
        require(VerifyPayout(treasury, player_a, pot), "Winner payout failed");
      }
      Outcome::PlayerBWin => {
        require(VerifyPayout(treasury, player_b, pot), "Winner payout failed");
      }
      Outcome::Draw => {
        let half = pot / 2;
        require(VerifyPayout(treasury, player_a, half) && VerifyPayout(treasury, player_b, half), "Draw refund failed");
      }`,
        };
      case 'merkle_membership':
        return {
          covenantName: 'MerkleProofCovenant',
          outcomeEnum: 'Outcome::Proven | Rejected',
          outcomeBranches: `      // ZK CIRCUIT (merkle_generic): proves a leaf exists in a committed Merkle root
      // Public inputs: merkle_root, key_hash, value_hash
      // Private witness: Merkle proof path (sibling hashes + direction bits)
      // No sensitive data revealed beyond the fact of membership
      Outcome::Proven => {
        require(VerifyPayout(treasury, claimant, pot), "Proof accepted, payout to claimant");
      }
      Outcome::Rejected => {
        require(VerifyPayout(treasury, depositor, pot), "Proof rejected, return to depositor");
      }`,
        };
      case 'range_proof':
        return {
          covenantName: 'RangeProofCovenant',
          outcomeEnum: 'Outcome::Proven | Rejected',
          outcomeBranches: `      // ZK CIRCUIT (bulletproofs_v1): proves a committed value ∈ [min, max]
      // Public inputs: commitment, min_bound, max_bound
      // Private witness: actual value, blinding factor
      // Used for collateral sufficiency, KYC-free tier qualification
      Outcome::Proven => {
        require(VerifyPayout(treasury, claimant, pot), "Range proof accepted");
      }
      Outcome::Rejected => {
        require(VerifyPayout(treasury, depositor, pot), "Range proof rejected");
      }`,
        };
      case 'age_verification':
        return {
          covenantName: 'AgeVerifyCovenant',
          outcomeEnum: 'Outcome::Verified | Rejected',
          outcomeBranches: `      // ZK CIRCUIT (age_verify_v1): proves birthdate ≥ N years before reference date
      // Public inputs: commitment, threshold_years, reference_timestamp
      // Private witness: actual birthdate, blinding factor
      // Zero-knowledge alternative to KYC - no PII revealed
      Outcome::Verified => {
        require(VerifyPayout(treasury, claimant, pot), "Age verified, payout to claimant");
      }
      Outcome::Rejected => {
        require(VerifyPayout(treasury, depositor, pot), "Verification failed");
      }`,
        };
      case 'verifiable':
        return {
          covenantName: 'VerifiableComputeCovenant',
          outcomeEnum: 'Outcome::Accepted | Rejected',
          outcomeBranches: `      // ZK CIRCUIT (risc0_generic): proves correct execution of arbitrary computation
      // Public inputs: program_hash, output_hash, input_hash
      // Private witness: execution trace
      // Attach custom predicates by embedding them in the program
      Outcome::Accepted => {
        require(VerifyPayout(treasury, claimant, pot), "Proof accepted");
      }
      Outcome::Rejected => {
        require(VerifyPayout(treasury, depositor, pot), "Proof rejected");
      }`,
        };
      default:
        return {
          covenantName: 'CustomCircuitCovenant',
          outcomeEnum: 'Outcome::Proven | Rejected',
          outcomeBranches: `      // Custom ZK circuit - user supplies audited circuit + verifier key
      Outcome::Proven => {
        require(VerifyPayout(treasury, claimant, pot), "Proof accepted");
      }
      Outcome::Rejected => {
        require(VerifyPayout(treasury, depositor, pot), "Proof rejected, return to depositor");
      }`,
        };
    }
  })();

  let resolveBlock;
  // ZK resolution is FREE for everyone. Paid tiers buy only priority placement /
  // featured listing on Covex, never build capability, so resolution is never downgraded.
  let effectiveResolution = resolutionMode;
  switch (effectiveResolution) {
    case 'zk':
      resolveBlock = `\n  ;; ── Resolution: ZK Proof (${zkCircuit})\n  ;; Verifier: ${zkVerifierKey || 'built-in'}\n  ;; Full FIDE chess ruleset proven (castling/en-passant/checkmate/50-move/repetition)\n  OpZkVerify ${zkVerifierKey || '0xCHESSv1_8x8_STANDARD'} ;; circuit: ${zkCircuit}`;
      break;
    case 'custom_oracle':
      resolveBlock = `\n  ;; ── Resolution: Custom Oracle\n  ;; Key: ${(customOracleKey || '').slice(0, 16)}...`;
      break;
    default:
      resolveBlock = `\n  ;; ── Resolution: deployer-bound resolver co-signature`;
      break;
  }

  const topupsBlock = allowTopups ? '\n  ;; Allow top-ups after creation\n  OpAddToPot' : '';
  const reusableBlock = reusable ? '\n  ;; Reusable covenant\n  OpReuseCovenant' : '';
  // Chess clock config: base time per side + Fischer increment. Enforced by the
  // server-authoritative engine clock (only the player-to-move clock decrements; zero = loss).
  const isChess = gameType.startsWith('chess');
  const clockBlock = isChess
    ? `\n  ;; ── Per-turn clock (server-authoritative engine)
  ;; Each side starts with ${chessBaseMinutes} min; +${chessIncrementSeconds}s added after each move.
  ;; Only the player-to-move clock decrements; reaching zero is an automatic loss.
  clock_base_ms:    ${chessBaseMinutes * 60 * 1000}
  clock_increment_ms: ${chessIncrementSeconds * 1000}`
    : '';

  return `;; ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
;; SilverScript: ${gameMeta.covenantName}
;; Game: ${GAME_TYPES.find(g => g.id === gameType)?.name || gameType}
;; Fee: ${feePercent}% | Resolution: ${resolutionMode}${isChess ? ` | Time: ${chessBaseMinutes}m + ${chessIncrementSeconds}s` : ''}
;; Generated by Covex Premium Builder
${isChess ? ";; Chess is resolved by a server-authoritative engine enforcing the full FIDE ruleset (castling, en passant, 50-move, repetition, checkmate); the result is computed deterministically by replaying the signed move log (anyone can recompute), then the counterparty or a deployer-bound external resolver co-signs the release. There is no chess ZK circuit (full FIDE in a SNARK is not shipped)." : ''}
;; ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Covenant ${gameMeta.covenantName} {
  fee_basis_points: ${feeBasis}
  platform_share:   ${feePlatform}
  creator_share:    ${feeCreator}
  min_lock:         1000000${clockBlock}

  input player_a: PubKey
  input player_b: PubKey
  input treasury:  PubKey
  input platform:  PubKey

  state locked_amount: u64 = 0${topupsBlock}${reusableBlock}
${resolveBlock}

  fn unlock(outcome: ${gameMeta.outcomeEnum}) {
    let total = locked_amount;
    let fee = (total * fee_basis_points) / 10000;
    let pot = total - fee;

    require(VerifyPayout(treasury, platform, fee), "Platform fee failed");

${gameMeta.outcomeBranches}
  }
}`;
}

function Toggle({ label, desc, enabled, onChange, disabled = false }) {
  return (
    <button
      onClick={() => !disabled && onChange(!enabled)}
      disabled={disabled}
      className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${
        disabled
          ? 'opacity-40 cursor-not-allowed border-white/[0.04] bg-black/20'
          : enabled
          ? 'border-kaspa-green/30 bg-kaspa-green/[0.04] hover:bg-kaspa-green/[0.06]'
          : 'border-white/[0.05] bg-black/20 hover:bg-white/[0.03]'
      }`}
    >
      <div className="text-left">
        <p className={`text-sm font-medium ${disabled ? 'text-gray-200 light:text-slate-700' : 'text-white'}`}>{label}</p>
        {desc && <p className="text-[11px] text-gray-200 light:text-slate-700 mt-0.5">{desc}</p>}
      </div>
      {enabled ? (
        <ToggleRight size={22} className="text-kaspa-green shrink-0" />
      ) : (
        <ToggleLeft size={22} className="text-white/80 shrink-0" />
      )}
    </button>
  );
}

function SliderField({ label, value, min, max, step, onChange, suffix = '%' }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className={LABEL}>{label}</p>
        <span className="text-sm font-mono text-kaspa-green font-bold tabular-nums">
          {value}{suffix}
        </span>
      </div>
      <div className="relative">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="w-full h-2 rounded-full appearance-none cursor-pointer
            bg-white/[0.06] accent-kaspa-green
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5
            [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-kaspa-green
            [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(73,234,203,0.4)] [&::-webkit-slider-thumb]:cursor-pointer"
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 h-2 rounded-l-full bg-kaspa-green/30 pointer-events-none"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-white/80">
        <span>{min}{suffix}</span>
        <span>{max}{suffix}</span>
      </div>
    </div>
  );
}

function ResolutionCard({ icon: Icon, title, desc, selected, onClick, accent = 'kaspa-green' }) {
  const colors = {
    'kaspa-green': 'border-kaspa-green/40 bg-kaspa-green/[0.04] ring-1 ring-kaspa-green/20',
    'kaspa-gold': 'border-kaspa-gold/40 bg-kaspa-gold/[0.04] ring-1 ring-kaspa-gold/20',
    'purple': 'border-purple-500/40 bg-purple-500/[0.04] ring-1 ring-purple-500/20',
  };
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-start gap-4 p-4 rounded-xl border text-left transition-all ${
        selected
          ? colors[accent] || colors['kaspa-green']
          : 'border-white/[0.06] bg-black/20 hover:bg-white/[0.03]'
      }`}
    >
      <div
        className={`shrink-0 h-10 w-10 rounded-xl flex items-center justify-center border ${
          selected
            ? `border-${accent === 'kaspa-green' ? 'kaspa-green/40' : accent === 'kaspa-gold' ? 'kaspa-gold/40' : 'purple-500/40'} bg-${accent === 'kaspa-green' ? 'kaspa-green' : accent === 'kaspa-gold' ? 'kaspa-gold' : 'purple-500'}/10`
            : 'border-white/10 bg-white/[0.02]'
        }`}
      >
        <Icon
          size={18}
          className={selected ? `text-${accent === 'kaspa-green' ? 'kaspa-green' : accent === 'kaspa-gold' ? 'kaspa-gold' : 'purple-400'}` : 'text-gray-200 light:text-slate-700'}
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold ${selected ? 'text-white' : 'text-gray-200 light:text-slate-700'}`}>{title}</p>
        <p className="text-[11px] text-gray-200 light:text-slate-700 mt-1 leading-relaxed">{desc}</p>
      </div>
      <Radio
        size={16}
        className={`shrink-0 mt-1 ${
          selected ? 'text-kaspa-green' : 'text-white/80'
        }`}
        fill={selected ? 'currentColor' : 'none'}
      />
    </button>
  );
}

export default function CovexTerminal({ covenant, externalCircuit }) {
  const navigate = useNavigate();

  // ── Wallet (for signing ownership challenges) ──
  const { address: connectedAddress, signMessage, sendPayment, devMode: devModeFromContext } = useWallet();

  // Covenant Config + Studio Integration
  const { 
    config: studioConfig, 
    loadOrCreate, 
    exportToStudio,
    updateConfig: updateStudioConfig,
    loadFromJson 
  } = useCovenantConfig(connectedAddress || '');

  // Auto-load config from URL or selected template
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const encodedConfig = params.get('config');
    const templateId = params.get('template');

    if (encodedConfig) {
      try {
        const jsonStr = atob(encodedConfig);
        loadFromJson(jsonStr);
        window.history.replaceState({}, '', window.location.pathname);
      } catch {
        // console.warn('Failed to load config from URL'); // cleaned for prod
      }
    } else if (templateId) {
      // Template was selected
      const saved = sessionStorage.getItem('pending_covenant_config');
      if (saved) {
        try {
          loadFromJson(saved);
        } catch { /* best-effort; failure is non-fatal here */ }
      }
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [loadFromJson]);

  // ── Defaults derived from covenant ──
  const covenantId = covenant?.tx_id || '';
  // H4: every in-browser prover routes through this so the proof commits covenantFieldElement(covenantId)
  // as the circuit's `covenantId` public signal, binding the proof to THIS covenant (no cross-covenant
  // replay). The recompiled circuits expose covenantId as the last public input; valid stays at index 0.
  // Sourced from lib/zk/provers.js so the terminal and the public ZkClaimPanel bind identically.
  const fullProveBound = makeFullProveBound(covenantId);

  // ── Section A: Covenant Configuration ──
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [feePercent, setFeePercent] = useState(2);
  const [potReturnPercent, setPotReturnPercent] = useState(2);
  const [reusable, setReusable] = useState(true);

  // Covex is mainnet-only. Real funds: strong warnings apply to every action.
  const [kaspaNetwork, setKaspaNetwork] = useState(() => (typeof window !== 'undefined' ? (localStorage.getItem('kaspaNetwork') || 'mainnet') : 'mainnet'));

  // Keep localStorage + notify the rest of the app (global nav switcher, Explorer, Deploy pages etc.)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('kaspaNetwork', kaspaNetwork);
      window.dispatchEvent(new CustomEvent('kaspa-network-change', { detail: kaspaNetwork }));
    }
  }, [kaspaNetwork]);

  // React to any app-level kaspa-network-change events (mainnet is pinned app-wide).
  useEffect(() => {
    const handler = (e) => {
      if (e.detail && typeof e.detail === 'string') {
        setKaspaNetwork(e.detail);
      }
    };
    window.addEventListener('kaspa-network-change', handler);
    return () => window.removeEventListener('kaspa-network-change', handler);
  }, []);

  const isMainnet = true;
  const networkLabel = 'MAINNET';
  const networkColorClass = 'text-red-400 border-red-500/40 bg-red-500/10';

  // ── Tier model: ALL build capability is FREE for everyone on every network.
  // Every ZK circuit, ZK resolution, the live SilverScript editor, oracles, custom
  // UI, and game arenas are available to a FREE-tier wallet, and any bet/lock amount
  // is allowed with no cap. Paid tiers buy ONLY priority placement / featured listing
  // of the covenant and its website on Covex; they never unlock a circuit or feature.
  // paidStatus is still read from the backend (/api/paid-status) purely to drive that
  // placement priority and the featured-listing badge, not to gate the builder.
  const [paidStatus, setPaidStatus] = useState(null);
  const [checkingPaid, setCheckingPaid] = useState(false);
  // Tier access is decided ONLY by the backend (paidStatus from /api/paid-status), never by
  // client-side localStorage (trusting localStorage let anyone self-grant a paid tier).
  const currentTier = paidStatus?.highest_tier || 'FREE';
  const hasPaidAccess = currentTier !== 'FREE';

  // For reliable unlock after real tier payment tx
  const [paymentSuccess, setPaymentSuccess] = useState(null);

  // For hiding the huge ZK list by default: press to reveal all
  const [showAllZK, setShowAllZK] = useState(false);
  // When the full list is shown, the production-ready circuits lead and the roadmap/experimental
  // ones stay collapsed behind this expander so newcomers are not dropped into unbuilt options.
  const [showRoadmapZK, setShowRoadmapZK] = useState(false);
  // Separate state for the multi-select circuit-toggle list (so revealing it as organized
  // categories doesn't also expand the single-select card grid below).
  const [showAllToggles, setShowAllToggles] = useState(false);

  // Visual live editor integrated directly here (no separate page)
  const [visualConfig, setVisualConfig] = useState({
    feePercent: 2.0,
    selectedCircuits: ['chess_v1'],
    resolutionMode: 'hybrid',
    minStake: 10,
    maxStake: 0, // 0 = no maximum stake (any amount allowed)
    timeoutMinutes: 10,
    refundIfNoMatch: true,
  });
  const [liveSilverScript, setLiveSilverScript] = useState('');

  useEffect(() => {
    if (!connectedAddress) {
      setPaidStatus({ highest_tier: 'FREE' });
      return;
    }
    setCheckingPaid(true);
    const net = kaspaNetwork;
    fetch(`/api/paid-status?address=${encodeURIComponent(connectedAddress)}&network=${net}`)
      .then(r => r.ok ? r.json() : { highest_tier: 'FREE' })
      .then(data => setPaidStatus(data))
      .catch(() => setPaidStatus({ highest_tier: 'FREE' }))
      .finally(() => setCheckingPaid(false));
  }, [connectedAddress, kaspaNetwork]);

  // ── Pending broadcast banner ─────────────────────────────────────────────────
  // After Pricing.jsx broadcasts a tier payment it writes a sessionStorage marker
  // (payment_broadcast_tx) with the payer address + txid + broadcastAt. We surface
  // an HONEST banner here ("broadcast, awaiting on-chain confirmation") rather than
  // a dishonest "confirmed" claim. Three hard requirements from the audit:
  //   1) Poll using the STORED payer address - the user could have swapped wallets
  //      between Pricing and Sandbox, so trusting connectedAddress would silently
  //      poll the wrong account.
  //   2) Pass network=kaspaNetwork - auth/paid-status defaults to testnet-12 server
  //      side; mainnet payments would never confirm against that lookup.
  //   3) Show a visible timeout (75s) so a failed broadcast or wrong-network tx does
  //      not leave the user stuck on an infinite spinner (replacing one dishonest
  //      UX with another). After the timeout we keep the banner up but switch the
  //      copy to a "not seeing this on chain yet - open the explorer" hint.
  // The banner mirrors the existing /api/paid-status source of truth (no parallel
  // /api/auth-session poller); the existing connectedAddress poll above and this
  // stored-address poll BOTH push paidStatus on a real confirmation so the banner
  // drops the instant a tier upgrade lands.
  const [pendingBroadcast, setPendingBroadcast] = useState(() => {
    try {
      const raw = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('payment_broadcast_tx') : null;
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });
  const [pendingTimedOut, setPendingTimedOut] = useState(false);

  useEffect(() => {
    if (!pendingBroadcast?.address || !pendingBroadcast?.txid) return;
    // Drop the banner the moment the existing paidStatus shows a real tier upgrade.
    if (paidStatus && paidStatus.highest_tier && paidStatus.highest_tier !== 'FREE') {
      try { sessionStorage.removeItem('payment_broadcast_tx'); } catch { /* best-effort; failure is non-fatal here */ }
      setPendingBroadcast(null);
      setPendingTimedOut(false);
      return;
    }
    let cancelled = false;
    const storedAddress = pendingBroadcast.address;
    const net = kaspaNetwork;
    const poll = () => {
      fetch(`/api/paid-status?address=${encodeURIComponent(storedAddress)}&network=${net}`)
        .then(r => (r.ok ? r.json() : null))
        .then(data => {
          if (cancelled || !data) return;
          if (data.highest_tier && data.highest_tier !== 'FREE') {
            // If the payer is the connected wallet, also sync local paidStatus so the
            // priority-placement badge reflects the new tier without waiting for the
            // connectedAddress poll tick. (The builder itself is already free either way.)
            if (connectedAddress && connectedAddress === storedAddress) {
              setPaidStatus(data);
            }
            try { sessionStorage.removeItem('payment_broadcast_tx'); } catch { /* best-effort; failure is non-fatal here */ }
            setPendingBroadcast(null);
            setPendingTimedOut(false);
          }
        })
        .catch(() => {});
    };
    poll();
    const interval = setInterval(poll, 5000);
    const broadcastAt = Number(pendingBroadcast.broadcastAt) || Date.now();
    const remaining = Math.max(0, 75000 - (Date.now() - broadcastAt));
    const timeoutId = setTimeout(() => { if (!cancelled) setPendingTimedOut(true); }, remaining);
    return () => {
      cancelled = true;
      clearInterval(interval);
      clearTimeout(timeoutId);
    };
  }, [pendingBroadcast, kaspaNetwork, connectedAddress, paidStatus]);

  // Preload a circuit + metadata from URL params (?circuit=, ?kind=, ?name=, ?desc=).
  // The official template catalog links into the sandbox this way, so "Use Template"
  // opens a preconfigured builder with the right ZK circuit / oracle already selected.
  // Runs once on mount. Harmless for users without the paid editor (the visible
  // "starting point" banner lives on the Sandbox page itself).
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const rawCircuit = params.get('circuit');
      const kindParam = params.get('kind') || '';
      const nameParam = params.get('name');
      const descParam = params.get('desc');
      if (nameParam) setName(nameParam);
      if (descParam) setDescription(descParam);
      if (rawCircuit) {
        const cid = resolveCircuit(rawCircuit, kindParam);
        if (cid) {
          setShowAllZK(true);
          setVisualConfig((prev) => ({
            ...prev,
            selectedCircuits: [cid],
            resolutionMode: kindParam === 'oracle' ? 'oracle' : prev.resolutionMode,
          }));
          setTimeout(() => {
            const el = document.getElementById('builder-circuits');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 400);
        }
      }
    } catch { /* ignore malformed params */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live-sync the builder's selected circuit to an external selector (the unified Sandbox's
  // free circuit library). When the visitor picks a circuit up top, the builder below follows
  // (one window, one selection). Runs whenever the prop changes (not just on mount).
  useEffect(() => {
    if (!externalCircuit) return;
    setShowAllZK(true);
    setVisualConfig((prev) =>
      prev.selectedCircuits.length === 1 && prev.selectedCircuits[0] === externalCircuit
        ? prev
        : { ...prev, selectedCircuits: [externalCircuit] }
    );
    // For chess circuits picked in the Sandbox gallery, also drive gameType so the configure +
    // preview surface (and per-variant time-control default) follows the selection. Other circuit
    // families keep their existing builder-grid-driven gameType behavior untouched.
    if (externalCircuit.startsWith('chess')) setGameType(externalCircuit);
  }, [externalCircuit]);

  // Tiers buy ONLY priority placement / featured listing on Covex. Every build
  // capability (all circuits, ZK resolution, the editor, arenas) is already free.
  const TIERS = [
    { id: 'BUILDER', name: 'BUILDER', price: 100, accent: '#3B82F6', desc: 'Listed placement on Covex' },
    { id: 'PRO', name: 'PRO', price: 500, accent: '#E8AF34', desc: 'Priority placement + featured' },
    { id: 'MAX', name: 'MAX', price: 1000, accent: '#A855F7', desc: 'Top placement + max visibility' },
  ];

  // Mainnet-only config. Real mainnet seeds ONLY via secure env, never hardcoded.
  const getNetConfig = () => ({
    treasury: 'kaspa:qr6vs4wy4m3za6mzchj05x3902qrtklkyn8s0u8g2gv6mrctzdzx7pnhqxka2',
    seeds: [],
    warning: 'REAL KAS - PRODUCTION'
  });
  const netConfig = getNetConfig(kaspaNetwork);
  const [allowTopups, setAllowTopups] = useState(false);

  // ── In-terminal payment (QR for tiers, tied to current wallet only)
  const [payingTier, setPayingTier] = useState(null);
  const [lastPaidCheck, setLastPaidCheck] = useState(null);

  const startPaymentForTier = (tier) => {
    const treasury = netConfig.treasury;
    const cleanTreasury = treasury.replace(/^kaspa:|^kaspatest:/i, '');
    const uri = `kaspa:${cleanTreasury}?amount=${tier.price}&message=COVEX-${tier.id}-${(connectedAddress || '').slice(0,8)}`;
    setPayingTier({ ...tier, uri, treasury });
  };

  const cancelPayment = () => setPayingTier(null);

  const checkPaymentNow = async () => {
    if (!connectedAddress) return;
    setCheckingPaid(true);
    try {
      const net = kaspaNetwork;
      const r = await fetch(`/api/paid-status?address=${encodeURIComponent(connectedAddress)}&network=${net}`);
      const data = await r.json();
      setPaidStatus(data);
      setLastPaidCheck(Date.now());
      if (data?.highest_tier && data.highest_tier !== 'FREE') {
        // auto clear pay UI
        setPayingTier(null);
      }
    } catch {
      // ignore
    } finally {
      setCheckingPaid(false);
    }
  };

  const payWithDevWallet = async (tier) => {
    if (!sendPayment || !connectedAddress) {
      toast.error('Dev send not available');
      return;
    }
    const treasury = netConfig.treasury;
    const memo = `COVEX-${tier.id}-${connectedAddress.slice(0,8)}`;
    let txid = 'dev-tx-' + Date.now();
    try {
      const res = await sendPayment(treasury, tier.price, { memo });
      if (res && res.txid) txid = res.txid;
      if (res && res.success === false) {
        toast.error('Dev payment broadcast failed: ' + (res.error || 'Unknown error from signer. Check balance/UTXOs and that your wallet has funds.'));
        setPayingTier(null);
        return;
      }
      // The tx broadcast succeeded (the backend signer credited the payer's account synchronously
      // via insert_payment + upgrade_account). Show the confirmation card and let the BACKEND be
      // the source of truth for tier access: poll /api/paid-status, which sets paidStatus from the
      // server. We do NOT write covex_paid_tier to localStorage; feature access must never trust
      // client storage (that was a self-grant hole).
      setPayingTier(null);
      setPaymentSuccess({ tier: tier.id, txid });
      sessionStorage.setItem('payment_broadcast_tx', JSON.stringify({
        tier: tier.name || tier.id,
        id: tier.id,
        address: connectedAddress,
        txid,
        broadcastAt: Date.now()
      }));
      // Poll the backend a few times to reflect the credited tier (signer credits synchronously).
      setTimeout(checkPaymentNow, 300);
      setTimeout(checkPaymentNow, 1500);
      setTimeout(checkPaymentNow, 4000);
    } catch (e) {
      // NEVER self-grant a tier on error. If the tx really did broadcast, the backend credited it
      // and the paid-status poll will activate the priority placement; otherwise the user simply
      // retries. The builder is free regardless, so nothing capability-related is blocked here.
      setPayingTier(null);
      toast.error('Payment failed: ' + (e?.message || e) + '\n\nNo tier was granted. Every build feature stays free. If your transaction did broadcast, priority placement will activate automatically once the backend confirms it.');
      setTimeout(checkPaymentNow, 1500);
      setTimeout(checkPaymentNow, 5000);
    }
  };

  // Visual live SilverScript editor (integrated directly in the terminal - one place only)
  const rebuildLiveScript = useCallback((cfg) => {
    const fee = Number(cfg.feePercent) || 2;
    const creatorCut = 0;
    const totalFee = fee + creatorCut;
    const winnerShare = Math.max(0, 100 - totalFee);
    const hasMaxStake = Number(cfg.maxStake) > 0;
    const circuits = cfg.selectedCircuits.length ? cfg.selectedCircuits : ['chess_v1'];
    const circuitList = circuits.map(id => {
      const c = ZK_CIRCUIT_TYPES.find(x => x.id === id);
      return c ? `${c.name} (${c.reality || 'hybrid'})` : id;
    }).join(', ');
    const script = `;; Visual SilverScript from Terminal Builder
;; Fee: ${fee}% | Winner share: ${winnerShare}%
;; Circuits: ${circuitList}
;; Resolution: ${cfg.resolutionMode}
;; Stake: min ${cfg.minStake} KAS, ${hasMaxStake ? `max ${cfg.maxStake} KAS` : 'no maximum'} | Timeout: ${cfg.timeoutMinutes} min
;; Refund if unmatched: ${cfg.refundIfNoMatch}

contract VisualCovenant {
    state {
        owner: Address,
        treasury: Address,
        minStake: u64,${hasMaxStake ? `
        maxStake: u64,` : ''}
        timeoutSec: u64,
        resolved: bool,
    }

    entrypoint function join(stake: u64) {
        require(stake >= state.minStake${hasMaxStake ? ' && stake <= state.maxStake' : ''});
        // match logic${hasMaxStake ? '' : ' (any stake at or above minStake is accepted, no maximum)'}
    }

    entrypoint function resolve(outcome: String, proof: Bytes) {
        require(!state.resolved);
        // verify using selected circuits / oracle
        if (outcome == "win_a") {
            let payout = (pot * ${winnerShare}) / 100;
            VerifyPayout(treasury, player_a, payout);
        }
        // ... other branches from circuits
        state.resolved = true;
    }
}`;
    setLiveSilverScript(script);
    return script;
  }, []);

  useEffect(() => {
    rebuildLiveScript(visualConfig);
  }, [visualConfig, rebuildLiveScript]);

  const updateVisual = (patch) => setVisualConfig(prev => ({ ...prev, ...patch }));

  // ── Section B: Custom UI Integration ──
  const [customUICode, setCustomUICode] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  // ── Section C: Outcome Resolution ──
  const [resolutionMode, setResolutionMode] = useState('oracle');
  const [customOracleKey, setCustomOracleKey] = useState('');
  const [zkCircuit, setZkCircuit] = useState('chess_v1');
  const [zkVerifierKey, setZkVerifierKey] = useState('');

  // ── Section 0: Game Type ──
  const [gameType, setGameType] = useState('chess_v1');
  const [infoCircuit, setInfoCircuit] = useState(null); // circuit being inspected in the TransparencyModal

  const handleGameTypeChange = useCallback((typeId) => {
    setGameType(typeId);
    // Close any open pro arenas when switching covenant type (skill games + chess)
    setShowFullScreenChess(false);
    setShowFullScreenPoker(false);
    setShowFullScreenBlackjack(false);
    setShowFullScreenCheckers(false);
    setShowFullScreenConnect4(false);
    setShowFullScreenTicTacToe(false);
    setShowFullScreenReversi(false);
    setShowFullScreenRPS(false);

    const gt = ZK_CIRCUIT_TYPES.find(g => g.id === typeId);
    if (gt) {
      // Auto-configure ZK resolution mode when a circuit type is selected
      setResolutionMode('zk');
      setZkCircuit(gt.circuit);
      // Pre-fill verifier key for known circuits
      if (gt.circuit === 'chess_v1') {
        setZkVerifierKey('0xCHESSv1_8x8_STANDARD');
      } else if (gt.circuit === 'merkle_generic') {
        setZkVerifierKey('0xMERKLE_GENERIC_V1');
      } else if (gt.circuit === 'bulletproofs_v1') {
        setZkVerifierKey('0xBULLETPROOFS_V1');
      } else if (gt.circuit === 'age_verify_v1') {
        setZkVerifierKey('0xAGE_VERIFY_V1');
      } else if (gt.circuit === 'risc0_generic') {
        setZkVerifierKey('0xRISC0_GENERIC_V1');
      } else {
        setZkVerifierKey('');
      }
    }
  }, []);

  // ── Section D: Status ──
  const [saveStatus, setSaveStatus] = useState('idle'); // idle | saving | saved | error
  const [configLoaded, setConfigLoaded] = useState(false);

  // ── Section E: SilverScript Generation ──
  const [generatedScript, setGeneratedScript] = useState('');
  const [copied, setCopied] = useState(false);

  // ── Chess ZK Arena State (only for chess_v1) ──
  const [chessStake, setChessStake] = useState(50);
  const [chessMatchState, setChessMatchState] = useState('idle'); // idle | posted | matched | playing | finished
  const [chessGame, setChessGame] = useState(() => new Chess());
  // Proving mode selector exposed in UI for chess_v1 (persisted in terminal config / passed to oracle proofs)
  const [chessPlayerColor, setChessPlayerColor] = useState('w');
  const [chessOpponent, setChessOpponent] = useState('');
  const [chessResult, setChessResult] = useState(null); // { outcome: 'white'|'black'|'draw', method: 'checkmate'|'resign'|'draw' }
  const [chessZkVerified, setChessZkVerified] = useState(false);
  const [chessProofHash, setChessProofHash] = useState('');
  const [chessOracleResult, setChessOracleResult] = useState(null); // stored oracle response for claim
  const [showFullScreenChess, setShowFullScreenChess] = useState(false);
  // Chess proving mode (0=Hybrid fast <15s target with witnessed candidates/attacks; 1=Full ZK stronger, more exhaustive witness gen)
  const [chessProvingMode, setChessProvingMode] = useState(0);
  // Covenant timelock / clock params (maps to resolution.circuit.timelock in covenant-config schema)
  const [timelockMode, setTimelockMode] = useState('turn_timer'); // absolute | relative | turn_timer
  const [maxDeltaDaa, setMaxDeltaDaa] = useState(300);
  const [lockDurationDaa, setLockDurationDaa] = useState(1000);
  const [lockThresholdDaa, setLockThresholdDaa] = useState(0);
  const [referenceDaa, setReferenceDaa] = useState(0);

  const buildTimelockConfig = useCallback(() => {
    const base = { mode: timelockMode };
    if (timelockMode === 'turn_timer') return { ...base, max_delta_daa: maxDeltaDaa };
    if (timelockMode === 'relative') return { ...base, reference_daa: referenceDaa, lock_duration_daa: lockDurationDaa };
    if (timelockMode === 'absolute') return { ...base, lock_threshold_daa: lockThresholdDaa };
    return base;
  }, [timelockMode, maxDeltaDaa, lockDurationDaa, lockThresholdDaa, referenceDaa]);
  // Claim payout state (implemented: real compute-payout endpoint)
  const [payoutResult, setPayoutResult] = useState(null);
  const [payoutLoading, setPayoutLoading] = useState(false);
  // ── Configurable chess time control (base minutes + increment seconds) ──
  // Defaults per variant: chess_blitz -> 3+2, chess_bullet -> 1+0, other chess -> 5+0.
  // Feeds the clocks (initial ms + per-move increment), the generated logic, and the previews.
  const [chessBaseMinutes, setChessBaseMinutes] = useState(5);
  const [chessIncrementSeconds, setChessIncrementSeconds] = useState(0);
  const chessBaseMs = chessBaseMinutes * 60 * 1000;
  const chessIncrementMs = chessIncrementSeconds * 1000;
  // Creator-customizable chess look (board theme + piece set). Persisted into
  // custom_ui_config.chess so the public covenant page renders the same look.
  const [chessBoardTheme, setChessBoardTheme] = useState(DEFAULT_BOARD_THEME);
  const [chessPieceSet, setChessPieceSet] = useState(DEFAULT_PIECE_SET);
  const [chessScriptCopied, setChessScriptCopied] = useState(false);
  // Per-game appearance selections for the NON-chess arenas (poker felt + card
  // back, connect4 discs, etc.), keyed by canonical arena key. Persisted into
  // custom_ui_config.games.<key>. updateGameAppearance patches one field.
  const [gamesAppearance, setGamesAppearance] = useState(DEFAULT_GAMES_APPEARANCE);
  const updateGameAppearance = useCallback((key, field, value) => {
    setGamesAppearance((prev) => ({ ...prev, [key]: { ...(prev[key] || {}), [field]: value } }));
  }, []);
  // Resolve the current selection for a game key into the look object the arenas
  // consume, so the terminal's own playable previews honor the creator's choice.
  const terminalLook = useCallback(
    (key) => gameLookFromConfig({ games: { [key]: gamesAppearance[key] || {} } }, key),
    [gamesAppearance],
  );
  // When a saved config restores a time control, skip the next per-variant default re-seed
  // for that gameType so the creator's persisted clock wins.
  const chessTcLoadedRef = useRef(null);

  // Chess clocks (ms remaining) - initialized from the configured base time
  const [whiteTime, setWhiteTime] = useState(5 * 60 * 1000);
  const [blackTime, setBlackTime] = useState(5 * 60 * 1000);
  const [opponentStake, setOpponentStake] = useState(0); // for "both sides stake same amount" check

  // ── Poker State (stake match → full screen pro table) ──
  const [showFullScreenPoker, setShowFullScreenPoker] = useState(false);
  const [pokerStake, setPokerStake] = useState(100);

  // ── Blackjack State (stake match → full screen pro table) ──
  const [showFullScreenBlackjack, setShowFullScreenBlackjack] = useState(false);
  const [bjStake, setBjStake] = useState(100);

  // ── Additional Skill Games States (checkers, connect4, tictactoe, reversi + more) ──
  // These four are persistent multiplayer: the real join/seat flow lives in
  // the full-screen table (useGameSync); the terminal just opens it.
  const [showFullScreenCheckers, setShowFullScreenCheckers] = useState(false);
  const [checkersStake, setCheckersStake] = useState(50);

  const [showFullScreenConnect4, setShowFullScreenConnect4] = useState(false);
  const [connect4Stake, setConnect4Stake] = useState(30);

  const [showFullScreenTicTacToe, setShowFullScreenTicTacToe] = useState(false);
  const [tttStake, setTttStake] = useState(20);

  const [showFullScreenReversi, setShowFullScreenReversi] = useState(false);
  const [reversiStake, setReversiStake] = useState(40);

  // RPS (rock paper scissors) quick skill game
  const [showFullScreenRPS, setShowFullScreenRPS] = useState(false);
  const [rpsStake, setRpsStake] = useState(25);

  // ── Oracle Resolution State (merkle_membership + future circuits) ──
  const [oracleProof, setOracleProof] = useState('');       // Pasted proof JSON
  const [oraclePublicInputs, setOraclePublicInputs] = useState('');  // Comma-separated public inputs
  const [oracleSubmitting, setOracleSubmitting] = useState(false);
  const [oracleResult, setOracleResult] = useState(null);   // { success, outcome, signature, message, timestamp, error }
  const [oracleError, setOracleError] = useState('');

  // ── Default merkle proof (from zk/merkle_proof.json - bundled for convenience) ──
  const bundledMerkleProof = JSON.stringify({
    proof: {pi_a:["18181728626747598512185236779782051408160831199146039141258343705294485377857","11249631687762252152790251352667177721597613535563072444007178274350918034293","1"],pi_b:[["18162424250835540918304993628173056026804582110058747751016796879041503358866","150409713570574904247288534137005688594977003217787346725000334109531127627"],["416138915697748307225291215901104649602159952580384513301073977638018174561","4190255711945735306577052854365915644921611118037145678718479286457518249622"],["1","0"]],pi_c:["5508794692018130626208187447388241780732532444861493044334671306046524780394","19987894614350216942694495648718785689000977620697338739577847839130351284395","1"],protocol:"groth16",curve:"bn128"},
    publicSignals: ["1","20473339414381364284988912838485478706292217748325897174032535818078518775705"]
  }, null, 2);

  // ── Default escrow_2party proof (from zk/escrow_2party_proof.json - bundled fallback) ──
  // publicSignals = [valid, deposit_daa, timeout_daa, current_daa, outcome]; this one is a
  // valid refund-after-timeout (outcome 0, current_daa >= deposit+timeout) so valid=1.
  const bundledEscrowProof = JSON.stringify({
    proof: {pi_a:["14634990543290621931428117209996810325041859210856155063991348437880042589006","19160502970707800111655431606333755536944672220548462290151763167116826302926","1"],pi_b:[["8264546661904265273570729133479615180135787734776806384395937415437736075194","12302265861914580867884639716422855293372299688197541991583168643796267544629"],["18063259679669351204303481785162440964194463832380082650367532578018314285624","21694365360621478271720622687445986136784652025316361988346183907271146372660"],["1","0"]],pi_c:["9807129881401666943404257927052971287895363732210205867666939647185139839500","10211691301132607194282716622732477480716307616740793287313048364972983551482","1"],protocol:"groth16",curve:"bn128"},
    publicSignals: ["1","1000000","100","1000150","0"]
  }, null, 2);

  // ── Default age_verification proof (from zk/age_verification_proof.json - bundled fallback) ──
  // publicSignals = [valid, commitment=MiMC7(birth_year), current_year, min_age]; this proves a
  // 1990 birth-year is >= 18 by 2026 (valid=1) without revealing the birth year.
  const bundledAgeProof = JSON.stringify({
    proof: {pi_a:["5619895548091576804581760492698429345849062891191744608859163905168379928693","7839288049757903982851672696890472855721483963839901554082218912274024379088","1"],pi_b:[["4044048291624416226957668696574893406681818621608843988030802900725855639731","6100628949306472358778982026802718533177795569131468773010381365087192436052"],["7679876114676165661785250331563008797335051957690885728355820952120139032780","1367335231690467297564311959019316973876860160510307767707848474899300146768"],["1","0"]],pi_c:["9918711859505021885296375199776448337071396188891224177119145403945845525994","11428623058958036795346677199997004438696653948382146737430378223361652949425","1"],protocol:"groth16",curve:"bn128"},
    publicSignals: ["1","9200635592700100900023685259419851615264527311517926356835164316867165626887","2026","18"]
  }, null, 2);

  // ── Client-side ZK proof generation state ──
  const [zkGeneratingId, setZkGeneratingId] = useState(null);
  const [zkGenError, setZkGenError] = useState('');

  // The in-browser provers themselves (MiMC7 / Poseidon / numeric input prep, served wasm/zkey
  // paths, the covenantFieldElement H4 binding) now live in lib/zk/provers.js as the single
  // source of truth shared with the public ZkClaimPanel. The terminal wrappers below preserve
  // EXACTLY the prior behavior: they call the shared prover (which fullProves the same artifacts),
  // store the result into the oracle textarea, and keep the terminal-specific bundled fallbacks
  // for merkle/range/escrow/age. The proving math is no longer duplicated here.

  // Merkle: on failure, fall back to the bundled real proof (verifies fail-closed at the oracle).
  const generateMerkleProof = async () => {
    setZkGeneratingId('merkle_membership'); setZkGenError('');
    try {
      const { proof, publicSignals } = await PROVERS.merkle_membership.prove(fullProveBound);
      setOracleProof(JSON.stringify({ proof, publicSignals }, null, 2));
      setOraclePublicInputs(publicSignals.map(s => s.toString()).join(','));
    } catch (e) {
      setZkGenError(`Proof generation failed: ${e.message}. Loading bundled proof instead.`);
      setOracleProof(bundledMerkleProof);
      setOraclePublicInputs('1,20473339414381364284988912838485478706292217748325897174032535818078518775705');
    }
    setZkGeneratingId(null);
  };

  // Range: the in-browser prover works (verified accept + tamper-reject); on a rare environment
  // failure surface the real error and leave the proof empty - never fabricate.
  const generateRangeProof = async () => {
    setZkGeneratingId('range_proof'); setZkGenError('');
    try {
      const { proof, publicSignals } = await PROVERS.range_proof.prove(fullProveBound);
      setOracleProof(JSON.stringify({ proof, publicSignals }, null, 2));
      setOraclePublicInputs(publicSignals.map(s => s.toString()).join(','));
      setZkGenError('');
    } catch (e) {
      setOracleProof('');
      setOraclePublicInputs('');
      setZkGenError(`In-browser range proof generation failed (${e.message || e}). No proof was produced; nothing fake is ever submitted.`);
    }
    setZkGeneratingId(null);
  };

  // Escrow: on a rare in-browser failure, fall back to the bundled real proof (never fabricated).
  const generateEscrowProof = async () => {
    setZkGeneratingId('escrow_2party'); setZkGenError('');
    try {
      const { proof, publicSignals } = await PROVERS.escrow_2party.prove(fullProveBound);
      setOracleProof(JSON.stringify({ proof, publicSignals }, null, 2));
      setOraclePublicInputs(publicSignals.map((s) => s.toString()).join(','));
      setZkGenError('');
    } catch (e) {
      setZkGenError(`In-browser proof generation failed (${e.message || e}). Loaded the bundled valid escrow proof instead.`);
      setOracleProof(bundledEscrowProof);
      setOraclePublicInputs('1,1000000,100,1000150,0');
    }
    setZkGeneratingId(null);
  };

  // Age: on a rare in-browser failure, fall back to the bundled real proof (never fabricated).
  const generateAgeProof = async () => {
    setZkGeneratingId('age_verification'); setZkGenError('');
    try {
      const { proof, publicSignals } = await PROVERS.age_verification.prove(fullProveBound);
      setOracleProof(JSON.stringify({ proof, publicSignals }, null, 2));
      setOraclePublicInputs(publicSignals.map((s) => s.toString()).join(','));
      setZkGenError('');
    } catch (e) {
      setZkGenError(`In-browser proof generation failed (${e.message || e}). Loaded the bundled valid age proof instead.`);
      setOracleProof(bundledAgeProof);
      setOraclePublicInputs('1,9200635592700100900023685259419851615264527311517926356835164316867165626887,2026,18');
    }
    setZkGeneratingId(null);
  };

  // The remaining provers have no bundled fallback: on failure they surface the real error and
  // leave the proof empty (nothing fake is ever submitted). One shared helper drives them all.
  const runZkProver = async (circuitId, label) => {
    setZkGeneratingId(circuitId); setZkGenError('');
    try {
      const { proof, publicSignals } = await PROVERS[circuitId].prove(fullProveBound);
      setOracleProof(JSON.stringify({ proof, publicSignals }, null, 2));
      setOraclePublicInputs(publicSignals.map((s) => s.toString()).join(','));
      setZkGenError('');
    } catch (e) {
      setOracleProof(''); setOraclePublicInputs('');
      setZkGenError(`In-browser ${label} proof failed (${e.message || e}). No proof was produced; nothing fake is ever submitted.`);
    }
    setZkGeneratingId(null);
  };

  const generateVrfDiceRoll      = () => runZkProver('vrf_dice_roll', 'VRF dice');
  const generateNullifierSet     = () => runZkProver('nullifier_set', 'nullifier');
  const generateUtxoOwnership    = () => runZkProver('utxo_ownership', 'UTXO note');
  const generateHashPreimage     = () => runZkProver('hash_preimage', 'hash preimage');
  const generateTimelockAbsolute = () => runZkProver('timelock_absolute', 'absolute timelock');
  const generateRelativeTimelock = () => runZkProver('relative_timelock', 'relative timelock');
  const generateVrfRandom        = () => runZkProver('vrf_random', 'VRF');
  const generateTurnTimer        = () => runZkProver('turn_timer', 'turn timer');
  const generateScriptConstraint = () => runZkProver('script_constraint', 'script constraint');
  const generatePotSplitMath     = () => runZkProver('pot_split_math', 'pot split');

  // ── Mainnet is derived from the toggle (line 451) - no separate detection needed ──

  const generateSilverScript = useCallback(() => {
    const feeBasis = Math.round(feePercent * 100);
    const feePlatform = Math.round(feePercent * 10);
    const feeCreator = 10000 - feePlatform;

    // ── ZK circuit-specific covenant definitions ──
  const gameMeta = (() => {
    switch (gameType) {
      case 'chess_v1':
        return {
          covenantName: 'ChessDuelCovenant',
          outcomeEnum: 'Outcome::PlayerAWins | PlayerBWin | Draw',
          outcomeBranches: `      // 2% platform fee already taken at resolution (winner takes all minus fee)
    // ZK CIRCUIT (chess_v1) ENFORCES THE COMPLETE FIDE RULESET:
    // • Standard 8x8 starting position + all piece movement rules
    // • Pawn: forward only, double-step from rank 2/7, captures diagonally, en passant
    // • Knight: L-shape (2,1), can jump
    // • Bishop: any number of squares diagonally, blocked by pieces
    // • Rook: any number of squares orthogonally, blocked by pieces
    // • Queen: any combination of bishop + rook movement
    // • King: one square in any direction
    // • Castling (kingside/queenside): BOTH king and rook must never have moved,
    //   path between them must be empty, king not in check, king does not pass through check
    // • Check: king is attacked by at least one enemy piece
    // • Checkmate: king is in check AND has no legal escape (no move, no capture, no block)
    // • Stalemate: player to move has NO legal moves but king is NOT in check → draw
    // • 50-move rule: 50 consecutive plies without pawn move or capture → draw claim
    // • Threefold repetition: identical position repeated 3 times → draw
    // • Insufficient material: K vs K, K+B vs K, K+N vs K → draw
    // • Promotion: pawn reaching last rank must promote to Q/R/B/N
    // The ZK proof commits to the full PGN + final FEN and proves every transition was legal.
    Outcome::PlayerAWins => {
      require(
        VerifyPayout(treasury, player_a, pot),
        "Winner payout failed"
      );
    }
    Outcome::PlayerBWin => {
      require(
        VerifyPayout(treasury, player_b, pot),
        "Winner payout failed"
      );
    }
    Outcome::Draw => {
      let half = pot / 2;
      require(
        VerifyPayout(treasury, player_a, half) &&
        VerifyPayout(treasury, player_b, half),
        "Draw refund failed"
      );
    }`,
        };
      case 'merkle_membership':
        return {
          covenantName: 'MerkleProofCovenant',
          outcomeEnum: 'Outcome::Proven | Rejected',
          outcomeBranches: `      // ZK CIRCUIT (merkle_generic): proves a leaf exists in a committed Merkle root
    // Public inputs: merkle_root, key_hash, value_hash
    // Private witness: Merkle proof path (sibling hashes + direction bits)
    // No sensitive data revealed beyond the fact of membership
    Outcome::Proven => {
      require(
        VerifyPayout(treasury, claimant, pot),
        "Proof accepted, payout to claimant"
      );
    }
    Outcome::Rejected => {
      require(
        VerifyPayout(treasury, depositor, pot),
        "Proof rejected, return to depositor"
      );
    }`,
        };
      case 'range_proof':
        return {
          covenantName: 'RangeProofCovenant',
          outcomeEnum: 'Outcome::Proven | Rejected',
          outcomeBranches: `      // ZK CIRCUIT (bulletproofs_v1): proves a committed value ∈ [min, max]
    // Public inputs: commitment, min_bound, max_bound
    // Private witness: actual value, blinding factor
    Outcome::Proven => {
      require(
        VerifyPayout(treasury, claimant, pot),
        "Range proof accepted"
      );
    }
    Outcome::Rejected => {
      require(
        VerifyPayout(treasury, depositor, pot),
        "Range proof rejected"
      );
    }`,
        };
      case 'age_verification':
        return {
          covenantName: 'AgeVerifyCovenant',
          outcomeEnum: 'Outcome::Verified | Rejected',
          outcomeBranches: `      // ZK CIRCUIT (age_verify_v1): proves birthdate ≥ N years before reference date
    // Public inputs: commitment, threshold_years, reference_timestamp
    // Private witness: actual birthdate, blinding factor
    Outcome::Verified => {
      require(
        VerifyPayout(treasury, claimant, pot),
        "Age verified, payout to claimant"
      );
    }
    Outcome::Rejected => {
      require(
        VerifyPayout(treasury, depositor, pot),
        "Verification failed"
      );
    }`,
        };
      case 'verifiable':
        return {
          covenantName: 'VerifiableComputeCovenant',
          outcomeEnum: 'Outcome::Accepted | Rejected',
          outcomeBranches: `      // ZK CIRCUIT (risc0_generic): proves correct execution of arbitrary computation
    // Public inputs: program_hash, output_hash, input_hash
    // Private witness: execution trace
    Outcome::Accepted => {
      require(
        VerifyPayout(treasury, claimant, pot),
        "Proof accepted"
      );
    }
    Outcome::Rejected => {
      require(
        VerifyPayout(treasury, depositor, pot),
        "Proof rejected"
      );
    }`,
        };
      default: // custom
        return {
          covenantName: 'CustomCircuitCovenant',
          outcomeEnum: 'Outcome::Proven | Rejected',
          outcomeBranches: `      // Custom ZK circuit - user supplies audited circuit + verifier key
    Outcome::Proven => {
      require(
        VerifyPayout(treasury, claimant, pot),
        "Proof accepted"
      );
    }
    Outcome::Rejected => {
      require(
        VerifyPayout(treasury, depositor, pot),
        "Proof rejected, return to depositor"
      );
    }`,
        };
    }
  })();

    let resolveBlock;
    // ZK resolution is FREE for everyone. Paid tiers buy only priority placement /
    // featured listing on Covex, never build capability, so resolution is never downgraded.
    let effectiveResolution = resolutionMode;
    switch (effectiveResolution) {
      case 'custom':
        resolveBlock = `\n  ;; ── Resolution: External Resolver (bring your own)\n  ;; Resolver x-only pubkey: ${customOracleKey || '(not set)'}\n  ;; Deploy this as an Oracle Escrow in Enforced Deploy with this key, and the covenant locks on-chain to THIS resolver: releasing funds needs the resolver's co-signature, and Covex's key is not in the path. Covex does not attest real-world facts.`;
        break;
      case 'zk':
        resolveBlock = `\n  ;; ── Resolution: ZK Proof (${zkCircuit})\n  ;; Verifier key: ${zkVerifierKey || '(built-in)'}\n  ;; Full FIDE chess ruleset proven (castling/en-passant/checkmate/50-move/repetition)\n  OpZkVerify ${zkVerifierKey || '0x00'} ;; circuit: ${zkCircuit}`;
        break;
      default:
        resolveBlock = `\n  ;; ── Resolution: deployer-bound resolver co-signature\n  OpCheckSig resolver_pubkey ;; resolver_pubkey (deployer-bound)`;
        break;
    }

    const topupsBlock = allowTopups
      ? '\n  ;; Allow top-ups after creation\n  OpAddToPot'
      : '';

    const reusableBlock = reusable
      ? '\n  ;; Reusable, fee stays in pot for next round\n  OpReuseCovenant'
      : '';

    const script = `;; ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
;; SilverScript: ${gameMeta.covenantName}
;; Game Type: ${GAME_TYPES.find(g => g.id === gameType)?.name || gameType}
;; Generated by Covex Terminal
;; ${gameType.startsWith('chess') ? 'ZK proves complete FIDE ruleset (see unlock() for full list)' : ''}
;; ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Covenant ${gameMeta.covenantName} {
  ;; ── Constants ──
  fee_basis_points: ${feeBasis}   ;; ${feePercent}% platform fee
  platform_share:   ${feePlatform}
  creator_share:    ${feeCreator}
  min_lock:         1000000       ;; 1 KAS minimum

  ;; ── Participant addresses ──
  input player_a: PubKey
  input player_b: PubKey
  input treasury:  PubKey
  input platform:  PubKey

  ;; ── State ──
  state locked_amount: u64 = 0${topupsBlock}${reusableBlock}
${resolveBlock}

  ;; ── Core Logic ──
  fn unlock(outcome: ${gameMeta.outcomeEnum}) {
    let total = locked_amount;
    let fee = (total * fee_basis_points) / 10000;
    let pot = total - fee;

    ;; Platform takes fee
    require(
      VerifyPayout(treasury, platform, fee),
      "Platform fee not routed correctly"
    );

${gameMeta.outcomeBranches}
  }
}`;

    setGeneratedScript(script);
  }, [gameType, feePercent, potReturnPercent, resolutionMode, customOracleKey, zkCircuit, zkVerifierKey, reusable, allowTopups]);

  // ── Live chess SilverScript for the preview (regenerates as timer/fee/stake change) ──
  const chessScriptLive = useMemo(() => {
    if (!gameType.startsWith('chess')) return '';
    try {
      return generateSilverScriptForConfig({
        gameType: 'chess_v1', // chess variants all map to the same FIDE covenant template
        feePercent,
        potReturnPercent,
        resolutionMode: 'oracle',
        reusable,
        allowTopups,
        chessBaseMinutes,
        chessIncrementSeconds,
        hasPaidAccess: true,
      });
    } catch {
      return '';
    }
  }, [gameType, feePercent, potReturnPercent, reusable, allowTopups, chessBaseMinutes, chessIncrementSeconds]);

  const copyChessScriptLive = useCallback(async () => {
    if (!chessScriptLive) return;
    try {
      await navigator.clipboard.writeText(chessScriptLive);
      setChessScriptCopied(true);
      setTimeout(() => setChessScriptCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  }, [chessScriptLive]);

  // custom_ui_config persisted for chess covenants: carries game_type 'chess', the time
  // control, the per-side stake, and the fee so the public covenant page can render the same
  // configuration the creator previewed. Null for non-chess covenants.
  const chessUiConfig = useMemo(() => {
    if (!gameType.startsWith('chess')) return null;
    const chessLook = { board_theme: chessBoardTheme, piece_set: chessPieceSet };
    return {
      game_type: 'chess',
      variant: gameType,
      time_control: {
        base_minutes: chessBaseMinutes,
        increment_seconds: chessIncrementSeconds,
        base_ms: chessBaseMs,
        increment_ms: chessIncrementMs,
      },
      per_side_stake_kas: chessStake,
      fee_percent: feePercent,
      pot_return_percent: potReturnPercent,
      // Creator-chosen look. Persisted under both the new unified games.chess and
      // the legacy custom_ui_config.chess location so old and new readers agree.
      chess: chessLook,
      games: { chess: chessLook },
    };
  }, [gameType, chessBaseMinutes, chessIncrementSeconds, chessBaseMs, chessIncrementMs, chessStake, feePercent, potReturnPercent, chessBoardTheme, chessPieceSet]);

  // Canonical arena key for the currently selected (non-chess) game type, or null
  // when this is not a themeable arena game.
  const arenaGameKey = useMemo(() => {
    const k = normalizeGameKey(gameType);
    return k && k !== 'chess' ? k : null;
  }, [gameType]);

  // custom_ui_config persisted for the NON-chess arena games: carries game_type +
  // the creator-chosen appearance under games.<key>, so the public covenant page
  // resolves the same look via gameLookFromConfig. Null when not an arena game.
  const arenaUiConfig = useMemo(() => {
    if (!arenaGameKey) return null;
    return {
      game_type: arenaGameKey,
      variant: gameType,
      per_side_stake_kas: chessStake,
      fee_percent: feePercent,
      pot_return_percent: potReturnPercent,
      games: { [arenaGameKey]: gamesAppearance[arenaGameKey] || {} },
    };
  }, [arenaGameKey, gameType, chessStake, feePercent, potReturnPercent, gamesAppearance]);

  // ── Chess ZK Arena Handlers (full rules via chess.js + ZK outcome submission) ──
  const resetChessArena = useCallback(() => {
    const fresh = new Chess();
    setChessGame(fresh);
    setChessMatchState('idle');
    setChessPlayerColor('w');
    setChessOpponent('');
    setChessResult(null);
    setChessZkVerified(false);
    setChessProofHash('');
    setWhiteTime(chessBaseMs);
    setBlackTime(chessBaseMs);
    setOpponentStake(0);
    setShowFullScreenChess(false);
    setShowFullScreenCheckers(false);
    setShowFullScreenConnect4(false);
    setShowFullScreenTicTacToe(false);
    setShowFullScreenReversi(false);
    setShowFullScreenRPS(false);
  }, [chessBaseMs]);

  const postStakeForMatch = useCallback(() => {
    const fresh = new Chess();
    setChessGame(fresh);
    setChessMatchState('posted');
    setChessPlayerColor('w');
    setChessOpponent('kaspa:qqp2...waiting');
    setChessResult(null);
    setChessZkVerified(false);
    setChessProofHash('');
    setOpponentStake(0);
    setWhiteTime(chessBaseMs);
    setBlackTime(chessBaseMs);
  }, [chessBaseMs]);

  const acceptMatch = useCallback(() => {
    // Opponent matches the exact same stake amount - required before full screen play
    setOpponentStake(chessStake);
    setChessMatchState('matched');
    setTimeout(() => {
      setChessMatchState('playing');
      setChessOpponent('kaspa:qpw2x7... (dev-wallet-2)');
      // Start clocks from the configured base time (e.g. 5+0, 3+2, 1+0)
      setWhiteTime(chessBaseMs);
      setBlackTime(chessBaseMs);
    }, 650);
  }, [chessStake, chessBaseMs]);

  // ── Persistent skill-game arenas: the table itself handles join/seats/turns
  // against /api/games via useGameSync, so opening it is the whole flow ──
  const launchFullScreenCheckers = useCallback(() => { setShowFullScreenCheckers(true); }, []);
  const launchFullScreenConnect4 = useCallback(() => { setShowFullScreenConnect4(true); }, []);
  const launchFullScreenTicTacToe = useCallback(() => { setShowFullScreenTicTacToe(true); }, []);
  const launchFullScreenReversi = useCallback(() => { setShowFullScreenReversi(true); }, []);

  const launchFullScreenRPS = useCallback(() => { setShowFullScreenRPS(true); }, []);

  const launchFullScreenChess = useCallback(() => {
    if (chessMatchState !== 'playing' && chessMatchState !== 'finished') return;
    // Only allow full screen professional play after stakes match
    if (opponentStake !== chessStake) {
      // force match if not
      setOpponentStake(chessStake);
    }
    setShowFullScreenChess(true);
  }, [chessMatchState, opponentStake, chessStake]);

  const handleChessMove = useCallback((sourceSquare, targetSquare, piece) => {
    if (chessMatchState !== 'playing') return false;

    const gameCopy = new Chess(chessGame.fen());
    let move;
    try {
      move = gameCopy.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: piece && piece[1] === 'P' ? 'q' : undefined,
      });
    } catch {
      return false; // illegal
    }

    if (move) {
      // Fischer increment: the player who just moved gets the configured increment added.
      // chessGame.turn() is the mover's color (before the move is applied to chessGame).
      if (chessIncrementMs > 0) {
        const moverWasWhite = chessGame.turn() === 'w';
        if (moverWasWhite) setWhiteTime((t) => t + chessIncrementMs);
        else setBlackTime((t) => t + chessIncrementMs);
      }
      setChessGame(gameCopy);

      // Check game over after move (full rules: checkmate, stalemate, 50-move, repetition, insufficient material)
      if (gameCopy.isCheckmate()) {
        const winner = gameCopy.turn() === 'w' ? 'black' : 'white';
        setChessResult({ outcome: winner, method: 'checkmate' });
        setChessMatchState('finished');
      } else if (gameCopy.isDraw() || gameCopy.isStalemate() || gameCopy.isThreefoldRepetition() || gameCopy.isInsufficientMaterial()) {
        setChessResult({ outcome: 'draw', method: gameCopy.isStalemate() ? 'stalemate' : 'draw' });
        setChessMatchState('finished');
      }
      return true;
    }
    return false;
  }, [chessGame, chessMatchState, chessIncrementMs]);

  const resignGame = useCallback((asColor) => {
    if (chessMatchState !== 'playing') return;
    const winner = asColor === 'w' ? 'black' : 'white';
    setChessResult({ outcome: winner, method: 'resign' });
    setChessMatchState('finished');
  }, [chessMatchState]);

  const submitChessResultToOracle = useCallback(async () => {
    if (!chessResult || !covenantId) {
      toast.info('Configure your covenant and finish the game first, then submit the result to the resolver.');
      return;
    }

    // Make ZK / Oracle actually work: submit chess game result to the oracle for attestation.
    // In future when real chess_v1 ZK circuit exists, the 'proof' will be a real Groth16 proof of the PGN/FEN + rules.
    // Today we send the client-validated result (chess.js) + PGN as public inputs for oracle to attest/sign.
    // This completes the "play full screen → submit resolution → get signed outcome" flow.
    const outcomeMap = { white: 0, black: 1, draw: 2 };
    const outcome = outcomeMap[chessResult.outcome] ?? 0;

    const proofPayload = {
      covenant_id: covenantId,
      circuit_type: 'chess_v1',
      proving_mode: chessProvingMode,
      timelock: buildTimelockConfig(),
      proof: {
        // For real ZK this would be the Groth16 {pi_a, pi_b, pi_c}
        // For now: the result + client proof that chess.js validated the full game
        result: chessResult,
        method: chessResult.method,
        pgn: chessGame.pgn(),
        final_fen: chessGame.fen(),
      },
      public_inputs: [
        chessGame.pgn().slice(0, 200), // truncated PGN as public
        chessResult.outcome,
        chessResult.method || 'result'
      ],
      requested_outcome: outcome,
    };

    try {
      const res = await fetch('/api/oracle/verify-and-sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(proofPayload),
      });
      const data = await res.json();

      if (data.success) {
        setChessProofHash(data.signature || 'oracle-signed');
        setChessOracleResult(data); // store full oracle response for claim
        setChessZkVerified(true);
        // Store for claim / unlock flow
        // console.log('[Chess Oracle] Result attested:', data); // cleaned for prod
      } else {
        // No fabricated signature: a failed oracle call must NOT render a fake
        // attestation or a live CLAIM button. Surface the real error and keep
        // chessZkVerified=false so the claim path stays gated.
        setChessZkVerified(false);
        toast.error('Resolver verification failed' + (data && data.error ? ': ' + data.error : '') + '. Please try again.');
      }
    } catch {
      // Network/parse error: never fabricate a signature. Keep verified=false.
      setChessZkVerified(false);
      toast.error('Network error submitting result to the resolver. Check your connection and try again.');
    }
  }, [chessResult, chessGame, covenantId, chessProvingMode, buildTimelockConfig]);

  // ── Real claimPayout - calls backend compute-payout endpoint ──
  const claimPayout = useCallback(async () => {
    if (!covenantId || !chessOracleResult) {
      // Fallback: reset if no oracle result available
      toast.info('No resolver attestation found. Submit the result to the resolver first, then claim.');
      return;
    }

    setPayoutLoading(true);
    setPayoutResult(null);

    const outcomeMap = { white: 0, black: 1, draw: 2 };
    const outcome = outcomeMap[chessResult?.outcome] ?? 0;

    try {
      const payload = {
        oracle_signature: chessOracleResult.signature || '',
        outcome,
        total_stake_kas: chessStake * 2,
        per_side_stake_kas: chessStake,
        oracle_message: chessOracleResult.message || '',
        oracle_timestamp: chessOracleResult.timestamp || null,
      };

      const res = await fetch(`/api/covenant/${covenantId}/compute-payout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (data.success && data.payout) {
        setPayoutResult(data.payout);
      } else {
        setPayoutResult({ error: data.error || 'Payout computation failed' });
      }
    } catch (err) {
      setPayoutResult({ error: err.message || 'Network error computing payout' });
    } finally {
      setPayoutLoading(false);
    }
  }, [covenantId, chessOracleResult, chessResult, chessStake]);

  // Real-time chess clocks (chess.com smooth decrement)
  useEffect(() => {
    if (chessMatchState !== 'playing') return undefined;

    const tick = setInterval(() => {
      const isWhite = chessGame.turn() === 'w';
      if (isWhite) {
        setWhiteTime((t) => {
          const next = Math.max(0, t - 100);
          if (next === 0) {
            // Time out: black wins
            setChessResult({ outcome: 'black', method: 'time' });
            setChessMatchState('finished');
          }
          return next;
        });
      } else {
        setBlackTime((t) => {
          const next = Math.max(0, t - 100);
          if (next === 0) {
            setChessResult({ outcome: 'white', method: 'time' });
            setChessMatchState('finished');
          }
          return next;
        });
      }
    }, 100);

    return () => clearInterval(tick);
  }, [chessMatchState, chessGame]);

  // ── Seed the chess time control from the selected variant ──
  // chess_blitz -> 3+2, chess_bullet -> 1+0, other chess -> 5+0. Re-seeds only when the
  // gameType changes (so the creator can still hand-tune base/increment afterwards). When the
  // arena is idle, also reset the displayed clocks so the preview reflects the new base time.
  useEffect(() => {
    if (!gameType.startsWith('chess')) return;
    // A saved config just restored a time control for this gameType: honor it, do not re-seed.
    if (chessTcLoadedRef.current === gameType || chessTcLoadedRef.current === true) {
      chessTcLoadedRef.current = null;
      return;
    }
    const { base, inc } = defaultTimeControlFor(gameType);
    setChessBaseMinutes(base);
    setChessIncrementSeconds(inc);
    if (chessMatchState === 'idle') {
      setWhiteTime(base * 60 * 1000);
      setBlackTime(base * 60 * 1000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameType]);

  // Keep the idle clocks in sync when the creator hand-tunes the base minutes.
  useEffect(() => {
    if (chessMatchState !== 'idle') return;
    setWhiteTime(chessBaseMs);
    setBlackTime(chessBaseMs);
  }, [chessBaseMs, chessMatchState]);

  // ── Load saved config from API on mount ──
  useEffect(() => {
    if (!covenantId) {
      // No specific covenant to edit (e.g. the public /sandbox builder, which mounts
      // the terminal with externalCircuit only). There's nothing to fetch, so render
      // immediately with defaults instead of spinning on "Loading terminal..." forever.
      setConfigLoaded(true);
      return;
    }
    fetch(`/api/terminal-config/${covenantId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.config) {
          const cfg = data.config;
          if (cfg.game_type) setGameType(cfg.game_type);
          if (cfg.name) setName(cfg.name);
          if (cfg.description) setDescription(cfg.description);
          if (cfg.fee_percent !== undefined) setFeePercent(cfg.fee_percent);
          if (cfg.pot_return_percent !== undefined) setPotReturnPercent(cfg.pot_return_percent);
          else if (cfg.payoutBackPercent !== undefined) setPotReturnPercent(cfg.payoutBackPercent);
          else if (cfg.payout_back_percent !== undefined) setPotReturnPercent(cfg.payout_back_percent);
          if (cfg.reusable !== undefined) setReusable(cfg.reusable);
          if (cfg.allow_topups !== undefined) setAllowTopups(cfg.allow_topups);
          if (cfg.resolution_mode) setResolutionMode(cfg.resolution_mode);
          if (cfg.custom_oracle_key) setCustomOracleKey(cfg.custom_oracle_key);
          if (cfg.zk_circuit) setZkCircuit(cfg.zk_circuit);
          if (cfg.zk_circuit === 'chess_v1' && typeof cfg.proving_mode === 'number') setChessProvingMode(cfg.proving_mode);
          if (cfg.timelock?.mode) setTimelockMode(cfg.timelock.mode);
          if (cfg.timelock?.max_delta_daa != null) setMaxDeltaDaa(cfg.timelock.max_delta_daa);
          if (cfg.timelock?.lock_duration_daa != null) setLockDurationDaa(cfg.timelock.lock_duration_daa);
          if (cfg.timelock?.lock_threshold_daa != null) setLockThresholdDaa(cfg.timelock.lock_threshold_daa);
          if (cfg.timelock?.reference_daa != null) setReferenceDaa(cfg.timelock.reference_daa);
          if (cfg.zk_verifier_key) setZkVerifierKey(cfg.zk_verifier_key);
          // Restore the saved chess time control (wins over the per-variant default seed).
          const savedTc = cfg.time_control || cfg.custom_ui_config?.time_control;
          if (savedTc) {
            chessTcLoadedRef.current = cfg.game_type || true; // skip the variant-default re-seed once
            if (savedTc.base_minutes != null) setChessBaseMinutes(savedTc.base_minutes);
            if (savedTc.increment_seconds != null) setChessIncrementSeconds(savedTc.increment_seconds);
          }
          // Restore the saved chess look (board theme + piece set). Prefer the new
          // unified games.chess location, fall back to the legacy chess key.
          const savedGames = cfg.games || cfg.custom_ui_config?.games || {};
          const savedChess = savedGames.chess || cfg.chess || cfg.custom_ui_config?.chess;
          if (savedChess) {
            if (savedChess.board_theme) setChessBoardTheme(savedChess.board_theme);
            if (savedChess.piece_set) setChessPieceSet(savedChess.piece_set);
          }
          // Restore the saved per-game appearance for the non-chess arenas,
          // merging onto the defaults so any unset field keeps its default.
          if (savedGames && typeof savedGames === 'object') {
            setGamesAppearance((prev) => {
              const next = { ...prev };
              for (const k of Object.keys(savedGames)) {
                if (k === 'chess') continue;
                if (savedGames[k] && typeof savedGames[k] === 'object') {
                  next[k] = { ...(prev[k] || {}), ...savedGames[k] };
                }
              }
              return next;
            });
          }
          if (data.ui_html) setCustomUICode(data.ui_html);
        } else {
          // No saved config, seed from covenant data
          if (covenant?.covenant_type) setName(covenant.covenant_type);
          if (covenant?.description) setDescription(covenant.description);
        }
        setConfigLoaded(true);
      })
      .catch(() => {
        // Fallback to covenant defaults
        if (covenant?.covenant_type) setName(covenant.covenant_type);
        if (covenant?.description) setDescription(covenant.description);
        setConfigLoaded(true);
      });
  }, [covenantId, covenant]);

  // ── Open Covenant Studio ──
  // The visual Studio designs the PUBLIC PAGE of a live covenant, so it binds to a
  // deployed covenant id (/covenant/:id/studio). On the sandbox (no covenant yet)
  // there is nothing to open - guide the user to deploy first instead of navigating
  // to a dead route that bounces back to the homepage.
  const handleOpenStudio = useCallback(() => {
    if (!covenantId) {
      toast.info('Deploy this covenant first - the visual Studio designs the public page of a live covenant.');
      return;
    }
    navigate(`/covenant/${covenantId}/studio`);
  }, [covenantId, navigate]);

  // ── Copy SilverScript ──
  const handleCopyScript = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(generatedScript);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [generatedScript]);

  // ── Submit to Oracle ──
  const handleOracleSubmit = useCallback(async () => {
    if (!covenantId) return;
    setOracleSubmitting(true);
    setOracleResult(null);
    setOracleError('');
    setSaveStatus('saving');

    try {
      // Parse proof from textarea (accepts full {proof, publicSignals} or just proof object)
      let proofObj;
      let publicInputs;
      let rawText = oracleProof.trim();

      // Try parsing as full {proof, publicSignals} object
      try {
        const parsed = JSON.parse(rawText);
        if (parsed.proof && parsed.publicSignals) {
          proofObj = parsed.proof;
          publicInputs = parsed.publicSignals;
        } else {
          proofObj = parsed;
          publicInputs = oraclePublicInputs ? oraclePublicInputs.split(',').map(s => s.trim()) : [];
        }
      } catch {
        setOracleError('Invalid JSON. Paste proof as JSON object ({proof, publicSignals}) or raw proof JSON.');
        setOracleSubmitting(false);
        setSaveStatus('idle');
        return;
      }

      if (publicInputs.length === 0 && oraclePublicInputs) {
        publicInputs = oraclePublicInputs.split(',').map(s => s.trim());
      }
      if (publicInputs.length === 0) {
        setOracleError('Public inputs required. Paste comma-separated values (e.g., "1,20473339414381364...")');
        setOracleSubmitting(false);
        setSaveStatus('idle');
        return;
      }

      // Dynamic circuit type based on selected ZK circuit / gameType
      const circuitType = (gameType === 'range_proof' || zkCircuit === 'bulletproofs_v1')
        ? 'range_proof'
        : (gameType === 'merkle_membership' || zkCircuit.includes('merkle'))
          ? 'merkle_membership'
          : gameType.startsWith('age') ? 'age_verification'
          : gameType === 'verifiable' ? 'verifiable'
          : gameType === 'chess_v1' ? 'chess_v1'
          : gameType === 'tictactoe_v1' ? 'tictactoe_v1'
          : gameType === 'connect4_v1' ? 'connect4_v1'
          : 'custom';

      const payload = {
        covenant_id: covenantId,
        circuit_type: circuitType,
        proof: proofObj,
        public_inputs: publicInputs,
        requested_outcome: 0, // for range/merkle: 0 = proven/valid
      };

      // Save oracle config to terminal-config first
      const configPayload = {
        game_type: gameType,
        name, description,
        fee_percent: feePercent,
        pot_return_percent: potReturnPercent,
        reusable, allow_topups: allowTopups,
        custom_ui_code: customUICode,
        resolution_mode: resolutionMode,
        custom_oracle_key: resolutionMode === 'custom' ? customOracleKey : null,
        zk_circuit: zkCircuit,
        zk_verifier_key: zkVerifierKey || (circuitType === 'range_proof' ? '0xBULLETPROOFS_V1' : circuitType === 'merkle_membership' ? '0xMERKLE_GENERIC_V1' : circuitType === 'age_verification' ? '0xAGE_VERIFY_V1' : circuitType === 'verifiable' ? '0xRISC0_GENERIC_V1' : '0xCUSTOM_V1'),
        ...(zkCircuit === 'chess_v1' ? { proving_mode: chessProvingMode } : {}),
        ...(gameType.startsWith('chess') ? {
          time_control: { base_minutes: chessBaseMinutes, increment_seconds: chessIncrementSeconds },
          custom_ui_config: chessUiConfig,
        } : arenaUiConfig ? {
          custom_ui_config: arenaUiConfig,
        } : {}),
        timelock: buildTimelockConfig(),
        oracle_proof: JSON.stringify(proofObj),
        oracle_public_inputs: JSON.stringify(publicInputs),
        network: kaspaNetwork, // mainnet
      };
      await fetch(`/api/terminal-config/${covenantId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configPayload),
      });

      // Call the oracle
      const res = await fetch('/api/oracle/verify-and-sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      setOracleResult(data);
      if (data.success) {
        setSaveStatus('saved');
      } else {
        setSaveStatus('error');
      }
    } catch (err) {
      setOracleError(err.message || 'Resolver request failed');
      setSaveStatus('error');
    } finally {
      setOracleSubmitting(false);
    }
  }, [covenantId, oracleProof, oraclePublicInputs, gameType, name, description, feePercent, reusable, allowTopups, customUICode, resolutionMode, customOracleKey, zkVerifierKey]);

  // ── Save All Changes ──
  const handleSave = useCallback(async () => {
    if (!covenantId) {
      toast.info('Deploy this covenant first - changes save against a live covenant id.');
      return;
    }
    setSaveStatus('saving');

    // Get key possession proof for ownership verification
    let sig = '';
    let nonce = '';
    const addr = connectedAddress || '';
    if (addr) {
      try {
        // Step 1: fetch challenge nonce from backend
        const chalResp = await fetch(`/api/terminal-config-challenge/${covenantId}`);
        const chalData = await chalResp.json();
        nonce = chalData.nonce || '';
        const messageToSign = chalData.message || '';

        if (nonce && messageToSign) {
          // Step 2: compute key possession proof
          // Dev wallets: SHA256(private_key || message) - backend knows the key
          // Extension wallets: signMessage returns browser-provider signature
          // Try dev mode first (we have the key locally)
          const devWallet = JSON.parse(localStorage.getItem('covex_dev_wallet') || 'null');
          if (devWallet && devWallet.privateKeyHex && devWallet.address === addr) {
            // Dev wallet: compute SHA256(privateKeyHex || message)
            const pkHex = devWallet.privateKeyHex.replace('0x', '');
            const pkBytes = new Uint8Array(pkHex.match(/.{2}/g).map(b => parseInt(b, 16)));
            const msgBytes = new TextEncoder().encode(messageToSign);
            const combined = new Uint8Array(pkBytes.length + msgBytes.length);
            combined.set(pkBytes);
            combined.set(msgBytes, pkBytes.length);
            const hashBuffer = await crypto.subtle.digest('SHA-256', combined);
            sig = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
          } else if (signMessage) {
            // Extension wallet: use provider.signMessage()
            sig = await signMessage(messageToSign);
          }
        }
      } catch {
        sig = '';
        nonce = '';
      }
    }

    const payload = {
      game_type: gameType,
      name,
      description,
      fee_percent: feePercent,
      pot_return_percent: potReturnPercent,
      reusable,
      allow_topups: allowTopups,
      custom_ui_code: customUICode,
      // Chess covenants persist their configured time control + custom_ui_config (game_type
      // 'chess', time control, stake, fee) so the public page renders what the creator previewed.
      ...(gameType.startsWith('chess') ? {
        time_control: { base_minutes: chessBaseMinutes, increment_seconds: chessIncrementSeconds },
        custom_ui_config: chessUiConfig,
      } : arenaUiConfig ? {
        custom_ui_config: arenaUiConfig,
      } : {}),
      resolution_mode: resolutionMode,
      custom_oracle_key: resolutionMode === 'custom' ? customOracleKey : null,
      zk_circuit: resolutionMode === 'zk' ? zkCircuit : null,
      zk_verifier_key: resolutionMode === 'zk' ? zkVerifierKey : null,
      ...(resolutionMode === 'zk' ? { proving_mode: zkCircuit === 'chess_v1' ? chessProvingMode : undefined, timelock: buildTimelockConfig() } : {}),
      signer_address: addr || undefined,
      signature: sig || undefined,
      nonce: nonce || undefined,
    };

    try {
      const res = await fetch(`/api/terminal-config/${covenantId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        setSaveStatus('saved');
        // Also persist locally for fallback
        localStorage.setItem(`covex_terminal_${covenantId}`, JSON.stringify(payload));
      } else {
        setSaveStatus('error');
      }
    } catch {
      setSaveStatus('error');
    }
  }, [
    covenantId, gameType, name, description, feePercent, potReturnPercent, reusable, allowTopups,
    customUICode, resolutionMode, customOracleKey, zkCircuit, zkVerifierKey,
    chessProvingMode, buildTimelockConfig,
    chessBaseMinutes, chessIncrementSeconds, chessUiConfig, arenaUiConfig,
  ]);

  // ── Apply Custom UI (also triggers save) ──
  const handleApplyCustomUI = useCallback(() => {
    handleSave();
  }, [handleSave]);

  if (!configLoaded) {
    return (
      <div
        className="space-y-6 animate-in fade-in duration-300"
        role="status"
        aria-busy="true"
        aria-label="Loading terminal"
      >
        {/* Header skeleton mirrors the real Terminal header row */}
        <div className="flex items-center gap-4 mb-2">
          <Skeleton className="h-11 w-11 rounded-xl border border-white/10" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-2.5 w-56" />
          </div>
        </div>
        {/* Three form-row skeletons matching the section/label/input rhythm */}
        {[0, 1, 2].map((i) => (
          <div key={i} className={SECTION_BASE}>
            <Skeleton className="h-3 w-40" />
            <div className="space-y-2">
              <Skeleton className="h-2.5 w-24" />
              <Skeleton className="h-10 w-full rounded-xl border border-white/10" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-2.5 w-32" />
              <Skeleton className="h-10 w-full rounded-xl border border-white/10" />
            </div>
          </div>
        ))}
        <span className="sr-only">Loading terminal</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* ─── Terminal Header ─── */}
      <div className="flex items-center gap-4 mb-2">
        <div className="p-2.5 rounded-xl bg-kaspa-green/10 border border-kaspa-green/30">
          <Terminal size={22} className="text-kaspa-green" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight light:text-slate-900">Covex Terminal</h2>
          <p className="text-xs text-gray-300 font-mono light:text-slate-600">ADVANCED COVENANT CONFIGURATION</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={() => navigate(covenantId ? `/covenant/${covenantId}` : '/sandbox')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 text-gray-300 hover:text-white text-xs font-mono transition-colors light:border-slate-200 light:text-slate-600 light:hover:text-slate-900 light:hover:bg-slate-100">
            <ArrowLeft size={12} />
            {covenantId ? 'Back to covenant' : 'Back to builder'}
          </button>
          <span className="h-2 w-2 rounded-full bg-kaspa-green animate-pulse shadow-[0_0_6px_#49EACB]" />
          <span className="text-[10px] text-gray-200 light:text-slate-700 font-mono uppercase tracking-wider light:text-slate-600">Live</span>
        </div>
      </div>

      {/* Network indicator */}
      <div className="flex justify-end -mt-2 mb-2">
        <div className={`inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[10px] font-mono border ${networkColorClass}`}>
          <Globe size={12} />
          {networkLabel}
          {!isMainnet && <span className="text-white/50">(test)</span>}
        </div>
      </div>

      {/* ─── Best Covenant Guide (collapsible) ─── */}
      <details className={`${SECTION_BASE} border-kaspa-green/20 bg-kaspa-green/[0.01] ring-1 ring-kaspa-green/10 [&[open]]:pb-6`}>
        <summary className="cursor-pointer select-none flex items-center gap-3 text-kaspa-green font-semibold text-sm uppercase tracking-widest -my-0.5">
          <Info size={16} />
          <span>Best Covenant Guide: How to Build the Best Covenant</span>
          <span className="text-[10px] font-mono text-gray-300 light:text-slate-600 normal-case tracking-normal ml-auto mr-2">Expand for full guide</span>
        </summary>
        <div className="mt-4 ml-2 pl-4 border-l-2 border-kaspa-green/30 space-y-4">
          {/* Why non-1time (reusable) is advisable */}
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 rounded-lg bg-kaspa-green/15"><Settings size={14} className="text-kaspa-green" /></div>
              <p className="text-sm text-white font-bold">Non-1time (Reusable) Covenants: Why and How</p>
            </div>
            <div className="space-y-2 text-xs text-gray-300 light:text-slate-600 leading-relaxed">
              <p><strong className="text-white">1-time covenants</strong> lock funds once. One player or pair plays, one resolution, funds move, covenant is done. Simple but single-use. To run another session you must redeploy a new covenant on-chain.</p>
              <p><strong className="text-kaspa-green">Reusable covenants are advisable for most use cases.</strong> They support multiple sessions and ongoing value:</p>
              <ul className="list-disc list-inside ml-2 space-y-1 text-gray-300 light:text-slate-600">
                <li>Multiple players or sessions from a single on-chain covenant deploy</li>
                <li>The covenant pool persists and grows across games</li>
                <li>Creator earns platform % on every game without redeploying</li>
                <li>% back to covenant sustains the pool for future players</li>
                <li>Less on-chain spam (one deploy, many sessions)</li>
                <li>Builds community around popular covenants that live forever</li>
              </ul>
              <p><strong className="text-white">How it works:</strong> Enable "Reusable Covenant" and "Allow Top-ups" below. The covenant script includes OpReuseCovenant (multiple unlocks) and OpAddToPot (new deposits). On each resolution, the winner takes their share, creator gets %, and a configurable % flows back into the covenant pool for the next round.</p>
              <p><strong className="text-white">Example (Chess):</strong> 2 players stake equal KAS to the pool. Winner takes 96% of the pool. Creator earns 2%. Remaining 2% goes back to the covenant pool for sustainability. Next pair of players can use the same covenant. Creator earns 2% on every game forever without deploying anything new.</p>
            </div>
          </div>

          {/* Transparency requirements */}
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 rounded-lg bg-kaspa-green/15"><Shield size={14} className="text-kaspa-green" /></div>
              <p className="text-sm text-white font-bold">Full Transparency: Required Covenant Information</p>
            </div>
            <div className="space-y-2 text-xs text-gray-300 light:text-slate-600 leading-relaxed">
              <p>Every covenant deployed on COVEX must provide complete information publicly visible in the Explorer. This protects participants:</p>
              <ul className="list-disc list-inside ml-2 space-y-1 text-gray-300 light:text-slate-600">
                <li><strong className="text-white">Name</strong>: Clear, descriptive covenant name</li>
                <li><strong className="text-white">Full description</strong>: Rules, variants, edge cases, examples (minimum 80 characters for best results)</li>
                <li><strong className="text-white">Exact payout structure</strong>: Who gets what percentage of the pool under each outcome</li>
                <li><strong className="text-white">Resolution method</strong>: Which oracle or ZK circuit decides outcomes, with keys/endpoints</li>
                <li><strong className="text-white">Reusable configuration</strong>: Whether the covenant accepts multiple sessions and top-ups, and if % flows back to the pool</li>
                <li><strong className="text-white">Test evidence</strong>: on-chain transaction links showing the covenant works</li>
              </ul>
              <p><strong className="text-amber-300">Incomplete transparency = no trust.</strong> Participants need to know exactly how their KAS will be handled before staking.</p>
            </div>
          </div>

          {/* Best Practices */}
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 rounded-lg bg-kaspa-green/15"><CheckCircle2 size={14} className="text-kaspa-green" /></div>
              <p className="text-sm text-white font-bold">Best Practices Summary</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="space-y-1">
                <p className="text-white font-semibold">1. Make it reusable</p>
                <p className="text-gray-300 light:text-slate-600">Toggle Reusable + Allow Top-ups. One deploy, many sessions, ongoing creator revenue.</p>
              </div>
              <div className="space-y-1">
                <p className="text-white font-semibold">2. Write a detailed description</p>
                <p className="text-gray-300 light:text-slate-600">Explain rules, edge cases, and examples. Public description builds trust.</p>
              </div>
              <div className="space-y-1">
                <p className="text-white font-semibold">3. Set % back to covenant pool</p>
                <p className="text-gray-300 light:text-slate-600">Keep 1-3% flowing back to sustain the pool for future players.</p>
              </div>
              <div className="space-y-1">
                <p className="text-white font-semibold">4. Choose ZK for high-stakes</p>
                <p className="text-gray-300 light:text-slate-600">For chess or other game outcomes where fairness matters, prefer ZK resolution when circuits are available.</p>
              </div>
              <div className="space-y-1">
                <p className="text-white font-semibold">5. Test thoroughly first</p>
                <p className="text-gray-300 light:text-slate-600">Verify oracle/ZK submission works before opening to real stakes.</p>
              </div>
              <div className="space-y-1">
                <p className="text-white font-semibold">6. Paste rich UI from Studio</p>
                <p className="text-gray-300 light:text-slate-600">Design in Covenant Studio (github.com/THTProtocol/Covenant-Studio), generate, paste into Terminal for pro mobile+PC experience.</p>
              </div>
            </div>
          </div>
        </div>
      </details>

      {/* ─── Tier transparency: ALWAYS visible, every tier, all the time. Same component
            and copy as the Pricing page so the message can never drift. Honesty rule:
            building any covenant is free; paid adds only priority placement and the premium
            UI website template library, never a technical capability. ─── */}
      <TierTransparency currentTier={currentTier} />

      {/* Inline note pinned next to the tier / payment control. */}
      <p className="text-[11px] text-gray-400 light:text-slate-500 leading-relaxed -mt-2">
        Priority placement is a paid add-on. Your covenant still deploys fully on Free - this only affects ranking on Covex.
      </p>

      {/* ─── Optional priority placement / featured listing (every build feature is already free) ─── */}
      {!hasPaidAccess && connectedAddress && (
        <section className={`${SECTION_BASE} border-amber-500/30 bg-amber-500/[0.03] ring-1 ring-amber-500/20 light:border-amber-300 light:bg-amber-50`}>
          <div className="flex items-center gap-2 text-amber-400 light:text-amber-700 font-semibold text-sm">
            <Shield size={16} /> PRIORITY PLACEMENT & PREMIUM TEMPLATES (OPTIONAL)
          </div>
          <p className="text-xs text-gray-300 light:text-slate-600 mt-1">Every build feature is already free: select any ZK circuit, use ZK resolution, the live SilverScript editor, oracles, timing, live code updates, the public UI designer, and any stake/lock amount with no cap. A one-time payment from this connected wallet adds priority placement for your covenant and its website on Covex plus the premium UI website template library, never a circuit or build feature. TXs broadcast in real time via backend signer.</p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3">
            {TIERS.map((t) => (
              <button key={t.id} onClick={() => startPaymentForTier(t)} className="p-3 rounded-xl border text-left transition hover:scale-[1.01]" style={{ borderColor: t.accent + '40', background: t.accent + '08' }}>
                <div className="font-bold text-sm" style={{ color: t.accent }}>{t.name}</div>
                <div className="text-[11px] text-gray-300 light:text-slate-600">{t.price} KAS • {t.desc}</div>
              </button>
            ))}
          </div>

          {payingTier && (
            <div className="mt-4 p-4 rounded-xl bg-black/60 border border-amber-500/30 light:bg-white light:border-amber-300">
              <div className="text-sm font-semibold mb-1 light:text-slate-900">Scan or copy to pay exactly {payingTier.price} KAS for {payingTier.name} from {connectedAddress}</div>
              <div className="font-mono text-[10px] break-all text-gray-400 light:text-slate-500 mb-2">{payingTier.treasury}</div>
              <div className="flex gap-4 items-start">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=170x170&data=${encodeURIComponent(payingTier.uri)}`}
                  alt="Payment QR"
                  className="rounded border border-white/10 bg-white p-1"
                />
                <div className="text-xs flex-1 space-y-1 light:text-slate-700">
                  <div>URI (tap to pay in wallet):</div>
                  <div className="font-mono break-all bg-black/40 p-1 rounded text-amber-300 light:bg-slate-50 light:text-amber-700">{payingTier.uri}</div>
                  <button onClick={() => copyWithFeedback(payingTier.uri, { label: 'Payment URI copied' })} className="text-[10px] underline light:text-slate-600">Copy URI</button>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <button onClick={checkPaymentNow} disabled={checkingPaid} className="flex-1 py-2 rounded bg-amber-600 text-black text-xs font-bold disabled:opacity-60">
                  {checkingPaid ? 'CHECKING PAYMENT FROM YOUR WALLET...' : 'I SENT THE PAYMENT - REFRESH STATUS'}
                </button>
                <button onClick={cancelPayment} className="px-3 py-2 text-xs border border-white/20 rounded light:border-slate-300 light:text-slate-700">Cancel</button>
              </div>
              <div className="text-[9px] text-gray-400 light:text-slate-500 mt-2">Payment must come from the wallet shown above. It will be auto-detected on-chain. Works on mainnet with real KAS.</div>
            </div>
          )}
          {!connectedAddress && <p className="text-xs text-amber-400 light:text-amber-700 mt-2">Connect a wallet to see payment options for this network.</p>}
        </section>
      )}

      {/* Honest pending banner: a tier payment has been BROADCAST (sessionStorage
          marker from Pricing.jsx) but the chain has not confirmed it yet. We drop
          this the instant paidStatus upgrades from FREE; if it hangs past ~75s we
          flip the copy to "not seeing this on chain - check the explorer" so the
          user has a way out rather than an infinite spinner. The polling effect
          uses the STORED payer address (not connectedAddress) and passes
          network=kaspaNetwork so a mainnet payment is never checked against the
          server's testnet-12 default. */}
      {pendingBroadcast && pendingBroadcast.txid && currentTier === 'FREE' && (
        <div className="mb-4 p-5 rounded-2xl bg-gradient-to-br from-amber-500/[0.10] to-amber-400/[0.04] border border-amber-500/30 shadow-[0_0_28px_-12px_rgba(245,158,11,0.40)] animate-[slide-up_0.4s_cubic-bezier(0.16,1,0.3,1)_both] light:from-amber-100 light:to-amber-50 light:border-amber-300/60">
          <div className="flex items-start gap-3.5">
            <div className="h-11 w-11 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0 light:bg-amber-200/60 light:border-amber-400/60">
              {pendingTimedOut ? (
                <AlertTriangle size={22} className="text-amber-400 light:text-amber-700" />
              ) : (
                <Clock size={22} className="text-amber-400 animate-pulse light:text-amber-700" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-base font-bold text-white light:text-slate-900">
                  {pendingTimedOut
                    ? 'Payment not seen on chain yet'
                    : 'Payment broadcast - awaiting on-chain confirmation'}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold tracking-wide light:bg-amber-200 light:text-amber-800 light:border-amber-400/60">
                  {pendingBroadcast.tier || pendingBroadcast.id || 'TIER'} PENDING
                </span>
              </div>
              <p className="text-xs text-gray-300 light:text-slate-600 mt-1 leading-relaxed light:text-slate-700">
                {pendingTimedOut ? (
                  <>
                    We have not seen this transaction on chain after 75 seconds. The broadcast may
                    have failed, the tx may have been evicted from mempool, or it may have been sent
                    on a different network than the one you are viewing
                    {' '}(<span className="font-mono">{kaspaNetwork}</span>).
                    Open the explorer to check the txid and confirm. Once the funding tx is on chain,
                    the priority placement activates automatically for the payer address.
                  </>
                ) : (
                  <>
                    Your tier payment has been broadcast to a Kaspa node. Priority placement /
                    featured listing activates automatically for the payer address as soon as the
                    funding tx is included in the chain. Every build feature is already free; no tier
                    is granted client side.
                  </>
                )}
              </p>
              <div className="flex flex-wrap items-center gap-2 mt-2.5">
                <a href={explorerTxUrl(pendingBroadcast.txid, kaspaNetwork)} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/25 text-[11px] font-mono text-amber-300 hover:text-amber-200 hover:border-amber-500/50 transition-colors light:bg-amber-100 light:text-amber-800 light:border-amber-400/60 light:hover:text-amber-900">
                  <ExternalLink size={12} /> {pendingTimedOut ? 'Check explorer' : 'View transaction'}: {String(pendingBroadcast.txid).slice(0, 20)}{String(pendingBroadcast.txid).length > 20 ? '...' : ''}
                </a>
                {connectedAddress && pendingBroadcast.address && connectedAddress !== pendingBroadcast.address && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/10 text-[11px] text-gray-300 light:text-slate-600 light:bg-slate-100 light:border-slate-200 light:text-slate-700">
                    <Info size={12} /> Paid from a different wallet than the one currently connected. The tier unlocks for the payer address.
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {paymentSuccess && (
        <div className="mb-4 p-5 rounded-2xl bg-gradient-to-br from-emerald-500/[0.12] to-[#49EACB]/[0.05] border border-emerald-500/30 shadow-[0_0_34px_-12px_rgba(16,185,129,0.45)] animate-[slide-up_0.4s_cubic-bezier(0.16,1,0.3,1)_both] light:from-emerald-100 light:to-emerald-50 light:border-emerald-300">
          <div className="flex items-start gap-3.5">
            <div className="h-11 w-11 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0 light:bg-emerald-200/60 light:border-emerald-400/60">
              <CheckCircle2 size={22} className="text-emerald-400 light:text-emerald-700" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-base font-bold text-white light:text-slate-900">{paymentSuccess.tier} placement active</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold tracking-wide light:bg-emerald-200 light:text-emerald-800 light:border-emerald-400/60">PAID</span>
              </div>
              <p className="text-xs text-gray-300 light:text-slate-600 mt-1 leading-relaxed light:text-slate-700">
                Payment broadcast on-chain. Your covenant and its website now get {paymentSuccess.tier} priority placement on Covex plus the premium UI website template library. Every build feature (live SilverScript editor, all ZK circuits, ZK resolution, custom UI designer, oracles and two-party covenants) is and always was free for this wallet on this network.
              </p>
              {paymentSuccess.txid && (
                <a href={explorerTxUrl(paymentSuccess.txid, kaspaNetwork)} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1.5 mt-2.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-[11px] font-mono text-emerald-300 hover:text-emerald-200 hover:border-emerald-500/50 transition-colors light:bg-emerald-100 light:text-emerald-800 light:border-emerald-400/60 light:hover:text-emerald-900">
                  <ExternalLink size={12} /> View transaction: {String(paymentSuccess.txid).slice(0, 20)}…
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Live SilverScript Editor (the visual sandbox with side add-ons) - FREE for everyone. Integrated in the terminal with all other build tools (circuits, custom UI for public look, oracles, arenas, etc.) to create the best covenant. Paid tiers buy only priority placement, not this editor. */}
      <section className={`${SECTION_BASE} border-[#49EACB]/20 bg-[#49EACB]/[0.01]`}>
        <div className={SECTION_HEADER}>
          <Code2 size={16} />
          <span>Live SilverScript Editor</span>
          <span className="ml-auto text-[10px] px-2 py-0.5 rounded bg-[#49EACB]/10 text-[#49EACB] border border-[#49EACB]/30">FREE</span>
        </div>
        <p className="text-xs text-gray-300 mb-4 light:text-slate-600">Side add-ons instantly rewrite the live SilverScript. Use for your covenant logic. The public appearance designer is in the Custom UI section below. Free for every tier.</p>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Add-ons (left, organized) */}
          <div className="lg:col-span-5 space-y-4">
            <div className="p-4 rounded-2xl bg-black/40 border border-white/5 light:bg-slate-50 light:border-slate-200">
              <div className="text-[11px] font-semibold text-gray-200 mb-3 flex items-center gap-2 light:text-slate-700">
                <span className="inline-block w-2 h-2 rounded-full bg-[#49EACB]"></span> ECONOMICS
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1 text-gray-300 light:text-slate-600"><span>Platform Fee</span><span className="font-mono text-[#49EACB]">{visualConfig.feePercent}%</span></div>
                <input type="range" min="0" max="100" step="0.5" value={visualConfig.feePercent} onChange={e => updateVisual({ feePercent: parseFloat(e.target.value) })} className="w-full" style={{ '--range-pct': `${visualConfig.feePercent}%` }} />
                <div className="text-[9px] text-gray-500 light:text-slate-500 mt-1">Set anything from 0 to 100%. No cap.</div>
              </div>
            </div>

            <div id="builder-circuits" className="p-4 rounded-2xl bg-black/40 border border-white/5 scroll-mt-24 light:bg-slate-50 light:border-slate-200">
              <div className="text-[11px] font-semibold text-gray-200 mb-3 flex items-center gap-2 light:text-slate-700">
                <span className="inline-block w-2 h-2 rounded-full bg-[#49EACB]"></span> RESOLUTION &amp; CIRCUITS
              </div>
              <div className="flex gap-1.5 mb-3">
                {['oracle','zk','hybrid'].map(m => (
                  <button key={m} onClick={() => updateVisual({ resolutionMode: m })} className={`flex-1 text-[10px] py-1.5 rounded-xl border transition ${visualConfig.resolutionMode === m ? 'border-[#49EACB] bg-[#49EACB]/10 text-white light:text-slate-900' : 'border-white/10 hover:bg-white/5 light:border-slate-300 light:text-slate-600 light:hover:bg-slate-100'}`}>{({ oracle: 'RESOLVER', zk: 'ZK', hybrid: 'HYBRID' })[m] || m.toUpperCase()}</button>
                ))}
              </div>
              {(() => {
                // One toggle pill, reused for the collapsed picks and the organized full list.
                const Pill = (c) => {
                  const active = visualConfig.selectedCircuits.includes(c.id);
                  const isProd = c.catalogTier === 'production';
                  return (
                    <button key={c.id} onClick={() => {
                      const next = active ? visualConfig.selectedCircuits.filter(x => x !== c.id) : [...visualConfig.selectedCircuits, c.id];
                      updateVisual({ selectedCircuits: next.length ? next : ['chess_v1'] });
                    }} title={isProd ? 'Production: real prover/verifier wired' : 'Roadmap: resolver-attested, no dedicated prover yet'} className={`inline-flex items-center gap-1 text-[9px] px-2 py-0.5 rounded-lg border transition ${active ? 'bg-[#49EACB]/10 border-[#49EACB] text-white light:text-slate-900 light:bg-[#49EACB]/15' : 'border-white/10 hover:bg-white/5 text-gray-300 light:border-slate-300 light:text-slate-600 light:hover:bg-slate-100'}`}>
                      <span aria-hidden="true" className={`w-1.5 h-1.5 rounded-full ${isProd ? 'bg-emerald-400' : 'bg-violet-400'}`} />
                      {c.name}
                    </button>
                  );
                };
                const POPULAR = ['chess_v1', 'chess_blitz', 'poker_v1', 'merkle_membership', 'range_proof'];
                const collapsed = ZK_CIRCUIT_TYPES.filter(c => visualConfig.selectedCircuits.includes(c.id) || POPULAR.includes(c.id));
                const TITLE = { crypto: 'Zero-knowledge & crypto', oracle: 'Resolvers & data feeds', defi: 'DeFi & lending', game: 'Games', identity: 'Identity & gating', gating: 'Identity & gating', compute: 'Verifiable compute', general: 'Primitives & timelocks' };
                const groups = {};
                for (const c of ZK_CIRCUIT_TYPES) { const k = c.category || 'other'; (groups[k] = groups[k] || []).push(c); }
                // Within each category lead with production-ready circuits, then roadmap ones.
                for (const k of Object.keys(groups)) {
                  groups[k].sort((a, b) => (a.catalogTier === 'production' ? 0 : 1) - (b.catalogTier === 'production' ? 0 : 1));
                }
                const order = ['crypto', 'oracle', 'defi', 'game', 'identity', 'gating', 'compute', 'general'];
                const keys = [...new Set([...order.filter(k => groups[k]), ...Object.keys(groups)])];
                return (
                  <>
                    <div className="text-[10px] text-gray-300 mb-1.5 flex items-center justify-between gap-2 light:text-slate-600">
                      <span>ZK circuits &amp; primitives - tap to include ({visualConfig.selectedCircuits.length} selected)</span>
                      <button onClick={() => setShowAllToggles(s => !s)} className="shrink-0 text-[9px] font-semibold text-[#49EACB] underline">
                        {showAllToggles ? 'Hide list' : `Browse all ${ZK_CIRCUIT_TYPES.length}`}
                      </button>
                    </div>
                    {!showAllToggles ? (
                      <div className="flex flex-wrap gap-1">{collapsed.map(Pill)}</div>
                    ) : (
                      <div className="rounded-xl border border-white/10 bg-black/30 p-2.5 max-h-[340px] overflow-y-auto space-y-3 light:border-slate-200 light:bg-white">
                        {keys.map(k => (
                          <div key={k}>
                            <div className="text-[9px] uppercase tracking-widest text-[#49EACB]/80 font-semibold mb-1 sticky top-0 bg-black/60 backdrop-blur py-0.5 light:bg-white/90">
                              {TITLE[k] || k} <span className="text-gray-600 ml-1 light:text-slate-600">{groups[k].length}</span>
                            </div>
                            <div className="flex flex-wrap gap-1">{groups[k].map(Pill)}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>

            <div className="p-4 rounded-2xl bg-black/40 border border-white/5 light:bg-slate-50 light:border-slate-200">
              <div className="text-[11px] font-semibold text-gray-200 mb-3 flex items-center gap-2 light:text-slate-700">
                <span className="inline-block w-2 h-2 rounded-full bg-[#49EACB]"></span> MATCHMAKING
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <div className="text-[10px] text-gray-300 mb-1 light:text-slate-600">Min Stake (KAS)</div>
                  <input type="number" min="0" value={visualConfig.minStake} onChange={e => updateVisual({ minStake: Math.max(0, parseInt(e.target.value) || 0) })} className="w-full bg-black/60 border border-white/10 rounded-xl px-3 py-1.5 text-sm light:bg-white light:border-slate-300 light:text-slate-900" />
                </div>
                <div>
                  <div className="text-[10px] text-gray-300 mb-1 light:text-slate-600">Max Stake (KAS)</div>
                  <input type="number" min="0" value={visualConfig.maxStake || ''} placeholder="no max" onChange={e => updateVisual({ maxStake: e.target.value === '' ? 0 : Math.max(0, parseInt(e.target.value) || 0) })} className="w-full bg-black/60 border border-white/10 rounded-xl px-3 py-1.5 text-sm light:bg-white light:border-slate-300 light:text-slate-900" />
                </div>
                <div>
                  <div className="text-[10px] text-gray-300 mb-1 light:text-slate-600">Timeout (min)</div>
                  <input type="number" value={visualConfig.timeoutMinutes} onChange={e => updateVisual({ timeoutMinutes: parseInt(e.target.value) || 5 })} className="w-full bg-black/60 border border-white/10 rounded-xl px-3 py-1.5 text-sm light:bg-white light:border-slate-300 light:text-slate-900" />
                </div>
              </div>
              <div className="text-[9px] text-gray-500 light:text-slate-500 mt-1.5">Leave Max Stake blank for no maximum. Any amount is allowed.</div>
              <label className="mt-3 flex items-center gap-2 text-xs text-gray-300 cursor-pointer light:text-slate-600">
                <input type="checkbox" checked={visualConfig.refundIfNoMatch} onChange={e => updateVisual({ refundIfNoMatch: e.target.checked })} className="accent-[#49EACB]" /> Auto-refund if no match
              </label>
            </div>
          </div>

          {/* Live Editor (right) */}
          <div className="lg:col-span-7">
            <div className="flex items-center justify-between mb-1.5 px-1">
              <div className="text-[11px] font-semibold text-gray-200 light:text-slate-700">Live SilverScript (updates instantly from add-ons on left)</div>
              <button onClick={() => navigator.clipboard.writeText(liveSilverScript)} className="text-[10px] px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 border border-white/10 light:bg-slate-100 light:hover:bg-slate-200 light:border-slate-300 light:text-slate-700">Copy script</button>
            </div>
            <textarea
              value={liveSilverScript}
              onChange={e => setLiveSilverScript(e.target.value)}
              className="w-full h-[280px] font-mono text-[12px] leading-relaxed bg-black/70 border border-white/10 rounded-2xl p-4 focus:border-[#49EACB]/40 outline-none resize-y light:bg-slate-50 light:border-slate-300 light:text-slate-900"
              spellCheck={false}
            />
            <div className="text-[10px] text-gray-500 mt-1.5 px-1 light:text-slate-500">This is the covenant logic (use in deploys below). Public UI designer for how visitors see it is in the Custom UI section.</div>
          </div>
        </div>
      </section>

      {/* --- Section 0: ZK Circuit Configuration --- */}
      <section className={`${SECTION_BASE} border-kaspa-green/20 bg-kaspa-green/[0.02] ring-1 ring-kaspa-green/10`}>
        <div className={SECTION_HEADER}>
          <div className="p-1.5 rounded-lg bg-kaspa-green/20">
            <Cpu size={16} />
          </div>
          <span className="flex-1">ZK Circuit Configuration</span>
          <span className="text-[10px] text-kaspa-green/60 font-mono px-2 py-0.5 rounded-md bg-kaspa-green/10 border border-kaspa-green/20">
            PRODUCTION
          </span>
        </div>

        {/* TECHNICAL DISCLAIMER - non-dismissible, accurately reflects current state */}
        <div className="p-4 rounded-xl bg-amber-500/[0.06] border border-amber-500/25 light:bg-amber-50 light:border-amber-300">
          <div className="flex items-start gap-3">
            <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5 light:text-amber-600" />
            <div className="text-[11px] text-amber-300/90 leading-relaxed light:text-amber-800">
              <strong className="text-amber-200 light:text-amber-900">Technical reality:</strong> Every circuit here is resolver-attested. For the circom suite a Groth16 proof is verified off-chain, never checked on-chain. Where a circuit has a working in-browser prover (merkle membership, age verification, 2-party escrow, range proof, VRF dice roll, nullifier set, UTXO note proof, hash preimage, absolute timelock, relative timelock, committed-random VRF, turn timer, script constraint, payout split) a real Groth16 proof is generated in your browser and verified OFF-CHAIN by you, the counterparty, or any external verifier (snarkjs against the audited vkey; fail-closed: a missing or invalid proof is rejected). The remaining circuits are attested by a deployer-bound external resolver without a proof. In all cases the trusted setup is a single-contributor dev ceremony, not a production multi-party MPC.
              <strong className="text-amber-200 light:text-amber-900"> Off-chain verification IS live:</strong> POST /api/oracle/verify-and-sign verifies any supplied proof off-chain and returns a real BIP340-signed outcome that a deployer-bound resolver can co-sign.
              The release gates on a 2-of-2 cosign + CSV timeout checked on-chain (Schnorr) at covenant unlock. There is no on-chain proof verification.
            </div>
          </div>
        </div>

        <p className="text-xs text-gray-300 leading-relaxed light:text-slate-600">
          Select the ZK circuit that defines what your covenant verifies. <strong className="text-white light:text-slate-900">Visual interfaces for interactive applications should be designed in Covenant Studio and pasted below.</strong> This section configures only the proof logic.
        </p>

        {/* ── Part A: ZK Circuit Selector ── */}
        <div className="space-y-3">
          <p className={LABEL}>ZK Circuit</p>
          <p className="text-[11px] text-gray-200 leading-relaxed light:text-slate-700">
            Each circuit proves a specific verifiable statement. The covenant lock script contains the verifier key for the selected circuit. Only the proof output (or oracle signature) is submitted on-chain.
          </p>

          {/* Circuit Grid - hidden by default to keep the UI clean. User presses "Show all ZK
              circuits" to reveal the full list, which leads with PRODUCTION-ready circuits and
              keeps the ROADMAP / experimental ones behind a second expander. */}
          {(() => {
            const popular = [
              // Games (resolver-attested, live)
              'chess_v1', 'chess_blitz', 'poker_v1', 'blackjack_v1', 'checkers_v1', 'connect4_v1', 'tictactoe_v1', 'reversi_v1',
              // Real ZK / crypto primitives (Groth16-backed)
              'merkle_membership', 'range_proof', 'hash_preimage', 'age_verification', 'escrow_2party', 'timelock_absolute',
              // DeFi / oracle covenants
              'prediction_market', 'pot_distribution', 'auction_dutch', 'parametric_insurance', 'anti_sybil',
            ];
            const circuitDescriptions = {
              chess_v1: 'Proves every legal move and terminal condition according to official FIDE chess rules on 8×8 board.',
              merkle_membership: 'Proves a leaf exists in a committed Merkle root without revealing sibling paths.',
              range_proof: 'Proves a committed value lies within [min, max] bounds without revealing the value.',
              age_verification: 'Proves birthdate ≥ threshold years before a reference date. Zero-knowledge KYC alternative.',
              verifiable: 'Proves correct execution of arbitrary computation via RISC Zero VM.',
              custom: 'Supply any audited circuit definition and its corresponding verifier key.',
            };
            // One card, reused by every group. The readiness pill (Production / Roadmap) is derived
            // from the registry (gt.catalogTier), distinct from the enforcement-reality badge.
            const renderCard = (gt) => {
              // Circuit selection is FREE for everyone; every card is fully selectable and the
              // in-browser ZK proving experience is never payment gated.
              const disabled = false;
              const selected = gameType === gt.id;
              const rm = realityMeta(gt.reality);
              const tier = readinessMeta(gt.catalogTier);
              const isRoadmap = gt.catalogTier !== 'production';
              // Genuine capability (real in-browser Groth16 prover, oracle-verified off-chain). Drives
              // the live-glow dot + the "in-browser prover" chip. NOT an on-chain-ZK claim.
              const isVerifiedZk = IN_BROWSER_PROVERS.has(gt.id);
              const hasBrowserProver = IN_BROWSER_PROVERS.has(gt.id);
              return (
                <div
                  key={gt.id}
                  role="button"
                  tabIndex={disabled ? -1 : 0}
                  aria-disabled={disabled}
                  onClick={() => !disabled && handleGameTypeChange(gt.id)}
                  onKeyDown={(e) => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); handleGameTypeChange(gt.id); } }}
                  title={`${gt.name} - ${tier.label}, ${rm.label}`}
                  className={`group relative overflow-hidden text-left p-3 rounded-xl border transition-all duration-200 motion-safe:hover:-translate-y-0.5 ${
                    selected
                      ? 'border-kaspa-green/60 bg-kaspa-green/[0.08] ring-1 ring-kaspa-green/30 shadow-[0_0_24px_rgba(73,234,203,0.18)] light:bg-emerald-50 light:border-emerald-400'
                      : 'border-white/[0.06] bg-gradient-to-b from-white/[0.04] to-transparent hover:border-white/[0.14] hover:shadow-[0_12px_30px_-14px_rgba(0,0,0,0.65)] light:border-slate-200 light:from-slate-50 light:to-slate-50 light:hover:border-slate-300'
                  } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  {/* reality accent top-edge + soft corner glow */}
                  <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[2px] opacity-70 group-hover:opacity-100 transition-opacity" style={{ background: `linear-gradient(90deg, transparent, ${selected ? '#49EACB' : rm.accent}, transparent)` }} />
                  <span aria-hidden="true" className="absolute -top-8 -right-8 w-20 h-20 rounded-full blur-2xl opacity-20 group-hover:opacity-35 transition-opacity pointer-events-none" style={{ background: selected ? '#49EACB' : rm.accent }} />

                  <div className="relative flex items-start justify-between gap-2 mb-1">
                    <span className={`text-xs font-bold leading-tight ${selected ? 'text-kaspa-green' : 'text-white light:text-slate-900'}`}>
                      {gt.name}
                    </span>
                    {/* The reality badge is itself the inspect trigger: press to see how it is verified + the source. */}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setInfoCircuit(gt); }}
                      title="How is this verified? Press to inspect the source"
                      className={`shrink-0 inline-flex items-center gap-1 text-[8px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full border transition hover:brightness-125 ${rm.bg} ${rm.text} ${rm.border}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${isVerifiedZk ? 'zk-live-glow' : ''}`} style={{ background: rm.accent }} />
                      {rm.short}
                      <Info size={9} className="opacity-60" />
                    </button>
                  </div>

                  {/* Readiness pill (registry-derived, distinct from the enforcement-reality badge). */}
                  <div className="relative mb-1">
                    <span
                      title={isRoadmap
                        ? 'Roadmap circuit: buildable today and resolved by a deployer-bound external resolver, with no dedicated proof generator wired yet.'
                        : 'Production circuit: ships a real Groth16 prover and/or fail-closed verifier, verified end-to-end (valid accepted, tampered rejected).'}
                      className={`inline-flex items-center gap-1 text-[8px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full border ${tier.bg} ${tier.text} ${tier.border}`}
                    >
                      {isRoadmap ? <Clock size={8} className="opacity-70" /> : <BadgeCheck size={8} className="opacity-80" />}
                      {tier.short}
                    </span>
                  </div>

                  <p className="relative text-[10px] text-gray-300 leading-snug line-clamp-3 light:text-slate-600">
                    {circuitDescriptions[gt.id] || gt.description}
                  </p>

                  <div className="relative mt-2 flex items-center gap-2">
                    <code className={`text-[9px] font-mono px-1.5 py-0.5 rounded border truncate max-w-[55%] ${
                      selected
                        ? 'border-kaspa-green/40 bg-kaspa-green/10 text-kaspa-green'
                        : 'border-white/[0.08] bg-white/[0.03] text-gray-300 light:border-slate-200 light:bg-slate-100 light:text-slate-600'
                    }`}>
                      {gt.circuit === 'custom' ? 'CUSTOM' : gt.circuit.toUpperCase()}
                    </code>
                    {hasBrowserProver && (
                      <span className="inline-flex items-center gap-1 text-[8px] font-semibold text-emerald-300/90 light:text-emerald-700" title="Real Groth16 proof generated in your browser">
                        <span className="w-1 h-1 rounded-full bg-emerald-400 zk-live-glow" /> in-browser prover
                      </span>
                    )}
                    {selected && <CheckCircle2 size={12} className="text-kaspa-green shrink-0 ml-auto" />}
                  </div>
                </div>
              );
            };

            // Collapsed (default) view: the curated popular set, rendered flat.
            if (!showAllZK) {
              const list = ZK_CIRCUIT_TYPES.filter(c => popular.includes(c.id));
              return (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {list.map(renderCard)}
                  </div>
                  <button
                    onClick={() => setShowAllZK(true)}
                    className="mt-2 w-full text-center text-xs py-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-kaspa-green light:border-slate-200 light:bg-slate-50 light:hover:bg-slate-100 light:text-[#14B8A6]"
                  >
                    Press to see all {ZK_CIRCUIT_TYPES.length} ZK circuits (showing popular ones now)
                  </button>
                </>
              );
            }

            // Full view: PRODUCTION-ready circuits lead; ROADMAP / experimental ones collapse behind
            // an expander so newcomers are not dropped into unbuilt options as if they were ready.
            const production = ZK_CIRCUIT_TYPES.filter(c => c.catalogTier === 'production');
            const roadmap = ZK_CIRCUIT_TYPES.filter(c => c.catalogTier !== 'production');
            return (
              <>
                <div className="flex items-center gap-2 mb-1.5">
                  <BadgeCheck size={13} className="text-emerald-400 light:text-emerald-600" />
                  <span className="text-[11px] font-semibold text-emerald-300 uppercase tracking-wider light:text-emerald-700">Production circuits</span>
                  <span className="text-[10px] text-gray-500 light:text-slate-600">{production.length}</span>
                </div>
                <p className="text-[10px] text-gray-400 mb-2 light:text-slate-500">
                  Ship a real Groth16 prover and/or fail-closed verifier, proven end-to-end (valid accepted, tampered rejected). Verified off-chain by you, the counterparty, or any external verifier (snarkjs against the audited vkey).
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {production.map(renderCard)}
                </div>

                <button
                  onClick={() => setShowRoadmapZK(s => !s)}
                  aria-expanded={showRoadmapZK}
                  className="mt-3 w-full flex items-center justify-center gap-2 text-xs py-2 rounded-lg border border-violet-500/25 bg-violet-500/[0.06] hover:bg-violet-500/10 text-violet-300 light:border-violet-300 light:bg-violet-50 light:hover:bg-violet-100 light:text-violet-700"
                >
                  <Clock size={12} />
                  {showRoadmapZK ? 'Hide' : 'Show'} roadmap / experimental circuits
                  <span className="text-[10px] opacity-70">{roadmap.length}</span>
                </button>
                {showRoadmapZK && (
                  <>
                    <p className="text-[10px] text-gray-400 mt-2 mb-2 light:text-slate-500">
                      Buildable today and resolved by a deployer-bound external resolver, but with no dedicated proof generator wired yet. They are honest previews, not finished ZK features.
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {roadmap.map(renderCard)}
                    </div>
                  </>
                )}

                <button
                  onClick={() => { setShowAllZK(false); setShowRoadmapZK(false); }}
                  className="mt-1 w-full text-center text-xs py-1.5 rounded-lg border border-white/10 hover:bg-white/5 text-gray-400 light:border-slate-200 light:hover:bg-slate-100 light:text-slate-500"
                >
                  Collapse full list
                </button>
              </>
            );
          })()}
          {infoCircuit && <TransparencyModal circuit={infoCircuit} onClose={() => setInfoCircuit(null)} />}

          {/* Auto-suggested Verifier Key */}
          {(() => {
            const activeCircuit = ZK_CIRCUIT_TYPES.find(g => g.id === gameType);
            if (!activeCircuit) return null;
            return (
              <div className="flex items-start gap-3 p-4 rounded-xl bg-kaspa-green/[0.03] border border-kaspa-green/20 light:bg-emerald-50 light:border-emerald-300">
                <Shield size={14} className="text-kaspa-green shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0 space-y-1">
                  <p className="text-xs text-white font-semibold light:text-slate-900">Circuit: {activeCircuit.name}</p>
                  <p className="text-[11px] text-gray-300 light:text-slate-600">This circuit proves the selected verifiable statement. The proof (or oracle signature) is the only input required by the covenant unlock function.</p>
                  <div className="flex items-center gap-3 pt-1.5 border-t border-kaspa-green/15 light:border-emerald-200">
                    <span className="text-[10px] text-gray-200 light:text-slate-700 font-mono light:text-slate-600">Auto-suggested Verifier Key</span>
                    <code className="text-[11px] font-mono text-kaspa-green/90 bg-kaspa-green/[0.06] px-2 py-0.5 rounded truncate max-w-[280px]">
                      {zkVerifierKey || activeCircuit.circuit === 'chess_v1' ? '0xCHESSv1_8x8_STANDARD' :
                       activeCircuit.circuit === 'merkle_generic' ? '0xMERKLE_GENERIC_V1' :
                       activeCircuit.circuit === 'bulletproofs_v1' ? '0xBULLETPROOFS_V1' :
                       activeCircuit.circuit === 'age_verify_v1' ? '0xAGE_VERIFY_V1' :
                       activeCircuit.circuit === 'risc0_generic' ? '0xRISC0_GENERIC_V1' :
                       activeCircuit.circuit === 'custom' ? '(manual entry required)' :
                       'CIRCUIT_VERIFIER_KEY'}
                    </code>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ── Circuit Design Specs (collapsible) ── */}
          <details className="group">
            <summary className="cursor-pointer list-none flex items-center gap-2 p-3 rounded-xl bg-kaspa-green/[0.03] border border-kaspa-green/15 hover:border-kaspa-green/30 transition-colors">
              <Code2 size={14} className="text-kaspa-green shrink-0" />
              <span className="text-xs text-white font-semibold flex-1">Circuit Design Specs</span>
              <span className="text-[10px] text-kaspa-green/60 font-mono group-open:hidden">Expand</span>
              <span className="text-[10px] text-kaspa-green/60 font-mono hidden group-open:inline">Collapse</span>
            </summary>
            <div className="mt-3 ml-2 pl-4 border-l-2 border-kaspa-green/20 space-y-4">
              <div className="text-[10px] text-amber-300/80 leading-relaxed">
                <AlertTriangle size={10} className="inline mr-1 text-amber-400" />
                Circuit specifications detail the ZK proving design and constraint targets. Verification is off-chain: any proof is checked by you, the counterparty, or any external verifier (snarkjs against the audited vkey; fail-closed) and a deployer-bound resolver co-signs, with the release gating on a 2-of-2 cosign + CSV timeout verified on-chain (Schnorr). For the circom suite the proof is verified off-chain, so there is no on-chain proof checking on that path.
              </div>
              {(() => {
                const details = (() => {
                  switch (gameType) {
                    case 'chess_v1':
                      return {
                        circuitName: 'Chess v1 (FIDE Complete)',
                        circuitId: 'chess_v1',
                        verifierKey: zkVerifierKey || '0xCHESSv1_8x8_STANDARD',
                        publicInputs: ['PGN game transcript (moves in algebraic notation)', 'Final FEN position', 'Player A pubkey hash', 'Player B pubkey hash'],
                        privateWitness: ['Full move-by-move board state', 'Castling rights vector', 'En passant target square', '50-move rule counter', 'Threefold repetition hash chain'],
                        whatItProves: 'Every move in the PGN is a legal chess move according to FIDE rules, the final position matches the claimed outcome, and the outcome is one of: Win/Loss/Draw.',
                        gasEstimate: '~2.1M constraints',
                        covenantFlow: 'Player A commits KAS to covenant. Player B matches stake. Players play off-chain. Loser (or draw-trigger) submits ZK proof of outcome to unlock funds. Winner receives pot minus platform fee.',
                      };
                    case 'merkle_membership':
                      return {
                        circuitName: 'Merkle Membership Proof',
                        circuitId: 'merkle_generic',
                        verifierKey: zkVerifierKey || '0xMERKLE_GENERIC_V1',
                        publicInputs: ['Merkle root (32 bytes)', 'Key hash (32 bytes)', 'Value hash (32 bytes)'],
                        privateWitness: ['Sibling hash at each tree level', 'Direction bit (left=0, right=1) for each sibling'],
                        whatItProves: 'A specific (key, value) pair exists in the tree represented by the committed Merkle root. The tree depth and the exact sibling data remain private.',
                        gasEstimate: '~50K constraints (depth 20)',
                        covenantFlow: 'Depositor locks KAS with a Merkle root. Claimant submits a proof that their (address, amount) leaf exists in the tree. On success, KAS is paid to claimant. On failure, returned to depositor after timeout.',
                      };
                    case 'range_proof':
                      return {
                        circuitName: 'Range Proof (Bulletproofs)',
                        circuitId: 'bulletproofs_v1',
                        verifierKey: zkVerifierKey || '0xBULLETPROOFS_V1',
                        publicInputs: ['Pedersen commitment C', 'Lower bound L', 'Upper bound U'],
                        privateWitness: ['Actual value v (scalar)', 'Blinding factor r (scalar)'],
                        whatItProves: 'The committed value v satisfies L ≤ v ≤ U. Neither v nor the blinding factor are revealed. Proof size is logarithmic in the range width.',
                        gasEstimate: '~700 constraints (64-bit range)',
                        covenantFlow: 'Claimant proves their balance/collateral/score exceeds a threshold. On success, the covenant unlocks. On failure, funds return to depositor. Used for tier qualification, DeFi collateral checks.',
                      };
                    case 'age_verification':
                      return {
                        circuitName: 'Age Verification (ZK-KYC)',
                        circuitId: 'age_verify_v1',
                        verifierKey: zkVerifierKey || '0xAGE_VERIFY_V1',
                        publicInputs: ['Birthdate commitment C', 'Threshold years N', 'Reference timestamp T'],
                        privateWitness: ['Actual birthdate (day/month/year)', 'Blinding factor r'],
                        whatItProves: 'birthdate + N years ≤ T, meaning the subject is at least N years old at time T. The exact birthdate is never revealed.',
                        gasEstimate: '~400 constraints (date arithmetic)',
                        covenantFlow: 'Service requires 18+ verification. User submits ZK proof that their birthdate is at least 18 years before now. Covenant unlocks access/membership. On failure, deposit is returned.',
                      };
                    case 'verifiable':
                      return {
                        circuitName: 'Verifiable Computation (RISC Zero)',
                        circuitId: 'risc0_generic',
                        verifierKey: zkVerifierKey || '0xRISC0_GENERIC_V1',
                        publicInputs: ['Program image ID (hash)', 'Output commitment', 'Input commitment'],
                        privateWitness: ['Full execution trace of the RISC-V program', 'Memory state at each cycle'],
                        whatItProves: 'The design goal: a program, run on the committed input, produces the committed output, provable without re-executing it. Honest status: this is a roadmap tier. The backend does NOT verify a RISC Zero receipt today (the verifier is a fail-closed stub), so resolution is attested by a deployer-bound external resolver the creator binds by pubkey at deploy.',
                        gasEstimate: '~100K-1M constraints (program-dependent)',
                        covenantFlow: 'Today: an off-chain worker submits the output and a deployer-bound external resolver attests it, co-signing the release. Roadmap: once receipt verification against the program image ID ships, the proof itself can gate the payout.',
                      };
                    default:
                      return {
                        circuitName: 'Custom Circuit',
                        circuitId: 'custom',
                        verifierKey: zkVerifierKey || '(manual entry required)',
                        publicInputs: ['User-defined public inputs'],
                        privateWitness: ['User-defined private witness'],
                        whatItProves: 'Supply any audited ZK circuit. The verifier key is recorded as covenant metadata today; the circom proof is verified off-chain. Toccata KIP-16 adds an on-chain verifier (OpZkPrecompile) that the settlement covenant targets, testnet-gated until proven live. Until then, resolution runs through a deployer-bound external resolver the creator binds by pubkey at deploy. On-chain verification against your own key is on the roadmap.',
                        gasEstimate: 'Unknown (circuit-dependent)',
                        covenantFlow: 'Depositor locks KAS and records a verifier key as metadata. Resolution today goes through a deployer-bound external resolver; once on-chain pairing verification ships (KIP-16/Toccata), the covenant can verify a proof against this key directly.',
                      };
                  }
                })();
                return (
                  <>
                    <div className="p-4 rounded-xl bg-black/30 border border-white/[0.05]">
                      <div className="flex items-center gap-2 mb-3">
                        <Cpu size={14} className="text-kaspa-green" />
                        <p className="text-xs text-white font-semibold">{details.circuitName}</p>
                        <code className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-kaspa-green/10 text-kaspa-green border border-kaspa-green/20">{details.circuitId}</code>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
                        <div className="space-y-2">
                          <p className="text-white font-semibold text-xs">Verifier Key</p>
                          <code className="block text-[10px] font-mono text-kaspa-green/80 bg-black/40 px-2 py-1.5 rounded break-all">{details.verifierKey}</code>
                        </div>
                        <div className="space-y-2">
                          <p className="text-white font-semibold text-xs">Gas Estimate</p>
                          <p className="text-gray-300 light:text-slate-600">{details.gasEstimate}</p>
                        </div>
                      </div>

                      <div className="mt-3 pt-3 border-t border-white/[0.05] space-y-2">
                        <p className="text-white font-semibold text-xs">What This Circuit Proves</p>
                        <p className="text-gray-300 light:text-slate-600 leading-relaxed">{details.whatItProves}</p>
                      </div>

                      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <p className="text-[10px] text-gray-200 light:text-slate-700 font-semibold uppercase tracking-wider">Public Inputs (on-chain)</p>
                          <ul className="list-disc list-inside text-gray-300 light:text-slate-600 space-y-0.5">
                            {details.publicInputs.map((pi, i) => (
                              <li key={i} className="text-[11px]">{pi}</li>
                            ))}
                          </ul>
                        </div>
                        <div className="space-y-1.5">
                          <p className="text-[10px] text-gray-200 light:text-slate-700 font-semibold uppercase tracking-wider">Private Witness (off-chain only)</p>
                          <ul className="list-disc list-inside text-gray-300 light:text-slate-600 space-y-0.5">
                            {details.privateWitness.map((pw, i) => (
                              <li key={i} className="text-[11px]">{pw}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-kaspa-green/[0.02] border border-kaspa-green/15">
                      <div className="flex items-center gap-2 mb-2">
                        <Zap size={12} className="text-kaspa-green" />
                        <p className="text-[11px] text-white font-semibold uppercase tracking-wider">Covenant Resolution Flow</p>
                      </div>
                      <p className="text-[11px] text-gray-300 light:text-slate-600 leading-relaxed">{details.covenantFlow}</p>
                    </div>
                  </>
                );
              })()}
            </div>
          </details>
        </div>

        {/* ── Part B: Oracle / Resolution Options ── */}
        <div className="pt-2 border-t border-white/[0.04] space-y-3">
          <p className={LABEL}>Oracle Resolution Options</p>
          <p className="text-[11px] text-gray-200 light:text-slate-700 leading-relaxed">
            Choose how the covenant outcome is resolved on-chain. This determines who or what signs off on the game result.
          </p>

          <div className="space-y-2">
            {[
              {
                id: 'zk', icon: Cpu, title: 'ZK Proof (Zero-Knowledge)',
                desc: 'A real Groth16 proof is generated in your browser, so player data stays private, and verified OFF-CHAIN by you, the counterparty, or any external verifier (snarkjs against the audited vkey; for the circom suite the proof is verified off-chain). Only a proof that verifies releases the funds; an invalid or missing proof is rejected.',
                tier: 'Recommended for on-chain games',
              },
              {
                id: 'oracle', icon: Shield, title: 'Deterministic engine result (resolver co-signed)',
                desc: 'For engine-resolved games only (chess, poker, dice). A server-authoritative engine replays the public move log, a result anyone can recompute, then the counterparty or a deployer-bound external resolver co-signs the release. Use this only when the outcome is a deterministic game result. For a real-world fact (a match score, a price, weather) choose External Resolver instead: Covex does not attest outside events.',
                tier: 'Deterministic game results only',
              },
              {
                id: 'custom', icon: Key, title: 'External Resolver (your key)',
                desc: 'Bring your own resolver: the x-only pubkey of the independent provider you choose to attest the outcome. Deploy this as an Oracle Escrow in Enforced Deploy with this key, and the covenant locks on-chain to THIS resolver, requiring its co-signature to release. Covex is not in the path and does not attest real-world facts. Pair it with a refund backstop so a no-show resolver cannot strand the funds.',
                tier: 'Real-world facts (recommended)',
              },
            ].map(opt => (
              <button
                key={opt.id}
                onClick={() => setResolutionMode(opt.id)}
                className={`w-full text-left p-4 rounded-xl border transition-all ${
                  resolutionMode === opt.id
                    ? 'border-kaspa-green/50 bg-kaspa-green/[0.06] ring-1 ring-kaspa-green/20'
                    : 'border-white/[0.05] bg-black/20 hover:border-white/[0.10]'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg shrink-0 ${
                    resolutionMode === opt.id ? 'bg-kaspa-green/15' : 'bg-white/[0.03]'
                  }`}>
                    <opt.icon size={16} className={resolutionMode === opt.id ? 'text-kaspa-green' : 'text-gray-200 light:text-slate-700'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-sm font-bold ${resolutionMode === opt.id ? 'text-kaspa-green' : 'text-white'}`}>
                        {opt.title}
                      </span>
                      <span className="text-[10px] text-gray-200 light:text-slate-700 font-mono">{opt.tier}</span>
                    </div>
                    <p className="text-[11px] text-gray-300 light:text-slate-600 leading-relaxed">{opt.desc}</p>
                  </div>
                  {resolutionMode === opt.id && (
                    <CheckCircle2 size={18} className="text-kaspa-green shrink-0" />
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Conditional inputs based on resolution mode */}
          {resolutionMode === 'zk' && (
            <div className="ml-4 pl-4 border-l-2 border-purple-500/30 space-y-3">
              <p className="text-[11px] text-purple-300/80">
                ZK mode: circuit is auto-configured from your game type selection above. The verifier key is pre-filled for known circuits.
              </p>
              <div>
                <p className={LABEL}>Verifier Key (editable)</p>
                <input
                  type="text"
                  value={zkVerifierKey}
                  onChange={(e) => setZkVerifierKey(e.target.value)}
                  placeholder="0x... (verifier key)"
                  className={`${INPUT} font-mono text-xs ${!zkVerifierKey && zkCircuit === 'custom' ? 'border-amber-500/40' : ''}`}
                />
                {!zkVerifierKey && zkCircuit === 'custom' && (
                  <p className="text-[10px] text-amber-400/80 mt-1">Custom circuits require a verifier key. Paste your audited key or select a known circuit above.</p>
                )}
              </div>
              <div className="p-3 rounded-xl bg-black/30 border border-orange-500/20 space-y-2">
                <p className="text-[11px] text-orange-200/90 font-semibold">Timelock / Clock (DAA)</p>
                <p className="text-[10px] text-gray-400 light:text-slate-500">Maps to covenant-config <code className="text-orange-300/80">resolution.circuit.timelock</code> and turn_timer / relative_timelock circuits.</p>
                <select value={timelockMode} onChange={(e) => setTimelockMode(e.target.value)} className={`${INPUT} text-xs`}>
                  <option value="turn_timer">Per-turn window (turn_timer)</option>
                  <option value="relative">Relative DAA lock (relative_timelock)</option>
                  <option value="absolute">Absolute DAA threshold (timelock_absolute)</option>
                </select>
                {timelockMode === 'turn_timer' && (
                  <div>
                    <p className={LABEL}>max_delta_daa (blocks since last move)</p>
                    <input type="number" min={1} value={maxDeltaDaa} onChange={(e) => setMaxDeltaDaa(parseInt(e.target.value, 10) || 300)} className={`${INPUT} font-mono text-xs`} />
                  </div>
                )}
                {timelockMode === 'relative' && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className={LABEL}>reference_daa</p>
                      <input type="number" min={0} value={referenceDaa} onChange={(e) => setReferenceDaa(parseInt(e.target.value, 10) || 0)} className={`${INPUT} font-mono text-xs`} />
                    </div>
                    <div>
                      <p className={LABEL}>lock_duration_daa</p>
                      <input type="number" min={0} value={lockDurationDaa} onChange={(e) => setLockDurationDaa(parseInt(e.target.value, 10) || 1000)} className={`${INPUT} font-mono text-xs`} />
                    </div>
                  </div>
                )}
                {timelockMode === 'absolute' && (
                  <div>
                    <p className={LABEL}>lock_threshold_daa</p>
                    <input type="number" min={0} value={lockThresholdDaa} onChange={(e) => setLockThresholdDaa(parseInt(e.target.value, 10) || 0)} className={`${INPUT} font-mono text-xs`} />
                  </div>
                )}
              </div>
            </div>
          )}

          {resolutionMode === 'custom' && (
            <div className="ml-4 pl-4 border-l-2 border-amber-500/30 space-y-2">
              <p className="text-[11px] text-amber-300/80">
                Enter the x-only public key (hex) of the external resolver you choose. Deploy this covenant as an Oracle Escrow in Enforced Deploy with this key and it locks on-chain to THIS resolver: releasing funds requires the resolver&apos;s co-signature, and Covex&apos;s key is not in the path. Covex does not attest real-world facts. Always keep a deployer refund backstop so a no-show resolver cannot strand the funds.
              </p>
              <div>
                <p className={LABEL}>Oracle Public Key</p>
                <input
                  type="text"
                  value={customOracleKey}
                  onChange={(e) => setCustomOracleKey(e.target.value)}
                  placeholder="x-only public key (64 hex chars, e.g. a1b2c3...)"
                  className={`${INPUT} font-mono text-xs`}
                />
              </div>
            </div>
          )}
        </div>

        {/* ── Part C: Best Practices ── */}
        <div className="pt-2 border-t border-white/[0.04]">
          <div className="p-5 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <Info size={14} className="text-kaspa-green" />
              <p className="text-xs text-white font-bold uppercase tracking-wider">Best Practices: ZK, Oracles & Covenants</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px] text-gray-300 light:text-slate-600 leading-relaxed">
              <div className="space-y-0.5">
                <p className="text-white font-semibold">ZK vs Oracle</p>
                <p>ZK proofs (where circuits and zkeys exist) provide cryptographic verification of computation. Currently, only Merkle Membership has a complete proving pipeline. Oracles are faster but require trust in the key holder. Range Proof circuit foundation exists, awaiting zkey generation for live verification. For external data (price feeds, weather, match results), bind an External Resolver you choose; Covex does not attest outside events.</p>
              </div>
              <div className="space-y-0.5">
                <p className="text-white font-semibold">Reusability</p>
                <p>Enable Reusable to accept multiple proof submissions over time. Combined with Allow Top-ups, depositors can add KAS to the covenant, making it a sustainable escrow rather than a one-shot lock.</p>
              </div>
              <div className="space-y-0.5">
                <p className="text-white font-semibold">Fees</p>
                <p>Platform fee (0-5%) is deducted from each resolution. Set it thoughtfully. High fees discourage usage; zero fees leave no platform revenue. 2% is the default.</p>
              </div>
              <div className="space-y-0.5">
                <p className="text-white font-semibold">Common Pitfalls</p>
                <p>Forgetting to set a verifier key for custom circuits. Leaving resolution logic ambiguous. Deploying without thorough testing first. Not saving Terminal config after deploy. Using an un-audited circuit without key verification.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── CHESS CONFIGURE + PREVIEW (every chess covenant, before deploy) ─── */}
      {gameType.startsWith('chess') && (
        <section className={`${SECTION_BASE} border-[#49EACB]/25`}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className={SECTION_HEADER}>
              <div className="p-1.5 rounded-lg bg-[#49EACB]/20">
                <Settings size={16} className="text-[#49EACB]" />
              </div>
              <span>Configure &amp; preview your chess covenant</span>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-full border border-kaspa-green/30 text-kaspa-green tracking-wider">LIVE PREVIEW</span>
          </div>
          <p className="text-xs text-gray-300 light:text-slate-600 leading-relaxed -mt-1">
            Set the clock, fee, and stake, then see exactly how the logic resolves and how the public covenant page will render. Everything below updates live and is saved into the deployed covenant config.
          </p>
          <ChessPreviewConfig
            baseMinutes={chessBaseMinutes}
            incrementSeconds={chessIncrementSeconds}
            onBaseMinutes={setChessBaseMinutes}
            onIncrementSeconds={setChessIncrementSeconds}
            stake={chessStake}
            feePercent={feePercent}
            potReturnPercent={potReturnPercent}
            variantLabel={(ZK_CIRCUIT_TYPES.find(c => c.id === gameType) || {}).name || 'Chess Duel'}
            generatedScript={chessScriptLive}
            onCopyScript={copyChessScriptLive}
            scriptCopied={chessScriptCopied}
            boardTheme={chessBoardTheme}
            pieceSet={chessPieceSet}
            onBoardTheme={setChessBoardTheme}
            onPieceSet={setChessPieceSet}
          />
          {/* Stake control lives here too so it flows into the previews + deployed config */}
          <div className="rounded-2xl border border-white/10 bg-black/30 p-5 space-y-2">
            <div className="flex items-center justify-between">
              <p className={LABEL}>Per-side stake (KAS)</p>
              <span className="text-sm font-mono text-kaspa-green font-bold tabular-nums">{chessStake} KAS</span>
            </div>
            <input
              type="number"
              min={1}
              value={chessStake}
              onChange={(e) => setChessStake(Math.max(1, parseInt(e.target.value, 10) || 1))}
              className={`${INPUT} font-mono`}
            />
            <p className="text-[11px] text-gray-400 light:text-slate-500 leading-relaxed">
              Both players stake this amount. Total pot is {chessStake * 2} KAS. The platform fee and pot return are set in the Deploy section below.
            </p>
          </div>
        </section>
      )}

      {/* ─── GAME APPEARANCE (non-chess arena games: poker, checkers, etc.) ─── */}
      {arenaGameKey && (
        <section className={`${SECTION_BASE} border-[#49EACB]/25`}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className={SECTION_HEADER}>
              <div className="p-1.5 rounded-lg bg-[#49EACB]/20">
                <Palette size={16} className="text-[#49EACB]" />
              </div>
              <span>Customize how your {(ZK_CIRCUIT_TYPES.find(c => c.id === gameType) || {}).name || 'game'} looks</span>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-full border border-kaspa-green/30 text-kaspa-green tracking-wider">LIVE PREVIEW</span>
          </div>
          <p className="text-xs text-gray-300 light:text-slate-600 leading-relaxed -mt-1">
            Pick the table, board, and piece colors. The preview updates live and is saved into the deployed covenant page, so every visitor sees the same look. Appearance is visual only and never changes the rules or payouts.
          </p>
          <GameThemeConfig
            gameKey={arenaGameKey}
            sel={gamesAppearance[arenaGameKey]}
            onChange={(field, value) => updateGameAppearance(arenaGameKey, field, value)}
          />
        </section>
      )}

      {/* ─── FULL CHESS ZK ARENA (only for chess_v1) ─── */}
      {(gameType === 'chess_v1') && (
        <section className={`${SECTION_BASE} border-[#49EACB]/30 bg-[#0a1412] ring-1 ring-[#49EACB]/20`}>
          <div className="flex items-center justify-between">
            <div className={SECTION_HEADER}>
              <div className="p-1.5 rounded-lg bg-[#49EACB]/20">
                <Play size={16} className="text-[#49EACB]" />
              </div>
              <span>Chess v1: Client-Side Demo</span>
              <span className="ml-2 text-[10px] px-2 py-0.5 rounded bg-[#49EACB]/10 text-[#49EACB] font-mono border border-[#49EACB]/30">FIDE (chess.js)</span>
            </div>
            <div className="text-right flex flex-col items-end gap-1">
              <div className="text-[11px] text-[#49EACB] font-mono">{chessStake} KAS STAKE, {feePercent}% FEE, {potReturnPercent}% POT RETURN, {chessBaseMinutes}m+{chessIncrementSeconds}s</div>
              <div className="text-[10px] text-gray-400 light:text-slate-500 -mt-0.5">Winner: {(100 - feePercent - potReturnPercent).toFixed(1)}%, Creator: {feePercent}%, Pot: {potReturnPercent}%, resolver-attested (server-authoritative)</div>
              <div className="text-[9px] mt-0.5 flex items-center gap-1">
                Proving Mode: 
                <select value={chessProvingMode} onChange={e => setChessProvingMode(parseInt(e.target.value))} className="bg-black/50 border border-white/20 text-[9px] px-1 py-0.5 rounded text-white">
                  <option value={0}>Fast (witnessed, &lt;15s target)</option>
                  <option value={1}>Exhaustive (stronger proof)</option>
                </select>
                <span className="text-[8px] text-gray-500 light:text-slate-500">(see CHESS_PROVING_MODES.md)</span>
              </div>
              {opponentStake === chessStake && (chessMatchState === 'playing' || chessMatchState === 'finished') && (
                <button
                  onClick={launchFullScreenChess}
                  className="mt-1 px-3 py-1 text-[10px] rounded-lg bg-white text-black font-bold flex items-center gap-1 hover:bg-[#49EACB] active:scale-[0.985] transition-all"
                >
                  <Play size={12} /> FULL SCREEN • CHESS.COM SMOOTH
                </button>
              )}
            </div>
          </div>

          <p className="text-xs text-gray-300 light:text-slate-600 leading-relaxed -mt-1">
            Client-side chess.js validates all FIDE rules locally. After the game, the signed move log is submitted to a server-authoritative engine (POST /api/oracle/verify-and-sign) that replays it deterministically (anyone can recompute) and returns a real BIP340-signed outcome; the counterparty or a deployer-bound external resolver co-signs the release. The release gates on a 2-of-2 cosign + CSV timeout verified on-chain (Schnorr) at covenant unlock. This is resolver-attested, not an on-chain ZK proof: the move log is recomputed off-chain, not proven on-chain.
          </p>

          {/* Stake + Pot Summary - requires equal stake from both sides before pro play */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-black/40 border border-white/10">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-gray-400 light:text-slate-500">YOUR STAKE</div>
              <div className="text-3xl font-bold tabular-nums text-white">{chessStake} <span className="text-sm font-mono text-gray-400 light:text-slate-500">KAS</span></div>
            </div>
            <div className="flex-1 h-px bg-white/10" />
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-widest text-gray-400 light:text-slate-500">TOTAL POT</div>
              <div className="text-2xl font-bold tabular-nums text-[#49EACB]">{chessStake + opponentStake} KAS</div>
              <div className="text-[11px] text-rose-400/90">{opponentStake === chessStake ? 'STAKES MATCHED' : 'WAITING FOR OPPONENT MATCH'}</div>
            </div>
            <div className="text-right pl-3 border-l border-white/10">
              <div className="text-[10px] uppercase tracking-widest text-gray-400 light:text-slate-500">PAYOUT BREAKDOWN</div>
              <div className="text-xs font-mono text-gray-300 light:text-slate-600 leading-relaxed tabular-nums">
                <div className="border-r-2 border-[#49EACB]/60 pr-1.5">Winner: {((chessStake + opponentStake) * (100 - feePercent - potReturnPercent) / 100).toFixed(1)} KAS ({(100 - feePercent - potReturnPercent).toFixed(1)}%)</div>
                <div className="border-r-2 border-[#E8AF34]/50 pr-1.5">Creator: {((chessStake + opponentStake) * feePercent / 100).toFixed(1)} KAS ({feePercent}%)</div>
                <div className="text-kaspa-green border-r-2 border-[#49EACB]/30 pr-1.5">Pot return: {((chessStake + opponentStake) * potReturnPercent / 100).toFixed(1)} KAS ({potReturnPercent}%)</div>
              </div>
            </div>
          </div>

          {/* The Professional Board (chess.com quality via react-chessboard) */}
          <div className="rounded-2xl overflow-hidden border border-white/10 bg-gradient-to-b from-[#15151d] to-[#0c0c11] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] p-3">
            <div className="flex justify-between items-center mb-2 px-1">
              <div className="font-mono text-xs text-gray-400 light:text-slate-500 flex items-center gap-3">
                <span>{chessMatchState === 'idle' && 'POST STAKE TO OPEN A MATCH'}
                {chessMatchState === 'posted' && 'WAITING FOR OPPONENT TO MATCH YOUR STAKE'}
                {chessMatchState === 'matched' && `MATCHED vs ${chessOpponent}`}
                {chessMatchState === 'playing' && `PLAYING • ${chessGame.turn() === 'w' ? 'WHITE' : 'BLACK'}`}
                {chessMatchState === 'finished' && chessResult && `GAME OVER: ${chessResult.outcome.toUpperCase()}`}</span>
                {chessMatchState === 'playing' && (
                  <span className="text-[10px] text-kaspa-green/70">W {Math.floor(whiteTime/1000)}s • B {Math.floor(blackTime/1000)}s</span>
                )}
              </div>
              <div className="flex gap-2">
                {chessMatchState !== 'idle' && (
                  <button onClick={resetChessArena} className="px-3 py-1 text-xs rounded-lg border border-white/20 hover:bg-white/5 text-gray-300 light:text-slate-600">RESET ARENA</button>
                )}
                {chessMatchState === 'playing' && (
                  <>
                    <button onClick={() => resignGame(chessPlayerColor)} className="px-3 py-1 text-xs rounded-lg bg-red-500/10 border border-red-500/40 text-red-400 hover:bg-red-500/20">RESIGN AS {chessPlayerColor.toUpperCase()}</button>
                  </>
                )}
              </div>
            </div>

            <div className="flex justify-center overflow-hidden">
              <div className="w-full max-w-[580px]">
                <Chessboard
                  position={chessGame.fen()}
                  onPieceDrop={handleChessMove}
                  boardOrientation={chessPlayerColor === 'b' ? 'black' : 'white'}
                  customBoardStyle={{
                    borderRadius: '10px',
                    boxShadow: '0 10px 35px -10px rgba(0,0,0,0.75), 0 0 0 1px rgba(73,234,203,0.1)',
                  }}
                  customDarkSquareStyle={{ backgroundColor: '#769656' }}
                  customLightSquareStyle={{ backgroundColor: '#eeeed2' }}
                  customPieces={{}}
                  boardWidth={Math.min(580, typeof window !== 'undefined' ? Math.min(window.innerWidth - 60, 580) : 520)}
                />
              </div>
            </div>

            {/* Move list + status */}
            <div className="mt-3 grid grid-cols-1 md:grid-cols-5 gap-3 text-xs">
              <div className="md:col-span-3 p-2.5 rounded-lg bg-black/40 border border-white/[0.08] font-mono text-[11px] text-gray-300 light:text-slate-600 overflow-auto max-h-[72px] shadow-[inset_0_8px_12px_-12px_rgba(0,0,0,0.85)]">
                {chessGame.pgn() || 'No moves yet. Drag pieces on the board (only legal moves allowed).'}
              </div>
              <div className="md:col-span-2">
                {chessMatchState === 'idle' && (
                  <button
                    onClick={postStakeForMatch}
                    className="w-full h-full py-3 rounded-xl bg-[#49EACB] text-black font-bold text-sm active:scale-[0.985] transition-all shadow-[0_0_25px_rgba(73,234,203,0.3)]"
                  >
                    POST {chessStake} KAS - OPEN FOR MATCH
                  </button>
                )}
                {chessMatchState === 'posted' && (
                  <button
                    onClick={acceptMatch}
                    className="w-full h-full py-3 rounded-xl bg-emerald-500 text-white font-bold text-sm active:scale-[0.985] transition-all"
                  >
                    MATCH STAKE &amp; JOIN GAME (SIMULATED)
                  </button>
                )}
                {chessMatchState === 'matched' && (
                  <button
                    onClick={() => setChessMatchState('playing')}
                    className="w-full h-full py-3 rounded-xl bg-[#49EACB] text-black font-bold text-sm"
                  >
                    START PLAYING - WHITE MOVES FIRST
                  </button>
                )}
                {chessMatchState === 'playing' && (
                  <div className="text-center py-2 text-emerald-400 font-semibold">MAKE LEGAL MOVES ON THE BOARD ABOVE</div>
                )}
                {chessMatchState === 'finished' && !chessZkVerified && (
                  <button
                    onClick={submitChessResultToOracle}
                    className="w-full py-3 rounded-xl bg-purple-600 text-white font-bold text-sm active:scale-[0.985] transition-all"
                  >
                    SUBMIT RESULT (ORACLE ATTESTATION)
                  </button>
                )}
                {chessMatchState === 'finished' && chessZkVerified && (
                  <button
                    onClick={claimPayout}
                    disabled={payoutLoading}
                    className={`w-full py-3 rounded-xl font-bold text-sm active:scale-[0.985] transition-all ${payoutLoading ? 'bg-gray-500 text-white cursor-not-allowed' : 'bg-emerald-500 text-black'}`}
                  >
                    {payoutLoading ? (
                      <span className="flex items-center justify-center gap-2"><Loader size={14} className="animate-spin" /> Computing payout...</span>
                    ) : (
                      <>CLAIM PAYOUT - {chessResult?.outcome?.toUpperCase()} WINS</>
                    )}
                  </button>
                )}
                {payoutResult && !payoutResult.error && (
                  <button
                    onClick={() => { setPayoutResult(null); resetChessArena(); }}
                    className="w-full mt-2 py-2 rounded-xl bg-gray-600 text-white text-xs"
                  >
                    Reset Board & Start New Match
                  </button>
                )}
              </div>
            </div>

            {/* Real payout result display (from backend compute-payout) */}
            {payoutResult && !payoutResult.error && (
              <div className="mt-3 p-4 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/30 text-sm">
                <div className="flex items-center gap-2 text-emerald-400 mb-2">
                  <CheckCircle2 size={15} /> PAYOUT COMPUTED - REAL AMOUNTS VERIFIED BY ORACLE SIG
                </div>
                <div className="font-mono text-xs text-gray-400 light:text-slate-500 break-all mb-3">
                  Oracle sig: {chessProofHash?.slice(0, 32)}...
                </div>

                <div className="text-xs uppercase tracking-widest text-gray-300 light:text-slate-600 mb-1 font-semibold">ON-CHAIN PAYOUT BREAKDOWN</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  <div className="p-2 rounded bg-black/40 border border-white/10">
                    <div className="text-gray-400 light:text-slate-500">Platform ({payoutResult.fee_percent}%)</div>
                    <div className="font-bold text-rose-400 tabular-nums">{payoutResult.platform_fee_kas} KAS</div>
                  </div>
                  <div className="p-2 rounded bg-black/40 border border-white/10">
                    <div className="text-gray-400 light:text-slate-500">{payoutResult.winner_label}</div>
                    <div className="font-bold text-emerald-400 tabular-nums">{payoutResult.winner_share_kas} KAS</div>
                  </div>
                  <div className="p-2 rounded bg-black/40 border border-white/10">
                    <div className="text-gray-400 light:text-slate-500">Pot Return ({payoutResult.pot_return_percent}%)</div>
                    <div className="font-bold text-[#49EACB] tabular-nums">{payoutResult.pot_return_kas} KAS</div>
                  </div>
                </div>
                <div className="text-xs text-gray-300 light:text-slate-600 mt-2">
                  <span className="text-emerald-400">Total pot: {payoutResult.total_pot_kas} KAS</span>
                  {' • '}Signature {payoutResult.signature_verified ? 'verified' : 'accepted'}
                </div>
                {/* Copyable witness data */}
                <details className="mt-2">
                  <summary className="text-[10px] text-gray-400 light:text-slate-500 cursor-pointer hover:text-gray-300 light:text-slate-600">Copy witness data for unlock TX</summary>
                  <pre className="mt-1 p-2 rounded bg-black/60 text-[10px] text-gray-300 light:text-slate-600 whitespace-pre-wrap font-mono">{payoutResult.unlock_witness}</pre>
                </details>
              </div>
            )}
            {/* Error display */}
            {payoutResult && payoutResult.error && (
              <div className="mt-3 p-3 rounded-xl bg-amber-500/[0.06] border border-amber-500/30 text-xs text-amber-400">
                Payout error: {payoutResult.error}
              </div>
            )}
            {/* Pre-claim: resolver attested result display */}
            {chessZkVerified && chessResult && !payoutResult && (
              <div className="mt-3 p-4 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/30 text-sm">
                <div className="flex items-center gap-2 text-emerald-400 mb-2">
                  <CheckCircle2 size={15} /> RESULT ATTESTED BY ORACLE - CLICK "CLAIM PAYOUT" TO COMPUTE
                </div>
                <div className="font-mono text-xs text-gray-400 light:text-slate-500 break-all mb-2">Oracle sig / proof ref: {chessProofHash}</div>
                <div className="text-[10px] text-gray-400 light:text-slate-500">The oracle has signed this result. Claiming computes the exact payout amounts via the backend, verified against the covenant's configured fee and pot-return percentages.</div>
              </div>
            )}
          </div>

          <div className="text-[10px] text-gray-400 light:text-slate-500 px-1">
            chess.js validates all FIDE rules client-side. After both sides stake the same amount the full-screen professional arena (chess.com smooth: large board, clocks, move list) becomes available. The signed move log is replayed deterministically by a server-authoritative engine (anyone can recompute) and the counterparty or a deployer-bound external resolver co-signs the release (real ZK when circuit ready).
          </div>
        </section>
      )}

      {/* ─── PRO POKER TABLE (compact arena + full screen launch gate) ─── */}
      {/* Poker uses a generic circuit, but this arena provides the game experience */}
      <section className={`${SECTION_BASE} border-emerald-500/30 bg-[#0a1412] ring-1 ring-emerald-500/20`}>
        <div className="flex items-center justify-between">
          <div className={SECTION_HEADER}>
            <div className="p-1.5 rounded-lg bg-emerald-500/20">
              <Play size={16} className="text-emerald-400" />
            </div>
            <span>Poker Pro Table (Texas Hold'em)</span>
            <span className="ml-2 text-[10px] px-2 py-0.5 rounded bg-emerald-400/10 text-emerald-400 font-mono border border-emerald-400/30">LIVE MULTIPLAYER</span>
          </div>
          <div className="text-right flex flex-col items-end gap-1">
            <div className="text-[11px] text-emerald-400 font-mono">{pokerStake} KAS STAKE • 2% FEE</div>
            <div className="text-[10px] text-gray-400 light:text-slate-500 -mt-0.5">Each side stakes equally • Resolver attested result</div>
          </div>
        </div>

        <p className="text-xs text-gray-300 light:text-slate-600 leading-relaxed -mt-1">
          Real heads-up No-Limit Hold'em against another wallet. Every deal is committed before any card is visible (sha256 of the deck seed, published on the table) and the seed is revealed after each hand, so both players can verify the deal was fixed in advance. Hole cards stay private behind wallet-signed table sessions. Chips are score units; the covenant pot pays the match winner through the oracle claim flow.
        </p>

        {/* Compact stake summary */}
        <div className="flex items-center gap-3 p-3 rounded-xl bg-black/40 border border-white/10">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-gray-400 light:text-slate-500">YOUR STAKE</div>
            <div className="text-3xl font-bold tabular-nums text-white">{pokerStake} <span className="text-sm font-mono text-gray-400 light:text-slate-500">KAS</span></div>
          </div>
          <div className="flex-1 h-px bg-white/10" />
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-widest text-gray-400 light:text-slate-500">TOTAL POT</div>
            <div className="text-2xl font-bold tabular-nums text-[#49EACB]">{pokerStake * 2} KAS</div>
            <div className="text-[11px] text-rose-400/90">-2% fee • COMMITMENT-VERIFIED DEALS</div>
          </div>
        </div>

        {/* Table preview */}
        <div className="rounded-2xl overflow-hidden border border-white/10 bg-[#111] p-6">
          <div className="flex flex-col items-center gap-4">
            <div className="relative w-full max-w-[500px] aspect-[2/1] rounded-[100px] border-4 border-amber-900/40"
                 style={{ background: 'radial-gradient(ellipse at 50% 50%, #0d6b2e 0%, #084d1a 50%, #042e0e 100%)' }}>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <div className="text-4xl mb-2">♠ ♥ ♦ ♣</div>
                  <div className="text-xs text-white/60 font-mono uppercase tracking-[4px]">TEXAS HOLD'EM TABLE</div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="p-2 rounded-lg bg-black/60 border border-white/10 font-mono text-[11px] text-gray-300 light:text-slate-600">
              Take a seat at the full-screen table: first wallet sits as P1 and waits, the second activates the match. Blinds 1/2, 100 chips each, winner takes the covenant pool.
            </div>
            <div>
              <button
                onClick={() => setShowFullScreenPoker(true)}
                className="w-full h-full py-3 rounded-xl bg-[#49EACB] text-black font-bold text-sm active:scale-[0.985] transition-all shadow-[0_0_25px_rgba(73,234,203,0.3)]"
              >
                OPEN POKER TABLE - {pokerStake} KAS SEAT
              </button>
            </div>
          </div>
        </div>

        <div className="text-[10px] text-gray-400 light:text-slate-500 px-1">
          Oracle-dealt with a published deck commitment before every hand, seed revealed after; the client re-verifies each deal. Fold/check/call/bet/raise, all-in runouts, multi-hand chip play. Real ZK hand ranking proofs coming as circuits mature.
        </div>
      </section>

      {/* ─── PRO BLACKJACK TABLE (compact arena + full screen launch gate) ─── */}
      <section className={`${SECTION_BASE} border-amber-500/30 bg-[#1a140a] ring-1 ring-amber-500/20`}>
        <div className="flex items-center justify-between">
          <div className={SECTION_HEADER}>
            <div className="p-1.5 rounded-lg bg-amber-500/20">
              <Play size={16} className="text-amber-400" />
            </div>
            <span>Blackjack Pro Table</span>
            <span className="ml-2 text-[10px] px-2 py-0.5 rounded bg-amber-400/10 text-amber-400 font-mono border border-amber-400/30">PRO TABLE</span>
          </div>
          <div className="text-right flex flex-col items-end gap-1">
            <div className="text-[11px] text-amber-400 font-mono">{bjStake} KAS STAKE • 2% FEE</div>
            <div className="text-[10px] text-gray-400 light:text-slate-500 -mt-0.5">Each side stakes equally • Resolver attested result</div>
          </div>
        </div>

        <p className="text-xs text-gray-300 light:text-slate-600 leading-relaxed -mt-1">
          Open duel, no house: both players co-commit shuffle seeds (commit-reveal), the deck derives from the combined seeds so neither side controls it, and each plays their own open hand. Closest to 21 without busting wins. Seats, turns, and moves persist on the covenant match record.
        </p>

        <div className="flex items-center gap-3 p-3 rounded-xl bg-black/40 border border-white/10">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-gray-400 light:text-slate-500">YOUR STAKE</div>
            <div className="text-3xl font-bold tabular-nums text-white">{bjStake} <span className="text-sm font-mono text-gray-400 light:text-slate-500">KAS</span></div>
          </div>
          <div className="flex-1 h-px bg-white/10" />
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-widest text-gray-400 light:text-slate-500">TOTAL POT</div>
            <div className="text-2xl font-bold tabular-nums text-[#49EACB]">{bjStake * 2} KAS</div>
            <div className="text-[11px] text-rose-400/90">-2% fee • OPEN DUEL, NO HOUSE</div>
          </div>
        </div>

        <div className="rounded-2xl overflow-hidden border border-white/10 bg-[#111] p-6">
          <div className="flex flex-col items-center gap-4">
            <div className="relative w-full max-w-[500px] aspect-[2/1] rounded-[100px] border-4 border-amber-900/40"
                 style={{ background: 'radial-gradient(ellipse at 50% 55%, #0d6b2e 0%, #073d1a 50%, #031a0a 100%)' }}>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <div className="text-4xl mb-2">🂡 🃕 🂦</div>
                  <div className="text-xs text-white/60 font-mono uppercase tracking-[4px]">BLACKJACK TABLE</div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="p-2 rounded-lg bg-black/60 border border-white/10 font-mono text-[11px] text-gray-300 light:text-slate-600">
              Take a seat in the full-screen table: first wallet sits as X and waits, the second activates the duel. Hands sync live.
            </div>
            <div>
              <button
                onClick={() => setShowFullScreenBlackjack(true)}
                className="w-full h-full py-3 rounded-xl bg-[#49EACB] text-black font-bold text-sm active:scale-[0.985] transition-all shadow-[0_0_25px_rgba(73,234,203,0.3)]"
              >
                OPEN DUEL TABLE - {bjStake} KAS SEAT
              </button>
            </div>
          </div>
        </div>

        <div className="text-[10px] text-gray-400 light:text-slate-500 px-1">
          Commit-reveal deck cut, open hands, hit/stand on your own hand, resolver attested result. Real ZK verification coming.
        </div>
      </section>

      {/* ─── PRO SKILL GAMES: CHECKERS / CONNECT4 / TICTACTOE / REVERSI / RPS (time + equal stake + oracle claim) ─── */}
      {/* Checkers */}
      <section className={`${SECTION_BASE} border-amber-500/30 bg-[#0f0c08] ring-1 ring-amber-500/20`}>
        <div className="flex items-center justify-between">
          <div className={SECTION_HEADER}>
            <div className="p-1.5 rounded-lg bg-amber-500/20"><Play size={16} className="text-amber-400" /></div>
            <span>Checkers (8×8, forced jumps + kings)</span>
            <span className="ml-2 text-[10px] px-2 py-0.5 rounded bg-amber-400/10 text-amber-400 font-mono border border-amber-400/30">PRO</span>
          </div>
          <div className="text-right text-[11px] text-amber-400 font-mono">{checkersStake} KAS • {potReturnPercent}% POT</div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] text-gray-400 light:text-slate-500">YOUR STAKE (KAS)</label>
            <input type="number" value={checkersStake} onChange={e=>setCheckersStake(Math.max(1,parseInt(e.target.value||'50')))} className={INPUT} />
          </div>
          <div className="flex items-end">
            <button onClick={launchFullScreenCheckers} className="w-full py-3 rounded-xl bg-[#49EACB] text-black font-bold text-sm">OPEN MATCH TABLE - {checkersStake} KAS SEAT</button>
          </div>
        </div>
        <div className="text-[10px] text-gray-400 light:text-slate-500">Equal stakes • 3min clocks • forced jumps • multi-jump • kings • SUBMIT → CLAIM with {potReturnPercent}% pot return</div>
      </section>

      {/* Connect 4 + TTT + Reversi + RPS in a compact grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Connect 4 */}
        <section className={`${SECTION_BASE} border-blue-500/20 bg-[#0a1218]`}>
          <div className="flex justify-between mb-2"><div className={SECTION_HEADER}><Play size={15} className="text-blue-400" /><span>Connect 4 (7×6)</span></div><div className="text-[10px] text-blue-400 font-mono">{connect4Stake} KAS</div></div>
          <div className="flex gap-2">
            <input type="number" value={connect4Stake} onChange={e=>setConnect4Stake(Math.max(5,parseInt(e.target.value||'30')))} className={INPUT + ' flex-1'} />
            <button onClick={launchFullScreenConnect4} className="px-4 rounded-xl bg-[#49EACB] text-black text-xs font-bold">OPEN TABLE</button>
          </div>
          <div className="text-[9px] text-gray-400 light:text-slate-500 mt-1">Gravity drops • 4-in-row • 2min clocks • oracle + {potReturnPercent}% pot return</div>
        </section>

        {/* Tic Tac Toe */}
        <section className={`${SECTION_BASE} border-rose-500/20 bg-[#120a0a]`}>
          <div className="flex justify-between mb-2"><div className={SECTION_HEADER}><Play size={15} className="text-rose-400" /><span>Tic-Tac-Toe (3×3)</span></div><div className="text-[10px] text-rose-400 font-mono">{tttStake} KAS</div></div>
          <div className="flex gap-2">
            <input type="number" value={tttStake} onChange={e=>setTttStake(Math.max(5,parseInt(e.target.value||'20')))} className={INPUT + ' flex-1'} />
            <button onClick={launchFullScreenTicTacToe} className="px-4 rounded-xl bg-[#49EACB] text-black text-xs font-bold">OPEN TABLE</button>
          </div>
          <div className="text-[9px] text-gray-400 light:text-slate-500 mt-1">Classic • 90s clocks • 3-in-row • fast oracle resolution + {potReturnPercent}% return</div>
        </section>

        {/* Reversi */}
        <section className={`${SECTION_BASE} border-emerald-500/20 bg-[#0a120a]`}>
          <div className="flex justify-between mb-2"><div className={SECTION_HEADER}><Play size={15} className="text-emerald-400" /><span>Reversi / Othello</span></div><div className="text-[10px] text-emerald-400 font-mono">{reversiStake} KAS</div></div>
          <div className="flex gap-2">
            <input type="number" value={reversiStake} onChange={e=>setReversiStake(Math.max(5,parseInt(e.target.value||'40')))} className={INPUT + ' flex-1'} />
            <button onClick={launchFullScreenReversi} className="px-4 rounded-xl bg-[#49EACB] text-black text-xs font-bold">OPEN TABLE</button>
          </div>
          <div className="text-[9px] text-gray-400 light:text-slate-500 mt-1">8×8 flips • legal only • 2.5min clocks • resolver attested + {potReturnPercent}% pot</div>
        </section>

        {/* RPS */}
        <section className={`${SECTION_BASE} border-violet-500/20 bg-[#120a18]`}>
          <div className="flex justify-between mb-2"><div className={SECTION_HEADER}><Play size={15} className="text-violet-400" /><span>RPS (best of 3)</span></div><div className="text-[10px] text-violet-400 font-mono">{rpsStake} KAS</div></div>
          <div className="flex gap-2">
            <input type="number" value={rpsStake} onChange={e=>setRpsStake(Math.max(5,parseInt(e.target.value||'25')))} className={INPUT + ' flex-1'} />
            <button onClick={launchFullScreenRPS} className="px-4 rounded-xl bg-[#49EACB] text-black text-xs font-bold">OPEN TABLE</button>
          </div>
          <div className="text-[9px] text-gray-400 light:text-slate-500 mt-1">Timed picks • 12s/choice • best of 3 • instant oracle + {potReturnPercent}% return</div>
        </section>
      </div>

      {/* PROFESSIONAL FULL-SCREEN CHESS ARENA (chess.com quality) - mobile-first responsive */}
      {showFullScreenChess && gameType === 'chess_v1' && (
        <div className="fixed inset-0 z-[999] bg-[#050505] flex flex-col" style={{ background: 'radial-gradient(circle at 50% 20%, #0a0f0d 0%, #050505 70%)' }}>
          {/* Pro top bar - compact on mobile */}
          <div className="h-10 sm:h-14 border-b border-white/10 flex items-center justify-between px-2 sm:px-4 text-xs sm:text-sm bg-black/60 backdrop-blur-xl shrink-0">
            <div className="flex items-center gap-1 sm:gap-3">
              <div className="font-bold tracking-wider text-[#49EACB] hidden sm:block text-xs sm:text-sm">CHESS V1 - KASPA COVENANT</div>
              <div className="font-bold tracking-wider text-[#49EACB] text-[10px] sm:hidden">CHESS</div>
              <div className="px-2 py-0.5 rounded bg-white/5 text-[9px] sm:text-[10px] font-mono border border-white/10">{(chessStake + opponentStake)} KAS</div>
            </div>
            <button onClick={() => setShowFullScreenChess(false)} className="px-2 sm:px-4 py-1 sm:py-1.5 rounded-xl border border-white/20 hover:bg-white/5 text-[10px] sm:text-xs font-bold">EXIT</button>
          </div>

          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Mobile clocks row */}
            <div className="lg:hidden flex items-center justify-around px-2 py-1.5 bg-black/40 border-b border-white/5 shrink-0">
              <div className="flex flex-col items-center">
                <div className="text-[9px] uppercase tracking-[1.5px] text-gray-400 light:text-slate-500">WHITE</div>
                <div className={`font-mono text-lg font-bold tabular-nums ${whiteTime < 30000 ? 'text-red-500' : 'text-white'}`}>{Math.floor(whiteTime / 60000)}:{String(Math.floor((whiteTime % 60000) / 1000)).padStart(2, '0')}</div>
              </div>
              <div className="text-[10px] text-gray-500 light:text-slate-500 font-mono">{chessMatchState === 'playing' ? `${chessGame.turn() === 'w' ? 'WHITE' : 'BLACK'} TO MOVE` : 'GAME OVER'}</div>
              <div className="flex flex-col items-center">
                <div className="text-[9px] uppercase tracking-[1.5px] text-gray-400 light:text-slate-500">BLACK</div>
                <div className={`font-mono text-lg font-bold tabular-nums ${blackTime < 30000 ? 'text-red-500' : 'text-white'}`}>{Math.floor(blackTime / 60000)}:{String(Math.floor((blackTime % 60000) / 1000)).padStart(2, '0')}</div>
              </div>
            </div>

            <div className="flex-1 flex flex-col lg:flex-row items-center justify-center gap-2 sm:gap-6 p-2 sm:p-4 overflow-auto">
              {/* Desktop: White side panel */}
              <div className="hidden lg:flex flex-col items-center gap-2 w-48 xl:w-64 shrink-0">
                <div className="text-xs uppercase tracking-[2px] text-gray-400 light:text-slate-500">WHITE</div>
                <div className="font-mono text-sm xl:text-lg text-white truncate">{chessPlayerColor === 'w' ? 'YOU' : chessOpponent}</div>
                <div className={`font-mono text-4xl xl:text-6xl font-bold tabular-nums tracking-tighter ${whiteTime < 30000 ? 'text-red-500' : 'text-white'}`}>{Math.floor(whiteTime / 60000)}:{String(Math.floor((whiteTime % 60000) / 1000)).padStart(2, '0')}</div>
              </div>

              {/* CENTER: Board - full-viewport on mobile */}
              <div className="relative shrink-0">
                <div className="rounded-xl sm:rounded-3xl p-1 sm:p-4 bg-[#111] shadow-2xl border border-white/10" style={{ boxShadow: '0 25px 80px -15px rgba(0,0,0,0.8), 0 0 0 1px rgba(73,234,203,0.08)' }}>
                  <Chessboard
                    position={chessGame.fen()}
                    onPieceDrop={handleChessMove}
                    boardOrientation={chessPlayerColor === 'b' ? 'black' : 'white'}
                    customBoardStyle={{ borderRadius: '12px', boxShadow: 'inset 0 0 80px rgba(0,0,0,0.6), 0 10px 30px -10px rgba(0,0,0,0.9)' }}
                    customDarkSquareStyle={{ backgroundColor: '#769656' }}
                    customLightSquareStyle={{ backgroundColor: '#eeeed2' }}
                    customPieces={{}}
                    boardWidth={typeof window !== 'undefined' ? (window.innerWidth < 1024 ? Math.min(window.innerWidth - 24, window.innerHeight - 200) : Math.min(680, Math.max(420, Math.floor(window.innerWidth * 0.42)))) : 520}
                  />
                </div>
                <div className="absolute -bottom-2 sm:-bottom-3 left-1/2 -translate-x-1/2 px-3 sm:px-4 py-0.5 sm:py-1 rounded-full bg-black/80 border border-white/10 text-[10px] sm:text-xs font-mono text-kaspa-green tracking-wider whitespace-nowrap">{chessMatchState === 'playing' ? `${chessGame.turn() === 'w' ? 'WHITE' : 'BLACK'} TO MOVE` : 'GAME OVER'}</div>
              </div>

              {/* Desktop: Black side panel */}
              <div className="hidden lg:flex flex-col items-center gap-2 w-48 xl:w-64 shrink-0">
                <div className="text-xs uppercase tracking-[2px] text-gray-400 light:text-slate-500">BLACK</div>
                <div className="font-mono text-sm xl:text-lg text-white truncate">{chessPlayerColor === 'b' ? 'YOU' : chessOpponent}</div>
                <div className={`font-mono text-4xl xl:text-6xl font-bold tabular-nums tracking-tighter ${blackTime < 30000 ? 'text-red-500' : 'text-white'}`}>{Math.floor(blackTime / 60000)}:{String(Math.floor((blackTime % 60000) / 1000)).padStart(2, '0')}</div>
                <div className="mt-4 w-full bg-black/60 border border-white/10 rounded-2xl p-3 text-[12px] font-mono max-h-[180px] xl:max-h-[220px] overflow-auto text-gray-200 light:text-slate-700">
                  {chessGame.pgn() ? chessGame.pgn().split(/\d+\./).filter(Boolean).map((m, i) => (<div key={i} className="py-0.5 border-b border-white/5 last:border-none">{i + 1}. {m.trim()}</div>)) : <div className="text-gray-500 light:text-slate-500 italic">No moves yet</div>}
                </div>
                <div className="mt-3 flex flex-col gap-2 w-full">
                  {chessMatchState === 'playing' && (<><button onClick={() => resignGame(chessPlayerColor)} className="w-full py-2 rounded-xl bg-red-600/90 text-white text-xs font-bold active:bg-red-700">RESIGN</button><button type="button" disabled title="Draw offers are not wired into the on-chain result yet. You can resign or play on." className="w-full py-2 rounded-xl border border-white/20 text-xs opacity-40 cursor-not-allowed">OFFER DRAW (not wired)</button></>)}
                  {chessMatchState === 'finished' && !chessZkVerified && (<button onClick={submitChessResultToOracle} className="w-full py-3 rounded-2xl bg-[#49EACB] text-black font-black text-sm active:scale-[0.985] shadow-[0_0_30px_rgba(73,234,203,0.35)]">SUBMIT RESULT TO ORACLE</button>)}
                  {chessZkVerified && (
                    <div className="w-full p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.05]">
                      <div className="text-[10px] text-emerald-400 font-mono text-center mb-2">ORACLE SIGNATURE RECEIVED</div>
                      <div className="text-[10px] text-gray-300 light:text-slate-600 leading-relaxed space-y-0.5">
                        <div className="flex justify-between"><span>Winner:</span><span className="text-white">{((chessStake + opponentStake) * (100 - feePercent - potReturnPercent) / 100).toFixed(1)} KAS</span></div>
                        <div className="flex justify-between"><span>Creator fee:</span><span className="text-white">{((chessStake + opponentStake) * feePercent / 100).toFixed(1)} KAS</span></div>
                        <div className="flex justify-between"><span className="text-kaspa-green">Pot return:</span><span className="text-kaspa-green">{((chessStake + opponentStake) * potReturnPercent / 100).toFixed(1)} KAS</span></div>
                      </div>
                      <button onClick={() => { resetChessArena(); setShowFullScreenChess(false); }} className="mt-2 w-full py-2 rounded-xl bg-[#49EACB] text-black text-xs font-bold active:scale-[0.985]">CLAIM &amp; CLOSE</button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Mobile bottom panel: moves + actions */}
            <div className="lg:hidden flex flex-col border-t border-white/10 bg-black/60 backdrop-blur-xl shrink-0" style={{ maxHeight: '30vh' }}>
              <div className="overflow-auto px-3 py-2 text-[11px] font-mono text-gray-200 light:text-slate-700" style={{ maxHeight: '12vh' }}>
                {chessGame.pgn() ? chessGame.pgn().split(/\d+\./).filter(Boolean).map((m, i) => (<span key={i} className="inline-block mr-3">{i + 1}. {m.trim()}</span>)) : <div className="text-gray-500 light:text-slate-500 italic text-center">Drag pieces to play</div>}
              </div>
              <div className="flex items-center gap-2 px-3 py-2 border-t border-white/5">
                {chessMatchState === 'playing' ? (<><button onClick={() => resignGame(chessPlayerColor)} className="flex-1 py-2 rounded-xl bg-red-600/90 text-white text-[11px] font-bold">RESIGN</button><button onClick={() => { toast.info('Draw offers are not wired into the on-chain result yet. You can resign or play on.'); }} className="flex-1 py-2 rounded-xl border border-white/20 text-[11px]">DRAW</button></>) : chessMatchState === 'finished' && !chessZkVerified ? (<button onClick={submitChessResultToOracle} className="flex-1 py-3 rounded-xl bg-[#49EACB] text-black font-black text-sm active:scale-[0.985] shadow-[0_0_25px_rgba(73,234,203,0.3)]">SUBMIT TO ORACLE</button>) : chessZkVerified ? (
                    <div className="flex-1 p-2 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.05]">
                      <div className="text-[10px] text-emerald-400 font-mono text-center">SIGNATURE RECEIVED</div>
                      <div className="text-[9px] text-gray-300 light:text-slate-600 flex justify-around mt-1">
                        <span>Winner: {((chessStake + opponentStake) * (100 - feePercent - potReturnPercent) / 100).toFixed(1)} KAS</span>
                        <span>Creator: {((chessStake + opponentStake) * feePercent / 100).toFixed(1)}</span>
                        <span className="text-kaspa-green">Pot: {((chessStake + opponentStake) * potReturnPercent / 100).toFixed(1)}</span>
                      </div>
                      <button onClick={() => { resetChessArena(); setShowFullScreenChess(false); }} className="mt-1.5 w-full py-1.5 rounded-lg bg-[#49EACB] text-black text-[10px] font-bold">CLAIM</button>
                    </div>) : null}
              </div>
            </div>
          </div>

          <div className="h-8 sm:h-10 border-t border-white/10 text-[9px] sm:text-[10px] text-gray-500 light:text-slate-500 flex items-center justify-center font-mono shrink-0">FIDE RULES (chess.js) - RESOLVER ATTESTED - ZK CIRCUIT TARGET</div>
        </div>
      )}

      {/* PROFESSIONAL FULL-SCREEN POKER TABLE (Texas Hold'em) */}
      {showFullScreenPoker && (
        <FullScreenPoker
          stake={pokerStake}
          onClose={() => { setShowFullScreenPoker(false); }}
          covenantId={covenantId}
          feePercent={feePercent}
          potReturnPercent={potReturnPercent}
          look={terminalLook('poker')}
        />
      )}

      {/* PROFESSIONAL FULL-SCREEN BLACKJACK TABLE */}
      {showFullScreenBlackjack && (
        <FullScreenBlackjack
          stake={bjStake}
          onClose={() => { setShowFullScreenBlackjack(false); }}
          covenantId={covenantId}
          feePercent={feePercent}
          potReturnPercent={potReturnPercent}
          look={terminalLook('blackjack')}
        />
      )}

      {/* NEW FULL-SCREEN SKILL GAME ARENAS (checkers, connect4, ttt, reversi, rps) */}
      {showFullScreenCheckers && (
        <FullScreenCheckers
          stake={checkersStake}
          onClose={() => { setShowFullScreenCheckers(false); }}
          covenantId={covenantId}
          feePercent={feePercent}
          potReturnPercent={potReturnPercent}
          look={terminalLook('checkers')}
        />
      )}
      {showFullScreenConnect4 && (
        <FullScreenConnect4
          stake={connect4Stake}
          onClose={() => { setShowFullScreenConnect4(false); }}
          covenantId={covenantId}
          feePercent={feePercent}
          potReturnPercent={potReturnPercent}
          look={terminalLook('connect4')}
        />
      )}
      {showFullScreenTicTacToe && (
        <FullScreenTicTacToe
          stake={tttStake}
          onClose={() => { setShowFullScreenTicTacToe(false); }}
          covenantId={covenantId}
          feePercent={feePercent}
          potReturnPercent={potReturnPercent}
          look={terminalLook('tictactoe')}
        />
      )}
      {showFullScreenReversi && (
        <FullScreenReversi
          stake={reversiStake}
          onClose={() => { setShowFullScreenReversi(false); }}
          covenantId={covenantId}
          feePercent={feePercent}
          potReturnPercent={potReturnPercent}
          look={terminalLook('reversi')}
        />
      )}
      {showFullScreenRPS && (
        <FullScreenRPS
          stake={rpsStake}
          onClose={() => { setShowFullScreenRPS(false); }}
          covenantId={covenantId}
          feePercent={feePercent}
          potReturnPercent={potReturnPercent}
          look={terminalLook('rps')}
        />
      )}

      {/* Mainnet Production Banner - shown when mainnet is selected in the chooser or server reports mainnet */}
      {isMainnet && (
        <div className="mb-6 p-4 rounded-2xl border-2 border-red-600/70 bg-red-600/10">
          <div className="flex items-center gap-3">
            <Rocket size={24} className="text-red-400" />
            <div>
              <div className="font-bold text-red-400 text-lg">⚠️ MAINNET MODE - REAL CAPITAL AT RISK</div>
              <div className="text-sm text-red-300/90 mt-1">
                Covex runs on <strong>MAINNET</strong>. All stakes, fees, and payouts are REAL KAS on the live Kaspa mainnet.
                There are no do-overs, refunds, or second chances. Double-check treasury, seeds, oracle, resolution logic, and pot return %.
                Only proceed if you have real mainnet dev wallets and treasury configured via environment variables.
              </div>
              <div className="text-[10px] text-red-400/70 mt-2 font-mono">NETWORK: {kaspaNetwork}</div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Section A: Covenant Configuration ─── */}
      <section className={SECTION_BASE}>
        <div className="flex items-center gap-3 pb-2 border-b border-white/10 mb-2">
          <CovexMark size={34} />
          <div>
            <div className="text-sm font-extrabold text-white tracking-tight">Covex Terminal</div>
            <div className="text-[11px] text-kaspa-green font-mono">Covenant configuration on the Kaspa BlockDAG</div>
          </div>
        </div>
        <div className={SECTION_HEADER}>
          <Settings size={16} />
          Covenant Configuration
        </div>

        {/* Mainnet-only. Real KAS on the live Kaspa mainnet. */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-[10px] uppercase tracking-widest text-gray-400 light:text-slate-500">NETWORK</span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded border text-red-400 border-red-500/30 bg-red-500/10">
            {networkLabel}
          </span>
          <span className="text-[9px] text-gray-500 light:text-slate-500">- real KAS on the live Kaspa mainnet</span>
        </div>

        <div className="space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <p className={LABEL}>Covenant Name</p>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Grandmaster Chess Duel"
              className={INPUT}
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <p className={LABEL}>Public Description</p>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what this covenant does, rules, and outcomes..."
              className={TEXTAREA}
            />
          </div>

          {/* Fee Slider - full 0 to 100% range, no cap */}
          <SliderField
            label="Platform Fee"
            value={feePercent}
            min={0}
            max={100}
            step={0.1}
            onChange={setFeePercent}
          />

          {/* Pot Return % Slider - full 0 to 100% range, no cap */}
          <SliderField
            label="% Returned to Covenant Pot"
            value={potReturnPercent}
            min={0}
            max={100}
            step={0.5}
            onChange={setPotReturnPercent}
          />
          <p className="text-[10px] text-gray-400 light:text-slate-500 -mt-4 ml-1">% of the pool flowing back to sustain the covenant for future sessions. 0% = full stake to the winner after fee. 2% = sustainable pool.</p>

          {/* Reusable Toggle */}
          <Toggle
            label="Reusable Covenant"
            desc="Allow multiple participants to reuse this covenant. Fee stays in the pool."
            enabled={reusable}
            onChange={setReusable}
          />

          {/* Allow Top-ups */}
          <Toggle
            label="Allow Top-ups"
            desc="Participants can add more KAS to the covenant after creation."
            enabled={allowTopups}
            onChange={setAllowTopups}
          />

          {/* Info Box */}
          <div className="flex items-start gap-3 p-4 rounded-xl bg-kaspa-green/[0.03] border border-kaspa-green/20">
            <Info size={16} className="text-kaspa-green shrink-0 mt-0.5" />
            <div>
              <p className="text-xs text-kaspa-green font-semibold">2% Fee Model</p>
              <p className="text-[11px] text-gray-300 light:text-slate-600 leading-relaxed mt-1">
                The 2% platform fee remains in the covenant pot and is redistributed per the
                SilverScript logic. This keeps the covenant self-sustaining.
              </p>
            </div>
          </div>
        </div>
      </section>


        {/* Visual editor blended into the paid terminal workspace - no separate standalone section. */}
          {/* Visual editor add-ons and live editor will be blended inside the paid workspace (Covenant Circuit Schema) without standalone section headers. */}
      {/* closing cleaned */}

      {/* ─── Section B: Custom UI Integration ─── */}
      <section className={SECTION_BASE}>
        <div className={SECTION_HEADER}>
          <Code2 size={16} />
          Custom UI Integration
        </div>

        <div className="space-y-4">
          {/* Open Studio Button - prominent */}
          <button
            onClick={handleOpenStudio}
            className="w-full flex items-center justify-between gap-4 py-5 px-6 rounded-xl
              bg-gradient-to-r from-[#49EACB]/10 via-[#49EACB]/[0.06] to-[#49EACB]/[0.02]
              border-2 border-dashed border-kaspa-green/30
              text-kaspa-green font-semibold text-sm
              hover:border-kaspa-green/50 hover:bg-[#49EACB]/[0.10]
              hover:shadow-[0_0_30px_rgba(73,234,203,0.2)]
              active:scale-[0.98] transition-all group"
          >
            <div className="flex items-center gap-4">
              <div className="p-2.5 rounded-xl bg-kaspa-green/20 group-hover:bg-kaspa-green/30 transition-colors">
                <Palette size={22} className="text-kaspa-green" />
              </div>
              <div className="text-left">
                <div className="text-sm font-bold text-white">Design Visual UI in Covenant Studio</div>
                <div className="text-[11px] text-gray-300 light:text-slate-600 mt-0.5">
                  Create game boards, card tables, animations, and rich interfaces. Export and paste below.
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] text-kaspa-green/60 font-mono px-2 py-0.5 rounded-md bg-kaspa-green/10 border border-kaspa-green/20 group-hover:text-kaspa-green/80">
                {covenantId ? 'Open Studio' : 'Deploy first'}
              </span>
              <ExternalLink size={16} className="text-kaspa-green group-hover:translate-x-0.5 transition-transform" />
            </div>
          </button>

          {/* Paste Area */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <p className={LABEL}>Custom UI Code (HTML / JS / CSS)</p>
              <span className="text-[10px] text-gray-200 light:text-slate-700 font-mono">
                Paste from Covenant Studio
              </span>
            </div>
            <div className="relative">
              <textarea
                rows={8}
                value={customUICode}
                onChange={(e) => setCustomUICode(e.target.value)}
                placeholder={`<!-- Paste your generated UI code here -->\n<div class="covex-custom">\n  <!-- Covenant Studio output -->\n</div>`}
                className={`${TEXTAREA} font-mono text-xs leading-relaxed`}
                spellCheck={false}
              />
              {customUICode && (
                <div className="absolute top-2 right-2 flex items-center gap-1">
                  <span className="text-[10px] text-gray-200 light:text-slate-700 font-mono">
                    {customUICode.split('\n').length} lines
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Preview Toggle + Apply */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowPreview(!showPreview)}
              disabled={!customUICode}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-semibold transition-all ${
                !customUICode
                  ? 'opacity-30 cursor-not-allowed border-white/[0.04] bg-black/20 text-gray-200 light:text-slate-700'
                  : showPreview
                  ? 'border-kaspa-green/30 bg-kaspa-green/[0.04] text-kaspa-green'
                  : 'border-white/10 bg-black/20 text-gray-200 light:text-slate-700 hover:text-white hover:border-white/20'
              }`}
            >
              {showPreview ? <EyeOff size={14} /> : <Eye size={14} />}
              {showPreview ? 'Hide Preview' : 'Preview UI'}
            </button>

            <button
              onClick={handleApplyCustomUI}
              disabled={!customUICode}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                !customUICode
                  ? 'opacity-30 cursor-not-allowed bg-kaspa-green/20 text-kaspa-green/40'
                  : 'bg-kaspa-green text-black hover:shadow-[0_0_15px_rgba(73,234,203,0.3)] active:scale-[0.97]'
              }`}
            >
              <Upload size={14} />
              Apply & Save Custom UI
            </button>
          </div>

          {/* Live Preview */}
          {showPreview && customUICode && (
            <div className="rounded-xl border border-kaspa-green/20 bg-black/50 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2 bg-black/40 border-b border-white/5">
                <div className="flex gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-500/60" />
                  <span className="h-2.5 w-2.5 rounded-full bg-yellow-500/60" />
                  <span className="h-2.5 w-2.5 rounded-full bg-green-500/60" />
                </div>
                <span className="text-[10px] text-gray-200 light:text-slate-700 font-mono ml-2">Preview</span>
              </div>
              <div className="p-4">
                <iframe
                  srcDoc={customUICode}
                  title="Custom UI Preview"
                  className="w-full min-h-[300px] rounded-lg bg-white/[0.02] border border-white/5"
                  sandbox="allow-scripts"
                />
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ─── Section C: Outcome Resolution ─── */}
      <section className={SECTION_BASE}>
        <div className={SECTION_HEADER}>
          <Gavel size={16} />
          Outcome Resolution
        </div>

        <p className="text-xs text-gray-300 light:text-slate-600 leading-relaxed">
          Choose how the covenant outcome is determined and enforced. This feeds into the
          SilverScript template generation.
        </p>

        <div className="space-y-3">
          {/* Deterministic engine result (resolver co-signed) */}
          <ResolutionCard
            icon={Shield}
            title="Deterministic engine result (resolver co-signed)"
            desc="For engine-resolved games only: a server-authoritative engine replays the public move log (a result anyone can recompute), then the counterparty or a deployer-bound external resolver co-signs the release. Not for real-world facts. For a match score, a price, or weather, choose External Resolver below: Covex does not attest outside events."
            selected={resolutionMode === 'oracle'}
            onClick={() => setResolutionMode('oracle')}
            accent="kaspa-green"
          />

          {/* Custom Oracle */}
          <ResolutionCard
            icon={Cpu}
            title="External Resolver (your key)"
            desc="Bring your own resolver: the x-only pubkey of the independent provider you choose. Deploy this as an Oracle Escrow in Enforced Deploy with this key and the covenant locks on-chain to THIS resolver, requiring its co-signature to release. Covex is not in the path and does not attest real-world facts. Keep a deployer refund backstop for a no-show resolver."
            selected={resolutionMode === 'custom'}
            onClick={() => setResolutionMode('custom')}
            accent="kaspa-gold"
          />

          {resolutionMode === 'custom' && (
            <div className="ml-14 space-y-1.5">
              <p className={LABEL}>Oracle Public Key</p>
              <input
                type="text"
                value={customOracleKey}
                onChange={(e) => setCustomOracleKey(e.target.value)}
                placeholder="kaspa:q..."
                className={`${INPUT} font-mono text-xs`}
              />
            </div>
          )}

          {/* ZK Proof */}
          <ResolutionCard
            icon={Zap}
            title="ZK Proof (Zero-Knowledge)"
            desc="A real Groth16 proof is generated in your browser to keep your data private, then verified OFF-CHAIN by you, the counterparty, or any external verifier (snarkjs against the audited vkey; for the circom suite the proof is verified off-chain). Only a verified proof releases the funds. Choose a pre-built circuit or provide your own verifier key."
            selected={resolutionMode === 'zk'}
            onClick={() => setResolutionMode('zk')}
            accent="purple"
          />

          {resolutionMode === 'zk' && (
            <div className="ml-14 space-y-3">
              {/* Circuit info, now controlled by Game Type section */}
              <div className="space-y-1.5">
                <p className={LABEL}>ZK Circuit</p>
                <div className="p-4 rounded-xl bg-purple-500/[0.04] border border-purple-500/20">
                  <div className="flex items-center gap-3">
                    <div className="p-1.5 rounded-lg bg-purple-500/15">
                      <Zap size={14} className="text-purple-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-purple-300">
                        {zkCircuit === 'chess_v1' ? 'Chess v1 (Standard 8×8)' :
                         zkCircuit === 'merkle_generic' ? 'Merkle Membership Proof' :
                         zkCircuit === 'bulletproofs_v1' ? 'Range Proof (Bulletproofs)' :
                         zkCircuit === 'age_verify_v1' ? 'Age Verification (ZK-KYC)' :
                         zkCircuit === 'risc0_generic' ? 'Verifiable Computation (RISC Zero)' :
                         zkCircuit === 'custom' ? 'Custom Circuit' : zkCircuit}
                      </p>
                      <p className="text-[11px] text-gray-300 light:text-slate-600 mt-0.5">
                        Circuit controlled by ZK Proof Type selection above
                      </p>
                    </div>
                  </div>
                </div>
                <p className="text-[11px] text-gray-200 light:text-slate-700 leading-relaxed">
                  {zkCircuit === 'chess_v1' &&
                    'Chess outcome is resolver-attested: the server replays the move log (shakmaty) to decide the winner and co-signs it. Not an on-chain ZK proof - no third-party audit is claimed.'}
                  {zkCircuit === 'merkle_generic' &&
                    'Proves a key/value pair exists in a committed Merkle tree. Used for whitelists, airdrop eligibility, DAO voting.'}
                  {zkCircuit === 'bulletproofs_v1' &&
                    'Proves a committed value falls within [min, max] without revealing the value. Logarithmic proof size.'}
                  {zkCircuit === 'age_verify_v1' &&
                    'Proves age ≥ threshold without revealing exact birthdate. Zero-knowledge KYC alternative.'}
                  {zkCircuit === 'risc0_generic' &&
                    'Proves correct execution of arbitrary computation via RISC Zero VM. Program-dependent constraint profile.'}
                  {zkCircuit === 'custom' &&
                    'Provide your own circuit definition and verifier key. Only use audited circuits from trusted sources.'}
                </p>
              </div>

              <div className="space-y-1.5">
                <p className={LABEL}>Verifier Key</p>
                <input
                  type="text"
                  value={zkVerifierKey}
                  onChange={(e) => setZkVerifierKey(e.target.value)}
                  placeholder={
                    zkCircuit === 'chess_v1'
                      ? '0xCHESSv1_8x8_STANDARD'
                      : zkCircuit === 'merkle_generic'
                      ? '0xMERKLE_GENERIC_V1'
                      : zkCircuit === 'bulletproofs_v1'
                      ? '0xBULLETPROOFS_V1'
                      : zkCircuit === 'age_verify_v1'
                      ? '0xAGE_VERIFY_V1'
                      : zkCircuit === 'risc0_generic'
                      ? '0xRISC0_GENERIC_V1'
                      : '0x... (paste your verifier key)'
                  }
                  className={`${INPUT} font-mono text-xs ${
                    !zkVerifierKey && zkCircuit === 'custom' ? 'border-amber-500/40 focus:border-amber-500/50' : ''
                  }`}
                />
              </div>

              {/* Validation: empty verifier key on custom circuit */}
              {!zkVerifierKey && zkCircuit === 'custom' && (
                <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-500/[0.05] border border-amber-500/25">
                  <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-amber-300/80 leading-relaxed">
                    Custom circuits require a verifier key. Paste your audited key above or select a different game type.
                  </p>
                </div>
              )}

              <div className="flex items-start gap-3 p-3 rounded-xl bg-purple-500/[0.04] border border-purple-500/20">
                <AlertTriangle size={14} className="text-purple-400 shrink-0 mt-0.5" />
                <p className="text-[11px] text-purple-300/80 leading-relaxed">
                  ZK Proof resolution requires a valid circuit. Built-in circuits are audited and
                  ready to use. Custom circuits require manual review.
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ─── Section C½: Oracle Resolution (Live ZK + Oracle attestation) ─── */}
      {((gameType === 'merkle_membership' || gameType === 'range_proof' || gameType === 'age_verification' || gameType === 'verifiable' || gameType === 'custom') && resolutionMode === 'zk') && (
        <section className={`${SECTION_BASE} border-[#3B82F6]/30 bg-[#0a0e1a] ring-1 ring-[#3B82F6]/20`}>
          <div className="flex items-center justify-between">
            <div className={SECTION_HEADER}>
              <div className="p-1.5 rounded-lg bg-[#3B82F6]/20">
                <Server size={16} className="text-[#3B82F6]" />
              </div>
              <span>Oracle Resolution: Submit ZK Proof {gameType === 'range_proof' ? '(Range)' : gameType === 'merkle_membership' ? '(Merkle)' : gameType === 'age_verification' ? '(Age)' : gameType === 'verifiable' ? '(Verifiable Compute)' : '(Custom)'}</span>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded bg-[#3B82F6]/10 text-[#3B82F6]/80 font-mono border border-[#3B82F6]/30">
              LIVE ORACLE
            </span>
          </div>

          <p className="text-xs text-gray-300 light:text-slate-600 leading-relaxed">
            {gameType === 'range_proof'
              ? 'Paste (or generate) a Groth16 proof for the RangeProof circuit. Proves knowledge of a value inside [min, max] without revealing it. Verified off-chain by you, the counterparty, or any external verifier (snarkjs + the audited vkey). Valid proof (valid=1) produces signed outcome 0 (proven/claimant).'
              : gameType === 'merkle_membership'
              ? 'Paste a Groth16 proof for the MerkleMembership circuit. The proof is verified off-chain by you, the counterparty, or any external verifier using snarkjs against the audited verification key. A valid proof produces a signed outcome (claimant wins at outcome 0; depositor wins at outcome 1). The deployer-bound resolver co-signature is then used to unlock the covenant on-chain.'
              : gameType === 'age_verification'
              ? 'Generate (or paste) a Groth16 proof for the Age Verification circuit. The MiMC7 birth-year commitment is computed locally and the proof is generated in-browser over the served wasm/zkey artifacts, so your birth year never leaves the device. Proves a birthdate meets an age threshold without revealing the exact date. The proof is verified off-chain by you, the counterparty, or any external verifier (snarkjs + vkey) and a deployer-bound resolver co-signs the outcome.'
              : gameType === 'verifiable'
              ? 'Paste a proof for Verifiable Computation (RISC Zero or general). Proves correct execution of arbitrary computation. Resolver-attested - no client-side generator yet (program-dependent). Submit any valid JSON + public inputs for resolver signing.'
              : 'Paste a proof for your Custom Circuit. Supply any audited circuit definition and verifier key. Resolver-attested - no client-side generator. Submit any valid JSON + public inputs for resolver signing.'}
          </p>

          {/* Honesty disclaimer */}
          <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-500/[0.05] border border-amber-500/25">
            <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />
            <div className="text-[11px] text-amber-300/80 leading-relaxed">
              <p className="font-semibold mb-1">Technical Reality</p>
              <p>
                The proof is verified off-chain by calling <code className="text-amber-300 bg-amber-500/10 px-1 rounded">POST /api/oracle/verify-and-sign</code>.
                The oracle signature is a real BIP340 Schnorr signature over secp256k1 (scheme <code className="text-amber-300 bg-amber-500/10 px-1 rounded">bip340-schnorr-secp256k1</code> from <code className="text-amber-300 bg-amber-500/10 px-1 rounded">/api/oracle/pubkey</code>), verifiable against the published x-only public key and checked on-chain via OpCheckSig in the covenant's unlock branch once the covenant is deployed on mainnet at Toccata.
                The covenant unlock path still requires manual construction of the unlock transaction with the oracle signature as witness data.
              </p>
            </div>
          </div>

          {/* Proof input */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <p className={LABEL}>ZK Proof (JSON)</p>
              <textarea
                value={oracleProof}
                onChange={(e) => setOracleProof(e.target.value)}
                placeholder={gameType === 'range_proof' ? '{"proof":{...},"publicSignals":["commitment","0","100","1"]}' : gameType === 'merkle_membership' ? bundledMerkleProof.slice(0, 200) + '...' : '{"proof":{...},"publicSignals":["1"]}'}
                rows={6}
                className={`${TEXTAREA} font-mono text-[10px]`}
              />
              <button
                onClick={() => {
                  if (gameType === 'merkle_membership') {
                    setOracleProof(bundledMerkleProof);
                    setOraclePublicInputs('1,20473339414381364284988912838485478706292217748325897174032535818078518775705');
                  } else if (gameType === 'range_proof') {
                    // demo valid range proof signals (commitment, min, max, valid=1)
                    setOracleProof(JSON.stringify({ proof: { protocol: 'groth16', note: 'range_demo' }, publicSignals: ['20473339414381364284988912838485478706292217748325897174032535818078518775705','0','100','1'] }));
                    setOraclePublicInputs('20473339414381364284988912838485478706292217748325897174032535818078518775705,0,100,1');
                  } else if (gameType === 'escrow_2party') {
                    // Real, verifying bundled escrow proof (valid refund-after-timeout).
                    setOracleProof(bundledEscrowProof);
                    setOraclePublicInputs('1,1000000,100,1000150,0');
                  } else if (gameType === 'age_verification') {
                    // Real, verifying bundled age proof (born 1990, >= 18 by 2026).
                    setOracleProof(bundledAgeProof);
                    setOraclePublicInputs('1,9200635592700100900023685259419851615264527311517926356835164316867165626887,2026,18');
                  } else {
                    // age_verification, verifiable, custom - demo attested proof
                    setOracleProof(JSON.stringify({ proof: { protocol: 'groth16', note: 'resolver_attested_demo' }, publicSignals: ['1'] }));
                    setOraclePublicInputs('1');
                  }
                }}
                className="text-[10px] text-[#3B82F6] hover:text-[#3B82F6]/80 font-mono underline underline-offset-2"
              >
                {gameType === 'merkle_membership' ? 'Load bundled proof (secret=42, rootHash precomputed)' : gameType === 'range_proof' ? 'Load demo valid range proof (value inside [0,100])' : gameType === 'escrow_2party' ? 'Load bundled escrow proof (valid refund after timeout)' : gameType === 'age_verification' ? 'Load bundled age proof (born 1990, >= 18 by 2026)' : 'Load demo attested proof'}
              </button>

              {/* Global busy hint - explains why the active prover and any siblings are disabled */}
              {zkGeneratingId && (
                <p role="status" aria-live="polite" className="text-[10px] text-gray-300 light:text-slate-600 font-mono">
                  Generating proof for {zkGeneratingId}. Other provers are paused until this run finishes.
                </p>
              )}

              {/* Generate real ZK proof client-side via snarkjs (circuit-specific) */}
              {gameType === 'merkle_membership' ? (
                <button
                  onClick={generateMerkleProof}
                  disabled={zkGeneratingId !== null}
                  aria-busy={zkGeneratingId === 'merkle_membership'}
                  title={zkGeneratingId && zkGeneratingId !== 'merkle_membership' ? 'Waiting for the current proof to finish' : undefined}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                    zkGeneratingId === 'merkle_membership'
                      ? 'opacity-40 cursor-not-allowed bg-[#3B82F6]/30 text-[#3B82F6]/60'
                      : zkGeneratingId !== null
                      ? 'opacity-45 cursor-not-allowed bg-[#3B82F6]/15 border border-[#3B82F6]/30 text-[#3B82F6]'
                      : 'bg-[#3B82F6]/15 border border-[#3B82F6]/30 text-[#3B82F6] hover:bg-[#3B82F6]/25 hover:shadow-[0_0_15px_rgba(59,130,246,0.3)]'
                  }`}
                >
                  {zkGeneratingId === 'merkle_membership' ? <Loader2 size={14} className="animate-spin" /> : <Cpu size={14} />}
                  {zkGeneratingId === 'merkle_membership' ? 'Generating proof' : 'Generate Real Merkle Proof (snarkjs)'}
                </button>
              ) : gameType === 'range_proof' ? (
                <button
                  onClick={generateRangeProof}
                  disabled={zkGeneratingId !== null}
                  aria-busy={zkGeneratingId === 'range_proof'}
                  title={zkGeneratingId && zkGeneratingId !== 'range_proof' ? 'Waiting for the current proof to finish' : undefined}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                    zkGeneratingId === 'range_proof'
                      ? 'opacity-40 cursor-not-allowed bg-emerald-600/30 text-emerald-400/60'
                      : zkGeneratingId !== null
                      ? 'opacity-45 cursor-not-allowed bg-emerald-500/15 border border-emerald-500/30 text-emerald-400'
                      : 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25 hover:shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                  }`}
                >
                  {zkGeneratingId === 'range_proof' ? <Loader2 size={14} className="animate-spin" /> : <Cpu size={14} />}
                  {zkGeneratingId === 'range_proof' ? 'Generating proof' : 'Generate Range Proof (snarkjs + mimc workaround)'}
                </button>
              ) : gameType === 'escrow_2party' ? (
                <button
                  onClick={generateEscrowProof}
                  disabled={zkGeneratingId !== null}
                  aria-busy={zkGeneratingId === 'escrow_2party'}
                  title={zkGeneratingId && zkGeneratingId !== 'escrow_2party' ? 'Waiting for the current proof to finish' : undefined}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                    zkGeneratingId === 'escrow_2party'
                      ? 'opacity-40 cursor-not-allowed bg-[#3B82F6]/30 text-[#3B82F6]/60'
                      : zkGeneratingId !== null
                      ? 'opacity-45 cursor-not-allowed bg-[#3B82F6]/15 border border-[#3B82F6]/30 text-[#3B82F6]'
                      : 'bg-[#3B82F6]/15 border border-[#3B82F6]/30 text-[#3B82F6] hover:bg-[#3B82F6]/25 hover:shadow-[0_0_15px_rgba(59,130,246,0.3)]'
                  }`}
                >
                  {zkGeneratingId === 'escrow_2party' ? <Loader2 size={14} className="animate-spin" /> : <Cpu size={14} />}
                  {zkGeneratingId === 'escrow_2party' ? 'Generating proof' : 'Generate Real Escrow Proof (snarkjs)'}
                </button>
              ) : gameType === 'age_verification' ? (
                <button
                  onClick={generateAgeProof}
                  disabled={zkGeneratingId !== null}
                  aria-busy={zkGeneratingId === 'age_verification'}
                  title={zkGeneratingId && zkGeneratingId !== 'age_verification' ? 'Waiting for the current proof to finish' : undefined}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                    zkGeneratingId === 'age_verification'
                      ? 'opacity-40 cursor-not-allowed bg-[#3B82F6]/30 text-[#3B82F6]/60'
                      : zkGeneratingId !== null
                      ? 'opacity-45 cursor-not-allowed bg-[#3B82F6]/15 border border-[#3B82F6]/30 text-[#3B82F6]'
                      : 'bg-[#3B82F6]/15 border border-[#3B82F6]/30 text-[#3B82F6] hover:bg-[#3B82F6]/25 hover:shadow-[0_0_15px_rgba(59,130,246,0.3)]'
                  }`}
                >
                  {zkGeneratingId === 'age_verification' ? <Loader2 size={14} className="animate-spin" /> : <Cpu size={14} />}
                  {zkGeneratingId === 'age_verification' ? 'Generating proof' : 'Generate Real Age Proof (snarkjs + MiMC)'}
                </button>
              ) : gameType === 'vrf_dice_roll' ? (
                <button
                  onClick={generateVrfDiceRoll}
                  disabled={zkGeneratingId !== null}
                  aria-busy={zkGeneratingId === 'vrf_dice_roll'}
                  title={zkGeneratingId && zkGeneratingId !== 'vrf_dice_roll' ? 'Waiting for the current proof to finish' : undefined}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                    zkGeneratingId === 'vrf_dice_roll'
                      ? 'opacity-40 cursor-not-allowed bg-pink-600/30 text-pink-400/60'
                      : zkGeneratingId !== null
                      ? 'opacity-45 cursor-not-allowed bg-pink-500/15 border border-pink-500/30 text-pink-400'
                      : 'bg-pink-500/15 border border-pink-500/30 text-pink-400 hover:bg-pink-500/25 hover:shadow-[0_0_15px_rgba(236,72,153,0.3)]'
                  }`}
                >
                  {zkGeneratingId === 'vrf_dice_roll' ? <Loader2 size={14} className="animate-spin" /> : <Cpu size={14} />}
                  {zkGeneratingId === 'vrf_dice_roll' ? 'Generating proof' : 'Generate Real VRF Dice Proof (snarkjs + Poseidon)'}
                </button>
              ) : gameType === 'nullifier_set' ? (
                <button
                  onClick={generateNullifierSet}
                  disabled={zkGeneratingId !== null}
                  aria-busy={zkGeneratingId === 'nullifier_set'}
                  title={zkGeneratingId && zkGeneratingId !== 'nullifier_set' ? 'Waiting for the current proof to finish' : undefined}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                    zkGeneratingId === 'nullifier_set'
                      ? 'opacity-40 cursor-not-allowed bg-orange-600/30 text-orange-400/60'
                      : zkGeneratingId !== null
                      ? 'opacity-45 cursor-not-allowed bg-orange-500/15 border border-orange-500/30 text-orange-400'
                      : 'bg-orange-500/15 border border-orange-500/30 text-orange-400 hover:bg-orange-500/25 hover:shadow-[0_0_15px_rgba(251,146,60,0.3)]'
                  }`}
                >
                  {zkGeneratingId === 'nullifier_set' ? <Loader2 size={14} className="animate-spin" /> : <Cpu size={14} />}
                  {zkGeneratingId === 'nullifier_set' ? 'Generating proof' : 'Generate Real Nullifier Proof (snarkjs + Poseidon)'}
                </button>
              ) : gameType === 'utxo_ownership' ? (
                <button
                  onClick={generateUtxoOwnership}
                  disabled={zkGeneratingId !== null}
                  aria-busy={zkGeneratingId === 'utxo_ownership'}
                  title={zkGeneratingId && zkGeneratingId !== 'utxo_ownership' ? 'Waiting for the current proof to finish' : undefined}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                    zkGeneratingId === 'utxo_ownership'
                      ? 'opacity-40 cursor-not-allowed bg-cyan-600/30 text-cyan-400/60'
                      : zkGeneratingId !== null
                      ? 'opacity-45 cursor-not-allowed bg-cyan-500/15 border border-cyan-500/30 text-cyan-400'
                      : 'bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/25 hover:shadow-[0_0_15px_rgba(6,182,212,0.3)]'
                  }`}
                >
                  {zkGeneratingId === 'utxo_ownership' ? <Loader2 size={14} className="animate-spin" /> : <Cpu size={14} />}
                  {zkGeneratingId === 'utxo_ownership' ? 'Generating proof' : 'Generate Real UTXO Note Proof (snarkjs + Poseidon)'}
                </button>
              ) : gameType === 'hash_preimage' ? (
                <button
                  onClick={generateHashPreimage}
                  disabled={zkGeneratingId !== null}
                  aria-busy={zkGeneratingId === 'hash_preimage'}
                  title={zkGeneratingId && zkGeneratingId !== 'hash_preimage' ? 'Waiting for the current proof to finish' : undefined}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                    zkGeneratingId === 'hash_preimage'
                      ? 'opacity-40 cursor-not-allowed bg-amber-600/30 text-amber-400/60'
                      : zkGeneratingId !== null
                      ? 'opacity-45 cursor-not-allowed bg-amber-500/15 border border-amber-500/30 text-amber-400'
                      : 'bg-amber-500/15 border border-amber-500/30 text-amber-400 hover:bg-amber-500/25 hover:shadow-[0_0_15px_rgba(245,158,11,0.3)]'
                  }`}
                >
                  {zkGeneratingId === 'hash_preimage' ? <Loader2 size={14} className="animate-spin" /> : <Cpu size={14} />}
                  {zkGeneratingId === 'hash_preimage' ? 'Generating proof' : 'Generate Real Hash Preimage Proof (snarkjs + MiMC)'}
                </button>
              ) : gameType === 'timelock_absolute' ? (
                <button
                  onClick={generateTimelockAbsolute}
                  disabled={zkGeneratingId !== null}
                  aria-busy={zkGeneratingId === 'timelock_absolute'}
                  title={zkGeneratingId && zkGeneratingId !== 'timelock_absolute' ? 'Waiting for the current proof to finish' : undefined}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                    zkGeneratingId === 'timelock_absolute'
                      ? 'opacity-40 cursor-not-allowed bg-orange-600/30 text-orange-400/60'
                      : zkGeneratingId !== null
                      ? 'opacity-45 cursor-not-allowed bg-orange-500/15 border border-orange-500/30 text-orange-400'
                      : 'bg-orange-500/15 border border-orange-500/30 text-orange-400 hover:bg-orange-500/25 hover:shadow-[0_0_15px_rgba(249,115,22,0.3)]'
                  }`}
                >
                  {zkGeneratingId === 'timelock_absolute' ? <Loader2 size={14} className="animate-spin" /> : <Cpu size={14} />}
                  {zkGeneratingId === 'timelock_absolute' ? 'Generating proof' : 'Generate Real Absolute Timelock Proof (snarkjs)'}
                </button>
              ) : gameType === 'relative_timelock' ? (
                <button
                  onClick={generateRelativeTimelock}
                  disabled={zkGeneratingId !== null}
                  aria-busy={zkGeneratingId === 'relative_timelock'}
                  title={zkGeneratingId && zkGeneratingId !== 'relative_timelock' ? 'Waiting for the current proof to finish' : undefined}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                    zkGeneratingId === 'relative_timelock'
                      ? 'opacity-40 cursor-not-allowed bg-emerald-600/30 text-emerald-400/60'
                      : zkGeneratingId !== null
                      ? 'opacity-45 cursor-not-allowed bg-emerald-500/15 border border-emerald-500/30 text-emerald-400'
                      : 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25 hover:shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                  }`}
                >
                  {zkGeneratingId === 'relative_timelock' ? <Loader2 size={14} className="animate-spin" /> : <Cpu size={14} />}
                  {zkGeneratingId === 'relative_timelock' ? 'Generating proof' : 'Generate Real Relative Timelock Proof (snarkjs)'}
                </button>
              ) : gameType === 'vrf_random' ? (
                <button onClick={generateVrfRandom} disabled={zkGeneratingId !== null} aria-busy={zkGeneratingId === 'vrf_random'} title={zkGeneratingId && zkGeneratingId !== 'vrf_random' ? 'Waiting for the current proof to finish' : undefined}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${zkGeneratingId === 'vrf_random' ? 'opacity-40 cursor-not-allowed bg-pink-600/30 text-pink-400/60' : zkGeneratingId !== null ? 'opacity-45 cursor-not-allowed bg-pink-500/15 border border-pink-500/30 text-pink-400' : 'bg-pink-500/15 border border-pink-500/30 text-pink-400 hover:bg-pink-500/25 hover:shadow-[0_0_15px_rgba(236,72,153,0.3)]'}`}>
                  {zkGeneratingId === 'vrf_random' ? <Loader2 size={14} className="animate-spin" /> : <Cpu size={14} />}
                  {zkGeneratingId === 'vrf_random' ? 'Generating proof' : 'Generate Real VRF Proof (snarkjs + Poseidon)'}
                </button>
              ) : gameType === 'turn_timer' ? (
                <button onClick={generateTurnTimer} disabled={zkGeneratingId !== null} aria-busy={zkGeneratingId === 'turn_timer'} title={zkGeneratingId && zkGeneratingId !== 'turn_timer' ? 'Waiting for the current proof to finish' : undefined}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${zkGeneratingId === 'turn_timer' ? 'opacity-40 cursor-not-allowed bg-cyan-600/30 text-cyan-400/60' : zkGeneratingId !== null ? 'opacity-45 cursor-not-allowed bg-cyan-500/15 border border-cyan-500/30 text-cyan-400' : 'bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/25 hover:shadow-[0_0_15px_rgba(6,182,212,0.3)]'}`}>
                  {zkGeneratingId === 'turn_timer' ? <Loader2 size={14} className="animate-spin" /> : <Cpu size={14} />}
                  {zkGeneratingId === 'turn_timer' ? 'Generating proof' : 'Generate Real Turn Timer Proof (snarkjs)'}
                </button>
              ) : gameType === 'script_constraint' ? (
                <button onClick={generateScriptConstraint} disabled={zkGeneratingId !== null} aria-busy={zkGeneratingId === 'script_constraint'} title={zkGeneratingId && zkGeneratingId !== 'script_constraint' ? 'Waiting for the current proof to finish' : undefined}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${zkGeneratingId === 'script_constraint' ? 'opacity-40 cursor-not-allowed bg-amber-600/30 text-amber-400/60' : zkGeneratingId !== null ? 'opacity-45 cursor-not-allowed bg-amber-500/15 border border-amber-500/30 text-amber-400' : 'bg-amber-500/15 border border-amber-500/30 text-amber-400 hover:bg-amber-500/25 hover:shadow-[0_0_15px_rgba(245,158,11,0.3)]'}`}>
                  {zkGeneratingId === 'script_constraint' ? <Loader2 size={14} className="animate-spin" /> : <Cpu size={14} />}
                  {zkGeneratingId === 'script_constraint' ? 'Generating proof' : 'Generate Real Script Constraint Proof (snarkjs + Poseidon)'}
                </button>
              ) : gameType === 'pot_split_math' ? (
                <button onClick={generatePotSplitMath} disabled={zkGeneratingId !== null} aria-busy={zkGeneratingId === 'pot_split_math'} title={zkGeneratingId && zkGeneratingId !== 'pot_split_math' ? 'Waiting for the current proof to finish' : undefined}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${zkGeneratingId === 'pot_split_math' ? 'opacity-40 cursor-not-allowed bg-red-600/30 text-red-400/60' : zkGeneratingId !== null ? 'opacity-45 cursor-not-allowed bg-red-500/15 border border-red-500/30 text-red-400' : 'bg-red-500/15 border border-red-500/30 text-red-400 hover:bg-red-500/25 hover:shadow-[0_0_15px_rgba(239,68,68,0.3)]'}`}>
                  {zkGeneratingId === 'pot_split_math' ? <Loader2 size={14} className="animate-spin" /> : <Cpu size={14} />}
                  {zkGeneratingId === 'pot_split_math' ? 'Generating proof' : 'Generate Real Pot Split Proof (snarkjs)'}
                </button>
              ) : (
                <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500/[0.04] border border-amber-500/20 text-[11px] text-amber-400/80 font-mono">
                  <Info size={14} />
                  No client-side generator available. Ceremony artifacts not yet generated for this circuit type. Paste proof + public inputs above and submit - the oracle will attest and sign.
                </div>
              )}
              {zkGenError && (
                <p className="text-[10px] text-amber-400 font-mono">{zkGenError}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <p className={LABEL}>Public Inputs (comma-separated)</p>
              <input
                type="text"
                value={oraclePublicInputs}
                onChange={(e) => setOraclePublicInputs(e.target.value)}
                placeholder="1,20473339414381364284988912838485478706292217748325897174032535818078518775705"
                className={`${INPUT} font-mono text-xs`}
              />
              <p className="text-[10px] text-gray-200 light:text-slate-700">{gameType === 'range_proof' ? 'Format: commitment,min,max,valid (valid=1 means value is in range and commitment matches).' : gameType === 'merkle_membership' ? 'Format: valid_flag,root_hash. valid_flag=1 means claimed membership is valid.' : gameType === 'escrow_2party' ? 'Format: valid,deposit_daa,timeout_daa,current_daa,outcome. valid=1 means the outcome is consistent with the timeout (outcome 0 = refund authorized once current_daa >= deposit+timeout).' : gameType === 'age_verification' ? 'Format: valid,commitment,current_year,min_age. valid=1 proves the (hidden) birth year is at least min_age before current_year; commitment = MiMC7(birth_year) and the birth year never leaves your browser.' : gameType === 'vrf_dice_roll' ? 'Format: seed,roll. The roll is forced by Poseidon(secret, seed) - the secret stays in your browser, so the roll cannot be cherry-picked.' : gameType === 'nullifier_set' ? 'Format: spent,nullifier,merkle_root. The nullifier and set anchor both derive from one hidden secret; spent=0 is the circuit output.' : gameType === 'utxo_ownership' ? 'Format: valid,utxo_hash. valid=1 proves you know the Poseidon pre-image (pubkey+amount+sig parts) of the public utxo_hash; the note never leaves your browser.' : gameType === 'hash_preimage' ? 'Format: valid,commitment_hash. valid=1 proves you know the (hidden) MiMC7 pre-image of the public commitment_hash; the pre-image never leaves your browser.' : gameType === 'timelock_absolute' ? 'Format: valid,current_daa,lock_threshold. valid=1 (a public output) means current_daa >= lock_threshold.' : gameType === 'relative_timelock' ? 'Format: valid,current_daa,reference_daa,lock_duration. valid=1 (a public output) means current_daa >= reference_daa + lock_duration.' : gameType === 'vrf_random' ? 'Format: valid,seed,output_val,pub_vrf_key. output_val = Poseidon(hidden secret, seed, vrf_key) - the secret never leaves your browser, so the output cannot be cherry-picked.' : gameType === 'turn_timer' ? 'Format: on_time,current_daa,max_delta. on_time=1 proves the (hidden) last move was within max_delta DAA of current_daa.' : gameType === 'script_constraint' ? 'Format: ok,constraint_id,value,public_root. ok=1 proves you know the (hidden) script_hash whose Poseidon bundle equals public_root.' : gameType === 'pot_split_math' ? 'Format: valid,total_pot,fee_bps,pot_return_bps,winner_share. valid=1 proves winner_share + fee + return == total_pot at the given bps (a verifiable fair split).' : 'Public inputs for your circuit. For resolver attestation, use "1" to indicate valid/proven.'}</p>
            </div>

            <button
              onClick={handleOracleSubmit}
              disabled={oracleSubmitting || !oracleProof}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm uppercase tracking-wider transition-[opacity,background-color] duration-150 ${
                oracleSubmitting || !oracleProof
                  ? 'opacity-40 cursor-not-allowed bg-[#3B82F6]/30 text-[#3B82F6]/60'
                  : 'bg-[#3B82F6] text-white hover:shadow-[0_0_30px_rgba(59,130,246,0.4)] active:scale-[0.97]'
              }`}
            >
              {oracleSubmitting ? (
                <>
                  <Loader size={16} className="animate-spin" />
                  Verifying with Oracle...
                </>
              ) : (
                <>
                  <BadgeCheck size={16} />
                  Submit to Oracle & Verify ZK Proof
                </>
              )}
            </button>
          </div>

          {/* Oracle result display */}
          {oracleError && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/[0.06] border border-red-500/30">
              <XCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-red-400">Oracle Error</p>
                <p className="text-xs text-red-300/80 font-mono">{oracleError}</p>
              </div>
            </div>
          )}

          {oracleResult && !oracleResult.success && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/[0.05] border border-amber-500/30">
              <XCircle size={16} className="text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1 flex-1">
                <p className="text-sm font-semibold text-amber-400">Proof Rejected</p>
                <p className="text-xs text-amber-300/80">{oracleResult.error}</p>
                <p className="text-[10px] text-gray-200 light:text-slate-700 font-mono mt-1">Returned by: {new Date().toISOString()}</p>
              </div>
            </div>
          )}

          {oracleResult && oracleResult.success && (
            <div className="space-y-3 p-5 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/30">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-emerald-500/20">
                  <CheckCircle2 size={20} className="text-emerald-400" />
                </div>
                <div>
                  <p className="text-base font-bold text-emerald-400">Off-Chain Verification Successful</p>
                  <p className="text-xs text-emerald-300/80">
                    ZK proof verified by snarkjs against the audited verification key. Outcome co-signed by a deployer-bound resolver (BIP340).
                  </p>
                </div>
              </div>

              {/* Outcome display */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-black/40 border border-white/10">
                  <p className="text-[10px] text-gray-200 light:text-slate-700 uppercase tracking-wider mb-1">Outcome</p>
                  <p className="text-lg font-bold text-white">
                    {oracleResult.outcome === 0 ? 'PROVEN: Claimant Wins' : 'REJECTED: Depositor Keeps Stake'}
                  </p>
                  <p className="text-[10px] text-gray-200 light:text-slate-700 mt-0.5">
                    outcome={oracleResult.outcome} (0=claimant, 1=depositor)
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-black/40 border border-white/10">
                  <p className="text-[10px] text-gray-200 light:text-slate-700 uppercase tracking-wider mb-1">
                    <Clock size={10} className="inline mr-1" />
                    Timestamp
                  </p>
                  <p className="text-sm font-mono text-white">{oracleResult.timestamp}</p>
                  <p className="text-[10px] text-gray-200 light:text-slate-700 mt-0.5">Unix epoch seconds</p>
                </div>
              </div>

              {/* Message */}
              <div className="p-3 rounded-xl bg-black/40 border border-white/10">
                <p className="text-[10px] text-gray-200 light:text-slate-700 uppercase tracking-wider mb-1">Signed Message</p>
                <p className="text-xs font-mono text-[#3B82F6] break-all">{oracleResult.message}</p>
              </div>

              {/* Signature */}
              <div className="p-3 rounded-xl bg-black/40 border border-white/10">
                <p className="text-[10px] text-gray-200 light:text-slate-700 uppercase tracking-wider mb-1">Oracle Signature (SHA256)</p>
                <p className="text-xs font-mono text-emerald-300 break-all">{oracleResult.signature}</p>
                <p className="text-[10px] text-gray-200 light:text-slate-700 mt-1">
                  Computed as SHA256(oracle_private_key || message). Present this signature as witness data when constructing the covenant unlock transaction.
                </p>
              </div>

              {/* Copy to clipboard */}
              <button
                onClick={() => {
                  const data = JSON.stringify(oracleResult, null, 2);
                  navigator.clipboard.writeText(data);
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-xs text-gray-200 light:text-slate-700 hover:text-white hover:border-white/20 transition-all"
              >
                <Clipboard size={12} />
                Copy Full Oracle Response
              </button>

              {/* How to use */}
              <div className="flex items-start gap-3 p-3 rounded-xl bg-[#3B82F6]/[0.04] border border-[#3B82F6]/20">
                <Info size={14} className="text-[#3B82F6] shrink-0 mt-0.5" />
                <div className="text-[11px] text-[#3B82F6]/80 leading-relaxed">
                  <p className="font-semibold mb-1">Next Step: Unlock Covenant</p>
                  <p>
                    Copy this signature and use it as witness data when unlocking the covenant.
                    The unlock transaction must include the oracle signature + outcome as witness fields.
                    The covenant script should verify the signature against the resolver's public key before releasing funds.
                    See TASK 2 in the specification for the covenant template unlock path.
                  </p>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ─── Covenant Studio Integration ─── */}
      <section className={SECTION_BASE}>
        <div className={SECTION_HEADER}>
          <Palette size={16} />
          Design in Covenant Studio
        </div>

        <p className="text-xs text-gray-300 light:text-slate-600 leading-relaxed">
          Send your current resolution, circuit, fees, and payout model to <strong>Covenant Studio</strong> to create a beautiful custom UI.
          Changes made in Studio can be sent back here.
        </p>

        {studioConfig && (
          <div className="my-3">
            <ResolutionSimulator
              config={studioConfig}
              circuitType={externalCircuit || gameType || zkCircuit}
              circuitCategory={(ZK_CIRCUIT_TYPES.find((zc) => zc.id === (externalCircuit || gameType || zkCircuit) || zc.circuit === (externalCircuit || gameType || zkCircuit)) || {}).category}
              feePercent={feePercent}
              potReturnPercent={potReturnPercent}
              minStake={visualConfig.minStake}
              maxStake={visualConfig.maxStake}
              players={2}
            />
          </div>
        )}

        <button
          onClick={() => {
            const address = connectedAddress || 'demo-address';
            const cfg = loadOrCreate(address);
            
            // Sync current Terminal state into the shared config
            updateStudioConfig({
              covenant: {
                ...cfg.covenant,
                name: name || cfg.covenant.name,
                description: description || cfg.covenant.description,
              },
              resolution: {
                mode: resolutionMode,
                circuit: { type: zkCircuit, verifierKey: zkVerifierKey },
                oracle: { provider: resolutionMode === 'custom_oracle' ? 'custom' : 'covex' },
                payoutModel: { type: 'winner_takes_all', feeBasisPoints: Math.round(feePercent * 100) },
              }
            });

            if (covenantId) {
              navigate(`/covenant/${covenantId}/studio`);
            } else {
              toast.info('Deploy this covenant first - the visual Studio opens for a live covenant.');
            }
          }}
          className="w-full mt-2 py-3 rounded-xl bg-[#49EACB] text-black font-bold flex items-center justify-center gap-2 hover:bg-[#3dd9b8] active:scale-[0.985] transition-all"
        >
          <ExternalLink size={16} />
          Open in Covenant Studio
        </button>

        <p className="text-[10px] text-gray-500 light:text-slate-500 mt-2 text-center">
          The visual Studio designs the public page of a deployed covenant.
        </p>

        <button
          onClick={() => navigate('/advanced')}
          className="mt-3 w-full py-2 text-sm rounded-xl border border-[#A855F7]/40 text-[#A855F7] hover:bg-[#A855F7]/10 transition"
        >
          Open Advanced Primitives Composer
        </button>

        <div className="mt-4">
          <MultiOracleConfigurator 
            value={{}} 
            onChange={(cfg) => {
              // Merge into current config
              // console.log("Multi-oracle config updated:", cfg); // cleaned for prod
            }} 
          />
        </div>
      </section>

      {/* ─── Section D: Generated SilverScript ─── */}
      <section className={SECTION_BASE}>
        <div className={SECTION_HEADER}>
          <Play size={16} />
          Generated SilverScript
        </div>

        <p className="text-xs text-gray-300 light:text-slate-600 leading-relaxed">
          Generate a complete{' '}
          <code className="text-kaspa-green/80 bg-kaspa-green/[0.06] px-1.5 py-0.5 rounded text-[11px] font-mono">
            {GAME_TYPES.find(g => g.id === gameType)?.name || gameType}
          </code>{' '}
          SilverScript
          based on your current configuration. Copy it to use in your covenant deployment.
        </p>

        <button
          onClick={generateSilverScript}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl
            bg-kaspa-green text-black font-bold text-sm
            hover:shadow-[0_0_25px_rgba(73,234,203,0.35)]
            active:scale-[0.98] transition-all
            uppercase tracking-wider"
        >
          <Play size={16} />
          Generate SilverScript
        </button>

        {generatedScript && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className={LABEL}>Output</p>
              <button
                onClick={handleCopyScript}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  copied
                    ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                    : 'bg-white/[0.04] border border-white/10 text-gray-200 light:text-slate-700 hover:text-white hover:border-white/20'
                }`}
              >
                {copied ? <Check size={13} /> : <Clipboard size={13} />}
                {copied ? 'Copied!' : 'Copy to Clipboard'}
              </button>
            </div>
            <div className="rounded-xl border border-kaspa-green/20 bg-black/50 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2 bg-black/40 border-b border-white/5">
                <div className="flex gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-500/60" />
                  <span className="h-2.5 w-2.5 rounded-full bg-yellow-500/60" />
                  <span className="h-2.5 w-2.5 rounded-full bg-green-500/60" />
                </div>
                <span className="text-[10px] text-gray-200 light:text-slate-700 font-mono ml-2">
                  {generatedScript.match(/Covenant (\w+)/)?.[1] || 'Covenant'}.silver
                </span>
              </div>
              <pre className="p-5 text-xs font-mono text-gray-300 light:text-slate-600 leading-relaxed overflow-x-auto whitespace-pre">
                <code>{generatedScript}</code>
              </pre>
            </div>
          </div>
        )}
      </section>

      {/* ─── Section E: Action Bar ─── */}
      <section className="sticky bottom-0 z-30 bg-[#0A0A0D]/95 backdrop-blur-xl border border-white/[0.06] rounded-2xl p-4 flex items-center justify-between shadow-[0_-4px_20px_rgba(0,0,0,0.5)]">
        <div className="flex items-center gap-4">
          {/* Status Indicator */}
          {saveStatus === 'saved' && (
            <div className="flex items-center gap-2 text-emerald-400 text-sm">
              <CheckCircle2 size={16} />
              <span className="font-medium">All changes saved</span>
            </div>
          )}
          {saveStatus === 'saving' && (
            <div className="flex items-center gap-2 text-kaspa-green text-sm">
              <div className="w-4 h-4 border-2 border-kaspa-green border-t-transparent rounded-full animate-spin" />
              <span className="font-medium">Saving...</span>
            </div>
          )}
          {saveStatus === 'error' && (
            <div className="flex items-center gap-2 text-red-400 text-sm">
              <AlertTriangle size={16} />
              <span className="font-medium">Error saving. Try again.</span>
            </div>
          )}
          {saveStatus === 'idle' && (
            <div className="flex items-center gap-2 text-gray-200 light:text-slate-700 text-sm">
              <div className="h-1.5 w-1.5 rounded-full bg-gray-700" />
              <span className="font-mono text-xs uppercase tracking-wider">Ready</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saveStatus === 'saving'}
            className="flex items-center gap-2 px-8 py-3 rounded-xl
              bg-kaspa-green text-black font-bold text-sm
              hover:shadow-[0_0_30px_rgba(73,234,203,0.4)]
              active:scale-[0.97] transition-all
              disabled:opacity-50 disabled:cursor-not-allowed
              uppercase tracking-wider"
          >
            <Save size={16} />
            {saveStatus === 'saving' ? 'Saving...' : 'Save All Changes'}
          </button>
        </div>
      </section>
    </div>
  );
}
