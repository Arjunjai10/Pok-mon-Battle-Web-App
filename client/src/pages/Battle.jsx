import { useEffect, useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useSocket } from "../context/SocketContext";
import HpBar from "../components/HpBar";
import BattleLog from "../components/BattleLog";
import PokemonSprite from "../components/PokemonSprite";

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
  
  const [pendingMove, setPendingMove] = useState(null);

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
      setGameState((prev) => ({ ...prev, phase: "waiting" }));
    }

    function handleBattleStart({ state }) {
      setGameState(state);
      setLogEntries(["Battle started!"]);
      setRematchWaiting(false);
    }

    function handleTurnResult({ state, log, events }) {
      setLockedAction(null);
      setPendingMove(null);
      if (log && log.length > 0) {
        setLogEntries((prev) => [...prev, ...log]);
      }
      if (events && events.length > 0) {
        const timedEvents = events.map((e, idx) => ({ 
          ...e, 
          id: Math.random().toString(36).substring(2, 9),
          delay: idx * 1200 
        }));
        setFloatingEvents((prev) => [...prev, ...timedEvents]);

        events.forEach((event, idx) => {
          setTimeout(() => {
            if (event.type === "damage") {
              setGameState(prev => {
                if (!prev) return prev;
                const next = { ...prev };
                if (event.targetKey === next.me.id || event.targetKey === next.me.playerKey) {
                    next.me = { ...next.me, active: { ...next.me.active, currentHp: Math.max(0, next.me.active.currentHp - event.amount) } };
                } else if (next.opponents) {
                    next.opponents = next.opponents.map(opp => {
                        if (opp.playerKey === event.targetKey || opp.id === event.targetKey) {
                            return { ...opp, active: { ...opp.active, currentHp: Math.max(0, opp.active.currentHp - event.amount) } };
                        }
                        return opp;
                    });
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
      setPendingMove(null);
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
      setPendingMove(null);
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

  const { me, opponents = [], phase, turn, forceSwitchBench } = gameState;

  const handleMove = (move) => {
    const isMultiTarget = ["earthquake", "surf", "blizzard", "thunder", "self-destruct", "explosion"].includes(move.name.toLowerCase());
    
    if (isMultiTarget) {
       setLockedAction({ type: "move", move });
       socket.emit("submit-action", { type: "move", move, targetId: "all" });
    } else {
       const aliveOpponents = opponents.filter(o => o.active.currentHp > 0);
       if (aliveOpponents.length === 1) {
         setLockedAction({ type: "move", move });
         socket.emit("submit-action", { type: "move", move, targetId: aliveOpponents[0].playerKey });
       } else if (aliveOpponents.length === 0) {
         setLockedAction({ type: "move", move });
         socket.emit("submit-action", { type: "move", move });
       } else {
         setPendingMove(move);
       }
    }
  };

  const handleSelectTarget = (targetId) => {
    if (!pendingMove) return;
    setLockedAction({ type: "move", move: pendingMove });
    socket.emit("submit-action", { type: "move", move: pendingMove, targetId });
    setPendingMove(null);
  };

  const handleSwitch = (switchToIndex) => {
    setPendingMove(null);
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
      burn: "bg-gradient-to-r from-red-600 to-orange-500 text-white shadow-[0_0_10px_rgba(239,68,68,0.8)] border-white/40",
      poison: "bg-gradient-to-r from-purple-700 to-fuchsia-600 text-white shadow-[0_0_10px_rgba(147,51,234,0.8)] border-white/40",
      paralysis: "bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950 font-black shadow-[0_0_10px_rgba(245,158,11,0.8)] border-slate-900/40",
      sleep: "bg-gradient-to-r from-slate-600 to-slate-500 text-white shadow-[0_0_10px_rgba(100,116,139,0.8)] border-white/40",
      freeze: "bg-gradient-to-r from-cyan-500 to-blue-400 text-slate-950 font-black shadow-[0_0_10px_rgba(6,182,212,0.8)] border-white/60",
    };
    const labels = { burn: "BRN", poison: "PSN", paralysis: "PAR", sleep: "SLP", freeze: "FRZ" };
    return (
      <div className={`absolute -top-2 right-0 px-2.5 py-0.5 rounded-full text-[10px] sm:text-xs font-black border z-30 tracking-wider uppercase animate-bounce ${colors[status]}`}>
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
      <div className="flex gap-1.5 flex-wrap mt-2">
        {Object.entries(stages).map(([stat, val]) => {
          if (val === 0) return null;
          const isPos = val > 0;
          const color = isPos ? "text-emerald-400 border-emerald-500/40 bg-emerald-500/10" : "text-rose-400 border-rose-500/40 bg-rose-500/10";
          const arrow = isPos ? "▲" : "▼";
          return (
            <div key={stat} title={`${stat}: ${val}`} className={`text-[10px] font-black ${color} px-1.5 py-0.5 rounded-md border shadow-sm flex items-center gap-1`}>
              <span>{icons[stat] || ""}</span> <span>{arrow}{Math.abs(val)}</span>
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
    let color = "text-red-500 drop-shadow-[0_0_15px_rgba(239,68,68,0.8)]";
    if (event.effectiveness >= 2) {
      subtext = "SUPER EFFECTIVE!";
      color = "text-amber-400 drop-shadow-[0_0_15px_rgba(245,158,11,0.9)]";
    } else if (event.effectiveness <= 0.5 && event.effectiveness > 0) {
      subtext = "Not very effective...";
      color = "text-slate-400";
    } else if (event.effectiveness === 0) {
      subtext = "No effect!";
      color = "text-slate-500";
    }

    return (
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 pointer-events-none animate-float-up z-[100] flex flex-col items-center">
        <span className={`text-5xl font-black font-display ${color} tabular-nums stroke-black stroke-2`}>
          -{event.amount}
        </span>
        {subtext && (
          <span className={`text-xs font-black ${color} tracking-widest uppercase mt-1 px-2.5 py-1 rounded-full bg-slate-950/90 border border-white/20 whitespace-nowrap shadow-xl`}>
            {subtext}
          </span>
        )}
      </div>
    );
  };

  const renderActivePokemon = (p, isOpponent, playerKey, playerName) => {
    const targetKey = playerKey || "me";
    const myEvents = floatingEvents.filter(e => e.targetKey === targetKey || e.targetKey === (isOpponent ? opponents.find(o=>o.playerKey===playerKey)?.id : me.id));

    return (
      <div className={`relative flex flex-col sm:flex-row items-center sm:items-end gap-4 sm:gap-6 ${isOpponent ? "" : "sm:flex-row-reverse"}`}>
        
        {/* Target Selection Overlay */}
        {pendingMove && isOpponent && p.currentHp > 0 && (
          <button 
            onClick={() => handleSelectTarget(playerKey)}
            className="absolute inset-0 bg-red-600/40 backdrop-blur-sm border-2 border-red-400 z-[100] cursor-pointer animate-pulse rounded-3xl flex items-center justify-center text-white font-display font-black uppercase tracking-widest text-2xl shadow-[0_0_35px_rgba(239,68,68,0.8)] hover:scale-105 transition-all"
          >
            🎯 Lock Target
          </button>
        )}

        {/* Monster Display Area & Arena Pedestal */}
        <div className="relative flex flex-col items-center justify-center pt-4">
          {renderStatusIcon(p.status)}
          
          <div className="relative w-32 h-32 sm:w-44 sm:h-44 flex items-center justify-center z-10 p-2">
            <PokemonSprite 
              id={p.id} 
              spriteUrl={p.spriteUrl} 
              name={p.name} 
              variant={isOpponent ? "front-gif" : "back-gif"}
              animate={p.currentHp > 0}
              className={`w-full h-full object-contain filter drop-shadow-[0_15px_20px_rgba(0,0,0,0.8)] ${p.currentHp <= 0 ? "animate-faint-sink opacity-25 grayscale" : "transition-transform duration-300 sm:scale-110"}`}
            />
            {myEvents.map(e => <FloatingDamage key={e.id} event={e} />)}
          </div>

          {/* Glowing Energy Pedestal Ring beneath monster */}
          <div className={`w-28 sm:w-40 h-8 -mt-7 rounded-[100%] border-2 filter blur-[1px] pointer-events-none z-0 ${
            isOpponent ? "bg-red-500/20 border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.4)]" : "bg-blue-500/25 border-blue-400/60 shadow-[0_0_25px_rgba(59,130,246,0.5)]"
          }`}></div>
        </div>

        {/* Telemetry HUD Box */}
        <div className={`group relative bg-slate-900/90 border border-white/20 rounded-3xl p-4 w-full sm:w-auto sm:flex-1 max-w-[280px] transition-all duration-300 shadow-[0_10px_30px_rgba(0,0,0,0.6)] backdrop-blur-md ${p.currentHp <= 0 ? "opacity-40 grayscale" : "hover:border-blue-400/50"}`}>
          <div className="flex justify-between items-baseline mb-2 border-b border-white/10 pb-1.5">
            <div className="font-extrabold text-white text-sm sm:text-base capitalize truncate tracking-wide flex items-center gap-2">
              <span>{p.name.replace(/-/g, " ")}</span>
              {playerName && <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 uppercase font-black tracking-wider">{playerName}</span>}
            </div>
            <div className="text-[11px] font-mono font-black text-blue-400 ml-2 flex-shrink-0">L100</div>
          </div>
          <HpBar current={p.currentHp} max={p.maxHp} />
          {renderStatStages(p.statStages)}
          
          {/* Detailed Telemetry Hover Pop-out */}
          {p.currentStats && (
            <div className={`hidden group-hover:block absolute ${isOpponent ? 'top-full left-0 mt-3' : 'bottom-full right-0 mb-3'} w-64 p-4 bg-slate-950 border border-white/20 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.9)] text-left z-[100] text-xs cursor-default backdrop-blur-xl`}>
              <div className="font-extrabold text-white mb-2 text-sm flex justify-between items-center pb-2 border-b border-white/10">
                <span className="capitalize">{p.name.replace(/-/g, " ")}</span>
                <div className="flex gap-1">
                  {p.types.map(t => (
                    <span key={t} className="px-1.5 py-0.5 rounded uppercase font-black text-[9px] text-white border border-white/20" style={{ backgroundColor: `var(--color-type-${t.toLowerCase()})` }}>{t}</span>
                  ))}
                </div>
              </div>
              <div className="text-slate-300 font-bold mb-1 font-mono text-[11px]">
                HP: {Math.max(0, p.currentHp)} / {p.maxHp} ({Math.round(Math.max(0, p.currentHp)/p.maxHp*100)}%)
              </div>
              {p.heldItem && (
                <div className="text-slate-400 mb-2.5 capitalize font-medium text-xs">
                  Held Item: <span className="text-amber-400 font-bold">{p.heldItem.replace(/-/g, " ")}</span>
                </div>
              )}
              <div className="grid grid-cols-5 gap-1 pt-2 border-t border-white/10 text-center font-mono">
                <div><div className="text-slate-500 font-bold text-[9px]">ATK</div><div className="text-white font-bold">{p.currentStats.attack}</div></div>
                <div><div className="text-slate-500 font-bold text-[9px]">DEF</div><div className="text-white font-bold">{p.currentStats.defense}</div></div>
                <div><div className="text-slate-500 font-bold text-[9px]">SPA</div><div className="text-white font-bold">{p.currentStats.specialAttack}</div></div>
                <div><div className="text-slate-500 font-bold text-[9px]">SPD</div><div className="text-white font-bold">{p.currentStats.specialDefense}</div></div>
                <div><div className="text-slate-500 font-bold text-[9px]">SPE</div><div className="text-white font-bold">{p.currentStats.speed}</div></div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-[var(--color-bg-deep)] p-2 sm:p-4 max-w-[1500px] mx-auto gap-2 sm:gap-4 font-body text-white selection:bg-blue-500 selection:text-white">
      
      {/* ══ Top Match Telemetry Header ══ */}
      <header className="flex justify-between items-center bg-slate-900/90 backdrop-blur-xl border border-white/15 rounded-2xl px-5 py-3 flex-shrink-0 shadow-[0_8px_30px_rgba(0,0,0,0.6)] flex-wrap gap-2">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1 bg-blue-500/10 border border-blue-400/30 rounded-xl">
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></span>
            <span className="text-xs font-black uppercase tracking-widest text-blue-300">
              Turn {turn}
            </span>
          </div>
          
          <button
            onClick={() => {
              if (phase !== 'battle-over' && window.confirm("Are you sure you want to forfeit? You will surrender the match!")) {
                socket.emit("submit-forfeit");
              }
            }}
            disabled={phase === 'battle-over'}
            className="px-3.5 py-1.5 bg-rose-500/15 text-rose-300 border border-rose-500/40 rounded-xl font-black uppercase tracking-widest text-[11px] hover:bg-rose-500 hover:text-white hover:shadow-[0_0_15px_rgba(244,63,94,0.6)] transition-all disabled:opacity-40 disabled:pointer-events-none"
          >
            🚩 Surrender
          </button>
        </div>
        
        <div className="flex gap-6 items-center">
          {opponents.map(opp => (
            <div key={opp.playerKey} className="flex items-center gap-2 bg-slate-950/80 px-3 py-1.5 rounded-xl border border-white/10" title={`${opp.name}'s Squad Status`}>
              <span className="text-slate-400 font-extrabold text-xs uppercase tracking-wider">{opp.name}:</span>
              <div className="flex gap-1.5">
                {opp.bench.map((b, i) => (
                  <div key={i} className={`w-3 h-3 rounded-full border border-white/20 transition-all ${b.currentHp > 0 ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" : "bg-slate-800 opacity-40"}`} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </header>

      {/* ══ Main Battle Split ══ */}
      <div className="flex flex-col lg:flex-row gap-2 sm:gap-4 flex-1 min-h-0">
        
        {/* Left Column (Battle Arena + Command Deck) */}
        <div className="flex flex-col flex-1 gap-2 sm:gap-4 min-w-0">
          
          {/* Cyber Stadium Battle Field */}
          <div className="flex-1 bg-slate-950/95 border border-white/15 rounded-3xl relative p-4 sm:p-8 flex flex-col justify-between overflow-y-auto shadow-[inner_0_0_70px_rgba(0,0,0,0.9)] backdrop-blur-xl">
            {/* Arena Grid Architecture & Ambient Illumination */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(37,99,235,0.12)_0%,transparent_60%)] pointer-events-none"></div>
            <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none"></div>
            
            {/* Opponents (Top / Far side of stadium) */}
            <div className="w-full flex flex-wrap justify-center sm:justify-end gap-6 relative z-10 pb-4">
              {opponents.map(opp => (
                <div key={opp.playerKey} className={`${opponents.length > 2 ? 'scale-85 origin-top-right' : ''}`}>
                  {renderActivePokemon(opp.active, true, opp.playerKey, opp.name)}
                </div>
              ))}
            </div>
            
            {/* Player (Bottom / Near side of stadium) */}
            <div className="self-start w-full mt-6 relative z-10 pt-4 border-t border-white/5">
              {renderActivePokemon(me.active, false, null)}
            </div>
          </div>

          {/* Command Deck Action Console */}
          <div className="bg-slate-900/95 border border-white/15 rounded-3xl p-4 flex-shrink-0 min-h-[170px] lg:min-h-[15rem] flex flex-col justify-center shadow-[0_15px_50px_rgba(0,0,0,0.7)] backdrop-blur-xl relative">
            
            {pendingMove && (
              <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md z-30 rounded-3xl flex flex-col items-center justify-center border border-red-500/50 gap-4 p-4">
                <span className="font-display font-black text-2xl text-red-400 uppercase tracking-wide drop-shadow-md">
                  🎯 Select Target for <span className="text-white">{pendingMove.name}</span>
                </span>
                <button 
                  onClick={() => setPendingMove(null)}
                  className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-extrabold text-xs uppercase tracking-widest border border-white/15 rounded-xl shadow-lg transition-all"
                >
                  Cancel Attack
                </button>
              </div>
            )}

            {phase === "waiting" && (
              <div className="flex flex-col h-full items-center justify-center text-slate-300 gap-4 py-4">
                <div className="flex items-center gap-3 animate-pulse bg-blue-500/10 border border-blue-500/30 px-6 py-3 rounded-2xl shadow-[0_0_30px_rgba(59,130,246,0.2)]">
                  <div className="w-3 h-3 rounded-full bg-blue-400 animate-ping"></div>
                  <span className="font-black text-sm uppercase tracking-widest text-blue-200">Awaiting opponent commands...</span>
                </div>
                {lockedAction && (
                  <div className="text-xs text-slate-400 font-mono bg-slate-950 px-4 py-2 rounded-xl border border-white/10">
                    Action Locked: <strong className="text-amber-400 uppercase tracking-wider">{lockedAction.type === "move" ? lockedAction.move.name : "Switching Squad Member"}</strong>
                  </div>
                )}
              </div>
            )}

            {phase === "picking" && (
              <div className="grid grid-cols-1 xl:grid-cols-12 h-full gap-5 overflow-y-auto xl:overflow-visible">
                
                {/* Attack Triggers (7 Columns on XL) */}
                <div className="flex flex-col xl:col-span-7">
                  <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-blue-300 mb-3 border-b border-white/10 pb-1.5">
                    <span>⚡</span> Command Attacks
                  </div>
                  <div className="grid grid-cols-2 gap-3 flex-1">
                    {me.active.moves.map((m, i) => (
                      <button 
                        key={i}
                        onClick={() => handleMove(m)}
                        disabled={m.currentPp <= 0}
                        className="group relative flex flex-col items-start justify-center p-3 rounded-2xl disabled:opacity-40 transition-all border text-left cursor-pointer bg-slate-950/80 hover:bg-slate-800 hover:-translate-y-1 active:translate-y-0.5 shadow-lg overflow-hidden"
                        style={{
                          borderColor: m.currentPp > 0 ? `var(--color-type-${m.type.toLowerCase()})` : 'rgba(255,255,255,0.1)',
                          boxShadow: m.currentPp > 0 ? `0 0 15px color-mix(in srgb, var(--color-type-${m.type.toLowerCase()}) 30%, transparent)` : 'none'
                        }}
                      >
                        <div className="flex justify-between w-full items-center mb-1">
                          <span className="font-display font-black text-white text-sm sm:text-base capitalize group-hover:text-amber-300 transition-colors">{m.name}</span>
                          <span className="text-[11px] font-mono font-bold text-slate-400 bg-slate-900 px-2 py-0.5 rounded-md border border-white/5">
                            PP {m.currentPp}/{m.pp}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded text-white tracking-wider shadow-sm" style={{ backgroundColor: `var(--color-type-${m.type.toLowerCase()})` }}>
                            {m.type}
                          </span>
                        </div>

                        {/* Telemetry Move Popout */}
                        <div className="hidden xl:group-hover:block absolute bottom-full left-0 mb-3 w-64 p-3.5 bg-slate-950 border border-white/20 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.9)] text-left z-[100] text-xs cursor-default backdrop-blur-xl">
                          <div className="font-black text-white mb-2 flex items-center gap-2 border-b border-white/10 pb-1.5">
                            <span className="px-1.5 py-0.5 rounded uppercase tracking-wider text-[9px] text-white" style={{ backgroundColor: `var(--color-type-${m.type.toLowerCase()})` }}>{m.type}</span>
                            {m.damageClass && <span className="text-slate-400 capitalize font-mono text-[10px]">{m.damageClass}</span>}
                          </div>
                          <div className="text-slate-300 font-mono mb-2 text-[11px]">
                            PWR: <span className="text-amber-400 font-bold">{m.power || "—"}</span> | ACC: <span className="text-blue-400 font-bold">{m.accuracy || "—"}</span>
                          </div>
                          <div className="text-slate-300 leading-snug font-sans text-xs">
                            {m.effect || "No additional combat status effects applied."}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Squad Switch Bench (5 Columns on XL) */}
                <div className="flex flex-col xl:col-span-5 xl:border-l border-white/10 xl:pl-5">
                  <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-emerald-300 mb-3 border-b border-white/10 pb-1.5">
                    <span>🛡️</span> Deploy Reserves
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-2 gap-2.5 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                    {me.bench.map((b) => (
                      <button
                        key={b.benchIndex}
                        onClick={() => handleSwitch(b.benchIndex)}
                        disabled={b.currentHp <= 0}
                        className="flex items-center gap-2.5 p-2 bg-slate-950/80 border border-white/10 rounded-2xl disabled:opacity-30 disabled:grayscale transition-all text-left cursor-pointer hover:bg-slate-800 hover:border-emerald-400/50 hover:shadow-[0_4px_15px_rgba(16,185,129,0.25)] hover:-translate-y-0.5 active:translate-y-0"
                      >
                        <div className="w-10 h-10 flex items-center justify-center p-0.5 flex-shrink-0">
                          <PokemonSprite id={b.id} spriteUrl={b.spriteUrl} name={b.name} variant="front-gif" className="w-full h-full object-contain filter drop-shadow" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-extrabold text-white text-xs capitalize truncate mb-1">{b.name.replace(/-/g, " ")}</div>
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

        {/* Right Column (Live Telemetry Log) */}
        <div className="w-full lg:w-96 flex flex-col flex-shrink-0 h-64 lg:h-auto min-h-0">
          <BattleLog entries={logEntries} />
        </div>

      </div>

      {/* ══ Modals ══ */}
      {!isConnected && !modalMessage && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 bg-amber-500/90 backdrop-blur-md text-slate-950 px-6 py-2.5 rounded-full font-black shadow-[0_0_30px_rgba(245,158,11,0.6)] z-[200] flex items-center gap-3 animate-bounce border border-white/40">
          <span className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></span>
          <span>DISCONNECTED — REESTABLISHING SOCKET...</span>
        </div>
      )}

      {opponentReconnectingMsg && (
        <div className="absolute inset-0 z-[150] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
          <div className="glass-card p-8 text-center max-w-md w-full bg-slate-900 border border-amber-400/40 rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.9)] space-y-4">
            <div className="w-12 h-12 mx-auto rounded-full bg-amber-500/10 border-2 border-amber-400/40 flex items-center justify-center shadow-[0_0_25px_rgba(245,158,11,0.3)] animate-pulse">
              <span className="w-6 h-6 border-4 border-amber-400 border-t-transparent rounded-full animate-spin block"></span>
            </div>
            <div className="font-display font-black text-xl text-white uppercase tracking-wider">{opponentReconnectingMsg}</div>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest leading-relaxed">
              Match paused. Arena state is locked until opponent reconnects.
            </p>
          </div>
        </div>
      )}

      {/* Force Switch Modal */}
      {phase === "force-switch" && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/85 backdrop-blur-lg p-4 animate-fade-in">
          <div className="w-full max-w-lg bg-slate-900 border border-red-500/40 rounded-3xl p-6 shadow-[0_25px_80px_rgba(0,0,0,0.9)] animate-scale-in flex flex-col max-h-[85vh]">
            <div className="text-center mb-6 border-b border-white/10 pb-4">
              <span className="inline-block p-3 rounded-2xl bg-red-500/15 text-red-400 border border-red-500/30 text-2xl mb-2 shadow-[0_0_20px_rgba(239,68,68,0.3)] animate-bounce">
                💀
              </span>
              <h2 className="text-2xl font-display font-black text-white uppercase tracking-wider">Active Fainted!</h2>
              <p className="text-xs font-bold text-red-300 uppercase tracking-widest mt-1">Deploy replacement squad member immediately:</p>
            </div>
            
            <div className="flex flex-col gap-3 overflow-y-auto custom-scrollbar pr-1">
              {forceSwitchBench.map((b) => (
                <button
                  key={b.benchIndex}
                  onClick={() => handleSwitch(b.benchIndex)}
                  disabled={b.currentHp <= 0}
                  className="group flex items-center gap-4 p-4 bg-slate-950/80 hover:bg-slate-800 border border-white/15 hover:border-emerald-400/60 rounded-2xl disabled:opacity-30 disabled:grayscale transition-all hover:-translate-y-1 hover:shadow-[0_0_25px_rgba(16,185,129,0.25)] active:scale-[0.99] text-left cursor-pointer"
                >
                  <div className="w-16 h-16 flex items-center justify-center p-1 bg-slate-900 rounded-xl border border-white/5 flex-shrink-0 group-hover:scale-110 transition-transform">
                    <PokemonSprite id={b.id} spriteUrl={b.spriteUrl} name={b.name} variant="front-gif" className="w-full h-full object-contain filter drop-shadow" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-display font-black text-white text-lg capitalize truncate mb-1 group-hover:text-emerald-300 transition-colors">{b.name.replace(/-/g, " ")}</div>
                    <HpBar current={b.currentHp} max={b.maxHp} size="md" />
                  </div>
                  {b.currentHp > 0 && (
                    <span className="px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-400/30 text-emerald-300 text-xs font-black uppercase tracking-widest group-hover:bg-emerald-500 group-hover:text-slate-950 transition-colors">
                      Deploy
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {modalMessage && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl flex items-center justify-center z-[250] p-4 animate-fade-in">
          <div className="glass-card p-8 sm:p-10 max-w-md w-full bg-slate-900 border border-white/20 rounded-3xl text-center shadow-[0_30px_90px_rgba(0,0,0,0.95)] space-y-6">
            <div className="w-20 h-20 mx-auto rounded-3xl bg-blue-500/10 border border-blue-400/30 flex items-center justify-center text-4xl shadow-[0_0_35px_rgba(59,130,246,0.3)] animate-pulse">
              🏆
            </div>
            <div>
              <h2 className="text-3xl font-display font-black text-white uppercase tracking-wider mb-2">Match Terminated</h2>
              <p className="text-slate-300 font-extrabold text-sm sm:text-base bg-slate-950/80 p-4 rounded-2xl border border-white/10 shadow-inner">{modalMessage}</p>
            </div>
            <button 
              onClick={() => { socket.disconnect(); navigate("/build"); }}
              className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl font-display font-black text-lg uppercase tracking-widest border border-white/20 shadow-[0_0_25px_rgba(59,130,246,0.5)] hover:shadow-[0_0_40px_rgba(59,130,246,0.8)] hover:-translate-y-1 active:translate-y-0.5 transition-all"
            >
              Return to Roster
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
