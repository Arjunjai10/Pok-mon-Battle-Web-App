import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import AuthModal from "../components/AuthModal.jsx";

export default function Landing() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);

  return (
    <div className="min-h-[100dvh] flex flex-col font-body bg-[var(--color-bg-deep)] overflow-x-hidden">
      
      {/* Dynamic Background Pattern */}
      <div className="fixed inset-0 pointer-events-none opacity-20 bg-[radial-gradient(ellipse_at_center,_#ffffff_0%,_transparent_70%)]"></div>
      <div className="fixed inset-0 pointer-events-none bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPgo8cmVjdCB3aWR0aD0iOCIgaGVpZ2h0PSI4IiBmaWxsPSJ0cmFuc3BhcmVudCIvPgo8Y2lyY2xlIGN4PSI0IiBjeT0iNCIgcj0iMiIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjA1KSIvPgo8L3N2Zz4=')] opacity-50"></div>

      {/* Header */}
      <header className="relative z-10 flex justify-between items-center px-6 py-4 bg-[var(--color-bg-deep)] border-b-4 border-[var(--color-text-primary)] shadow-[0_4px_0_var(--color-text-primary)]">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-[var(--color-danger)] border-2 border-white animate-pulse shadow-[0_0_15px_var(--color-danger)]"></div>
          <span className="font-black tracking-widest uppercase text-white drop-shadow-md text-xl">PokéWeb</span>
        </div>
        
        <div>
          {user ? (
            <div className="flex items-center gap-4">
              <span className="text-white font-bold drop-shadow-md cursor-pointer hover:underline" onClick={() => navigate('/profile')}>
                Trainer {user.username}
              </span>
            </div>
          ) : (
            <button 
              onClick={() => setShowAuthModal(true)}
              className="px-4 py-2 bg-white text-[var(--color-primary)] font-black uppercase tracking-wider rounded-xl border-4 border-[var(--color-text-primary)] shadow-[0_4px_0_var(--color-text-primary)] hover:-translate-y-1 hover:shadow-[0_6px_0_var(--color-text-primary)] active:translate-y-1 active:shadow-none transition-all"
            >
              Login / Register
            </button>
          )}
        </div>
      </header>

      {/* Hero Section */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 text-center py-20">
        
        {/* Title */}
        <h1 className="text-6xl md:text-8xl font-black text-white uppercase tracking-tighter drop-shadow-[0_8px_0_rgba(0,0,0,0.4)] mb-6 animate-bounce" style={{ WebkitTextStroke: '3px black' }}>
          Pokémon <br/> Battle Web
        </h1>
        
        <p className="text-xl md:text-2xl font-bold text-yellow-300 drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)] max-w-2xl mb-12">
          Build your ultimate Gen 1 team and battle trainers worldwide in real-time multiplayer!
        </p>
        
        {/* Play Button */}
        <button 
          onClick={() => navigate('/build')}
          className="group relative px-12 py-6 bg-[var(--color-primary)] text-white font-black text-3xl uppercase tracking-widest rounded-3xl border-8 border-white shadow-[0_12px_0_rgba(255,255,255,0.4)] hover:-translate-y-2 hover:shadow-[0_16px_0_rgba(255,255,255,0.4)] hover:bg-blue-400 active:translate-y-2 active:shadow-none transition-all overflow-hidden"
        >
          <span className="relative z-10">Play Now</span>
          <div className="absolute inset-0 h-full w-full bg-white/20 transform -skew-x-12 -translate-x-full group-hover:animate-shine"></div>
        </button>

      </main>

      {/* Features Section */}
      <section className="relative z-10 bg-white border-t-8 border-[var(--color-text-primary)] py-16 px-6">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
          
          <div className="bg-gradient-to-br from-yellow-300 to-yellow-500 p-8 rounded-3xl border-8 border-[var(--color-text-primary)] shadow-[0_8px_0_var(--color-text-primary)] transform hover:-translate-y-2 transition-transform">
            <div className="w-16 h-16 bg-white rounded-full border-4 border-[var(--color-text-primary)] flex items-center justify-center text-4xl mb-4 shadow-inner">⚡</div>
            <h3 className="text-2xl font-black uppercase text-[var(--color-text-primary)] mb-2">Original 151</h3>
            <p className="text-[var(--color-text-secondary)] font-bold leading-relaxed">Experience classic battles using the original generation of Pokémon, complete with authentic stats and movesets.</p>
          </div>

          <div className="bg-gradient-to-br from-red-400 to-red-600 p-8 rounded-3xl border-8 border-[var(--color-text-primary)] shadow-[0_8px_0_var(--color-text-primary)] transform hover:-translate-y-2 transition-transform">
            <div className="w-16 h-16 bg-white rounded-full border-4 border-[var(--color-text-primary)] flex items-center justify-center text-4xl mb-4 shadow-inner">⚔️</div>
            <h3 className="text-2xl font-black uppercase text-white mb-2" style={{ WebkitTextStroke: '1px black' }}>Real-time PvP</h3>
            <p className="text-white font-bold leading-relaxed">Challenge your friends or random opponents in seamless, real-time multiplayer battles powered by Socket.io.</p>
          </div>

          <div className="bg-gradient-to-br from-blue-400 to-blue-600 p-8 rounded-3xl border-8 border-[var(--color-text-primary)] shadow-[0_8px_0_var(--color-text-primary)] transform hover:-translate-y-2 transition-transform">
            <div className="w-16 h-16 bg-white rounded-full border-4 border-[var(--color-text-primary)] flex items-center justify-center text-4xl mb-4 shadow-inner">💾</div>
            <h3 className="text-2xl font-black uppercase text-white mb-2" style={{ WebkitTextStroke: '1px black' }}>Save Teams</h3>
            <p className="text-white font-bold leading-relaxed">Create an account to securely save your carefully crafted teams and load them instantly on any device.</p>
          </div>

        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 bg-[var(--color-text-primary)] text-white text-center py-6 font-bold">
        <p>Built for the Pokémon Battle Web App. Ready to become a Pokémon Master?</p>
      </footer>

      {showAuthModal && (
        <AuthModal onClose={() => setShowAuthModal(false)} />
      )}

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes shine {
          100% { transform: translateX(100%) skew(-12deg); }
        }
        .animate-shine {
          animation: shine 1.5s infinite;
        }
      `}} />
    </div>
  );
}
