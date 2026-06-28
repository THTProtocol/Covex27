import { useState, useEffect, useRef, useCallback } from 'react';
import { useTheme } from './ThemeProvider';

/**
 * Live Kaspa DAG visualizer (kgi.kaspad.net) as the page backdrop.
 *
 * RELIABILITY / FLICKER FIX
 * -------------------------
 * The external WebGL visualizer pauses its render loop when the tab is
 * backgrounded and can drop its feed / lose the GL context after long runtime,
 * leaving a blank frame that never recovers on its own (the iframe `onLoad` is
 * one-shot). The previous implementation reconnected by remounting the VISIBLE
 * iframe, which blanked the whole backdrop for a beat on every reconnect and on
 * every periodic 4-minute refresh - the visible "flicker / disconnect / vanish".
 *
 * Reconnects are now DOUBLE-BUFFERED. A reconnect pushes a NEW iframe layer that
 * loads underneath/over the still-visible one; we only cross-fade to it once it
 * has actually painted (its `onLoad` fires). The previous frame is pruned a fade
 * later. So the backdrop is never blank during a reconnect or a theme switch -
 * the last good frame (or the themed gradient placeholder) always covers the gap.
 *
 * The live external feed is preserved (sandboxed to contain its Pixi/console
 * noise); only the reconnect mechanics changed.
 */
const REFRESH_MS = 6 * 60 * 1000;   // seamless periodic reconnect during prolonged visible use
const HIDDEN_RECONNECT_MS = 8_000;  // only reconnect if the tab was hidden longer than this
const LOAD_TIMEOUT_MS = 14_000;     // a pending layer that never paints is dropped (the old one stays)
const MAX_RETRIES = 2;              // bound rapid retries when the service is down
const FADE_MS = 700;                // cross-fade duration; also the prune delay
// Render the live DAG ~5% smaller (display the same frame at 0.95) so a touch
// more of the BlockDAG - more blocks - is visible through the viewport. Scaling
// the displayed frame (not the iframe container) keeps the external visualizer
// rendering the same node count; we just see a little more of it.
const DAG_SCALE = 0.95;

const SRC = {
  dark: 'https://kgi.kaspad.net/?theme=dark',
  light: 'https://kgi.kaspad.net/?theme=light',
};
// Per-theme blend so the DAG strokes sit INTO the page (screen on black, multiply
// on white) rather than floating flat on top - the cohesion the brief asks for.
const THEME_OPACITY = { dark: 0.3, light: 0.34 };
const THEME_BLEND = { dark: 'screen', light: 'multiply' };

let _seq = 0;
const makeLayer = (theme) => ({ id: ++_seq, theme, loaded: false });

const DagBackground = () => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  // A small stack of iframe layers, newest last. A layer becomes "live" once it
  // paints; the newest live layer for the active theme is the one shown. Older
  // same-theme layers (and opposite-theme layers) fade out and are pruned. The
  // previously-painted frame stays up until the replacement paints -> no blank.
  const [layers, setLayers] = useState(() => [makeLayer(theme)]);
  const retriesRef = useRef(0);

  // Mark a layer painted; it becomes (or stays) the newest live layer for its theme.
  const handleLoad = useCallback((id) => {
    retriesRef.current = 0;
    setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, loaded: true } : l)));
  }, []);

  // Push a fresh layer for the CURRENT theme - unless a reconnect is already in
  // flight (the newest same-theme layer hasn't painted yet) so they never pile up.
  const reconnect = useCallback(() => {
    setLayers((prev) => {
      const sameTheme = prev.filter((l) => l.theme === theme);
      const newest = sameTheme[sameTheme.length - 1];
      if (newest && !newest.loaded) return prev; // already reconnecting
      retriesRef.current = 0;
      return [...prev, makeLayer(theme)];
    });
  }, [theme]);

  // Theme change: make sure a layer exists for the new theme. It cross-fades in
  // when it paints; until then the themed placeholder (below) covers the gap so
  // we never show a stale-theme DAG behind a freshly-switched UI.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync/reset inside this effect (data-fetch loading reset, dependency-change reset, or external-event handler); React Compiler perf advisory, not a render-loop bug; tests cover the behavior
    setLayers((prev) => (prev.some((l) => l.theme === theme) ? prev : [...prev, makeLayer(theme)]));
  }, [theme]);

  // Prune superseded layers a fade after they are superseded: older same-theme
  // live layers (replaced by a newer paint) and opposite-theme layers (once the
  // active theme has painted) fade out, then get removed from the DOM.
  useEffect(() => {
    const newestLoaded = {};
    layers.forEach((l) => { if (l.loaded) newestLoaded[l.theme] = l.id; });
    const stale = layers.filter((l) => {
      if (l.theme !== theme) return Boolean(newestLoaded[theme]); // drop other-theme once current paints
      return l.loaded && newestLoaded[theme] && l.id !== newestLoaded[theme]; // superseded same-theme
    });
    if (stale.length === 0) return undefined;
    const ids = new Set(stale.map((l) => l.id));
    const t = setTimeout(() => {
      setLayers((prev) => prev.filter((l) => !ids.has(l.id)));
    }, FADE_MS + 80);
    return () => clearTimeout(t);
  }, [layers, theme]);

  // Reconnect triggers: return-to-tab after a real hide, plus a long, now-seamless
  // periodic refresh while visible (a hidden refresh is throttled/wasted).
  useEffect(() => {
    let hiddenSince = null;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenSince = Date.now();
      } else if (document.visibilityState === 'visible') {
        if (hiddenSince && Date.now() - hiddenSince > HIDDEN_RECONNECT_MS) reconnect();
        hiddenSince = null;
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') reconnect();
    }, REFRESH_MS);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      clearInterval(interval);
    };
  }, [reconnect]);

  // Watchdog: if the newest layer for the active theme never paints, drop it so a
  // dead pending iframe can't sit invisible forever. The last good frame stays up
  // throughout. Retry a bounded number of times only when nothing else is showing;
  // otherwise let the periodic refresh / visibility handler try again later.
  useEffect(() => {
    const sameTheme = layers.filter((l) => l.theme === theme);
    const newest = sameTheme[sameTheme.length - 1];
    if (!newest || newest.loaded) return undefined;
    const t = setTimeout(() => {
      setLayers((prev) => {
        const hasOlderLoaded = prev.some((l) => l.theme === theme && l.loaded && l.id !== newest.id);
        let next = prev.filter((l) => l.id !== newest.id);
        if (!hasOlderLoaded && retriesRef.current < MAX_RETRIES) {
          retriesRef.current += 1;
          next = [...next, makeLayer(theme)];
        }
        return next;
      });
    }, LOAD_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [layers, theme]);

  // The single visible frame: the newest painted layer for the active theme.
  let newestLoadedId = null;
  layers.forEach((l) => { if (l.theme === theme && l.loaded) newestLoadedId = l.id; });
  const placeholderFull = newestLoadedId == null; // no live frame yet -> themed gradient at full strength

  return (
    <div className={`dag-background fixed inset-0 z-[-10] pointer-events-none ${isDark ? 'bg-[#05050A]' : 'bg-[#eef2f7]'}`}>
      {/* Themed gradient placeholder - always beneath the iframes, so the backdrop
          is never blank before the first paint, between reconnects, on a theme
          switch, or if the external service is unreachable. */}
      <div
        className="absolute inset-0"
        style={{
          transition: `opacity ${FADE_MS}ms ease`,
          opacity: placeholderFull ? 1 : 0.35,
          background: isDark
            ? 'radial-gradient(ellipse at 50% 30%, rgba(73,234,203,0.08) 0%, transparent 55%), #05050A'
            : 'radial-gradient(ellipse at 50% 26%, rgba(13,148,136,0.09) 0%, transparent 52%), radial-gradient(ellipse at 50% 100%, rgba(13,148,136,0.045) 0%, transparent 60%), #eef2f7',
        }}
      />

      {layers.map((l) => {
        const shown = l.id === newestLoadedId;
        return (
          <iframe
            key={l.id}
            src={SRC[l.theme]}
            onLoad={() => handleLoad(l.id)}
            className="absolute top-1/2 left-1/2 w-[125vw] h-[125vh] border-0"
            style={{
              opacity: shown ? THEME_OPACITY[l.theme] : 0,
              mixBlendMode: shown ? THEME_BLEND[l.theme] : 'normal',
              transform: `translate(-50%, -50%) scale(${DAG_SCALE})`,
              transition: `opacity ${FADE_MS}ms ease`,
            }}
            title={`Live Kaspa DAG (${l.theme})`}
            loading="eager"
            sandbox="allow-scripts allow-same-origin"
            aria-hidden="true"
          />
        );
      })}

      {/* Vignette: the focal frame. Each theme fades the DAG to ITS OWN page
          background - dark to black, light to the bright canvas - so the live DAG
          concentrates in a focal center and dissolves cleanly at the edges. Same
          treatment, theme-correct colour (light must NOT overlay black). */}
      <div
        className="absolute inset-0"
        style={{
          background: isDark
            ? 'radial-gradient(circle at center, transparent 0%, #000000 80%)'
            : 'radial-gradient(ellipse 120% 108% at 50% 34%, transparent 0%, transparent 8%, #eef2f7 46%)',
        }}
      />
    </div>
  );
};

export default DagBackground;
