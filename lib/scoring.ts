export const BASE_MAX = 100;
export const PAR_TRIES = 2;
export const PER_EXTRA_TRY = 10;
export const SCORE_FLOOR = 10;
export const BONUS_POINTS = 50;

/**
 * Base score from champion-phase tries (min 2) minus any hint penalty,
 * floored at SCORE_FLOOR. hintPenalty is 0 until the hint system ships.
 */
export function computeBaseScore(champTries: number, hintPenalty = 0): number {
  const tries = Math.max(champTries, PAR_TRIES);
  const raw = BASE_MAX - (tries - PAR_TRIES) * PER_EXTRA_TRY - hintPenalty;
  return Math.max(raw, SCORE_FLOOR);
}

/** Final score = base, plus the flat bonus when the skin line is solved. */
export function computeFinalScore(baseScore: number, bonusSolved: boolean): number {
  return baseScore + (bonusSolved ? BONUS_POINTS : 0);
}
