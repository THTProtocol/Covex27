import { useState, useEffect } from 'react';

// A dependency-free `prefers-reduced-motion` hook. Equivalent to framer-motion's useReducedMotion
// but WITHOUT importing framer-motion - so a component that only needs the reduced-motion flag (to
// decide whether to animate) does not drag the whole framer-motion bundle into its chunk. Used by
// the homepage (Explorer) so framer-motion can be pulled out of the entry chunk entirely; the
// actual animation lives behind a lazy boundary (MotionStaggerGrid).
//
// SSR-safe: returns false on the server / before mount, then syncs to the live media query.
export default function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(mq.matches);
    update();
    // addEventListener is the modern API; addListener is the deprecated fallback for older Safari.
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', update);
      return () => mq.removeEventListener('change', update);
    }
    mq.addListener(update);
    return () => mq.removeListener(update);
  }, []);
  return reduced;
}
