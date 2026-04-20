import GameInterface from '@/components/GameInterface';
import { getDailyPuzzle } from './actions';

export const revalidate = 0;

export default async function Home() {
  const puzzle = await getDailyPuzzle();

  return (
    <main
      className="relative min-h-screen overflow-hidden text-[var(--ink)] selection:bg-[var(--accent)]/30"
      style={{
        background:
          'radial-gradient(ellipse at 50% -10%, #2a1e14 0%, #0c0810 40%, #07060a 75%)',
      }}
    >
      {/* Film grain overlay */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-[1] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.6 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
          opacity: 0.12,
        }}
      />

      {/* Ambient gold orbit glow */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
        <div
          className="absolute left-1/2 top-[30%] h-[900px] w-[900px] -translate-x-1/2 -translate-y-1/2"
          style={{
            background:
              'radial-gradient(circle, rgba(217,168,74,0.08) 0%, transparent 55%)',
            filter: 'blur(20px)',
          }}
        />
      </div>

      <div className="relative z-[2] flex min-h-screen flex-col">
        {!puzzle ? (
          <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
            <div
              className="mb-4 font-[family-name:var(--font-display)] text-[11px] tracking-[0.3em] text-[var(--accent)]"
            >
              · THE FORGE IS COLD ·
            </div>
            <h1 className="mb-4 font-[family-name:var(--font-display)] text-4xl font-bold tracking-[0.18em] text-[var(--accent-2)]">
              LoL FUSION
            </h1>
            <p className="mb-8 max-w-md italic text-[var(--ink-dim)]">
              The daily fusion has yet to be sealed. Return when the rite is set.
            </p>
            <div className="border border-[var(--border)] bg-[var(--panel-inner)] px-4 py-2 font-[family-name:var(--font-mono)] text-[10px] tracking-[0.25em] text-[var(--ink-faint)]">
              NO DAILY PUZZLE FOUND
            </div>
          </div>
        ) : (
          <GameInterface initialData={puzzle} />
        )}

        <footer className="relative py-6 text-center font-[family-name:var(--font-mono)] text-[10px] tracking-[0.25em] text-[var(--ink-faint)]">
          LoL Fusion · fan project · not affiliated with Riot Games
        </footer>
      </div>
    </main>
  );
}
