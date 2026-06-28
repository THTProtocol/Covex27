import { Dices } from 'lucide-react';

const DiceMini = () => {
  return (
    <div className="flex items-center justify-center h-full bg-black/30 rounded-lg p-3 text-center">
      <div>
        <div className="text-2xl mb-1 opacity-60">
          <Dices size={28} className="mx-auto text-gray-400" />
        </div>
        <div className="text-[10px] text-gray-300 font-mono uppercase tracking-wider">Dice</div>
        <div className="text-[9px] text-gray-400 mt-1">ZK provable roll</div>
      </div>
    </div>
  );
};

export default DiceMini;
