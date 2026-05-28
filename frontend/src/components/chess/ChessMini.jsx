import React, { useState } from 'react';

// chess.com exact colors + premium pro look
const LIGHT = '#f0d9b5';
const DARK = '#b58863';

const UNICODE = { r:'♜',n:'♞',b:'♝',q:'♛',k:'♚',p:'♟', R:'♖',N:'♘',B:'♗',Q:'♕',K:'♔',P:'♙' };

const ChessMini = ({ compact = false, stake = 50 }) => {
  const board = [
    ['r','n','b','q','k','b','n','r'],
    ['p','p','p','p','p','p','p','p'],
    ['','','','','','','',''],
    ['','','','','','','',''],
    ['','','','','','','',''],
    ['','','','','','','',''],
    ['P','P','P','P','P','P','P','P'],
    ['R','N','B','Q','K','B','N','R'],
  ];
  const [demo, setDemo] = useState('idle');
  const cell = compact ? 16 : 20;
  const w = cell * 8 + 6;

  const start = () => { setDemo('matched'); setTimeout(() => setDemo('playing'), 380); };
  const end = () => { setDemo('finished'); setTimeout(() => setDemo('idle'), 2200); };

  return (
    <div className="rounded-2xl overflow-hidden border border-white/10 bg-[#0a0a0a] text-white shadow-2xl" style={{width:w}}>
      <div className="flex justify-between items-center px-2 py-0.5 bg-black/80 border-b border-white/10 text-[8px] font-mono">
        <span className="text-[#49EACB]">CHESS v1 • ZK</span>
        <span className="text-[#49EACB] tabular-nums">{stake} KAS • 2%</span>
      </div>

      <div className="grid border border-[#222] p-[2px] bg-[#111]" style={{gridTemplateColumns:`repeat(8,${cell}px)`}}>
        {board.map((row,ri) => row.map((p,ci) => {
          const light = (ri+ci)%2===0;
          return (
            <div key={ri+'-'+ci} className="flex items-center justify-center" style={{width:cell,height:cell,background:light?LIGHT:DARK}}>
              {p && <span style={{fontSize:cell*0.78,lineHeight:1,color:p===p.toLowerCase()?'#111':'#f4f4f4',textShadow:'0 1px 2px rgba(0,0,0,0.5)',filter:'drop-shadow(0 1px 1px rgba(0,0,0,0.35))'}}>{UNICODE[p]}</span>}
            </div>
          );
        }))}
      </div>

      <div className="px-2 py-1 bg-[#0f0f0f] border-t border-white/10 text-[8px]">
        {demo==='idle' && <button onClick={start} className="w-full py-0.5 bg-[#49EACB] text-black font-bold rounded text-[9px]">STAKE &amp; MATCH — PLAY NOW</button>}
        {demo==='matched' && <div className="text-center text-[#49EACB] font-mono py-0.5">MATCHING ON TN12...</div>}
        {demo==='playing' && <div className="flex gap-1"><button onClick={end} className="flex-1 bg-emerald-500 text-[8px] py-px rounded font-bold">WHITE WINS</button><button onClick={end} className="flex-1 bg-rose-500 text-[8px] py-px rounded font-bold">BLACK WINS</button></div>}
        {demo==='finished' && <div className="text-center text-emerald-400 font-bold tracking-wider">ZK VERIFIED • WINNER TAKES ALL</div>}
      </div>
      <div className="px-2 pb-1 text-[7px] text-gray-500 font-mono flex justify-between"><span>FULL FIDE</span><span>ZK PROOF</span></div>
    </div>
  );
};
export default ChessMini;
