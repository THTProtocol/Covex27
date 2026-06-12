import { useState, useEffect } from 'react';
import { ShieldCheck, Code2, FileText, MousePointerClick, CheckCircle2, AlertTriangle, Save, ExternalLink, Terminal, Info } from 'lucide-react';

/**
 * UiBuilder.jsx, Trust & Verification Builder for Covex paid-tier covenants
 *
 * Allows PRO/MAX covenant creators to:
 *  - Link verified open-source code
 *  - Add developer safety notes
 *  - Define interaction buttons (form schema mappings)
 *
 * Backend enforces strict wallet-address == on-chain creator_addr binding.
 */
export default function UiBuilder({ covenant, walletAddress, onSaved }) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);
  const [activeSection, setActiveSection] = useState('source');

  const [form, setForm] = useState({
    verified_source_url: '',
    developer_notes: '',
    interaction_schema: '',
    custom_category: '',
  });

  // Load existing trust config from backend
  useEffect(() => {
    if (!covenant?.tx_id) return;
    fetch(`/api/terminal-config/${encodeURIComponent(covenant.tx_id)}`)
      .then(r => r.json())
      .then(d => {
        if (d.success && d.trust_config) {
          setForm(prev => ({
            verified_source_url: d.trust_config.verified_source_url || prev.verified_source_url,
            developer_notes: d.trust_config.developer_notes || prev.developer_notes,
            interaction_schema: typeof d.trust_config.interaction_schema === 'string'
              ? d.trust_config.interaction_schema
              : JSON.stringify(d.trust_config.interaction_schema || {}, null, 2),
            custom_category: d.trust_config.custom_category || prev.custom_category,
          }));
        }
      })
      .catch(() => {});
  }, [covenant?.tx_id]);

  const handleSave = async () => {
    if (!covenant?.tx_id || !walletAddress) return;
    setSaving(true);
    setSaved(false);
    setError(null);

    try {
      const res = await fetch(`/api/terminal-config/${encodeURIComponent(covenant.tx_id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creator_addr: walletAddress,
          verified_source_url: form.verified_source_url,
          developer_notes: form.developer_notes,
          interaction_schema: form.interaction_schema,
          custom_category: form.custom_category,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        setError(data.error || 'Save failed');
        return;
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3500);
      if (onSaved) onSaved(form);
    } catch (err) {
      setError(`Network error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const isCreator = walletAddress && covenant?.creator_addr &&
    walletAddress.toLowerCase() === covenant.creator_addr.toLowerCase();
  const tier = (covenant?.verified_tier || 'FREE').toUpperCase();
  const isPremium = tier === 'PRO' || tier === 'MAX';
  const hasSourceUrl = form.verified_source_url && form.verified_source_url.trim().length > 0;
  const hasNotes = form.developer_notes && form.developer_notes.trim().length > 0;

  if (!isCreator || !isPremium) {
    return (
      <div className="p-6 rounded-xl border border-amber-500/20 bg-amber-500/[0.04] text-center animate-in fade-in">
        <ShieldCheck size={24} className="text-amber-400 mx-auto mb-2" />
        <p className="text-sm text-amber-400 font-semibold mb-1">Trust Builder Locked</p>
        <p className="text-xs text-gray-300">
          {!isCreator
            ? 'Only the on-chain covenant creator can configure trust settings.'
            : `Upgrade to PRO or MAX tier to unlock the Trust & Verification Builder. Current: ${tier}`}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
      {/* Header */}
      <div className="flex items-center gap-3 pb-4 border-b border-white/5">
        <div className="w-10 h-10 rounded-lg bg-[#49EACB]/10 border border-[#49EACB]/20 flex items-center justify-center">
          <ShieldCheck size={20} className="text-[#49EACB]" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-white uppercase tracking-widest">Trust & Verification Builder</h3>
          <p className="text-xs text-gray-300">Configure trust signals for your {tier} covenant</p>
        </div>
        <span className="ml-auto px-3 py-1 text-[10px] font-bold rounded-full bg-[#49EACB]/10 text-[#49EACB] border border-[#49EACB]/20">
          {tier}
        </span>
      </div>

      {/* Trust Signal Previews */}
      <div className="flex flex-wrap gap-2">
        {hasSourceUrl && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/[0.08] border border-emerald-500/25 text-emerald-400 text-xs font-semibold shadow-[0_0_10px_rgba(16,185,129,0.15)]">
            <CheckCircle2 size={12} />
            ✓ Verified Open-Source
          </div>
        )}
        {hasNotes && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-500/[0.08] border border-blue-500/25 text-blue-400 text-xs font-semibold shadow-[0_0_10px_rgba(59,130,246,0.15)]">
            <Info size={12} />
            Developer Notes Available
          </div>
        )}
        {!hasSourceUrl && !hasNotes && (
          <span className="text-xs text-gray-200">Configure badges will appear here as you add trust signals.</span>
        )}
      </div>

      {/* Section Tabs */}
      <div className="flex border-b border-white/5">
        {[
          { id: 'source', icon: Code2, label: 'Open Source' },
          { id: 'notes', icon: FileText, label: 'Safety Notes' },
          { id: 'interaction', icon: MousePointerClick, label: 'Buttons' },
          { id: 'category', icon: Terminal, label: 'Category' },
        ].map(s => {
          const Icon = s.icon;
          return (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-all border-b-2 ${
                activeSection === s.id
                  ? 'text-[#49EACB] border-[#49EACB] bg-[#49EACB]/[0.03]'
                  : 'text-gray-300 border-transparent hover:text-gray-300'
              }`}
            >
              <Icon size={13} />
              {s.label}
            </button>
          );
        })}
      </div>

      {/* === SECTION: Open Source Verification === */}
      {activeSection === 'source' && (
        <div className="space-y-3 animate-in fade-in duration-200">
          <div className="flex items-start gap-2">
            <Code2 size={14} className="text-gray-200 mt-0.5" />
            <div>
              <p className="text-xs text-gray-300 font-semibold mb-1">Verified Source URL</p>
              <p className="text-[11px] text-gray-200 mb-3">
                Link your open-source SilverScript code on GitHub. This proves your covenant logic is auditable and not a scam.
              </p>
            </div>
          </div>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <ExternalLink size={14} className="text-gray-200" />
            </div>
            <input
              type="url"
              value={form.verified_source_url}
              onChange={e => setForm(f => ({ ...f, verified_source_url: e.target.value }))}
              placeholder="https://github.com/your-org/your-covenant"
              className="w-full pl-9 pr-4 py-3 rounded-xl bg-black/40 border border-white/10 text-white text-sm placeholder:text-gray-200 focus:outline-none focus:border-[#49EACB]/50 transition-colors font-mono"
            />
          </div>
          {hasSourceUrl && (
            <div className="p-3 rounded-lg bg-emerald-500/[0.04] border border-emerald-500/20">
              <p className="text-xs text-emerald-400">
                ✓ This badge will appear on your covenant card in the Explorer, signaling trust to users.
              </p>
            </div>
          )}
        </div>
      )}

      {/* === SECTION: Developer Safety Notes === */}
      {activeSection === 'notes' && (
        <div className="space-y-3 animate-in fade-in duration-200">
          <div className="flex items-start gap-2">
            <FileText size={14} className="text-gray-200 mt-0.5" />
            <div>
              <p className="text-xs text-gray-300 font-semibold mb-1">Developer Safety Notes</p>
              <p className="text-[11px] text-gray-200 mb-3">
                Explain how your covenant works, what parameters mean, and why it&apos;s safe to use.
                Good notes increase user confidence and reduce scam suspicion.
              </p>
            </div>
          </div>
          <textarea
            rows={6}
            value={form.developer_notes}
            onChange={e => setForm(f => ({ ...f, developer_notes: e.target.value }))}
            placeholder={`Example: This covenant locks KAS in a time-locked escrow. The payee is hardcoded at deployment and cannot be changed. Funds can only be claimed after the timeout expires. The creator has zero ability to rug, the logic is immutable on the BlockDAG.`}
            className="w-full px-4 py-3 rounded-xl bg-black/40 border border-white/10 text-white text-sm placeholder:text-gray-200 focus:outline-none focus:border-[#49EACB]/50 transition-colors resize-none font-mono leading-relaxed"
          />
          <p className="text-[10px] text-gray-200">
            {form.developer_notes.length} characters, shown on your covenant detail page
          </p>
        </div>
      )}

      {/* === SECTION: Interaction Buttons === */}
      {activeSection === 'interaction' && (
        <div className="space-y-3 animate-in fade-in duration-200">
          <div className="flex items-start gap-2">
            <MousePointerClick size={14} className="text-gray-200 mt-0.5" />
            <div>
              <p className="text-xs text-gray-300 font-semibold mb-1">Interaction Schema (JSON)</p>
              <p className="text-[11px] text-gray-200 mb-3">
                Define custom buttons for your covenant dashboard. Each button maps to a kaspa-wasm spend
                action on a specific UTXO. Example: &quot;Bet on Outcome A&quot; or &quot;Sign Payout&quot;.
              </p>
            </div>
          </div>
          <textarea
            rows={10}
            value={form.interaction_schema}
            onChange={e => setForm(f => ({ ...f, interaction_schema: e.target.value }))}
            placeholder={`[
  {
    "label": "Bet on Outcome A",
    "action": "spend_utxo",
    "description": "Lock your prediction on outcome A",
    "params": { "amount": "1.0", "entrypoint": "bet_a" }
  },
  {
    "label": "Claim Winnings",
    "action": "spend_utxo",
    "description": "Claim your payout if you won",
    "params": { "entrypoint": "claim" }
  }
]`}
            spellCheck="false"
            className="w-full px-4 py-3 rounded-xl bg-black/40 border border-white/10 text-[#49EACB] text-xs placeholder:text-gray-200 focus:outline-none focus:border-[#49EACB]/50 transition-colors resize-none font-mono leading-relaxed"
          />
          <p className="text-[10px] text-gray-200">
            Valid JSON array of button objects. Each gets rendered as an interactive button on your covenant page.
          </p>

          {/* Button preview */}
          {(() => {
            try {
              const btns = JSON.parse(form.interaction_schema || '[]');
              if (Array.isArray(btns) && btns.length > 0) {
                return (
                  <div className="space-y-2">
                    <p className="text-[10px] text-gray-300 uppercase tracking-wider">Button Preview</p>
                    <div className="flex flex-wrap gap-2">
                      {btns.map((b, i) => (
                        <div key={i} className="px-4 py-2 rounded-xl bg-[#49EACB]/10 border border-[#49EACB]/30 text-[#49EACB] text-xs font-semibold shadow-[0_0_8px_rgba(73,234,203,0.15)] flex items-center gap-1.5">
                          <Terminal size={12} />
                          {b.label || `Button ${i + 1}`}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              }
            } catch (_) {}
            return null;
          })()}
        </div>
      )}

      {/* === SECTION: Custom Category === */}
      {activeSection === 'category' && (
        <div className="space-y-3 animate-in fade-in duration-200">
          <div className="flex items-start gap-2">
            <Terminal size={14} className="text-gray-200 mt-0.5" />
            <div>
              <p className="text-xs text-gray-300 font-semibold mb-1">Custom Category Override</p>
              <p className="text-[11px] text-gray-200 mb-3">
                Override the auto-detected category with your own label. Useful if your covenant doesn't
                fit neatly into a predefined bucket, or you want a more descriptive name.
                The original auto-detected category will still display on the card unless you override it.
              </p>
            </div>
          </div>
          <div className="relative">
            <input
              type="text"
              value={form.custom_category}
              onChange={e => setForm(f => ({ ...f, custom_category: e.target.value }))}
              placeholder={covenant?.category || 'e.g. Insurance Fund, DAO Treasury, Lottery'}
              className="w-full px-4 py-3 rounded-xl bg-black/40 border border-white/10 text-white text-sm placeholder:text-gray-200 focus:outline-none focus:border-[#49EACB]/50 transition-colors font-mono"
            />
          </div>
          <p className="text-[10px] text-gray-200">
            Leave blank to keep auto-detected category: <span className="text-gray-200">{covenant?.category || 'General'}</span>
          </p>
          {form.custom_category && form.custom_category.trim().length > 0 && (
            <div className="p-3 rounded-lg bg-purple-500/[0.04] border border-purple-500/20">
              <p className="text-xs text-purple-400">
                ✓ Category will be set to "<span className="font-semibold">{form.custom_category}</span>" instead of "{covenant?.category || 'General'}".
              </p>
            </div>
          )}
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/[0.06] border border-red-500/20 text-red-400 text-xs">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Save Button */}
      <button
        onClick={handleSave}
        disabled={saving || saved}
        className="w-full px-6 py-3 bg-[#49EACB] hover:bg-[#3cd8b6] text-black font-bold rounded-xl transition-all duration-200 shadow-[0_0_15px_rgba(73,234,203,0.3)] hover:shadow-[0_0_25px_rgba(73,234,203,0.6)] active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed border-none"
      >
        {saving ? (
          <span className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
            Saving to BlockDAG...
          </span>
        ) : saved ? (
          <span className="flex items-center gap-2">
            <CheckCircle2 size={16} />
            Trust Configuration Published
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <Save size={16} />
            Save Trust Configuration
          </span>
        )}
      </button>

      <p className="text-[10px] text-gray-200 text-center">
        Immutable on-chain logic • Customizable frontend display only
      </p>
    </div>
  );
}
