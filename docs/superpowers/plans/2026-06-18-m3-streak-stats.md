# M3 — Identity + Streak + Personal Stats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Give each player an anonymous device identity, record their per-day results in Vercel KV, and surface a daily streak + personal stats (win %, avg tries, bonus rate, streaks).

**Architecture:** A pure, unit-tested `lib/stats.ts` computes all derived stats (including streaks) from a list of per-day results. `lib/device.ts` mints/persists an anonymous device id. Two new server actions (`recordUserResult`, `getUserStats`) read/write a `user:{deviceId}` KV hash. `GameInterface` records results at win/bonus/surrender and loads stats; UI shows a streak in the header + a stats modal + a streak line on the Victory card. Builds on M1/M2 (branch `feat/skinline-bonus`).

**Tech Stack:** Next.js 16, React 19, TypeScript, Vercel KV, vitest, Tailwind v4.

## Global Constraints

- Backend stays Vercel KV. New key: `user:{deviceId}` (a hash, field = `YYYY-MM-DD`, value = a result object). No other infra.
- Anonymous identity only: a random UUID in `localStorage['fusion_device_id']`. No auth, no PII.
- **Only daily-puzzle results are recorded** (archive/practice from M5 must not write here). M3 records at: win (champions found), bonus solved (update), and surrender.
- Streak rule: a "win" = `solved === true && givenUp === false`. Current streak = consecutive UTC calendar days of wins ending **today or yesterday** (so it stays alive until a day is missed). Max streak = longest such run ever.
- All `localStorage` access guarded. `npx tsc --noEmit` clean after each task; `npm test` green. Do NOT run `npm run build`. Server actions may use `new Date()` (they run in Node).

---

### Task 1: Pure stats module (+ device id)

**Files:**
- Create: `lib/stats.ts`
- Test: `lib/stats.test.ts`
- Create: `lib/device.ts`

**Interfaces:**
- Produces:
  - `type UserResult = { date: string; champTries: number; score: number; bonus: boolean; solved: boolean; givenUp: boolean; hints?: number }`
  - `type UserStats = { gamesPlayed: number; wins: number; winRate: number; avgChampTries: number; bonusRate: number; currentStreak: number; maxStreak: number; avgScore: number }`
  - `computeUserStats(results: UserResult[], today: string): UserStats`
  - `getDeviceId(): string`, `DEVICE_ID_KEY = 'fusion_device_id'`

- [ ] **Step 1: Write the failing test** (`lib/stats.test.ts`)

```ts
import { describe, it, expect } from 'vitest';
import { computeUserStats, type UserResult } from './stats';

const win = (date: string, over: Partial<UserResult> = {}): UserResult => ({
  date, champTries: 3, score: 90, bonus: false, solved: true, givenUp: false, ...over,
});

describe('computeUserStats', () => {
  it('returns zeroed stats for no results', () => {
    const s = computeUserStats([], '2026-06-18');
    expect(s).toEqual({ gamesPlayed: 0, wins: 0, winRate: 0, avgChampTries: 0, bonusRate: 0, currentStreak: 0, maxStreak: 0, avgScore: 0 });
  });

  it('counts a single win today as a streak of 1', () => {
    const s = computeUserStats([win('2026-06-18')], '2026-06-18');
    expect(s.wins).toBe(1);
    expect(s.currentStreak).toBe(1);
    expect(s.maxStreak).toBe(1);
  });

  it('counts consecutive days as a running streak', () => {
    const s = computeUserStats([win('2026-06-16'), win('2026-06-17'), win('2026-06-18')], '2026-06-18');
    expect(s.currentStreak).toBe(3);
    expect(s.maxStreak).toBe(3);
  });

  it('keeps the current streak alive when the last win was yesterday', () => {
    const s = computeUserStats([win('2026-06-16'), win('2026-06-17')], '2026-06-18');
    expect(s.currentStreak).toBe(2);
  });

  it('breaks the current streak when the last win is older than yesterday', () => {
    const s = computeUserStats([win('2026-06-14'), win('2026-06-15')], '2026-06-18');
    expect(s.currentStreak).toBe(0);
    expect(s.maxStreak).toBe(2);
  });

  it('excludes surrenders from wins and streaks', () => {
    const s = computeUserStats([win('2026-06-18', { solved: false, givenUp: true })], '2026-06-18');
    expect(s.gamesPlayed).toBe(1);
    expect(s.wins).toBe(0);
    expect(s.currentStreak).toBe(0);
  });

  it('computes rates and averages over wins only', () => {
    const results = [
      win('2026-06-16', { champTries: 2, score: 100, bonus: true }),
      win('2026-06-17', { champTries: 4, score: 80, bonus: false }),
      win('2026-06-18', { solved: false, givenUp: true, score: 0 }),
    ];
    const s = computeUserStats(results, '2026-06-18');
    expect(s.gamesPlayed).toBe(3);
    expect(s.wins).toBe(2);
    expect(s.winRate).toBe(67);          // 2/3
    expect(s.avgChampTries).toBe(3);     // (2+4)/2
    expect(s.bonusRate).toBe(50);        // 1 of 2 wins had bonus
    expect(s.avgScore).toBe(90);         // (100+80)/2
  });

  it('tracks max streak separately from a broken current streak', () => {
    const s = computeUserStats(
      [win('2026-06-10'), win('2026-06-11'), win('2026-06-12'), win('2026-06-15')],
      '2026-06-18',
    );
    expect(s.maxStreak).toBe(3);
    expect(s.currentStreak).toBe(0);
  });
});
```

- [ ] **Step 2: Run test, verify it fails** — Run: `npm test` → FAIL (cannot resolve `./stats`).

- [ ] **Step 3: Implement `lib/stats.ts`**

```ts
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
```

- [ ] **Step 4: Run test, verify it passes** — Run: `npm test` → all stats tests PASS.

- [ ] **Step 5: Implement `lib/device.ts`**

```ts
export const DEVICE_ID_KEY = 'fusion_device_id';

export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return 'anonymous';
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add lib/stats.ts lib/stats.test.ts lib/device.ts
git commit -m "feat(stats): pure user-stats + streak computation + device id"
```

---

### Task 2: Server actions — record + read user results

**Files:**
- Modify: `app/actions.ts`

**Interfaces:**
- Consumes: `computeUserStats`, `UserResult` from `@/lib/stats`.
- Produces:
  - `type UserResultInput = UserResult` (re-exported or inline)
  - `recordUserResult(deviceId: string, result: UserResult): Promise<boolean>`
  - `getUserStats(deviceId: string): Promise<UserStats | null>`

- [ ] **Step 1: Add the actions to `app/actions.ts`**

Import the pure helpers at the top: `import { computeUserStats, type UserResult, type UserStats } from '@/lib/stats';`

Add:
```ts
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
```

(The defensive `typeof v === 'string' ? JSON.parse(v) : v` handles whichever serialization `@vercel/kv` returns.)

- [ ] **Step 2: Type-check** — Run: `npx tsc --noEmit`. Expected: errors only where `GameInterface.tsx` will consume these in Task 3 (none yet, so likely clean).

- [ ] **Step 3: Commit**

```bash
git add app/actions.ts
git commit -m "feat(actions): record + read per-device user results in KV"
```

---

### Task 3: GameInterface — identity + record results + load stats

**Files:**
- Modify: `components/GameInterface.tsx`

**Interfaces:**
- Consumes: `getDeviceId` (Task 1); `recordUserResult`, `getUserStats` (Task 2); `UserStats` type.
- Produces: `userStats` state + a `recordResult` helper used by win/bonus/surrender paths.

- [ ] **Step 1: Add device id, userStats state, and a record helper**

- Import `getDeviceId` from `@/lib/device`, and `recordUserResult`, `getUserStats` from `@/app/actions`. Import `type UserStats` from `@/lib/stats`.
- Add state: `const [userStats, setUserStats] = useState<UserStats | null>(null);`
- Add a ref/memo device id resolved once in an effect (guarded): `const [deviceId, setDeviceId] = useState<string>('');` set via `useEffect(() => setDeviceId(getDeviceId()), [])`.
- Add `const refreshUserStats = async (id: string) => { if (!id) return; const s = await getUserStats(id); if (s) setUserStats(s); };` and call it once `deviceId` is set (effect on `[deviceId]`).

- [ ] **Step 2: Record at win, bonus-solve, and surrender**

Add a helper inside the component:
```ts
const recordDaily = async (over: { score: number; bonus: boolean; solved: boolean; givenUp: boolean; champTries: number }) => {
  if (!deviceId || !initialData) return;
  await recordUserResult(deviceId, { date: initialData.date, hints: 0, ...over });
  refreshUserStats(deviceId);
};
```
Wire it:
- **Win path** (second champion found): after `submitGameStats(newAttempts)`, call `recordDaily({ score: score, bonus: false, solved: true, givenUp: false, champTries: newAttempts });` (use the `baseScore` value computed there).
- **Bonus solved** (in `handleBonusGuess` success): after `submitBonusSolved()`, call `recordDaily({ score: computeFinalScore(baseScore, true), bonus: true, solved: true, givenUp: false, champTries: attempts });`.
- **Surrender** (`handleGiveUp`): after setting state, call `recordDaily({ score: 0, bonus: false, solved: false, givenUp: true, champTries: attempts });`.

(`hints` stays 0 until M4 wires real hint counts.)

- [ ] **Step 3: Pass stats to the UI**

Pass `streak={userStats?.currentStreak ?? 0}` to `HeaderHUD` and `userStats`/`onOpenStats` as needed (UI built in Task 4). Add `const [statsOpen, setStatsOpen] = useState(false);`.

- [ ] **Step 4: Type-check** — Run: `npx tsc --noEmit`. Expected: errors only for the not-yet-added `HeaderHUD` props / StatsModal (Task 4). Note them; they resolve in Task 4.

- [ ] **Step 5: Commit**

```bash
git add components/GameInterface.tsx
git commit -m "feat(game): anonymous device id + record daily results + load user stats"
```

---

### Task 4: UI — header streak, stats modal, victory streak

**Files:**
- Modify: `components/arcane.tsx` (HeaderHUD, VictoryCard)
- Create: `components/StatsModal.tsx`

**Interfaces:**
- Consumes: `UserStats` (Task 1); `statsOpen`/`setStatsOpen`, `userStats`, `streak` (Task 3); the existing `ArcaneModal` shell exported from `arcane.tsx`.

- [ ] **Step 1: HeaderHUD — streak indicator + STATS button**

In `components/arcane.tsx` `HeaderHUD`, add props `streak: number` and `onOpenStats: () => void`. Render, in the right-hand controls row: when `streak > 0`, a small indicator `🔥 {streak}` styled like the existing TRIES block (mono, `var(--accent)`); and a `STATS` button mirroring the existing HISTORY/RULES buttons (same classes/tokens) that calls `onOpenStats`.

- [ ] **Step 2: Create `components/StatsModal.tsx`**

A modal using the existing `ArcaneModal` shell from `./arcane`. Props: `{ stats: UserStats | null; onClose: () => void }`. Render a titled panel ("· RECORD ·" / "Your Stats") with a grid of cells (reuse the visual language of the Victory card's score cells): Played, Win %, Current Streak, Max Streak, Avg Tries, Bonus %, Avg Score. If `stats` is null or `gamesPlayed === 0`, show an italic empty state ("No games recorded yet."). Use existing CSS tokens; no raw hex.

```tsx
'use client';
import { ArcaneModal } from './arcane';
import type { UserStats } from '@/lib/stats';

export default function StatsModal({ stats, onClose }: { stats: UserStats | null; onClose: () => void }) {
  const empty = !stats || stats.gamesPlayed === 0;
  const cells: { label: string; value: string }[] = stats
    ? [
        { label: 'PLAYED', value: String(stats.gamesPlayed) },
        { label: 'WIN %', value: String(stats.winRate) },
        { label: 'STREAK', value: String(stats.currentStreak) },
        { label: 'MAX STREAK', value: String(stats.maxStreak) },
        { label: 'AVG TRIES', value: String(stats.avgChampTries) },
        { label: 'BONUS %', value: String(stats.bonusRate) },
        { label: 'AVG SCORE', value: String(stats.avgScore) },
      ]
    : [];
  return (
    <ArcaneModal onClose={onClose} maxWidth={460}>
      <div className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.3em]" style={{ color: 'var(--accent)' }}>· RECORD ·</div>
      <div className="mt-[6px] font-[family-name:var(--font-display)] text-[24px] font-bold md:text-[28px]">Your Stats</div>
      {empty ? (
        <div className="mt-5 italic" style={{ color: 'var(--ink-faint)' }}>No games recorded yet.</div>
      ) : (
        <div className="mt-5 grid grid-cols-3 gap-[1px]" style={{ background: 'var(--border)', border: '1px solid var(--border)' }}>
          {cells.map((c) => (
            <div key={c.label} className="px-[6px] py-[12px] text-center" style={{ background: 'var(--panel-inner)' }}>
              <div className="font-[family-name:var(--font-mono)] text-[9px] tracking-[0.22em]" style={{ color: 'var(--ink-faint)' }}>{c.label}</div>
              <div className="font-[family-name:var(--font-display)] text-[22px] font-bold" style={{ color: 'var(--accent)' }}>{c.value}</div>
            </div>
          ))}
        </div>
      )}
      <button onClick={onClose} className="mt-[22px] w-full cursor-pointer py-[10px] font-[family-name:var(--font-display)] text-[11px] font-bold tracking-[0.3em] transition-opacity hover:opacity-80" style={{ background: 'var(--accent)', color: 'var(--bg-0)' }}>CLOSE</button>
    </ArcaneModal>
  );
}
```

- [ ] **Step 3: Wire HeaderHUD props + StatsModal into GameInterface**

In `components/GameInterface.tsx`: pass `streak={userStats?.currentStreak ?? 0}` and `onOpenStats={() => setStatsOpen(true)}` to `HeaderHUD`. Render `{statsOpen && <StatsModal stats={userStats} onClose={() => setStatsOpen(false)} />}` alongside the existing `HelpModal`/`HistoryDrawer`. Import `StatsModal from './StatsModal'`.

- [ ] **Step 4: VictoryCard streak line**

In `components/arcane.tsx` `VictoryCard`, add an optional prop `streak?: number`. When `streak && streak > 1` and not `givenUp`, render a small line under the title like `🔥 {streak} day streak` in `var(--accent)` mono. Pass `streak={userStats?.currentStreak ?? 0}` from the call site in `GameInterface.tsx`.

- [ ] **Step 5: Type-check + tests** — Run: `npx tsc --noEmit` (clean) and `npm test` (all green).

- [ ] **Step 6: Commit**

```bash
git add components/arcane.tsx components/StatsModal.tsx components/GameInterface.tsx
git commit -m "feat(ux): header streak + stats modal + victory streak line"
```

---

## Self-Review

**Spec coverage (spec §5, §6):**
- Anonymous device id (§5) → Task 1 (`lib/device.ts`), Task 3 (wired). ✓
- `user:{deviceId}` KV hash, record only daily results at win/bonus/surrender (§6.1) → Task 2 (actions), Task 3 (wiring). ✓
- Derived stats incl. streak rule (§6.2) → Task 1 (`computeUserStats`, TDD), Task 2 (`getUserStats`). ✓
- Streak in header + Victory card; personal stats panel (§6.3) → Task 4. ✓

**Deferred:** `hints` count stays 0 until M4 wires it; archive/practice results explicitly NOT recorded here (M5 must keep it that way).

**Placeholder scan:** pure logic (Task 1) has full code + comprehensive tests incl. streak edge cases; server + UI tasks specify exact signatures, KV key, copy, and tokens. No TBD.

**Type consistency:** `UserResult`/`UserStats`/`computeUserStats` consistent across Tasks 1→2→3→4; `getDeviceId`/`DEVICE_ID_KEY` (Task 1) used in Task 3; `recordUserResult`/`getUserStats` signatures consistent Tasks 2→3; `HeaderHUD` gains `streak`+`onOpenStats`, `VictoryCard` gains `streak`, `StatsModal` props `{stats,onClose}` consistent Task 4.
