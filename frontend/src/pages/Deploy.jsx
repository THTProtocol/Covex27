import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '../components/WalletContext';
import { Terminal, Code, ShieldCheck, AlertTriangle, ArrowLeft, Send, CheckCircle2, ExternalLink, Key, Wallet, TrendingUp, ArrowUpCircle } from 'lucide-react';
import DevWalletModal from '../components/DevWalletModal';
import { GlassButton } from '../components/ui/GlassButton';

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

export default function Deploy() {
  const navigate = useNavigate();
  const { address, signMessage, isDevMode, devMode } = useWallet();
  const [code, setCode] = useState(SILVERSCRIPT_TEMPLATE);
  const [covenantName, setCovenantName] = useState('My Basic Covenant');
  const [covenantDesc, setCovenantDesc] = useState('A simple free SilverScript covenant. Fully interactable claim and basic resolution supported.');
  const [accentColor, setAccentColor] = useState('#49EACB');
  const [uiPreset, setUiPreset] = useState('glass');
  const [status, setStatus] = useState('idle');
  const [result, setResult] = useState(null);
  const [devWalletOpen, setDevWalletOpen] = useState(false);
  const [balance, setBalance] = useState(null);

  // Free deploy is open to everyone.
  // Paid users can still deploy basic/free covenants here.
  // They can later attach rich interactive UIs via the Terminal after paying for a tier on a specific covenant.

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

  // Auto-redirect after successful free deployment
  useEffect(() => {
    if (status === 'success' && result?.txid && !result.txid.startsWith('pending')) {
      const timer = setTimeout(() => {
        navigate(`/covenant/${encodeURIComponent(result.txid)}`);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [status, result, navigate]);

  const handleDeploy = useCallback(async () => {
    if (!address || !code.trim()) return;
    setStatus('deploying');
    setResult(null);

    try {
      const scriptHex = textToHex(code.trim());
      let signature = 'dev-mode-skip';
      try { signature = await signMessage(`DEPLOY_COVENANT:${code.trim()}`); } catch (_) {}

      let txid = null;

      if (isDevMode && devMode?.privateKeyHex) {
        const scriptName = code.trim().split('\n')[0].replace(/\/\/\s*/, '').trim()
          || code.trim().split('\n')[0].split(' ')[1]
          || 'SilverScript Covenant';

        const net = localStorage.getItem('kaspaNetwork') || 'testnet-12';
        const resp = await fetch('/api/sign-and-broadcast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            private_key_hex: devMode.privateKeyHex,
            deployer_addr: address,
            script_hex: scriptHex,
            tier: 'FREE',
            covenant_name: covenantName || scriptName,
            description: covenantDesc,
            accent: accentColor,
            ui_preset: uiPreset,
            use_dev_mode: false,
            network: net,
          }),
        });

        const data = await resp.json();
        if (!data.success) throw new Error(data.error || 'Backend sign-and-broadcast rejected');
        txid = data.tx_id;
      } else if (window.kasware && window.kasware.sendTransaction) {
        try {
          const resp = await window.kasware.sendTransaction({ to: address, amount: (100_000_000).toString(), data: code.trim() });
          txid = typeof resp === 'string' ? resp : resp?.txid || resp?.transactionId;
        } catch (kasErr) { console.warn('KasWare sendTransaction failed:', kasErr.message); }
      } else {
        throw new Error('No deployment-capable wallet. Use the "Connect Dev Wallet" button below (testnets only) or connect a real wallet extension for mainnet.');
      }

      if (!txid) throw new Error('No transaction ID returned.');

      setResult({
        success: true, script: code.trim(),
        signature: (signature || 'ok').slice(0, 50) + '...',
        txid, deployer: address, tier: 'FREE',
        timestamp: new Date().toISOString(),
      });
      setStatus('success');
    } catch (err) {
      setResult({ success: false, error: err.message || 'Deployment failed', timestamp: new Date().toISOString() });
      setStatus('error');
    }
  }, [address, code, signMessage, isDevMode, devMode]);

  const isConnected = !!address;
  const canDeploy = isConnected && code.trim().length > 0 && status !== 'deploying';

  return (
    <div className="relative z-10 max-w-4xl mx-auto px-6 py-12 animate-in fade-in duration-300">
      <button
        onClick={() => window.history.back()}
        className="flex items-center gap-2 text-gray-300 hover:text-[#49EACB] transition-colors mb-8 text-sm font-medium"
      >
        <ArrowLeft size={16} />
        Back
      </button>

      <div className="glass-section-1 relative">
      <div className="glass-panel rounded-2xl shadow-2xl overflow-hidden">
        {/* Free deploy explanation */}
        <div className="px-8 py-5 bg-gradient-to-r from-[#49EACB]/[0.06] via-[#49EACB]/[0.03] to-transparent border-b border-[#49EACB]/15">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-[#49EACB]/10 border border-[#49EACB]/25 flex items-center justify-center shrink-0 mt-0.5">
              <Terminal size={20} className="text-[#49EACB]" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-[#49EACB] mb-1">Free Covenant Deployment - Open to Everyone</h3>
              <p className="text-xs text-gray-300 leading-relaxed mb-2">
                This is the <strong>free entry point</strong> for deploying a basic covenant. No payment is required.
                Anyone - including users who already have a paid tier - can create simple on-chain covenants here.
              </p>
              <p className="text-xs text-gray-300 leading-relaxed">
                Later, you can pay for a tier (BUILDER / PRO / MAX) on any specific covenant you own to unlock the full Covex Terminal, custom interactive UIs from Covenant Studio, ZK circuits, oracles, and advanced features.
              </p>
              <p className="text-[10px] text-gray-400 mt-2">
                Paid users: Feel free to use this page for basic covenants. Your rich UI work happens in the Paid Builder after you attach a tier to a covenant.
              </p>
            </div>
          </div>
        </div>

        <div className="p-8 border-b border-[#1f1f1f] flex items-center gap-5 bg-[#0a0a0a]">
          <div className="w-14 h-14 rounded-xl bg-[#49EACB]/10 flex items-center justify-center border border-[#49EACB]/30 shrink-0">
            <Terminal size={28} className="text-[#49EACB]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-wide">Deploy Free Covenant</h1>
            <p className="text-sm text-gray-300 mt-1">
              Write SilverScript, sign with your wallet, deploy to Kaspa BlockDAG. Free tier only.
            </p>
          </div>
          <span className="ml-auto px-3 py-1 rounded-full bg-[#49EACB]/10 border border-[#49EACB]/20 text-[#49EACB] text-xs font-mono">
            {(() => { const n = (typeof window !== 'undefined' && localStorage.getItem('kaspaNetwork')) || 'testnet-12'; return n === 'mainnet' ? 'MAINNET' : n === 'testnet-10' ? 'TESTNET-10' : 'TESTNET-12'; })()}
          </span>
        </div>

        {!isConnected && (
          <div className="p-8 text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <ShieldCheck size={28} className="text-amber-400" />
            </div>
            <h3 className="text-lg font-semibold text-white">Connect Wallet to Deploy Covenants</h3>
            <p className="text-sm text-gray-300 max-w-md mx-auto">
              You need a connected Kaspa wallet to sign and broadcast SilverScript covenant deployments.
            </p>
            <div className="mt-5 pt-5 border-t border-[#1f1f1f]">
              {(() => {
                const net = (typeof window !== 'undefined' && localStorage.getItem('kaspaNetwork')) || 'testnet-12';
                const isMain = net === 'mainnet' || net === 'mainnet-1';
                if (isMain) {
                  return <p className="text-[10px] text-red-400/80">Dev wallets disabled on MAINNET. Use a real wallet extension to deploy covenants with real KAS.</p>;
                }
                return (
                  <>
                    <p className="text-[10px] text-gray-300 uppercase tracking-wider mb-3">Testing / Dev Only</p>
                    <button onClick={() => setDevWalletOpen(true)}
                      className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-yellow-600/40 bg-yellow-600/[0.06] hover:bg-yellow-600/[0.12] text-yellow-400 hover:text-yellow-300 font-semibold text-sm transition-all"
                    >
                      <Key size={16} /> Connect Dev Wallet
                    </button>
                    <p className="text-[9px] text-gray-300 mt-2 text-center">Derives keys locally via kaspa-wasm. No browser extensions required.</p>
                  </>
                );
              })()}
            </div>
          </div>
        )}

        {isConnected && (
          <div className="p-8 space-y-6">
            <div className={`p-4 rounded-xl border flex items-center justify-between ${isDevMode ? 'bg-yellow-600/[0.04] border-yellow-600/30' : 'bg-emerald-500/[0.04] border-emerald-500/20'}`}>
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full animate-pulse ${isDevMode ? 'bg-yellow-400' : 'bg-emerald-400'}`} />
                <div>
                  <p className={`text-xs font-mono ${isDevMode ? 'text-yellow-400' : 'text-emerald-400'}`}>{isDevMode ? 'DEV MODE' : 'CONNECTED'}</p>
                  <p className="text-sm font-mono text-white truncate max-w-[300px]">{address}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {balance !== null && <span className="text-[11px] font-mono text-gray-300">{(balance / 1e8).toFixed(4)} KAS</span>}
                <span className="text-[10px] font-mono text-gray-300">{(() => { const n = (typeof window !== 'undefined' && localStorage.getItem('kaspaNetwork')) || 'testnet-12'; return n === 'mainnet' ? 'MAINNET' : n === 'testnet-10' ? 'TN10' : 'TOCCATA TN12'; })()}</span>
              </div>
            </div>

            <div className="rounded-xl border border-[#2a2a2a] bg-[#0d0d0d] overflow-hidden flex flex-col shadow-inner">
              <div className="flex items-center justify-between px-4 py-2.5 bg-[#141414] border-b border-[#2a2a2a]">
                <div className="flex items-center gap-2 text-gray-300 text-xs font-mono tracking-wider">
                  <Terminal size={14} className="text-[#49EACB]" /> <span>covenant.ss</span>
                </div>
                <button onClick={() => setCode(SILVERSCRIPT_TEMPLATE)} className="text-[10px] text-gray-300 hover:text-[#49EACB] transition-colors">RESET</button>
              </div>
              <textarea value={code} onChange={(e) => setCode(e.target.value)} spellCheck="false"
                className="w-full h-[400px] bg-transparent text-[#e6e6e6] font-mono text-sm p-5 focus:outline-none resize-none custom-scrollbar leading-relaxed"
                style={{ tabSize: 4 }}
              />
            </div>

            <p className="text-[10px] text-gray-300 uppercase tracking-wider">Deploy as Free Covenant</p>
            <p className="text-[11px] text-gray-300 flex items-center gap-1">
              <Code size={12} /> Free covenants are indexed and visible on the Explorer. No Terminal or custom UI access.
            </p>

            <GlassButton onClick={handleDeploy} disabled={!canDeploy}
              className="w-full py-4 text-lg"
              glassColor="oklch(0.65 0.20 150 / 18%)"
            >
              {status === 'deploying' ? (
                <span className="flex items-center gap-2"><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />Building TX and Broadcasting...</span>
              ) : (
                <span className="flex items-center gap-2"><Send size={20} /> Deploy Covenant</span>
              )}
            </GlassButton>

            {result && (
              <div className={`mt-4 p-5 rounded-xl border ${result.success ? 'bg-emerald-500/[0.04] border-emerald-500/20' : 'bg-red-500/[0.04] border-red-500/20'}`}>
                <div className="flex items-center gap-3 mb-3">
                  {result.success ? <CheckCircle2 size={20} className="text-emerald-400" /> : <AlertTriangle size={20} className="text-red-400" />}
                  <p className={`text-sm font-semibold ${result.success ? 'text-emerald-400' : 'text-red-400'}`}>
                    {result.success ? 'COVENANT DEPLOYED AND BROADCAST' : 'DEPLOYMENT FAILED'}
                  </p>
                </div>
                {result.success ? (
                  <div className="space-y-2 text-xs font-mono">
                    <div className="flex justify-between py-1 border-b border-white/5"><span className="text-gray-300">TXID</span><span className="text-[#49EACB]">{result.txid.length > 30 ? result.txid.slice(0, 30) + '...' : result.txid}</span></div>
                    <div className="flex justify-between py-1 border-b border-white/5"><span className="text-gray-300">Tier</span><span className="text-gray-300">FREE</span></div>
                    <div className="flex justify-between py-1 border-b border-white/5"><span className="text-gray-300">Deployer</span><span className="text-gray-300">{result.deployer.slice(0, 22)}...</span></div>
                  </div>
                ) : <p className="text-xs text-red-400/80 whitespace-pre-wrap">{result.error}</p>}
                {result.success && result.txid && (
                  <div className="mt-4 pt-3 border-t border-emerald-500/10 flex gap-4">
                    <a href={`https://explorer.kaspa.org/tx/${result.txid}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-xs text-[#49EACB] hover:underline"><ExternalLink size={12} />View on Explorer</a>
                  </div>
                )}
              </div>
            )}

            {code.trim() && status === 'idle' && (
              <div className="p-4 rounded-xl bg-black/30 border border-white/5">
                <p className="text-[10px] text-gray-300 uppercase tracking-wider mb-2 flex items-center gap-1.5"><Code size={12} /> Script Analysis</p>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div><span className="text-gray-300">Lines:</span> <span className="text-gray-300">{code.split('\n').length}</span></div>
                  <div><span className="text-gray-300">Chars:</span> <span className="text-gray-300">{code.length}</span></div>
                  <div><span className="text-gray-300">Tier:</span> <span className="text-gray-300">FREE</span></div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      </div>{/* close glass-section-1 */}

      <DevWalletModal isOpen={devWalletOpen} onClose={() => setDevWalletOpen(false)} />
    </div>
  );
}
