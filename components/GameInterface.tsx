'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { Loader2 } from 'lucide-react';
import { THEMES } from '@/lib/constants';
import { submitChampionGuess, submitThemeGuess, getSolution } from '@/app/actions';

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
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    // Fetch Champions Dynamically (Get Names, not IDs)
    const fetchChampions = async () => {
        try {
            const vRes = await fetch('https://ddragon.leagueoflegends.com/api/versions.json');
            const versions = await vRes.json();
            const latest = versions[0];
            const cRes = await fetch(`https://ddragon.leagueoflegends.com/cdn/${latest}/data/en_US/champion.json`);
            const data = await cRes.json();
            // Map to names: "Aatrox" -> "Aatrox", "Renata" -> "Renata Glasc"
            const names = Object.values(data.data).map((c: any) => c.name);
            setChampionsList(names.sort());
        } catch (e) {
            console.error('Failed to fetch champions:', e);
        }
    };
    fetchChampions();
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
                
                if (parsed.solved) {
                    setPhase('won');
                    setMessage('Welcome back! You already solved this.');
                    setZoomLevel(1.0);
                } else if (parsed.phase === 'phase2') {
                    setPhase('phase2');
                    setZoomLevel(1.0);
                } else {
                    // Phase 1, restore zoom if saved, or calculate based on mistakes?
                    // For now let's respect the saved zoom or default
                    if (parsed.zoomLevel) setZoomLevel(parsed.zoomLevel);
                }
            }
        } catch (e) {
            console.error('Failed to parse local storage', e);
        }
    }
  }, [initialData]);

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

  const handleGuess = async () => {
    if (!guess) return;
    setLoading(true);
    setMessage(null);

    if (phase === 'phase1') {
      const result = await submitChampionGuess(guess, foundSlots);
      
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
        
        saveState({ foundSlots: newSlots, phase: newPhase, zoomLevel: newZoom });

      } else {
        setMessage(result.message || 'Wrong!');
        // Zoom out punishment
        const newZoom = Math.max(1.0, zoomLevel - 0.5);
        setZoomLevel(newZoom);
        saveState({ zoomLevel: newZoom });
      }
    } else {
      // Phase 2: Theme
      const isCorrect = await submitThemeGuess(guess);
      if (isCorrect) {
        setPhase('won');
        setMessage('YOU WON! Fusion Completed.');
        setZoomLevel(1.0);
        confetti({
            particleCount: 150,
            spread: 70,
            origin: { y: 0.6 }
        });
        saveState({ solved: true, phase: 'won', zoomLevel: 1.0 });
      } else {
        setMessage('Wrong Theme!');
      }
    }
    setLoading(false);
  };

  // Autocomplete Logic
  const options = phase === 'phase1' ? championsList : THEMES;
  const filteredOptions = guess === '' 
    ? [] 
    : options.filter((opt: string) =>
        opt.toLowerCase().includes(guess.toLowerCase())
      ).slice(0, 5);

  return (
    <div className="flex flex-col items-center gap-8 w-full max-w-4xl mx-auto p-4">
        {/* Header */}
        <div className="text-center space-y-2">
            <h1 className="text-4xl font-bold bg-linear-to-r from-purple-400 to-pink-600 bg-clip-text text-transparent">
                FUSION UNIVERSE
            </h1>
            <p className="text-gray-400">
                {phase === 'phase1' 
                    ? 'Identify the two fused champions.' 
                    : 'Identify the Skin Universe.'}
            </p>
        </div>

        {/* Game Area */}
        <div className="relative group">
            <div className="relative overflow-hidden rounded-2xl border-4 border-purple-900/50 shadow-2xl shadow-purple-900/20 bg-black">
                <canvas 
                    ref={canvasRef}
                    className="w-[300px] h-[300px] md:w-[500px] md:h-[500px] object-cover transition-all duration-700 ease-out"
                />
                {!imageLoaded && (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <Loader2 className="w-12 h-12 text-purple-500 animate-spin" />
                    </div>
                )}
            </div>
            
            {/* Status Indicators (Cards) */}
            <div className="absolute -bottom-16 left-1/2 -translate-x-1/2 flex gap-4 w-full justify-center px-4">
                 <div className={`flex flex-col items-center justify-center w-32 h-20 rounded-xl border-2 shadow-lg transition-all transform ${
                    foundSlots.includes('A') 
                    ? 'bg-green-900/80 border-green-500 scale-105' 
                    : 'bg-black/80 border-purple-800/50'
                 }`}>
                    {foundSlots.includes('A') ? (
                         <div className="text-center">
                            <span className="text-xs text-green-400 font-bold tracking-widest uppercase">Champion A</span>
                            <p className="text-white font-bold text-sm leading-tight mt-1">Found</p>
                         </div>
                    ) : (
                         <div className="text-center">
                            <span className="text-xs text-gray-500 font-bold tracking-widest uppercase">Champion A</span>
                            <p className="text-purple-500/50 font-bold text-2xl mt-1">?</p>
                         </div>
                    )}
                 </div>

                 <div className={`flex flex-col items-center justify-center w-32 h-20 rounded-xl border-2 shadow-lg transition-all transform ${
                    foundSlots.includes('B') 
                    ? 'bg-green-900/80 border-green-500 scale-105' 
                    : 'bg-black/80 border-purple-800/50'
                 }`}>
                    {foundSlots.includes('B') ? (
                         <div className="text-center">
                             <span className="text-xs text-green-400 font-bold tracking-widest uppercase">Champion B</span>
                             <p className="text-white font-bold text-sm leading-tight mt-1">Found</p>
                         </div>
                    ) : (
                         <div className="text-center">
                             <span className="text-xs text-gray-500 font-bold tracking-widest uppercase">Champion B</span>
                             <p className="text-purple-500/50 font-bold text-2xl mt-1">?</p>
                         </div>
                    )}
                 </div>
            </div>
        </div>

        {/* Spacer for the absolute positioned cards */}
        <div className="h-12" />

        {/* Controls */}
        <div className="w-full max-w-md mt-6 space-y-4">
            {phase === 'won' ? (
                <div className="text-center p-6 bg-green-500/20 rounded-xl border border-green-500/50">
                    <h2 className="text-2xl font-bold text-green-400 mb-2">Victory!</h2>
                    <p>Come back tomorrow for a new fusion.</p>
                </div>
            ) : (
                <div className="relative">
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <input
                                type="text"
                                value={guess}
                                onChange={(e) => setGuess(e.target.value)}
                                placeholder={phase === 'phase1' ? "Guess a Champion..." : "Guess the Theme..."}
                                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                                onKeyDown={(e) => {
                                    if(e.key === 'Enter') handleGuess();
                                }}
                            />
                            {/* Autocomplete Dropdown */}
                            {filteredOptions.length > 0 && (
                                <div className="absolute bottom-full left-0 w-full mb-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl overflow-hidden z-20">
                                    {filteredOptions.map((opt: string) => (
                                        <button
                                            key={opt}
                                            onClick={() => setGuess(opt)}
                                            className="w-full text-left px-4 py-2 hover:bg-gray-700 transition-colors"
                                        >
                                            {opt}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        <button
                            onClick={handleGuess}
                            disabled={loading || !guess}
                            className="px-6 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-bold transition-all"
                        >
                            {loading ? <Loader2 className="animate-spin" /> : 'GUESS'}
                        </button>
                    </div>
                    
                    {/* Give Up Button */}
                    <div className="mt-2 text-center">
                        <button
                            onClick={async () => {
                                if (confirm('Are you sure you want to give up? The solution will be revealed.')) {
                                    const sol = await getSolution();
                                    if (sol) {
                                        setMessage(`Solution: ${sol.champA} + ${sol.champB} (${sol.theme})`);
                                        setPhase('won'); // End game state
                                        setZoomLevel(1.0);
                                        // Save as solved (technically given up, but for now mark as done)
                                        localStorage.setItem('fusion_daily_status', JSON.stringify({
                                            date: initialData?.date,
                                            solved: true
                                        }));
                                    }
                                }
                            }}
                            className="text-xs text-gray-500 hover:text-gray-300 underline transition-colors"
                        >
                            Give Up
                        </button>
                    </div>
                </div>
            )}

            <AnimatePresence>
                {message && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className={`text-center p-3 rounded-lg font-medium ${
                            message.includes('Correct') || message.includes('WON') 
                            ? 'bg-green-500/20 text-green-400' 
                            : 'bg-red-500/20 text-red-400'
                        }`}
                    >
                        {message}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    </div>
  );
}
