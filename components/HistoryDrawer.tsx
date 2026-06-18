'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { getPuzzleHistory, HistoryItem } from '@/app/actions';
import { FiligreeCorner } from './arcane';
import { getSolvedDates } from '@/lib/solvedDates';

interface HistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onPlay: (date: string) => void;
}

export default function HistoryDrawer({ isOpen, onClose, onPlay }: HistoryDrawerProps) {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [solved, setSolved] = useState<Set<string>>(new Set());
  const [revealAll, setRevealAll] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSolved(new Set(getSolvedDates()));
      setRevealAll(false); // answers hidden by default each time the drawer opens
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && history.length === 0) {
      const fetchHistory = async () => {
        setLoading(true);
        const data = await getPuzzleHistory();
        setHistory(data);
        setLoading(false);
      };
      fetchHistory();
    }
  }, [isOpen, history.length]);

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center p-5"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex w-full flex-col overflow-hidden"
        style={{
          maxWidth: 580,
          maxHeight: '86vh',
          background: 'var(--bg-1)',
          border: '1px solid var(--border-strong)',
        }}
      >
        <FiligreeCorner position="tl" />
        <FiligreeCorner position="tr" />
        <FiligreeCorner position="bl" />
        <FiligreeCorner position="br" />

        {/* Sticky header */}
        <div
          className="flex flex-none items-start justify-between px-[22px] pb-4 pt-6 md:px-[30px]"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <div>
            <div
              className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.3em]"
              style={{ color: 'var(--accent)' }}
            >
              · ARCHIVE ·
            </div>
            <div className="mt-[6px] font-[family-name:var(--font-display)] text-[24px] font-bold md:text-[28px]">
              Past Fusions
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setRevealAll((v) => !v)}
              aria-pressed={revealAll}
              className="cursor-pointer font-[family-name:var(--font-mono)] text-[10px] tracking-[0.18em] transition-colors hover:text-[var(--accent-2)]"
              style={{
                color: revealAll ? 'var(--bg-0)' : 'var(--accent)',
                background: revealAll ? 'var(--accent)' : 'transparent',
                border: '1px solid var(--accent)',
                padding: '5px 10px',
                whiteSpace: 'nowrap',
              }}
            >
              {revealAll ? 'HIDE ANSWERS' : 'REVEAL ANSWERS'}
            </button>
            <button
              onClick={onClose}
              className="cursor-pointer flex h-8 w-8 items-center justify-center transition-colors hover:text-[var(--accent-2)]"
              style={{ color: 'var(--ink-dim)', fontFamily: 'var(--font-mono)', fontSize: 18 }}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Scrollable list */}
        <div className="arcane-scroll flex-1 overflow-y-auto px-[22px] pb-6 md:px-[30px]">
          {loading ? (
            <div className="flex justify-center py-8">
              <div
                className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent"
                style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
              />
            </div>
          ) : history.length === 0 ? (
            <div
              className="py-8 text-center italic"
              style={{ color: 'var(--ink-faint)' }}
            >
              No past fusions yet.
            </div>
          ) : (
            history.map((item) => {
              const isSolved = solved.has(item.date);
              const showAnswer = isSolved || revealAll;
              return (
                <div
                  key={item.date}
                  className="grid items-center gap-[14px] border-b py-[12px]"
                  style={{
                    gridTemplateColumns: '72px 1fr auto',
                    borderColor: 'var(--border)',
                  }}
                >
                  {/* Thumbnail */}
                  <button
                    type="button"
                    onClick={() => window.open(item.imageUrl, '_blank')}
                    className="group relative h-[72px] w-[72px] cursor-pointer overflow-hidden"
                    style={{
                      border: '1px solid var(--border-strong)',
                      background: 'var(--bg-2)',
                    }}
                    aria-label={showAnswer ? `View ${item.champA} × ${item.champB} full size` : 'View fusion image'}
                  >
                    <Image
                      src={item.imageUrl}
                      alt={showAnswer ? `${item.champA} + ${item.champB}` : 'Mystery fusion'}
                      fill
                      sizes="72px"
                      className="object-cover transition-opacity group-hover:opacity-75"
                    />
                    <div
                      aria-hidden
                      className="pointer-events-none absolute inset-0"
                      style={{ boxShadow: 'inset 0 0 20px rgba(0,0,0,0.6)' }}
                    />
                  </button>

                  {/* Meta */}
                  <div className="min-w-0">
                    <div
                      className="mb-[4px] font-[family-name:var(--font-mono)] text-[10px] tracking-[0.2em]"
                      style={{ color: 'var(--ink-faint)' }}
                    >
                      {formatDate(item.date)}
                    </div>
                    <div
                      className="truncate font-[family-name:var(--font-display)] text-[15px]"
                      style={{ color: 'var(--ink)' }}
                    >
                      {showAnswer ? (
                        <>
                          {item.champA}{' '}
                          <span style={{ color: 'var(--accent)' }}>×</span>{' '}
                          {item.champB}
                        </>
                      ) : (
                        <>
                          <span style={{ color: 'var(--ink-dim)' }}>???</span>{' '}
                          <span style={{ color: 'var(--accent)' }}>×</span>{' '}
                          <span style={{ color: 'var(--ink-dim)' }}>???</span>
                        </>
                      )}
                    </div>
                    {showAnswer ? (
                      <div
                        className="mt-[2px] truncate italic"
                        style={{ color: 'var(--ink-dim)', fontSize: 11 }}
                      >
                        {item.theme}
                      </div>
                    ) : (
                      <div
                        className="mt-[2px] truncate italic"
                        style={{ color: 'var(--ink-faint)', fontSize: 11 }}
                      >
                        ···
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col items-end gap-[6px]">
                    <div
                      className="whitespace-nowrap text-right font-[family-name:var(--font-mono)] text-[11px]"
                      style={{ color: 'var(--accent)' }}
                    >
                      {item.totalSolvers.toLocaleString()}
                      <div
                        className="text-[9px] tracking-[0.2em]"
                        style={{ color: 'var(--ink-faint)' }}
                      >
                        SOLVED
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => { onPlay(item.date); onClose(); }}
                      className="cursor-pointer font-[family-name:var(--font-mono)] text-[10px] tracking-[0.15em] transition-colors hover:text-[var(--accent-2)]"
                      style={{
                        color: 'var(--accent)',
                        border: '1px solid var(--accent)',
                        padding: '3px 8px',
                        background: 'transparent',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {isSolved ? 'REPLAY' : 'PLAY'}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function formatDate(iso: string) {
  try {
    return new Date(iso)
      .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      .toUpperCase();
  } catch {
    return iso.toUpperCase();
  }
}
