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
for (const file of walk(root)) {
  const src = readFileSync(file, 'utf8');
  const tags = src.match(/<iframe\b[\s\S]*?\/?>/g) || [];
  for (const tag of tags) {
    const userContent = /srcDoc|custom_ui_html|dangerouslySetInnerHTML/.test(tag);
    const sameOrigin = /allow-same-origin/.test(tag);
    if (userContent && sameOrigin) {
      violations.push(`${file.replace(root, 'src')}: ${tag.replace(/\s+/g, ' ').slice(0, 140)}`);
    }
  }
}

if (violations.length) {
  console.error('SANDBOX GUARD FAILED: user-content iframe(s) with allow-same-origin (full XSS escape):');
  for (const v of violations) console.error('  ' + v);
  console.error('Remove allow-same-origin from any iframe rendering creator/user HTML (srcDoc).');
  process.exit(1);
}
console.log('OK: no user-content iframe uses allow-same-origin (' + walk(root).length + ' files scanned)');
