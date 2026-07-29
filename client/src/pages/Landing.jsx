import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import AuthModal from "../components/AuthModal.jsx";
import PokemonSprite from "../components/PokemonSprite.jsx";

export default function Landing() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);

  const floatingPokemon = [
    { id: 25, top: '12%', left: '4%', delay: '0s', size: 'w-24 h-24 sm:w-32 sm:h-32', flip: true },         // Pikachu
    { id: 6, top: '14%', right: '5%', delay: '1s', size: 'w-28 h-28 sm:w-40 sm:h-40' },                   // Charizard
    { id: 94, top: '58%', left: '6%', delay: '2s', size: 'w-24 h-24 sm:w-32 sm:h-32', flip: true },       // Gengar
    { id: 143, top: '55%', right: '7%', delay: '0.5s', size: 'w-28 h-28 sm:w-36 sm:h-36' },               // Snorlax
    { id: 150, top: '6%', left: '26%', delay: '1.5s', size: 'w-32 h-32', flip: true, hiddenSm: true },    // Mewtwo
    { id: 149, top: '8%', right: '26%', delay: '2.5s', size: 'w-32 h-32', hiddenSm: true },               // Dragonite
    { id: 9, top: '82%', left: '22%', delay: '0.8s', size: 'w-32 h-32', flip: true, hiddenSm: true },     // Blastoise
    { id: 3, top: '78%', right: '22%', delay: '1.2s', size: 'w-32 h-32', hiddenSm: true },                // Venusaur
    { id: 130, top: '34%', left: '-1%', delay: '3s', size: 'w-36 h-36', flip: true, hiddenSm: true },     // Gyarados
    { id: 144, top: '24%', right: '38%', delay: '0.2s', size: 'w-28 h-28', hiddenSm: true },              // Articuno
    { id: 145, top: '84%', right: '38%', delay: '1.8s', size: 'w-28 h-28', flip: true, hiddenSm: true },  // Zapdos
    { id: 65, top: '68%', right: '4%', delay: '2.2s', size: 'w-24 h-24' },                              // Alakazam
    { id: 68, top: '38%', left: '12%', delay: '1.1s', size: 'w-28 h-28', flip: true },                  // Machamp
    { id: 131, top: '44%', right: '14%', delay: '0.7s', size: 'w-32 h-32' },                            // Lapras
  ];

  return (
    <div className="min-h-[100dvh] flex flex-col font-body bg-[var(--color-bg-deep)] text-white overflow-x-hidden relative selection:bg-blue-500 selection:text-white">
      
      {/* Ambient Radial Illumination */}
      <div className="fixed top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-600/15 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="fixed bottom-1/4 right-1/4 w-[450px] h-[450px] bg-purple-600/10 rounded-full blur-[100px] pointer-events-none"></div>

      {/* Header */}
      <header className="relative z-30 flex justify-between items-center px-6 py-4 bg-slate-950/80 backdrop-blur-xl border-b border-white/10 shadow-[0_4px_30px_rgba(0,0,0,0.6)]">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
          <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-red-600 to-red-500 border-2 border-white shadow-[0_0_15px_rgba(239,68,68,0.8)] flex items-center justify-center animate-pulse">
            <div className="w-3.5 h-3.5 rounded-full bg-white border border-slate-900 shadow"></div>
          </div>
          <span className="font-display font-black tracking-wider uppercase text-white drop-shadow-md text-xl bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text">
            PokéWeb Arena
          </span>
        </div>
        
        <div>
          {user ? (
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/profile')}
                className="flex items-center gap-2.5 px-4 py-2 bg-slate-900/90 border border-blue-500/40 rounded-xl hover:border-blue-400 hover:shadow-[0_0_20px_rgba(59,130,246,0.3)] transition-all"
              >
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></div>
                <span className="text-white font-extrabold text-sm tracking-wide">
                  Trainer <span className="text-blue-400">{user.username}</span>
                </span>
              </button>
            </div>
          ) : (
            <button 
              onClick={() => setShowAuthModal(true)}
              className="px-5 py-2.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 text-white font-black uppercase text-xs tracking-widest rounded-xl border border-white/20 shadow-[0_0_20px_rgba(59,130,246,0.4)] hover:shadow-[0_0_30px_rgba(6,182,212,0.7)] hover:-translate-y-0.5 active:translate-y-0 transition-all"
            >
              Login / Register
            </button>
          )}
        </div>
      </header>

      {/* Hero Section */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 text-center py-24 md:py-32 overflow-hidden">
        
        {/* Floating Animated Showdown Pokémon */}
        {floatingPokemon.map((p, i) => (
          <div
            key={i}
            className={`absolute opacity-85 pointer-events-none transition-transform duration-700 ${p.size} ${p.hiddenSm ? 'hidden lg:block' : ''}`}
            style={{
              top: p.top,
              left: p.left,
              right: p.right,
              animation: `float 4s ease-in-out infinite`,
              animationDelay: p.delay,
              transform: p.flip ? 'scaleX(-1)' : 'none',
              zIndex: 0,
            }}
          >
            <PokemonSprite
              id={p.id}
              variant="front-gif"
              className="w-full h-full object-contain filter drop-shadow-[0_8px_12px_rgba(0,0,0,0.6)]"
            />
          </div>
        ))}

        {/* Hero Title Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-400/30 text-blue-300 font-extrabold text-xs uppercase tracking-widest mb-6 shadow-[0_0_20px_rgba(59,130,246,0.2)] animate-fade-in">
          <span className="text-amber-400">⚡</span> Gen 1 Real-Time Multiplayer eSports Engine
        </div>

        {/* Title */}
        <h1 className="text-5xl sm:text-7xl md:text-8xl lg:text-9xl font-display font-black uppercase tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-white via-slate-100 to-slate-300 drop-shadow-[0_10px_20px_rgba(0,0,0,0.8)] mb-6 max-w-6xl leading-none z-10">
          Pokémon <br/>
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-amber-400 to-orange-500 drop-shadow-[0_10px_25px_rgba(245,158,11,0.35)]">
            Battle Web
          </span>
        </h1>
        
        <p className="text-lg sm:text-xl md:text-2xl font-extrabold text-slate-300 drop-shadow-[0_4px_10px_rgba(0,0,0,0.9)] max-w-2xl mb-12 z-10 leading-relaxed">
          Craft your competitive Kanto lineup with authentic stats and clash in live PvP multiplayer battles!
        </p>
        
        {/* Play Now Button */}
        <button 
          onClick={() => navigate('/build')}
          className="group relative px-12 py-5 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white font-display font-black text-2xl sm:text-3xl uppercase tracking-widest rounded-3xl border border-white/30 shadow-[0_0_35px_rgba(79,70,229,0.6)] hover:shadow-[0_0_55px_rgba(79,70,229,0.9)] hover:-translate-y-1 active:translate-y-0.5 transition-all overflow-hidden z-20"
        >
          <span className="relative z-10 flex items-center gap-3">
            <span>Enter Battle Arena</span>
            <span className="group-hover:translate-x-2 transition-transform duration-200">➔</span>
          </span>
          <div className="absolute inset-0 h-full w-full bg-gradient-to-r from-transparent via-white/20 to-transparent transform -skew-x-12 -translate-x-full group-hover:animate-shine"></div>
        </button>
      </main>

      {/* Features Section */}
      <section className="relative z-20 bg-slate-950/90 border-t border-white/10 py-24 px-6 backdrop-blur-lg">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-display font-black uppercase tracking-wider text-white mb-3">
              Built For Competitive Play
            </h2>
            <p className="text-slate-400 font-bold max-w-xl mx-auto text-sm sm:text-base">
              Engineered with zero-latency websockets, official Gen 1 damage mathematics, and state-of-the-art Showdown animations.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            
            <div className="glass-card p-8 rounded-3xl group hover:border-amber-400/60 transition-all duration-300">
              <div className="w-14 h-14 bg-amber-400/10 border border-amber-400/30 rounded-2xl flex items-center justify-center text-3xl mb-6 shadow-[0_0_20px_rgba(245,158,11,0.2)] group-hover:scale-110 transition-transform">
                ⚡
              </div>
              <h3 className="text-2xl font-display font-black uppercase text-white mb-3 tracking-wide">Original 151</h3>
              <p className="text-slate-300 font-medium leading-relaxed text-sm">
                Experience authentic Kanto battles using the original generation of Pokémon with curated competitive held items and historic move mechanics.
              </p>
            </div>

            <div className="glass-card p-8 rounded-3xl group hover:border-red-400/60 transition-all duration-300">
              <div className="w-14 h-14 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center justify-center text-3xl mb-6 shadow-[0_0_20px_rgba(239,68,68,0.2)] group-hover:scale-110 transition-transform">
                ⚔️
              </div>
              <h3 className="text-2xl font-display font-black uppercase text-white mb-3 tracking-wide">Real-Time PvP</h3>
              <p className="text-slate-300 font-medium leading-relaxed text-sm">
                Challenge friends instantly via secure room codes or public lobbies in seamless multiplayer matches powered by Socket.io.
              </p>
            </div>

            <div className="glass-card p-8 rounded-3xl group hover:border-blue-400/60 transition-all duration-300">
              <div className="w-14 h-14 bg-blue-500/10 border border-blue-500/30 rounded-2xl flex items-center justify-center text-3xl mb-6 shadow-[0_0_20px_rgba(59,130,246,0.2)] group-hover:scale-110 transition-transform">
                💾
              </div>
              <h3 className="text-2xl font-display font-black uppercase text-white mb-3 tracking-wide">Cloud Roster</h3>
              <p className="text-slate-300 font-medium leading-relaxed text-sm">
                Register a trainer profile to securely save your carefully curated tournament teams and load them automatically across any device.
              </p>
            </div>

          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-20 bg-slate-950 border-t border-white/10 text-slate-400 text-center py-8 px-4 text-xs font-bold uppercase tracking-widest">
        <p className="max-w-xl mx-auto leading-relaxed">
          Pokémon Battle Web App eSports Engine • Built for Competitive Gen 1 Battling
        </p>
      </footer>

      {showAuthModal && (
        <AuthModal onClose={() => setShowAuthModal(false)} />
      )}

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes shine {
          100% { transform: translateX(100%) skew(-12deg); }
        }
        .animate-shine {
          animation: shine 2s infinite;
        }
      `}} />
    </div>
  );
}
