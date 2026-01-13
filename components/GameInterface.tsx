'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { Loader2, History, Maximize2 } from 'lucide-react';
import Select, { StylesConfig } from 'react-select';
import { THEMES } from '@/lib/constants';
import { submitChampionGuess, submitThemeGuess, getSolution, submitGameStats, getGameStats } from '@/app/actions';
import HistoryDrawer from './HistoryDrawer';

interface GameInterfaceProps {
    initialData: {
        imageUrl: string;
        date: string;
    } | null;
}

export default function GameInterface({ initialData }: GameInterfaceProps) {
    const [zoomLevel, setZoomLevel] = useState(3.0);
    const [guess, setGuess] = useState('');
    const [foundSlots, setFoundSlots] = useState<('A' | 'B')[]>([]);
    const [phase, setPhase] = useState<'phase1' | 'phase2' | 'won'>('phase1');
    const [message, setMessage] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [imageLoaded, setImageLoaded] = useState(false);
    const [championsList, setChampionsList] = useState<string[]>([]);
    const [imgDimensions, setImgDimensions] = useState({ width: 500, height: 500 });
    const [historyOpen, setHistoryOpen] = useState(false);

    // New State
    const [wrongGuesses, setWrongGuesses] = useState<string[]>([]);
    const [attempts, setAttempts] = useState(0);
    const [givenUp, setGivenUp] = useState(false);
    const [revealedNames, setRevealedNames] = useState<{ A: string | null; B: string | null; Theme: string | null }>({ A: null, B: null, Theme: null });

    const [globalStats, setGlobalStats] = useState<{ distribution: Record<string, unknown>, total: number } | null>(null);
    const [wrongGuessesExpanded, setWrongGuessesExpanded] = useState(false);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const resultsRef = useRef<HTMLDivElement>(null);

    const imageRef = useRef<HTMLImageElement | null>(null);

    // Fetch Champions Dynamically (Get Names, not IDs)
    useEffect(() => {
        const fetchChampions = async () => {
            try {
                const vRes = await fetch('https://ddragon.leagueoflegends.com/api/versions.json');
                const versions = await vRes.json();
                const latest = versions[0];
                const cRes = await fetch(`https://ddragon.leagueoflegends.com/cdn/${latest}/data/en_US/champion.json`);
                const data = await cRes.json();
                // Map to names: "Aatrox" -> "Aatrox", "Renata" -> "Renata Glasc"
                const names = Object.values(data.data).map((c: any) => c.name);
                setChampionsList(names.sort()); // Sorting strings is fine without callback but linter complains
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

        // Poll for updates every 30 seconds
        const interval = setInterval(() => {
            if (document.visibilityState === 'visible') {
                fetchGlobalStats();
            }
        }, 30000);

        return () => clearInterval(interval);
    }, []);

    // Check Local Storage for Persistence
    useEffect(() => {
        if (!initialData) return;
        const stored = localStorage.getItem('fusion_daily_status');
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                if (parsed.date === initialData.date) {
                    // Restore state
                    if (parsed.foundSlots) setFoundSlots(parsed.foundSlots);
                    if (parsed.wrongGuesses) setWrongGuesses(parsed.wrongGuesses);
                    if (parsed.attempts) setAttempts(parsed.attempts);
                    if (parsed.givenUp) setGivenUp(parsed.givenUp);
                    if (parsed.revealedNames) setRevealedNames(parsed.revealedNames);

                    if (parsed.solved) {
                        setPhase('won');
                        setMessage(parsed.givenUp ? 'Game Over. The solution was revealed.' : 'Welcome back! You already solved this.');
                        setZoomLevel(1.0);
                        fetchGlobalStats();
                    } else if (parsed.phase === 'phase2') {
                        setPhase('phase2');
                        setZoomLevel(1.0);
                    } else {
                        // Phase 1, restore zoom IFF not solved/given up
                        if (parsed.zoomLevel) setZoomLevel(parsed.zoomLevel);
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

        // Set canvas size to match image natural size for sharpness
        canvas.width = imgDimensions.width;
        canvas.height = imgDimensions.height;

        // Clear
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Calculate Zoom & Center
        const w = canvas.width;
        const h = canvas.height;

        // Draw logic:
        // We want to draw the image centered, scaled by zoomLevel.
        // origin x,y should be center.

        ctx.save();
        ctx.translate(w / 2, h / 2);
        ctx.scale(zoomLevel, zoomLevel);
        ctx.translate(-w / 2, -h / 2);

        // Draw image to cover canvas
        ctx.drawImage(img, 0, 0, w, h);

        ctx.restore();
    };

    // Image Loading & Canvas Drawing Logic
    useEffect(() => {
        if (!initialData?.imageUrl || !canvasRef.current) return;

        const img = new Image();
        img.crossOrigin = 'anonymous'; // Important for manipulating external images
        img.src = initialData.imageUrl;

        img.onload = () => {
            imageRef.current = img;
            setImgDimensions({ width: img.naturalWidth, height: img.naturalHeight });
            setImageLoaded(true);
            // drawCanvas will be triggered by effect dependency on imageLoaded and imgDimensions
        };

        img.onerror = (e) => {
            console.error("Failed to load image:", e);
            setMessage("Error loading puzzle result.");
            setImageLoaded(false);
        };
    }, [initialData]);

    // Redraw when zoom changes
    useEffect(() => {
        if (imageLoaded) {
            drawCanvas();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [zoomLevel, imageLoaded, phase, imgDimensions]);

    // Save State Helper
    const saveState = (newState: any) => {
        if (!initialData) return;
        const current = localStorage.getItem('fusion_daily_status');
        let data = current ? JSON.parse(current) : { date: initialData.date };

        // Ensure we only update for current date
        if (data.date !== initialData.date) {
            data = { date: initialData.date };
        }

        const merged = { ...data, ...newState };
        localStorage.setItem('fusion_daily_status', JSON.stringify(merged));
    };

    const handleGuess = async (explicitGuess?: string) => {
        const finalGuess = explicitGuess || guess;
        if (!finalGuess) return;
        setLoading(true);
        setMessage(null);

        // Filter duplicates locally
        if (wrongGuesses.includes(finalGuess)) {
            setMessage('You already guessed that!');
            setLoading(false);
            // If we auto-submitted, we should probably clear the input if it was an explicit action?
            // But for duplicates, keeping it visible explains why it failed.
            return;
        }

        // Increment attempts
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);

        if (phase === 'phase1') {
            const result = await submitChampionGuess(finalGuess, foundSlots);

            if (result.correct && result.slot) {
                const newSlots = [...foundSlots, result.slot!];
                setFoundSlots(newSlots);
                setMessage(result.message || 'Correct!');
                setGuess('');

                let newPhase: 'phase1' | 'phase2' | 'won' = phase;
                let newZoom = zoomLevel;

                if (result.gameStatus === 'phase2') {
                    newPhase = 'phase2';
                    newZoom = 1.0;
                    setPhase('phase2');
                    setZoomLevel(1.0);
                }

                confetti({
                    particleCount: 50,
                    spread: 60,
                    origin: { y: 0.7 }
                });

                // Update revealed names based on slots found
                const updatedRevealedNames = { ...revealedNames };
                if (result.slot === 'A') updatedRevealedNames.A = finalGuess;
                if (result.slot === 'B') updatedRevealedNames.B = finalGuess;
                // Ensure Theme is present to match new type
                if (!updatedRevealedNames.Theme) updatedRevealedNames.Theme = null;
                setRevealedNames(updatedRevealedNames);

                saveState({
                    foundSlots: newSlots,
                    phase: newPhase,
                    zoomLevel: newZoom,
                    attempts: newAttempts,
                    revealedNames: updatedRevealedNames
                });

            } else {
                setMessage(result.message || 'Wrong!');
                // Zoom out punishment
                const newZoom = Math.max(1.0, zoomLevel - 0.5);
                setZoomLevel(newZoom);

                const newWrong = [...wrongGuesses, finalGuess];
                setWrongGuesses(newWrong);
                setGuess(''); // Clear input on wrong guess as well for better UX
                saveState({ zoomLevel: newZoom, wrongGuesses: newWrong, attempts: newAttempts });
            }
        } else {
            // Phase 2: Theme
            const isCorrect = await submitThemeGuess(finalGuess);
            if (isCorrect) {
                setPhase('won');
                setMessage('YOU WON! Fusion Completed.');
                setZoomLevel(1.0);
                confetti({
                    particleCount: 150,
                    spread: 70,
                    origin: { y: 0.6 }
                });
                saveState({ solved: true, phase: 'won', zoomLevel: 1.0, attempts: newAttempts });

                // Update revealedNames with the guessed theme
                setRevealedNames(prev => ({ ...prev, Theme: finalGuess }));

                // Submit Stats
                await submitGameStats(newAttempts);
                fetchGlobalStats();

                // Scroll to results
                setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth' }), 500);

            } else {
                setMessage('Wrong Theme!');
                const newWrong = [...wrongGuesses, finalGuess];
                setWrongGuesses(newWrong);
                setGuess(''); // Clear input on wrong guess
                saveState({ wrongGuesses: newWrong, attempts: newAttempts });
            }
        }
        setLoading(false);
    };

    // React-Select Options
    const rawOptions = phase === 'phase1' ? championsList : THEMES;
    const availableOptions = rawOptions.filter(opt => !wrongGuesses.includes(opt));
    const selectOptions = availableOptions.map(opt => ({ value: opt, label: opt }));

    const canOpenFullImage = zoomLevel <= 1.0;

    // React-Select custom styles for dark theme
    const selectStyles: StylesConfig<{ value: string; label: string }, false> = {
        control: (base, state) => ({
            ...base,
            backgroundColor: '#111827',
            borderColor: state.isFocused ? '#a855f7' : '#374151',
            borderRadius: '0.5rem',
            padding: '0.25rem',
            boxShadow: state.isFocused ? '0 0 0 1px #a855f7' : 'none',
            '&:hover': { borderColor: '#a855f7' },
        }),
        menu: (base) => ({
            ...base,
            backgroundColor: '#1f2937',
            border: '1px solid #374151',
            borderRadius: '0.5rem',
            marginTop: '4px',
            zIndex: 50,
        }),
        menuList: (base) => ({
            ...base,
            padding: 0,
            maxHeight: '200px',
        }),
        option: (base, state) => ({
            ...base,
            backgroundColor: state.isFocused ? '#374151' : state.isSelected ? '#4c1d95' : 'transparent',
            color: '#fff',
            cursor: 'pointer',
            '&:active': { backgroundColor: '#4c1d95' },
        }),
        singleValue: (base) => ({
            ...base,
            color: '#fff',
        }),
        input: (base) => ({
            ...base,
            color: '#fff',
        }),
        placeholder: (base) => ({
            ...base,
            color: '#9ca3af',
        }),
        indicatorSeparator: () => ({ display: 'none' }),
        dropdownIndicator: (base) => ({
            ...base,
            color: '#9ca3af',
            '&:hover': { color: '#fff' },
        }),
    };

    return (
        <div className="flex flex-col items-center gap-2 md:gap-4 w-full max-w-4xl mx-auto p-2 md:p-4">
            {/* Header */}
            <div className="text-center space-y-1 md:space-y-2">
                <h1 className="text-2xl md:text-3xl font-bold bg-linear-to-r from-purple-400 to-pink-600 bg-clip-text text-transparent">
                    LoL FUSION
                </h1>
                {/* Phase Indicator */}
                <div className="text-sm font-medium">
                    {phase === 'won' ? (
                        <span className="text-green-400">🎉 Puzzle Complete!</span>
                    ) : phase === 'phase2' ? (
                        <span className="text-yellow-400">Step 2: Guess the Skin Theme</span>
                    ) : (
                        <span className="text-purple-300">Step 1: Find the Champions ({foundSlots.length}/2)</span>
                    )}
                </div>
                <p className="text-gray-300 text-sm max-w-sm mx-auto leading-relaxed">
                    Identify the two combined champions, then guess their skin universe. Wrong guesses zoom out!
                </p>
                {/* Attempts Counter */}
                <div className="text-xs font-mono text-gray-500 uppercase tracking-widest mt-2 flex items-center justify-center gap-4">
                    <span>ATTEMPTS: <span className="text-purple-400 text-sm font-bold">{attempts}</span></span>
                    <button
                        onClick={() => setHistoryOpen(true)}
                        className="flex items-center gap-1 text-gray-500 hover:text-purple-400 transition-colors"
                    >
                        <History className="w-3 h-3" />
                        <span className="text-[10px]">HISTORY</span>
                    </button>
                </div>
            </div>

            <HistoryDrawer isOpen={historyOpen} onClose={() => setHistoryOpen(false)} />

            {/* Game Area */}
            <div className="relative group w-full max-w-[50vh] md:max-w-[55vh] px-4">
                <div className={`relative overflow-hidden rounded-2xl border-4 border-purple-900/50 shadow-2xl shadow-purple-900/20 bg-black ${phase === 'won' ? '' : 'aspect-square'}`}>
                    <canvas
                        ref={canvasRef}
                        onClick={() => {
                            if (canOpenFullImage && initialData) {
                                window.open(initialData.imageUrl, '_blank');
                            }
                        }}
                        className={`block w-full transition-all duration-700 ease-out ${canOpenFullImage ? 'cursor-pointer hover:opacity-90' : ''
                            } ${phase === 'won' ? 'h-auto' : 'h-full object-cover'}`}
                    />
                    {!imageLoaded && (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <Loader2 className="w-12 h-12 text-purple-500 animate-spin" />
                        </div>
                    )}
                    {/* Clickable Image Hint - shows when zoomed out */}
                    {canOpenFullImage && imageLoaded && phase !== 'won' && (
                        <button 
                            type="button"
                            className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 hover:opacity-100 focus:opacity-100 transition-opacity cursor-pointer border-0"
                            onClick={() => initialData && window.open(initialData.imageUrl, '_blank')}
                            aria-label="Open full size image in new tab"
                        >
                            <div className="flex flex-col items-center gap-2 text-white bg-black/60 px-4 py-3 rounded-xl">
                                <Maximize2 className="w-6 h-6" />
                                <span className="text-xs font-medium">Click for full size</span>
                            </div>
                        </button>
                    )}
                </div>

                {/* Status Indicators (Cards) */}
                <div className="absolute -bottom-14 md:-bottom-16 left-1/2 -translate-x-1/2 flex gap-1.5 md:gap-4 w-full justify-center px-1 md:px-4">
                    <motion.div
                        animate={foundSlots.includes('A') ? { scale: [1, 1.1, 1] } : {}}
                        transition={{ duration: 0.5 }}
                        className={`flex flex-col items-center justify-center w-20 h-14 md:w-32 md:h-20 rounded-xl border-2 shadow-lg transition-all transform ${foundSlots.includes('A')
                            ? 'bg-green-900/80 border-green-500'
                            : 'bg-black/80 border-purple-800/50'
                            }`}>
                        {foundSlots.includes('A') || revealedNames.A ? (
                            <div className="text-center">
                                <span className="text-[8px] md:text-xs text-green-400 font-bold tracking-widest uppercase block mb-0.5">Champion A</span>
                                <p className="text-white font-bold text-xs md:text-sm leading-tight px-1 truncate max-w-[4.5rem] md:max-w-none">
                                    {revealedNames.A || 'Found'}
                                </p>
                            </div>
                        ) : (
                            <div className="text-center">
                                <span className="text-[8px] md:text-xs text-gray-500 font-bold tracking-widest uppercase block mb-0.5">Champion A</span>
                                <p className="text-purple-500/50 font-bold text-lg md:text-2xl">?</p>
                            </div>
                        )}
                    </motion.div>

                    <motion.div
                        animate={foundSlots.includes('B') ? { scale: [1, 1.1, 1] } : {}}
                        transition={{ duration: 0.5 }}
                        className={`flex flex-col items-center justify-center w-20 h-14 md:w-32 md:h-20 rounded-xl border-2 shadow-lg transition-all transform ${foundSlots.includes('B')
                            ? 'bg-green-900/80 border-green-500'
                            : 'bg-black/80 border-purple-800/50'
                            }`}>
                        {foundSlots.includes('B') || revealedNames.B ? (
                            <div className="text-center">
                                <span className="text-[8px] md:text-xs text-green-400 font-bold tracking-widest uppercase block mb-0.5">Champion B</span>
                                <p className="text-white font-bold text-xs md:text-sm leading-tight px-1 truncate max-w-[4.5rem] md:max-w-none">
                                    {revealedNames.B || 'Found'}
                                </p>
                            </div>
                        ) : (
                            <div className="text-center">
                                <span className="text-[8px] md:text-xs text-gray-500 font-bold tracking-widest uppercase block mb-0.5">Champion B</span>
                                <p className="text-purple-500/50 font-bold text-lg md:text-2xl">?</p>
                            </div>
                        )}
                    </motion.div>

                    <motion.div
                        animate={phase === 'won' ? { scale: [1, 1.1, 1] } : {}}
                        transition={{ duration: 0.5 }}
                        className={`flex flex-col items-center justify-center w-20 h-14 md:w-32 md:h-20 rounded-xl border-2 shadow-lg transition-all transform ${revealedNames.Theme
                            ? 'bg-green-900/80 border-green-500'
                            : 'bg-black/80 border-purple-800/50'
                            }`}
                    >
                        {revealedNames.Theme ? (
                            <div className="text-center">
                                <span className="text-[8px] md:text-xs text-green-400 font-bold tracking-widest uppercase block mb-0.5">Skin</span>
                                <p className="text-white font-bold text-xs md:text-sm leading-tight px-1 truncate max-w-[4.5rem] md:max-w-none">
                                    {revealedNames.Theme}
                                </p>
                            </div>
                        ) : (
                            <div className="text-center">
                                <span className="text-[8px] md:text-xs text-gray-500 font-bold tracking-widest uppercase block mb-0.5">Skin</span>
                                <p className="text-purple-500/50 font-bold text-lg md:text-2xl">?</p>
                            </div>
                        )}
                    </motion.div>
                </div>
            </div>

            {/* Spacer for the absolute positioned cards */}
            <div className="h-8 md:h-10" />

            {/* Controls */}
            <div className="w-full max-w-md mt-1 md:mt-4 space-y-2 md:space-y-3">
                {/* Global Completion Count Display (Loldle style) */}
                {globalStats && globalStats.total > 0 && (
                    <div className="text-center animate-in fade-in slide-in-from-bottom-2 duration-500">
                        <span className="text-yellow-500 font-bold">{globalStats.total.toLocaleString()}</span>
                        <span className="text-gray-500 text-xs uppercase font-bold tracking-widest ml-1"> people already found out!</span>
                    </div>
                )}

                {phase === 'won' ? (
                    <div ref={resultsRef} className="space-y-6 animate-in slide-in-from-bottom-10 fade-in duration-700">
                        <div className={`text-center p-6 rounded-xl border shadow-xl ${givenUp
                            ? 'bg-red-900/20 border-red-500/50 shadow-red-900/20'
                            : 'bg-green-500/20 border-green-500/50 shadow-green-900/50'
                            }`}>
                            <h2 className={`text-3xl font-extrabold mb-2 ${givenUp ? 'text-red-500' : 'text-green-400'}`}>
                                {givenUp ? 'GAME OVER' : 'VICTORY!'}
                            </h2>
                            {!givenUp && (
                                <p className="text-lg">You solved it in <span className="font-bold text-white text-xl">{attempts}</span> tries.</p>
                            )}
                            <p className="text-xs text-gray-400 mt-2">Come back tomorrow for a new fusion.</p>
                        </div>

                        {globalStats && (
                            <div className="p-5 bg-gray-900/90 rounded-xl border border-gray-800 shadow-xl backdrop-blur-xs">
                                <h3 className="text-sm text-gray-400 uppercase tracking-widest font-bold mb-6 text-center">Global Guess Distribution</h3>

                                <div className="flex items-end justify-center h-48 mb-2 px-2 gap-1">
                                    {(() => {
                                        // Minimum attempts is 3 (2 champions + 1 theme)
                                        // Show bars 3-12 individually, 13+ grouped
                                        const distributionKeys = Object.keys(globalStats.distribution).map(Number);
                                        const maxKey = Math.max(...distributionKeys, 0);
                                        
                                        const bars: { label: string; count: number; isMyScore: boolean }[] = [];
                                        
                                        // Create bars for 3-12 attempts
                                        for (let i = 3; i <= 12; i++) {
                                            bars.push({
                                                label: String(i),
                                                count: Number(globalStats.distribution[i] || 0),
                                                isMyScore: attempts === i && !givenUp
                                            });
                                        }
                                        
                                        // Sum up all 13+ attempts
                                        const thirteenPlusCount = distributionKeys
                                            .filter(k => k >= 13)
                                            .reduce((sum, k) => sum + Number(globalStats.distribution[k] || 0), 0);
                                        
                                        if (thirteenPlusCount > 0 || maxKey >= 13 || attempts >= 13) {
                                            bars.push({
                                                label: '13+',
                                                count: thirteenPlusCount,
                                                isMyScore: attempts >= 13 && !givenUp
                                            });
                                        }
                                        
                                        const maxVal = Math.max(...bars.map(b => b.count), 1);

                                        return bars.map((bar) => {
                                            const percentage = bar.count === 0 ? 0 : Math.max(8, (bar.count / maxVal) * 100);

                                            return (
                                                <div key={bar.label} className="group flex-1 flex flex-col items-center gap-1 h-full justify-end min-w-[28px]">
                                                    {/* Your Score Label */}
                                                    {bar.isMyScore && (
                                                        <span className="text-[9px] text-green-400 font-bold animate-pulse">YOU</span>
                                                    )}
                                                    {/* Bar container */}
                                                    <div className="w-full relative flex items-end" style={{ height: '85%' }}>
                                                        <div
                                                            className={`w-full rounded-t transition-all duration-1000 ease-out flex items-end justify-center pb-1 ${bar.isMyScore
                                                                ? 'bg-linear-to-t from-green-600 to-green-400 shadow-[0_0_20px_rgba(34,197,94,0.4)] ring-2 ring-green-400/50'
                                                                : 'bg-linear-to-t from-gray-700 to-gray-600 hover:from-purple-800 hover:to-purple-600'
                                                                }`}
                                                            style={{ height: `${percentage}%`, minHeight: bar.count > 0 ? '20px' : '0' }}
                                                        >
                                                            {/* Count Label (Inside Bar) */}
                                                            <span className={`text-[10px] font-mono leading-none ${bar.count > 0 ? 'opacity-100' : 'opacity-0'
                                                                } ${bar.isMyScore ? 'text-white font-bold' : 'text-gray-200'
                                                                }`}>
                                                                {bar.count}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    {/* X-Axis Label (Bottom) */}
                                                    <div className={`text-[11px] font-mono border-t border-gray-700 w-full text-center pt-1 ${bar.isMyScore ? 'text-green-400 font-bold' : 'text-gray-500'
                                                        }`}>
                                                        {bar.label}
                                                    </div>
                                                </div>
                                            );
                                        });
                                    })()}
                                </div>

                                {/* X-Axis Title */}
                                <div className="text-center text-[10px] uppercase tracking-widest text-gray-600 font-bold mt-2">
                                    Attempts
                                </div>

                                <div className="text-center mt-6 pt-4 border-t border-gray-800 text-xs text-gray-500">
                                    Total Solvers: <span className="text-gray-300 font-bold">{globalStats.total}</span>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="relative">
                        <div className="flex gap-2">
                            <div className="flex-1">
                                <Select
                                    options={selectOptions}
                                    value={guess ? { value: guess, label: guess } : null}
                                    onChange={(option) => {
                                        if (option) {
                                            setGuess(option.value);
                                            handleGuess(option.value);
                                        }
                                    }}
                                    onInputChange={(value, action) => {
                                        if (action.action === 'input-change') {
                                            setGuess(value);
                                        }
                                    }}
                                    inputValue={guess}
                                    placeholder={phase === 'phase1' ? "Type a Champion name..." : "Type the skin theme..."}
                                    styles={selectStyles}
                                    isSearchable
                                    isClearable={false}
                                    blurInputOnSelect
                                    filterOption={(option, input) => {
                                        // Normalize: remove apostrophes, hyphens, spaces and convert to lowercase
                                        const normalize = (str: string) => str.toLowerCase().replace(/['-\s]/g, '');
                                        return normalize(option.label).includes(normalize(input));
                                    }}
                                    noOptionsMessage={() => guess.length > 0 ? 'No matches' : 'Start typing...'}
                                    isLoading={loading}
                                    isDisabled={loading}
                                    menuPlacement="top"
                                />
                            </div>
                            <button
                                onClick={() => handleGuess()}
                                disabled={loading || !guess}
                                className="px-6 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-bold transition-all"
                            >
                                {loading ? <Loader2 className="animate-spin" /> : 'GUESS'}
                            </button>
                        </div>
                    </div>
                )}

                {/* Wrong Guesses List (Loldle Style) */}
                {wrongGuesses.length > 0 && (
                    <div className="space-y-2">
                        {/* Show expand button if more than 3 guesses */}
                        {wrongGuesses.length > 3 && !wrongGuessesExpanded && (
                            <button
                                onClick={() => setWrongGuessesExpanded(true)}
                                className="w-full text-center text-xs text-gray-500 hover:text-gray-300 py-1 transition-colors"
                            >
                                Show all {wrongGuesses.length} wrong guesses ▼
                            </button>
                        )}
                        {(wrongGuessesExpanded ? wrongGuesses : wrongGuesses.slice(-3)).slice().reverse().map((wrongGuess) => (
                            <div key={wrongGuess} className="flex items-center justify-between p-2.5 bg-red-900/20 border border-red-900/50 rounded-lg text-red-200 animate-in slide-in-from-top-2">
                                <span className="font-medium text-sm">{wrongGuess}</span>
                                <span className="text-red-500/50 text-xs">✗</span>
                            </div>
                        ))}
                        {/* Collapse button when expanded */}
                        {wrongGuessesExpanded && wrongGuesses.length > 3 && (
                            <button
                                onClick={() => setWrongGuessesExpanded(false)}
                                className="w-full text-center text-xs text-gray-500 hover:text-gray-300 py-1 transition-colors"
                            >
                                Show less ▲
                            </button>
                        )}
                    </div>
                )}

                <AnimatePresence>
                    {message && !message.includes('WON') && !message.includes('Correct') && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            className="text-center p-3 rounded-lg font-medium bg-red-500/20 text-red-400"
                        >
                            {message}
                        </motion.div>
                    )}
                    {message && (message.includes('WON') || message.includes('Correct')) && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            className="text-center p-3 rounded-lg font-medium bg-green-500/20 text-green-400"
                        >
                            {message}
                        </motion.div>
                    )}
                </AnimatePresence>

                {phase !== 'won' && (
                    /* Give Up Button */
                    <div className="mt-2 text-center">
                        <button
                            onClick={async () => {
                                if (confirm('Are you sure you want to give up? The solution will be revealed.')) {
                                    const sol = await getSolution();
                                    if (sol) {
                                        setGivenUp(true);
                                        // Set revealed names from solution
                                        const newRevealed = { A: sol.champA, B: sol.champB, Theme: sol.theme };
                                        setRevealedNames(newRevealed);

                                        setMessage(`Solution: ${sol.champA} + ${sol.champB} (${sol.theme})`);
                                        setPhase('won'); // End game state
                                        setZoomLevel(1.0);
                                        // Save as solved (technically given up, but for now mark as done)
                                        localStorage.setItem('fusion_daily_status', JSON.stringify({
                                            date: initialData?.date,
                                            solved: true,
                                            givenUp: true,
                                            revealedNames: newRevealed,
                                            attempts: attempts
                                        }));
                                    }
                                }
                            }}
                            className="text-xs text-gray-500 hover:text-gray-300 underline transition-colors"
                        >
                            Give Up
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
