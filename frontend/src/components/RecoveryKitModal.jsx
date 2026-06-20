import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { X, ShieldCheck, Download, LifeBuoy, KeyRound, ArrowRight, Snowflake } from 'lucide-react';
import { KIND_CLAIM_MATRIX } from '../lib/redeemer/covenantRedeemer';

// Focus-trap selector parity with CovenantStudio's drawer trap: keep Tab cycling
// inside the modal subtree, restore focus on close. No new dep.
const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Self-custody recovery kit. Every covenant Covex deploys is a script-enforced P2SH covenant:
// the KASPA CHAIN enforces the spend rules, not Covex. On mainnet, oracle-dependent covenants are
// refused (GATE 2), so every mainnet covenant is a deterministic primitive whose funds can be
// redeemed by the owner's own wallet using only the published redeem script + any Kaspa node -
// with NO Covex involvement. This kit exports exactly that data so a holder can settle even if
// Covex is permanently offline. It contains NO private keys (those never leave the user's wallet).
export default function RecoveryKitModal({ open, onClose, covenant }) {
  const dialogRef = useRef(null);
  const previouslyFocusedRef = useRef(null);
  const titleId = 'recovery-kit-title';

  // Escape closes + Tab-cycle focus trap + restore focus on close. Matches the
  // a11y contract used by CovenantStudio drawers and WalletButton's dialogs.
  useEffect(() => {
    if (!open) return undefined;
    previouslyFocusedRef.current = typeof document !== 'undefined' ? document.activeElement : null;
    const root = dialogRef.current;
    const focusables = () => (root
      ? Array.from(root.querySelectorAll(FOCUSABLE_SELECTOR)).filter((el) => el.offsetParent !== null || el === document.activeElement)
      : []);
    const first = focusables()[0];
    if (first && typeof first.focus === 'function') {
      first.focus();
    } else if (root && root.tabIndex < 0) {
      root.setAttribute('tabindex', '-1');
      root.focus();
    }
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
      if (e.key !== 'Tab' || !root) return;
      const items = focusables();
      if (items.length === 0) { e.preventDefault(); return; }
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      const activeEl = document.activeElement;
      if (e.shiftKey) {
        if (activeEl === firstEl || !root.contains(activeEl)) { e.preventDefault(); lastEl.focus(); }
      } else if (activeEl === lastEl) {
        e.preventDefault(); firstEl.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      const prev = previouslyFocusedRef.current;
      if (prev && typeof prev.focus === 'function') {
        try { prev.focus(); } catch (_) { /* no-op */ }
      }
    };
  }, [open, onClose]);

  if (!open || !covenant) return null;

  const kind = String(covenant.redeem_kind || '').split(':')[0] || 'p2sh';
  const matrix = KIND_CLAIM_MATRIX[kind] || null;
  const isOracleKind = /^oracle/.test(kind);

  // Best-effort enrichment, all from the covenant the page already has. The PRIVATE KEY is
  // never included - only public data the chain (or a revealed-on-chain secret) already exposes.
  const revealedSecret = covenant.revealed_secret || covenant.preimage || covenant.outcome_secret || null;
  const branchRoles = covenant.branch_roles
    || (matrix ? Object.fromEntries(Object.entries(matrix.branches).map(([b, v]) => [b, v.role])) : null);
  // The disclosed oracle pubkey is only meaningful for oracle kinds; keep it out otherwise.
  const oraclePubkey = isOracleKind
    ? (covenant.oracle_pubkey || covenant.oracle_xonly_pubkey || covenant.xonly_pubkey || null)
    : null;

  const kit = {
    covex_recovery_kit_version: 2,
    note: 'Self-custody recovery data. This covenant is enforced by the Kaspa chain, not by Covex. With the redeem script below and the required key(s), the owner can build and broadcast the redeem transaction using ANY Kaspa node, independently of Covex. Contains no private keys.',
    covenant: {
      tx_id: covenant.tx_id || null,
      network: covenant.network || null,
      p2sh_address: covenant.address || null,
      redeem_kind: covenant.redeem_kind || null,
      redeem_script_hex: covenant.redeem_script_hex || null,
      script_hash: covenant.script_hash || null,
      receiving_addresses: covenant.receiving_addresses || null,
      lock_daa: covenant.lock_daa ?? null,
      // Honest claimability of this kind, so an offline holder knows what is self-claimable.
      offline_claimable: matrix ? matrix.offlineClaimable : null,
      liveness_note: matrix ? matrix.liveness : 'Unknown kind: obtain the redeem script and verify which branch you can satisfy.',
      // Which named key (or secret) plays which role on each branch.
      branch_roles: branchRoles,
      // The revealed outcome secret / preimage, ONLY when already public (e.g. a resolved
      // market leg). Null until revealed. Never a private key.
      revealed_secret: revealedSecret,
      // The disclosed Covex oracle x-only pubkey for oracle kinds (public; needed to verify the
      // oracle co-signature). Null for non-oracle kinds.
      oracle_pubkey: oraclePubkey,
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-lg glass-panel rounded-2xl border border-white/10 light:border-slate-300 p-5 sm:p-6 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-kaspa-green/10 border border-kaspa-green/25 flex items-center justify-center">
              <LifeBuoy size={17} className="text-kaspa-green" />
            </div>
            <div>
              <h2 id={titleId} className="text-base font-bold text-white leading-tight">Recover without Covex</h2>
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
            <span className="shrink-0 w-5 h-5 rounded-full bg-white/10 text-white light:bg-slate-200 light:text-slate-700 text-[10px] font-bold flex items-center justify-center mt-0.5">1</span>
            <div><span className="text-white font-semibold">Save this recovery kit</span> somewhere safe (it has the P2SH address and the exact redeem script). It contains <span className="text-white">no private keys</span>.</div>
          </div>
          <div className="flex items-start gap-2.5">
            <span className="shrink-0 w-5 h-5 rounded-full bg-white/10 text-white light:bg-slate-200 light:text-slate-700 text-[10px] font-bold flex items-center justify-center mt-0.5">2</span>
            <div>When the spend condition is met, query the covenant's UTXOs at its <span className="text-white">P2SH address</span> from any Kaspa node or explorer.</div>
          </div>
          <div className="flex items-start gap-2.5">
            <span className="shrink-0 w-5 h-5 rounded-full bg-white/10 text-white light:bg-slate-200 light:text-slate-700 text-[10px] font-bold flex items-center justify-center mt-0.5">3</span>
            <div>Build a spend that provides the <span className="text-white font-mono">redeem_script_hex</span> in the input and sign it with your own key (<KeyRound size={11} className="inline text-kaspa-green" /> never shared with anyone), then broadcast it. The chain accepts it because the script hashes to this covenant's commitment.</div>
          </div>
        </div>

        {covenant.redeem_script_hex ? (
          <button onClick={download} className="btn-shimmer mt-5 w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm bg-kaspa-green text-black hover:shadow-[0_0_24px_rgba(73,234,203,0.35)] active:scale-[0.985] transition-all">
            <Download size={16} /> Download recovery kit (JSON)
          </button>
        ) : (
          <div className="mt-5 rounded-xl border border-amber-500/20 light:border-amber-500/40 bg-amber-500/[0.05] light:bg-amber-50 p-3 text-[11px] text-amber-300/90 light:text-amber-700">
            The redeem script for this covenant is not on record yet (it was created elsewhere). Claim it on this page with its redeem script first, then the recovery kit becomes available.
          </div>
        )}
        <Link to={covenant.tx_id ? `/recover?id=${encodeURIComponent(String(covenant.tx_id).split(':')[0])}` : '/recover'} onClick={onClose} className="mt-3 w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-kaspa-green/25 bg-kaspa-green/[0.05] text-kaspa-green text-[12px] font-semibold hover:bg-kaspa-green/[0.1] hover:border-kaspa-green/40 transition-colors">
          Open the recovery page <ArrowRight size={13} />
        </Link>
        <a href="/tools/cold-recovery/" target="_blank" rel="noreferrer" className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-white/10 bg-white/[0.03] text-gray-300 text-[12px] font-semibold hover:border-kaspa-green/30 hover:text-kaspa-green transition-colors">
          <Snowflake size={13} /> Fully offline? Use the standalone cold-recovery tool
        </a>
        <p className="mt-2 text-center text-[10px] text-gray-500">The in-browser redeemer is live on the Recover page: paste the kit, sign with your wallet, broadcast through any Kaspa node. No Covex involvement required.</p>
      </div>
    </div>
  );
}
