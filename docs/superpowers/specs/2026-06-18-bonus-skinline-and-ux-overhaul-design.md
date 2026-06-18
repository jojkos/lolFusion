# LoL Fusion — Skin Line as Bonus + UX/Game Overhaul

**Date:** 2026-06-18
**Status:** Design / spec (pre-implementation)
**Author:** Jonas + Claude

## 1. Summary

Today LoL Fusion is a 3-mandatory-step daily puzzle: identify champion A, identify champion B, then name the shared skin line. The game is only considered **won**, and the score is only **stored**, after the skin line is guessed.

This change makes **finding the two champions the win.** The score is locked and recorded the instant both champions are identified. The **skin line becomes an optional bonus** layered on the won screen: solving it adds bonus points and a badge; skipping or missing it costs nothing.

Alongside that core change, this spec bundles a set of UX/game improvements selected during brainstorming (hints, partial give-up, daily streak, personal stats, archive replay, share/onboarding polish, and several small fixes).

**Data layer is unchanged in kind:** we stay on **Vercel KV** (Redis) for stats/puzzles and **Vercel Blob** for images. No Supabase, no DB migration. We add new KV keys and one anonymous device-ID concept. The daily puzzle generation/cron pipeline is **not touched**.

## 2. Goals & non-goals

### Goals
- Win = both champions found. Score locked + stored at that moment.
- Skin line = optional bonus (+points + badge), never blocks the win, no penalty for wrong/ skipped.
- Add the selected gameplay/retention/polish improvements (see §4–§9).
- Keep the existing cron/generation/image pipeline and KV/Blob backend intact.

### Non-goals
- No backend migration (no Supabase).
- No real auth/accounts (anonymous device-ID only).
- No global leaderboard in this round (device-ID model leaves the door open for it later).
- No change to how puzzles are generated.

## 3. Core change — skin line as bonus

### 3.1 Mental model & phases

Two phases, not three. Finding both champions **is** winning; the skin line is a bonus widget on the won screen.

```
phase1 (find champions)  ──second champ found──▶  won
                                                    │ win celebration
                                                    │ score locked + stored (submitGameStats)
                                                    └─ bonus widget: open → solved | skipped
```

`Phase` changes from `'phase1' | 'phase2' | 'won'` to **`'phase1' | 'won'`**. The skin-line state becomes a sub-state of the won screen:

```ts
type BonusStatus = 'open' | 'solved' | 'skipped';
```

The old `'phase2'` value is removed everywhere it is referenced:
- `app/actions.ts` — `GuessResult.gameStatus` no longer returns `'phase2'`; returns `'won'` when both champions are found.
- `components/arcane.tsx` — `HeaderHUD` (`isPhase2`), `SlotRail` (`locked` logic), `ArcaneArtifact` step label.
- `components/GameInterface.tsx` — `handleGuess`, localStorage restore (`parsed.phase === 'phase2'`), `phaseCopy`.

### 3.2 Scoring model (single source of truth)

Let `champTries` = number of champion-phase guess submissions (correct **and** wrong) made before/at the moment both champions are found. Minimum is 2 (both correct first try).

```
base   = max(100 - (champTries - 2) * 10 - hintPenalty, 10)   // only if solved (not surrendered)
bonus  = 50 if skin line solved, else 0
final  = base + bonus                                          // max 150
```

- `hintPenalty` accumulates from the hint system (§4.1) and partial give-up (§4.2). See those sections for values.
- **Full surrender** (§4.2): no score (`—`), result **not** recorded as a win, not added to the global distribution.
- Wrong **bonus** guesses do not change `champTries`, `attempts`, `base`, or the distribution. Score is frozen at win; bonus only ever adds.

### 3.3 Global stats (Vercel KV) — semantics change

Existing keys keep their names; the distribution’s meaning shifts from “total attempts incl. theme” to “champion-phase tries”:

| Key | Type | Meaning | Change |
|-----|------|---------|--------|
| `stats:{date}` | hash (field=tries → count) | distribution of `champTries` | **semantics change**: was total attempts (min 3, incl. theme); now `champTries` (min 2) |
| `stats:{date}:total` | int | total wins (champions found) | unchanged in kind; now incremented at champ-win instead of theme-win |
| `stats:{date}:bonus` | int | count of players who solved the bonus skin line | **new** |

- `submitGameStats(champTries)` is called the moment both champions are found (not after the theme).
- A new `submitBonusSolved()` increments `stats:{date}:bonus` when the bonus is solved.
- **No migration of old data.** Each date is its own key; past days keep their old-semantics numbers in History. New days use the new semantics. This is acceptable because cross-day comparisons aren’t made.

### 3.4 Won-screen layout

When `phase === 'won'`, the right panel shows the **Victory card immediately**. While `bonusStatus === 'open'`, a highlighted **bonus strip** renders above the card:

> **BONUS ✦ · Name the skin line for +50** — `[ skin-line picker ]` · *Skip*

- The picker reuses the existing `react-select` (desktop) / `MobilePicker` (mobile) bound to `THEMES`.
- **Solve** → strip collapses; a secondary “bonus” celebration fires (§9.3); the card’s score animates from `base` to `base + 50` and gains a `BONUS ✦` badge; `submitBonusSolved()` called; result updated.
- **Skip** → strip collapses; the card reveals the skin-line answer greyed-out (player still learns it), no badge, no points.
- The bonus picker filters out already-tried skin lines (reuse `wrongGuesses`) but those wrong guesses **do not** increment `attempts`.

### 3.5 Slot rail / header chips

- Third slot/chip relabeled `SKIN LINE` → **`BONUS`**. It is never “locked” — it’s “optional/—” until won, then “open” → solved/skipped.
- `SlotRail` `locked` logic (currently `phase === 'phase1'`) is replaced by an “optional/pending” visual state.

### 3.6 Surrender visibility

`SURRENDER` (full give-up) is shown **only during `phase1`**. Once won there is nothing to surrender; the bonus uses **Skip** instead. (Partial give-up in §4.2 also lives only in `phase1`.)

### 3.7 Help / share copy

- Help modal rewritten: champions = win, skin line = optional bonus (§7).
- Share text reflects base solve + bonus + streak (§6, §8).

## 4. Gameplay additions

### 4.1 Hint system (item 3)

A non-surrender way to get unstuck, at a score cost. **No first-letter or region hints** (per decision) — hints lean on the de-zoom reveal the game already has.

- During `phase1`, a **HINT** control offers, in order:
  1. Champion **role / class** of the next unsolved slot (e.g. “Marksman”) — cost `-10`. Sourced from the DDragon `tags` already available client-side; no answer leak.
  2. **Reveal more** — a de-zoom step that widens the view of the fused image by `0.5` (same mechanic as a wrong guess, minimum `1×`) — cost `-10` each. Repeatable until the image is fully revealed.
- Each hint adds to `hintPenalty` (§3.2). The role hint is one-shot per slot; reveal-more is capped by the zoom floor (`1×`), and the overall `hintPenalty` is bounded by the score floor of `10` regardless.
- No server round-trip needed for either hint (role from DDragon tags, reveal-more is pure client zoom). Hints taken are persisted in localStorage and reflected in the score everywhere.

### 4.2 Partial give-up (item 4)

Instead of all-or-nothing surrender:

- A **REVEAL A CHAMPION** action (phase1 only) reveals **one** unsolved champion slot, marks it found (without a guess), and applies a larger penalty `-30` to `hintPenalty`.
- After a partial reveal the player keeps going for the other champion; the game can still be won (and scored, minus the penalty).
- **Full SURRENDER** remains as the all-reveal escape hatch: reveals both champions + skin line, score `—`, not recorded (unchanged from today, except it now also reveals the bonus answer).

## 5. Identity — anonymous device ID

- On first load, generate `deviceId = crypto.randomUUID()` and store in `localStorage['fusion_device_id']`. Reuse thereafter.
- The device ID keys personal data in KV (§6) and is sent with result-recording actions.
- No PII, no auth. Trade-off (accepted): stats don’t follow a player across devices/browsers.

## 6. Retention — streak & personal stats (items 6, 7)

### 6.1 Storage

| Key | Type | Meaning |
|-----|------|---------|
| `user:{deviceId}` | hash (field=`YYYY-MM-DD` → JSON) | per-day result for this device |

Per-day value JSON:
```json
{ "date": "2026-06-18", "champTries": 4, "score": 80, "bonus": true, "solved": true, "givenUp": false, "hints": 1 }
```

- Written by a new `recordUserResult(deviceId, result)` action at win (and on surrender, with `solved:false, givenUp:true`).
- Mirrored to localStorage (`fusion_stats`) for instant render / offline.
- **Daily puzzles only** count toward streak & aggregates. **Archive/practice plays (§8) do not** record here.

### 6.2 Derived stats (computed on read, `getUserStats(deviceId)`)

- `gamesPlayed`, `wins`, `winRate`, `avgChampTries`, `bonusRate`, `currentStreak`, `maxStreak`, `avgScore`.
- **Streak rule:** consecutive calendar days (UTC, matching the daily reset) with `solved === true && givenUp === false`. A missed day or a surrender breaks the streak.

### 6.3 UI

- **Streak** shown in the header HUD (e.g. `🔥 5`) and on the Victory card.
- **Personal stats panel**: a new section/tab in the History drawer (or its own modal opened from the header) showing the derived stats and a small streak indicator.

## 7. Onboarding & clarity (items 10, 11, 1, 12)

- **Auto-show Help on first visit** (item 10): if `localStorage['fusion_seen_help']` is unset, open the Help modal once on load, then set the flag.
- **Explain “skin line”** (item 11): the bonus prompt and Help modal include an example line — e.g. *“the shared skin theme — like Star Guardian, PROJECT, or Battle Academia.”*
- **Fix the rules text** (item 1): **logic unchanged.** Rewrite the Help copy to accurately describe the implemented zoom behavior and the new win/bonus structure. Implemented behavior to describe (CONFIRM in §13):
  - The fusion starts **zoomed in**; you must identify the champions from a tight crop.
  - A wrong champion guess pulls the view back by `0.5` (down to `1×`), revealing a little more.
  - Finding both champions reveals the full image and wins the round.
  - Naming the skin line is an optional bonus for extra points.
- **Visualize the zoom mechanic** (item 12): **Included.** A minimal “reveal level” indicator (small meter or `3× → 1×` label) near the artifact frame. It now earns its place because the de-zoom **reveal-more** hint (§4.1) makes the current reveal level something the player actively manages.

## 8. Archive replay + spoiler gating (items 8, 9)

### 8.1 Replay past puzzles (practice mode)

- The History drawer’s past-fusion rows gain a **PLAY** action that loads that day’s puzzle into the game in **practice mode**.
- Practice mode reuses the normal phase1 → won + bonus flow but is **not recorded**: no `submitGameStats`, no `submitBonusSolved`, no `recordUserResult`, no streak effect. A clear “PRACTICE” banner is shown.
- Server access: past puzzles live under `puzzle:{date}` (already used by `getPuzzleHistory`). Generalize the guess/solution actions to accept an optional `date`:
  - `submitChampionGuess(guess, foundSlots, date?)` — uses `daily_puzzle` when `date` is absent, else `puzzle:{date}`.
  - `submitThemeGuess(guess, date?)`, `getSolution(date?)` — same pattern.
  - `getArchivePuzzle(date)` — returns `{ imageUrl, date }` for a past day; validates `date < today` and existence; never returns answers.

### 8.2 Hide spoilers (item 9)

- Today `HistoryDrawer` prints `champA × champB` and the theme in plain text for every past day. Gate this:
  - Maintain a local set `localStorage['fusion_solved_dates']` (a day is added when solved as the daily puzzle, or solved in practice).
  - For days **not** in the set: blur/hide champion names + theme and show a **PLAY** button (plus a small “tap to reveal” escape for users who don’t care).
  - For solved days: show answers as today.

## 9. Sharing & polish

### 9.1 Emoji-grid share (item 13) + streak/bonus (item 14)

Replace the plain-text share with a spoiler-free Wordle-style block:

```
LoL Fusion · 2026-06-18
🟦🟦🟨   (per wrong champ guess = 🟦, the solving guess = 🟨)
✦ Bonus  (or "— Bonus" if skipped/missed)
🔥 5 day streak · Score 130
play.lolfusion.app
```

- No champion/skin names in the share (spoiler-free). Exact emoji legend finalized in implementation.
- Includes streak and bonus state. `navigator.clipboard` with the existing “✓ COPIED” affordance.

### 9.2 Header chip bug (item 2)

`FIND·1` and `FIND·2` currently both light as “active” in phase1 (`active={isPhase1}` on both). Fix: `FIND·2` becomes “active” only after the first champion is found (derive from `foundSlots.length >= 1`), so progress reads correctly. Requires passing `foundSlots` (or a derived count) into `HeaderHUD`.

### 9.3 Bonus celebration (item 17)

A distinct, smaller celebration when the bonus skin line is solved — separate from the main win flourish — so the bonus feels earned. Add a `'bonus'` variant to the `Celebrate` union / celebration components.

### 9.4 Haptics on mobile (item 16)

`navigator.vibrate(...)` on correct (short) / wrong (double) / win (pattern), guarded for support. No-op where unsupported.

### 9.5 Accessibility (items 18, 19)

- **aria-live** region announcing correct/wrong/win/bonus messages for screen readers (wrap the message strip).
- **Distribution chart marker** (item 19): the “YOU” bar currently relies on color + glow only; add a persistent text/marker label so it’s distinguishable without color.

### 9.6 Champion-list cache with expiry (item 20)

- Cache the DDragon champion list + version in localStorage (`fusion_champ_cache = { version, names, fetchedAt }`).
- On load, use the cache immediately; revalidate in the background by checking the latest DDragon version. **Cache-clear rule:** if the fetched latest version differs from the cached version, OR `fetchedAt` is older than 7 days, refetch and replace. This keeps newly released champions appearing without a stale list (your “champs are added over time” note).
- On network failure, fall back to the cached list instead of an empty dropdown.

## 10. Data layer summary (Vercel KV)

**Unchanged:** `daily_puzzle`, `puzzle:{date}`, `stats:{date}:total`, Blob image storage, cron generation.

**Changed semantics:** `stats:{date}` hash now keyed by `champTries` (min 2) instead of total attempts.

**New keys:**
- `stats:{date}:bonus` — int, bonus-solve count.
- `user:{deviceId}` — hash, per-day personal results.

**New / generalized server actions (`app/actions.ts`):**
- `submitGameStats(champTries)` — semantics moved to champ-win.
- `submitBonusSolved()` — new.
- `recordUserResult(deviceId, result)`, `getUserStats(deviceId)` — new.
- `getChampionHint(slot, level)` — new (returns only a fragment).
- `getArchivePuzzle(date)` — new.
- `submitChampionGuess`, `submitThemeGuess`, `getSolution` — gain optional `date?` for archive play.

## 11. Client state & localStorage schema

`fusion_daily_status` (existing, extended) — per current daily puzzle:
```json
{
  "date": "2026-06-18",
  "foundSlots": ["A","B"],
  "wrongGuesses": ["..."],
  "attempts": 4,
  "champTries": 4,
  "baseScore": 80,
  "bonusStatus": "open",
  "hints": 1,
  "revealedNames": { "A": "...", "B": "...", "Theme": null },
  "solved": true,
  "givenUp": false
}
```

Other localStorage keys: `fusion_device_id`, `fusion_stats` (mirror), `fusion_solved_dates`, `fusion_seen_help`, `fusion_champ_cache`.

`Phase = 'phase1' | 'won'`; `bonusStatus: 'open' | 'solved' | 'skipped'`; a `practice` flag (+ practice date) when replaying the archive.

## 12. Implementation milestones (suggested sequencing)

Independent enough to land incrementally:

1. **M1 — Core bonus restructure** (§3): phases, scoring, win-on-champs, KV semantics, won-screen bonus widget, surrender visibility, slot/chip relabel, Help/share copy stubs. *Highest priority; everything else layers on this.*
2. **M2 — Small fixes & polish** (§9.2 chip bug, §9.3 bonus celebration, §9.4 haptics, §9.5 a11y, §9.6 champ cache, §7 auto-help + skin-line explainer + rules rewrite). Low-risk, mostly independent.
3. **M3 — Identity + retention** (§5, §6): device ID, `user:{deviceId}`, streak + personal stats panel.
4. **M4 — Hints & partial give-up** (§4): depends on scoring (M1).
5. **M5 — Archive replay + spoiler gating** (§8): generalized actions, practice mode, History drawer rework.
6. **M6 — Emoji-grid share** (§9.1): depends on M1 (and M3 for streak).

## 13. Resolved decisions

1. **Bonus value** = flat **+50** (max total 150). ✅
2. **Scoring economy** (final): `base = max(100 - (champTries-2)*10 - hintPenalty, 10)`; role hint `-10`, reveal-more hint `-10` each, partial champion reveal `-30`, full surrender = no score. A clean 2-try solve = 100 (150 with bonus); hints leave a respectable score; partial reveal still beats surrendering. ✅
3. **Zoom rules wording (item 1):** logic stays exactly as implemented; only the Help copy is corrected to match (§7). ✅
4. **Hints (§4.1):** no first-letter, no region. Role/class hint + repeatable de-zoom “reveal more.” ✅
5. **Zoom “reveal level” indicator (§7/item 12):** included. ✅
