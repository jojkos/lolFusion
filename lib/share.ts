export function buildShareText(o: {
  date: string;
  attempts: number;
  givenUp: boolean;
  bonusSolved: boolean;
  streak: number;
  score: number | null;
  url: string;
}): string {
  const lines: string[] = [`LoL Fusion · ${o.date}`];

  if (o.givenUp) {
    lines.push('🟥 Surrendered');
  } else {
    const misses = Math.max(0, o.attempts - 2);
    lines.push('🟦'.repeat(misses) + '🟩🟩' + (o.bonusSolved ? ' ✦' : ''));
  }

  if (o.streak > 0) lines.push(`🔥 ${o.streak} day streak`);
  if (!o.givenUp && o.score !== null) lines.push(`Score ${o.score}`);

  lines.push(o.url);
  return lines.join('\n');
}
