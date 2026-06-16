import { useState, useEffect, useMemo, useCallback } from 'react';
import { toast } from '../components/ToastContext';
import { Render as PuckRender } from '@measured/puck';
import puckConfig, { BG_PRESETS } from '../lib/puckConfig';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import TrustBadge from '../components/TrustBadge';
import { motion } from 'framer-motion';
import { useWallet } from '../components/WalletContext';
import { signCovenantOwnership } from '../lib/ownership';
import { explorerTxUrl } from '../lib/explorer';
import CovexTerminal from '../components/CovexTerminal';
import FullScreenChess from '../components/FullScreenChess';
import FullScreenPoker from '../components/FullScreenPoker';
import FullScreenReversi from '../components/FullScreenReversi';
import FullScreenConnect4 from '../components/FullScreenConnect4';
import FullScreenCheckers from '../components/FullScreenCheckers';
import FullScreenTicTacToe from '../components/FullScreenTicTacToe';
import FullScreenRPS from '../components/FullScreenRPS';
import FullScreenBlackjack from '../components/FullScreenBlackjack';

// Every game covenant is playable from its detail page (not just chess). Each FullScreen* arena
// shares the prop shape { stake, onClose, covenantId, feePercent, potReturnPercent }.
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
import { Chessboard } from 'react-chessboard';
import { Layers, Terminal, Lock, ArrowLeft, Cpu, ShieldCheck, ExternalLink, AlertTriangle, BadgeCheck, Palette, LayoutTemplate, Eye, EyeOff, ImagePlus, Monitor, Code, Code2, Paintbrush, Check, ArrowUp, QrCode, Zap, Type, Ruler, Save, CheckCircle2, Crown, Star, Share2 } from 'lucide-react';
import ShareEmbedModal from '../components/ShareEmbedModal';
import RecoveryKitModal from '../components/RecoveryKitModal';
import { LifeBuoy } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import DevWalletModal from '../components/DevWalletModal';
import { MarketView } from './Markets';

const DEPLOYER = 'kaspatest:qpyfz03k6quxwf2jglwkhczvt758d8xrq99gl37p6h3vsqur27ltjhn68354m';
const TRUNC = (s, n = 6) => (s && s.length > n * 2 + 3 ? `${s.slice(0, n)}...${s.slice(-4)}` : s);

// Hardcoded test wallets for examples, fee receiver, dev notes (user can import with seeds for testnet funds):
// 1. kaspatest:qrh603rmy6v0jsq58jrh2yr4ewdk02gctjhxg9feg7uwdl98t04dqmzlrt353 (seed: fitness narrow gap scheme fold regret faint neck blanket discover feel machine)
// 2. kaspatest:qpw2yxrmfudv56lvav32s8jz6uwqhp2x0x7fna0640qx3gwp70d55uue9uecs (seed: giggle alpha happy until wing zone cat argue april walnut uncover rate)
// 3. kaspatest:qpyfz03k6quxwf2jglwkhczvt758d8xrq99gl37p6h3vsqur27ltjhn68354m (seed: upon machine office cup raw vehicle will jelly goddess mother lesson disagree)  <-- DEPLOYER / TREASURY / creator fee receiver example

const isVerified = (c) => c?.verified_tier && c.verified_tier !== 'FREE' && c.verified_tier !== 'EXPLORER';
const tierValue = (t) => ({ MAX: 3, PRO: 2, BUILDER: 1, FREE: 0, EXPLORER: 0 }[t] || 0);

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

function ColorSwatch({ color, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`h-8 w-8 rounded-full border-2 transition-all ${
        active ? 'border-white scale-110 shadow-[0_0_10px_rgba(255,255,255,0.3)]' : 'border-transparent hover:scale-105'
      }`}
      style={{ backgroundColor: color }}
    />
  );
}

export default function CovenantInteractive() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const [covenant, setCovenant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState('');
  const { address, balance, sendPayment, connecting, buildUri, signMessage } = useWallet();

  // UI Builder state
  const [showBuilder, setShowBuilder] = useState(false);
  const [config, setConfig] = useState(DEFAULT_UI_CONFIG);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [showTemplatePreview, setShowTemplatePreview] = useState(null); // for modal full preview

  // Paid tier comes from the backend (real verified on-chain payment), NOT attacker-writable
  // localStorage. Starts null (FREE); populated by the auth-session fetch below.
  const [covexPaidTier, setCovexPaidTier] = useState(null);
  useEffect(() => {
    if (!address) { setCovexPaidTier(null); return; }
    const net = (typeof window !== 'undefined' && localStorage.getItem('kaspaNetwork')) || 'testnet-12';
    fetch('/api/auth-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, network: net }),
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => setCovexPaidTier((data?.token && data?.tier && data.tier !== 'FREE') ? data.tier : null))
      .catch(() => setCovexPaidTier(null));
  }, [address]);

  // isCreator computed early (wallet + covenant creator_addr match). Only creator can deploy/set custom UI or see Terminal/Builder.
  // Fix tab and looks/stake always available to creator after wallet login. No paid required for basic Fix or chess arena.
  const isCreator = !!(address && covenant?.creator_addr && address === covenant.creator_addr);

  // Compute effective tier & paid status early so tab default works (paid only for advanced Studio elsewhere)
  const effectiveTierLabel = covexPaidTier || 'FREE';
  const effectiveTierVal = Math.max(
    tierValue(covenant?.verified_tier || covenant?.tier || 'FREE'),
    tierValue(effectiveTierLabel)
  );
  const TierIcon = effectiveTierLabel === 'MAX' ? Crown : effectiveTierLabel === 'PRO' ? Star : effectiveTierLabel === 'BUILDER' ? Terminal : Eye;
  const canCustomize = isCreator;  // creator always can use Fix for looks + stake (public chess is always pro transparent)
  const canBrand = isCreator;
  const canMaxLayout = isCreator;

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
  // Pass play mode to CovexTerminal
  const playMode = searchParams.get('play') || null; // 'chess' | 'poker' | 'bj' | null
  const [toast, setToast] = useState(null);

  // Transparency: always show full details for viewers (no hidden settings for regular users)
  const showTransparency = true; // Always for the "everything there is to know - fully transparent" requirement.
  const TREASURY = 'kaspatest:qpyfz03k6quxwf2jglwkhczvt758d8xrq99gl37p6h3vsqur27ltjhn68354m';
  const TIER_OPTIONS = [
    { id: 'BUILDER', price: 100, label: 'Builder', color: '#3B82F6', desc: 'Interactive UI generation, standard listing, verified badge.' },
    { id: 'PRO', price: 500, label: 'PRO', color: '#E8AF34', desc: 'Featured placement, advanced UI tools, covenant images.' },
    { id: 'MAX', price: 1000, label: 'MAX', color: '#A855F7', desc: 'Top placement, full UI suite, custom branding.' },
  ];

  // Upgrade payment state
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [upgradeTier, setUpgradeTier] = useState(null);
  const [upgradeQr, setUpgradeQr] = useState(false);
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [upgradePaid, setUpgradePaid] = useState(false);
  const [fullscreenUI, setFullscreenUI] = useState(false);
  const [chessStake, setChessStake] = useState(50);
  const [showChessArena, setShowChessArena] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [showGameArena, setShowGameArena] = useState(false);
  // Claim & Activate: provide an elsewhere-created covenant's redeem script (+ metadata) to make it
  // fully interactable. Verified trustlessly by the backend (the script must hash to the commitment).
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

  // Claim & Activate: verify a supplied redeem script against the on-chain commitment, then the
  // covenant becomes redeemable + richly displayed. Refetch so the new UI appears immediately.
  const submitClaim = async () => {
    if (!claimForm.redeem_script_hex.trim()) { setToast({ type: 'error', msg: 'Paste the covenant redeem script (hex).' }); return; }
    setClaimBusy(true);
    try {
      const r = await fetch('/api/covenant/p2sh/claim', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ covenant_id: id, ...claimForm }),
      });
      const d = await r.json();
      if (d && d.ok) {
        setToast({ type: 'success', msg: 'Verified on-chain. This covenant is now fully interactable.' });
        setClaimOpen(false);
        fetch(`/api/covenants/${encodeURIComponent(id)}`).then(x => x.ok ? x.json() : null).then(x => x && setCovenant(x.covenant || null)).catch(() => {});
      } else {
        setToast({ type: 'error', msg: d?.error || 'The redeem script did not match this covenant.' });
      }
    } catch (e) {
      setToast({ type: 'error', msg: e?.message || 'Claim failed.' });
    } finally {
      setClaimBusy(false);
    }
  };

  const handleUpgrade = async (tier) => {
    setUpgradeTier(tier);
    setShowUpgrade(true);
    setUpgradeQr(false);
    setUpgradePaid(false);
  };

  const handleSimulatePayment = async (tier) => {
    // Dev/test helper: immediately mark as paid (simulates faucet / indexer credit). Real flow waits for on-chain + verifier.
    // Testnet only. A paid tier must NEVER be granted without a confirmed payment on mainnet.
    const net = localStorage.getItem('kaspaNetwork') || 'testnet-12';
    if (net === 'mainnet') {
      if (typeof setToast === 'function') setToast({ type: 'error', msg: 'The testnet faucet simulation is not available on mainnet.' });
      return;
    }
    setUpgradePaid(true);
    if (typeof setToast === 'function') setToast({ type: 'success', msg: `Simulated ${tier.price} KAS ${tier.label} tier credit (local only)` });
  };

  const handleUpgradePay = async (tier) => {
    // No wallet: never fake a payment and never open a dead protocol tab. Show the scannable
    // payment URI/QR (which leads somewhere real) and offer the connect modal.
    if (!address) {
      setUpgradeQr(true);
      setWalletModalOpen(true);
      return;
    }
    try {
      const result = await sendPayment(TREASURY, tier.price, { memo: `covex-upgrade:${id}:${tier.id}` });
      if (result && result.success) {
        setUpgradePaid(true);
        if (typeof setToast === 'function') {
          setToast({ type: 'success', msg: `${tier.label} tier payment broadcast${result.txid ? ': ' + String(result.txid).slice(0, 16) + '…' : ''}` });
        }
      } else {
        const msg = (result && result.error) ? result.error : 'Payment failed to broadcast';
        if (typeof setToast === 'function') setToast({ type: 'error', msg });
        // Fall back to the scannable URI panel instead of a blank tab.
        setUpgradeQr(true);
      }
    } catch (e) {
      if (typeof setToast === 'function') setToast({ type: 'error', msg: e?.message || 'Payment error' });
      setUpgradeQr(true);
    }
  };

  const getUpgradeUri = (tier) => `kaspatest:${TREASURY.replace('kaspatest:', '')}?amount=${tier.price}`;

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const [actions, setActions] = useState([]);
  useEffect(() => {
    fetch(`/api/covenants/${encodeURIComponent(id)}/actions`)
      .then((r) => r.json())
      .then((d) => setActions(Array.isArray(d.actions) ? d.actions : []))
      .catch(() => {});
  }, [id]);

  useEffect(() => {
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
  // {{tokens}}. Read-only figures only; a custom page can never set a destination.
  const liveData = useMemo(() => {
    if (!covenant) return {};
    const locked = Number(covenant.amount_kaspa || 0);
    return {
      name: covenant.name || covenant.covenant_type || 'Covenant',
      status: covenant.is_active === false ? 'Settled' : 'Active',
      network: covenant.network || 'testnet-12',
      amount_kaspa: locked,
      total_locked: `${locked.toLocaleString()} KAS`,
      tx_count: actions.length,
      fee_pct: covenant.fee_pct != null ? covenant.fee_pct : '',
      rebate_pct: covenant.rebate_pct != null ? covenant.rebate_pct : '',
      creator: TRUNC(covenant.creator_addr || covenant.address || '', 8),
      daa_score: covenant.block_daa_score || 0,
      verified_tier: covenant.verified_tier || 'FREE',
    };
  }, [covenant, actions]);

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
      setToast({ type: 'error', msg: 'Enter an amount to lock before executing.' });
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
          setToast({ type: 'error', msg: `Transaction failed: ${res.error || 'wallet rejected the transaction'}` });
        } else {
          setToast({
            type: 'success',
            msg: res?.txid ? `Transaction broadcast: ${String(res.txid).slice(0, 16)}…` : 'Transaction sent to your wallet for signing.',
          });
        }
      } catch (e) {
        setToast({ type: 'error', msg: `Transaction failed: ${e?.message || 'unknown error'}` });
      } finally {
        setExecuting(false);
      }
    } else {
      // No wallet: never open a dead protocol tab. Prompt the connect modal, which leads somewhere.
      setToast({ type: 'info', msg: 'Connect a Kaspa wallet to interact with this covenant.' });
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

  const covenantTierVal = tierValue(covenant?.verified_tier || covenant?.tier || 'FREE');

  // React to loaded covenant (custom UI presence) and isCreator for correct default tab
  useEffect(() => {
    if (!covenant) return;
    const tabParam = searchParams.get('tab');
    const playParam = searchParams.get('play');
    if ((tabParam === 'terminal' || playParam) && isCreator) {
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
    const title = ESC(cfg.titleOverride || cov.name || TRUNC(cov.tx_id));
    const desc = ESC(cfg.descOverride || cov.description || cov.desc || 'This covenant is immutable on the Kaspa BlockDAG. Everything here is fully transparent and on-chain.');
    const logic = ESC(cov.full_logic_summary || cov.description || 'All logic and parameters are fully disclosed. This is a creator-published, verifiable covenant experience.');
    const creator = ESC(cov.creator_addr || 'Unknown');
    const locked = ESC((cov.amount_kaspa || 0).toLocaleString());
    const tx = ESC(cov.tx_id || '');
    const explorerTx = ESC(explorerTxUrl(cov.tx_id, cov.network)); // network-accurate explorer URL
    const cat = ESC(cov.category || 'General');
    const tier = ESC(cov.verified_tier || cov.tier || 'FREE');
    const verified = isVerified(cov);
    const addrs = ESC(cov.receiving_addresses || cov.address || '');
    const ts = ESC(cov.timestamp ? new Date(cov.timestamp * 1000).toLocaleDateString() : 'recent');

    const heroImage = encodeURI(cfg.heroImageUrl || '');
    const vision = ESC(cfg.vision || '');
    const publicAbout = ESC(cfg.publicAbout || cfg.descOverride || cov.description || cov.desc || 'This covenant is immutable on the Kaspa BlockDAG. Everything here is fully transparent and on-chain.');
    const publicRules = ESC(cfg.publicRules || cov.full_logic_summary || 'All logic and parameters are fully disclosed. This is a creator-published, verifiable covenant experience.');
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
          <button onclick="document.getElementById('interact').scrollIntoView({behavior:'smooth'})" class="btn">Interact with Covenant</button>
          <a href="${explorerTx}" target="_blank" class="btn btn-outline">View on Explorer →</a>
        </div>
      </div>
    `;

    // Trust bar
    blocksHTML += `
      <div class="section" style="text-align:center; opacity:0.85;">
        <div style="font-size:12px; letter-spacing:1.5px; color:#64748B;">FULLY TRANSPARENT • IMMUTABLE • NON-CUSTODIAL • VERIFIABLE ON KASPA</div>
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
          ${addrs ? `<div class="fact-card"><div class="fact-label">Covenant / Pot Address</div><div class="fact-value mono" style="font-size:12px;">${addrs}</div></div>` : ''}
          <div class="fact-card"><div class="fact-label">Platform Fee Treasury</div><div class="fact-value mono" style="font-size:12px;">${TREASURY || 'On-chain treasury'}</div></div>
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
      setToast({ type: 'error', msg: 'Only the creator of this covenant can publish a custom UI.' });
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
        setToast({ type: 'success', msg: 'Custom transparent UI published! All viewers now see the nice view (no terminal).' });
        setActiveTab('interact');
        return true;
      }
      setToast({ type: 'error', msg: data.error || 'Publish failed (are you the creator?). Your change is NOT live for viewers.' });
      return false;
    } catch (e) {
      // The update did NOT reach the backend - do not claim it published. Save the
      // config locally for the creator's own preview, but be explicit it is not live.
      localStorage.setItem(`covex_ui_config_${id}`, JSON.stringify(cfg));
      setCovenant((c) => ({ ...c, custom_ui_html: html, custom_ui_source: 'creator' }));
      setToast({ type: 'error', msg: `Publish failed: ${e.message || 'could not reach the backend'}. Saved locally for your preview only - viewers do NOT see this yet.` });
      return false;
    }
  };

  if (loading) {
    return (
      <div className="p-20 text-center text-kaspa-green animate-pulse font-mono tracking-widest text-lg">
        INITIALIZING PROTOCOL SEQUENCE...
      </div>
    );
  }

  if (!covenant) {
    return (
      <div className="p-20 text-center">
        <p className="text-gray-300 text-lg">Covenant not found.</p>
        <Link to="/" className="text-kaspa-green hover:underline mt-4 inline-block">
          Return to Explorer
        </Link>
      </div>
    );
  }

  // A prediction-market covenant IS its full betting website on its own covenant page
  // (live odds, pools, place a bet, resolve), rendered here in the Explorer flow exactly
  // like a game arena. Markets are covenants in the Explorer, never a separate section.
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

  // Preview style based on config
  const previewStyle = {
    primaryColor: config.primaryColor,
    background: config.bgColor || (config.bgStyle === 'glass' ? 'rgba(255,255,255,0.03)' : config.bgStyle === 'dark' ? '#0A0A0D' : '#111116'),
    borderColor: config.bgStyle === 'glass' ? 'rgba(255,255,255,0.08)' : config.bgStyle === 'dark' ? '#222' : '#1a1a2e',
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-12">
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-gray-300 hover:text-white transition-colors mb-4 font-mono text-sm uppercase tracking-wider"
      >
        <ArrowLeft size={16} /> Return to Registry
      </Link>

      {/* PROMINENT CREATOR FIX BAR AT THE VERY TOP OF THE PAGE */}
      {isCreator && (
        <div className="mb-6 p-4 rounded-3xl bg-purple-500/10 border-2 border-purple-500/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="text-purple-400 font-bold text-lg tracking-tight">Creator Mode: You own this covenant</div>
            <div className="text-sm text-purple-300/80">Use the Fix tools to change how it looks and set the stake amount in one clean section.</div>
          </div>
          <Link 
            to={`/covenant/${encodeURIComponent(id)}/fix`} 
            className="px-8 py-3 bg-purple-500 hover:bg-purple-600 text-white font-extrabold rounded-2xl text-base flex items-center gap-2 shadow-xl active:scale-[0.98] whitespace-nowrap border border-purple-300/30"
          >
            <Palette size={18} /> FIX LOOKS + STAKE SETTINGS
          </Link>
        </div>
      )}

      {/* Creator-designed page (Puck blocks, platform components only): a full-width
          hero section that LEADS the page, so the covenant reads like a real website.
          Live on-chain figures flow in via metadata.live and blocks resolve {{tokens}}
          at render. No creator input ever sets a fund destination. Images are always
          the creator's own choice (https URLs); with none set, the blocks fall back to
          the branded gradient look. */}
      {covenant?.custom_ui_config?.puck_data?.content?.length > 0 && (
        <div className="mb-10 rounded-3xl overflow-hidden border border-white/[0.06]">
          <PuckRender config={puckConfig} data={covenant.custom_ui_config.puck_data} metadata={{ live: liveData }} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left: Covenant metadata */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="glass-panel detail-hero-enhanced p-8 sm:p-10 rounded-3xl flex flex-col"
        >
          <div className="flex items-center gap-4 mb-6">
            <div className="relative">
              <div className="covex-aurora" aria-hidden="true" style={{ top: -28, left: -28, width: 132, height: 116 }} />
              <div className="relative z-10 p-3 bg-kaspa-green/10 rounded-2xl border border-kaspa-green/30 text-kaspa-green">
                <Cpu size={32} />
              </div>
            </div>
            <div className="flex-1">
              <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                {covenant.name || TRUNC(covenant.tx_id)}
              </h1>
              <div className="flex flex-wrap items-center gap-3 mt-2">
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-kaspa-gold/10 text-kaspa-gold border border-kaspa-gold/20 uppercase tracking-widest">
                  {covenant.tier || covenant.verified_tier || 'FREE'} TIER
                </span>
                <span className="text-sm text-gray-300 font-mono">{covenant.category || 'General'}</span>
              </div>
            </div>

            {/* Share + embed - available to everyone, so any covenant can be shared or
                dropped into an external website (people interact via Covex). */}
            <button
              onClick={() => setRecoveryOpen(true)}
              title="Recover this covenant without Covex (self-custody)"
              className="ml-auto px-4 sm:px-5 py-2.5 rounded-2xl bg-white/[0.06] hover:bg-white/[0.10] border border-white/10 hover:border-kaspa-green/40 text-white font-bold text-sm flex items-center gap-2 active:scale-[0.985] transition-all"
            >
              <LifeBuoy size={16} className="text-kaspa-green" /> Recover
            </button>
            <button
              onClick={() => setShareOpen(true)}
              className="px-4 sm:px-5 py-2.5 rounded-2xl bg-white/[0.06] hover:bg-white/[0.10] border border-white/10 hover:border-kaspa-green/40 text-white font-bold text-sm flex items-center gap-2 active:scale-[0.985] transition-all"
            >
              <Share2 size={16} className="text-kaspa-green" /> Share
            </button>

            {/* PROMINENT FIX BUTTON ON TOP for creators only, right next to title */}
            {isCreator && (
              <Link
                to={`/covenant/${encodeURIComponent(id)}/fix`}
                className="px-6 py-2.5 rounded-2xl bg-purple-500 hover:bg-purple-600 text-white font-bold text-sm flex items-center gap-2 shadow-lg active:scale-[0.985] transition-all border border-purple-400/30"
              >
                <Palette size={16} /> FIX LOOKS + STAKE
              </Link>
            )}
            {isCreator && (
              <Link
                to={`/covenant/${encodeURIComponent(id)}/studio`}
                className="px-6 py-2.5 rounded-2xl bg-kaspa-green/90 hover:bg-kaspa-green text-black font-bold text-sm flex items-center gap-2 shadow-lg active:scale-[0.985] transition-all"
              >
                <Layers size={16} /> PAGE STUDIO
              </Link>
            )}
          </div>

          <ShareEmbedModal open={shareOpen} onClose={() => setShareOpen(false)} id={id} network={covenant?.network} name={covenant?.name} />
          <RecoveryKitModal open={recoveryOpen} onClose={() => setRecoveryOpen(false)} covenant={covenant} />

          {/* Page-level branding: the creator's chosen background preset (from the Puck
              page root) tints the whole covenant page, so the design carries beyond the
              custom section. Skipped when a custom background image is set below. */}
          {!covenant?.custom_ui_config?.theme?.background_image
            && BG_PRESETS[covenant?.custom_ui_config?.puck_data?.root?.props?.backgroundPreset] && (
            <div
              className="fixed inset-0 -z-10 pointer-events-none"
              style={{ background: BG_PRESETS[covenant.custom_ui_config.puck_data.root.props.backgroundPreset].css }}
            />
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

          {/* Lifecycle timeline + resolution trust: always visible, never hideable */}
          {covenant && (
            <div className="mb-6 glass-panel rounded-xl p-4 border border-white/[0.06]">
              <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Covenant Lifecycle</p>
                <TrustBadge covenant={covenant} size="md" />
              </div>
              <div className="flex items-center gap-0 overflow-x-auto">
                {[
                  { label: 'Deployed', done: true, sub: covenant.timestamp ? new Date(covenant.timestamp * 1000).toLocaleDateString() : `DAA ${covenant.block_daa_score || 0}` },
                  { label: 'Indexed', done: true, sub: covenant.network },
                  { label: covenant.verified_tier !== 'FREE' ? `Verified ${covenant.verified_tier}` : 'Unverified', done: covenant.verified_tier !== 'FREE', sub: covenant.verified_tier !== 'FREE' ? 'on-chain payment' : 'free tier' },
                  { label: covenant.is_active === false ? 'Settled' : 'Active', done: true, sub: covenant.is_active === false ? 'pot distributed' : `${covenant.amount_kaspa || 0} KAS locked` },
                ].map((st, i, arr) => (
                  <div key={st.label} className="flex items-center shrink-0">
                    <div className="flex flex-col items-center text-center px-1">
                      <div className={`w-3 h-3 rounded-full mb-1.5 ${st.done ? 'bg-kaspa-green shadow-[0_0_8px_rgba(73,234,203,0.6)]' : 'bg-white/15 border border-white/20'}`} />
                      <span className={`text-[11px] font-semibold ${st.done ? 'text-white' : 'text-gray-500'}`}>{st.label}</span>
                      <span className="text-[9px] text-gray-500 font-mono">{st.sub}</span>
                    </div>
                    {i < arr.length - 1 && (
                      <div className={`relative h-px w-10 sm:w-16 mx-1 mb-7 overflow-hidden ${st.done ? 'bg-kaspa-green/15' : 'bg-white/10'}`}>
                        {st.done && <div className="absolute inset-y-0 left-0 bg-kaspa-green/60 timeline-fill" style={{ animationDelay: `${i * 180}ms` }} />}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t border-white/[0.05] flex items-center justify-between flex-wrap gap-2 text-[11px] font-mono">
                <Link to={`/address/${encodeURIComponent(covenant.creator_addr || covenant.address || '')}`} className="text-gray-400 hover:text-kaspa-green transition-colors">
                  Creator portfolio: {(covenant.creator_addr || '').slice(0, 22)}...
                </Link>
                <span className="text-gray-500">Network: {covenant.network}</span>
              </div>
            </div>
          )}

          {/* The creator-designed page is hoisted to a full-width hero section at the top
              of the page (see above the metadata grid), so it leads and has room. */}

          {/* On-chain activity history: everything the indexers have seen for this covenant */}
          {actions.length > 0 && (
            <div className="mb-6 glass-panel rounded-xl p-4 border border-white/[0.06]">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Activity History</p>
              <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                {actions.slice().reverse().map((a, i) => {
                  const LABELS = {
                    deployed: { t: 'Deployed on-chain', c: 'text-kaspa-green' },
                    covenant_discovered: { t: 'Indexed by crawler', c: 'text-kaspa-green' },
                    tier_verified: { t: 'Tier verified', c: 'text-amber-300' },
                    tier_upgraded: { t: 'Tier payment confirmed', c: 'text-amber-300' },
                    resolution_signed: { t: 'Outcome resolved by oracle', c: 'text-purple-300' },
                    game_update: { t: 'Match update', c: 'text-sky-300' },
                    game_move: { t: 'Move played', c: 'text-sky-300' },
                  };
                  const l = LABELS[a.action] || { t: a.action, c: 'text-gray-300' };
                  return (
                    <div key={i} className="flex items-center justify-between gap-3 text-[11px] font-mono">
                      <span className={`font-bold ${l.c} shrink-0`}>{l.t}</span>
                      <span className="text-gray-500 truncate">{a.detail}</span>
                      {a.amount_kaspa > 0 && <span className="text-white shrink-0">{a.amount_kaspa} KAS</span>}
                      <span className="text-gray-600 shrink-0">{a.timestamp ? new Date(a.timestamp * 1000).toLocaleString() : ''}</span>
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
          {isChess || verified ? (
            <div className="mb-6 px-5 py-4 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/25 flex items-center gap-3">
              <BadgeCheck size={20} className="text-emerald-400 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-emerald-400">
                  {isChess ? 'FULLY TRANSPARENT CHESS ARENA' : `VERIFIED COVENANT (${covenant.verified_tier} tier)`}
                </p>
                <p className="text-xs text-emerald-400/70">
                  {isChess ? 'All receiving addresses, fees, timers, ZK circuit, oracle, and full game logic are public by default. No hidden settings.' : 'All receiving addresses, covenant logic, parameters, and on-chain facts are public by default.'}
                </p>
              </div>
            </div>
          ) : covenant?.enforcement_reality === 'on-chain' ? (
            <div className="mb-6 px-5 py-4 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/25 flex items-center gap-3 zk-live-glow">
              <ShieldCheck size={20} className="text-emerald-400 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-emerald-400">ON-CHAIN ENFORCED</p>
                <p className="text-xs text-emerald-400/70">
                  Kaspa consensus enforces this covenant - the strongest guarantee. Funds lock to a script hash and move only by satisfying it, with no oracle and no trust in Covex. (The paid "verified tier" only adds extra creator-published disclosure; it is separate from enforcement.)
                </p>
              </div>
            </div>
          ) : (
            <div className="mb-6 px-5 py-4 rounded-xl bg-amber-500/[0.06] border border-amber-500/25 flex items-center gap-3">
              <AlertTriangle size={20} className="text-amber-400 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-400">Metadata only - not consensus-enforced</p>
                <p className="text-xs text-amber-400/80">
                  The chain records this covenant but does not enforce its stated logic, and disclosure is limited to tx_id, script_hash, and amount. Review the on-chain facts and the creator before sending funds.
                </p>
              </div>
            </div>
          )}

          <div className="bg-black/40 p-6 rounded-2xl border border-white/5 mb-6">
            <h3 className="text-xs font-mono text-gray-300 mb-3 uppercase tracking-widest">
              {isChess ? 'CHESS ARENA RULES (FULLY TRANSPARENT)' : (verified ? 'Covenant Logic Summary (Full Disclosure)' : 'Protocol Description (Limited)')}
            </h3>
            <p className="text-gray-300 leading-relaxed">
              {isChess 
                ? 'This is a 10 minute winner takes all chess arena. Players stake equal amounts. The second player must match the stake within 5 minutes or the funds return automatically. Each player has a 10 minute clock that only runs during their turn. Games conclude by resign, timeout or checkmate. The winner receives the full pot minus 2 percent. The 2 percent fee is sent to the creator address to sustain the arena for future games. All stakes are sent directly to the covenant address on the Kaspa blockchain. The experience is fully non custodial. Every move can be proven using the chess v1 zero knowledge circuit. The oracle detects any lies or invalid results and can reject them. All information is transparent and recorded on chain.'
                : (verified
                ? (covenant.description || covenant.desc || 'Verified covenant. Full disclosure enabled.')
                : 'Limited information available. Only tx_id, script_hash, and amount are disclosed.')}
            </p>
          </div>

          {/* Always-visible full transparency: receiving addresses + logic (public on default) */}
          <div className="mb-6">
            <div className="text-xs font-mono text-gray-300 mb-2 uppercase tracking-widest">Receiving Addresses (all flows public)</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div className="p-3 bg-white/[0.02] border border-white/5 rounded-xl">
                <div className="text-gray-400">Covenant / Pot Address</div>
                <div className="font-mono text-white break-all mt-0.5">{covenant.address || covenant.receiving_addresses || 'On-chain covenant address'}</div>
              </div>
              <div className="p-3 bg-white/[0.02] border border-white/5 rounded-xl">
                <div className="text-gray-400">Platform Fee Treasury</div>
                <div className="font-mono text-white break-all mt-0.5">{TREASURY}</div>
              </div>
              <div className="p-3 bg-white/[0.02] border border-white/5 rounded-xl">
                <div className="text-gray-400">Creator Address (fee cut / sustain)</div>
                <div className="font-mono text-white break-all mt-0.5">{covenant.creator_addr || 'See covenant deployer'}</div>
              </div>
              <div className="p-3 bg-white/[0.02] border border-white/5 rounded-xl">
                <div className="text-gray-400">TX / Script</div>
                <div className="font-mono text-white break-all mt-0.5 text-[10px]">{covenant.tx_id} / {covenant.script_hash || 'on-chain'}</div>
              </div>
            </div>
          </div>

          <div className="mb-6">
            <div className="text-xs font-mono text-gray-300 mb-2 uppercase tracking-widest">Full Game / Event / Covenant Logic (public by default)</div>
            <div className="text-sm text-gray-200 bg-black/30 p-4 rounded-xl border border-white/5 leading-relaxed">
              {isChess ? (
                <>
                  <strong>Game:</strong> 10min per player winner-takes-all chess (FIDE rules).<br/>
                  <strong>Stake:</strong> Any equal amount (min/max per config). Second player matches or auto-refund in 5 min.<br/>
                  <strong>Timers:</strong> 10 min clock per player (active player only). Resign, timeout, or checkmate ends game.<br/>
                  <strong>Payout:</strong> Winner takes full pot minus 2% fee (fee to creator address to sustain future games).<br/>
                  <strong>Verification:</strong> chess_v1 ZK circuit (legal moves, terminal conditions) + oracle attestation with lie detection.<br/>
                  <strong>Non-custodial:</strong> All stakes and payouts direct to covenant addresses on Kaspa. Fully on-chain and verifiable.
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
          <div className="mt-4 p-3 rounded-xl bg-black/30 border border-white/5">
            <p className="text-xs text-gray-300 mb-1">TXID</p>
            <p className="text-xs font-mono text-kaspa-green break-all">{covenant.tx_id}</p>
          </div>

          {/* For creators: note that Fix tab is open above for the clean garage + stake. Dedicated full list page still available. */}
          {isCreator && (
            <Link to={`/covenant/${encodeURIComponent(id)}/fix`} className="mt-6 w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-kaspa-green/30 text-kaspa-green hover:bg-kaspa-green/10 transition-all text-sm font-semibold">
              <Palette size={16} /> Open Full Fix Page (manage all my covenants)
            </Link>
          )}
        </motion.div>

        {/* Right: Tabs - Arena / Play (default, public, pro chess.com style for chess) | Fix (creator only, super clean garage + 1 stake section) | Terminal (creator advanced only) */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="glass-panel rounded-3xl overflow-hidden flex flex-col"
        >
          <div className="flex items-center border-b border-white/5">
            <button
              onClick={() => setActiveTab('interact')}
              className={`flex-1 px-4 py-3.5 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                activeTab === 'interact'
                  ? 'text-kaspa-green bg-kaspa-green/[0.04] border-b-2 border-kaspa-green'
                  : 'text-gray-300 hover:text-gray-300'
              }`}
            >
              <Terminal size={14} />
              {gameType ? 'Arena / Play' : 'Interact'}
            </button>
            {/* Fix tab visible to creator only. Renders full clean Customization Garage + exactly 1 section for stake amount + rules + Publish. No paid nags. */}
            {isCreator && (
              <button
                onClick={() => setActiveTab('fix')}
                className={`flex-1 px-4 py-3.5 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                  activeTab === 'fix'
                    ? 'text-kaspa-green bg-kaspa-green/[0.04] border-b-2 border-kaspa-green'
                    : 'text-gray-300 hover:text-gray-300'
                }`}
              >
                <Palette size={14} />
                Fix
              </button>
            )}
            {/* Terminal ONLY for creator. Regular users never see terminal or settings. */}
            {isCreator && (
              <button
                onClick={() => setActiveTab('terminal')}
                className={`flex-1 px-4 py-3.5 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                  activeTab === 'terminal'
                    ? 'text-kaspa-green bg-kaspa-green/[0.06] border-b-2 border-kaspa-green'
                    : 'text-gray-300 hover:text-gray-300'
                }`}
              >
                <Code2 size={14} />
                Terminal
              </button>
            )}
          </div>

          <div className="p-8 flex-1">
            {activeTab === 'interact' ? (
              <div className="space-y-8">

                {/* SIMPLE FULL CHESS LOBBY: one chess.com board filling space, one timer, one rules table, one stake input. Easy and straightforward. */}
                {isChess && (
                  <div className="flex flex-col items-center justify-center py-4">
                    <div className="text-center mb-4">
                      <div className="text-emerald-400 text-sm tracking-[3px] font-bold">10 MIN WINNER TAKES ALL CHESS ARENA</div>
                      <div className="text-3xl font-semibold text-white mt-1">Full Screen Chess</div>
                    </div>

                    {/* Timers + board side by side to fill space like full screen */}
                    <div className="flex flex-col lg:flex-row gap-6 items-start w-full max-w-[1100px]">
                      {/* Large board fills main space */}
                      <div className="flex-1">
                        <Chessboard
                          position="start"
                          boardWidth={Math.min(580, (typeof window !== 'undefined' ? window.innerWidth : 580) - 48)}
                          customDarkSquareStyle={{ backgroundColor: '#b58863' }}
                          customLightSquareStyle={{ backgroundColor: '#f0d9b5' }}
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
                          <table className="w-full text-xs border border-emerald-500/30 rounded-xl overflow-hidden bg-black/40 text-emerald-100">
                            <tbody>
                              <tr className="border-b border-emerald-500/20"><td className="p-2 font-semibold">Game</td><td className="p-2">10 min per player (clock only on your turn)</td></tr>
                              <tr className="border-b border-emerald-500/20"><td className="p-2 font-semibold">Stake</td><td className="p-2">Any amount. Match exactly or auto return in 5 min</td></tr>
                              <tr className="border-b border-emerald-500/20"><td className="p-2 font-semibold">End</td><td className="p-2">Resign, timeout or checkmate</td></tr>
                              <tr className="border-b border-emerald-500/20"><td className="p-2 font-semibold">Payout</td><td className="p-2">Winner gets pot minus 2% to creator (sustains arena)</td></tr>
                              <tr><td className="p-2 font-semibold">Verify</td><td className="p-2">chess_v1 ZK + oracle lie detection</td></tr>
                            </tbody>
                          </table>
                          <div className="text-[10px] text-emerald-300/70 mt-1 text-center">Transparent • Non-custodial • Direct to covenant on Kaspa</div>
                        </div>
                      </div>
                    </div>

                    {/* Single stake input at bottom, straightforward */}
                    <div className="w-full max-w-md mt-6">
                      <div className="text-xs text-gray-400 mb-1.5 text-center tracking-widest">HOW MUCH KAS DO YOU WANT TO STAKE?</div>
                      <input 
                        type="number" 
                        value={chessStake} 
                        onChange={e => setChessStake(Math.max(1, parseInt(e.target.value) || 1))} 
                        className="w-full text-center text-5xl font-mono p-4 rounded-3xl bg-black/60 border-2 border-emerald-500/40 focus:border-emerald-500 mb-3" 
                      />
                      <button 
                        onClick={() => setShowChessArena(true)} 
                        className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xl rounded-3xl active:scale-[0.985] shadow-lg"
                      >
                        STAKE AND PLAY
                      </button>
                      <div className="text-center text-xs text-gray-500 mt-2">Launches the full interactive pro arena with real timers, moves, resign and oracle.</div>
                    </div>
                  </div>
                )}

                {/* Generic game lobby for every non-chess game covenant (poker, reversi, connect4, ...). */}
                {isOtherGame && (
                  <div className="flex flex-col items-center justify-center py-6">
                    <div className="text-center mb-5">
                      <div className="text-emerald-400 text-sm tracking-[3px] font-bold">WINNER TAKES POT • {GAME_REGISTRY[gameType].label.toUpperCase()} ARENA</div>
                      <div className="text-3xl font-semibold text-white mt-1">{GAME_REGISTRY[gameType].label}</div>
                      <p className="text-sm text-gray-400 mt-2 max-w-md mx-auto leading-relaxed">
                        Stake KAS and play a real {GAME_REGISTRY[gameType].label} match. Server-authoritative engine, oracle-attested result, winner takes the pot minus the creator fee. Non-custodial, direct to the covenant on Kaspa.
                      </p>
                    </div>
                    <div className="w-full max-w-md">
                      <div className="text-xs text-gray-400 mb-1.5 text-center tracking-widest">HOW MUCH KAS DO YOU WANT TO STAKE?</div>
                      <input
                        type="number"
                        value={chessStake}
                        onChange={e => setChessStake(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-full text-center text-5xl font-mono p-4 rounded-3xl bg-black/60 border-2 border-emerald-500/40 focus:border-emerald-500 mb-3"
                      />
                      <button
                        onClick={() => setShowGameArena(true)}
                        className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xl rounded-3xl active:scale-[0.985] shadow-lg"
                      >
                        STAKE AND PLAY
                      </button>
                      <div className="text-center text-xs text-gray-500 mt-2">Launches the full interactive arena with real moves and oracle resolution.</div>
                    </div>
                  </div>
                )}

                {/* Custom UI iframe ONLY for a genuine creator-published UI. Auto-generated
                    blobs are skipped so the clean native panel below speaks for the covenant. */}
                {hasCreatorUI && !isCreator && !isChess && (
                  <div className="mb-4">
                    <div className="text-xs uppercase tracking-widest text-kaspa-green/80 mb-1">Creator-Published Custom Interface</div>
                    <div className="rounded-2xl overflow-hidden border border-kaspa-green/20 bg-black/60">
                      <iframe srcDoc={covenant.custom_ui_html} title="Covenant Custom Transparent UI" className="w-full min-h-[520px] bg-[#0A0A0D]" sandbox="allow-scripts" />
                    </div>
                  </div>
                )}

                {/* General Amount to Lock + execute ONLY for non-chess covenants. For chess the pro arena panel above is the complete simple experience. */}
                {!isChess && (
                  <>
                    {covenant.redeem_kind && covenant.redeem_script_hex && (
                      <div className="p-4 rounded-2xl bg-purple-500/[0.06] border border-purple-500/25">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <ShieldCheck size={16} className="text-purple-300" />
                          <span className="text-sm font-bold text-white">Redeem this covenant</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 font-mono uppercase">{String(covenant.redeem_kind).split(':')[0]}</span>
                        </div>
                        <p className="text-xs text-gray-300 mb-3 leading-relaxed">
                          This is a script-enforced P2SH covenant. Spend it non-custodially with your own key. You provide the unlock condition (preimage / timelock / cosigners) on the next step. Covex never holds the funds.
                        </p>
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
                          <ShieldCheck size={16} /> Redeem / spend with my key
                        </Link>
                      </div>
                    )}
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
                              This covenant was created elsewhere, so its logic is opaque on-chain. If you have its <strong>redeem script</strong>, paste it below. Covex verifies it hashes to this exact on-chain commitment (so only someone who genuinely knows the script can do this), then it becomes fully redeemable and richly displayed for everyone. Fully trustless.
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
                      <div className="p-3 rounded-xl bg-amber-500/[0.06] border border-amber-500/25 text-xs text-amber-200/90 leading-relaxed">
                        <strong>Heads up:</strong> this covenant is metadata-only (not consensus-enforced). "Lock" sends KAS to the creator's address. There is no on-chain script forcing a payout back to you. Only interact if you trust the creator.
                        {covenant.creator_addr && (
                          <> <Link to={`/address/${encodeURIComponent(covenant.creator_addr)}`} className="underline text-amber-300">View creator</Link>.</>
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
                        className="w-full cyber-input text-4xl p-6 rounded-2xl font-mono placeholder:text-kaspa-green/20"
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

                    <button
                      onClick={handleExecute}
                      disabled={executing}
                      className="btn-shimmer w-full bg-kaspa-green text-black font-extrabold py-5 rounded-2xl text-lg hover:shadow-[0_0_40px_rgba(73,234,203,0.5)] transition-all disabled:opacity-60 disabled:cursor-wait flex items-center justify-center gap-3 uppercase tracking-wide"
                    >
                      {executing ? null : address ? <ShieldCheck size={24} /> : <Lock size={24} />}
                      {executing ? 'Processing...' : address ? 'Sign & Execute' : 'Interact with this covenant'}
                    </button>

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
                    stake={chessStake} 
                    onClose={() => setShowChessArena(false)} 
                    covenantId={covenant.tx_id}
                    creatorAddr={covenant.creator_addr}
                    feePercent={2}
                  />
                )}
                {showGameArena && isOtherGame && (() => {
                  const G = GAME_REGISTRY[gameType].Component;
                  return (
                    <G
                      stake={chessStake}
                      onClose={() => setShowGameArena(false)}
                      covenantId={covenant.tx_id}
                      feePercent={2}
                      potReturnPercent={2}
                    />
                  );
                })()}
              </div>
            ) : activeTab === 'fix' && isCreator ? (
              /* FIX TAB INLINE: super clean, lots of space, big text, minimal labels. Exactly the Customization Garage grid + ONE section for stake amount and all of that. Reuses the generator and publish. Focused on this covenant. */
              <div className="space-y-8">
                <div>
                  <div className="text-2xl font-semibold tracking-tight">Fix: Looks and Stake</div>
                  <div className="text-sm text-gray-400 mt-1">Creator only. Pick a template for instant preview. One clean section to set the stake amount and rules. Publish once. Everyone sees the nice transparent view.</div>
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
                              setToast({type:'success', msg: 'Template applied to preview. Publish to make live.'});
                            }} className={`flex-1 text-xs py-1.5 rounded-xl font-medium ${active ? 'bg-kaspa-green text-black' : 'bg-white/10 hover:bg-white/15'}`}>{active ? 'Chosen' : 'Choose'}</button>
                            <button onClick={() => {
                              const html = buildTransparentCustomUI(covenant, {...config, ...tpl.config});
                              // quick preview in new window or toast; for full use the /fix page or iframe below
                              setToast({type:'success', msg: 'Preview generated. Use publish to update live covenant.'});
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
                    <input value={config.titleOverride || ''} onChange={e => setConfig(s => ({...s, titleOverride: e.target.value}))} placeholder={covenant.name || 'Covenant title'} className="w-full rounded-2xl bg-black/40 border border-white/10 px-4 py-3 text-sm focus:border-kaspa-green/40" />
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-widest text-gray-500 mb-1.5">Short description (optional)</div>
                    <input value={config.descOverride || ''} onChange={e => setConfig(s => ({...s, descOverride: e.target.value}))} placeholder={covenant.description || 'What this covenant does'} className="w-full rounded-2xl bg-black/40 border border-white/10 px-4 py-3 text-sm focus:border-kaspa-green/40" />
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-widest text-gray-500 mb-1.5">Accent color</div>
                    <div className="flex gap-2 flex-wrap">
                      {['#49EACB','#E8AF34','#10B981','#3B82F6','#8B5CF6','#EC4899','#F59E0B'].map(c => (
                        <button key={c} onClick={() => setConfig(s => ({...s, primaryColor: c}))} className={`h-8 w-8 rounded-full border-2 ${config.primaryColor === c ? 'border-white scale-110' : 'border-transparent'}`} style={{ background: c }} />
                      ))}
                      <input type="color" value={config.primaryColor} onChange={e => setConfig(s => ({...s, primaryColor: e.target.value}))} className="h-8 w-9 rounded border-0 p-0 overflow-hidden" />
                    </div>
                  </div>
                </div>

                {/* EXACTLY 1 SECTION for stake amount and all of that - super clean simple easy */}
                <div className="rounded-3xl border border-white/10 bg-white/[0.015] p-6">
                  <div className="font-semibold text-xl tracking-tight mb-1">Stake amount and all of that</div>
                  <div className="text-sm text-gray-400 mb-5">Just set the number. Everything else is fixed, transparent, and already explained to players. One publish updates the public view.</div>

                  <div className="text-xs uppercase tracking-[1.5px] text-gray-500 mb-2">AMOUNT TO STAKE (KAS)</div>
                  <input
                    type="number"
                    value={chessStake}
                    onChange={e => setChessStake(Math.max(1, parseInt(e.target.value || '1', 10)))}
                    className="w-full text-center text-6xl font-semibold tabular-nums tracking-[-2px] py-4 bg-transparent border border-white/10 rounded-3xl focus:outline-none focus:border-kaspa-green/40 mb-1"
                  />
                  <div className="text-center text-xs text-gray-500 mb-6">per player for this chess arena</div>

                  {/* Clean rules paragraph, all in order, simplistic transparent */}
                  <div className="rounded-2xl bg-black/40 border border-white/10 p-5 text-sm text-gray-200 leading-relaxed mb-6">
                    10 minute winner takes all chess.<br/><br/>
                    Second player must match the stake within 5 minutes or the funds return automatically to the staker.<br/><br/>
                    Each player gets a 10 minute clock. Only the active player clock runs.<br/><br/>
                    Resign, timeout or checkmate ends the game.<br/><br/>
                    Winner receives the pot minus 2 percent. The 2 percent goes to the creator address to keep the arena running for the next games.<br/><br/>
                    All stakes are sent directly to the covenant address on Kaspa. Fully non-custodial.<br/><br/>
                    The chess v1 ZK circuit plus the oracle detects any lie or invalid play and can reject bad results.
                  </div>

                  <button
                    onClick={async () => {
                      // publishCustomUI already shows the accurate success/error toast and
                      // returns whether it actually published. Only add the extra success
                      // note when it really went live - never claim success on failure.
                      const ok = await publishCustomUI(false);
                      if (ok) {
                        setToast({ type: 'success', msg: 'Published! The public view and arena now reflect your settings. Refresh to see for visitors.' });
                      }
                    }}
                    className="w-full py-4 bg-kaspa-green hover:bg-[#3bc2a6] active:scale-[0.985] text-black font-bold rounded-3xl flex items-center justify-center gap-2 text-base"
                  >
                    <Save size={18} /> PUBLISH LOOKS + STAKE SETTINGS
                  </button>
                  <div className="text-[10px] text-center text-gray-500 mt-2">Changes are immediate for the transparent public experience. No terminal shown to regular users.</div>
                </div>

                {/* Quick live preview of what publish produces */}
                <div>
                  <div className="text-xs uppercase tracking-[1.5px] text-gray-500 mb-2 flex items-center gap-2"><Eye size={14}/> Live preview of what regular users will see</div>
                  <div className="rounded-3xl overflow-hidden border border-white/10 bg-black">
                    <iframe srcDoc={buildTransparentCustomUI(covenant, { ...config, titleOverride: config.titleOverride || (isChess ? '10min Chess Arena' : undefined), publicAbout: config.publicAbout, publicRules: config.publicRules, publicHowTo: config.publicHowTo })} className="w-full h-[420px] bg-[#050507]" sandbox="allow-scripts" title="Fix preview" />
                  </div>
                </div>
              </div>
            ) : activeTab === 'terminal' ? (
              /* ── Terminal Tab: ONLY the creator sees this (to deploy custom nice UI, ZK, oracles, etc). Regular users never see terminal or settings. ── */
              isCreator ? (
                <div className="-m-8">
                  <CovexTerminal covenant={covenant} />
                </div>
              ) : (
                <div className="p-8 text-center border border-white/10 rounded-2xl bg-black/30">
                  <Lock size={32} className="mx-auto mb-4 text-amber-400" />
                  <h3 className="text-xl font-bold text-white mb-2">Creator Tools</h3>
                  <p className="text-gray-300 mb-6 max-w-md mx-auto">Advanced terminal (ZK circuits, oracles, custom UI deployment) is only available to the creator of this covenant.</p>
                </div>
              )
            ) : activeTab === 'fix' && isCreator ? (
              /* Fix Tab (creator only): the super clean 1 section manager right inside the covenant page exactly as requested */
              <div className="space-y-6">
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                  <h3 className="text-lg font-semibold text-white mb-1">Fix: Manage Looks + Stake</h3>
                  <p className="text-xs text-gray-400">Super clean. One section for the stake amount and all the rules. Changes publish as the transparent view everyone else sees.</p>
                </div>
                <Link to={`/covenant/${encodeURIComponent(id)}/fix`} className="block w-full text-center px-6 py-4 rounded-3xl bg-kaspa-green text-black font-bold text-base">
                  Open Full Fix Manager (Garage + Single Stake Section)
                </Link>
                <div className="text-[11px] text-gray-500 text-center">The full clean editor (templates, live preview, one big stake input + rules) lives here and on the dedicated /fix page. All previous requirements (no paid hints, simplistic, transparent) are enforced.</div>
              </div>
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
                <Link to={`/covenant/${encodeURIComponent(id)}/fix`} className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-kaspa-green text-black font-bold">
                  Open Fix
                </Link>
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* Custom UI Rendering: creator published transparent view (via Fix page).
          Reserved for genuine creator UIs - auto-generated blobs are never framed here. */}
      {hasCreatorUI && (
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
              className="ml-auto px-4 py-2 rounded-lg bg-kaspa-green/10 border border-kaspa-green/30 text-kaspa-green text-xs font-bold hover:bg-kaspa-green/20 transition-all flex items-center gap-2"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"/></svg>
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
          <div className="relative border border-kaspa-green/20 bg-black/50 rounded-2xl overflow-hidden" style={{width: 420, height: 260, margin: '0 auto'}}>
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
                        toast.success('Stake sent (real tx on testnet)!');
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
                className="p-2 rounded-lg hover:bg-white/5 text-gray-200 hover:text-white transition-colors"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
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

      {/* Disclaimer */}
      <div className="glass-panel p-6 mt-8 text-xs text-gray-200 leading-relaxed max-w-3xl mx-auto">
        <p className="text-gray-300 font-semibold mb-2">Transparency Notice</p>
        <p>
          This covenant is immutable on the Kaspa BlockDAG. Covex does not create, modify, or control
          it. We only index publicly available data. All interactions occur
          non-custodially through your own wallet. You bear full responsibility for verifying all transaction details before signing.
        </p>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[100] animate-in slide-in-from-right-4 duration-300">
          <div className={`px-5 py-3.5 rounded-2xl shadow-2xl border flex items-center gap-3 ${
            toast.type === 'success'
              ? 'bg-emerald-900/40 border-emerald-500/30 text-emerald-300'
              : 'bg-gray-900/40 border-gray-500/30 text-gray-300'
          }`}>
            <CheckCircle2 size={18} className="text-emerald-400" />
            <span className="text-sm font-medium">{toast.msg}</span>
          </div>
        </div>
      )}

      {/* Upgrade Modal */}
      {showUpgrade && upgradeTier && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/85 backdrop-blur-xl">
          <div className="w-full max-w-lg bg-[#0f0f14] rounded-3xl border border-white/[0.06] shadow-2xl p-7 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white tracking-tight">
                Upgrade Covenant: {covenant.name || TRUNC(covenant.tx_id)}
              </h3>
              <button onClick={() => setShowUpgrade(false)} className="text-gray-300 hover:text-white transition-colors text-2xl leading-none">
                &times;
              </button>
            </div>

            {upgradeQr ? (
              <div className="flex flex-col items-center space-y-5">
                <div className="p-4 bg-white rounded-xl">
                  <QRCodeCanvas value={getUpgradeUri(upgradeTier)} size={200} level="H" includeMargin={false} />
                </div>
                <p className="text-sm text-gray-300 text-center">
                  Pay exactly <span className="font-bold text-kaspa-green">{upgradeTier.price} KAS</span>
                </p>
                <p className="text-xs text-gray-300 break-all font-mono">{getUpgradeUri(upgradeTier)}</p>
                <button onClick={() => setUpgradeQr(false)} className="w-full py-3 rounded-xl bg-white/5 border border-white/10 text-gray-300 text-sm hover:bg-white/10 transition-colors">
                  Back to Payment Options
                </button>
              </div>
            ) : upgradePaid ? (
              <div className="text-center space-y-5">
                <div className="h-16 w-16 mx-auto rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
                  <Check size={28} className="text-emerald-400" />
                </div>
                <div>
                  <p className="text-lg font-semibold text-white">Payment Sent</p>
                  <p className="text-sm text-gray-200 mt-1">
                    Your payment of {upgradeTier.price} KAS is being processed. After 6 confirmations (approximately 1-2 minutes), your covenant will be upgraded to {upgradeTier.label} tier and unlock the interactive UI builder.
                  </p>
                </div>
                <button onClick={() => setShowUpgrade(false)} className="w-full py-3 rounded-xl bg-kaspa-green text-black font-semibold text-sm active:scale-[0.97] transition-all">
                  Done
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-gray-200">
                  Select a tier to upgrade this covenant. After payment, you will unlock the interactive UI builder, full disclosure, and a verified badge.
                </p>
                <div className="space-y-2">
                  {TIER_OPTIONS.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setUpgradeTier(t)}
                      className={`w-full flex items-center gap-4 p-4 rounded-2xl border transition-all text-left ${
                        upgradeTier.id === t.id
                          ? 'border-kaspa-green/40 bg-kaspa-green/[0.04] ring-1 ring-kaspa-green/30'
                          : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]'
                      }`}
                    >
                      <div className="shrink-0 h-10 w-10 rounded-xl flex items-center justify-center border" style={{ backgroundColor: `${t.color}15`, borderColor: `${t.color}40` }}>
                        <span className="text-sm font-bold" style={{ color: t.color }}>{t.label.slice(0, 1)}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white">{t.label}</p>
                        <p className="text-xs text-gray-300">{t.desc}</p>
                      </div>
                      <span className="text-sm font-bold text-kaspa-green tabular-nums">{t.price} KAS</span>
                    </button>
                  ))}
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => handleUpgradePay(upgradeTier)}
                    className="flex-1 py-3 rounded-xl bg-kaspa-green text-black font-semibold text-sm active:scale-[0.97] transition-all"
                  >
                    Pay {upgradeTier.price} KAS
                  </button>
                  <button
                    onClick={() => setUpgradeQr(true)}
                    className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-white/10 text-gray-300 text-sm hover:bg-white/[0.04] transition-colors"
                  >
                    <QrCode size={16} />
                    QR Code
                  </button>
                </div>
                <div className="relative flex items-center py-2">
                  <div className="flex-grow border-t border-white/10"></div>
                  <span className="flex-shrink-0 mx-3 text-[10px] text-gray-200 uppercase">Testnet Faucet</span>
                  <div className="flex-grow border-t border-white/10"></div>
                </div>
                {(localStorage.getItem('kaspaNetwork') || 'testnet-12') !== 'mainnet' && (
                <button
                  onClick={() => handleSimulatePayment(upgradeTier)}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-kaspa-gold/40 bg-kaspa-gold/[0.05] text-kaspa-gold font-semibold text-sm hover:bg-kaspa-gold/10 hover:border-kaspa-gold/60 transition-all"
                >
                  <Zap size={16} />
                  Simulate tKAS Payment (Faucet)
                </button>
                )}
                <p className="text-[11px] text-gray-200 text-center">All payments are one-time and non-refundable. Processing takes 6 confirmations.</p>
              </div>
            )}
          </div>
        </div>
      )}

      <DevWalletModal isOpen={walletModalOpen} onClose={() => setWalletModalOpen(false)} />
    </div>
  );
}
