import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSocket } from "../context/SocketContext";

export default function Lobby() {
  const navigate = useNavigate();
  const socket = useSocket();
  const [team, setTeam] = useState(null);
  
  const [joinCode, setJoinCode] = useState("");
  const [isWaiting, setIsWaiting] = useState(false);
  const [myCode, setMyCode] = useState(null);
  const [error, setError] = useState("");

  // Load team from sessionStorage on mount
  useEffect(() => {
    const saved = sessionStorage.getItem("poke-team-final");
    if (!saved) {
      navigate("/");
      return;
    }
    setTeam(JSON.parse(saved));
  }, [navigate]);

  // Socket event listeners
  useEffect(() => {
    if (!socket) return;

    function handleRoomCreated({ code }) {
      setMyCode(code);
      setIsWaiting(true);
      setError("");
    }

    function handleBattleStart({ playerKey, state }) {
      // Store the playerKey and initial state in sessionStorage (optional) 
      // or just navigate and let the Battle component listen for state updates.
      // We will pass them in router state for immediate access
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
    socket.emit("create-room", { team });
  };

  const handleJoinRoom = (e) => {
    e.preventDefault();
    if (!socket || !team || !joinCode.trim()) return;
    socket.emit("join-room", { code: joinCode.trim(), team });
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

        {!isWaiting ? (
          <div className="space-y-6">
            {/* Create Room */}
            <div className="flex flex-col gap-2">
              <button 
                onClick={handleCreateRoom}
                className="w-full py-3 bg-[var(--color-primary)] hover:bg-[var(--color-primary-light)] text-white font-bold rounded-lg transition-colors shadow-[0_0_15px_rgba(59,130,246,0.3)] hover:shadow-[0_0_20px_rgba(59,130,246,0.5)]"
              >
                Create New Room
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
                disabled={joinCode.length < 1}
                className="w-full py-3 bg-[var(--color-bg-panel)] hover:bg-[var(--color-bg-hover)] text-[var(--color-text-primary)] font-bold rounded-lg border border-[var(--color-border)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Join Room
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
