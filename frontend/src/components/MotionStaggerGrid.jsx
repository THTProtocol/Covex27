import { lazy, Suspense } from 'react';

// framer-motion (~120KB) was landing in the homepage ENTRY chunk because Explorer (the eager
// homepage) used <motion.div> to stagger-reveal the covenant-card grid. The animation is pure
// enhancement - the cards are equally usable without it - so it has no business blocking first
// paint. This module isolates the framer-motion grid behind React.lazy: the homepage renders the
// identical PLAIN grid immediately (the Suspense fallback), and the animated version swaps in once
// its async chunk has loaded. So framer-motion is pulled out of the entry chunk while the grid
// content still appears on first paint with zero layout shift.

// The animated implementation lives in its own module so `import('framer-motion')` is only pulled
// when this lazy boundary resolves.
const AnimatedStaggerGrid = lazy(() => import('./AnimatedStaggerGrid.jsx'));

// The plain, dependency-free grid: the same wrapper element + className with the children laid out
// directly. Used as the Suspense fallback AND whenever reduced-motion is requested (no point
// loading framer-motion just to disable every animation).
function PlainGrid({ className, children }) {
  return <div className={className}>{children}</div>;
}

// Drop-in for the <motion.div variants=GRID_STAGGER> grid wrapper Explorer used. `items` is the
// array of card descriptors; `renderItem(item, index)` returns the card. `keyFor(item, index)`
// returns the React key. Children are rendered plainly in the fallback and rise-staggered once the
// motion chunk loads.
export default function MotionStaggerGrid({ className, items, renderItem, keyFor, prefersReduced }) {
  const children = items.map((item, i) => (
    <FragmentKeyed key={keyFor(item, i)}>{renderItem(item, i)}</FragmentKeyed>
  ));

  // Reduced-motion users never need framer-motion: render the plain grid directly, no async chunk.
  if (prefersReduced) {
    return <PlainGrid className={className}>{children}</PlainGrid>;
  }

  return (
    <Suspense fallback={<PlainGrid className={className}>{children}</PlainGrid>}>
      <AnimatedStaggerGrid className={className} items={items} renderItem={renderItem} keyFor={keyFor} />
    </Suspense>
  );
}

// Tiny keyed pass-through so the plain fallback and the animated version share the same child keys.
function FragmentKeyed({ children }) {
  return children;
}
