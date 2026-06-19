import React, { useState } from 'react';
import { Card } from '@/components/ui/Card';

/**
 * Multi-Oracle Federation Configurator
 * Allows users to configure multiple oracles + threshold for decentralized resolution.
 */
export default function MultiOracleConfigurator({ value, onChange }) {
  const [oracles, setOracles] = useState(value?.multiOracle?.providers || [
    { name: "Covex Primary", publicKey: "", weight: 1 },
    { name: "Community Oracle 1", publicKey: "", weight: 1 },
    { name: "Community Oracle 2", publicKey: "", weight: 1 },
  ]);
  const [threshold, setThreshold] = useState(value?.multiOracle?.threshold || 2);
  const [collectedSignatures, setCollectedSignatures] = useState([]); // for demo: user pastes signatures here

  const update = (newOracles, newThreshold) => {
    const config = {
      providers: newOracles,
      threshold: newThreshold,
      requireAll: false,
    };
    onChange?.(config);
  };

  const addOracle = () => {
    const newList = [...oracles, { name: `Oracle ${oracles.length + 1}`, publicKey: "", weight: 1 }];
    setOracles(newList);
    update(newList, threshold);
  };

  const updateOracle = (index, field, val) => {
    const newList = [...oracles];
    newList[index][field] = val;
    setOracles(newList);
    update(newList, threshold);
  };

  const removeOracle = (index) => {
    if (oracles.length <= 2) return;
    const newList = oracles.filter((_, i) => i !== index);
    setOracles(newList);
    update(newList, Math.min(threshold, newList.length));
  };

  const changeThreshold = (newT) => {
    setThreshold(newT);
    update(oracles, newT);
  };

  // Helper to build the final multi_oracle object for submission
  const getMultiOracleConfigForSubmission = () => {
    return {
      providers: oracles,
      threshold,
      signatures: collectedSignatures.filter(s => s.signature && s.publicKey),
    };
  };

  return (
    <Card className="p-6 space-y-6" accent="#49EACB">
      <div>
        <h3 className="text-lg font-bold text-white light:text-slate-900 flex items-center gap-2">
          Multi-Oracle Federation
        </h3>
        <p className="text-xs text-gray-400 light:text-slate-500 mt-1">
          Require cryptographic signatures from multiple independent oracles. Dramatically reduces single-oracle trust risk.
        </p>
      </div>

      <div className="space-y-3">
        {oracles.map((oracle, index) => (
          <div key={index} className="flex gap-3 items-center bg-black/40 light:bg-slate-50 p-3 rounded-xl">
            <input
              value={oracle.name}
              onChange={(e) => updateOracle(index, 'name', e.target.value)}
              className="cyber-input flex-1 px-3 py-2 text-sm"
              placeholder="Oracle Name"
            />
            <input
              value={oracle.publicKey}
              onChange={(e) => updateOracle(index, 'publicKey', e.target.value)}
              className="cyber-input flex-1 px-3 py-2 font-mono text-xs"
              placeholder="Public Key (hex)"
            />
            <input
              type="number"
              value={oracle.weight}
              onChange={(e) => updateOracle(index, 'weight', parseInt(e.target.value) || 1)}
              className="cyber-input w-16 px-2 py-2 text-sm text-center"
            />
            <button
              onClick={() => removeOracle(index)}
              className="text-red-400 hover:text-red-500 px-2 text-lg"
              disabled={oracles.length <= 2}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={addOracle}
          className="px-4 py-2 text-sm bg-white/5 hover:bg-white/10 light:bg-slate-100 light:hover:bg-slate-200 light:text-slate-900 rounded-xl border border-white/10 light:border-slate-200"
        >
          + Add Oracle
        </button>

        <div className="flex items-center gap-2 ml-auto">
          <span className="text-sm text-gray-400 light:text-slate-500">Threshold:</span>
          <select
            value={threshold}
            onChange={(e) => changeThreshold(parseInt(e.target.value))}
            className="cyber-input px-3 py-1.5 text-sm"
          >
            {oracles.map((_, i) => (
              <option key={i} value={i + 1}>{i + 1} of {oracles.length}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Signature collection area for real multi-oracle submission */}
      <div className="border-t border-white/10 light:border-slate-200 pt-4">
        <div className="text-sm font-medium text-white light:text-slate-900 mb-2">Collected Signatures (for submission)</div>
        <textarea
          className="cyber-input w-full h-24 p-2 text-xs font-mono"
          placeholder="Paste signatures here as JSON array: [{public_key: '...', signature: '...'}, ...]"
          onChange={(e) => {
            try {
              const parsed = JSON.parse(e.target.value);
              setCollectedSignatures(Array.isArray(parsed) ? parsed : []);
            } catch (_) {}
          }}
        />
        <div className="text-[10px] text-gray-500 light:text-slate-500 mt-1">
          Each oracle must sign the exact message produced by the main oracle after ZK verification.
        </div>
      </div>

      <div className="text-[11px] text-emerald-400/70 pt-2 border-t border-white/10 light:border-slate-200">
        Real cryptographic verification is now enforced in the backend using the same SHA256 scheme as single-oracle.
      </div>
    </Card>
  );
}
