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
