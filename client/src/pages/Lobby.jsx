import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useSocket } from "../context/SocketContext";
import PokemonSprite from "../components/PokemonSprite.jsx";

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

  const [format, setFormat] = useState("1v1");
  const [lobbyPlayers, setLobbyPlayers] = useState([]);
  const [isOwner, setIsOwner] = useState(false);

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
      navigate("/build");
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

    function handleRoomCreated({ code, format: roomFormat }) {
      setMyCode(code);
      setIsWaiting(true);
      setError("");
      setFormat(roomFormat);
      setIsOwner(true);
      setLobbyPlayers([{ key: "p1", name: "You (Owner)", isOwner: true }]);
      sessionStorage.setItem("poke-room-code", code);
    }

    function handleLobbyUpdate({ players }) {
      setLobbyPlayers(players);
      setIsWaiting(true);
    }

    function handleBattleStart({ playerKey, state }) {
      battleStateRef.current = state;
      battleKeyRef.current = playerKey;
      setVsData({ me: state.me, opponents: state.opponents });
      
      vsTimeoutRef.current = setTimeout(() => {
        skipVsScreen();
      }, 3000); // 3s hype delay for cinematic intro
    }

    function handleError({ message }) {
      setError(message);
      if (message === "You are not in a room." || message.includes("Room not found")) {
        setIsWaiting(false);
        setMyCode(null);
      } else if (!myCode) {
        setIsWaiting(false);
      }
    }

    socket.on("room-created", handleRoomCreated);
    socket.on("lobby-update", handleLobbyUpdate);
    socket.on("battle-start", handleBattleStart);
    socket.on("error", handleError);

    return () => {
      socket.off("room-created", handleRoomCreated);
      socket.off("lobby-update", handleLobbyUpdate);
      socket.off("battle-start", handleBattleStart);
      socket.off("error", handleError);
      if (vsTimeoutRef.current) clearTimeout(vsTimeoutRef.current);
    };
  }, [socket, navigate, myCode]);

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
    const playerName = "Trainer " + Math.floor(Math.random() * 1000);
    socket.emit("create-room", { team, sessionId, format, playerName });
  };

  const handleJoinRoom = (e) => {
    e.preventDefault();
    if (!socket || !team || !joinCode.trim()) return;
    const sessionId = sessionStorage.getItem("poke-session-id");
    const code = joinCode.trim();
    const playerName = "Trainer " + Math.floor(Math.random() * 1000);
    sessionStorage.setItem("poke-room-code", code);
    setMyCode(code);
    socket.emit("join-room", { code, team, sessionId, playerName });
  };

  const handleStartBattle = () => {
    if (!socket || !myCode) return;
    socket.emit("start-battle", { code: myCode });
  };

  if (!team) return null;

  return (
    <div className="flex flex-col items-center justify-center min-h-[100dvh] bg-[var(--color-bg-deep)] p-4 relative overflow-hidden font-body text-white">

      {/* Ambient Backlight */}
      <div className="fixed top-1/3 left-1/4 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="fixed bottom-1/3 right-1/4 w-[400px] h-[400px] bg-red-600/10 rounded-full blur-[100px] pointer-events-none"></div>

      <div className="glass-card p-8 sm:p-10 max-w-md w-full flex flex-col gap-7 relative z-10 animate-bounce-in bg-slate-900/90 backdrop-blur-xl border border-white/15 rounded-3xl shadow-[0_20px_70px_rgba(0,0,0,0.8)]">
        
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/15 border border-blue-400/30 text-blue-300 text-[11px] font-black uppercase tracking-widest mb-1">
            <span>🏟️</span> Competitive Matchmaking
          </div>
          <h1 className="font-display font-black text-4xl text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-200 to-slate-300 uppercase tracking-wide">
            Battle Lobby
          </h1>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">
            Your roster of 6 Pokémon is armed and ready
          </p>
        </div>

        {/* Small Team Preview */}
        <div className="flex justify-center gap-2 bg-slate-950/80 p-3 rounded-2xl border border-white/10 shadow-inner overflow-x-auto">
          {team.map((slot, i) => (
            <div key={i} className="relative group w-11 h-11 flex-shrink-0 flex items-center justify-center p-1 rounded-xl bg-slate-900/80 border border-white/5 hover:border-blue-400/50 hover:-translate-y-1 transition-all">
              <PokemonSprite 
                id={slot.pokemon.id}
                spriteUrl={slot.pokemon.spriteUrl} 
                name={slot.nickname || slot.pokemon.name} 
                variant="front-gif"
                className="w-full h-full object-contain filter drop-shadow group-hover:scale-115 transition-transform"
              />
              <span className="absolute -bottom-6 opacity-0 group-hover:opacity-100 transition-opacity bg-black text-white text-[9px] px-1.5 py-0.5 rounded font-bold pointer-events-none z-30 whitespace-nowrap">
                {slot.nickname || slot.pokemon.name}
              </span>
            </div>
          ))}
        </div>

        {error && (
          <div className="bg-red-500/20 border border-red-500/50 text-red-300 text-xs p-3.5 rounded-xl font-bold text-center animate-fade-in shadow-inner">
            ⚠️ {error}
          </div>
        )}

        {showWakeMessage && !isConnected && (
          <div className="bg-amber-500/20 border border-amber-500/50 text-amber-200 text-xs p-3.5 rounded-xl flex items-center justify-center gap-2 font-bold animate-pulse shadow-inner">
            <span className="w-3.5 h-3.5 border-2 border-amber-300 border-t-transparent rounded-full animate-spin"></span>
            Waking up server... (first connection takes ~20s)
          </div>
        )}

        {!isWaiting ? (
          <div className="space-y-6">
            {/* Format Selection */}
            <div className="flex flex-col gap-2">
              <label className="text-[11px] text-slate-400 font-black uppercase tracking-widest text-center">Select Mode</label>
              <div className="flex gap-2.5 justify-center">
                <button
                  onClick={() => setFormat("1v1")}
                  className={`flex-1 py-2.5 rounded-xl font-black uppercase text-xs border transition-all ${
                    format === "1v1" 
                      ? "bg-blue-600 text-white border-blue-400 shadow-[0_0_20px_rgba(37,99,235,0.5)] scale-[1.02]" 
                      : "bg-slate-800/80 text-slate-400 border-white/10 hover:border-white/30 hover:bg-slate-800"
                  }`}
                >
                  ⚔️ 1v1 Duel
                </button>
                <button
                  onClick={() => setFormat("ffa")}
                  className={`flex-1 py-2.5 rounded-xl font-black uppercase text-xs border transition-all ${
                    format === "ffa" 
                      ? "bg-purple-600 text-white border-purple-400 shadow-[0_0_20px_rgba(147,51,234,0.5)] scale-[1.02]" 
                      : "bg-slate-800/80 text-slate-400 border-white/10 hover:border-white/30 hover:bg-slate-800"
                  }`}
                >
                  🔥 FFA (Up to 5)
                </button>
              </div>
            </div>

            {/* Create Room */}
            <div className="flex flex-col gap-2">
              <button 
                onClick={handleCreateRoom}
                disabled={!isConnected}
                className="w-full py-3.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 border border-white/20 text-white font-black uppercase tracking-widest text-sm rounded-2xl transition-all shadow-[0_0_20px_rgba(59,130,246,0.4)] hover:shadow-[0_0_30px_rgba(6,182,212,0.7)] hover:-translate-y-0.5 active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
              >
                {isConnected ? "Create Match Lobby" : "Connecting to Server..."}
              </button>
            </div>

            <div className="relative flex py-1 items-center">
              <div className="flex-grow border-t border-white/10"></div>
              <span className="flex-shrink-0 mx-4 text-slate-400 text-[10px] font-black uppercase tracking-widest bg-slate-950 px-3 py-1 rounded-full border border-white/10">OR JOIN EXISTING</span>
              <div className="flex-grow border-t border-white/10"></div>
            </div>

            {/* Join Room */}
            <form onSubmit={handleJoinRoom} className="flex flex-col gap-3.5">
              <div>
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="ENTER 6-DIGIT CODE"
                  className="w-full bg-slate-950/90 border border-white/15 rounded-2xl px-4 py-3.5 text-white text-center font-mono font-black tracking-[0.35em] uppercase placeholder:tracking-normal placeholder:text-slate-600 placeholder:font-sans placeholder:font-bold focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all shadow-inner text-lg"
                  maxLength={6}
                />
              </div>
              <button 
                type="submit"
                disabled={joinCode.length < 1 || !isConnected}
                className="w-full py-3.5 bg-slate-800 hover:bg-slate-700 border border-white/15 text-white font-black uppercase tracking-widest text-sm rounded-2xl transition-all shadow-lg hover:border-blue-400 hover:text-blue-300 active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
              >
                {isConnected ? "Join Room" : "Connecting..."}
              </button>
            </form>
          </div>
        ) : (
          <div className="flex flex-col items-center py-4 gap-6 text-center animate-fade-in">
            {format === "1v1" ? (
              <div className="relative w-20 h-20 flex items-center justify-center">
                <div className="absolute inset-0 border-4 border-blue-500/20 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                <div className="text-2xl animate-pulse">⚔️</div>
              </div>
            ) : null}

            <div className="w-full">
              <p className="text-blue-400 text-xs font-black tracking-widest uppercase mb-1">Matchmaking Active</p>
              <h2 className="text-xl font-display font-black text-white mb-3">Waiting for Challenger...</h2>
              <p className="text-slate-400 text-[11px] font-extrabold uppercase tracking-widest mb-2">Share Room Code with Friend:</p>
              
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(myCode);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="group relative block w-full bg-slate-950 py-4 px-6 rounded-2xl border border-blue-500/40 shadow-[inner_0_2px_8px_rgba(0,0,0,0.8)] hover:border-blue-400 hover:shadow-[0_0_25px_rgba(59,130,246,0.3)] transition-all cursor-pointer text-center overflow-hidden"
              >
                <div className="font-mono text-4xl font-black tracking-[0.3em] text-transparent bg-clip-text bg-gradient-to-r from-blue-300 via-white to-cyan-300 relative z-10 drop-shadow">
                  {myCode}
                </div>
                <div className={`absolute top-3 right-3 bg-emerald-500 text-slate-950 text-[10px] px-2 py-1 font-black uppercase rounded-md transition-transform shadow ${copied ? 'scale-100' : 'scale-0'}`}>
                  Copied!
                </div>
              </button>
            </div>

            {/* FFA Player List */}
            {format === "ffa" && (
              <div className="w-full text-left bg-slate-950/60 p-4 rounded-2xl border border-white/10">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-2.5 flex justify-between items-center">
                  <span>Joined Players</span>
                  <span className="text-blue-400">{lobbyPlayers.length} in Lobby</span>
                </h3>
                <ul className="space-y-2">
                  {lobbyPlayers.map((p, idx) => (
                    <li key={idx} className="bg-slate-900 border border-white/10 px-3 py-2 rounded-xl font-extrabold text-xs text-white flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                        {p.name} {p.key === battleKeyRef.current && "(You)"}
                      </span>
                      {p.isOwner && <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 uppercase font-black border border-blue-400/30">Host</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {isOwner && format === "ffa" && lobbyPlayers.length >= 2 && (
               <button 
                 onClick={handleStartBattle}
                 className="w-full py-3.5 bg-gradient-to-r from-emerald-500 to-green-600 border border-green-400/50 text-slate-950 font-black uppercase tracking-widest rounded-2xl transition-all shadow-[0_0_20px_rgba(16,185,129,0.4)] hover:shadow-[0_0_35px_rgba(16,185,129,0.7)] active:scale-95"
               >
                 Launch FFA Battle
               </button>
            )}

            <button 
              onClick={() => {
                socket.disconnect();
                socket.connect();
                setIsWaiting(false);
                setMyCode(null);
                setError("");
              }}
              className="text-slate-400 hover:text-red-400 text-xs font-extrabold uppercase tracking-widest transition-colors py-1 hover:underline"
            >
              Cancel Matchmaking
            </button>
          </div>
        )}
      </div>

      {/* ══ eSports VS Screen Cinematic Overlay ══ */}
      {vsData && (
        <div 
          className="fixed inset-0 z-[200] bg-slate-950 flex flex-col items-center justify-center p-4 overflow-hidden cursor-pointer animate-fade-in select-none"
          onClick={skipVsScreen}
        >
          {/* Split Stadium Backgrounds */}
          <div className="absolute inset-0 bg-gradient-to-r from-blue-950/80 via-slate-950 to-red-950/80 pointer-events-none"></div>
          <div className="absolute top-0 left-0 w-1/2 h-full bg-gradient-to-br from-blue-600/20 to-transparent border-r border-white/10 transform -skew-x-12 -translate-x-12"></div>
          <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-tl from-red-600/20 to-transparent border-l border-white/10 transform -skew-x-12 translate-x-12"></div>

          {/* Central Arena Lighting */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.08)_0%,transparent_70%)] animate-pulse-glow"></div>

          <div className="relative z-10 flex flex-col md:flex-row items-center justify-center gap-8 md:gap-16 w-full max-w-6xl px-4 py-8">
            
            {/* YOU (Player 1) */}
            <div className="flex-1 flex flex-col items-center transform md:translate-x-4 animate-slide-in-bottom">
              <div className="w-56 h-56 sm:w-72 sm:h-72 relative flex items-center justify-center p-6 rounded-3xl bg-gradient-to-br from-blue-900/40 to-slate-900/80 border-2 border-blue-400/50 shadow-[0_0_50px_rgba(37,99,235,0.4)] backdrop-blur-md transform -rotate-2">
                <div className="absolute -top-4 -left-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-black uppercase text-xs sm:text-sm tracking-widest px-5 py-1.5 rounded-xl border border-white/30 shadow-[0_4px_15px_rgba(37,99,235,0.6)]">
                  You (Challenger)
                </div>
                <div className="w-40 h-40 sm:w-52 sm:h-52 flex items-center justify-center">
                  <PokemonSprite 
                    id={vsData.me.active.id} 
                    spriteUrl={vsData.me.active.spriteUrl} 
                    name={vsData.me.active.name || "Active"} 
                    variant="front-gif" 
                    animate={true}
                    className="w-full h-full object-contain filter drop-shadow-[0_12px_20px_rgba(0,0,0,0.8)] sm:scale-125 transition-transform duration-500"
                  />
                </div>
                <div className="absolute bottom-4 left-0 right-0 text-center font-display font-black text-white uppercase tracking-wider text-lg drop-shadow-md truncate px-4">
                  {vsData.me.active.name?.replace(/-/g, " ")}
                </div>
              </div>
            </div>

            {/* VS Graphic */}
            <div className="relative z-20 my-2 md:my-0 flex-shrink-0 animate-scale-in">
              <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-full bg-gradient-to-tr from-amber-500 via-orange-500 to-red-600 p-1 shadow-[0_0_50px_rgba(245,158,11,0.8)] flex items-center justify-center animate-pulse">
                <div className="w-full h-full rounded-full bg-slate-950 border border-white/20 flex items-center justify-center shadow-inner">
                  <span className="font-display font-black text-4xl sm:text-5xl italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-yellow-300 via-amber-400 to-orange-500 drop-shadow">
                    VS
                  </span>
                </div>
              </div>
            </div>

            {/* OPPONENTS (Player 2+) */}
            <div className="flex-1 flex flex-col items-center gap-6 transform md:-translate-x-4 animate-slide-in-top">
              {vsData.opponents && vsData.opponents.map(opp => (
                <div key={opp.playerKey || Math.random()} className="w-56 h-56 sm:w-72 sm:h-72 relative flex items-center justify-center p-6 rounded-3xl bg-gradient-to-br from-red-900/40 to-slate-900/80 border-2 border-red-400/50 shadow-[0_0_50px_rgba(239,68,68,0.4)] backdrop-blur-md transform rotate-2">
                  <div className="absolute -top-4 -right-3 bg-gradient-to-r from-red-600 to-orange-600 text-white font-black uppercase text-xs sm:text-sm tracking-widest px-5 py-1.5 rounded-xl border border-white/30 shadow-[0_4px_15px_rgba(239,68,68,0.6)]">
                    {opp.name || "Opponent"}
                  </div>
                  <div className="w-40 h-40 sm:w-52 sm:h-52 flex items-center justify-center">
                    <PokemonSprite 
                      id={opp.active?.id} 
                      spriteUrl={opp.active?.spriteUrl} 
                      name={opp.active?.name || "Active"} 
                      variant="front-gif" 
                      animate={true}
                      className="w-full h-full object-contain filter drop-shadow-[0_12px_20px_rgba(0,0,0,0.8)] sm:scale-125 scale-x-[-1] transition-transform duration-500"
                    />
                  </div>
                  <div className="absolute bottom-4 left-0 right-0 text-center font-display font-black text-white uppercase tracking-wider text-lg drop-shadow-md truncate px-4">
                    {opp.active?.name?.replace(/-/g, " ")}
                  </div>
                </div>
              ))}
            </div>

          </div>

          <div className="mt-12 text-slate-400 font-bold uppercase tracking-widest text-xs flex items-center gap-2 animate-pulse bg-slate-900/80 px-5 py-2.5 rounded-full border border-white/10 shadow-lg">
            <span>⚡ PREPARING ARENA MECHANICS...</span>
            <span className="text-blue-400 font-black">(TAP TO SKIP)</span>
          </div>
        </div>
      )}

    </div>
  );
}
