import { useLocation, useNavigate } from 'react-router-dom';

export const BUILD_STEPS = [
  { id: 'pick',    n: 1, label: 'Create', title: 'Pick what you want to build',
    match: (loc) => loc.pathname === '/sandbox' && (loc.search.includes('phase=create') || !/phase=/.test(loc.search)) },
  { id: 'logic',   n: 2, label: 'Logic',  title: 'Choose how it resolves',
    match: (loc) => loc.pathname === '/sandbox' && loc.search.includes('phase=logic') },
  { id: 'deploy',  n: 3, label: 'Deploy', title: 'Deploy on Kaspa',
    match: (loc) => loc.pathname === '/sandbox' && loc.search.includes('phase=deploy') },
  { id: 'design',  n: 4, label: 'Page',   title: 'Design the website',
    match: (loc) => /^\/covenant\/[^/]+\/studio/.test(loc.pathname) },
  { id: 'share',   n: 5, label: 'Share',  title: 'Preview and share',
    match: (loc) => /^\/covenant\/[^/]+(\/|$)/.test(loc.pathname) && !/\/studio$/.test(loc.pathname) },
];

// Sandbox phases are query params on /sandbox; the design/share steps live on a
// covenant detail/studio route, so goTo() can only navigate within the sandbox
// flow without a covenant id. We return null for the rest and the rail falls
// back to a non-interactive span.
const SANDBOX_PHASE_BY_N = { 1: 'create', 2: 'logic', 3: 'deploy' };

/**
 * Contract consumed by BuildStepsRail:
 *   current : the step NUMBER (1..5) or null when no step matches
 *   step    : the step object (or null) for callers that want metadata
 *   idx     : index in BUILD_STEPS or -1
 *   all     : BUILD_STEPS
 *   isDone  : (n) => true when the current flow position is past step n
 *   goTo    : (n) => navigate to the sandbox phase for n; no-op for design/share
 */
export function useBuildStep() {
  const loc = useLocation();
  const navigate = useNavigate();
  const idx = BUILD_STEPS.findIndex((s) => s.match(loc));
  const step = idx >= 0 ? BUILD_STEPS[idx] : null;
  const currentN = step ? step.n : null;

  const isDone = (n) => currentN != null && n < currentN;
  const goTo = (n) => {
    const phase = SANDBOX_PHASE_BY_N[n];
    if (phase) navigate(`/sandbox?phase=${phase}`);
  };

  return { current: currentN, step, idx, all: BUILD_STEPS, isDone, goTo };
}
