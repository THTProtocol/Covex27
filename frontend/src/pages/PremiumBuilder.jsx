import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '../components/WalletContext';
import {
  Terminal, Code, ShieldCheck, AlertTriangle, ArrowLeft, Send,
  CheckCircle2, ExternalLink, Key, Sparkles, Play, Copy, Check,
  Cpu, Link2, Palette, Repeat, Percent, BookOpen, Zap, Gauge
} from 'lucide-react';
import DevWalletModal from '../components/DevWalletModal';
import { GAME_TYPES, generateSilverScriptForConfig } from '../components/CovexTerminal';

const SILVERSCRIPT_TEMPLATE = `contract PremiumCovenant {
    state {
        owner: Address,
    }
    entrypoint function claim(winner: Address) {
        let total = opTx.inputs[0].amount;
        require(opTx.outputs[0].address == winner);
        require(opTx.outputs[0].amount == total);
    }
}`;

function textToHex(str) {
  const scriptBytes = new TextEncoder().encode(str);
  const prefixed = new Uint8Array(2 + scriptBytes.length);
  prefixed[0] = 0xaa;
  prefixed[1] = 0x20;
  prefixed.set(scriptBytes, 2);
  return Array.from(prefixed).map(b => b.toString(16).padStart(2, '0')).join('');
}

export default function PremiumBuilder() {
  const navigate = useNavigate();
  const { address, signMessage, isDevMode, devMode } = useWallet();

  const paidTier = localStorage.getItem('covex_paid_tier') || 'CREATOR';
  const tierAccent = { CREATOR: '#3B82F6', PRO: '#E8AF34', MAX: '#A855F7' }[paidTier] || '#49EACB';

  // Full terminal state (this IS the paid terminal experience on the premium page)
  const [gameType, setGameType] = useState('chess_v1');
  const [resolutionMode, setResolutionMode] = useState('zk');
  const [customOracleKey, setCustomOracleKey] = useState('');
  const [zkCircuit, setZkCircuit] = useState('chess_v1');
  const [zkVerifierKey, setZkVerifierKey] = useState('0xCHESSv1_8x8_STANDARD_AUDITED');
  const [customUICode, setCustomUICode] = useState('');
  const [feePercent, setFeePercent] = useState(2);
  const [reusable, setReusable] = useState(true);
  const [allowTopups, setAllowTopups] = useState(true);

  // SilverScript writer (user writes the covenant script here)
  const [code, setCode] = useState(SILVERSCRIPT_TEMPLATE);
  const [generated, setGenerated] = useState('');
  const [copied, setCopied] = useState(false);

  const [status, setStatus] = useState('idle');
  const [result, setResult] = useState(null);
  const [devWalletOpen, setDevWalletOpen] = useState(false);
  const [balance, setBalance] = useState(null);

  // Gate: only paid users
  useEffect(() => {
    const tier = localStorage.getItem('covex_paid_tier');
    if (!tier || tier === 'FREE') {
      navigate('/pricing', { replace: true });
    }
  }, [navigate]);

  const fetchBalance = useCallback(async () => {
    if (!address) return;
    try {
      const resp = await fetch(`/api/balance/${encodeURIComponent(address)}`);
      const data = await resp.json();
      if (data.balance !== undefined) setBalance(data.balance);
    } catch (_) {}
  }, [address]);
  useEffect(() => { fetchBalance(); }, [fetchBalance]);

  const handleGameTypeChange = useCallback((typeId) => {
    setGameType(typeId);
    const gt = GAME_TYPES.find(g => g.id === typeId);
    if (gt) {
      setResolutionMode('zk');
      setZkCircuit(gt.circuit);
      if (gt.circuit === 'chess_v1') setZkVerifierKey('0xCHESSv1_8x8_STANDARD_AUDITED');
      else if (gt.circuit === 'chess_v2') setZkVerifierKey('0xCHESSv2_DRAW_DETECTION_V1');
      else setZkVerifierKey('');
    }
  }, []);

  const generateScript = useCallback(() => {
    const script = generateSilverScriptForConfig({
      gameType, feePercent, resolutionMode, customOracleKey, zkCircuit, zkVerifierKey, reusable, allowTopups,
    });
    setGenerated(script);
    setCode(script);
  }, [gameType, feePercent, resolutionMode, customOracleKey, zkCircuit, zkVerifierKey, reusable, allowTopups]);

  const copyScript = async () => {
    const text = generated || code;
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  // Deploy using the paid tier (this is the actual charge moment for the covenant itself)
  const handleDeployPremium = useCallback(async () => {
    if (!address || !code.trim()) return;
    setStatus('deploying');
    setResult(null);

    try {
      const scriptHex = textToHex(code.trim());
      let signature = 'dev-mode-skip';
      try { signature = await signMessage(`DEPLOY_COVENANT:${code.trim()}`); } catch (_) {}

      let txid = null;

      if (isDevMode && devMode?.privateKeyHex) {
        const scriptName = (code.trim().split('\n')[0] || 'Premium Covenant').replace(/^\W+/, '').trim();

        const resp = await fetch('/api/sign-and-broadcast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            private_key_hex: devMode.privateKeyHex,
            deployer_addr: address,
            script_hex: scriptHex,
            tier: paidTier,
            covenant_name: scriptName,
            use_dev_mode: false,
          }),
        });
        const data = await resp.json();
        if (!data.success) throw new Error(data.error || 'Backend rejected the deploy');
        txid = data.tx_id;
      } else {
        throw new Error('Connect the TN12 Dev Wallet (or a real wallet) to broadcast the covenant.');
      }

      if (!txid) throw new Error('No txid returned');

      setResult({ success: true, txid, tier: paidTier, timestamp: new Date().toISOString() });
      setStatus('success');

      // After success, go straight to the real covenant Terminal tab (full paid experience)
      setTimeout(() => {
        navigate(`/covenant/${encodeURIComponent(txid)}?tab=terminal`);
      }, 1600);
    } catch (err) {
      setResult({ success: false, error: err.message || 'Deployment failed' });
      setStatus('error');
    }
  }, [address, code, signMessage, isDevMode, devMode, paidTier, navigate]);

  const isConnected = !!address;
  const canDeploy = isConnected && code.trim().length > 10 && status !== 'deploying';

  return (
    <div className="relative z-10 max-w-6xl mx-auto px-6 py-10">
      <button
        onClick={() => navigate('/paid-builder')}
        className="flex items-center gap-2 text-gray-300 hover:text-[#49EACB] mb-6 text-sm"
      >
        <ArrowLeft size={16} /> Back to My Covenants (post-payment view)
      </button>

      {/* TRUE PAID-AREA PAYWALL HEADER, you just paid for this */}
      <div
        className="rounded-3xl p-8 mb-8 border relative overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${tierAccent}10 0%, #0a0a0a 40%, #111 100%)`,
          borderColor: tierAccent + '40'
        }}
      >
        <div className="absolute top-0 left-0 right-0 h-1" style={{ background: `linear-gradient(90deg, transparent, ${tierAccent}, transparent)` }} />
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ backgroundColor: tierAccent + '20', border: `1px solid ${tierAccent}40` }}>
            <Sparkles size={28} style={{ color: tierAccent }} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-black text-white">Premium Paid Builder</h1>
              <span className="px-4 py-1 rounded-full text-xs font-mono font-bold tracking-widest" style={{ background: tierAccent + '20', color: tierAccent, border: `1px solid ${tierAccent}30` }}>
                {paidTier} • PAID
              </span>
            </div>
            <p className="text-gray-300 mt-1">You paid the {paidTier} tier. This entire page (full Terminal + ZK + Oracles + Guide + SilverScript writer) is now unlocked for you. No free pages. No upsells.</p>
          </div>
        </div>
      </div>

      {/* FULL COVEX TERMINAL, right here on the paid page */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <Terminal size={20} className="text-[#49EACB]" />
          <h2 className="text-xl font-bold text-white">Full Covex Terminal, Configure Your Covenant</h2>
        </div>

        {/* Game Type + ZK at the very top (exactly as requested) */}
        <div className="bg-[#0a0a0a] border border-[#1f1f1f] rounded-2xl p-6 mb-4">
          <p className="uppercase text-xs tracking-widest text-gray-400 mb-3 font-mono">1. GAME TYPE + ZK CIRCUIT (auto-configures resolution)</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {GAME_TYPES.map(gt => (
              <button key={gt.id} onClick={() => handleGameTypeChange(gt.id)}
                className={`p-4 rounded-xl border text-left transition ${gameType === gt.id ? 'border-[#49EACB] bg-[#49EACB]/5 ring-1 ring-[#49EACB]/30' : 'border-white/5 hover:border-white/10 bg-black/40'}`}>
                <div className="text-3xl mb-1">{gt.emoji}</div>
                <div className="font-semibold text-white text-sm">{gt.name}</div>
                <div className="text-[10px] text-gray-300 mt-0.5">{gt.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* ZK / Oracle / Config row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <div className="bg-[#0a0a0a] border border-[#1f1f1f] rounded-2xl p-6">
            <p className="uppercase text-xs tracking-widest text-gray-400 mb-3 font-mono">2. ZK PROOF OR ORACLE RESOLUTION</p>
            <div className="space-y-3">
              {[
                { m: 'zk', label: 'ZK Proof (recommended, no oracle needed)', desc: 'Cryptographic verification of game outcome' },
                { m: 'custom_oracle', label: 'Custom Oracle Key', desc: 'Your own trusted data feed / API' },
                { m: 'oracle', label: 'Standard Covex Oracle', desc: 'Default trusted resolution service' }
              ].map(opt => (
                <button key={opt.m} onClick={() => setResolutionMode(opt.m)}
                  className={`w-full text-left p-4 rounded-xl border flex gap-3 ${resolutionMode === opt.m ? 'border-[#49EACB] bg-[#49EACB]/5' : 'border-white/5'}`}>
                  <div className="pt-0.5"><ShieldCheck size={18} className={resolutionMode === opt.m ? 'text-[#49EACB]' : 'text-gray-400'} /></div>
                  <div>
                    <div className="font-medium text-white">{opt.label}</div>
                    <div className="text-xs text-gray-300">{opt.desc}</div>
                  </div>
                </button>
              ))}
            </div>
            {resolutionMode === 'zk' && (
              <div className="mt-4 space-y-2">
                <input value={zkCircuit} onChange={e => setZkCircuit(e.target.value)} className="w-full px-4 py-3 bg-black border border-white/10 rounded-xl text-sm" placeholder="ZK Circuit" />
                <input value={zkVerifierKey} onChange={e => setZkVerifierKey(e.target.value)} className="w-full px-4 py-3 bg-black border border-white/10 rounded-xl text-sm font-mono" placeholder="Verifier key" />
              </div>
            )}
            {resolutionMode === 'custom_oracle' && (
              <input value={customOracleKey} onChange={e => setCustomOracleKey(e.target.value)} className="w-full mt-4 px-4 py-3 bg-black border border-white/10 rounded-xl text-sm font-mono" placeholder="Your custom oracle public key or endpoint" />
            )}
          </div>

          <div className="bg-[#0a0a0a] border border-[#1f1f1f] rounded-2xl p-6 space-y-4">
            <div>
              <p className="uppercase text-xs tracking-widest text-gray-400 mb-2 font-mono">3. CUSTOM UI (from Covenant Studio)</p>
              <textarea value={customUICode} onChange={e => setCustomUICode(e.target.value)} rows={4}
                className="w-full bg-black border border-white/10 rounded-xl p-4 text-xs font-mono" placeholder="Paste the complete HTML/JS/CSS bundle you generated in Covenant Studio here. It becomes the interactive face of your covenant." />
            </div>
            <div className="flex gap-3 text-sm">
              <button onClick={() => setReusable(!reusable)} className={`flex-1 py-2 rounded-lg border ${reusable ? 'border-[#49EACB] bg-[#49EACB]/10' : 'border-white/10'}`}>Reusable: {reusable ? 'YES' : 'NO'}</button>
              <button onClick={() => setAllowTopups(!allowTopups)} className={`flex-1 py-2 rounded-lg border ${allowTopups ? 'border-[#49EACB] bg-[#49EACB]/10' : 'border-white/10'}`}>Top-ups: {allowTopups ? 'YES' : 'NO'}</button>
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1"><span>Platform fee</span><span className="font-mono text-[#49EACB]">{feePercent}%</span></div>
              <input type="range" min={0} max={10} step={0.5} value={feePercent} onChange={e => setFeePercent(parseFloat(e.target.value))} className="w-full accent-[#49EACB]" />
            </div>
          </div>
        </div>

        {/* SilverScript generator + the place the user WRITES the script */}
        <div className="bg-[#0a0a0a] border border-[#1f1f1f] rounded-2xl p-6 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2"><Play size={18} className="text-[#49EACB]" /><span className="uppercase tracking-widest text-xs font-mono text-gray-300">4. GENERATE + WRITE YOUR SILVERSCRIPT (this is your covenant)</span></div>
            <button onClick={generateScript} className="px-4 py-2 rounded-xl bg-[#49EACB] text-black text-sm font-bold flex items-center gap-2">
              <Play size={15} /> Generate from Terminal Config
            </button>
          </div>

          <textarea
            value={code}
            onChange={e => setCode(e.target.value)}
            spellCheck={false}
            className="w-full h-[320px] bg-black border border-white/10 rounded-2xl p-5 font-mono text-sm text-[#e6e6e6] leading-relaxed custom-scrollbar"
            style={{ tabSize: 4 }}
          />

          <div className="flex gap-3 mt-3">
            <button onClick={copyScript} className="flex items-center gap-2 px-5 py-3 rounded-xl border border-white/10 text-sm hover:bg-white/5">
              {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'Copied' : 'Copy Script'}
            </button>
            <button onClick={handleDeployPremium} disabled={!canDeploy} className="flex-1 flex items-center justify-center gap-3 px-6 py-3 bg-[#49EACB] text-black font-bold rounded-xl disabled:opacity-50">
              {status === 'deploying' ? 'Broadcasting your paid covenant...' : <><Send size={18} /> DEPLOY THIS COVENANT AS {paidTier} (PAID)</>}
            </button>
          </div>

          {result && (
            <div className={`mt-4 p-4 rounded-xl border text-sm ${result.success ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
              {result.success ? (
                <div className="flex items-center gap-2 text-emerald-400"><CheckCircle2 size={18} /> Covenant broadcast successful. Redirecting to its Terminal tab…</div>
              ) : (
                <div className="text-red-400">{result.error}</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* DIRECT STUDIO BUTTON, big and obvious */}
      <a href="http://localhost:5173" target="_blank" rel="noopener noreferrer"
        className="block mb-8 rounded-2xl border-2 border-[#49EACB]/40 bg-[#49EACB]/[0.03] p-6 hover:bg-[#49EACB]/[0.07] transition group">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-xl bg-[#49EACB]/20"><Code size={26} className="text-[#49EACB]" /></div>
          <div className="flex-1">
            <div className="font-bold text-xl text-white group-hover:text-[#49EACB]">Open Covenant Studio</div>
            <div className="text-gray-300">Design beautiful interactive UIs with templates → export the bundle → paste it in the Custom UI box above. This is how your covenant looks and feels to players.</div>
          </div>
          <ExternalLink className="text-[#49EACB] group-hover:translate-x-0.5 transition" />
        </div>
      </a>

      {/* THE COMPLETE GUIDE, "how to create, what not to forget, oracles, ZK, reusability, fees, design..." */}
      <div className="bg-[#0a0a0a] border border-[#1f1f1f] rounded-3xl p-8">
        <div className="flex items-center gap-3 mb-6">
          <BookOpen size={22} className="text-[#49EACB]" />
          <h3 className="text-2xl font-bold text-white">Complete Paid Builder Guide, Read This Before You Deploy</h3>
        </div>

        <div className="grid md:grid-cols-2 gap-4 text-sm">
          {[
            { icon: Cpu, title: 'ZK Circuits (most important)', text: 'Always start by picking a Game Type above. It automatically wires the correct audited ZK circuit. The circuit proves the outcome (win/loss/draw/hand strength/etc) without revealing private player data. Never skip this, ZK is what makes the covenant trustless and verifiable on-chain.' },
            { icon: Link2, title: 'Oracles, when you need real-world data', text: 'If your covenant depends on external facts (sports result, weather, stock price, API), choose Custom Oracle or Standard Oracle above and supply the key/endpoint. Oracles attest the real outcome so the script can pay out correctly. For pure on-chain games (chess, dice, poker), use ZK instead and you need zero oracle.' },
            { icon: Palette, title: 'Custom UI & Covenant Studio (what players see)', text: 'The visual experience is 80% of engagement. Use Covenant Studio (button above) to pick a template, brand it, generate the self-contained HTML/JS/CSS, then paste it into the Custom UI box. After you deploy the script, go to the covenant\'s Terminal tab and you can further refine or re-upload the UI.' },
            { icon: Repeat, title: 'Reusability & Top-ups (economy design)', text: 'Turn Reusable ON if you want the same covenant to accept many interactions over time. Turn Allow Top-ups ON so players can add more KAS to the pot later. These two toggles create sustainable games instead of one-shot escrows.' },
            { icon: Percent, title: 'Fees & Payout Logic (what not to forget)', text: 'Set your platform fee (0-10%) above, it is automatically taken on every resolution. In the SilverScript you are writing right now, make the payout branches explicit for every possible outcome (including draws, timeouts, forfeits, and edge cases). Clear payout rules = happy users and no disputes.' },
            { icon: Zap, title: 'Things you must not forget', text: '• Test on TN12 with tiny amounts first\n• Verify your ZK circuit against several edge cases\n• Make sure any oracle you use responds quickly and reliably\n• Test the pasted UI on both desktop and mobile\n• After the first deploy, immediately open the covenant ?tab=terminal and save the full config (ZK key, oracle, UI)\n• Document your rules publicly so players know exactly what happens' },
            { icon: Gauge, title: 'After you deploy from this page', text: 'You will be taken straight to your new covenant\'s Terminal tab. There you have the real persistent Covex Terminal for that specific covenant, can tweak anything, re-generate scripts, and manage the UI. All your paid-tier covenants appear in the Explorer with the visibility ranking your tier bought.' },
          ].map((g, i) => (
            <div key={i} className="p-5 rounded-2xl bg-black/40 border border-white/5">
              <div className="flex gap-3 mb-2">
                <g.icon size={18} className="text-[#49EACB] mt-0.5" />
                <div className="font-semibold text-white">{g.title}</div>
              </div>
              <div className="text-gray-300 leading-relaxed text-xs whitespace-pre-line">{g.text}</div>
            </div>
          ))}
        </div>

        <div className="mt-6 text-xs text-center text-gray-400 border-t border-white/10 pt-4">
          This is the complete paid experience you unlocked. Higher tiers only improve your ranking on the Explorer, the full Terminal, ZK, Oracle tools, Studio integration, and this guide are identical for Creator / PRO / MAX.
        </div>
      </div>

      <DevWalletModal isOpen={devWalletOpen} onClose={() => setDevWalletOpen(false)} />
    </div>
  );
}
