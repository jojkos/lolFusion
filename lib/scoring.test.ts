import { describe, it, expect } from 'vitest';
import {
  computeBaseScore,
  computeFinalScore,
  BONUS_POINTS,
  HINT_ROLE_COST,
  HINT_ZOOM_COST,
  REVEAL_CHAMPION_COST,
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
  it('clamps champTries below par (2) to the max', () => {
    expect(computeBaseScore(1)).toBe(100);
    expect(computeBaseScore(0)).toBe(100);
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

describe('hint costs', () => {
  it('exposes the configured hint costs', () => {
    expect(HINT_ROLE_COST).toBe(10);
    expect(HINT_ZOOM_COST).toBe(10);
    expect(REVEAL_CHAMPION_COST).toBe(30);
  });
  it('a partial reveal penalty lowers the base score but not below the floor', () => {
    // 2 tries (base 100) minus a 30 reveal penalty = 70
    expect(computeBaseScore(2, REVEAL_CHAMPION_COST)).toBe(70);
    // heavy tries + penalties still floor at 10
    expect(computeBaseScore(12, REVEAL_CHAMPION_COST)).toBe(10);
  });
});
