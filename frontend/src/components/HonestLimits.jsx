import { AlertTriangle } from '../lib/routeIcons.js';

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
 *   - oracle-attested : you trust a deployer-bound external resolver for the outcome; funds
 *                       are not script-gated to its signature. Covex never attests outcomes.
 *   - game            : deterministic move-log replay + a counterparty / deployer-bound
 *                       resolver co-sign; NOT ZK-proven.
 *   - on-chain        : a structural P2SH check here; the full redeem-script-hashes-to-
 *                       commitment rule is enforced by any Kaspa node at spend.
 *   - full-zk/hybrid  : the proof is verified OFF-CHAIN by you, the counterparty, or any
 *                       external verifier (snarkjs against the served vkey), fail-closed; a
 *                       valid proof gates a 2-of-2 cosign (the circom proof is verified off-chain).
 *   - decorative      : not consensus-enforced at all; a metadata marker only.
 *
 * `kind` lets a caller name the covenant kind explicitly so games ('game') and markets
 * ('market') get their precise copy even though their underlying reality is a generic
 * category. When omitted, the reality is read from the covenant.
 */

// A single binary_oracle_select covenant is one LEG of a parimutuel market: its custody
// is script-locked but the OUTCOME comes from the secret a deployer-bound external resolver
// reveals, so it must keep the market caveats (resolver trust boundary), never drop them as
// bare on-chain.
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
    // Games resolve by deterministic move-log replay + a counterparty / deployer-bound
    // resolver co-sign. They are NOT ZK-proven end-to-end.
    lines.push('The result is computed deterministically by replaying the signed move log (anyone can recompute it), not by Kaspa consensus deciding the play.');
    lines.push('Release is NOT zero-knowledge-proven on-chain: it gates on a co-signature from the counterparty or a deployer-bound external resolver. The chain does not independently verify the game.');
    lines.push('A reachable resolver now does not prove a future game will be co-signed honestly. The counterparty / deployer-bound resolver is the trust boundary for the outcome; refund and CSV-timeout branches stay self-claimable.');
  } else if (kind === 'market') {
    // Parimutuel bundle: branches ARE enforced on-chain (hashlock + key sig), but the
    // OUTCOME assignment comes from which single secret a deployer-bound external resolver reveals.
    lines.push('Custody and payouts are on-chain (each leg is a P2SH covenant gated by a hashlock and the winner\'s key), but WHICH outcome wins is decided by which committed secret a deployer-bound external resolver reveals - the chain does not judge the real-world event, and Covex never attests real-world facts.');
    lines.push('A correct prediction is not guaranteed to profit: the pool fee and the loser rebate mean you can be right about the outcome and still lose KAS. See the economics warning above.');
    lines.push('You are trusting the deployer-bound resolver (bound by pubkey at deploy) to reveal the secret for the true result. Once revealed, every funded leg settles through any Kaspa node with no further trust in the resolver.');
  } else {
    // Primitive / oracle / zk covenant - reality-driven copy.
    if (hasZk) lines.push('The proof is verified OFF-CHAIN (by you, the counterparty, or any external verifier - snarkjs against the served vkey, fail-closed); for the circom suite the proof is verified off-chain, so a valid proof gates a 2-of-2 cosign rather than being checked on-chain.');
    if (involvesOracle) lines.push('A reachable resolver now does not prove a future outcome will be honest. You are trusting a deployer-bound external resolver for the input; funds are not script-gated to its signature, and Covex never attests outcomes.');
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
