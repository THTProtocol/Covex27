import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import {
  X, ShieldCheck, Radio, Link2, ShieldQuestion, ExternalLink, Check, Copy,
  FileKey, Cpu, AlertTriangle, Activity, BadgeCheck,
} from 'lucide-react';
import { explorerAddressUrl, explorerTxUrl } from '../lib/explorer';
import { vkeyPathFor, IN_BROWSER_PROVERS } from '../lib/zk/circuits';

/**
 * TransparencyModal - press any ZK / resolver / enforcement badge to see, in plain terms:
 *   what it is · where verification actually happens · the source you can inspect · a live check.
 *
 * Honest by construction: every claim is grounded in a real endpoint or served artifact, and the
 * panel is explicit about what CANNOT be proven in the browser. Two modes:
 *   - circuit  : opened from a sandbox/terminal circuit badge   (props.circuit = { id, name, reality, ... })
 *   - covenant : opened from an explorer / detail TrustBadge     (props.covenant = the covenant object)
 */

// The 14 circuits with a real, working in-browser Groth16 prover are now defined once in
// lib/zk/circuits.js (IN_BROWSER_PROVERS) and imported above, so this modal can never drift
// out of sync with the terminal / OnChainLockSection / ZkClaimPanel.

const REALITY_UI = {
  'on-chain': { name: 'On-chain enforced', accent: '#34d399', Icon: ShieldCheck,
    what: 'Kaspa consensus enforces the spend condition. The funds are locked to a P2SH script and only a redeem script that hashes to the on-chain commitment can move them. No resolver, no trust in Covex.' },
  // KIP-16 on-chain-ZK (zk_game_settle): teal accent, distinct from the off-chain full-zk tier.
  // Testnet / Toccata gated: the OpZkPrecompile opcode is not live on Kaspa mainnet yet.
  'on-chain-zk': { name: 'On-chain ZK (KIP-16)', accent: '#2dd4bf', Icon: ShieldCheck,
    what: 'On-chain ZK (KIP-16): a real Groth16 proof is verified by Kaspa consensus through the OpZkPrecompile opcode (0xa6). The proof binds this covenant and the winning payee, so a loser cannot forge a winning proof, and there is no oracle and no co-signature anywhere in the payout. This is the zk_game_settle kind. It is testnet-gated until proven live (the opcode is not live on Kaspa mainnet yet).' },
  'full-zk': { name: 'Resolver-attested', accent: '#fbbf24', Icon: Radio,
    what: 'A real Groth16 proof: you prove a statement is true without revealing the secret behind it. The proof is verified OFF-CHAIN by you, the counterparty, or any external verifier (snarkjs against the audited vkey), and a valid proof gates a 2-of-2 cosign plus a CSV timeout. Kaspa has no on-chain pairing verifier, so the proof is never checked on-chain; only the BIP340 co-signature is verified on-chain (Schnorr). The trusted setup is a single-contributor dev ceremony, not a production multi-party MPC. Covex never attests the outcome - the deployer-bound resolver or counterparty co-signs.' },
  hybrid: { name: 'Resolver-attested', accent: '#fbbf24', Icon: Radio,
    what: 'A required Groth16 proof is verified OFF-CHAIN by you, the counterparty, or any external verifier (fail-closed: a missing or invalid proof is rejected), and the deployer-bound resolver then co-signs the consensus-required input. Only the co-signature is checked on-chain (Schnorr); the proof itself is never verified on-chain (Kaspa has no on-chain pairing verifier). The trusted setup is a single-contributor dev ceremony, not a production multi-party MPC.' },
  market: { name: 'On-chain custody, resolver-decided', accent: '#60a5fa', Icon: Link2,
    what: 'A parimutuel market. Custody and every payout leg are on-chain (each leg is a P2SH covenant gated by a hashlock and the winner\'s key), but which outcome wins is set by the single committed secret the deployer-bound resolver reveals (an external oracle provider the deployer binds by pubkey at deploy; Covex never attests real-world facts). On-chain-enforced, not trustless: you trust the named resolver to reveal the secret for the true result.' },
  'oracle-attested': { name: 'Resolver-attested', accent: '#fbbf24', Icon: Radio,
    what: 'The deployer-bound resolver attests the outcome with a BIP340 Schnorr signature (an external resolver the deployer chooses by pubkey at deploy; Covex never attests real-world facts). Your covenant can verify that signature on-chain at spend time. You trust the named resolver for the input, not Covex with custody.' },
  decorative: { name: 'Metadata only', accent: '#9ca3af', Icon: ShieldQuestion,
    what: 'A metadata marker. The chain records this covenant but does not enforce the stated logic. Not for value at stake.' },
};

// A single binary_oracle_select covenant is one LEG of a parimutuel market: it gets the
// market framing, never the bare on-chain "no oracle, no trust in Covex" copy.
const isMarketLeg = (covenant) => /binary_oracle_select/.test(covenant?.covenant_type || '');

// KIP-16 on-chain-ZK detection (mirrors TrustBadge.isZkGameSettle): the redeem kind string is
// "zk_game_settle" (optionally ":<min_sequence>"), and a live game pot may carry settle_mode too.
const isZkGameSettle = (covenant) =>
  /(^|[^a-z])zk_game_settle/.test(
    `${covenant?.redeem_kind || ''} ${covenant?.covenant_type || ''} ${covenant?.kind || ''} ${covenant?.settle_mode || ''}`,
  );

function realityFromCovenant(covenant) {
  // On-chain-ZK (KIP-16 zk_game_settle) is its own tier: honor the explicit reality or the kind
  // string. Verified by Kaspa consensus, no oracle in the loop, so it precedes the market/oracle paths.
  if (covenant?.enforcement_reality === 'on-chain-zk' || isZkGameSettle(covenant)) return 'on-chain-zk';
  // Markets get their own honest framing: on-chain custody, resolver-decided outcome.
  if (covenant?.covenant_type === 'prediction-market' || isMarketLeg(covenant)) return 'market';
  const cfg = covenant?.custom_ui_config;
  const circuit = (typeof cfg === 'object' && cfg?.circuit) || null;
  const r = covenant?.enforcement_reality;
  // All verified ZK circuits are full-zk (a real Groth16 proof verified OFF-CHAIN by any
  // external verifier, gating a 2-of-2 cosign + CSV timeout). Kaspa has no on-chain
  // pairing verifier, so there is no chain-enforced ZK reality. Mirrors
  // TrustBadge.trustInfo so the badge and modal never disagree.
  if (r && REALITY_UI[r]) return r;
  // honest fallback matching TrustBadge.trustInfo
  const cat = `${covenant?.category || ''} ${covenant?.covenant_type || ''}`.toLowerCase();
  if (circuit && circuit !== 'none') return 'oracle-attested';
  if (/zk|oracle|chess|turn_timer|range|merkle|game|predict/.test(cat)) return 'oracle-attested';
  return 'decorative';
}

export function CopyChip({ text, mono = true }) {
  const [done, setDone] = useState(false);
  if (!text) return null;
  return (
    <button
      onClick={() => { navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1400); }); }}
      className={`group inline-flex items-center gap-1.5 max-w-full rounded-lg border border-white/10 light:border-slate-200 bg-black/30 light:bg-slate-50 px-2.5 py-1.5 text-left transition-colors hover:border-kaspa-green/40 ${mono ? 'font-mono' : ''}`}
      title="Copy"
    >
      <span className="text-[11px] text-gray-300 light:text-slate-600 break-all leading-snug">{text}</span>
      {done ? <Check size={12} className="text-kaspa-green shrink-0" /> : <Copy size={12} className="text-gray-500 group-hover:text-kaspa-green shrink-0" />}
    </button>
  );
}

export function Section({ icon: Icon, title, children, accent }) {
  return (
    <div className="rounded-xl border border-white/[0.07] light:border-slate-200 bg-white/[0.02] light:bg-white p-3.5">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={13} style={{ color: accent || '#49EACB' }} />
        <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-gray-400 light:text-slate-500">{title}</span>
      </div>
      <div className="space-y-2 text-[12.5px] text-gray-300 light:text-slate-600 leading-relaxed">{children}</div>
    </div>
  );
}

export default function TransparencyModal({ circuit, covenant, onClose }) {
  const reality = circuit ? (circuit.reality || 'oracle-attested') : realityFromCovenant(covenant);
  const ui = REALITY_UI[reality] || REALITY_UI['oracle-attested'];
  const circuitId = circuit?.id || (typeof covenant?.custom_ui_config === 'object' ? covenant?.custom_ui_config?.circuit : null) || null;
  const title = circuit?.name || covenant?.name || covenant?.covenant_type || 'Covenant';

  const involvesOracle = reality === 'oracle-attested' || reality === 'hybrid' || reality === 'full-zk' || reality === 'market';
  const hasZk = reality === 'full-zk' || reality === 'hybrid';
  const inBrowser = circuitId && IN_BROWSER_PROVERS.has(circuitId);
  const vkeyPath = hasZk && circuitId ? vkeyPathFor(circuitId) : null;

  const scriptHex = String(covenant?.script_hex || '').toLowerCase();
  const p2shStructural = /^aa20[0-9a-f]{64}87$/.test(scriptHex);

  const [oracle, setOracle] = useState({ loading: involvesOracle, pubkey: null, liveness: null, error: null });

  useEffect(() => {
    if (!involvesOracle) return undefined;
    const ac = new AbortController();
    (async () => {
      try {
        const [p, l] = await Promise.all([
          fetch('/api/oracle/pubkey', { signal: ac.signal }).then((r) => r.json()),
          fetch('/api/oracle/liveness', { signal: ac.signal }).then((r) => r.json()),
        ]);
        setOracle({ loading: false, pubkey: p, liveness: l, error: null });
      } catch (e) {
        if (e.name !== 'AbortError') setOracle({ loading: false, pubkey: null, liveness: null, error: 'Could not reach the resolver endpoint.' });
      }
    })();
    return () => ac.abort();
  }, [involvesOracle]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const network = covenant?.network;

  return createPortal(
    <div className="fixed inset-0 z-[100000] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150" onClick={onClose}>
      <div
        className="glass-panel relative w-full sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-white/10 light:border-slate-200 animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="covex-aurora" style={{ top: 0, left: 0, right: 0, marginLeft: 'auto', marginRight: 'auto', width: '70%', height: 160, maxWidth: '90vw', opacity: 0.5 }} aria-hidden="true" />

        {/* Header */}
        <div className="relative z-10 flex items-start gap-3 p-5 border-b border-white/[0.07] light:border-slate-200">
          <span className="shrink-0 w-11 h-11 rounded-xl flex items-center justify-center border" style={{ background: `${ui.accent}1a`, borderColor: `${ui.accent}55` }}>
            <ui.Icon size={20} style={{ color: ui.accent }} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-base font-black text-white light:text-slate-900 leading-tight truncate">{title}</div>
            <span className="inline-flex items-center gap-1.5 mt-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border" style={{ color: ui.accent, borderColor: `${ui.accent}55`, background: `${ui.accent}14` }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: ui.accent }} /> {ui.name}
              {circuitId && <span className="text-gray-500 light:text-slate-600 font-mono normal-case tracking-normal">· {circuitId}</span>}
            </span>
          </div>
          <button onClick={onClose} className="shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-white light:hover:text-slate-900 hover:bg-white/5" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="relative z-10 p-5 space-y-3">
          {/* What this is */}
          <Section icon={BadgeCheck} title="What this is" accent={ui.accent}>
            <p>{ui.what}</p>
          </Section>

          {/* Where it is verified */}
          <Section icon={Cpu} title="Where verification happens" accent={ui.accent}>
            {reality === 'on-chain' && <p>At spend time, Kaspa nodes run the redeem script against this covenant&apos;s P2SH lock. If it does not satisfy the script, the network rejects the transaction. Covex is never in the spend path.</p>}
            {reality === 'on-chain-zk' && <p>At spend time, Kaspa nodes run the covenant&apos;s OpZkPrecompile (0xa6) over the witness-supplied Groth16 proof against the baked verifying key and public inputs. Consensus aborts the spend unless the proof verifies, so the winner branch releases only on a valid proof and a loser cannot forge one. No oracle and no co-signature are involved. This path is testnet-gated: the opcode is not live on Kaspa mainnet yet.</p>}
            {reality === 'full-zk' && (
              <p>
                {inBrowser
                  ? 'The proof is generated in your browser (snarkjs, over the served circuit) so your secret never leaves your device, '
                  : 'A Groth16 proof is generated against the served circuit, '}
                then verified off-chain by you, the counterparty, or any external verifier (snarkjs against the audited vkey) before any co-signature is issued. Kaspa has no on-chain pairing verifier, so a valid proof gates a 2-of-2 cosign plus a CSV timeout. An invalid or missing proof is rejected.
              </p>
            )}
            {reality === 'hybrid' && <p>The Groth16 proof is verified off-chain by you, the counterparty, or any external verifier (a missing or invalid proof is rejected), and the deployer-bound resolver then co-signs the consensus-required input so the covenant can release.</p>}
            {reality === 'market' && <p>Each funded leg is a P2SH covenant: at spend time Kaspa nodes enforce that only the matching hashlock preimage plus the winner&apos;s signature can move it. The deployer-bound resolver decides the outcome by revealing one committed secret (single-secret policy) - the chain enforces custody and payout, the resolver is the trust boundary for which side wins. Covex never attests real-world facts.</p>}
            {reality === 'oracle-attested' && <p>The deployer-bound resolver signs the outcome with a BIP340 key (an external resolver the deployer binds by pubkey at deploy). Your covenant verifies that signature on-chain (OpCheckSig) at spend, so you only have to trust the named resolver for the input.</p>}
            {reality === 'decorative' && <p>Nothing enforces this on-chain. It is a recorded marker only. Treat the stated logic as a label, not a guarantee.</p>}
          </Section>

          {/* Source you can inspect */}
          {(vkeyPath || (involvesOracle && oracle.pubkey?.xonly_pubkey) || (covenant && scriptHex)) && (
            <Section icon={FileKey} title="Source you can inspect" accent={ui.accent}>
              {vkeyPath && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 light:text-slate-500 mb-1">Verification key (Groth16)</div>
                  <a href={vkeyPath} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[11px] font-mono text-kaspa-green hover:underline break-all">
                    {vkeyPath} <ExternalLink size={11} className="shrink-0" />
                  </a>
                  {inBrowser && <div className="text-[11px] text-gray-500 light:text-slate-500 mt-1">In-browser prover available · wasm + zkey served alongside this key.</div>}
                </div>
              )}
              {involvesOracle && oracle.pubkey?.xonly_pubkey && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 light:text-slate-500 mb-1">Resolver public key ({oracle.pubkey.scheme || 'bip340-schnorr-secp256k1'})</div>
                  <CopyChip text={oracle.pubkey.xonly_pubkey} />
                  {oracle.pubkey.message_format && <div className="text-[11px] text-gray-500 light:text-slate-500 mt-1.5">Signs: <span className="font-mono text-gray-300 light:text-slate-600">{oracle.pubkey.message_format}</span></div>}
                </div>
              )}
              {covenant && scriptHex && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 light:text-slate-500 mb-1">On-chain lock script</div>
                  <CopyChip text={scriptHex} />
                  <div className={`text-[11px] mt-1.5 inline-flex items-center gap-1.5 ${p2shStructural ? 'text-kaspa-green' : 'text-amber-300'}`}>
                    {p2shStructural ? <Check size={12} /> : <AlertTriangle size={12} />}
                    {p2shStructural
                      ? 'Well-formed P2SH lock (OP_BLAKE2B · 32-byte script hash · OP_EQUAL). Only a redeem script hashing to this exact value can spend it.'
                      : 'Not a standard 35-byte P2SH lock pattern.'}
                  </div>
                </div>
              )}
            </Section>
          )}

          {/* Live resolver status */}
          {involvesOracle && (
            <Section icon={Activity} title="Live resolver status" accent={ui.accent}>
              {oracle.loading && <p className="text-gray-500 light:text-slate-500">Checking the resolver…</p>}
              {oracle.error && <p className="text-amber-300">{oracle.error}</p>}
              {oracle.liveness && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-1 rounded-lg border ${oracle.liveness.signing_available ? 'text-kaspa-green border-kaspa-green/40 bg-kaspa-green/10' : 'text-amber-300 border-amber-500/40 bg-amber-500/10'}`}>
                    <span className="relative flex h-1.5 w-1.5">
                      {oracle.liveness.signing_available && <span className="absolute inline-flex h-full w-full rounded-full bg-kaspa-green opacity-60 animate-ping" />}
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: oracle.liveness.signing_available ? '#49EACB' : '#fbbf24' }} />
                    </span>
                    {oracle.liveness.signing_available ? 'Signing available' : 'Signing unavailable'}
                  </span>
                  <span className="text-[11px] text-gray-400 light:text-slate-500">
                    {oracle.liveness.operators ?? '?'} operator{oracle.liveness.operators === 1 ? '' : 's'} · threshold {oracle.liveness.threshold ?? '?'}
                    {oracle.liveness.multi_oracle === false && ' · single-operator (federation is roadmap)'}
                  </span>
                </div>
              )}
            </Section>
          )}

          {/* Verify on-chain (covenant mode) */}
          {covenant && (covenant.address || covenant.tx_id) && (
            <Section icon={ExternalLink} title="Verify on-chain" accent={ui.accent}>
              <p className="mb-1">See the real UTXO and amounts on the Kaspa block explorer:</p>
              <div className="flex flex-wrap gap-2">
                {covenant.address && (
                  <a href={explorerAddressUrl(covenant.address, network)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-kaspa-green hover:underline">
                    Address <ExternalLink size={11} />
                  </a>
                )}
                {covenant.tx_id && (
                  <a href={explorerTxUrl(covenant.tx_id, network)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-kaspa-green hover:underline">
                    Transaction <ExternalLink size={11} />
                  </a>
                )}
              </div>
            </Section>
          )}

          {/* Honest limits */}
          <Section icon={AlertTriangle} title="What this does not prove" accent="#9ca3af">
            <ul className="list-disc pl-4 space-y-1 text-[12px] text-gray-400 light:text-slate-500">
              {hasZk && <li>Proof verification happens off-chain: anyone (you, the counterparty, any external verifier) can re-run snarkjs against the audited vkey. Kaspa has no on-chain pairing verifier on this path, so a valid proof gates a 2-of-2 cosign plus a CSV timeout.</li>}
              {reality === 'on-chain-zk' && <li>This is testnet-gated: the KIP-16 OpZkPrecompile opcode is not live on Kaspa mainnet yet, so treat on-chain ZK settlement as a testnet capability until it is proven live, not a mainnet guarantee.</li>}
              {involvesOracle && <li>Liveness shows the resolver is reachable now, not that a future outcome will be honest. You are trusting the deployer-bound resolver key for the input.</li>}
              {reality === 'on-chain' && <li>The structural check confirms the lock pattern; the full redeem-script-hashes-to-commitment check is enforced by any Kaspa node at spend.</li>}
              {reality === 'decorative' && <li>This covenant is not enforced by consensus. Do not rely on it for value.</li>}
              <li>The enforcement label is computed by Covex from the on-chain script; the chain itself is the final authority.</li>
            </ul>
          </Section>
        </div>
      </div>
    </div>,
    document.body,
  );
}
