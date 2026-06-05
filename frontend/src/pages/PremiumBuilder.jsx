import { useState, useCallback, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useWallet } from '../components/WalletContext';
import {
  ArrowLeft, Sparkles, Cpu, Zap, Code, Layers, Shield, Key, Fingerprint,
  Hash, Circle, Terminal, ChevronRight, Plus, Check, Copy, Loader2,
  Percent, Repeat, Coins, ExternalLink, Play
} from 'lucide-react';
import { ZK_CIRCUIT_TYPES } from '../components/CovexTerminal';

const CIRCUIT_ICONS = {
  chess_v1: Shield,
  merkle_membership: Layers,
  range_proof: Hash,
  age_verification: Fingerprint,
  verifiable: Cpu,
  custom: Code,
};

const CIRCUIT_LABELS = {
  chess_v1: 'Chess (FIDE)',
  merkle_membership: 'Merkle Membership',
  range_proof: 'Range Proof',
  age_verification: 'Age Verification',
  verifiable: 'Verifiable Compute',
  custom: 'Custom Circuit',
};

export default function PremiumBuilder() {
  const navigate = useNavigate();
  const { address, isDevMode } = useWallet();
  const paidTier = localStorage.getItem('covex_paid_tier') || 'BUILDER';

  const [selectedCircuit, setSelectedCircuit] = useState('chess_v1');
  const [feePercent, setFeePercent] = useState(2);
  const [reusable, setReusable] = useState(true);
  const [allowTopups, setAllowTopups] = useState(true);
  const [generatedCode, setGeneratedCode] = useState('');
  const [copied, setCopied] = useState(false);

  const net = (typeof window !== 'undefined' && localStorage.getItem('kaspaNetwork')) || 'testnet-12';
  const isMainnet = net === 'mainnet' || net === 'mainnet-1';

  useEffect(() => {
    const tier = localStorage.getItem('covex_paid_tier');
    if (!tier || tier === 'FREE') navigate('/pricing', { replace: true });
  }, [navigate]);

  const activeCircuit = ZK_CIRCUIT_TYPES.find(c => c.id === selectedCircuit);
  const CircuitIcon = activeCircuit ? (CIRCUIT_ICONS[activeCircuit.id] || Cpu) : Cpu;
  const accent = activeCircuit?.accent || '#49EACB';

  const handleGenerate = useCallback(() => {
    const code = `// Covex Covenant: ${activeCircuit?.name || 'Custom'}
// Generated ${new Date().toISOString().split('T')[0]}
// Network: ${net}
// Circuit: ${activeCircuit?.circuit || 'custom'}
// Verification: ${isMainnet ? 'REAL MAINNET KASPA' : 'Testnet'}

contract ${activeCircuit?.id?.replace(/_/g, ' ') || 'Covenant'} {
    state {
        owner: Address,
        challenger: Address,
        stake: u64,
        resolved: bool,
    }

    entrypoint function join() {
        require(opTx.outputs[0].amount == state.stake);
        state.challenger = opTx.inputs[0].address;
    }

    entrypoint function resolve(winner: Address, proof: bytes) {
        require(!state.resolved);
        // Oracle verification via ${activeCircuit?.circuit || 'custom'}
        state.resolved = true;
        let total = opTx.inputs[0].amount + opTx.inputs[1].amount;
        require(opTx.outputs[0].address == winner);
        require(opTx.outputs[0].amount >= total * ${((100 - feePercent) / 100).toFixed(2)});
    }
}`;
    setGeneratedCode(code);
  }, [activeCircuit, net, feePercent, isMainnet]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(generatedCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [generatedCode]);

  const tierBadge = { BUILDER: 'BUILDER', PRO: 'PRO', MAX: 'MAX' }[paidTier] || 'PAID';
  const tierAccent = { BUILDER: '#3B82F6', PRO: '#E8AF34', MAX: '#A855F7' }[paidTier] || '#49EACB';

  const networkLabel = isMainnet ? 'MAINNET' : net === 'testnet-10' ? 'TESTNET-10' : 'TOCCATA TN12';
  const networkColor = isMainnet ? '#EF4444' : net === 'testnet-10' ? '#F59E0B' : '#49EACB';

  return (
    <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 py-10">
      {/* Back */}
      <button onClick={() => navigate('/paid-builder')} className="flex items-center gap-2 text-gray-300 hover:text-white transition-colors mb-6 text-sm font-medium">
        <ArrowLeft size={16} /> Your Covenants
      </button>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <img src="/covex-logo-48.png" alt="Covex" width="32" height="32"
            className="shrink-0 drop-shadow-[0_0_8px_rgba(0,255,157,0.45)] rounded" />
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">Covenant Builder</h1>
            <p className="text-xs text-gray-300 font-mono mt-0.5">{tierBadge} terminal — full circuit & configuration access</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold border"
            style={{ color: tierAccent, borderColor: tierAccent + '40', background: tierAccent + '10' }}>
            {tierBadge}
          </span>
          <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold border"
            style={{ color: networkColor, borderColor: networkColor + '40', background: networkColor + '10' }}>
            {networkLabel}
          </span>
        </div>
      </div>

      {/* Circuit Selection Grid */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Cpu size={14} className="text-gray-300" />
          <p className="text-xs text-gray-300 uppercase tracking-wider font-mono">Select Circuit Type</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {ZK_CIRCUIT_TYPES.map((circuit) => {
            const Icon = CIRCUIT_ICONS[circuit.id] || Cpu;
            const isSelected = selectedCircuit === circuit.id;
            const c = circuit.accent || '#49EACB';
            return (
              <button key={circuit.id}
                onClick={() => setSelectedCircuit(circuit.id)}
                className={`group text-left p-4 rounded-xl border transition-all duration-200 ${
                  isSelected
                    ? 'bg-white/[0.03]'
                    : 'bg-transparent border-white/[0.06] hover:border-white/[0.15]'
                }`}
                style={isSelected ? { borderColor: c + '50', boxShadow: `0 0 20px ${c}08` } : {}}
              >
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: c + (isSelected ? '20' : '08'), border: `1px solid ${c}${isSelected ? '30' : '15'}` }}>
                    <Icon size={18} style={{ color: c }} />
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-sm text-white mb-1">{circuit.name}</div>
                    <div className="text-[11px] text-gray-300 leading-relaxed line-clamp-2">{circuit.description}</div>
                  </div>
                </div>
                {isSelected && (
                  <div className="mt-3 flex items-center gap-1.5 text-[10px] font-mono" style={{ color: c }}>
                    <Check size={12} /> Selected
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* Selected Circuit Configuration */}
      {activeCircuit && (
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Zap size={14} className="text-gray-300" />
            <p className="text-xs text-gray-300 uppercase tracking-wider font-mono">Configure {activeCircuit.name}</p>
          </div>

          <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl p-5 sm:p-6 space-y-5">
            {/* Circuit detail header */}
            <div className="flex items-start gap-4 pb-4 border-b border-white/5">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: accent + '15', border: `1px solid ${accent}30` }}>
                <CircuitIcon size={24} style={{ color: accent }} />
              </div>
              <div>
                <h3 className="font-bold text-white text-lg">{activeCircuit.name}</h3>
                <p className="text-sm text-gray-300 mt-0.5">{activeCircuit.description}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border"
                    style={{ color: accent, borderColor: accent + '30', background: accent + '08' }}>
                    {activeCircuit.circuit}
                  </span>
                  <span className="text-[10px] font-mono text-gray-300">{activeCircuit.category}</span>
                </div>
              </div>
            </div>

            {/* Config fields */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="text-[10px] text-gray-300 uppercase tracking-wider font-mono block mb-2">Creator Fee %</label>
                <div className="relative">
                  <Percent size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
                  <input type="number" value={feePercent} onChange={e => setFeePercent(Math.max(0, Math.min(100, Number(e.target.value))))}
                    className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-black/50 border border-white/10 text-white text-sm focus:outline-none focus:border-kaspa-green/50"
                    min="0" max="100" />
                </div>
                <p className="text-[9px] text-gray-300 mt-1">Taken from winner payout on resolution</p>
              </div>

              <div>
                <label className="text-[10px] text-gray-300 uppercase tracking-wider font-mono block mb-2">Reusable</label>
                <button onClick={() => setReusable(!reusable)}
                  className={`w-full px-4 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                    reusable
                      ? 'border-emerald-500/30 bg-emerald-500/[0.06] text-emerald-400'
                      : 'border-white/10 bg-black/50 text-gray-300'
                  }`}>
                  <div className="flex items-center justify-center gap-2">
                    <Repeat size={14} />
                    {reusable ? 'Multi-Use Covenant' : 'Single-Use Covenant'}
                  </div>
                </button>
              </div>

              <div>
                <label className="text-[10px] text-gray-300 uppercase tracking-wider font-mono block mb-2">Allow Top-ups</label>
                <button onClick={() => setAllowTopups(!allowTopups)}
                  className={`w-full px-4 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                    allowTopups
                      ? 'border-emerald-500/30 bg-emerald-500/[0.06] text-emerald-400'
                      : 'border-white/10 bg-black/50 text-gray-300'
                  }`}>
                  <div className="flex items-center justify-center gap-2">
                    <Coins size={14} />
                    {allowTopups ? 'Top-ups Allowed' : 'Fixed Stake Only'}
                  </div>
                </button>
              </div>
            </div>

            {/* Generate button */}
            <div className="pt-2">
              <button onClick={handleGenerate}
                className="w-full sm:w-auto px-6 py-3 rounded-xl font-semibold text-black transition-all duration-200 flex items-center justify-center gap-2"
                style={{ background: accent, boxShadow: `0 0 20px ${accent}30` }}>
                <Play size={18} /> Generate SilverScript Covenant
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Generated Code */}
      {generatedCode && (
        <section className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Code size={14} className="text-gray-300" />
              <p className="text-xs text-gray-300 uppercase tracking-wider font-mono">Generated SilverScript</p>
            </div>
            <button onClick={handleCopy}
              className="flex items-center gap-1.5 text-[10px] font-mono text-gray-300 hover:text-white transition-colors px-3 py-1 rounded-lg border border-white/10 hover:border-white/20">
              {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
            </button>
          </div>
          <div className="bg-[#0a0a0a] border border-white/10 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 bg-black/30 border-b border-white/5">
              <span className="text-[10px] font-mono text-gray-300">covenant.ss</span>
              <span className="text-[10px] font-mono text-gray-300">{generatedCode.split('\n').length} lines</span>
            </div>
            <pre className="p-5 text-[13px] font-mono text-[#e6e6e6] leading-relaxed overflow-x-auto max-h-[400px] overflow-y-auto custom-scrollbar">
              {generatedCode}
            </pre>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 mt-4">
            <button onClick={() => {
              sessionStorage.setItem('deploy_covenant_code', generatedCode);
              navigate('/deploy');
            }} className="flex-1 px-5 py-3 bg-[#49EACB] hover:bg-[#3cd8b6] text-black font-bold rounded-xl transition-all flex items-center justify-center gap-2">
              <Terminal size={18} /> Deploy This Covenant
            </button>
            <Link to="/paid-builder" className="px-5 py-3 border border-white/10 text-gray-300 hover:text-white rounded-xl text-center font-medium transition-colors flex items-center justify-center gap-2">
              <ArrowLeft size={16} /> Back to Your Covenants
            </Link>
          </div>
        </section>
      )}

      {/* Quick features reminder */}
      <div className="mt-10 p-4 rounded-xl bg-black/20 border border-white/5">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={14} className="text-kaspa-green" />
          <p className="text-[10px] text-gray-300 uppercase tracking-wider font-mono">What You Can Build</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-gray-300">
          <div className="flex items-center gap-1.5"><div className="w-1 h-1 rounded-full bg-[#49EACB]" /> Chess (FIDE) arenas</div>
          <div className="flex items-center gap-1.5"><div className="w-1 h-1 rounded-full bg-[#3B82F6]" /> Token-gated access</div>
          <div className="flex items-center gap-1.5"><div className="w-1 h-1 rounded-full bg-[#22C55E]" /> Private age checks</div>
          <div className="flex items-center gap-1.5"><div className="w-1 h-1 rounded-full bg-[#A855F7]" /> Verifiable compute</div>
        </div>
      </div>
    </div>
  );
}
