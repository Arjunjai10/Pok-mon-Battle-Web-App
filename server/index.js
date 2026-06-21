/**
 * index.js — Express + Socket.io server (Phase 3: data serving only)
 * Phase 4 will add Socket.io rooms and battle event handlers.
 */
"use strict";

const express = require("express");
const path = require("path");
const http = require("http");

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3001;

// ── Serve static JSON data files ───────────────────────────────────────────
// The client fetches /data/pokemon.json etc. — these are our cached PokeAPI files.
app.use("/data", express.static(path.join(__dirname, "data")));

// ── Health check ───────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", phase: 3 });
});

// ── Start server ───────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`\n🚀 Pokémon Battle server running on http://localhost:${PORT}`);
  console.log(`   Serving /data/* from ${path.join(__dirname, "data")}`);
  console.log(`   Phase 4: Socket.io rooms will be added here\n`);
});

module.exports = { app, server };
