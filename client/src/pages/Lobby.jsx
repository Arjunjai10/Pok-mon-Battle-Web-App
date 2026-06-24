import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useSocket } from "../context/SocketContext";

export default function Lobby() {
  const navigate = useNavigate();
  const { socket, isConnected } = useSocket();
  const [team, setTeam] = useState(null);
  
  const [joinCode, setJoinCode] = useState("");
  const [isWaiting, setIsWaiting] = useState(false);
  const [myCode, setMyCode] = useState(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [vsData, setVsData] = useState(null);

  const [showWakeMessage, setShowWakeMessage] = useState(false);

  // Refs for VS Screen skip
  const vsTimeoutRef = useRef(null);
  const battleStateRef = useRef(null);
  const battleKeyRef = useRef(null);

  // If not connected after 2 seconds, show the wake message
  useEffect(() => {
    if (isConnected) {
      setShowWakeMessage(false);
      return;
    }
    const timer = setTimeout(() => {
      setShowWakeMessage(true);
    }, 2000);
    return () => clearTimeout(timer);
  }, [isConnected]);

  // Load team from sessionStorage on mount
  useEffect(() => {
    const saved = sessionStorage.getItem("poke-team-final");
    if (!saved) {
      navigate("/");
      return;
    }
    setTeam(JSON.parse(saved));
    
    // Ensure we have a session ID
    if (!sessionStorage.getItem("poke-session-id")) {
      sessionStorage.setItem("poke-session-id", crypto.randomUUID());
    }
  }, [navigate]);

  // Socket event listeners
  useEffect(() => {
    if (!socket) return;

    function handleRoomCreated({ code }) {
      setMyCode(code);
      setIsWaiting(true);
      setError("");
      sessionStorage.setItem("poke-room-code", code); // Save room code for reconnects
    }

    function handleBattleStart({ playerKey, state }) {
      battleStateRef.current = state;
      battleKeyRef.current = playerKey;
      setVsData({ me: state.me, opponent: state.opponent });
      
      vsTimeoutRef.current = setTimeout(() => {
        skipVsScreen();
      }, 2500); // 2.5s hype delay
    }

    function handleError({ message }) {
      setError(message);
      setIsWaiting(false);
    }

    socket.on("room-created", handleRoomCreated);
    socket.on("battle-start", handleBattleStart);
    socket.on("error", handleError);

    return () => {
      socket.off("room-created", handleRoomCreated);
      socket.off("battle-start", handleBattleStart);
      socket.off("error", handleError);
      if (vsTimeoutRef.current) clearTimeout(vsTimeoutRef.current);
    };
  }, [socket, navigate]);

  const skipVsScreen = () => {
    if (vsTimeoutRef.current) {
      clearTimeout(vsTimeoutRef.current);
      vsTimeoutRef.current = null;
    }
    if (battleStateRef.current) {
      const state = battleStateRef.current;
      const playerKey = battleKeyRef.current;
      setVsData(null);
      navigate(`/battle/${state.me.active.id || "live"}`, { 
        state: { playerKey, initialBattleState: state } 
      });
      battleStateRef.current = null;
    }
  };

  const handleCreateRoom = () => {
    if (!socket || !team) return;
    const sessionId = sessionStorage.getItem("poke-session-id");
    socket.emit("create-room", { team, sessionId });
  };

  const handleJoinRoom = (e) => {
    e.preventDefault();
    if (!socket || !team || !joinCode.trim()) return;
    const sessionId = sessionStorage.getItem("poke-session-id");
    const code = joinCode.trim();
    sessionStorage.setItem("poke-room-code", code);
    socket.emit("join-room", { code, team, sessionId });
  };

  if (!team) return null;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[var(--color-bg-deep)] p-4 relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-0 inset-x-0 h-64 bg-gradient-to-b from-[var(--color-primary)]/10 to-transparent pointer-events-none"></div>

      <div className="glass-card p-8 sm:p-10 max-w-md w-full flex flex-col gap-8 relative z-10 shadow-2xl border-t border-[var(--color-border-glow)] animate-slide-up">
        
        <div className="text-center space-y-2">
          <h1 className="font-display font-extrabold text-4xl text-transparent bg-clip-text bg-gradient-to-br from-[var(--color-primary-light)] to-[var(--color-primary)] drop-shadow-sm">
            Battle Lobby
          </h1>
          <p className="text-[var(--color-text-secondary)] text-sm font-medium tracking-wide">
            Your team of 6 is ready.
          </p>
        </div>

        {/* Small Team Preview */}
        <div className="flex justify-center gap-2 bg-[var(--color-bg-deep)]/50 p-3 rounded-2xl border border-[var(--color-border)] shadow-inner">
          {team.map((slot, i) => (
            <div key={i} className="relative group">
              <img 
                src={slot.pokemon.spriteUrl} 
                alt={slot.pokemon.name} 
                className="w-10 h-10 object-contain drop-shadow-md transition-transform group-hover:scale-125 group-hover:-translate-y-1"
                title={slot.nickname || slot.pokemon.name}
              />
            </div>
          ))}
        </div>

        {error && (
          <div className="bg-red-500/20 border border-red-500/50 text-red-200 text-sm p-3 rounded-lg text-center">
            {error}
          </div>
        )}

        {showWakeMessage && !isConnected && (
          <div className="bg-yellow-500/20 border border-yellow-500/50 text-yellow-200 text-sm p-3 rounded-lg flex items-center justify-center gap-2">
            <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></span>
            Waking up server, hang on... (first connection takes ~30s)
          </div>
        )}

        {!isWaiting ? (
          <div className="space-y-6">
            {/* Create Room */}
            <div className="flex flex-col gap-2">
              <button 
                onClick={handleCreateRoom}
                disabled={!isConnected}
                className="w-full py-3.5 bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-primary-light)] text-white font-extrabold uppercase tracking-widest text-sm rounded-xl transition-all shadow-[0_0_15px_rgba(59,130,246,0.3)] hover:shadow-[0_0_25px_rgba(59,130,246,0.5)] hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              >
                {isConnected ? "Create New Room" : "Connecting..."}
              </button>
            </div>

            <div className="relative flex py-2 items-center">
              <div className="flex-grow border-t border-[var(--color-border)]"></div>
              <span className="flex-shrink-0 mx-4 text-[var(--color-text-muted)] text-xs font-bold uppercase tracking-widest">OR</span>
              <div className="flex-grow border-t border-[var(--color-border)]"></div>
            </div>

            {/* Join Room */}
            <form onSubmit={handleJoinRoom} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs text-[var(--color-text-secondary)] font-bold mb-2 uppercase tracking-widest text-center">
                  Join with Code
                </label>
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="ENTER CODE"
                  className="w-full bg-[var(--color-bg-input)] border border-[var(--color-border)] rounded-xl px-4 py-3.5 text-[var(--color-text-primary)] text-center font-mono font-bold tracking-[0.3em] uppercase focus:outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-all shadow-inner"
                  maxLength={6}
                />
              </div>
              <button 
                type="submit"
                disabled={joinCode.length < 1 || !isConnected}
                className="w-full py-3.5 bg-[var(--color-bg-panel)] hover:bg-[var(--color-bg-hover)] text-[var(--color-text-primary)] font-extrabold uppercase tracking-widest text-sm rounded-xl border border-[var(--color-border)] disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:border-[var(--color-border-glow)] hover:shadow-md"
              >
                {isConnected ? "Join Room" : "Connecting..."}
              </button>
            </form>
          </div>
        ) : (
          <div className="flex flex-col items-center py-6 gap-6 text-center animate-fade-in">
            <div className="relative w-16 h-16">
              <div className="absolute inset-0 border-4 border-[var(--color-border)] rounded-full"></div>
              <div className="absolute inset-0 border-4 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center text-[10px] text-[var(--color-primary)] font-bold">VS</div>
            </div>
            <div>
              <p className="text-[var(--color-text-secondary)] text-sm font-bold tracking-wider uppercase mb-2">Waiting for opponent...</p>
              <p className="text-[var(--color-text-muted)] text-xs mb-2">Share this code:</p>
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(myCode);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="group relative block w-full bg-[var(--color-bg-input)] py-4 px-8 rounded-2xl border border-[var(--color-border-glow)] shadow-inner hover:border-[var(--color-primary)] transition-all cursor-pointer text-center overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[var(--color-primary)]/10 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]"></div>
                <div className="font-mono text-4xl font-extrabold tracking-[0.25em] text-[var(--color-primary)] relative z-10 drop-shadow-[0_0_8px_rgba(59,130,246,0.4)]">
                  {myCode}
                </div>
                <div className={`absolute top-2 right-2 bg-[var(--color-success)] text-[var(--color-bg-deep)] text-[9px] px-2 py-0.5 font-bold uppercase rounded transition-opacity ${copied ? 'opacity-100' : 'opacity-0'}`}>
                  Copied!
                </div>
              </button>
            </div>
            <button 
              onClick={() => {
                socket.disconnect(); // Disconnects and leaves the room
                socket.connect();    // Reconnect to get a new socket id
                setIsWaiting(false);
                setMyCode(null);
                setError("");
              }}
              className="mt-2 text-[var(--color-text-muted)] hover:text-[var(--color-danger)] text-xs font-bold uppercase tracking-widest transition-colors"
            >
              Cancel Matchmaking
            </button>
          </div>
        )}

      </div>

      {/* VS Screen Overlay */}
      {vsData && (
        <div 
          className="fixed inset-0 z-50 bg-[var(--color-bg-deep)] flex flex-col items-center justify-center p-4 overflow-hidden cursor-pointer"
          onClick={skipVsScreen}
        >
          {/* Animated Background Elements */}
          <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_center,_var(--color-primary)_0%,_transparent_60%)] animate-pulse-glow"></div>
          
          <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_48%,var(--color-danger)_49%,var(--color-danger)_51%,transparent_52%)] opacity-20"></div>

          <div className="text-6xl font-display font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-[var(--color-text-muted)] mb-12 tracking-[0.2em] drop-shadow-[0_0_20px_rgba(255,255,255,0.5)] z-10 italic animate-scale-in">
            VS
          </div>
          
          <div className="flex w-full max-w-5xl justify-between items-center px-4 sm:px-16 z-10">
            {/* Player 1 */}
            <div className="flex flex-col items-center animate-slide-in-left">
              <div className="relative">
                <div className="absolute inset-0 bg-[var(--color-primary)] rounded-full blur-3xl opacity-20 animate-pulse"></div>
                <img src={vsData.me.active.spriteUrl} alt="You" className="w-40 h-40 sm:w-64 sm:h-64 object-contain relative z-10 drop-shadow-[0_10px_25px_rgba(59,130,246,0.6)] hover:scale-110 transition-transform duration-500" />
              </div>
              <div className="mt-8 font-display font-bold text-3xl tracking-wide text-white">{vsData.me.active.name}</div>
              <div className="text-xs font-bold text-[var(--color-primary-light)] uppercase tracking-[0.3em] mt-2 bg-[var(--color-primary)]/20 px-3 py-1 rounded-full border border-[var(--color-primary)]/30">You</div>
            </div>

            {/* Player 2 */}
            <div className="flex flex-col items-center animate-slide-in-right">
              <div className="relative">
                <div className="absolute inset-0 bg-[var(--color-danger)] rounded-full blur-3xl opacity-20 animate-pulse" style={{ animationDelay: '0.5s' }}></div>
                <img src={vsData.opponent.active.spriteUrl} alt="Opponent" className="w-40 h-40 sm:w-64 sm:h-64 object-contain relative z-10 drop-shadow-[0_10px_25px_rgba(244,63,94,0.6)] hover:scale-110 transition-transform duration-500" />
              </div>
              <div className="mt-8 font-display font-bold text-3xl tracking-wide text-white">{vsData.opponent.active.name}</div>
              <div className="text-xs font-bold text-[var(--color-danger)] uppercase tracking-[0.3em] mt-2 bg-[var(--color-danger)]/20 px-3 py-1 rounded-full border border-[var(--color-danger)]/30">Opponent</div>
            </div>
          </div>
          
          <div className="absolute bottom-12 text-sm font-bold text-[var(--color-text-muted)] tracking-[0.3em] uppercase animate-pulse z-10">
            Battle starting...
          </div>
        </div>
      )}
    </div>
  );
}
