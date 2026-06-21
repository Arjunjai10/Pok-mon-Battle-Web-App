import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useSocket } from "../context/SocketContext";
import HpBar from "../components/HpBar";
import BattleLog from "../components/BattleLog";

export default function Battle() {
  const navigate = useNavigate();
  const location = useLocation();
  const { socket, isConnected } = useSocket();

  const [gameState, setGameState] = useState(location.state?.initialBattleState || null);
  const [logEntries, setLogEntries] = useState(["Battle started!"]);
  const [uiView, setUiView] = useState("main"); // "main" | "fight" | "switch"
  const [modalMessage, setModalMessage] = useState(null);
  const [opponentReconnectingMsg, setOpponentReconnectingMsg] = useState(null);

  useEffect(() => {
    if (!gameState) {
      navigate("/");
      return;
    }
    if (!socket) return;

    function handleActionReceived() {
      // Local optimistic update — Phase 4 says the server state will soon catch up
      setGameState((prev) => ({ ...prev, phase: "waiting" }));
      setUiView("main");
    }

    function handleTurnResult({ state, log }) {
      setGameState(state);
      if (log && log.length > 0) {
        setLogEntries((prev) => [...prev, ...log]);
      }
      setUiView("main");
    }

    function handleForceSwitchResult({ state, log }) {
      setGameState(state);
      if (log && log.length > 0) {
        setLogEntries((prev) => [...prev, ...log]);
      }
      setUiView("main");
    }

    function handleOpponentReconnecting({ message }) {
      setOpponentReconnectingMsg(message);
    }

    function handleBattleReconnected({ state, message }) {
      setGameState(state);
      setOpponentReconnectingMsg(null);
      setModalMessage(null);
      if (message) {
        setLogEntries((prev) => [...prev, message]);
      }
    }

    function handleOpponentDisconnected({ message }) {
      setOpponentReconnectingMsg(null);
      setModalMessage(message);
    }

    function handleBattleOver({ winner, log }) {
      if (log && log.length > 0) {
        setLogEntries((prev) => [...prev, ...log]);
      }
      // state.phase will also be 'battle-over'
    }

    function handleError({ message }) {
      alert(`Error: ${message}`);
    }

    socket.on("action-received", handleActionReceived);
    socket.on("turn-result", handleTurnResult);
    socket.on("force-switch-result", handleForceSwitchResult);
    socket.on("opponent-reconnecting", handleOpponentReconnecting);
    socket.on("battle-reconnected", handleBattleReconnected);
    socket.on("opponent-disconnected", handleOpponentDisconnected);
    socket.on("battle-over", handleBattleOver);
    socket.on("error", handleError);

    return () => {
      socket.off("action-received", handleActionReceived);
      socket.off("turn-result", handleTurnResult);
      socket.off("force-switch-result", handleForceSwitchResult);
      socket.off("opponent-reconnecting", handleOpponentReconnecting);
      socket.off("battle-reconnected", handleBattleReconnected);
      socket.off("opponent-disconnected", handleOpponentDisconnected);
      socket.off("battle-over", handleBattleOver);
      socket.off("error", handleError);
    };
  }, [socket, gameState, navigate]);

  // Auto-reconnect flow
  useEffect(() => {
    if (isConnected && socket && gameState) {
      const code = sessionStorage.getItem("poke-room-code");
      const sessionId = sessionStorage.getItem("poke-session-id");
      const savedTeam = sessionStorage.getItem("poke-team-final");
      if (code && sessionId && savedTeam) {
        socket.emit("join-room", { code, sessionId, team: JSON.parse(savedTeam) });
      }
    }
  }, [isConnected, socket]);

  if (!gameState) return null;

  const { me, opponent, phase, turn, forceSwitchBench } = gameState;

  const handleMove = (move) => {
    socket.emit("submit-action", { type: "move", move });
  };

  const handleSwitch = (benchIndex) => {
    if (phase === "force-switch") {
      socket.emit("submit-force-switch", { switchTo: benchIndex });
    } else {
      socket.emit("submit-action", { type: "switch", switchTo: benchIndex });
    }
  };

  const renderStatus = (status) => {
    if (!status) return null;
    const colors = {
      burn: "bg-red-500/20 text-red-400 border-red-500/50",
      poison: "bg-purple-500/20 text-purple-400 border-purple-500/50",
      paralysis: "bg-yellow-500/20 text-yellow-400 border-yellow-500/50",
      sleep: "bg-blue-500/20 text-blue-400 border-blue-500/50",
      freeze: "bg-cyan-500/20 text-cyan-400 border-cyan-500/50",
    };
    return (
      <span className={`text-[0.6rem] font-bold uppercase px-1.5 py-0.5 rounded border ${colors[status]} ml-2`}>
        {status}
      </span>
    );
  };

  const renderActivePokemon = (p, isOpponent) => (
    <div className={`flex items-end gap-4 ${isOpponent ? "flex-row" : "flex-row-reverse"}`}>
      <div className="relative w-32 h-32 flex-shrink-0">
        <img 
          src={p.spriteUrl} 
          alt={p.name} 
          className={`w-full h-full object-contain ${p.currentHp <= 0 ? "grayscale opacity-50 translate-y-4" : ""} transition-all duration-500`}
        />
      </div>
      <div className={`glass-card p-3 flex-1 max-w-[240px] ${p.currentHp <= 0 ? "opacity-50" : ""}`}>
        <div className="flex justify-between items-baseline mb-1">
          <div className="font-bold text-[var(--color-text-primary)]">
            {p.name} {renderStatus(p.status)}
          </div>
          <div className="text-xs font-mono text-[var(--color-text-muted)]">Lv.100</div>
        </div>
        <HpBar current={p.currentHp} max={p.maxHp} />
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-screen bg-[var(--color-bg-deep)] p-4 max-w-4xl mx-auto gap-4">
      
      {/* Header */}
      <div className="flex justify-between items-center glass-card px-4 py-2">
        <div className="text-sm font-bold text-[var(--color-text-secondary)]">
          Turn {turn}
        </div>
        <div className="flex gap-1">
          {opponent.bench.map((b, i) => (
            <div key={i} className={`w-3 h-3 rounded-full ${b.currentHp > 0 ? "bg-[var(--color-primary)]" : "bg-[var(--color-danger)] opacity-50"}`} />
          ))}
        </div>
      </div>

      {/* Battle Field */}
      <div className="flex-1 glass-card relative p-6 flex flex-col justify-between overflow-hidden bg-gradient-to-b from-[#1a202c] to-[#0f172a]">
        {/* Opponent */}
        <div className="self-start w-full">
          {renderActivePokemon(opponent.active, true)}
        </div>
        
        {/* Player */}
        <div className="self-end w-full mt-8">
          {renderActivePokemon(me.active, false)}
        </div>
      </div>

      {/* Bottom Area: Controls + Log */}
      <div className="flex gap-4 h-48">
        
        {/* Controls */}
        <div className="flex-1 glass-card p-4">
          
          {phase === "waiting" && (
            <div className="flex h-full items-center justify-center text-[var(--color-text-secondary)] font-medium">
              Waiting for opponent...
            </div>
          )}

          {phase === "opponent-switching" && (
            <div className="flex h-full items-center justify-center text-[var(--color-text-secondary)] font-medium">
              Waiting for opponent to replace fainted Pokémon...
            </div>
          )}

          {phase === "battle-over" && (
            <div className="flex flex-col h-full items-center justify-center text-center gap-2">
              <div className="text-xl font-bold text-[var(--color-primary)]">Battle Over</div>
              <button 
                onClick={() => { socket.disconnect(); navigate("/"); }}
                className="px-4 py-2 bg-[var(--color-bg-panel)] rounded border border-[var(--color-border)] hover:bg-[var(--color-bg-hover)] transition-colors"
              >
                Return to Team Builder
              </button>
            </div>
          )}

          {phase === "picking" && uiView === "main" && (
            <div className="grid grid-cols-2 gap-3 h-full">
              <button 
                onClick={() => setUiView("fight")}
                disabled={me.active.currentHp <= 0}
                className="bg-red-500/20 hover:bg-red-500/30 text-red-200 border border-red-500/50 rounded-lg font-bold text-lg transition-colors disabled:opacity-50"
              >
                FIGHT
              </button>
              <button 
                onClick={() => setUiView("switch")}
                className="bg-blue-500/20 hover:bg-blue-500/30 text-blue-200 border border-blue-500/50 rounded-lg font-bold text-lg transition-colors"
              >
                POKéMON
              </button>
              <button 
                disabled
                className="bg-[var(--color-bg-panel)] text-[var(--color-text-muted)] border border-[var(--color-border)] rounded-lg font-bold text-lg opacity-50 cursor-not-allowed"
              >
                BAG
              </button>
              <button 
                onClick={() => { socket.disconnect(); navigate("/"); }}
                className="bg-[var(--color-bg-panel)] hover:bg-[var(--color-bg-hover)] text-[var(--color-text-secondary)] border border-[var(--color-border)] rounded-lg font-bold text-lg transition-colors"
              >
                RUN
              </button>
            </div>
          )}

          {phase === "picking" && uiView === "fight" && (
            <div className="flex flex-col h-full">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-bold text-[var(--color-text-primary)]">Select a move:</span>
                <button onClick={() => setUiView("main")} className="text-xs text-[var(--color-text-muted)] hover:text-white uppercase">Cancel</button>
              </div>
              <div className="grid grid-cols-2 gap-2 flex-1">
                {me.active.moves.map((m, i) => (
                  <button 
                    key={i}
                    onClick={() => handleMove(m)}
                    disabled={m.currentPp <= 0}
                    className="flex flex-col items-start justify-center px-3 py-2 bg-[var(--color-bg-panel)] hover:bg-[var(--color-bg-hover)] border border-[var(--color-border)] rounded disabled:opacity-50 transition-colors"
                  >
                    <div className="flex justify-between w-full">
                      <span className="font-bold text-[var(--color-text-primary)]">{m.name}</span>
                      <span className="text-xs font-mono text-[var(--color-text-secondary)]">PP {m.currentPp}/{m.pp}</span>
                    </div>
                    <div className="text-[0.65rem] text-[var(--color-text-muted)] uppercase tracking-wider">
                      {m.type}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {(uiView === "switch" || phase === "force-switch") && (
            <div className="flex flex-col h-full overflow-y-auto custom-scrollbar pr-2">
              <div className="flex justify-between items-center mb-2 sticky top-0 bg-[var(--color-bg-deep)] z-10 pb-1">
                <span className="text-sm font-bold text-[var(--color-text-primary)]">
                  {phase === "force-switch" ? "Choose replacement:" : "Switch to:"}
                </span>
                {phase !== "force-switch" && (
                  <button onClick={() => setUiView("main")} className="text-xs text-[var(--color-text-muted)] hover:text-white uppercase">Cancel</button>
                )}
              </div>
              <div className="flex flex-col gap-2">
                {(phase === "force-switch" ? forceSwitchBench : me.bench).map((b) => (
                  <button
                    key={b.benchIndex}
                    onClick={() => handleSwitch(b.benchIndex)}
                    disabled={b.currentHp <= 0}
                    className="flex items-center gap-3 p-2 bg-[var(--color-bg-panel)] hover:bg-[var(--color-bg-hover)] border border-[var(--color-border)] rounded disabled:opacity-50 transition-colors text-left"
                  >
                    <img src={b.spriteUrl} alt={b.name} className="w-8 h-8 object-contain" />
                    <div className="flex-1">
                      <div className="font-bold text-sm text-[var(--color-text-primary)]">{b.name}</div>
                      <HpBar current={b.currentHp} max={b.maxHp} size="sm" showText={false} />
                    </div>
                    <div className="text-xs font-mono text-[var(--color-text-secondary)]">
                      {b.currentHp}/{b.maxHp}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Log */}
        <div className="flex-1">
          <BattleLog entries={logEntries} />
        </div>

      </div>

      {/* Disconnect / Reconnect Modals */}
      {!isConnected && !modalMessage && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-yellow-500/90 text-yellow-950 px-6 py-2 rounded-full font-bold shadow-lg z-50 flex items-center gap-2 animate-bounce">
          <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></span>
          Connection lost. Reconnecting...
        </div>
      )}

      {opponentReconnectingMsg && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-40 p-4">
          <div className="glass-card p-6 max-w-sm w-full text-center space-y-4">
            <div className="w-8 h-8 border-4 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin mx-auto"></div>
            <h2 className="text-lg font-bold text-[var(--color-text-primary)]">{opponentReconnectingMsg}</h2>
            <p className="text-[var(--color-text-secondary)] text-sm">Please do not leave the page.</p>
          </div>
        </div>
      )}

      {modalMessage && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="glass-card p-8 max-w-sm w-full text-center space-y-6">
            <div className="text-4xl">🔌</div>
            <h2 className="text-xl font-bold text-[var(--color-text-primary)]">Connection Lost</h2>
            <p className="text-[var(--color-text-secondary)]">{modalMessage}</p>
            <button 
              onClick={() => { socket.disconnect(); navigate("/"); }}
              className="w-full py-2 bg-[var(--color-primary)] text-white rounded font-bold hover:bg-[var(--color-primary-light)] transition-colors"
            >
              Return to Lobby
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
