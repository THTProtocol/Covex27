// oracle/request.js
//
// The SEPARATE-ORACLE-PROVIDER model: a real-world fact is attested by an independent,
// accountable provider (or providers) that the COVENANT CREATOR chooses - never Covex, never
// a faceless scraper. Covex is pure infrastructure; the named provider takes the liability.
//
// Flow (all on-chain auditable):
//   1. The creator's wallet posts a RESOLUTION REQUEST tx whose payload is requestPayloadBytes(req).
//      request_id = blake2b256(canonicalRequest(req)) - deterministic from the content, so the
//      same id can be committed before broadcast.
//   2. The creator deploys the market covenant FROM THE SAME WALLET, committing to request_id.
//      The covenant's resolution branch requires the chosen provider config's signature(s)
//      (single key, or a k-of-n threshold) - mapped to the composable builder via providerBranch().
//   3. The provider resolves request_id by signing the outcome; the covenant releases to the
//      winner. A no-show provider is covered by the mandatory deployer refund backstop.
//
// Same-wallet (requester == deployer) + request_id make the request<->covenant link unforgeable.
//
// HONESTY: this is trust-MINIMIZED, not trustless. Trust = the named, liable provider(s) the
// creator chose (single = one entity; k-of-n = an honest threshold). The UI must say so.

import { blake2b } from '@noble/hashes/blake2b';
import { bytesToHex } from '@noble/hashes/utils';
import { leaf, allOf, either } from '../composer/tree';

export const REQUEST_VERSION = 1;
// Recognizable magic so the indexer can pick request txs out of the DAG by payload prefix.
// This is the NEUTRAL open wire format (no platform name): any wallet, indexer, or oracle
// provider can produce + parse it. request_id is content-only (the magic is not hashed), so
// the prefix carries no identity. Keeping it provider-agnostic is what lets a covenant bind to
// ANY external resolver, not a Covex-run one.
export const REQUEST_MAGIC = 'kaspa-oracle-req:v1';

const isHex32 = (s) => typeof s === 'string' && /^[0-9a-fA-F]{64}$/.test(s);

// Normalize the creator's chosen provider config to { mode, providers[], threshold }.
//   single -> threshold 1 of 1 ; kofn -> threshold k of n. A single provider is the k=n=1 case
//   but kept labelled so the honest trust copy can distinguish "one entity" from "a threshold".
export function normalizeProviders(cfg) {
  if (!cfg || typeof cfg !== 'object') throw new Error('provider config required');
  const providers = (cfg.providers || []).map((p) => String(p).toLowerCase());
  if (providers.length === 0) throw new Error('choose at least one oracle provider');
  for (const p of providers) if (!isHex32(p)) throw new Error('each provider must be a 32-byte x-only pubkey (hex)');
  const mode = cfg.mode || (providers.length === 1 ? 'single' : 'kofn');
  const threshold = mode === 'single' ? 1 : (cfg.threshold ?? providers.length);
  if (threshold < 1 || threshold > providers.length) throw new Error('provider threshold must be between 1 and the number of providers');
  return { mode, providers, threshold };
}

// Build a normalized request object from raw creator input.
export function buildRequest({ network, question, outcomes, providers, deadlineDaa, sourceUrl, requesterPubkey }) {
  const prov = normalizeProviders(providers);
  return {
    v: REQUEST_VERSION,
    network: network || 'testnet-12',
    question: String(question || '').trim(),
    outcomes: (outcomes || []).map((o) => String(o).trim()),
    providers: prov,
    deadline_daa: Number(deadlineDaa) || 0,
    source_url: sourceUrl ? String(sourceUrl).trim() : null,
    requester_pubkey: requesterPubkey ? String(requesterPubkey).toLowerCase() : null,
  };
}

// Canonical serialization (stable key order, no whitespace) - the request's identity.
export function canonicalRequest(req) {
  const p = req.providers || {};
  return JSON.stringify({
    v: req.v,
    network: req.network,
    question: req.question,
    outcomes: req.outcomes,
    providers: { mode: p.mode, providers: p.providers, threshold: p.threshold },
    deadline_daa: req.deadline_daa,
    source_url: req.source_url ?? null,
    requester_pubkey: req.requester_pubkey ?? null,
  });
}

export function requestId(req) {
  return bytesToHex(blake2b(new TextEncoder().encode(canonicalRequest(req)), { dkLen: 32 }));
}

// The bytes to embed in the request tx payload: a magic prefix + the canonical request, so the
// indexer recognizes + parses it and anyone can recompute request_id from on-chain data.
export function requestPayloadBytes(req) {
  return new TextEncoder().encode(`${REQUEST_MAGIC}\n${canonicalRequest(req)}`);
}

// Fail-closed validation of a request before it is posted / a covenant is bound to it.
export function validateRequest(req) {
  const errors = [];
  if (!req || typeof req !== 'object') return { ok: false, errors: ['empty request'] };
  if (req.v !== REQUEST_VERSION) errors.push('unsupported request version');
  if (!req.question) errors.push('the question is required');
  if (!Array.isArray(req.outcomes) || req.outcomes.length < 2) errors.push('at least two outcomes are required');
  else if (new Set(req.outcomes).size !== req.outcomes.length) errors.push('outcomes must be distinct');
  try { normalizeProviders(req.providers); } catch (e) { errors.push(e.message); }
  if (!(Number(req.deadline_daa) > 0)) errors.push('a resolution deadline (DAA) is required');
  if (req.requester_pubkey && !isHex32(req.requester_pubkey)) errors.push('requester pubkey must be a 32-byte x-only key');
  return { ok: errors.length === 0, errors };
}

// The unforgeable link: the wallet that signed the request tx MUST equal the wallet that
// deployed the covenant, and the covenant MUST commit to request_id. Both are on-chain facts.
export function checkBinding({ requestSignerPubkey, covenantDeployerPubkey, covenantRequestIdCommitment, req }) {
  const errors = [];
  const a = String(requestSignerPubkey || '').toLowerCase();
  const b = String(covenantDeployerPubkey || '').toLowerCase();
  if (!a || !b || a !== b) errors.push('the covenant must be deployed by the SAME wallet that signed the resolution request');
  const id = requestId(req);
  if (String(covenantRequestIdCommitment || '').toLowerCase() !== id) errors.push('the covenant does not commit to this request_id');
  return { ok: errors.length === 0, errors, requestId: id };
}

// Map the creator's chosen provider config to a composable-builder RESOLUTION branch that pays
// the declared winner. A single provider is the oracle 2-of-2 [provider, winner] (the existing
// oracle_enforced semantics). A k-of-n set is a threshold of provider sigs AND the winner sig.
// Either way the provider(s) must co-sign AND the winner must sign, so a publicly-revealed
// outcome cannot let the wrong party take the branch.
export function providerBranch(req, winnerPubkey) {
  const { mode, providers, threshold } = normalizeProviders(req.providers);
  const rid = requestId(req);
  if (mode === 'single' || providers.length === 1) {
    return leaf('oracle', { oracle: providers[0], winner: winnerPubkey, request_id: rid });
  }
  return allOf(
    leaf('multisig', { pubkeys: providers, required: threshold, request_id: rid }),
    leaf('singlesig', { pubkey: winnerPubkey, signer: 'winner' }),
  );
}

// The full always-spendable market covenant tree for this request: either the provider(s)
// resolve to the winner, OR the deployer reclaims after the deadline (the mandatory backstop,
// so a no-show provider can never strand the funds).
export function marketCovenant(req, { winnerPubkey, refundPubkey, refundSequence }) {
  return either(
    providerBranch(req, winnerPubkey),
    leaf('rcsv', { min_sequence: refundSequence, pubkey: refundPubkey, signer: 'deployer' }, 'backstop'),
  );
}
