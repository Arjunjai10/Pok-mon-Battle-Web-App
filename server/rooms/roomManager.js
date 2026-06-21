/**
 * roomManager.js — Server-side room state manager
 *
 * Responsibilities:
 *   - Create / join rooms with random 6-char codes
 *   - Store per-room battle state (server is authoritative)
 *   - Buffer player actions; resolve turn when both submitted
 *   - Handle forced switches after faints
 *   - Clean up rooms on disconnect
 *
 * Singleton — one instance shared across the whole server process.
 */

"use strict";

const { resolveTurn, executeSwitch, STATUS, ACTION_TYPE } = require("../engine/battleEngine");
const { teamToEngineState } = require("../engine/statCalc");

// ── Code generation ───────────────────────────────────────────────────────────

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no O/0/I/1 to avoid confusion
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
//   phase: "waiting-for-players" | "picking" | "force-switch" | "battle-over",
//   players: {
//     p1: { socketId, rawTeam, pendingAction: null | action },
//     p2: null | { socketId, rawTeam, pendingAction: null | action },
//   },
//   battleState: null | { p1: playerEngineState, p2: playerEngineState, turn, winner },
//   pendingForceSwitches: Set<"p1"|"p2">,
// }

// ── Manager ───────────────────────────────────────────────────────────────────

class RoomManager {
  constructor() {
    this.rooms        = new Map(); // code     → room
    this.socketToRoom = new Map(); // socketId → { code, playerKey }
  }

  // ── Internal helpers ───────────────────────────────────────────────────────

  _uniqueCode() {
    let code, tries = 0;
    do { code = randomCode(); tries++; }
    while (this.rooms.has(code) && tries < 200);
    return code;
  }

  _oppKey(playerKey) {
    return playerKey === "p1" ? "p2" : "p1";
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Create a new room. Returns the room code.
   */
  createRoom(socketId, rawTeam, sessionId) {
    const code = this._uniqueCode();
    this.rooms.set(code, {
      code,
      phase: "waiting-for-players",
      players: {
        p1: { socketId, rawTeam, pendingAction: null, sessionId },
        p2: null,
      },
      battleState: null,
      pendingForceSwitches: new Set(),
      disconnectTimers: { p1: null, p2: null },
    });
    this.socketToRoom.set(socketId, { code, playerKey: "p1" });
    return code;
  }

  /**
   * Join an existing room.
   * Returns { success, playerKey?, room?, error?, reconnected? }
   */
  joinRoom(socketId, code, rawTeam, sessionId) {
    const upperCode = (code || "").toUpperCase().trim();
    const room = this.rooms.get(upperCode);

    if (!room) return { success: false, error: "Room not found — double-check the code." };
    
    // Check for reconnect
    if (room.players.p1 && room.players.p1.sessionId === sessionId) {
      if (room.disconnectTimers.p1) {
        clearTimeout(room.disconnectTimers.p1);
        room.disconnectTimers.p1 = null;
      }
      room.players.p1.socketId = socketId;
      this.socketToRoom.set(socketId, { code: upperCode, playerKey: "p1" });
      return { success: true, playerKey: "p1", room, reconnected: true };
    }
    if (room.players.p2 && room.players.p2.sessionId === sessionId) {
      if (room.disconnectTimers.p2) {
        clearTimeout(room.disconnectTimers.p2);
        room.disconnectTimers.p2 = null;
      }
      room.players.p2.socketId = socketId;
      this.socketToRoom.set(socketId, { code: upperCode, playerKey: "p2" });
      return { success: true, playerKey: "p2", room, reconnected: true };
    }

    if (room.players.p2 !== null) return { success: false, error: "That room is already full." };
    if (room.players.p1.socketId === socketId) return { success: false, error: "You cannot join your own room." };

    // Register p2
    room.players.p2 = { socketId, rawTeam, pendingAction: null, sessionId };
    this.socketToRoom.set(socketId, { code: upperCode, playerKey: "p2" });

    // Build initial battle state from both teams
    room.battleState = {
      p1: teamToEngineState(room.players.p1.rawTeam, "p1"),
      p2: teamToEngineState(rawTeam, "p2"),
      turn: 1,
      winner: null,
    };
    room.phase = "picking";

    return { success: true, playerKey: "p2", room, reconnected: false };
  }

  /**
   * Look up a room by socket ID.
   * Returns { code, playerKey, room } or null.
   */
  getRoomBySocket(socketId) {
    const info = this.socketToRoom.get(socketId);
    if (!info) return null;
    const room = this.rooms.get(info.code);
    return room ? { code: info.code, playerKey: info.playerKey, room } : null;
  }

  /**
   * Return the opponent's socket ID for a given player in a room.
   */
  getOpponentSocketId(room, playerKey) {
    const opp = this._oppKey(playerKey);
    return room.players[opp]?.socketId ?? null;
  }

  /**
   * Record a player's action for the current turn.
   * Returns { success, bothReady, error? }
   */
  submitAction(code, playerKey, action) {
    const room = this.rooms.get(code);
    if (!room)                        return { success: false, error: "Room not found." };
    if (room.phase !== "picking")     return { success: false, error: `Actions cannot be submitted in phase "${room.phase}".` };
    if (room.players[playerKey].pendingAction)
      return { success: false, error: "You already submitted an action this turn." };

    room.players[playerKey].pendingAction = action;

    const p1Ready = Boolean(room.players.p1?.pendingAction);
    const p2Ready = Boolean(room.players.p2?.pendingAction);

    return { success: true, bothReady: p1Ready && p2Ready };
  }

  /**
   * Resolve the current turn (both actions must be submitted).
   * Returns { newState, log, forceSwitches: Set<playerKey>, winner } or null.
   */
  resolveTurn(code) {
    const room = this.rooms.get(code);
    if (!room?.battleState) return null;

    const p1Action = room.players.p1.pendingAction;
    const p2Action = room.players.p2.pendingAction;

    // Clear before resolving
    room.players.p1.pendingAction = null;
    room.players.p2.pendingAction = null;

    // Run the engine
    const { newState, log } = resolveTurn(room.battleState, p1Action, p2Action);
    room.battleState = newState;

    // Determine which players need a forced switch (active fainted, bench not empty)
    const forceSwitches = new Set();
    for (const key of ["p1", "p2"]) {
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

    return { newState, log, forceSwitches, winner: newState.winner };
  }

  /**
   * Apply a forced switch after a faint.
   * Returns { success, allDone, log, newState, error? }
   */
  submitForceSwitch(code, playerKey, switchToIndex) {
    const room = this.rooms.get(code);
    if (!room) return { success: false, error: "Room not found." };
    if (!room.pendingForceSwitches.has(playerKey))
      return { success: false, error: "You don't need to switch right now." };

    const playerState = room.battleState[playerKey];
    const target = playerState.bench[switchToIndex];

    if (!target || target.currentHp <= 0)
      return { success: false, error: "That Pokémon can't battle — choose a healthy one." };

    // Apply the switch
    const { playerState: updated, log } = executeSwitch(playerState, switchToIndex, []);
    room.battleState[playerKey] = updated;
    room.pendingForceSwitches.delete(playerKey);

    const allDone = room.pendingForceSwitches.size === 0;
    if (allDone) room.phase = "picking";

    return { success: true, allDone, log, newState: room.battleState };
  }

  /**
   * Remove a socket from its room (on disconnect) and start a grace timer.
   * Returns { opponentSocketId, code, playerKey } or null.
   */
  removeSocket(socketId, onTimeout) {
    const info = this.socketToRoom.get(socketId);
    if (!info) return null;

    const { code, playerKey } = info;
    const room = this.rooms.get(code);

    this.socketToRoom.delete(socketId);
    if (!room) return null;

    room.players[playerKey].socketId = null;

    const opp = this._oppKey(playerKey);
    const opponentSocketId = room.players[opp]?.socketId ?? null;

    // Start 90s grace timer
    room.disconnectTimers[playerKey] = setTimeout(() => {
      // If timer executes, the room is truly dead
      this.rooms.delete(code);
      if (room.players[opp]?.socketId) {
        this.socketToRoom.delete(room.players[opp].socketId);
      }
      if (onTimeout) onTimeout({ opponentSocketId, code });
    }, 90000);

    return { opponentSocketId, code, playerKey };
  }

  // ── Client state builder ───────────────────────────────────────────────────

  /**
   * Build the sanitized per-player view of the battle state.
   *
   * Key privacy guarantee: opponent's moves are never included.
   * Key phase derivation: computed per-player, not stored globally.
   *
   * Returns the clientState object to emit via `turn-result` / `battle-start`.
   */
  buildClientState(room, playerKey) {
    if (!room.battleState) return null;

    const opp   = this._oppKey(playerKey);
    const myPS  = room.battleState[playerKey];
    const oppPS = room.battleState[opp];

    // ── Serialisers ──

    const benchSummary = (bench) =>
      bench.map((p, i) => ({
        id: p.id,
        name: p.name,
        types: p.types,
        currentHp: p.currentHp,
        maxHp: p.maxHp,
        status: p.status,
        spriteUrl: p.spriteUrl,
        benchIndex: i,
      }));

    const myActiveFull = {
      id:       myPS.active.id,
      name:     myPS.active.name,
      types:    myPS.active.types,
      currentHp:myPS.active.currentHp,
      maxHp:    myPS.active.maxHp,
      status:   myPS.active.status,
      sleepTurns:myPS.active.sleepTurns,
      heldItem: myPS.active.heldItem,
      spriteUrl:myPS.active.spriteUrl,
      // Full moves with current PP
      moves: myPS.active.moves.map((m) => ({
        name: m.name,
        type: m.type,
        power: m.power,
        accuracy: m.accuracy,
        pp: m.pp,
        currentPp: m.currentPp,
        priority: m.priority,
        statusEffect: m.statusEffect,
      })),
    };

    const oppActiveSanitized = {
      id:       oppPS.active.id,
      name:     oppPS.active.name,
      types:    oppPS.active.types,
      currentHp:oppPS.active.currentHp,
      maxHp:    oppPS.active.maxHp,
      status:   oppPS.active.status,
      spriteUrl:oppPS.active.spriteUrl,
      // No moves — opponent's moveset is hidden until they use them (battle log reveals)
    };

    // ── Phase derivation ──

    const needsSwitch   = room.pendingForceSwitches.has(playerKey);
    const oppNeedsSwitch = room.pendingForceSwitches.has(opp);
    const hasSubmitted  = Boolean(room.players[playerKey]?.pendingAction);

    let phase;
    if (room.phase === "waiting-for-players")     phase = "waiting-for-players";
    else if (room.phase === "battle-over")        phase = "battle-over";
    else if (room.phase === "force-switch") {
      if (needsSwitch)  phase = "force-switch";
      else              phase = "opponent-switching";
    }
    else if (room.phase === "picking" && hasSubmitted) phase = "waiting";
    else                                          phase = "picking";

    // ── Winner mapping ──

    const winner = room.battleState.winner;
    let clientWinner = null;
    if (winner === playerKey)    clientWinner = "me";
    else if (winner === "draw")  clientWinner = "draw";
    else if (winner)             clientWinner = "opponent";

    // ── Force-switch bench (alive bench Pokémon, this player only) ──

    const forceSwitchBench = needsSwitch
      ? myPS.bench
          .map((p, i) => ({ ...benchSummary([p])[0], benchIndex: i }))
          .filter((p) => p.currentHp > 0)
      : null;

    return {
      myKey:  playerKey,
      me: {
        active: myActiveFull,
        bench:  benchSummary(myPS.bench),
      },
      opponent: {
        active: oppActiveSanitized,
        bench:  benchSummary(oppPS.bench),
      },
      turn:            room.battleState.turn,
      phase,
      winner:          clientWinner,
      forceSwitchBench,
    };
  }
}

// Export singleton
module.exports = new RoomManager();
