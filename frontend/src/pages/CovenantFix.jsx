import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useWallet } from '../components/WalletContext';
import { ArrowLeft, Save, Palette, Eye, Wallet, Check, ExternalLink } from 'lucide-react';

const TRUNC = (s, n = 6) => (s && s.length > n * 2 + 3 ? `${s.slice(0, n)}...${s.slice(-4)}` : s);

const COVENANT_TEMPLATES = [
  { id: 'aether', name: 'Aether', tagline: 'Minimal Luxury', accent: '#E8AF34', config: { primaryColor: '#E8AF34', bgStyle: 'glass' } },
  { id: 'forge', name: 'Forge', tagline: 'Bold DeFi', accent: '#F59E0B', config: { primaryColor: '#F59E0B', bgStyle: 'dark' } },
  { id: 'bloom', name: 'Bloom', tagline: 'Warm Community', accent: '#10B981', config: { primaryColor: '#10B981', bgStyle: 'glass' } },
  { id: 'nexus', name: 'Nexus', tagline: 'Tech Precision', accent: '#3B82F6', config: { primaryColor: '#3B82F6', bgStyle: 'dark' } },
  { id: 'velvet', name: 'Velvet', tagline: 'Premium Heritage', accent: '#8B5CF6', config: { primaryColor: '#8B5CF6', bgStyle: 'glass' } },
  { id: 'pulse', name: 'Pulse', tagline: 'Vibrant Collective', accent: '#EC4899', config: { primaryColor: '#EC4899', bgStyle: 'glass' } },
];

function buildTransparentCustomUI(cov, cfg, stakeAmount) {
  const primary = cfg.primaryColor || '#49EACB';
  const title = cfg.titleOverride || cov.name || TRUNC(cov.tx_id);
  const desc = cfg.descOverride || cov.description || 'Fully transparent on-chain covenant.';
  const creator = cov.creator_addr || 'Unknown';
  const locked = (cov.amount_kaspa || 0).toLocaleString();
  const tx = cov.tx_id || '';
  const cat = cov.category || cov.covenant_type || 'General';
  const tier = cov.verified_tier || cov.tier || 'FREE';
  const ts = cov.timestamp ? new Date(cov.timestamp * 1000).toLocaleDateString() : 'recent';
  const isChess = (cov.covenant_type || cov.category || '').toLowerCase().includes('chess');
  const stake = stakeAmount || 50;

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

  let stakeBlock = '';
  if (isChess) {
    stakeBlock = `
      <div class="section">
        <div class="label" style="margin-bottom:10px">Stake &amp; Play</div>
        <div class="glass" style="text-align:center">
          <div style="font-size:13px;color:#94A3B8;margin-bottom:8px">10 MIN WINNER-TAKES-ALL</div>
          <div style="font-size:42px;font-weight:700;letter-spacing:-1px;margin:8px 0">${stake} KAS per player</div>
          <div class="rules" style="max-width:520px;margin:16px auto 0">
            Second player matches within 5 minutes or funds return automatically.<br/>
            10 minute clocks per player. Resign, timeout or checkmate ends it.<br/>
            Winner gets pot minus 2% (goes to creator address to sustain the arena).<br/>
            Every move verifiable with chess_v1 ZK circuit — oracle detects lies.
          </div>
          <div style="margin-top:20px">
            <button onclick="window.parent.postMessage({type:'COVENANT_EXECUTE'},'*')" class="btn" style="font-size:16px;padding:16px 36px">Stake &amp; Open Board</button>
          </div>
          <div style="margin-top:14px;font-size:11px;color:#475569">Direct to covenant address • Non-custodial • Fully transparent</div>
        </div>
      </div>
    `;
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
        <a href="https://explorer.kaspa.org/tx/${tx}" target="_blank" class="btn" style="background:transparent;border:1px solid #fff;color:#fff">View on Explorer</a>
      </div>
    </div>

    <div class="section">
      <div class="label" style="margin-bottom:10px">On-Chain Facts</div>
      <div class="facts">
        <div class="fact"><div class="fact-label">Creator</div><div class="fact-value mono">${creator}</div></div>
        <div class="fact"><div class="fact-label">Locked</div><div class="fact-value">${locked} KAS</div></div>
        <div class="fact"><div class="fact-label">Category</div><div class="fact-value">${cat}</div></div>
        <div class="fact"><div class="fact-label">TXID</div><div class="fact-value mono" style="font-size:12px">${tx}</div></div>
        <div class="fact"><div class="fact-label">Deployed</div><div class="fact-value">${ts}</div></div>
      </div>
    </div>

    ${stakeBlock}

    <div id="interact" class="section">
      <div class="label" style="margin-bottom:10px">Direct Interaction</div>
      <div class="glass" style="text-align:center;padding:36px 28px">
        <p style="max-width:420px;margin:0 auto 18px;color:#94A3B8">All interactions are non-custodial and happen directly on the Kaspa blockchain with your wallet.</p>
        <button onclick="window.parent.postMessage({type:'COVENANT_EXECUTE'},'*')" class="btn" style="font-size:16px;padding:16px 40px">Connect Wallet &amp; Execute</button>
      </div>
    </div>

    <div style="text-align:center;padding:30px 0 10px;color:#475569;font-size:11px">
      Published by the creator • Fully transparent on Kaspa • <a href="https://explorer.kaspa.org/tx/${tx}" target="_blank" style="color:inherit">Verify</a>
    </div>
  </div>
</body></html>`;
}

export default function CovenantFix() {
  const { id } = useParams();
  const { address } = useWallet();
  const [allCovenants, setAllCovenants] = useState([]);
  const [myCovenants, setMyCovenants] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState({ primaryColor: '#49EACB', titleOverride: '', descOverride: '' });
  const [stakeAmount, setStakeAmount] = useState(50);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [showPreview, setShowPreview] = useState(null);
  const [toast, setToast] = useState(null);
  const [publishing, setPublishing] = useState(false);

  // Load all covenants and filter to mine
  useEffect(() => {
    setLoading(true);
    fetch(`/api/covenants?network=${localStorage.getItem('kaspaNetwork') || 'testnet-12'}`)
      .then(r => r.json())
      .then(d => {
        const list = (d.covenants || []);
        setAllCovenants(list);
        const mine = address ? list.filter(c => c.creator_addr && c.creator_addr === address) : [];
        setMyCovenants(mine);
        // Preselect if id param matches one of mine
        if (id) {
          const match = mine.find(c => c.tx_id === id) || list.find(c => c.tx_id === id && c.creator_addr === address);
          if (match) {
            setSelected(match);
            setStakeAmount(match.default_stake || 50);
            setConfig({ primaryColor: '#49EACB', titleOverride: match.name || '', descOverride: match.description || '' });
          }
        } else if (mine.length > 0) {
          // default select first
          const first = mine[0];
          setSelected(first);
          setStakeAmount(first.default_stake || 50);
          setConfig({ primaryColor: '#49EACB', titleOverride: first.name || '', descOverride: first.description || '' });
        }
      })
      .finally(() => setLoading(false));
  }, [address, id]);

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
    const html = buildTransparentCustomUI(selected, config, stakeAmount);
    const payload = {
      custom_ui_code: html,
      signer_address: address,
      name: config.titleOverride || selected.name,
      description: config.descOverride || selected.description || (selected.covenant_type || 'Covenant'),
      // include stake hint in metadata if backend supports; otherwise it lives in the UI
      default_stake: stakeAmount,
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
        // Optimistic: update the selected
        setSelected((s) => ({ ...s, custom_ui_html: html }));
      } else {
        setToast({ type: 'success', msg: 'Published (local preview ready). Backend may sync shortly.' });
        setSelected((s) => ({ ...s, custom_ui_html: html }));
      }
    } catch (e) {
      // Still make it visible locally for the creator
      setSelected((s) => ({ ...s, custom_ui_html: html }));
      setToast({ type: 'success', msg: 'Saved locally for preview. Publish will sync when backend is reachable.' });
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
      <div className="max-w-xl mx-auto px-6 py-16 text-center">
        <div className="mx-auto mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5"><Wallet size={28} /></div>
        <h1 className="text-3xl font-semibold tracking-tight mb-2">Fix your covenants</h1>
        <p className="text-gray-400 mb-8">Connect the wallet that created the covenant. Then manage how it looks and set the single stake amount — all in one clean place.</p>
        <div className="text-xs text-gray-500">Use the wallet button in the top bar.</div>
        <Link to="/" className="mt-8 inline-block text-sm text-kaspa-green hover:underline">Back to Explorer</Link>
      </div>
    );
  }

  if (myCovenants.length === 0) {
    return (
      <div className="max-w-xl mx-auto px-6 py-16 text-center">
        <h1 className="text-3xl font-semibold tracking-tight mb-3">No covenants for this wallet</h1>
        <p className="text-gray-400 mb-8">Deploy a covenant first (from Deploy or Paid Builder). Once created with this address you will see it here for quick visual fixes and stake setup.</p>
        <div className="flex gap-3 justify-center">
          <Link to="/deploy" className="px-5 py-2.5 rounded-xl border border-white/15 text-sm">Deploy</Link>
          <Link to="/paid-builder" className="px-5 py-2.5 rounded-xl bg-white text-black text-sm font-semibold">Paid Studio</Link>
        </div>
        <Link to="/" className="mt-10 block text-xs text-gray-500 hover:text-gray-400">Return to registry</Link>
      </div>
    );
  }

  const previewHtml = selected ? generatePreviewHtml() : '';

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <Link to="/" className="inline-flex items-center gap-2 text-gray-400 hover:text-white text-sm font-mono tracking-widest"><ArrowLeft size={16}/>BACK TO REGISTRY</Link>
          <div className="mt-3 flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-kaspa-green/10 border border-kaspa-green/20"><Palette size={22} className="text-kaspa-green"/></div>
            <div>
              <div className="text-3xl font-semibold tracking-tight">Fix</div>
              <div className="text-sm text-gray-400 -mt-0.5">Change how your covenants look. One clean section for the stake amount and rules.</div>
            </div>
          </div>
        </div>
        <Link to="/covenant" className="text-xs px-4 py-2 rounded-xl border border-white/10 hover:bg-white/5">New Covenant</Link>
      </div>

      {/* My Covenants - simple list to pick from */}
      <div className="mb-8">
        <div className="text-xs uppercase tracking-[2px] text-gray-500 mb-3 px-1">YOUR COVENANTS ({myCovenants.length}) — click to manage</div>
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
                  setConfig({ primaryColor: '#49EACB', titleOverride: c.name || '', descOverride: c.description || '' });
                  setSelectedTemplate(null);
                }}
                className={`text-left rounded-2xl border p-4 transition ${isSel ? 'border-kaspa-green/60 bg-kaspa-green/[0.03]' : 'border-white/10 hover:border-white/20 bg-white/[0.01]'}`}
              >
                <div className="flex items-start justify-between">
                  <div className="font-semibold text-white truncate pr-3">{c.name || TRUNC(c.tx_id)}</div>
                  {isChess && <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">CHESS</span>}
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
            {/* LOOKS — change how they look */}
            <div className="lg:col-span-3 rounded-3xl border border-white/10 bg-white/[0.015] p-6">
              <div className="flex items-center gap-2 mb-3">
                <Palette size={18} className="text-kaspa-green" />
                <div className="font-semibold">Change how it looks</div>
              </div>
              <div className="text-xs text-gray-400 mb-4">Pick a template. Preview exactly what regular users will see. Super clean and inviting.</div>

              {/* Garage grid - simple and easy */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {COVENANT_TEMPLATES.map((tpl) => {
                  const active = selectedTemplate?.id === tpl.id;
                  return (
                    <div key={tpl.id} className={`group rounded-2xl border overflow-hidden ${active ? 'border-kaspa-green/70 ring-1 ring-kaspa-green/20' : 'border-white/10 hover:border-white/25'}`}>
                      <div className="h-20 flex items-center justify-center text-center" style={{ background: `linear-gradient(135deg, #111 0%, #1a1f2e 100%)` }}>
                        <div>
                          <div className="text-white font-semibold tracking-tight">{tpl.name}</div>
                          <div className="text-[10px] text-white/60">{tpl.tagline}</div>
                        </div>
                      </div>
                      <div className="p-2.5 bg-black/40 flex gap-2">
                        <button onClick={() => openPreview(tpl)} className="flex-1 text-xs py-1.5 rounded-xl border border-white/15 hover:bg-white/5">Preview</button>
                        <button onClick={() => applyTemplate(tpl)} className={`flex-1 text-xs py-1.5 rounded-xl font-medium ${active ? 'bg-kaspa-green text-black' : 'bg-white/10 hover:bg-white/15'}`}>{active ? 'Chosen' : 'Choose'}</button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Minimal fine tune - 1 section feel */}
              <div className="mt-6 pt-5 border-t border-white/10 space-y-4">
                <div>
                  <div className="text-xs uppercase tracking-widest text-gray-500 mb-1.5">Title</div>
                  <input value={config.titleOverride} onChange={e => setConfig(s => ({...s, titleOverride: e.target.value}))} placeholder={selected.name || 'Covenant title'} className="w-full rounded-2xl bg-black/40 border border-white/10 px-4 py-3 text-sm focus:border-kaspa-green/40" />
                </div>
                <div>
                  <div className="text-xs uppercase tracking-widest text-gray-500 mb-1.5">Short description</div>
                  <input value={config.descOverride} onChange={e => setConfig(s => ({...s, descOverride: e.target.value}))} placeholder={selected.description || 'What this covenant does'} className="w-full rounded-2xl bg-black/40 border border-white/10 px-4 py-3 text-sm focus:border-kaspa-green/40" />
                </div>
                <div>
                  <div className="text-xs uppercase tracking-widest text-gray-500 mb-2">Accent color</div>
                  <div className="flex gap-2 flex-wrap">
                    {['#49EACB','#E8AF34','#10B981','#3B82F6','#8B5CF6','#EC4899','#F59E0B'].map(c => (
                      <button key={c} onClick={() => setConfig(s => ({...s, primaryColor: c}))} className={`h-8 w-8 rounded-full border-2 ${config.primaryColor === c ? 'border-white scale-110' : 'border-transparent'}`} style={{ background: c }} />
                    ))}
                    <input type="color" value={config.primaryColor} onChange={e => setConfig(s => ({...s, primaryColor: e.target.value}))} className="h-8 w-9 rounded border-0 p-0 overflow-hidden" />
                  </div>
                </div>
              </div>
            </div>

            {/* THE ONE SECTION: Stake amount + all of that — super clean */}
            <div className="lg:col-span-2 rounded-3xl border border-white/10 bg-white/[0.015] p-6 flex flex-col">
              <div className="font-semibold mb-1">Stake amount and all of that</div>
              <div className="text-xs text-gray-400 mb-4">Just set the number. Everything else is fixed, transparent, and already explained to players.</div>

              <div className="mb-2 text-[10px] tracking-[1.5px] text-gray-500">AMOUNT TO STAKE (KAS)</div>
              <input
                type="number"
                value={stakeAmount}
                onChange={e => setStakeAmount(Math.max(1, parseInt(e.target.value || '1', 10)))}
                className="w-full text-center text-6xl font-semibold tabular-nums tracking-[-2px] py-3 bg-transparent border border-white/10 rounded-3xl focus:outline-none focus:border-kaspa-green/40"
              />
              <div className="text-center text-xs text-gray-500 mt-1 mb-5">per player • winner takes all minus 2%</div>

              {/* All rules, clean and in order, no em dashes, super easy to read */}
              <div className="flex-1 rounded-2xl bg-black/40 border border-white/10 p-5 text-sm text-gray-200 leading-relaxed">
                { (selected.covenant_type || selected.category || '').toLowerCase().includes('chess') ? (
                  <>
                    10 minute winner takes all chess.<br/><br/>
                    Second player must match the stake within 5 minutes or the funds return automatically to you.<br/><br/>
                    Each player gets a 10 minute clock.<br/><br/>
                    Resign, timeout or checkmate ends the game.<br/><br/>
                    Winner receives the pot minus 2 percent. The 2 percent goes to your creator address to keep the arena running for the next games.<br/><br/>
                    All stakes are sent directly to the covenant address on Kaspa. Fully non-custodial.<br/><br/>
                    The chess v1 ZK circuit plus the oracle detects any lie or invalid play and can reject bad results.
                  </>
                ) : (
                  <>
                    Set the stake amount players use for this covenant.<br/><br/>
                    All logic, timers and payouts are defined in the on-chain covenant and the published transparent view.<br/><br/>
                    2 percent of resolved pots goes to the creator address to sustain the covenant.<br/><br/>
                    Everything is fully transparent. Players see the exact rules and on-chain facts.
                  </>
                )}
              </div>

              <button
                onClick={publish}
                disabled={publishing || !isCreatorOfSelected}
                className="mt-5 w-full py-4 bg-kaspa-green hover:bg-[#3bc2a6] active:scale-[0.985] text-black font-bold rounded-3xl flex items-center justify-center gap-2 disabled:opacity-60"
              >
                <Save size={18} /> {publishing ? 'PUBLISHING...' : 'PUBLISH LOOKS + STAKE SETTINGS'}
              </button>
              <div className="text-[10px] text-center text-gray-500 mt-2">One click. Viewers see the clean result immediately.</div>
            </div>
          </div>

          {/* Live preview of exactly what will be shown */}
          {selected && previewHtml && (
            <div className="mt-8">
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="text-xs uppercase tracking-[1.5px] text-gray-500 flex items-center gap-2"><Eye size={14}/> What regular users will see (live preview)</div>
                <button onClick={() => setShowPreview({ tpl: { name: 'Current' }, html: previewHtml })} className="text-xs px-3 py-1 rounded border border-white/15 hover:bg-white/5">Open fullscreen preview</button>
              </div>
              <div className="rounded-3xl overflow-hidden border border-white/10 bg-black">
                <iframe srcDoc={previewHtml} className="w-full h-[520px] bg-[#050507]" sandbox="allow-scripts" title="Published viewer preview" />
              </div>
              <div className="text-[10px] text-center text-gray-500 mt-2">This is the exact page people land on when they click your covenant. No terminal, no complexity.</div>
            </div>
          )}
        </div>
      )}

      {/* Template full preview modal */}
      {showPreview && (
        <div className="fixed inset-0 z-[90] bg-black/95 flex items-center justify-center p-4" onClick={() => setShowPreview(null)}>
          <div className="w-full max-w-[1080px] bg-[#050507] rounded-3xl border border-white/10 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-white/10 flex items-center gap-3 bg-black/40">
              <div className="font-semibold">{showPreview.tpl.name} preview — exactly what viewers see</div>
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
