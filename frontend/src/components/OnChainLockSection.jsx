import { useEffect, useState } from 'react';
import { FileKey, Lock, Check, AlertTriangle, ExternalLink, KeyRound, MapPin } from 'lucide-react';
import { CopyChip, Section } from './TransparencyModal';
import { explorerAddressUrl, explorerTxUrl } from '../lib/explorer';

/**
 * OnChainLockSection - the same honest lock + verification disclosure that lives inside
 * TransparencyModal, surfaced ALWAYS-VISIBLE on the covenant detail page body. No modal,
 * no click required: the full script_hex, the P2SH structural verdict (aa20<hash>87), the
 * redeem_script_hex (when the backend returns it), the Groth16 vkey link, and the oracle
 * x-only pubkey are right on the page. Every page is fully transparent by default.
 *
 * Reuses CopyChip + Section from TransparencyModal so the look and the wording stay in lockstep
 * with the (already world-class, honest) modal. Pure-frontend, read-only, non-fund-path.
 */

// Circuits with a real, working in-browser Groth16 prover. Mirrors TransparencyModal so the
// "in-browser prover available" note is only shown when it is actually true.
const IN_BROWSER_PROVERS = new Set(['merkle_membership', 'age_verification', 'escrow_2party']);

// Reality categories that genuinely involve the disclosed oracle (so the oracle pubkey is relevant).
const ORACLE_REALITIES = new Set(['oracle-attested', 'hybrid', 'full-zk']);
const ZK_REALITIES = new Set(['full-zk', 'hybrid']);

function realityFromCovenant(covenant) {
  const r = covenant?.enforcement_reality;
  if (r) return r;
  const cfg = covenant?.custom_ui_config;
  const circuit = (typeof cfg === 'object' && cfg?.circuit) || null;
  const cat = `${covenant?.category || ''} ${covenant?.covenant_type || ''}`.toLowerCase();
  if ((circuit && circuit !== 'none') || /zk|oracle|chess|turn_timer|range|merkle|game|predict/.test(cat)) return 'oracle-attested';
  return 'decorative';
}

export default function OnChainLockSection({ covenant }) {
  const scriptHex = String(covenant?.script_hex || '').toLowerCase();
  const redeemHex = String(covenant?.redeem_script_hex || '');
  // Canonical P2SH lock address - the exact value a verifier pastes into a block explorer
  // to find the on-chain UTXO this covenant's redeem_script_hex hashes to.
  const p2shAddress = String(covenant?.p2sh_address || '');
  // spendable === true means the indexer has NOT seen a spend of the locked UTXO yet (live);
  // a non-null spent_tx_id means it was redeemed on-chain (settled). Only meaningful when the
  // backend returned the field (an enforced P2SH covenant); undefined => unknown, render nothing.
  const spendable = covenant?.spendable;
  const spentTxId = covenant?.spent_tx_id ? String(covenant.spent_tx_id) : '';
  const reality = realityFromCovenant(covenant);
  const involvesOracle = ORACLE_REALITIES.has(reality);
  const hasZk = ZK_REALITIES.has(reality);
  const circuitId = (typeof covenant?.custom_ui_config === 'object' ? covenant?.custom_ui_config?.circuit : null) || null;
  const inBrowser = circuitId && IN_BROWSER_PROVERS.has(circuitId);
  const vkeyPath = hasZk && circuitId && circuitId !== 'none' ? `/zk/${circuitId}/${circuitId}_vkey.json` : null;

  // The exact, structural P2SH lock check: OP_BLAKE2B (aa) · push-32 (20) · <32-byte hash> · OP_EQUAL (87).
  const p2shStructural = /^aa20[0-9a-f]{64}87$/.test(scriptHex);

  const [oracle, setOracle] = useState({ loading: involvesOracle, pubkey: null });
  useEffect(() => {
    if (!involvesOracle) return undefined;
    const ac = new AbortController();
    fetch('/api/oracle/pubkey', { signal: ac.signal })
      .then((r) => r.json())
      .then((p) => setOracle({ loading: false, pubkey: p }))
      .catch((e) => { if (e.name !== 'AbortError') setOracle({ loading: false, pubkey: null }); });
    return () => ac.abort();
  }, [involvesOracle]);

  // Nothing inspectable to show (e.g. an indexed metadata marker with no script) - stay quiet.
  if (!scriptHex && !redeemHex && !p2shAddress && !vkeyPath && !involvesOracle) return null;

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Lock size={14} className="text-kaspa-green" />
        <h3 className="text-xs font-mono text-gray-300 uppercase tracking-widest">On-chain Lock and Verification</h3>
      </div>
      <div className="grid grid-cols-1 gap-3">
        {scriptHex && (
          <Section icon={Lock} title="On-chain lock script">
            <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Full script (script_hex)</div>
            <CopyChip text={scriptHex} />
            <div className={`text-[11px] mt-1.5 inline-flex items-center gap-1.5 ${p2shStructural ? 'text-kaspa-green' : 'text-amber-300'}`}>
              {p2shStructural ? <Check size={12} /> : <AlertTriangle size={12} />}
              {p2shStructural
                ? 'Well-formed P2SH lock (aa = OP_BLAKE2B · 20 = push-32 · 32-byte script hash · 87 = OP_EQUAL). Only a redeem script hashing to this exact value can spend it.'
                : 'Not a standard 35-byte P2SH lock pattern (aa20...87).'}
            </div>
          </Section>
        )}

        {p2shAddress && (
          <Section icon={MapPin} title="P2SH lock address">
            <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Canonical address (p2sh_address)</div>
            <CopyChip text={p2shAddress} />
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <a
                href={explorerAddressUrl(p2shAddress, covenant?.network)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-[11px] font-mono text-kaspa-green hover:underline break-all"
              >
                View on explorer <ExternalLink size={11} className="shrink-0" />
              </a>
              {spendable === true && (
                <span className="inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full bg-kaspa-green/15 text-kaspa-green border border-kaspa-green/30">
                  <Check size={11} /> Spendable
                </span>
              )}
              {spendable === false && (
                <span className="inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                  <AlertTriangle size={11} /> Spent
                </span>
              )}
            </div>
            {spendable === false && spentTxId && (
              <div className="text-[11px] text-gray-500 mt-1.5">
                Redeemed in tx{' '}
                <a
                  href={explorerTxUrl(spentTxId, covenant?.network)}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-gray-300 hover:text-kaspa-green hover:underline break-all"
                >
                  {spentTxId}
                </a>
              </div>
            )}
            <div className="text-[11px] text-gray-500 mt-1.5">
              This is where the redeem script above hashes to on-chain. Paste it into the explorer to confirm the locked UTXO yourself.
            </div>
          </Section>
        )}

        {redeemHex && (
          <Section icon={KeyRound} title="Redeem script">
            <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">
              redeem_script_hex{covenant?.redeem_kind ? ` · ${covenant.redeem_kind}` : ''}
            </div>
            <CopyChip text={redeemHex} />
            <div className="text-[11px] text-gray-500 mt-1.5">
              Not a secret - it is required to spend and hashes to the P2SH commitment above. Anyone can verify the hash; only a valid signature can move the funds.
            </div>
          </Section>
        )}

        {(vkeyPath || (involvesOracle && oracle.pubkey?.xonly_pubkey)) && (
          <Section icon={FileKey} title="Verification you can inspect">
            {vkeyPath && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Verification key (Groth16)</div>
                <a href={vkeyPath} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[11px] font-mono text-kaspa-green hover:underline break-all">
                  {vkeyPath} <ExternalLink size={11} className="shrink-0" />
                </a>
                {inBrowser && <div className="text-[11px] text-gray-500 mt-1">In-browser prover available · wasm + zkey served alongside this key.</div>}
              </div>
            )}
            {involvesOracle && oracle.pubkey?.xonly_pubkey && (
              <div className={vkeyPath ? 'mt-2' : ''}>
                <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Oracle public key ({oracle.pubkey.scheme || 'bip340-schnorr-secp256k1'})</div>
                <CopyChip text={oracle.pubkey.xonly_pubkey} />
                {oracle.pubkey.message_format && <div className="text-[11px] text-gray-500 mt-1.5">Signs: <span className="font-mono text-gray-300">{oracle.pubkey.message_format}</span></div>}
              </div>
            )}
          </Section>
        )}
      </div>
    </div>
  );
}
