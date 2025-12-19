'use server';

import { kv } from '@vercel/kv';

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
  gameStatus?: 'playing' | 'phase2' | 'won';
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
    const isPhase2 = newFound.includes('B');
    return {
      correct: true,
      slot: 'A',
      gameStatus: isPhase2 ? 'phase2' : 'playing',
      message: `Correct! It contains ${puzzle.champA}!`
    };
  }

  if (normalizedGuess === champB) {
    const newFound = [...foundSlots, 'B'];
    const isPhase2 = newFound.includes('A');
    return {
      correct: true,
      slot: 'B',
      gameStatus: isPhase2 ? 'phase2' : 'playing',
      message: `Correct! It contains ${puzzle.champB}!`
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
