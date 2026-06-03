import React from 'react';
import { useTheme } from './ThemeProvider';

const DagBackground = () => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const dagSrc = `https://kgi.kaspad.net/?theme=${isDark ? 'dark' : 'light'}`;

  return (
    <div 
      className={`dag-background fixed inset-0 z-[-10] pointer-events-none ${isDark ? 'bg-black' : 'bg-white'}`}
    >
      <iframe 
        key={theme}  // Force remount with correct ?theme= param when theme switches
        src={dagSrc} 
        className={`absolute top-1/2 left-1/2 w-[125vw] h-[125vh] -translate-x-1/2 -translate-y-1/2 border-0 ${isDark ? 'opacity-30 mix-blend-screen' : 'opacity-75'}`}
        title={`Live Kaspa DAG (${isDark ? 'dark' : 'light'})`}
      />
      {/* Subtle dark vignette only in dark mode */}
      {isDark && (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_transparent_0%,_#000000_80%)]" />
      )}
    </div>
  );
};

export default DagBackground;
