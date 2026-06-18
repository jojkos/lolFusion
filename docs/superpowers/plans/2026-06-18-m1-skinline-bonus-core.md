# M1 — Skin Line as Bonus (Core) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make finding both champions the win (score locked + stored at that moment), and turn the skin line into an optional, no-penalty bonus on the won screen.

**Architecture:** Collapse the 3-phase flow to two phases (`'phase1' | 'won'`) with a `bonusStatus` sub-state on the won screen. Extract all scoring into a pure, unit-tested `lib/scoring.ts`. Server actions record stats at champ-win and expose a new bonus-solve counter. UI renders the Victory card immediately on win with a skippable bonus strip above it.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Vercel KV, react-select, Tailwind v4. New dev dep: vitest (pure-logic tests only).

## Global Constraints

- Backend stays **Vercel KV + Vercel Blob**. No Supabase, no new infra. Daily puzzle generation/cron is **not touched**.
- Scoring (single source of truth, `lib/scoring.ts`): `base = max(100 - (champTries - 2) * 10 - hintPenalty, 10)`; `bonus = 50` if skin line solved; `final = base + bonus`. In M1 `hintPenalty` is always `0` (hints land in M4) but the parameter exists from the start.
- `champTries` = number of champion-phase guess submissions (correct + wrong), minimum 2. In phase1 every submission is a champion guess, so `champTries === attempts` at win.
- Wrong **bonus** guesses never change `attempts`, `champTries`, `base`, or the global distribution. Score freezes at win; bonus only adds.
- `Phase = 'phase1' | 'won'`. The string `'phase2'` must not remain anywhere in the codebase after M1.
- Global distribution histogram starts at **2** (was 3).
- Full **SURRENDER** records no score and is not added to the distribution (unchanged behavior); it shows only during `phase1`.
- Copy: the bonus is "+50", labeled `BONUS`. Skin line explained as "the shared skin theme — like Star Guardian, PROJECT, or Battle Academia."

---

### Task 1: Pure scoring module + vitest

**Files:**
- Create: `lib/scoring.ts`
- Test: `lib/scoring.test.ts`
- Modify: `package.json` (add `vitest` devDep + `test` script)
- Create: `vitest.config.ts`

**Interfaces:**
- Produces:
  - `computeBaseScore(champTries: number, hintPenalty?: number): number`
  - `computeFinalScore(baseScore: number, bonusSolved: boolean): number`
  - constants `BASE_MAX=100`, `PAR_TRIES=2`, `PER_EXTRA_TRY=10`, `SCORE_FLOOR=10`, `BONUS_POINTS=50`

- [ ] **Step 1: Add vitest dev dependency and test script**

Run:
```bash
cd /Users/jonas/Work/lolFusion && npm install -D vitest
```
Then add to `package.json` `"scripts"`:
```json
"test": "vitest run"
```

- [ ] **Step 2: Create vitest config**

Create `vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['lib/**/*.test.ts'],
    environment: 'node',
  },
});
```

- [ ] **Step 3: Write the failing test**

Create `lib/scoring.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import {
  computeBaseScore,
  computeFinalScore,
  BONUS_POINTS,
} from './scoring';

describe('computeBaseScore', () => {
  it('gives the max for a clean 2-try solve', () => {
    expect(computeBaseScore(2)).toBe(100);
  });
  it('subtracts 10 per extra try beyond par (2)', () => {
    expect(computeBaseScore(3)).toBe(90);
    expect(computeBaseScore(5)).toBe(70);
  });
  it('floors at 10 for many tries', () => {
    expect(computeBaseScore(50)).toBe(10);
  });
  it('subtracts the hint penalty', () => {
    expect(computeBaseScore(2, 30)).toBe(70);
  });
  it('never drops below the floor even with penalties', () => {
    expect(computeBaseScore(12, 100)).toBe(10);
  });
});

describe('computeFinalScore', () => {
  it('adds the bonus when solved', () => {
    expect(computeFinalScore(100, true)).toBe(100 + BONUS_POINTS);
  });
  it('returns base unchanged when bonus not solved', () => {
    expect(computeFinalScore(80, false)).toBe(80);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `./scoring`.

- [ ] **Step 5: Implement the scoring module**

Create `lib/scoring.ts`:
```ts
export const BASE_MAX = 100;
export const PAR_TRIES = 2;
export const PER_EXTRA_TRY = 10;
export const SCORE_FLOOR = 10;
export const BONUS_POINTS = 50;

/**
 * Base score from champion-phase tries (min 2) minus any hint penalty,
 * floored at SCORE_FLOOR. hintPenalty is 0 until the hint system ships.
 */
export function computeBaseScore(champTries: number, hintPenalty = 0): number {
  const raw = BASE_MAX - (champTries - PAR_TRIES) * PER_EXTRA_TRY - hintPenalty;
  return Math.max(raw, SCORE_FLOOR);
}

/** Final score = base, plus the flat bonus when the skin line is solved. */
export function computeFinalScore(baseScore: number, bonusSolved: boolean): number {
  return baseScore + (bonusSolved ? BONUS_POINTS : 0);
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test`
Expected: PASS (8 assertions).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vitest.config.ts lib/scoring.ts lib/scoring.test.ts
git commit -m "feat(scoring): add pure scoring module with tests"
```

---

### Task 2: Server actions — win on champions, bonus counter

**Files:**
- Modify: `app/actions.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `submitChampionGuess(guess, foundSlots)` — `gameStatus` returns `'won'` (not `'phase2'`) when both champions are found.
  - `submitGameStats(champTries: number)` — unchanged signature; now called at champ-win. Stores into `stats:{date}` (field=`champTries`) + increments `stats:{date}:total`.
  - `submitBonusSolved(): Promise<boolean>` — NEW; increments `stats:{date}:bonus`.
  - `getGameStats()` — return shape gains `bonus: number`.

- [ ] **Step 1: Change the win signal in `submitChampionGuess`**

In `app/actions.ts`, the `GuessResult` type — change `gameStatus?: 'playing' | 'phase2' | 'won'` to `gameStatus?: 'playing' | 'won'`.

In both correct-guess branches, replace the `isPhase2` logic. For the champ A branch:
```ts
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
```
Apply the symmetric change to the champ B branch (`bothFound = newFound.includes('A')`).

- [ ] **Step 2: Add `submitBonusSolved` and extend `getGameStats`**

Add after `submitGameStats`:
```ts
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
```

In `getGameStats`, fetch and return the bonus count:
```ts
    const distribution = await kv.hgetall(key);
    const total = await kv.get<number>(`stats:${puzzle.date}:total`);
    const bonus = await kv.get<number>(`stats:${puzzle.date}:bonus`);

    return {
      distribution: distribution || {},
      total: total || 0,
      bonus: bonus || 0,
    };
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS. (If `getGameStats` consumers complain about the new field, that is fixed in Task 5.)

- [ ] **Step 4: Commit**

```bash
git add app/actions.ts
git commit -m "feat(actions): win on both champions + bonus-solve counter"
```

---

### Task 3: `Phase` type + HeaderHUD/SlotRail/Artifact relabel

**Files:**
- Modify: `components/arcane.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `Phase = 'phase1' | 'won'`.
  - `HeaderHUD` gains `foundCount: number` prop; `FIND·2` chip active only when `foundCount >= 1`.
  - `SlotRail`/`SlotCard`: third slot labeled `BONUS`, never `locked`; new `optional` visual state.
  - `ArcaneArtifact` step label uses the 2-phase model.

- [ ] **Step 1: Narrow the `Phase` type**

In `components/arcane.tsx`, line ~5:
```ts
export type Phase = 'phase1' | 'won';
```

- [ ] **Step 2: Fix HeaderHUD chips (item 2 bug) + BONUS label**

Change the `HeaderHUD` signature to add `foundCount`:
```ts
export function HeaderHUD({
  phase,
  attempts,
  foundCount,
  onOpenHistory,
  onOpenHelp,
}: {
  phase: Phase;
  attempts: number;
  foundCount: number;
  onOpenHistory: () => void;
  onOpenHelp: () => void;
}) {
  const isPhase1 = phase === 'phase1';
  const isWon = phase === 'won';
```
Replace the chip row with:
```tsx
        <StepChip label="FIND · 1" active={isPhase1 && foundCount === 0} done={foundCount >= 1} />
        <StepArrow />
        <StepChip label="FIND · 2" active={isPhase1 && foundCount >= 1} done={isWon} />
        <StepArrow />
        <StepChip label="BONUS" active={isWon} done={false} />
```

- [ ] **Step 3: SlotRail — BONUS slot, no lock**

In `SlotRail`, replace the third `SlotCard` and remove the `locked` concept:
```tsx
      <SlotCard label="FIND · 1" value={slots.A.name} found={slots.A.found} optional={false} />
      <Connector active={slots.A.found} />
      <SlotCard label="FIND · 2" value={slots.B.name} found={slots.B.found} optional={false} />
      <Connector active={slots.A.found && slots.B.found} />
      <SlotCard label="BONUS" value={slots.Theme.name} found={slots.Theme.found} optional={phase !== 'won'} />
```
Update `SlotCard` to take `optional` instead of `locked`:
```tsx
function SlotCard({ label, value, found, optional }: {
  label: string; value: string | null; found: boolean; optional: boolean;
}) {
  const valueColor = found ? 'var(--ink)' : 'var(--ink-faint)';
  return (
    <div
      className="relative flex min-h-[48px] flex-col justify-center border px-2 py-[6px] transition-all duration-300 md:min-h-[72px] md:px-[14px] md:py-3"
      style={{
        background: 'var(--panel)',
        borderColor: found ? 'var(--accent)' : 'var(--border)',
        opacity: optional && !found ? 0.6 : 1,
      }}
    >
      <div className="font-[family-name:var(--font-mono)] text-[8px] tracking-[0.24em] md:text-[9px]"
        style={{ color: found ? 'var(--accent)' : 'var(--ink-faint)' }}>
        {found && '✓ '}{label}
      </div>
      <div className="mt-[4px] truncate font-[family-name:var(--font-display)] text-[14px] font-semibold md:mt-[6px] md:text-[18px]"
        style={{ color: valueColor }}>
        {value || (optional ? '— bonus —' : '?????')}
      </div>
      {found && (
        <div className="absolute right-[10px] top-[10px] hidden font-[family-name:var(--font-display)] md:block"
          style={{ color: 'var(--accent-2)' }}>✦</div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: ArcaneArtifact label (in `components/GameInterface.tsx`)**

> NOTE: `ArcaneArtifact` lives in `GameInterface.tsx`. Update its top-plate label which currently references `'phase2'`:
```tsx
                {phase === 'won' ? '✦ Complete ✦' : 'Step · 1'}
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: errors only in `GameInterface.tsx` (passes `phase2`, lacks `foundCount`) — fixed in Task 4/5.

- [ ] **Step 6: Commit**

```bash
git add components/arcane.tsx components/GameInterface.tsx
git commit -m "feat(arcane): 2-phase model, BONUS slot, fix FIND·2 chip"
```

---

### Task 4: GameInterface — win on champions + bonus widget state machine

**Files:**
- Modify: `components/GameInterface.tsx`

**Interfaces:**
- Consumes: `computeBaseScore` (Task 1); `submitBonusSolved`, updated `submitChampionGuess`/`getGameStats` (Task 2); `HeaderHUD` `foundCount`, narrowed `Phase` (Task 3).
- Produces: state machine where the second champion → `won`, with `bonusStatus: 'open' | 'solved' | 'skipped'` and `baseScore`. Bonus guesses don't bump `attempts`.

- [ ] **Step 1: Add bonus state + baseScore + import scoring**

Add import:
```ts
import { computeBaseScore } from '@/lib/scoring';
```
Add state near the other `useState` calls:
```ts
    const [bonusStatus, setBonusStatus] = useState<'open' | 'solved' | 'skipped'>('open');
    const [baseScore, setBaseScore] = useState(0);
```
Update the `submitGameStats`/`submitThemeGuess`/`getSolution` import line to also import `submitBonusSolved`:
```ts
import {
    submitChampionGuess,
    submitThemeGuess,
    getSolution,
    submitGameStats,
    submitBonusSolved,
    getGameStats,
} from '@/app/actions';
```

- [ ] **Step 2: Rework `handleGuess` — champion branch wins on both found**

Replace the `if (phase === 'phase1')` correct-guess block so that, when `result.gameStatus === 'won'`, it transitions straight to `won`, locks the score, and records stats:
```ts
        if (phase === 'phase1') {
            const result = await submitChampionGuess(finalGuess, foundSlots);

            if (result.correct && result.slot) {
                const newSlots = [...foundSlots, result.slot];
                setFoundSlots(newSlots);
                setMessage({ ok: true, text: result.message || `Champion identified — ${finalGuess}.` });
                setGuess('');

                const updatedRevealedNames = { ...revealedNames };
                if (result.slot === 'A') updatedRevealedNames.A = finalGuess;
                if (result.slot === 'B') updatedRevealedNames.B = finalGuess;
                setRevealedNames(updatedRevealedNames);

                if (result.gameStatus === 'won') {
                    // WIN: both champions found. Lock score, store stats, open bonus.
                    const score = computeBaseScore(newAttempts, 0);
                    setBaseScore(score);
                    setPhase('won');
                    setBonusStatus('open');
                    setZoomLevel(1.0);
                    triggerCelebration('win');
                    await submitGameStats(newAttempts);
                    fetchGlobalStats();
                    saveState({
                        foundSlots: newSlots,
                        phase: 'won',
                        zoomLevel: 1.0,
                        attempts: newAttempts,
                        champTries: newAttempts,
                        baseScore: score,
                        bonusStatus: 'open',
                        solved: true,
                        revealedNames: updatedRevealedNames,
                    });
                    setTimeout(() => {
                        if (!isMobile) resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    }, 500);
                } else {
                    triggerCelebration('slot');
                    saveState({
                        foundSlots: newSlots,
                        phase: 'phase1',
                        attempts: newAttempts,
                        revealedNames: updatedRevealedNames,
                    });
                }
            } else {
                setMessage({ ok: false, text: result.message || `${finalGuess} — not a match. The vision narrows.` });
                const newZoom = Math.max(1.0, zoomLevel - 0.5);
                setZoomLevel(newZoom);
                const newWrong = [...wrongGuesses, finalGuess];
                setWrongGuesses(newWrong);
                setGuess('');
                triggerShake();
                saveState({ zoomLevel: newZoom, wrongGuesses: newWrong, attempts: newAttempts });
            }
        }
```

- [ ] **Step 3: Replace the old phase2/theme branch with the bonus handler**

The old `else` branch (theme guess that set `phase='won'`) is removed from `handleGuess`. The bonus is now handled by a dedicated function. Add:
```ts
    const handleBonusGuess = async (explicitGuess?: string) => {
        const finalGuess = explicitGuess || guess;
        if (!finalGuess) return;
        if (wrongGuesses.includes(finalGuess)) {
            setMessage({ ok: false, text: `"${finalGuess}" already attempted.` });
            return;
        }
        setLoading(true);
        setMessage(null);
        const isCorrect = await submitThemeGuess(finalGuess);
        if (isCorrect) {
            setBonusStatus('solved');
            setMessage({ ok: true, text: 'Bonus solved — the skin line is yours.' });
            setGuess('');
            triggerCelebration('win');
            const updated = { ...revealedNames, Theme: finalGuess };
            setRevealedNames(updated);
            saveState({ bonusStatus: 'solved', revealedNames: updated });
            await submitBonusSolved();
            fetchGlobalStats();
        } else {
            setMessage({ ok: false, text: `${finalGuess} — not the skin line.` });
            const newWrong = [...wrongGuesses, finalGuess];
            setWrongGuesses(newWrong);
            setGuess('');
            triggerShake();
            // NOTE: no attempts++ — bonus guesses are penalty-free.
            saveState({ wrongGuesses: newWrong });
        }
        setLoading(false);
    };

    const handleSkipBonus = async () => {
        const sol = await getSolution();
        const theme = sol?.theme ?? null;
        const updated = { ...revealedNames, Theme: theme };
        setRevealedNames(updated);
        setBonusStatus('skipped');
        saveState({ bonusStatus: 'skipped', revealedNames: updated });
    };
```
Then guard the top of `handleGuess` so the early `attempts` increment only applies in `phase1` (it already only runs there now), and ensure `handleGuess`'s trailing `else` (theme) is gone.

- [ ] **Step 4: Restore bonus state from localStorage**

In the restore `useEffect`, replace the `parsed.phase === 'phase2'` branch and extend the solved branch:
```ts
                    if (parsed.solved) {
                        setPhase('won');
                        setZoomLevel(1.0);
                        if (typeof parsed.baseScore === 'number') setBaseScore(parsed.baseScore);
                        if (parsed.bonusStatus) setBonusStatus(parsed.bonusStatus);
                        setMessage({
                            ok: !parsed.givenUp,
                            text: parsed.givenUp ? 'The seal broke — the names were whispered to you.' : 'Welcome back — you already solved this.',
                        });
                        fetchGlobalStats();
                    } else if (parsed.zoomLevel) {
                        setZoomLevel(parsed.zoomLevel);
                    }
```

- [ ] **Step 5: Pass `foundCount` to HeaderHUD; gate SURRENDER to phase1**

Update the `HeaderHUD` usage:
```tsx
            <HeaderHUD
                phase={phase}
                attempts={attempts}
                foundCount={foundSlots.length}
                onOpenHistory={() => setHistoryOpen(true)}
                onOpenHelp={() => setHelpOpen(true)}
            />
```
The SURRENDER button block is already inside the `phase !== 'won'` branch, so it now only shows in `phase1` — no change needed beyond confirming it is not rendered in the bonus widget (Task 5).

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: remaining errors only in the won-screen render (VictoryCard props / bonus widget) — fixed in Task 5.

- [ ] **Step 7: Commit**

```bash
git add components/GameInterface.tsx
git commit -m "feat(game): win on both champions, skin line becomes optional bonus"
```

---

### Task 5: Won-screen render — bonus strip + VictoryCard scoring

**Files:**
- Modify: `components/GameInterface.tsx` (won-screen JSX)
- Modify: `components/arcane.tsx` (`VictoryCard`, `DistributionChart`)

**Interfaces:**
- Consumes: `bonusStatus`, `baseScore`, `handleBonusGuess`, `handleSkipBonus` (Task 4); `computeFinalScore`, `BONUS_POINTS` (Task 1); `getGameStats` shape with `bonus` (Task 2).
- Produces: `VictoryCard` props `{ baseScore, bonusSolved, bonusStatus, attempts, givenUp, solution, stats, shareCopied, onShare }`.

- [ ] **Step 1: Render the bonus strip above the VictoryCard**

In `GameInterface.tsx`, replace the `won` branch (the `ref={resultsRef}` block) so it shows the bonus picker while `bonusStatus === 'open'`, then the card:
```tsx
                        ) : (
                            <div ref={resultsRef} className="mt-[10px]">
                                {bonusStatus === 'open' && (
                                    <div className="mb-4 border p-3 md:p-4"
                                        style={{ borderColor: 'var(--accent)', background: 'var(--panel-inner)' }}>
                                        <div className="mb-2 font-[family-name:var(--font-mono)] text-[10px] tracking-[0.28em]"
                                            style={{ color: 'var(--accent)' }}>
                                            ✦ BONUS · +{BONUS_POINTS}
                                        </div>
                                        <div className="mb-3 text-[13px]" style={{ color: 'var(--ink-dim)' }}>
                                            Name the shared skin line — like Star Guardian, PROJECT, or Battle Academia.
                                        </div>
                                        <div className="flex gap-2">
                                            <div className="flex-1">
                                                {isMobile ? (
                                                    <MobilePicker
                                                        value={guess}
                                                        options={availableOptions}
                                                        placeholder="Name the skin line…"
                                                        disabled={loading}
                                                        onSelect={(val) => { setGuess(val); handleBonusGuess(val); }}
                                                    />
                                                ) : (
                                                    <Select
                                                        ref={selectRef}
                                                        instanceId={selectId}
                                                        inputId={`${selectId}-input`}
                                                        options={selectOptions}
                                                        value={guess ? { value: guess, label: guess } : null}
                                                        onChange={(option) => { if (option) { setGuess(option.value); handleBonusGuess(option.value); } }}
                                                        onInputChange={(value, action) => { if (action.action === 'input-change') setGuess(value); }}
                                                        inputValue={guess}
                                                        placeholder="Name the skin line…"
                                                        styles={selectStyles}
                                                        isSearchable
                                                        isClearable={false}
                                                        blurInputOnSelect={false}
                                                        filterOption={(option, input) => {
                                                            const normalize = (s: string) => s.toLowerCase().replace(/['-\s]/g, '');
                                                            return normalize(option.label).startsWith(normalize(input));
                                                        }}
                                                        noOptionsMessage={() => guess.length > 0 ? 'No matches' : 'Start typing…'}
                                                        isLoading={loading}
                                                        menuPlacement="auto"
                                                    />
                                                )}
                                            </div>
                                            <button
                                                onClick={handleSkipBonus}
                                                className="cursor-pointer px-[18px] font-[family-name:var(--font-mono)] text-[10px] tracking-[0.2em] transition-colors hover:text-[var(--accent)]"
                                                style={{ color: 'var(--ink-faint)', border: '1px solid var(--border)' }}
                                            >
                                                SKIP
                                            </button>
                                        </div>
                                        <WrongStrip guesses={wrongGuesses} message={message} />
                                    </div>
                                )}
                                <VictoryCard
                                    baseScore={baseScore}
                                    bonusSolved={bonusStatus === 'solved'}
                                    bonusStatus={bonusStatus}
                                    attempts={attempts}
                                    givenUp={givenUp}
                                    solution={solution}
                                    stats={globalStats}
                                    shareCopied={shareCopied}
                                    onShare={() => {
                                        const bonusTxt = bonusStatus === 'solved' ? 'Bonus ✦' : '— Bonus';
                                        const text = `LoL Fusion · ${initialData?.date ?? ''}\n${givenUp ? 'Surrendered' : `Solved in ${attempts}`} · ${bonusTxt}\nScore ${givenUp ? '—' : computeFinalScore(baseScore, bonusStatus === 'solved')}`;
                                        if (navigator.clipboard) {
                                            navigator.clipboard.writeText(text).then(() => {
                                                setShareCopied(true);
                                                setTimeout(() => setShareCopied(false), 2000);
                                            });
                                        }
                                    }}
                                />
                            </div>
                        )}
```
Add the import for `computeFinalScore`, `BONUS_POINTS`:
```ts
import { computeBaseScore, computeFinalScore, BONUS_POINTS } from '@/lib/scoring';
```

- [ ] **Step 2: Rework `VictoryCard` to use locked base + bonus**

In `components/arcane.tsx`, change `VictoryCard` props and score logic. Replace the props block and the `const score = ...` line:
```tsx
export function VictoryCard({
  baseScore,
  bonusSolved,
  bonusStatus,
  attempts,
  givenUp,
  solution,
  stats,
  shareCopied,
  onShare,
}: {
  baseScore: number;
  bonusSolved: boolean;
  bonusStatus: 'open' | 'solved' | 'skipped';
  attempts: number;
  givenUp: boolean;
  solution: { champA: string; champB: string; theme: string };
  stats: { distribution: Record<string, unknown>; total: number; bonus?: number } | null;
  shareCopied?: boolean;
  onShare?: () => void;
}) {
  const finalScore = givenUp ? null : baseScore + (bonusSolved ? 50 : 0);
```
Replace the score strip cell + theme reveal so the theme greys out when not solved, and the score shows base + bonus:
```tsx
        <div className="mt-[8px] font-[family-name:var(--font-display)] text-[28px] font-bold tracking-[0.08em] md:text-[40px]"
          style={{ color: bonusSolved ? 'var(--ink)' : 'var(--ink-faint)' }}>
          {solution.theme.toUpperCase()}
          {bonusSolved && <span style={{ color: 'var(--accent-2)' }}> ✦</span>}
        </div>
```
And the score cell:
```tsx
        <ScoreCell label="SCORE" value={finalScore === null ? '—' : String(finalScore)} />
```
Keep `TRIES` = `attempts`. For `TOP %`, keep existing rank logic (it reads `attempts` against the distribution; distribution is now champ-tries so it still aligns).

- [ ] **Step 3: Distribution chart starts at 2**

In `DistributionChart`, change the loop lower bound:
```tsx
  for (let i = 2; i <= 12; i++) {
```

- [ ] **Step 4: Type-check + build**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS, no remaining `phase2` references.

- [ ] **Step 5: Verify no stray `phase2` remains**

Run: `grep -rn "phase2" components app lib`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add components/GameInterface.tsx components/arcane.tsx
git commit -m "feat(victory): immediate win + skippable bonus strip + base/bonus scoring"
```

---

### Task 6: Help modal copy + manual verification

**Files:**
- Modify: `components/arcane.tsx` (`HelpModal`)

- [ ] **Step 1: Rewrite the Help copy for the win/bonus model + accurate zoom rules**

Replace the `<ol>` in `HelpModal`:
```tsx
      <ol className="mt-4 list-decimal pl-5 text-[14px] leading-[1.7]" style={{ color: 'var(--ink-dim)' }}>
        <li>Two champions are fused into one image, wearing the same skin line. The fusion starts <b style={{ color: 'var(--ink)' }}>zoomed in</b>.</li>
        <li><b style={{ color: 'var(--ink)' }}>Win:</b> name <b style={{ color: 'var(--ink)' }}>both champions</b>. Each wrong guess pulls the view back, revealing a little more — but the fewer tries, the higher your score.</li>
        <li><b style={{ color: 'var(--ink)' }}>Bonus:</b> after you win, name the shared skin line (e.g. Star Guardian, PROJECT, Battle Academia) for +50. It's optional and never costs you anything.</li>
        <li>A new fusion drops daily.</li>
      </ol>
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Manual verification checklist (you run the app)**

Run: `npm run dev`, then in the browser confirm:
- Finding the first champion stays in `phase1` (artifact shows `Step · 1`, FIND·1 chip done, FIND·2 active).
- Finding the second champion **immediately** wins: win celebration fires, Victory card shows with a numeric SCORE, the bonus strip appears above it, the TRIES counter equals your champion guesses.
- A wrong skin-line guess shows the error, does **not** change TRIES or SCORE.
- Solving the skin line adds +50 to SCORE, shows the `✦` badge on the theme, and a celebration.
- SKIP collapses the strip and reveals the skin line greyed-out with no badge and no score change.
- Reloading the page restores the won state with the correct score and bonus status.
- SURRENDER appears only before winning.

- [ ] **Step 4: Commit**

```bash
git add components/arcane.tsx
git commit -m "docs(help): rewrite rules for win-on-champions + optional bonus"
```

---

## Self-Review

**Spec coverage (M1 scope from §12 + §3):**
- Two-phase model / `'phase2'` removed → Tasks 3, 4, 5 (grep gate in Task 5 Step 5). ✓
- Win on both champions, score locked + stored at win → Task 4 Step 2. ✓
- Scoring `base = max(100-(t-2)*10-penalty,10)`, `+50` bonus → Task 1 (tested). ✓
- KV semantics (`stats:{date}` by champTries, `:total`, new `:bonus`) → Task 2. ✓
- Won-screen bonus widget (open/solved/skipped), no-penalty wrong guesses, skip reveals greyed theme → Tasks 4, 5. ✓
- Slot/chip relabel to BONUS + FIND·2 chip bug (item 2) → Task 3. ✓
- Distribution starts at 2 → Task 5 Step 3. ✓
- SURRENDER only in phase1 → Task 4 Step 5. ✓
- Help copy + accurate zoom rules (item 1, copy-only) + skin-line explainer (item 11, partial) → Task 6, Task 5 Step 1. ✓
- Share text reflects bonus/score (full emoji-grid is M6) → Task 5 Step 1. ✓

**Out of M1 scope (later plans):** auto-help (M2), reduced-motion N/A, haptics/a11y/chart-marker/champ-cache (M2), device-ID/streak/personal-stats (M3), hints/partial-give-up (M4), archive replay/spoiler-gating (M5), emoji-grid share (M6).

**Placeholder scan:** no TBD/TODO; all code steps include full code. ✓

**Type consistency:** `computeBaseScore`/`computeFinalScore`/`BONUS_POINTS` names match across Tasks 1/4/5; `getGameStats` `bonus` field added in Task 2 and consumed (optional) in Task 5; `Phase` narrowed in Task 3 and used in Tasks 4/5; `bonusStatus` union identical across Tasks 4/5. ✓

**Note for M2+ plans:** the `'X% also cracked the bonus'` line on the Victory card uses the `stats.bonus` field already plumbed in Task 2 — wire it into `DistributionChart`/VictoryCard then.
