import { useMemo, useState } from 'react';
import { Palette, TerminalSquare, Check, Shuffle } from 'lucide-react';
import { getPresets, presetToTheme, presetBackdrop, validateDesignCode, PALETTES, LAYOUTS, MOODS } from '../lib/designPresets';

/**
 * The covenant page design studio: a 240-preset visual gallery plus a code
 * terminal for designers who prefer typing their theme as JSON. Both paths
 * produce the same theme config the covenant page renders.
 */
export default function DesignStudio({ currentTheme, onApply }) {
  const [mode, setMode] = useState('gallery');
  const [palette, setPalette] = useState('all');
  const [layout, setLayout] = useState('all');
  const [mood, setMood] = useState('all');
  const [applied, setApplied] = useState(currentTheme?.preset || null);
  const [code, setCode] = useState(() => JSON.stringify({
    accent: currentTheme?.accent || '#49EACB',
    layout: currentTheme?.layout || 'glass',
    mood: currentTheme?.mood || 'dark',
    background_image: currentTheme?.background_image || null,
  }, null, 2));
  const [codeErrors, setCodeErrors] = useState([]);
  const [codeOk, setCodeOk] = useState(false);

  const presets = useMemo(() => getPresets().filter((p) =>
    (palette === 'all' || p.palette.id === palette) &&
    (layout === 'all' || p.layout.id === layout) &&
    (mood === 'all' || p.mood.id === mood)
  ), [palette, layout, mood]);

  const applyPreset = (p) => {
    setApplied(p.id);
    onApply(presetToTheme(p));
  };

  const surprise = () => {
    const all = getPresets();
    applyPreset(all[Math.floor(Math.random() * all.length)]);
  };

  const applyCode = () => {
    setCodeOk(false);
    let obj;
    try { obj = JSON.parse(code); } catch (e) { setCodeErrors([`Invalid JSON: ${e.message}`]); return; }
    const [ok, res] = validateDesignCode(obj);
    if (!ok) { setCodeErrors(res); return; }
    setCodeErrors([]);
    setCodeOk(true);
    setApplied(null);
    onApply({ ...res, preset: 'custom-code' });
    setTimeout(() => setCodeOk(false), 2000);
  };

  const Filter = ({ value, set, items, label }) => (
    <select value={value} onChange={(e) => set(e.target.value)}
      className="px-2 py-1.5 rounded-lg bg-black/40 border border-white/10 text-[11px] text-gray-300 outline-none">
      <option value="all">All {label}</option>
      {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
    </select>
  );

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
        <div className="text-[10px] uppercase tracking-widest text-gray-500">
          Design Studio · {getPresets().length} premade designs
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setMode('gallery')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 border transition-all ${mode === 'gallery' ? 'border-[#49EACB] text-[#49EACB] bg-[#49EACB]/10' : 'border-white/10 text-gray-400 hover:text-white'}`}>
            <Palette size={11} /> Gallery
          </button>
          <button onClick={() => setMode('code')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 border transition-all ${mode === 'code' ? 'border-[#49EACB] text-[#49EACB] bg-[#49EACB]/10' : 'border-white/10 text-gray-400 hover:text-white'}`}>
            <TerminalSquare size={11} /> Design Code
          </button>
        </div>
      </div>

      {mode === 'gallery' ? (
        <>
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <Filter value={palette} set={setPalette} items={PALETTES} label="palettes" />
            <Filter value={layout} set={setLayout} items={LAYOUTS} label="layouts" />
            <Filter value={mood} set={setMood} items={MOODS} label="moods" />
            <button onClick={surprise} className="px-2.5 py-1.5 rounded-lg border border-white/10 text-[11px] text-gray-300 hover:border-[#49EACB]/40 flex items-center gap-1">
              <Shuffle size={11} /> Surprise me
            </button>
            <span className="text-[10px] text-gray-500 ml-auto">{presets.length} shown</span>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 max-h-72 overflow-y-auto pr-1">
            {presets.map((p) => (
              <button key={p.id} onClick={() => applyPreset(p)} title={`${p.name}: ${p.layout.desc}`}
                className={`relative h-20 rounded-xl border overflow-hidden text-left transition-all hover:scale-[1.03] ${applied === p.id ? 'border-[#49EACB] shadow-[0_0_12px_rgba(73,234,203,0.35)]' : 'border-white/10 hover:border-white/25'}`}
                style={{ background: presetBackdrop(p) }}>
                <span className="absolute top-1.5 left-2 w-5 h-1.5 rounded-full" style={{ backgroundColor: p.palette.accent }} />
                <span className="absolute bottom-1.5 left-2 right-2 text-[9px] font-semibold text-white/85 truncate">{p.name}</span>
                <span className="absolute top-1 right-1.5 text-[8px] font-mono text-white/40">{p.layout.id}</span>
                {applied === p.id && <Check size={12} className="absolute top-1.5 right-1.5 text-[#49EACB]" />}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div>
          <p className="text-[11px] text-gray-400 mb-2">
            Type your design as JSON and apply. Keys: accent, glow, base (hex colors), layout ({LAYOUTS.map((l) => l.id).join(' | ')}), mood ({MOODS.map((m) => m.id).join(' | ')}), background_image (https URL or data URI).
          </p>
          <textarea value={code} onChange={(e) => setCode(e.target.value)} spellCheck={false} rows={8}
            className="w-full px-3 py-2.5 rounded-xl bg-black/60 border border-white/10 text-[12px] font-mono text-emerald-200 outline-none focus:border-[#49EACB]/50 resize-y" />
          {codeErrors.length > 0 && (
            <div className="mt-2 p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-[11px] space-y-0.5">
              {codeErrors.map((e, i) => <div key={i}>{e}</div>)}
            </div>
          )}
          <button onClick={applyCode}
            className="mt-2 px-4 py-2 rounded-xl bg-[#49EACB] text-black text-sm font-bold hover:brightness-110 transition-all flex items-center gap-1.5">
            {codeOk ? <><Check size={14} /> Applied</> : 'Apply design code'}
          </button>
        </div>
      )}
    </div>
  );
}
