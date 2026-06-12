// E2E for real multiplayer poker against prod: two kaspa-wasm-signed players
// play a scripted full hand to showdown + a fold hand + a match resign, with
// auth-rejection checks and INDEPENDENT deal verification (recompute the
// shuffle from the revealed seed and compare commitment/board/holes).
// Run from frontend/: node scripts/poker-e2e.mjs <covenant_id>
// Cleanup of selftest rows is done by the caller.
import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import * as wasm from '../node_modules/@onekeyfe/kaspa-wasm/kaspa.js';

wasm.initSync({ module: await WebAssembly.compile(readFileSync('./node_modules/@onekeyfe/kaspa-wasm/kaspa_bg.wasm.bin')) });
const { PrivateKey, signMessage } = wasm;

const BASE = 'https://hightable.pro/api';
const ID = process.argv[2] || 'covex-selftest-poker-e2e';
const keys = [
  '1111111111111111111111111111111111111111111111111111111111111111',
  '2222222222222222222222222222222222222222222222222222222222222222',
];
const pks = keys.map((k) => new PrivateKey(k));
const addrs = pks.map((pk) => pk.toAddress('testnet-12').toString());

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log(`  ok: ${msg}`); } else { fail++; console.log(`  FAIL: ${msg}`); } };
const api = async (path, body, method) => {
  const r = await fetch(`${BASE}/${path}`, body || method === 'POST'
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }
    : undefined);
  return r.json();
};

// ── deterministic shuffle (matches backend spec exactly) ──
const sha = (s) => createHash('sha256').update(s).digest();
function shuffledDeck(seed) {
  let counter = 0, buf = Buffer.alloc(0), pos = 0;
  const nextU32 = () => {
    let v = 0;
    for (let k = 0; k < 4; k++) {
      if (pos >= buf.length) { buf = sha(`${seed}:${counter}`); pos = 0; counter++; }
      v = (v * 256 + buf[pos]) >>> 0; pos++;
    }
    return v;
  };
  const uniform = (n) => {
    const limit = Math.floor(4294967295 / n) * n;
    for (;;) { const u = nextU32(); if (u < limit) return u % n; }
  };
  const deck = Array.from({ length: 52 }, (_, i) => i);
  for (let i = 51; i >= 1; i--) { const j = uniform(i + 1); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  return deck;
}
const cardStr = (i) => `${'23456789TJQKA'[i % 13]}${'cdhs'[(i / 13) | 0]}`;
function verifyResult(res) {
  const commit = sha(`${res.seed}:${ID}:${res.hand_no}`).toString('hex');
  const deck = shuffledDeck(res.seed);
  const board = deck.slice(4, 9).map(cardStr);
  const holes = [[deck[0], deck[2]].map(cardStr), [deck[1], deck[3]].map(cardStr)];
  return commit === res.commitment
    && JSON.stringify(board) === JSON.stringify(res.board)
    && JSON.stringify(holes) === JSON.stringify(res.holes);
}

console.log(`players:\n  P1 ${addrs[0]}\n  P2 ${addrs[1]}`);

// ── seats ──
console.log('=== seats ===');
await api(`games/${ID}/join`, { player: addrs[0], game_type: 'poker', pot_amount_kas: 1 });
const j2 = await api(`games/${ID}/join`, { player: addrs[1], game_type: 'poker' });
ok(j2.game?.status === 'active', 'both players seated, match active');

// ── sessions + auth rejections ──
console.log('=== wallet-signed sessions ===');
const tokens = [];
for (const s of [0, 1]) {
  const ch = await api(`poker/${ID}/challenge?address=${encodeURIComponent(addrs[s])}`, null, 'GET' && undefined);
  const chal = await (await fetch(`${BASE}/poker/${ID}/challenge?address=${encodeURIComponent(addrs[s])}`)).json();
  void ch;
  const signature = signMessage({ message: chal.message, privateKey: pks[s] });
  const sess = await api(`poker/${ID}/session`, { address: addrs[s], signature, nonce: chal.nonce });
  ok(sess.success && sess.token, `P${s + 1} session minted via real schnorr signature`);
  tokens[s] = sess.token;
}
{
  const chal = await (await fetch(`${BASE}/poker/${ID}/challenge?address=${encodeURIComponent(addrs[0])}`)).json();
  const bad = await api(`poker/${ID}/session`, { address: addrs[0], signature: 'aa'.repeat(64), nonce: chal.nonce });
  ok(bad.success === false, 'garbage signature rejected');
  const unseated = await api(`poker/${ID}/session`, { address: 'kaspatest:qqunseated000000000000000000000000000000000000000000000000', signature: 'aa'.repeat(64), nonce: 'x' });
  ok(unseated.success === false, 'unseated address rejected');
  const holeNoTok = await api(`poker/${ID}/hole`, { token: 'not-a-token' });
  ok(holeNoTok.success === false, 'hole cards refused without a valid session');
}

// ── hand 1: full hand to showdown ──
console.log('=== hand 1: scripted to showdown ===');
const dealt = await api(`poker/${ID}/deal`, { token: tokens[0] });
ok(dealt.success && dealt.commitment?.length === 64, `dealt hand 1, commitment published (${(dealt.commitment || '').slice(0, 12)}...)`);
const dup = await api(`poker/${ID}/deal`, { token: tokens[1] });
ok(dup.success === false, 'double-deal rejected');

let st = await api(`poker/${ID}/state`);
ok(st.hand?.street === 'preflop' && st.hand?.pot === 3 && st.hand?.to_act === 0, `preflop: blinds posted, pot 3, button (P1) to act`);
ok(st.hand?.board?.length === 0, 'no board cards visible preflop');

const h1 = await api(`poker/${ID}/hole`, { token: tokens[0] });
const h2 = await api(`poker/${ID}/hole`, { token: tokens[1] });
ok(h1.success && h1.hole?.length === 2 && h1.seat === 0, `P1 hole fetched privately (${h1.hole})`);
ok(h2.success && h2.hole?.length === 2 && h2.seat === 1, `P2 hole fetched privately (${h2.hole})`);

// illegal actions
const oot = await api(`poker/${ID}/action`, { token: tokens[1], act: 'check' });
ok(oot.success === false, 'out-of-turn action rejected');
const lowRaise = await api(`poker/${ID}/action`, { token: tokens[0], act: 'raise', amount: 3 });
ok(lowRaise.success === false, 'below-minimum raise rejected');

// scripted line: P0 raise 6, P1 call | flop P1 check, P0 bet 8, P1 call | turn check-check | river P1 bet 20, P0 call
const line = [
  [0, 'raise', 6], [1, 'call', 0],
  [1, 'check', 0], [0, 'bet', 8], [1, 'call', 0],
  [1, 'check', 0], [0, 'check', 0],
  [1, 'bet', 20], [0, 'call', 0],
];
for (const [s, a, amt] of line) {
  const r = await api(`poker/${ID}/action`, { token: tokens[s], act: a, amount: amt });
  if (!r.success) { ok(false, `action ${a} by P${s + 1} accepted (${r.error})`); break; }
}
st = await api(`poker/${ID}/state`);
ok(st.hand == null && st.last_result?.hand_no === 1, 'hand 1 reached showdown and settled');
const r1 = st.last_result;
ok(r1.reason === 'showdown' && r1.pot === 68, `showdown pot 68 (got ${r1.pot}), won by ${r1.winner_seat == null ? 'split' : 'seat ' + (r1.winner_seat + 1)} with ${r1.win_label}`);
ok(verifyResult(r1), 'DEAL INDEPENDENTLY VERIFIED: revealed seed reproduces commitment + board + holes');
ok(JSON.stringify(r1.holes[0]) === JSON.stringify(h1.hole) && JSON.stringify(r1.holes[1]) === JSON.stringify(h2.hole), 'revealed holes equal the privately served ones');
ok(r1.chips_after[0] + r1.chips_after[1] === 200, `chips conserved (${r1.chips_after})`);

// ── hand 2: fold ──
console.log('=== hand 2: fold ===');
await api(`poker/${ID}/deal`, { token: tokens[1] });
st = await api(`poker/${ID}/state`);
ok(st.hand?.hand_no === 2 && st.hand?.button === 1, 'hand 2 dealt, button alternated to P2');
const folder = st.hand.to_act; // button acts first preflop
const r = await api(`poker/${ID}/action`, { token: tokens[folder], act: 'fold' });
ok(r.success, `P${folder + 1} folds`);
st = await api(`poker/${ID}/state`);
ok(st.last_result?.hand_no === 2 && st.last_result?.reason === 'fold', 'fold settled hand 2');
ok(verifyResult(st.last_result), 'hand 2 deal independently verified');

// ── resign ends the match ──
console.log('=== resign ===');
const rg = await api(`poker/${ID}/action`, { token: tokens[1], act: 'resign' });
ok(rg.success && rg.resigned, 'P2 resigned the match');
st = await api(`poker/${ID}/state`);
ok(st.match?.status === 'finished' && st.match?.chips[1] === 0, 'match finished, resigner chips zeroed');
const sg = await api(`games/${ID}`);
ok(sg.game?.status === 'finished' && sg.game?.winner === 'white', 'skill_games finished with winner white (P1) -> oracle/claim flow ready');

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
