/**
 * index.js — Express + Socket.io server (Phase 4)
 *
 * Serves:
 *   /data/*    → static JSON (Pokémon, moves, items)
 *   /api/*     → health check
 *   Socket.io  → real-time battle rooms
 */

"use strict";

const express = require("express");
const path    = require("path");
const http    = require("http");
const cors    = require("cors");
const { Server } = require("socket.io");
const rooms   = require("./rooms/roomManager");

const app    = express();
const server = http.createServer(app);

// For Render / production deployment
const allowedOrigins = process.env.CORS_ORIGIN 
  ? process.env.CORS_ORIGIN.split(",") 
  : ["http://localhost:5173", "http://127.0.0.1:5173", "https://pok-mon-battle-web-app.vercel.app"];

const io     = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
  },
});

const PORT = process.env.PORT || 3001;

// ── HTTP routes ────────────────────────────────────────────────────────────────

// Serve CORS headers for all HTTP routes
app.use(cors({ origin: allowedOrigins }));

app.use("/data", express.static(path.join(__dirname, "data")));
app.get("/api/health", (_req, res) => res.json({ status: "ok", phase: 5 }));

// ── Socket.io ──────────────────────────────────────────────────────────────────

io.on("connection", (socket) => {
  log(`connected  ${short(socket.id)}`);

  // ── Create Room ─────────────────────────────────────────────────────────────
  socket.on("create-room", ({ team, sessionId }) => {
    try {
      if (!validTeam(team)) {
        return socket.emit("error", { message: "Invalid team: must have exactly 6 Pokémon with 4 moves each." });
      }
      const code = rooms.createRoom(socket.id, team, sessionId);
      socket.join(code);
      socket.emit("room-created", { code });
      log(`room created  ${code}  by ${short(socket.id)}`);
    } catch (err) {
      console.error("[create-room]", err);
      socket.emit("error", { message: "Failed to create room. Please try again." });
    }
  });

  // ── Join Room ───────────────────────────────────────────────────────────────
  socket.on("join-room", ({ code, team, sessionId }) => {
    try {
      if (!validTeam(team)) {
        return socket.emit("error", { message: "Invalid team: must have exactly 6 Pokémon with 4 moves each." });
      }

      const result = rooms.joinRoom(socket.id, code, team, sessionId);
      if (!result.success) {
        return socket.emit("error", { message: result.error });
      }

      const { room, reconnected, playerKey } = result;
      socket.join(room.code);
      
      if (reconnected) {
        log(`room reconnected  ${room.code}  ${playerKey}=${short(socket.id)}`);
        // Tell everyone in the room (including the reconnected player) that the battle is back on
        broadcastPlayerStates(room, "battle-reconnected", { message: "Player reconnected!" });
        return;
      }

      log(`room joined  ${room.code}  p2=${short(socket.id)}`);

      // Send initial battle state to both players simultaneously
      const p1SocketId = room.players.p1.socketId;
      io.to(p1SocketId).emit("battle-start", {
        playerKey: "p1",
        state: rooms.buildClientState(room, "p1"),
      });
      socket.emit("battle-start", {
        playerKey: "p2",
        state: rooms.buildClientState(room, "p2"),
      });
    } catch (err) {
      console.error("[join-room]", err);
      socket.emit("error", { message: "Failed to join room. Please try again." });
    }
  });

  // ── Submit Action (move or voluntary switch) ────────────────────────────────
  socket.on("submit-action", ({ type, move, switchTo }) => {
    try {
      const info = rooms.getRoomBySocket(socket.id);
      if (!info) return socket.emit("error", { message: "You are not in a room." });

      const { code, playerKey, room } = info;

      // Validate action shape
      const action = buildAction(type, move, switchTo);
      if (!action) return socket.emit("error", { message: `Unknown action type: "${type}".` });

      const result = rooms.submitAction(code, playerKey, action);
      if (!result.success) return socket.emit("error", { message: result.error });

      // Acknowledge immediately — client transitions to "waiting" state
      socket.emit("action-received");
      log(`action  ${code}  ${playerKey}  ${type}${move ? `:${move.name}` : switchTo !== undefined ? `:switch→${switchTo}` : ""}`);

      if (result.bothReady) {
        // Both submitted — resolve turn
        const resolved = rooms.resolveTurn(code);
        if (!resolved) return;

        const { log: turnLog, events, forceSwitches, winner } = resolved;
        log(`turn resolved  ${code}  turn=${room.battleState?.turn}  winner=${winner ?? "none"}  forceSwitches=[${[...forceSwitches].join(",")}]`);

        // Send personalised turn-result to each player
        broadcastPlayerStates(room, "turn-result", { log: turnLog, events });

        if (winner) {
          // battle-over is already embedded in each player's state.phase
          // but we also emit a dedicated event for clean UX handling
          io.to(code).emit("battle-over", { winner, log: turnLog });
        }
      }
    } catch (err) {
      console.error("[submit-action]", err);
      socket.emit("error", { message: "Failed to submit action." });
    }
  });

  // ── Submit Forced Switch (after active Pokémon faints) ──────────────────────
  socket.on("submit-force-switch", ({ switchTo }) => {
    try {
      const info = rooms.getRoomBySocket(socket.id);
      if (!info) return socket.emit("error", { message: "You are not in a room." });

      const { code, playerKey, room } = info;
      const result = rooms.submitForceSwitch(code, playerKey, switchTo);

      if (!result.success) return socket.emit("error", { message: result.error });

      log(`force-switch  ${code}  ${playerKey}  slot=${switchTo}  allDone=${result.allDone}`);

      // Notify both players of the switch result
      broadcastPlayerStates(room, "force-switch-result", { log: result.log });
    } catch (err) {
      console.error("[submit-force-switch]", err);
      socket.emit("error", { message: "Failed to switch Pokémon." });
    }
  });

  // ── Submit Rematch ──────────────────────────────────────────────────────────
  socket.on("submit-rematch", () => {
    try {
      const info = rooms.getRoomBySocket(socket.id);
      if (!info) return socket.emit("error", { message: "You are not in a room." });

      const { code, playerKey } = info;
      const result = rooms.submitRematch(code, playerKey);

      if (!result.success) return socket.emit("error", { message: result.error });

      log(`rematch  ${code}  ${playerKey}  bothReady=${result.bothReady}`);

      if (result.bothReady) {
        log(`rematch accepted  ${code}`);
        const { room } = result;
        const p1SocketId = room.players.p1.socketId;
        const p2SocketId = room.players.p2.socketId;

        io.to(p1SocketId).emit("battle-start", {
          playerKey: "p1",
          state: rooms.buildClientState(room, "p1"),
        });
        io.to(p2SocketId).emit("battle-start", {
          playerKey: "p2",
          state: rooms.buildClientState(room, "p2"),
        });
      } else {
        // Just acknowledge they are waiting
        socket.emit("rematch-waiting");
      }
    } catch (err) {
      console.error("[submit-rematch]", err);
      socket.emit("error", { message: "Failed to request rematch." });
    }
  });

  // ── Disconnect ───────────────────────────────────────────────────────────────
  socket.on("disconnect", (reason) => {
    log(`disconnected  ${short(socket.id)}  reason=${reason}`);
    
    const info = rooms.removeSocket(socket.id, ({ opponentSocketId, code }) => {
      // This callback fires if the 90s grace timer expires
      if (opponentSocketId) {
        io.to(opponentSocketId).emit("opponent-disconnected", {
          message: "Your opponent disconnected permanently. The battle has ended.",
        });
        log(`notified opponent  ${short(opponentSocketId)}  of PERMANENT disconnect from room ${code}`);
      }
    });

    if (info?.opponentSocketId) {
      // Immediately tell the opponent about the grace period
      io.to(info.opponentSocketId).emit("opponent-reconnecting", {
        message: "Opponent reconnecting... (90s)",
      });
      log(`notified opponent  ${short(info.opponentSocketId)}  of GRACE PERIOD for room ${info.code}`);
    }
  });

  // ── Helpers (per-connection scope) ───────────────────────────────────────────

  /**
   * Emit a personalised event payload to each player in a room.
   * Each player gets `buildClientState` called for their key so they
   * never see opponent's moves or incorrect phase.
   */
  function broadcastPlayerStates(room, event, extra = {}) {
    for (const key of ["p1", "p2"]) {
      const sid = room.players[key]?.socketId;
      if (!sid) continue;
      const state = rooms.buildClientState(room, key);
      
      const payload = { state, ...extra };
      if (extra.events) {
        payload.events = extra.events.map(e => ({
          ...e,
          target: e.targetKey === key ? "me" : "opponent",
        }));
      }

      io.to(sid).emit(event, payload);
    }
  }
});

// ── Validation helpers ─────────────────────────────────────────────────────────

function validTeam(team) {
  if (!Array.isArray(team) || team.length !== 6) return false;
  return team.every(
    (slot) =>
      slot?.pokemon?.id &&
      Array.isArray(slot.moves) &&
      slot.moves.length === 4
  );
}

function buildAction(type, move, switchTo) {
  if (type === "move" && move) return { type: "move", move };
  if (type === "switch" && switchTo !== undefined) return { type: "switch", switchTo };
  return null;
}

// ── Logging helpers ───────────────────────────────────────────────────────────

function short(id) { return id?.slice(0, 6) ?? "?"; }
function log(msg)  { console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`); }

// ── Start ──────────────────────────────────────────────────────────────────────

server.listen(PORT, () => {
  console.log(`\n🚀 Pokémon Battle server  →  http://localhost:${PORT}`);
  console.log(`   /data/*   — static JSON`);
  console.log(`   Socket.io — battle rooms\n`);
});

module.exports = { app, server };
