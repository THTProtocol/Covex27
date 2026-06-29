import { motion } from 'framer-motion';

// The framer-motion-backed stagger grid. Loaded ONLY through the MotionStaggerGrid lazy boundary,
// so importing framer-motion here keeps it out of the homepage entry chunk. The variants match the
// values Explorer used inline so the reveal is visually identical to before the extraction.
const GRID_STAGGER = { hidden: {}, show: { transition: { staggerChildren: 0.025 } } };
const CARD_RISE = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.22, ease: [0.16, 1, 0.3, 1] } },
};

export default function AnimatedStaggerGrid({ className, items, renderItem, keyFor }) {
  return (
    <motion.div className={className} variants={GRID_STAGGER} initial="hidden" animate="show">
      {items.map((item, i) => (
        <motion.div key={keyFor(item, i)} variants={CARD_RISE}>
          {renderItem(item, i)}
        </motion.div>
      ))}
    </motion.div>
  );
}
