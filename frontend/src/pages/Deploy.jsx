import { useState, useCallback, useEffect } from 'react';
import { useWallet } from '../components/WalletContext';
import { Terminal, Code, ShieldCheck, AlertTriangle, ArrowLeft, Send, CheckCircle2, ExternalLink, Key, Wallet, Zap, TrendingUp, Award } from 'lucide-react';
import DevWalletModal from '../components/DevWalletModal';

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

const COVENANT_TREASURY_ADDRESS = 'kaspatest:qpyfz03k6quxwf2jglwkhczvt758d8xrq99gl37p6h3vsqur27ltjhn68354m';

const TIERS = {
  FREE: { label: 'Free', fee: 0n, tier: 'FREE', icon: Zap, desc: 'Public listing on the covenant indexer' },
  CREATOR: { label: 'Creator (100 KAS)', fee: 10_000_000_000n, tier: 'CREATOR', icon: Code, desc: 'Interactive UI + full disclosure' },
  PRO: { label: 'PRO (500 KAS)', fee: 50_000_000_000n, tier: 'PRO', icon: TrendingUp, desc: 'Featured listing + priority indexing' },
  MAX: { label: 'MAX (1,000 KAS)', fee: 100_000_000_000n, tier: 'MAX', icon: Award, desc: 'Top placement + custom domain' },
};

function textToHex(str) {
  // SilverScript covenants must have aa20 opcode prefix for detection
  const scriptBytes = new TextEncoder().encode(str);
  const prefixed = new Uint8Array(2 + scriptBytes.length);
  prefixed[0] = 0xaa;
  prefixed[1] = 0x20;
  prefixed.set(scriptBytes, 2);
  return Array.from(prefixed).map(b => b.toString(16).padStart(2, '0')).join('');
}

export default function Deploy() {
  const { address, signMessage, isDevMode, devMode } = useWallet();
  const [code, setCode] = useState(SILVERSCRIPT_TEMPLATE);
  const [status, setStatus] = useState('idle');
  const [result, setResult] = useState(null);
  const [devWalletOpen, setDevWalletOpen] = useState(false);
  const [balance, setBalance] = useState(null);
  const [selectedTier, setSelectedTier] = useState('FREE');

  const fetchBalance = useCallback(async () => {
    if (!address) return;
    try {
      const resp = await fetch(`/api/balance/${encodeURIComponent(address)}`);
      const data = await resp.json();
      if (data.balance !== undefined && data.balance !== null) {
        setBalance(data.balance);
      }
    } catch (_) {}
  }, [address]);

  useEffect(() => { fetchBalance(); }, [fetchBalance]);

  const handleDeploy = useCallback(async () => {
    if (!address || !code.trim()) return;
    setStatus('deploying');
    setResult(null);

    try {
      const tierData = TIERS[selectedTier] || TIERS.FREE;
      const tierName = tierData.tier;
      const scriptHex = textToHex(code.trim());

      // Sign the payload for proof-of-authorship
      let signature = 'dev-mode-skip';
      try { signature = await signMessage(`DEPLOY_COVENANT:${code.trim()}`); } catch (_) {}

      let txid = null;
      let tierFeeKas = 0;

      // ── Dev mode: backend Rust signer (proven, no WASM tx building) ──
      if (isDevMode && devMode?.privateKeyHex) {
        const scriptName = code.trim().split('\n')[0].replace(/\/\/\s*/, '').trim()
          || code.trim().split('\n')[0].split(' ')[1] // "contract Name" → "Name"
          || 'SilverScript Covenant';

        console.log('[DEPLOY] Using backend Rust signer');
        console.log('[DEPLOY] scriptHex length:', scriptHex.length);
        console.log('[DEPLOY] deployer:', address);
        console.log('[DEPLOY] tier:', tierName);

        const resp = await fetch('/api/sign-and-broadcast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            private_key_hex: devMode.privateKeyHex,
            deployer_addr: address,
            script_hex: scriptHex,
            tier: tierName,
            covenant_name: scriptName,
            use_dev_mode: false,
          }),
        });

        const data = await resp.json();
        console.log('[DEPLOY] Backend response:', data);

        if (!data.success) {
          throw new Error(data.error || 'Backend sign-and-broadcast rejected');
        }
        txid = data.tx_id;
        tierFeeKas = tierData.fee > 0n ? Number(tierData.fee) / 1e8 : 0;
      }
      // ── Extension wallet fallback ──
      else if (window.kasware && window.kasware.sendTransaction) {
        try {
          const resp = await window.kasware.sendTransaction({
            to: address,
            amount: (100_000_000).toString(),
            data: code.trim(),
          });
          txid = typeof resp === 'string' ? resp : resp?.txid || resp?.transactionId;
        } catch (kasErr) {
          console.warn('KasWare sendTransaction failed:', kasErr.message);
        }
      }
      else {
        throw new Error(
          'No deployment-capable wallet. Use "Connect TN12 Dev Wallet" button (yellow) below to derive a test wallet from a mnemonic.'
        );
      }

      if (!txid) {
        throw new Error('No transaction ID returned. Deployment may have been rejected by the node.');
      }

      setResult({
        success: true,
        script: code.trim(),
        signature: (signature || 'ok').slice(0, 50) + '...',
        txid,
        deployer: address,
        tier: tierName,
        tierFeeKas,
        timestamp: new Date().toISOString(),
      });
      setStatus('success');
    } catch (err) {
      console.error('DEPLOY FAILED:', err);
      setResult({
        success: false,
        error: err.message || 'Deployment failed',
        timestamp: new Date().toISOString(),
      });
      setStatus('error');
    }
  }, [address, code, signMessage, isDevMode, devMode, selectedTier]);

  const isConnected = !!address;
  const canDeploy = isConnected && code.trim().length > 0 && status !== 'deploying';

  return (
    <div className="relative z-10 max-w-4xl mx-auto px-6 py-12 animate-in fade-in duration-300">
      <button
        onClick={() => window.history.back()}
        className="flex items-center gap-2 text-gray-400 hover:text-[#49EACB] transition-colors mb-8 text-sm font-medium"
      >
        <ArrowLeft size={16} />
        Back
      </button>

      <div className="bg-[#0a0a0a]/95 backdrop-blur-xl border border-[#1f1f1f] rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-8 border-b border-[#1f1f1f] flex items-center gap-5 bg-[#0a0a0a]">
          <div className="w-14 h-14 rounded-xl bg-[#49EACB]/10 flex items-center justify-center border border-[#49EACB]/30 shrink-0">
            <Terminal size={28} className="text-[#49EACB]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-wide">Deploy Covenant</h1>
            <p className="text-sm text-gray-400 mt-1">
              Write SilverScript, sign with your TN12 wallet, deploy to Kaspa BlockDAG
            </p>
          </div>
          <span className="ml-auto px-3 py-1 rounded-full bg-[#49EACB]/10 border border-[#49EACB]/20 text-[#49EACB] text-xs font-mono">
            TESTNET-12
          </span>
        </div>

        {!isConnected && (
          <div className="p-8 text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <ShieldCheck size={28} className="text-amber-400" />
            </div>
            <h3 className="text-lg font-semibold text-white">Connect Wallet to Deploy Covenants</h3>
            <p className="text-sm text-gray-400 max-w-md mx-auto">
              You need a connected Kaspa wallet to sign and broadcast SilverScript covenant deployments to the TN12 BlockDAG.
            </p>
            <p className="text-xs text-gray-500">
              Click "CONNECT WALLET" in the top navigation bar to get started.
            </p>
            <div className="mt-5 pt-5 border-t border-[#1f1f1f]">
              <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-3">Testing / Dev Only</p>
              <button
                onClick={() => setDevWalletOpen(true)}
                className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-yellow-600/40 bg-yellow-600/[0.06] hover:bg-yellow-600/[0.12] text-yellow-400 hover:text-yellow-300 font-semibold text-sm transition-all"
              >
                <Key size={16} />
                Connect TN12 Dev Wallet
              </button>
              <p className="text-[9px] text-gray-600 mt-2 text-center leading-relaxed">
                Derives keys locally via kaspa-wasm. For covenant testing — no browser extensions required.
              </p>
            </div>
          </div>
        )}

        {isConnected && (
          <div className="p-8 space-y-6">
            <div className={`p-4 rounded-xl border flex items-center justify-between ${
              isDevMode
                ? 'bg-yellow-600/[0.04] border-yellow-600/30'
                : 'bg-emerald-500/[0.04] border-emerald-500/20'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full animate-pulse ${
                  isDevMode ? 'bg-yellow-400' : 'bg-emerald-400'
                }`} />
                <div>
                  <p className={`text-xs font-mono ${isDevMode ? 'text-yellow-400' : 'text-emerald-400'}`}>
                    {isDevMode ? 'DEV MODE (LOCAL KEY)' : 'CONNECTED'}
                  </p>
                  <p className="text-sm font-mono text-white truncate max-w-[300px]">{address}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {balance !== null ? (
                  <span className="text-[11px] font-mono text-gray-400">
                    {(balance / 1e8).toFixed(4)} KAS
                  </span>
                ) : (
                  <button onClick={fetchBalance} className="text-[10px] text-gray-500 hover:text-[#49EACB] transition-colors">
                    <Wallet size={12} className="inline mr-1" />Refresh
                  </button>
                )}
                <span className={`text-[10px] font-mono ${isDevMode ? 'text-yellow-400/70' : 'text-emerald-400/70'}`}>TOCCATA TN12</span>
              </div>
            </div>

            <div className="rounded-xl border border-[#2a2a2a] bg-[#0d0d0d] overflow-hidden flex flex-col shadow-inner">
              <div className="flex items-center justify-between px-4 py-2.5 bg-[#141414] border-b border-[#2a2a2a]">
                <div className="flex items-center gap-2 text-gray-400 text-xs font-mono tracking-wider">
                  <Terminal size={14} className="text-[#49EACB]" />
                  <span>covenant.ss</span>
                </div>
                <button
                  onClick={() => setCode(SILVERSCRIPT_TEMPLATE)}
                  className="text-[10px] text-gray-500 hover:text-[#49EACB] transition-colors"
                >
                  RESET
                </button>
              </div>
              <textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                spellCheck="false"
                className="w-full h-[400px] bg-transparent text-[#e6e6e6] font-mono text-sm p-5 focus:outline-none resize-none custom-scrollbar leading-relaxed"
                style={{ tabSize: 4 }}
              />
            </div>

            <div className="space-y-3">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider">Platform Tier Fee</p>
              <div className="grid grid-cols-4 gap-2">
                {Object.entries(TIERS).map(([key, tier]) => {
                  const Icon = tier.icon;
                  const isSelected = selectedTier === key;
                  return (
                    <button
                      key={key}
                      onClick={() => setSelectedTier(key)}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all text-center ${
                        isSelected
                          ? key === 'MAX'
                            ? 'border-purple-500/60 bg-purple-500/[0.08] shadow-[0_0_12px_rgba(168,85,247,0.3)]'
                            : key === 'PRO'
                            ? 'border-amber-500/60 bg-amber-500/[0.08] shadow-[0_0_12px_rgba(245,158,11,0.3)]'
                            : key === 'CREATOR'
                            ? 'border-blue-500/60 bg-blue-500/[0.08] shadow-[0_0_12px_rgba(59,130,246,0.3)]'
                            : 'border-[#49EACB]/60 bg-[#49EACB]/[0.06] shadow-[0_0_10px_rgba(73,234,203,0.2)]'
                          : 'border-[#2a2a2a] bg-transparent hover:border-zinc-600'
                      }`}
                    >
                      <Icon size={16} className={
                        isSelected
                          ? key === 'MAX' ? 'text-purple-400'
                          : key === 'PRO' ? 'text-amber-400'
                          : key === 'CREATOR' ? 'text-blue-400'
                          : 'text-[#49EACB]'
                          : 'text-gray-500'
                      } />
                      <span className={`text-[11px] font-semibold leading-tight ${isSelected ? 'text-white' : 'text-gray-400'}`}>
                        {key === 'FREE' ? 'Free' : key === 'CREATOR' ? 'Creator' : key}
                      </span>
                      <span className={`text-[9px] leading-tight ${isSelected ? 'text-gray-300' : 'text-gray-600'}`}>
                        {tier.fee > 0n ? `${Number(tier.fee) / 1e8} KAS` : 'No fee'}
                      </span>
                    </button>
                  );
                })}
              </div>
              {selectedTier !== 'FREE' && (
                <p className="text-[10px] text-amber-400/70 flex items-center gap-1">
                  <AlertTriangle size={10} />
                  {TIERS[selectedTier].fee > 0n ? `${(Number(TIERS[selectedTier].fee) / 1e8).toFixed(0)} KAS will be deducted from your wallet and sent to the treasury address.` : ''}
                </p>
              )}
            </div>

            <button
              onClick={handleDeploy}
              disabled={!canDeploy}
              className="w-full px-6 py-4 bg-[#49EACB] hover:bg-[#3cd8b6] text-black font-bold rounded-xl transition-all duration-200 shadow-[0_0_15px_rgba(73,234,203,0.3)] hover:shadow-[0_0_25px_rgba(73,234,203,0.6)] active:scale-95 flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed border-none text-lg"
            >
              {status === 'deploying' ? (
                <span className="flex items-center gap-2">
                  <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  Building TX & Broadcasting...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Send size={20} />
                  Deploy Covenant
                </span>
              )}
            </button>

            {result && (
              <div className={`mt-4 p-5 rounded-xl border ${
                result.success
                  ? 'bg-emerald-500/[0.04] border-emerald-500/20'
                  : 'bg-red-500/[0.04] border-red-500/20'
              }`}>
                <div className="flex items-center gap-3 mb-3">
                  {result.success ? (
                    <CheckCircle2 size={20} className="text-emerald-400" />
                  ) : (
                    <AlertTriangle size={20} className="text-red-400" />
                  )}
                  <p className={`text-sm font-semibold ${result.success ? 'text-emerald-400' : 'text-red-400'}`}>
                    {result.success ? 'COVENANT DEPLOYED & BROADCAST' : 'DEPLOYMENT FAILED'}
                  </p>
                </div>

                {result.success ? (
                  <div className="space-y-2 text-xs font-mono">
                    <div className="flex justify-between py-1 border-b border-white/5">
                      <span className="text-gray-500">TXID</span>
                      <span className="text-[#49EACB]">{result.txid.length > 30 ? result.txid.slice(0, 30) + '...' : result.txid}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-white/5">
                      <span className="text-gray-500">Tier</span>
                      <span className={`${
                        result.tier === 'MAX' ? 'text-purple-400'
                        : result.tier === 'PRO' ? 'text-amber-400'
                        : result.tier === 'CREATOR' ? 'text-blue-400'
                        : 'text-gray-400'
                      }`}>{result.tier}{result.tierFeeKas > 0 ? ` (${result.tierFeeKas} KAS fee)` : ''}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-white/5">
                      <span className="text-gray-500">Deployer</span>
                      <span className="text-gray-300">{result.deployer.slice(0, 22)}...</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-white/5">
                      <span className="text-gray-500">Signature</span>
                      <span className="text-emerald-400">{result.signature}</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-gray-500">Timestamp</span>
                      <span className="text-gray-500">{result.timestamp}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-red-400/80 whitespace-pre-wrap">{result.error}</p>
                )}

                {result.success && result.txid && !result.txid.startsWith('pending') && (
                  <div className="mt-4 pt-3 border-t border-emerald-500/10 flex gap-4">
                    <a
                      href={`https://tn12.kaspa.stream/tx/${result.txid}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-xs text-[#49EACB] hover:underline"
                    >
                      <ExternalLink size={12} />
                      View on TN12 Explorer
                    </a>
                    <a
                      href={`https://hightable.pro/covenant/${result.txid}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-xs text-[#49EACB] hover:underline"
                    >
                      <ExternalLink size={12} />
                      View on Covex
                    </a>
                  </div>
                )}
              </div>
            )}

            {code.trim() && status === 'idle' && (
              <div className="p-4 rounded-xl bg-black/30 border border-white/5">
                <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Code size={12} /> Script Analysis
                </p>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div><span className="text-gray-600">Lines:</span> <span className="text-gray-300">{code.split('\n').length}</span></div>
                  <div><span className="text-gray-600">Chars:</span> <span className="text-gray-300">{code.length}</span></div>
                  <div><span className="text-gray-600">Tier:</span> <span className={selectedTier === 'FREE' ? 'text-gray-500' : 'text-amber-400'}>{TIERS[selectedTier].label.split(' ')[0]}</span></div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <DevWalletModal isOpen={devWalletOpen} onClose={() => setDevWalletOpen(false)} />
    </div>
  );
}
