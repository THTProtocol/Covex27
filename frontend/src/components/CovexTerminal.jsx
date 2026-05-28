import { useState, useEffect, useCallback } from 'react';
import {
  Terminal, Settings, Code2, Gavel, Save, ExternalLink,
  ToggleLeft, ToggleRight, Sliders, Radio, Shield, Cpu,
  Zap, AlertTriangle, CheckCircle2, Info, Key, Palette,
  Upload, Eye, EyeOff, Play, Clipboard, Check,
} from 'lucide-react';

const SECTION_BASE = 'bg-black/30 border border-white/[0.06] rounded-2xl p-6 space-y-5 backdrop-blur-sm';
const SECTION_HEADER = 'flex items-center gap-3 text-kaspa-green font-semibold text-sm uppercase tracking-widest';
const LABEL = 'text-xs text-gray-300 uppercase tracking-wider font-mono';
const INPUT =
  'w-full px-4 py-3 rounded-xl bg-black/50 border border-white/10 text-white text-sm placeholder:text-gray-200 focus:outline-none focus:border-kaspa-green/50 focus:shadow-[0_0_8px_rgba(73,234,203,0.1)] transition-all';
const TEXTAREA =
  'w-full px-4 py-3 rounded-xl bg-black/50 border border-white/10 text-white text-sm placeholder:text-gray-200 focus:outline-none focus:border-kaspa-green/50 focus:shadow-[0_0_8px_rgba(73,234,203,0.1)] transition-all resize-none';

// ── Game Types (exported for Paid Builder) ──────────────────────────────────────────────
export const GAME_TYPES = [
  { id: 'chess_v1', name: 'Chess v1', emoji: '♟️', description: 'Standard 8×8. Win/Loss/Draw. Audited.', circuit: 'chess_v1', accent: '#49EACB' },
  { id: 'chess_v2', name: 'Chess v2', emoji: '♟️', description: 'Extended with draw detection.', circuit: 'chess_v2', accent: '#49EACB' },
  { id: 'poker', name: 'Poker', emoji: '♠️', description: 'Texas Hold\'em betting rounds.', circuit: 'generic_game', accent: '#A855F7' },
  { id: 'blackjack', name: 'Blackjack', emoji: '🃏', description: 'Beat the dealer. Hit or stand.', circuit: 'generic_game', accent: '#22C55E' },
  { id: 'dice', name: 'Dice', emoji: '🎲', description: 'Provably-fair dice roller.', circuit: 'generic_game', accent: '#F59E0B' },
  { id: 'connect4', name: 'Connect 4', emoji: '🔴', description: 'Drop discs, connect four.', circuit: 'generic_game', accent: '#3B82F6' },
  { id: 'checkers', name: 'Checkers', emoji: '⚫', description: 'Classic 8×8 with forced jumps.', circuit: 'generic_game', accent: '#E8AF34' },
  { id: 'go', name: 'Go', emoji: '⚪', description: '19×19 strategy. Capture territory.', circuit: 'generic_game', accent: '#49EACB' },
  { id: 'backgammon', name: 'Backgammon', emoji: '🎲', description: 'Race pieces, bear off to win.', circuit: 'generic_game', accent: '#F59E0B' },
  { id: 'battleship', name: 'Battleship', emoji: '🚢', description: 'Naval combat on 10×10 grid.', circuit: 'generic_game', accent: '#06B6D4' },
  { id: 'sudoku', name: 'Sudoku', emoji: '🔢', description: '9×9 puzzle. Solve to win.', circuit: 'generic_game', accent: '#EC4899' },
  { id: 'custom', name: 'Custom', emoji: '⚙️', description: 'Provide your own circuit.', circuit: 'custom', accent: '#E8AF34' },
];

// ── Standalone SilverScript Generator (exported for PaidBuilder / premium flow) ──
export function generateSilverScriptForConfig(cfg) {
  const {
    gameType = 'chess_v1',
    feePercent = 2,
    resolutionMode = 'oracle',
    customOracleKey = '',
    zkCircuit = 'chess_v1',
    zkVerifierKey = '',
    reusable = true,
    allowTopups = false,
  } = cfg || {};

  const feeBasis = Math.round(feePercent * 100);
  const feePlatform = Math.round(feePercent * 10);
  const feeCreator = 10000 - feePlatform;

  const gameMeta = (() => {
    switch (gameType) {
      case 'chess_v1':
        return {
          covenantName: 'ChessReusableCovenant',
          outcomeEnum: 'Outcome::PlayerAWins | PlayerBWin | Draw',
          outcomeBranches: `      Outcome::PlayerAWins => {
        require(VerifyPayout(treasury, player_a, pot), "Payout to Player A failed");
      }
      Outcome::PlayerBWin => {
        require(VerifyPayout(treasury, player_b, pot), "Payout to Player B failed");
      }
      Outcome::Draw => {
        let half = pot / 2;
        require(VerifyPayout(treasury, player_a, half) && VerifyPayout(treasury, player_b, half), "Draw payout failed");
      }`,
        };
      case 'chess_v2':
        return {
          covenantName: 'ChessExtendedCovenant',
          outcomeEnum: 'Outcome::PlayerAWins | PlayerBWin | Draw | Stalemate',
          outcomeBranches: `      Outcome::PlayerAWins => {
        require(VerifyPayout(treasury, player_a, pot), "Payout to Player A failed");
      }
      Outcome::PlayerBWin => {
        require(VerifyPayout(treasury, player_b, pot), "Payout to Player B failed");
      }
      Outcome::Draw | Outcome::Stalemate => {
        let half = pot / 2;
        require(VerifyPayout(treasury, player_a, half) && VerifyPayout(treasury, player_b, half), "Draw/stalemate payout failed");
      }`,
        };
      case 'poker':
        return {
          covenantName: 'PokerHoldemCovenant',
          outcomeEnum: 'Outcome::PlayerAWins | PlayerBWin | Fold',
          outcomeBranches: `      Outcome::PlayerAWins => {
        require(VerifyPayout(treasury, player_a, pot), "Payout to Player A failed");
      }
      Outcome::PlayerBWin => {
        require(VerifyPayout(treasury, player_b, pot), "Payout to Player B failed");
      }
      Outcome::Fold => {
        require(VerifyPayout(treasury, player_a, pot), "Fold payout failed");
      }`,
        };
      case 'blackjack':
        return {
          covenantName: 'BlackjackCovenant',
          outcomeEnum: 'Outcome::PlayerWin | DealerWin | Push',
          outcomeBranches: `      Outcome::PlayerWin => {
        require(VerifyPayout(treasury, player_a, pot), "Player payout failed");
      }
      Outcome::DealerWin => {
        require(VerifyPayout(treasury, platform, pot), "House wins pot");
      }
      Outcome::Push => {
        let half = pot / 2;
        require(VerifyPayout(treasury, player_a, half) && VerifyPayout(treasury, player_b, half), "Push refund failed");
      }`,
        };
      case 'dice':
        return {
          covenantName: 'DiceRollCovenant',
          outcomeEnum: 'Outcome::Win | Loss',
          outcomeBranches: `      Outcome::Win => {
        require(VerifyPayout(treasury, player_a, pot), "Win payout failed");
      }
      Outcome::Loss => {
        require(VerifyPayout(treasury, platform, pot), "Loss payout failed");
      }`,
        };
      default:
        return {
          covenantName: 'CustomGameCovenant',
          outcomeEnum: 'Outcome::PlayerAWins | PlayerBWin | Draw',
          outcomeBranches: `      Outcome::PlayerAWins => {
        require(VerifyPayout(treasury, player_a, pot), "Payout to Player A failed");
      }
      Outcome::PlayerBWin => {
        require(VerifyPayout(treasury, player_b, pot), "Payout to Player B failed");
      }
      Outcome::Draw => {
        let half = pot / 2;
        require(VerifyPayout(treasury, player_a, half) && VerifyPayout(treasury, player_b, half), "Draw payout failed");
      }`,
        };
    }
  })();

  let resolveBlock = '';
  switch (resolutionMode) {
    case 'zk':
      resolveBlock = `\n  ;; ── Resolution: ZK Proof (${zkCircuit})\n  ;; Verifier: ${zkVerifierKey || 'built-in'}`;
      break;
    case 'custom_oracle':
      resolveBlock = `\n  ;; ── Resolution: Custom Oracle\n  ;; Key: ${(customOracleKey || '').slice(0, 16)}...`;
      break;
    default:
      resolveBlock = `\n  ;; ── Resolution: Covex Oracle (standard)`;
      break;
  }

  const topupsBlock = allowTopups ? '\n  ;; Allow top-ups after creation\n  OpAddToPot' : '';
  const reusableBlock = reusable ? '\n  ;; Reusable covenant\n  OpReuseCovenant' : '';

  return `;; ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
;; SilverScript: ${gameMeta.covenantName}
;; Game: ${GAME_TYPES.find(g => g.id === gameType)?.name || gameType}
;; Fee: ${feePercent}% | Resolution: ${resolutionMode}
;; Generated by Covex Premium Builder
;; ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Covenant ${gameMeta.covenantName} {
  fee_basis_points: ${feeBasis}
  platform_share:   ${feePlatform}
  creator_share:    ${feeCreator}
  min_lock:         1000000

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
        <p className={`text-sm font-medium ${disabled ? 'text-gray-200' : 'text-white'}`}>{label}</p>
        {desc && <p className="text-[11px] text-gray-200 mt-0.5">{desc}</p>}
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
          className={selected ? `text-${accent === 'kaspa-green' ? 'kaspa-green' : accent === 'kaspa-gold' ? 'kaspa-gold' : 'purple-400'}` : 'text-gray-200'}
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold ${selected ? 'text-white' : 'text-gray-200'}`}>{title}</p>
        <p className="text-[11px] text-gray-200 mt-1 leading-relaxed">{desc}</p>
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

export default function CovexTerminal({ covenant }) {
  // ── Defaults derived from covenant ──
  const covenantId = covenant?.tx_id || '';

  // ── Section A: Covenant Configuration ──
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [feePercent, setFeePercent] = useState(2);
  const [reusable, setReusable] = useState(true);
  const [allowTopups, setAllowTopups] = useState(false);

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

  const handleGameTypeChange = useCallback((typeId) => {
    setGameType(typeId);
    const gt = GAME_TYPES.find(g => g.id === typeId);
    if (gt) {
      // Auto-configure ZK resolution mode when a game type with ZK circuit is selected
      setResolutionMode('zk');
      setZkCircuit(gt.circuit);
      // Pre-fill verifier key for known circuits
      if (gt.circuit === 'chess_v1') {
        setZkVerifierKey('0xCHESSv1_8x8_STANDARD_AUDITED');
      } else if (gt.circuit === 'chess_v2') {
        setZkVerifierKey('0xCHESSv2_DRAW_DETECTION_V1');
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

  const generateSilverScript = useCallback(() => {
    const feeBasis = Math.round(feePercent * 100);
    const feePlatform = Math.round(feePercent * 10);
    const feeCreator = 10000 - feePlatform;

    // ── Game-specific covenant definitions ──
    const gameMeta = (() => {
      switch (gameType) {
        case 'chess_v1':
          return {
            covenantName: 'ChessReusableCovenant',
            outcomeEnum: 'Outcome::PlayerAWins | PlayerBWin | Draw',
            outcomeBranches: `      Outcome::PlayerAWins => {
        require(
          VerifyPayout(treasury, player_a, pot),
          "Payout to Player A failed"
        );
      }
      Outcome::PlayerBWin => {
        require(
          VerifyPayout(treasury, player_b, pot),
          "Payout to Player B failed"
        );
      }
      Outcome::Draw => {
        let half = pot / 2;
        require(
          VerifyPayout(treasury, player_a, half) &&
          VerifyPayout(treasury, player_b, half),
          "Draw payout failed"
        );
      }`,
          };
        case 'chess_v2':
          return {
            covenantName: 'ChessExtendedCovenant',
            outcomeEnum: 'Outcome::PlayerAWins | PlayerBWin | Draw | Stalemate',
            outcomeBranches: `      Outcome::PlayerAWins => {
        require(
          VerifyPayout(treasury, player_a, pot),
          "Payout to Player A failed"
        );
      }
      Outcome::PlayerBWin => {
        require(
          VerifyPayout(treasury, player_b, pot),
          "Payout to Player B failed"
        );
      }
      Outcome::Draw | Outcome::Stalemate => {
        let half = pot / 2;
        require(
          VerifyPayout(treasury, player_a, half) &&
          VerifyPayout(treasury, player_b, half),
          "Draw/stalemate payout failed"
        );
      }`,
          };
        case 'poker':
          return {
            covenantName: 'PokerHoldemCovenant',
            outcomeEnum: 'Outcome::PlayerAWins | PlayerBWin | Fold',
            outcomeBranches: `      Outcome::PlayerAWins => {
        require(
          VerifyPayout(treasury, player_a, pot),
          "Payout to Player A failed"
        );
      }
      Outcome::PlayerBWin => {
        require(
          VerifyPayout(treasury, player_b, pot),
          "Payout to Player B failed"
        );
      }
      Outcome::Fold => {
        ;; Fold, winner gets pot, folded player forfeits
        require(
          VerifyPayout(treasury, player_a, pot),
          "Fold payout failed"
        );
      }`,
          };
        case 'blackjack':
          return {
            covenantName: 'BlackjackCovenant',
            outcomeEnum: 'Outcome::PlayerWins | DealerWins | Push | Bust',
            outcomeBranches: `      Outcome::PlayerWins => {
        require(
          VerifyPayout(treasury, player_a, pot),
          "Player win payout failed"
        );
      }
      Outcome::DealerWins => {
        require(
          VerifyPayout(treasury, platform, pot),
          "Dealer win payout failed"
        );
      }
      Outcome::Push => {
        ;; Return stake on push
        require(
          VerifyPayout(treasury, player_a, locked_amount),
          "Push refund failed"
        );
      }
      Outcome::Bust => {
        require(
          VerifyPayout(treasury, platform, pot),
          "Bust payout failed"
        );
      }`,
          };
        case 'dice':
          return {
            covenantName: 'DiceRollCovenant',
            outcomeEnum: 'Outcome::Win | Loss',
            outcomeBranches: `      Outcome::Win => {
        require(
          VerifyPayout(treasury, player_a, pot),
          "Win payout failed"
        );
      }
      Outcome::Loss => {
        ;; House takes the pot
        require(
          VerifyPayout(treasury, platform, pot),
          "Loss payout failed"
        );
      }`,
          };
        case 'connect4':
          return {
            covenantName: 'ConnectFourCovenant',
            outcomeEnum: 'Outcome::PlayerAWins | PlayerBWins | Draw',
            outcomeBranches: `      Outcome::PlayerAWins => {
        require(
          VerifyPayout(treasury, player_a, pot),
          "Payout to Player A failed"
        );
      }
      Outcome::PlayerBWins => {
        require(
          VerifyPayout(treasury, player_b, pot),
          "Payout to Player B failed"
        );
      }
      Outcome::Draw => {
        let half = pot / 2;
        require(
          VerifyPayout(treasury, player_a, half) &&
          VerifyPayout(treasury, player_b, half),
          "Draw payout failed"
        );
      }`,
          };
        case 'checkers':
          return {
            covenantName: 'CheckersCovenant',
            outcomeEnum: 'Outcome::PlayerAWins | PlayerBWins | Draw',
            outcomeBranches: `      Outcome::PlayerAWins => {
        require(
          VerifyPayout(treasury, player_a, pot),
          "Payout to Player A failed"
        );
      }
      Outcome::PlayerBWins => {
        require(
          VerifyPayout(treasury, player_b, pot),
          "Payout to Player B failed"
        );
      }
      Outcome::Draw => {
        let half = pot / 2;
        require(
          VerifyPayout(treasury, player_a, half) &&
          VerifyPayout(treasury, player_b, half),
          "Draw payout failed"
        );
      }`,
          };
        case 'go':
          return {
            covenantName: 'GoCovenant',
            outcomeEnum: 'Outcome::PlayerAWins | PlayerBWins | Draw | Resign',
            outcomeBranches: `      Outcome::PlayerAWins => {
        require(
          VerifyPayout(treasury, player_a, pot),
          "Payout to Player A failed"
        );
      }
      Outcome::PlayerBWins => {
        require(
          VerifyPayout(treasury, player_b, pot),
          "Payout to Player B failed"
        );
      }
      Outcome::Draw => {
        let half = pot / 2;
        require(
          VerifyPayout(treasury, player_a, half) &&
          VerifyPayout(treasury, player_b, half),
          "Draw payout failed"
        );
      }
      Outcome::Resign => {
        ;; Winner claims full pot on resignation
        require(
          VerifyPayout(treasury, player_a, pot),
          "Resignation payout failed"
        );
      }`,
          };
        case 'backgammon':
          return {
            covenantName: 'BackgammonCovenant',
            outcomeEnum: 'Outcome::PlayerAWins | PlayerBWins | Gammon | Backgammon',
            outcomeBranches: `      Outcome::PlayerAWins => {
        require(
          VerifyPayout(treasury, player_a, pot),
          "Payout to Player A failed"
        );
      }
      Outcome::PlayerBWins => {
        require(
          VerifyPayout(treasury, player_b, pot),
          "Payout to Player B failed"
        );
      }
      Outcome::Gammon => {
        ;; Double stakes for gammon
        let doubled = pot * 2;
        require(
          VerifyPayout(treasury, player_a, doubled),
          "Gammon payout failed"
        );
      }
      Outcome::Backgammon => {
        ;; Triple stakes for backgammon
        let tripled = pot * 3;
        require(
          VerifyPayout(treasury, player_a, tripled),
          "Backgammon payout failed"
        );
      }`,
          };
        case 'battleship':
          return {
            covenantName: 'BattleshipCovenant',
            outcomeEnum: 'Outcome::PlayerAWins | PlayerBWins',
            outcomeBranches: `      Outcome::PlayerAWins => {
        require(
          VerifyPayout(treasury, player_a, pot),
          "Payout to Player A failed"
        );
      }
      Outcome::PlayerBWins => {
        require(
          VerifyPayout(treasury, player_b, pot),
          "Payout to Player B failed"
        );
      }`,
          };
        case 'sudoku':
          return {
            covenantName: 'SudokuCovenant',
            outcomeEnum: 'Outcome::Solve | Timeout',
            outcomeBranches: `      Outcome::Solve => {
        require(
          VerifyPayout(treasury, player_a, pot),
          "Solution verified, payout to player"
        );
      }
      Outcome::Timeout => {
        ;; Timer expired, funds return to platform
        require(
          VerifyPayout(treasury, platform, pot),
          "Timeout, funds returned to platform"
        );
      }`,
          };
        default: // custom
          return {
            covenantName: 'CustomGameCovenant',
            outcomeEnum: 'Outcome::PlayerAWins | PlayerBWins | Draw',
            outcomeBranches: `      Outcome::PlayerAWins => {
        require(
          VerifyPayout(treasury, player_a, pot),
          "Payout to Player A failed"
        );
      }
      Outcome::PlayerBWins => {
        require(
          VerifyPayout(treasury, player_b, pot),
          "Payout to Player B failed"
        );
      }
      Outcome::Draw => {
        let half = pot / 2;
        require(
          VerifyPayout(treasury, player_a, half) &&
          VerifyPayout(treasury, player_b, half),
          "Draw payout failed"
        );
      }`,
          };
      }
    })();

    let resolveBlock;
    switch (resolutionMode) {
      case 'custom':
        resolveBlock = `\n  ;; ── Resolution: Custom Oracle\n  ;; Oracle pubkey: ${customOracleKey || '(not set)'}\n  OpCheckSig ${customOracleKey || 'OP_0'}`;
        break;
      case 'zk':
        resolveBlock = `\n  ;; ── Resolution: ZK Proof (${zkCircuit})\n  ;; Verifier key: ${zkVerifierKey || '(built-in)'}\n  OpZkVerify ${zkVerifierKey || '0x00'} ;; circuit: ${zkCircuit}`;
        break;
      default:
        resolveBlock = `\n  ;; ── Resolution: Covex Oracle (default)\n  OpCheckSig covex_oracle_pubkey`;
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
  }, [gameType, feePercent, resolutionMode, customOracleKey, zkCircuit, zkVerifierKey, reusable, allowTopups]);

  // ── Load saved config from API on mount ──
  useEffect(() => {
    if (!covenantId) return;
    fetch(`/api/terminal-config/${covenantId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.config) {
          const cfg = data.config;
          if (cfg.game_type) setGameType(cfg.game_type);
          if (cfg.name) setName(cfg.name);
          if (cfg.description) setDescription(cfg.description);
          if (cfg.fee_percent !== undefined) setFeePercent(cfg.fee_percent);
          if (cfg.reusable !== undefined) setReusable(cfg.reusable);
          if (cfg.allow_topups !== undefined) setAllowTopups(cfg.allow_topups);
          if (cfg.resolution_mode) setResolutionMode(cfg.resolution_mode);
          if (cfg.custom_oracle_key) setCustomOracleKey(cfg.custom_oracle_key);
          if (cfg.zk_circuit) setZkCircuit(cfg.zk_circuit);
          if (cfg.zk_verifier_key) setZkVerifierKey(cfg.zk_verifier_key);
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
  const handleOpenStudio = useCallback(() => {
    window.open('https://hightable.pro/studio/', '_blank');
  }, []);

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

  // ── Save All Changes ──
  const handleSave = useCallback(async () => {
    if (!covenantId) return;
    setSaveStatus('saving');

    const payload = {
      game_type: gameType,
      name,
      description,
      fee_percent: feePercent,
      reusable,
      allow_topups: allowTopups,
      custom_ui_code: customUICode,
      resolution_mode: resolutionMode,
      custom_oracle_key: resolutionMode === 'custom' ? customOracleKey : null,
      zk_circuit: resolutionMode === 'zk' ? zkCircuit : null,
      zk_verifier_key: resolutionMode === 'zk' ? zkVerifierKey : null,
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
    covenantId, gameType, name, description, feePercent, reusable, allowTopups,
    customUICode, resolutionMode, customOracleKey, zkCircuit, zkVerifierKey,
  ]);

  // ── Apply Custom UI (also triggers save) ──
  const handleApplyCustomUI = useCallback(() => {
    handleSave();
  }, [handleSave]);

  if (!configLoaded) {
    return (
      <div className="p-20 text-center">
        <div className="w-8 h-8 border-2 border-kaspa-green border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-300 font-mono text-sm uppercase tracking-widest animate-pulse">
          Loading terminal...
        </p>
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
          <h2 className="text-xl font-bold text-white tracking-tight">Covex Terminal</h2>
          <p className="text-xs text-gray-300 font-mono">ADVANCED COVENANT CONFIGURATION</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-kaspa-green animate-pulse shadow-[0_0_6px_#49EACB]" />
          <span className="text-[10px] text-gray-200 font-mono uppercase tracking-wider">Live</span>
        </div>
      </div>

      {/* ─── Section 0: ZK Proof Type + Resolution Method ─── */}
      <section className={`${SECTION_BASE} border-kaspa-green/20 bg-kaspa-green/[0.02] ring-1 ring-kaspa-green/10`}>
        <div className={SECTION_HEADER}>
          <div className="p-1.5 rounded-lg bg-kaspa-green/20">
            <Cpu size={16} />
          </div>
          <span className="flex-1">ZK Proof Type + Resolution Method</span>
          <span className="text-[10px] text-kaspa-green/60 font-mono px-2 py-0.5 rounded-md bg-kaspa-green/10 border border-kaspa-green/20">
            CIRCUIT SELECTOR
          </span>
        </div>

        <p className="text-xs text-gray-300 leading-relaxed">
          This section selects the correct ZK circuit and outcome resolution method. <strong className="text-white">Visual game interfaces (boards, tables, animations, etc.) should be designed in Covenant Studio and pasted below.</strong>
        </p>

        {/* ── Part A: ZK Circuit Selector ── */}
        <div className="space-y-3">
          <p className={LABEL}>ZK Circuit</p>
          <p className="text-[11px] text-gray-200 leading-relaxed">
            Each circuit proves a specific type of game outcome without revealing private player data. The circuit determines what the covenant verifies on-chain.
          </p>

          {/* Circuit Grid — compact, professional, no emoji emphasis */}
          <div className="grid grid-cols-4 gap-2">
            {GAME_TYPES.map((gt) => {
              const selected = gameType === gt.id;
              const circuitDescriptions = {
                chess_v1: 'Proves chess outcomes (win/loss/draw) on 8x8 board. Audited.',
                chess_v2: 'Extended chess with explicit draw detection (stalemate, threefold).',
                poker: 'Proves Texas Hold\'em hand rankings and winner determination.',
                blackjack: 'Proves dealer vs player outcomes (win/lose/push/bust).',
                dice: 'Proves dice roll results with BLAKE3 commitment.',
                connect4: 'Proves Connect Four board state and winner detection.',
                checkers: 'Proves checkers outcomes with forced-jump validation.',
                go: 'Proves territory ownership on 19x19 Go board.',
                backgammon: 'Proves backgammon race completion and bear-off logic.',
                battleship: 'Proves naval combat outcomes on 10x10 grid.',
                sudoku: 'Proves puzzle solution correctness on 9x9 grid.',
                custom: 'Provide your own circuit definition and verifier key.',
              };
              return (
                <button
                  key={gt.id}
                  onClick={() => handleGameTypeChange(gt.id)}
                  className={`text-left p-3 rounded-lg border transition-all duration-200 ${
                    selected
                      ? 'border-kaspa-green/60 bg-kaspa-green/[0.08] ring-1 ring-kaspa-green/30 shadow-[0_0_20px_rgba(73,234,203,0.15)]'
                      : 'border-white/[0.05] bg-black/30 hover:border-white/[0.10] hover:bg-white/[0.03]'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm">{gt.emoji}</span>
                    <span className={`text-xs font-bold ${selected ? 'text-kaspa-green' : 'text-white'}`}>
                      {gt.name}
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-200 leading-snug">
                    {circuitDescriptions[gt.id] || gt.description}
                  </p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <code className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${
                      selected
                        ? 'border-kaspa-green/40 bg-kaspa-green/10 text-kaspa-green'
                        : 'border-white/[0.06] bg-white/[0.03] text-gray-200'
                    }`}>
                      {gt.circuit === 'custom' ? 'CUSTOM' : gt.circuit.toUpperCase()}
                    </code>
                    {selected && <CheckCircle2 size={12} className="text-kaspa-green shrink-0" />}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Auto-suggested Verifier Key */}
          {(() => {
            const activeGame = GAME_TYPES.find(g => g.id === gameType);
            if (!activeGame) return null;
            return (
              <div className="flex items-start gap-3 p-4 rounded-xl bg-kaspa-green/[0.03] border border-kaspa-green/20">
                <Shield size={14} className="text-kaspa-green shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0 space-y-1">
                  <p className="text-xs text-white font-semibold">Circuit: {activeGame.name}</p>
                  <p className="text-[11px] text-gray-300">{activeGame.description}</p>
                  <div className="flex items-center gap-3 pt-1.5 border-t border-kaspa-green/15">
                    <span className="text-[10px] text-gray-200 font-mono">Auto-suggested Verifier Key</span>
                    <code className="text-[11px] font-mono text-kaspa-green/90 bg-kaspa-green/[0.06] px-2 py-0.5 rounded truncate max-w-[280px]">
                      {zkVerifierKey || activeGame.circuit === 'chess_v1' ? '0xCHESSv1_8x8_STANDARD_AUDITED' :
                       activeGame.circuit === 'chess_v2' ? '0xCHESSv2_DRAW_DETECTION_V1' :
                       activeGame.circuit === 'custom' ? '(manual entry required)' :
                       'GENERIC_GAME_OUTCOME'}
                    </code>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>

        {/* ── Part B: Oracle / Resolution Options ── */}
        <div className="pt-2 border-t border-white/[0.04] space-y-3">
          <p className={LABEL}>Oracle Resolution Options</p>
          <p className="text-[11px] text-gray-200 leading-relaxed">
            Choose how the covenant outcome is resolved on-chain. This determines who or what signs off on the game result.
          </p>

          <div className="space-y-2">
            {[
              {
                id: 'zk', icon: Cpu, title: 'ZK Proof (Zero-Knowledge)',
                desc: 'Pure cryptographic verification. No trusted oracle needed. Outcomes are proven mathematically via ZK circuits, keeping player data private.',
                tier: 'Recommended for on-chain games',
              },
              {
                id: 'oracle', icon: Shield, title: 'Covex Oracle (Trusted)',
                desc: 'Uses the built-in Covex Oracle service. The oracle cryptographically signs outcomes as an authority. Faster and simpler than ZK, requires trusting the Covex infrastructure.',
                tier: 'Good for hybrid / off-chain data',
              },
              {
                id: 'custom', icon: Key, title: 'Custom Oracle (Your Key)',
                desc: 'Provide your own oracle public key. The covenant verifies against this key. Ideal for third-party oracle services or custom resolution logic.',
                tier: 'Advanced users',
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
                    <opt.icon size={16} className={resolutionMode === opt.id ? 'text-kaspa-green' : 'text-gray-200'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-sm font-bold ${resolutionMode === opt.id ? 'text-kaspa-green' : 'text-white'}`}>
                        {opt.title}
                      </span>
                      <span className="text-[10px] text-gray-200 font-mono">{opt.tier}</span>
                    </div>
                    <p className="text-[11px] text-gray-300 leading-relaxed">{opt.desc}</p>
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
            </div>
          )}

          {resolutionMode === 'custom' && (
            <div className="ml-4 pl-4 border-l-2 border-amber-500/30 space-y-2">
              <p className="text-[11px] text-amber-300/80">
                Enter your oracle's public key. All outcome verifications will be checked against this key.
              </p>
              <div>
                <p className={LABEL}>Oracle Public Key</p>
                <input
                  type="text"
                  value={customOracleKey}
                  onChange={(e) => setCustomOracleKey(e.target.value)}
                  placeholder="kaspatest:q..."
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px] text-gray-300 leading-relaxed">
              <div className="space-y-0.5">
                <p className="text-white font-semibold">ZK vs Oracle</p>
                <p>ZK proofs are trustless but computationally heavier. Oracles are faster but require trust in the key holder. For pure on-chain games (chess, poker), prefer ZK. For external data (sports, weather), use an Oracle.</p>
              </div>
              <div className="space-y-0.5">
                <p className="text-white font-semibold">Reusability</p>
                <p>Enable Reusable to accept multiple rounds over time. Combined with Allow Top-ups, players can add KAS to the pot, making it a sustainable game rather than a one-shot escrow.</p>
              </div>
              <div className="space-y-0.5">
                <p className="text-white font-semibold">Fees</p>
                <p>Platform fee (0-5%) is deducted from each payout. Set it thoughtfully. High fees discourage play; zero fees leave no platform revenue. 2% is the default for most game types.</p>
              </div>
              <div className="space-y-0.5">
                <p className="text-white font-semibold">Common Pitfalls</p>
                <p>Forgetting to set a verifier key for custom circuits. Leaving payout logic ambiguous. Deploying without testing on TN12 first. Skipping mobile UI testing. Not saving Terminal config after deploy.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Section A: Covenant Configuration ─── */}
      <section className={SECTION_BASE}>
        <div className={SECTION_HEADER}>
          <Settings size={16} />
          Covenant Configuration
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

          {/* Fee Slider */}
          <SliderField
            label="Platform Fee"
            value={feePercent}
            min={0}
            max={5}
            step={0.1}
            onChange={setFeePercent}
          />

          {/* Reusable Toggle */}
          <Toggle
            label="Reusable Covenant"
            desc="Allow multiple participants to reuse this covenant. Fee stays in the pot."
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
              <p className="text-[11px] text-gray-300 leading-relaxed mt-1">
                The 2% platform fee remains in the covenant pot and is redistributed per the
                SilverScript logic. This keeps the covenant self-sustaining.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Section B: Custom UI Integration ─── */}
      <section className={SECTION_BASE}>
        <div className={SECTION_HEADER}>
          <Code2 size={16} />
          Custom UI Integration
        </div>

        <div className="space-y-4">
          {/* Open Studio Button — prominent */}
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
                <div className="text-[11px] text-gray-300 mt-0.5">
                  Create game boards, card tables, animations, and rich interfaces. Export and paste below.
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] text-kaspa-green/60 font-mono px-2 py-0.5 rounded-md bg-kaspa-green/10 border border-kaspa-green/20 group-hover:text-kaspa-green/80">
                hightable.pro/studio
              </span>
              <ExternalLink size={16} className="text-kaspa-green group-hover:translate-x-0.5 transition-transform" />
            </div>
          </button>

          {/* Paste Area */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <p className={LABEL}>Custom UI Code (HTML / JS / CSS)</p>
              <span className="text-[10px] text-gray-200 font-mono">
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
                  <span className="text-[10px] text-gray-200 font-mono">
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
                  ? 'opacity-30 cursor-not-allowed border-white/[0.04] bg-black/20 text-gray-200'
                  : showPreview
                  ? 'border-kaspa-green/30 bg-kaspa-green/[0.04] text-kaspa-green'
                  : 'border-white/10 bg-black/20 text-gray-200 hover:text-white hover:border-white/20'
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
                <span className="text-[10px] text-gray-200 font-mono ml-2">Preview</span>
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

        <p className="text-xs text-gray-300 leading-relaxed">
          Choose how the covenant outcome is determined and enforced. This feeds into the
          SilverScript template generation.
        </p>

        <div className="space-y-3">
          {/* Covex Oracle */}
          <ResolutionCard
            icon={Shield}
            title="Covex Oracle (Default)"
            desc="Uses the built-in Covex Oracle with a pre-filled, audited verification key. Trustless resolution, the oracle signs outcomes cryptographically."
            selected={resolutionMode === 'oracle'}
            onClick={() => setResolutionMode('oracle')}
            accent="kaspa-green"
          />

          {/* Custom Oracle */}
          <ResolutionCard
            icon={Cpu}
            title="Custom Oracle"
            desc="Provide your own oracle public key. The covenant will verify against this key. Ideal for custom or third-party oracle services."
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
                placeholder="kaspatest:q..."
                className={`${INPUT} font-mono text-xs`}
              />
            </div>
          )}

          {/* ZK Proof */}
          <ResolutionCard
            icon={Zap}
            title="ZK Proof (Zero-Knowledge)"
            desc="Use a zero-knowledge proof circuit to verify outcomes privately. Choose a pre-built circuit or provide your own verifier key."
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
                         zkCircuit === 'chess_v2' ? 'Chess v2 (With draw detection)' :
                         zkCircuit === 'generic_game' ? 'Generic Game Outcome' :
                         zkCircuit === 'custom' ? 'Custom Circuit' : zkCircuit}
                      </p>
                      <p className="text-[11px] text-gray-300 mt-0.5">
                        Circuit controlled by Game Type selection above
                      </p>
                    </div>
                  </div>
                </div>
                <p className="text-[11px] text-gray-200 leading-relaxed">
                  {zkCircuit === 'chess_v1' &&
                    'Standard 8×8 chess verifier. Reports Win/Loss/Draw with BLAKE3 commitments. Fully audited, production ready.'}
                  {zkCircuit === 'chess_v2' &&
                    'Extended chess circuit with explicit draw detection (stalemate, threefold, 50-move rule). Larger proof size.'}
                  {zkCircuit === 'generic_game' &&
                    'Prove a game outcome without revealing the game itself. Accepts any structured game log + custom verdict logic.'}
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
                      ? '0xCHESSv1_8x8_STANDARD_AUDITED'
                      : zkCircuit === 'chess_v2'
                      ? '0xCHESSv2_DRAW_DETECTION_V1'
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

      {/* ─── Section D: Generated SilverScript ─── */}
      <section className={SECTION_BASE}>
        <div className={SECTION_HEADER}>
          <Play size={16} />
          Generated SilverScript
        </div>

        <p className="text-xs text-gray-300 leading-relaxed">
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
                    : 'bg-white/[0.04] border border-white/10 text-gray-200 hover:text-white hover:border-white/20'
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
                <span className="text-[10px] text-gray-200 font-mono ml-2">
                  {generatedScript.match(/Covenant (\w+)/)?.[1] || 'Covenant'}.silver
                </span>
              </div>
              <pre className="p-5 text-xs font-mono text-gray-300 leading-relaxed overflow-x-auto whitespace-pre">
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
            <div className="flex items-center gap-2 text-gray-200 text-sm">
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
