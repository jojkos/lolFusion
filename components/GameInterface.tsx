'use client';

import { useState, useEffect, useRef, useId } from 'react';
import { Loader2 } from 'lucide-react';
import Select, { StylesConfig, SelectInstance } from 'react-select';
import { THEMES } from '@/lib/constants';
import {
    submitChampionGuess,
    submitThemeGuess,
    getSolution,
    submitGameStats,
    getGameStats,
} from '@/app/actions';
import HistoryDrawer from './HistoryDrawer';
import {
    HeaderHUD,
    SlotRail,
    FiligreeCorner,
    SlotCelebration,
    WinCelebration,
    HelpModal,
    VictoryCard,
    WrongStrip,
    type Phase,
} from './arcane';

interface GameInterfaceProps {
    initialData: {
        imageUrl: string;
        date: string;
    } | null;
}

type Celebrate = 'slot' | 'win' | null;

export default function GameInterface({ initialData }: GameInterfaceProps) {
    const [zoomLevel, setZoomLevel] = useState(3.0);
    const [guess, setGuess] = useState('');
    const [foundSlots, setFoundSlots] = useState<('A' | 'B')[]>([]);
    const [phase, setPhase] = useState<Phase>('phase1');
    const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
    const [loading, setLoading] = useState(false);
    const [imageLoaded, setImageLoaded] = useState(false);
    const [championsList, setChampionsList] = useState<string[]>([]);
    const [imgDimensions, setImgDimensions] = useState({ width: 500, height: 500 });
    const [historyOpen, setHistoryOpen] = useState(false);
    const [helpOpen, setHelpOpen] = useState(false);

    const [wrongGuesses, setWrongGuesses] = useState<string[]>([]);
    const [attempts, setAttempts] = useState(0);
    const [givenUp, setGivenUp] = useState(false);
    const [revealedNames, setRevealedNames] = useState<{ A: string | null; B: string | null; Theme: string | null }>({ A: null, B: null, Theme: null });

    const [globalStats, setGlobalStats] = useState<{ distribution: Record<string, unknown>, total: number } | null>(null);
    const [celebrate, setCelebrate] = useState<Celebrate>(null);
    const [shake, setShake] = useState(false);
    const [shareCopied, setShareCopied] = useState(false);
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const mq = window.matchMedia('(max-width: 767px)');
        const update = () => setIsMobile(mq.matches);
        update();
        mq.addEventListener('change', update);
        return () => mq.removeEventListener('change', update);
    }, []);

    const selectId = useId();

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const resultsRef = useRef<HTMLDivElement>(null);

    const imageRef = useRef<HTMLImageElement | null>(null);
    const selectRef = useRef<SelectInstance<{ value: string; label: string }, false>>(null);

    // Fetch Champions Dynamically
    useEffect(() => {
        const fetchChampions = async () => {
            try {
                const vRes = await fetch('https://ddragon.leagueoflegends.com/api/versions.json');
                const versions = await vRes.json();
                const latest = versions[0];
                const cRes = await fetch(`https://ddragon.leagueoflegends.com/cdn/${latest}/data/en_US/champion.json`);
                const data = await cRes.json();
                const names = Object.values(data.data).map((c) => (c as { name: string }).name);
                setChampionsList(names.sort());
            } catch (e) {
                console.error('Failed to fetch champions:', e);
            }
        };
        fetchChampions();
    }, []);

    const fetchGlobalStats = async () => {
        const stats = await getGameStats();
        if (stats) setGlobalStats(stats);
    };

    useEffect(() => {
        fetchGlobalStats();
        const interval = setInterval(() => {
            if (document.visibilityState === 'visible') fetchGlobalStats();
        }, 30000);
        return () => clearInterval(interval);
    }, []);

    // Restore from localStorage
    useEffect(() => {
        if (!initialData) return;
        const stored = localStorage.getItem('fusion_daily_status');
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                if (parsed.date === initialData.date) {
                    if (parsed.foundSlots) setFoundSlots(parsed.foundSlots);
                    if (parsed.wrongGuesses) setWrongGuesses(parsed.wrongGuesses);
                    if (parsed.attempts) setAttempts(parsed.attempts);
                    if (parsed.givenUp) setGivenUp(parsed.givenUp);
                    if (parsed.revealedNames) setRevealedNames(parsed.revealedNames);

                    if (parsed.solved) {
                        setPhase('won');
                        setMessage({
                            ok: !parsed.givenUp,
                            text: parsed.givenUp ? 'The seal broke — the names were whispered to you.' : 'Welcome back — you already solved this.',
                        });
                        setZoomLevel(1.0);
                        fetchGlobalStats();
                    } else if (parsed.phase === 'phase2') {
                        setPhase('phase2');
                        setZoomLevel(1.0);
                    } else if (parsed.zoomLevel) {
                        setZoomLevel(parsed.zoomLevel);
                    }
                }
            } catch (e) {
                console.error('Failed to parse local storage', e);
            }
        }
    }, [initialData]);

    const drawCanvas = () => {
        const canvas = canvasRef.current;
        const img = imageRef.current;
        if (!canvas || !img) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = imgDimensions.width;
        canvas.height = imgDimensions.height;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const w = canvas.width;
        const h = canvas.height;

        ctx.save();
        ctx.translate(w / 2, h / 2);
        ctx.scale(zoomLevel, zoomLevel);
        ctx.translate(-w / 2, -h / 2);
        ctx.drawImage(img, 0, 0, w, h);
        ctx.restore();
    };

    useEffect(() => {
        if (!initialData?.imageUrl || !canvasRef.current) return;

        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = initialData.imageUrl;

        img.onload = () => {
            imageRef.current = img;
            setImgDimensions({ width: img.naturalWidth, height: img.naturalHeight });
            setImageLoaded(true);
        };

        img.onerror = (e) => {
            console.error('Failed to load image:', e);
            setMessage({ ok: false, text: 'Error loading puzzle artifact.' });
            setImageLoaded(false);
        };
    }, [initialData]);

    useEffect(() => {
        if (imageLoaded) drawCanvas();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [zoomLevel, imageLoaded, phase, imgDimensions]);

    const saveState = (newState: Record<string, unknown>) => {
        if (!initialData) return;
        const current = localStorage.getItem('fusion_daily_status');
        let data: Record<string, unknown> = current ? JSON.parse(current) : { date: initialData.date };
        if (data.date !== initialData.date) data = { date: initialData.date };
        const merged = { ...data, ...newState };
        localStorage.setItem('fusion_daily_status', JSON.stringify(merged));
    };

    const triggerCelebration = (kind: Celebrate) => {
        setCelebrate(kind);
        setTimeout(() => setCelebrate(null), kind === 'win' ? 2400 : 1200);
    };

    const triggerShake = () => {
        setShake(true);
        setTimeout(() => setShake(false), 400);
    };

    const handleGuess = async (explicitGuess?: string) => {
        const finalGuess = explicitGuess || guess;
        if (!finalGuess) return;
        setLoading(true);
        setMessage(null);

        if (wrongGuesses.includes(finalGuess)) {
            setMessage({ ok: false, text: `"${finalGuess}" already attempted.` });
            setLoading(false);
            return;
        }

        const newAttempts = attempts + 1;
        setAttempts(newAttempts);

        if (phase === 'phase1') {
            const result = await submitChampionGuess(finalGuess, foundSlots);

            if (result.correct && result.slot) {
                const newSlots = [...foundSlots, result.slot];
                setFoundSlots(newSlots);
                setMessage({ ok: true, text: result.message || `Champion identified — ${finalGuess}.` });
                setGuess('');

                let newPhase: Phase = phase;
                let newZoom = zoomLevel;

                if (result.gameStatus === 'phase2') {
                    newPhase = 'phase2';
                    newZoom = 1.0;
                    setPhase('phase2');
                    setZoomLevel(1.0);
                }

                triggerCelebration('slot');

                const updatedRevealedNames = { ...revealedNames };
                if (result.slot === 'A') updatedRevealedNames.A = finalGuess;
                if (result.slot === 'B') updatedRevealedNames.B = finalGuess;
                if (!updatedRevealedNames.Theme) updatedRevealedNames.Theme = null;
                setRevealedNames(updatedRevealedNames);

                saveState({
                    foundSlots: newSlots,
                    phase: newPhase,
                    zoomLevel: newZoom,
                    attempts: newAttempts,
                    revealedNames: updatedRevealedNames,
                });
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
        } else {
            const isCorrect = await submitThemeGuess(finalGuess);
            if (isCorrect) {
                setPhase('won');
                setMessage({ ok: true, text: 'The fusion is complete.' });
                setZoomLevel(1.0);
                triggerCelebration('win');

                const updatedRevealedWithTheme = { ...revealedNames, Theme: finalGuess };
                setRevealedNames(updatedRevealedWithTheme);
                saveState({ solved: true, phase: 'won', zoomLevel: 1.0, attempts: newAttempts, revealedNames: updatedRevealedWithTheme });

                await submitGameStats(newAttempts);
                fetchGlobalStats();

                setTimeout(() => {
                    if (!isMobile) resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }, 500);
            } else {
                setMessage({ ok: false, text: `${finalGuess} — not the skin line.` });
                const newWrong = [...wrongGuesses, finalGuess];
                setWrongGuesses(newWrong);
                setGuess('');
                triggerShake();
                saveState({ wrongGuesses: newWrong, attempts: newAttempts });
            }
        }
        setLoading(false);
        setTimeout(() => { if (!isMobile) selectRef.current?.focus(); }, 0);
    };

    const handleGiveUp = async () => {
        if (!confirm('Surrender the rite? The solution will be revealed.')) return;
        const sol = await getSolution();
        if (!sol) return;
        setGivenUp(true);
        const newRevealed = { A: sol.champA, B: sol.champB, Theme: sol.theme };
        setRevealedNames(newRevealed);
        setFoundSlots(['A', 'B']);
        setMessage({ ok: false, text: 'The seal breaks — solution revealed.' });
        setPhase('won');
        setZoomLevel(1.0);
        localStorage.setItem(
            'fusion_daily_status',
            JSON.stringify({
                date: initialData?.date,
                solved: true,
                givenUp: true,
                revealedNames: newRevealed,
                attempts: attempts,
            }),
        );
    };

    const rawOptions = phase === 'phase1' ? championsList : THEMES;
    const availableOptions = rawOptions.filter((opt) => !wrongGuesses.includes(opt));
    const selectOptions = availableOptions.map((opt) => ({ value: opt, label: opt }));

    const canOpenFullImage = zoomLevel <= 1.0;

    const slots = {
        A: { name: revealedNames.A, found: foundSlots.includes('A') || (givenUp && !!revealedNames.A) },
        B: { name: revealedNames.B, found: foundSlots.includes('B') || (givenUp && !!revealedNames.B) },
        Theme: { name: revealedNames.Theme, found: phase === 'won' && !!revealedNames.Theme },
    };

    const solution = {
        champA: revealedNames.A || '???',
        champB: revealedNames.B || '???',
        theme: revealedNames.Theme || '???',
    };

    const selectStyles: StylesConfig<{ value: string; label: string }, false> = {
        control: (base, state) => ({
            ...base,
            backgroundColor: 'var(--panel-inner)',
            borderColor: state.isFocused ? 'var(--accent)' : 'var(--border)',
            borderRadius: 2,
            minHeight: 46,
            padding: '2px 4px',
            boxShadow: 'none',
            fontFamily: 'var(--font-body), Georgia, serif',
            '&:hover': { borderColor: 'var(--border-strong)' },
        }),
        menu: (base) => ({
            ...base,
            backgroundColor: 'var(--bg-1)',
            border: '1px solid var(--border-strong)',
            borderRadius: 2,
            marginTop: 4,
            zIndex: 50,
            overflow: 'hidden',
        }),
        menuList: (base) => ({ ...base, padding: 0, maxHeight: 220 }),
        option: (base, state) => ({
            ...base,
            backgroundColor: state.isFocused
                ? 'var(--bg-2)'
                : state.isSelected
                ? 'var(--bg-2)'
                : 'transparent',
            color: 'var(--ink)',
            cursor: 'pointer',
            fontFamily: 'var(--font-body), Georgia, serif',
            padding: '8px 12px',
            borderBottom: '1px solid var(--border)',
        }),
        singleValue: (base) => ({ ...base, color: 'var(--ink)' }),
        input: (base) => ({ ...base, color: 'var(--ink)' }),
        placeholder: (base) => ({ ...base, color: 'var(--ink-faint)' }),
        indicatorSeparator: () => ({ display: 'none' }),
        dropdownIndicator: (base) => ({
            ...base,
            color: 'var(--ink-faint)',
            '&:hover': { color: 'var(--accent)' },
        }),
    };

    const phaseCopy = phase === 'phase1'
        ? { label: 'STEP · 1', title: 'Identify the champions' }
        : phase === 'phase2'
        ? { label: 'STEP · 2', title: 'Name the skin line' }
        : { label: 'RESOLVED', title: 'Review your result' };

    return (
        <div className="flex flex-col">
            <HeaderHUD
                phase={phase}
                attempts={attempts}
                onOpenHistory={() => setHistoryOpen(true)}
                onOpenHelp={() => setHelpOpen(true)}
            />

            <div className="mx-auto grid w-full max-w-[1280px] grid-cols-1 gap-3 px-3 py-3 md:grid-cols-[minmax(0,1fr)_420px] md:gap-8 md:px-8 md:py-7">
                {/* LEFT: Artifact */}
                <div className="flex flex-col">
                    <div className="mx-auto w-full max-w-[min(100%,38vh)] md:max-w-[560px]">
                        <ArcaneArtifact
                            canvasRef={canvasRef}
                            phase={phase}
                            celebrate={celebrate}
                            imageLoaded={imageLoaded}
                            onOpenFull={() => {
                                if (canOpenFullImage && initialData) window.open(initialData.imageUrl, '_blank');
                            }}
                            canOpenFull={canOpenFullImage}
                        />
                        <SlotRail slots={slots} phase={phase} />
                    </div>
                </div>

                {/* RIGHT: Control panel */}
                <div className="flex flex-col">
                    <div
                        className="relative px-3 py-3 md:min-h-[280px] md:px-[22px] md:py-5"
                        style={{ background: 'var(--panel)', border: '1px solid var(--border)' }}
                    >
                        <div className="border-b pb-[8px] md:pb-[10px]" style={{ borderColor: 'var(--border)' }}>
                            <div
                                className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.28em]"
                                style={{ color: 'var(--accent)' }}
                            >
                                {phaseCopy.label}
                            </div>
                            <div
                                className="mt-[4px] font-[family-name:var(--font-display)] text-[18px] font-semibold md:text-[22px]"
                                style={{ color: 'var(--ink)' }}
                            >
                                {phaseCopy.title}
                            </div>
                        </div>
                        {phase !== 'won' ? (
                            <div className="mt-[12px] md:mt-[18px]">
                                <div
                                    className="relative"
                                    style={{ animation: shake ? 'fusionShake 360ms ease' : 'none' }}
                                >
                                    <div className="flex gap-2">
                                        <div className="flex-1">
                                            <Select
                                                ref={selectRef}
                                                instanceId={selectId}
                                                inputId={`${selectId}-input`}
                                                options={selectOptions}
                                                value={guess ? { value: guess, label: guess } : null}
                                                onChange={(option) => {
                                                    if (option) {
                                                        setGuess(option.value);
                                                        handleGuess(option.value);
                                                    }
                                                }}
                                                onInputChange={(value, action) => {
                                                    if (action.action === 'input-change') setGuess(value);
                                                }}
                                                inputValue={guess}
                                                placeholder={phase === 'phase1' ? 'Type a champion name…' : 'Name the skin line…'}
                                                styles={selectStyles}
                                                isSearchable
                                                isClearable={false}
                                                blurInputOnSelect={false}
                                                autoFocus={!isMobile}
                                                menuShouldScrollIntoView={false}
                                                filterOption={(option, input) => {
                                                    const normalize = (s: string) => s.toLowerCase().replace(/['-\s]/g, '');
                                                    return normalize(option.label).includes(normalize(input));
                                                }}
                                                noOptionsMessage={() => guess.length > 0 ? 'No matches' : 'Start typing…'}
                                                isLoading={loading}
                                                isDisabled={false}
                                                menuPlacement={isMobile ? 'top' : 'auto'}
                                            />
                                        </div>
                                        <button
                                            onClick={() => handleGuess()}
                                            disabled={loading || !guess}
                                            className="cursor-pointer px-[22px] font-[family-name:var(--font-display)] text-[12px] font-bold tracking-[0.28em] transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
                                            style={{
                                                background: loading || !guess ? 'transparent' : 'var(--accent)',
                                                color: loading || !guess ? 'var(--ink-faint)' : 'var(--bg-0)',
                                                border: '1px solid var(--accent)',
                                            }}
                                        >
                                            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'SUBMIT'}
                                        </button>
                                    </div>
                                </div>
                                <div className="mt-2 flex justify-end">
                                    <button
                                        onClick={handleGiveUp}
                                        className="cursor-pointer font-[family-name:var(--font-mono)] text-[10px] tracking-[0.2em] transition-colors hover:text-[var(--danger)]"
                                        style={{ color: 'var(--ink-faint)' }}
                                    >
                                        SURRENDER
                                    </button>
                                </div>
                                <WrongStrip guesses={wrongGuesses} message={message} />
                            </div>
                        ) : (
                            <div ref={resultsRef} className="mt-[10px]">
                                <VictoryCard
                                    attempts={attempts}
                                    givenUp={givenUp}
                                    solution={solution}
                                    stats={globalStats}
                                    shareCopied={shareCopied}
                                    onShare={() => {
                                        const text = `LoL Fusion · ${initialData?.date ?? ''}\n${givenUp ? 'Surrendered' : `Solved in ${attempts} tries`}\n${solution.champA} + ${solution.champB} · ${solution.theme}`;
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
                    </div>

                    {/* Community strip */}
                    {globalStats && globalStats.total > 0 && (
                        <div
                            className="mt-[14px] flex items-center justify-between px-[18px] py-[12px] font-[family-name:var(--font-mono)] text-[10px] tracking-[0.22em]"
                            style={{
                                background: 'var(--panel-inner)',
                                border: '1px solid var(--border)',
                            }}
                        >
                            <span style={{ color: 'var(--ink-faint)' }}>TODAY</span>
                            <span>
                                <span style={{ color: 'var(--accent)', fontWeight: 700 }}>
                                    {globalStats.total.toLocaleString()}
                                </span>
                                <span style={{ color: 'var(--ink-dim)' }}> SUMMONERS SOLVED</span>
                            </span>
                        </div>
                    )}
                </div>
            </div>

            {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
            <HistoryDrawer isOpen={historyOpen} onClose={() => setHistoryOpen(false)} />
        </div>
    );
}

// -------- ARCANE ARTIFACT FRAME --------
function ArcaneArtifact({
    canvasRef,
    phase,
    celebrate,
    imageLoaded,
    onOpenFull,
    canOpenFull,
}: {
    canvasRef: React.RefObject<HTMLCanvasElement | null>;
    phase: Phase;
    celebrate: Celebrate;
    imageLoaded: boolean;
    onOpenFull: () => void;
    canOpenFull: boolean;
}) {
    return (
        <div className="relative aspect-square w-full">
            {/* Outer glow */}
            <div
                aria-hidden
                className="pointer-events-none absolute transition-opacity"
                style={{
                    inset: -14,
                    borderRadius: 4,
                    background:
                        'radial-gradient(ellipse at 50% 50%, var(--accent-glow) 0%, transparent 70%)',
                    filter: 'blur(18px)',
                    opacity: celebrate ? 1 : 0.7,
                    animation: celebrate === 'win' ? 'fusionWinGlow 1.2s ease-in-out infinite' : 'none',
                }}
            />
            {/* Filigree corners */}
            <FiligreeCorner position="tl" />
            <FiligreeCorner position="tr" />
            <FiligreeCorner position="bl" />
            <FiligreeCorner position="br" />
            {/* Frame */}
            <div
                className="absolute inset-0 overflow-hidden transition-shadow duration-500"
                style={{
                    border: '1px solid var(--border-strong)',
                    background: 'var(--bg-1)',
                    boxShadow: celebrate
                        ? 'inset 0 0 0 1px rgba(245,210,122,0.5), inset 0 0 80px rgba(245,210,122,0.25), 0 0 60px rgba(245,210,122,0.4), 0 20px 60px rgba(0,0,0,0.6)'
                        : 'inset 0 0 0 1px rgba(217,168,74,0.1), inset 0 0 60px rgba(217,168,74,0.08), 0 20px 60px rgba(0,0,0,0.6)',
                }}
            >
                <div
                    className="absolute overflow-hidden"
                    style={{ inset: 12, border: '1px solid var(--border)' }}
                >
                    <canvas
                        ref={canvasRef}
                        onClick={canOpenFull ? onOpenFull : undefined}
                        className={`block h-full w-full object-cover transition-all duration-700 ease-out ${canOpenFull ? 'cursor-pointer hover:opacity-90' : ''}`}
                    />
                    {/* Vignette */}
                    <div
                        aria-hidden
                        className="pointer-events-none absolute inset-0"
                        style={{
                            background:
                                'radial-gradient(ellipse at 50% 50%, transparent 50%, rgba(0,0,0,0.6) 100%)',
                        }}
                    />

                    {!imageLoaded && (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <Loader2 className="h-10 w-10 animate-spin" style={{ color: 'var(--accent)' }} />
                        </div>
                    )}

                    {celebrate === 'slot' && <SlotCelebration />}
                    {celebrate === 'win' && <WinCelebration />}
                </div>
            </div>
            {/* Top plate */}
            <div
                className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap font-[family-name:var(--font-display)] text-[10px] uppercase tracking-[0.28em] md:text-[11px]"
                style={{
                    top: -14,
                    padding: '4px 22px',
                    background: 'var(--bg-0)',
                    border: '1px solid var(--border-strong)',
                    color: 'var(--accent-2)',
                }}
            >
                {phase === 'won' ? '✦ Complete ✦' : phase === 'phase2' ? 'Step · 2' : 'Step · 1'}
            </div>
            {/* Bottom plate */}
            {phase === 'won' && (
                <button
                    onClick={onOpenFull}
                    className="absolute left-1/2 -translate-x-1/2 cursor-pointer font-[family-name:var(--font-mono)] text-[10px] tracking-[0.2em] transition-colors hover:text-[var(--accent)]"
                    style={{
                        bottom: -14,
                        padding: '4px 14px',
                        background: 'var(--bg-0)',
                        border: '1px solid var(--border)',
                        color: 'var(--ink-dim)',
                    }}
                >
                    VIEW FULL
                </button>
            )}
        </div>
    );
}
