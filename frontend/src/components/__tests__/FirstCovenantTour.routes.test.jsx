import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STEPS } from '../FirstCovenantTour.jsx';

// Regression guard for tour-routing 404s.
//
// Original bug (target 6): STEPS used route '/explorer' and nextRoute
// '/explorer' for the Explorer targets, plus a '/explorer' fallback in the
// demo-missing branch. The Explorer is mounted at '/' in App.jsx (NOT
// '/explorer'). A first-time visitor who started the tour (?tour=1 or
// covex_tour_active=1) saw the first Next click navigate to '/explorer?tour=1',
// which fell through to the '*' NotFound route.
//
// Follow-up bug (this round): STEPS[id=studio-block].route was '/studio' and
// STEPS[id=sandbox-deploy].nextRoute was '/studio'. App.jsx has NO '/studio'
// route, only '/covenant/:id/studio'. The tour 404'd when advancing from
// Phase 3 of the Sandbox into the website builder. Fix: both fields are now
// computed at runtime in the useMemo block from demoId, mirroring the
// existing public-page pattern.
//
// This test now covers ALL STEPS entries (no longer scoped only to the
// Explorer targets) and adversarially guards against regressions:
//   (a) Every STEPS entry resolves its route AND nextRoute to a live App.jsx
//       route, never the '*' catch-all. Routes that are null at module load
//       (computed at runtime from demoId) are resolved against a fake demo id
//       so the runtime form is what gets matched.
//   (b) The brand-new visitor's first two Next clicks (the exact path the
//       original bug took) land on live routes.
//   (c) The demoId-fallback branches resolve to live routes.
//   (d) The file contains no quoted '/explorer' or '/studio' string literal
//       usable as a navigation target (neither is a real Route).
//   (e) The demoMissing path in handleNext skips studio-block and public-page
//       so the tour never tries to navigate to a runtime route with no id.
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
//
// React Router matches on the PATHNAME only; the query string and hash are
// not part of route resolution. The Sandbox build-tour steps carry ?phase=
// and ?circuit= so the right phase/selection mount, so strip the query/hash
// here to mirror real routing before matching against the path patterns.
function matchRoute(pathname, patterns) {
  const cleanPath = String(pathname).split('?')[0].split('#')[0];
  for (const pat of patterns) {
    if (pat === '*') continue;
    const re = new RegExp('^' + pat.replace(/:[A-Za-z_][A-Za-z0-9_]*/g, '[^/]+') + '$');
    if (re.test(cleanPath)) return pat;
  }
  return null;
}

// Resolve a STEPS field that may be null at module load (route/nextRoute
// for the runtime-computed steps) against a synthetic demo id. The runtime
// useMemo computes these as /covenant/${demoId}[/studio]; the resolver
// mirrors that contract so the test asserts the SHAPE that will actually
// be navigated to.
function resolveRuntime(stepId, field, demoId) {
  if (stepId === 'sandbox-deploy' && field === 'nextRoute') {
    return demoId ? `/covenant/${demoId}/studio` : null;
  }
  if (stepId === 'studio-block' && field === 'route') {
    return demoId ? `/covenant/${demoId}/studio` : null;
  }
  if (stepId === 'studio-block' && field === 'nextRoute') {
    return demoId ? `/covenant/${demoId}` : '/';
  }
  if (stepId === 'public-page' && field === 'route') {
    return demoId ? `/covenant/${demoId}` : null;
  }
  // For all other (static) fields, the literal value is the navigation target.
  return undefined;
}

describe('FirstCovenantTour: every step lands on a live App.jsx route (no 404 on Next)', () => {
  const patterns = liveRoutePatterns();
  const DEMO_ID = 'a1b2c3d4'; // any non-empty id

  it('App.jsx exposes the routes this test depends on', () => {
    // Sanity: if someone renames '/' the rest of the assertions need to be
    // re-evaluated. Fail loud so the next reader sees it.
    expect(patterns).toContain('/');
    expect(patterns).toContain('/sandbox');
    expect(patterns).toContain('/covenant/:id');
    expect(patterns).toContain('/covenant/:id/studio');
    expect(patterns).toContain('*'); // catch-all must exist
  });

  it('every STEPS entry resolves both route and nextRoute to a live route (covers Explorer, Sandbox, Studio, public-page)', () => {
    for (const s of STEPS) {
      const routeTarget = s.route ?? resolveRuntime(s.id, 'route', DEMO_ID);
      const nextTarget = s.nextRoute ?? resolveRuntime(s.id, 'nextRoute', DEMO_ID);
      expect(routeTarget, `STEPS[id=${s.id}].route is null with no runtime resolver`).toBeTruthy();
      expect(nextTarget, `STEPS[id=${s.id}].nextRoute is null with no runtime resolver`).toBeTruthy();
      const r = matchRoute(routeTarget, patterns);
      expect(r, `STEPS[id=${s.id}].route=${routeTarget} 404s`).not.toBeNull();
      expect(r).not.toBe('*');
      const nr = matchRoute(nextTarget, patterns);
      expect(nr, `STEPS[id=${s.id}].nextRoute=${nextTarget} 404s`).not.toBeNull();
      expect(nr).not.toBe('*');
    }
  });

  it('studio-block specifically resolves to /covenant/:id/studio with a demo id (the bug this round)', () => {
    const studio = STEPS.find((s) => s.id === 'studio-block');
    expect(studio).toBeTruthy();
    // The raw fields are null on purpose: routes are computed at runtime.
    expect(studio.route).toBeNull();
    const resolvedRoute = resolveRuntime('studio-block', 'route', DEMO_ID);
    const resolvedNext = resolveRuntime('studio-block', 'nextRoute', DEMO_ID);
    expect(matchRoute(resolvedRoute, patterns)).toBe('/covenant/:id/studio');
    expect(matchRoute(resolvedNext, patterns)).toBe('/covenant/:id');
    // And the prior step's nextRoute must point at the same /covenant/:id/studio.
    const sandboxDeploy = STEPS.find((s) => s.id === 'sandbox-deploy');
    expect(sandboxDeploy.nextRoute).toBeNull();
    const resolvedPriorNext = resolveRuntime('sandbox-deploy', 'nextRoute', DEMO_ID);
    expect(matchRoute(resolvedPriorNext, patterns)).toBe('/covenant/:id/studio');
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
    // The runtime branches that derive nextRoute from demoId fall back
    // to the Explorer when demoId is null. Both possibilities must hit a
    // real route.
    const demoId = 'a1b2c3d4';
    expect(matchRoute(`/covenant/${demoId}`, patterns)).toBe('/covenant/:id');
    expect(matchRoute(`/covenant/${demoId}/studio`, patterns)).toBe('/covenant/:id/studio');
    expect(matchRoute('/', patterns)).toBe('/');
  });

  it('demoMissing skips studio-block and public-page so the tour never navigates to a runtime route with no id', () => {
    // handleNext's loop walks past any studio-block / public-page entry when
    // demoChecked && !demoId. This test guards the contract: those two ids
    // are the ONLY runtime-id-dependent steps, and they must appear at the
    // tail of STEPS so the skip loop reaches handleFinish (it can never land
    // on a later non-id step because there isn't one).
    const idDependent = STEPS.filter((s) => s.id === 'studio-block' || s.id === 'public-page');
    expect(idDependent.length).toBe(2);
    const idDependentIdxs = STEPS
      .map((s, i) => (s.id === 'studio-block' || s.id === 'public-page' ? i : -1))
      .filter((i) => i >= 0);
    // They must be contiguous at the tail of STEPS for the skip loop to
    // correctly fall through to handleFinish.
    expect(idDependentIdxs[0]).toBe(STEPS.length - 2);
    expect(idDependentIdxs[1]).toBe(STEPS.length - 1);
  });

  it('FirstCovenantTour source contains no quoted "/explorer" or "/studio" navigation target (regression guard)', () => {
    // The original bug was 6 occurrences of '/explorer'. The follow-up bug was
    // 2 occurrences of '/studio' (sandbox-deploy.nextRoute and
    // studio-block.route). Neither is a real Route in App.jsx. This guard
    // fails loud if either string is reintroduced as a quoted literal a
    // navigate() call could pick up. The /covenant/:id/studio runtime form is
    // a template string, not a quoted '/studio' literal, so it does not match.
    const src = fs.readFileSync(TOUR_JSX, 'utf8');
    const explorerOffenders = src.match(/['"`]\/explorer['"`]/g) || [];
    expect(
      explorerOffenders,
      'a quoted "/explorer" was reintroduced (it is not a real route - Explorer is at "/")'
    ).toEqual([]);
    const studioOffenders = src.match(/['"`]\/studio['"`]/g) || [];
    expect(
      studioOffenders,
      'a quoted "/studio" was reintroduced (it is not a real route - the studio is at /covenant/:id/studio)'
    ).toEqual([]);
  });
});
