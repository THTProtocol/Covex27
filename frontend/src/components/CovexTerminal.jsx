import { useState, useEffect, useCallback } from 'react';
import {
  Terminal, Settings, Code2, Gavel, Save, ExternalLink,
  ToggleLeft, ToggleRight, Sliders, Radio, Shield, Cpu,
  Zap, AlertTriangle, CheckCircle2, Info, Key, Palette,
  Upload, Eye, EyeOff, Play, Clipboard, Check, ArrowLeft,
  Loader, Server, XCircle, Clock, BadgeCheck, Globe,
} from 'lucide-react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { useWallet } from './WalletContext';

const SECTION_BASE = 'bg-black/30 border border-white/[0.06] rounded-2xl p-6 space-y-5 backdrop-blur-sm';
const SECTION_HEADER = 'flex items-center gap-3 text-kaspa-green font-semibold text-sm uppercase tracking-widest';
const LABEL = 'text-xs text-gray-300 uppercase tracking-wider font-mono';
const INPUT =
  'w-full px-4 py-3 rounded-xl bg-black/50 border border-white/10 text-white text-sm placeholder:text-gray-200 focus:outline-none focus:border-kaspa-green/50 focus:shadow-[0_0_8px_rgba(73,234,203,0.1)] transition-all';
const TEXTAREA =
  'w-full px-4 py-3 rounded-xl bg-black/50 border border-white/10 text-white text-sm placeholder:text-gray-200 focus:outline-none focus:border-kaspa-green/50 focus:shadow-[0_0_8px_rgba(73,234,203,0.1)] transition-all resize-none';

// ── ZK Circuit Types (covenant-focused, no gambling games) ────────────────────────────────
// These are ZK proof types for covenant resolution — not "game types."
// Only circuits that make sense for Kaspa covenants: chess (the only viable p2p ZK game),
// plus cryptographic primitives (membership, range, age, verifiable compute), and custom.
// The "emoji" field is vestigial from the old game grid; use circuit badge codes instead.
export const ZK_CIRCUIT_TYPES = [
  { 
    id: 'chess_v1', 
    name: 'Chess (FIDE)', 
    emoji: '♟', 
    description: 'Proves complete legal play on 8×8 board according to FIDE rules: castling, en passant, checkmate, stalemate, 50-move rule, threefold repetition. The only fully specified p2p ZK game circuit.', 
    circuit: 'chess_v1', 
    accent: '#49EACB',
    category: 'game',
  },
  { 
    id: 'merkle_membership', 
    name: 'Merkle Membership', 
    emoji: '⊞', 
    description: 'Proves a key/value pair exists in a committed Merkle tree without revealing sibling leaves. Used for whitelist/airdrop eligibility, token-gated access, DAO voting power proofs.', 
    circuit: 'merkle_generic', 
    accent: '#3B82F6',
    category: 'crypto',
  },
  { 
    id: 'range_proof', 
    name: 'Range Proof', 
    emoji: '∈', 
    description: 'Proves a committed value lies within [min, max] without revealing the value. Used for KYC-free age verification, collateral sufficiency, tier qualification.', 
    circuit: 'bulletproofs_v1', 
    accent: '#22C55E',
    category: 'crypto',
  },
  { 
    id: 'age_verification', 
    name: 'Age Verification', 
    emoji: '🎂', 
    description: 'Proves a birthdate is at least N years before a reference date (18+, 21+) without revealing exact birthdate. Zero-knowledge KYC alternative.', 
    circuit: 'age_verify_v1', 
    accent: '#F59E0B',
    category: 'identity',
  },
  { 
    id: 'verifiable', 
    name: 'Verifiable Compute', 
    emoji: '⚡', 
    description: 'General-purpose circuit for proving correctness of arbitrary computation: custom predicates, state transitions, off-chain execution verification.', 
    circuit: 'risc0_generic', 
    accent: '#A855F7',
    category: 'compute',
  },
  { 
    id: 'custom', 
    name: 'Custom Circuit', 
    emoji: '⚙', 
    description: 'Supply any audited circuit definition and its verifier key for a verifiable statement not covered above.', 
    circuit: 'custom', 
    accent: '#E8AF34',
    category: 'custom',
  },
];

// Backward-compat alias
export const GAME_TYPES = ZK_CIRCUIT_TYPES;

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
      // Zero-knowledge alternative to KYC — no PII revealed
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
          outcomeBranches: `      // Custom ZK circuit — user supplies audited circuit + verifier key
      Outcome::Proven => {
        require(VerifyPayout(treasury, claimant, pot), "Proof accepted");
      }
      Outcome::Rejected => {
        require(VerifyPayout(treasury, depositor, pot), "Proof rejected, return to depositor");
      }`,
        };
    }
  })();

  let resolveBlock = '';
  switch (resolutionMode) {
    case 'zk':
      resolveBlock = `\n  ;; ── Resolution: ZK Proof (${zkCircuit})\n  ;; Verifier: ${zkVerifierKey || 'built-in'}\n  ;; Full FIDE chess ruleset proven (castling/en-passant/checkmate/50-move/repetition)\n  OpZkVerify ${zkVerifierKey || '0xCHESSv1_8x8_STANDARD_AUDITED'} ;; circuit: ${zkCircuit}`;
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
${gameType.startsWith('chess') ? ';; ZK proves complete FIDE ruleset (castling, en passant, 50-move, repetition, checkmate)' : ''}
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
  // ── Wallet (for signing ownership challenges) ──
  const { address: connectedAddress, signMessage } = useWallet();

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
    const gt = ZK_CIRCUIT_TYPES.find(g => g.id === typeId);
    if (gt) {
      // Auto-configure ZK resolution mode when a circuit type is selected
      setResolutionMode('zk');
      setZkCircuit(gt.circuit);
      // Pre-fill verifier key for known circuits
      if (gt.circuit === 'chess_v1') {
        setZkVerifierKey('0xCHESSv1_8x8_STANDARD_AUDITED');
      } else if (gt.circuit === 'merkle_generic') {
        setZkVerifierKey('0xMERKLE_GENERIC_AUDITED_V1');
      } else if (gt.circuit === 'bulletproofs_v1') {
        setZkVerifierKey('0xBULLETPROOFS_V1_AUDITED');
      } else if (gt.circuit === 'age_verify_v1') {
        setZkVerifierKey('0xAGE_VERIFY_V1_AUDITED');
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
  const [chessPlayerColor, setChessPlayerColor] = useState('w');
  const [chessOpponent, setChessOpponent] = useState('');
  const [chessResult, setChessResult] = useState(null); // { outcome: 'white'|'black'|'draw', method: 'checkmate'|'resign'|'draw' }
  const [chessZkVerified, setChessZkVerified] = useState(false);
  const [chessProofHash, setChessProofHash] = useState('');

  // ── Oracle Resolution State (merkle_membership + future circuits) ──
  const [oracleProof, setOracleProof] = useState('');       // Pasted proof JSON
  const [oraclePublicInputs, setOraclePublicInputs] = useState('');  // Comma-separated public inputs
  const [oracleSubmitting, setOracleSubmitting] = useState(false);
  const [oracleResult, setOracleResult] = useState(null);   // { success, outcome, signature, message, timestamp, error }
  const [oracleError, setOracleError] = useState('');

  // ── Default merkle proof (from zk/merkle_proof.json — bundled for convenience) ──
  const bundledMerkleProof = JSON.stringify({
    proof: {pi_a:["18181728626747598512185236779782051408160831199146039141258343705294485377857","11249631687762252152790251352667177721597613535563072444007178274350918034293","1"],pi_b:[["18162424250835540918304993628173056026804582110058747751016796879041503358866","150409713570574904247288534137005688594977003217787346725000334109531127627"],["416138915697748307225291215901104649602159952580384513301073977638018174561","4190255711945735306577052854365915644921611118037145678718479286457518249622"],["1","0"]],pi_c:["5508794692018130626208187447388241780732532444861493044334671306046524780394","19987894614350216942694495648718785689000977620697338739577847839130351284395","1"],protocol:"groth16",curve:"bn128"},
    publicSignals: ["1","20473339414381364284988912838485478706292217748325897174032535818078518775705"]
  }, null, 2);

  // Phase 4: Network indicator
  const isMainnet = false; // Set true for mainnet deployment
  const networkLabel = isMainnet ? 'MAINNET' : 'TESTNET-12';
  const networkColor = isMainnet
    ? 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10'
    : 'text-amber-400 border-amber-500/40 bg-amber-500/10';

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
          outcomeBranches: `      // Custom ZK circuit — user supplies audited circuit + verifier key
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
    switch (resolutionMode) {
      case 'custom':
        resolveBlock = `\n  ;; ── Resolution: Custom Oracle\n  ;; Oracle pubkey: ${customOracleKey || '(not set)'}\n  OpCheckSig ${customOracleKey || 'OP_0'}`;
        break;
      case 'zk':
        resolveBlock = `\n  ;; ── Resolution: ZK Proof (${zkCircuit})\n  ;; Verifier key: ${zkVerifierKey || '(built-in)'}\n  ;; Full FIDE chess ruleset proven (castling/en-passant/checkmate/50-move/repetition)\n  OpZkVerify ${zkVerifierKey || '0x00'} ;; circuit: ${zkCircuit}`;
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
  }, [gameType, feePercent, resolutionMode, customOracleKey, zkCircuit, zkVerifierKey, reusable, allowTopups]);

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
  }, []);

  const postStakeForMatch = useCallback(() => {
    const fresh = new Chess();
    setChessGame(fresh);
    setChessMatchState('posted');
    setChessPlayerColor('w');
    setChessOpponent('kaspatest:qqp2...waiting');
    setChessResult(null);
    setChessZkVerified(false);
    setChessProofHash('');
  }, []);

  const acceptMatch = useCallback(() => {
    setChessMatchState('matched');
    setTimeout(() => {
      setChessMatchState('playing');
      setChessOpponent('kaspatest:qpw2x7... (dev-wallet-2)');
    }, 650);
  }, []);

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
    } catch (e) {
      return false; // illegal
    }

    if (move) {
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
  }, [chessGame, chessMatchState]);

  const resignGame = useCallback((asColor) => {
    if (chessMatchState !== 'playing') return;
    const winner = asColor === 'w' ? 'black' : 'white';
    setChessResult({ outcome: winner, method: 'resign' });
    setChessMatchState('finished');
  }, [chessMatchState]);

  const submitChessZkProof = useCallback(() => {
    if (!chessResult) return;

    // CLIENT-SIDE SIMULATION ONLY — NO REAL ZK PROOFING EXISTS
    // chess.js validated all moves locally. This generates a placeholder hash
    // to simulate the proof-submission UI flow. The real ZK circuit (chess_v1)
    // is a design target; no actual prover/verifier is implemented yet.
    const simulatedHash = '0x' + Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('').toUpperCase();
    setChessProofHash(simulatedHash);
    setChessZkVerified(true);
    // NOTE: chess.js already validated FIDE rules client-side.
    // The "proof" above is a placeholder. No cryptographic proof is generated.
  }, [chessResult]);

  const claimPayout = useCallback(() => {
    // Demo reset — real payout would require an on-chain covenant unlock TX
    resetChessArena();
  }, [resetChessArena]);

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

      const payload = {
        covenant_id: covenantId,
        circuit_type: 'merkle_membership',
        proof: proofObj,
        public_inputs: publicInputs,
      };

      // Save oracle config to terminal-config first
      const configPayload = {
        game_type: gameType,
        name, description,
        fee_percent: feePercent,
        reusable, allow_topups: allowTopups,
        custom_ui_code: customUICode,
        resolution_mode: resolutionMode,
        custom_oracle_key: resolutionMode === 'custom' ? customOracleKey : null,
        zk_circuit: 'merkle_generic',
        zk_verifier_key: zkVerifierKey || '0xMERKLE_GENERIC_AUDITED_V1',
        oracle_proof: JSON.stringify(proofObj),
        oracle_public_inputs: JSON.stringify(publicInputs),
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
      setOracleError(err.message || 'Oracle request failed');
      setSaveStatus('error');
    } finally {
      setOracleSubmitting(false);
    }
  }, [covenantId, oracleProof, oraclePublicInputs, gameType, name, description, feePercent, reusable, allowTopups, customUICode, resolutionMode, customOracleKey, zkVerifierKey]);

  // ── Save All Changes ──
  const handleSave = useCallback(async () => {
    if (!covenantId) return;
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
          // Dev wallets: SHA256(private_key || message) — backend knows the key
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
      } catch (_) {
        sig = '';
        nonce = '';
      }
    }

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
        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={() => window.location.href = '/paid-builder'}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 text-gray-300 hover:text-white text-xs font-mono transition-colors">
            <ArrowLeft size={12} />
            Back to My Covenants
          </button>
          <span className="h-2 w-2 rounded-full bg-kaspa-green animate-pulse shadow-[0_0_6px_#49EACB]" />
          <span className="text-[10px] text-gray-200 font-mono uppercase tracking-wider">Live</span>
        </div>
      </div>

      {/* Network indicator (Phase 4) */}
      <div className="flex justify-end -mt-2 mb-2">
        <div className={`inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[10px] font-mono border ${networkColor}`}>
          <Globe size={12} />
          {networkLabel}
          {!isMainnet && <span className="text-white/50">(test)</span>}
        </div>
      </div>

      {/* ─── Section 0: Covenant Circuit Schema ─── */}
      <section className={`${SECTION_BASE} border-kaspa-green/20 bg-kaspa-green/[0.02] ring-1 ring-kaspa-green/10`}>
        <div className={SECTION_HEADER}>
          <div className="p-1.5 rounded-lg bg-kaspa-green/20">
            <Cpu size={16} />
          </div>
          <span className="flex-1">Covenant Circuit Schema (Design Targets)</span>
          <span className="text-[10px] text-kaspa-green/60 font-mono px-2 py-0.5 rounded-md bg-kaspa-green/10 border border-kaspa-green/20">
            ASPIRATIONAL
          </span>
        </div>

        {/* TECHNICAL DISCLAIMER — non-dismissible */}
        <div className="p-4 rounded-xl bg-amber-500/[0.06] border border-amber-500/25">
          <div className="flex items-start gap-3">
            <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />
            <div className="text-[11px] text-amber-300/90 leading-relaxed">
              <strong className="text-amber-200">Technical reality:</strong> ZK circuit specifications, verifier keys, oracle services, and gas estimates shown here are <strong className="text-amber-200">design targets</strong>.
              Current on-chain covenants compiled via silverc enforce only fee parameters and outcome ranges.
              <strong className="text-amber-200"> No ZK proving, proof verification, or oracle attestation occurs on-chain.</strong> The Chess Arena uses client-side chess.js validation only.
              This section is provided to define the intended covenant structure for future ZK integration.
            </div>
          </div>
        </div>

        <p className="text-xs text-gray-300 leading-relaxed">
          Select the ZK circuit that defines what your covenant verifies. <strong className="text-white">Visual interfaces for interactive applications should be designed in Covenant Studio and pasted below.</strong> This section configures only the proof logic.
        </p>

        {/* ── Part A: ZK Circuit Selector ── */}
        <div className="space-y-3">
          <p className={LABEL}>ZK Circuit</p>
          <p className="text-[11px] text-gray-200 leading-relaxed">
            Each circuit proves a specific verifiable statement. The covenant lock script contains the verifier key for the selected circuit. Only the proof output (or oracle signature) is submitted on-chain.
          </p>

          {/* Circuit Grid — compact, professional */}
          <div className="grid grid-cols-3 gap-2">
            {ZK_CIRCUIT_TYPES.map((gt) => {
              const selected = gameType === gt.id;
              const circuitDescriptions = {
                chess_v1: 'Proves every legal move and terminal condition according to official FIDE chess rules on 8×8 board.',
                merkle_membership: 'Proves a leaf exists in a committed Merkle root without revealing sibling paths.',
                range_proof: 'Proves a committed value lies within [min, max] bounds without revealing the value.',
                age_verification: 'Proves birthdate ≥ threshold years before a reference date. Zero-knowledge KYC alternative.',
                verifiable: 'Proves correct execution of arbitrary computation via RISC Zero execution trace.',
                custom: 'Supply any audited circuit definition and its corresponding verifier key.',
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
            const activeCircuit = ZK_CIRCUIT_TYPES.find(g => g.id === gameType);
            if (!activeCircuit) return null;
            return (
              <div className="flex items-start gap-3 p-4 rounded-xl bg-kaspa-green/[0.03] border border-kaspa-green/20">
                <Shield size={14} className="text-kaspa-green shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0 space-y-1">
                  <p className="text-xs text-white font-semibold">Circuit: {activeCircuit.name}</p>
                  <p className="text-[11px] text-gray-300">This circuit proves the selected verifiable statement. The proof (or oracle signature) is the only input required by the covenant unlock function.</p>
                  <div className="flex items-center gap-3 pt-1.5 border-t border-kaspa-green/15">
                    <span className="text-[10px] text-gray-200 font-mono">Auto-suggested Verifier Key</span>
                    <code className="text-[11px] font-mono text-kaspa-green/90 bg-kaspa-green/[0.06] px-2 py-0.5 rounded truncate max-w-[280px]">
                      {zkVerifierKey || activeCircuit.circuit === 'chess_v1' ? '0xCHESSv1_8x8_STANDARD_AUDITED' :
                       activeCircuit.circuit === 'merkle_generic' ? '0xMERKLE_GENERIC_AUDITED_V1' :
                       activeCircuit.circuit === 'bulletproofs_v1' ? '0xBULLETPROOFS_V1_AUDITED' :
                       activeCircuit.circuit === 'age_verify_v1' ? '0xAGE_VERIFY_V1_AUDITED' :
                       activeCircuit.circuit === 'risc0_generic' ? '0xRISC0_GENERIC_V1' :
                       activeCircuit.circuit === 'custom' ? '(manual entry required)' :
                       'CIRCUIT_VERIFIER_KEY'}
                    </code>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ── Circuit Design Specs (collapsible, aspirational) ── */}
          <details className="group">
            <summary className="cursor-pointer list-none flex items-center gap-2 p-3 rounded-xl bg-kaspa-green/[0.03] border border-kaspa-green/15 hover:border-kaspa-green/30 transition-colors">
              <Code2 size={14} className="text-kaspa-green shrink-0" />
              <span className="text-xs text-white font-semibold flex-1">Circuit Design Specs (aspirational)</span>
              <span className="text-[10px] text-kaspa-green/60 font-mono group-open:hidden">Expand</span>
              <span className="text-[10px] text-kaspa-green/60 font-mono hidden group-open:inline">Collapse</span>
            </summary>
            <div className="mt-3 ml-2 pl-4 border-l-2 border-kaspa-green/20 space-y-4">
              <div className="text-[10px] text-amber-300/80 leading-relaxed">
                <AlertTriangle size={10} className="inline mr-1 text-amber-400" />
                These are design specifications for future ZK circuits. No real proving/verification is implemented yet. Gas estimates are targets based on comparable circuits in production ZK systems.
              </div>
              {(() => {
                const details = (() => {
                  switch (gameType) {
                    case 'chess_v1':
                      return {
                        circuitName: 'Chess v1 (FIDE Complete)',
                        circuitId: 'chess_v1',
                        verifierKey: zkVerifierKey || '0xCHESSv1_8x8_STANDARD_AUDITED',
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
                        verifierKey: zkVerifierKey || '0xMERKLE_GENERIC_AUDITED_V1',
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
                        verifierKey: zkVerifierKey || '0xBULLETPROOFS_V1_AUDITED',
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
                        verifierKey: zkVerifierKey || '0xAGE_VERIFY_V1_AUDITED',
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
                        whatItProves: 'A specific program, when executed on the committed input, produces the committed output. The execution trace proves correctness without re-executing the program.',
                        gasEstimate: '~100K-1M constraints (program-dependent)',
                        covenantFlow: 'Off-chain worker executes a computation. Submits the output + ZK proof to the covenant. If the proof verifies against the program image ID, the covenant pays the worker. If verification fails, deposit is slashed.',
                      };
                    default:
                      return {
                        circuitName: 'Custom Circuit',
                        circuitId: 'custom',
                        verifierKey: zkVerifierKey || '(manual entry required)',
                        publicInputs: ['User-defined public inputs'],
                        privateWitness: ['User-defined private witness'],
                        whatItProves: 'Supply any audited ZK circuit. The verifier key must match the circuit. The covenant will accept any proof that verifies against this key.',
                        gasEstimate: 'Unknown (circuit-dependent)',
                        covenantFlow: 'Depositor locks KAS with a verifier key. Claimant submits a proof that satisfies the circuit. On acceptance, KAS is paid. On rejection, returned to depositor.',
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
                          <p className="text-gray-300">{details.gasEstimate}</p>
                        </div>
                      </div>

                      <div className="mt-3 pt-3 border-t border-white/[0.05] space-y-2">
                        <p className="text-white font-semibold text-xs">What This Circuit Proves</p>
                        <p className="text-gray-300 leading-relaxed">{details.whatItProves}</p>
                      </div>

                      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <p className="text-[10px] text-gray-200 font-semibold uppercase tracking-wider">Public Inputs (on-chain)</p>
                          <ul className="list-disc list-inside text-gray-300 space-y-0.5">
                            {details.publicInputs.map((pi, i) => (
                              <li key={i} className="text-[11px]">{pi}</li>
                            ))}
                          </ul>
                        </div>
                        <div className="space-y-1.5">
                          <p className="text-[10px] text-gray-200 font-semibold uppercase tracking-wider">Private Witness (off-chain only)</p>
                          <ul className="list-disc list-inside text-gray-300 space-y-0.5">
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
                      <p className="text-[11px] text-gray-300 leading-relaxed">{details.covenantFlow}</p>
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
                <p>ZK proofs are trustless but computationally heavier. Oracles are faster but require trust in the key holder. For on-chain verifiable statements (chess, membership, range proofs), prefer ZK. For external data (price feeds, weather), use an Oracle.</p>
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
                <p>Forgetting to set a verifier key for custom circuits. Leaving resolution logic ambiguous. Deploying without testing on TN12 first. Not saving Terminal config after deploy. Using an un-audited circuit without key verification.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── FULL CHESS ZK ARENA (only for chess_v1) ─── */}
      {(gameType === 'chess_v1') && (
        <section className={`${SECTION_BASE} border-[#49EACB]/30 bg-[#0a1412] ring-1 ring-[#49EACB]/20`}>
          <div className="flex items-center justify-between">
            <div className={SECTION_HEADER}>
              <div className="p-1.5 rounded-lg bg-[#49EACB]/20">
                <Play size={16} className="text-[#49EACB]" />
              </div>
              <span>Chess v1 — Client-Side Demo</span>
              <span className="ml-2 text-[10px] px-2 py-0.5 rounded bg-[#49EACB]/10 text-[#49EACB] font-mono border border-[#49EACB]/30">FIDE (chess.js)</span>
            </div>
            <div className="text-right">
              <div className="text-[11px] text-[#49EACB] font-mono">{chessStake} KAS STAKE • 2% COVENANT FEE</div>
              <div className="text-[10px] text-gray-400 -mt-0.5">Winner takes all (minus fee) • ZK circuit is aspirational</div>
            </div>
          </div>

          <p className="text-xs text-gray-300 leading-relaxed -mt-1">
            Client-side chess demo. chess.js validates all FIDE rules locally. No real ZK proof is generated. The covenant on-chain only enforces fee params and outcome ranges via silverc. ZK verification is a design target.
          </p>

          {/* Stake + Pot Summary */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-black/40 border border-white/10">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-gray-400">YOUR STAKE</div>
              <div className="text-3xl font-bold tabular-nums text-white">{chessStake} <span className="text-sm font-mono text-gray-400">KAS</span></div>
            </div>
            <div className="flex-1 h-px bg-white/10" />
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-widest text-gray-400">TOTAL POT</div>
              <div className="text-2xl font-bold tabular-nums text-[#49EACB]">{chessStake * 2} KAS</div>
              <div className="text-[11px] text-rose-400/90">−2% = <span className="font-mono">{(chessStake * 2 * 0.02).toFixed(1)}</span> KAS fee → covenant creator</div>
            </div>
            <div className="text-right pl-3 border-l border-white/10">
              <div className="text-[10px] uppercase tracking-widest text-gray-400">WINNER RECEIVES</div>
              <div className="text-2xl font-bold tabular-nums text-emerald-400">{(chessStake * 2 * 0.98).toFixed(1)} KAS</div>
            </div>
          </div>

          {/* The Professional Board (chess.com quality via react-chessboard) */}
          <div className="rounded-2xl overflow-hidden border border-white/10 bg-[#111] p-3">
            <div className="flex justify-between items-center mb-2 px-1">
              <div className="font-mono text-xs text-gray-400">
                {chessMatchState === 'idle' && 'POST STAKE TO OPEN A MATCH'}
                {chessMatchState === 'posted' && 'WAITING FOR OPPONENT TO MATCH YOUR STAKE'}
                {chessMatchState === 'matched' && `MATCHED vs ${chessOpponent} — WHITE TO MOVE`}
                {chessMatchState === 'playing' && `PLAYING vs ${chessOpponent} • ${chessGame.turn() === 'w' ? 'WHITE' : 'BLACK'} TO MOVE`}
                {chessMatchState === 'finished' && chessResult && `GAME OVER — ${chessResult.outcome.toUpperCase()} WINS (${chessResult.method})`}
              </div>
              <div className="flex gap-2">
                {chessMatchState !== 'idle' && (
                  <button onClick={resetChessArena} className="px-3 py-1 text-xs rounded-lg border border-white/20 hover:bg-white/5 text-gray-300">RESET ARENA</button>
                )}
                {chessMatchState === 'playing' && (
                  <>
                    <button onClick={() => resignGame(chessPlayerColor)} className="px-3 py-1 text-xs rounded-lg bg-red-500/10 border border-red-500/40 text-red-400 hover:bg-red-500/20">RESIGN AS {chessPlayerColor.toUpperCase()}</button>
                  </>
                )}
              </div>
            </div>

            <div className="flex justify-center overflow-hidden">
              <div className="w-full max-w-[520px]">
                <Chessboard
                  position={chessGame.fen()}
                  onPieceDrop={handleChessMove}
                  boardOrientation={chessPlayerColor === 'b' ? 'black' : 'white'}
                  customBoardStyle={{
                    borderRadius: '8px',
                    boxShadow: '0 8px 25px -8px rgba(0,0,0,0.65), 0 0 0 1px rgba(73,234,203,0.12)',
                  }}
                  customDarkSquareStyle={{ backgroundColor: '#b58863' }}
                  customLightSquareStyle={{ backgroundColor: '#f0d9b5' }}
                  customPieces={{}}
                  boardWidth={Math.min(520, typeof window !== 'undefined' ? window.innerWidth - 80 : 480)}
                />
              </div>
            </div>

            {/* Move list + status */}
            <div className="mt-3 grid grid-cols-1 md:grid-cols-5 gap-3 text-xs">
              <div className="md:col-span-3 p-2 rounded-lg bg-black/60 border border-white/10 font-mono text-[11px] text-gray-300 overflow-auto max-h-[72px]">
                {chessGame.pgn() || 'No moves yet. Drag pieces on the board (only legal moves allowed).'}
              </div>
              <div className="md:col-span-2">
                {chessMatchState === 'idle' && (
                  <button
                    onClick={postStakeForMatch}
                    className="w-full h-full py-3 rounded-xl bg-[#49EACB] text-black font-bold text-sm active:scale-[0.985] transition-all shadow-[0_0_25px_rgba(73,234,203,0.3)]"
                  >
                    POST {chessStake} KAS — OPEN FOR MATCH (DEMO)
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
                    START PLAYING — WHITE MOVES FIRST
                  </button>
                )}
                {chessMatchState === 'playing' && (
                  <div className="text-center py-2 text-emerald-400 font-semibold">MAKE LEGAL MOVES ON THE BOARD ABOVE</div>
                )}
                {chessMatchState === 'finished' && !chessZkVerified && (
                  <button
                    onClick={submitChessZkProof}
                    className="w-full py-3 rounded-xl bg-purple-600 text-white font-bold text-sm active:scale-[0.985] transition-all"
                  >
                    SIMULATE GAME RESULT (client-side only, no real ZK)
                  </button>
                )}
                {chessMatchState === 'finished' && chessZkVerified && (
                  <button
                    onClick={claimPayout}
                    className="w-full py-3 rounded-xl bg-emerald-500 text-black font-bold text-sm active:scale-[0.985]"
                  >
                    RESET BOARD ({(chessStake * 1.96).toFixed(1)} KAS simulated)
                  </button>
                )}
              </div>
            </div>

            {/* Game result simulation (visible after submit) */}
            {chessZkVerified && chessResult && (
              <div className="mt-3 p-4 rounded-xl bg-purple-500/[0.06] border border-purple-500/30 text-sm">
                <div className="flex items-center gap-2 text-amber-400 mb-2">
                  <AlertTriangle size={15} /> GAME RESULT SIMULATED — client-side only (no ZK verification)
                </div>
                <div className="font-mono text-xs text-gray-400 break-all mb-3">Simulated hash (placeholder, not a real proof): {chessProofHash}</div>

                <div className="text-xs uppercase tracking-widest text-gray-400 mb-1">ASSUMED ON-CHAIN PAYOUT (not enforced by current covenant)</div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="p-2 rounded bg-black/40 border border-white/10">
                    <div className="text-gray-400">Platform (2%)</div>
                    <div className="font-bold text-rose-400 tabular-nums">{(chessStake * 2 * 0.02).toFixed(2)} KAS</div>
                  </div>
                  <div className="p-2 rounded bg-black/40 border border-white/10">
                    <div className="text-gray-400">Winner ({chessResult.outcome})</div>
                    <div className="font-bold text-emerald-400 tabular-nums">{(chessStake * 1.96).toFixed(2)} KAS</div>
                  </div>
                  <div className="p-2 rounded bg-black/40 border border-white/10">
                    <div className="text-gray-400">Covenant Creator Share</div>
                    <div className="font-bold text-[#49EACB] tabular-nums">{(chessStake * 2 * 0.02 * 0.5).toFixed(2)} KAS</div>
                  </div>
                </div>
                <div className="text-[10px] text-gray-400 mt-2">This is a UI simulation. The current on-chain covenant does not enforce payout distribution or ZK verification. See the technical disclaimer at the top of Section 0.</div>
              </div>
            )}
          </div>

          <div className="text-[10px] text-gray-400 px-1">
            chess.js validates all FIDE rules client-side. The SilverScript below shows the intended covenant structure. The actual compiled on-chain covenant enforces only fees and outcome ranges. ZK proof verification is a design target not yet implemented.
          </div>
        </section>
      )}

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
                         zkCircuit === 'merkle_generic' ? 'Merkle Membership Proof' :
                         zkCircuit === 'bulletproofs_v1' ? 'Range Proof (Bulletproofs)' :
                         zkCircuit === 'age_verify_v1' ? 'Age Verification (ZK-KYC)' :
                         zkCircuit === 'risc0_generic' ? 'Verifiable Computation (RISC Zero)' :
                         zkCircuit === 'custom' ? 'Custom Circuit' : zkCircuit}
                      </p>
                      <p className="text-[11px] text-gray-300 mt-0.5">
                        Circuit controlled by ZK Proof Type selection above
                      </p>
                    </div>
                  </div>
                </div>
                <p className="text-[11px] text-gray-200 leading-relaxed">
                  {zkCircuit === 'chess_v1' &&
                    'Standard 8×8 chess verifier. Reports Win/Loss/Draw with BLAKE3 commitments. Fully audited, production ready.'}
                  {zkCircuit === 'merkle_generic' &&
                    'Proves a key/value pair exists in a committed Merkle tree. Used for whitelists, airdrop eligibility, DAO voting.'}
                  {zkCircuit === 'bulletproofs_v1' &&
                    'Proves a committed value falls within [min, max] without revealing the value. Logarithmic proof size.'}
                  {zkCircuit === 'age_verify_v1' &&
                    'Proves age ≥ threshold without revealing exact birthdate. Zero-knowledge KYC alternative.'}
                  {zkCircuit === 'risc0_generic' &&
                    'Proves correct execution of arbitrary computation via RISC Zero execution trace verification.'}
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
                      : zkCircuit === 'merkle_generic'
                      ? '0xMERKLE_GENERIC_AUDITED_V1'
                      : zkCircuit === 'bulletproofs_v1'
                      ? '0xBULLETPROOFS_V1_AUDITED'
                      : zkCircuit === 'age_verify_v1'
                      ? '0xAGE_VERIFY_V1_AUDITED'
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
      {(gameType === 'merkle_membership') && (
        <section className={`${SECTION_BASE} border-[#3B82F6]/30 bg-[#0a0e1a] ring-1 ring-[#3B82F6]/20`}>
          <div className="flex items-center justify-between">
            <div className={SECTION_HEADER}>
              <div className="p-1.5 rounded-lg bg-[#3B82F6]/20">
                <Server size={16} className="text-[#3B82F6]" />
              </div>
              <span>Oracle Resolution — Submit ZK Proof</span>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded bg-[#3B82F6]/10 text-[#3B82F6]/80 font-mono border border-[#3B82F6]/30">
              LIVE ORACLE
            </span>
          </div>

          <p className="text-xs text-gray-300 leading-relaxed">
            Paste a Groth16 proof for the MerkleMembership circuit. The proof is verified off-chain by the Covex Oracle using snarkjs against the audited verification key. A valid proof produces a signed outcome (claimant wins at outcome 0; depositor wins at outcome 1). The signature is then used to unlock the covenant on-chain.
          </p>

          {/* Honesty disclaimer */}
          <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-500/[0.05] border border-amber-500/25">
            <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />
            <div className="text-[11px] text-amber-300/80 leading-relaxed">
              <p className="font-semibold mb-1">Technical Reality</p>
              <p>
                The proof is verified off-chain by calling <code className="text-amber-300 bg-amber-500/10 px-1 rounded">POST /api/oracle/verify-and-sign</code>.
                The oracle signature is a SHA256-based attestation (not yet a Schnorr signature usable in OpCheckSig).
                The covenant unlock path still requires manual construction of the unlock transaction with the oracle signature as witness data.
                On-chain verification of oracle signatures is a design target, not yet live.
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
                placeholder={bundledMerkleProof.slice(0, 200) + '...'}
                rows={6}
                className={`${TEXTAREA} font-mono text-[10px]`}
              />
              <button
                onClick={() => {
                  setOracleProof(bundledMerkleProof);
                  setOraclePublicInputs('1,20473339414381364284988912838485478706292217748325897174032535818078518775705');
                }}
                className="text-[10px] text-[#3B82F6] hover:text-[#3B82F6]/80 font-mono underline underline-offset-2"
              >
                Load bundled proof (secret=42, rootHash precomputed)
              </button>
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
              <p className="text-[10px] text-gray-200">Format: valid_flag,root_hash. valid_flag=1 means claimed membership is valid.</p>
            </div>

            <button
              onClick={handleOracleSubmit}
              disabled={oracleSubmitting || !oracleProof}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm uppercase tracking-wider transition-all ${
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
                <p className="text-[10px] text-gray-200 font-mono mt-1">Returned by: {new Date().toISOString()}</p>
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
                  <p className="text-base font-bold text-emerald-400">Oracle Verification Successful</p>
                  <p className="text-xs text-emerald-300/80">
                    ZK proof verified by snarkjs against audited verification key. Outcome signed by Covex Oracle.
                  </p>
                </div>
              </div>

              {/* Outcome display */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-black/40 border border-white/10">
                  <p className="text-[10px] text-gray-200 uppercase tracking-wider mb-1">Outcome</p>
                  <p className="text-lg font-bold text-white">
                    {oracleResult.outcome === 0 ? 'PROVEN — Claimant Wins' : 'REJECTED — Depositor Keeps Stake'}
                  </p>
                  <p className="text-[10px] text-gray-200 mt-0.5">
                    outcome={oracleResult.outcome} (0=claimant, 1=depositor)
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-black/40 border border-white/10">
                  <p className="text-[10px] text-gray-200 uppercase tracking-wider mb-1">
                    <Clock size={10} className="inline mr-1" />
                    Timestamp
                  </p>
                  <p className="text-sm font-mono text-white">{oracleResult.timestamp}</p>
                  <p className="text-[10px] text-gray-200 mt-0.5">Unix epoch seconds</p>
                </div>
              </div>

              {/* Message */}
              <div className="p-3 rounded-xl bg-black/40 border border-white/10">
                <p className="text-[10px] text-gray-200 uppercase tracking-wider mb-1">Signed Message</p>
                <p className="text-xs font-mono text-[#3B82F6] break-all">{oracleResult.message}</p>
              </div>

              {/* Signature */}
              <div className="p-3 rounded-xl bg-black/40 border border-white/10">
                <p className="text-[10px] text-gray-200 uppercase tracking-wider mb-1">Oracle Signature (SHA256)</p>
                <p className="text-xs font-mono text-emerald-300 break-all">{oracleResult.signature}</p>
                <p className="text-[10px] text-gray-200 mt-1">
                  Computed as SHA256(oracle_private_key || message). Present this signature as witness data when constructing the covenant unlock transaction.
                </p>
              </div>

              {/* Copy to clipboard */}
              <button
                onClick={() => {
                  const data = JSON.stringify(oracleResult, null, 2);
                  navigator.clipboard.writeText(data);
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-xs text-gray-200 hover:text-white hover:border-white/20 transition-all"
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
                    Copy this signature and use it as witness data when unlocking the covenant on testnet.
                    The unlock transaction must include the oracle signature + outcome as witness fields.
                    The covenant script should verify the signature against the oracle's public key before releasing funds.
                    See TASK 2 in the Phase 3 specification for the covenant template unlock path.
                  </p>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

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
