import { useEffect, useState, useCallback } from "react";
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
  const [modalMessage, setModalMessage] = useState(null);
  const [opponentReconnectingMsg, setOpponentReconnectingMsg] = useState(null);
  const [rematchWaiting, setRematchWaiting] = useState(false);
  const [floatingEvents, setFloatingEvents] = useState([]);
  const [lockedAction, setLockedAction] = useState(null);
  const [isReconnecting, setIsReconnecting] = useState(false);

  // Removes a floating event after its animation finishes
  const removeFloatingEvent = useCallback((id) => {
    setFloatingEvents((prev) => prev.filter((e) => e.id !== id));
  }, []);

  useEffect(() => {
    if (!gameState) {
      navigate("/build");
      return;
    }
    if (!socket) return;

    function handleActionReceived() {
      // Local optimistic update — Phase 4 says the server state will soon catch up
      setGameState((prev) => ({ ...prev, phase: "waiting" }));
    }

    function handleBattleStart({ state }) {
      setGameState(state);
      setLogEntries(["Battle started!"]);
      setRematchWaiting(false);
    }

    function handleTurnResult({ state, log, events }) {
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

        // Stagger HP updates visually before setting final state
        events.forEach((event, idx) => {
          setTimeout(() => {
            if (event.type === "damage") {
              setGameState(prev => {
                if (!prev) return prev;
                const next = { ...prev };
                if (next[event.targetKey]) {
                  next[event.targetKey] = {
                    ...next[event.targetKey],
                    active: {
                      ...next[event.targetKey].active,
                      currentHp: Math.max(0, next[event.targetKey].active.currentHp - event.amount)
                    }
                  };
                }
                return next;
              });
            }
          }, idx * 1200 + 100);
        });

        const totalDelay = events.length * 1200 + 1000;
        setTimeout(() => {
          setGameState(state);
        }, totalDelay);

      } else {
        setGameState(state);
      }
    }

    function handleForceSwitchResult({ state, log }) {
      setGameState(state);
      setLockedAction(null);
      if (log && log.length > 0) {
        setLogEntries((prev) => [...prev, ...log]);
      }
    }

    function handleOpponentReconnecting({ message }) {
      setOpponentReconnectingMsg(message);
    }

    function handleBattleReconnected({ state, message }) {
      setGameState(state);
      setOpponentReconnectingMsg(null);
      setModalMessage(null);
      setIsReconnecting(false);
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
      console.error(`Battle Error: ${message}`);
      if (message.includes("Room not found")) {
        navigate("/lobby");
      }
    }

    function handleDisconnect() {
      setIsReconnecting(true);
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
    socket.on("disconnect", handleDisconnect);

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
      socket.off("disconnect", handleDisconnect);
    };
  }, [socket, gameState, navigate]);

  // Auto-reconnect flow
  useEffect(() => {
    if (!isConnected || !socket) return;
    const code = sessionStorage.getItem("poke-room-code");
    const sessionId = sessionStorage.getItem("poke-session-id");
    const savedTeam = sessionStorage.getItem("poke-team-final");
    if (code && sessionId && savedTeam) {
      socket.emit("join-room", { code, sessionId, team: JSON.parse(savedTeam) });
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

  const renderStatStages = (stages) => {
    if (!stages) return null;
    const icons = {
      attack: "⚔️", defense: "🛡️", specialAttack: "🔮", specialDefense: "🔰", speed: "👟", accuracy: "🎯", evasion: "💨"
    };
    
    return (
      <div className="flex gap-1 flex-wrap mt-1">
        {Object.entries(stages).map(([stat, val]) => {
          if (val === 0) return null;
          const isPos = val > 0;
          const color = isPos ? "text-green-500" : "text-red-400";
          const arrow = isPos ? "↑" : "↓";
          return (
            <div key={stat} title={`${stat}: ${val}`} className={`text-[9px] font-bold ${color} bg-[var(--color-bg-deep)] px-1 rounded border border-[var(--color-border)] shadow-sm flex items-center`}>
              {icons[stat] || ""} {arrow}{Math.abs(val)}
            </div>
          );
        })}
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
    let color = "text-[var(--color-text-primary)]";
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
    const myEvents = floatingEvents.filter(e => e.targetKey === targetKey);

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
        <div className={`group relative cursor-help bg-white border-4 border-[var(--color-text-primary)] rounded-2xl p-3 w-full sm:w-auto sm:flex-1 max-w-[240px] transition-opacity duration-500 shadow-[0_6px_0_var(--color-text-primary)] ${p.currentHp <= 0 ? "opacity-30" : ""}`}>
          <div className="flex justify-between items-baseline mb-1">
            <div className="font-bold text-[var(--color-text-primary)] text-sm sm:text-base">
              {p.name}
            </div>
            <div className="text-[10px] sm:text-xs font-mono text-[var(--color-text-muted)]">Lv.100</div>
          </div>
          <HpBar current={p.currentHp} max={p.maxHp} />
          {renderStatStages(p.statStages)}
          
          {/* Pokemon Tooltip */}
          {p.currentStats && (
            <div className={`hidden group-hover:block absolute ${isOpponent ? 'top-full left-0 mt-2' : 'bottom-full right-0 mb-2'} w-64 p-3 bg-[var(--color-bg-card)] border-4 border-[var(--color-text-primary)] rounded-2xl shadow-[0_6px_0_var(--color-text-primary)] text-left z-[100] text-xs cursor-default`}>
              <div className="font-bold text-[var(--color-text-primary)] mb-1 text-sm flex justify-between items-center">
                <span>{p.name}</span>
                <div className="flex gap-1">
                  {p.types.map(t => (
                    <span key={t} className="px-1.5 py-0.5 rounded uppercase tracking-wider text-[9px] text-white" style={{ backgroundColor: `var(--color-type-${t.toLowerCase()})` }}>{t}</span>
                  ))}
                </div>
              </div>
              <div className="text-[var(--color-text-secondary)] mb-1">
                HP: {Math.max(0, p.currentHp)} / {p.maxHp} ({Math.round(Math.max(0, p.currentHp)/p.maxHp*100)}%)
              </div>
              {p.heldItem && (
                <div className="text-[var(--color-text-secondary)] mb-2 capitalize">
                  Item: <span className="text-[var(--color-text-primary)]">{p.heldItem.replace(/-/g, " ")}</span>
                </div>
              )}
              <div className="grid grid-cols-5 gap-1 pt-2 border-t border-[var(--color-border)] text-center text-[10px]">
                <div><div className="text-[var(--color-text-muted)] font-bold">Atk</div><div className="text-[var(--color-text-primary)]">{p.currentStats.attack}</div></div>
                <div><div className="text-[var(--color-text-muted)] font-bold">Def</div><div className="text-[var(--color-text-primary)]">{p.currentStats.defense}</div></div>
                <div><div className="text-[var(--color-text-muted)] font-bold">SpA</div><div className="text-[var(--color-text-primary)]">{p.currentStats.specialAttack}</div></div>
                <div><div className="text-[var(--color-text-muted)] font-bold">SpD</div><div className="text-[var(--color-text-primary)]">{p.currentStats.specialDefense}</div></div>
                <div><div className="text-[var(--color-text-muted)] font-bold">Spe</div><div className="text-[var(--color-text-primary)]">{p.currentStats.speed}</div></div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-[var(--color-bg-deep)] p-2 sm:p-4 max-w-6xl mx-auto gap-2 sm:gap-4 font-body">
      
      {/* Header */}
      <div className="flex justify-between items-center bg-white border-4 border-[var(--color-text-primary)] rounded-xl px-4 py-2 flex-shrink-0 shadow-[0_4px_0_var(--color-text-primary)]">
        <div className="flex items-center gap-4">
          <div className="text-sm font-bold text-[var(--color-text-secondary)]">
            Turn {turn}
          </div>
          <button
            onClick={() => {
              if (phase !== 'battle-over' && window.confirm("Are you sure you want to run? You will forfeit the match!")) {
                socket.emit("submit-forfeit");
              }
            }}
            disabled={phase === 'battle-over'}
            className="px-3 py-1 bg-[var(--color-danger)] text-white border-2 border-red-800 rounded-lg font-black uppercase text-[10px] sm:text-xs hover:-translate-y-0.5 hover:shadow-[0_2px_0_#7f1d1d] active:translate-y-0 active:shadow-none transition-all disabled:opacity-50"
          >
            Run
          </button>
        </div>
        <div className="flex gap-1">
          {opponent.bench.map((b, i) => (
            <div key={i} className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full ${b.currentHp > 0 ? "bg-[var(--color-primary)]" : "bg-[var(--color-danger)] opacity-50"}`} />
          ))}
        </div>
      </div>

      {/* Main Layout Split */}
      <div className="flex flex-col lg:flex-row gap-2 sm:gap-4 flex-1 min-h-0">
        
        {/* Left Column (Battle Field + Controls) */}
        <div className="flex flex-col flex-1 gap-2 sm:gap-4 min-w-0">
          
          {/* Battle Field */}
          <div className="flex-1 bg-gradient-to-b from-green-300 to-green-500 border-4 border-[var(--color-text-primary)] rounded-3xl relative p-4 sm:p-6 flex flex-col justify-between overflow-y-auto shadow-[inset_0_10px_20px_rgba(0,0,0,0.1)]">
            {/* Environment Decor */}
            <div className="absolute inset-0 opacity-20 pointer-events-none bg-[radial-gradient(ellipse_at_center,_#ffffff_0%,_transparent_70%)]"></div>
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPgo8cmVjdCB3aWR0aD0iOCIgaGVpZ2h0PSI4IiBmaWxsPSJ0cmFuc3BhcmVudCIvPgo8Y2lyY2xlIGN4PSI0IiBjeT0iNCIgcj0iMiIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjA1KSIvPgo8L3N2Zz4=')] opacity-50"></div>
            
            {/* Opponent (Top Right) */}
            <div className="self-end w-full flex justify-end">
              {renderActivePokemon(opponent.active, true)}
            </div>
            
            {/* Player (Bottom Left) */}
            <div className="self-start w-full mt-4 sm:mt-8">
              {renderActivePokemon(me.active, false)}
            </div>
          </div>

          {/* Controls Area */}
          <div className="bg-white border-4 border-[var(--color-text-primary)] rounded-3xl p-3 sm:p-4 flex-shrink-0 min-h-[160px] lg:min-h-[14rem] flex flex-col justify-center shadow-[0_8px_0_var(--color-text-primary)]">
            {phase === "waiting" && (
              <div className="flex flex-col h-full items-center justify-center text-[var(--color-text-secondary)] gap-3">
                <div className="flex items-center gap-2 animate-pulse">
                  <div className="w-2.5 h-2.5 rounded-full bg-[var(--color-primary)]"></div>
                  <span className="font-medium">Waiting for opponent...</span>
                </div>
                {lockedAction && (
                  <div className="text-xs text-[var(--color-text-muted)] bg-[var(--color-bg-deep)] px-3 py-1.5 rounded-full border border-[var(--color-border)]">
                    Locked in: <strong className="text-[var(--color-text-primary)]">{lockedAction.type === "move" ? lockedAction.move.name : "Switch"}</strong>
                  </div>
                )}
              </div>
            )}

            {phase === "picking" && (
              <div className="grid grid-cols-1 lg:grid-cols-2 h-full gap-4 overflow-y-auto lg:overflow-visible">
                {/* Moves (Left half on desktop) */}
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-[var(--color-text-primary)] mb-2">Attack:</span>
                  <div className="grid grid-cols-2 gap-2 flex-1">
                    {me.active.moves.map((m, i) => (
                      <button 
                        key={i}
                        onClick={() => handleMove(m)}
                        disabled={m.currentPp <= 0}
                        className="group relative flex flex-col items-start justify-center px-2 sm:px-3 py-2 rounded-xl disabled:opacity-50 transition-all border-4 move-btn cursor-pointer hover:-translate-y-1 active:translate-y-1 active:shadow-none"
                        style={{
                          borderColor: `var(--color-type-${m.type.toLowerCase()})`,
                          backgroundColor: `color-mix(in srgb, var(--color-type-${m.type.toLowerCase()}) 15%, #ffffff)`,
                          boxShadow: m.currentPp > 0 ? `0 4px 0 var(--color-type-${m.type.toLowerCase()})` : 'none'
                        }}
                      >
                        <div className="flex justify-between w-full items-center">
                          <span className="font-bold text-[var(--color-text-primary)] text-sm">{m.name}</span>
                          <span className="text-[10px] font-mono text-[var(--color-text-secondary)]">PP {m.currentPp}/{m.pp}</span>
                        </div>
                        <div className="text-[0.65rem] text-[var(--color-text-muted)] uppercase tracking-wider font-bold">
                          {m.type}
                        </div>

                        {/* Move Tooltip */}
                        <div className="hidden lg:group-hover:block absolute bottom-full left-0 mb-2 w-56 p-2 bg-[var(--color-bg-panel)] border border-[var(--color-border)] rounded shadow-2xl text-left z-[100] text-xs cursor-default">
                          <div className="font-bold text-[var(--color-text-primary)] mb-1.5 flex items-center gap-2">
                            <span className="px-1.5 py-0.5 rounded uppercase tracking-wider text-[9px] text-white" style={{ backgroundColor: `var(--color-type-${m.type.toLowerCase()})` }}>{m.type}</span>
                            {m.damageClass && <span className="text-[var(--color-text-muted)] capitalize text-[10px]">{m.damageClass}</span>}
                          </div>
                          <div className="text-[var(--color-text-secondary)] mb-1.5">
                            Power: <span className="text-[var(--color-text-primary)]">{m.power || "—"}</span> | Acc: <span className="text-[var(--color-text-primary)]">{m.accuracy || "—"}</span>
                          </div>
                          <div className="text-[var(--color-text-primary)] leading-snug">
                            {m.effect || "No additional effect."}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Switch Bench (Right half on desktop) */}
                <div className="flex flex-col lg:border-l border-[var(--color-border)] lg:pl-4">
                  <span className="text-sm font-bold text-[var(--color-text-primary)] mb-2">Switch:</span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 gap-2">
                    {me.bench.map((b) => (
                      <button
                        key={b.benchIndex}
                        onClick={() => handleSwitch(b.benchIndex)}
                        disabled={b.currentHp <= 0}
                        className="flex items-center gap-2 p-1.5 bg-gray-50 border-4 border-[var(--color-border)] rounded-xl disabled:opacity-50 transition-all text-left bench-btn cursor-pointer hover:-translate-y-1 hover:shadow-[0_4px_0_var(--color-border)] active:translate-y-1 active:shadow-none"
                      >
                        <img src={b.spriteUrl} alt={b.name} className="w-8 h-8 object-contain drop-shadow-md" />
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-[var(--color-text-primary)] text-xs truncate mb-0.5">{b.name}</div>
                          <HpBar current={b.currentHp} max={b.maxHp} size="sm" showText={false} />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column (Battle Log) */}
        <div className="w-full lg:w-96 flex flex-col flex-shrink-0 h-64 lg:h-auto min-h-0">
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
        <div className="absolute inset-0 z-40 bg-[var(--color-bg-deep)]/50 backdrop-blur-sm flex items-center justify-center p-4">
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
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--color-bg-deep)]/60 backdrop-blur-sm p-2 sm:p-4 animate-fade-in">
          <div className="w-full max-w-xl bg-white border-4 border-[var(--color-text-primary)] rounded-t-3xl p-4 sm:p-6 shadow-[0_-10px_0_var(--color-text-primary)] animate-slide-up pb-10">
            <div className="text-xl font-black text-[var(--color-danger)] mb-4 text-center uppercase tracking-widest">Your Pokémon fainted! Choose replacement:</div>
            <div className="flex flex-col gap-3 max-h-[60vh] overflow-y-auto custom-scrollbar">
              {forceSwitchBench.map((b) => (
                <button
                  key={b.benchIndex}
                  onClick={() => handleSwitch(b.benchIndex)}
                  disabled={b.currentHp <= 0}
                  className="flex items-center gap-4 p-4 bg-[var(--color-bg-panel)] hover:bg-[var(--color-bg-hover)] border-4 border-[var(--color-border)] rounded-2xl disabled:opacity-50 transition-all hover:-translate-y-1 hover:shadow-[0_4px_0_var(--color-border)] active:translate-y-1 active:shadow-none text-left"
                >
                  <img src={b.spriteUrl} alt={b.name} className="w-14 h-14 object-contain drop-shadow-md" />
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
        <div className="fixed inset-0 bg-[var(--color-bg-deep)]/80 flex items-center justify-center z-50 p-4">
          <div className="glass-card p-8 max-w-sm w-full text-center space-y-6">
            <div className="text-4xl">🔌</div>
            <h2 className="text-xl font-black text-[var(--color-text-primary)] uppercase tracking-wider">Connection Lost</h2>
            <p className="text-[var(--color-text-secondary)] font-bold">{modalMessage}</p>
            <button 
              onClick={() => { socket.disconnect(); navigate("/build"); }}
              className="w-full py-3 bg-[var(--color-danger)] text-white rounded-2xl font-black uppercase tracking-widest border-4 border-red-700 shadow-[0_6px_0_#991b1b] hover:-translate-y-1 hover:shadow-[0_8px_0_#991b1b] active:translate-y-2 active:shadow-none transition-all"
            >
              Return to Lobby
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
