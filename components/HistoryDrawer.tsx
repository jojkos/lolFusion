'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Calendar, Users } from 'lucide-react';
import { getPuzzleHistory, HistoryItem } from '@/app/actions';

import Image from 'next/image';

interface HistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function HistoryDrawer({ isOpen, onClose }: HistoryDrawerProps) {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(false);

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

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 z-[998] backdrop-blur-xs"
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 h-full w-full max-w-md bg-black border-l border-gray-800 z-[999] shadow-2xl overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="p-4 flex items-center justify-between border-b border-gray-800 bg-gray-900/50">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Calendar className="w-5 h-5 text-purple-400" />
                History
              </h2>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-800 rounded-full transition-colors text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {loading ? (
                <div className="flex justify-center p-8">
                  <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : history.length === 0 ? (
                <div className="text-center text-gray-500 p-8">
                  No history available yet.
                </div>
              ) : (
                history.map((item) => (
                  <div key={item.date} className="bg-gray-900 rounded-xl overflow-hidden border border-gray-800 hover:border-purple-500/50 transition-colors">
                    {/* Image Header */}
                    <div className="relative aspect-video">
                        <Image 
                            src={item.imageUrl} 
                            alt={`${item.champA} + ${item.champB}`}
                            fill
                            className="object-cover"
                            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                        />
                        <div className="absolute inset-0 bg-linear-to-t from-black/90 to-transparent flex items-end p-3 z-10">
                             <div className="w-full">
                                <span className="text-xs font-mono text-gray-400 mb-1 block">{item.date}</span>
                                <h3 className="text-lg font-bold text-white leading-tight">
                                    {item.champA} <span className="text-purple-500">+</span> {item.champB}
                                </h3>
                             </div>
                        </div>
                    </div>
                    {/* Footer Info */}
                    <div className="p-3 flex items-center justify-between text-xs bg-gray-950/50">
                        <div className="flex items-center gap-1.5 text-gray-400">
                            <span className="w-2 h-2 rounded-full bg-pink-500"></span>
                            {item.theme}
                        </div>
                        <div className="flex items-center gap-1.5 text-yellow-500 font-medium">
                            <Users className="w-3.5 h-3.5" />
                            {item.totalSolvers.toLocaleString()} solved
                        </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
