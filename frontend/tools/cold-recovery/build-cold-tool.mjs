#!/usr/bin/env node
// build-cold-tool.mjs
//
// Inlines @onekeyfe/kaspa-wasm's wasm binary + ESM JS glue into the cold-recovery
// template, producing a SINGLE self-contained covex-cold-recovery.html that runs from
// file:// with no network dependency. Prints the artifact's SHA-256 so it can be pinned
// in README.md and verified by anyone before they trust the tool.
//
// Run from a checkout that HAS node_modules (this worktree does not):
//   cd frontend && npm install            # if needed
//   node tools/cold-recovery/build-cold-tool.mjs
//
// HOW THE WASM GETS INLINED (the important part)
// ----------------------------------------------
// kaspa-wasm is wasm-bindgen "--target web" output. Two files matter:
//   - kaspa.js          the ESM glue: `export class PrivateKey ...`, `export function
//                       createInputSignature ...`, and an init footer exporting
//                       `initSync` + a default `__wbg_init`. The default init resolves
//                       the wasm via `new URL('kaspa_bg.wasm', import.meta.url)` (a
//                       NETWORK / module fetch) - which file:// cannot do. We never call
//                       the default with no args; instead the page calls
//                       initSync(compiledModule) with bytes WE inline, exactly as the
//                       app's WalletContext does today.
//   - kaspa_bg.wasm.bin the actual WebAssembly module bytes.
//
// We do TWO substitutions in the template:
//   1. __KASPA_WASM_B64__       -> base64(kaspa_bg.wasm.bin), parked in a
//                                  <script type="text/plain"> so the page can decode it
//                                  to bytes and WebAssembly.compile() it locally.
//   2. __KASPA_WASM_GLUE_MODULE__ -> the body of an inline <script type="module"> that:
//        (a) embeds kaspa.js as a base64 ESM and imports it from a BLOB url. A blob: ESM
//            import works under file:// (it is same-page, not a network fetch), and it
//            keeps `import.meta.url` valid inside the glue. We import the NAMESPACE
//            (`import * as K`), so we get every named export (PrivateKey, Transaction,
//            initSync, createInputSignature, payToScriptHash*, RpcClient, Resolver, ...).
//        (b) assigns that namespace to window.__KASPA_WASM__. The page's initWasm() then
//            calls K.initSync(compiledModule) - so the glue's own network-fetching
//            default init is NEVER invoked. No .wasm sibling fetch, no Covex, no network.
//
// Why a blob ESM import and not just pasting the glue inline: kaspa.js is a real ES
// module (top-level export/import statements) and uses import.meta.url; pasting it raw
// into a classic or even module script and trying to scrape its exports is brittle across
// wasm-bindgen versions. A blob: module URL runs the glue UNMODIFIED as a module and
// gives us its exact export namespace. This is the most version-robust option.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Path to the in-app redeemer that owns the CANONICAL claimability matrix. The cold tool
// must never hand-duplicate it (the old copy drifted into "Covex oracle" copy that
// contradicts the trustless reframe), so we import KIND_CLAIM_MATRIX from here and derive
// the tool's matrix at build time. A CI gate re-checks kinds + offline flags against it.
const REDEEMER_SRC = resolve(__dirname, '..', '..', 'src', 'lib', 'redeemer', 'covenantRedeemer.js');

// Derive the cold tool's per-kind { offline, note } shape from the canonical KIND_CLAIM_MATRIX.
// honest mapping:
//   - offlineClaimable true                         -> offline: true
//   - not offlineClaimable, has an offline refund    -> offline: 'refund-only'
//   - not offlineClaimable, no offline branch         -> offline: false
// The `note` is the canonical `liveness` string verbatim (already worded "external resolver"
// / "deployer-bound resolver"), so the tool's claimability copy is the redeemer's, not a copy.
function deriveColdMatrix(KIND_CLAIM_MATRIX) {
  const out = {};
  for (const [kind, entry] of Object.entries(KIND_CLAIM_MATRIX)) {
    const branches = entry.branches || {};
    let offline;
    if (entry.offlineClaimable) {
      offline = true;
    } else {
      const refund = branches.refund || branches.refundA || branches.refundB;
      offline = refund && refund.offline ? 'refund-only' : false;
    }
    out[kind] = { offline, note: String(entry.liveness || '') };
  }
  return out;
}

// ---------------------------------------------------------------------------
// CANONICAL SATISFIER SOURCE INJECTION (byte-parity anti-drift).
//
// The cold tool used to HAND-COPY the consensus-critical satisfier functions
// (OPCODES, SIG_HASH_ALL, concatBytes, hexToBytes, bytesToHex, pushData, push65,
// parseRedeemPubkeys, sigOpCount, buildSatisfier) out of covenantRedeemer.js. A
// hand-copy on a fund-path can silently drift from the source whose bytes are the
// ONLY cross-language CI-gated surface. We now SLICE that exact span out of the
// canonical source between two sentinel comments, strip the `export` keywords (so
// the declarations are valid top-level statements in the tool's classic <script>),
// and inject it. The tool's signing path then has a single source of truth, and
// scripts/check-cold-tool-satisfier.mjs re-runs the BUILT tool's buildSatisfier
// against tests/fixtures/satisfier_golden.json so it can never drift again.
const SAT_BEGIN = '// >>> COLD_TOOL_SATISFIER_BEGIN';
const SAT_END = '// <<< COLD_TOOL_SATISFIER_END';

// The complete set of declarations the span MUST contain (the tool's signing path's
// transitive closure). The build FAILS LOUD if any is missing, so a refactor that
// shrinks the span or renames a function cannot ship a tool with a hand-copy gap.
const REQUIRED_SATISFIER_DECLS = [
  'const OPCODES',
  'const SIG_HASH_ALL',
  'function concatBytes',
  'function hexToBytes',
  'function bytesToHex',
  'function pushData',
  'function push65',
  'function parseRedeemPubkeys',
  'function sigOpCount',
  'function buildSatisfier',
];

// Extract the sentinel-delimited satisfier span from covenantRedeemer.js and turn it
// into top-level (un-exported) source the tool's classic <script> can run.
function extractCanonicalSatisfierSource(redeemerSrc) {
  const begin = redeemerSrc.indexOf(SAT_BEGIN);
  const end = redeemerSrc.indexOf(SAT_END);
  if (begin === -1 || end === -1 || end <= begin) {
    throw new Error(
      `covenantRedeemer.js is missing the ${SAT_BEGIN} / ${SAT_END} sentinels (or they are out of order). ` +
        'The cold tool injects the canonical satisfier source from between them; refusing to fall back to a hand-copy.',
    );
  }
  // Slice the body strictly BETWEEN the marker lines (exclude the marker comments).
  let body = redeemerSrc.slice(begin + SAT_BEGIN.length, end);
  // Strip only the LEADING `export ` of each top-level `export const`/`export function`
  // so the declarations become plain top-level statements. Anchored to line start
  // (with optional indentation) so an `export` inside a string/comment is never touched.
  body = body.replace(/^(\s*)export\s+(const|function|let|var|class)\b/gm, '$1$2');
  // Guard: no `export`/`import` keyword may survive (a classic <script> cannot have them,
  // and it would break the page's JS parse).
  if (/^\s*export\b/m.test(body) || /^\s*import\b/m.test(body)) {
    throw new Error('injected satisfier source still contains a top-level export/import; refusing to emit a broken tool');
  }
  // Guard: every required declaration MUST be present (exhaustive signing-path closure).
  const missing = REQUIRED_SATISFIER_DECLS.filter((d) => !body.includes(d));
  if (missing.length) {
    throw new Error(
      `the canonical satisfier span is missing required declaration(s): ${missing.join(', ')}. ` +
        'The cold tool needs the full signing-path closure; widen the COLD_TOOL_SATISFIER span.',
    );
  }
  return body.trim();
}

const TEMPLATE = join(__dirname, 'covex-cold-recovery.template.html');
// The built artifact is emitted into the frontend's public/ tree so Vite copies it into
// dist/ and it is SERVED at /tools/cold-recovery/covex-cold-recovery.html (reachable from the
// in-app links). It is ~15-20 MB (wasm base64-inlined) and is generated at build time, so it is
// gitignored and never committed. The committed index.html sibling makes /tools/cold-recovery/
// resolve and links to this file + the guide.
const PUBLIC_DIR = resolve(__dirname, '..', '..', 'public', 'tools', 'cold-recovery');
const OUT = join(PUBLIC_DIR, 'covex-cold-recovery.html');

// Resolve the kaspa-wasm package dir. Prefer node's resolver (handles workspaces /
// hoisted node_modules); fall back to a couple of known relative locations.
function resolveKaspaDir() {
  const candidates = [];
  try {
    // package.json may not be in "exports"; resolve a file we KNOW is published.
    const p = require.resolve('@onekeyfe/kaspa-wasm/kaspa.js');
    candidates.push(dirname(p));
  } catch (_) { /* fall through */ }
  candidates.push(resolve(__dirname, '..', '..', 'node_modules', '@onekeyfe', 'kaspa-wasm'));
  candidates.push(resolve(__dirname, '..', '..', '..', 'node_modules', '@onekeyfe', 'kaspa-wasm'));
  for (const c of candidates) {
    if (existsSync(join(c, 'kaspa.js'))) return c;
  }
  throw new Error(
    'Could not find @onekeyfe/kaspa-wasm in node_modules. Run this from a checkout where ' +
    '`npm install` has been run (e.g. cd frontend && npm install), then re-run the build.',
  );
}

function pickWasmBin(dir) {
  // The published binary is kaspa_bg.wasm.bin; some toolchains emit kaspa_bg.wasm.
  for (const name of ['kaspa_bg.wasm.bin', 'kaspa_bg.wasm']) {
    const p = join(dir, name);
    if (existsSync(p)) return p;
  }
  throw new Error(`No kaspa_bg.wasm(.bin) found in ${dir}`);
}

async function main() {
  if (!existsSync(TEMPLATE)) throw new Error(`template missing: ${TEMPLATE}`);
  if (!existsSync(REDEEMER_SRC)) throw new Error(`canonical redeemer missing: ${REDEEMER_SRC}`);

  // Pull the CANONICAL claimability matrix from the in-app redeemer (pure core, no wasm at
  // module top-level, so this import never loads the ~15MB kaspa-wasm). Fail loud if the
  // export disappears or has the wrong shape, so a refactor cannot ship a tool with an empty
  // or stale matrix.
  const { KIND_CLAIM_MATRIX } = await import(pathToFileURL(REDEEMER_SRC).href);
  if (!KIND_CLAIM_MATRIX || typeof KIND_CLAIM_MATRIX !== 'object' || Object.keys(KIND_CLAIM_MATRIX).length === 0) {
    throw new Error('KIND_CLAIM_MATRIX import from covenantRedeemer.js was empty or missing; refusing to build a tool with no claimability matrix');
  }
  const coldMatrix = deriveColdMatrix(KIND_CLAIM_MATRIX);
  // Pretty-print so the injected object is human-readable in the served HTML (it is the
  // honesty surface) and JSON.parse-safe. JSON keys are quoted; that is valid JS object syntax.
  const claimabilityJson = JSON.stringify(coldMatrix, null, 2);

  // Extract the CANONICAL satisfier source (single source of truth) so the tool's signing
  // path is byte-identical-by-construction to covenantRedeemer.js and cannot hand-drift.
  const redeemerSrc = readFileSync(REDEEMER_SRC, 'utf8');
  const satisfierSource = extractCanonicalSatisfierSource(redeemerSrc);

  const kaspaDir = resolveKaspaDir();
  const gluePath = join(kaspaDir, 'kaspa.js');
  const wasmPath = pickWasmBin(kaspaDir);

  const glueSrc = readFileSync(gluePath, 'utf8');
  const wasmBin = readFileSync(wasmPath);

  // (1) base64 of the wasm bytes (parked verbatim in a text/plain script tag).
  const wasmB64 = wasmBin.toString('base64');

  // (2) base64 of the glue ESM, imported from a blob: module URL, namespace -> window.
  // We keep the glue UNCHANGED and load it as a module so its exports and import.meta.url
  // behave exactly as published. The blob URL is same-page (file:// safe). We never call
  // the glue's default network init; the page calls K.initSync(compiledModule).
  const glueB64 = Buffer.from(glueSrc, 'utf8').toString('base64');
  const glueModule = [
    '// Inlined @onekeyfe/kaspa-wasm ESM glue, imported from a blob: module URL so it runs',
    '// unmodified under file:// without any network/module fetch. We expose its namespace',
    '// on window.__KASPA_WASM__; the page initializes it with the inlined wasm bytes via',
    '// initSync(compiledModule) and never triggers the glue\'s default network init.',
    'const __KASPA_GLUE_SRC__ = atob("' + glueB64 + '");',
    'const __kaspaBlob__ = new Blob([__KASPA_GLUE_SRC__], { type: "text/javascript" });',
    'const __kaspaUrl__ = URL.createObjectURL(__kaspaBlob__);',
    'try {',
    '  const K = await import(__kaspaUrl__);',
    '  window.__KASPA_WASM__ = K;',
    '} catch (e) {',
    '  window.__KASPA_WASM__ = null;',
    '  console.error("kaspa-wasm glue import failed:", e);',
    '} finally {',
    '  URL.revokeObjectURL(__kaspaUrl__);',
    '}',
  ].join('\n');

  let html = readFileSync(TEMPLATE, 'utf8');

  // Substitute ONLY the exact injection slots (the script-tag bodies), not the bare
  // placeholder text - the template also mentions the placeholders in a doc comment, and
  // we must not rewrite those (nor any runtime guard). Match the full tag so the swap is
  // unambiguous and idempotent. Use split/join so a literal $ in base64 is never treated
  // as a String.replace replacement pattern.
  const B64_SLOT = '<script id="kaspa-wasm-b64" type="text/plain">__KASPA_WASM_B64__</script>';
  const GLUE_SLOT = '<script type="module">__KASPA_WASM_GLUE_MODULE__</script>';
  // The claimability matrix slot: `const CLAIMABILITY = __CLAIMABILITY_MATRIX_JSON__;`. We
  // swap only the placeholder TOKEN (not the bare token in the doc comment) by matching the
  // exact assignment, so the build is unambiguous and idempotent.
  const CLAIM_SLOT = 'const CLAIMABILITY = __CLAIMABILITY_MATRIX_JSON__;';
  // The satisfier-source slot: a lone `// __SATISFIER_SOURCE__` placeholder line inside the
  // tool's pure-core <script>. We replace it with the canonical span sliced from
  // covenantRedeemer.js, so the tool's signing path is single-sourced and cannot hand-drift.
  const SAT_SLOT = '// __SATISFIER_SOURCE__';
  if (!html.includes(B64_SLOT)) throw new Error('template lost the wasm-b64 injection slot');
  if (!html.includes(GLUE_SLOT)) throw new Error('template lost the glue-module injection slot');
  if (!html.includes(CLAIM_SLOT)) throw new Error('template lost the claimability-matrix injection slot');
  if (!html.includes(SAT_SLOT)) throw new Error('template lost the satisfier-source injection slot');

  html = html.split(B64_SLOT).join(
    '<script id="kaspa-wasm-b64" type="text/plain">' + wasmB64 + '</script>',
  );
  html = html.split(GLUE_SLOT).join(
    '<script type="module">\n' + glueModule + '\n</script>',
  );
  // split/join so any literal $ in the JSON is never treated as a String.replace pattern.
  html = html.split(CLAIM_SLOT).join('const CLAIMABILITY = ' + claimabilityJson + ';');
  // split/join so any literal $ in the injected source (template literals) is never treated
  // as a String.replace replacement pattern.
  html = html.split(SAT_SLOT).join(satisfierSource);

  // Final guard: every INJECTION SLOT must be filled. We check the slot strings, not the
  // bare placeholder tokens - the template's doc comment legitimately names the tokens while
  // explaining the build, and those mentions must survive untouched.
  if (html.includes(B64_SLOT) || html.includes(GLUE_SLOT) || html.includes(CLAIM_SLOT) || html.includes(SAT_SLOT)) {
    throw new Error('build left an unfilled injection slot in the output; refusing to emit a broken tool');
  }
  // Belt-and-braces: the placeholder token must be gone from the OUTPUT (it would break the
  // page's JS parse), but it legitimately survives in the template's doc comment, so we only
  // assert the executable slot was replaced (checked above via CLAIM_SLOT).

  mkdirSync(PUBLIC_DIR, { recursive: true });
  writeFileSync(OUT, html, 'utf8');

  const sha = createHash('sha256').update(readFileSync(OUT)).digest('hex');
  const sizeKb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(0);

  console.log('Cold-recovery tool built.');
  console.log('  glue:   ' + gluePath);
  console.log('  wasm:   ' + wasmPath + ' (' + (wasmBin.length / 1024 / 1024).toFixed(2) + ' MB)');
  console.log('  output: ' + OUT + ' (' + sizeKb + ' KB)');
  console.log('  matrix: ' + Object.keys(coldMatrix).length + ' kinds injected from KIND_CLAIM_MATRIX');
  console.log('  satisfier: canonical buildSatisfier+helpers injected from covenantRedeemer.js (' + REQUIRED_SATISFIER_DECLS.length + ' decls, ' + satisfierSource.split('\n').length + ' lines)');
  console.log('  SHA-256: ' + sha);
  console.log('');
  console.log('Pin that SHA-256 in README.md. Verify it before trusting the file:');
  console.log('  sha256sum covex-cold-recovery.html   (or: shasum -a 256 / certutil -hashfile)');
}

main().catch((e) => {
  console.error('Cold-recovery build failed:', e && e.stack ? e.stack : e);
  process.exit(1);
});
