import React from 'react';

const DagBackground = () => {
  return (
    <div className="dag-background fixed inset-0 z-[-10] bg-white dark:bg-black pointer-events-none">
      {/* Dark mode: dark theme DAG with screen blend for neon glow on black */}
      <iframe 
        src="https://kgi.kaspad.net/?theme=dark" 
        className="absolute top-1/2 left-1/2 w-[125vw] h-[125vh] -translate-x-1/2 -translate-y-1/2 border-0 opacity-30 mix-blend-screen hidden dark:block"
        title="Live Kaspa DAG (dark)"
      />
      {/* Light mode: light theme DAG — higher opacity so it's clearly visible on white bg */}
      <iframe 
        src="https://kgi.kaspad.net/?theme=light" 
        className="absolute top-1/2 left-1/2 w-[125vw] h-[125vh] -translate-x-1/2 -translate-y-1/2 border-0 opacity-75 block dark:hidden"
        title="Live Kaspa DAG (light)"
      />
      {/* Subtle dark vignette only in dark mode */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_transparent_0%,_#000000_80%)] hidden dark:block" />
    </div>
  );
};

export default DagBackground;
