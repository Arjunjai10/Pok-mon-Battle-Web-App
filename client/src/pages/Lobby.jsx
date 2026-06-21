import { useEffect, useState } from "react";
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

  const [showWakeMessage, setShowWakeMessage] = useState(false);

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
      sessionStorage.setItem("poke-room-code", state.myKey === "p1" ? state.code : undefined); // Will fix later, room doesn't emit code in state. Just save it when joining.
      navigate(`/battle/${state.me.active.id || "live"}`, { 
        state: { playerKey, initialBattleState: state } 
      });
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
    };
  }, [socket, navigate]);

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
    <div className="flex flex-col items-center justify-center min-h-screen bg-[var(--color-bg-deep)] p-4">
      <div className="glass-card p-8 max-w-md w-full flex flex-col gap-6">
        
        <div className="text-center space-y-2">
          <h1 className="font-display font-bold text-3xl text-[var(--color-text-primary)]">
            Battle Lobby
          </h1>
          <p className="text-[var(--color-text-secondary)] text-sm">
            Your team of 6 is ready.
          </p>
        </div>

        {/* Small Team Preview */}
        <div className="flex justify-center gap-1 bg-[var(--color-bg-panel)] p-2 rounded-lg border border-[var(--color-border)]">
          {team.map((slot, i) => (
            <img 
              key={i} 
              src={slot.pokemon.spriteUrl} 
              alt={slot.pokemon.name} 
              className="w-10 h-10 object-contain drop-shadow-md"
              title={slot.nickname || slot.pokemon.name}
            />
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
                className="w-full py-3 bg-[var(--color-primary)] hover:bg-[var(--color-primary-light)] text-white font-bold rounded-lg transition-colors shadow-[0_0_15px_rgba(59,130,246,0.3)] hover:shadow-[0_0_20px_rgba(59,130,246,0.5)] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isConnected ? "Create New Room" : "Connecting..."}
              </button>
            </div>

            <div className="relative flex py-2 items-center">
              <div className="flex-grow border-t border-[var(--color-border)]"></div>
              <span className="flex-shrink-0 mx-4 text-[var(--color-text-muted)] text-sm">OR</span>
              <div className="flex-grow border-t border-[var(--color-border)]"></div>
            </div>

            {/* Join Room */}
            <form onSubmit={handleJoinRoom} className="flex flex-col gap-3">
              <div>
                <label className="block text-xs text-[var(--color-text-secondary)] font-medium mb-1 uppercase tracking-wider">
                  Join with Code
                </label>
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="Enter 6-character code"
                  className="w-full bg-[var(--color-bg-input)] border border-[var(--color-border)] rounded-lg px-4 py-3 text-[var(--color-text-primary)] text-center font-mono tracking-[0.2em] uppercase focus:outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-all"
                  maxLength={6}
                />
              </div>
              <button 
                type="submit"
                disabled={joinCode.length < 1 || !isConnected}
                className="w-full py-3 bg-[var(--color-bg-panel)] hover:bg-[var(--color-bg-hover)] text-[var(--color-text-primary)] font-bold rounded-lg border border-[var(--color-border)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isConnected ? "Join Room" : "Connecting..."}
              </button>
            </form>
          </div>
        ) : (
          <div className="flex flex-col items-center py-6 gap-4 text-center">
            <div className="w-12 h-12 border-4 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin"></div>
            <div>
              <p className="text-[var(--color-text-secondary)] text-sm mb-1">Waiting for opponent...</p>
              <p className="text-[var(--color-text-primary)] text-sm">Room Code:</p>
              <div className="font-mono text-4xl font-bold tracking-[0.2em] text-[var(--color-primary)] mt-2 bg-[var(--color-bg-panel)] py-3 px-6 rounded-xl border border-[var(--color-border)] shadow-inner">
                {myCode}
              </div>
            </div>
            <button 
              onClick={() => {
                socket.disconnect(); // Disconnects and leaves the room
                socket.connect();    // Reconnect to get a new socket id
                setIsWaiting(false);
                setMyCode(null);
                setError("");
              }}
              className="mt-4 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] text-sm underline underline-offset-4"
            >
              Cancel
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
