import type { PersonalizationSignals } from '../ai/schema';

export type MotionParams = {
  /** Base duration multiplier (1 = normal) */
  durationScale: number;
  /** CSS easing string */
  easing: string;
  /** Reveal distance in px */
  revealDistance: number;
  /** Whether to play the full choreography or fall back to cross-fade */
  reducedMotion: boolean;
};

const DEFAULTS: MotionParams = {
  durationScale: 1,
  easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
  revealDistance: 24,
  reducedMotion: false,
};

export function signalsToMotion(signals: PersonalizationSignals | null): MotionParams {
  // Always respect the OS preference first
  const prefersReduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (prefersReduced || !signals) {
    return { ...DEFAULTS, reducedMotion: true, durationScale: 0, revealDistance: 0 };
  }

  let durationScale = 1;
  let easing = DEFAULTS.easing;
  let revealDistance = 24;

  // Energy drives pace
  if (signals.energy === 'high') {
    durationScale = 0.7;
    easing = 'cubic-bezier(0.34, 1.56, 0.64, 1)'; // spring-like
    revealDistance = 32;
  } else if (signals.energy === 'low') {
    durationScale = 1.4;
    easing = 'cubic-bezier(0.4, 0, 0.2, 1)'; // smooth
    revealDistance = 16;
  }

  // Anxiety nudges toward gentler motion
  if (signals.mood === 'anxious' || signals.mood === 'overwhelmed') {
    durationScale *= 1.2;
    revealDistance = Math.max(8, revealDistance - 8);
  }

  return {
    durationScale,
    easing,
    revealDistance,
    reducedMotion: false,
  };
}
