import { useState, useEffect } from 'react';
import DesignStudio from '../components/DesignStudio';
import { useParams, Link } from 'react-router-dom';
import { useWallet } from '../components/WalletContext';
import { signCovenantOwnership } from '../lib/ownership';
import { explorerTxUrl } from '../lib/explorer';
import { ArrowLeft, Save, Palette, Eye, Wallet, Check, ExternalLink } from 'lucide-react';

const TRUNC = (s, n = 6) => (s && s.length > n * 2 + 3 ? `${s.slice(0, n)}...${s.slice(-4)}` : s);

// The published page is rendered as raw HTML (in an iframe srcDoc / dangerouslySet),
// so EVERY interpolated value must be escaped or it is a stored-XSS vector. Colors
// go into CSS and are validated against a strict pattern instead of HTML-escaped.
const ESC = (s) =>
  String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
const SAFE_COLOR = (c) =>
  /^#[0-9a-fA-F]{3,8}$|^rgba?\([\d.,\s%]+\)$/.test(String(c || '')) ? c : '#49EACB';

const COVENANT_TEMPLATES = [
  { id: 'aether', name: 'Aether', tagline: 'Minimal Luxury', accent: '#E8AF34', config: { primaryColor: '#E8AF34', bgStyle: 'glass' } },
  { id: 'forge', name: 'Forge', tagline: 'Bold DeFi', accent: '#F59E0B', config: { primaryColor: '#F59E0B', bgStyle: 'dark' } },
  { id: 'bloom', name: 'Bloom', tagline: 'Warm Community', accent: '#10B981', config: { primaryColor: '#10B981', bgStyle: 'glass' } },
  { id: 'nexus', name: 'Nexus', tagline: 'Tech Precision', accent: '#3B82F6', config: { primaryColor: '#3B82F6', bgStyle: 'dark' } },
  { id: 'velvet', name: 'Velvet', tagline: 'Premium Heritage', accent: '#8B5CF6', config: { primaryColor: '#8B5CF6', bgStyle: 'glass' } },
  { id: 'pulse', name: 'Pulse', tagline: 'Vibrant Collective', accent: '#EC4899', config: { primaryColor: '#EC4899', bgStyle: 'glass' } },
];

function buildTransparentCustomUI(cov, cfg, stakeAmount) {
  const primary = SAFE_COLOR(cfg.primaryColor);
  const title = ESC(cfg.titleOverride || cov.name || TRUNC(cov.tx_id));
  const desc = ESC(cfg.descOverride || cov.description || 'Fully transparent on-chain covenant.');
  const publicAbout = ESC(cfg.publicAbout || cfg.descOverride || cov.description || 'Fully transparent on-chain covenant.');
  const publicRules = ESC(cfg.publicRules || cov.full_logic_summary || 'All logic, fees, timers, resolution and payouts are public and on-chain.');
  const publicHowTo = ESC(cfg.publicHowTo || 'Stake to the covenant address. All addresses, rules and verification are visible by default.');
  const creator = ESC(cov.creator_addr || 'Unknown');
  const locked = ESC((cov.amount_kaspa || 0).toLocaleString());
  const tx = ESC(cov.tx_id || '');
  const explorerTx = ESC(explorerTxUrl(cov.tx_id, cov.network)); // network-accurate explorer URL
  const cat = ESC(cov.category || cov.covenant_type || 'General');
  const tier = ESC(cov.verified_tier || cov.tier || 'FREE');
  const ts = ESC(cov.timestamp ? new Date(cov.timestamp * 1000).toLocaleDateString() : 'recent');
  const isChess = (cov.covenant_type || cov.category || '').toLowerCase().includes('chess');
  const stake = stakeAmount || 50;

  const showFullFacts = cfg.showFullFacts !== false;
  const showLogic = cfg.showLogic !== false;
  const showAddresses = cfg.showAddresses !== false;
  const extraBlocks = cfg.extraBlocks || [];

  const css = `
    :root{--primary:${primary}}
    body{font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",Roboto,sans-serif;background:#050507;color:#F1F5F9;margin:0;padding:0;line-height:1.6}
    .container{max-width:1080px;margin:0 auto;padding:40px 20px}
    .hero{padding:60px 0 40px;text-align:center}
    h1{font-size:42px;font-weight:700;letter-spacing:-1.5px;margin:0 0 12px}
    .sub{font-size:18px;color:#94A3B8;max-width:620px;margin:0 auto 28px}
    .glass{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:20px;padding:28px}
    .facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px}
    .fact{background:rgba(15,23,42,.6);border:1px solid rgba(255,255,255,.06);border-radius:14px;padding:16px}
    .fact-label{font-size:10px;color:#64748B;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:4px}
    .fact-value{font-size:15px;font-weight:600;color:#F8FAFC;word-break:break-all}
    .mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px}
    .btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;background:var(--primary);color:#000;font-weight:700;font-size:15px;padding:14px 28px;border-radius:999px;border:none;cursor:pointer;text-decoration:none}
    .section{margin-bottom:32px}
    .label{font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#64748B}
    .rules{font-size:15px;line-height:1.7;color:#CBD5E1}
  `;

  let factsHTML = '';
  if (showFullFacts) {
    factsHTML = `
      <div class="section">
        <div class="label" style="margin-bottom:10px">On-Chain Facts &amp; Receiving Addresses (Public by Default)</div>
        <div class="facts">
          <div class="fact"><div class="fact-label">Creator</div><div class="fact-value mono">${creator}</div></div>
          <div class="fact"><div class="fact-label">Locked</div><div class="fact-value">${locked} KAS</div></div>
          <div class="fact"><div class="fact-label">Category</div><div class="fact-value">${cat}</div></div>
          <div class="fact"><div class="fact-label">TXID</div><div class="fact-value mono" style="font-size:12px">${tx}</div></div>
          <div class="fact"><div class="fact-label">Deployed</div><div class="fact-value">${ts}</div></div>
          ${showAddresses ? `
          <div class="fact"><div class="fact-label">Covenant / Pot Address</div><div class="fact-value mono" style="font-size:11px">${cov.address || cov.receiving_addresses || 'on-chain'}</div></div>
          <div class="fact"><div class="fact-label">Platform Treasury</div><div class="fact-value mono" style="font-size:11px">See covenant details</div></div>
          <div class="fact"><div class="fact-label">Creator Cut</div><div class="fact-value mono" style="font-size:11px">${creator}</div></div>
          ` : ''}
        </div>
      </div>
    `;
  }

  let logicHTML = '';
  if (showLogic) {
    logicHTML = `
      <div class="section">
        <div class="label" style="margin-bottom:6px">Full Covenant Logic (Public by Default)</div>
        <div class="rules">${publicRules}</div>
      </div>
    `;
  }

  let stakeBlock = '';
  if (isChess) {
    stakeBlock = `
      <div class="section">
        <div class="label" style="margin-bottom:10px">Stake and Play the Arena</div>
        <div class="glass" style="text-align:center">
          <div style="font-size:13px;color:#94A3B8;margin-bottom:8px">10 MIN WINNER TAKES ALL</div>
          <div style="font-size:42px;font-weight:700;letter-spacing:-1px;margin:8px 0">${stake} KAS per player</div>
          <div class="rules" style="max-width:520px;margin:16px auto 0">
            Second player matches within 5 minutes or funds return automatically.<br/>
            10 minute clocks per player. Resign, timeout or checkmate ends it.<br/>
            Winner gets pot minus 2% (goes to creator address to sustain the arena).<br/>
            Server-authoritative engine enforces legal moves; the outcome is attested by the disclosed Covex oracle (BIP340 Schnorr). No zero-knowledge proof of moves.
          </div>
          <div style="margin-top:20px">
            <button onclick="window.parent.postMessage({type:'COVENANT_EXECUTE'},'*')" class="btn" style="font-size:16px;padding:16px 36px">Play the 10min Arena (chess.com style)</button>
          </div>
          <div style="margin-top:14px;font-size:11px;color:#475569">Direct to covenant address. Non custodial. Fully transparent. Professional full page timers and board.</div>
        </div>
      </div>
    `;
  }

  let customBlocksHTML = '';
  if (extraBlocks && extraBlocks.length > 0) {
    customBlocksHTML = extraBlocks.map(block => `
      <div class="section">
        <div class="label" style="margin-bottom:6px">${block.title || 'Custom Section'}</div>
        <div class="rules">${block.text || ''}</div>
      </div>
    `).join('');
  }

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${css}</style></head>
<body style="background:#050507">
  <div class="container">
    <div style="text-align:center;margin-bottom:32px">
      <div style="display:inline-block;padding:4px 12px;border-radius:999px;background:rgba(255,255,255,.06);font-size:11px;letter-spacing:1.5px;color:#64748B;border:1px solid rgba(255,255,255,.1)">ON-CHAIN COVENANT · ${tier}</div>
    </div>

    <div class="hero">
      <h1>${title}</h1>
      <p class="sub">${desc}</p>
      <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap">
        <button onclick="document.getElementById('interact').scrollIntoView({behavior:'smooth'})" class="btn">Interact</button>
        <a href="${explorerTx}" target="_blank" class="btn" style="background:transparent;border:1px solid #fff;color:#fff">View on Explorer</a>
      </div>
    </div>

    ${factsHTML}
    ${logicHTML}
    <div class="section">
      <div class="label" style="margin-bottom:6px">About this Covenant</div>
      <div class="rules">${publicAbout}</div>
    </div>
    <div class="section">
      <div class="label" style="margin-bottom:6px">How to Participate</div>
      <div class="rules">${publicHowTo}</div>
    </div>

    ${stakeBlock}

    ${customBlocksHTML}

    <div id="interact" class="section">
      <div class="label" style="margin-bottom:10px">Direct Interaction</div>
      <div class="glass" style="text-align:center;padding:36px 28px">
        <p style="max-width:420px;margin:0 auto 18px;color:#94A3B8">All interactions are non-custodial and happen directly on the Kaspa blockchain with your wallet.</p>
        <button onclick="window.parent.postMessage({type:'COVENANT_EXECUTE'},'*')" class="btn" style="font-size:16px;padding:16px 40px">Connect Wallet &amp; Execute</button>
      </div>
    </div>

    <div style="text-align:center;padding:30px 0 10px;color:#475569;font-size:11px">
      Published by the creator • Fully transparent on Kaspa • <a href="${explorerTx}" target="_blank" style="color:inherit">Verify</a>
    </div>
  </div>
</body></html>`;
}

export default function CovenantFix() {
  const { id } = useParams();
  const { address, signMessage } = useWallet();
  const [allCovenants, setAllCovenants] = useState([]);
  const [myCovenants, setMyCovenants] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState({ 
    primaryColor: '#49EACB', 
    backgroundImage: '', 
    titleOverride: '', 
    descOverride: '', 
    publicAbout: '', 
    publicRules: '', 
    publicHowTo: '',
    showFullFacts: true,
    showLogic: true,
    showAddresses: true,
    extraBlocks: []
  });
  const [stakeAmount, setStakeAmount] = useState(50);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [showPreview, setShowPreview] = useState(null);
  const [toast, setToast] = useState(null);
  const [publishing, setPublishing] = useState(false);

  // Load all covenants and filter to mine
  useEffect(() => {
    setLoading(true);
    const net = localStorage.getItem('kaspaNetwork') || 'testnet-12';
    const url = address
      ? `/api/covenants?network=${net}&creator=${encodeURIComponent(address)}&limit=200`
      : `/api/covenants?network=${net}&limit=60`;
    fetch(url)
      .then(r => r.json())
      .then(d => {
        const list = (d.covenants || []);
        setAllCovenants(list);
        const mine = address ? list : [];
        setMyCovenants(mine);
        // Preselect if id param matches one of mine
        if (id) {
          const match = mine.find(c => c.tx_id === id) || list.find(c => c.tx_id === id && c.creator_addr === address);
          if (match) {
            setSelected(match);
            setStakeAmount(match.default_stake || 50);
            setConfig({ 
              primaryColor: match.custom_ui_config?.theme?.accent || '#49EACB', 
              backgroundImage: match.custom_ui_config?.theme?.background_image || '', 
              titleOverride: match.name || '', 
              descOverride: match.description || '', 
              publicAbout: match.public_about || match.description || '', 
              publicRules: match.public_rules || '', 
              publicHowTo: match.public_howto || '',
              showFullFacts: true,
              showLogic: true,
              showAddresses: true,
              extraBlocks: []
            });
          }
        } else if (mine.length > 0) {
          // default select first
          const first = mine[0];
          setSelected(first);
          setStakeAmount(first.default_stake || 50);
          setConfig({ 
            primaryColor: first.custom_ui_config?.theme?.accent || '#49EACB', 
            backgroundImage: first.custom_ui_config?.theme?.background_image || '', 
            titleOverride: first.name || '', 
            descOverride: first.description || '', 
            publicAbout: first.public_about || first.description || '', 
            publicRules: first.public_rules || '', 
            publicHowTo: first.public_howto || '',
            showFullFacts: true,
            showLogic: true,
            showAddresses: true,
            extraBlocks: []
          });
        }
      })
      .finally(() => setLoading(false));
  }, [address, id]);

  // Hydrate from the PERSISTED terminal-config. The covenant list endpoint
  // only returns the tier-based custom_ui_config, not the saved theme, so the
  // creator's accent/background/stake/public_* are read back from the stored
  // config.theme here (where publish() nests them). Without this they reset to
  // defaults on every reload.
  useEffect(() => {
    if (!selected?.tx_id) return undefined;
    let alive = true;
    fetch(`/api/terminal-config/${encodeURIComponent(selected.tx_id)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive || !d?.success) return;
        const th = d.config?.theme || {};
        if (th.default_stake) setStakeAmount(th.default_stake);
        setConfig((prev) => ({
          ...prev,
          primaryColor: th.accent || prev.primaryColor,
          backgroundImage: th.background_image || prev.backgroundImage,
          publicAbout: th.public_about ?? prev.publicAbout,
          publicRules: th.public_rules ?? prev.publicRules,
          publicHowTo: th.public_howto ?? prev.publicHowTo,
        }));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [selected?.tx_id]);

  const isCreatorOfSelected = !!(selected && address && selected.creator_addr === address);

  const applyTemplate = (tpl) => {
    const newCfg = { ...config, ...tpl.config };
    setConfig(newCfg);
    setSelectedTemplate(tpl);
  };

  const openPreview = (tpl) => {
    const html = buildTransparentCustomUI(selected, { ...config, ...tpl.config }, stakeAmount);
    setShowPreview({ tpl, html });
  };

  const generatePreviewHtml = () => {
    if (!selected) return '';
    return buildTransparentCustomUI(selected, config, stakeAmount);
  };

  const publish = async () => {
    if (!selected || !address || !isCreatorOfSelected) {
      setToast({ type: 'error', msg: 'Connect the creator wallet for this covenant.' });
      return;
    }
    setPublishing(true);
    // Prove covenant ownership: sign the server challenge with the creator wallet.
    let proof;
    try {
      proof = await signCovenantOwnership(selected.tx_id, address, signMessage);
    } catch (e) {
      setToast({ type: 'error', msg: `Signature required to publish: ${e.message}` });
      setPublishing(false);
      return;
    }
    const html = buildTransparentCustomUI(selected, config, stakeAmount);
    const payload = {
      custom_ui_code: html,
      ...proof,
      name: config.titleOverride || selected.name,
      description: config.descOverride || selected.description || (selected.covenant_type || 'Covenant'),
      // The backend persists `theme` verbatim inside the saved config but has no
      // column for stake/public_* - so nest them in theme. They round-trip via
      // GET /api/terminal-config/:id (read back in the hydrate effect above).
      theme: {
        ...(config.designTheme || {}),
        accent: config.primaryColor || null,
        background_image: config.backgroundImage || null,
        default_stake: stakeAmount,
        public_about: config.publicAbout || null,
        public_rules: config.publicRules || null,
        public_howto: config.publicHowTo || null,
      },
    };
    try {
      const res = await fetch(`/api/terminal-config/${selected.tx_id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && (data.success || data.ok)) {
        setToast({ type: 'success', msg: 'Published! Viewers now see your clean updated look and stake.' });
        setSelected((s) => ({ ...s, custom_ui_html: html }));
      } else {
        // The backend did NOT accept the update - do not claim it published.
        setSelected((s) => ({ ...s, custom_ui_html: html }));
        setToast({ type: 'error', msg: `Publish failed: ${data.error || `backend returned HTTP ${res.status}`}. Your changes are NOT live for viewers (shown here as a local preview only).` });
      }
    } catch (e) {
      // Network/transport error - the update did not reach the backend.
      setSelected((s) => ({ ...s, custom_ui_html: html }));
      setToast({ type: 'error', msg: `Publish failed: ${e.message || 'could not reach the backend'}. Your changes are NOT live for viewers (local preview only).` });
    } finally {
      setPublishing(false);
      setTimeout(() => setToast(null), 3800);
    }
  };

  if (loading) {
    return <div className="p-20 text-center text-kaspa-green font-mono tracking-[3px]">LOADING YOUR COVENANTS...</div>;
  }

  if (!address) {
    return (
      <div className="max-w-xl mx-auto px-4 sm:px-6 py-16 text-center">
        <div className="mx-auto mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5"><Wallet size={28} /></div>
        <h1 className="text-3xl font-semibold tracking-tight mb-2">Fix your covenants</h1>
        <p className="text-gray-400 mb-8">Connect the wallet that created the covenant. Then manage how it looks and set the single stake amount. All in one clean place.</p>
        <div className="text-xs text-gray-500">Use the wallet button in the top bar.</div>
        <Link to="/" className="mt-8 inline-block text-sm text-kaspa-green hover:underline">Back to Explorer</Link>
      </div>
    );
  }

  if (myCovenants.length === 0) {
    return (
      <div className="max-w-xl mx-auto px-4 sm:px-6 py-16 text-center">
        <h1 className="text-3xl font-semibold tracking-tight mb-3">No covenants for this wallet</h1>
        <p className="text-gray-400 mb-8">Deploy a covenant first (from Deploy or Paid Builder). Once created with this address you will see it here for quick visual fixes and stake setup.</p>
        <div className="flex gap-3 justify-center">
          <Link to="/deploy/enforced" className="px-5 py-2.5 rounded-xl border border-white/15 text-sm">Deploy</Link>
          <Link to="/paid-builder" className="px-5 py-2.5 rounded-xl bg-white text-black text-sm font-semibold">Paid Studio</Link>
        </div>
        <Link to="/" className="mt-10 block text-xs text-gray-500 hover:text-gray-400">Return to registry</Link>
      </div>
    );
  }

  const previewHtml = selected ? generatePreviewHtml() : '';

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div className="min-w-0">
          <Link to="/" className="inline-flex items-center gap-2 text-gray-400 hover:text-white text-sm font-mono tracking-widest"><ArrowLeft size={16}/>BACK TO REGISTRY</Link>
          <div className="mt-3 flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-kaspa-green/10 border border-kaspa-green/20 shrink-0"><Palette size={22} className="text-kaspa-green"/></div>
            <div className="min-w-0">
              <div className="text-3xl font-semibold tracking-tight">Fix</div>
              <div className="text-sm text-gray-400 -mt-0.5">Change how your covenants look. One clean section for the stake amount and rules.</div>
            </div>
          </div>
        </div>
        <Link to="/deploy/enforced" className="shrink-0 self-start sm:self-auto text-xs px-4 py-2 rounded-xl border border-white/10 hover:bg-white/5 whitespace-nowrap">New Covenant</Link>
      </div>

      {/* My Covenants - simple list to pick from */}
      <div className="mb-8">
        <div className="text-xs uppercase tracking-[2px] text-gray-500 mb-3 px-1">YOUR COVENANTS ({myCovenants.length}): click to manage</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {myCovenants.map((c) => {
            const isSel = selected && selected.tx_id === c.tx_id;
            const isChess = (c.covenant_type || c.category || '').toLowerCase().includes('chess');
            return (
              <button
                key={c.tx_id}
                onClick={() => {
                  setSelected(c);
                  setStakeAmount(c.default_stake || (isChess ? 50 : 10));
                  setConfig({ 
                    primaryColor: '#49EACB', 
                    titleOverride: c.name || '', 
                    descOverride: c.description || '', 
                    publicAbout: c.public_about || c.description || '', 
                    publicRules: c.public_rules || '', 
                    publicHowTo: c.public_howto || '',
                    showFullFacts: true,
                    showLogic: true,
                    showAddresses: true,
                    extraBlocks: []
                  });
                  setSelectedTemplate(null);
                }}
                className={`text-left rounded-2xl border p-4 transition ${isSel ? 'border-kaspa-green/60 bg-kaspa-green/[0.03]' : 'border-white/10 hover:border-white/20 bg-white/[0.01]'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="font-semibold text-white truncate min-w-0">{c.name || TRUNC(c.tx_id)}</div>
                  {isChess && <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shrink-0">CHESS</span>}
                </div>
                <div className="text-xs text-gray-400 mt-0.5 font-mono truncate">{c.category || c.covenant_type || 'General'} · {TRUNC(c.tx_id, 5)}</div>
                <div className="mt-3 text-sm tabular-nums text-gray-300">{(c.amount_kaspa || 0).toLocaleString()} KAS locked</div>
                <div className="mt-1 text-[10px] text-kaspa-green/80">Select to edit looks + stake</div>
              </button>
            );
          })}
        </div>
      </div>

      {!selected ? (
        <div className="text-center py-10 text-gray-400">Select a covenant above to change its look and stake settings.</div>
      ) : (
        <div>
          {/* Selected header */}
          <div className="flex flex-wrap items-center gap-3 mb-6">
            <Link to={`/covenant/${encodeURIComponent(selected.tx_id)}`} className="text-xs px-3 py-1.5 rounded-xl border border-white/10 hover:bg-white/5 inline-flex items-center gap-1"><ExternalLink size={14}/>View live covenant</Link>
            <button onClick={() => { setSelected(null); }} className="text-xs px-3 py-1.5 rounded-xl border border-white/10 hover:bg-white/5">Switch covenant</button>
            <div className="ml-auto text-xs text-gray-500 font-mono">{TRUNC(selected.tx_id)}</div>
          </div>

          <div className="text-2xl font-semibold tracking-tight mb-1">{config.titleOverride || selected.name || 'Covenant'}</div>
          <div className="text-sm text-gray-400 mb-6">Creator only. Changes publish instantly for everyone who opens it.</div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* WIX-STYLE TOOLSET - clicks of a button, fully for this covenant */}
            <div className="lg:col-span-2 rounded-3xl border border-white/10 bg-white/[0.015] p-6">
              <div className="flex items-center gap-2 mb-2">
                <Palette size={18} className="text-kaspa-green" />
                <div className="font-semibold">Public Page Designer</div>
              </div>
              <div className="text-xs text-gray-400 mb-4">Click buttons to instantly see how this specific covenant will look to the public. All on-chain facts, addresses, logic and game UI are included by default.</div>

              {/* Live page preview: exactly what visitors will see, updates with every edit */}
              <div className="mb-4 rounded-2xl border border-white/[0.08] overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 bg-white/[0.03] border-b border-white/[0.06]">
                  <span className="kicker">Live page preview</span>
                  <span className="flex items-center gap-1.5 text-[10px] text-kaspa-green font-bold"><span className="w-1.5 h-1.5 rounded-full bg-kaspa-green animate-pulse" /> updates as you edit</span>
                </div>
                <div className="relative h-64 overflow-hidden" style={{
                  background: config.backgroundImage
                    ? undefined
                    : (config.designTheme?.backdrop_css || 'linear-gradient(180deg,#05050A,#0a0a12)'),
                }}>
                  {config.backgroundImage && (
                    <>
                      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${config.backgroundImage})` }} />
                      <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/60 to-black/85" />
                    </>
                  )}
                  <div className="relative p-5 text-center">
                    <h3 className="text-xl font-black mb-1.5" style={{ color: config.primaryColor || '#49EACB' }}>
                      {config.titleOverride || selected?.name || 'Covenant title'}
                    </h3>
                    <p className="text-[11px] text-gray-300 max-w-sm mx-auto line-clamp-2 mb-3">
                      {config.descOverride || selected?.description || 'Your covenant description appears here.'}
                    </p>
                    <div className="flex flex-wrap justify-center gap-2 mb-3">
                      {[['Stake', `${stakeAmount || 0} KAS`], ['Fee', '2%'], ['Network', selected?.network || 'testnet-12']].map(([l, v]) => (
                        <div key={l} className="px-3 py-1.5 rounded-lg bg-white/[0.06] border border-white/[0.1] backdrop-blur">
                          <p className="text-[8px] uppercase tracking-widest text-gray-400">{l}</p>
                          <p className="text-[11px] font-bold text-white">{v}</p>
                        </div>
                      ))}
                    </div>
                    <span className="inline-block px-5 py-2 rounded-xl text-xs font-extrabold text-black" style={{ backgroundColor: config.primaryColor || '#49EACB' }}>
                      Stake and join
                    </span>
                  </div>
                </div>
              </div>

              {/* Design Studio: 240 premade designs + code terminal */}
              <DesignStudio
                currentTheme={{ accent: config.primaryColor, background_image: config.backgroundImage, ...(config.designTheme || {}) }}
                onApply={(t) => setConfig((c) => ({
                  ...c,
                  primaryColor: t.accent || c.primaryColor,
                  backgroundImage: t.background_image !== undefined && t.background_image !== null ? t.background_image : c.backgroundImage,
                  designTheme: t,
                }))}
              />

              {/* Covenant page background image */}
              <div className="mb-4">
                <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1.5">BACKGROUND IMAGE (shown behind your covenant page)</div>
                <div className="flex flex-wrap gap-2">
                  <input
                    type="url"
                    value={config.backgroundImage?.startsWith('data:') ? '' : (config.backgroundImage || '')}
                    onChange={(e) => setConfig((c) => ({ ...c, backgroundImage: e.target.value }))}
                    placeholder="https://... image URL"
                    className="flex-1 min-w-[160px] px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-sm text-white placeholder-gray-500 outline-none focus:border-[#49EACB]/50"
                  />
                  <label className="px-4 py-2.5 rounded-xl border border-white/10 bg-white/[0.04] text-sm text-gray-300 hover:border-[#49EACB]/40 cursor-pointer">
                    Upload
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      if (f.size > 600 * 1024) { setToast({ type: 'error', msg: 'Image too large. Keep it under 600KB.' }); return; }
                      const r = new FileReader();
                      r.onload = () => setConfig((c) => ({ ...c, backgroundImage: String(r.result) }));
                      r.readAsDataURL(f);
                    }} />
                  </label>
                  {config.backgroundImage && (
                    <button onClick={() => setConfig((c) => ({ ...c, backgroundImage: '' }))} className="px-3 py-2.5 rounded-xl border border-red-500/30 text-red-300 text-sm">Clear</button>
                  )}
                </div>
                {config.backgroundImage && (
                  <div className="mt-2 h-20 rounded-xl border border-white/10 bg-cover bg-center" style={{ backgroundImage: `url(${config.backgroundImage})` }} />
                )}
              </div>

              {/* Quick clicks - Wix style actions */}
              <div className="mb-4">
                <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1.5">QUICK STYLES (click to apply)</div>
                <div className="flex flex-wrap gap-2">
                  {COVENANT_TEMPLATES.map((tpl) => (
                    <button 
                      key={tpl.id} 
                      onClick={() => applyTemplate(tpl)} 
                      className={`text-xs px-3 py-1.5 rounded-2xl border transition ${selectedTemplate?.id === tpl.id ? 'bg-kaspa-green text-black border-kaspa-green' : 'border-white/15 hover:bg-white/5'}`}
                    >
                      {tpl.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-4">
                <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1.5">TOGGLE VISIBILITY (click)</div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setConfig(s => ({...s, showFullFacts: !s.showFullFacts}))} className="text-xs px-3 py-1.5 rounded-2xl border border-white/15 hover:bg-white/5">
                    {config.showFullFacts ? 'Hide' : 'Show'} On-Chain Facts &amp; Addresses
                  </button>
                  <button onClick={() => setConfig(s => ({...s, showLogic: !s.showLogic}))} className="text-xs px-3 py-1.5 rounded-2xl border border-white/15 hover:bg-white/5">
                    {config.showLogic ? 'Hide' : 'Show'} Full Logic
                  </button>
                  <button onClick={() => setConfig(s => ({...s, showAddresses: !s.showAddresses}))} className="text-xs px-3 py-1.5 rounded-2xl border border-white/15 hover:bg-white/5">
                    {config.showAddresses ? 'Hide' : 'Show'} Specific Addresses
                  </button>
                </div>
              </div>

              <div className="mb-4">
                <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1.5">ACCENT (click swatch or pick)</div>
                <div className="flex gap-2 flex-wrap mb-2">
                  {['#49EACB','#E8AF34','#10B981','#3B82F6','#8B5CF6','#EC4899','#F59E0B'].map(c => (
                    <button key={c} onClick={() => setConfig(s => ({...s, primaryColor: c}))} className={`h-7 w-7 rounded-full border ${config.primaryColor === c ? 'border-white ring-1 ring-white/50' : 'border-white/20'}`} style={{ background: c }} />
                  ))}
                </div>
                <input type="color" value={config.primaryColor} onChange={e => setConfig(s => ({...s, primaryColor: e.target.value}))} className="h-8 w-full rounded border border-white/20 p-0 overflow-hidden" />
              </div>

              {/* Covenant-specific text - prefilled with this covenant's logic */}
              <div className="space-y-3">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Title for public</div>
                  <input value={config.titleOverride} onChange={e => setConfig(s => ({...s, titleOverride: e.target.value}))} placeholder={selected.name} className="w-full rounded-2xl bg-black/40 border border-white/10 px-3 py-2 text-sm" />
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">About this Covenant (your words + this covenant's details)</div>
                  <textarea value={config.publicAbout || ''} onChange={e => setConfig(s => ({...s, publicAbout: e.target.value}))} placeholder="Everything visitors need to know..." rows={3} className="w-full rounded-2xl bg-black/40 border border-white/10 px-3 py-2 text-sm" />
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Rules &amp; Payouts (auto includes this covenant's full logic)</div>
                  <textarea value={config.publicRules || ''} onChange={e => setConfig(s => ({...s, publicRules: e.target.value}))} placeholder="Fees, timers, verification..." rows={2} className="w-full rounded-2xl bg-black/40 border border-white/10 px-3 py-2 text-sm" />
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">How to Participate</div>
                  <textarea value={config.publicHowTo || ''} onChange={e => setConfig(s => ({...s, publicHowTo: e.target.value}))} placeholder="Simple steps for players..." rows={2} className="w-full rounded-2xl bg-black/40 border border-white/10 px-3 py-2 text-sm" />
                </div>
              </div>

              {/* Covenant-specific quick tools */}
              { (selected.covenant_type || selected.category || '').toLowerCase().includes('chess') && (
                <div className="mt-4 pt-4 border-t border-white/10">
                  <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1.5">CHESS-SPECIFIC TOOLS (click)</div>
                  <div className="flex gap-2">
                    <button onClick={() => setStakeAmount(50)} className="text-xs px-3 py-1 rounded-2xl border border-white/15 hover:bg-white/5">Set 50 KAS stake</button>
                    <button onClick={() => setStakeAmount(100)} className="text-xs px-3 py-1 rounded-2xl border border-white/15 hover:bg-white/5">Set 100 KAS stake</button>
                  </div>
                </div>
              )}

              <div className="mt-4">
                <button 
                  onClick={() => {
                    const newBlock = { title: 'Custom Note', text: 'Add your extra explanation here...' };
                    setConfig(s => ({...s, extraBlocks: [...(s.extraBlocks || []), newBlock]}));
                  }} 
                  className="w-full text-xs py-2 rounded-2xl border border-dashed border-white/30 hover:bg-white/5"
                >
                  + Add Custom Section (click to add)
                </button>
              </div>

              <div className="mt-3 text-[10px] text-gray-500">All receiving addresses, full logic, and game UI for <span className="font-mono text-kaspa-green">{selected.tx_id?.slice(0,8)}...</span> are automatically included in the public view.</div>

              <button
                onClick={publish}
                disabled={publishing || !isCreatorOfSelected}
                className="mt-4 w-full py-4 bg-kaspa-green hover:bg-[#3bc2a6] active:scale-[0.985] text-black font-bold rounded-3xl flex items-center justify-center gap-2 disabled:opacity-60"
              >
                <Save size={18} /> {publishing ? 'PUBLISHING TO PUBLIC...' : 'PUBLISH - Viewers see this exact look for this covenant instantly'}
              </button>
              <div className="text-[10px] text-center text-gray-500 mt-1.5">One click. The public page updates everywhere. No terminal for visitors.</div>
            </div>

            {/* LIVE PREVIEW - exactly what the public sees, updates with every click */}
            <div className="lg:col-span-3">
              <div className="text-xs uppercase tracking-[1.5px] text-gray-500 mb-2 flex items-center gap-2">
                <Eye size={14}/> LIVE PUBLIC PREVIEW - Exactly what visitors see for this covenant
              </div>
              <div className="rounded-3xl overflow-hidden border border-white/10 bg-black" style={{height: '520px'}}>
                {previewHtml ? (
                  <iframe srcDoc={previewHtml} className="w-full h-full" sandbox="allow-scripts" title="Live public covenant preview" />
                ) : (
                  <div className="p-8 text-center text-gray-500">Select a covenant to see the live public view.</div>
                )}
              </div>
              <div className="flex gap-2 mt-2">
                <button onClick={() => selected && window.open(`/covenant/${encodeURIComponent(selected.tx_id)}`, '_blank')} className="flex-1 text-xs py-2 rounded-2xl border border-white/15 hover:bg-white/5">Open real public page in new tab</button>
                <button onClick={() => setShowPreview({ tpl: {name:'Current'}, html: previewHtml })} className="flex-1 text-xs py-2 rounded-2xl border border-white/15 hover:bg-white/5">Fullscreen preview</button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Template full preview modal */}
      {showPreview && (
        <div className="fixed inset-0 z-[90] bg-black/95 flex items-center justify-center p-4" onClick={() => setShowPreview(null)}>
          <div className="w-full max-w-[1080px] bg-[#050507] rounded-3xl border border-white/10 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-white/10 flex items-center gap-3 bg-black/40">
              <div className="font-semibold">{showPreview.tpl.name} preview: exactly what viewers see</div>
              <div className="ml-auto flex gap-2">
                {selected && (
                  <button onClick={() => { applyTemplate(showPreview.tpl); setShowPreview(null); }} className="px-5 py-2 rounded-2xl bg-kaspa-green text-black text-sm font-semibold">Choose this &amp; close</button>
                )}
                <button onClick={() => setShowPreview(null)} className="px-5 py-2 rounded-2xl border border-white/15 text-sm">Close</button>
              </div>
            </div>
            <iframe srcDoc={showPreview.html} className="w-full h-[78vh] bg-[#050507]" sandbox="allow-scripts" title="Template full preview" />
          </div>
        </div>
      )}

      {toast && (
        <div onClick={() => setToast(null)} className={`fixed bottom-6 right-6 z-[120] px-6 py-3 rounded-2xl text-sm font-medium cursor-pointer ${toast.type === 'success' ? 'bg-emerald-500 text-black' : 'bg-red-500 text-white'}`}>{toast.msg}</div>
      )}
    </div>
  );
}
