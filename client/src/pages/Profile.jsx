import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

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
    <div className="min-h-screen bg-[var(--color-bg-deep)] p-4 sm:p-8 flex flex-col items-center">
      {/* Header */}
      <div className="w-full max-w-4xl flex justify-between items-center mb-8">
        <button 
          onClick={() => navigate('/build')}
          className="px-4 py-2 bg-white border-4 border-[var(--color-border)] rounded-xl font-black uppercase tracking-widest text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] hover:border-[var(--color-primary)] shadow-[0_4px_0_var(--color-border)] hover:-translate-y-1 hover:shadow-[0_6px_0_var(--color-primary)] active:translate-y-1 active:shadow-none transition-all"
        >
          ← Back to Lab
        </button>
        <button 
          onClick={handleLogout}
          className="px-4 py-2 bg-[var(--color-danger)] text-white border-4 border-red-700 rounded-xl font-black uppercase tracking-widest shadow-[0_4px_0_#991b1b] hover:-translate-y-1 hover:shadow-[0_6px_0_#991b1b] active:translate-y-1 active:shadow-none transition-all"
        >
          Logout
        </button>
      </div>

      {/* Profile Card */}
      <div className="w-full max-w-4xl bg-white border-4 border-[var(--color-text-primary)] rounded-3xl p-8 shadow-[0_12px_0_var(--color-text-primary)] relative overflow-hidden">
        {/* Background Decor */}
        <div className="absolute -top-10 -right-10 text-[10rem] opacity-5 pointer-events-none select-none">
          ⭐
        </div>

        <div className="flex items-center gap-6 mb-10 border-b-4 border-dashed border-[var(--color-border)] pb-8 relative z-10">
          <div className="w-24 h-24 bg-[var(--color-primary)] rounded-full border-4 border-[var(--color-text-primary)] flex items-center justify-center text-5xl shadow-[0_6px_0_var(--color-text-primary)]">
            👦
          </div>
          <div>
            <h1 className="text-4xl font-display font-black text-[var(--color-text-primary)] uppercase tracking-widest drop-shadow-sm">
              {user.username}
            </h1>
            <p className="text-[var(--color-text-secondary)] font-bold text-lg mt-1 uppercase tracking-wider">
              Pokémon Trainer
            </p>
          </div>
        </div>

        {/* Team Section */}
        <div className="relative z-10">
          <h2 className="text-2xl font-black text-[var(--color-accent)] uppercase tracking-widest drop-shadow-sm mb-6 flex items-center gap-3">
            <span className="text-3xl drop-shadow-md">🏆</span> Registered Team
          </h2>

          {loading ? (
            <div className="flex justify-center p-8 animate-pulse text-[var(--color-text-muted)] font-bold uppercase tracking-widest">
              Accessing PC...
            </div>
          ) : savedTeam && savedTeam.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {savedTeam.map((slot, index) => {
                if (!slot) return null;
                return (
                  <div key={index} className="bg-[var(--color-bg-panel)] border-4 border-[var(--color-border)] rounded-2xl p-4 flex flex-col items-center gap-3 hover:-translate-y-1 hover:shadow-[0_6px_0_var(--color-border)] transition-all">
                    <div className="relative">
                      <div className="absolute inset-0 bg-white rounded-full scale-110 shadow-inner"></div>
                      <img 
                        src={slot.pokemon.spriteUrl} 
                        alt={slot.pokemon.name} 
                        className="w-20 h-20 object-contain drop-shadow-xl relative z-10 hover:animate-float"
                      />
                    </div>
                    <div className="text-center w-full">
                      <div className="font-black text-[var(--color-text-primary)] text-lg uppercase tracking-wider truncate" title={slot.nickname}>
                        {slot.nickname}
                      </div>
                      <div className="text-xs font-bold text-[var(--color-text-muted)] mt-1 uppercase">
                        {slot.moves.length} Moves
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-[var(--color-bg-panel)] border-4 border-dashed border-[var(--color-border)] rounded-2xl p-12 text-center">
              <div className="text-4xl mb-4 opacity-50">❌</div>
              <h3 className="text-xl font-black text-[var(--color-text-secondary)] uppercase tracking-wider">No Team Registered</h3>
              <p className="text-[var(--color-text-muted)] font-bold mt-2">Head back to the lab to build and save your team!</p>
              <button 
                onClick={() => navigate('/build')}
                className="mt-6 px-6 py-3 bg-[var(--color-primary)] text-white border-4 border-blue-700 rounded-xl font-black uppercase tracking-widest shadow-[0_4px_0_#1d4ed8] hover:-translate-y-1 hover:shadow-[0_6px_0_#1d4ed8] active:translate-y-1 active:shadow-none transition-all"
              >
                Build Team
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
