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
      setIsWaiting(true); // If we just joined and got an update, we are waiting
    }

    function handleBattleStart({ playerKey, state }) {
      battleStateRef.current = state;
      battleKeyRef.current = playerKey;
      setVsData({ me: state.me, opponents: state.opponents });
      
      vsTimeoutRef.current = setTimeout(() => {
        skipVsScreen();
      }, 2500); // 2.5s hype delay
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
    setMyCode(code); // Speculatively set so UI shows waiting screen
    socket.emit("join-room", { code, team, sessionId, playerName });
  };

  const handleStartBattle = () => {
    if (!socket || !myCode) return;
    socket.emit("start-battle", { code: myCode });
  };

  if (!team) return null;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[var(--color-bg-deep)] p-4 relative overflow-hidden">

      <div className="glass-card p-8 sm:p-10 max-w-md w-full flex flex-col gap-8 relative z-10 animate-bounce-in bg-white">
        
        <div className="text-center space-y-2">
          <h1 className="font-display font-black text-4xl text-[var(--color-primary)] drop-shadow-[0_2px_0_var(--color-primary-light)]">
            Battle Lobby
          </h1>
          <p className="text-[var(--color-text-secondary)] text-sm font-bold tracking-wide">
            Your team of 6 is ready.
          </p>
        </div>

        {/* Small Team Preview */}
        <div className="flex justify-center gap-2 bg-[var(--color-bg-panel)] p-3 rounded-2xl border-4 border-[var(--color-border)] shadow-inner">
          {team.map((slot, i) => (
            <div key={i} className="relative group">
              <img 
                src={slot.pokemon.spriteUrl} 
                alt={slot.pokemon.name} 
                className="w-10 h-10 object-contain drop-shadow-md transition-transform group-hover:scale-125 group-hover:-translate-y-2 group-hover:drop-shadow-lg"
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
            {/* Format Selection */}
            <div className="flex flex-col gap-2">
              <label className="text-xs text-[var(--color-text-secondary)] font-bold uppercase tracking-widest text-center">Battle Format</label>
              <div className="flex gap-2 justify-center">
                <button
                  onClick={() => setFormat("1v1")}
                  className={`flex-1 py-2 rounded-xl font-black uppercase text-sm border-4 transition-all shadow-sm ${
                    format === "1v1" ? "bg-[var(--color-primary)] text-white border-blue-700 shadow-[0_4px_0_#1d4ed8]" : "bg-[var(--color-bg-panel)] text-[var(--color-text-secondary)] border-[var(--color-border)] hover:-translate-y-1 hover:shadow-[0_4px_0_var(--color-border)]"
                  }`}
                >
                  1v1
                </button>
                <button
                  onClick={() => setFormat("ffa")}
                  className={`flex-1 py-2 rounded-xl font-black uppercase text-sm border-4 transition-all shadow-sm ${
                    format === "ffa" ? "bg-[var(--color-primary)] text-white border-blue-700 shadow-[0_4px_0_#1d4ed8]" : "bg-[var(--color-bg-panel)] text-[var(--color-text-secondary)] border-[var(--color-border)] hover:-translate-y-1 hover:shadow-[0_4px_0_var(--color-border)]"
                  }`}
                >
                  FFA (Up to 5)
                </button>
              </div>
            </div>

            {/* Create Room */}
            <div className="flex flex-col gap-2">
              <button 
                onClick={handleCreateRoom}
                disabled={!isConnected}
                className="w-full py-3.5 bg-[var(--color-primary)] border-4 border-blue-700 text-white font-black uppercase tracking-widest text-sm rounded-2xl transition-all shadow-[0_6px_0_#1d4ed8] hover:-translate-y-1 hover:shadow-[0_8px_0_#1d4ed8] active:translate-y-2 active:shadow-none disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none"
              >
                {isConnected ? "Create New Room" : "Connecting..."}
              </button>
            </div>

            <div className="relative flex py-2 items-center">
              <div className="flex-grow border-t-4 border-[var(--color-border)]"></div>
              <span className="flex-shrink-0 mx-4 text-[var(--color-text-muted)] text-xs font-black uppercase tracking-widest bg-[var(--color-bg-panel)] px-2 py-1 rounded-lg border-2 border-[var(--color-border)]">OR</span>
              <div className="flex-grow border-t-4 border-[var(--color-border)]"></div>
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
                  className="w-full bg-[var(--color-bg-panel)] border-4 border-[var(--color-border)] rounded-2xl px-4 py-3.5 text-[var(--color-text-primary)] text-center font-mono font-bold tracking-[0.3em] uppercase focus:outline-none focus:border-[var(--color-primary)] transition-all shadow-inner"
                  maxLength={6}
                />
              </div>
              <button 
                type="submit"
                disabled={joinCode.length < 1 || !isConnected}
                className="w-full py-3.5 bg-white text-[var(--color-text-primary)] font-black uppercase tracking-widest text-sm rounded-2xl border-4 border-[var(--color-border)] transition-all shadow-[0_6px_0_var(--color-border)] hover:-translate-y-1 hover:border-blue-400 hover:shadow-[0_8px_0_#60A5FA] active:translate-y-2 active:shadow-none disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isConnected ? "Join Room" : "Connecting..."}
              </button>
            </form>
          </div>
        ) : (
          <div className="flex flex-col items-center py-6 gap-6 text-center animate-fade-in">
            {format === "1v1" ? (
              <div className="relative w-16 h-16">
                <div className="absolute inset-0 border-8 border-[var(--color-border)] rounded-full"></div>
                <div className="absolute inset-0 border-8 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : null}

            <div>
              <p className="text-[var(--color-text-secondary)] text-sm font-black tracking-wider uppercase mb-2">Waiting in Lobby...</p>
              <p className="text-[var(--color-text-muted)] text-xs font-bold mb-2 uppercase tracking-widest">Share this code:</p>
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(myCode);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="group relative block w-full bg-[var(--color-bg-panel)] py-4 px-8 rounded-2xl border-4 border-[var(--color-border)] shadow-inner hover:border-blue-400 hover:-translate-y-1 transition-all cursor-pointer text-center overflow-hidden"
              >
                <div className="absolute inset-0 bg-white/50 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <div className="font-mono text-4xl font-black tracking-[0.25em] text-[var(--color-primary)] relative z-10 drop-shadow-sm">
                  {myCode}
                </div>
                <div className={`absolute top-2 right-2 bg-[var(--color-success)] text-white text-[10px] px-2 py-1 font-black uppercase rounded-lg transition-transform ${copied ? 'scale-100' : 'scale-0'}`}>
                  Copied!
                </div>
              </button>
            </div>

            {/* FFA Player List */}
            {format === "ffa" && (
              <div className="w-full text-left">
                <h3 className="text-sm font-black text-[var(--color-text-primary)] uppercase tracking-wider mb-2">Players Joined:</h3>
                <ul className="space-y-2">
                  {lobbyPlayers.map((p, idx) => (
                    <li key={idx} className="bg-[var(--color-bg-panel)] border-2 border-[var(--color-border)] p-2 rounded-lg font-bold text-sm text-[var(--color-text-secondary)]">
                      {p.name} {p.isOwner && "(Owner)"} {p.key === battleKeyRef.current && "(You)"}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {isOwner && format === "ffa" && lobbyPlayers.length >= 2 && (
               <button 
                 onClick={handleStartBattle}
                 className="w-full py-3 bg-[var(--color-success)] border-4 border-green-700 text-white font-black uppercase tracking-widest rounded-2xl transition-all shadow-[0_4px_0_#15803d] hover:-translate-y-1 hover:shadow-[0_6px_0_#15803d] active:translate-y-1 active:shadow-none"
               >
                 Start Battle
               </button>
            )}

            <button 
              onClick={() => {
                socket.disconnect(); // Disconnects and leaves the room
                socket.connect();    // Reconnect to get a new socket id
                setIsWaiting(false);
                setMyCode(null);
                setError("");
              }}
              className="mt-2 text-[var(--color-danger)] bg-red-50 px-4 py-2 rounded-full border-2 border-red-200 hover:bg-red-100 text-xs font-black uppercase tracking-widest transition-colors shadow-[0_2px_0_rgba(239,68,68,0.2)] active:translate-y-0.5 active:shadow-none"
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
          {/* Animated Background Elements - Explosive Bright */}
          <div className="absolute inset-0 opacity-100 bg-[radial-gradient(circle_at_center,var(--color-accent)_0%,var(--color-danger)_50%,var(--color-bg-deep)_100%)] animate-pulse-glow"></div>
          
          <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_48%,white_49%,white_51%,transparent_52%)] opacity-50"></div>
          <div className="absolute inset-0 bg-[linear-gradient(-45deg,transparent_48%,white_49%,white_51%,transparent_52%)] opacity-50"></div>

          <div className="relative z-10 flex flex-col items-center w-full max-w-6xl">
            
            {/* YOU */}
            <div className="w-full max-w-md transform translate-y-8 animate-slide-in-bottom">
              <div className="bg-[var(--color-primary)] border-8 border-white p-6 shadow-2xl relative overflow-visible transform rotate-3">
                <div className="absolute -top-4 -left-4 bg-[var(--color-accent)] text-[var(--color-bg-deep)] font-black uppercase tracking-widest px-4 py-1 text-sm border-4 border-[var(--color-bg-deep)] shadow-[4px_4px_0_var(--color-bg-deep)] transform -rotate-6">
                  You
                </div>
                <img 
                  src={vsData.me.active.spriteUrl} 
                  alt="My active Pokémon" 
                  className="w-48 h-48 mx-auto drop-shadow-[0_0_15px_rgba(255,255,255,0.8)] filter brightness-110 contrast-125"
                  style={{ imageRendering: 'pixelated' }}
                />
              </div>
            </div>

            {/* VS Graphic */}
            <div className="relative z-20 my-4 transform animate-scale-in">
              <div className="text-8xl font-black italic tracking-tighter drop-shadow-[0_10px_0_rgba(0,0,0,0.5)]">
                <span className="text-[var(--color-primary)]">V</span>
                <span className="text-[var(--color-accent)] -ml-4">S</span>
              </div>
              <div className="absolute inset-0 text-8xl font-black italic tracking-tighter text-transparent stroke-black stroke-2" style={{ WebkitTextStroke: '4px white' }}>
                <span className="text-[var(--color-primary)]">V</span>
                <span className="text-[var(--color-accent)] -ml-4">S</span>
              </div>
            </div>

            {/* OPPONENTS */}
            <div className="flex gap-4 transform -translate-y-8 animate-slide-in-top flex-wrap justify-center">
              {vsData.opponents.map(opp => (
                <div key={opp.playerKey} className="bg-[var(--color-danger)] border-8 border-white p-6 shadow-2xl relative overflow-visible transform -rotate-3 mb-4">
                  <div className="absolute -top-4 -right-4 bg-[var(--color-accent)] text-[var(--color-bg-deep)] font-black uppercase tracking-widest px-4 py-1 text-sm border-4 border-[var(--color-bg-deep)] shadow-[4px_4px_0_var(--color-bg-deep)] transform rotate-6">
                    {opp.name}
                  </div>
                  <img 
                    src={opp.active.spriteUrl} 
                    alt="Opponent's active Pokémon" 
                    className="w-48 h-48 mx-auto drop-shadow-[0_0_15px_rgba(255,255,255,0.8)] filter brightness-110 contrast-125"
                    style={{ imageRendering: 'pixelated' }}
                  />
                </div>
              ))}
            </div>

            <p className="mt-12 text-white font-black uppercase tracking-widest text-sm animate-pulse drop-shadow-md">
              Tap anywhere to battle
            </p>
          </div>
        </div>
      )}

    </div>
  );
}
