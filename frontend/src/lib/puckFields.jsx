/* eslint-disable react-refresh/only-export-components -- this module intentionally co-exports its component(s) with related constants/hooks/helpers (e.g. a Provider plus its useX hook). That only affects dev Fast Refresh granularity, never the production build or tests; splitting these into separate files is not warranted here. */
/**
 * Custom Puck fields for the covenant Studio: a premium color picker, a
 * searchable lucide icon picker, and an image control that takes either an https
 * URL or a locally-uploaded file. All are Puck `type: 'custom'` fields, so they
 * store ONLY a plain string (a validated hex color, a lucide icon name, or an
 * https/data:image URI) in the page JSON. No raw HTML, markup, or destination is
 * ever stored or forwarded.
 *
 * Light + dark + mobile aware: fields use the app's theme tokens and stay usable
 * at 375px. The icon picker loads the lucide barrel LAZILY (see ./lucideLazy.jsx),
 * so a stored name resolves to a real React component once that chunk arrives. The
 * barrel (~154KB gzip) is never on the homepage critical path; it is fetched only
 * when the IconPicker mounts or a creator icon first renders.
 *
 * The image upload is frontend-only: a chosen file is read with FileReader to a
 * `data:image/*` URI (no backend, no network). Non-image files and anything over
 * ~900KB are rejected (same cap as designPresets.validateDesignCode), so a page
 * never carries an oversized payload. The existing https text input stays as the
 * source of truth / fallback, and puckConfig's isHttpsImg already accepts both.
 */
import * as React from 'react';
import { HexColorPicker } from 'react-colorful';
import { SAFE_COLOR } from './puckConfig.jsx';
import { iconNamesAsync, lucideByNameSync, DynamicLucideIcon } from './lucideLazy.jsx';

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

/**
 * Resolve a stored icon name to a lucide component, pulling from the lazily-loaded
 * barrel if it is ALREADY in memory, else null. Kept as a named export for any
 * non-render caller; it degrades gracefully (returns null) before the lazy load
 * resolves rather than forcing the 154KB barrel onto the critical path. Render
 * paths use DynamicLucideIcon (from lucideLazy) instead, which loads + repaints.
 */
export function lucideByName(name) {
  return lucideByNameSync(name);
}

/**
 * IconPicker: a searchable grid of lucide icons. Stores the icon NAME string.
 * Includes a "None" option (empty string) so a creator can clear it.
 */
export function IconPicker({ onChange, value, field }) {
  const [q, setQ] = React.useState('');
  const [open, setOpen] = React.useState(false);
  // The full icon-name catalog loads lazily with the lucide barrel. We populate it
  // on first mount; until it resolves the grid shows a brief loading state. The
  // catalog still covers ALL ~1960 pickable icons, so no icon choice is lost.
  const [all, setAll] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  React.useEffect(() => {
    let live = true;
    iconNamesAsync().then((names) => { if (live) { setAll(names); setLoading(false); } });
    return () => { live = false; };
  }, []);
  const filtered = React.useMemo(() => {
    const t = q.trim().toLowerCase();
    const base = t ? all.filter((n) => n.toLowerCase().includes(t)) : all;
    return base.slice(0, 120);
  }, [q, all]);
  return (
    <div className="cvx-field">
      {field?.label && <label className="cvx-field-label">{field.label}</label>}
      <button type="button" className="cvx-icon-current" onClick={() => setOpen((o) => !o)}>
        {value
          ? <DynamicLucideIcon name={value} size={16} />
          : <span className="cvx-icon-none">None</span>}
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
            {loading
              ? <span className="cvx-icon-none" style={{ gridColumn: '1 / -1', padding: '8px 4px' }}>Loading icons...</span>
              : filtered.map((n) => (
                <button key={n} type="button" className="cvx-icon-cell" title={n} onClick={() => { onChange(n); setOpen(false); }}>
                  <DynamicLucideIcon name={n} size={18} />
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Max stored image payload, matching designPresets.validateDesignCode's ~900KB cap.
// A data:base64 URI is ~33% larger than the raw bytes, so this keeps a page's JSON
// reasonable and prevents an oversized upload from bloating the document.
const MAX_IMAGE_BYTES = 900 * 1024;

// One-time injected styles for the upload control. We keep them here (not in the
// shared covexPuck.css) so the control is self-contained; they reuse the same
// --puck-color-* tokens as ColorField/IconPicker, so dark + light + mobile all
// match the rest of the Studio sidebar. Injected once, guarded by an id.
const IMG_FIELD_STYLE_ID = 'cvx-img-field-styles';
function ensureImageFieldStyles() {
  if (typeof document === 'undefined' || document.getElementById(IMG_FIELD_STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = IMG_FIELD_STYLE_ID;
  el.textContent = `
    .cvx-img-row { display: flex; align-items: center; gap: 8px; }
    .cvx-img-file { display: none; }
    .cvx-img-upload-btn {
      display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0;
      height: 34px; padding: 0 12px; border-radius: 9px;
      border: 1px solid var(--puck-color-grey-09, #e2e8f0);
      background: var(--puck-color-grey-11, #f1f5f9);
      color: var(--puck-color-grey-03, #334155);
      font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap;
      transition: border-color .15s, background .15s, color .15s;
    }
    .cvx-img-upload-btn:hover:not(:disabled) { border-color: #49EACB; background: rgba(73,234,203,0.1); color: #0d9488; }
    .cvx-img-upload-btn:disabled { opacity: .6; cursor: default; }
    .cvx-img-spin { animation: cvx-img-spin .8s linear infinite; }
    @keyframes cvx-img-spin { to { transform: rotate(360deg); } }
    .cvx-img-preview {
      display: flex; align-items: center; gap: 8px; margin-top: 8px; padding: 6px 8px;
      border-radius: 10px; border: 1px solid var(--puck-color-grey-09, #e2e8f0);
      background: var(--puck-color-white, #fff);
    }
    .cvx-img-thumb {
      width: 40px; height: 40px; flex-shrink: 0; object-fit: cover; border-radius: 7px;
      border: 1px solid var(--puck-color-grey-09, #e2e8f0); background: var(--puck-color-grey-11, #f1f5f9);
    }
    .cvx-img-meta { flex: 1; min-width: 0; font-size: 12px; color: var(--puck-color-grey-05, #64748b); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .cvx-img-clear {
      display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
      width: 26px; height: 26px; border-radius: 7px; border: 1px solid transparent;
      background: transparent; color: var(--puck-color-grey-06, #94a3b8); cursor: pointer;
    }
    .cvx-img-clear:hover { border-color: #ef4444; background: rgba(239,68,68,0.1); color: #ef4444; }
    .cvx-img-err { margin: 6px 0 0; font-size: 12px; line-height: 1.4; color: #ef4444; }
    .cvx-img-hint { margin-top: 6px; font-size: 11px; line-height: 1.4; color: var(--puck-color-grey-06, #94a3b8); }
    @media (max-width: 640px) {
      .cvx-img-upload-btn span { display: none; }
      .cvx-img-upload-btn { padding: 0 10px; }
    }
  `;
  document.head.appendChild(el);
}

const prettyBytes = (n) => (n >= 1024 * 1024 ? `${(n / (1024 * 1024)).toFixed(1)}MB` : `${Math.round(n / 1024)}KB`);

/**
 * ImageUploadField: an https URL text input (the source of truth / fallback) PLUS
 * an "Upload" button that reads a chosen file into a `data:image/*` URI via
 * FileReader. Frontend-only: no network, no backend endpoint. The control stores a
 * plain string in either case, and puckConfig.isHttpsImg accepts https:// and
 * data:image/ alike. Non-image MIME types and files over ~900KB are rejected with
 * an inline message; the existing value is left untouched on rejection.
 */
export function ImageUploadField({ onChange, value, field }) {
  const inputRef = React.useRef(null);
  const [err, setErr] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { ensureImageFieldStyles(); }, []);
  const placeholder = field?.placeholder || 'https://...';
  const isData = typeof value === 'string' && value.startsWith('data:image/');
  const isHttps = typeof value === 'string' && value.startsWith('https://');
  const hasPreview = isData || isHttps;

  const handleFile = (file) => {
    setErr('');
    if (!file) return;
    if (!file.type || !file.type.startsWith('image/')) {
      setErr('That is not an image file. Pick a PNG, JPG, GIF, SVG or WebP.');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setErr(`Image is too large (${prettyBytes(file.size)}). Max is ~900KB - resize or compress it first.`);
      return;
    }
    setBusy(true);
    const reader = new FileReader();
    reader.onerror = () => { setBusy(false); setErr('Could not read that file. Try another image.'); };
    reader.onload = () => {
      setBusy(false);
      const uri = typeof reader.result === 'string' ? reader.result : '';
      // Guard the decoded result too: confirm it is an image data URI and that the
      // encoded string did not balloon past the cap.
      if (!uri.startsWith('data:image/')) { setErr('That file did not decode as an image.'); return; }
      if (uri.length > MAX_IMAGE_BYTES * 1.4) { setErr('Encoded image is too large (max ~900KB). Compress it first.'); return; }
      onChange(uri);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="cvx-field">
      {field?.label && <label className="cvx-field-label">{field.label}</label>}
      <div className="cvx-img-row">
        <input
          type="text"
          className="cvx-color-input"
          value={isData ? '' : (value ?? '')}
          spellCheck={false}
          placeholder={isData ? 'Uploaded image attached' : placeholder}
          disabled={isData}
          onChange={(e) => { setErr(''); onChange(e.target.value); }}
        />
        <button
          type="button"
          className="cvx-img-upload-btn"
          onClick={() => inputRef.current && inputRef.current.click()}
          disabled={busy}
          aria-label="Upload an image from your device"
        >
          {busy ? <DynamicLucideIcon name="Loader2" size={14} className="cvx-img-spin" /> : <DynamicLucideIcon name="Upload" size={14} />}
          <span>{busy ? 'Reading' : 'Upload'}</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="cvx-img-file"
          onChange={(e) => { const f = e.target.files && e.target.files[0]; handleFile(f); e.target.value = ''; }}
        />
      </div>
      {hasPreview && (
        <div className="cvx-img-preview">
          <img src={value} alt="" className="cvx-img-thumb" loading="lazy" decoding="async" />
          <span className="cvx-img-meta">{isData ? 'Uploaded image (stored in this page)' : 'Linked image'}</span>
          <button type="button" className="cvx-img-clear" onClick={() => { setErr(''); onChange(''); }} aria-label="Remove image">
            <DynamicLucideIcon name="X" size={13} />
          </button>
        </div>
      )}
      {err && <p className="cvx-img-err">{err}</p>}
      <span className="cvx-img-hint">Paste an https link, or upload a file (max ~900KB, kept in this page only).</span>
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

// imageField(label): an https-or-upload image control. `placeholder` is optional
// helper text shown in the URL input.
export const imageField = (label, placeholder) => ({
  type: 'custom',
  label,
  render: ({ onChange, value, field }) => <ImageUploadField onChange={onChange} value={value} field={{ ...field, label, placeholder }} />,
});
