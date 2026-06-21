#!/usr/bin/env node
/**
 * fetchPokeData.js — Phase 2 data pipeline
 *
 * Pulls all Gen 1 data from PokeAPI once and saves static JSON to /server/data/.
 * The live app NEVER calls PokeAPI — it reads only from these files.
 *
 * Usage: node scripts/fetchPokeData.js
 *
 * Output files:
 *   server/data/pokemon.json   — 151 Pokémon with Gen-1-filtered learnsets
 *   server/data/moves.json     — only moves learnable in Gen 1 (red-blue | yellow)
 *   server/data/items.json     — curated competitive held items
 *
 * Rate limiting: 1 request per 300 ms with up to 3 retries (PokeAPI is public &
 * asks for polite usage). ~151 Pokémon + ~250–350 moves + 12 items ≈ ~5–8 minutes.
 */

"use strict";

const https = require("https");
const fs = require("fs");
const path = require("path");

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────

const BASE_URL = "https://pokeapi.co/api/v2";
const DATA_DIR = path.join(__dirname, "..", "data");

// Gen 1 version-group names in PokeAPI. A move is included if it appears in
// at least one of these version groups (union, not intersection).
const GEN1_VERSION_GROUPS = new Set(["red-blue", "yellow"]);

// Competitive held items relevant to Gen 1 play.
// Note: most of these are from Gen 2+ (held items didn't exist in Gen 1),
// but they are included per the project brief for the battle simulation.
const HELD_ITEMS = [
  "leftovers",      // Restores 1/16 HP per turn
  "kings-rock",     // Adds 10% flinch chance to damaging moves
  "choice-band",    // Boosts Attack by 1.5x, locks into one move
  "lum-berry",      // Cures any status condition once
  "sitrus-berry",   // Restores 1/4 HP when below 50%
  "oran-berry",     // Restores 10 HP when below 50%
  "chesto-berry",   // Cures sleep once
  "pecha-berry",    // Cures poison once
  "rawst-berry",    // Cures burn once
  "aspear-berry",   // Cures freeze once
  "cheri-berry",    // Cures paralysis once
  "scope-lens",     // Increases critical-hit ratio
  "shell-bell",     // Restores 1/8 of damage dealt as HP
];

const REQUEST_DELAY_MS = 300; // ms between requests
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

// ─────────────────────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetches a URL and returns parsed JSON.
 * Retries up to MAX_RETRIES times on network error or 5xx responses.
 */
async function fetchJson(url, attempt = 1) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "pokemon-battle-app/1.0 (personal project)" } }, (res) => {
        if (res.statusCode === 404) {
          // Resolve with null so callers can handle missing resources gracefully
          res.resume();
          resolve(null);
          return;
        }
        if (res.statusCode >= 500 && attempt <= MAX_RETRIES) {
          res.resume();
          sleep(RETRY_DELAY_MS * attempt).then(() =>
            fetchJson(url, attempt + 1).then(resolve).catch(reject)
          );
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }

        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(new Error(`JSON parse error for ${url}: ${e.message}`));
          }
        });
      })
      .on("error", (err) => {
        if (attempt <= MAX_RETRIES) {
          sleep(RETRY_DELAY_MS * attempt).then(() =>
            fetchJson(url, attempt + 1).then(resolve).catch(reject)
          );
        } else {
          reject(err);
        }
      });
  });
}

/**
 * Rate-limited sequential fetch queue.
 * Processes an array of async tasks one at a time with REQUEST_DELAY_MS between each.
 */
async function fetchSequential(tasks, onProgress) {
  const results = [];
  for (let i = 0; i < tasks.length; i++) {
    if (i > 0) await sleep(REQUEST_DELAY_MS);
    const result = await tasks[i]();
    results.push(result);
    if (onProgress) onProgress(i + 1, tasks.length, result);
  }
  return results;
}

function progressBar(current, total, label = "") {
  const pct = Math.floor((current / total) * 100);
  const filled = Math.floor(pct / 5);
  const bar = "█".repeat(filled) + "░".repeat(20 - filled);
  process.stdout.write(`\r  [${bar}] ${pct}% (${current}/${total}) ${label}`.padEnd(80));
}

function writeJson(filename, data) {
  const filepath = path.join(DATA_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), "utf8");
  const kb = (fs.statSync(filepath).size / 1024).toFixed(1);
  console.log(`  ✓ Wrote ${filepath} (${kb} KB, ${Array.isArray(data) ? data.length : Object.keys(data).length} entries)`);
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1 — FETCH 151 POKÉMON
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extracts the Gen 1 learnset from a raw PokeAPI pokemon response.
 *
 * PokeAPI's /pokemon/{id} returns moves from ALL generations. We filter to
 * only moves that have at least one version_group_details entry in "red-blue"
 * or "yellow". This gives us the union learnset (anything learnable in either
 * RB or Yellow).
 *
 * For each qualifying move we also record HOW it was learned and at what level,
 * which the team builder can use to show level-up vs TM vs HM labels.
 */
function extractGen1Learnset(rawMoves) {
  const learnset = [];

  for (const entry of rawMoves) {
    const gen1Details = entry.version_group_details.filter((d) =>
      GEN1_VERSION_GROUPS.has(d.version_group.name)
    );

    if (gen1Details.length === 0) continue; // Not learnable in Gen 1 → skip

    // Consolidate learn methods across RB and Yellow into a single record
    const methods = gen1Details.map((d) => ({
      versionGroup: d.version_group.name,
      method: d.move_learn_method.name,   // "level-up" | "machine" | "tutor" | "stadium-surfing-pikachu"
      level: d.level_learned_at,          // 0 for TM/HM/tutor; >0 for level-up
    }));

    learnset.push({
      name: entry.move.name,
      methods,
    });
  }

  return learnset;
}

async function fetchAllPokemon() {
  console.log("\n━━━ Step 1: Fetching 151 Pokémon ━━━");
  const pokemon = [];

  const tasks = Array.from({ length: 151 }, (_, i) => {
    const id = i + 1;
    return async () => {
      const data = await fetchJson(`${BASE_URL}/pokemon/${id}`);
      if (!data) {
        console.warn(`\n  ⚠ No data for Pokémon #${id}`);
        return null;
      }

      // Pick the best available sprite (official artwork → front_default fallback)
      const sprites = data.sprites || {};
      const spriteUrl =
        sprites?.other?.["official-artwork"]?.front_default ||
        sprites?.front_default ||
        null;

      return {
        id: data.id,
        name: data.name,
        types: data.types
          .sort((a, b) => a.slot - b.slot)
          .map((t) => capitalize(t.type.name)),
        baseStats: {
          hp: data.stats.find((s) => s.stat.name === "hp")?.base_stat ?? 0,
          attack: data.stats.find((s) => s.stat.name === "attack")?.base_stat ?? 0,
          defense: data.stats.find((s) => s.stat.name === "defense")?.base_stat ?? 0,
          // [GEN1] PokeAPI uses "special-attack" and "special-defense" for the
          // Gen 1 "Special" stat. In Gen 1 both are the same value — we keep both
          // fields for compatibility with the engine's stat shape.
          specialAttack: data.stats.find((s) => s.stat.name === "special-attack")?.base_stat ?? 0,
          specialDefense: data.stats.find((s) => s.stat.name === "special-defense")?.base_stat ?? 0,
          speed: data.stats.find((s) => s.stat.name === "speed")?.base_stat ?? 0,
        },
        spriteUrl,
        // Gen 1–filtered learnset (move names only; full move data in moves.json)
        learnset: extractGen1Learnset(data.moves),
      };
    };
  });

  const results = await fetchSequential(tasks, (current, total, mon) => {
    progressBar(current, total, mon?.name ?? "");
  });

  console.log(); // newline after progress bar
  const valid = results.filter(Boolean);
  console.log(`  Fetched ${valid.length} Pokémon`);
  return valid;
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2 — FETCH MOVE DATA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Collects the unique set of Gen 1 move names referenced by the 151 Pokémon,
 * then fetches full move data for each.
 *
 * We include moves from the learnset (level-up, TM, HM) only — this naturally
 * excludes egg moves, tutor moves from later gens, etc., because extractGen1Learnset
 * already filtered those out.
 *
 * One extra filter: PokeAPI's damage_class field is "physical"/"special"/"status"
 * based on modern definitions. We IGNORE this field in the engine and instead
 * use move type (Gen 1 physical/special split by type). We store it anyway for
 * reference but note the [GEN1] deviation in the JSON.
 */
async function fetchAllMoves(pokemonList) {
  console.log("\n━━━ Step 2: Collecting unique Gen 1 move names ━━━");

  const moveNamesSet = new Set();
  for (const mon of pokemonList) {
    for (const entry of mon.learnset) {
      moveNamesSet.add(entry.name);
    }
  }

  const moveNames = [...moveNamesSet].sort();
  console.log(`  Found ${moveNames.length} unique moves across all 151 Gen 1 learnsets`);
  console.log("\n━━━ Step 2b: Fetching move details ━━━");

  const tasks = moveNames.map((moveName) => async () => {
    const data = await fetchJson(`${BASE_URL}/move/${moveName}`);
    if (!data) {
      console.warn(`\n  ⚠ No data for move: ${moveName}`);
      return null;
    }

    // Extract English effect text
    const effectEntry = data.effect_entries?.find((e) => e.language.name === "en");
    const effect = effectEntry?.short_effect?.replace(/\$effect_chance%?/g, `${data.effect_chance ?? "?"}%`) ?? null;

    // [GEN1] We store damage_class from PokeAPI but the engine determines
    // physical vs special by move TYPE, not this field. See battleEngine.js.
    const damageClass = data.damage_class?.name ?? "status"; // "physical" | "special" | "status"

    // Status effect the move can inflict (if any) — used by the engine's executeMove()
    // Map PokeAPI ailment names to our STATUS constants
    const ailmentName = data.meta?.ailment?.name ?? null;
    const statusEffect = mapAilment(ailmentName);

    // Move priority — Quick Attack is +1, most moves are 0
    // PokeAPI stores this as data.priority
    const priority = data.priority ?? 0;

    return {
      id: data.id,
      name: data.name,
      type: capitalize(data.type?.name ?? "normal"),
      power: data.power ?? null,       // null for status moves
      accuracy: data.accuracy ?? null, // null for never-miss moves
      pp: data.pp ?? 10,
      priority,
      damageClass, // stored for reference; engine uses type-based split [GEN1]
      statusEffect, // mapped to STATUS constant name, or null
      effect,       // English short effect text for the UI
    };
  });

  const results = await fetchSequential(tasks, (current, total, move) => {
    progressBar(current, total, move?.name ?? "");
  });

  console.log();
  const valid = results.filter(Boolean);
  console.log(`  Fetched ${valid.length} moves`);
  return valid;
}

/**
 * Maps PokeAPI ailment names to our engine's STATUS constants.
 * Returns null if the move doesn't inflict a status.
 */
function mapAilment(ailmentName) {
  const map = {
    burn: "burn",
    paralysis: "paralysis",
    poison: "poison",
    "bad-poison": "poison", // Toxic → treated as regular poison in v1
    sleep: "sleep",
    freeze: "freeze",
    confusion: null,   // Confusion is not a persistent status in our engine (v1 scope)
    infatuation: null, // Not in scope
    "leech-seed": null, // Not a STATUS in our engine
    none: null,
    unknown: null,
  };
  if (!ailmentName || ailmentName === "none" || ailmentName === "unknown") return null;
  return map[ailmentName] ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 3 — FETCH HELD ITEMS
// ─────────────────────────────────────────────────────────────────────────────

async function fetchAllItems() {
  console.log("\n━━━ Step 3: Fetching held items ━━━");

  const tasks = HELD_ITEMS.map((itemName) => async () => {
    const data = await fetchJson(`${BASE_URL}/item/${itemName}`);
    if (!data) {
      console.warn(`\n  ⚠ Item not found: ${itemName}`);
      return null;
    }

    const effectEntry = data.effect_entries?.find((e) => e.language.name === "en");
    const shortEffect = effectEntry?.short_effect ?? null;

    // Extract the English flavor text from the most recent version group
    const flavorTexts = (data.flavor_text_entries || []).filter((f) => f.language.name === "en");
    const flavorText = flavorTexts.at(-1)?.text?.replace(/\s+/g, " ") ?? null;

    // Sprite/image URL (if available)
    const spriteUrl = data.sprites?.default ?? null;

    return {
      id: data.id,
      name: data.name, // kebab-case identifier (e.g. "kings-rock")
      displayName: toDisplayName(data.name), // "King's Rock"
      category: data.category?.name ?? null,
      shortEffect,
      flavorText,
      spriteUrl,
    };
  });

  const results = await fetchSequential(tasks, (current, total, item) => {
    progressBar(current, total, item?.name ?? "");
  });

  console.log();
  const valid = results.filter(Boolean);
  console.log(`  Fetched ${valid.length} items`);
  return valid;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function capitalize(str) {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function toDisplayName(kebab) {
  // "kings-rock" → "King's Rock", "choice-band" → "Choice Band"
  // Special-case known apostrophes
  const apostrophes = { "kings-rock": "King's Rock" };
  if (apostrophes[kebab]) return apostrophes[kebab];
  return kebab
    .split("-")
    .map(capitalize)
    .join(" ");
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║   Pokémon Battle App — Phase 2 Data Pipeline     ║");
  console.log("║   Pulling Gen 1 data from PokeAPI                ║");
  console.log("╚══════════════════════════════════════════════════╝");
  console.log(`\n  Output dir: ${DATA_DIR}`);
  console.log(`  Rate limit: 1 req / ${REQUEST_DELAY_MS}ms, ${MAX_RETRIES} retries`);

  // Ensure data dir exists
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const startTime = Date.now();

  // ── Step 1: Pokémon ───────────────────────────────────────────────────────
  const pokemonList = await fetchAllPokemon();

  // ── Step 2: Moves ─────────────────────────────────────────────────────────
  const moveList = await fetchAllMoves(pokemonList);

  // ── Step 3: Items ─────────────────────────────────────────────────────────
  const itemList = await fetchAllItems();

  // ── Write output files ────────────────────────────────────────────────────
  console.log("\n━━━ Writing JSON files ━━━");
  writeJson("pokemon.json", pokemonList);
  writeJson("moves.json", moveList);
  writeJson("items.json", itemList);

  // ── Summary ───────────────────────────────────────────────────────────────
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const totalMoves = moveList.length;
  const damagingMoves = moveList.filter((m) => m.power && m.power > 0).length;
  const statusMoves = moveList.filter((m) => !m.power || m.power === 0).length;
  const movesWithStatus = moveList.filter((m) => m.statusEffect).length;

  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║                   Data Summary                   ║");
  console.log("╠══════════════════════════════════════════════════╣");
  console.log(`║  Pokémon : ${String(pokemonList.length).padStart(3)}                                  ║`);
  console.log(`║  Moves   : ${String(totalMoves).padStart(3)} total                              ║`);
  console.log(`║            ${String(damagingMoves).padStart(3)} damaging, ${String(statusMoves).padStart(3)} status          ║`);
  console.log(`║            ${String(movesWithStatus).padStart(3)} inflict status conditions        ║`);
  console.log(`║  Items   : ${String(itemList.length).padStart(3)}                                  ║`);
  console.log(`║  Time    : ${String(elapsed + "s").padStart(6)}                               ║`);
  console.log("╚══════════════════════════════════════════════════╝");

  // ── Learnset coverage check ───────────────────────────────────────────────
  console.log("\n━━━ Learnset coverage spot-check ━━━");
  const moveIndex = new Set(moveList.map((m) => m.name));
  let orphaned = 0;
  for (const mon of pokemonList) {
    for (const entry of mon.learnset) {
      if (!moveIndex.has(entry.name)) {
        console.warn(`  ⚠ ${mon.name} has learnset entry "${entry.name}" not in moves.json`);
        orphaned++;
      }
    }
  }
  if (orphaned === 0) {
    console.log("  ✓ All learnset entries have matching move data in moves.json");
  }

  console.log("\n✅ Phase 2 complete! Static JSON files ready for the battle app.\n");
}

main().catch((err) => {
  console.error("\n❌ Fatal error:", err);
  process.exit(1);
});
