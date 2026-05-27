import { useState, useEffect, useCallback } from 'react';
import {
  Terminal, Settings, Code2, Gavel, Save, ExternalLink,
  ToggleLeft, ToggleRight, Sliders, Radio, Shield, Cpu,
  Zap, AlertTriangle, CheckCircle2, ChevronDown, Info,
  Upload, Eye, EyeOff, Play,
} from 'lucide-react';

const SECTION_BASE = 'bg-black/30 border border-white/[0.06] rounded-2xl p-6 space-y-5 backdrop-blur-sm';
const SECTION_HEADER = 'flex items-center gap-3 text-kaspa-green font-semibold text-sm uppercase tracking-widest';
const LABEL = 'text-xs text-gray-500 uppercase tracking-wider font-mono';
const INPUT =
  'w-full px-4 py-3 rounded-xl bg-black/50 border border-white/10 text-white text-sm placeholder:text-gray-600 focus:outline-none focus:border-kaspa-green/50 focus:shadow-[0_0_8px_rgba(73,234,203,0.1)] transition-all';
const TEXTAREA =
  'w-full px-4 py-3 rounded-xl bg-black/50 border border-white/10 text-white text-sm placeholder:text-gray-600 focus:outline-none focus:border-kaspa-green/50 focus:shadow-[0_0_8px_rgba(73,234,203,0.1)] transition-all resize-none';

function Toggle({ label, desc, enabled, onChange, disabled = false }) {
  return (
    <button
      onClick={() => !disabled && onChange(!enabled)}
      disabled={disabled}
      className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${
        disabled
          ? 'opacity-40 cursor-not-allowed border-white/[0.04] bg-black/20'
          : enabled
          ? 'border-kaspa-green/30 bg-kaspa-green/[0.04] hover:bg-kaspa-green/[0.06]'
          : 'border-white/[0.05] bg-black/20 hover:bg-white/[0.03]'
      }`}
    >
      <div className="text-left">
        <p className={`text-sm font-medium ${disabled ? 'text-gray-600' : 'text-white'}`}>{label}</p>
        {desc && <p className="text-[11px] text-gray-600 mt-0.5">{desc}</p>}
      </div>
      {enabled ? (
        <ToggleRight size={22} className="text-kaspa-green shrink-0" />
      ) : (
        <ToggleLeft size={22} className="text-gray-700 shrink-0" />
      )}
    </button>
  );
}

function SliderField({ label, value, min, max, step, onChange, suffix = '%' }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className={LABEL}>{label}</p>
        <span className="text-sm font-mono text-kaspa-green font-bold tabular-nums">
          {value}{suffix}
        </span>
      </div>
      <div className="relative">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="w-full h-2 rounded-full appearance-none cursor-pointer
            bg-white/[0.06] accent-kaspa-green
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5
            [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-kaspa-green
            [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(73,234,203,0.4)] [&::-webkit-slider-thumb]:cursor-pointer"
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 h-2 rounded-l-full bg-kaspa-green/30 pointer-events-none"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-gray-700">
        <span>{min}{suffix}</span>
        <span>{max}{suffix}</span>
      </div>
    </div>
  );
}

function ResolutionCard({ icon: Icon, title, desc, selected, onClick, accent = 'kaspa-green' }) {
  const colors = {
    'kaspa-green': 'border-kaspa-green/40 bg-kaspa-green/[0.04] ring-1 ring-kaspa-green/20',
    'kaspa-gold': 'border-kaspa-gold/40 bg-kaspa-gold/[0.04] ring-1 ring-kaspa-gold/20',
    'purple': 'border-purple-500/40 bg-purple-500/[0.04] ring-1 ring-purple-500/20',
  };
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-start gap-4 p-4 rounded-xl border text-left transition-all ${
        selected
          ? colors[accent] || colors['kaspa-green']
          : 'border-white/[0.06] bg-black/20 hover:bg-white/[0.03]'
      }`}
    >
      <div
        className={`shrink-0 h-10 w-10 rounded-xl flex items-center justify-center border ${
          selected
            ? `border-${accent === 'kaspa-green' ? 'kaspa-green/40' : accent === 'kaspa-gold' ? 'kaspa-gold/40' : 'purple-500/40'} bg-${accent === 'kaspa-green' ? 'kaspa-green' : accent === 'kaspa-gold' ? 'kaspa-gold' : 'purple-500'}/10`
            : 'border-white/10 bg-white/[0.02]'
        }`}
      >
        <Icon
          size={18}
          className={selected ? `text-${accent === 'kaspa-green' ? 'kaspa-green' : accent === 'kaspa-gold' ? 'kaspa-gold' : 'purple-400'}` : 'text-gray-600'}
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold ${selected ? 'text-white' : 'text-gray-400'}`}>{title}</p>
        <p className="text-[11px] text-gray-600 mt-1 leading-relaxed">{desc}</p>
      </div>
      <Radio
        size={16}
        className={`shrink-0 mt-1 ${
          selected ? 'text-kaspa-green' : 'text-gray-700'
        }`}
        fill={selected ? 'currentColor' : 'none'}
      />
    </button>
  );
}

export default function CovexTerminal({ covenant }) {
  // ── Defaults derived from covenant ──
  const covenantId = covenant?.tx_id || '';

  // ── Section A: Covenant Configuration ──
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [feePercent, setFeePercent] = useState(2);
  const [reusable, setReusable] = useState(true);
  const [allowTopups, setAllowTopups] = useState(false);

  // ── Section B: Custom UI Integration ──
  const [customUICode, setCustomUICode] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  // ── Section C: Outcome Resolution ──
  const [resolutionMode, setResolutionMode] = useState('oracle');
  const [customOracleKey, setCustomOracleKey] = useState('');
  const [zkCircuit, setZkCircuit] = useState('chess_verifier');
  const [zkVerifierKey, setZkVerifierKey] = useState('');

  // ── Section D: Status ──
  const [saveStatus, setSaveStatus] = useState('idle'); // idle | saving | saved | error
  const [configLoaded, setConfigLoaded] = useState(false);

  // ── Load saved config from API on mount ──
  useEffect(() => {
    if (!covenantId) return;
    fetch(`/api/terminal-config/${covenantId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.config) {
          const cfg = data.config;
          if (cfg.name) setName(cfg.name);
          if (cfg.description) setDescription(cfg.description);
          if (cfg.fee_percent !== undefined) setFeePercent(cfg.fee_percent);
          if (cfg.reusable !== undefined) setReusable(cfg.reusable);
          if (cfg.allow_topups !== undefined) setAllowTopups(cfg.allow_topups);
          if (cfg.resolution_mode) setResolutionMode(cfg.resolution_mode);
          if (cfg.custom_oracle_key) setCustomOracleKey(cfg.custom_oracle_key);
          if (cfg.zk_circuit) setZkCircuit(cfg.zk_circuit);
          if (cfg.zk_verifier_key) setZkVerifierKey(cfg.zk_verifier_key);
          if (data.ui_html) setCustomUICode(data.ui_html);
        } else {
          // No saved config — seed from covenant data
          if (covenant?.covenant_type) setName(covenant.covenant_type);
          if (covenant?.description) setDescription(covenant.description);
        }
        setConfigLoaded(true);
      })
      .catch(() => {
        // Fallback to covenant defaults
        if (covenant?.covenant_type) setName(covenant.covenant_type);
        if (covenant?.description) setDescription(covenant.description);
        setConfigLoaded(true);
      });
  }, [covenantId, covenant]);

  // ── Open Covenant Studio ──
  const handleOpenStudio = useCallback(() => {
    window.open('http://localhost:3001', '_blank');
  }, []);

  // ── Save All Changes ──
  const handleSave = useCallback(async () => {
    if (!covenantId) return;
    setSaveStatus('saving');

    const payload = {
      name,
      description,
      fee_percent: feePercent,
      reusable,
      allow_topups: allowTopups,
      custom_ui_code: customUICode,
      resolution_mode: resolutionMode,
      custom_oracle_key: resolutionMode === 'custom' ? customOracleKey : null,
      zk_circuit: resolutionMode === 'zk' ? zkCircuit : null,
      zk_verifier_key: resolutionMode === 'zk' ? zkVerifierKey : null,
    };

    try {
      const res = await fetch(`/api/terminal-config/${covenantId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        setSaveStatus('saved');
        // Also persist locally for fallback
        localStorage.setItem(`covex_terminal_${covenantId}`, JSON.stringify(payload));
      } else {
        setSaveStatus('error');
      }
    } catch {
      setSaveStatus('error');
    }
  }, [
    covenantId, name, description, feePercent, reusable, allowTopups,
    customUICode, resolutionMode, customOracleKey, zkCircuit, zkVerifierKey,
  ]);

  // ── Apply Custom UI (also triggers save) ──
  const handleApplyCustomUI = useCallback(() => {
    handleSave();
  }, [handleSave]);

  if (!configLoaded) {
    return (
      <div className="p-20 text-center">
        <div className="w-8 h-8 border-2 border-kaspa-green border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-500 font-mono text-sm uppercase tracking-widest animate-pulse">
          Loading terminal...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* ─── Terminal Header ─── */}
      <div className="flex items-center gap-4 mb-2">
        <div className="p-2.5 rounded-xl bg-kaspa-green/10 border border-kaspa-green/30">
          <Terminal size={22} className="text-kaspa-green" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Covex Terminal</h2>
          <p className="text-xs text-gray-500 font-mono">ADVANCED COVENANT CONFIGURATION</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-kaspa-green animate-pulse shadow-[0_0_6px_#49EACB]" />
          <span className="text-[10px] text-gray-600 font-mono uppercase tracking-wider">Live</span>
        </div>
      </div>

      {/* ─── Section A: Covenant Configuration ─── */}
      <section className={SECTION_BASE}>
        <div className={SECTION_HEADER}>
          <Settings size={16} />
          Covenant Configuration
        </div>

        <div className="space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <p className={LABEL}>Covenant Name</p>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Grandmaster Chess Duel"
              className={INPUT}
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <p className={LABEL}>Public Description</p>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what this covenant does, rules, and outcomes..."
              className={TEXTAREA}
            />
          </div>

          {/* Fee Slider */}
          <SliderField
            label="Platform Fee"
            value={feePercent}
            min={0}
            max={5}
            step={0.1}
            onChange={setFeePercent}
          />

          {/* Reusable Toggle */}
          <Toggle
            label="Reusable Covenant"
            desc="Allow multiple participants to reuse this covenant. Fee stays in the pot."
            enabled={reusable}
            onChange={setReusable}
          />

          {/* Allow Top-ups */}
          <Toggle
            label="Allow Top-ups"
            desc="Participants can add more KAS to the covenant after creation."
            enabled={allowTopups}
            onChange={setAllowTopups}
          />

          {/* Info Box */}
          <div className="flex items-start gap-3 p-4 rounded-xl bg-kaspa-green/[0.03] border border-kaspa-green/20">
            <Info size={16} className="text-kaspa-green shrink-0 mt-0.5" />
            <div>
              <p className="text-xs text-kaspa-green font-semibold">2% Fee Model</p>
              <p className="text-[11px] text-gray-500 leading-relaxed mt-1">
                The 2% platform fee remains in the covenant pot and is redistributed per the
                SilverScript logic. This keeps the covenant self-sustaining.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Section B: Custom UI Integration ─── */}
      <section className={SECTION_BASE}>
        <div className={SECTION_HEADER}>
          <Code2 size={16} />
          Custom UI Integration
        </div>

        <div className="space-y-4">
          {/* Open Studio Button */}
          <button
            onClick={handleOpenStudio}
            className="w-full flex items-center justify-center gap-3 py-4 rounded-xl
              bg-gradient-to-r from-kaspa-green/10 to-kaspa-green/[0.02]
              border-2 border-dashed border-kaspa-green/30
              text-kaspa-green font-semibold text-sm
              hover:border-kaspa-green/60 hover:bg-kaspa-green/[0.08]
              hover:shadow-[0_0_25px_rgba(73,234,203,0.15)]
              active:scale-[0.98] transition-all group"
          >
            <div className="p-1.5 rounded-lg bg-kaspa-green/20 group-hover:bg-kaspa-green/30 transition-colors">
              <ExternalLink size={18} className="text-kaspa-green" />
            </div>
            <span>Open Covenant Studio</span>
            <span className="text-[10px] text-kaspa-green/60 font-mono px-2 py-0.5 rounded-md bg-kaspa-green/10 border border-kaspa-green/20">
              localhost:3001
            </span>
          </button>

          {/* Paste Area */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <p className={LABEL}>Custom UI Code (HTML / JS / CSS)</p>
              <span className="text-[10px] text-gray-600 font-mono">
                Paste from Covenant Studio
              </span>
            </div>
            <div className="relative">
              <textarea
                rows={8}
                value={customUICode}
                onChange={(e) => setCustomUICode(e.target.value)}
                placeholder={`<!-- Paste your generated UI code here -->\n<div class="covex-custom">\n  <!-- Covenant Studio output -->\n</div>`}
                className={`${TEXTAREA} font-mono text-xs leading-relaxed`}
                spellCheck={false}
              />
              {customUICode && (
                <div className="absolute top-2 right-2 flex items-center gap-1">
                  <span className="text-[10px] text-gray-600 font-mono">
                    {customUICode.split('\n').length} lines
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Preview Toggle + Apply */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowPreview(!showPreview)}
              disabled={!customUICode}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-semibold transition-all ${
                !customUICode
                  ? 'opacity-30 cursor-not-allowed border-white/[0.04] bg-black/20 text-gray-600'
                  : showPreview
                  ? 'border-kaspa-green/30 bg-kaspa-green/[0.04] text-kaspa-green'
                  : 'border-white/10 bg-black/20 text-gray-400 hover:text-white hover:border-white/20'
              }`}
            >
              {showPreview ? <EyeOff size={14} /> : <Eye size={14} />}
              {showPreview ? 'Hide Preview' : 'Preview UI'}
            </button>

            <button
              onClick={handleApplyCustomUI}
              disabled={!customUICode}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                !customUICode
                  ? 'opacity-30 cursor-not-allowed bg-kaspa-green/20 text-kaspa-green/40'
                  : 'bg-kaspa-green text-black hover:shadow-[0_0_15px_rgba(73,234,203,0.3)] active:scale-[0.97]'
              }`}
            >
              <Upload size={14} />
              Apply & Save Custom UI
            </button>
          </div>

          {/* Live Preview */}
          {showPreview && customUICode && (
            <div className="rounded-xl border border-kaspa-green/20 bg-black/50 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2 bg-black/40 border-b border-white/5">
                <div className="flex gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-500/60" />
                  <span className="h-2.5 w-2.5 rounded-full bg-yellow-500/60" />
                  <span className="h-2.5 w-2.5 rounded-full bg-green-500/60" />
                </div>
                <span className="text-[10px] text-gray-600 font-mono ml-2">Preview</span>
              </div>
              <div className="p-4">
                <iframe
                  srcDoc={customUICode}
                  title="Custom UI Preview"
                  className="w-full min-h-[300px] rounded-lg bg-white/[0.02] border border-white/5"
                  sandbox="allow-scripts"
                />
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ─── Section C: Outcome Resolution ─── */}
      <section className={SECTION_BASE}>
        <div className={SECTION_HEADER}>
          <Gavel size={16} />
          Outcome Resolution
        </div>

        <p className="text-xs text-gray-500 leading-relaxed">
          Choose how the covenant outcome is determined and enforced. This feeds into the
          SilverScript template generation.
        </p>

        <div className="space-y-3">
          {/* Covex Oracle */}
          <ResolutionCard
            icon={Shield}
            title="Covex Oracle (Default)"
            desc="Uses the built-in Covex Oracle with a pre-filled, audited verification key. Trustless resolution — the oracle signs outcomes cryptographically."
            selected={resolutionMode === 'oracle'}
            onClick={() => setResolutionMode('oracle')}
            accent="kaspa-green"
          />

          {/* Custom Oracle */}
          <ResolutionCard
            icon={Cpu}
            title="Custom Oracle"
            desc="Provide your own oracle public key. The covenant will verify against this key. Ideal for custom or third-party oracle services."
            selected={resolutionMode === 'custom'}
            onClick={() => setResolutionMode('custom')}
            accent="kaspa-gold"
          />

          {resolutionMode === 'custom' && (
            <div className="ml-14 space-y-1.5">
              <p className={LABEL}>Oracle Public Key</p>
              <input
                type="text"
                value={customOracleKey}
                onChange={(e) => setCustomOracleKey(e.target.value)}
                placeholder="kaspatest:q..."
                className={`${INPUT} font-mono text-xs`}
              />
            </div>
          )}

          {/* ZK Proof */}
          <ResolutionCard
            icon={Zap}
            title="ZK Proof (Zero-Knowledge)"
            desc="Use a zero-knowledge proof circuit to verify outcomes privately. Choose a pre-built circuit or provide your own verifier key."
            selected={resolutionMode === 'zk'}
            onClick={() => setResolutionMode('zk')}
            accent="purple"
          />

          {resolutionMode === 'zk' && (
            <div className="ml-14 space-y-3">
              <div className="space-y-1.5">
                <p className={LABEL}>ZK Circuit</p>
                <div className="relative">
                  <select
                    value={zkCircuit}
                    onChange={(e) => setZkCircuit(e.target.value)}
                    className={`${INPUT} appearance-none cursor-pointer`}
                  >
                    <option value="chess_verifier">Chess Verifier (built-in)</option>
                    <option value="poker_verifier">Poker Verifier (built-in)</option>
                    <option value="checkers_verifier">Checkers Verifier (built-in)</option>
                    <option value="connect4_verifier">Connect 4 Verifier (built-in)</option>
                    <option value="generic_verifier">Generic Verifier (custom)</option>
                  </select>
                  <ChevronDown
                    size={14}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <p className={LABEL}>Verifier Key (optional)</p>
                <input
                  type="text"
                  value={zkVerifierKey}
                  onChange={(e) => setZkVerifierKey(e.target.value)}
                  placeholder="0x... (leave blank for built-in)"
                  className={`${INPUT} font-mono text-xs`}
                />
              </div>

              <div className="flex items-start gap-3 p-3 rounded-xl bg-purple-500/[0.04] border border-purple-500/20">
                <AlertTriangle size={14} className="text-purple-400 shrink-0 mt-0.5" />
                <p className="text-[11px] text-purple-300/80 leading-relaxed">
                  ZK Proof resolution requires a valid circuit. Built-in circuits are audited and
                  ready to use. Custom circuits require manual review.
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ─── Section D: Action Bar ─── */}
      <section className="sticky bottom-0 z-30 bg-[#0A0A0D]/95 backdrop-blur-xl border border-white/[0.06] rounded-2xl p-4 flex items-center justify-between shadow-[0_-4px_20px_rgba(0,0,0,0.5)]">
        <div className="flex items-center gap-4">
          {/* Status Indicator */}
          {saveStatus === 'saved' && (
            <div className="flex items-center gap-2 text-emerald-400 text-sm">
              <CheckCircle2 size={16} />
              <span className="font-medium">All changes saved</span>
            </div>
          )}
          {saveStatus === 'saving' && (
            <div className="flex items-center gap-2 text-kaspa-green text-sm">
              <div className="w-4 h-4 border-2 border-kaspa-green border-t-transparent rounded-full animate-spin" />
              <span className="font-medium">Saving...</span>
            </div>
          )}
          {saveStatus === 'error' && (
            <div className="flex items-center gap-2 text-red-400 text-sm">
              <AlertTriangle size={16} />
              <span className="font-medium">Error saving. Try again.</span>
            </div>
          )}
          {saveStatus === 'idle' && (
            <div className="flex items-center gap-2 text-gray-600 text-sm">
              <div className="h-1.5 w-1.5 rounded-full bg-gray-700" />
              <span className="font-mono text-xs uppercase tracking-wider">Ready</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saveStatus === 'saving'}
            className="flex items-center gap-2 px-8 py-3 rounded-xl
              bg-kaspa-green text-black font-bold text-sm
              hover:shadow-[0_0_30px_rgba(73,234,203,0.4)]
              active:scale-[0.97] transition-all
              disabled:opacity-50 disabled:cursor-not-allowed
              uppercase tracking-wider"
          >
            <Save size={16} />
            {saveStatus === 'saving' ? 'Saving...' : 'Save All Changes'}
          </button>
        </div>
      </section>
    </div>
  );
}
