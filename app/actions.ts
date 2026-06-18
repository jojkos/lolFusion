'use server';

import { kv } from '@vercel/kv';
import { computeUserStats, type UserResult, type UserStats } from '@/lib/stats';

type DailyPuzzle = {
  champA: string;
  champB: string;
  theme: string;
  imageUrl: string;
  date: string;
};

type GuessResult = {
  correct: boolean;
  slot?: 'A' | 'B';
  message?: string;
  gameStatus?: 'playing' | 'won';
};

export async function getDailyPuzzle() {
  try {
    const puzzle = await kv.get<DailyPuzzle>('daily_puzzle');
    if (!puzzle) {
      return null;
    }
    // Return only public info
    return {
      imageUrl: puzzle.imageUrl,
      date: puzzle.date,
    };
  } catch (error) {
    console.error('Failed to get daily puzzle:', error);
    return null;
  }
}

export async function submitChampionGuess(guess: string, foundSlots: ('A' | 'B')[]): Promise<GuessResult> {
  const puzzle = await kv.get<DailyPuzzle>('daily_puzzle');
  
  if (!puzzle) {
    return { correct: false, message: 'No active puzzle' };
  }

  const normalizedGuess = guess.toLowerCase().trim();
  const champA = puzzle.champA.toLowerCase();
  const champB = puzzle.champB.toLowerCase();

  // Check if already found
  if (foundSlots.includes('A') && normalizedGuess === champA) {
    return { correct: false, message: 'Already found!' };
  }
  if (foundSlots.includes('B') && normalizedGuess === champB) {
    return { correct: false, message: 'Already found!' };
  }

  if (normalizedGuess === champA) {
    const newFound = [...foundSlots, 'A'];
    const bothFound = newFound.includes('B');
    return {
      correct: true,
      slot: 'A',
      gameStatus: bothFound ? 'won' : 'playing',
      message: `Correct! It contains ${puzzle.champA}!`,
    };
  }

  if (normalizedGuess === champB) {
    const newFound = [...foundSlots, 'B'];
    const bothFound = newFound.includes('A');
    return {
      correct: true,
      slot: 'B',
      gameStatus: bothFound ? 'won' : 'playing',
      message: `Correct! It contains ${puzzle.champB}!`,
    };
  }

  return { correct: false, message: 'Incorrect!' };
}

export async function submitThemeGuess(guess: string): Promise<boolean> {
  const puzzle = await kv.get<DailyPuzzle>('daily_puzzle');
  if (!puzzle) return false;

  return guess.toLowerCase().trim() === puzzle.theme.toLowerCase();
}

/**
 * Reveal the answers (for game over or debugging, though game over logic wasn't explicitly requested to show answers, strict players might like to know).
 * We'll keep this protected or implicit. For now, let's essentially expose a "give up" or just let the client handle it.
 * Actually, the requirement says "Zoom out... Game Over/Win".
 * We might not want to send answers unless the game is over.
 */
export async function getSolution() {
    try {
        const puzzle = await kv.get<DailyPuzzle>('daily_puzzle');
        if (!puzzle) return null;
        
        return {
            champA: puzzle.champA,
            champB: puzzle.champB,
            theme: puzzle.theme
        };
    } catch (error) {
        console.error('Failed to get solution:', error);
        return null;
    }
}
export async function submitGameStats(attempts: number) {
  try {
    const puzzle = await kv.get<DailyPuzzle>('daily_puzzle');
    if (!puzzle) return null;

    // Use a hash to store the distribution of attempts for this date
    // Key: stats:{date} Field: {attempts} Value: count
    const key = `stats:${puzzle.date}`;
    await kv.hincrby(key, attempts.toString(), 1);

    // Also increment total completions
    await kv.incr(`stats:${puzzle.date}:total`);

    return true;
  } catch (error) {
    console.error('Failed to submit stats:', error);
    return false;
  }
}

export async function submitBonusSolved() {
  try {
    const puzzle = await kv.get<DailyPuzzle>('daily_puzzle');
    if (!puzzle) return false;
    await kv.incr(`stats:${puzzle.date}:bonus`);
    return true;
  } catch (error) {
    console.error('Failed to submit bonus solve:', error);
    return false;
  }
}

export async function getGameStats() {
    try {
        const puzzle = await kv.get<DailyPuzzle>('daily_puzzle');
        if (!puzzle) return null;

        const key = `stats:${puzzle.date}`;
        const distribution = await kv.hgetall(key);
        const total = await kv.get<number>(`stats:${puzzle.date}:total`);
        const bonus = await kv.get<number>(`stats:${puzzle.date}:bonus`);

        return {
            distribution: distribution || {},
            total: total || 0,
            bonus: bonus || 0,
        };
    } catch (error) {
        console.error('Failed to get stats:', error);
        return null;
    }
}

export async function recordUserResult(deviceId: string, result: UserResult): Promise<boolean> {
  try {
    if (!deviceId) return false;
    // @vercel/kv serializes the value; field is the puzzle date.
    await kv.hset(`user:${deviceId}`, { [result.date]: result });
    return true;
  } catch (error) {
    console.error('Failed to record user result:', error);
    return false;
  }
}

export async function getUserStats(deviceId: string): Promise<UserStats | null> {
  try {
    if (!deviceId) return null;
    const all = await kv.hgetall<Record<string, unknown>>(`user:${deviceId}`);
    if (!all) return null;
    const results: UserResult[] = Object.values(all)
      .map((v) => (typeof v === 'string' ? JSON.parse(v) : v))
      .filter((v): v is UserResult => !!v && typeof v === 'object' && 'date' in v);
    const today = new Date().toISOString().slice(0, 10);
    return computeUserStats(results, today);
  } catch (error) {
    console.error('Failed to get user stats:', error);
    return null;
  }
}

export async function getChampionHint(slot: 'A' | 'B'): Promise<{ role: string } | null> {
  try {
    const puzzle = await kv.get<DailyPuzzle>('daily_puzzle');
    if (!puzzle) return null;
    const name = slot === 'A' ? puzzle.champA : puzzle.champB;
    const vRes = await fetch('https://ddragon.leagueoflegends.com/api/versions.json');
    const versions = await vRes.json();
    const latest = versions[0];
    const cRes = await fetch(
      `https://ddragon.leagueoflegends.com/cdn/${latest}/data/en_US/champion.json`,
    );
    const data = await cRes.json();
    const champ = Object.values(data.data).find(
      (c) => (c as { name?: string }).name?.toLowerCase() === name.toLowerCase(),
    ) as { tags?: string[] } | undefined;
    const role = champ?.tags?.[0] ?? 'Unknown';
    return { role };
  } catch (error) {
    console.error('Failed to get champion hint:', error);
    return null;
  }
}

export type HistoryItem = DailyPuzzle & { totalSolvers: number };

export async function getPuzzleHistory(): Promise<HistoryItem[]> {
    try {
        // Fetch all puzzle keys from KV
        const keys = await kv.keys('puzzle:*');

        if (!keys || keys.length === 0) return [];

        // Batch fetch puzzles
        const puzzles = await kv.mget(...(keys as string[]));

        // Filter out nulls (days without puzzles)
        const validPuzzles = (puzzles as (DailyPuzzle | null)[]).filter(
          (p: DailyPuzzle | null): p is DailyPuzzle => !!p,
        );

        // Filter out today's puzzle — history should only show past days
        const today = new Date().toISOString().split('T')[0];
        const pastPuzzles = validPuzzles.filter((p: DailyPuzzle) => p.date < today);

        // Sort puzzles by date descending (most recent first)
        pastPuzzles.sort((a: DailyPuzzle, b: DailyPuzzle) =>
          b.date.localeCompare(a.date),
        );

        if (pastPuzzles.length === 0) return [];

        // Batch fetch stats for valid puzzles
        const statKeys = pastPuzzles.map((p: DailyPuzzle) => `stats:${p.date}:total`);
        const stats = await kv.mget<number[]>(...statKeys);

        // Combine
        return pastPuzzles.map((p: DailyPuzzle, index: number) => ({
            ...p,
            totalSolvers: stats[index] || 0
        }));

    } catch (error) {
        console.error('Failed to get history:', error);
        return [];
    }
}
