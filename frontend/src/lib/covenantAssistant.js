// Grounded covenant-assistant engine. Maps a plain-English goal to REAL covenants from the live
// catalog. It is honest by construction: it only ever returns circuits that actually exist in the
// `circuits` array (ZK_CIRCUIT_TYPES) with their TRUE enforcement reality, so it cannot invent a
// circuit or overclaim ZK / trustlessness. Pure, deterministic, zero-dependency.
//
// LLM-READY SEAM: a backend endpoint (e.g. POST /api/assistant, Claude/Anthropic-powered) can later
// return the SAME shape — [{ id, why }] resolved against the same catalog — to upgrade the matching.
// The UI calls suggestCovenants(); swapping in an async backend call is a drop-in.

const REALITY_EXPLAIN = {
  'on-chain': 'The Kaspa chain enforces this directly. Fully trustless: your own wallet redeems with the published script, and Covex is not in the path.',
  'full-zk': 'A real Groth16 proof is required and verified fail-closed by the disclosed Covex oracle, which gates the release. The proof cannot be faked; the oracle is the trusted verifier (Kaspa has no on-chain pairing verifier yet).',
  hybrid: 'A zero-knowledge property proof plus an oracle attestation resolve it.',
  'oracle-attested': 'Resolved by the named Covex oracle\'s signed attestation of the outcome, then paid out on-chain. The oracle is the one trusted component, and it is always disclosed (these are frozen for value on mainnet until trustless).',
  decorative: 'A metadata marker. It carries information but does not itself gate a spend.',
};

// Intent rules: trigger phrases -> hints used to find the matching circuit in the REAL catalog.
const INTENTS = [
  { kw: ['escrow', 'hold funds', 'hold the funds', 'in escrow', 'buyer', 'seller', 'goods', 'release the'], find: ['escrow_2party', 'escrow'], lead: 'A two-party escrow holds the funds until the agreed condition is met.' },
  { kw: ['refund', 'timeout', 'deadline', 'expire', 'does not ship', 'fails to', 'within 30', 'within 7', 'within'], find: ['escrow_2party', 'timelock'], lead: 'An escrow/timeout covenant refunds after the deadline if the condition is not met.' },
  { kw: ['vesting', 'vest', 'unlock after', 'lock until', 'lock for', 'cliff', 'release on', 'release after', 'time lock', 'timelock'], find: ['timelock_absolute', 'timelock', 'relative_timelock'], lead: 'A timelock locks the funds until a chosen time, then releases them.' },
  { kw: ['whitelist', 'allowlist', 'eligibility', 'eligible', 'airdrop', 'membership', 'member', 'allow list'], find: ['merkle_membership', 'merkle'], lead: 'A Merkle-membership proof shows an address is on a committed list without revealing the list.' },
  { kw: ['age', 'over 18', '18+', '21+', 'kyc', 'birth', 'adult', 'old enough', 'minimum age'], find: ['age_verification'], lead: 'Age verification proves someone meets an age threshold without revealing their birth date.' },
  { kw: ['range', 'between', 'at least', 'at most', 'min ', 'max ', 'collateral', 'sufficient', 'within bounds'], find: ['range_proof', 'range'], lead: 'A range proof shows a hidden value lies within bounds without revealing it.' },
  { kw: ['multisig', 'multi-sig', 'multi sig', 'n of m', 'n-of-m', 'signers', 'approval', 'co-sign', 'quorum', 'committee'], find: ['multi_sig', 'multisig', 'threshold'], lead: 'A multi-signature threshold requires several keys to approve a spend.' },
  { kw: ['prediction', 'bet', 'wager', 'market', 'outcome', 'odds', 'forecast'], find: ['prediction_market', 'prediction'], lead: 'A prediction market pays out based on a resolved real-world outcome.' },
  { kw: ['auction', 'bid', 'bidder', 'clearing', 'highest'], find: ['auction'], lead: 'An auction covenant clears bids and pays the winner.' },
  { kw: ['random', 'dice', 'lottery', 'vrf', 'shuffle', 'fair draw', 'fairness', 'coin flip'], find: ['vrf', 'dice'], lead: 'A VRF gives provably fair randomness for draws and shuffles.' },
  { kw: ['private', 'hidden', 'confidential', 'mixer', 'anonymous', 'privacy', 'unlinkable'], find: ['privacy_mixer', 'nullifier', 'merkle'], lead: 'A privacy covenant lets a deposit be withdrawn without linking it to the depositor.' },
  { kw: ['hash', 'preimage', 'secret', 'atomic swap', 'htlc', 'reveal'], find: ['hash_preimage', 'htlc', 'hash'], lead: 'A hashlock releases funds when the secret preimage is revealed (atomic-swap style).' },
  { kw: ['token gated', 'token-gated', 'gated', 'gate access', 'holders', 'hold token'], find: ['token_gated', 'gating', 'merkle'], lead: 'Token-gating restricts access or spend to qualifying holders.' },
  { kw: ['loan', 'lend', 'borrow', 'ltv', 'health factor', 'liquidation', 'collateralized'], find: ['loan', 'collateral_ltv', 'liquidation', 'ltv'], lead: 'A lending covenant tracks collateral health and triggers on an LTV threshold.' },
  { kw: ['dao', 'governance', 'vote', 'voting', 'treasury', 'proposal'], find: ['merkle_dao', 'dao', 'treasury'], lead: 'A DAO/governance covenant gates actions by committed voting power.' },
  { kw: ['chess'], find: ['chess_v1', 'chess'], lead: 'A chess covenant settles a real game between two staked players.' },
  { kw: ['poker'], find: ['poker_v1', 'poker'], lead: 'A poker covenant settles a real hand with a verifiable deal.' },
  { kw: ['blackjack'], find: ['blackjack'], lead: 'A blackjack covenant settles a staked hand.' },
  { kw: ['game', 'play', 'arena', 'duel', 'match', 'tournament'], find: ['chess_v1', 'poker_v1', 'blackjack'], lead: 'A game covenant stakes two players and settles the on-chain result.' },
];

function findInCatalog(circuits, hints) {
  for (const h of hints) {
    const exact = circuits.find((c) => c.id === h);
    if (exact) return exact;
  }
  for (const h of hints) {
    const needle = h.replace(/_/g, ' ');
    const part = circuits.find((c) => c.id.includes(h) || c.name.toLowerCase().includes(needle));
    if (part) return part;
  }
  return null;
}

export function suggestCovenants(query, circuits) {
  const q = (query || '').toLowerCase();
  if (!q.trim() || !Array.isArray(circuits) || !circuits.length) return [];
  const scored = [];
  const seen = new Set();

  // 1) Curated intent rules (high confidence).
  for (const intent of INTENTS) {
    const hits = intent.kw.filter((k) => q.includes(k)).length;
    if (!hits) continue;
    const circuit = findInCatalog(circuits, intent.find);
    if (!circuit || seen.has(circuit.id)) continue;
    seen.add(circuit.id);
    scored.push({ circuit, score: 1000 + hits * 10, why: intent.lead });
  }

  // 2) Keyword-overlap fallback over the WHOLE real catalog (catches anything the rules miss).
  const words = q.split(/[^a-z0-9]+/).filter((w) => w.length > 3);
  if (words.length) {
    for (const c of circuits) {
      if (seen.has(c.id)) continue;
      const hay = `${c.name} ${c.id} ${c.description} ${c.category}`.toLowerCase();
      const overlap = words.filter((w) => hay.includes(w)).length;
      if (overlap >= 2) {
        scored.push({ circuit: c, score: overlap, why: `Matches your description: ${(c.description || '').slice(0, 100)}` });
        seen.add(c.id);
      }
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 3).map((s) => ({
    id: s.circuit.id,
    circuit: s.circuit,
    name: s.circuit.name, // deterministic suggestions seed the builder name with the circuit name
    why: s.why,
    // Honest confidence derived from HOW the match was made: a curated intent rule (score >= 1000)
    // is a strong match; a broad keyword-overlap fallback is good (>= 3 words) or possible (2 words).
    confidence: s.score >= 1000 ? 'high' : s.score >= 3 ? 'medium' : 'low',
    realityNote: REALITY_EXPLAIN[s.circuit.reality] || REALITY_EXPLAIN['oracle-attested'],
  }));
}

// ── Optional LOCAL-LLM upgrade ─────────────────────────────────────────────────────────────────
// Runs entirely on the USER's machine: the browser talks to a local OpenAI-compatible model server
// (Ollama at http://localhost:11434/v1, LM Studio at http://localhost:1234/v1, etc.). Nothing leaves
// the user's computer and no API key is involved. HONESTY GUARANTEE: whatever the model returns is
// validated against the REAL catalog (validateLLMSuggestions) so it can never surface a covenant that
// does not exist — a hallucinated id is simply dropped. Any failure falls back to suggestCovenants().

// Compact, deduped catalog the model picks from: `id | name | reality | short description`.
function buildCatalogIndex(circuits) {
  const seen = new Set();
  const lines = [];
  for (const c of circuits) {
    if (!c || seen.has(c.id)) continue;
    seen.add(c.id);
    const desc = String(c.description || '').replace(/\s+/g, ' ').slice(0, 72);
    lines.push(`${c.id} | ${c.name} | ${c.reality} | ${desc}`);
  }
  return lines.join('\n');
}

// A safe, short covenant name from free model text (letters/digits/space/hyphen only).
function sanitizeName(n) {
  if (!n || typeof n !== 'string') return null;
  const clean = n.replace(/[^\w \-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
  return clean || null;
}

// Pull the first JSON array out of a model response (tolerates code fences and stray prose).
export function extractJsonArray(text) {
  if (!text) return null;
  const fenced = String(text).match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : String(text);
  const start = body.indexOf('[');
  const end = body.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) return null;
  try { return JSON.parse(body.slice(start, end + 1)); } catch { return null; }
}

// Map a raw model array [{ id, why }] to validated suggestions, DROPPING any id that is not a real
// catalog circuit. This is the trust anchor: the model can phrase things freely, but it can only ever
// point at covenants that actually exist.
export function validateLLMSuggestions(raw, circuits) {
  if (!Array.isArray(raw) || !Array.isArray(circuits)) return [];
  const byId = new Map(circuits.map((c) => [c.id, c]));
  const out = [];
  const seen = new Set();
  for (const item of raw) {
    const id = item && typeof item.id === 'string' ? item.id.trim() : null;
    if (!id || seen.has(id)) continue;
    const circuit = byId.get(id);
    if (!circuit) continue; // hallucination guard
    seen.add(id);
    out.push({
      id,
      circuit,
      // The model may suggest an intent-specific covenant name; fall back to the circuit's name.
      name: sanitizeName(item.name) || circuit.name,
      why: (item.why && String(item.why).trim().slice(0, 240)) || 'Suggested by your local model for this goal.',
      // Optional one-line setup guidance grounded in the user's intent (e.g. a refund window). Pure
      // operational advice; the trust/reality claim stays in realityNote, which we control.
      setup: item.setup ? String(item.setup).trim().slice(0, 160) : undefined,
      confidence: out.length === 0 ? 'high' : 'medium',
      realityNote: REALITY_EXPLAIN[circuit.reality] || REALITY_EXPLAIN['oracle-attested'],
      source: 'local-ai',
    });
    if (out.length >= 3) break;
  }
  return out;
}

// Ask the local model to choose covenants from the catalog. Resolves to validated suggestions, or
// throws on transport/HTTP error (the caller falls back to the deterministic engine).
export async function suggestCovenantsLLM(query, circuits, config) {
  const q = (query || '').trim();
  if (!q || !config || !config.endpoint || !config.model || !Array.isArray(circuits) || !circuits.length) return [];
  const base = String(config.endpoint).replace(/\/+$/, '');
  const url = /\/chat\/completions$/.test(base) ? base : `${base}/chat/completions`;

  const system = [
    'You are the Covex covenant assistant for the Kaspa blockchain. The user describes what they want to build.',
    'From the CATALOG below, choose the 1 to 3 covenant circuits that best fit, best first.',
    'RULES:',
    '- Use ONLY ids that appear verbatim in the CATALOG. Never invent an id.',
    '- Be honest about enforcement reality: full-zk and on-chain are trustless; oracle-attested and hybrid rely on a disclosed oracle.',
    '- For each pick also propose a short, specific covenant name (max 5 words, letters/spaces only) that reflects the user goal.',
    '- Optionally add a one-sentence "setup" tip grounded in what the user said (e.g. a refund window or condition). Do not invent trust guarantees; only practical configuration advice.',
    '- Respond with ONLY a JSON array and nothing else: [{"id":"<catalog id>","name":"<short covenant name>","why":"<one short sentence on why it fits>","setup":"<optional one-sentence setup tip>"}]',
    '',
    'CATALOG (id | name | reality | description):',
    buildCatalogIndex(circuits),
  ].join('\n');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs || 45000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: config.model,
        temperature: 0.2,
        stream: false,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: q },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Local model returned HTTP ${res.status}`);
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content || data?.message?.content || '';
    return validateLLMSuggestions(extractJsonArray(content), circuits);
  } finally {
    clearTimeout(timer);
  }
}
