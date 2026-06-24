"use strict";

const { resolveTurn, executeSwitch, STATUS, ACTION_TYPE } = require("../engine/battleEngine");
const { teamToEngineState } = require("../engine/statCalc");

// ── Code generation ───────────────────────────────────────────────────────────

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LEN   = 6;

function randomCode() {
  let s = "";
  for (let i = 0; i < CODE_LEN; i++) {
    s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return s;
}

// ── Room shape ────────────────────────────────────────────────────────────────
//
// {
//   code: string,
//   format: "1v1" | "ffa",
//   maxPlayers: number,
//   owner: string (playerKey),
//   phase: "waiting-for-players" | "picking" | "force-switch" | "battle-over",
//   players: {
//     p1: { socketId, rawTeam, pendingAction: null | action, sessionId, name },
//     p2: ..., p3: ..., etc.
//   },
//   battleState: null | { p1: playerEngineState, p2: ..., turn, winner },
//   pendingForceSwitches: Set<playerKey>,
//   disconnectTimers: { p1: null, ... },
// }

class RoomManager {
  constructor() {
    this.rooms        = new Map(); // code     → room
    this.socketToRoom = new Map(); // socketId → { code, playerKey }
  }

  _uniqueCode() {
    let code, tries = 0;
    do { code = randomCode(); tries++; }
    while (this.rooms.has(code) && tries < 200);
    return code;
  }

  _getPlayerKeys(room) {
    return Object.keys(room.players).filter(k => room.players[k]);
  }

  createRoom(socketId, rawTeam, sessionId, format = "1v1", playerName = "Trainer") {
    const code = this._uniqueCode();
    this.rooms.set(code, {
      code,
      format,
      maxPlayers: format === "ffa" ? 5 : 2,
      owner: "p1",
      phase: "waiting-for-players",
      players: {
        p1: { socketId, rawTeam, pendingAction: null, sessionId, name: playerName },
      },
      battleState: null,
      pendingForceSwitches: new Set(),
      disconnectTimers: { p1: null },
    });
    this.socketToRoom.set(socketId, { code, playerKey: "p1" });
    return code;
  }

  joinRoom(socketId, code, rawTeam, sessionId, playerName = "Trainer") {
    const upperCode = (code || "").toUpperCase().trim();
    const room = this.rooms.get(upperCode);

    if (!room) return { success: false, error: "Room not found — double-check the code." };
    
    // Check for reconnect
    for (const key of this._getPlayerKeys(room)) {
      if (room.players[key].sessionId === sessionId) {
        if (room.disconnectTimers[key]) {
          clearTimeout(room.disconnectTimers[key]);
          room.disconnectTimers[key] = null;
        }
        room.players[key].socketId = socketId;
        this.socketToRoom.set(socketId, { code: upperCode, playerKey: key });
        return { success: true, playerKey: key, room, reconnected: true };
      }
    }

    if (room.phase !== "waiting-for-players") return { success: false, error: "Battle has already started." };
    
    const currentCount = this._getPlayerKeys(room).length;
    if (currentCount >= room.maxPlayers) return { success: false, error: "That room is already full." };

    const newKey = `p${currentCount + 1}`;
    
    room.players[newKey] = { socketId, rawTeam, pendingAction: null, sessionId, name: playerName };
    room.disconnectTimers[newKey] = null;
    this.socketToRoom.set(socketId, { code: upperCode, playerKey: newKey });

    // In 1v1, auto-start if 2 players. In FFA, owner must start it.
    if (room.format === "1v1" && currentCount + 1 === 2) {
      this.startBattle(upperCode);
    }

    return { success: true, playerKey: newKey, room, reconnected: false };
  }

  startBattle(code) {
    const room = this.rooms.get(code);
    if (!room || room.phase !== "waiting-for-players") return { success: false };

    const keys = this._getPlayerKeys(room);
    if (keys.length < 2) return { success: false, error: "Need at least 2 players to start." };

    room.battleState = {
      turn: 1,
      winner: null,
    };
    for (const key of keys) {
      room.battleState[key] = teamToEngineState(room.players[key].rawTeam, key);
    }
    room.phase = "picking";
    return { success: true, room };
  }

  getRoomBySocket(socketId) {
    const info = this.socketToRoom.get(socketId);
    if (!info) return null;
    const room = this.rooms.get(info.code);
    return room ? { code: info.code, playerKey: info.playerKey, room } : null;
  }

  getOpponentSocketIds(room, playerKey) {
    return this._getPlayerKeys(room).filter(k => k !== playerKey).map(k => room.players[k].socketId).filter(Boolean);
  }

  getAllSocketIds(room) {
    return this._getPlayerKeys(room).map(k => room.players[k].socketId).filter(Boolean);
  }

  submitAction(code, playerKey, action) {
    const room = this.rooms.get(code);
    if (!room)                        return { success: false, error: "Room not found." };
    if (room.phase !== "picking")     return { success: false, error: `Actions cannot be submitted in phase "${room.phase}".` };
    
    // Only alive players can submit actions. If player is dead, they are implicitly ready.
    const ps = room.battleState[playerKey];
    if (ps.active.currentHp <= 0 && ps.bench.every(p => p.currentHp <= 0)) {
       return { success: false, error: "You are eliminated." };
    }

    if (room.players[playerKey].pendingAction)
      return { success: false, error: "You already submitted an action this turn." };

    room.players[playerKey].pendingAction = action;

    const keys = this._getPlayerKeys(room);
    const allReady = keys.every(k => {
      const ps = room.battleState[k];
      const isDead = ps.active.currentHp <= 0 && ps.bench.every(p => p.currentHp <= 0);
      return isDead || Boolean(room.players[k].pendingAction);
    });

    return { success: true, bothReady: allReady };
  }

  submitForfeit(code, playerKey) {
    const room = this.rooms.get(code);
    if (!room) return { success: false, error: "Room not found." };
    if (room.phase === "battle-over") return { success: false, error: "Battle is already over." };

    // Faint entire team to process forfeit in FFA natively
    const ps = room.battleState[playerKey];
    ps.active.currentHp = 0;
    ps.bench.forEach(p => p.currentHp = 0);

    const keys = this._getPlayerKeys(room);
    const aliveKeys = keys.filter(k => {
      const p = room.battleState[k];
      return p.active.currentHp > 0 || p.bench.some(b => b.currentHp > 0);
    });

    let winner = null;
    if (aliveKeys.length <= 1) {
       winner = aliveKeys[0] || "draw";
       room.battleState.winner = winner;
       room.phase = "battle-over";
    } else {
       // If forfeiting player was the last one we were waiting for
       const allReady = keys.every(k => {
          const p = room.battleState[k];
          const isDead = p.active.currentHp <= 0 && p.bench.every(b => b.currentHp <= 0);
          return isDead || Boolean(room.players[k].pendingAction);
       });
       if (allReady && room.phase === "picking") {
           // We need to resolve turn externally via resolveTurn(code)
           return { success: true, room, winner, needsResolution: true };
       }
    }

    return { success: true, room, winner };
  }

  submitRematch(code, playerKey) {
    // FFA rematch is complex, for now we will disable rematches for FFA, or require everyone to accept.
    const room = this.rooms.get(code);
    if (!room) return { success: false, error: "Room not found." };
    if (room.phase !== "battle-over") return { success: false, error: "Battle is not over." };

    room.players[playerKey].pendingAction = { type: "rematch" };

    const keys = this._getPlayerKeys(room);
    const allReady = keys.every(k => room.players[k].pendingAction?.type === "rematch");

    if (allReady) {
      keys.forEach(k => room.players[k].pendingAction = null);
      room.pendingForceSwitches = new Set();
      
      room.battleState = { turn: 1, winner: null };
      for (const key of keys) {
        room.battleState[key] = teamToEngineState(room.players[key].rawTeam, key);
      }
      room.phase = "picking";
    }

    return { success: true, bothReady: allReady, room };
  }

  resolveTurn(code) {
    const room = this.rooms.get(code);
    if (!room?.battleState) return null;

    const keys = this._getPlayerKeys(room);
    const actions = {};
    keys.forEach(k => {
      actions[k] = room.players[k].pendingAction;
      room.players[k].pendingAction = null;
    });

    const { newState, log, events } = resolveTurn(room.battleState, actions);
    room.battleState = newState;

    const forceSwitches = new Set();
    for (const key of keys) {
      const ps = newState[key];
      if (ps.active.currentHp <= 0 && ps.bench.some((p) => p.currentHp > 0)) {
        forceSwitches.add(key);
      }
    }
    room.pendingForceSwitches = forceSwitches;

    if (newState.winner) {
      room.phase = "battle-over";
    } else if (forceSwitches.size > 0) {
      room.phase = "force-switch";
    } else {
      room.phase = "picking";
    }

    return { newState, log, events, forceSwitches, winner: newState.winner };
  }

  submitForceSwitch(code, playerKey, switchToIndex) {
    const room = this.rooms.get(code);
    if (!room) return { success: false, error: "Room not found." };
    if (!room.pendingForceSwitches.has(playerKey))
      return { success: false, error: "You don't need to switch right now." };

    const playerState = room.battleState[playerKey];
    const target = playerState.bench[switchToIndex];

    if (!target || target.currentHp <= 0)
      return { success: false, error: "That Pokémon can't battle — choose a healthy one." };

    const { playerState: updated, log } = executeSwitch(playerState, switchToIndex, []);
    room.battleState[playerKey] = updated;
    room.pendingForceSwitches.delete(playerKey);

    const allDone = room.pendingForceSwitches.size === 0;
    if (allDone) room.phase = "picking";

    return { success: true, allDone, log, newState: room.battleState };
  }

  removeSocket(socketId, onTimeout) {
    const info = this.socketToRoom.get(socketId);
    if (!info) return null;

    const { code, playerKey } = info;
    const room = this.rooms.get(code);

    this.socketToRoom.delete(socketId);
    if (!room) return null;

    room.players[playerKey].socketId = null;

    const oppSockets = this.getOpponentSocketIds(room, playerKey);

    room.disconnectTimers[playerKey] = setTimeout(() => {
      // If timer executes, the player is considered forfeited/dead
      // For now we just faint their pokemon to process the forfeit
      if (this.rooms.has(code)) {
         this.submitForfeit(code, playerKey);
         if (onTimeout) onTimeout({ opponentSocketIds: oppSockets, code, playerKey });
      }
    }, 90000);

    return { opponentSocketIds: oppSockets, code, playerKey };
  }

  buildClientState(room, playerKey) {
    if (!room.battleState) return null;

    const keys = this._getPlayerKeys(room);
    const myPS  = room.battleState[playerKey];

    const benchSummary = (bench) =>
      bench.map((p, i) => ({
        id: p.id, name: p.name, types: p.types,
        currentHp: p.currentHp, maxHp: p.maxHp, status: p.status,
        spriteUrl: p.spriteUrl, benchIndex: i,
      }));

    const myActiveFull = {
      id: myPS.active.id, name: myPS.active.name, types: myPS.active.types,
      currentHp: myPS.active.currentHp, maxHp: myPS.active.maxHp, status: myPS.active.status,
      sleepTurns: myPS.active.sleepTurns, heldItem: myPS.active.heldItem,
      spriteUrl: myPS.active.spriteUrl, currentStats: myPS.active.currentStats,
      statStages: myPS.active.statStages,
      moves: myPS.active.moves.map((m) => ({
        name: m.name, type: m.type, power: m.power, accuracy: m.accuracy,
        pp: m.pp, currentPp: m.currentPp, priority: m.priority,
        statusEffect: m.statusEffect, effect: m.effect, damageClass: m.damageClass,
      })),
    };

    const opponents = keys.filter(k => k !== playerKey).map(k => {
       const oppPS = room.battleState[k];
       return {
         playerKey: k,
         name: room.players[k].name || "Opponent",
         active: {
           id: oppPS.active.id, name: oppPS.active.name, types: oppPS.active.types,
           currentHp: oppPS.active.currentHp, maxHp: oppPS.active.maxHp, status: oppPS.active.status,
           spriteUrl: oppPS.active.spriteUrl, heldItem: oppPS.active.heldItem,
           currentStats: oppPS.active.currentStats, statStages: oppPS.active.statStages,
         },
         bench: benchSummary(oppPS.bench),
       };
    });

    const needsSwitch   = room.pendingForceSwitches.has(playerKey);
    const hasSubmitted  = Boolean(room.players[playerKey]?.pendingAction);

    let phase;
    if (room.phase === "waiting-for-players")     phase = "waiting-for-players";
    else if (room.phase === "battle-over")        phase = "battle-over";
    else if (room.phase === "force-switch") {
      if (needsSwitch)  phase = "force-switch";
      else              phase = "opponent-switching";
    }
    else if (room.phase === "picking" && hasSubmitted) phase = "waiting";
    else {
      // If dead, they are just spectators picking nothing
      const isDead = myPS.active.currentHp <= 0 && myPS.bench.every(p => p.currentHp <= 0);
      phase = isDead ? "spectating" : "picking";
    }

    let clientWinner = null;
    const winner = room.battleState.winner;
    if (winner === playerKey) clientWinner = "me";
    else if (winner === "draw") clientWinner = "draw";
    else if (winner) clientWinner = "opponent"; // Or the specific winner name

    const forceSwitchBench = needsSwitch
      ? myPS.bench.map((p, i) => ({ ...benchSummary([p])[0], benchIndex: i })).filter((p) => p.currentHp > 0)
      : null;

    return {
      myKey: playerKey,
      me: {
        name: room.players[playerKey].name || "Me",
        active: myActiveFull,
        bench: benchSummary(myPS.bench),
      },
      opponents,
      turn: room.battleState.turn,
      phase,
      winner: clientWinner,
      forceSwitchBench,
    };
  }
}

module.exports = new RoomManager();
