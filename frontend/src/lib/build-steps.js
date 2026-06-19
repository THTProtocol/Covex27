import { useLocation } from 'react-router-dom';

export const BUILD_STEPS = [
  { id: 'pick',    n: 1, label: 'Pick',    title: 'Pick what you want to build',
    match: (loc) => loc.pathname === '/sandbox' && (loc.search.includes('phase=create') || !/phase=/.test(loc.search)) },
  { id: 'logic',   n: 2, label: 'Logic',   title: 'Choose how it resolves',
    match: (loc) => loc.pathname === '/sandbox' && loc.search.includes('phase=logic') },
  { id: 'deploy',  n: 3, label: 'Deploy',  title: 'Deploy on Kaspa',
    match: (loc) => loc.pathname === '/sandbox' && loc.search.includes('phase=deploy') },
  { id: 'design',  n: 4, label: 'Design',  title: 'Design the website',
    match: (loc) => /^\/covenant\/[^/]+\/studio/.test(loc.pathname) },
  { id: 'share',   n: 5, label: 'Share',   title: 'Preview and share',
    match: (loc) => /^\/covenant\/[^/]+(\/|$)/.test(loc.pathname) && !/\/studio$/.test(loc.pathname) },
];

export function useBuildStep() {
  const loc = useLocation();
  const idx = BUILD_STEPS.findIndex((s) => s.match(loc));
  return { current: idx >= 0 ? BUILD_STEPS[idx] : null, idx, all: BUILD_STEPS };
}
