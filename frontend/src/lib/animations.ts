import type { MotionProps, Transition } from 'framer-motion';

export type WaveInOptions = {
  offsetY?: number;
  stagger?: number;
  maxStaggerItems?: number;
  baseDelay?: number;
};

/**
 * "Wave" entrance animation for grid/list items.
 * Intended to be applied to a wrapper <motion.div> around interactive cards
 * (so we don't fight with drag/drop transforms inside the card itself).
 */
export function waveIn(
  index: number,
  reducedMotion: boolean | null,
  options: WaveInOptions = {}
): Pick<MotionProps, 'initial' | 'animate' | 'transition'> {
  const {
    offsetY = 10,
    stagger = 0.02,
    maxStaggerItems = 24,
    baseDelay = 0,
  } = options;

  if (reducedMotion) {
    return {
      initial: false,
      animate: { opacity: 1, y: 0 },
      transition: { duration: 0 } satisfies Transition,
    };
  }

  const clampedIndex = Math.min(Math.max(index, 0), maxStaggerItems);
  const delay = baseDelay + clampedIndex * stagger;

  return {
    initial: { opacity: 0, y: offsetY },
    animate: { opacity: 1, y: 0 },
    transition: {
      opacity: { duration: 0.18, ease: 'easeOut', delay },
      y: { type: 'spring', stiffness: 420, damping: 32, delay },
    } satisfies Transition,
  };
}
