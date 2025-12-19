export default function BuyMeCoffee() {
  return (
    <a
      href="https://buymeacoffee.com/jojkos"
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-5 right-5 z-[1000] flex items-center gap-2 px-5 py-3 
                 bg-linear-to-br from-[#FFDD00] to-[gold] 
                 text-[#1a1a2e] font-bold text-sm rounded-xl 
                 shadow-[0_8px_20px_rgba(255,221,0,0.3)] 
                 hover:scale-105 active:scale-95 transition-all duration-300 ease-out
                 font-sans"
    >
      <span className="text-lg">☕</span>
      Buy Me a Coffee
    </a>
  );
}
