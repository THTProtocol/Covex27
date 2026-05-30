import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '../components/WalletContext';
import { Terminal, ArrowLeft } from 'lucide-react';
import { ZK_CIRCUIT_TYPES, generateSilverScriptForConfig } from '../components/CovexTerminal';

export default function PremiumBuilder() {
  const navigate = useNavigate();
  const { address } = useWallet();
  const paidTier = localStorage.getItem('covex_paid_tier') || 'BUILDER';

  const [gameType, setGameType] = useState('chess_v1');
  const [resolutionMode, setResolutionMode] = useState('zk');
  const [customOracleKey, setCustomOracleKey] = useState('');
  const [zkCircuit, setZkCircuit] = useState('chess_v1');
  const [zkVerifierKey, setZkVerifierKey] = useState('0xCHESSv1_8x8_STANDARD_AUDITED');
  const [customUICode, setCustomUICode] = useState('');
  const [feePercent, setFeePercent] = useState(2);
  const [reusable, setReusable] = useState(true);
  const [allowTopups, setAllowTopups] = useState(true);
  const [code, setCode] = useState('');
  const [status, setStatus] = useState('idle');

  useEffect(() => {
    const tier = localStorage.getItem('covex_paid_tier');
    if (!tier || tier === 'FREE') navigate('/pricing', { replace: true });
  }, [navigate]);

  const handleGameTypeChange = useCallback((typeId) => {
    setGameType(typeId);
    const gt = ZK_CIRCUIT_TYPES.find(g => g.id === typeId);
    if (gt) {
      setResolutionMode('zk');
      setZkCircuit(gt.circuit);
      // set verifier key logic...
    }
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 text-white">
      <button onClick={() => navigate('/paid-builder')} className="flex items-center gap-2 mb-6 text-sm">
        <ArrowLeft size={16} /> Back
      </button>

      <h1 className="text-3xl font-bold mb-6">Premium Builder (Phase 1 Fixed)</h1>

      <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl p-6 mb-6">
        <p className="text-xs uppercase tracking-widest mb-2">Circuit Schema</p>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {ZK_CIRCUIT_TYPES.map(gt => (
            <button key={gt.id} onClick={() => handleGameTypeChange(gt.id)}
              className={`p-4 rounded-xl border text-left ${gameType === gt.id ? 'border-[#49EACB] bg-[#49EACB]/5' : 'border-white/10'}`}>
              <div className="font-semibold">{gt.name}</div>
              <div className="text-xs text-gray-400 mt-1 line-clamp-3">{gt.description}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="text-sm text-gray-400">
        (Full terminal UI restored in next push. Build should now succeed.)
      </div>
    </div>
  );
}