import React, { useState } from 'react';
import { useTheme } from './ThemeProvider';

/**
 * Live Kaspa DAG visualizer (kgi.kaspad.net) as the page backdrop.
 *
 * Both themed iframes are always mounted so theme switching is instant with no
 * remount/reload. The original loading problem was a blank flash before the
 * external frame painted: we now keep each iframe at opacity 0 until its own
 * `onLoad` fires, fading it in over a themed gradient placeholder so there is
 * never an empty background. Sandboxed to contain the external Pixi/console
 * noise.
 */
const DagBackground = () => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [darkLoaded, setDarkLoaded] = useState(false);
  const [lightLoaded, setLightLoaded] = useState(false);

  return (
    <div className={`dag-background fixed inset-0 z-[-10] pointer-events-none ${isDark ? 'bg-[#05050A]' : 'bg-[#f8fafc]'}`}>
      {/* Themed gradient placeholder - always present, so the backdrop is never blank
          while the external visualizer loads or if it is slow/unreachable. */}
      <div
        className="absolute inset-0 transition-opacity duration-300"
        style={{
          opacity: (isDark ? darkLoaded : lightLoaded) ? 0.35 : 1,
          background: isDark
            ? 'radial-gradient(ellipse at 50% 30%, rgba(73,234,203,0.08) 0%, transparent 55%), #05050A'
            : 'radial-gradient(ellipse at 50% 30%, rgba(13,148,136,0.07) 0%, transparent 55%), #f8fafc',
        }}
      />

      {/* Dark DAG iframe */}
      <iframe
        src="https://kgi.kaspad.net/?theme=dark"
        onLoad={() => setDarkLoaded(true)}
        className={`absolute top-1/2 left-1/2 w-[125vw] h-[125vh] -translate-x-1/2 -translate-y-1/2 border-0 transition-opacity duration-500 ${
          isDark && darkLoaded ? 'opacity-30 mix-blend-screen' : 'opacity-0 pointer-events-none'
        }`}
        title="Live Kaspa DAG (dark)"
        loading="eager"
        sandbox="allow-scripts allow-same-origin"
      />

      {/* Light DAG iframe */}
      <iframe
        src="https://kgi.kaspad.net/?theme=light"
        onLoad={() => setLightLoaded(true)}
        className={`absolute top-1/2 left-1/2 w-[125vw] h-[125vh] -translate-x-1/2 -translate-y-1/2 border-0 transition-opacity duration-500 ${
          !isDark && lightLoaded ? 'opacity-75' : 'opacity-0 pointer-events-none'
        }`}
        title="Live Kaspa DAG (light)"
        loading="eager"
        sandbox="allow-scripts allow-same-origin"
      />

      {/* Vignette: dark mode only */}
      {isDark && <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_transparent_0%,_#000000_80%)]" />}
    </div>
  );
};

export default DagBackground;
