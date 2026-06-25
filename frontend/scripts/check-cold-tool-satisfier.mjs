#!/usr/bin/env node
// check-cold-tool-satisfier.mjs
//
// CI gate (money-path byte-parity anti-drift): the standalone cold-recovery tool's
// consensus-critical satisfier (OPCODES, SIG_HASH_ALL, concatBytes, hexToBytes, bytesToHex,
// pushData, push65, parseRedeemPubkeys, sigOpCount, buildSatisfier) used to be HAND-COPIED
// from frontend/src/lib/redeemer/covenantRedeemer.js. build-cold-tool.mjs now INJECTS that
// span verbatim from the canonical source, so the tool cannot hand-drift. This gate proves it:
// it loads the BUILT tool, extracts its pure-core <script>, runs the tool's OWN buildSatisfier
// for EVERY kind+branch in tests/fixtures/satisfier_golden.json, and asserts the produced bytes
// EXACTLY equal the golden. That is the same byte-parity guarantee the in-app JS already has
// (covenantRedeemer.golden.test.js) and the Rust side has (satisfier_golden_cross_language_parity).
//
// Fail-closed: any divergence, a missing built tool, or a missing/extra vector fails the build.
//
// Runs AFTER `vite build` (whose prebuild regenerates the tool into public/, copied into dist/).

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRONTEND = resolve(__dirname, '..');
// frontend/scripts -> repo root is two levels up.
const REPO_ROOT = resolve(FRONTEND, '..');
const FIXTURE = resolve(REPO_ROOT, 'tests', 'fixtures', 'satisfier_golden.json');
// Prefer the dist artifact (what actually ships); fall back to the public/ artifact the
// prebuild emits, so the check also works when run right after `npm run build:cold-tool`.
const DIST_TOOL = resolve(FRONTEND, 'dist', 'tools', 'cold-recovery', 'covex-cold-recovery.html');
const PUBLIC_TOOL = resolve(FRONTEND, 'public', 'tools', 'cold-recovery', 'covex-cold-recovery.html');

function die(msg) {
  console.error('COLD-TOOL SATISFIER CHECK FAILED: ' + msg);
  process.exit(1);
}

function hexToBytesLocal(h) {
  return Uint8Array.from(h.match(/../g).map((x) => parseInt(x, 16)));
}
function bytesToHexLocal(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i++) s += u8[i].toString(16).padStart(2, '0');
  return s;
}

// Markers that bracket the injected canonical satisfier source in the BUILT tool. The build
// pastes the source into the (A) PURE CORE section, which sits between these two section-header
// comments inside the tool's single classic <script>. We slice ONLY that span - the consensus
// satisfier source, which has no DOM/window usage - so the VM never touches the UI handlers
// (which reference `document`) that live later in the same <script>.
const CORE_BEGIN_MARKER = '(A) PURE CORE - INJECTED AT BUILD TIME';
const CORE_END_MARKER = '(B) STANDALONE WASM GLUE';
// After the (A) header comment block there is a closing rule line; the executable source
// begins after it. We anchor on the first declaration to avoid pulling comment text into eval.
const CORE_FIRST_DECL = 'const OPCODES';

// Extract ONLY the injected pure-core satisfier source from the built tool and evaluate it in an
// isolated VM context, returning its buildSatisfier - so we run the tool's OWN signing-path code.
function loadBuiltBuildSatisfier(html) {
  // The bare placeholder would mean the build never injected the source.
  if (html.includes('// __SATISFIER_SOURCE__')) {
    die('the built tool still carries the // __SATISFIER_SOURCE__ placeholder; the build did not inject the canonical satisfier source');
  }
  const begin = html.indexOf(CORE_BEGIN_MARKER);
  const end = html.indexOf(CORE_END_MARKER);
  if (begin === -1 || end === -1 || end <= begin) {
    die('could not locate the (A) PURE CORE .. (B) WASM GLUE section markers in the built tool (template structure changed?)');
  }
  // Start the eval at the first real declaration so the (A) header comment is excluded and we
  // only run the injected source up to the (B) section header.
  const declStart = html.indexOf(CORE_FIRST_DECL, begin);
  if (declStart === -1 || declStart >= end) {
    die(`could not find the first satisfier declaration '${CORE_FIRST_DECL}' in the built tool's pure-core section`);
  }
  const coreSrc = html.slice(declStart, end);
  if (!coreSrc.includes('function buildSatisfier') || !coreSrc.includes('function push65')) {
    die('the built tool pure-core section does not contain buildSatisfier/push65 (injection incomplete?)');
  }
  // Evaluate in a fresh context. The injected source has no imports/exports (the build strips
  // `export`), so it is plain top-level declarations. We append a return of buildSatisfier.
  const wrapped = `${coreSrc}\n;return { buildSatisfier, sigOpCount, push65, pushData, parseRedeemPubkeys };`;
  let factory;
  try {
    factory = new vm.Script(`(function(){\n${wrapped}\n})`);
  } catch (e) {
    die('the built tool pure-core <script> did not parse as standalone JS: ' + (e && e.message ? e.message : e));
  }
  const context = vm.createContext({ Uint8Array, Error, Array, String, Number, parseInt, console });
  try {
    const fn = factory.runInContext(context);
    const api = fn();
    if (!api || typeof api.buildSatisfier !== 'function') {
      die('the built tool pure-core did not export a buildSatisfier function');
    }
    return api.buildSatisfier;
  } catch (e) {
    die('evaluating the built tool pure-core threw: ' + (e && e.stack ? e.stack : e));
  }
}

// Map (kind, branch) -> buildSatisfier args. MUST mirror covenantRedeemer.golden.test.js
// argsFor() and the backend test's slot mapping exactly (same fixed placeholders into the same
// slots), so this gate asserts the SAME golden the in-app JS and Rust are pinned to.
function argsFor(kind, branch, fx) {
  const { SIG_A, SIG_B, SIG_REFUND, SIG_ORACLE, PRE } = fx;
  switch (`${kind}:${branch}`) {
    case 'singlesig:claim':
    case 'timelock:claim':
    case 'rcsv:claim':
      return { kind, sig65: SIG_A };
    case 'hashlock:claim':
      return { kind, sig65: SIG_A, preimageBytes: PRE };
    case 'htlc:claim':
      return { kind, branch: 'claim', sig65: SIG_A, preimageBytes: PRE };
    case 'htlc:refund':
      return { kind, branch: 'refund', sig65: SIG_A };
    case 'multisig:claim':
      return { kind, multisigSigs: [SIG_A, SIG_B] };
    case 'channel:close':
      return { kind, branch: 'close', channelSig1: SIG_A, channelSig2: SIG_B };
    case 'channel:refund':
      return { kind, branch: 'refund', channelSig1: SIG_A };
    case 'deadman:claim':
      return { kind, branch: 'claim', sig65: SIG_A };
    case 'deadman:refund':
      return { kind, branch: 'refund', sig65: SIG_A };
    case 'oracle:claim':
    case 'oracle_enforced:claim':
      return { kind, oracleSig: SIG_ORACLE, winnerSig: SIG_A };
    case 'oracle_escrow:revealA':
      return { kind, winnerIsA: true, winnerSig: SIG_A, oracleSig: SIG_ORACLE };
    case 'oracle_escrow:revealB':
      return { kind, winnerIsA: false, winnerSig: SIG_B, oracleSig: SIG_ORACLE };
    case 'oracle_enforced_refundable:claim':
      return { kind, branch: 'claim', oracleSig: SIG_ORACLE, winnerSig: SIG_A };
    case 'oracle_enforced_refundable:refund':
      return { kind, branch: 'refund', refundSig: SIG_REFUND };
    case 'oracle_escrow_refundable:revealA':
      return { kind, branch: 'revealA', winnerIsA: true, winnerSig: SIG_A, oracleSig: SIG_ORACLE };
    case 'oracle_escrow_refundable:revealB':
      return { kind, branch: 'revealB', winnerIsA: false, winnerSig: SIG_B, oracleSig: SIG_ORACLE };
    case 'oracle_escrow_refundable:refund':
      return { kind, branch: 'refund', refundSig: SIG_REFUND };
    case 'binary_oracle_select:revealA':
      return { kind, branch: 'revealA', winnerIsA: true, winnerSig: SIG_A, preimageBytes: PRE };
    case 'binary_oracle_select:revealB':
      return { kind, branch: 'revealB', winnerIsA: false, winnerSig: SIG_B, preimageBytes: PRE };
    case 'binary_oracle_select:refund':
      return { kind, branch: 'refund', refundSig: SIG_REFUND };
    default:
      die(`golden fixture has a vector this gate does not map: ${kind}/${branch}. ` +
        'Add it to argsFor() (and to covenantRedeemer.golden.test.js) so the cold tool is checked for it.');
      return null; // unreachable (die exits)
  }
}

function main() {
  const toolPath = existsSync(DIST_TOOL) ? DIST_TOOL : (existsSync(PUBLIC_TOOL) ? PUBLIC_TOOL : null);
  if (!toolPath) die(`built cold-recovery tool not found at ${DIST_TOOL} or ${PUBLIC_TOOL}. Run \`npm run build\` first.`);
  if (!existsSync(FIXTURE)) die(`satisfier golden fixture not found at ${FIXTURE}`);

  const html = readFileSync(toolPath, 'utf8');
  const golden = JSON.parse(readFileSync(FIXTURE, 'utf8'));
  if (!Array.isArray(golden.vectors) || golden.vectors.length === 0) {
    die('satisfier golden fixture has no vectors');
  }
  const fi = golden.fixed_inputs || {};
  const fx = {
    SIG_A: hexToBytesLocal(fi.sig_a),
    SIG_B: hexToBytesLocal(fi.sig_b),
    SIG_REFUND: hexToBytesLocal(fi.sig_refund),
    SIG_ORACLE: hexToBytesLocal(fi.sig_oracle),
    PRE: hexToBytesLocal(fi.preimage),
  };
  for (const [k, v] of Object.entries(fx)) {
    const want = k === 'PRE' ? 32 : 64;
    if (!v || v.length !== want) die(`fixed input ${k} is ${v ? v.length : 'missing'} bytes, expected ${want}`);
  }

  const buildSatisfier = loadBuiltBuildSatisfier(html);

  const mismatches = [];
  for (const v of golden.vectors) {
    let got;
    try {
      got = bytesToHexLocal(buildSatisfier(argsFor(v.kind, v.branch, fx)));
    } catch (e) {
      mismatches.push(`${v.kind}/${v.branch}: built buildSatisfier threw: ${e && e.message ? e.message : e}`);
      continue;
    }
    if (got !== v.expected_satisfier_hex) {
      mismatches.push(`${v.kind}/${v.branch}:\n      expected ${v.expected_satisfier_hex}\n      built    ${got}`);
    }
  }
  if (mismatches.length) {
    die('the BUILT cold tool\'s satisfier bytes DRIFTED from tests/fixtures/satisfier_golden.json:\n  ' + mismatches.join('\n  '));
  }

  console.log(`OK: built cold-recovery tool's buildSatisfier matches the golden for all ${golden.vectors.length} kind/branch vectors (byte-identical). Tool: ${toolPath}`);
}

main();
