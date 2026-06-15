import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '../components/WalletContext';
import {
  Terminal, Code, ShieldCheck, AlertTriangle, ArrowLeft, Send,
  CheckCircle2, ExternalLink, Key, Wallet, Zap, Cpu, BookOpen,
  Palette, Gauge, Link2, Lock, Repeat, Percent, ArrowRight,
  Sparkles, Play, Copy, Check, KeyRound, Clock
} from 'lucide-react';
import DevWalletModal from '../components/DevWalletModal';
import { GAME_TYPES, generateSilverScriptForConfig } from '../components/CovexTerminal';
import { signCovenantOwnership } from '../lib/ownership';
import { CircuitGlyph } from '../lib/circuitIcon';

const SILVERSCRIPT_TEMPLATE = `contract SimpleWinnerTakesAll {
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

export default function PaidDeploy() {
  const navigate = useNavigate();
  const { address, signMessage, isDevMode, devMode } = useWallet();
  const [code, setCode] = useState(SILVERSCRIPT_TEMPLATE);
  const [status, setStatus] = useState('idle');
  const [result, setResult] = useState(null);
  const [devWalletOpen, setDevWalletOpen] = useState(false);
  const [balance, setBalance] = useState(null);

  const paidTier = localStorage.getItem('covex_paid_tier') || 'BUILDER';

  // ── Full Covex Terminal State (embedded for premium paid experience) ──
  const [gameType, setGameType] = useState('chess_v1');
  const [resolutionMode, setResolutionMode] = useState('zk');
  const [customOracleKey, setCustomOracleKey] = useState('');
  const [zkCircuit, setZkCircuit] = useState('chess_v1');
  const [zkVerifierKey, setZkVerifierKey] = useState('0xCHESSv1_8x8_STANDARD_AUDITED');
  const [customUICode, setCustomUICode] = useState('');
  const [feePercent, setFeePercent] = useState(2);
  const [reusable, setReusable] = useState(true);
  const [allowTopups, setAllowTopups] = useState(true);
  const [generatedFromConfig, setGeneratedFromConfig] = useState('');
  const [copiedGen, setCopiedGen] = useState(false);
  const [useCompiled, setUseCompiled] = useState(true); // compiled (recommended) vs legacy raw source

  // === ON-CHAIN ENFORCEMENT (1.2: real script-locked custody, no decorative deploy) ===
  // The deploy locks the stake into a real enforced P2SH primitive (the genuinely
  // trustless custody). The SilverScript above is attached as the covenant's DECLARED
  // higher-level logic + the pasted UI is its interface - silverc opcode enforcement is
  // still maturing, so custody is what the chain enforces today.
  const net0 = (typeof window !== 'undefined' && localStorage.getItem('kaspaNetwork')) || 'testnet-12';
  const isMainnet = net0 === 'mainnet' || net0 === 'mainnet-1';
  const [enforceKind, setEnforceKind] = useState('singlesig');
  const [stakeKas, setStakeKas] = useState('1.0');
  const [lockBlocks, setLockBlocks] = useState('100');
  const [tipDaa, setTipDaa] = useState(null);
  const canSign = isDevMode && devMode?.privateKeyHex;

  useEffect(() => {
    fetch('/api/status').then(r => r.json()).then(j => {
      const n = j.node_sync && j.node_sync[net0];
      if (n && n.tip_daa) setTipDaa(n.tip_daa);
    }).catch(() => {});
  }, [net0]);

  const handleGameTypeChange = useCallback((typeId) => {
    setGameType(typeId);
    const gt = GAME_TYPES.find(g => g.id === typeId);
    if (gt) {
      setResolutionMode('zk');
      setZkCircuit(gt.circuit);
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

  const runGenerator = useCallback(() => {
    const script = generateSilverScriptForConfig({
      gameType,
      feePercent,
      resolutionMode,
      customOracleKey,
      zkCircuit,
      zkVerifierKey,
      reusable,
      allowTopups,
    });
    setGeneratedFromConfig(script);
    setCode(script); // load directly into editor
  }, [gameType, feePercent, resolutionMode, customOracleKey, zkCircuit, zkVerifierKey, reusable, allowTopups]);

  const copyGenerated = async () => {
    if (!generatedFromConfig) return;
    await navigator.clipboard.writeText(generatedFromConfig);
    setCopiedGen(true);
    setTimeout(() => setCopiedGen(false), 1500);
  };

  // Redirect FREE users back to Pricing
  useEffect(() => {
    if (paidTier === 'FREE' || !paidTier) {
      navigate('/pricing', { replace: true });
    }
  }, [paidTier, navigate]);

  const fetchBalance = useCallback(async () => {
    if (!address) return;
    try {
      const net = localStorage.getItem('kaspaNetwork') || 'testnet-12';
      const resp = await fetch(`/api/balance/${encodeURIComponent(address)}?network=${net}`);
      const data = await resp.json();
      if (data.balance !== undefined && data.balance !== null) setBalance(data.balance);
    } catch (_) {}
  }, [address]);

  useEffect(() => { fetchBalance(); }, [fetchBalance]);

  // Auto-redirect to Terminal after successful deploy (use the enforced <tx>:0 id)
  useEffect(() => {
    if (status === 'success' && result?.covId) {
      const timer = setTimeout(() => {
        navigate(`/covenant/${encodeURIComponent(result.covId)}?tab=terminal`);
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [status, result, navigate]);

  // Deploy (1.2 - everything trustless): lock the stake into a REAL script-enforced P2SH
  // covenant, then attach the authored SilverScript (declared logic) + custom UI on top.
  // No decorative /api/sign-and-broadcast. Funds lock to a Kaspa script hash and are
  // redeemable non-custodially by the creator's own key - no Covex key in the payout path.
  const handleDeploy = useCallback(async () => {
    if (!address) return;
    setStatus('deploying');
    setResult(null);

    try {
      const net = localStorage.getItem('kaspaNetwork') || 'testnet-12';
      const mainnet = net === 'mainnet' || net === 'mainnet-1';
      if (mainnet) throw new Error('Enforced on-chain deploy on mainnet needs wallet-side funding (coming soon). Switch to a testnet to deploy a real script-enforced covenant now.');
      if (!(isDevMode && devMode?.privateKeyHex)) {
        throw new Error('Connect a testnet key (Connect Dev Wallet) to sign the real on-chain deploy.');
      }

      const stakeAmt = parseFloat(stakeKas);
      if (!(stakeAmt > 0)) throw new Error('Enter a stake greater than 0 KAS to lock.');

      // Build the enforced redeem for the chosen primitive. All lock to the deployer's
      // own key, redeemable only by the deployer (reproducible from the on-chain redeem
      // script with recover-covenant.mjs).
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
      const covId = `${txid}:0`;

      const scriptName = code.trim().split('\n')[0].replace(/\/\/\s*/, '').trim()
        || code.trim().split('\n')[0].split(' ')[1]
        || `${enforceKind} covenant`;

      // Attach the authored SilverScript (declared logic) + the pasted custom UI to the
      // enforced covenant via terminal-config. The enforced covenant is indexed at once
      // with the creator address, so the save needs an ownership signature over <tx>:0.
      let ownerProof = { signer_address: address };
      try { ownerProof = await signCovenantOwnership(covId, address, signMessage); } catch (_) { /* not yet protected */ }
      const termRes = await fetch(`/api/terminal-config/${encodeURIComponent(covId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: scriptName,
          description: `Script-enforced ${enforceKind} covenant (${stakeAmt} KAS locked). Declared logic (SilverScript):\n${code.trim()}`,
          fee_percent: feePercent,
          reusable,
          allow_topups: allowTopups,
          custom_ui_code: customUICode || null,
          resolution_mode: resolutionMode,
          zk_circuit: zkCircuit || null,
          zk_verifier_key: zkVerifierKey || null,
          custom_oracle_key: resolutionMode === 'custom_oracle' ? (customOracleKey || null) : null,
          ...ownerProof,
        }),
      });
      const termJson = await termRes.json().catch(() => ({}));

      setResult({
        success: true, script: code.trim(),
        txid, covId, deployer: address, tier: paidTier,
        p2sh: deployJson.p2sh_address,
        redeem_script_hex: deployJson.redeem_script_hex,
        preimage, lock_daa: redeem.lock_daa || null,
        enforceKind, lockedKas: stakeAmt,
        terminalSaved: !!termJson.success,
        timestamp: new Date().toISOString(),
      });
      setStatus('success');
    } catch (err) {
      setResult({ success: false, error: err.message || 'Deployment failed', timestamp: new Date().toISOString() });
      setStatus('error');
    }
  }, [address, code, signMessage, isDevMode, devMode, paidTier, enforceKind, stakeKas, lockBlocks, tipDaa, feePercent, reusable, allowTopups, customUICode, resolutionMode, zkCircuit, zkVerifierKey, customOracleKey]);

  const isConnected = !!address;
  // The enforced primitive is the custody; the SilverScript is optional declared logic,
  // so a deploy only needs a connected key + a positive stake.
  const canDeploy = isConnected && parseFloat(stakeKas) > 0 && status !== 'deploying';

  return (
    <div className="relative z-10 max-w-6xl mx-auto px-6 py-12 animate-in fade-in duration-300">
      <button
        onClick={() => navigate('/paid-builder')}
        className="flex items-center gap-2 text-gray-300 hover:text-[#49EACB] transition-colors mb-8 text-sm font-medium"
      >
        <ArrowLeft size={16} />
        Back to Paid Builder Hub
      </button>

      {/* === PREMIUM PAID EXPERIENCE HEADER === */}
      <div
        className="bg-gradient-to-br from-[#0a0a0a] to-black border border-[#49EACB]/30 rounded-3xl p-8 mb-10 relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #0a0a0a 0%, #111111 100%)' }}
      >
        <div className="absolute top-0 left-0 right-0 h-1" style={{ background: 'linear-gradient(90deg, transparent, #49EACB, transparent)' }} />
        <div className="flex items-start gap-5">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center shrink-0" style={{ backgroundColor: '#49EACB15', border: '1px solid #49EACB30' }}>
            <Sparkles size={32} className="text-[#49EACB]" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-black text-white">{paidTier} Premium Builder</h1>
              <span className="px-4 py-1 rounded-full text-xs font-mono font-bold tracking-[2px]" style={{ backgroundColor: '#49EACB15', border: '1px solid #49EACB30', color: '#49EACB' }}>
                PAID EXPERIENCE
              </span>
            </div>
            <p className="text-sm text-gray-300 max-w-3xl leading-relaxed">
              Everything in one place. Configure Game Type + ZK Circuit, paste Custom UI from Covenant Studio, set Oracle/ZK resolution,
              generate SilverScript, deploy, and access full guides. This is the paid-tier only flow, no free deploy pages.
            </p>
            <div className="flex items-center gap-4 mt-4">
              <div className="text-[10px] uppercase tracking-widest text-[#49EACB]/70 font-mono">ONE-TIME PAYMENT • FULL ACCESS • NO SUBSCRIPTION</div>
            </div>
          </div>
          <div className="text-right text-xs text-gray-200 font-mono">{paidTier} • TN12</div>
        </div>
      </div>

      {/* === FULL COVEX TERMINAL (Game Type + ZK at top) === */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-[#49EACB]/10"><Terminal size={18} className="text-[#49EACB]" /></div>
          <div>
            <h2 className="text-lg font-bold text-white">Covex Terminal, Full Configuration</h2>
            <p className="text-xs text-gray-300">Select game type (auto-configures ZK). Configure resolution, paste UI, generate script.</p>
          </div>
        </div>

        {/* Game Type Selection */}
        <div className="bg-[#0a0a0a]/95 border border-[#1f1f1f] rounded-2xl p-6 mb-4">
          <p className="text-xs uppercase tracking-wider text-gray-300 mb-3 font-mono">GAME TYPE + ZK CIRCUIT (auto-selects resolution)</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {GAME_TYPES.map((gt) => (
              <button
                key={gt.id}
                onClick={() => handleGameTypeChange(gt.id)}
                className={`p-4 rounded-xl border text-left transition-all flex flex-col gap-2 ${gameType === gt.id ? 'border-[#49EACB] bg-[#49EACB]/[0.06] ring-1 ring-[#49EACB]/30' : 'border-white/[0.06] bg-black/30 hover:border-white/10 hover:-translate-y-0.5'}`}
              >
                <CircuitGlyph type={gt} size={38} />
                <div className="text-sm font-semibold text-white">{gt.name}</div>
                <div className="text-[10px] text-gray-300 mt-0.5 line-clamp-2">{gt.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* ZK / Oracle Configuration */}
        <div className="bg-[#0a0a0a]/95 border border-[#1f1f1f] rounded-2xl p-6 mb-4">
          <p className="text-xs uppercase tracking-wider text-gray-300 mb-3 font-mono">OUTCOME RESOLUTION, ZK CIRCUIT / ORACLE</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
            {[
              { mode: 'zk', label: 'ZK Proof', desc: 'Cryptographic proof of outcome (oracle-attested until on-chain ZK matures)', icon: ShieldCheck },
              { mode: 'custom_oracle', label: 'Custom Oracle Key', desc: 'Your own trusted feed or API.', icon: Link2 },
              { mode: 'oracle', label: 'Standard Covex Oracle', desc: 'Default trusted resolution.', icon: Cpu },
            ].map((opt) => (
              <button
                key={opt.mode}
                onClick={() => setResolutionMode(opt.mode)}
                className={`p-4 rounded-xl border text-left transition ${resolutionMode === opt.mode ? 'border-[#49EACB] bg-[#49EACB]/[0.05]' : 'border-white/[0.06] hover:border-white/10'}`}
              >
                <opt.icon size={18} className={resolutionMode === opt.mode ? 'text-[#49EACB] mb-2' : 'text-gray-200 mb-2'} />
                <div className="font-semibold text-sm text-white">{opt.label}</div>
                <div className="text-xs text-gray-300 mt-1">{opt.desc}</div>
              </button>
            ))}
          </div>

          {resolutionMode === 'zk' && (
            <div className="space-y-3">
              <input value={zkCircuit} onChange={e => setZkCircuit(e.target.value)} placeholder="ZK Circuit ID" className="w-full px-4 py-3 rounded-xl bg-black/50 border border-white/10 text-sm text-white" />
              <input value={zkVerifierKey} onChange={e => setZkVerifierKey(e.target.value)} placeholder="Verifier Key (auto-filled for known circuits)" className="w-full px-4 py-3 rounded-xl bg-black/50 border border-white/10 text-sm text-white font-mono" />
            </div>
          )}
          {resolutionMode === 'custom_oracle' && (
            <input value={customOracleKey} onChange={e => setCustomOracleKey(e.target.value)} placeholder="Custom Oracle PubKey or Endpoint Key" className="w-full px-4 py-3 rounded-xl bg-black/50 border border-white/10 text-sm text-white font-mono" />
          )}
        </div>

        {/* Custom UI Paste Area + Fee / Reusability */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-4">
          <div className="lg:col-span-3 bg-[#0a0a0a]/95 border border-[#1f1f1f] rounded-2xl p-6">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2"><Palette size={16} className="text-[#49EACB]" /><span className="text-xs uppercase tracking-wider font-mono text-gray-300">CUSTOM UI (paste from Covenant Studio)</span></div>
              <a href="https://hightable.pro/studio/" target="_blank" className="text-xs text-[#49EACB] hover:underline flex items-center gap-1">Open Studio <ExternalLink size={11} /></a>
            </div>
            <textarea
              value={customUICode}
              onChange={(e) => setCustomUICode(e.target.value)}
              placeholder="Paste the full HTML/JS/CSS bundle generated by Covenant Studio here. It will be attached to your covenant after deploy."
              className="w-full h-36 bg-black/50 border border-white/10 rounded-xl p-4 text-xs font-mono text-white resize-y"
            />
            <p className="text-[10px] text-gray-200 mt-2">The UI renders on your public covenant page. Test on mobile too.</p>
          </div>

          <div className="lg:col-span-2 bg-[#0a0a0a]/95 border border-[#1f1f1f] rounded-2xl p-6 space-y-4">
            <div>
              <div className="flex justify-between text-xs mb-1.5"><span className="text-gray-300">Platform Fee</span><span className="font-mono text-[#49EACB]">{feePercent}%</span></div>
              <input type="range" min="0" max="10" step="0.5" value={feePercent} onChange={e => setFeePercent(parseFloat(e.target.value))} className="w-full accent-[#49EACB]" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setReusable(!reusable)} className={`flex-1 px-3 py-2 rounded-lg text-xs border ${reusable ? 'border-[#49EACB] bg-[#49EACB]/10' : 'border-white/10'}`}>Reusable: {reusable ? 'ON' : 'OFF'}</button>
              <button onClick={() => setAllowTopups(!allowTopups)} className={`flex-1 px-3 py-2 rounded-lg text-xs border ${allowTopups ? 'border-[#49EACB] bg-[#49EACB]/10' : 'border-white/10'}`}>Top-ups: {allowTopups ? 'ON' : 'OFF'}</button>
            </div>
            <button onClick={runGenerator} className="w-full mt-2 flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-white text-black font-bold text-sm active:scale-[0.985] transition">
              <Play size={16} /> GENERATE SILVERSCRIPT & LOAD INTO EDITOR
            </button>
            {generatedFromConfig && (
              <button onClick={copyGenerated} className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-white/10 text-xs text-[#49EACB]">
                {copiedGen ? <Check size={14} /> : <Copy size={14} />} {copiedGen ? 'COPIED' : 'COPY GENERATED SCRIPT'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* === DIRECT COVENANT STUDIO + GUIDE TEASER === */}
      <div className="flex flex-wrap gap-3 mb-8">
        <a
          href="https://hightable.pro/studio/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 min-w-[280px] flex items-center gap-4 px-6 py-4 rounded-2xl border-2 border-[#49EACB]/40 bg-[#49EACB]/[0.03] hover:bg-[#49EACB]/[0.08] transition group"
        >
          <div className="p-3 rounded-xl bg-[#49EACB]/20"><Code size={22} className="text-[#49EACB]" /></div>
          <div className="flex-1">
            <div className="font-bold text-white group-hover:text-[#49EACB] transition">Open Covenant Studio</div>
            <div className="text-xs text-gray-300">Design interactive UIs • Templates for games/betting • Export HTML/JS/CSS • Paste above</div>
          </div>
          
        </a>
        <button onClick={() => document.getElementById('guide-section')?.scrollIntoView({ behavior: 'smooth' })} className="flex-1 min-w-[240px] flex items-center gap-4 px-6 py-4 rounded-2xl border border-white/10 bg-[#111] hover:bg-[#1a1a1a] transition">
          <BookOpen size={20} className="text-[#49EACB]" />
          <div className="text-left text-sm">View Full Builder Guide & Best Practices</div>
        </button>
      </div>

      {/* === SILVERSCRIPT EDITOR + DEPLOY (core of terminal flow) === */}
      <div className="bg-[#0a0a0a]/95 backdrop-blur-xl border border-[#1f1f1f] rounded-2xl shadow-2xl overflow-hidden mb-8">
        {/* Wallet status or connect prompt */}
        {!isConnected ? (
          <div className="p-8 text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <ShieldCheck size={28} className="text-amber-400" />
            </div>
            <h3 className="text-lg font-semibold text-white">Connect Wallet to Deploy</h3>
            <p className="text-sm text-gray-300 max-w-md mx-auto">
              Connect your wallet to sign and broadcast your {paidTier}-tier covenant.
            </p>
            <div className="mt-4 pt-4 border-t border-[#1f1f1f]">
              {(() => {
                const net = (typeof window !== 'undefined' && localStorage.getItem('kaspaNetwork')) || 'testnet-12';
                const isMain = net === 'mainnet' || net === 'mainnet-1';
                if (isMain) {
                  return <p className="text-[10px] text-red-400/80">Dev wallets disabled on MAINNET. Use a real wallet extension (KasWare etc.) to deploy covenants with real KAS.</p>;
                }
                return (
                  <>
                    <p className="text-[10px] text-gray-300 uppercase tracking-wider mb-3">Testing / Dev Only</p>
                    <button onClick={() => setDevWalletOpen(true)} className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-yellow-600/40 bg-yellow-600/[0.06] hover:bg-yellow-600/[0.12] text-yellow-400 hover:text-yellow-300 font-semibold text-sm transition-all">
                      <Key size={16} /> Connect Dev Wallet
                    </button>
                    <p className="text-[9px] text-gray-300 mt-2 text-center">Derives keys locally via kaspa-wasm. No extensions required.</p>
                  </>
                );
              })()}
            </div>
          </div>
        ) : (
          <>
            {/* Connected wallet bar */}
            <div className={`p-4 border-b border-[#1f1f1f] flex items-center justify-between ${isDevMode ? 'bg-yellow-600/[0.04]' : 'bg-emerald-500/[0.04]'}`}>
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full animate-pulse ${isDevMode ? 'bg-yellow-400' : 'bg-emerald-400'}`} />
                <div>
                  <p className={`text-xs font-mono ${isDevMode ? 'text-yellow-400' : 'text-emerald-400'}`}>{isDevMode ? 'DEV MODE' : 'CONNECTED'}</p>
                  <p className="text-sm font-mono text-white truncate max-w-[240px]">{address}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {balance !== null && <span className="text-[11px] font-mono text-gray-300">{(balance / 1e8).toFixed(4)} KAS</span>}
                <span className="text-[10px] font-mono text-gray-300">{(() => { const n = (typeof window !== 'undefined' && localStorage.getItem('kaspaNetwork')) || 'testnet-12'; return n === 'mainnet' ? 'MAINNET' : n === 'testnet-10' ? 'TN10' : 'TN12'; })()}</span>
              </div>
            </div>

            {/* Editor */}
            <div className="rounded-xl border border-[#2a2a2a] bg-[#0d0d0d] overflow-hidden flex flex-col shadow-inner m-6">
              <div className="flex items-center justify-between px-4 py-2.5 bg-[#141414] border-b border-[#2a2a2a]">
                <div className="flex items-center gap-2 text-gray-300 text-xs font-mono tracking-wider">
                  <Terminal size={14} className="text-[#49EACB]" />
                  <span>covenant.ss</span>
                </div>
                <button onClick={() => setCode(SILVERSCRIPT_TEMPLATE)} className="text-[10px] text-gray-300 hover:text-[#49EACB] transition-colors">RESET</button>
              </div>
              <textarea
                value={code} onChange={(e) => setCode(e.target.value)} spellCheck="false"
                className="w-full h-[340px] bg-transparent text-[#e6e6e6] font-mono text-sm p-5 focus:outline-none resize-none custom-scrollbar leading-relaxed"
                style={{ tabSize: 4 }}
              />
            </div>

            {/* Deploy button */}
            <div className="px-6 pb-6">
              {/* On-chain enforcement (1.2): the deploy locks real funds in a script-enforced primitive */}
              <div className="mb-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.03] p-5">
                <div className="flex items-center gap-2 mb-2 text-xs uppercase tracking-widest text-emerald-300/90 font-mono"><ShieldCheck size={14} /> On-chain enforcement (real script-locked custody)</div>
                <p className="text-[11px] text-gray-300 mb-4">Your deploy locks the stake into a Kaspa script hash enforced by consensus, redeemable non-custodially by your own key. The SilverScript above is attached as the covenant's declared logic and the pasted UI as its interface.</p>
                <div className="grid grid-cols-3 gap-2 mb-4">
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
                        <div className="text-[10px] text-gray-300 mt-0.5 leading-snug">{k.blurb}</div>
                      </button>
                    );
                  })}
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <label className="block text-sm">
                    <span className="text-xs text-gray-300">Stake to lock (KAS)</span>
                    <input value={stakeKas} onChange={e => setStakeKas(e.target.value)} inputMode="decimal" className="mt-1 w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 font-mono text-white" />
                  </label>
                  {enforceKind === 'timelock' && (
                    <label className="block text-sm">
                      <span className="text-xs text-gray-300">Lock for (DAA blocks){tipDaa ? ` - unlocks at ${tipDaa + Math.max(1, parseInt(lockBlocks || '100', 10))}` : ''}</span>
                      <input value={lockBlocks} onChange={e => setLockBlocks(e.target.value)} inputMode="numeric" className="mt-1 w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 font-mono text-white" />
                    </label>
                  )}
                </div>
                {enforceKind === 'hashlock' && <p className="text-[11px] text-gray-300 mt-2">A random secret is generated at deploy and shown once. Save it - it is required to redeem and is never stored on the server.</p>}
                {isMainnet ? (
                  <p className="text-[11px] text-amber-300 mt-3">On mainnet, enforced deploys need wallet-side funding (coming soon). Switch to a testnet to deploy a real covenant now.</p>
                ) : !canSign ? (
                  <p className="text-[11px] text-amber-300 mt-3">Connect a testnet key (Connect Dev Wallet) below to sign the real on-chain deploy.</p>
                ) : (
                  <p className="text-[11px] text-emerald-300/80 mt-3">Ready to lock {stakeKas} KAS into a real {enforceKind} covenant, redeemable non-custodially by your key.</p>
                )}
              </div>

              <div className="flex gap-3 mb-4">
                <button onClick={() => setUseCompiled(!useCompiled)}
                  className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium transition ${
                    useCompiled
                      ? 'border-[#49EACB]/50 bg-[#49EACB]/10 text-[#49EACB]'
                      : 'border-white/10 text-gray-400 hover:text-white'
                  }`}
                  title={useCompiled ? 'Compiled via silverc: ~30 bytes on-chain' : 'Legacy: full DSL text as payload (~900+ bytes)'}
                >
                  <Cpu size={16} />
                  {useCompiled ? 'Compiled (silverc)' : 'Legacy raw source'}
                </button>
              </div>
              <button onClick={handleDeploy} disabled={!canDeploy}
                className="w-full px-6 py-4 bg-[#49EACB] hover:bg-[#3cd8b6] text-black font-bold rounded-xl transition-all duration-200 shadow-[0_0_15px_rgba(73,234,203,0.3)] hover:shadow-[0_0_25px_rgba(73,234,203,0.6)] active:scale-95 flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed border-none text-lg"
              >
                {status === 'deploying' ? (
                  <span className="flex items-center gap-2">
                    <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                    Building TX and Broadcasting...
                  </span>
                ) : (
                  <span className="flex items-center gap-2"><Lock size={20} /> Lock {stakeKas} KAS &amp; Deploy {paidTier} Covenant</span>
                )}
              </button>

              {result && (
                <div className={`mt-4 p-5 rounded-xl border ${result.success ? 'bg-emerald-500/[0.04] border-emerald-500/20' : 'bg-red-500/[0.04] border-red-500/20'}`}>
                  <div className="flex items-center gap-3 mb-3">
                    {result.success ? <CheckCircle2 size={20} className="text-emerald-400" /> : <AlertTriangle size={20} className="text-red-400" />}
                    <p className={`text-sm font-semibold ${result.success ? 'text-emerald-400' : 'text-red-400'}`}>
                      {result.success ? 'SCRIPT-ENFORCED COVENANT DEPLOYED ON-CHAIN' : 'DEPLOYMENT FAILED'}
                    </p>
                  </div>
                  {result.success ? (
                    <div className="space-y-2 text-xs font-mono">
                      <div className="flex justify-between py-1 border-b border-white/5"><span className="text-gray-300">Enforcement</span><span className="text-emerald-400 font-bold">on-chain ({result.enforceKind})</span></div>
                      <div className="flex justify-between py-1 border-b border-white/5"><span className="text-gray-300">Locked</span><span className="text-[#49EACB]">{result.lockedKas} KAS</span></div>
                      <div className="flex justify-between py-1 border-b border-white/5"><span className="text-gray-300">TXID</span><span className="text-[#49EACB]">{result.txid.length > 30 ? result.txid.slice(0, 30) + '...' : result.txid}</span></div>
                      {result.p2sh && <div className="flex justify-between py-1 border-b border-white/5 gap-3"><span className="text-gray-300 shrink-0">P2SH</span><span className="text-[#49EACB] break-all text-right">{result.p2sh}</span></div>}
                      <div className="flex justify-between py-1 border-b border-white/5"><span className="text-gray-300">Tier</span><span className="text-[#49EACB] font-bold">{result.tier}</span></div>
                      <div className="flex justify-between py-1"><span className="text-gray-300">Custom UI / logic saved</span><span className="text-emerald-400">{result.terminalSaved ? 'yes' : 'pending'}</span></div>
                      <div className="flex justify-between py-1"><span className="text-gray-300">Opening Terminal...</span><span className="text-emerald-400 animate-pulse">NON-CUSTODIAL</span></div>
                    </div>
                  ) : (
                    <p className="text-xs text-red-400/80 whitespace-pre-wrap">{result.error}</p>
                  )}
                  {result.success && result.redeem_script_hex && (
                    <div className="mt-3 text-[11px] text-amber-300 font-mono break-all border border-amber-400/30 bg-amber-400/[0.04] rounded-lg p-2">
                      <span className="font-sans font-semibold">Save your redeem script</span> - required to spend this covenant and what makes it recoverable without trusting Covex (also re-servable from the covenant page):
                      <div className="mt-1">{result.redeem_script_hex}</div>
                    </div>
                  )}
                  {result.success && result.preimage && (
                    <div className="mt-2 text-[11px] text-amber-300 font-mono break-all">secret (save to redeem): {result.preimage}</div>
                  )}
                  {result.success && result.lock_daa && (
                    <div className="mt-2 text-[11px] text-gray-300">unlocks at DAA {result.lock_daa}{tipDaa ? (tipDaa >= result.lock_daa ? ' (elapsed - redeemable now)' : ` (~${result.lock_daa - tipDaa} blocks to go)`) : ''}</div>
                  )}
                  {result.success && result.covId && (
                    <div className="mt-4 pt-3 border-t border-emerald-500/10 flex gap-4">
                      <a href={`/covenant/${encodeURIComponent(result.covId)}`} className="inline-flex items-center gap-2 text-xs text-[#49EACB] hover:underline"><ExternalLink size={12} />View Covenant</a>
                      <a href={`https://tn12.kaspa.stream/tx/${result.txid}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-xs text-[#49EACB] hover:underline"><ExternalLink size={12} />TN12 Explorer</a>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* === CLEAR GUIDE / HELP SECTION (everything you need) === */}
      <div id="guide-section" className="bg-[#0a0a0a]/95 border border-[#1f1f1f] rounded-3xl p-8 mb-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2.5 rounded-xl bg-[#49EACB]/10"><BookOpen size={22} className="text-[#49EACB]" /></div>
          <div>
            <h2 className="text-2xl font-bold text-white">How to Build the Best Interactive Covenant</h2>
            <p className="text-sm text-gray-300">Complete paid-tier guide. Follow this for production-quality results.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          {[
            { icon: Cpu, title: 'ZK Circuit Selection', content: 'Choose from chess_blitz, chess_legal_move, range_proof, merkle_membership, age_verification, verifiable compute, and custom circuits. Each has its own oracle/resolution path. Select the right circuit for your covenant type.' },
            { icon: Link2, title: 'Oracle Integration', content: 'Choose resolution mode above: ZK (live for merkle/range circuits), Custom Oracle Key (your feed), or Standard Oracle. For real-world data (sports, weather, APIs) set the oracle key or endpoint. The Covex oracle attests outcomes with a SHA256-signed message; the signature can serve as a witness for covenant resolution. On-chain ZK verification will follow as silverc opcodes mature.' },
            { icon: Palette, title: 'Custom UI & Covenant Studio', content: 'Use the Covenant Studio link (top of this page). Pick a template (game lobby, betting interface, escrow dashboard), brand it with your colors, generate the standalone HTML/JS/CSS bundle, paste it into the "Custom UI" box above. It renders instantly on your covenant page after deploy. No hosting required.' },
            { icon: Repeat, title: 'Reusability & Top-Ups', content: 'Toggle Reusable ON for multi-round or multi-player covenants. Enable Allow Top-Ups so users can add more KAS to an active pot. Critical for ongoing games, leagues, or progressive jackpots. Non-reusable = single-use escrow.' },
            { icon: Percent, title: 'Fees & Payout Logic', content: 'Set platform fee (0-10%) above, auto-deducted on every resolution. In your SilverScript define the exact payout splits (winner-takes-all, proportional, draws split, timeouts, forfeits). The generator above bakes your fee + reusability settings into the script.' },
            { icon: Gauge, title: 'Best Practices & Checklist', content: '1. Always test on TN12 with tiny amounts first. 2. Verify ZK circuit against edge cases. 3. Confirm oracle responds fast. 4. Test pasted UI on mobile + desktop. 5. Deploy script first, then immediately open the covenant ?tab=terminal to save ZK/oracle/UI config. 6. Share test link before public announcement. 7. Document your payout rules clearly.' },
            { icon: ShieldCheck, title: 'After Deployment', content: 'You will be redirected to your new covenant\'s Terminal tab (?tab=terminal). From there you can fine-tune config, re-generate scripts, and attach the final UI. All paid-tier covenants get the full Terminal + Explorer visibility based on tier (Creator < PRO < MAX).' },
          ].map((sec, idx) => (
            <div key={idx} className="p-5 rounded-2xl bg-black/40 border border-white/[0.04] hover:border-[#49EACB]/20 transition">
              <div className="flex gap-3">
                <div className="mt-0.5"><sec.icon size={18} className="text-[#49EACB]" /></div>
                <div className="min-w-0">
                  <div className="font-semibold text-white mb-1.5">{sec.title}</div>
                  <div className="text-xs leading-relaxed text-gray-300">{sec.content}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 pt-6 border-t border-white/10 text-[11px] text-gray-300">
          <strong className="text-[#49EACB]">Remember:</strong> Paid users never see the free Deploy page. Everything here (Terminal config + Studio + Guides + Deploy) is the exclusive premium experience. Higher tiers only affect Explorer ranking, not feature access.
        </div>
      </div>

      <DevWalletModal isOpen={devWalletOpen} onClose={() => setDevWalletOpen(false)} />
    </div>
  );
}
