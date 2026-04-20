'use client';

import React from 'react';

export type Phase = 'phase1' | 'phase2' | 'won';

// -------- FILIGREE CORNER --------
export function FiligreeCorner({
  position,
}: {
  position: 'tl' | 'tr' | 'bl' | 'br';
}) {
  const rot = { tl: 0, tr: 90, br: 180, bl: 270 }[position];
  const pos: React.CSSProperties = {
    tl: { top: -6, left: -6 },
    tr: { top: -6, right: -6 },
    bl: { bottom: -6, left: -6 },
    br: { bottom: -6, right: -6 },
  }[position];
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute z-[3] h-[46px] w-[46px]"
      style={{ ...pos, transform: `rotate(${rot}deg)` }}
    >
      <svg viewBox="0 0 46 46" width="46" height="46">
        <g fill="none" stroke="var(--accent-2)" strokeWidth="1">
          <path d="M2 2 L22 2 M2 2 L2 22" />
          <path d="M2 2 L10 10" opacity="0.6" />
          <circle cx="2" cy="2" r="2.5" fill="var(--accent)" stroke="none" />
          <path d="M6 14 Q10 10 14 6" opacity="0.5" />
          <path d="M12 2 Q16 6 20 2" opacity="0.5" />
        </g>
      </svg>
    </div>
  );
}

// -------- CELEBRATIONS --------
export function SlotCelebration() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Horizontal shimmer sweep */}
      <div
        className="absolute bottom-0 top-0 w-[40%]"
        style={{
          background:
            'linear-gradient(90deg, transparent, rgba(245,210,122,0.5), transparent)',
          mixBlendMode: 'screen',
          animation: 'fusionSweep 900ms ease-out forwards',
        }}
      />
      {/* Center gold pulse */}
      <div
        className="absolute left-1/2 top-1/2 h-[240px] w-[240px]"
        style={{
          transform: 'translate(-50%,-50%)',
          background:
            'radial-gradient(circle, rgba(245,210,122,0.55) 0%, transparent 65%)',
          mixBlendMode: 'screen',
          animation: 'fusionGoldPulse 1100ms ease-out forwards',
        }}
      />
      {/* Spark particles */}
      {Array.from({ length: 12 }).map((_, i) => {
        const angle = (i / 12) * Math.PI * 2;
        const dx = Math.cos(angle) * 80;
        const dy = Math.sin(angle) * 80;
        return (
          <div
            key={i}
            className="absolute left-1/2 top-1/2 h-1 w-1 rounded-full"
            style={{
              marginLeft: -2,
              marginTop: -2,
              background: '#f5d27a',
              boxShadow: '0 0 8px #f5d27a',
              ['--tx' as string]: `${dx}px`,
              ['--ty' as string]: `${dy}px`,
              animation: 'fusionSpark 900ms ease-out forwards',
            }}
          />
        );
      })}
    </div>
  );
}

export function WinCelebration() {
  const [confetti] = React.useState(() =>
    Array.from({ length: 28 }).map(() => {
      const angle = Math.random() * Math.PI * 2;
      const dist = 90 + Math.random() * 100;
      return {
        dx: Math.cos(angle) * dist,
        dy: Math.sin(angle) * dist,
        delay: Math.random() * 300,
      };
    }),
  );
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Sunburst rays */}
      <svg
        className="absolute left-1/2 top-1/2 h-[200%] w-[200%]"
        style={{
          transform: 'translate(-50%,-50%)',
          animation: 'fusionSunburst 2200ms ease-out forwards',
          mixBlendMode: 'screen',
        }}
        viewBox="-100 -100 200 200"
      >
        {Array.from({ length: 24 }).map((_, i) => {
          const a = (i / 24) * 360;
          return (
            <path
              key={i}
              d="M 0 0 L -2 -100 L 2 -100 Z"
              transform={`rotate(${a})`}
              fill="rgba(245,210,122,0.7)"
            />
          );
        })}
        <circle cx="0" cy="0" r="12" fill="rgba(245,210,122,0.9)" />
      </svg>
      {/* Big gold pulse */}
      <div
        className="absolute left-1/2 top-1/2 h-[320px] w-[320px]"
        style={{
          transform: 'translate(-50%,-50%)',
          background:
            'radial-gradient(circle, rgba(245,210,122,0.7) 0%, transparent 65%)',
          mixBlendMode: 'screen',
          animation: 'fusionGoldPulse 1800ms ease-out forwards',
        }}
      />
      {/* Confetti sparks */}
      {confetti.map((c, i) => (
        <div
          key={i}
          className="absolute left-1/2 top-1/2 h-[5px] w-[5px] rounded-full opacity-0"
          style={{
            marginLeft: -2.5,
            marginTop: -2.5,
            background: i % 2 ? '#f5d27a' : '#d9a84a',
            boxShadow: '0 0 10px #f5d27a',
            ['--tx' as string]: `${c.dx}px`,
            ['--ty' as string]: `${c.dy}px`,
            animation: `fusionSpark 1600ms ${c.delay}ms ease-out forwards`,
          }}
        />
      ))}
    </div>
  );
}

// -------- WORDMARK --------
export function WordmarkLogo() {
  return (
    <div className="flex items-center gap-[10px]">
      <div
        className="flex h-[26px] w-[26px] items-center justify-center border font-[family-name:var(--font-display)]"
        style={{ borderColor: 'var(--border-strong)', color: 'var(--accent-2)' }}
      >
        ✦
      </div>
      <div
        className="font-[family-name:var(--font-display)] text-[15px] font-semibold tracking-[0.3em]"
        style={{ color: 'var(--accent-2)' }}
      >
        LoL FUSION
      </div>
    </div>
  );
}

// -------- STEP CHIPS --------
export function StepChip({
  label,
  active,
  done,
}: {
  label: string;
  active: boolean;
  done: boolean;
}) {
  const background = done ? 'var(--accent)' : 'transparent';
  const color = done
    ? 'var(--bg-0)'
    : active
    ? 'var(--accent)'
    : 'var(--ink-faint)';
  const borderColor = done || active ? 'var(--accent)' : 'var(--border)';
  return (
    <span
      className="inline-block border px-[10px] py-[4px] font-semibold"
      style={{ background, color, borderColor }}
    >
      {done && '✓ '}
      {label}
    </span>
  );
}

export function StepArrow() {
  return <span style={{ color: 'var(--ink-faint)' }}>─</span>;
}

// -------- HEADER HUD --------
export function HeaderHUD({
  phase,
  attempts,
  onOpenHistory,
  onOpenHelp,
}: {
  phase: Phase;
  attempts: number;
  onOpenHistory: () => void;
  onOpenHelp: () => void;
}) {
  const isPhase1 = phase === 'phase1';
  const isPhase2 = phase === 'phase2';
  const isWon = phase === 'won';
  return (
    <div
      className="flex w-full flex-col items-center gap-3 border-b px-5 py-3 backdrop-blur md:flex-row md:justify-between md:gap-4 md:py-[14px]"
      style={{ background: 'var(--panel)', borderColor: 'var(--border)' }}
    >
      <div className="flex items-center gap-[14px]">
        <WordmarkLogo />
      </div>
      <div className="hidden items-center gap-[10px] font-[family-name:var(--font-mono)] text-[10px] tracking-[0.18em] md:flex">
        <StepChip label="FIND · 1" active={isPhase1} done={!isPhase1} />
        <StepArrow />
        <StepChip label="FIND · 2" active={isPhase1} done={isPhase2 || isWon} />
        <StepArrow />
        <StepChip label="SKIN LINE" active={isPhase2} done={isWon} />
      </div>
      <div className="flex items-center gap-[18px] font-[family-name:var(--font-mono)] text-[10px] tracking-[0.18em]">
        <div className="flex flex-col items-end gap-[2px]">
          <span style={{ color: 'var(--ink-faint)', fontSize: 9 }}>TRIES</span>
          <span
            className="font-[family-name:var(--font-mono)] text-[13px] font-bold"
            style={{ color: 'var(--accent)' }}
          >
            {attempts}
          </span>
        </div>
        <button
          onClick={onOpenHistory}
          className="cursor-pointer transition-colors hover:text-[var(--accent-2)]"
          style={{ color: 'var(--ink-dim)', letterSpacing: '0.2em' }}
        >
          ◰ HISTORY
        </button>
        <button
          onClick={onOpenHelp}
          className="cursor-pointer transition-colors hover:text-[var(--accent-2)]"
          style={{ color: 'var(--ink-dim)', letterSpacing: '0.2em' }}
        >
          ? RULES
        </button>
      </div>
    </div>
  );
}

// -------- SLOT RAIL --------
type Slot = { name: string | null; found: boolean };
type Slots = { A: Slot; B: Slot; Theme: Slot };

export function SlotRail({ slots, phase }: { slots: Slots; phase: Phase }) {
  return (
    <div className="mt-[14px] grid grid-cols-[1fr_auto_1fr_auto_1fr] items-stretch gap-[6px] md:gap-[10px]">
      <SlotCard label="FIND · 1" value={slots.A.name} found={slots.A.found} locked={false} />
      <Connector active={slots.A.found} />
      <SlotCard label="FIND · 2" value={slots.B.name} found={slots.B.found} locked={false} />
      <Connector active={slots.A.found && slots.B.found} />
      <SlotCard
        label="SKIN LINE"
        value={slots.Theme.name}
        found={slots.Theme.found}
        locked={phase === 'phase1'}
      />
    </div>
  );
}

function SlotCard({
  label,
  value,
  found,
  locked,
}: {
  label: string;
  value: string | null;
  found: boolean;
  locked: boolean;
}) {
  const valueColor = found ? 'var(--ink)' : 'var(--ink-faint)';
  return (
    <div
      className="relative flex min-h-[62px] flex-col justify-center border px-2 py-2 transition-all duration-300 md:min-h-[72px] md:px-[14px] md:py-3"
      style={{
        background: 'var(--panel)',
        borderColor: found ? 'var(--accent)' : 'var(--border)',
        opacity: locked ? 0.45 : 1,
      }}
    >
      <div
        className="font-[family-name:var(--font-mono)] text-[8px] tracking-[0.24em] md:text-[9px]"
        style={{ color: found ? 'var(--accent)' : 'var(--ink-faint)' }}
      >
        {found && '✓ '}
        {label}
      </div>
      <div
        className="mt-[4px] truncate font-[family-name:var(--font-display)] text-[14px] font-semibold md:mt-[6px] md:text-[18px]"
        style={{ color: valueColor }}
      >
        {value || (locked ? '— locked —' : '?????')}
      </div>
      {found && (
        <div
          className="absolute right-[10px] top-[10px] hidden font-[family-name:var(--font-display)] md:block"
          style={{ color: 'var(--accent-2)' }}
        >
          ✦
        </div>
      )}
    </div>
  );
}

function Connector({ active }: { active: boolean }) {
  return (
    <div
      className="flex w-[14px] items-center justify-center self-center font-[family-name:var(--font-display)] text-[12px] md:w-[18px] md:text-[14px]"
      style={{ color: active ? 'var(--accent-2)' : 'var(--ink-faint)' }}
    >
      ✦
    </div>
  );
}

// -------- MODAL SHELL --------
export function ArcaneModal({
  onClose,
  children,
  maxWidth = 560,
}: {
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: number;
}) {
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center p-5"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="arcane-scroll relative w-full overflow-y-auto px-[22px] py-[24px] md:px-[30px] md:py-[28px]"
        style={{
          maxWidth,
          maxHeight: '86vh',
          background: 'var(--bg-1)',
          border: '1px solid var(--border-strong)',
        }}
      >
        <FiligreeCorner position="tl" />
        <FiligreeCorner position="tr" />
        <FiligreeCorner position="bl" />
        <FiligreeCorner position="br" />
        {children}
      </div>
    </div>
  );
}

// -------- HELP MODAL --------
export function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <ArcaneModal onClose={onClose} maxWidth={520}>
      <div
        className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.3em]"
        style={{ color: 'var(--accent)' }}
      >
        · CODEX ·
      </div>
      <div className="mt-[6px] font-[family-name:var(--font-display)] text-[24px] font-bold md:text-[28px]">
        How to Play LoL Fusion
      </div>
      <ol
        className="mt-4 list-decimal pl-5 text-[14px] leading-[1.7]"
        style={{ color: 'var(--ink-dim)' }}
      >
        <li>Two champions have been fused into one image, wearing the same skin line.</li>
        <li>
          <b style={{ color: 'var(--ink)' }}>Step 1:</b> Name both champions. Correct
          guesses widen your view of the fused image — wrong guesses narrow it.
        </li>
        <li>
          <b style={{ color: 'var(--ink)' }}>Step 2:</b> Name the skin line they share.
        </li>
        <li>Finish in the fewest tries. A new fusion drops daily.</li>
      </ol>
      <button
        onClick={onClose}
        className="mt-[22px] w-full cursor-pointer py-[10px] font-[family-name:var(--font-display)] text-[11px] font-bold tracking-[0.3em] transition-opacity hover:opacity-80 active:opacity-60"
        style={{ background: 'var(--accent)', color: 'var(--bg-0)' }}
      >
        BEGIN
      </button>
    </ArcaneModal>
  );
}

// -------- VICTORY CARD --------
export function VictoryCard({
  attempts,
  givenUp,
  solution,
  stats,
  shareCopied,
  onShare,
}: {
  attempts: number;
  givenUp: boolean;
  solution: { champA: string; champB: string; theme: string };
  stats: { distribution: Record<string, unknown>; total: number } | null;
  shareCopied?: boolean;
  onShare?: () => void;
}) {
  const score = Math.max(100 - (attempts - 3) * 10, 10);
  let rank: number | null = null;
  if (stats && stats.total > 0) {
    const cumulative = Object.entries(stats.distribution)
      .filter(([k]) => Number(k) <= attempts)
      .reduce((a, [, v]) => a + Number(v || 0), 0);
    rank = Math.round((cumulative / stats.total) * 100);
  }
  const title = givenUp ? 'SURRENDERED' : 'FUSION · COMPLETE';
  return (
    <div
      className="relative mt-6 px-6 pb-[22px] pt-[28px] md:px-[28px]"
      style={{
        background: 'var(--panel)',
        border: '1px solid var(--border-strong)',
        boxShadow: '0 30px 80px rgba(0,0,0,0.5)',
      }}
    >
      <FiligreeCorner position="tl" />
      <FiligreeCorner position="tr" />
      <FiligreeCorner position="bl" />
      <FiligreeCorner position="br" />

      <div className="mb-[18px] text-center">
        <div
          className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.35em]"
          style={{ color: givenUp ? 'var(--danger)' : 'var(--accent)' }}
        >
          {title}
        </div>
        <div
          className="mt-[8px] font-[family-name:var(--font-display)] text-[28px] font-bold tracking-[0.08em] md:text-[40px]"
          style={{ color: 'var(--ink)' }}
        >
          {solution.theme.toUpperCase()}
        </div>
        <div
          className="mt-[4px] font-[family-name:var(--font-body)] italic"
          style={{ color: 'var(--ink-dim)', fontSize: 16 }}
        >
          {solution.champA} + {solution.champB}
        </div>
      </div>

      {/* Score strip */}
      <div
        className="mb-[18px] grid grid-cols-3 gap-[1px]"
        style={{ background: 'var(--border)', border: '1px solid var(--border)' }}
      >
        <ScoreCell label="SCORE" value={givenUp ? '—' : String(score)} />
        <ScoreCell label="TRIES" value={String(attempts)} />
        <ScoreCell
          label="TOP %"
          value={givenUp || rank === null ? '—' : String(rank)}
        />
      </div>

      {stats && stats.total > 0 && (
        <DistributionChart stats={stats} attempts={attempts} givenUp={givenUp} />
      )}

      <div className="mt-5 flex justify-center gap-[10px]">
        <button
          onClick={onShare}
          className="cursor-pointer px-[22px] py-[10px] font-[family-name:var(--font-display)] text-[11px] font-bold tracking-[0.3em] transition-all hover:opacity-80 active:scale-95 active:opacity-60"
          style={{
            background: shareCopied ? 'var(--success)' : 'var(--accent)',
            color: 'var(--bg-0)',
            border: `1px solid ${shareCopied ? 'var(--success)' : 'var(--accent)'}`,
            transition: 'background 300ms, border-color 300ms',
          }}
        >
          {shareCopied ? '✓ COPIED' : 'SHARE RESULT'}
        </button>
      </div>
    </div>
  );
}

function ScoreCell({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="px-[6px] py-[10px] text-center"
      style={{ background: 'var(--panel-inner)' }}
    >
      <div
        className="font-[family-name:var(--font-mono)] text-[9px] tracking-[0.25em]"
        style={{ color: 'var(--ink-faint)' }}
      >
        {label}
      </div>
      <div
        className="font-[family-name:var(--font-display)] text-[22px] font-bold"
        style={{ color: 'var(--accent)' }}
      >
        {value}
      </div>
    </div>
  );
}

function DistributionChart({
  stats,
  attempts,
  givenUp,
}: {
  stats: { distribution: Record<string, unknown>; total: number };
  attempts: number;
  givenUp: boolean;
}) {
  const bars: { label: string; count: number; me: boolean }[] = [];
  for (let i = 3; i <= 12; i++) {
    bars.push({
      label: String(i),
      count: Number(stats.distribution[i] || 0),
      me: !givenUp && attempts === i,
    });
  }
  const thirteen = Object.entries(stats.distribution)
    .filter(([k]) => Number(k) >= 13)
    .reduce((a, [, v]) => a + Number(v || 0), 0);
  bars.push({
    label: '13+',
    count: thirteen,
    me: !givenUp && attempts >= 13,
  });
  const max = Math.max(...bars.map((b) => b.count), 1);
  return (
    <div>
      <div
        className="mb-[8px] font-[family-name:var(--font-mono)] text-[9px] tracking-[0.24em]"
        style={{ color: 'var(--ink-faint)' }}
      >
        GLOBAL DISTRIBUTION · {stats.total.toLocaleString()} SOLVERS
      </div>
      <div className="flex h-[90px] items-end gap-[3px]">
        {bars.map((b) => {
          const h = Math.max((b.count / max) * 100, b.count === 0 ? 0 : 4);
          return (
            <div
              key={b.label}
              className="flex h-full flex-1 flex-col items-center justify-end gap-1"
            >
              {b.me && (
                <div
                  className="font-[family-name:var(--font-mono)] text-[8px] tracking-[0.15em]"
                  style={{ color: 'var(--accent)' }}
                >
                  YOU
                </div>
              )}
              <div
                className="w-full"
                style={{
                  height: `${h}%`,
                  minHeight: 2,
                  background: b.me ? 'var(--accent)' : 'var(--ink-faint)',
                  opacity: b.me ? 1 : 0.5,
                  boxShadow: b.me ? '0 0 12px var(--accent-glow)' : 'none',
                }}
              />
              <div
                className="font-[family-name:var(--font-mono)] text-[9px]"
                style={{ color: b.me ? 'var(--accent)' : 'var(--ink-faint)' }}
              >
                {b.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// -------- WRONG STRIP --------
export function WrongStrip({
  guesses,
  message,
}: {
  guesses: string[];
  message: { ok: boolean; text: string } | null;
}) {
  if (!guesses.length && !message) return null;
  return (
    <div className="mt-[14px]">
      {message && (
        <div
          className="mb-2 px-3 py-2 font-[family-name:var(--font-mono)] text-[11px] tracking-[0.15em]"
          style={{
            background: message.ok
              ? 'rgba(127,185,122,0.12)'
              : 'rgba(194,85,63,0.12)',
            border: `1px solid ${message.ok ? 'var(--success)' : 'var(--danger)'}`,
            color: message.ok ? 'var(--success)' : 'var(--danger)',
          }}
        >
          {message.ok ? '✓ ' : '✕ '}
          {message.text}
        </div>
      )}
      {guesses.length > 0 && (
        <div className="flex flex-wrap items-center gap-[6px]">
          <span
            className="mr-1 font-[family-name:var(--font-mono)] text-[9px] tracking-[0.2em]"
            style={{ color: 'var(--ink-faint)' }}
          >
            INVALID ({guesses.length}):
          </span>
          {guesses.slice(-8).map((g) => (
            <span
              key={g}
              className="border px-[9px] py-[3px] text-[11px] line-through"
              style={{ borderColor: 'var(--border)', color: 'var(--ink-dim)' }}
            >
              {g}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
