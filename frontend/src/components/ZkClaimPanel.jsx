/* eslint-disable react-refresh/only-export-components -- this module intentionally co-exports its component(s) with related constants/hooks/helpers (e.g. a Provider plus its useX hook). That only affects dev Fast Refresh granularity, never the production build or tests; splitting these into separate files is not warranted here. */
import { useState, useMemo } from 'react';
import { ShieldCheck, Cpu, Loader, CheckCircle2, XCircle, Lock, Info, Eye, EyeOff } from '../lib/routeIcons.js';
import { isVerifiedFullZk } from '../lib/zk/circuits';
import { PROVERS, circuitTypeFor, proveInBrowser } from '../lib/zk/provers';
import { REALITY_HEADLINE, REALITY_BODY } from '../lib/enforcement-copy';

/**
 * buildOraclePayload - pure builder for the /api/oracle/verify-and-sign request body.
 *
 * Extracted so the documented payload shape (covenant_id binding, circuit_type, the
 * Groth16 proof, and the public_inputs as strings) is verifiable in unit tests
 * WITHOUT a DOM. The component's handleSubmit uses this exact function below;
 * tests assert the shape on the function the production code path runs.
 */
export function buildOraclePayload({ covenantId, circuitType, proof, publicSignals }) {
  return {
    covenant_id: covenantId,
    circuit_type: circuitType,
    proof,
    public_inputs: (publicSignals || []).map((s) => s.toString()),
  };
}

/**
 * ZkClaimPanel - the PUBLIC, any-visitor ZK prove + claim panel on a covenant detail page.
 *
 * Replaces the old creator-only lock. For ANY covenant whose circuit is genuinely in
 * VERIFIED_FULL_ZK (a real served zkey + a working in-browser prover), this panel lets the
 * visitor:
 *   1. generate a real Groth16 proof IN THEIR BROWSER, bound to THIS covenant_id (H4), so the
 *      secret witness never leaves the device - only { proof, publicSignals } are produced;
 *   2. inspect the public signals before submitting;
 *   3. POST { circuit_type, proof, public_inputs, covenant_id } to the cosign endpoint;
 *   4. on success, see the cosigner's co-signature, with an HONEST explanation that the proof
 *      was verified OFF-CHAIN (by you, the counterparty, or any external verifier - snarkjs
 *      against the audited vkey) and that a valid proof gates a 2-of-2 cosign + CSV timeout,
 *      so the visitor can now spend the gated covenant branch.
 *
 * HONESTY ABSOLUTE: the copy never says trustless or on-chain ZK. Kaspa has NO on-chain pairing
 * verifier, so the proof is never checked on-chain; it is verifiable off-chain by anyone via
 * snarkjs against the public vkey, and payout gates on a 2-of-2 cosign + CSV timeout. On an
 * invalid or tampered proof the cosign endpoint refuses (success:false) and the panel shows the
 * failure plainly. The panel renders ONLY for circuits in VERIFIED_FULL_ZK.
 */
export default function ZkClaimPanel({ covenant }) {
  const covenantId = covenant?.tx_id || '';
  // The circuit this covenant declared (from its terminal config). null/none => no ZK panel.
  const circuitId = useMemo(() => {
    const cfg = covenant?.custom_ui_config;
    const c = (typeof cfg === 'object' && cfg?.circuit) || null;
    return c && c !== 'none' ? c : null;
  }, [covenant]);

  const [status, setStatus] = useState('idle'); // idle | proving | proved | submitting | done | error
  const [proofObj, setProofObj] = useState(null);
  const [publicSignals, setPublicSignals] = useState(null);
  const [oracleResult, setOracleResult] = useState(null);
  const [errMsg, setErrMsg] = useState('');
  const [showSignals, setShowSignals] = useState(true);

  // Render guard: ONLY for genuine full-zk circuits with a working in-browser prover + a covenant id.
  if (!covenantId || !isVerifiedFullZk(circuitId) || !PROVERS[circuitId]) return null;

  const meta = PROVERS[circuitId];
  const circuitType = circuitTypeFor(circuitId);
  // HONESTY: no deployed circuit's ZK proof is bound to a chain-checked hashlock. Every
  // in-browser-provable circuit is full-zk: a real Groth16 proof verified OFF-CHAIN (by you,
  // the counterparty, or any external verifier - snarkjs against the audited vkey). For the
  // circom suite the proof is verified off-chain; a valid proof gates a 2-of-2 cosign + CSV timeout.
  const realityKey = 'full-zk';
  const realityHeadline = REALITY_HEADLINE[realityKey];
  const realityBody = REALITY_BODY[realityKey];

  const reset = () => {
    setProofObj(null); setPublicSignals(null); setOracleResult(null);
    setErrMsg(''); setStatus('idle');
  };

  // Step 1: prove in-browser, bound to this covenant (H4). The witness stays in the browser.
  const handleProve = async () => {
    setStatus('proving'); setErrMsg(''); setOracleResult(null); setProofObj(null); setPublicSignals(null);
    try {
      const { proof, publicSignals: signals } = await proveInBrowser(circuitId, covenantId);
      setProofObj(proof);
      setPublicSignals(signals);
      setStatus('proved');
    } catch (e) {
      // Never fabricate a proof. Surface the real error.
      setErrMsg(`In-browser proof generation failed: ${e?.message || e}. No proof was produced; nothing fake is ever submitted.`);
      setStatus('error');
    }
  };

  // Step 2: submit the real proof for the 2-of-2 cosign. The proof is verified off-chain
  // (fail-closed) and the release is co-signed ONLY for a genuinely valid proof. A
  // tampered/invalid proof returns success:false.
  const handleSubmit = async () => {
    if (!proofObj || !publicSignals) return;
    setStatus('submitting'); setErrMsg(''); setOracleResult(null);
    try {
      const res = await fetch('/api/oracle/verify-and-sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildOraclePayload({
          covenantId,
          circuitType,
          proof: proofObj,
          publicSignals,
        })),
      });
      const data = await res.json();
      setOracleResult(data);
      setStatus('done');
    } catch (e) {
      setErrMsg(`Cosign request failed: ${e?.message || e}`);
      setStatus('error');
    }
  };

  const proving = status === 'proving';
  const submitting = status === 'submitting';
  const success = status === 'done' && oracleResult?.success;
  const refused = status === 'done' && oracleResult && !oracleResult.success;

  return (
    <div className="mb-6 rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.04] p-5">
      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
        <ShieldCheck size={16} className="text-emerald-300" />
        <span className="text-xs font-extrabold uppercase tracking-[0.14em] text-emerald-300">
          Off-chain ZK proof claim · {meta.label}
        </span>
      </div>

      {/* Per-circuit enforcement reality: the proof is verified off-chain by anyone, and a valid
          proof gates a 2-of-2 cosign + CSV timeout. */}
      <div className="mb-3 rounded-xl border p-3 border-amber-500/30 bg-amber-500/[0.05]">
        <div className="flex items-center gap-1.5 mb-1">
          <Lock size={13} className="text-amber-300" />
          <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-amber-200">
            {realityHeadline}
          </span>
        </div>
        <p className="text-[12.5px] leading-relaxed text-amber-100/90">
          Your proof is verified off-chain (by you, the counterparty, or any external verifier -
          snarkjs against the audited vkey). For this circom circuit the proof is verified off-chain, so a valid
          proof gates a 2-of-2 cosign + CSV timeout rather than being checked on-chain.
        </p>
        <p className="mt-1.5 text-[11.5px] text-gray-400 leading-relaxed">
          {realityBody}
        </p>
      </div>

      <p className="text-[12.5px] text-gray-300 leading-relaxed mb-1">
        {meta.note}
      </p>
      <p className="text-[12.5px] text-gray-400 leading-relaxed mb-4">
        Anyone can run this here. The circuit's prover runs in your browser on its example statement,
        binds the proof to this exact covenant (so it cannot be replayed onto another), and submits
        only the proof and its public signals (never the witness). The proof is then verified
        off-chain, fail-closed, and the release is co-signed only if it is genuinely valid.
      </p>

      {/* Step 1: prove in-browser */}
      <div className="flex flex-wrap items-center gap-2.5">
        <button
          onClick={handleProve}
          disabled={proving || submitting}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/15 border border-emerald-500/40 px-4 py-2.5 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/25 transition-colors disabled:opacity-50"
        >
          {proving ? <Loader size={15} className="animate-spin" /> : <Cpu size={15} />}
          {proving ? 'Proving in your browser...' : (proofObj ? 'Re-generate proof' : 'Generate proof in browser')}
        </button>

        {/* Step 2: submit the proof for the 2-of-2 cosign (only after a proof exists) */}
        {proofObj && (
          <button
            onClick={handleSubmit}
            disabled={submitting || proving}
            className="inline-flex items-center gap-2 rounded-xl bg-[#3B82F6]/15 border border-[#3B82F6]/40 px-4 py-2.5 text-sm font-semibold text-blue-200 hover:bg-[#3B82F6]/25 transition-colors disabled:opacity-50"
          >
            {submitting ? <Loader size={15} className="animate-spin" /> : <Lock size={15} />}
            {submitting ? 'Verifying proof...' : 'Submit proof for 2-of-2 cosign'}
          </button>
        )}

        {(proofObj || oracleResult || errMsg) && (
          <button onClick={reset} className="text-xs text-gray-400 hover:text-gray-200 underline underline-offset-2">
            reset
          </button>
        )}
      </div>

      {/* The proof's public signals - shown before submission so the visitor can inspect them. */}
      {publicSignals && (
        <div className="mt-4 rounded-xl border border-white/[0.08] bg-black/30 p-3.5">
          <button
            onClick={() => setShowSignals((v) => !v)}
            className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-gray-400 hover:text-gray-200"
          >
            {showSignals ? <EyeOff size={12} /> : <Eye size={12} />} Public signals ({publicSignals.length})
          </button>
          {showSignals && (
            <div className="mt-2 space-y-1">
              {publicSignals.map((s, i) => (
                <div key={i} className="font-mono text-[11px] text-emerald-200/90 break-all">
                  [{i}] {s.toString()}
                </div>
              ))}
              <p className="text-[11px] text-gray-500 pt-1.5 leading-relaxed">
                The last signal binds this proof to sha256(covenant_id) mod BN254, so it cannot be
                replayed onto another covenant. The secret witness is not among these signals and
                never left your browser.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Honest error (proving or network failure) */}
      {status === 'error' && errMsg && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-3">
          <XCircle size={15} className="text-amber-300 mt-0.5 shrink-0" />
          <p className="text-[12.5px] text-amber-200/90 leading-relaxed">{errMsg}</p>
        </div>
      )}

      {/* Cosign refused (e.g. tampered / invalid proof): shown honestly, no co-signature. */}
      {refused && (
        <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-3.5">
          <div className="flex items-center gap-2 mb-1">
            <XCircle size={15} className="text-amber-300" />
            <span className="text-xs font-bold text-amber-200">Cosign refused</span>
          </div>
          <p className="text-[12.5px] text-amber-200/90 leading-relaxed">
            The proof was verified off-chain and it did not check out, so no co-signature was
            issued. This is the fail-closed path: an invalid or tampered proof never gets a
            co-signature.
          </p>
          {oracleResult?.error && (
            <p className="mt-1.5 font-mono text-[11px] text-amber-300/80 break-all">{oracleResult.error}</p>
          )}
        </div>
      )}

      {/* A genuinely valid proof was verified off-chain and the release was co-signed. */}
      {success && (
        <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] p-3.5">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 size={15} className="text-emerald-300" />
            <span className="text-xs font-bold text-emerald-200">Proof verified off-chain and co-signed</span>
          </div>
          <p className="text-[12.5px] text-gray-300 leading-relaxed mb-3">
            This Groth16 proof was verified off-chain (snarkjs plus the served verification key -
            you, the counterparty, or any external verifier can re-run it), fail-closed, and a
            BIP340 Schnorr co-signature was issued. This co-signature is combined with the
            claimant's own wallet signature and the covenant's other script conditions to spend its
            ZK-gated branch; it is not a transfer of funds by itself. Payout gates on a 2-of-2
            cosign plus a CSV timeout, not on an on-chain proof check; Kaspa has no on-chain pairing
            verifier, so the proof is not chain-enforced.
          </p>
          {oracleResult?.outcome != null && (
            <div className="mb-2">
              <div className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-gray-500 mb-0.5">Outcome</div>
              <div className="font-mono text-[12px] text-white">{String(oracleResult.outcome)}</div>
            </div>
          )}
          {oracleResult?.signature && (
            <div className="mb-2">
              <div className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-gray-500 mb-0.5">Cosigner signature</div>
              <div className="font-mono text-[11px] text-emerald-300 break-all">{oracleResult.signature}</div>
            </div>
          )}
          {oracleResult?.message && (
            <div className="mb-2">
              <div className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-gray-500 mb-0.5">Signed message</div>
              <div className="font-mono text-[11px] text-blue-300 break-all">{oracleResult.message}</div>
            </div>
          )}
          {oracleResult?.timestamp != null && (
            <div>
              <div className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-gray-500 mb-0.5">Timestamp</div>
              <div className="font-mono text-[11px] text-white">{String(oracleResult.timestamp)}</div>
            </div>
          )}
        </div>
      )}

      <div className="mt-3 flex items-start gap-1.5">
        <Info size={12} className="text-gray-500 mt-0.5 shrink-0" />
        <p className="text-[11px] text-gray-500 leading-relaxed">
          Circuit type submitted: <span className="font-mono text-gray-400">{circuitType}</span>. The
          trusted setup is a single-contributor dev ceremony (pot10), not a production MPC. Verification
          happens off-chain (anyone can re-run it against the public vkey); Kaspa has no on-chain
          pairing verifier.
        </p>
      </div>
    </div>
  );
}
