#!/usr/bin/env node
// CI guard (roadmap A11): fail if any iframe that renders USER/creator content
// (srcDoc / custom_ui_html / dangerouslySetInnerHTML) also carries
// `allow-same-origin`. That combination with `allow-scripts` lets the framed
// document reach the parent origin's cookies, localStorage, and wallet provider:
// a full XSS / account-takeover escape. Trusted first-party viz iframes that use
// `src=` (e.g. the kgi.kaspad.net DAG background) legitimately keep
// allow-same-origin and are NOT flagged because they carry no srcDoc.
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

function walk(dir) {
  let out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    out = statSync(p).isDirectory()
      ? out.concat(walk(p))
      : (/\.(jsx?|tsx?)$/.test(e) ? out.concat(p) : out);
  }
  return out;
}

const violations = [];
const files = walk(root);
for (const file of files) {
  const src = readFileSync(file, 'utf8');
  const rel = file.replace(root, 'src');
  const tags = src.match(/<iframe\b[\s\S]*?\/?>/g) || [];

  // ── Check 1 (original): user-content iframe must not also be allow-same-origin. ──
  for (const tag of tags) {
    const userContent = /srcDoc|custom_ui_html|dangerouslySetInnerHTML/.test(tag);
    const sameOrigin = /allow-same-origin/.test(tag);
    if (userContent && sameOrigin) {
      violations.push(`${rel}: [same-origin] ${tag.replace(/\s+/g, ' ').slice(0, 140)}`);
    }
  }

  // ── Check 2: creator HTML (custom_ui_html / custom_ui_code) must NEVER be rendered
  // via dangerouslySetInnerHTML. That bypasses the iframe sandbox entirely (full XSS
  // in the parent origin: cookies, localStorage, wallet provider). ──
  const dsih = /dangerouslySetInnerHTML\s*=\s*\{\{[\s\S]{0,200}?\}\}/g;
  let dm;
  while ((dm = dsih.exec(src)) !== null) {
    if (/custom_ui_html|custom_ui_code/.test(dm[0])) {
      violations.push(`${rel}: [dangerouslySetInnerHTML of creator HTML] ${dm[0].replace(/\s+/g, ' ').slice(0, 140)}`);
    }
  }

  // ── Check 3: any iframe whose srcDoc renders creator HTML MUST carry a sandbox= attr.
  // (allow-same-origin is separately forbidden by check 1.) ──
  for (const tag of tags) {
    const rendersCreator = /srcDoc\s*=\s*\{[^}]*custom_ui_html/.test(tag) || /srcDoc\s*=\s*\{[^}]*custom_ui_code/.test(tag);
    if (rendersCreator && !/\bsandbox\s*=/.test(tag)) {
      violations.push(`${rel}: [missing sandbox on creator srcDoc iframe] ${tag.replace(/\s+/g, ' ').slice(0, 140)}`);
    }
  }

  // ── Check 4: a file that injects creator HTML into an iframe via a Blob/object URL
  // (iframeRef.current.src = URL.createObjectURL(... custom_ui_html ...)) MUST also
  // declare a sandbox= on an <iframe> somewhere in the same file. ──
  const blobsCreator = /URL\.createObjectURL/.test(src) && /custom_ui_html|custom_ui_code/.test(src) && /\.src\s*=/.test(src);
  if (blobsCreator && !/\bsandbox\s*=/.test(src)) {
    violations.push(`${rel}: [Blob-URL creator iframe without a sandbox= attribute in file]`);
  }
}

if (violations.length) {
  console.error('SANDBOX GUARD FAILED: creator/user HTML rendered unsafely:');
  for (const v of violations) console.error('  ' + v);
  console.error('Creator HTML (custom_ui_html/custom_ui_code) must render ONLY inside a sandboxed');
  console.error('iframe (sandbox set, never allow-same-origin), never via dangerouslySetInnerHTML.');
  process.exit(1);
}
console.log('OK: creator HTML only renders inside sandboxed iframes (' + files.length + ' files scanned)');
