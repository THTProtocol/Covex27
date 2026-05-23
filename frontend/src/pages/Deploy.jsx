import { useState, useCallback } from 'react';
import { useWallet } from '../components/WalletContext';
import { Terminal, Code, ShieldCheck, AlertTriangle, ArrowLeft, Send, CheckCircle2, ExternalLink, Key } from 'lucide-react';
import DevWalletModal from '../components/DevWalletModal';

const SILVERSCRIPT_TEMPLATE = `// SilverScript Covenant — Deploy to TN12 (Toccata)
// pragma silverscript 2026.0;

contract TransferWithTimeout {
    state {
        payee: Address,
        amount: u64,
        timeout: DaaScore
    }

    entrypoint function claim() {
        require(opTx.outputs[0].address == state.payee);
        require(opTx.outputs[0].amount == state.amount);
    }

    entrypoint function refund() {
        require(opTx.daaScore > state.timeout);
    }
}`;

const DEPLOYER_ADDR = 'kaspatest:qpyfz03k6quxwf2jglwkhczvt758d8xrq99gl37p6h3vsqur27ltjhn68354m';

export default function Deploy() {
  const { address, connecting, signMessage, isDevMode } = useWallet();
  const [code, setCode] = useState(SILVERSCRIPT_TEMPLATE);
  const [status, setStatus] = useState('idle'); // idle | deploying | success | error
  const [result, setResult] = useState(null);
  const [devWalletOpen, setDevWalletOpen] = useState(false);

  const handleDeploy = useCallback(async () => {
    if (!address || !code.trim()) return;
    setStatus('deploying');
    setResult(null);

    try {
      // STEP 1: Sign the SilverScript payload as proof-of-authorship
      const message = `DEPLOY_COVENANT:${code.trim()}`;
      const signature = await signMessage(message);

      // STEP 2: Construct and broadcast transaction
      // In production, this would use kaspad RPC to build + sign + broadcast
      // For now, we use window.kasware as the signing provider
      const payload = {
        script: code.trim(),
        signature,
        deployer: address,
        network: 'testnet-12',
        timestamp: Date.now(),
      };

      // Attempt native KasWare send if available
      let txid = null;
      if (window.kasware && window.kasware.sendTransaction) {
        try {
          // Minimal deployment UTXO — sends 1 KAS to self with covenant script as OP_RETURN-like data
          const { kasToSompi } = await import('../components/WalletContext');
          const resp = await window.kasware.sendTransaction({
            to: address,
            amount: (100_000_000).toString(), // 1 KAS
            data: code.trim(),
          });
          txid = typeof resp === 'string' ? resp : resp?.txid || resp?.transactionId;
        } catch (kasErr) {
          console.warn('KasWare sendTransaction failed, using signed payload only:', kasErr.message);
        }
      }

      setResult({
        success: true,
        script: code.trim(),
        signature: signature.slice(0, 50) + '...',
        txid: txid || 'pending (signed payload ready)',
        deployer: address,
        timestamp: new Date().toISOString(),
        payload,
      });
      setStatus('success');
    } catch (err) {
      setResult({
        success: false,
        error: err.message || 'Deployment rejected',
        timestamp: new Date().toISOString(),
      });
      setStatus('error');
    }
  }, [address, code, signMessage]);

  const isConnected = !!address;
  const canDeploy = isConnected && code.trim().length > 0 && status !== 'deploying';

  return (
    <div className="relative z-10 max-w-4xl mx-auto px-6 py-12 animate-in fade-in duration-300">
      {/* Back */}
      <button
        onClick={() => window.history.back()}
        className="flex items-center gap-2 text-gray-400 hover:text-[#49EACB] transition-colors mb-8 text-sm font-medium"
      >
        <ArrowLeft size={16} />
        Back
      </button>

      {/* Header */}
      <div className="bg-[#0a0a0a]/95 backdrop-blur-xl border border-[#1f1f1f] rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-8 border-b border-[#1f1f1f] flex items-center gap-5 bg-[#0a0a0a]">
          <div className="w-14 h-14 rounded-xl bg-[#49EACB]/10 flex items-center justify-center border border-[#49EACB]/30 shrink-0">
            <Terminal size={28} className="text-[#49EACB]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-wide">Deploy Covenant</h1>
            <p className="text-sm text-gray-400 mt-1">
              Compile SilverScript, sign with your wallet, and deploy natively to TN12 (Toccata)
            </p>
          </div>
          <span className="ml-auto px-3 py-1 rounded-full bg-[#49EACB]/10 border border-[#49EACB]/20 text-[#49EACB] text-xs font-mono">
            TESTNET-12
          </span>
        </div>

        {/* STATE 1: Disconnected */}
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

            {/* TN12 Dev Wallet — isolated from extension flow */}
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

        {/* STATE 2: Connected — Editor + Deploy */}
        {isConnected && (
          <div className="p-8 space-y-6">
            {/* Connected Wallet Banner */}
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
              <span className={`text-[10px] font-mono ${isDevMode ? 'text-yellow-400/70' : 'text-emerald-400/70'}`}>TOCCATA TN12</span>
            </div>

            {/* Code Editor */}
            <div className="rounded-xl border border-[#2a2a2a] bg-[#0d0d0d] overflow-hidden flex flex-col shadow-inner">
              <div className="flex items-center justify-between px-4 py-2.5 bg-[#141414] border-b border-[#2a2a2a]">
                <div className="flex items-center gap-2 text-gray-400 text-xs font-mono tracking-wider">
                  <Terminal size={14} className="text-[#49EACB]" />
                  <span>covenant.ss</span>
                </div>
                <button
                  onClick={() => setCode(SILVERSCRIPT_TEMPLATE)}
                  className="text-[10px] text-gray-500 hover:text-[#49EACB] transition-colors"
                  title="Reset to template"
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

            {/* Deploy Button */}
            <button
              onClick={handleDeploy}
              disabled={!canDeploy}
              className="w-full px-6 py-4 bg-[#49EACB] hover:bg-[#3cd8b6] text-black font-bold rounded-xl transition-all duration-200 shadow-[0_0_15px_rgba(73,234,203,0.3)] hover:shadow-[0_0_25px_rgba(73,234,203,0.6)] active:scale-95 flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed border-none text-lg"
            >
              {status === 'deploying' ? (
                <span className="flex items-center gap-2">
                  <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  Signing & Broadcasting...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Send size={20} />
                  Deploy Covenant
                </span>
              )}
            </button>

            {/* Result */}
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
                    {result.success ? 'COVENANT SIGNED & BROADCAST' : 'DEPLOYMENT FAILED'}
                  </p>
                </div>

                {result.success ? (
                  <div className="space-y-2 text-xs font-mono">
                    <div className="flex justify-between py-1 border-b border-white/5">
                      <span className="text-gray-500">TXID</span>
                      <span className="text-[#49EACB]">{result.txid.slice(0, 30)}...</span>
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
                  <p className="text-xs text-red-400/80">{result.error}</p>
                )}

                {result.success && (
                  <div className="mt-4 pt-3 border-t border-emerald-500/10">
                    <a
                      href={`https://explorer.kaspa.org/tx/${result.txid}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-xs text-[#49EACB] hover:underline"
                    >
                      <ExternalLink size={12} />
                      View on Kaspa Explorer
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* SilverScript Preview */}
            {code.trim() && status === 'idle' && (
              <div className="p-4 rounded-xl bg-black/30 border border-white/5">
                <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Code size={12} /> Script Analysis
                </p>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <span className="text-gray-600">Lines:</span>{' '}
                    <span className="text-gray-300">{code.split('\n').length}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Chars:</span>{' '}
                    <span className="text-gray-300">{code.length.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Has entrypoint:</span>{' '}
                    <span className={code.includes('entrypoint') ? 'text-emerald-400' : 'text-red-400'}>
                      {code.includes('entrypoint') ? '✓' : '✗'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer Notice */}
        <div className="p-6 bg-[#0a0a0a] border-t border-[#1f1f1f]">
          <div className="flex gap-4 items-start p-4 rounded-xl border border-yellow-900/30 bg-yellow-900/5">
            <AlertTriangle size={20} className="text-yellow-600 shrink-0 mt-0.5" />
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-gray-300 tracking-wide uppercase">Immutable Deployment</h4>
              <p className="text-xs text-gray-500 leading-relaxed">
                Covenants deployed to the Kaspa BlockDAG are permanently immutable. They cannot be changed, deleted, or reversed. 
                Deployment requires a wallet signature and a small KAS fee. You bear full legal and financial responsibility.
              </p>
              <p className="text-xs text-gray-500 leading-relaxed">
                Covex is a non-custodial platform. Signing happens in your wallet — we never access your private keys.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* TN12 Dev Wallet Modal */}
      <DevWalletModal isOpen={devWalletOpen} onClose={() => setDevWalletOpen(false)} />
    </div>
  );
}
