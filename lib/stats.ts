export type UserResult = {
  date: string; // YYYY-MM-DD
  champTries: number;
  score: number;
  bonus: boolean;
  solved: boolean;
  givenUp: boolean;
  hints?: number;
};

export type UserStats = {
  gamesPlayed: number;
  wins: number;
  winRate: number; // 0-100 integer
  avgChampTries: number; // over wins, 1 decimal
  bonusRate: number; // 0-100 integer, over wins
  currentStreak: number;
  maxStreak: number;
  avgScore: number; // over wins, integer
};

function prevDay(date: string): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function computeUserStats(results: UserResult[], today: string): UserStats {
  const gamesPlayed = results.length;
  const wins = results.filter((r) => r.solved && !r.givenUp);
  const winCount = wins.length;

  const winRate = gamesPlayed ? Math.round((winCount / gamesPlayed) * 100) : 0;
  const avgChampTries = winCount
    ? Math.round((wins.reduce((a, r) => a + r.champTries, 0) / winCount) * 10) / 10
    : 0;
  const bonusRate = winCount
    ? Math.round((wins.filter((r) => r.bonus).length / winCount) * 100)
    : 0;
  const avgScore = winCount
    ? Math.round(wins.reduce((a, r) => a + r.score, 0) / winCount)
    : 0;

  const winDates = Array.from(new Set(wins.map((r) => r.date))).sort();

  let maxStreak = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of winDates) {
    run = prev !== null && prevDay(d) === prev ? run + 1 : 1;
    if (run > maxStreak) maxStreak = run;
    prev = d;
  }

  let currentStreak = 0;
  if (winDates.length) {
    const last = winDates[winDates.length - 1];
    if (last === today || last === prevDay(today)) {
      currentStreak = 1;
      let cursor = last;
      for (let i = winDates.length - 2; i >= 0; i--) {
        if (winDates[i] === prevDay(cursor)) {
          currentStreak += 1;
          cursor = winDates[i];
        } else {
          break;
        }
      }
    }
  }

  return { gamesPlayed, wins: winCount, winRate, avgChampTries, bonusRate, currentStreak, maxStreak, avgScore };
}
