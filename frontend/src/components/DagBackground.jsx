import React from 'react';
import { useTheme } from './ThemeProvider';

const DagBackground = () => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  // Preload both themed iframe URLs - both always mounted so they stay warm.
  // Visibility is driven directly by isDark from context: zero extra render cycles,
  // instant switch with CSS transition on opacity. No useState/useEffect lag.
  const darkSrc = 'https://kgi.kaspad.net/?theme=dark';
  const lightSrc = 'https://kgi.kaspad.net/?theme=light';

  return (
    <div 
      className={`dag-background fixed inset-0 z-[-10] pointer-events-none ${isDark ? 'bg-black' : 'bg-white'}`}
    >
      {/* Dark DAG iframe - visible when isDark, hidden when light */}
      <iframe 
        src={darkSrc} 
        className={`absolute top-1/2 left-1/2 w-[125vw] h-[125vh] -translate-x-1/2 -translate-y-1/2 border-0 transition-opacity duration-200 ${isDark ? 'opacity-30 mix-blend-screen' : 'opacity-0 pointer-events-none'}`}
        title="Live Kaspa DAG (dark)"
      />
      {/* Light DAG iframe - visible when !isDark, hidden when dark */}
      <iframe 
        src={lightSrc} 
        className={`absolute top-1/2 left-1/2 w-[125vw] h-[125vh] -translate-x-1/2 -translate-y-1/2 border-0 transition-opacity duration-200 ${!isDark ? 'opacity-75' : 'opacity-0 pointer-events-none'}`}
        title="Live Kaspa DAG (light)"
      />
      {/* Subtle dark vignette only in dark mode */}
      {isDark && (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_transparent_0%,_#000000_80%)]" />
      )}
    </div>
  );
};

export default DagBackground;
