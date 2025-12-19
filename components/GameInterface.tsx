'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { Loader2, History } from 'lucide-react';
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
  const [revealedNames, setRevealedNames] = useState<{ A: string | null; B: string | null }>({ A: null, B: null });

  const [globalStats, setGlobalStats] = useState<{ distribution: Record<string, unknown>, total: number } | null>(null);
  
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

  // Autocomplete Logic
  const options = phase === 'phase1' ? championsList : THEMES;
  
  // Filter out wrong guesses from options
  const availableOptions = options.filter(opt => !wrongGuesses.includes(opt));

  const filteredOptions = guess === '' 
    ? [] 
    : availableOptions.filter((opt: string) =>
        opt.toLowerCase().includes(guess.toLowerCase())
      ).slice(0, 5);
  
  const canOpenFullImage = zoomLevel <= 1.0;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        // Immediate submission logic
        if (guess && filteredOptions.length > 0 && !options.includes(guess)) {
             // Submit the first option immediately
             handleGuess(filteredOptions[0]);
             return;
        }
        handleGuess();
    }
  };

  return (
    <div className="flex flex-col items-center gap-2 md:gap-4 w-full max-w-4xl mx-auto p-2 md:p-4">
        {/* Header */}
        <div className="text-center space-y-1 md:space-y-2">
            <h1 className="text-2xl md:text-3xl font-bold bg-linear-to-r from-purple-400 to-pink-600 bg-clip-text text-transparent">
                LoL FUSION
            </h1>
            <p className="text-gray-400">
                {phase === 'phase1' 
                    ? 'Identify the two fused champions.' 
                    : 'Identify the Skin Universe.'}
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
            <div className="relative overflow-hidden rounded-2xl border-4 border-purple-900/50 shadow-2xl shadow-purple-900/20 bg-black aspect-square">
                <canvas 
                    ref={canvasRef}
                    onClick={() => {
                        if (canOpenFullImage && initialData) {
                            window.open(initialData.imageUrl, '_blank');
                        }
                    }}
                    className={`block w-full h-full object-cover transition-all duration-700 ease-out ${
                        canOpenFullImage ? 'cursor-pointer hover:opacity-90' : ''
                    }`}
                />
                {!imageLoaded && (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <Loader2 className="w-12 h-12 text-purple-500 animate-spin" />
                    </div>
                )}
            </div>
            
            {/* Status Indicators (Cards) */}
            <div className="absolute -bottom-14 md:-bottom-16 left-1/2 -translate-x-1/2 flex gap-2 md:gap-4 w-full justify-center px-4">
                 <motion.div 
                    animate={foundSlots.includes('A') ? { scale: [1, 1.1, 1] } : {}}
                    transition={{ duration: 0.5 }}
                    className={`flex flex-col items-center justify-center w-24 h-16 md:w-32 md:h-20 rounded-xl border-2 shadow-lg transition-all transform ${
                    foundSlots.includes('A') 
                    ? 'bg-green-900/80 border-green-500' 
                    : 'bg-black/80 border-purple-800/50'
                 }`}>
                    {foundSlots.includes('A') || revealedNames.A ? (
                         <div className="text-center">
                            <span className="text-xs text-green-400 font-bold tracking-widest uppercase">Champion A</span>
                            <p className="text-white font-bold text-sm leading-tight mt-1">
                                {revealedNames.A || 'Found'}
                            </p>
                         </div>
                    ) : (
                         <div className="text-center">
                            <span className="text-xs text-gray-500 font-bold tracking-widest uppercase">Champion A</span>
                            <p className="text-purple-500/50 font-bold text-xl md:text-2xl mt-1">?</p>
                         </div>
                    )}
                 </motion.div>

                 <motion.div 
                    animate={foundSlots.includes('B') ? { scale: [1, 1.1, 1] } : {}}
                    transition={{ duration: 0.5 }}
                    className={`flex flex-col items-center justify-center w-24 h-16 md:w-32 md:h-20 rounded-xl border-2 shadow-lg transition-all transform ${
                    foundSlots.includes('B') 
                    ? 'bg-green-900/80 border-green-500' 
                    : 'bg-black/80 border-purple-800/50'
                 }`}>
                    {foundSlots.includes('B') || revealedNames.B ? (
                         <div className="text-center">
                             <span className="text-xs text-green-400 font-bold tracking-widest uppercase">Champion B</span>
                             <p className="text-white font-bold text-sm leading-tight mt-1">
                                {revealedNames.B || 'Found'}
                             </p>
                         </div>
                    ) : (
                         <div className="text-center">
                             <span className="text-xs text-gray-500 font-bold tracking-widest uppercase">Champion B</span>
                             <p className="text-purple-500/50 font-bold text-xl md:text-2xl mt-1">?</p>
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
                    <div className={`text-center p-6 rounded-xl border shadow-xl ${
                        givenUp 
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
                             
                             <div className="flex items-end justify-center h-48 mb-2 px-2 gap-px">
                                 {(() => {
                                      // Calculate dynamic max range
                                      const distributionKeys = Object.keys(globalStats.distribution).map(Number);
                                      const maxKey = Math.max(...distributionKeys, 0);
                                      // Ensure range covers the user's attempts and at least a reasonable baseline (e.g. 6 or 8)
                                      const rangeMax = Math.max(maxKey, attempts, 8);
                                      
                                      return Array.from({ length: rangeMax }, (_, i) => i + 1).map((attemptCount) => {
                                          // Get value or 0
                                      const numUsers = Number(globalStats.distribution[attemptCount] || 0);
                                      const maxVal = Math.max(...Object.values(globalStats.distribution).map(n => Number(n))) || 1;
                                      const isMyScore = attemptCount === attempts;
                                                                           
                                      // Calculate height relative to max
                                      // Min height 0 for empty ones? No, user wants histogram.
                                      // If 0, height 0.
                                      const percentage = numUsers === 0 ? 0 : Math.max(5, (numUsers / maxVal) * 100); 
                                      
                                      return (
                                          <div key={attemptCount} className="group flex-1 flex flex-col items-center gap-1 h-full justify-end">
                                              {/* Count Label (Top - Only show if > 0 or hovered) */}
                                              <div className={`text-[10px] font-mono mb-1 transition-opacity ${
                                                    numUsers > 0 ? (isMyScore ? 'opacity-100 font-bold text-green-400' : 'opacity-0 group-hover:opacity-100 text-gray-300') : 'opacity-0'
                                              }`}>
                                                  {numUsers}
                                              </div>
                                              
                                              {/* Bar */}
                                              <div className="w-full relative flex items-end" style={{ height: '100%' }}>
                                                  <div 
                                                      className={`w-full rounded-t-sm transition-all duration-1000 ease-out ${
                                                          isMyScore 
                                                              ? 'bg-linear-to-t from-green-600 to-green-400 shadow-[0_0_15px_rgba(34,197,94,0.3)] z-10' 
                                                              : 'bg-linear-to-t from-gray-700 to-gray-600 hover:from-gray-600 hover:to-gray-500'
                                                      }`} 
                                                      style={{ height: `${percentage}%` }}
                                                  />
                                              </div>

                                              {/* X-Axis Label (Bottom) */}
                                              <div className={`text-[10px] font-mono border-t border-gray-700 w-full text-center pt-2 ${
                                                    isMyScore ? 'text-green-400 font-bold' : 'text-gray-600'
                                              }`}>
                                                  {attemptCount}
                                              </div>
                                          </div>
                                      );
                                 })})()}
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
                        <div className="relative flex-1">
                            <input
                                type="text"
                                value={guess}
                                onChange={(e) => setGuess(e.target.value)}
                                placeholder={phase === 'phase1' ? "Guess a Champion..." : "Guess the Theme..."}
                                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 md:py-3 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                                onKeyDown={handleKeyDown}
                            />
                            {/* Autocomplete Dropdown */}
                            {filteredOptions.length > 0 && (
                                <div className="absolute bottom-full left-0 w-full mb-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl overflow-hidden z-20">
                                    {filteredOptions.map((opt: string, idx: number) => (
                                        <button
                                            key={opt}
                                            onClick={() => {
                                                setGuess(opt);
                                                handleGuess(opt); // Immediate submit
                                            }}
                                            className={`w-full text-left px-4 py-2 hover:bg-gray-700 transition-colors ${
                                                idx === 0 ? 'bg-gray-700' : ''
                                            }`}
                                        >
                                            {opt}
                                            {idx === 0 && <span className="float-right text-xs text-gray-400 opacity-50">Enter</span>}
                                        </button>
                                    ))}
                                </div>
                            )}
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
                    {wrongGuesses.slice().reverse().map((wrongGuess) => (
                        <div key={wrongGuess} className="flex items-center justify-between p-3 bg-red-900/20 border border-red-900/50 rounded-lg text-red-200 animate-in slide-in-from-top-2">
                            <span className="font-medium">{wrongGuess}</span>
                            <span className="text-red-500/50 text-xs">Incorrect</span>
                        </div>
                    ))}
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
                                    const newRevealed = { A: sol.champA, B: sol.champB };
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
