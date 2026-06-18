export const SOLVED_DATES_KEY = 'fusion_solved_dates';

export function getSolvedDates(): string[] {
  try {
    const raw = localStorage.getItem(SOLVED_DATES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((d) => typeof d === 'string') : [];
  } catch {
    return [];
  }
}

export function addSolvedDate(date: string): void {
  try {
    const set = new Set(getSolvedDates());
    set.add(date);
    localStorage.setItem(SOLVED_DATES_KEY, JSON.stringify([...set]));
  } catch {
    /* ignore */
  }
}

export function hasSolvedDate(date: string): boolean {
  return getSolvedDates().includes(date);
}
