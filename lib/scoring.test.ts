import { describe, it, expect } from 'vitest';
import {
  computeBaseScore,
  computeFinalScore,
  BONUS_POINTS,
} from './scoring';

describe('computeBaseScore', () => {
  it('gives the max for a clean 2-try solve', () => {
    expect(computeBaseScore(2)).toBe(100);
  });
  it('subtracts 10 per extra try beyond par (2)', () => {
    expect(computeBaseScore(3)).toBe(90);
    expect(computeBaseScore(5)).toBe(70);
  });
  it('floors at 10 for many tries', () => {
    expect(computeBaseScore(50)).toBe(10);
  });
  it('subtracts the hint penalty', () => {
    expect(computeBaseScore(2, 30)).toBe(70);
  });
  it('never drops below the floor even with penalties', () => {
    expect(computeBaseScore(12, 100)).toBe(10);
  });
});

describe('computeFinalScore', () => {
  it('adds the bonus when solved', () => {
    expect(computeFinalScore(100, true)).toBe(100 + BONUS_POINTS);
  });
  it('returns base unchanged when bonus not solved', () => {
    expect(computeFinalScore(80, false)).toBe(80);
  });
});
