import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { X, ShieldCheck, Download, LifeBuoy, KeyRound, ArrowRight } from 'lucide-react';

// Self-custody recovery kit. Every covenant Covex deploys is a script-enforced P2SH covenant:
// the KASPA CHAIN enforces the spend rules, not Covex. On mainnet, oracle-dependent covenants are
// refused (GATE 2), so every mainnet covenant is a deterministic primitive whose funds can be
// redeemed by the owner's own wallet using only the published redeem script + any Kaspa node -
// with NO Covex involvement. This kit exports exactly that data so a holder can settle even if
// Covex is permanently offline. It contains NO private keys (those never leave the user's wallet).
export default function RecoveryKitModal({ open, onClose, covenant }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !covenant) return null;

  const kind = String(covenant.redeem_kind || '').split(':')[0] || 'p2sh';
  const kit = {
    covex_recovery_kit_version: 1,
    note: 'Self-custody recovery data. This covenant is enforced by the Kaspa chain, not by Covex. With the redeem script below and the required key(s), the owner can build and broadcast the redeem transaction using ANY Kaspa node, independently of Covex. Contains no private keys.',
    covenant: {
      tx_id: covenant.tx_id || null,
      network: covenant.network || null,
      p2sh_address: covenant.address || null,
      redeem_kind: covenant.redeem_kind || null,
      redeem_script_hex: covenant.redeem_script_hex || null,
      script_hash: covenant.script_hash || null,
      receiving_addresses: covenant.receiving_addresses || null,
    },
  };

  const download = () => {
    const blob = new Blob([JSON.stringify(kit, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `covex-recovery-${(covenant.tx_id || 'covenant').slice(0, 16)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg glass-panel rounded-2xl border border-white/10 p-5 sm:p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-kaspa-green/10 border border-kaspa-green/25 flex items-center justify-center">
              <LifeBuoy size={17} className="text-kaspa-green" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white leading-tight">Recover without Covex</h2>
              <p className="text-[11px] text-gray-400">Your funds are safe even if Covex disappears.</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"><X size={18} /></button>
        </div>

        <div className="rounded-xl border border-kaspa-green/20 bg-kaspa-green/[0.05] p-4 mb-4">
          <div className="flex items-center gap-2 text-kaspa-green font-semibold text-sm mb-1.5"><ShieldCheck size={15} /> Chain-enforced, not Covex-enforced</div>
          <p className="text-[12px] text-gray-300 leading-relaxed">
            This is a script-enforced <span className="text-white font-mono">{kind}</span> covenant on Kaspa. The
            <span className="text-white"> chain itself</span> enforces the spend rules. Covex only helps you build the
            transaction - it holds no keys and cannot move these funds. If Covex were ever offline, anyone holding the
            redeem script below plus the required key(s) can settle this covenant directly through any Kaspa node.
          </p>
        </div>

        <div className="space-y-3 text-[12px] text-gray-300">
          <div className="flex items-start gap-2.5">
            <span className="shrink-0 w-5 h-5 rounded-full bg-white/10 text-white text-[10px] font-bold flex items-center justify-center mt-0.5">1</span>
            <div><span className="text-white font-semibold">Save this recovery kit</span> somewhere safe (it has the P2SH address and the exact redeem script). It contains <span className="text-white">no private keys</span>.</div>
          </div>
          <div className="flex items-start gap-2.5">
            <span className="shrink-0 w-5 h-5 rounded-full bg-white/10 text-white text-[10px] font-bold flex items-center justify-center mt-0.5">2</span>
            <div>When the spend condition is met, query the covenant's UTXOs at its <span className="text-white">P2SH address</span> from any Kaspa node or explorer.</div>
          </div>
          <div className="flex items-start gap-2.5">
            <span className="shrink-0 w-5 h-5 rounded-full bg-white/10 text-white text-[10px] font-bold flex items-center justify-center mt-0.5">3</span>
            <div>Build a spend that provides the <span className="text-white font-mono">redeem_script_hex</span> in the input and sign it with your own key (<KeyRound size={11} className="inline text-kaspa-green" /> never shared with anyone), then broadcast it. The chain accepts it because the script hashes to this covenant's commitment.</div>
          </div>
        </div>

        {covenant.redeem_script_hex ? (
          <button onClick={download} className="btn-shimmer mt-5 w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm bg-kaspa-green text-black hover:shadow-[0_0_24px_rgba(73,234,203,0.35)] active:scale-[0.985] transition-all">
            <Download size={16} /> Download recovery kit (JSON)
          </button>
        ) : (
          <div className="mt-5 rounded-xl border border-amber-500/20 bg-amber-500/[0.05] p-3 text-[11px] text-amber-300/90">
            The redeem script for this covenant is not on record yet (it was created elsewhere). Claim it on this page with its redeem script first, then the recovery kit becomes available.
          </div>
        )}
        <Link to={covenant.tx_id ? `/recover?id=${encodeURIComponent(String(covenant.tx_id).split(':')[0])}` : '/recover'} onClick={onClose} className="mt-3 w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-kaspa-green/25 bg-kaspa-green/[0.05] text-kaspa-green text-[12px] font-semibold hover:bg-kaspa-green/[0.1] hover:border-kaspa-green/40 transition-colors">
          Open the recovery page <ArrowRight size={13} />
        </Link>
        <p className="mt-2 text-center text-[10px] text-gray-500">The recovery page walks you through redeeming with the kit above, independently of Covex. A push-button in-browser redeemer is in the works.</p>
      </div>
    </div>
  );
}
