function buzz(pattern: number | number[]): void {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(pattern);
    } catch {
      /* ignore */
    }
  }
}

export const hapticCorrect = () => buzz(15);
export const hapticWrong = () => buzz([10, 40, 10]);
export const hapticWin = () => buzz([20, 40, 20, 40, 70]);
