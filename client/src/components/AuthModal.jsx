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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[var(--color-bg-deep)]/80 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white border-4 border-[var(--color-text-primary)] rounded-3xl p-6 sm:p-8 max-w-sm w-full shadow-[0_10px_0_var(--color-text-primary)] animate-bounce-in relative">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-[var(--color-text-muted)] hover:text-[var(--color-danger)] font-black text-xl transition-colors"
        >
          ✕
        </button>
        
        <h2 className="text-3xl font-display font-black text-[var(--color-primary)] text-center mb-6 uppercase tracking-widest drop-shadow-sm">
          {isLogin ? 'Trainer Login' : 'New Trainer'}
        </h2>

        {error && (
          <div className="bg-red-50 text-[var(--color-danger)] border-2 border-[var(--color-danger)] rounded-xl p-3 mb-4 text-sm font-bold text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-xs font-black text-[var(--color-text-secondary)] uppercase tracking-widest mb-1">Username</label>
            <input 
              type="text" 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-[var(--color-bg-panel)] border-4 border-[var(--color-border)] rounded-2xl px-4 py-3 font-bold text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary)] transition-colors"
              placeholder="AshKetchum"
              required
            />
          </div>
          
          <div>
            <label className="block text-xs font-black text-[var(--color-text-secondary)] uppercase tracking-widest mb-1">Password</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[var(--color-bg-panel)] border-4 border-[var(--color-border)] rounded-2xl px-4 py-3 font-bold text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary)] transition-colors"
              placeholder="••••••••"
              required
            />
          </div>

          <button 
            type="submit"
            disabled={loading}
            className="w-full mt-2 bg-[var(--color-accent)] border-4 border-[#ca8a04] text-black font-black uppercase tracking-widest py-3 rounded-2xl transition-all shadow-[0_6px_0_#ca8a04] hover:-translate-y-1 hover:shadow-[0_8px_0_#ca8a04] active:translate-y-2 active:shadow-none disabled:opacity-50 disabled:transform-none disabled:shadow-none"
          >
            {loading ? 'Processing...' : (isLogin ? 'Login' : 'Register')}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button 
            type="button"
            onClick={() => { setIsLogin(!isLogin); setError(''); }}
            className="text-xs font-bold text-[var(--color-text-muted)] hover:text-[var(--color-primary)] uppercase tracking-wider transition-colors"
          >
            {isLogin ? "Don't have an account? Register" : "Already a trainer? Login"}
          </button>
        </div>
      </div>
    </div>
  );
}
