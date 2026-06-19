import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTheme } from './ThemeProvider';

/**
 * Live Kaspa DAG visualizer (kgi.kaspad.net) as the page backdrop.
 *
 * Both themed iframes are always mounted so theme switching is instant with no
 * remount/reload. Each iframe stays at opacity 0 until its own `onLoad` fires,
 * fading in over a themed gradient placeholder so the backdrop is never blank.
 * Sandboxed to contain the external Pixi/console noise.
 *
 * SELF-HEAL (connectivity fix): the external WebGL visualizer pauses its render
 * loop when the tab is backgrounded and can drop its feed / lose the GL context
 * after long runtime, leaving a blank frame that never recovers (onLoad is
 * one-shot). We remount the iframe (via a `reloadKey` on its React `key`) to
 * force a reconnect: (1) when the tab becomes visible again after being hidden
 * ("when waiting"), (2) periodically while visible ("prolonged use"), and (3) a
 * bounded watchdog if a (re)mount never paints. This keeps the DAG connected.
 */
const REFRESH_MS = 4 * 60 * 1000; // periodic reconnect during prolonged use
const HIDDEN_RECONNECT_MS = 5_000; // reconnect only if hidden longer than this
const LOAD_TIMEOUT_MS = 12_000; // retry if a frame never paints
const MAX_LOAD_RETRIES = 2; // bound rapid retries when the service is down

const DagBackground = () => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [reloadKey, setReloadKey] = useState(0);
  const [darkLoaded, setDarkLoaded] = useState(false);
  const [lightLoaded, setLightLoaded] = useState(false);
  const retriesRef = useRef(0);

  // Fresh attempt: clear paint flags, reset the retry budget, remount both iframes.
  const reconnect = useCallback(() => {
    retriesRef.current = 0;
    setDarkLoaded(false);
    setLightLoaded(false);
    setReloadKey((k) => k + 1);
  }, []);

  // Reconnect on return-to-tab (after a real hide) and on a periodic interval.
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
    // Only refresh while visible: a hidden refresh is throttled/wasted, and the
    // visibility handler already covers the return-to-tab case.
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') reconnect();
    }, REFRESH_MS);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      clearInterval(interval);
    };
  }, [reconnect]);

  // Watchdog: if the active theme's frame hasn't painted shortly after a (re)mount,
  // retry, bounded so a down service doesn't trigger an infinite fast reload loop.
  // The periodic/visibility reconnects above reset the budget for a fresh round.
  useEffect(() => {
    const loaded = isDark ? darkLoaded : lightLoaded;
    if (loaded) {
      retriesRef.current = 0;
      return undefined;
    }
    if (retriesRef.current >= MAX_LOAD_RETRIES) return undefined;
    const t = setTimeout(() => {
      retriesRef.current += 1;
      setDarkLoaded(false);
      setLightLoaded(false);
      setReloadKey((k) => k + 1);
    }, LOAD_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [isDark, darkLoaded, lightLoaded, reloadKey]);

  return (
    <div className={`dag-background fixed inset-0 z-[-10] pointer-events-none ${isDark ? 'bg-[#05050A]' : 'bg-[#f8fafc]'}`}>
      {/* Themed gradient placeholder - always present, so the backdrop is never blank
          while the external visualizer loads/reconnects or if it is slow/unreachable.
          Light mode now gets a layered radial wash matching dark's depth. */}
      <div
        className="absolute inset-0 transition-opacity duration-300"
        style={{
          opacity: (isDark ? darkLoaded : lightLoaded) ? 0.35 : 1,
          background: isDark
            ? 'radial-gradient(ellipse at 50% 30%, rgba(73,234,203,0.08) 0%, transparent 55%), #05050A'
            : 'radial-gradient(ellipse at 50% 28%, rgba(13,148,136,0.10) 0%, transparent 52%), radial-gradient(ellipse at 50% 100%, rgba(13,148,136,0.05) 0%, transparent 60%), #f8fafc',
        }}
      />

      {/* Dark DAG iframe */}
      <iframe
        key={`dark-${reloadKey}`}
        src="https://kgi.kaspad.net/?theme=dark"
        onLoad={() => setDarkLoaded(true)}
        className={`absolute top-1/2 left-1/2 w-[125vw] h-[125vh] -translate-x-1/2 -translate-y-1/2 border-0 transition-opacity duration-500 ${
          isDark && darkLoaded ? 'opacity-30 mix-blend-screen' : 'opacity-0 pointer-events-none'
        }`}
        title="Live Kaspa DAG (dark)"
        loading="eager"
        sandbox="allow-scripts allow-same-origin"
      />

      {/* Light DAG iframe: mix-blend-multiply lets the teal DAG strokes sit INTO the
          white page (cohesion) instead of floating flat on top, mirroring how dark
          mode uses mix-blend-screen. */}
      <iframe
        key={`light-${reloadKey}`}
        src="https://kgi.kaspad.net/?theme=light"
        onLoad={() => setLightLoaded(true)}
        className={`absolute top-1/2 left-1/2 w-[125vw] h-[125vh] -translate-x-1/2 -translate-y-1/2 border-0 transition-opacity duration-500 ${
          !isDark && lightLoaded ? 'opacity-70 mix-blend-multiply' : 'opacity-0 pointer-events-none'
        }`}
        title="Live Kaspa DAG (light)"
        loading="eager"
        sandbox="allow-scripts allow-same-origin"
      />

      {/* Vignette: feather the DAG into the page at the edges so it reads as one
          cohesive surface. Dark fades to black; light fades to the page bg. */}
      <div
        className="absolute inset-0"
        style={{
          background: isDark
            ? 'radial-gradient(circle at center, transparent 0%, #000000 80%)'
            : 'radial-gradient(circle at center, transparent 0%, rgba(248,250,252,0.92) 82%)',
        }}
      />
    </div>
  );
};

export default DagBackground;
