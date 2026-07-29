import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function AuthModal({ onClose }) {
  const { login, register } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        await login(username, password);
      } else {
        await register(username, password);
      }
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-fade-in">
      <div className="bg-slate-900/95 border border-white/20 rounded-3xl p-6 sm:p-8 max-w-sm w-full shadow-[0_25px_70px_rgba(0,0,0,0.8)] relative backdrop-blur-xl animate-scale-in">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-800/80 border border-white/10 flex items-center justify-center text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-all font-bold"
          aria-label="Close"
        >
          ✕
        </button>
        
        <h2 className="text-2xl font-display font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400 text-center mb-6 uppercase tracking-widest drop-shadow">
          {isLogin ? 'Trainer Login' : 'New Trainer'}
        </h2>

        {error && (
          <div className="bg-red-500/15 text-red-400 border border-red-500/30 rounded-2xl p-3.5 mb-4 text-xs font-bold text-center animate-fade-in shadow-inner">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-[11px] font-black text-slate-300 uppercase tracking-widest mb-1.5 ml-1">Username</label>
            <input 
              type="text" 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-slate-950/80 border border-white/15 rounded-2xl px-4 py-3 font-bold text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm shadow-inner"
              placeholder="e.g. Red / Cynthia"
              required
            />
          </div>
          
          <div>
            <label className="block text-[11px] font-black text-slate-300 uppercase tracking-widest mb-1.5 ml-1">Password</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-slate-950/80 border border-white/15 rounded-2xl px-4 py-3 font-bold text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm shadow-inner"
              placeholder="••••••••"
              required
            />
          </div>

          <button 
            type="submit"
            disabled={loading}
            className="w-full mt-2 bg-gradient-to-r from-amber-400 to-yellow-500 border border-yellow-300 text-slate-950 font-black uppercase tracking-widest py-3.5 rounded-2xl transition-all shadow-[0_0_20px_rgba(245,158,11,0.3)] hover:shadow-[0_0_30px_rgba(245,158,11,0.6)] hover:from-amber-300 hover:to-yellow-400 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none text-sm"
          >
            {loading ? 'Processing...' : (isLogin ? 'Login to Pokédex' : 'Create Account')}
          </button>
        </form>

        <div className="mt-6 text-center pt-4 border-t border-white/10">
          <button 
            type="button"
            onClick={() => { setIsLogin(!isLogin); setError(''); }}
            className="text-xs font-extrabold text-slate-400 hover:text-blue-400 tracking-wider transition-colors"
          >
            {isLogin ? "No Trainer Card? Register Here" : "Already Registered? Login Here"}
          </button>
        </div>
      </div>
    </div>
  );
}
