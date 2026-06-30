/* eslint-disable react-refresh/only-export-components -- this module co-exports its page component with the related redeem-routing constants/helpers (NONCUSTODIAL_REDEEM_KINDS / isLocallySignableRedeem) that tests pin. That only affects dev Fast Refresh granularity, never the production build or tests; the helpers are tiny and live next to the routing they drive. */
import { useState, useEffect, useMemo, useCallback, Fragment, lazy, Suspense } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import TrustBadge from '../components/TrustBadge';
import CovenantDetailSkeleton from '../components/ui/CovenantDetailSkeleton';
import { motion, useReducedMotion } from 'framer-motion';
import { toast } from '../components/ToastContext';
import { useWallet } from '../components/WalletContext';
import { signCovenantOwnership } from '../lib/ownership';
import { explorerTxUrl } from '../lib/explorer';
// CovexTerminal is the 445kB creator-only deploy/ZK panel. It only mounts inside the
// activeTab === 'terminal' branch below (gated by isCreator), so we lazy-load its chunk
// to keep the initial covenant page load lean for regular viewers.
const CovexTerminal = lazy(() => import('../components/CovexTerminal'));
// The @measured/puck runtime + puckConfig (~115KB gz) only render for covenants that published
// creator puck_data (creatorSurface === 'puck'). Lazy-load that chunk so the vast majority of
// covenant views (games, plain metadata, legacy iframe pages) never download it.
const PuckSurface = lazy(() => import('../lib/PuckSurface'));
import FullScreenChess from '../components/FullScreenChess';
import FullScreenPoker from '../components/FullScreenPoker';
import FullScreenReversi from '../components/FullScreenReversi';
import FullScreenConnect4 from '../components/FullScreenConnect4';
import FullScreenCheckers from '../components/FullScreenCheckers';
import FullScreenTicTacToe from '../components/FullScreenTicTacToe';
import FullScreenRPS from '../components/FullScreenRPS';
import FullScreenBlackjack from '../components/FullScreenBlackjack';
import { assertGamesInSync } from '../lib/playableGames';

// A mainnet covenant must NEVER display a kaspatest: wallet. The pre-fix indexer derived some
// creator addresses with the wrong (testnet) bech32 prefix; until the backend re-derives them,
// guard the display: on mainnet, reject a kaspatest: creator and fall back to the covenant's own
// (correct kaspa:) on-chain address. Returns '' only if nothing usable exists.
function displayCreatorAddr(c) {
  const raw = (c && c.creator_addr) || '';
  const onMainnet = ((c && c.network) || '').startsWith('mainnet');
  if (raw && !(onMainnet && raw.startsWith('kaspatest:'))) return raw;
  return (c && c.address) || '';
}

// Every game covenant is playable from its detail page (not just chess). Each FullScreen* arena
// shares the prop shape { stake, onClose, covenantId, feePercent, potReturnPercent }.
// The keys here ARE the playable set: the catalog's headline "Create a game" cards are derived
// from the same list in lib/playableGames.js, so the catalog can never lead with a game that has
// no arena (or omit one that does). The dev-only guard below flags any drift.
const GAME_REGISTRY = {
  chess: { Component: FullScreenChess, label: 'Chess', stake: 50 },
  poker: { Component: FullScreenPoker, label: 'Poker', stake: 100 },
  reversi: { Component: FullScreenReversi, label: 'Reversi', stake: 40 },
  connect4: { Component: FullScreenConnect4, label: 'Connect Four', stake: 30 },
  checkers: { Component: FullScreenCheckers, label: 'Checkers', stake: 50 },
  tictactoe: { Component: FullScreenTicTacToe, label: 'Tic-Tac-Toe', stake: 20 },
  rps: { Component: FullScreenRPS, label: 'Rock Paper Scissors', stake: 25 },
  blackjack: { Component: FullScreenBlackjack, label: 'Blackjack', stake: 100 },
};
assertGamesInSync(Object.keys(GAME_REGISTRY), 'GAME_REGISTRY');
import { Chessboard } from 'react-chessboard';
import { gameLookFromConfig } from '../lib/gameTheme';
import { Layers, Terminal, Lock, ArrowLeft, Cpu, ShieldCheck, ExternalLink, AlertTriangle, BadgeCheck, Palette, LayoutTemplate, Eye, Code2, Check, Save, Share2, Clock, Wallet } from '../lib/routeIcons.js';
import ShareEmbedModal from '../components/ShareEmbedModal';
import CopyButton from '../components/CopyButton';
import RecoveryKitModal from '../components/RecoveryKitModal';
import StickyActionRail from '../components/StickyActionRail';
import WalletButton from '../components/WalletButton';
import { LifeBuoy } from '../lib/routeIcons.js';
import DevWalletModal from '../components/DevWalletModal';
import OnChainLockSection from '../components/OnChainLockSection';
import ZkClaimPanel from '../components/ZkClaimPanel';
import HonestLimits from '../components/HonestLimits';
import { MarketView } from './Markets';
import { Button, buttonVariants } from '../components/ui/Button';
import { Separator } from '../components/ui/Separator';

// User-facing network label. To a user there is just Kaspa, so the live network reads
// "Kaspa"; the raw value is preserved for any non-mainnet covenant so the display never lies.
const networkLabel = (n) => (/^mainnet/i.test(String(n || '')) ? 'Kaspa' : String(n || ''));

// Tier accent palette: drives the hero TIER chip color so verified-tier covenants
// read their true level (purple MAX, gold PRO, blue BUILDER) instead of a fixed gold.
const TIER_PALETTE = {
  MAX:     { bg: 'bg-purple-500/10',  text: 'text-purple-300',  border: 'border-purple-500/30',  light: 'light:bg-purple-500/15 light:text-purple-700 light:border-purple-500/40',  glow: 'tier-glow-max' },
  PRO:     { bg: 'bg-kaspa-gold/10',  text: 'text-kaspa-gold',  border: 'border-kaspa-gold/20',  light: 'light:bg-amber-500/15 light:text-amber-700 light:border-amber-500/40',    glow: 'tier-glow-pro' },
  BUILDER: { bg: 'bg-sky-500/10',     text: 'text-sky-300',     border: 'border-sky-500/30',     light: 'light:bg-sky-500/15 light:text-sky-700 light:border-sky-500/40',          glow: 'tier-glow-builder' },
  FREE:    { bg: 'bg-white/[0.05]',   text: 'text-gray-300',    border: 'border-white/10',       light: 'light:bg-slate-100 light:text-slate-600 light:border-slate-300',          glow: '' },
  EXPLORER:{ bg: 'bg-white/[0.05]',   text: 'text-gray-300',    border: 'border-white/10',       light: 'light:bg-slate-100 light:text-slate-600 light:border-slate-300',          glow: '' },
};

const DEPLOYER = 'kaspatest:qpyfz03k6quxwf2jglwkhczvt758d8xrq99gl37p6h3vsqur27ltjhn68354m';
const TRUNC = (s, n = 6) => (s && s.length > n * 2 + 3 ? `${s.slice(0, n)}...${s.slice(-4)}` : s);

// DEPLOYER is the Covex treasury / creator-fee receiver address the backend matches against.

const isVerified = (c) => c?.verified_tier && c.verified_tier !== 'FREE' && c.verified_tier !== 'EXPLORER';

// True for staked games of CHANCE (poker, blackjack, dice). Used only to word the point-of-bet
// jurisdictional warning honestly: we never assert "skill" for these, and we name them explicitly
// so a player sees the gambling-regulation note before staking. Skill games (chess, checkers, etc.)
// still get the generic "staked games may be regulated as gambling" line, just not the chance call-out.
const IS_CHANCE_GAME = (gameLabel) => /poker|blackjack|dice|baccarat|roulette|slots?/i.test(String(gameLabel || ''));

// Shared stake control for every game lobby (chess + the seven others). Hoisted to
// module scope so it never remounts on a parent render (would otherwise lose input
// focus mid-type). Two modes:
//   - create  (no stake locked yet): free amount input, "you take the first seat".
//   - join    (a creator already staked a pot): the input is pre-filled to the pot
//     and locked, so a joiner matches exactly. Honest labels throughout: the CTA
//     is wallet-gated (spectating stays free), and the trust note states outcomes
//     are oracle-attested off-chain while custody + payout are on-chain.
function GameStakeControl({
  gameLabel, stake, setStake, joinPot, walletConnected, onConnect, onStake, ctaLabel = 'Stake and play',
}) {
  const isJoin = joinPot > 0;
  return (
    <div className="w-full max-w-md">
      {isJoin ? (
        <>
          <div className="text-xs text-gray-300 mb-1.5 text-center tracking-widest light:text-slate-600">MATCH THE STAKED AMOUNT TO JOIN: {joinPot} KAS</div>
          <input
            type="number"
            value={joinPot}
            readOnly
            aria-readonly="true"
            className="w-full text-center text-5xl font-mono p-4 rounded-2xl bg-black/60 border-2 border-kaspa-green/40 mb-2 light:bg-white light:border-emerald-500/40 light:text-slate-900 cursor-not-allowed opacity-90"
          />
          <div className="text-center text-[11px] text-amber-300 light:text-amber-700 mb-3">Locked to the creator stake. If you do not match within 5 minutes, the funds return automatically.</div>
        </>
      ) : (
        <>
          <div className="text-xs text-gray-300 mb-1.5 text-center tracking-widest light:text-slate-600">HOW MUCH KAS DO YOU WANT TO STAKE?</div>
          <input
            type="number"
            value={stake}
            onChange={e => setStake(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-full text-center text-5xl font-mono p-4 rounded-2xl bg-black/60 border-2 border-kaspa-green/40 focus:border-kaspa-green mb-2 light:bg-white light:border-emerald-500/40 light:text-slate-900"
          />
          <div className="text-center text-[11px] text-gray-300 light:text-slate-600 mb-3">You take the first seat and lock this {gameLabel} stake. Share this page so an opponent can join by matching it.</div>
        </>
      )}
      {walletConnected ? (
        <Button
          variant="kaspa"
          shimmer
          size="xl"
          onClick={onStake}
          className="w-full rounded-2xl font-extrabold uppercase tracking-wide"
        >
          {isJoin ? `Match ${joinPot} KAS and play` : ctaLabel}
        </Button>
      ) : (
        <Button
          variant="kaspa"
          size="xl"
          onClick={onConnect}
          className="w-full rounded-2xl font-extrabold flex items-center justify-center gap-2"
        >
          <Wallet size={18} /> Connect wallet to take a seat
        </Button>
      )}
      <p className="text-center text-[11px] text-gray-400 light:text-slate-600 mt-3 leading-snug">
        The result is computed deterministically by replaying the signed move log (anyone can recompute); settlement is simulated today, with the recomputable Covex engine re-deriving the winner and co-signing the release alongside the winning player, not Kaspa consensus.
        Custody and payout are on-chain. This is not trustless.
      </p>
      {/* Point-of-bet jurisdictional warning, matching the one Markets shows. Games of chance
          (poker, blackjack, dice) are flagged explicitly; we never frame them as games of skill. */}
      <p className="flex items-start justify-center gap-1.5 text-center text-[11px] text-amber-300/85 light:text-amber-700 mt-3 leading-snug">
        <AlertTriangle size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span>
          Staking real KAS carries risk. You are responsible for compliance in your jurisdiction;{IS_CHANCE_GAME(gameLabel) ? ' games of chance such as poker, blackjack, and dice' : ' staked games'} may be regulated as gambling where you live.
        </span>
      </p>
      {!walletConnected && (
        <p className="text-center text-[11px] text-gray-500 light:text-slate-500 mt-1">Spectating works without a wallet.</p>
      )}
    </div>
  );
}

// Kinds EnforcedDeploy can sign locally end-to-end (mirrors EnforcedDeploy.jsx NONCUSTODIAL).
// rcsv is the relative-timelock primitive (the backend stores it as 'rcsv:<min_sequence>'); it
// signs locally like the absolute timelock. Other kinds (oracle_escrow / oracle_enforced /
// timedecay / deadman) need the redeem-script recovery flow - we must NOT promise local
// non-custodial signing the spender cannot complete. Routing/copy only; no spend-builder change.
// Exported for tests: this set is the load-bearing safety gate that routes a spend to the
// in-browser "redeem with my key" path vs the "recover with the redeem script" /recover page.
export const NONCUSTODIAL_REDEEM_KINDS = ['singlesig', 'hashlock', 'timelock', 'rcsv', 'multisig', 'htlc', 'channel'];

// Pure routing predicate the redeem section uses: a redeem_kind (possibly suffixed like
// 'rcsv:10' or 'oracle_escrow:abcd') is locally signable iff its BASE kind is in the
// non-custodial set. An oracle/resolver kind is NEVER locally signable, so it must route to the
// /recover flow rather than offer a non-custodial redeem the spender cannot complete. Exported so
// this safety decision is unit-tested independent of the heavy component render.
export const isLocallySignableRedeem = (redeemKind) =>
  NONCUSTODIAL_REDEEM_KINDS.includes(String(redeemKind || '').split(':')[0]);

const DEFAULT_UI_CONFIG = {
  primaryColor: '#49EACB',
  bgStyle: 'glass',
  layout: 'card',
  showWalletButton: true,
  showParamForm: true,
  showFeaturedBanner: false,
  customLogoUrl: '',
  heroImageUrl: '',
  vision: '',
};

// Premium Customization Garage templates: billion dollar quality looks.
// Creators browse, see instant nice previews, choose, tweak, and publish.
// Each produces a beautiful, fully transparent public page that feels like a high-end product site.
const COVENANT_TEMPLATES = [
  {
    id: 'aether',
    name: 'Aether',
    tagline: 'Minimal Luxury',
    description: 'Clean, elegant, high-end. Perfect for premium or exclusive covenants.',
    thumbnail: 'linear-gradient(135deg, #0A0A0D 0%, #1a1a2e 100%)',
    accent: '#E8AF34',
    config: { primaryColor: '#E8AF34', bgStyle: 'glass', layout: 'editorial' },
    extra: { hasHero: true, visionSection: true, style: 'minimal-luxury' }
  },
  {
    id: 'forge',
    name: 'Forge',
    tagline: 'Bold DeFi',
    description: 'Strong, industrial, trustworthy. Great for serious value-locked covenants.',
    thumbnail: 'linear-gradient(135deg, #111116 0%, #1a1a2e 100%)',
    accent: '#F59E0B',
    config: { primaryColor: '#F59E0B', bgStyle: 'dark', layout: 'card' },
    extra: { hasHero: true, visionSection: true, style: 'bold-defi' }
  },
  {
    id: 'bloom',
    name: 'Bloom',
    tagline: 'Warm Community',
    description: 'Inviting, human, growth-oriented. Ideal for DAOs and collective covenants.',
    thumbnail: 'linear-gradient(135deg, #0D1117 0%, #1a2a1e 100%)',
    accent: '#10B981',
    config: { primaryColor: '#10B981', bgStyle: 'glass', layout: 'editorial' },
    extra: { hasHero: true, visionSection: true, style: 'warm-community' }
  },
  {
    id: 'nexus',
    name: 'Nexus',
    tagline: 'Tech Precision',
    description: 'Modern, sharp, innovative. Suits complex logic or oracle-powered covenants.',
    thumbnail: 'linear-gradient(135deg, #0A0A0D 0%, #111827 100%)',
    accent: '#3B82F6',
    config: { primaryColor: '#3B82F6', bgStyle: 'dark', layout: 'minimal' },
    extra: { hasHero: true, visionSection: false, style: 'tech-precision' }
  },
  {
    id: 'velvet',
    name: 'Velvet',
    tagline: 'Premium Heritage',
    description: 'Sophisticated, rich, timeless. For high-value or legacy covenants.',
    thumbnail: 'linear-gradient(135deg, #1a1a2e 0%, #2a1f1f 100%)',
    accent: '#8B5CF6',
    config: { primaryColor: '#8B5CF6', bgStyle: 'glass', layout: 'editorial' },
    extra: { hasHero: true, visionSection: true, style: 'premium-heritage' }
  },
  {
    id: 'pulse',
    name: 'Pulse',
    tagline: 'Vibrant Collective',
    description: 'Energetic, social, forward-looking. Perfect for active community covenants.',
    thumbnail: 'linear-gradient(135deg, #0D1117 0%, #1e1135 100%)',
    accent: '#EC4899',
    config: { primaryColor: '#EC4899', bgStyle: 'glass', layout: 'card' },
    extra: { hasHero: true, visionSection: true, style: 'vibrant-collective' }
  }
];

export default function CovenantInteractive() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const prefersReduced = useReducedMotion();
  const [covenant, setCovenant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState('');
  const { address, balance, sendPayment, buildUri, signMessage } = useWallet();

  // UI Builder state
  const [config, setConfig] = useState(DEFAULT_UI_CONFIG);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [showTemplatePreview, setShowTemplatePreview] = useState(null); // for modal full preview

  // isCreator computed early (wallet + covenant creator_addr match). Only creator can deploy/set custom UI or see Terminal/Builder.
  // Fix tab and looks/stake always available to creator after wallet login. No paid required for basic Fix or chess arena.
  const isCreator = !!(address && covenant?.creator_addr && address === covenant.creator_addr);

  // Viewer-first: when user "presses on the covenant" they see nice transparent UI (custom if set by creator, or full facts).
  // "Arena / Play" is default for everyone (especially chess). Terminal + advanced ONLY for creator.
  // Fix tab (creator only) for clean looks + single stake section.
  const [activeTab, setActiveTab] = useState(() => {
    const tabParam = searchParams.get('tab');
    const playParam = searchParams.get('play');
    if ((tabParam === 'terminal' || playParam) && isCreator) return 'terminal';
    if (tabParam === 'fix' && isCreator) return 'fix';
    if (covenant?.custom_ui_html && covenant.custom_ui_html.length > 10) return 'interact';
    return 'interact';
  });

  // Full details are always shown to viewers (no hidden settings for regular users):
  // "everything there is to know, fully transparent". There is no toggle to gate.

  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [fullscreenUI, setFullscreenUI] = useState(false);
  // When a creator has published a custom UI, that website becomes the full-width
  // primary view and every Covex chrome element (title block, lifecycle rail, tier
  // badges, script/technical disclosure, native interact panel) is tucked behind a
  // collapsed "Details" toggle. detailsOpen drives that section; it starts closed so
  // the creator page leads, and nothing is ever deleted - only relocated.
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [chessStake, setChessStake] = useState(50);
  const [showChessArena, setShowChessArena] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [showGameArena, setShowGameArena] = useState(false);
  // Claim & Activate: provide an elsewhere-created covenant's redeem script (+ metadata) to make it
  // fully interactable. Verified by the backend against the on-chain commitment (the script must hash-match).
  const [claimOpen, setClaimOpen] = useState(false);
  const [claimForm, setClaimForm] = useState({ redeem_script_hex: '', kind: 'singlesig', name: '', description: '' });
  const [claimBusy, setClaimBusy] = useState(false);
  // Detect WHICH game this covenant is. Prefer the explicit deployed game_type; fall back to text
  // heuristics for older/crawled covenants. Specific games are matched before the loose chess
  // fallback so a poker covenant that says "winner takes all" isn't mis-detected as chess.
  const gameType = useMemo(() => {
    if (!covenant) return null;
    const cfg = covenant.custom_ui_config || {};
    const explicit = (covenant.game_type || cfg.game_type || '').toLowerCase();
    const hay = (explicit + ' ' + [
      covenant.covenant_type, covenant.category, covenant.name,
      covenant.description, covenant.desc, covenant.full_logic_summary,
      cfg.name, cfg.description,
    ].filter(Boolean).join(' ')).toLowerCase();
    if (/poker|hold.?em/.test(hay)) return 'poker';
    if (/blackjack/.test(hay)) return 'blackjack';
    if (/checkers|draughts/.test(hay)) return 'checkers';
    if (/connect.?4|connect.?four/.test(hay)) return 'connect4';
    if (/reversi|othello/.test(hay)) return 'reversi';
    if (/tic.?tac.?toe/.test(hay)) return 'tictactoe';
    if (/rock.?paper|\brps\b/.test(hay)) return 'rps';
    if (/chess/.test(hay) || hay.includes('10 min') || hay.includes('10min') || hay.includes('winner-takes-all') || hay.includes('winner takes all')) return 'chess';
    return null;
  }, [covenant]);
  const isChess = gameType === 'chess';
  const isOtherGame = !!gameType && gameType !== 'chess';
  // A joiner must match the creator's locked pot exactly. If a stake is already
  // locked on the covenant and the viewer is NOT the creator, the lobby switches
  // to join mode: the stake input is pre-filled to that pot and locked. The
  // creator (or a fresh, unstaked covenant) keeps the free create-a-match input.
  const joinPot = useMemo(
    () => (!isCreator ? Math.round(Number(covenant?.amount_kaspa || 0)) : 0),
    [isCreator, covenant?.amount_kaspa],
  );
  // Creator-chosen appearance for whichever game this covenant is, resolved from
  // the saved custom_ui_config so the public arena matches what the creator
  // previewed. gameLook is the unified per-game look; chessLook is kept as the
  // chess-specific alias used by the inline lobby board below.
  const gameLook = useMemo(() => gameLookFromConfig(covenant?.custom_ui_config, gameType), [covenant, gameType]);
  const chessLook = useMemo(() => gameLookFromConfig(covenant?.custom_ui_config, 'chess'), [covenant]);
  // A single binary_oracle_select covenant is one LEG of a parimutuel market, not a bare
  // on-chain primitive: its custody is script-locked but the OUTCOME is set by the secret a
  // deployer-bound external resolver reveals. It must read as a market, never "no oracle, no trust".
  const isMarketLeg = /binary_oracle_select/.test(covenant?.covenant_type || '');

  // Claim & Activate: verify a supplied redeem script against the on-chain commitment, then the
  // covenant becomes redeemable + richly displayed. Refetch so the new UI appears immediately.
  const submitClaim = async () => {
    if (!claimForm.redeem_script_hex.trim()) { toast.error('Paste the covenant redeem script (hex).'); return; }
    setClaimBusy(true);
    try {
      const r = await fetch('/api/covenant/p2sh/claim', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ covenant_id: id, ...claimForm }),
      });
      const d = await r.json();
      if (d && d.ok) {
        toast.success('Script matches the on-chain commitment. Custody is verified; outcome enforcement reality is unchanged (see the trust badge).');
        setClaimOpen(false);
        fetch(`/api/covenants/${encodeURIComponent(id)}`).then(x => x.ok ? x.json() : null).then(x => x && setCovenant(x.covenant || null)).catch(() => {});
      } else {
        toast.error(d?.error || 'The redeem script did not match this covenant.');
      }
    } catch (e) {
      toast.error(e?.message || 'Claim failed.');
    } finally {
      setClaimBusy(false);
    }
  };

  const [actions, setActions] = useState([]);
  useEffect(() => {
    fetch(`/api/covenants/${encodeURIComponent(id)}/actions`)
      .then((r) => r.json())
      .then((d) => setActions(Array.isArray(d.actions) ? d.actions : []))
      .catch(() => {});
  }, [id]);

  // The disclosed resolver's x-only signing key (BIP340). Surfaced to designed pages as
  // {{oracle_pubkey}} so a resolver-signer display shows the REAL disclosed key, never a
  // placeholder. This is the deployer-bound resolver, not a trustless guarantee. The endpoint
  // returns `xonly_pubkey` as its canonical field; fall back gracefully for older shapes.
  const [oraclePubkey, setOraclePubkey] = useState('');
  useEffect(() => {
    fetch('/api/oracle/pubkey')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setOraclePubkey(j.xonly_pubkey || j.oracle_xonly_pubkey || j.oracle_pubkey || j.pubkey || ''))
      .catch(() => {});
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync/reset inside this effect (data-fetch loading reset, dependency-change reset, or external-event handler); React Compiler perf advisory, not a render-loop bug; tests cover the behavior
    setLoading(true);
    fetch(`/api/covenants/${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => setCovenant(d.covenant || null))
      .catch(() => setCovenant(null))
      .finally(() => setLoading(false));
  }, [id]);

  // Live refresh: keep on-chain figures (amount locked, status, activity) current so
  // custom pages show real-time data. Polls every 20s and merges ONLY the volatile
  // fields, so it never clobbers a creator's in-progress UI edits held in state.
  useEffect(() => {
    if (!id) return;
    const tick = () => {
      fetch(`/api/covenants/${encodeURIComponent(id)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          const f = d && d.covenant;
          if (!f) return;
          setCovenant((c) => (c ? { ...c, amount_kaspa: f.amount_kaspa, is_active: f.is_active, block_daa_score: f.block_daa_score, timestamp: f.timestamp } : c));
        })
        .catch(() => {});
      fetch(`/api/covenants/${encodeURIComponent(id)}/actions`)
        .then((r) => r.json())
        .then((d) => setActions(Array.isArray(d.actions) ? d.actions : []))
        .catch(() => {});
    };
    const iv = setInterval(tick, 20000);
    return () => clearInterval(iv);
  }, [id]);

  // Live, server-derived covenant state exposed to creator-designed Puck pages as
  // {{tokens}} and as structured metadata (live.actions / live.pool / live.odds) that
  // the premium read-only blocks consume. Read-only figures only; a custom page can
  // never set a destination.
  //
  // HONESTY: every field here is derived from data the backend actually returns for
  // this covenant (the detail record, the on-chain action log, the disclosed resolver
  // key). Nothing is fabricated. Where the backend cannot supply a figure (e.g. a
  // generic, non-market covenant has no per-outcome pool split or event clock), the
  // field is OMITTED so the consuming block renders its honest empty state rather than
  // an invented number. Per-side pool / odds and event times only appear when the
  // record genuinely carries them (a market anchor or a creator-published config).
  const liveData = useMemo(() => {
    if (!covenant) return {};
    const locked = Number(covenant.amount_kaspa || 0);

    // Normalize the indexed on-chain action log into stable rows for ActivityFeed /
    // Leaderboard. Field names mirror what /covenants/:id/actions returns, with safe
    // fallbacks; no row is synthesized.
    const acts = (Array.isArray(actions) ? actions : []).map((a) => ({
      label: a.label || a.action || a.type || 'Action',
      detail: a.detail || '',
      address: a.address || a.from || a.creator || a.bettor_addr || '',
      amount_kaspa: Number(a.amount_kaspa ?? a.amount ?? 0) || 0,
      timestamp: a.timestamp != null ? Number(a.timestamp) : null,
      daa_score: a.daa_score != null ? Number(a.daa_score) : (covenant.block_daa_score || null),
    }));

    // Pool: total locked is always real (it is the indexed UTXO balance). Per-outcome
    // pools only exist on market-style records; read them defensively and omit when
    // absent so the OddsBar / PoolChart fall back to total-only or an empty state.
    const poolA = covenant.funded_pool_a_kas != null ? Number(covenant.funded_pool_a_kas)
      : (covenant.pool_yes != null ? Number(covenant.pool_yes) : null);
    const poolB = covenant.funded_pool_b_kas != null ? Number(covenant.funded_pool_b_kas)
      : (covenant.pool_no != null ? Number(covenant.pool_no) : null);
    const hasSides = Number.isFinite(poolA) && Number.isFinite(poolB) && (poolA + poolB) > 0;
    const pool = {
      total: locked,
      ...(hasSides ? { yes: poolA, no: poolB } : {}),
    };

    // Odds: the honest NET winner multiplier from current stakes, matching the canonical
    // Markets math (1 - f) + (1 - f - r) * (opposing pool / your pool), where f is the pool
    // fee and r the loser rebate. This is what a winner actually receives, NOT the gross
    // pool ratio and NOT a probability. Only when both sides carry real liquidity. If the
    // fee/rebate are unknown we fall back to the gross multiple, labeled so it is not read
    // as the payout.
    const feeF = covenant.fee_pct != null ? Number(covenant.fee_pct) / 100 : null;
    const rebateF = covenant.rebate_pct != null ? Number(covenant.rebate_pct) / 100 : null;
    const haveFees = Number.isFinite(feeF) && Number.isFinite(rebateF);
    const winMult = (your, opp) => {
      if (!(your > 0)) return 0;
      return haveFees ? (1 - feeF) + (1 - feeF - rebateF) * (opp / your) : (your + opp) / your;
    };
    const odds = hasSides
      ? { yes: winMult(poolA, poolB), no: winMult(poolB, poolA), basis: haveFees ? 'net-after-fee-rebate' : 'gross-before-fees' }
      : {};

    // Event clock + oracle disclosure. Times come only from a record that carries them
    // (a market anchor's kickoff / an absolute-timelock covenant); omitted otherwise so
    // the Countdown block prompts for a target instead of inventing one.
    const kickoff = covenant.kickoff_utc || covenant.kickoff || '';
    const settleAt = covenant.settle_at || covenant.settle_utc || covenant.resolved_at || '';
    const timelock = covenant.lock_daa != null ? covenant.lock_daa
      : (covenant.timelock_daa != null ? covenant.timelock_daa : '');

    return {
      name: covenant.name || covenant.covenant_type || 'Covenant',
      status: covenant.is_active === false ? 'Settled' : 'Active',
      network: covenant.network || 'mainnet',
      amount_kaspa: locked,
      total_locked: `${locked.toLocaleString()} KAS`,
      tx_count: actions.length,
      fee_pct: covenant.fee_pct != null ? covenant.fee_pct : '',
      rebate_pct: covenant.rebate_pct != null ? covenant.rebate_pct : '',
      creator: TRUNC(covenant.creator_addr || covenant.address || '', 8),
      daa_score: covenant.block_daa_score || 0,
      verified_tier: covenant.verified_tier || 'FREE',
      // Structured live data the premium blocks read off metadata.live.
      actions: acts,
      pool,
      odds,
      // Flat token mirrors so {{tokens}} bind in any text field. Per-side pool / odds
      // tokens resolve to '' (rendered hidden) when there is no real two-sided split.
      // odds_* are the same honest net multiplier as live.odds.
      pool_total: locked,
      pool_yes: hasSides ? poolA : '',
      pool_no: hasSides ? poolB : '',
      odds_yes: hasSides && poolA > 0 ? winMult(poolA, poolB).toFixed(2) : '',
      odds_no: hasSides && poolB > 0 ? winMult(poolB, poolA).toFixed(2) : '',
      // Event clock tokens for the Countdown block (real time or omitted).
      kickoff,
      settle_at: settleAt,
      timelock,
      // external resolver identity (BIP340 x-only key) + outcome commitments, when present.
      oracle_pubkey: oraclePubkey || '',
      commitment_a: covenant.h_a || '',
      commitment_b: covenant.h_b || '',
      // Server-derived enforcement reality, surfaced to the EnforcementBadge block as
      // a STATIC honesty label only (never a fund flow). Passed through verbatim so the
      // block never overclaims (on-chain / oracle / full-zk / metadata).
      enforcement_reality: covenant.enforcement_reality || '',
    };
  }, [covenant, actions, oraclePubkey]);

  const deployUri = useMemo(
    () =>
      covenant
        ? buildUri(covenant.address || DEPLOYER, amount || '0', {
            scriptHash: covenant.script_hash,
          })
        : null,
    [covenant, amount, buildUri]
  );

  // Local in-flight flag for the EXECUTE action only. The button must NOT be gated on the
  // ambient `connecting` flag from useWallet (the kasflow auto-reconnect keeps it true when
  // no wallet is present), which left a public viewer's button stuck on "PROCESSING..."
  // forever. This is set true only while a user-initiated execute is actually running.
  const [executing, setExecuting] = useState(false);
  const handleExecute = useCallback(async (amtOverride) => {
    if (!covenant) return;
    // amtOverride lets a parameterized action button suggest an amount. It is a
    // DISPLAY amount only; the destination + scriptHash are always taken from the
    // indexed covenant record below, never from any page input. (When wired as an
    // onClick handler the first arg is the click event, so guard with Number().)
    const overrideNum = Number(amtOverride);
    const amt = Number.isFinite(overrideNum) && overrideNum > 0 ? String(overrideNum) : amount;
    if (!amt || Number(amt) <= 0) {
      toast.error('Enter an amount to lock before executing.');
      return;
    }
    if (address) {
      setExecuting(true);
      try {
        // sendPayment resolves to {success:false, error} on a rejected broadcast (it does NOT
        // throw on the dev/backend path), so check the result rather than assuming success.
        const res = await sendPayment(covenant.address || DEPLOYER, amt, {
          scriptHash: covenant.script_hash,
        });
        if (res && res.success === false) {
          toast.error(`Transaction failed: ${res.error || 'wallet rejected the transaction'}`);
        } else {
          toast.success(res?.txid ? `Transaction broadcast: ${String(res.txid).slice(0, 16)}…` : 'Transaction sent to your wallet for signing.');
        }
      } catch (e) {
        toast.error(`Transaction failed: ${e?.message || 'unknown error'}`);
      } finally {
        setExecuting(false);
      }
    } else {
      // No wallet: never open a dead protocol tab. Prompt the connect modal, which leads somewhere.
      toast.info('Connect a Kaspa wallet to interact with this covenant.');
      setWalletModalOpen(true);
    }
  }, [covenant, amount, address, sendPayment]);

  // BRIDGE: creator-designed covenant UIs (the sandboxed iframe path AND the Puck
  // page path) signal intent by posting a message; they can NEVER move funds or set
  // a destination themselves. Two message types are accepted:
  //   COVENANT_EXECUTE                                  - legacy headline button.
  //   COVENANT_ACTION {action, outcome, amountKas}      - typed parameterized button.
  // Both route to the SAME platform actions, and the real destination + scriptHash
  // are always derived from the indexed covenant record (in handleExecute / the
  // arena), never from the payload. The iframe is sandboxed without
  // allow-same-origin so a message is all it can do; CSP frame-ancestors 'self'
  // blocks third-party framing. The amountKas is treated as a suggested DISPLAY
  // amount only and is range-checked before use.
  const routeCovenantIntent = useCallback((action, amountKas) => {
    const amt = Number(amountKas);
    if (Number.isFinite(amt) && amt > 0) setAmount(String(amt));
    // Games always open their arena (the pot is locked there, non-custodially).
    if (isChess) { setShowChessArena(true); return; }
    if (isOtherGame) { setShowGameArena(true); return; }
    // 'bet' is meaningful only for markets, which render their own MarketView and
    // never reach this Puck path; for a generic covenant we run the same safe,
    // non-custodial lock/spend flow as 'interact' and 'spend'.
    handleExecute(Number.isFinite(amt) && amt > 0 ? amt : undefined);
  }, [isChess, isOtherGame, handleExecute]);

  useEffect(() => {
    const onMsg = (e) => {
      const d = e?.data;
      if (!d || typeof d !== 'object') return;
      if (d.type === 'COVENANT_EXECUTE') {
        routeCovenantIntent('interact', null);
      } else if (d.type === 'COVENANT_ACTION') {
        const action = typeof d.action === 'string' ? d.action : 'interact';
        routeCovenantIntent(action, d.amountKas);
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [routeCovenantIntent]);

  // React to loaded covenant (custom UI presence) and isCreator for correct default tab
  useEffect(() => {
    if (!covenant) return;
    const tabParam = searchParams.get('tab');
    const playParam = searchParams.get('play');
    if ((tabParam === 'terminal' || playParam) && isCreator) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync/reset inside this effect (data-fetch loading reset, dependency-change reset, or external-event handler); React Compiler perf advisory, not a render-loop bug; tests cover the behavior
      setActiveTab('terminal');
    } else if (covenant.custom_ui_html && covenant.custom_ui_html.length > 10) {
      setActiveTab('interact');
    } else {
      setActiveTab('interact');
    }
  }, [covenant, isCreator, searchParams]);

  // Billion-dollar quality generator for custom covenant UIs.
  // Paid creators get powerful tools to make their covenant page look like a premium product/brand site.
  // The output is self-contained, beautiful, transparent, and highly inviting.
  function buildTransparentCustomUI(cov, cfg) {
    // The page renders as raw HTML, so every interpolated value must be escaped
    // (stored-XSS guard); colors are validated against a strict pattern.
    const ESC = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const SAFE_COLOR = (c) => (/^#[0-9a-fA-F]{3,8}$|^rgba?\([\d.,\s%]+\)$/.test(String(c || '')) ? c : '#49EACB');
    const primary = SAFE_COLOR(cfg.primaryColor);

    // HONESTY: a covenant whose OUTCOME is decided by a deployer-bound external resolver (games are
    // server-authoritative + oracle-attested; oracle escrow/enforced; markets / binary_oracle_select)
    // must NOT read as if the result were verified on-chain. Custody and payout ARE script-locked
    // on-chain and verifiable on the explorer; only the outcome is oracle-attested, not on-chain.
    // Pure consensus-enforced primitives keep the fully-on-chain-verifiable wording.
    //
    // Gate strictly on the server-derived enforcement_reality string the backend stamps
    // onto every covenant. The label is the source of truth (on-chain / hybrid / oracle /
    // full-zk / decorative); keyword sniffing risked mis-labeling a primitive whose name
    // happened to contain "oracle". Anything that is NOT 'on-chain' falls back to the
    // oracle-attested copy, which is the honest worst case for unknown enforcement.
    const reality = String(cov.enforcement_reality || '').toLowerCase();
    const isOracleResolved = reality !== '' && reality !== 'on-chain';
    // Custody/payout is always on-chain; only the trust BAR and the default copy differ.
    const honestDescDefault = isOracleResolved
      ? 'Custody and every payout are script-locked on-chain on the Kaspa BlockDAG and verifiable on the explorer. The outcome is attested by a deployer-bound external resolver (for games, a simulated recomputable Covex engine that replays the public move log), not verified on-chain.'
      : 'This covenant is immutable on the Kaspa BlockDAG. Custody, logic and payouts are on-chain and verifiable on the explorer.';
    const honestLogicDefault = isOracleResolved
      ? 'All logic, fees, addresses and payouts are disclosed and on-chain. Custody and payout are verifiable on the explorer; the outcome is attested by a deployer-bound external resolver (for games, a simulated recomputable Covex engine that replays the public move log), not verified on-chain.'
      : 'All logic and parameters are fully disclosed and on-chain. This is a creator-published covenant verifiable on the explorer.';
    const trustBarText = isOracleResolved
      ? 'TRANSPARENT • IMMUTABLE • NON-CUSTODIAL • CUSTODY &amp; PAYOUT ON KASPA • OUTCOME ORACLE-ATTESTED'
      : 'FULLY TRANSPARENT • IMMUTABLE • NON-CUSTODIAL • VERIFIABLE ON KASPA';

    const title = ESC(cfg.titleOverride || cov.name || TRUNC(cov.tx_id));
    const desc = ESC(cfg.descOverride || cov.description || cov.desc || honestDescDefault);
    // Always show a real Kaspa wallet, never "Unknown": the deployer (creator_addr) when known,
    // otherwise the covenant's own on-chain address. (The backend creator-prefix fix makes mainnet
    // deployers render as kaspa:; this guarantees the field is never an empty "Unknown".)
    const creator = ESC(displayCreatorAddr(cov) || (cov.tx_id ? `covenant ${TRUNC(cov.tx_id)}` : 'Unknown'));
    const locked = ESC((cov.amount_kaspa || 0).toLocaleString());
    const tx = ESC(cov.tx_id || '');
    const explorerTx = ESC(explorerTxUrl(cov.tx_id, cov.network)); // network-accurate explorer URL
    const cat = ESC(cov.category || 'General');
    const tier = ESC(cov.verified_tier || cov.tier || 'FREE');
    const verified = isVerified(cov);
    const addrs = ESC(cov.receiving_addresses || cov.address || '');
    const feeRecipient = ESC(cov.fee_recipient || '');
    const ts = ESC(cov.timestamp ? new Date(cov.timestamp * 1000).toLocaleDateString() : 'recent');

    const heroImage = encodeURI(cfg.heroImageUrl || '');
    const vision = ESC(cfg.vision || '');
    const publicAbout = ESC(cfg.publicAbout || cfg.descOverride || cov.description || cov.desc || honestDescDefault);
    const publicRules = ESC(cfg.publicRules || cov.full_logic_summary || honestLogicDefault);
    const publicHowTo = ESC(cfg.publicHowTo || 'Connect a wallet, choose your stake amount, and execute directly to the covenant address. All details, addresses, and resolution logic are public.');

    // Premium, modern, billion-dollar aesthetic
    const customCss = `
      :root { --primary: ${primary}; --accent: ${primary}; }
      * { box-sizing: border-box; }
      body { font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, sans-serif; background: #050507; color: #F1F5F9; margin: 0; padding: 0; line-height: 1.6; -webkit-font-smoothing: antialiased; }
      .container { max-width: 1080px; margin: 0 auto; padding: 40px 20px; }
      .hero { padding: 80px 0 60px; text-align: center; position: relative; background: ${heroImage ? `linear-gradient(rgba(5,5,7,0.65), rgba(5,5,7,0.75)), url('${heroImage}') center/cover` : 'none'}; border-radius: 24px; margin-bottom: 32px; }
      h1 { font-size: 56px; font-weight: 700; letter-spacing: -2.8px; margin: 0 0 16px; line-height: 1.0; }
      .subtitle { font-size: 21px; color: #94A3B8; max-width: 620px; margin: 0 auto 32px; }
      .badge { display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; border-radius: 999px; font-size: 12px; font-weight: 600; letter-spacing: 0.5px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); }
      .section { margin-bottom: 48px; }
      .section-header { font-size: 13px; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; color: #64748B; margin-bottom: 16px; }
      .glass { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 20px; backdrop-filter: blur(20px); padding: 32px; }
      .facts-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; }
      .fact-card { background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255,255,255,0.06); border-radius: 16px; padding: 20px; transition: transform 0.2s cubic-bezier(0.23, 1, 0.32, 1), box-shadow 0.2s; }
      .fact-card:hover { transform: translateY(-2px); box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1); }
      .fact-label { font-size: 11px; color: #64748B; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 6px; }
      .fact-value { font-size: 15px; font-weight: 600; color: #F8FAFC; word-break: break-all; }
      .mono { font-family: ui-monospace, SFMono-Regular, Menlo, "SF Mono", monospace; font-size: 13px; }
      .btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; background: var(--primary); color: #000; font-weight: 700; font-size: 15px; padding: 16px 32px; border-radius: 999px; border: none; cursor: pointer; transition: all 0.2s cubic-bezier(0.23,1,0.32,1); text-decoration: none; }
      .btn:hover { transform: translateY(-1px); box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.2); }
      .prose { max-width: 68ch; color: #CBD5E1; font-size: 15.5px; }
      .footer { text-align: center; padding: 40px 0 20px; color: #475569; font-size: 12px; }
      .nav { display: flex; justify-content: space-between; align-items: center; padding: 20px 0; border-bottom: 1px solid rgba(255,255,255,0.06); margin-bottom: 40px; }
      .logo { font-weight: 700; letter-spacing: -0.5px; }
    `;

    // Beautiful, modular, premium HTML structure that feels like a top-tier product page.
    let blocksHTML = '';

    // Hero (supports custom hero image for premium feel)
    blocksHTML += `
      <div class="hero" ${heroImage ? `style="background: linear-gradient(rgba(5,5,7,0.6), rgba(5,5,7,0.75)), url('${heroImage}') center/cover no-repeat;"` : ''}>
        <div style="margin-bottom: 20px;">
          <span class="badge" style="background: rgba(16,185,129,0.1); border-color: rgba(16,185,129,0.3); color: #34D399;">
            ${verified ? 'VERIFIED BY CREATOR' : 'ON-CHAIN COVENANT'} · ${tier}
          </span>
        </div>
        <h1>${title}</h1>
        <p class="subtitle">${desc}</p>
        ${vision ? `<p style="max-width:580px; margin: 0 auto 28px; color:#CBD5E1; font-size:15px;">${vision}</p>` : ''}
        <div style="display:flex; gap:12px; justify-content:center; flex-wrap:wrap;">
          <button onclick="document.getElementById('interact').scrollIntoView({behavior:'smooth'})" class="btn">Interact with this covenant</button>
          <a href="${explorerTx}" target="_blank" class="btn btn-outline">View on Explorer</a>
        </div>
      </div>
    `;

    // Trust bar
    blocksHTML += `
      <div class="section" style="text-align:center; opacity:0.85;">
        <div style="font-size:12px; letter-spacing:1.5px; color:#64748B;">${trustBarText}</div>
      </div>
    `;

    // Facts - beautiful cards (all receiving addresses and core facts visible by default)
    blocksHTML += `
      <div class="section">
        <div class="section-header">On-Chain Facts &amp; Receiving Addresses (Public by Default)</div>
        <div class="facts-grid">
          <div class="fact-card"><div class="fact-label">Creator</div><div class="fact-value mono">${creator}</div></div>
          <div class="fact-card"><div class="fact-label">KAS Locked</div><div class="fact-value">${locked} KAS</div></div>
          <div class="fact-card"><div class="fact-label">Category</div><div class="fact-value">${cat}</div></div>
          <div class="fact-card"><div class="fact-label">TXID</div><div class="fact-value mono" style="font-size:12px;">${tx}</div></div>
          <div class="fact-card"><div class="fact-label">Deployed</div><div class="fact-value">${ts}</div></div>
          ${addrs ? `<div class="fact-card"><div class="fact-label">Covenant Address</div><div class="fact-value mono" style="font-size:12px;">${addrs}</div></div>` : ''}
          ${feeRecipient ? `<div class="fact-card"><div class="fact-label">Fee Recipient</div><div class="fact-value mono" style="font-size:12px;">${feeRecipient}</div></div>` : ''}
          <div class="fact-card"><div class="fact-label">Creator Cut Address</div><div class="fact-value mono" style="font-size:12px;">${creator}</div></div>
        </div>
      </div>
    `;

    // Full logic + creator written content (visible by default, creator can write more)
    blocksHTML += `
      <div class="section">
        <div class="section-header">Full Covenant Logic (Public by Default)</div>
        <div class="glass prose">${publicRules}</div>
      </div>
      <div class="section">
        <div class="section-header">About this Covenant</div>
        <div class="glass prose">${publicAbout}</div>
      </div>
      <div class="section">
        <div class="section-header">How to Participate</div>
        <div class="glass prose">${publicHowTo}</div>
      </div>
    `;

    // Interact section (beautifully styled)
    blocksHTML += `
      <div id="interact" class="section">
        <div class="section-header">Direct Interaction</div>
        <div class="glass" style="text-align:center; padding:48px 32px;">
          <p style="max-width:420px; margin:0 auto 24px; color:#94A3B8;">All interactions are non-custodial and happen directly on the Kaspa blockchain with your wallet.</p>
          <button onclick="window.parent.postMessage({type:'COVENANT_EXECUTE'},'*')" class="btn" style="font-size:17px; padding:18px 44px;">Connect Wallet &amp; Execute</button>
          <div style="margin-top:20px; font-size:11px; color:#475569;">Your keys, your covenant, your terms.</div>
        </div>
      </div>
    `;

    // Footer
    blocksHTML += `
      <div class="footer">
        Published by the covenant creator • Powered by Covex on Kaspa • <a href="${explorerTx}" target="_blank" style="color:inherit;">Verify on Explorer</a>
      </div>
    `;

    return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} • Transparent Covenant</title><style>${customCss}</style></head>
<body>
  <div class="container">
    <div class="nav">
      <div class="logo" style="font-size:21px; color:#F1F5F9;">${title}</div>
      <div style="font-size:12px; color:#64748B; letter-spacing:1px;">COVENANT ON KASPA</div>
    </div>
    ${blocksHTML}
  </div>
</body></html>`;
  }

  // Publish the current builder config as a nice transparent custom UI for this covenant.
  // Only callable by isCreator (UI is hidden otherwise). Uses the existing protected /terminal-config endpoint (backend enforces creator_addr match).
  const publishCustomUI = async (useDefault = false) => {
    if (!isCreator || !covenant || !address) {
      toast.error('Only the creator of this covenant can publish a custom UI.');
      return;
    }
    const cfg = useDefault ? { ...DEFAULT_UI_CONFIG, titleOverride: covenant.name, descOverride: 'Fully transparent public view. Everything there is to know about this covenant.', publicAbout: 'Creator published details and full on-chain logic visible to all.', publicRules: 'All fees, timers, addresses, verification and payouts are public by default.', publicHowTo: 'Stake directly to the covenant. All information is transparent.' } : config;
    const html = buildTransparentCustomUI(covenant, cfg);
    try {
      // Prove ownership: sign the server challenge with the creator wallet.
      const proof = await signCovenantOwnership(id, address, signMessage);
      const payload = {
        custom_ui_code: html,
        ...proof,
        name: cfg.titleOverride || covenant.name,
        description: cfg.descOverride || covenant.description,
        resolution_mode: 'transparent-ui',
      };
      const res = await fetch(`/api/terminal-config/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        // Optimistically update local covenant so the nice UI appears immediately for preview.
        // Mark it creator-sourced so hasCreatorUI lights up the iframe right away (the backend
        // persists this as a TERMINAL-tier row, which reads back as custom_ui_source 'creator').
        setCovenant((c) => ({ ...c, custom_ui_html: html, custom_ui_source: 'creator' }));
        localStorage.setItem(`covex_ui_config_${id}`, JSON.stringify(cfg));
        toast.success('Custom transparent UI published! All viewers now see the nice view (no terminal).');
        setActiveTab('interact');
        return true;
      }
      toast.error(data.error || 'Publish failed (are you the creator?). Your change is NOT live for viewers.');
      return false;
    } catch (e) {
      // The update did NOT reach the backend - do not claim it published. Save the
      // config locally for the creator's own preview, but be explicit it is not live.
      localStorage.setItem(`covex_ui_config_${id}`, JSON.stringify(cfg));
      setCovenant((c) => ({ ...c, custom_ui_html: html, custom_ui_source: 'creator' }));
      toast.error(`Publish failed: ${e.message || 'could not reach the backend'}. Saved locally for your preview only - viewers do NOT see this yet.`);
      return false;
    }
  };

  if (loading) {
    return <CovenantDetailSkeleton />;
  }

  if (!covenant) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-24">
        <div className="relative glass-panel rounded-3xl p-10 sm:p-12 flex flex-col items-center text-center gap-5 overflow-hidden">
          <div className="covex-aurora" aria-hidden="true" style={{ top: -40, left: 0, right: 0, marginLeft: 'auto', marginRight: 'auto', width: 360, height: 200, maxWidth: '90vw' }} />
          <div className="relative z-10 p-4 bg-amber-500/10 rounded-2xl border border-amber-500/30 text-amber-400">
            <AlertTriangle size={32} />
          </div>
          <div className="relative z-10">
            <h1 className="text-2xl font-bold text-white tracking-tight">Covenant not found</h1>
            <p className="text-gray-400 text-sm mt-2 max-w-md">
              We could not locate a covenant for this link. It may have been mistyped, or this id does not exist on the BlockDAG.
            </p>
          </div>
          <Link
            to="/"
            className="relative z-10 btn-shimmer inline-flex items-center gap-2 px-6 py-2.5 rounded-xl border border-kaspa-green/40 text-kaspa-green text-sm font-bold hover:bg-kaspa-green/10 transition-colors"
          >
            <ArrowLeft size={16} /> Return to Explorer
          </Link>
        </div>
      </div>
    );
  }

  // A conditional-outcome covenant IS its full interactive website on its own covenant page
  // (live pools, orders, resolve), rendered here in the Explorer flow exactly like any other
  // interactive covenant. These are covenants in the Explorer, never a separate section.
  if (covenant.covenant_type === 'prediction-market') {
    return <MarketView marketId={id} />;
  }

  const verified = isVerified(covenant);

  // Only a GENUINE creator-published UI (saved via the Fix/terminal-config flow,
  // backend marks custom_ui_source === 'creator') earns the iframe. The auto-
  // generated "basic UI" blob (custom_ui_source === 'auto') is NOT rendered - it
  // would otherwise speak for the covenant (e.g. calling a consensus-enforced
  // covenant "dangerous"). Those viewers get the clean native interact panel below.
  const hasCreatorUI =
    covenant?.custom_ui_source === 'creator' &&
    typeof covenant?.custom_ui_html === 'string' &&
    covenant.custom_ui_html.length > 10;

  // Single creator surface switch: render EXACTLY ONE creator-authored view.
  // Puck data wins (the structured editor output); the legacy sandboxed iframe
  // is only used when there is no Puck data. Prevents double-rendered surfaces
  // (hero + bottom iframe) that previously fought for attention.
  const creatorSurface = covenant?.custom_ui_config?.puck_data?.content?.length > 0
    ? 'puck'
    : (hasCreatorUI ? 'iframe' : null);

  // When a creator has published their own UI, that website is the page: it renders
  // full-width as the primary surface and all of Covex's own chrome is relocated behind
  // a collapsed "Details" toggle. Covenants WITHOUT a creator UI keep the original
  // layout unchanged (the Covex metadata IS the content there). Games keep their arena.
  const hasCustomSurface = !!creatorSurface && !gameType;

  // The full-bleed creator surface (Puck blocks or the sandboxed iframe). Rendered both
  // as the primary view when hasCustomSurface, and inline (legacy spot) otherwise, from
  // a single definition so the two paths never drift. The iframe keeps its exact
  // security model: sandbox="allow-scripts", only earned by custom_ui_source==='creator'.
  const fullBleedCreatorSurface = creatorSurface === 'puck' ? (
    <Suspense fallback={<div className="min-h-[40vh]" aria-hidden="true" />}>
      <PuckSurface data={covenant.custom_ui_config.puck_data} liveData={liveData} />
    </Suspense>
  ) : creatorSurface === 'iframe' ? (
    <iframe
      srcDoc={covenant.custom_ui_html}
      title="Creator-published covenant interface"
      className="w-full border-0 bg-[#06080B] block"
      style={{ minHeight: 'calc(100vh - 132px)' }}
      sandbox="allow-scripts"
    />
  ) : null;

  return (
    <div className={hasCustomSurface
      ? 'w-full pb-[180px] xl:pb-12'
      : 'max-w-7xl mx-auto px-4 sm:px-6 xl:pr-[312px] pt-10 sm:pt-12 pb-[180px] xl:pb-12'}>

      {/* ── Creator-UI page: the published website is the full-width primary view. A slim
          top bar carries the only Covex affordances (back, one-line title, Share, and the
          Details toggle); everything else is relocated, collapsed, below. ── */}
      {hasCustomSurface && (
        <>
          <div className="sticky top-0 z-30 flex items-center gap-3 px-4 sm:px-6 py-2.5 border-b border-white/[0.06] bg-[#05050A]/85 backdrop-blur-md light:bg-white/85 light:border-slate-200">
            <Link
              to="/"
              aria-label="Return to the registry"
              className="shrink-0 inline-flex items-center gap-1.5 text-gray-300 hover:text-white transition-colors font-mono text-xs uppercase tracking-wider light:text-slate-500 light:hover:text-slate-900"
            >
              <ArrowLeft size={15} /> <span className="hidden sm:inline">Registry</span>
            </Link>
            <span className="h-4 w-px bg-white/10 light:bg-slate-200 shrink-0" aria-hidden="true" />
            <span className="flex-1 min-w-0 truncate text-sm font-semibold text-white light:text-slate-900" title={covenant.name || covenant.covenant_type}>
              {covenant.name || covenant.covenant_type || TRUNC(covenant.tx_id)}
            </span>
            {/* Wallet control in the full-width view: the custom site is the interaction
                surface, so a visitor still needs to connect / see their wallet from here.
                WalletButton is self-contained (own portal drawer) and already responsive
                (icon-only below sm), so it keeps the bar slim. */}
            <div className="shrink-0">
              <WalletButton />
            </div>
            <button
              type="button"
              onClick={() => setShareOpen(true)}
              aria-label="Share this covenant"
              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-kaspa-green/30 bg-kaspa-green/[0.08] text-kaspa-green text-xs font-semibold hover:bg-kaspa-green/[0.14] hover:border-kaspa-green/50 transition-colors light:bg-emerald-500/[0.10] light:border-emerald-500/40 light:text-emerald-700 light:hover:bg-emerald-500/[0.18]"
            >
              <Share2 size={13} aria-hidden="true" />
              <span className="hidden sm:inline">Share</span>
            </button>
            <button
              type="button"
              onClick={() => setDetailsOpen((v) => !v)}
              aria-expanded={detailsOpen}
              aria-controls="covenant-details-panel"
              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/15 bg-white/[0.04] text-gray-200 text-xs font-semibold hover:bg-white/[0.08] hover:text-white transition-colors light:bg-slate-100 light:border-slate-300 light:text-slate-700 light:hover:bg-slate-200"
            >
              <Layers size={13} aria-hidden="true" />
              <span>{detailsOpen ? 'Hide details' : 'Details'}</span>
            </button>
          </div>

          {/* The creator's published website, full-bleed and full-height: this is the page. */}
          <div className="w-full">
            {fullBleedCreatorSurface}
          </div>

          {/* Read-more affordance directly under the website, so a visitor who scrolls past
              the custom UI still finds the Covex facts without hunting in the top bar. */}
          {!detailsOpen && (
            <div className="max-w-7xl mx-auto px-4 sm:px-6 mt-6">
              <button
                type="button"
                onClick={() => setDetailsOpen(true)}
                aria-controls="covenant-details-panel"
                aria-expanded={false}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border border-white/[0.08] bg-white/[0.02] text-sm font-semibold text-gray-300 hover:text-white hover:bg-white/[0.04] transition-colors light:border-slate-200 light:bg-slate-50 light:text-slate-600 light:hover:text-slate-900"
              >
                <Layers size={15} aria-hidden="true" />
                Read more: covenant details, on-chain facts and how to interact
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Details / Covex chrome. Always rendered for non-custom covenants (it IS the
          content). For creator-UI covenants it lives inside the collapsible panel,
          collapsed by default, and is wrapped in the original page padding. ── */}
      <div
        id={hasCustomSurface ? 'covenant-details-panel' : undefined}
        hidden={hasCustomSurface && !detailsOpen}
        className={hasCustomSurface ? 'max-w-7xl mx-auto px-4 sm:px-6 xl:pr-[312px] pt-8' : ''}
      >
      {!hasCustomSurface && (
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-gray-300 hover:text-white transition-colors mb-4 font-mono text-sm uppercase tracking-wider"
        >
          <ArrowLeft size={16} /> Return to Registry
        </Link>
      )}

      {/* Enforcement reality leads the page so the honesty label is the first paint,
          before the title block. One full-width TrustBadge, sized md with description.
          A small primary Share pill sits inline beside it so visitors get an obvious
          share affordance without having to scroll to the buried header button. */}
      <div data-tour="public-page" className="mb-6 flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-0">
          <TrustBadge covenant={covenant} size="md" showDesc />
        </div>
        <button
          type="button"
          onClick={() => setShareOpen(true)}
          aria-label="Share this covenant"
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-kaspa-green/30 bg-kaspa-green/[0.08] text-kaspa-green text-xs font-semibold hover:bg-kaspa-green/[0.14] hover:border-kaspa-green/50 transition-colors light:bg-emerald-500/[0.10] light:border-emerald-500/40 light:text-emerald-700 light:hover:bg-emerald-500/[0.18]"
        >
          <Share2 size={13} aria-hidden="true" />
          <span>Share</span>
        </button>
      </div>

      {/* Creator-designed page (Puck blocks, platform components only): a full-width
          hero section that LEADS the page, so the covenant reads like a real website.
          Live on-chain figures flow in via metadata.live and blocks resolve {{tokens}}
          at render. No creator input ever sets a fund destination. Images are always
          the creator's own choice (https URLs); with none set, the blocks fall back to
          the branded gradient look. Suppressed when the page already leads with the
          full-bleed creator surface above (hasCustomSurface), so it never doubles up. */}
      {!hasCustomSurface && creatorSurface === 'puck' && (
        <div className="mb-10 rounded-3xl overflow-hidden border border-white/[0.06]">
          <Suspense fallback={<div className="min-h-[40vh]" aria-hidden="true" />}>
            <PuckSurface data={covenant.custom_ui_config.puck_data} liveData={liveData} />
          </Suspense>
        </div>
      )}

      {/* The full-width "Build / edit this site" banner was removed: the single creator
          entry point now lives next to the title row (Button variant='kaspa'). Visitors with
          no published page see a subtle honest note inviting them to interact directly. */}
      {!isCreator && !creatorSurface ? (
        <div className="mb-10 flex items-center gap-2.5 rounded-2xl border border-white/[0.06] light:border-slate-200 bg-white/[0.02] light:bg-slate-50 px-4 py-3 text-[12px] text-gray-400 light:text-slate-500">
          <LayoutTemplate size={15} className="shrink-0 text-gray-500 light:text-slate-600" />
          <span>The creator can design a full interactive page for this covenant in Covex Page Studio. Until then, you can interact with it directly below.</span>
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left: Covenant metadata */}
        <motion.div
          initial={prefersReduced ? false : { opacity: 0, x: -20 }}
          animate={prefersReduced ? false : { opacity: 1, x: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="glass-panel detail-hero-enhanced p-6 sm:p-8 rounded-3xl flex flex-col space-y-5 light:bg-white light:border light:border-slate-200 light:shadow-sm"
        >
          <div className="flex flex-wrap items-center gap-3 sm:gap-4 mb-6">
            <div className="relative shrink-0">
              <div className="covex-aurora" aria-hidden="true" style={{ top: -28, left: -28, width: 132, height: 116 }} />
              <div className="relative z-10 p-3 bg-kaspa-green/10 rounded-2xl border border-kaspa-green/30 text-kaspa-green light:bg-emerald-500/10 light:border-emerald-500/30 light:text-emerald-700">
                <Cpu size={32} />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-white tracking-tight leading-[1.1] break-words light:text-slate-900">
                {covenant.name || TRUNC(covenant.tx_id)}
              </h1>
              <div className="flex flex-wrap items-center gap-3 mt-2">
                {(() => {
                  const currentTier = (covenant.tier || covenant.verified_tier || 'FREE').toUpperCase();
                  const p = TIER_PALETTE[currentTier] || TIER_PALETTE.FREE;
                  return (
                    <span className={`px-3 py-1 rounded-full text-xs font-bold border uppercase tracking-widest ${p.bg} ${p.text} ${p.border} ${p.light} ${p.glow}`}>
                      {currentTier} TIER
                    </span>
                  );
                })()}
                <span className="text-sm text-gray-300 font-mono light:text-slate-600">{covenant.category || 'General'}</span>
              </div>
            </div>

            {/* Header actions, re-ordered: Build / edit primary (kaspa shimmer), Share
                secondary, Recover demoted to icon-only ghost. Two-row layout on mobile
                (the action group takes full width and wraps under the title block;
                auto-width on desktop so the row balances). */}
            <div className="w-full sm:w-auto sm:ml-auto flex flex-wrap items-center gap-2 sm:gap-3">
              {/* Single creator CTA next to the title: the one Build / edit this site
                  button that opens Page Studio. Primary action takes the kaspa variant
                  with the shimmer sweep so it reads as the page's main verb. */}
              {isCreator && (
                <Link
                  to={`/covenant/${encodeURIComponent(id)}/studio`}
                  className={`${buttonVariants({ variant: 'kaspa' })} btn-shimmer whitespace-nowrap`}
                >
                  <Layers size={16} /> Build / edit this site
                </Link>
              )}
              <Button
                variant="glass"
                onClick={() => setShareOpen(true)}
                className="whitespace-nowrap"
              >
                <Share2 size={16} className="text-kaspa-green light:text-emerald-700" /> Share
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setRecoveryOpen(true)}
                title="Recover this covenant without Covex (self-custody)"
                aria-label="Recover this covenant"
              >
                <LifeBuoy size={16} className="text-kaspa-green light:text-emerald-700" />
              </Button>
            </div>
          </div>

          {/* Page-level branding: the creator's chosen background preset (from the Puck
              page root) tints the whole covenant page, so the design carries beyond the
              custom section. Skipped when a custom background image is set below. The preset
              -> css map lives in the lazy puck chunk, so resolving it (and rendering nothing
              for an unknown preset) happens there; we only gate on a preset being set. */}
          {!covenant?.custom_ui_config?.theme?.background_image
            && covenant?.custom_ui_config?.puck_data?.root?.props?.backgroundPreset && (
            <Suspense fallback={null}>
              <PuckSurface
                mode="background"
                backgroundPresetKey={covenant.custom_ui_config.puck_data.root.props.backgroundPreset}
              />
            </Suspense>
          )}

          {/* Creator-set background image behind the covenant page, dimmed for readability */}
          {(covenant?.custom_ui_config?.theme?.background_image || covenant?.custom_ui_config?.theme?.backdrop_css) && (
            <div className="fixed inset-0 -z-10 pointer-events-none">
              {covenant.custom_ui_config.theme.background_image ? (
                <>
                  <div
                    className="absolute inset-0 bg-cover bg-center"
                    style={{ backgroundImage: `url(${covenant.custom_ui_config.theme.background_image})` }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-b from-[#05050A]/80 via-[#05050A]/70 to-[#05050A]/95" />
                </>
              ) : (
                <div className="absolute inset-0" style={{ background: covenant.custom_ui_config.theme.backdrop_css }} />
              )}
            </div>
          )}

          {/* Reorg honesty banner: a covenant whose funding tx left the selected chain before
              finality is hidden from the explorer; anyone reaching it by direct link must be
              told the truth rather than shown a "live" page. */}
          {covenant && covenant.reorged && (
            <div className="mb-6 px-5 py-4 rounded-xl bg-amber-500/[0.07] border border-amber-500/30 flex items-start gap-3">
              <Clock size={20} className="text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-300 light:text-amber-600">FUNDING TX REORGANIZED OUT</p>
                <p className="text-xs text-amber-300/70 light:text-amber-600/80">
                  This covenant's funding transaction was reorganized out of the selected chain before reaching finality and is not currently confirmed. It is hidden from the explorer and will reappear automatically if the chain re-includes it.
                </p>
              </div>
            </div>
          )}

          {/* Lifecycle timeline + resolution trust: always visible, never hideable */}
          {covenant && (
            <div className="py-5">
              <Separator className="mb-5 light:bg-slate-200" />
              <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 light:text-slate-500">Covenant Lifecycle</p>
                <div className="flex items-center gap-2">
                  {/* Honest finality chip from the backend (derived against the live node tip). */}
                  {covenant.finality === 'final' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 light:text-emerald-600" title="Buried past the finality depth: consensus-irreversible.">
                      <BadgeCheck size={11} />Final
                    </span>
                  )}
                  {covenant.finality === 'confirming' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-300 light:text-amber-600" title="On-chain and confirming. Reversible until the finality depth.">
                      <Clock size={11} />Confirming{covenant.finality_eta_secs ? ` · ~${Math.max(1, Math.round(covenant.finality_eta_secs / 60))}m` : ''}
                    </span>
                  )}
                  {covenant.finality === 'pending' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-white/[0.05] border border-white/15 text-gray-300 light:text-slate-500" title="Funding tx seen but no on-chain confirmation depth yet.">
                      <Clock size={11} />Pending
                    </span>
                  )}
                  {/* The full enforcement-reality TrustBadge leads the page above the
                      grid; the duplicate chip that used to sit here was removed so the
                      lifecycle row carries finality only, not a second reality cue. */}
                </div>
              </div>
              {/* All four stages flex to fit at any width: no horizontal slider. Stages are
                  equal-width flex-1 columns (text wraps) with thin connectors between them. */}
              <div className="flex items-start gap-0">
                {[
                  { label: 'Deployed', done: true, sub: covenant.timestamp ? new Date(covenant.timestamp * 1000).toLocaleDateString() : `DAA ${covenant.block_daa_score || 0}` },
                  { label: 'Indexed', done: true, sub: networkLabel(covenant.network) },
                  { label: covenant.verified_tier !== 'FREE' ? `Verified ${covenant.verified_tier}` : 'Unverified', done: covenant.verified_tier !== 'FREE', sub: covenant.verified_tier !== 'FREE' ? 'on-chain payment' : 'free tier' },
                  (covenant.spent_tx_id || covenant.is_active === false)
                    ? { label: 'Settled', done: true, sub: covenant.spent_tx_id ? 'spent on-chain' : 'funds distributed' }
                    : { label: 'Active', done: true, sub: `${covenant.amount_kaspa || 0} KAS locked` },
                ].map((st, i, arr) => (
                  <Fragment key={st.label}>
                    <div className="flex flex-col items-center text-center flex-1 min-w-0 px-0.5">
                      <div className={`w-3 h-3 rounded-full mb-1.5 shrink-0 ${st.done ? 'bg-kaspa-green shadow-[0_0_8px_rgba(73,234,203,0.6)]' : 'bg-white/15 border border-white/20 light:bg-slate-200 light:border-slate-300'}`} />
                      <span className={`text-[11px] font-semibold leading-tight ${st.done ? 'text-white light:text-slate-900' : 'text-gray-500 light:text-slate-600'}`}>{st.label}</span>
                      <span className="text-[9px] text-gray-500 light:text-slate-600 font-mono leading-tight break-words mt-0.5">{st.sub}</span>
                    </div>
                    {i < arr.length - 1 && (
                      <div className={`relative h-px flex-none w-3 sm:w-10 mt-1.5 overflow-hidden ${st.done ? 'bg-kaspa-green/15' : 'bg-white/10'}`}>
                        {st.done && <div className="absolute inset-y-0 left-0 bg-kaspa-green/60 timeline-fill" style={{ animationDelay: `${i * 180}ms` }} />}
                      </div>
                    )}
                  </Fragment>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t border-white/[0.05] flex items-center justify-between flex-wrap gap-2 text-[11px] font-mono">
                <Link to={`/address/${encodeURIComponent(displayCreatorAddr(covenant))}`} className="text-gray-400 light:text-slate-600 hover:text-kaspa-green light:hover:text-kaspa-green transition-colors">
                  Creator portfolio: {(displayCreatorAddr(covenant) || '').slice(0, 22)}...
                </Link>
                <span className="text-gray-500 light:text-slate-600">Network: {networkLabel(covenant.network)}</span>
              </div>
            </div>
          )}

          {/* The creator-designed page is hoisted to a full-width hero section at the top
              of the page (see above the metadata grid), so it leads and has room. */}

          {/* On-chain activity history: everything the indexers have seen for this covenant */}
          {actions.length > 0 && (
            <div className="py-5">
              <Separator className="mb-5 light:bg-slate-200" />
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 light:text-slate-500 mb-3">Activity History</p>
              <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                {actions.slice().reverse().map((a, i) => {
                  const LABELS = {
                    deployed: { t: 'Deployed on-chain', c: 'text-kaspa-green' },
                    covenant_discovered: { t: 'Indexed by crawler', c: 'text-kaspa-green' },
                    tier_verified: { t: 'Tier verified', c: 'text-amber-300' },
                    tier_upgraded: { t: 'Tier payment confirmed', c: 'text-amber-300' },
                    resolution_signed: { t: 'Outcome resolved by resolver', c: 'text-purple-300' },
                    game_update: { t: 'Match update', c: 'text-sky-300' },
                    game_move: { t: 'Move played', c: 'text-sky-300' },
                  };
                  const l = LABELS[a.action] || { t: a.action, c: 'text-gray-300' };
                  return (
                    <div key={i} className="flex items-center justify-between gap-2 sm:gap-3 text-[11px] font-mono">
                      <span className={`font-bold ${l.c} shrink-0`}>{l.t}</span>
                      <span className="text-gray-500 light:text-slate-600 truncate flex-1 min-w-0">{a.detail}</span>
                      {a.amount_kaspa > 0 && <span className="text-white light:text-slate-900 shrink-0">{a.amount_kaspa} KAS</span>}
                      <span className="text-gray-600 light:text-slate-500 shrink-0 hidden sm:inline">{a.timestamp ? new Date(a.timestamp * 1000).toLocaleString() : ''}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Trust banner - honest about what actually backs the covenant. ON-CHAIN
              enforcement is the STRONGEST guarantee (Kaspa consensus), so a script-enforced
              covenant gets a positive banner even when the creator never paid for the
              "verified tier" (a separate disclosure feature). Only metadata-only covenants -
              which the chain does NOT enforce - get the caution banner. */}
          <div className="py-5">
            <Separator className="mb-5 light:bg-slate-200" />
            {isChess || verified ? (
              <div className="px-5 py-4 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/25 flex items-center gap-3">
                <BadgeCheck size={20} className="text-emerald-400 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-emerald-400">
                    {isChess ? 'FULLY TRANSPARENT CHESS COVENANT' : `VERIFIED COVENANT (${covenant.verified_tier} tier)`}
                  </p>
                  <p className="text-xs text-emerald-400/70">
                    {isChess ? 'All receiving addresses, fees, timers, the disclosed resolver, and full game logic are public by default. No hidden settings.' : 'All receiving addresses, covenant logic, parameters, and on-chain facts are public by default.'}
                  </p>
                </div>
              </div>
            ) : isMarketLeg ? (
              <div className="px-5 py-4 rounded-xl bg-sky-500/[0.06] border border-sky-500/25 flex items-center gap-3">
                <ShieldCheck size={20} className="text-sky-400 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-sky-400">ON-CHAIN CUSTODY, ORACLE-RESOLVED</p>
                  <p className="text-xs text-sky-400/80">
                    This is one leg of a parimutuel market. Custody and every payout are script-locked on-chain (P2SH, hashlock + winner key), but which outcome wins is decided by the secret a deployer-bound external resolver reveals (an external oracle provider bound by pubkey at deploy; Covex never attests real-world facts). On-chain-enforced, not trustless: you trust the deployer-named resolver to reveal the secret for the true result.
                  </p>
                </div>
              </div>
            ) : covenant?.enforcement_reality === 'on-chain' && !isMarketLeg ? (
              <div className="px-5 py-4 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/25 flex items-center gap-3 zk-live-glow">
                <ShieldCheck size={20} className="text-emerald-400 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-emerald-400">ON-CHAIN ENFORCED</p>
                  <p className="text-xs text-emerald-400/70">
                    Kaspa consensus enforces this covenant, the strongest guarantee. Funds lock to a script hash and move only by satisfying it, with no oracle and no trust in Covex. (The paid "verified tier" only adds extra creator-published disclosure; it is separate from enforcement.)
                  </p>
                </div>
              </div>
            ) : (
              <div className="px-5 py-4 rounded-xl bg-amber-500/[0.06] border border-amber-500/25 flex items-center gap-3">
                <AlertTriangle size={20} className="text-amber-400 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-amber-400">Metadata only, not consensus-enforced</p>
                  <p className="text-xs text-amber-400/80">
                    The chain records this covenant but does not enforce its stated logic, and disclosure is limited to tx_id, script_hash, and amount. Review the on-chain facts and the creator before sending funds.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* On-chain lock + verification, always visible on the page body (no modal needed):
              full script_hex, P2SH structural verdict (aa20...87), redeem_script_hex, the Groth16
              vkey link, and the oracle x-only pubkey. Same honest disclosure as TransparencyModal. */}
          {covenant && <OnChainLockSection covenant={covenant} />}

          {/* PUBLIC ZK prove + claim panel (Phase 4a): for ANY visitor, on ANY covenant whose
              circuit is genuinely in VERIFIED_FULL_ZK. Generates a real Groth16 proof in-browser
              bound to this covenant_id (H4), shows the public signals, and submits to the disclosed
              oracle (/api/oracle/verify-and-sign) which verifies off-chain fail-closed and co-signs
              only a valid proof. Self-guards: renders nothing for non-full-zk circuits. Replaces the
              old creator-only lock. Honest copy: oracle-verified off-chain, never trustless. */}
          {covenant && <ZkClaimPanel covenant={covenant} />}

          {/* Always-visible honest limits for EVERY covenant kind (no click, no modal):
              primitive, oracle/zk, and every game arena (chess + the rest) flow through this
              body. Games get the server-authoritative + oracle-attested (not ZK) copy; the
              prediction-market path renders its own HonestLimits in MarketDetail. */}
          {covenant && <HonestLimits covenant={covenant} kind={gameType ? 'game' : isMarketLeg ? 'market' : undefined} />}

          <div className="bg-black/40 p-6 rounded-2xl border border-white/5 mb-6 light:bg-slate-50 light:border-slate-200">
            <h3 className="text-xs font-mono text-gray-300 mb-3 uppercase tracking-widest light:text-slate-600">
              {isChess ? 'CHESS COVENANT RULES (FULLY TRANSPARENT)' : (verified ? 'Covenant Logic Summary (Full Disclosure)' : 'Protocol Description (Limited)')}
            </h3>
            <p className="text-gray-300 leading-relaxed light:text-slate-700">
              {isChess 
                ? 'This is a 10 minute chess covenant where the full stake goes to the winner. Players stake equal amounts. The second player must match the stake within 5 minutes or the funds return automatically. Each player has a 10 minute clock that only runs during their turn. Games conclude by resign, timeout or checkmate. The winner receives the full staked amount minus 2 percent. The 2 percent fee is sent to the creator address to sustain the service. All stakes are sent directly to the covenant address on the Kaspa blockchain. Custody is on-chain (P2SH locked, your wallet signs every spend). The game runs on a server-authoritative engine that replays the signed move log deterministically (anyone can recompute), and settlement is simulated today, with the recomputable Covex engine co-signing the release alongside the winning player (BIP340 Schnorr): payout is on-chain enforced but not trustless. There is no zero knowledge proof of individual moves. All stakes, addresses and the final result are transparent and recorded on chain.'
                : (verified
                ? (covenant.description || covenant.desc || 'Verified covenant. Full disclosure enabled.')
                : 'Limited information available. Only tx_id, script_hash, and amount are disclosed.')}
            </p>
          </div>

          {/* Always-visible full transparency: receiving addresses + logic (public on default) */}
          <div className="py-5">
            <Separator className="mb-5 light:bg-slate-200" />
            <div className="text-xs font-mono text-gray-300 mb-2 uppercase tracking-widest light:text-slate-600">Receiving Addresses (all flows public)</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-4 bg-white/[0.02] border border-white/5 rounded-xl light:bg-slate-50 light:border-slate-200">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-gray-400 light:text-slate-500">Covenant Address</div>
                  {(covenant.address || covenant.receiving_addresses) && (
                    <CopyButton value={covenant.address || covenant.receiving_addresses} label="Copy covenant address" size={12} stopPropagation={false} />
                  )}
                </div>
                {covenant.address ? (
                  <Link to={`/address/${encodeURIComponent(covenant.address)}`} className="font-mono text-white break-all mt-0.5 light:text-slate-900 hover:text-kaspa-green light:hover:text-emerald-700 transition-colors block">{covenant.address}</Link>
                ) : (
                  <div className="font-mono text-white break-all mt-0.5 light:text-slate-900">{covenant.receiving_addresses || 'On-chain covenant address'}</div>
                )}
              </div>
              {covenant.fee_recipient ? (
                <div className="p-4 bg-white/[0.02] border border-white/5 rounded-xl light:bg-slate-50 light:border-slate-200">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-gray-400 light:text-slate-500">Fee Recipient</div>
                    <CopyButton value={covenant.fee_recipient} label="Copy fee recipient" size={12} stopPropagation={false} />
                  </div>
                  <div className="font-mono text-white break-all mt-0.5 light:text-slate-900">{covenant.fee_recipient}</div>
                </div>
              ) : null}
              <div className="p-4 bg-white/[0.02] border border-white/5 rounded-xl light:bg-slate-50 light:border-slate-200">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-gray-400 light:text-slate-500">Creator Address (fee cut / sustain)</div>
                  {covenant.creator_addr && (
                    <CopyButton value={covenant.creator_addr} label="Copy creator address" size={12} stopPropagation={false} />
                  )}
                </div>
                {covenant.creator_addr ? (
                  <Link to={`/address/${encodeURIComponent(covenant.creator_addr)}`} className="font-mono text-white break-all mt-0.5 light:text-slate-900 hover:text-kaspa-green light:hover:text-emerald-700 transition-colors block">{covenant.creator_addr}</Link>
                ) : (
                  <div className="font-mono text-white break-all mt-0.5 light:text-slate-900">See covenant deployer</div>
                )}
              </div>
              <div className="p-4 bg-white/[0.02] border border-white/5 rounded-xl light:bg-slate-50 light:border-slate-200">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-gray-400 light:text-slate-500">TX / Script</div>
                  {covenant.tx_id && <CopyButton value={covenant.tx_id} label="Copy txid" size={12} stopPropagation={false} />}
                </div>
                <div className="font-mono text-white break-all mt-0.5 text-[10px] light:text-slate-900">{covenant.tx_id} / {covenant.script_hash || 'on-chain'}</div>
              </div>
            </div>
          </div>

          <div className="mb-6">
            <div className="text-xs font-mono text-gray-300 mb-2 uppercase tracking-widest">Full Game / Event / Covenant Logic (public by default)</div>
            <div className="text-sm text-gray-200 bg-black/30 p-4 rounded-xl border border-white/5 leading-relaxed">
              {isChess ? (
                <>
                  <strong>Game:</strong> 10min per player chess, full stake to the winner (FIDE rules).<br/>
                  <strong>Stake:</strong> Any equal amount (min/max per config). Second player matches or auto-refund in 5 min.<br/>
                  <strong>Timers:</strong> 10 min clock per player (active player only). Resign, timeout, or checkmate ends the game.<br/>
                  <strong>Payout:</strong> Winner receives the full staked amount minus 2% fee (fee to creator address to sustain the service).<br/>
                  <strong>Verification:</strong> Server-authoritative engine (validates legal moves and terminal conditions, replaying the signed move log so anyone can recompute); settlement is simulated today, with the release co-signed (BIP340 Schnorr) by the recomputable Covex engine alongside the winning player, not trustless. No zero-knowledge proof of moves.<br/>
                  <strong>Non-custodial:</strong> Custody on-chain, payout gated by a 2-of-2 cosign + CSV timeout via the recomputable Covex engine's simulated BIP340 co-signature (resolver-attested, not trustless).
                </>
              ) : (
                covenant.full_logic_summary || covenant.description || 'All parameters, fees, resolution method, circuits, oracles, and payout rules are fully disclosed on-chain and in the published view.'
              )}
            </div>
          </div>

          {/* Details grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-auto">
            {[
              ['Covenant Type', covenant.covenant_type || 'Unknown'],
              ['Script Hash', (covenant.script_hash || '').slice(0, 20) + '...'],
              ['Locked KAS', `${(covenant.amount_kaspa || 0).toLocaleString()} KAS`],
              ['Category', covenant.category || 'General'],
            ].map(([label, value]) => (
              <div key={label} className="p-3 rounded-xl bg-white/[0.02] border border-white/5">
                <p className="text-xs text-gray-300 mb-1">{label}</p>
                <p className="text-sm font-mono text-white truncate">{value}</p>
              </div>
            ))}
          </div>

          {/* TXID */}
          <div className="mt-4 p-3 rounded-xl bg-black/30 border border-white/5 light:bg-slate-50 light:border-slate-200">
            <div className="flex items-center justify-between gap-2 mb-1">
              <p className="text-xs text-gray-300 light:text-slate-500">TXID</p>
              {covenant.tx_id && <CopyButton value={covenant.tx_id} label="Copy txid" size={12} stopPropagation={false} />}
            </div>
            <p className="text-xs font-mono text-kaspa-green break-all">{covenant.tx_id}</p>
          </div>

        </motion.div>

        {/* Right: Tabs - Arena / Play (default, public, pro chess.com style for chess) | Fix (creator only, super clean garage + 1 stake section) | Terminal (creator advanced only) */}
        <motion.div
          initial={prefersReduced ? false : { opacity: 0, x: 20 }}
          animate={prefersReduced ? false : { opacity: 1, x: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="glass-panel rounded-3xl overflow-hidden flex flex-col light:bg-white light:border light:border-slate-200 light:shadow-sm"
        >
          {/* a11y: tablist with arrow-key / Home / End navigation + wrap-around. Visible tabs depend on isCreator. */}
          {(() => {
            const visibleTabs = ['interact', ...(isCreator ? ['fix', 'terminal'] : [])];
            const onTabKeyDown = (e) => {
              const idx = visibleTabs.indexOf(activeTab);
              if (idx === -1) return;
              let nextIdx = null;
              if (e.key === 'ArrowRight') nextIdx = (idx + 1) % visibleTabs.length;
              else if (e.key === 'ArrowLeft') nextIdx = (idx - 1 + visibleTabs.length) % visibleTabs.length;
              else if (e.key === 'Home') nextIdx = 0;
              else if (e.key === 'End') nextIdx = visibleTabs.length - 1;
              if (nextIdx === null) return;
              e.preventDefault();
              const nextId = visibleTabs[nextIdx];
              setActiveTab(nextId);
              const next = e.currentTarget.parentElement?.querySelector(`[data-tab-id="${nextId}"]`);
              if (next) next.focus();
            };
            return (
          <div role="tablist" aria-label="Covenant tabs" className="flex items-center border-b border-white/5 light:border-slate-200">
            <button
              role="tab"
              data-tab-id="interact"
              aria-selected={activeTab === 'interact'}
              tabIndex={activeTab === 'interact' ? 0 : -1}
              onKeyDown={onTabKeyDown}
              onClick={() => setActiveTab('interact')}
              className={`flex-1 px-4 py-3.5 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                activeTab === 'interact'
                  ? 'text-kaspa-green bg-kaspa-green/[0.04] border-b-2 border-kaspa-green light:text-emerald-700 light:bg-emerald-500/[0.06] light:border-emerald-600'
                  : 'text-gray-300 hover:text-gray-300 light:text-slate-500 light:hover:text-slate-700'
              }`}
            >
              <Terminal size={14} />
              {gameType ? 'Arena / Play' : 'Interact'}
            </button>
            {/* Fix tab visible to creator only. Renders full clean Customization Garage + exactly 1 section for stake amount + rules + Publish. No paid nags. */}
            {isCreator && (
              <button
                role="tab"
                data-tab-id="fix"
                aria-selected={activeTab === 'fix'}
                tabIndex={activeTab === 'fix' ? 0 : -1}
                onKeyDown={onTabKeyDown}
                onClick={() => setActiveTab('fix')}
                className={`flex-1 px-4 py-3.5 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                  activeTab === 'fix'
                    ? 'text-kaspa-green bg-kaspa-green/[0.04] border-b-2 border-kaspa-green light:text-emerald-700 light:bg-emerald-500/[0.06] light:border-emerald-600'
                    : 'text-gray-300 hover:text-gray-300 light:text-slate-500 light:hover:text-slate-700'
                }`}
              >
                <Palette size={14} />
                Fix
              </button>
            )}
            {/* Terminal ONLY for creator. Regular users never see terminal or settings. */}
            {isCreator && (
              <button
                role="tab"
                data-tab-id="terminal"
                aria-selected={activeTab === 'terminal'}
                tabIndex={activeTab === 'terminal' ? 0 : -1}
                onKeyDown={onTabKeyDown}
                onClick={() => setActiveTab('terminal')}
                className={`flex-1 px-4 py-3.5 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                  activeTab === 'terminal'
                    ? 'text-kaspa-green bg-kaspa-green/[0.06] border-b-2 border-kaspa-green light:text-emerald-700 light:bg-emerald-500/[0.06] light:border-emerald-600'
                    : 'text-gray-300 hover:text-gray-300 light:text-slate-500 light:hover:text-slate-700'
                }`}
              >
                <Code2 size={14} />
                Terminal
              </button>
            )}
          </div>
            );
          })()}

          <div className="p-6 sm:p-7 flex-1">
            {activeTab === 'interact' ? (
              <div className="space-y-8">

                {/* SIMPLE FULL CHESS LOBBY: one chess.com board filling space, one timer, one rules table, one stake input. Easy and straightforward. */}
                {isChess && (
                  <div className="flex flex-col items-center justify-center py-4">
                    <div className="text-center mb-4">
                      <div className="text-emerald-400 text-sm tracking-[3px] font-bold">10 MIN STAKED CHESS COVENANT</div>
                      <div className="text-3xl font-semibold text-white mt-1">Full Screen Chess</div>
                    </div>

                    {/* Timers + board side by side to fill space like full screen */}
                    <div className="flex flex-col lg:flex-row gap-6 items-start w-full max-w-[1100px]">
                      {/* Large board fills main space */}
                      <div className="flex-1">
                        <Chessboard
                          position="start"
                          boardWidth={Math.min(580, (typeof window !== 'undefined' ? window.innerWidth : 580) - 48)}
                          customDarkSquareStyle={{ backgroundColor: chessLook.board.dark }}
                          customLightSquareStyle={{ backgroundColor: chessLook.board.light }}
                          customBoardStyle={{ borderRadius: '6px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}
                          customNotationStyle={{ color: '#3f2a1d', fontSize: '14px', fontWeight: 600 }}
                        />
                      </div>

                      {/* Timers and rules table on side, filling space */}
                      <div className="w-full lg:w-80 flex-shrink-0">
                        {/* Timers */}
                        <div className="flex gap-4 mb-4">
                          <div className="flex-1 text-center p-3 rounded-2xl bg-black/60 border border-emerald-500/30">
                            <div className="text-xs text-gray-400">WHITE</div>
                            <div className="font-mono text-4xl text-emerald-400">10:00</div>
                          </div>
                          <div className="flex-1 text-center p-3 rounded-2xl bg-black/60 border border-emerald-500/30">
                            <div className="text-xs text-gray-400">BLACK</div>
                            <div className="font-mono text-4xl text-emerald-400">10:00</div>
                          </div>
                        </div>

                        {/* Rules table filling the side space */}
                        <div>
                          <div className="text-xs font-bold text-emerald-400 mb-1 tracking-widest">RULES</div>
                          <table className="w-full text-xs border border-emerald-500/30 light:border-emerald-500/40 rounded-xl overflow-hidden bg-black/40 text-emerald-100 light:text-slate-700">
                            <tbody>
                              <tr className="border-b border-emerald-500/20"><td className="p-2 font-semibold">Game</td><td className="p-2">10 min per player (clock only on your turn)</td></tr>
                              <tr className="border-b border-emerald-500/20"><td className="p-2 font-semibold">Stake</td><td className="p-2">Any amount. Match exactly or auto return in 5 min</td></tr>
                              <tr className="border-b border-emerald-500/20"><td className="p-2 font-semibold">End</td><td className="p-2">Resign, timeout or checkmate</td></tr>
                              <tr className="border-b border-emerald-500/20"><td className="p-2 font-semibold">Payout</td><td className="p-2">Winner gets the staked amount minus 2% to creator</td></tr>
                              <tr><td className="p-2 font-semibold">Verify</td><td className="p-2">Server-authoritative engine, outcome resolver-attested (BIP340 Schnorr)</td></tr>
                            </tbody>
                          </table>
                          {/* Honesty palette: custody IS on-chain (emerald), but the outcome is
                              resolver-attested, not chain-enforced - so that half must NOT read as
                              on-chain. Splitting the colors keeps the chip from overclaiming the way
                              a single emerald "Custody on-chain · Outcome resolver-attested" string did. */}
                          <div className="text-[11px] mt-1 text-center">
                            <span className="text-emerald-300/80 light:text-emerald-700">Transparent · Custody on-chain</span>
                            <span className="text-gray-500 light:text-slate-400"> · </span>
                            <span className="text-amber-300/90 light:text-amber-700">Outcome resolver-attested</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Single stake control at bottom: create (free stake) or join (match the pot). */}
                    <div className="mt-6 flex flex-col items-center">
                      <GameStakeControl
                        gameLabel="chess"
                        stake={chessStake}
                        setStake={setChessStake}
                        joinPot={joinPot}
                        walletConnected={!!address}
                        onConnect={() => setWalletModalOpen(true)}
                        onStake={() => setShowChessArena(true)}
                      />
                      <div className="text-center text-[11px] text-gray-400 mt-3 light:text-slate-600 max-w-md">Launches the full interactive board with real timers, moves, resign; result replayed deterministically, the recomputable Covex engine co-signs (simulated, not trustless).</div>
                    </div>
                  </div>
                )}

                {/* Generic game lobby for every non-chess game covenant (poker, reversi, connect4, ...). */}
                {isOtherGame && (
                  <div className="flex flex-col items-center justify-center py-6">
                    <div className="text-center mb-5">
                      <div className="text-kaspa-green text-sm tracking-[3px] font-bold light:text-emerald-700">STAKED {GAME_REGISTRY[gameType].label.toUpperCase()} COVENANT</div>
                      <div className="text-3xl font-semibold text-white mt-1 light:text-slate-900">{GAME_REGISTRY[gameType].label}</div>
                      <p className="text-sm text-gray-400 mt-2 max-w-md mx-auto leading-relaxed light:text-slate-600">
                        Stake KAS and play a real {GAME_REGISTRY[gameType].label} match. Server-authoritative engine replays the signed move log (anyone can recompute); settlement is simulated today, with the recomputable Covex engine co-signing the release (not trustless), and the winning party receives the staked amount minus the creator fee. Non-custodial: stakes go directly to the covenant on Kaspa.
                      </p>
                    </div>
                    <div className="flex flex-col items-center">
                      <GameStakeControl
                        gameLabel={GAME_REGISTRY[gameType].label}
                        stake={chessStake}
                        setStake={setChessStake}
                        joinPot={joinPot}
                        walletConnected={!!address}
                        onConnect={() => setWalletModalOpen(true)}
                        onStake={() => setShowGameArena(true)}
                      />
                      <div className="text-center text-[11px] text-gray-400 mt-3 light:text-slate-600 max-w-md">Launches the full interactive board with real moves; result replayed deterministically, the recomputable Covex engine co-signs (simulated, not trustless).</div>
                    </div>
                  </div>
                )}

                {/* Create-your-own entry point: a game is a covenant you deploy. Routes into
                    the build flow with the game category pre-selected. Shown on every game
                    lobby (chess + the rest) so a visitor can go from playing to creating. */}
                {gameType && (
                  <div className="mt-6 mx-auto max-w-md text-center rounded-2xl border border-white/10 light:border-slate-300 bg-white/[0.03] light:bg-white px-5 py-4">
                    <div className="text-sm font-bold text-white light:text-slate-900">Want your own table?</div>
                    <p className="text-[11px] text-gray-300 light:text-slate-600 mt-1 leading-snug">
                      Games are covenants you deploy. Pick a game, set the stake, share the link - your opponent joins by matching it.
                    </p>
                    <Link
                      to="/sandbox?category=game"
                      className="inline-flex items-center justify-center gap-2 mt-3 px-5 py-2.5 rounded-xl border border-kaspa-green/40 bg-kaspa-green/10 hover:bg-kaspa-green/15 text-kaspa-green light:text-emerald-700 font-bold text-sm transition-colors"
                    >
                      Create a game covenant
                    </Link>
                  </div>
                )}

                {/* Custom UI iframe ONLY for a genuine creator-published UI. Auto-generated
                    blobs are skipped so the clean native panel below speaks for the covenant.
                    Suppressed when a Puck surface already leads the page, so only one creator
                    surface ever renders. */}
                {creatorSurface === 'iframe' && !isCreator && !isChess && (
                  <div className="mb-4">
                    <div className="text-xs uppercase tracking-widest text-kaspa-green/80 mb-1">Creator-Published Custom Interface</div>
                    <div className="rounded-2xl overflow-hidden border border-kaspa-green/20 bg-black/60">
                      <iframe srcDoc={covenant.custom_ui_html} title="Covenant Custom Transparent UI" className="w-full min-h-[520px] bg-[#0A0A0D]" sandbox="allow-scripts" />
                    </div>
                  </div>
                )}

                {/* General Amount to Lock + execute ONLY for covenants that have NO
                    dedicated game arena (chess, etc.). Any game with its own stake CTA
                    already collected the amount above, so we never show a second stake
                    input. */}
                {!gameType && (
                  <>
                    {covenant.spent_tx_id ? (
                      <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <Check size={16} className="text-gray-300" />
                          <span className="text-sm font-bold text-white">Redeemed</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.06] text-gray-300 border border-white/10 font-mono uppercase">settled</span>
                        </div>
                        <p className="text-xs text-gray-400 mb-3 leading-relaxed">
                          This covenant has already been spent on-chain. The funds have moved and there is nothing left to redeem here.
                        </p>
                        <a
                          href={explorerTxUrl(covenant.spent_tx_id, covenant.network)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.06] border border-white/10 text-gray-200 text-sm font-bold hover:bg-white/[0.10] transition-colors"
                        >
                          <ExternalLink size={16} /> View the spend transaction
                        </a>
                      </div>
                    ) : covenant.redeem_kind && covenant.redeem_script_hex && covenant.spendable !== false && (() => {
                      const redeemKindBase = String(covenant.redeem_kind).split(':')[0];
                      const localSignable = isLocallySignableRedeem(covenant.redeem_kind);
                      return (
                        <div className="p-4 rounded-2xl bg-purple-500/[0.06] border border-purple-500/25">
                          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                            <ShieldCheck size={16} className="text-purple-300" />
                            <span className="text-sm font-bold text-white">{localSignable ? 'Redeem this covenant' : 'Recover this covenant'}</span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 font-mono uppercase">{redeemKindBase}</span>
                          </div>
                          <p className="text-xs text-gray-300 mb-3 leading-relaxed">
                            {localSignable
                              ? 'This is a script-enforced P2SH covenant. Spend it non-custodially with your own key. You provide the unlock condition (preimage / timelock / cosigners) on the next step. Covex never holds the funds.'
                              : 'This is a script-enforced P2SH covenant whose spend path needs the original redeem script (and, for oracle kinds, the deployer-bound resolver co-signature). Use the recovery flow to rebuild and broadcast the spend yourself. Covex never holds the funds.'}
                          </p>
                          {localSignable ? (
                            <Link
                              to="/deploy/enforced"
                              onClick={() => {
                                const parts = String(covenant.tx_id || '').split(':');
                                sessionStorage.setItem('redeem_covenant', JSON.stringify({
                                  redeem_script_hex: covenant.redeem_script_hex,
                                  tx: parts[0],
                                  outpoint: parts[1] || '0',
                                  kind: covenant.redeem_kind,
                                }));
                              }}
                              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-500/15 border border-purple-500/40 text-purple-200 text-sm font-bold hover:bg-purple-500/25 transition-colors"
                            >
                              <ShieldCheck size={16} /> Redeem non-custodially with my key
                            </Link>
                          ) : (
                            <Link
                              to={`/recover?id=${encodeURIComponent(id)}`}
                              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-500/15 border border-purple-500/40 text-purple-200 text-sm font-bold hover:bg-purple-500/25 transition-colors"
                            >
                              <LifeBuoy size={16} /> Recover with the redeem script
                            </Link>
                          )}
                        </div>
                      );
                    })()}
                    {!covenant.redeem_kind && (covenant.script_hex || '').startsWith('aa20') && (
                      <div className="rounded-2xl bg-blue-500/[0.05] border border-blue-500/25 overflow-hidden">
                        <button onClick={() => setClaimOpen(o => !o)} className="w-full flex items-center justify-between gap-2 p-4 text-left">
                          <div className="flex items-center gap-2">
                            <BadgeCheck size={16} className="text-blue-300" />
                            <span className="text-sm font-bold text-white">Claim &amp; activate this covenant</span>
                          </div>
                          <span className="text-[10px] text-blue-300/70 font-mono">{claimOpen ? 'hide' : 'is this yours?'}</span>
                        </button>
                        {claimOpen && (
                          <div className="px-4 pb-4 space-y-3">
                            <p className="text-xs text-gray-300 leading-relaxed">
                              This covenant was created elsewhere, so its logic is opaque on-chain. If you have its <strong>redeem script</strong>, paste it below. Covex verifies it hashes to this exact on-chain commitment (so only someone who genuinely knows the script can do this), then it becomes fully redeemable and richly displayed for everyone. The hash check is trustless; enforcement reality afterwards depends on kind: merkle_membership, age_verification, escrow_2party, and range_proof verify on-chain end-to-end, while oracle_escrow and oracle_enforced remain resolver-attested, gated by a deployer-bound resolver's BIP340 co-signature.
                            </p>
                            <textarea value={claimForm.redeem_script_hex} onChange={e => setClaimForm(f => ({ ...f, redeem_script_hex: e.target.value }))} placeholder="Redeem script (hex)" rows={3} className="w-full text-xs font-mono bg-black/50 border border-white/10 rounded-xl px-3 py-2 focus:border-blue-400/50 outline-none" spellCheck={false} />
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <select value={claimForm.kind} onChange={e => setClaimForm(f => ({ ...f, kind: e.target.value }))} className="text-sm bg-black/50 border border-white/10 rounded-xl px-3 py-2 outline-none focus:border-blue-400/50">
                                {['singlesig','hashlock','timelock','multisig','htlc','channel','oracle_escrow','oracle_enforced'].map(k => <option key={k} value={k} className="bg-[#0c0c12]">{k}</option>)}
                              </select>
                              <input value={claimForm.name} onChange={e => setClaimForm(f => ({ ...f, name: e.target.value }))} placeholder="Name (optional)" className="text-sm bg-black/50 border border-white/10 rounded-xl px-3 py-2 outline-none focus:border-blue-400/50" />
                            </div>
                            <input value={claimForm.description} onChange={e => setClaimForm(f => ({ ...f, description: e.target.value }))} placeholder="Description (optional)" className="w-full text-sm bg-black/50 border border-white/10 rounded-xl px-3 py-2 outline-none focus:border-blue-400/50" />
                            <button onClick={submitClaim} disabled={claimBusy} className="w-full py-2.5 rounded-xl bg-blue-500 text-white text-sm font-bold hover:bg-blue-400 transition-colors disabled:opacity-60">
                              {claimBusy ? 'Verifying on-chain…' : 'Verify & activate'}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    {covenant.enforcement_reality === 'decorative' && !covenant.redeem_kind && (
                      <div className="p-3 rounded-xl bg-amber-500/[0.06] light:bg-amber-50 border border-amber-500/25 light:border-amber-500/40 text-xs text-amber-200/90 light:text-amber-800 leading-relaxed">
                        <strong>Heads up:</strong> this covenant is metadata-only (not consensus-enforced). "Lock" sends KAS to the creator's address. There is no on-chain script forcing a payout back to you. Only interact if you trust the creator.
                        {displayCreatorAddr(covenant) && (
                          <> <Link to={`/address/${encodeURIComponent(displayCreatorAddr(covenant))}`} className="underline text-amber-300 light:text-amber-700">View creator</Link>.</>
                        )}
                      </div>
                    )}
                    <div>
                      <label className="block text-xs font-mono text-gray-300 mb-3 uppercase tracking-widest">
                        Amount to Lock (KAS)
                      </label>
                      <input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="0.00"
                        step="0.00000001"
                        min="0"
                        className="w-full cyber-input text-2xl sm:text-4xl p-4 sm:p-6 rounded-2xl font-mono placeholder:text-kaspa-green/20"
                      />
                    </div>

                    {address && (
                      <div className="p-4 rounded-xl bg-emerald-500/[0.04] border border-emerald-500/20">
                        <p className="text-xs text-emerald-400 font-mono mb-1">CONNECTED WALLET</p>
                        <p className="text-sm font-mono text-white truncate">{address}</p>
                        {balance !== null && (
                          <p className="text-xs text-gray-200 mt-1">
                            Balance: {(balance / 1e8).toFixed(4)} KAS
                          </p>
                        )}
                      </div>
                    )}

                    <Button
                      variant="kaspa"
                      size="lg"
                      shimmer
                      onClick={handleExecute}
                      disabled={executing}
                      className="w-full font-extrabold uppercase tracking-wide"
                    >
                      {executing ? null : address ? <ShieldCheck size={20} /> : <Lock size={20} />}
                      {executing ? 'Processing...' : address ? 'Sign & Execute' : 'Interact with this covenant'}
                    </Button>

                    {deployUri && (
                      <div className="p-3 rounded-xl bg-black/30 border border-white/5">
                        <p className="text-xs text-gray-200 font-mono break-all">
                          URI: {deployUri.slice(0, 60)}...
                        </p>
                      </div>
                    )}

                    <p className="text-center text-xs text-gray-200 font-mono">
                      DIRECT wRPC CONNECTION / NO MIDDLEMEN / NON-CUSTODIAL
                    </p>
                  </>
                )}

                <a
                  href={explorerTxUrl(covenant.tx_id, covenant.network)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 text-xs text-gray-300 hover:text-kaspa-green transition-colors font-mono"
                >
                  <ExternalLink size={12} />
                  View on Kaspa Explorer
                </a>

                {/* Launch the full professional chess arena (chess.com style, full page, nice timers) */}
                {showChessArena && isChess && (
                  <FullScreenChess
                    stake={joinPot > 0 ? joinPot : chessStake}
                    onClose={() => setShowChessArena(false)}
                    covenantId={covenant.tx_id}
                    creatorAddr={covenant.creator_addr}
                    feePercent={2}
                    chessLook={chessLook}
                  />
                )}
                {showGameArena && isOtherGame && (() => {
                  const G = GAME_REGISTRY[gameType].Component;
                  return (
                    <G
                      stake={joinPot > 0 ? joinPot : chessStake}
                      onClose={() => setShowGameArena(false)}
                      covenantId={covenant.tx_id}
                      feePercent={2}
                      potReturnPercent={2}
                      look={gameLook}
                    />
                  );
                })()}
              </div>
            ) : activeTab === 'fix' && isCreator ? (
              /* FIX TAB INLINE: super clean, lots of space, big text, minimal labels. Exactly the Customization Garage grid + ONE section for stake amount and all of that. Reuses the generator and publish. Focused on this covenant. */
              <div className="space-y-8">
                <div>
                  <div className="text-2xl font-semibold tracking-tight light:text-slate-900">Fix: Looks and Stake</div>
                  <div className="text-sm text-gray-400 mt-1 light:text-slate-600">Creator only. Pick a template for instant preview. One clean section to set the stake amount and rules. Publish once. Everyone sees the nice transparent view.</div>
                </div>

                {/* Garage grid - templates that turn into nice preview (customisation garage) */}
                <div>
                  <div className="text-xs uppercase tracking-[2px] text-gray-400 mb-3">CHOOSE A LOOK (TEMPLATES)</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {COVENANT_TEMPLATES.map((tpl) => {
                      const active = selectedTemplate?.id === tpl.id;
                      return (
                        <div key={tpl.id} className={`group rounded-2xl border overflow-hidden ${active ? 'border-kaspa-green/70 ring-1 ring-kaspa-green/20' : 'border-white/10 hover:border-white/25'}`}>
                          <div className="h-20 flex items-center justify-center text-center" style={{ background: tpl.thumbnail || 'linear-gradient(135deg, #111 0%, #1a1f2e 100%)' }}>
                            <div>
                              <div className="text-white font-semibold tracking-tight">{tpl.name}</div>
                              <div className="text-[10px] text-white/60">{tpl.tagline}</div>
                            </div>
                          </div>
                          <div className="p-2.5 bg-black/40 flex gap-2">
                            <button onClick={() => {
                              setSelectedTemplate(tpl);
                              setConfig(c => ({...c, ...tpl.config}));
                              toast.success('Template applied to preview. Publish to make live.');
                            }} className={`flex-1 text-xs py-1.5 rounded-xl font-medium ${active ? 'bg-kaspa-green text-black' : 'bg-white/10 hover:bg-white/15'}`}>{active ? 'Chosen' : 'Choose'}</button>
                            <button onClick={() => {
                              // Open a real full preview modal of the built page (mirrors Page Studio),
                              // never a false-success toast for a CTA with no visible effect.
                              const html = buildTransparentCustomUI(covenant, {...config, ...tpl.config});
                              setShowTemplatePreview({ tpl, html });
                            }} className="flex-1 text-xs py-1.5 rounded-xl border border-white/15 hover:bg-white/5">Preview</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Minimal tweaks */}
                <div className="space-y-4">
                  <div>
                    <div className="text-xs uppercase tracking-widest text-gray-500 mb-1.5">Title (optional)</div>
                    <input value={config.titleOverride || ''} onChange={e => setConfig(s => ({...s, titleOverride: e.target.value}))} placeholder={covenant.name || 'Covenant title'} aria-label="Override covenant title" className="w-full rounded-2xl bg-black/40 border border-white/10 px-4 py-3 text-sm focus:border-kaspa-green/40 light:bg-white light:border-slate-200 light:text-slate-900 light:placeholder:text-slate-400 light:focus:border-emerald-500/50" />
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-widest text-gray-500 mb-1.5">Short description (optional)</div>
                    <input value={config.descOverride || ''} onChange={e => setConfig(s => ({...s, descOverride: e.target.value}))} placeholder={covenant.description || 'What this covenant does'} aria-label="Override covenant short description" className="w-full rounded-2xl bg-black/40 border border-white/10 px-4 py-3 text-sm focus:border-kaspa-green/40 light:bg-white light:border-slate-200 light:text-slate-900 light:placeholder:text-slate-400 light:focus:border-emerald-500/50" />
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-widest text-gray-500 mb-1.5">Accent color</div>
                    <div className="flex gap-2 flex-wrap">
                      {['#49EACB','#E8AF34','#10B981','#3B82F6','#8B5CF6','#EC4899','#F59E0B'].map(c => (
                        <button key={c} type="button" onClick={() => setConfig(s => ({...s, primaryColor: c}))} aria-label={`Accent color ${c}`} aria-pressed={config.primaryColor === c} className={`h-8 w-8 rounded-full border-2 ${config.primaryColor === c ? 'border-white scale-110 light:border-slate-900' : 'border-transparent'}`} style={{ background: c }} />
                      ))}
                      <input type="color" value={config.primaryColor} onChange={e => setConfig(s => ({...s, primaryColor: e.target.value}))} aria-label="Custom accent color" title="Custom accent color" className="h-8 w-9 rounded border-0 p-0 overflow-hidden" />
                    </div>
                  </div>
                </div>

                {/* EXACTLY 1 SECTION for stake amount and all of that - super clean simple easy */}
                <div className="rounded-3xl border border-white/10 bg-white/[0.015] p-6 light:border-slate-200 light:bg-slate-50/60">
                  <div className="font-semibold text-xl tracking-tight mb-1 light:text-slate-900">Stake amount and all of that</div>
                  <div className="text-sm text-gray-400 mb-5 light:text-slate-600">Just set the number. Everything else is fixed, transparent, and already explained to players. One publish updates the public view.</div>

                  <div className="text-xs uppercase tracking-[1.5px] text-gray-500 mb-2">AMOUNT TO STAKE (KAS)</div>
                  <input
                    type="number"
                    value={chessStake}
                    onChange={e => setChessStake(Math.max(1, parseInt(e.target.value || '1', 10)))}
                    aria-label="Stake amount in KAS per player"
                    className="w-full text-center text-6xl font-semibold tabular-nums tracking-[-2px] py-4 bg-transparent border border-white/10 rounded-2xl focus:outline-none focus:border-kaspa-green/40 mb-1 light:border-slate-200 light:text-slate-900 light:focus:border-emerald-500/50"
                  />
                  <div className="text-center text-xs text-gray-500 mb-6">per player for this chess covenant</div>

                  {/* Clean rules paragraph, all in order, simplistic transparent */}
                  <div className="rounded-2xl bg-black/40 border border-white/10 p-5 text-sm text-gray-200 leading-relaxed mb-6 light:bg-slate-50 light:border-slate-200 light:text-slate-700">
                    10 minute chess, the full stake to the winner.<br/><br/>
                    Second player must match the stake within 5 minutes or the funds return automatically to the staker.<br/><br/>
                    Each player gets a 10 minute clock. Only the active player clock runs.<br/><br/>
                    Resign, timeout or checkmate ends the game.<br/><br/>
                    Winner receives the staked amount minus 2 percent. The 2 percent goes to the creator address to keep the service running.<br/><br/>
                    Custody on-chain, payout gated by a 2-of-2 cosign + CSV timeout via the recomputable Covex engine's simulated BIP340 co-signature (resolver-attested, not trustless).<br/><br/>
                    The game runs on a server authoritative engine that enforces legal moves and replays the signed move log deterministically (anyone can recompute); settlement is simulated today, with the recomputable Covex engine co-signing the release alongside the winning player with a BIP340 Schnorr signature. There is no zero knowledge proof of individual moves.
                  </div>

                  <Button
                    variant="kaspa"
                    size="lg"
                    shimmer
                    onClick={async () => {
                      // publishCustomUI already shows the accurate success/error toast and
                      // returns whether it actually published. Only add the extra success
                      // note when it really went live, never claim success on failure.
                      const ok = await publishCustomUI(false);
                      if (ok) {
                        toast.success('Published! The public view now reflects your settings. Refresh to see for visitors.');
                      }
                    }}
                    className="w-full"
                  >
                    <Save size={18} /> PUBLISH LOOKS + STAKE SETTINGS
                  </Button>
                  <div className="text-[10px] text-center text-gray-500 mt-2">Changes are immediate for the transparent public experience. No terminal shown to regular users.</div>
                </div>

                {/* Quick live preview of what publish produces */}
                <div>
                  <div className="text-xs uppercase tracking-[1.5px] text-gray-500 mb-2 flex items-center gap-2"><Eye size={14}/> Live preview of what regular users will see</div>
                  <div className="rounded-3xl overflow-hidden border border-white/10 bg-black">
                    <iframe srcDoc={buildTransparentCustomUI(covenant, { ...config, titleOverride: config.titleOverride || (isChess ? '10min Chess Covenant' : undefined), publicAbout: config.publicAbout, publicRules: config.publicRules, publicHowTo: config.publicHowTo })} className="w-full h-[420px] bg-[#050507]" sandbox="allow-scripts" title="Fix preview" />
                  </div>
                </div>
              </div>
            ) : activeTab === 'terminal' ? (
              /* ── Terminal Tab: ONLY the creator sees this (to deploy custom nice UI, ZK, oracles, etc). Regular users never see terminal or settings. ── */
              isCreator ? (
                <div className="-m-6 sm:-m-7">
                  <Suspense fallback={(
                    <div className="p-8 text-center text-sm text-gray-400 light:text-slate-500">
                      Loading creator terminal...
                    </div>
                  )}>
                    <CovexTerminal covenant={covenant} />
                  </Suspense>
                </div>
              ) : (
                <div className="p-8 text-center border border-white/10 rounded-2xl bg-black/30">
                  <Lock size={32} className="mx-auto mb-4 text-amber-400" />
                  <h3 className="text-xl font-bold text-white mb-2">Creator Tools</h3>
                  <p className="text-gray-300 mb-6 max-w-md mx-auto">Advanced terminal (ZK circuits, oracles, custom UI deployment) is only available to the creator of this covenant.</p>
                </div>
              )
            ) : (
              /* fallback for old builder or other */
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-semibold text-white uppercase tracking-widest flex items-center gap-2">
                    <LayoutTemplate size={16} className="text-kaspa-green" />
                    Looks &amp; Stake
                  </h3>
                  <p className="text-xs text-gray-400 mt-1">Use the Fix tab (creator only) for the clean manager.</p>
                </div>
                <Link to={`/covenant/${encodeURIComponent(id)}/studio`} className={`${buttonVariants({ variant: 'kaspa', size: 'lg' })} btn-shimmer w-full`}>
                  Build / edit this site
                </Link>
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* Transparency Notice / custody disclaimer. Lives INSIDE the collapsible
          covenant-details-panel so that a full-width creator-UI covenant (hasCustomSurface)
          shows ONLY the creator site + Read more affordance when Details is collapsed (the
          default); this Covex text wall no longer blocks half the page below the site. For a
          non-custom covenant the panel is always open, so it renders exactly as before. */}
      <div className="glass-panel p-6 mt-8 text-xs text-gray-200 leading-relaxed max-w-3xl mx-auto light:bg-white light:border light:border-slate-200 light:text-slate-600">
        <p className="text-gray-300 font-semibold mb-2 light:text-slate-900">Transparency Notice</p>
        <p>
          This covenant is immutable on the Kaspa BlockDAG. Covex does not create, modify, or control
          it. We only index publicly available data. All interactions occur
          non-custodially through your own wallet. You bear full responsibility for verifying all transaction details before signing.
        </p>
      </div>
      </div>{/* /covenant-details-panel (collapsible chrome wrapper) */}

      {/* Sticky right-rail (desktop) / slide-up bottom sheet (mobile) for the
          covenant's primary action set. Hidden during the creator's Fix tab so it
          does not crowd the publish flow. The rail routes through the same
          routeCovenantIntent path the inline CTAs already use, so signing /
          stake / spend logic stays in one place. Share opens the same modal as
          the hero pill and the buried header button.

          Also suppressed when hasCustomSurface: the full-width creator site is the
          interaction surface (it carries its own CTAs) and the native interact lives
          inside the Details panel, so a floating "Sign and execute" rail would just
          overlap the site with a label that is meaningless for a display / market
          covenant. The slim top bar carries Share + wallet for that path instead. */}
      {!hasCustomSurface && !(isCreator && activeTab === 'fix') && (
        <StickyActionRail
          covenant={covenant}
          onStake={() => routeCovenantIntent('interact', null)}
          onShare={() => setShareOpen(true)}
          primaryLabel={gameType ? 'Stake and play' : (covenant?.spent_tx_id ? 'View spend' : (address ? 'Sign and execute' : 'Interact'))}
        />
      )}

      {/* Custom UI Rendering: creator published transparent view (via Fix page).
          Reserved for genuine creator UIs - auto-generated blobs are never framed
          here. Routed through the single creatorSurface switch so a covenant with
          Puck data never doubles up with this legacy iframe. Suppressed when the page
          already leads with the full-bleed creator surface (hasCustomSurface): that
          path is the primary view, so this secondary preview would double-render it. */}
      {creatorSurface === 'iframe' && !hasCustomSurface && (
        <div className="mt-8 w-full">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-kaspa-green/10 border border-kaspa-green/30">
              <Code2 size={18} className="text-kaspa-green" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">{covenant.name || covenant.covenant_type || 'Covenant'}</h3>
              <p className="text-xs text-gray-300 font-mono">INTERACTIVE PREVIEW</p>
            </div>
            <button
              onClick={() => setFullscreenUI(true)}
              aria-label="Open creator preview in fullscreen"
              className="ml-auto px-4 py-2 rounded-lg bg-kaspa-green/10 border border-kaspa-green/30 text-kaspa-green text-xs font-bold hover:bg-kaspa-green/20 transition-all flex items-center gap-2"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"/></svg>
              Fullscreen
            </button>
          </div>
          <div className="rounded-2xl border border-kaspa-green/20 bg-black/50 overflow-hidden w-full">
            <div className="flex items-center gap-2 px-4 py-2 bg-black/40 border-b border-white/5">
              <div className="flex gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-red-500/60" />
                <span className="h-2.5 w-2.5 rounded-full bg-yellow-500/60" />
                <span className="h-2.5 w-2.5 rounded-full bg-green-500/60" />
              </div>
              <span className="text-[10px] text-gray-200 font-mono ml-2">{covenant.name || covenant.covenant_type || 'Covenant'} Preview</span>
            </div>
            <iframe
              srcDoc={covenant.custom_ui_html}
              title="Custom Covenant UI"
              className="w-full border-0 bg-[#06080B]"
              style={{minHeight:'700px',height:'calc(100vh - 300px)'}}
              sandbox="allow-scripts"
            />
          </div>
        </div>
      )}

      {/* New advanced builder layers rendered as interactive UI for all covenant types */}
      {covenant?.custom_ui_config?.layers && covenant.custom_ui_config.layers.length > 0 && (
        <div className="mt-8 w-full">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-kaspa-green/10 border border-kaspa-green/30">
              <Layers size={18} className="text-kaspa-green" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Custom Interactive Design (from Advanced Builder)</h3>
              <p className="text-xs text-gray-300 font-mono">LIVE - buttons trigger real wallet actions where possible</p>
            </div>
          </div>
          <div className="relative border border-kaspa-green/20 bg-black/50 rounded-2xl overflow-hidden" style={{width: '100%', maxWidth: 420, height: 260, margin: '0 auto'}}>
            {covenant.custom_ui_config.layers.map((layer, idx) => {
              const style = {
                position: 'absolute',
                left: layer.x,
                top: layer.y,
                width: layer.w,
                height: layer.h,
                border: '1px solid rgba(255,255,255,0.2)',
                background: layer.props.bg || 'rgba(255,255,255,0.08)',
                color: layer.props.color || '#fff',
                fontSize: layer.props.fontSize || 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                cursor: layer.type === 'button' ? 'pointer' : 'default'
              };
              const handleAction = async () => {
                if (layer.type === 'button' && layer.props.action) {
                  if (layer.props.action.includes('stake') || layer.props.action.includes('join')) {
                    try {
                      const res = await sendPayment(covenant.address || covenant.creator_addr, 10, {memo: `stake:${id}`});
                      if (res && res.success === false) {
                        toast.error(res.needsWallet ? 'Connect a Kaspa wallet to stake.' : ('Stake failed: ' + (res.error || 'transaction rejected')));
                      } else {
                        toast.success('Stake sent (real on-chain tx)!');
                      }
                    } catch(e) { toast.error('Stake failed: ' + e.message); }
                  } else {
                    // Only stake/join are wired to a real on-chain action. Be honest
                    // about anything else rather than implying hidden covenant logic.
                    toast.info('This button is not connected to an on-chain action.');
                  }
                }
              };
              return (
                <div key={idx} style={style} onClick={handleAction}>
                  {layer.type === 'text' && layer.props.text}
                  {layer.type === 'button' && (
                    <button className="px-3 py-0.5 rounded text-xs font-bold" style={{background: layer.props.bg, color: layer.props.color || '#000'}}>
                      {layer.props.text || 'ACTION'}
                    </button>
                  )}
                  {layer.type === 'image' && layer.props.src && <img src={layer.props.src} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}} />}
                  {layer.type === 'game' && <div>🎮 {layer.props.game || 'game'}</div>}
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-center text-gray-500 mt-2">This custom design from the Advanced Builder is now live and interactive for this covenant.</p>
        </div>
      )}

      {/* Fullscreen Modal for Custom UI (genuine creator UIs only) */}
      {fullscreenUI && hasCreatorUI && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/95 backdrop-blur-sm"
          onClick={() => setFullscreenUI(false)}
        >
          <div
            className="relative w-full h-full max-w-[98vw] max-h-[98vh] mx-auto bg-[#0A0A0D] border border-kaspa-green/30 rounded-2xl overflow-hidden shadow-[0_0_60px_rgba(73,234,203,0.2)] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-white/5 bg-black/50">
              <div className="flex items-center gap-3">
                <div className="flex gap-1.5">
                  <span className="h-3 w-3 rounded-full bg-red-500/70" />
                  <span className="h-3 w-3 rounded-full bg-yellow-500/70" />
                  <span className="h-3 w-3 rounded-full bg-green-500/70" />
                </div>
                <span className="text-sm font-bold text-white">{covenant.name || covenant.covenant_type || 'Covenant'}: Fullscreen</span>
              </div>
              <button
                onClick={() => setFullscreenUI(false)}
                aria-label="Close fullscreen covenant preview"
                className="p-2 rounded-lg hover:bg-white/5 text-gray-200 hover:text-white transition-colors light:text-slate-500 light:hover:bg-slate-100 light:hover:text-slate-900"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <iframe
              srcDoc={covenant.custom_ui_html}
              title="Custom Covenant UI Fullscreen"
              className="flex-1 w-full border-0 bg-[#0A0A0D]"
              sandbox="allow-scripts"
            />
          </div>
        </div>
      )}

      {/* Template full preview modal (Fix tab) - shows exactly what publishing produces,
          mirroring Page Studio. Never a false-success toast for a CTA with no UI. */}
      {showTemplatePreview && (
        <div className="fixed inset-0 z-[95] bg-black/95 flex items-center justify-center p-4" onClick={() => setShowTemplatePreview(null)}>
          <div className="w-full max-w-[1080px] bg-[#050507] rounded-3xl border border-white/10 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-white/10 flex items-center gap-3 bg-black/40">
              <div className="font-semibold text-white">{showTemplatePreview.tpl?.name || 'Template'} preview: exactly what viewers see</div>
              <div className="ml-auto flex gap-2">
                <button
                  onClick={() => {
                    setSelectedTemplate(showTemplatePreview.tpl);
                    setConfig(c => ({ ...c, ...showTemplatePreview.tpl.config }));
                    setShowTemplatePreview(null);
                    toast.success('Template applied to preview. Publish to make live.');
                  }}
                  className="px-5 py-2 rounded-2xl bg-kaspa-green text-black text-sm font-semibold"
                >
                  Choose this &amp; close
                </button>
                <button onClick={() => setShowTemplatePreview(null)} className="px-5 py-2 rounded-2xl border border-white/15 text-sm text-gray-200">Close</button>
              </div>
            </div>
            <iframe srcDoc={showTemplatePreview.html} className="w-full h-[78vh] bg-[#050507]" sandbox="allow-scripts" title="Template full preview" />
          </div>
        </div>
      )}

      {/* Toasts render app-wide top-right via ToastProvider (ToastContext singleton). */}

      {/* Share + Recovery modals live at the TOP LEVEL of the page, never inside the
          collapsible covenant-details-panel. On a creator-UI covenant that panel is
          `hidden` until the visitor opens Details, so a modal nested inside it could be
          toggled open but never paint. Both are fixed-overlay portals (z-[100], self-gate
          on `open`), so they render above the full-bleed creator surface from here. */}
      <ShareEmbedModal open={shareOpen} onClose={() => setShareOpen(false)} id={id} network={covenant?.network} name={covenant?.name} reality={covenant?.enforcement_reality} />
      <RecoveryKitModal open={recoveryOpen} onClose={() => setRecoveryOpen(false)} covenant={covenant} />

      <DevWalletModal isOpen={walletModalOpen} onClose={() => setWalletModalOpen(false)} />
    </div>
  );
}
