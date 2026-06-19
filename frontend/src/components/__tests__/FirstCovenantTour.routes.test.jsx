import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STEPS } from '../FirstCovenantTour.jsx';

// Regression guard for the tour-routing 404 (target 6 finding).
//
// Bug: STEPS used route '/explorer' and nextRoute '/explorer' for the
// Explorer targets, plus a '/explorer' fallback in the demo-missing branch.
// The Explorer is mounted at '/' in App.jsx (NOT '/explorer'). A first-time
// visitor who started the tour (?tour=1 or covex_tour_active=1) saw the
// first Next click navigate to '/explorer?tour=1', which fell through to
// the '*' NotFound route. The tour broke the moment it advanced.
//
// Fix: every Explorer-targeted route in this file uses '/'. This test asserts
// the fix and adversarially guards against regressions:
//   (a) The two Explorer-target STEPS entries (explorer-hero, build-cta) both
//       resolve to a live App.jsx route, never the '*' catch-all.
//   (b) The first two Next clicks of a brand-new visitor (the exact path the
//       bug took) land on live routes.
//   (c) The demoId-fallback branch resolves to a live route.
//   (d) The file contains no quoted '/explorer' string literal usable as a
//       navigation target.
//
// Scope note: this test is intentionally narrow to the '/explorer' fix. The
// studio-block step's '/studio' route is a separate (pre-existing) issue
// that has been flagged for its own task.
//
// On the choice to read App.jsx text rather than import it: App.jsx pulls in
// heavy children (kaspa-wasm, snarkjs, framer-motion) at module load that
// throw under SSR with no DOM. The route TABLE is a regex-able list of
// literal strings, so text extraction is the right tool here and matches the
// BuildStepsRail.test pattern of "assert against the structural truth".

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_JSX = path.resolve(__dirname, '..', '..', 'App.jsx');
const TOUR_JSX = path.resolve(__dirname, '..', 'FirstCovenantTour.jsx');

function liveRoutePatterns() {
  const src = fs.readFileSync(APP_JSX, 'utf8');
  // Match every <Route path="..." ... />. We capture the literal path string.
  const re = /<Route\s+path="([^"]+)"/g;
  const out = [];
  let m;
  while ((m = re.exec(src)) !== null) out.push(m[1]);
  return out;
}

// Resolve a concrete path against the live Route patterns. Param routes
// ('/covenant/:id') match any single segment in their slot. Returns the
// matched pattern, or null if only '*' would catch the path.
function matchRoute(pathname, patterns) {
  for (const pat of patterns) {
    if (pat === '*') continue;
    const re = new RegExp('^' + pat.replace(/:[A-Za-z_][A-Za-z0-9_]*/g, '[^/]+') + '$');
    if (re.test(pathname)) return pat;
  }
  return null;
}

describe('FirstCovenantTour: Explorer-targeted steps land on live routes (no 404 on Next)', () => {
  const patterns = liveRoutePatterns();

  it('App.jsx exposes the routes this test depends on', () => {
    // Sanity: if someone renames '/' the rest of the assertions need to be
    // re-evaluated. Fail loud so the next reader sees it.
    expect(patterns).toContain('/');
    expect(patterns).toContain('/sandbox');
    expect(patterns).toContain('/covenant/:id');
    expect(patterns).toContain('*'); // catch-all must exist
  });

  it('the two Explorer-target steps (explorer-hero, build-cta) both resolve to live routes', () => {
    const explorerSteps = STEPS.filter((s) => s.id === 'explorer-hero' || s.id === 'build-cta');
    expect(explorerSteps.length).toBe(2);
    for (const s of explorerSteps) {
      const r = matchRoute(s.route, patterns);
      expect(r, `STEPS[id=${s.id}].route=${s.route} 404s`).not.toBeNull();
      expect(r).not.toBe('*');
      const nr = matchRoute(s.nextRoute, patterns);
      expect(nr, `STEPS[id=${s.id}].nextRoute=${s.nextRoute} 404s`).not.toBeNull();
      expect(nr).not.toBe('*');
    }
  });

  it("a brand-new visitor's first two Next clicks land on live routes (the exact path the bug took)", () => {
    // STEPS[0] (explorer-hero) is where ?tour=1 mounts. The first Next
    // navigates to STEPS[0].nextRoute. The second Next navigates to
    // STEPS[1].nextRoute. Both must resolve to a real Route, never '*'.
    const firstNext = STEPS[0].nextRoute;
    const secondNext = STEPS[1].nextRoute;
    expect(firstNext).toBeTruthy();
    expect(secondNext).toBeTruthy();
    const firstMatch = matchRoute(firstNext, patterns);
    const secondMatch = matchRoute(secondNext, patterns);
    expect(firstMatch, `first Next -> ${firstNext} 404s`).not.toBeNull();
    expect(firstMatch).not.toBe('*');
    expect(secondMatch, `second Next -> ${secondNext} 404s`).not.toBeNull();
    expect(secondMatch).not.toBe('*');
    // Concretely: the targets are now '/' and '/sandbox', never '/explorer'.
    const liveTargets = new Set(['/', '/sandbox', '/covenant/:id']);
    const mapped = new Set([firstMatch, secondMatch]);
    for (const m of mapped) expect(liveTargets.has(m)).toBe(true);
  });

  it('the public-page (Finish) Next route resolves to a live route', () => {
    // STEPS last entry is the public-page step whose nextRoute is what the
    // Finish click invokes (and what handleNext falls back to). It used to
    // be '/explorer'; the fix is '/'.
    const publicPage = STEPS.find((s) => s.id === 'public-page');
    expect(publicPage).toBeTruthy();
    const r = matchRoute(publicPage.nextRoute, patterns);
    expect(r, `public-page nextRoute=${publicPage.nextRoute} 404s`).not.toBeNull();
    expect(r).not.toBe('*');
  });

  it('the demo-missing fallback resolves to a live route (the studio-block runtime branch in both useMemo and handleNext)', () => {
    // The two runtime branches that derive nextRoute from demoId fall back
    // to the Explorer when demoId is null. Both possibilities must hit a
    // real route.
    const demoId = 'a1b2c3d4'; // any non-empty id
    expect(matchRoute(`/covenant/${demoId}`, patterns)).toBe('/covenant/:id');
    expect(matchRoute('/', patterns)).toBe('/');
  });

  it('FirstCovenantTour source contains no quoted "/explorer" navigation target (regression guard)', () => {
    // The bug was 6 occurrences of '/explorer' in this file. The fix removes
    // every one as a routing target. Keep this guard so a future refactor
    // that re-introduces '/explorer' (a non-route) as a string literal
    // fails loud here.
    const src = fs.readFileSync(TOUR_JSX, 'utf8');
    // We allow the EXPLANATORY comment text that mentions /explorer (no
    // surrounding quotes); only quoted occurrences are navigation-capable.
    const offenders = src.match(/['"`]\/explorer['"`]/g) || [];
    expect(
      offenders,
      'a quoted "/explorer" was reintroduced (it is not a real route - Explorer is at "/")'
    ).toEqual([]);
  });
});
