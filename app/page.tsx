import GameInterface from '@/components/GameInterface';
import { getDailyPuzzle } from './actions';

export const revalidate = 0; // Ensure fresh data on navigation (or use specific revalidation for the puzzle key)
// Actually, for a daily puzzle, we might cache it, but let's keep it dynamic for now to easier debugging/updates.

export default async function Home() {
  const puzzle = await getDailyPuzzle();

  return (
    <main className="min-h-screen bg-black text-white selection:bg-purple-500/30">
      <div className="absolute inset-0 bg-[url('https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Pantheon_0.jpg')] bg-cover bg-center opacity-20 pointer-events-none" />
      <div className="absolute inset-0 bg-linear-to-b from-black via-purple-900/10 to-black pointer-events-none" />
      
      <div className="relative z-10 pt-2 md:pt-4">
        {!puzzle ? (
            <div className="flex flex-col items-center justify-center h-[80vh] text-center p-4">
                <h1 className="text-4xl font-bold bg-linear-to-r from-purple-400 to-pink-600 bg-clip-text text-transparent mb-4">
                    LoL FUSION
                </h1>
                <p className="text-gray-400 mb-8 max-w-md">
                    The daily fusion generation is pending. Please check back later or trigger the generator if you are an admin.
                </p>
                <div className="px-4 py-2 bg-gray-900 rounded-lg text-sm text-gray-500 font-mono">
                    System: No Daily Puzzle Found
                </div>
            </div>
        ) : (
            <GameInterface initialData={puzzle} />
        )}
      </div>
      
      <footer className="relative text-center py-8 text-xs text-gray-600">
        <p>LoL Fusion is a fan project. Not affiliated with Riot Games.</p>
      </footer>
    </main>
  );
}
