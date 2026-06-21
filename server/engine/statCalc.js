/**
 * statCalc.js — Gen 1 stat calculation at Level 100, max DVs, max Stat Exp
 *
 * Gen 1 formulas:
 *   HP   = floor(((base + DV) × 2 + floor(sqrt(StatExp)/4)) × Level/100) + Level + 10
 *   Stat = floor(((base + DV) × 2 + floor(sqrt(StatExp)/4)) × Level/100) + 5
 *
 * At Level=100, DV=15, StatExp=65535 (max):
 *   floor(sqrt(65535)/4) = floor(255.99/4) = floor(63.99) = 63
 *
 *   HP   = (base+15)×2 + 63 + 110  =  base×2 + 203
 *   Stat = (base+15)×2 + 63 + 5    =  base×2 + 98
 *
 * Verified against cartridge values:
 *   Chansey HP    (base 250): 703 ✓
 *   Mewtwo Speed  (base 130): 358 ✓
 *   Mewtwo Sp.Atk (base 154): 401 ✓
 */

"use strict";

const LEVEL = 100;
const DV = 15;                      // max Determinant Values (Gen 1 IVs, 0–15)
const STAT_EXP_BONUS = 63;          // floor(sqrt(65535) / 4) = 63

function calcMaxHp(base) {
  return (base + DV) * 2 + STAT_EXP_BONUS + LEVEL + 10;
}

function calcStat(base) {
  return (base + DV) * 2 + STAT_EXP_BONUS + 5;
}

/**
 * Convert a single team-builder slot into the battle engine's Pokémon format.
 *
 * Team slot shape (from client sessionStorage):
 *   { pokemon: { id, name, types, baseStats, spriteUrl }, moves: [...], item, nickname }
 */
function slotToEnginePokemon(slot) {
  const { pokemon, moves, item, nickname } = slot;
  const bs = pokemon.baseStats;
  const maxHp = calcMaxHp(bs.hp);

  // Friendly display name: nickname > title-cased species name
  const displayName = (nickname && nickname.trim())
    ? nickname.trim()
    : pokemon.name.charAt(0).toUpperCase() + pokemon.name.slice(1).replace(/-/g, " ");

  return {
    id: pokemon.id,
    name: displayName,
    types: pokemon.types,
    level: LEVEL,
    currentHp: maxHp,
    maxHp,
    status: null,
    sleepTurns: 0,
    heldItem: item || null,
    spriteUrl: pokemon.spriteUrl,
    moves: moves.map((m) => ({
      name: m.name,
      type: m.type,
      power: m.power ?? null,
      accuracy: m.accuracy ?? null,
      pp: m.pp,
      currentPp: m.pp,            // starts full
      priority: m.priority ?? 0,
      statusEffect: m.statusEffect ?? null,
      effect: m.effect ?? null,
    })),
    currentStats: {
      attack:         calcStat(bs.attack),
      defense:        calcStat(bs.defense),
      specialAttack:  calcStat(bs.specialAttack),
      specialDefense: calcStat(bs.specialDefense),
      speed:          calcStat(bs.speed),
    },
    statStages: {
      attack: 0, defense: 0,
      specialAttack: 0, specialDefense: 0,
      speed: 0, accuracy: 0, evasion: 0,
    },
  };
}

/**
 * Convert a full team (6 slots) to the engine's player-state shape.
 * Slot 0 → active; slots 1–5 → bench.
 */
function teamToEngineState(teamSlots, playerKey) {
  const mons = teamSlots.map(slotToEnginePokemon);
  return {
    id: playerKey,
    active: mons[0],
    bench: mons.slice(1),
  };
}

module.exports = { calcMaxHp, calcStat, slotToEnginePokemon, teamToEngineState };
