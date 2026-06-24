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
app.use(express.json({ limit: '5mb' }));

app.use("/data", express.static(path.join(__dirname, "data")));
app.get("/api/health", (_req, res) => res.json({ status: "ok", phase: 5 }));

const apiRoutes = require('./routes/api');
app.use('/api', apiRoutes);

// ── Socket.io ──────────────────────────────────────────────────────────────────

io.on("connection", (socket) => {
  log(`connected  ${short(socket.id)}`);

  // ── Create Room ─────────────────────────────────────────────────────────────
  socket.on("create-room", ({ team, sessionId, format = "1v1", playerName = "Trainer" }) => {
    try {
      if (!validTeam(team)) {
        return socket.emit("error", { message: "Invalid team: must have exactly 6 Pokémon with 4 moves each." });
      }
      const code = rooms.createRoom(socket.id, team, sessionId, format, playerName);
      socket.join(code);
      socket.emit("room-created", { code, format });
      log(`room created  ${code}  by ${short(socket.id)} format ${format}`);
    } catch (err) {
      console.error("[create-room]", err);
      socket.emit("error", { message: "Failed to create room. Please try again." });
    }
  });

  // ── Join Room ───────────────────────────────────────────────────────────────
  socket.on("join-room", ({ code, team, sessionId, playerName = "Trainer" }) => {
    try {
      if (!validTeam(team)) {
        return socket.emit("error", { message: "Invalid team: must have exactly 6 Pokémon with 4 moves each." });
      }

      const result = rooms.joinRoom(socket.id, code, team, sessionId, playerName);
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

      log(`room joined  ${room.code}  ${playerKey}=${short(socket.id)}`);

      // If the room auto-started (1v1 case)
      if (room.phase === "picking") {
         const keys = rooms._getPlayerKeys(room);
         for (const k of keys) {
            io.to(room.players[k].socketId).emit("battle-start", {
              playerKey: k,
              state: rooms.buildClientState(room, k),
            });
         }
      } else {
         // Tell everyone in lobby about the new player
         io.to(room.code).emit("lobby-update", {
            players: rooms._getPlayerKeys(room).map(k => ({
              key: k,
              name: room.players[k].name || "Trainer",
              isOwner: room.owner === k
            }))
         });
      }
    } catch (err) {
      console.error("[join-room]", err);
      socket.emit("error", { message: "Failed to join room. Please try again." });
    }
  });

  // ── Start Battle (FFA manual start) ──────────────────────────────────────────
  socket.on("start-battle", () => {
    try {
       const info = rooms.getRoomBySocket(socket.id);
       if (!info) return socket.emit("error", { message: "You are not in a room." });
       const { code, playerKey, room } = info;

       if (room.owner !== playerKey) return socket.emit("error", { message: "Only the room owner can start the battle." });
       
       const result = rooms.startBattle(code);
       if (!result.success) return socket.emit("error", { message: result.error });

       const keys = rooms._getPlayerKeys(room);
       for (const k of keys) {
          io.to(room.players[k].socketId).emit("battle-start", {
            playerKey: k,
            state: rooms.buildClientState(room, k),
          });
       }
    } catch (err) {
       console.error("[start-battle]", err);
       socket.emit("error", { message: "Failed to start battle." });
    }
  });

  // ── Submit Action (move or voluntary switch) ────────────────────────────────
  socket.on("submit-action", ({ type, move, switchTo, targetId }) => {
    try {
      const info = rooms.getRoomBySocket(socket.id);
      if (!info) return socket.emit("error", { message: "You are not in a room." });

      const { code, playerKey, room } = info;

      // Validate action shape
      const action = buildAction(type, move, switchTo, targetId);
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

  // ── Submit Forfeit ──────────────────────────────────────────────────────────
  socket.on("submit-forfeit", () => {
    try {
      const info = rooms.getRoomBySocket(socket.id);
      if (!info) return socket.emit("error", { message: "You are not in a room." });

      const { code, playerKey, room } = info;
      const result = rooms.submitForfeit(code, playerKey);

      if (!result.success) return socket.emit("error", { message: result.error });

      log(`forfeit  ${code}  ${playerKey}`);
      
      const playerName = room.players[playerKey].name || playerKey;
      const logMsg = [`${playerName} was defeated or fled!`, ...(result.winner ? [`Player ${result.winner} wins the battle!`] : [])];

      if (result.needsResolution) {
        const resolved = rooms.resolveTurn(code);
        if (resolved) {
          broadcastPlayerStates(room, "turn-result", { log: [...logMsg, ...resolved.log], events: resolved.events });
          if (resolved.winner) {
            io.to(code).emit("battle-over", { winner: resolved.winner, log: [...logMsg, ...resolved.log] });
          }
          return;
        }
      }

      broadcastPlayerStates(room, "turn-result", { log: logMsg });
      if (result.winner) {
        io.to(code).emit("battle-over", { winner: result.winner, log: logMsg });
      }

    } catch (err) {
      console.error("[submit-forfeit]", err);
      socket.emit("error", { message: "Failed to forfeit." });
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
        const keys = rooms._getPlayerKeys(room);
        for (const k of keys) {
           io.to(room.players[k].socketId).emit("battle-start", {
             playerKey: k,
             state: rooms.buildClientState(room, k),
           });
        }
      } else {
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
    
    const info = rooms.removeSocket(socket.id, ({ opponentSocketIds, code, playerKey }) => {
      // This callback fires if the 90s grace timer expires
      if (opponentSocketIds && opponentSocketIds.length > 0) {
        opponentSocketIds.forEach(sid => {
           io.to(sid).emit("opponent-disconnected", {
             message: `Player ${playerKey} disconnected permanently.`,
           });
        });
        log(`notified opponents of PERMANENT disconnect from room ${code}`);
      }
    });

    if (info?.opponentSocketIds && info.opponentSocketIds.length > 0) {
      // Immediately tell the opponent about the grace period
      info.opponentSocketIds.forEach(sid => {
         io.to(sid).emit("opponent-reconnecting", {
           message: `Player ${info.playerKey} reconnecting... (90s)`,
         });
      });
      log(`notified opponents of GRACE PERIOD for room ${info.code}`);
    }
  });

  // ── Helpers (per-connection scope) ───────────────────────────────────────────

  function broadcastPlayerStates(room, event, extra = {}) {
    const keys = rooms._getPlayerKeys(room);
    for (const key of keys) {
      const sid = room.players[key]?.socketId;
      if (!sid) continue;
      const state = rooms.buildClientState(room, key);
      
      const payload = { state, ...extra };
      if (extra.events) {
        payload.events = extra.events.map(e => ({
          ...e,
          target: e.targetKey === key ? "me" : (e.targetKey || "opponent"),
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

function buildAction(type, move, switchTo, targetId) {
  if (type === "move" && move) return { type: "move", move, targetId };
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
