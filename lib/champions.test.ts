import { describe, it, expect } from 'vitest';
import { isCacheFresh, CHAMP_CACHE_TTL_MS, type ChampCache } from './champions';

const base: ChampCache = { version: '14.1.1', names: ['Ahri'], fetchedAt: 1000 };

describe('isCacheFresh', () => {
  it('is false for a null cache', () => {
    expect(isCacheFresh(null, '14.1.1', 5000)).toBe(false);
  });
  it('is false when the version differs (new champ released)', () => {
    expect(isCacheFresh(base, '14.2.1', base.fetchedAt + 1000)).toBe(false);
  });
  it('is false when older than the TTL even if version matches', () => {
    expect(isCacheFresh(base, '14.1.1', base.fetchedAt + CHAMP_CACHE_TTL_MS + 1)).toBe(false);
  });
  it('is true when version matches and within TTL', () => {
    expect(isCacheFresh(base, '14.1.1', base.fetchedAt + 1000)).toBe(true);
  });
});
