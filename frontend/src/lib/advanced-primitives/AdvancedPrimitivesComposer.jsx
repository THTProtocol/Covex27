import React, { useState } from 'react';
import { Scale, Clock, Users, Shuffle, X } from 'lucide-react';

/**
 * Phase 14: Advanced Covenant Primitives Composer
 * 
 * A functional visual composer for building complex covenants.
 * Supports:
 * - Time Locks
 * - Multi-Party Approvals
 * - Cross Conditions (ZK + Oracle + Time)
 * - Dispute / Challenge Periods
 * - Advanced Payout Trees
 */

export default function AdvancedPrimitivesComposer({ initialConfig, onChange }) {
  const [primitives, setPrimitives] = useState(initialConfig?.resolution?.advancedPrimitives || {
    timeLocks: {},
    multiParty: {},
    conditions: [],
    dispute: { enabled: false },
    payoutTree: { type: 'simple' }
  });

  const update = (key, value) => {
    const updated = { ...primitives, [key]: value };
    setPrimitives(updated);
    onChange?.(updated);
  };

  const addCondition = () => {
    const newConditions = [...(primitives.conditions || []), { 
      type: 'zk', 
      description: 'New condition' 
    }];
    update('conditions', newConditions);
  };

  const removeCondition = (index) => {
    const newConditions = primitives.conditions.filter((_, i) => i !== index);
    update('conditions', newConditions);
  };

  return (
    <div className="bg-[#0a0a0a] border border-white/10 rounded-3xl p-6 space-y-6">
      <div>
        <h3 className="text-lg font-bold text-white mb-1">Advanced Primitives Composer</h3>
        <p className="text-xs text-gray-400">Build complex logic visually. This config will be compiled into your SilverScript + resolution rules.</p>
      </div>

      {/* Time Locks */}
      <div className="border border-white/10 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[#49EACB]"><Clock size={18} /></span>
          <span className="font-semibold text-white">Time Locks</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div>
            <label className="text-xs text-gray-400">Release After (ISO)</label>
            <input 
              type="datetime-local" 
              className="w-full bg-black/50 border border-white/10 rounded px-3 py-2 text-white text-sm"
              onChange={(e) => update('timeLocks', { ...primitives.timeLocks, releaseAfter: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs text-gray-400">Challenge Period (hours)</label>
            <input 
              type="number" 
              className="w-full bg-black/50 border border-white/10 rounded px-3 py-2 text-white text-sm"
              placeholder="72"
              onChange={(e) => update('timeLocks', { ...primitives.timeLocks, challengePeriodHours: parseInt(e.target.value) })}
            />
          </div>
        </div>
      </div>

      {/* Multi-Party */}
      <div className="border border-white/10 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[#49EACB]"><Users size={18} /></span>
          <span className="font-semibold text-white">Multi-Party Approval</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div>
            <label className="text-xs text-gray-400">Required Approvals (M-of-N)</label>
            <input 
              type="number" 
              className="w-full bg-black/50 border border-white/10 rounded px-3 py-2 text-white text-sm"
              placeholder="2"
              onChange={(e) => update('multiParty', { ...primitives.multiParty, requiredApprovals: parseInt(e.target.value) })}
            />
          </div>
          <div>
            <label className="text-xs text-gray-400">Approvers (comma separated addresses)</label>
            <input 
              type="text" 
              className="w-full bg-black/50 border border-white/10 rounded px-3 py-2 text-white text-sm"
              placeholder="addr1, addr2, addr3"
              onChange={(e) => update('multiParty', { ...primitives.multiParty, approvers: e.target.value.split(',').map(s => s.trim()) })}
            />
          </div>
        </div>
      </div>

      {/* Conditions */}
      <div className="border border-white/10 rounded-2xl p-4">
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-2">
            <span className="text-[#49EACB]"><Shuffle size={18} /></span>
            <span className="font-semibold text-white">Cross Conditions</span>
          </div>
          <button onClick={addCondition} className="text-xs px-3 py-1 bg-white/5 rounded hover:bg-white/10">+ Add Condition</button>
        </div>

        {(primitives.conditions || []).length === 0 && (
          <p className="text-xs text-gray-500">No conditions yet. Add ZK + Oracle + Time logic.</p>
        )}

        {(primitives.conditions || []).map((cond, index) => (
          <div key={index} className="flex gap-2 mb-2 items-center">
            <select 
              value={cond.type} 
              onChange={(e) => {
                const newConds = [...primitives.conditions];
                newConds[index].type = e.target.value;
                update('conditions', newConds);
              }}
              className="bg-black/50 border border-white/10 rounded px-2 py-1 text-sm"
            >
              <option value="zk">ZK Proof</option>
              <option value="oracle">Oracle Result</option>
              <option value="time">Time-based</option>
              <option value="multi_sig">Multi-sig</option>
            </select>
            <input 
              value={cond.description || ''} 
              onChange={(e) => {
                const newConds = [...primitives.conditions];
                newConds[index].description = e.target.value;
                update('conditions', newConds);
              }}
              className="flex-1 bg-black/50 border border-white/10 rounded px-2 py-1 text-sm" 
              placeholder="Condition description"
            />
            <button onClick={() => removeCondition(index)} className="text-red-400 text-sm px-2"><X size={14} /></button>
          </div>
        ))}
      </div>

      {/* Dispute */}
      <div className="border border-white/10 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[#49EACB]"><Scale size={18} /></span>
          <span className="font-semibold text-white">Dispute / Challenge System</span>
          <label className="ml-auto flex items-center gap-2 text-xs">
            <input 
              type="checkbox" 
              checked={primitives.dispute?.enabled || false}
              onChange={(e) => update('dispute', { ...primitives.dispute, enabled: e.target.checked })}
            />
            Enable
          </label>
        </div>

        {primitives.dispute?.enabled && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div>
              <label className="text-xs text-gray-400">Bond Amount (KAS)</label>
              <input type="number" className="w-full bg-black/50 border border-white/10 rounded px-3 py-2 text-white text-sm" placeholder="100" />
            </div>
            <div>
              <label className="text-xs text-gray-400">Dispute Window (hours)</label>
              <input type="number" className="w-full bg-black/50 border border-white/10 rounded px-3 py-2 text-white text-sm" placeholder="168" />
            </div>
          </div>
        )}
      </div>

      <div className="text-[10px] text-gray-500 pt-2 border-t border-white/10">
        These primitives will be compiled into your covenant script and resolution logic. Full visual payout tree editor coming in later iterations.
      </div>
    </div>
  );
}
