/**
 * SauceDemo ships deliberately-broken personas. Treating each one as a
 * "variant of the system under test" lets one test contract run against all
 * of them, and the known-defect register (known-defects.ts) records where each deviates.
 */
export const Personas = {
  standard: 'standard_user',
  lockedOut: 'locked_out_user',
  problem: 'problem_user',
  performanceGlitch: 'performance_glitch_user',
  error: 'error_user',
  visual: 'visual_user',
} as const;

export type Persona = (typeof Personas)[keyof typeof Personas];

/** Personas that can log in and reach the inventory. */
export const ACTIVE_PERSONAS: Persona[] = [
  Personas.standard,
  Personas.problem,
  Personas.performanceGlitch,
  Personas.error,
  Personas.visual,
];
