import { AlertTriangle } from 'lucide-react';

/**
 * HonestLimits - the always-visible "What this does NOT prove" block, shown on EVERY
 * covenant kind's detail page (primitive, oracle/zk, chess + every other game, prediction
 * market). No click, no modal: the honest limits are right on the page body, matching the
 * covenant's true enforcement_reality.
 *
 * This is the discoverable, page-level twin of the "What this does not prove" Section that
 * lives inside TransparencyModal (only reachable via a TrustBadge click). The audit (CP-5)
 * found that chess and markets never rendered those limits discoverably - this fixes that.
 *
 * The honesty rules (Covex constitution):
 *   - oracle-attested : you trust the disclosed oracle for the outcome; funds are not
 *                       script-gated to its signature.
 *   - game            : server-authoritative engine + oracle-attested result; NOT ZK-proven.
 *   - on-chain        : a structural P2SH check here; the full redeem-script-hashes-to-
 *                       commitment rule is enforced by any Kaspa node at spend.
 *   - full-zk/hybrid  : the browser cannot re-run the Groth16 verifier; the oracle verifies
 *                       fail-closed (and the chain at spend for on-chain primitives).
 *   - decorative      : not consensus-enforced at all; a metadata marker only.
 *
 * `kind` lets a caller name the covenant kind explicitly so games ('game') and markets
 * ('market') get their precise copy even though their underlying reality is a generic
 * category. When omitted, the reality is read from the covenant.
 */

// A single binary_oracle_select covenant is one LEG of a parimutuel market: its custody
// is script-locked but the OUTCOME comes from the secret the disclosed oracle reveals, so
// it must keep the market caveats (oracle trust boundary), never drop them as bare on-chain.
const isMarketLeg = (covenant) => /binary_oracle_select/.test(covenant?.covenant_type || '');

function realityFromCovenant(covenant) {
  const r = covenant?.enforcement_reality;
  if (r) return r;
  const cfg = covenant?.custom_ui_config;
  const circuit = (typeof cfg === 'object' && cfg?.circuit) || null;
  const cat = `${covenant?.category || ''} ${covenant?.covenant_type || ''}`.toLowerCase();
  if ((circuit && circuit !== 'none') || /zk|oracle|chess|turn_timer|range|merkle|game|predict/.test(cat)) return 'oracle-attested';
  return 'decorative';
}

// Build the honest bullet list for a covenant. Every line is a thing this page does NOT
// guarantee - the opposite of marketing copy, by design.
function limitsFor({ reality, kind }) {
  const hasZk = reality === 'full-zk' || reality === 'hybrid';
  const involvesOracle = reality === 'oracle-attested' || reality === 'hybrid' || reality === 'full-zk';
  const lines = [];

  if (kind === 'game') {
    // Games are server-authoritative + oracle-attested. They are NOT ZK-proven end-to-end.
    lines.push('The game engine is server-authoritative: the moves and the final result are decided by the Covex server, not by Kaspa consensus.');
    lines.push('The result is oracle-attested, NOT zero-knowledge-proven on-chain. You are trusting the disclosed oracle to attest the winner honestly; the chain does not independently verify the play.');
    lines.push('A reachable oracle now does not prove a future game will be judged honestly. The disclosed oracle key is the trust boundary for the outcome.');
  } else if (kind === 'market') {
    // Parimutuel bundle: branches ARE enforced on-chain (hashlock + key sig), but the
    // OUTCOME assignment comes from which single secret the oracle reveals.
    lines.push('Custody and payouts are on-chain (each leg is a P2SH covenant gated by a hashlock and the winner\'s key), but WHICH outcome wins is decided by which committed secret the disclosed oracle reveals - the chain does not judge the real-world event.');
    lines.push('A correct prediction is not guaranteed to profit: the house fee and the loser rebate mean you can be right about the outcome and still lose KAS. See the economics warning above.');
    lines.push('Covex is trusted to reveal the secret for the true result. Once revealed, every funded leg settles through any Kaspa node with no further trust in Covex.');
  } else {
    // Primitive / oracle / zk covenant - reality-driven copy.
    if (hasZk) lines.push('The browser cannot re-run the Groth16 verifier. Proof verification is performed by the disclosed oracle (fail-closed) and, for on-chain primitives, by Kaspa at spend.');
    if (involvesOracle) lines.push('A reachable oracle now does not prove a future outcome will be honest. You are trusting the disclosed oracle key for the input; funds are not script-gated to its signature.');
    if (reality === 'on-chain') lines.push('The check shown on this page is structural (the P2SH lock pattern). The full redeem-script-hashes-to-commitment rule is enforced by any Kaspa node at spend, not by this page.');
    if (reality === 'decorative') lines.push('This covenant is NOT enforced by Kaspa consensus. It is a metadata marker only - do not rely on it for value at stake.');
  }

  // True for every kind: the label is computed by Covex; the chain itself is final authority.
  lines.push('The enforcement label is computed by Covex from the on-chain script. The Kaspa BlockDAG itself is the final authority - always verify the addresses, amounts, and script on the block explorer.');
  return lines;
}

export default function HonestLimits({ covenant, kind, className = 'mb-6' }) {
  const reality = realityFromCovenant(covenant);
  // A market leg always keeps the market caveats, even if the caller did not name the kind.
  const effectiveKind = kind || (isMarketLeg(covenant) ? 'market' : undefined);
  const lines = limitsFor({ reality, kind: effectiveKind });

  return (
    <div className={className}>
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle size={14} className="text-amber-400 light:text-amber-700" />
        <h3 className="text-xs font-mono text-gray-300 uppercase tracking-widest">What this does NOT prove</h3>
      </div>
      <div className="rounded-xl border border-amber-500/25 light:border-amber-500/40 bg-amber-500/[0.05] light:bg-amber-50 p-4">
        <ul className="list-disc pl-4 space-y-1.5 text-[12.5px] text-amber-200/90 light:text-amber-800 leading-relaxed">
          {lines.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
