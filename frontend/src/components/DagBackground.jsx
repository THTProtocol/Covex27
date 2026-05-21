import React from 'react';

const DagBackground = () => {
  return (
    <div className="fixed inset-0 z-[-10] bg-black overflow-hidden pointer-events-none">
      <iframe 
        src="https://kgi.kaspad.net/?theme=dark" 
        className="absolute top-1/2 left-1/2 w-[125vw] h-[125vh] -translate-x-1/2 -translate-y-1/2 border-0 opacity-35 mix-blend-screen"
        title="Live Kaspa DAG"
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_transparent_0%,_#000000_85%)]" />
    </div>
  );
};

export default DagBackground;
