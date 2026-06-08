import React, { useState } from 'react';
import { FileCode, Code, AlertTriangle, ArrowLeft, Terminal, CheckCircle, Key } from 'lucide-react';
import DevWalletModal from '../components/DevWalletModal';
import { useWallet } from '../components/WalletContext';

const getCurrentNetwork = () => {
  if (typeof window === 'undefined') return 'testnet-12';
  return localStorage.getItem('kaspaNetwork') || 'testnet-12';
};
const getNetworkLabel = (net) => {
  if (net === 'mainnet' || net === 'mainnet-1') return 'MAINNET';
  if (net === 'testnet-10') return 'TESTNET-10';
  return 'TOCCATA TN12';
};
const isMainnet = (net) => net === 'mainnet' || net === 'mainnet-1';

const CreateCovenant = () => {
  const currentNet = getCurrentNetwork();
  const isMain = isMainnet(currentNet);
  const netLabel = getNetworkLabel(currentNet);
  const { address, isDevMode } = useWallet();
  const [devWalletOpen, setDevWalletOpen] = useState(false);
  const [code, setCode] = useState(`// SilverScript covenant example:
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
}`);

  const [status, setStatus] = useState('idle'); // idle, compiling, success

  const handleCompile = () => {
    setStatus('compiling');
    // Hook this into your Rust wasm-compiler later. For now, it simulates the pipeline.
    setTimeout(() => {
      setStatus('success');
      setTimeout(() => setStatus('idle'), 3000);
    }, 1500);
  };

  return (
    <div className="relative z-10 max-w-4xl mx-auto px-6 py-12 animate-in fade-in duration-300">
      
      {/* Universal Back Button */}
      <button 
        onClick={() => window.history.back()} 
        className="flex items-center gap-2 text-gray-200 hover:text-[#49EACB] transition-colors mb-8 text-sm font-medium"
      >
        <ArrowLeft size={16} />
        Explorer
      </button>

      {/* Main Container - Heavily frosted to block the DAG background */}
      <div className="bg-[#0a0a0a]/95 backdrop-blur-xl border border-[#1f1f1f] rounded-2xl shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="p-8 border-b border-[#1f1f1f] flex items-center gap-5 bg-[#0a0a0a]">
          <div className="w-14 h-14 rounded-xl bg-[#49EACB]/10 flex items-center justify-center border border-[#49EACB]/30 shrink-0">
            <FileCode size={28} className="text-[#49EACB]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-wide">Create Covenant</h1>
            <p className="text-sm text-gray-200 mt-1">Write SilverScript, compile to Kaspa bytecode, and deploy to the BlockDAG</p>
          </div>
        </div>

        {/* Editor Area */}
        <div className="p-8 space-y-6">

          {/* Wallet Status */}
          {address ? (
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
              <span className={`text-[10px] font-mono ${isDevMode ? 'text-yellow-400/70' : 'text-emerald-400/70'}`}>{netLabel}</span>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="p-4 rounded-xl bg-amber-500/[0.06] border border-amber-500/20">
                <p className="text-xs text-amber-400 font-mono mb-1">WALLET NOT CONNECTED</p>
                <p className="text-sm text-gray-200">
                  Connect a wallet to sign and deploy your SilverScript covenant to {netLabel}.
                </p>
              </div>

              {/* Dev Wallet - hidden on mainnet */}
              {isMain ? (
                <div className="pt-2">
                  <p className="text-[10px] text-red-400/80">Dev wallets disabled on MAINNET. Use a real Kaspa wallet extension to deploy covenants with real KAS.</p>
                </div>
              ) : (
                <div className="pt-2">
                  <p className="text-[10px] text-gray-200 uppercase tracking-wider mb-2">Testing / Dev Only</p>
                  <button
                    onClick={() => setDevWalletOpen(true)}
                    className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-yellow-600/40 bg-yellow-600/[0.06] hover:bg-yellow-600/[0.12] text-yellow-400 hover:text-yellow-300 font-semibold text-sm transition-all"
                  >
                    <Key size={16} />
                    Connect {currentNet === 'testnet-10' ? 'TN10' : 'TN12'} Dev Wallet
                  </button>
                  <p className="text-[9px] text-gray-200 mt-2 text-center leading-relaxed">
                    Derives keys locally via kaspa-wasm. For covenant testing, no browser extensions required.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Quick chess covenant starter using the exact 3 test wallets for fee/creator/demo (see seeds in CovenantInteractive.jsx comments) */}
          <div className="mb-4 p-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.03]">
            <div className="text-xs uppercase tracking-widest text-emerald-400 mb-2">EASY PERFECT CHESS COVENANT</div>
            <button 
              onClick={() => {
                const chessCode = `// SilverScript for 10min winner-takes-all Chess Arena (chess_v1 ZK + oracle)
// Stake any amount (e.g. 50). Second player matches exactly within 5 min or auto return to staker.
// 10 min per player (active clock only). Resign / timeout / checkmate ends.
// Winner gets pot - 2% (fee to creator addr below to sustain arena for future games).
// Fully transparent. All info public. chess_v1 detects lies.
// Creator / fee receiver example: kaspatest:qpyfz03k6quxwf2jglwkhczvt758d8xrq99gl37p6h3vsqur27ltjhn68354m
// Test staker 1: kaspatest:qrh603rmy6v0jsq58jrh2yr4ewdk02gctjhxg9feg7uwdl98t04dqmzlrt353
// Test staker 2: kaspatest:qpw2yxrmfudv56lvav32s8jz6uwqhp2x0x7fna0640qx3gwp70d55uue9uecs

pragma silverscript 2026.0;

contract ChessArena10min {
    state {
        player_a: Address,
        player_b: Address,
        stake: u64,
        timeout: DaaScore,
        fee_bps: u16 = 200,  // 2%
        fee_addr: Address = kaspatest:qpyfz03k6quxwf2jglwkhczvt758d8xrq99gl37p6h3vsqur27ltjhn68354m,
        winner: Address
    }
    // ... (full onchain + offchain oracle + chess_v1 ZK for moves/clocks/result)
}`;
                setCode(chessCode);
              }}
              className="w-full py-3 rounded-2xl bg-emerald-500 text-black font-bold text-sm active:scale-[0.985]"
            >
              LOAD CHESS ARENA (10MIN WINNER-TAKES-ALL) TEMPLATE — auto 2% creator fee, transparent rules, 3 test addrs
            </button>
            <div className="text-[10px] text-emerald-300/70 mt-2">After load, compile + deploy via wallet. Then view on hightable.pro/covenant/TX — gets the full pro chess.com arena + Fix tab for creator (login with creator wallet).</div>
          </div>
          
          <div className="rounded-xl border border-[#2a2a2a] bg-[#0d0d0d] overflow-hidden flex flex-col shadow-inner">
            <div className="flex items-center justify-between px-4 py-2.5 bg-[#141414] border-b border-[#2a2a2a]">
              <div className="flex items-center gap-2 text-gray-200 text-xs font-mono tracking-wider">
                <Terminal size={14} className="text-[#49EACB]" />
                <span>contract.ss</span>
              </div>
            </div>
            
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              spellCheck="false"
              className="w-full h-[400px] bg-transparent text-[#e6e6e6] font-mono text-sm p-5 focus:outline-none resize-none custom-scrollbar leading-relaxed"
              style={{ tabSize: 4 }}
            />
          </div>

          {/* Action Bar */}
          <div className="flex justify-end">
            <button
              onClick={handleCompile}
              disabled={status === 'compiling' || status === 'success'}
              className={`flex items-center gap-2 px-8 py-3 rounded-xl font-semibold transition-all ${
                status === 'success' 
                  ? 'bg-green-500/10 text-green-400 border border-green-500/30'
                  : 'bg-[#49EACB] hover:bg-[#3bc2a6] text-black shadow-[0_0_20px_rgba(73,234,203,0.2)] hover:shadow-[0_0_25px_rgba(73,234,203,0.4)]'
              } disabled:opacity-70 disabled:cursor-not-allowed`}
            >
              {status === 'compiling' ? (
                <span className="flex items-center gap-2">
                  <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  Compiling...
                </span>
              ) : status === 'success' ? (
                <span className="flex items-center gap-2">
                  <CheckCircle size={20} />
                  Compiled Successfully
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Code size={20} />
                  Compile Covenant
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Footer / Deployment Notice */}
        <div className="p-6 bg-[#0a0a0a] border-t border-[#1f1f1f]">
          <div className="flex gap-4 items-start p-4 rounded-xl border border-yellow-900/30 bg-yellow-900/5">
            <AlertTriangle size={20} className="text-yellow-600 shrink-0 mt-0.5" />
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-gray-300 tracking-wide uppercase">Deployment Notice</h4>
              <p className="text-xs text-gray-300 leading-relaxed">
                Covenants deployed to the Kaspa BlockDAG are <strong className="text-gray-300">permanently immutable</strong>. They cannot be changed, deleted, or reversed. You bear full legal and financial responsibility.
              </p>
              <p className="text-xs text-gray-300 leading-relaxed">
                Covex is a <strong className="text-gray-300">non-custodial platform</strong>. We never access your private keys. All signing happens in your own wallet application.
              </p>
            </div>
          </div>
        </div>

      </div>

      {/* Dev Wallet Modal */}
      <DevWalletModal isOpen={devWalletOpen} onClose={() => setDevWalletOpen(false)} />
    </div>
  );
};

export default CreateCovenant;
