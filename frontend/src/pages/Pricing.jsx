import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, X as XIcon, ArrowLeft, Wallet, QrCode, Box, Sparkles, CheckCircle } from 'lucide-react';

// Mock data for the user's deployed covenants
const myCovenants = [
  { id: 'cov_1', name: 'AtomicSwap', address: 'kaspa:q...7fa', date: '2026-05-20' },
  { id: 'cov_2', name: 'TransferWithTimeout', address: 'kaspa:q...8b2', date: '2026-05-21' }
];

const Pricing = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState('pricing'); // pricing, select, pay, success
  const [selectedTier, setSelectedTier] = useState(null);
  const [selectedCovenant, setSelectedCovenant] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSelectTier = (tier) => {
    setSelectedTier(tier);
    setStep('select');
  };

  const handleCheckout = () => {
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      setStep('success');
    }, 2000);
  };

  const reset = () => {
    setStep('pricing');
    setSelectedTier(null);
    setSelectedCovenant(null);
  };

  // --- VIEW: 1. PRICING GRID ---
  if (step === 'pricing') {
    return (
      <div className="relative z-10 max-w-7xl mx-auto px-6 py-16 animate-in fade-in duration-300">
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
          <h1 className="text-4xl md:text-5xl font-bold text-white tracking-wide">Pricing</h1>
          <p className="text-lg text-gray-400">
            One-time KAS payment. Your covenant gets a permanent interactive UI and visibility boost. <br/>
            No subscriptions. No recurring charges.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* FREE */}
          <div className="bg-[#0a0a0a]/95 backdrop-blur-xl border border-[#1f1f1f] rounded-2xl p-8 flex flex-col hover:border-[#49EACB]/30 transition-all">
            <h3 className="text-xl font-semibold text-white text-center">Explorer</h3>
            <p className="text-xs text-gray-500 text-center mb-6">Free Read-Only Access</p>
            <div className="text-center mb-8">
              <span className="text-4xl font-bold text-white">Free</span>
              <p className="text-xs text-gray-500 mt-2">free forever</p>
            </div>
            <div className="space-y-4 flex-1">
              {['Browse all indexed covenants', 'Public read-only contract view', 'Script display and parameters', 'On-chain status verification', 'Search and filter capabilities'].map((feature, i) => (
                <div key={i} className="flex gap-3 text-sm text-gray-300"><Check size={18} className="text-[#49EACB] shrink-0" /> {feature}</div>
              ))}
              {['No interactive UI generation', 'No featured placement', 'No custom forms'].map((feature, i) => (
                <div key={i} className="flex gap-3 text-sm text-gray-600"><XIcon size={18} className="shrink-0" /> {feature}</div>
              ))}
            </div>
            <button onClick={() => navigate('/')} className="w-full px-6 py-3 bg-[#49EACB] hover:bg-[#3cd8b6] text-black font-bold rounded-xl transition-all duration-200 shadow-[0_0_15px_rgba(73,234,203,0.3)] hover:shadow-[0_0_25px_rgba(73,234,203,0.6)] active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed border-none">
              Explore Covenants
            </button>
          </div>

          {/* CREATOR */}
          <div className="bg-[#0a0a0a]/95 backdrop-blur-xl border border-[#1f1f1f] rounded-2xl p-8 flex flex-col hover:border-[#49EACB]/30 transition-all">
            <h3 className="text-xl font-semibold text-white text-center">Creator</h3>
            <p className="text-xs text-gray-500 text-center mb-6">Custom Interactive UI</p>
            <div className="text-center mb-8">
              <span className="text-4xl font-bold text-[#49EACB]">100</span> <span className="text-sm text-[#49EACB]">KAS</span>
              <p className="text-xs text-gray-500 mt-2">one-time</p>
            </div>
            <div className="space-y-4 flex-1">
              {['Everything in Explorer', 'Automatic interactive UI generation', 'Form builder with parameter inputs', 'Wallet-integrated interact buttons', 'Shareable/embeddable view', 'Standard registry listing'].map((feature, i) => (
                <div key={i} className="flex gap-3 text-sm text-gray-300"><Check size={18} className="text-[#49EACB] shrink-0" /> {feature}</div>
              ))}
            </div>
            <button onClick={() => handleSelectTier({ name: 'Creator', price: 100 })} className="w-full px-6 py-3 bg-[#49EACB] hover:bg-[#3cd8b6] text-black font-bold rounded-xl transition-all duration-200 shadow-[0_0_15px_rgba(73,234,203,0.3)] hover:shadow-[0_0_25px_rgba(73,234,203,0.6)] active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed border-none">
              Pay 100 KAS
            </button>
          </div>

          {/* PRO */}
          <div className="bg-[#0a0a0a]/95 backdrop-blur-xl border border-[#1f1f1f] rounded-2xl p-8 flex flex-col hover:border-[#49EACB]/50 shadow-[0_0_30px_rgba(73,234,203,0.05)] transition-all">
            <h3 className="text-xl font-semibold text-white text-center">PRO</h3>
            <p className="text-xs text-gray-500 text-center mb-6">Better Visibility + Advanced Tools</p>
            <div className="text-center mb-8">
              <span className="text-4xl font-bold text-[#49EACB]">500</span> <span className="text-sm text-[#49EACB]">KAS</span>
              <p className="text-xs text-gray-500 mt-2">one-time</p>
            </div>
            <div className="space-y-4 flex-1">
              {['Everything in Creator', 'Featured listings placement', 'Higher search ranking', 'Suggested covenant placement', 'Custom covenant image upload', 'Advanced UI tools'].map((feature, i) => (
                <div key={i} className="flex gap-3 text-sm text-gray-300"><Check size={18} className="text-[#49EACB] shrink-0" /> {feature}</div>
              ))}
            </div>
            <button onClick={() => handleSelectTier({ name: 'PRO', price: 500 })} className="w-full mt-8 py-3 rounded-xl bg-[#49EACB] hover:bg-[#3bc2a6] text-black font-semibold shadow-[0_0_15px_rgba(73,234,203,0.2)] transition-all">
              Pay 500 KAS
            </button>
          </div>

          {/* MAX */}
          <div className="bg-[#0a0a0a]/95 backdrop-blur-xl border border-[#1f1f1f] rounded-2xl p-8 flex flex-col hover:border-[#49EACB]/30 transition-all">
            <h3 className="text-xl font-semibold text-white text-center">MAX</h3>
            <p className="text-xs text-gray-500 text-center mb-6">Maximum Visibility + Full Suite</p>
            <div className="text-center mb-8">
              <span className="text-4xl font-bold text-[#49EACB]">1,000</span> <span className="text-sm text-[#49EACB]">KAS</span>
              <p className="text-xs text-gray-500 mt-2">one-time</p>
            </div>
            <div className="space-y-4 flex-1">
              {['Everything in PRO', 'Top placement on explorer', 'Premium branding options', 'Custom domain embedding', 'Dedicated indexer priority', 'Full UI design suite', 'Custom color palette'].map((feature, i) => (
                <div key={i} className="flex gap-3 text-sm text-gray-300"><Check size={18} className="text-[#49EACB] shrink-0" /> {feature}</div>
              ))}
            </div>
            <button onClick={() => handleSelectTier({ name: 'MAX', price: 1000 })} className="w-full px-6 py-3 bg-[#49EACB] hover:bg-[#3cd8b6] text-black font-bold rounded-xl transition-all duration-200 shadow-[0_0_15px_rgba(73,234,203,0.3)] hover:shadow-[0_0_25px_rgba(73,234,203,0.6)] active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed border-none">
              Pay 1,000 KAS
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- VIEW: 2. SELECT COVENANT ---
  if (step === 'select') {
    return (
      <div className="relative z-10 max-w-2xl mx-auto px-6 py-16 animate-in fade-in slide-in-from-bottom-4 duration-300">
        <button onClick={reset} className="flex items-center gap-2 text-gray-400 hover:text-[#49EACB] mb-8 text-sm transition-colors">
          <ArrowLeft size={16} /> Back to Pricing
        </button>
        <div className="bg-[#0a0a0a]/95 backdrop-blur-xl border border-[#1f1f1f] rounded-2xl p-8 shadow-2xl">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-white mb-2">Select a Covenant</h2>
            <p className="text-gray-400 text-sm">Choose which deployed covenant you are upgrading to <span className="text-[#49EACB] font-semibold">{selectedTier.name}</span>.</p>
          </div>
          <div className="space-y-3">
            {myCovenants.map(cov => (
              <button 
                key={cov.id} 
                onClick={() => { setSelectedCovenant(cov); setStep('pay'); }}
                className="w-full flex items-center justify-between p-4 rounded-xl border border-[#1f1f1f] bg-[#111111] hover:border-[#49EACB] transition-all group text-left"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded bg-[#1a1a1a] flex items-center justify-center text-gray-400 group-hover:text-[#49EACB]">
                    <Box size={20} />
                  </div>
                  <div>
                    <h4 className="text-white font-medium">{cov.name}</h4>
                    <p className="text-xs text-gray-500 font-mono mt-0.5">{cov.address}</p>
                  </div>
                </div>
                <span className="text-sm text-[#49EACB] opacity-0 group-hover:opacity-100 transition-opacity">Select</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // --- VIEW: 3. PAYMENT ---
  if (step === 'pay') {
    return (
      <div className="relative z-10 max-w-md mx-auto px-6 py-16 animate-in fade-in slide-in-from-right-8 duration-300">
        <button onClick={() => setStep('select')} className="flex items-center gap-2 text-gray-400 hover:text-[#49EACB] mb-8 text-sm transition-colors">
          <ArrowLeft size={16} /> Back to Selection
        </button>
        <div className="bg-[#0a0a0a]/95 backdrop-blur-xl border border-[#1f1f1f] rounded-2xl p-8 shadow-2xl text-center">
          <h2 className="text-xl font-bold text-white mb-6">Complete Upgrade</h2>
          
          <div className="bg-[#111111] border border-[#1f1f1f] rounded-xl p-4 mb-8 text-left">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Target Covenant</p>
            <p className="text-white font-medium">{selectedCovenant.name}</p>
            <div className="border-t border-[#1f1f1f] my-3"></div>
            <div className="flex justify-between items-center">
              <p className="text-sm text-gray-400">{selectedTier.name} Tier Upgrade</p>
              <p className="text-lg font-bold text-[#49EACB]">{selectedTier.price} KAS</p>
            </div>
          </div>

          <div className="space-y-3">
            <button 
              onClick={handleCheckout}
              disabled={isProcessing}
              className="w-full flex items-center justify-center gap-2 py-4 bg-[#49EACB] hover:bg-[#3bc2a6] text-black font-bold rounded-xl transition-all disabled:opacity-70"
            >
              {isProcessing ? (
                <span className="flex items-center gap-2">
                  <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  Awaiting Transaction...
                </span>
              ) : (
                <span className="flex items-center gap-2"><Wallet size={20} /> Pay with Web3 Wallet</span>
              )}
            </button>
            <button 
              disabled={isProcessing}
              className="w-full flex items-center justify-center gap-2 py-4 bg-[#111111] border border-[#1f1f1f] hover:border-[#49EACB] text-white font-medium rounded-xl transition-all"
            >
              <QrCode size={20} className="text-gray-400" /> Show QR Code
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- VIEW: 4. SUCCESS ---
  if (step === 'success') {
    return (
      <div className="relative z-10 max-w-md mx-auto px-6 py-16 animate-in zoom-in-95 duration-500">
        <div className="bg-[#0a0a0a]/95 backdrop-blur-xl border border-[#1f1f1f] rounded-2xl p-10 shadow-2xl text-center">
          <div className="w-20 h-20 mx-auto bg-[#49EACB]/10 rounded-full flex items-center justify-center mb-6">
            <CheckCircle size={40} className="text-[#49EACB]" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Upgrade Complete</h2>
          <p className="text-gray-400 text-sm mb-8">
            <span className="text-white font-medium">{selectedCovenant.name}</span> has been upgraded to the <span className="text-[#49EACB] font-semibold">{selectedTier.name}</span> tier.
          </p>
          <button 
            onClick={reset} // Wire this to route to your UI Builder later
            className="w-full flex items-center justify-center gap-2 py-4 bg-[#49EACB] hover:bg-[#3bc2a6] text-black font-bold rounded-xl shadow-[0_0_20px_rgba(73,234,203,0.3)] transition-all"
          >
            <Sparkles size={20} /> Enter UI Builder
          </button>
        </div>
      </div>
    );
  }

  return null;
};

export default Pricing;
