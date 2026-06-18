import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from '../components/ToastContext';
import { useWallet } from '../components/WalletContext';
import { signCovenantOwnership } from '../lib/ownership';
import {
  ArrowLeft, Sparkles, Cpu, Zap, Code, Layers, Shield, Terminal, ChevronRight,
  Plus, Check, Copy, Loader2, Play, Palette, Users, Clock, Coins, Eye, Award, Crown, Star, Send,
  Lock, ShieldCheck, KeyRound
} from 'lucide-react';
import { ZK_CIRCUIT_TYPES } from '../components/CovexTerminal';
import { CircuitGlyph } from '../lib/circuitIcon';

// Dynamic icon fallback
const getIcon = (id) => {
  if (id.includes('chess') || id.includes('poker') || id.includes('blackjack') || id.includes('go') || id.includes('backgammon')) return Shield;
  if (id.includes('merkle') || id.includes('range') || id.includes('script') || id.includes('utxo')) return Layers;
  if (id.includes('timelock') || id.includes('vesting')) return Clock;
  if (id.includes('compute') || id.includes('risc') || id.includes('wasm') || id.includes('ml')) return Cpu;
  if (id.includes('defi') || id.includes('auction') || id.includes('escrow') || id.includes('lending') || id.includes('yield')) return Coins;
  return Code;
};

const NET_TREASURIES = {
  'testnet-12': 'kaspatest:qpyfz03k6quxwf2jglwkhczvt758d8xrq99gl37p6h3vsqur27ltjhn68354m',
  'testnet-10': 'kaspatest:qpyfz03k6quxwf2jglwkhczvt758d8xrq99gl37p6h3vsqur27ltjhn68354m', // same as TN12 for dev (real one loaded from env in prod)
  'mainnet': 'kaspa:qr6vs4wy4m3za6mzchj05x3902qrtklkyn8s0u8g2gv6mrctzdzx7pnhqxka2' // real mainnet treasury (from env in prod)
};

function getTreasuryForNet(net) {
  return NET_TREASURIES[net] || NET_TREASURIES['testnet-12'];
}

export default function PremiumBuilder() {
  const navigate = useNavigate();
  const { address, DevConnectPanel, signMessage, isDevMode, devMode } = useWallet();

  // === SERVER AUTH (ONLY source of truth - no localStorage bypass) ===
  const [auth, setAuth] = useState({ token: null, tier: null, address: null, loading: true, error: null });
  const [justPaid, setJustPaid] = useState(null);

  const paidTier = auth.tier || 'FREE';
  const hasValidToken = !!auth.token && paidTier !== 'FREE';
  const tierAccent = { BUILDER: '#3B82F6', PRO: '#E8AF34', MAX: '#A855F7' }[paidTier] || '#6B7280';
  const tierBadge = { BUILDER: 'BUILDER', PRO: 'PRO', MAX: 'MAX' }[paidTier] || 'PAID';

  // Fresh payment from Pricing
  useEffect(() => {
    const raw = sessionStorage.getItem('payment_just_confirmed');
    if (raw) { try { setJustPaid(JSON.parse(raw)); sessionStorage.removeItem('payment_just_confirmed'); } catch (_) {} }
  }, []);

  // Advanced config handed off from /composer (AdvancedComposer writes it to
  // sessionStorage then navigates here). This was never read, so a user's advanced
  // primitives + multi-oracle settings were silently dropped before deploy. Carry it
  // through so it is persisted with the covenant instead of lost.
  const [pendingConfig, setPendingConfig] = useState(null);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('pending_covenant_config');
      if (raw) { setPendingConfig(JSON.parse(raw)); sessionStorage.removeItem('pending_covenant_config'); }
    } catch (_) { /* ignore malformed handoff */ }
  }, []);

  // Server auth session (the only way in)
  useEffect(() => {
    if (!address) { setAuth({ token: null, tier: null, address: null, loading: false, error: null }); return; }
    setAuth(p => ({ ...p, loading: true }));
    const net = (typeof window !== 'undefined' && localStorage.getItem('kaspaNetwork')) || 'testnet-12';
    fetch('/api/auth-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, network: net })
    })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(data => {
        if (data?.token && data?.tier && data.tier !== 'FREE') {
          setAuth({ token: data.token, tier: data.tier, address, loading: false, error: null });
        } else {
          setAuth({ token: null, tier: 'FREE', address, loading: false, error: data?.error || 'No paid tier' });
        }
      })
      .catch(e => setAuth({ token: null, tier: 'FREE', address, loading: false, error: e.message }));
  }, [address]);

  // Redirect if no token
  useEffect(() => {
    if (!auth.loading && (!auth.token || auth.tier === 'FREE')) {
      if (address) navigate('/pricing', { replace: true });
    }
  }, [auth.loading, auth.token, auth.tier, address, navigate]);

  // === COVENANT CREATION STATE (best UX for paid users) ===
  const net = (typeof window !== 'undefined' && localStorage.getItem('kaspaNetwork')) || 'testnet-12';
  const isMainnet = net === 'mainnet' || net === 'mainnet-1';
  const treasury = getTreasuryForNet(net);

  // === ON-CHAIN ENFORCEMENT (1.1: real script-locked custody, no decorative deploy) ===
  const [enforceKind, setEnforceKind] = useState('singlesig');
  const [stakeKas, setStakeKas] = useState('1.0');
  const [lockBlocks, setLockBlocks] = useState('100');
  const [tipDaa, setTipDaa] = useState(null);
  const canSign = isDevMode && devMode?.privateKeyHex;

  // Live chain DAA score (needed to compute a timelock unlock height).
  useEffect(() => {
    fetch('/api/status').then(r => r.json()).then(j => {
      const n = j.node_sync && j.node_sync[net];
      if (n && n.tip_daa) setTipDaa(n.tip_daa);
    }).catch(() => {});
  }, [net]);

  // Library + selection
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('all');
  const [selectedCircuitId, setSelectedCircuitId] = useState('chess_v1');

  const filtered = ZK_CIRCUIT_TYPES.filter(c => {
    const s = search.toLowerCase();
    const matches = !s || c.name.toLowerCase().includes(s) || c.description.toLowerCase().includes(s);
    const catOk = catFilter === 'all' || c.category === catFilter;
    return matches && catOk;
  });

  const activeCircuit = ZK_CIRCUIT_TYPES.find(c => c.id === selectedCircuitId) || ZK_CIRCUIT_TYPES[0];

  // === Custom Circuit Composition (paid users compose real Kaspa covenant logic) ===
  const [customBases, setCustomBases] = useState(['merkle_membership', 'range_proof']);
  const [customCircuitName, setCustomCircuitName] = useState('My DAO Collateral Arena');
  const [customDesc, setCustomDesc] = useState('Players prove collateral range + merkle membership. Real per-turn timer. VRF + oracle hybrid resolution.');
  const [params, setParams] = useState({ players: 4, turnTimerSec: 60, collateralMin: 10, resolution: 'hybrid', winnerPct: 92, treasuryPct: 3 });
  const [customTheme, setCustomTheme] = useState('#22C55E');

  const addBase = (id) => { if (!customBases.includes(id)) setCustomBases([...customBases, id]); };
  const removeBase = (id) => setCustomBases(customBases.filter(b => b !== id));

  // === FULL COVENANT DESIGN (name it, make it look however you want, disclose everything) ===
  const [covenantName, setCovenantName] = useState('Kaspa Chess Club - Season 3');
  const [covenantDesc, setCovenantDesc] = useState('FIDE chess with real per-turn timers (only active player clock decrements). <30s = red. Zero = auto-resolve + oracle payout. Top visibility paid covenant.');
  const [themeAccent, setThemeAccent] = useState('#49EACB');
  const [lookPreset, setLookPreset] = useState('classic');

  // Advanced primitives + multi-oracle config carried over from /advanced. Persisted with
  // the covenant definition so the composed selections are not dropped on deploy.
  const [advancedPrimitives, setAdvancedPrimitives] = useState(null);
  const [multiOracle, setMultiOracle] = useState(null);

  // Consume the /advanced handoff once it has been read in. Pre-fill the builder with the
  // exact composed selections (primitives, multi-oracle threshold, circuit, resolution,
  // name/description/theme) so what was composed is what gets deployed.
  useEffect(() => {
    if (!pendingConfig) return;
    const cov = pendingConfig.covenant || {};
    const res = pendingConfig.resolution || {};
    if (cov.name) setCovenantName(cov.name);
    if (cov.description) setCovenantDesc(cov.description);
    const accent = pendingConfig.ui?.theme?.primaryColor;
    if (accent) { setThemeAccent(accent); setCustomTheme(accent); }
    const circuitType = res.circuit?.type;
    if (circuitType) {
      if (ZK_CIRCUIT_TYPES.some(c => c.id === circuitType)) setSelectedCircuitId(circuitType);
      setCustomBases(prev => (prev.includes(circuitType) ? prev : [...prev, circuitType]));
    }
    if (res.mode) setParams(p => ({ ...p, resolution: res.mode }));
    if (res.advancedPrimitives) setAdvancedPrimitives(res.advancedPrimitives);
    if (res.oracle?.multiOracle) setMultiOracle(res.oracle.multiOracle);
  }, [pendingConfig]);

  // Transparent disclosure (auto from net + connected wallet + treasury)
  const disclosedWallets = [
    { role: 'Creator (you)', addr: address || 'connect wallet' },
    { role: isMainnet ? 'Mainnet Treasury (REAL KAS - verify on-chain)' : 'Testnet Treasury (dev funded)', addr: treasury },
    { role: 'Dev (testnet only - transparent for debugging)', addr: isMainnet ? 'N/A (real wallet only on mainnet)' : 'dev-wallet-per-net (see /api/status or env)' },
  ];

  // Live preview data
  const previewName = covenantName || customCircuitName;
  const previewAccent = themeAccent || customTheme;

  // Generate rich covenant definition (used for display + future deploy payload)
  const generateCovenantDef = useCallback(() => {
    const isCustomCircuit = customBases.length > 0;
    const circuit = isCustomCircuit ? { custom: true, bases: customBases, params } : { id: activeCircuit.id, name: activeCircuit.name, circuit: activeCircuit.circuit };
    return {
      name: previewName,
      description: covenantDesc || customDesc,
      network: net,
      circuit,
      theme: { accent: previewAccent, preset: lookPreset },
      disclosedWallets,
      resolution: params.resolution || 'hybrid',
      // Carry composed advanced primitives + multi-oracle threshold so they are persisted
      // with the covenant instead of dropped (was a dead /advanced -> /premium handoff).
      ...(advancedPrimitives ? { advancedPrimitives } : {}),
      ...(multiOracle ? { multiOracle } : {}),
      enforce: { kind: enforceKind },
      createdAt: new Date().toISOString(),
      paidWithToken: auth.token, // proof it was paid
      requiresDeploymentCredit: true
    };
  }, [previewName, covenantDesc, customDesc, net, activeCircuit, customBases, params, previewAccent, lookPreset, disclosedWallets, advancedPrimitives, multiOracle, enforceKind, auth.token]);

  const [generatedDef, setGeneratedDef] = useState(null);
  const [deploying, setDeploying] = useState(false);
  const [deployResult, setDeployResult] = useState(null);

  const handleGenerate = () => {
    const def = generateCovenantDef();
    setGeneratedDef(def);
  };

  // THE KEY (1.1 - everything trustless): deploy a REAL script-enforced P2SH covenant,
  // then layer the premium custom UI on top. The stake locks to a Kaspa script hash and
  // is redeemable non-custodially by the creator's own key - no Covex key in the payout
  // path, no decorative metadata commitment. The look/branding is unchanged; only the
  // deploy primitive became genuinely consensus-enforced.
  const handleCreateAndDeploy = async () => {
    if (!auth.token) { toast.error('No valid auth token. Pay first.'); return; }
    if (!address) { toast.error('Connect your wallet first.'); return; }
    if (isMainnet) {
      setDeployResult({ success: false, error: 'Enforced on-chain deploy on mainnet needs wallet-side funding (coming soon). Switch to a testnet to deploy a real script-enforced covenant now.' });
      return;
    }
    if (!canSign) {
      setDeployResult({ success: false, error: 'Connect a testnet key (in the On-chain Enforcement panel) to sign the real on-chain deploy.' });
      return;
    }
    setDeploying(true);
    try {
      const def = generateCovenantDef();
      const net = (typeof window !== 'undefined' && localStorage.getItem('kaspaNetwork')) || 'testnet-12';

      // Build the enforced redeem for the chosen primitive. singlesig/timelock/hashlock
      // all lock to the deployer's OWN key, so the deployer (and only the deployer) can
      // redeem - reproducible from the on-chain redeem script with recover-covenant.mjs.
      const stakeAmt = parseFloat(stakeKas);
      if (!(stakeAmt > 0)) throw new Error('Enter a stake greater than 0 KAS to lock.');
      const redeem = { kind: enforceKind };
      let preimage = null;
      if (enforceKind === 'hashlock') {
        const b = new Uint8Array(24);
        (window.crypto || window.msCrypto).getRandomValues(b);
        preimage = Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('');
        redeem.preimage_hex = preimage;
      } else if (enforceKind === 'timelock') {
        if (!tipDaa) throw new Error('Could not read the chain DAA score yet. Try again in a moment.');
        redeem.lock_daa = tipDaa + Math.max(1, parseInt(lockBlocks || '100', 10));
      }

      const deployRes = await fetch('/api/covenant/p2sh/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          network: net,
          deployer_addr: address,
          use_dev_mode: false,
          private_key_hex: devMode.privateKeyHex,
          stake_kas: stakeAmt,
          redeem,
        }),
      });
      const deployJson = await deployRes.json();
      if (!deployJson.success) throw new Error(deployJson.error || 'Enforced deploy failed');
      const txid = deployJson.deploy_tx_id;
      // Enforced covenants are indexed immediately at "<tx>:0" - key all custom UI +
      // metadata there so the covenant page (/covenant/<tx>:0) renders the premium look.
      const covId = `${txid}:0`;

      // Generate the self-contained custom UI (premium look) for the covenant iframe.
      const customUiHtml = generateCustomUiHtml(def, txid, deployJson);

      // Save terminal config (custom UI). The enforced covenant is indexed at once WITH
      // the creator address, so the save requires an ownership signature over the
      // "<tx>:0" challenge - sign it with the same wallet that deployed.
      let ownerProof = { signer_address: address };
      try {
        ownerProof = await signCovenantOwnership(covId, address, signMessage);
      } catch { /* fall through: backend allows the first save if not yet protected */ }
      const termRes = await fetch(`/api/terminal-config/${encodeURIComponent(covId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: def.name,
          description: def.description,
          fee_percent: 2.0,
          reusable: true,
          allow_topups: false,
          custom_ui_code: customUiHtml,
          resolution_mode: def.resolution,
          zk_circuit: def.circuit?.id || null,
          zk_verifier_key: null,
          custom_oracle_key: null,
          ...ownerProof,
        }),
      });
      const termJson = await termRes.json();

      // Persist covenant metadata (theme, disclosed wallets, circuit) on the same id.
      // Featured metadata is ownership-gated (M1): the backend requires a wallet
      // signature over a single-use challenge before it will feature an indexed,
      // creator-known covenant. The terminal-config save above consumed its own
      // nonce, so sign a FRESH challenge here. If signing fails the save still
      // persists, just not featured.
      let metaProof = {};
      try { metaProof = await signCovenantOwnership(covId, address, signMessage); } catch { /* persists unfeatured */ }
      await fetch('/api/covenant-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tx_id: covId,
          name: def.name,
          description: def.description,
          disclosed_wallets: def.disclosedWallets,
          theme: def.theme,
          custom_circuit: def.circuit,
          resolution: def.resolution,
          paid_token: auth.token,
          network: def.network,
          ...metaProof,
        })
      });

      setDeployResult({
        success: true,
        message: `Stake of ${stakeAmt} KAS locked in a real script-enforced ${enforceKind} covenant. Kaspa consensus enforces custody and it is redeemable non-custodially by your key - no Covex key in the payout path. Custom premium UI saved.`,
        def,
        txid,
        covId,
        p2sh: deployJson.p2sh_address,
        redeem_script_hex: deployJson.redeem_script_hex,
        preimage,
        lock_daa: redeem.lock_daa || null,
        terminalSaved: termJson.success,
        metadataSaved: true,
        next: `View your covenant at /covenant/${covId}?tab=terminal`,
      });

      // Clear token from memory (consumed server-side)
      setAuth(a => ({ ...a, token: null }));
    } catch (e) {
      setDeployResult({ success: false, error: e.message });
    } finally {
      setDeploying(false);
    }
  };

  // Build the feature tiles that HONESTLY describe the deployed covenant. The on-chain
  // enforcement kind (singlesig/timelock/hashlock) and stake are always true; the
  // Players / Turn Timer tiles are gameplay attributes that only apply when a game
  // circuit was actually selected, so they are emitted only for game covenants. (Bug:
  // these were hard-coded onto every page from the game-default params, asserting
  // gameplay the covenant lacks - a correctness and honesty defect.)
  function buildFeatureTiles(def, deploy = {}) {
    const esc = (s) => String(s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
    const circuitLabel = def.circuit?.name || (def.circuit?.bases || []).join(' + ') || 'Custom';
    const tiles = [
      `🎯 Circuit: ${esc(circuitLabel)}`,
      '🔒 Script-enforced custody',
      '🔑 Non-custodial redeem',
      '📋 Full Disclosure',
    ];
    const kind = def.enforce?.kind || enforceKind;
    if (kind === 'timelock') {
      const lockDaa = deploy.lock_daa || def.circuit?.params?.lock_daa;
      tiles.push(lockDaa ? `⏳ Unlocks at DAA ${esc(lockDaa)}` : '⏳ Timelock (DAA height)');
    } else if (kind === 'hashlock') {
      tiles.push('🗝 Secret-reveal unlock');
    } else {
      tiles.push('🔐 Single-key redeem');
    }
    const stake = parseFloat(stakeKas);
    if (stake > 0) tiles.push(`💰 ${esc(stake)} KAS staked`);
    // Game-only tiles: emit Players / Turn Timer only when the ACTUAL deployed circuit is a
    // game. Derive from def.circuit (what is persisted), not the unrelated library selection:
    // a custom covenant carries `bases`, a single covenant carries `id`. A timelock vault,
    // merkle/range proof, etc. are non-game and must not assert gameplay attributes.
    const gameRe = /chess|poker|blackjack|backgammon|game/i;
    const singleCircuit = def.circuit?.id ? ZK_CIRCUIT_TYPES.find(c => c.id === def.circuit.id) : null;
    const isGame = singleCircuit
      ? singleCircuit.category === 'game'
      : (def.circuit?.bases || []).some(b => gameRe.test(b));
    if (isGame) {
      tiles.push(`👥 ${esc(params.players)} Players`);
      tiles.push(`⏱ ${esc(params.turnTimerSec)}s Turn Timer`);
    }
    return tiles;
  }

  // Generate self-contained interactive HTML for the covenant iframe
  function generateCustomUiHtml(def, txid, deploy = {}) {
    const accent = def.theme.accent;
    const p2sh = deploy.p2sh_address || '';
    const featureTiles = buildFeatureTiles(def, deploy)
      .map(t => `    <div class="feature">${t}</div>`)
      .join('\n');
    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${def.name} - Covex Premium Covenant</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#05050A;color:#e2e8f0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:1rem;}
  .card{max-width:560px;width:100%;background:#0a0a0a;border:1px solid ${accent}30;border-radius:16px;padding:2rem;}
  .header{display:flex;align-items:center;gap:12px;margin-bottom:1.5rem;}
  .badge{background:${accent}15;border:1px solid ${accent}30;color:${accent};padding:4px 10px;border-radius:999px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;}
  .disclosure{margin-top:1.5rem;padding:1rem;background:rgba(255,255,255,0.03);border-radius:12px;font-size:11px;color:#94a3b8;}
  .disclosure-row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.04);}
  .disclosure-row:last-child{border-bottom:none;}
  .label{color:#64748b;font-weight:600;}
  .value{font-family:monospace;color:${accent};font-size:10px;word-break:break-all;max-width:240px;text-align:right;}
  h2{color:${accent};font-size:1.25rem;font-weight:800;}
  p{color:#94a3b8;font-size:0.875rem;line-height:1.5;margin-top:0.5rem;}
  .features{margin-top:1.25rem;display:grid;grid-template-columns:1fr 1fr;gap:8px;}
  .feature{background:rgba(255,255,255,0.03);border-radius:8px;padding:8px 10px;font-size:12px;color:#cbd5e1;display:flex;align-items:center;gap:6px;}
  .tx-link{margin-top:1rem;font-size:10px;font-family:monospace;color:#64748b;word-break:break-all;}
  .footer{margin-top:1.5rem;text-align:center;font-size:10px;color:#475569;}
</style></head>
<body>
<div class="card">
  <div class="header">
    <span class="badge">ON-CHAIN ENFORCED</span>
    <span class="badge">${def.resolution.toUpperCase()}</span>
    <span class="badge">${def.network.toUpperCase()}</span>
  </div>
  <h2>${def.name}</h2>
  <p>${def.description}</p>
  <div class="features">
${featureTiles}
  </div>
  ${p2sh ? `<div class="tx-link">Locked to P2SH: ${p2sh}</div>` : ''}
  <div class="disclosure">
    <div style="font-weight:700;margin-bottom:8px;color:#cbd5e1;">Full Wallet Disclosure (Transparent)</div>
    ${def.disclosedWallets.map(w => `<div class="disclosure-row"><span class="label">${w.role}</span><span class="value">${w.addr}</span></div>`).join('')}
  </div>
  <div class="tx-link">Covenant: ${txid}</div>
  <div class="footer">Script-enforced P2SH covenant on Kaspa · redeemable non-custodially by the creator's key · transparent and permanent</div>
</div>
</body>
</html>`;
  }

  const categories = ['all', 'game', 'crypto', 'ownership', 'defi', 'compute', 'gating', 'custom', 'other'];

  if (auth.loading) {
    return <div className="min-h-[60vh] flex items-center justify-center text-gray-400">Checking payment status via server...</div>;
  }
  if (!hasValidToken) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 text-center">
        <Award className="mx-auto mb-4" size={48} />
        <h1 className="text-3xl font-black mb-3">Paid Covenant Studio</h1>
        <p className="text-gray-400 mb-6">Server-verified payment required. Only the wallet that paid can create personalized covenants with full customization, advanced circuits, and top visibility.</p>
        <button onClick={() => navigate('/pricing')} className="px-8 py-3 rounded-xl bg-white text-black font-semibold">Go to Pricing & Pay</button>
      </div>
    );
  }

  return (
    <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-10">
      <button onClick={() => navigate('/paid-builder')} className="flex items-center gap-2 text-gray-300 hover:text-white mb-6 text-sm font-medium">
        <ArrowLeft size={16} /> Back to My Covenants
      </button>

      {/* Header - professional, logo, clear paid status */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <img src="/covex-logo-48.png" alt="Covex" width="36" height="36" className="drop-shadow-[0_0_8px_rgba(0,255,157,0.45)] rounded" />
          {paidTier === 'BUILDER' && <Terminal size={16} style={{ color: tierAccent }} />}
          {paidTier === 'PRO' && <Star size={16} style={{ color: tierAccent }} />}
          {paidTier === 'MAX' && <Crown size={16} style={{ color: tierAccent }} />}
          <div>
            <h1 className="text-3xl font-black tracking-tight">Sandbox <span className="text-xs align-super text-emerald-400">PAID</span></h1>
            <p className="text-xs text-gray-400 font-mono">Full customization terminal - ZK circuits, oracles, Canva-like design tools, deploy to Kaspa</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="px-3 py-1 rounded-full text-[10px] font-mono font-bold border" style={{ color: tierAccent, borderColor: tierAccent + '40', background: tierAccent + '10' }}>{tierBadge}</span>
          <span className="px-3 py-1 rounded-full text-[10px] font-mono font-bold border" style={{ color: isMainnet ? '#EF4444' : '#49EACB', borderColor: (isMainnet ? '#EF4444' : '#49EACB') + '40', background: (isMainnet ? '#EF4444' : '#49EACB') + '10' }}>{isMainnet ? 'MAINNET' : net.toUpperCase()}</span>
          <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-mono">1 DEPLOY CREDIT</span>
        </div>
      </div>

      {/* Transparent disclosure banner (always shown for paid - this is what makes top-visibility covenants trusted) */}
      <div className="mb-8 rounded-2xl border border-white/10 bg-black/40 p-5">
        <div className="flex items-center gap-2 mb-2 text-emerald-400 text-xs font-mono uppercase tracking-widest"><Eye size={14} /> ALL WALLETS DISCLOSED - TOP VISIBILITY</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          {disclosedWallets.map((w, i) => (
            <div key={i} className="rounded-lg bg-white/5 p-3 border border-white/10">
              <div className="text-[10px] text-gray-400">{w.role}</div>
              <div className="font-mono text-xs break-all mt-1 text-white/90">{w.addr}</div>
            </div>
          ))}
        </div>
        <div className="text-[10px] text-gray-500 mt-2">Paid covenants created here appear with priority + badge in Explorer and Terminal. Transparency is permanent.</div>
      </div>

      {/* LIBRARY - wide selection (hundreds via variants) */}
      <section className="mb-10">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 text-sm text-gray-300 min-w-0"><Cpu size={15} className="shrink-0" /> <span className="min-w-0">Circuit Library (77+ entries, 6 resolution modes, hundreds of combinations)</span></div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search circuits..." className="bg-black/50 border border-white/10 rounded px-3 py-2 text-sm w-full sm:w-64 shrink-0" />
        </div>
        <div className="flex flex-wrap gap-1 mb-3">
          {categories.map(c => (
            <button key={c} onClick={() => setCatFilter(c)} className={`text-xs px-3 py-1 rounded-full border ${catFilter === c ? 'bg-white/10 border-white/30' : 'border-white/10 hover:bg-white/5'}`}>{c}</button>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filtered.slice(0, 24).map(c => {
            const isSel = selectedCircuitId === c.id;
            return (
              <button key={c.id} onClick={() => { setSelectedCircuitId(c.id); }} className={`text-left p-4 rounded-xl border transition ${isSel ? 'border-white/40 bg-white/5' : 'border-white/10 hover:border-white/20 hover:-translate-y-0.5 bg-black/30'}`}>
                <div className="flex gap-3">
                  <CircuitGlyph type={c} size={36} />
                  <div className="min-w-0">
                    <div className="font-semibold text-sm flex items-center gap-2 flex-wrap"><span className="truncate max-w-full">{c.name}</span> {c.variant && <span className="text-[9px] px-1.5 py-px rounded bg-white/10 shrink-0">variant</span>} {c.artifacts && <span className="text-[9px] px-1.5 py-px rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shrink-0">artifact</span>}</div>
                    <div className="text-[11px] text-gray-400 line-clamp-2 mt-0.5 break-words">{c.description}</div>
                    <div className="text-[9px] mt-1 flex items-center gap-2 flex-wrap">
                      <span className="opacity-60 truncate max-w-full">{c.category} • {c.circuit}</span>
                      {(c.reality === 'full-zk' || c.reality === 'hybrid' || c.reality === 'oracle-attested') && <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/30 font-semibold shrink-0">Oracle-attested</span>}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        <div className="text-[10px] text-gray-500 mt-2">KYC/identity circuits de-prioritized (only 2 in "other"). Focus: real Kaspa covenant needs - games with timers, ownership/script/timelock proofs, DAO/collateral, verifiable compute.</div>
      </section>

      {/* Custom Circuit Composition - design the best possible interactive covenant */}
      <section className="mb-10 rounded-3xl border border-white/10 bg-black/50 p-6">
        <div className="flex items-center gap-2 mb-4"><Sparkles size={16} className="text-amber-400" /><div className="uppercase text-xs tracking-[2px] text-amber-400 font-mono">Compose Your Own Circuit (paid only)</div></div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Bases */}
          <div>
            <div className="text-xs text-gray-400 mb-2">Base primitives (add multiple for powerful hybrid covenants)</div>
            <div className="flex flex-wrap gap-2 mb-3">
              {['merkle_membership', 'range_proof', 'utxo_ownership', 'timelock_absolute', 'script_hash_match', 'poker_v1', 'chess_v1', 'verifiable'].map(b => (
                <button key={b} onClick={() => addBase(b)} className="text-xs px-2.5 py-1 rounded border border-white/10 hover:bg-white/5">{b}</button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {customBases.map(b => <span key={b} onClick={() => removeBase(b)} className="cursor-pointer text-xs bg-white/10 px-2 py-0.5 rounded flex items-center gap-1">{b} <span className="text-red-400">×</span></span>)}
            </div>
          </div>

          {/* Params */}
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <label className="block">Players <input type="number" className="mt-1 w-full bg-black/60 border border-white/10 rounded px-2 py-1" value={params.players} onChange={e => setParams(p => ({...p, players: +e.target.value}))} /></label>
              <label className="block">Turn timer (sec) <input type="number" className="mt-1 w-full bg-black/60 border border-white/10 rounded px-2 py-1" value={params.turnTimerSec} onChange={e => setParams(p => ({...p, turnTimerSec: +e.target.value}))} /></label>
              <label className="block">Collateral min (KAS) <input type="number" className="mt-1 w-full bg-black/60 border border-white/10 rounded px-2 py-1" value={params.collateralMin} onChange={e => setParams(p => ({...p, collateralMin: +e.target.value}))} /></label>
              <label className="block">Resolution <select className="mt-1 w-full bg-black/60 border border-white/10 rounded px-2 py-1" value={params.resolution} onChange={e => setParams(p => ({...p, resolution: e.target.value}))}><option value="zk">ZK Proof</option><option value="oracle">Oracle</option><option value="hybrid">Hybrid ZK+Oracle</option><option value="vrf">Committed Random (VRF)</option></select></label>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">Payout curve (winner / treasury)</div>
              <input type="range" min="70" max="98" value={params.winnerPct} onChange={e => setParams(p => ({...p, winnerPct: +e.target.value}))} className="w-full" style={{ '--range-pct': `${((params.winnerPct - 70) / 28) * 100}%` }} />
              <div className="text-[10px] text-gray-500 flex justify-between"><div>{params.winnerPct}% winner</div><div>{params.treasuryPct}% treasury</div></div>
            </div>
          </div>
        </div>

        <div className="mt-4">
          <input value={customCircuitName} onChange={e => setCustomCircuitName(e.target.value)} className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-2 text-lg font-semibold" placeholder="Name your custom circuit" />
          <textarea value={customDesc} onChange={e => setCustomDesc(e.target.value)} className="mt-2 w-full h-16 bg-black/60 border border-white/10 rounded-xl px-4 py-2 text-sm" placeholder="Rules / description that will appear in the covenant UI and Explorer" />
        </div>
      </section>

      {/* DESIGN - name it, make it look however you want */}
      <section className="mb-8">
        <div className="text-xs uppercase tracking-widest text-gray-400 mb-2 flex items-center gap-2"><Palette size={14} /> Design Your Covenant (look, name, full info)</div>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-3 space-y-3">
            <input value={covenantName} onChange={e => setCovenantName(e.target.value)} className="w-full text-2xl font-black bg-transparent border-b border-white/20 pb-1 focus:outline-none" />
            <textarea value={covenantDesc} onChange={e => setCovenantDesc(e.target.value)} className="w-full h-24 bg-black/40 border border-white/10 rounded-2xl p-4 text-sm" />
          </div>
          <div className="lg:col-span-2">
            <div className="text-xs text-gray-400 mb-1">Theme accent</div>
            <div className="flex gap-2 items-center">
              <input type="color" value={themeAccent} onChange={e => setThemeAccent(e.target.value)} className="w-12 h-9 p-0 bg-transparent border border-white/10 rounded" />
              <div className="flex gap-1">{['#49EACB', '#3B82F6', '#E8AF34', '#A855F7', '#EF4444', '#22C55E'].map(c => <button key={c} onClick={() => setThemeAccent(c)} className="w-6 h-6 rounded" style={{ background: c }} />)}</div>
            </div>
            <div className="text-xs text-gray-400 mt-3 mb-1">Look preset</div>
            <div className="flex gap-2 text-xs">
              {['classic', 'poker', 'minimal', 'chess'].map(p => <button key={p} onClick={() => setLookPreset(p)} className={`px-3 py-1 rounded border ${lookPreset === p ? 'border-white/40' : 'border-white/10'}`}>{p}</button>)}
            </div>
          </div>
        </div>

        {/* Live preview + disclosure */}
        <div className="mt-6 rounded-2xl border border-white/10 bg-black/60 p-5" style={{ borderColor: previewAccent + '30' }}>
          <div className="text-xs text-gray-400 mb-2">LIVE PREVIEW - this is exactly how it will appear (with top visibility + full disclosure)</div>
          <div className="rounded-xl p-4" style={{ background: '#0a0a0a', border: `1px solid ${previewAccent}20` }}>
            <div className="font-bold text-lg" style={{ color: previewAccent }}>{previewName}</div>
            <div className="text-sm text-gray-300 mt-1 line-clamp-2">{covenantDesc || customDesc}</div>
            <div className="mt-3 text-[10px] text-gray-500">Disclosed wallets: {disclosedWallets.map(w => w.role).join(' • ')}</div>
            <div className="mt-1 text-[10px] font-mono text-emerald-400">ON-CHAIN ENFORCED • NON-CUSTODIAL</div>
          </div>
        </div>
      </section>

      {/* ON-CHAIN ENFORCEMENT - real script-locked custody (1.1: no decorative deploy) */}
      <section className="mb-8">
        <div className="text-xs uppercase tracking-widest text-gray-400 mb-2 flex items-center gap-2"><ShieldCheck size={14} className="text-emerald-400" /> On-chain Enforcement (real script-locked custody)</div>
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.03] p-5">
          <p className="text-[11px] text-gray-400 mb-4">Your deploy locks the stake into a Kaspa script hash enforced by consensus itself - no oracle, no Covex key. It is redeemable non-custodially by your own key, so the funds move even if Covex disappears.</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
            {[
              { id: 'singlesig', label: 'Single-key', icon: KeyRound, blurb: 'Redeemable only by your key.' },
              { id: 'timelock', label: 'Timelock', icon: Clock, blurb: 'Unlocks at a future DAA score.' },
              { id: 'hashlock', label: 'Hashlock', icon: Lock, blurb: 'Reveal a secret + sign to release.' },
            ].map(k => {
              const Icon = k.icon; const active = enforceKind === k.id;
              return (
                <button key={k.id} type="button" onClick={() => setEnforceKind(k.id)} className={`text-left p-3 rounded-xl border transition ${active ? 'border-emerald-400/50 bg-emerald-400/[0.06]' : 'border-white/10 hover:border-white/20 bg-black/30'}`}>
                  <Icon size={16} className={active ? 'text-emerald-400' : 'text-gray-300'} />
                  <div className="mt-1.5 text-sm font-semibold text-white">{k.label}</div>
                  <div className="text-[10px] text-gray-400 mt-0.5 leading-snug">{k.blurb}</div>
                </button>
              );
            })}
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="text-xs text-gray-400">Stake to lock (KAS)</span>
              <input value={stakeKas} onChange={e => setStakeKas(e.target.value)} inputMode="decimal" className="mt-1 w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 font-mono text-white" />
            </label>
            {enforceKind === 'timelock' && (
              <label className="block text-sm">
                <span className="text-xs text-gray-400">Lock for (DAA blocks){tipDaa ? ` - unlocks at ${tipDaa + Math.max(1, parseInt(lockBlocks || '100', 10))}` : ''}</span>
                <input value={lockBlocks} onChange={e => setLockBlocks(e.target.value)} inputMode="numeric" className="mt-1 w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 font-mono text-white" />
              </label>
            )}
          </div>
          {enforceKind === 'hashlock' && <p className="text-[11px] text-gray-400 mt-2">A random secret is generated at deploy and shown once. Save it - it is required to redeem and is never stored on the server.</p>}
          {isMainnet ? (
            <p className="text-[11px] text-amber-300 mt-3">On mainnet, enforced deploys need wallet-side funding (coming soon). Switch to a testnet to deploy a real covenant now.</p>
          ) : !canSign ? (
            <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-4">
              <p className="text-sm text-gray-300 mb-3">Connect a testnet key to sign the real on-chain deploy.</p>
              <DevConnectPanel compact />
            </div>
          ) : (
            <p className="text-[11px] text-emerald-300/80 mt-3">Ready to lock {stakeKas} KAS into a real {enforceKind} covenant, redeemable non-custodially by your key.</p>
          )}
        </div>
      </section>

      {/* ACTIONS */}
      <div className="flex flex-wrap gap-3">
        <button onClick={handleGenerate} className="px-6 py-3 rounded-2xl font-semibold flex items-center gap-2" style={{ background: previewAccent, color: '#000' }}>
          <Play size={18} /> Generate Covenant Definition
        </button>
        <button onClick={handleCreateAndDeploy} disabled={deploying || !auth.token} className="px-6 py-3 rounded-2xl font-semibold border border-white/20 flex items-center gap-2 disabled:opacity-50">
          {deploying ? <Loader2 className="animate-spin" size={18} /> : <Award size={18} />} CREATE &amp; DEPLOY (consume 1 credit)
        </button>
        <button onClick={() => navigate('/paid-builder')} className="px-5 py-3 rounded-2xl border border-white/10 text-sm">Cancel</button>
      </div>

      {generatedDef && (
        <pre className="mt-6 p-4 bg-black/70 rounded-2xl text-xs overflow-auto border border-white/10 max-h-80">{JSON.stringify(generatedDef, null, 2)}</pre>
      )}
      {deployResult && (
        <div className={`mt-4 p-4 rounded-2xl border ${deployResult.success ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
          {deployResult.success ? (
            <div>
              <div className="text-emerald-400 font-bold mb-1 flex items-center gap-2"><ShieldCheck size={16} /> Script-enforced covenant deployed on-chain</div>
              <div className="text-sm text-gray-200">{deployResult.message}</div>
              {deployResult.txid && (
                <div className="mt-2">
                  <div className="text-xs text-gray-400 mb-1">TX: <span className="font-mono text-[#49EACB]">{deployResult.txid}</span></div>
                  {deployResult.p2sh && (
                    <div className="text-xs text-gray-400 mb-1">P2SH: <span className="font-mono text-[#49EACB] break-all">{deployResult.p2sh}</span></div>
                  )}
                  <div className="flex gap-3 mt-3">
                    <a href={`/covenant/${encodeURIComponent(deployResult.covId || deployResult.txid)}`} className="px-4 py-2 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-sm font-semibold hover:bg-emerald-500/30 transition-all">
                      <Eye size={14} className="inline mr-1" /> View Covenant
                    </a>
                    <a href={`/covenant/${encodeURIComponent(deployResult.covId || deployResult.txid)}?tab=terminal`} className="px-4 py-2 rounded-xl bg-kaspa-green/20 border border-kaspa-green/30 text-kaspa-green text-sm font-semibold hover:bg-kaspa-green/30 transition-all">
                      <Terminal size={14} className="inline mr-1" /> Open Terminal
                    </a>
                  </div>
                  {deployResult.redeem_script_hex && (
                    <div className="mt-3 text-[11px] text-amber-300 font-mono break-all border border-amber-400/30 bg-amber-400/[0.04] rounded-lg p-2">
                      <span className="font-sans font-semibold">Save your redeem script</span> - required to spend this covenant and what makes it recoverable without trusting Covex (also re-servable from the covenant page):
                      <div className="mt-1">{deployResult.redeem_script_hex}</div>
                    </div>
                  )}
                  {deployResult.preimage && (
                    <div className="mt-2 text-[11px] text-amber-300 font-mono break-all">secret (save to redeem): {deployResult.preimage}</div>
                  )}
                  {deployResult.lock_daa && (
                    <div className="mt-2 text-[11px] text-gray-400">unlocks at DAA {deployResult.lock_daa}{tipDaa ? (tipDaa >= deployResult.lock_daa ? ' (elapsed - redeemable now)' : ` (~${deployResult.lock_daa - tipDaa} blocks to go)`) : ''}</div>
                  )}
                  <div className="text-xs text-gray-400 mt-2">Custom UI saved{deployResult.terminalSaved ? ' ✓' : ' (warning: UI save may have failed - re-save from the covenant Terminal)'}</div>
                </div>
              )}
            </div>
          ) : <span className="text-red-400">Error: {deployResult.error}</span>}
        </div>
      )}

      <div className="mt-10 text-[10px] text-gray-500">Free basic SilverScript creation is always available with no special treatment in Deploy / CreateCovenant. All advanced circuits, customization, and top visibility require server-verified same-wallet payment.</div>
    </div>
  );
}
