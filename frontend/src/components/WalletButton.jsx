import { useWallet } from './WalletContext';

const TRUNC = (s, n=6) => s ? `${s.slice(0,n)}...${s.slice(-4)}` : '';

const ICONS = {
  kasware: <svg className="h-6 w-6" viewBox="0 0 32 32" fill="none"><rect width="32" height="32" rx="8" fill="#0A0A0D" stroke="#49EACB" strokeWidth="1.5"/><text x="16" y="22" textAnchor="middle" fontSize="18" fontWeight="700" fill="#49EACB" fontFamily="monospace">K</text></svg>,
  kaspium: <svg className="h-6 w-6" viewBox="0 0 32 32" fill="none"><rect width="32" height="32" rx="8" fill="#0A0A0D" stroke="#F59E0B" strokeWidth="1.5"/><text x="16" y="22" textAnchor="middle" fontSize="18" fontWeight="700" fill="#F59E0B" fontFamily="monospace">M</text></svg>,
  onekey: <svg className="h-6 w-6" viewBox="0 0 32 32" fill="none"><rect width="32" height="32" rx="8" fill="#0A0A0D" stroke="#6366F1" strokeWidth="1.5"/><text x="16" y="22" textAnchor="middle" fontSize="18" fontWeight="700" fill="#6366F1" fontFamily="monospace">O</text></svg>,
  uri: <svg className="h-6 w-6" viewBox="0 0 32 32" fill="none"><rect width="32" height="32" rx="8" fill="#0A0A0D" stroke="#6B7280" strokeWidth="1.5" strokeDasharray="2 2"/><text x="16" y="22" textAnchor="middle" fontSize="11" fontWeight="700" fill="#6B7280" fontFamily="monospace">URI</text></svg>,
};

export default function WalletButton() {
  const { wallet, address, balance, connecting, showModal, setShowModal, connect, disconnect, wallets, network } = useWallet();
  const available = wallets.filter(w => w.detect());

  return (<>
    {address ? (
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500 font-mono">{network}</span>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-kaspa-green/10 border border-kaspa-green/30">
          <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.5)]" />
          <span className="text-xs font-mono text-kaspa-green">{TRUNC(address)}</span>
          {balance!==null && <span className="text-xs text-gray-400 ml-1">{(balance/1e8).toFixed(2)} KAS</span>}
          <button onClick={disconnect} className="ml-1 p-1 rounded hover:bg-white/10 transition-colors"><svg className="h-3 w-3 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg></button>
        </div>
      </div>
    ) : (
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500 font-mono">{network}</span>
        <button onClick={()=>setShowModal(true)} disabled={connecting}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${connecting?'bg-white/[0.04] text-gray-500 border border-white/5 cursor-wait':available.length>0?'bg-kaspa-green/10 text-kaspa-green border border-kaspa-green/30 hover:bg-kaspa-green/20':'bg-white/[0.04] text-gray-500 border border-white/5 hover:text-gray-300'}`}>
          {connecting ? <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> : <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>}
          {connecting?'Connecting':'Connect Wallet'}
        </button>
      </div>
    )}

    {showModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <div className="w-full max-w-sm rounded-2xl bg-[#111116]/95 border border-white/10 shadow-2xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-white">Connect Kaspa Wallet</h3>
            <button onClick={()=>setShowModal(false)} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"><svg className="h-4 w-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
          </div>
          <p className="text-xs text-gray-500">Connect to interact directly with covenants via your wallet.</p>
          <div className="space-y-2">
            {wallets.map(w => { const d = w.detect(); return (
              <button key={w.id} onClick={()=>connect(w.id)} disabled={connecting}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all duration-200 ${d?'bg-white/[0.03] border-white/10 hover:bg-white/[0.06] text-left':'bg-white/[0.01] border-white/5 opacity-60 text-left'}`}>
                <div className="shrink-0">{ICONS[w.id]||ICONS.uri}</div>
                <div className="text-left flex-1 min-w-0"><p className="text-sm font-medium text-white">{w.name}</p><p className="text-xs text-gray-500 truncate">{w.id==='uri'?'Universal kaspatest: deep-link':d?'Detected':`${w.url}`}</p></div>
                {d && w.id!=='uri' && <span className="ml-auto shrink-0 h-2 w-2 rounded-full bg-emerald-400"/>}
              </button>
            )})}
          </div>
          <div className="text-xs text-gray-600 text-center space-y-1 pt-2 border-t border-white/5">
            <p><a href="https://kasware.xyz" target="_blank" rel="noopener noreferrer" className="text-kaspa-green hover:underline">KasWare</a> &middot; <a href="https://kaspium.io" target="_blank" rel="noopener noreferrer" className="text-kaspa-green hover:underline">Kaspium</a> &middot; <a href="https://onekey.so" target="_blank" rel="noopener noreferrer" className="text-kaspa-green hover:underline">OneKey</a></p>
            <p className="text-gray-600">Direct wRPC. No proxy.</p>
          </div>
        </div>
      </div>
    )}
  </>);
}
