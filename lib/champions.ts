export type ChampCache = { version: string; names: string[]; fetchedAt: number };

export const CHAMP_CACHE_KEY = 'fusion_champ_cache';
export const CHAMP_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function isCacheFresh(
  cache: ChampCache | null,
  latestVersion: string,
  now: number,
): boolean {
  if (!cache) return false;
  if (cache.version !== latestVersion) return false;
  return now - cache.fetchedAt < CHAMP_CACHE_TTL_MS;
}

export function readChampCache(): ChampCache | null {
  try {
    const raw = localStorage.getItem(CHAMP_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.version === 'string' &&
      Array.isArray(parsed.names) &&
      typeof parsed.fetchedAt === 'number'
    ) {
      return parsed as ChampCache;
    }
    return null;
  } catch {
    return null;
  }
}

export function writeChampCache(cache: ChampCache): void {
  try {
    localStorage.setItem(CHAMP_CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* ignore quota / unavailable storage */
  }
}
