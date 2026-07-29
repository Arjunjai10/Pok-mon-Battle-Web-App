import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PokemonSprite from '../components/PokemonSprite';

export default function Profile() {
  const { user, loadTeam, logout, token } = useAuth();
  const navigate = useNavigate();
  const [savedTeam, setSavedTeam] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      navigate('/build');
      return;
    }

    const fetchTeam = async () => {
      try {
        const team = await loadTeam();
        setSavedTeam(team);
      } catch (err) {
        console.error('Failed to load team', err);
      } finally {
        setLoading(false);
      }
    };
    fetchTeam();
  }, [token, loadTeam, navigate]);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-[var(--color-bg-deep)] p-4 sm:p-8 flex flex-col items-center justify-center relative overflow-hidden text-white font-body selection:bg-blue-500 selection:text-white">
      {/* Background Cyber Stadium Lights */}
      <div className="absolute top-1/4 left-1/3 w-96 h-96 bg-blue-600/15 rounded-full filter blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/3 w-96 h-96 bg-purple-600/15 rounded-full filter blur-[120px] pointer-events-none"></div>

      {/* Navigation Header */}
      <div className="w-full max-w-5xl flex justify-between items-center mb-8 z-10">
        <button 
          onClick={() => navigate('/build')}
          className="px-5 py-2.5 bg-slate-900/90 hover:bg-slate-800 border border-white/15 hover:border-blue-400/50 rounded-2xl font-extrabold text-xs uppercase tracking-widest text-slate-300 hover:text-white shadow-lg backdrop-blur-xl transition-all flex items-center gap-2"
        >
          <span>←</span> Return to Roster Lab
        </button>
        <button 
          onClick={handleLogout}
          className="px-5 py-2.5 bg-rose-500/15 hover:bg-rose-500 text-rose-300 hover:text-white border border-rose-500/40 hover:border-rose-400 rounded-2xl font-extrabold text-xs uppercase tracking-widest shadow-lg hover:shadow-[0_0_20px_rgba(244,63,94,0.5)] transition-all flex items-center gap-2"
        >
          <span>🔒</span> Terminate Session
        </button>
      </div>

      {/* Trainer Telemetry Card */}
      <div className="w-full max-w-5xl bg-slate-900/95 border border-white/15 rounded-3xl p-6 sm:p-10 shadow-[0_25px_80px_rgba(0,0,0,0.85)] relative overflow-hidden backdrop-blur-2xl z-10">
        
        {/* Decorative Watermark */}
        <div className="absolute -top-12 -right-12 text-[14rem] opacity-5 pointer-events-none select-none filter blur-[2px]">
          🛡️
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-6 mb-10 border-b border-white/10 pb-8 relative z-10 text-center sm:text-left">
          <div className="w-24 h-24 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-3xl border border-white/25 flex items-center justify-center text-5xl shadow-[0_0_30px_rgba(59,130,246,0.4)] flex-shrink-0 animate-pulse-glow">
            👨‍💻
          </div>
          <div className="flex-1">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 mb-1">
              <h1 className="text-4xl sm:text-5xl font-display font-black text-white uppercase tracking-wider drop-shadow-md">
                {user.username}
              </h1>
              <span className="px-3 py-1 bg-emerald-500/10 border border-emerald-400/40 text-emerald-300 font-extrabold text-[11px] uppercase tracking-widest rounded-full shadow-[0_0_15px_rgba(16,185,129,0.3)]">
                VERIFIED COMPETITOR
              </span>
            </div>
            <p className="text-slate-400 font-extrabold text-sm uppercase tracking-widest font-mono">
              Official eSports Tournament License ID: #{Math.floor(100000 + Math.random() * 900000)}
            </p>
          </div>
        </div>

        {/* Registered Combat Squad Section */}
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
            <h2 className="text-xl font-display font-black text-white uppercase tracking-widest flex items-center gap-3">
              <span className="text-2xl text-amber-400">🏅</span> Active Tournament Roster
            </h2>
            <span className="text-xs font-mono text-slate-400 bg-slate-950 px-3.5 py-1 rounded-full border border-white/10">
              SYNCHRONIZED WITH LAB STORAGE
            </span>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center p-12 bg-slate-950/50 rounded-3xl border border-white/5 gap-4">
              <span className="w-8 h-8 border-4 border-blue-400 border-t-transparent rounded-full animate-spin"></span>
              <span className="text-xs font-extrabold uppercase tracking-widest text-slate-400 font-mono">
                Accessing Competitor Cloud Records...
              </span>
            </div>
          ) : savedTeam && savedTeam.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {savedTeam.map((slot, index) => {
                if (!slot || !slot.pokemon) return null;
                return (
                  <div key={index} className="group bg-slate-950/80 border border-white/10 hover:border-blue-400/50 rounded-2xl p-5 flex flex-col items-center gap-4 hover:-translate-y-1.5 hover:shadow-[0_15px_40px_rgba(0,0,0,0.8)] transition-all relative overflow-hidden">
                    
                    {/* Subtle slot number tag */}
                    <span className="absolute top-3 left-3 text-[10px] font-mono font-black text-slate-600 bg-slate-900 px-2 py-0.5 rounded border border-white/5">
                      SLOT 0{index + 1}
                    </span>

                    <div className="w-28 h-28 flex items-center justify-center relative mt-2 p-2">
                      {/* Ambient circular glow beneath sprite */}
                      <div className="absolute inset-0 bg-blue-500/10 rounded-full filter blur-[20px] group-hover:bg-blue-500/25 transition-all"></div>
                      <PokemonSprite 
                        id={slot.pokemon.id}
                        spriteUrl={slot.pokemon.spriteUrl} 
                        name={slot.pokemon.name}
                        variant="front-gif"
                        animate={true}
                        className="w-full h-full object-contain filter drop-shadow-[0_10px_15px_rgba(0,0,0,0.8)] relative z-10 group-hover:scale-110 transition-transform duration-300"
                      />
                    </div>

                    <div className="text-center w-full pt-2 border-t border-white/10">
                      <div className="font-display font-black text-white text-lg capitalize tracking-wide truncate group-hover:text-blue-300 transition-colors" title={slot.nickname || slot.pokemon.name}>
                        {(slot.nickname || slot.pokemon.name).replace(/-/g, ' ')}
                      </div>
                      <div className="flex items-center justify-center gap-2 mt-2">
                        {slot.pokemon.types && slot.pokemon.types.map((t) => (
                          <span key={t} className="px-2 py-0.5 rounded text-[9px] font-black uppercase text-white tracking-wider border border-white/20" style={{ backgroundColor: `var(--color-type-${t.toLowerCase()})` }}>
                            {t}
                          </span>
                        ))}
                        <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-white/5">
                          {slot.moves.length} MOVES
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-slate-950/60 border border-dashed border-white/15 rounded-3xl p-12 text-center space-y-4">
              <div className="w-16 h-16 mx-auto rounded-3xl bg-slate-900 border border-white/10 flex items-center justify-center text-3xl opacity-60">
                📦
              </div>
              <div>
                <h3 className="text-xl font-display font-black text-white uppercase tracking-wider">No Squad Registered</h3>
                <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1 font-mono">Configure a competitive combat team in the Lab and register it to your license!</p>
              </div>
              <button 
                onClick={() => navigate('/build')}
                className="px-8 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white border border-white/20 rounded-2xl font-display font-black text-xs uppercase tracking-widest shadow-[0_0_25px_rgba(59,130,246,0.5)] hover:shadow-[0_0_40px_rgba(59,130,246,0.8)] hover:-translate-y-0.5 active:translate-y-0 transition-all"
              >
                Assemble Team in Lab
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
