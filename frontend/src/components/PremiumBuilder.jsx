import { useState, useEffect } from 'react';
import { Paintbrush, Palette, LayoutTemplate, Type, Ruler, Save, CheckCircle2 } from 'lucide-react';

const COLORS = ['#49EACB', '#E8AF34', '#3B82F6', '#EC4899', '#10B981', '#F59E0B', '#8B5CF6', '#EF4444'];

export default function PremiumBuilder({ covenant, walletAddress, onSave }) {
  const [config, setConfig] = useState({
    glowColor: '#49EACB',
    customDescription: '',
    layout: 'Compact',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (covenant?.tx_id) {
      const cached = localStorage.getItem(`covex_builder_${covenant.tx_id}`);
      if (cached) {
        try { setConfig(JSON.parse(cached)); } catch (_) {}
      }
    }
  }, [covenant?.tx_id]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);

    // Persist locally
    localStorage.setItem(`covex_builder_${covenant?.tx_id}`, JSON.stringify(config));

    // POST to backend
    try {
      const res = await fetch('/api/ui-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          covenant_id: covenant?.tx_id,
          creator_addr: walletAddress,
          glow_color: config.glowColor,
          description: config.customDescription,
          layout: config.layout,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      console.warn('Backend UI config save failed (continuing):', err.message);
      // Non-fatal — local storage already saved
    }

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    if (onSave) onSave(config);
  };

  const isCreator = walletAddress && covenant?.creator_addr && 
    walletAddress.toLowerCase() === covenant.creator_addr.toLowerCase();
  const tier = (covenant?.verified_tier || covenant?.tier || 'FREE').toUpperCase();
  const isPremium = tier === 'PRO' || tier === 'MAX';

  if (!isCreator || !isPremium) {
    return (
      <div className="p-6 rounded-xl border border-amber-500/20 bg-amber-500/[0.04] text-center">
        <Palette size={24} className="text-amber-400 mx-auto mb-2" />
        <p className="text-sm text-amber-400 font-semibold mb-1">Premium UI Builder Locked</p>
        <p className="text-xs text-gray-500">
          {!isCreator
            ? 'Only the covenant creator can customize the UI.'
            : 'Upgrade to PRO or MAX tier to unlock the UI builder.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-4">
        <Paintbrush size={18} className="text-[#49EACB]" />
        <h3 className="text-sm font-semibold text-white uppercase tracking-widest">Premium UI Builder</h3>
        <span className="ml-auto px-2 py-0.5 text-[10px] font-bold rounded bg-[#49EACB]/10 text-[#49EACB] border border-[#49EACB]/20">
          {tier}
        </span>
      </div>

      {/* Glow Color Picker */}
      <div className="space-y-2">
        <p className="text-xs text-gray-500 uppercase tracking-wider">Glow Color</p>
        <div className="flex items-center gap-2 flex-wrap">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setConfig((s) => ({ ...s, glowColor: c }))}
              className={`h-8 w-8 rounded-full border-2 transition-all ${
                config.glowColor === c
                  ? 'border-white scale-110 shadow-[0_0_12px_rgba(255,255,255,0.25)]'
                  : 'border-transparent hover:scale-105'
              }`}
              style={{ backgroundColor: c }}
              title={c}
            />
          ))}
          <input
            type="color"
            value={config.glowColor}
            onChange={(e) => setConfig((s) => ({ ...s, glowColor: e.target.value }))}
            className="h-8 w-8 rounded-full border-0 p-0 overflow-hidden cursor-pointer"
          />
        </div>
        {/* Glow Preview */}
        <div
          className="mt-2 p-4 rounded-xl border text-sm text-center font-semibold transition-all"
          style={{
            borderColor: config.glowColor,
            boxShadow: `0 0 20px ${config.glowColor}40, inset 0 0 20px ${config.glowColor}10`,
            color: config.glowColor,
          }}
        >
          LIVE GLOW PREVIEW
        </div>
      </div>

      {/* Custom Description */}
      <div className="space-y-2">
        <p className="text-xs text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
          <Type size={12} /> Custom Description
        </p>
        <textarea
          rows="4"
          value={config.customDescription}
          onChange={(e) => setConfig((s) => ({ ...s, customDescription: e.target.value }))}
          placeholder={covenant?.description || 'Describe your covenant in detail...'}
          className="w-full px-4 py-3 rounded-xl bg-black/40 border border-white/10 text-white text-sm placeholder:text-gray-600 focus:outline-none focus:border-[#49EACB]/50 transition-colors resize-none"
        />
        <p className="text-[10px] text-gray-600">
          {config.customDescription.length} characters — this will appear on your covenant detail page
        </p>
      </div>

      {/* Layout Toggle */}
      <div className="space-y-2">
        <p className="text-xs text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
          <LayoutTemplate size={12} /> Card Layout
        </p>
        <div className="grid grid-cols-2 gap-2">
          {['Compact', 'Expanded'].map((lyt) => (
            <button
              key={lyt}
              onClick={() => setConfig((s) => ({ ...s, layout: lyt }))}
              className={`p-4 rounded-xl border text-left transition-all ${
                config.layout === lyt
                  ? 'border-[#49EACB]/50 bg-[#49EACB]/[0.06] ring-1 ring-[#49EACB]/20'
                  : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.04]'
              }`}
            >
              <p className="text-sm font-medium text-white">{lyt}</p>
              <p className="text-[10px] text-gray-500 mt-1">
                {lyt === 'Compact' ? 'Minimal card view' : 'Full detail panel'}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Layout Preview */}
      <div
        className={`rounded-xl border p-4 transition-all ${
          config.layout === 'Expanded' ? 'p-6' : ''
        }`}
        style={{
          borderColor: config.layout === 'Expanded' ? config.glowColor : 'rgba(255,255,255,0.08)',
          boxShadow: config.layout === 'Expanded' ? `0 0 15px ${config.glowColor}30` : 'none',
        }}
      >
        <div className="flex items-start justify-between mb-3">
          <div>
            <h4 className="font-bold text-sm text-white">
              {covenant?.name || covenant?.covenant_type || 'Covenant'}
            </h4>
            <p className="text-[10px] text-gray-500 font-mono mt-0.5">
              {(covenant?.tx_id || '').slice(0, 16)}...
            </p>
          </div>
          <span
            className="px-2 py-0.5 text-[10px] font-bold rounded-full"
            style={{ backgroundColor: `${config.glowColor}20`, color: config.glowColor, border: `1px solid ${config.glowColor}40` }}
          >
            {tier}
          </span>
        </div>
        <p className={`text-xs ${config.layout === 'Expanded' ? 'text-gray-300' : 'text-gray-500'} mb-3`}>
          {config.customDescription || covenant?.description || 'No description provided.'}
        </p>
        {config.layout === 'Expanded' && (
          <div className="grid grid-cols-2 gap-2 text-[10px] pt-3 border-t border-white/5">
            <div className="flex justify-between">
              <span className="text-gray-500">Script Hash</span>
              <span className="font-mono" style={{ color: config.glowColor }}>
                {(covenant?.script_hash || '').slice(0, 12)}...
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Creator</span>
              <span className="text-gray-400 font-mono">
                {(covenant?.creator_addr || '').slice(0, 12)}...
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Save Button */}
      <button
        onClick={handleSave}
        disabled={saving || saved}
        className="w-full px-6 py-3 bg-[#49EACB] hover:bg-[#3cd8b6] text-black font-bold rounded-xl transition-all duration-200 shadow-[0_0_15px_rgba(73,234,203,0.3)] hover:shadow-[0_0_25px_rgba(73,234,203,0.6)] active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed border-none"
      >
        {saving ? (
          <span className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
            Saving...
          </span>
        ) : saved ? (
          <span className="flex items-center gap-2">
            <CheckCircle2 size={16} />
            Saved & Published
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <Save size={16} />
            Save UI Configuration
          </span>
        )}
      </button>
    </div>
  );
}
