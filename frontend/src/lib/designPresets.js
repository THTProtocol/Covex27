/**
 * Procedural design preset engine: 16 palettes x 5 layouts x 3 moods = 240
 * deterministic, named covenant page designs. Every preset maps to the same
 * theme config shape the wizard, FIX LOOKS and the covenant page already use,
 * so applying one is instant and previews are pure CSS (no images needed).
 */

export const PALETTES = [
  { id: 'kaspa', name: 'Kaspa', accent: '#49EACB', glow: '#49EACB', base: '#05050A' },
  { id: 'aurora', name: 'Aurora', accent: '#22D3EE', glow: '#A78BFA', base: '#070B14' },
  { id: 'ember', name: 'Ember', accent: '#F97316', glow: '#EF4444', base: '#0C0604' },
  { id: 'royal', name: 'Royal', accent: '#A855F7', glow: '#6366F1', base: '#0A0612' },
  { id: 'gold', name: 'Gold', accent: '#E8AF34', glow: '#F59E0B', base: '#0B0903' },
  { id: 'rose', name: 'Rose', accent: '#EC4899', glow: '#F43F5E', base: '#10060B' },
  { id: 'ocean', name: 'Ocean', accent: '#3B82F6', glow: '#06B6D4', base: '#04080F' },
  { id: 'forest', name: 'Forest', accent: '#22C55E', glow: '#84CC16', base: '#040A06' },
  { id: 'crimson', name: 'Crimson', accent: '#EF4444', glow: '#B91C1C', base: '#0E0404' },
  { id: 'arctic', name: 'Arctic', accent: '#E2E8F0', glow: '#94A3B8', base: '#0A0D12' },
  { id: 'neon', name: 'Neon', accent: '#A3E635', glow: '#22D3EE', base: '#060906' },
  { id: 'dusk', name: 'Dusk', accent: '#FB923C', glow: '#C084FC', base: '#0B0710' },
  { id: 'mint', name: 'Mint', accent: '#2DD4BF', glow: '#34D399', base: '#040B0A' },
  { id: 'magma', name: 'Magma', accent: '#FB7185', glow: '#F97316', base: '#0F0505' },
  { id: 'cobalt', name: 'Cobalt', accent: '#60A5FA', glow: '#818CF8', base: '#05070F' },
  { id: 'sand', name: 'Sand', accent: '#FDE68A', glow: '#FBBF24', base: '#0C0A05' },
];

export const LAYOUTS = [
  { id: 'glass', name: 'Glass', desc: 'Frosted panels with soft borders' },
  { id: 'card', name: 'Card', desc: 'Solid elevated cards, crisp edges' },
  { id: 'hero', name: 'Hero', desc: 'Large banner header, bold title' },
  { id: 'terminal', name: 'Terminal', desc: 'Monospace, scanline aesthetics' },
  { id: 'arena', name: 'Arena', desc: 'Game-first layout, stats up top' },
];

export const MOODS = [
  { id: 'dark', name: 'Dark', overlay: 0.85 },
  { id: 'vivid', name: 'Vivid', overlay: 0.65 },
  { id: 'minimal', name: 'Minimal', overlay: 0.92 },
];

/** Deterministic CSS gradient backdrop for a preset (no image assets needed). */
export function presetBackdrop(p) {
  const { palette, mood } = p;
  if (mood.id === 'minimal') {
    return `linear-gradient(180deg, ${palette.base} 0%, ${palette.base} 70%, ${palette.accent}14 100%)`;
  }
  if (mood.id === 'vivid') {
    return `radial-gradient(ellipse at 20% 0%, ${palette.accent}33 0%, transparent 50%), radial-gradient(ellipse at 80% 100%, ${palette.glow}2E 0%, transparent 55%), linear-gradient(180deg, ${palette.base} 0%, #030308 100%)`;
  }
  return `radial-gradient(ellipse at 50% -10%, ${palette.accent}1F 0%, transparent 60%), linear-gradient(180deg, ${palette.base} 0%, #030306 100%)`;
}

let _cache = null;
/** All 240 presets, generated once. */
export function getPresets() {
  if (_cache) return _cache;
  const out = [];
  for (const palette of PALETTES) {
    for (const layout of LAYOUTS) {
      for (const mood of MOODS) {
        out.push({
          id: `${palette.id}-${layout.id}-${mood.id}`,
          name: `${palette.name} ${layout.name}${mood.id === 'dark' ? '' : ' ' + mood.name}`,
          palette,
          layout,
          mood,
        });
      }
    }
  }
  _cache = out;
  return out;
}

/** Map a preset to the theme config persisted with the covenant. */
export function presetToTheme(p) {
  return {
    accent: p.palette.accent,
    glow: p.palette.glow,
    base: p.palette.base,
    preset: p.id,
    layout: p.layout.id,
    mood: p.mood.id,
    backdrop_css: presetBackdrop(p),
  };
}

/** Validate a design-code JSON object typed in the terminal. Returns [ok, errorsOrTheme]. */
export function validateDesignCode(obj) {
  const errors = [];
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    return [false, ['Design code must be a JSON object.']];
  }
  const hex = /^#[0-9a-fA-F]{6}$/;
  for (const k of ['accent', 'glow', 'base']) {
    if (obj[k] !== undefined && !hex.test(obj[k])) errors.push(`"${k}" must be a hex color like #49EACB.`);
  }
  if (obj.layout !== undefined && !LAYOUTS.some((l) => l.id === obj.layout)) {
    errors.push(`"layout" must be one of: ${LAYOUTS.map((l) => l.id).join(', ')}.`);
  }
  if (obj.mood !== undefined && !MOODS.some((m) => m.id === obj.mood)) {
    errors.push(`"mood" must be one of: ${MOODS.map((m) => m.id).join(', ')}.`);
  }
  if (obj.background_image !== undefined && obj.background_image !== null) {
    const v = String(obj.background_image);
    if (!v.startsWith('https://') && !v.startsWith('data:image/')) {
      errors.push('"background_image" must be an https URL or a data:image URI.');
    }
    if (v.length > 900 * 1024) errors.push('"background_image" is too large (max ~900KB).');
  }
  if (errors.length) return [false, errors];
  return [true, obj];
}
