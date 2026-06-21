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
  const [rematchWaiting, setRematchWaiting] = useState(false);
  const [floatingEvents, setFloatingEvents] = useState([]);
  const [lockedAction, setLockedAction] = useState(null);

  // Removes a floating event after its animation finishes
  const removeFloatingEvent = useCallback((id) => {
    setFloatingEvents((prev) => prev.filter((e) => e.id !== id));
  }, []);

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

    function handleBattleStart({ state }) {
      setGameState(state);
      setLogEntries(["Battle started!"]);
      setUiView("main");
      setRematchWaiting(false);
    }

    function handleTurnResult({ state, log, events }) {
      setGameState(state);
      setLockedAction(null);
      if (log && log.length > 0) {
        setLogEntries((prev) => [...prev, ...log]);
      }
      if (events && events.length > 0) {
        const timedEvents = events.map((e, idx) => ({ 
          ...e, 
          id: Math.random().toString(36).substring(2, 9),
          delay: idx * 1200 // Stagger by 1.2s each
        }));
        setFloatingEvents((prev) => [...prev, ...timedEvents]);
      }
      setUiView("main");
    }

    function handleForceSwitchResult({ state, log }) {
      setGameState(state);
      setLockedAction(null);
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
      setRematchWaiting(false);
      // state.phase will also be 'battle-over'
    }

    function handleRematchWaiting() {
      setRematchWaiting(true);
    }

    function handleError({ message }) {
      alert(`Error: ${message}`);
    }

    socket.on("action-received", handleActionReceived);
    socket.on("battle-start", handleBattleStart);
    socket.on("turn-result", handleTurnResult);
    socket.on("force-switch-result", handleForceSwitchResult);
    socket.on("opponent-reconnecting", handleOpponentReconnecting);
    socket.on("battle-reconnected", handleBattleReconnected);
    socket.on("opponent-disconnected", handleOpponentDisconnected);
    socket.on("battle-over", handleBattleOver);
    socket.on("rematch-waiting", handleRematchWaiting);
    socket.on("error", handleError);

    return () => {
      socket.off("action-received", handleActionReceived);
      socket.off("battle-start", handleBattleStart);
      socket.off("turn-result", handleTurnResult);
      socket.off("force-switch-result", handleForceSwitchResult);
      socket.off("opponent-reconnecting", handleOpponentReconnecting);
      socket.off("battle-reconnected", handleBattleReconnected);
      socket.off("opponent-disconnected", handleOpponentDisconnected);
      socket.off("battle-over", handleBattleOver);
      socket.off("rematch-waiting", handleRematchWaiting);
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
    setLockedAction({ type: "move", move });
    socket.emit("submit-action", { type: "move", move });
  };

  const handleSwitch = (switchToIndex) => {
    if (phase === "force-switch") {
      socket.emit("submit-force-switch", { switchTo: switchToIndex });
    } else {
      setLockedAction({ type: "switch", switchTo: switchToIndex });
      socket.emit("submit-action", { type: "switch", switchTo: switchToIndex });
    }
  };

  const renderStatusIcon = (status) => {
    if (!status) return null;
    const colors = {
      burn: "bg-red-500 border-red-300 text-white",
      poison: "bg-purple-600 border-purple-300 text-white",
      paralysis: "bg-yellow-400 border-yellow-200 text-black",
      sleep: "bg-slate-500 border-slate-300 text-white",
      freeze: "bg-cyan-400 border-cyan-100 text-black",
    };
    const labels = {
      burn: "BRN",
      poison: "PSN",
      paralysis: "PAR",
      sleep: "SLP",
      freeze: "FRZ",
    };
    return (
      <div className={`absolute -bottom-2 sm:-bottom-0 -right-2 sm:-right-4 px-2 py-0.5 rounded-sm text-[10px] sm:text-xs font-black border shadow-md ${colors[status]} z-10 tracking-wider`}>
        {labels[status]}
      </div>
    );
  };

  const FloatingDamage = ({ event }) => {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
      const showTimer = setTimeout(() => setVisible(true), event.delay || 0);
      const removeTimer = setTimeout(() => removeFloatingEvent(event.id), (event.delay || 0) + 2000);
      return () => { clearTimeout(showTimer); clearTimeout(removeTimer); };
    }, [event.id, event.delay]);

    if (!visible || event.type === "faint") return null;

    let subtext = "";
    let color = "text-white";
    if (event.effectiveness >= 2) {
      subtext = "Super Effective!";
      color = "text-[var(--color-warning)]";
    } else if (event.effectiveness <= 0.5 && event.effectiveness > 0) {
      subtext = "Not very effective...";
      color = "text-gray-400";
    } else if (event.effectiveness === 0) {
      subtext = "No effect!";
      color = "text-gray-500";
    }

    return (
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 pointer-events-none animate-float-up z-50 flex flex-col items-center">
        <span className={`text-4xl font-black ${color} drop-shadow-[0_4px_4px_rgba(0,0,0,0.8)] tabular-nums`}>
          -{event.amount}
        </span>
        {subtext && (
          <span className={`text-sm font-bold ${color} drop-shadow-md mt-1 whitespace-nowrap`}>
            {subtext}
          </span>
        )}
      </div>
    );
  };

  const renderActivePokemon = (p, isOpponent) => {
    const targetKey = isOpponent ? "opponent" : "me";
    const myEvents = floatingEvents.filter(e => e.target === targetKey);

    return (
      <div className={`flex flex-col sm:flex-row items-center sm:items-end gap-2 sm:gap-4 ${isOpponent ? "" : "sm:flex-row-reverse"}`}>
        <div className="relative w-24 h-24 sm:w-32 sm:h-32 flex-shrink-0">
          <img 
            src={p.spriteUrl} 
            alt={p.name} 
            className={`w-full h-full object-contain ${p.currentHp <= 0 ? "animate-faint-sink" : "transition-all duration-500"}`}
          />
          {renderStatusIcon(p.status)}
          {myEvents.map(e => <FloatingDamage key={e.id} event={e} />)}
        </div>
        <div className={`glass-card p-3 w-full sm:w-auto sm:flex-1 max-w-[240px] transition-opacity duration-500 ${p.currentHp <= 0 ? "opacity-30" : ""}`}>
          <div className="flex justify-between items-baseline mb-1">
            <div className="font-bold text-[var(--color-text-primary)] text-sm sm:text-base">
              {p.name}
            </div>
            <div className="text-[10px] sm:text-xs font-mono text-[var(--color-text-muted)]">Lv.100</div>
          </div>
          <HpBar current={p.currentHp} max={p.maxHp} />
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-[var(--color-bg-deep)] p-2 sm:p-4 max-w-4xl mx-auto gap-2 sm:gap-4 font-body">
      
      {/* Header */}
      <div className="flex justify-between items-center glass-card px-4 py-2 flex-shrink-0">
        <div className="text-sm font-bold text-[var(--color-text-secondary)]">
          Turn {turn}
        </div>
        <div className="flex gap-1">
          {opponent.bench.map((b, i) => (
            <div key={i} className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full ${b.currentHp > 0 ? "bg-[var(--color-primary)]" : "bg-[var(--color-danger)] opacity-50"}`} />
          ))}
        </div>
      </div>

      {/* Battle Field */}
      <div className="flex-1 glass-card relative p-4 sm:p-6 flex flex-col justify-between overflow-y-auto bg-gradient-to-b from-[#1a202c] to-[#0f172a]">
        {/* Opponent */}
        <div className="self-start w-full">
          {renderActivePokemon(opponent.active, true)}
        </div>
        
        {/* Player */}
        <div className="self-end w-full mt-4 sm:mt-8">
          {renderActivePokemon(me.active, false)}
        </div>
      </div>

      {/* Bottom Area: Controls + Log */}
      <div className="flex flex-col md:flex-row gap-2 sm:gap-4 h-auto md:h-48 flex-shrink-0">
        
        {/* Controls */}
        <div className="flex-1 glass-card p-3 sm:p-4 min-h-[160px] md:min-h-0">
          
          {phase === "waiting" && (
            <div className="flex flex-col h-full items-center justify-center text-[var(--color-text-secondary)] gap-3">
              <div className="flex items-center gap-2 animate-pulse">
                <div className="w-2.5 h-2.5 rounded-full bg-[var(--color-primary)]"></div>
                <span className="font-medium">Waiting for opponent...</span>
              </div>
              {lockedAction && (
                <div className="text-xs text-[var(--color-text-muted)] bg-[var(--color-bg-deep)] px-3 py-1.5 rounded-full border border-[var(--color-border)]">
                  Locked in: <strong className="text-white">{lockedAction.type === "move" ? lockedAction.move.name : "Switch"}</strong>
                </div>
              )}
            </div>
          )}

          {phase === "picking" && uiView === "main" && (
            <div className="grid grid-cols-2 gap-3 h-full">
              <button 
                onClick={() => setUiView("fight")}
                className="bg-[var(--color-primary-dim)] hover:bg-[var(--color-primary)] border border-[var(--color-border-glow)] rounded text-[var(--color-text-primary)] font-bold transition-colors text-lg"
              >
                FIGHT
              </button>
              <button 
                onClick={() => setUiView("switch")}
                className="bg-[var(--color-bg-panel)] hover:bg-[var(--color-bg-hover)] border border-[var(--color-border)] rounded text-[var(--color-text-secondary)] font-bold transition-colors text-lg"
              >
                POKéMON
              </button>
            </div>
          )}

          {phase === "picking" && uiView === "fight" && (
            <div className="flex flex-col h-full">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-bold text-[var(--color-text-primary)]">Select a move:</span>
                <button onClick={() => setUiView("main")} className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] uppercase font-bold tracking-wider">Cancel</button>
              </div>
              <div className="grid grid-cols-2 gap-2 flex-1">
                {me.active.moves.map((m, i) => (
                  <button 
                    key={i}
                    onClick={() => handleMove(m)}
                    disabled={m.currentPp <= 0}
                    className="flex flex-col items-start justify-center px-3 py-2 rounded disabled:opacity-50 transition-colors border"
                    style={{
                      borderColor: `var(--color-type-${m.type.toLowerCase()})`,
                      backgroundColor: `color-mix(in srgb, var(--color-type-${m.type.toLowerCase()}) 15%, var(--color-bg-panel))`,
                    }}
                  >
                    <div className="flex justify-between w-full">
                      <span className="font-bold text-[var(--color-text-primary)]">{m.name}</span>
                      <span className="text-xs font-mono text-[var(--color-text-secondary)]">PP {m.currentPp}/{m.pp}</span>
                    </div>
                    <div className="text-[0.65rem] text-[var(--color-text-muted)] uppercase tracking-wider font-bold">
                      {m.type}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {uiView === "switch" && phase !== "force-switch" && (
            <div className="flex flex-col h-full overflow-y-auto custom-scrollbar pr-2">
              <div className="flex justify-between items-center mb-2 sticky top-0 bg-[var(--color-bg-deep)] z-10 pb-1">
                <span className="text-sm font-bold text-[var(--color-text-primary)]">
                  Switch to:
                </span>
                <button onClick={() => setUiView("main")} className="text-xs text-[var(--color-text-muted)] hover:text-white uppercase">Cancel</button>
              </div>
              <div className="flex flex-col gap-2">
                {me.bench.map((b) => (
                  <button
                    key={b.benchIndex}
                    onClick={() => handleSwitch(b.benchIndex)}
                    disabled={b.currentHp <= 0}
                    className="flex items-center gap-3 p-2 bg-[var(--color-bg-panel)] hover:bg-[var(--color-bg-hover)] border border-[var(--color-border)] rounded disabled:opacity-50 transition-colors text-left"
                  >
                    <img src={b.spriteUrl} alt={b.name} className="w-10 h-10 object-contain" />
                    <div className="flex-1">
                      <div className="font-bold text-[var(--color-text-primary)] text-sm">{b.name}</div>
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

      {/* Opponent Reconnecting Modal */}
      {opponentReconnectingMsg && (
        <div className="absolute inset-0 z-40 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card p-6 text-center max-w-sm w-full animate-fade-in border-[var(--color-warning)]">
            <div className="text-[var(--color-warning)] mb-4 w-8 h-8 mx-auto animate-spin rounded-full border-2 border-[var(--color-warning)] border-t-transparent"></div>
            <div className="font-bold text-lg mb-2">{opponentReconnectingMsg}</div>
            <div className="text-sm text-[var(--color-text-muted)]">
              The battle will resume automatically.
            </div>
          </div>
        </div>
      )}

      {/* Force Switch Modal Drawer */}
      {phase === "force-switch" && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm p-2 sm:p-4 animate-fade-in">
          <div className="w-full max-w-xl bg-[var(--color-bg-deep)] border border-[var(--color-border)] rounded-t-xl p-4 sm:p-6 shadow-2xl animate-slide-up pb-10">
            <div className="text-xl font-bold text-[var(--color-danger)] mb-4 text-center">Your Pokémon fainted! Choose replacement:</div>
            <div className="flex flex-col gap-3 max-h-[60vh] overflow-y-auto custom-scrollbar">
              {forceSwitchBench.map((b) => (
                <button
                  key={b.benchIndex}
                  onClick={() => handleSwitch(b.benchIndex)}
                  disabled={b.currentHp <= 0}
                  className="flex items-center gap-4 p-4 bg-[var(--color-bg-panel)] hover:bg-[var(--color-bg-hover)] border border-[var(--color-border)] rounded-lg disabled:opacity-50 transition-colors text-left"
                >
                  <img src={b.spriteUrl} alt={b.name} className="w-14 h-14 object-contain" />
                  <div className="flex-1">
                    <div className="font-bold text-[var(--color-text-primary)] text-lg mb-1">{b.name}</div>
                    <HpBar current={b.currentHp} max={b.maxHp} size="md" />
                  </div>
                </button>
              ))}
            </div>
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
