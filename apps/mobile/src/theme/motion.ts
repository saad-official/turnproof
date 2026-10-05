// Reanimated-ready motion values built from the shared tokens. Calm by design: gentle springs,
// strong ease-out, nothing bouncy unless a finger carried momentum.
import { motion } from '@turnproof/shared/tokens';
import { cubicBezier, Easing } from 'react-native-reanimated';

/** `withTiming` easings. */
export const easing = {
  standard: Easing.bezier(...motion.easing.standard),
  exit: Easing.bezier(...motion.easing.exit),
  /** Strong ease-out for entrances and press feedback. */
  out: Easing.bezier(0.23, 1, 0.32, 1),
} as const;

/** Reanimated CSS-transition timing functions. */
export const cssEasing = {
  standard: cubicBezier(...motion.easing.standard),
  exit: cubicBezier(...motion.easing.exit),
  out: cubicBezier(0.23, 1, 0.32, 1),
} as const;

/** `withSpring` configs: `gentle` for checks, shutter and chips; `soft` for room slides and tiles. */
export const springs = motion.spring;
