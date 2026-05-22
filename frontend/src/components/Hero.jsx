import React from 'react';
import { Terminal, Database, Code2, Zap } from 'lucide-react';

const Hero = () => {
  return (
    <div className="relative z-10 flex flex-col items-center justify-center pt-24 pb-16 px-6 text-center animate-in fade-in duration-700">
      
      {/* Network Status Badge */}
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#111111] border border-[#1f1f1f] text-gray-400 text-xs font-mono mb-8">
        <div className="w-1.5 h-1.5 rounded-full bg-[#49EACB] shadow-[0_0_8px_#49EACB] animate-pulse" />
        TN-12 LIVE (TOCCATA)
      </div>

      {/* Main Headline */}
      <h1 className="text-4xl md:text-6xl font-black text-white tracking-tight mb-6 max-w-4xl mx-auto leading-[1.1]">
        Smart Contracts for <br className="hidden md:block"/>
        <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#49EACB] to-white">The Kaspa BlockDAG</span>
      </h1>

      {/* Subtitle */}
      <p className="text-base md:text-lg text-gray-400 max-w-2xl mx-auto leading-relaxed mb-16">
        Covex is the native indexing and deployment layer for SilverScript covenants. Compile, deploy, and interact with programmable UTXOs at 10 blocks per second.
      </p>

      {/* Sleek Data Bar */}
      <div className="w-full max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6 p-6 rounded-2xl bg-[#0a0a0a]/80 backdrop-blur-md border border-[#1f1f1f] shadow-2xl">
        
        <div className="flex items-center gap-4 w-full md:w-auto">
          <div className="w-10 h-10 rounded-lg bg-[#111111] border border-[#1f1f1f] flex items-center justify-center text-[#49EACB]">
            <Terminal size={18} />
          </div>
          <div className="text-left">
            <p className="text-xs text-gray-500 font-mono">LANGUAGE</p>
            <p className="text-sm font-semibold text-white">SilverScript</p>
          </div>
        </div>

        <div className="hidden md:block w-px h-10 bg-[#1f1f1f]"></div>

        <div className="flex items-center gap-4 w-full md:w-auto">
          <div className="w-10 h-10 rounded-lg bg-[#111111] border border-[#1f1f1f] flex items-center justify-center text-[#49EACB]">
            <Zap size={18} />
          </div>
          <div className="text-left">
            <p className="text-xs text-gray-500 font-mono">LATENCY</p>
            <p className="text-sm font-semibold text-white">100ms</p>
          </div>
        </div>

        <div className="hidden md:block w-px h-10 bg-[#1f1f1f]"></div>

        <div className="flex items-center gap-4 w-full md:w-auto">
          <div className="w-10 h-10 rounded-lg bg-[#111111] border border-[#1f1f1f] flex items-center justify-center text-[#49EACB]">
            <Database size={18} />
          </div>
          <div className="text-left">
            <p className="text-xs text-gray-500 font-mono">INDEXER</p>
            <p className="text-sm font-semibold text-white">Covex Engine</p>
          </div>
        </div>

        <div className="hidden md:block w-px h-10 bg-[#1f1f1f]"></div>

        <div className="flex items-center gap-4 w-full md:w-auto">
          <div className="w-10 h-10 rounded-lg bg-[#111111] border border-[#1f1f1f] flex items-center justify-center text-[#49EACB]">
            <Code2 size={18} />
          </div>
          <div className="text-left">
            <p className="text-xs text-gray-500 font-mono">RUNTIME</p>
            <p className="text-sm font-semibold text-white">Toccata</p>
          </div>
        </div>

      </div>

    </div>
  );
};

export default Hero;
