
const BlackjackMini = ({ compact = false }) => {
  return (
    <div className="flex items-center justify-center h-full bg-black/30 rounded-lg p-3 text-center">
      <div>
        <div className="text-2xl mb-1 opacity-60">🃟</div>
        <div className="text-[10px] text-gray-300 font-mono uppercase tracking-wider">Blackjack</div>
        <div className="text-[9px] text-gray-400 mt-1">ZK outcome circuit</div>
      </div>
    </div>
  );
};

export default BlackjackMini;
