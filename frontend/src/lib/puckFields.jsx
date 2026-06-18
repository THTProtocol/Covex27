/**
 * Custom Puck fields for the covenant Studio: a premium color picker and a
 * searchable lucide icon picker. Both are Puck `type: 'custom'` fields, so they
 * store ONLY a plain string (a validated hex color, or a lucide icon name) in the
 * page JSON. No raw HTML, markup, or destination is ever stored or forwarded.
 *
 * Light + dark + mobile aware: fields use the app's theme tokens and stay usable
 * at 375px. The icon picker renders lucide via its named exports, so a stored name
 * resolves to a real React component at render time (see IconByName in puckConfig).
 */
import * as React from 'react';
import { HexColorPicker } from 'react-colorful';
import * as Lucide from 'lucide-react';
import { SAFE_COLOR } from './puckConfig.jsx';

// A compact, curated palette of brand + common accents for one-click choice.
const SWATCHES = ['#49EACB', '#E8AF34', '#A855F7', '#3B82F6', '#F472B6', '#22C55E', '#EF4444', '#22D3EE', '#FB923C', '#FFFFFF'];

/**
 * ColorField: react-colorful picker + a SAFE_COLOR-validated text input fallback.
 * Stores the validated string. The text input is the source of truth for paste /
 * manual entry; the picker and swatches write through it. Invalid text is shown as
 * typed but the committed value is always SAFE_COLOR-guarded.
 */
export function ColorField({ onChange, value, field }) {
  const safe = SAFE_COLOR(value, '#49EACB');
  const [open, setOpen] = React.useState(false);
  return (
    <div className="cvx-field">
      {field?.label && <label className="cvx-field-label">{field.label}</label>}
      <div className="cvx-color-row">
        <button
          type="button"
          aria-label="Toggle color picker"
          className="cvx-color-swatch-btn"
          style={{ background: safe }}
          onClick={() => setOpen((o) => !o)}
        />
        <input
          type="text"
          className="cvx-color-input"
          value={value ?? ''}
          spellCheck={false}
          placeholder="#49EACB"
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
      {open && (
        <div className="cvx-color-pop">
          <HexColorPicker color={safe} onChange={(c) => onChange(c)} />
          <div className="cvx-swatches">
            {SWATCHES.map((s) => (
              <button
                key={s}
                type="button"
                aria-label={`Pick ${s}`}
                className="cvx-swatch"
                style={{ background: s }}
                onClick={() => onChange(s)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Build a stable list of PascalCase lucide icon names once. Lucide also exports
// helpers / aliases (icons, createLucideIcon, Icon, *Icon suffixed duplicates,
// LucideX aliases); filter to clean component names so the grid is real, pickable
// icons only.
const NON_ICON = new Set(['Icon', 'createLucideIcon']);
let _iconNames = null;
function iconNames() {
  if (_iconNames) return _iconNames;
  _iconNames = Object.keys(Lucide)
    .filter((k) =>
      /^[A-Z][a-zA-Z0-9]*$/.test(k)
      && !NON_ICON.has(k)
      && !k.endsWith('Icon')      // drop the *Icon-suffixed duplicates
      && !k.startsWith('Lucide')  // drop the Lucide* aliases
      && (typeof Lucide[k] === 'function' || (Lucide[k] && typeof Lucide[k] === 'object')))
    .sort();
  return _iconNames;
}

/** Resolve a stored icon name to a lucide component (or null). Shared with render. */
export function lucideByName(name) {
  if (!name || typeof name !== 'string') return null;
  const C = Lucide[name];
  return typeof C === 'function' || (C && typeof C === 'object' && C.$$typeof) ? C : null;
}

/**
 * IconPicker: a searchable grid of lucide icons. Stores the icon NAME string.
 * Includes a "None" option (empty string) so a creator can clear it.
 */
export function IconPicker({ onChange, value, field }) {
  const [q, setQ] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const all = iconNames();
  const filtered = React.useMemo(() => {
    const t = q.trim().toLowerCase();
    const base = t ? all.filter((n) => n.toLowerCase().includes(t)) : all;
    return base.slice(0, 120);
  }, [q, all]);
  const Current = lucideByName(value);
  return (
    <div className="cvx-field">
      {field?.label && <label className="cvx-field-label">{field.label}</label>}
      <button type="button" className="cvx-icon-current" onClick={() => setOpen((o) => !o)}>
        {Current ? <Current size={16} /> : <span className="cvx-icon-none">None</span>}
        <span className="cvx-icon-name">{value || 'Choose icon'}</span>
      </button>
      {open && (
        <div className="cvx-icon-pop">
          <input
            type="text"
            className="cvx-color-input"
            placeholder="Search icons..."
            value={q}
            spellCheck={false}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
          <div className="cvx-icon-grid">
            <button type="button" className="cvx-icon-cell" title="None" onClick={() => { onChange(''); setOpen(false); }}>
              <span className="cvx-icon-none">∅</span>
            </button>
            {filtered.map((n) => {
              const C = Lucide[n];
              return (
                <button key={n} type="button" className="cvx-icon-cell" title={n} onClick={() => { onChange(n); setOpen(false); }}>
                  {C ? <C size={18} /> : null}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// Factory helpers so puckConfig can declare these inline as `type: 'custom'` fields.
export const colorField = (label) => ({
  type: 'custom',
  label,
  render: ({ onChange, value, field }) => <ColorField onChange={onChange} value={value} field={{ ...field, label }} />,
});

export const iconField = (label) => ({
  type: 'custom',
  label,
  render: ({ onChange, value, field }) => <IconPicker onChange={onChange} value={value} field={{ ...field, label }} />,
});
