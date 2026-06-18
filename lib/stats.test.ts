import { describe, it, expect } from 'vitest';
import { computeUserStats, type UserResult } from './stats';

const win = (date: string, over: Partial<UserResult> = {}): UserResult => ({
  date, champTries: 3, score: 90, bonus: false, solved: true, givenUp: false, ...over,
});

describe('computeUserStats', () => {
  it('returns zeroed stats for no results', () => {
    const s = computeUserStats([], '2026-06-18');
    expect(s).toEqual({ gamesPlayed: 0, wins: 0, winRate: 0, avgChampTries: 0, bonusRate: 0, currentStreak: 0, maxStreak: 0, avgScore: 0 });
  });

  it('counts a single win today as a streak of 1', () => {
    const s = computeUserStats([win('2026-06-18')], '2026-06-18');
    expect(s.wins).toBe(1);
    expect(s.currentStreak).toBe(1);
    expect(s.maxStreak).toBe(1);
  });

  it('counts consecutive days as a running streak', () => {
    const s = computeUserStats([win('2026-06-16'), win('2026-06-17'), win('2026-06-18')], '2026-06-18');
    expect(s.currentStreak).toBe(3);
    expect(s.maxStreak).toBe(3);
  });

  it('keeps the current streak alive when the last win was yesterday', () => {
    const s = computeUserStats([win('2026-06-16'), win('2026-06-17')], '2026-06-18');
    expect(s.currentStreak).toBe(2);
  });

  it('breaks the current streak when the last win is older than yesterday', () => {
    const s = computeUserStats([win('2026-06-14'), win('2026-06-15')], '2026-06-18');
    expect(s.currentStreak).toBe(0);
    expect(s.maxStreak).toBe(2);
  });

  it('excludes surrenders from wins and streaks', () => {
    const s = computeUserStats([win('2026-06-18', { solved: false, givenUp: true })], '2026-06-18');
    expect(s.gamesPlayed).toBe(1);
    expect(s.wins).toBe(0);
    expect(s.currentStreak).toBe(0);
  });

  it('computes rates and averages over wins only', () => {
    const results = [
      win('2026-06-16', { champTries: 2, score: 100, bonus: true }),
      win('2026-06-17', { champTries: 4, score: 80, bonus: false }),
      win('2026-06-18', { solved: false, givenUp: true, score: 0 }),
    ];
    const s = computeUserStats(results, '2026-06-18');
    expect(s.gamesPlayed).toBe(3);
    expect(s.wins).toBe(2);
    expect(s.winRate).toBe(67);          // 2/3
    expect(s.avgChampTries).toBe(3);     // (2+4)/2
    expect(s.bonusRate).toBe(50);        // 1 of 2 wins had bonus
    expect(s.avgScore).toBe(90);         // (100+80)/2
  });

  it('tracks max streak separately from a broken current streak', () => {
    const s = computeUserStats(
      [win('2026-06-10'), win('2026-06-11'), win('2026-06-12'), win('2026-06-15')],
      '2026-06-18',
    );
    expect(s.maxStreak).toBe(3);
    expect(s.currentStreak).toBe(0);
  });
});
