/* eslint-disable react-refresh/only-export-components -- this module intentionally co-exports a small component (DynamicLucideIcon) alongside the lazy-load helpers it depends on; that only affects dev Fast Refresh granularity, never the production build or tests. */
/**
 * Lazy lucide loader. The full lucide-react barrel is ~617KB raw / ~154KB gzip and
 * is only ever needed by the covenant Studio's searchable IconPicker and by the
 * render-time resolution of a creator-chosen icon name. Statically importing the
 * barrel (`import * as Lucide`) anywhere in the entry graph drags the whole 154KB
 * onto the HOMEPAGE critical path (it gets modulepreloaded in index.html).
 *
 * This module is the ONLY place that touches the barrel, and it does so via a
 * cached dynamic `import('lucide-react')`. Because nothing in the static import
 * graph references the barrel, the bundler emits lucide-react as a chunk reachable
 * ONLY through this dynamic import, so it is NOT in the entry preload. It loads the
 * first time the IconPicker mounts or the first time a creator icon needs to render.
 *
 * Resolution is honest about timing:
 *  - lucideByNameSync(name): returns the icon component if the barrel is ALREADY
 *    loaded, else null. Safe for synchronous/SSR callers (they degrade to null).
 *  - DynamicLucideIcon: a React component that renders null (or an emoji fallback)
 *    until the barrel resolves, then re-renders the real icon. This is what render
 *    paths use so a creator never loses their icon choice.
 *  - loadLucide(): the cached promise; await it to populate the catalog (used by
 *    the IconPicker to list all ~1960 icon names once).
 */
import * as React from 'react';

// Cached module + the resolved catalog of pickable icon names. `_mod` is set once
// the dynamic import resolves; `_loading` dedupes concurrent loads.
let _mod = null;
let _loading = null;

// Subscribers re-rendered when the barrel finishes loading, so any mounted
// DynamicLucideIcon / IconPicker repaints with real icons without prop changes.
const _subs = new Set();
function _notify() {
  for (const fn of _subs) {
    try { fn(); } catch { /* a dead subscriber must not block the rest */ }
  }
}

/** The cached dynamic import of the lucide barrel. Resolves to the module. */
export function loadLucide() {
  if (_mod) return Promise.resolve(_mod);
  if (_loading) return _loading;
  _loading = import('lucide-react').then((m) => {
    _mod = m;
    _notify();
    return m;
  });
  return _loading;
}

/** True once the barrel is in memory (so a sync caller can resolve names). */
export function isLucideLoaded() {
  return _mod != null;
}

// Lucide also exports helpers / aliases (icons, createLucideIcon, Icon, *Icon
// suffixed duplicates, Lucide* aliases); filter to clean component names so the
// grid is real, pickable icons only. Same predicate the old iconNames() used.
const NON_ICON = new Set(['Icon', 'createLucideIcon']);
let _iconNames = null;
function buildIconNames(mod) {
  return Object.keys(mod)
    .filter((k) =>
      /^[A-Z][a-zA-Z0-9]*$/.test(k)
      && !NON_ICON.has(k)
      && !k.endsWith('Icon')      // drop the *Icon-suffixed duplicates
      && !k.startsWith('Lucide')  // drop the Lucide* aliases
      && (typeof mod[k] === 'function' || (mod[k] && typeof mod[k] === 'object')))
    .sort();
}

/**
 * Ensure the barrel is loaded and return the full, sorted list of pickable icon
 * names. Async: callers (the IconPicker) await it and show a brief loading state
 * on first open. Cached after the first build so subsequent calls are instant.
 */
export async function iconNamesAsync() {
  if (_iconNames) return _iconNames;
  const mod = await loadLucide();
  _iconNames = buildIconNames(mod);
  return _iconNames;
}

/**
 * Resolve a stored icon name to a lucide component IF the barrel is already loaded,
 * else null. Synchronous and SSR-safe: a non-render caller (or a render before the
 * lazy load resolves) degrades gracefully to null instead of forcing the barrel.
 */
export function lucideByNameSync(name) {
  if (!_mod || !name || typeof name !== 'string') return null;
  const C = _mod[name];
  return typeof C === 'function' || (C && typeof C === 'object' && C.$$typeof) ? C : null;
}

/**
 * DynamicLucideIcon: renders the lucide icon for `name` once the barrel has loaded.
 * Triggers the lazy load on mount and re-renders when it resolves, so a creator's
 * chosen icon always appears on the live covenant page. Before the barrel loads (or
 * during SSR) it renders the optional `emoji` fallback, else null. Never forces the
 * barrel onto the static graph - it is only reached through loadLucide()'s import().
 */
export function DynamicLucideIcon({ name, emoji, size = 22, className, ...rest }) {
  // A cheap re-render tick: bumps when the barrel finishes loading.
  const [, force] = React.useReducer((c) => c + 1, 0);
  React.useEffect(() => {
    if (_mod) return undefined;        // already loaded: nothing to wait for
    _subs.add(force);
    loadLucide();                      // idempotent: dedupes via _loading
    return () => { _subs.delete(force); };
  }, []);
  const C = lucideByNameSync(name);
  // eslint-disable-next-line react-hooks/static-components -- dynamic icon render: the capitalized binding is a stateless lucide icon resolved from a fixed name-to-component map, not a component created in render, so there is no state to reset
  if (C) return <C size={size} className={className} aria-hidden="true" {...rest} />;
  if (emoji && typeof emoji === 'string') return <span className={className} aria-hidden="true">{emoji}</span>;
  return null;
}
