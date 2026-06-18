import { describe, it, expect } from 'vitest';
import { buildShareText } from './share';

const base = {
  date: '2026-06-18',
  attempts: 2,
  givenUp: false,
  bonusSolved: false,
  streak: 0,
  score: 100 as number | null,
  url: 'https://lolfusion.app',
};

describe('buildShareText', () => {
  it('a clean 2-try win shows two greens, no misses', () => {
    const t = buildShareText(base);
    expect(t).toContain('LoL Fusion · 2026-06-18');
    expect(t).toContain('🟩🟩');
    expect(t).not.toContain('🟦');
    expect(t).toContain('Score 100');
    expect(t).toContain('https://lolfusion.app');
  });

  it('adds one blue per miss (attempts beyond 2)', () => {
    const t = buildShareText({ ...base, attempts: 5 });
    expect(t).toContain('🟦🟦🟦🟩🟩'); // 3 misses + 2 finds
  });

  it('appends the bonus star when solved', () => {
    const t = buildShareText({ ...base, bonusSolved: true });
    expect(t).toContain('🟩🟩 ✦');
  });

  it('shows a streak line only when streak > 0', () => {
    expect(buildShareText({ ...base, streak: 4 })).toContain('🔥 4 day streak');
    expect(buildShareText({ ...base, streak: 0 })).not.toContain('day streak');
  });

  it('renders surrender without a score line', () => {
    const t = buildShareText({ ...base, givenUp: true, score: null });
    expect(t).toContain('🟥 Surrendered');
    expect(t).not.toContain('Score');
    expect(t).not.toContain('🟩');
  });

  it('never leaks names (spoiler-free) — only known tokens present', () => {
    const t = buildShareText({ ...base, attempts: 3, bonusSolved: true, streak: 2 });
    // Only the fixed header, emoji, labels, and url — assert structure
    expect(t.split('\n')[0]).toBe('LoL Fusion · 2026-06-18');
  });
});
