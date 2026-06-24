/**
 * battleEngine.js — Gen 1 Pokémon Battle Engine
 *
 * Pure functions only. No I/O, no side effects, no framework dependencies.
 * All battle state transformations go through resolveTurn().
 *
 * Gen 1 mechanics deviations from later gens are called out with [GEN1] comments.
 */

"use strict";

const typeChart = require("../data/typeChart.json");

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const STATUS = {
  NONE: null,
  BURN: "burn",
  POISON: "poison",
  PARALYSIS: "paralysis",
  SLEEP: "sleep",
  FREEZE: "freeze",
};

const ACTION_TYPE = {
  MOVE: "move",
  SWITCH: "switch",
};

// Move categories — [GEN1] In Gen 1, physical vs special is determined by the
// move's TYPE, not a per-move category field. Special types: Fire, Water,
// Electric, Grass, Ice, Psychic, Dragon. Physical types: Normal, Fighting,
// Poison, Ground, Flying, Bug, Rock, Ghost.
const SPECIAL_TYPES = new Set([
  "Fire",
  "Water",
  "Electric",
  "Grass",
  "Ice",
  "Psychic",
  "Dragon",
]);

const HIGH_CRIT_MOVES = new Set(["crabhammer", "slash", "karate-chop", "razor-leaf"]);

// Moves that alter stat stages
const STAT_STAGE_MOVES = {
  "growl":        [{ target: "defender", stat: "attack", stages: -1 }],
  "tail-whip":    [{ target: "defender", stat: "defense", stages: -1 }],
  "leer":         [{ target: "defender", stat: "defense", stages: -1 }],
  "string-shot":  [{ target: "defender", stat: "speed", stages: -1 }],
  "sand-attack":  [{ target: "defender", stat: "accuracy", stages: -1 }],
  "swords-dance": [{ target: "attacker", stat: "attack", stages: 2 }],
  "agility":      [{ target: "attacker", stat: "speed", stages: 2 }],
  "amnesia":      [{ target: "attacker", stat: "specialAttack", stages: 2 }, { target: "attacker", stat: "specialDefense", stages: 2 }],
  "barrier":      [{ target: "attacker", stat: "defense", stages: 2 }],
  "acid-armor":   [{ target: "attacker", stat: "defense", stages: 2 }],
  "harden":       [{ target: "attacker", stat: "defense", stages: 1 }],
  "defense-curl": [{ target: "attacker", stat: "defense", stages: 1 }],
  "growth":       [{ target: "attacker", stat: "specialAttack", stages: 1 }, { target: "attacker", stat: "specialDefense", stages: 1 }],
  "meditate":     [{ target: "attacker", stat: "attack", stages: 1 }],
  "sharpen":      [{ target: "attacker", stat: "attack", stages: 1 }],
  "double-team":  [{ target: "attacker", stat: "evasion", stages: 1 }],
  "minimize":     [{ target: "attacker", stat: "evasion", stages: 1 }]
};

// ─────────────────────────────────────────────────────────────────────────────
// UTILITY HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a random number in [min, max] inclusive, as a float.
 * Isolated here so tests can mock it (see battleEngine.test.js).
 */
function randomFloat(min, max) {
  return Math.random() * (max - min) + min;
}

/**
 * Clamp a value between lo and hi.
 */
function clamp(value, lo, hi) {
  return Math.max(lo, Math.min(hi, value));
}

/**
 * Deep clone a plain-object battle state so the engine never mutates inputs.
 */
function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}

// ─────────────────────────────────────────────────────────────────────────────
// TYPE EFFECTIVENESS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * getTypeEffectiveness(moveType, defenderTypes) → multiplier
 *
 * Looks up the Gen 1 type chart for every defending type and multiplies
 * the multipliers together (e.g. Water vs Fire/Flying = 2 × 1 = 2).
 *
 * @param {string}   moveType      - e.g. "Water"
 * @param {string[]} defenderTypes - e.g. ["Fire", "Flying"] (1 or 2 types)
 * @returns {number} combined effectiveness multiplier (0 | 0.25 | 0.5 | 1 | 2 | 4)
 */
function getTypeEffectiveness(moveType, defenderTypes) {
  const row = typeChart[moveType];
  if (!row) return 1; // Unknown type → neutral

  let multiplier = 1;
  for (const defType of defenderTypes) {
    const cell = row[defType];
    if (cell !== undefined) {
      multiplier *= cell;
    }
    // Undefined → 1 (neutral), no change needed
  }
  return multiplier;
}

// ─────────────────────────────────────────────────────────────────────────────
// DAMAGE CALCULATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * isSpecialMove(moveType) → boolean
 *
 * [GEN1] Physical/Special split is purely by type, not per-move.
 */
function isSpecialMove(moveType) {
  return SPECIAL_TYPES.has(moveType);
}

/**
 * getEffectiveStat(pokemon, statName) → number
 *
 * Returns the effective (post-status) value of a stat.
 * [GEN1] Burn halves Attack. Paralysis halves Speed.
 * Stat stages (±6) are stored on the active Pokémon but NOT applied here —
 * they are applied separately in getBattleStatWithStages().
 *
 * @param {object} pokemon - active Pokémon object (see state shape in resolveTurn)
 * @param {string} statName - "attack" | "defense" | "specialAttack" | "specialDefense" | "speed"
 */
function getEffectiveStat(pokemon, statName) {
  let base = pokemon.currentStats[statName];

  if (statName === "attack" && pokemon.status === STATUS.BURN) {
    // [GEN1] Burn halves the physical Attack stat
    base = Math.floor(base / 2);
  }
  if (statName === "speed" && pokemon.status === STATUS.PARALYSIS) {
    // [GEN1] Paralysis quarters speed (halved in Gen 1 — some sources say /4,
    // the actual cartridge rounds differently; we use /4 floored, matching
    // most Gen 1 damage calculators)
    base = Math.floor(base / 4);
  }

  return base;
}

/**
 * getStatWithStage(baseStat, stage) → number
 *
 * Gen 1 stat stage multipliers: stage ∈ [-6, +6].
 * Multiplier table from the Gen 1 games (numerator/8 fractions).
 * [GEN1] Uses a different multiplier table than Gen 2+.
 */
const STAGE_NUMERATORS = [25, 28, 33, 40, 50, 66, 100, 150, 200, 250, 300, 350, 400];
// Index 0 = stage -6, index 6 = stage 0, index 12 = stage +6

function getStatWithStage(baseStat, stage) {
  const clampedStage = clamp(stage, -6, 6);
  const idx = clampedStage + 6; // shift so -6→0, 0→6, +6→12
  const numerator = STAGE_NUMERATORS[idx];
  return Math.floor((baseStat * numerator) / 100);
}

/**
 * calculateDamage(attacker, defender, move, options) → number
 *
 * Gen 1 damage formula (from the original game internals):
 *   damage = floor((floor((2*L/5+2) * Power * A/D) / 50) + 2) * multipliers
 *
 * Where:
 *   L    = attacker level (default 100 for competitive)
 *   A    = effective Attack or Special (based on move type)
 *   D    = effective Defense or Special (based on move type)
 *   STAB = 1.5 if move type matches one of the attacker's types, else 1
 *   Type = type effectiveness multiplier (0 / 0.5 / 1 / 2 / 4)
 *   Rand = random integer in [217, 255] / 255 (we use float 0.85–1.0 equivalent)
 *
 * @param {object} attacker - active Pokémon (see state shape)
 * @param {object} defender - active Pokémon
 * @param {object} move     - { name, type, power, category, accuracy, pp }
 * @param {object} [opts]   - { randomFactor: number } to override RNG for tests
 * @returns {number} integer damage dealt (minimum 1 if move has power and hits)
 */
function calculateDamage(attacker, defender, move, opts = {}) {
  // Moves with no power (status moves) deal 0 damage
  if (!move.power || move.power === 0) return 0;

  const isCrit = opts.isCrit === true;
  const level = isCrit ? (attacker.level || 100) * 2 : (attacker.level || 100);

  // [GEN1] Determine A and D by move type, not move category
  const special = isSpecialMove(move.type);
  const atkStat = special ? "specialAttack" : "attack";
  const defStat = special ? "specialDefense" : "defense";

  // Apply status modifiers, then apply stat stages
  const rawAtk = getEffectiveStat(attacker, atkStat);
  const rawDef = getEffectiveStat(defender, defStat);

  const atkStage = attacker.statStages ? (attacker.statStages[atkStat] || 0) : 0;
  const defStage = defender.statStages ? (defender.statStages[defStat] || 0) : 0;

  const A = getStatWithStage(rawAtk, atkStage);
  const D = getStatWithStage(rawDef, defStage);

  // Core formula — [GEN1] integer arithmetic with specific rounding order
  const baseDamage = Math.floor(
    (Math.floor((2 * level) / 5 + 2) * move.power * A) / D / 50
  ) + 2;

  // STAB (Same Type Attack Bonus)
  const stab = attacker.types.includes(move.type) ? 1.5 : 1;

  // Type effectiveness
  const typeMultiplier = getTypeEffectiveness(move.type, defender.types);

  // [GEN1] Random factor: integer roll 217–255 divided by 255
  // We model this as a float in [217/255, 1.0] ≈ [0.851, 1.0]
  // Tests can pass opts.randomFactor to override
  const rand =
    opts.randomFactor !== undefined
      ? opts.randomFactor
      : randomFloat(217 / 255, 1.0);

  let damage = Math.floor(baseDamage * stab * typeMultiplier * rand);

  // Minimum 1 damage if move has power and type isn't immune
  if (typeMultiplier > 0 && damage < 1) damage = 1;

  return damage;
}

// ─────────────────────────────────────────────────────────────────────────────
// ACCURACY / HIT CHECK
// ─────────────────────────────────────────────────────────────────────────────

/**
 * doesMoveHit(move, attacker, defender, opts) → boolean
 *
 * [GEN1] Accuracy check: roll 0–255, must be < (move.accuracy/100 * 255).
 * Evasion/accuracy stages are ignored in v1 (they're very rarely used in Gen 1).
 *
 * @param {object} move
 * @param {object} [opts] - { hitRoll: number } in [0,1) to override RNG for tests
 */
function doesMoveHit(move, attacker, defender, opts = {}) {
  if (move.accuracy === null || move.accuracy === undefined) return true; // Never-miss moves
  const roll = opts.hitRoll !== undefined ? opts.hitRoll : Math.random();
  return roll < move.accuracy / 100;
}

// ─────────────────────────────────────────────────────────────────────────────
// STATUS EFFECT APPLICATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * applyStatus(target, statusType) → { target, log }
 *
 * Tries to inflict a status condition on target.
 * Returns the (possibly unchanged) target and a log message.
 *
 * @param {object} target - active Pokémon
 * @param {string} statusType - one of STATUS values
 * @returns {{ target: object, log: string }}
 */
function applyStatus(target, statusType) {
  // Cannot apply a new status if one already exists
  if (target.status !== STATUS.NONE && target.status !== null) {
    return { target, log: `${target.name} already has a status condition!` };
  }

  const updated = { ...target, status: statusType };

  switch (statusType) {
    case STATUS.SLEEP:
      // [GEN1] Sleep lasts 1–7 turns (we roll 1–6 inclusive)
      updated.sleepTurns = Math.floor(Math.random() * 6) + 1;
      return { target: updated, log: `${target.name} fell asleep!` };

    case STATUS.FREEZE:
      // [GEN1] Freeze has no automatic cure — only fire moves or Haze unfreeze.
      // In v1, we'll implement: 10% chance to thaw per turn (reasonable sim)
      return { target: updated, log: `${target.name} was frozen solid!` };

    case STATUS.PARALYSIS:
      return { target: updated, log: `${target.name} is paralyzed! It may be unable to move!` };

    case STATUS.BURN:
      return { target: updated, log: `${target.name} was burned!` };

    case STATUS.POISON:
      return { target: updated, log: `${target.name} was poisoned!` };

    default:
      return { target, log: `Unknown status: ${statusType}` };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// END-OF-TURN EFFECTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * applyEndOfTurnEffects(pokemon, log) → { pokemon, log }
 *
 * Applies status chip damage and held item effects at end of turn.
 * Mutates a CLONE of pokemon; returns it alongside log additions.
 *
 * @param {object} pokemon - active Pokémon (already cloned)
 * @param {string[]} log   - existing log array to append to
 * @returns {{ pokemon: object, log: string[] }}
 */
function applyEndOfTurnEffects(pokemon, log) {
  const entries = [...log];
  const p = { ...pokemon };

  if (p.currentHp <= 0) return { pokemon: p, log: entries }; // Already fainted

  // Status chip damage
  switch (p.status) {
    case STATUS.BURN: {
      // [GEN1] Burn chip = 1/16 of max HP per turn
      const chip = Math.max(1, Math.floor(p.maxHp / 16));
      p.currentHp = Math.max(0, p.currentHp - chip);
      entries.push(`${p.name} is hurt by its burn! (−${chip} HP)`);
      break;
    }
    case STATUS.POISON: {
      // [GEN1] Poison chip = 1/16 of max HP per turn
      // [GEN1] Toxic (bad poison) is not in v1 scope — treated as regular poison
      const chip = Math.max(1, Math.floor(p.maxHp / 16));
      p.currentHp = Math.max(0, p.currentHp - chip);
      entries.push(`${p.name} is hurt by poison! (−${chip} HP)`);
      break;
    }
    default:
      break;
  }

  // Held item effects
  if (p.heldItem === "leftovers") {
    // Leftovers: heal 1/16 max HP per turn (held item from Gen 2, included per brief)
    const heal = Math.max(1, Math.floor(p.maxHp / 16));
    if (p.currentHp < p.maxHp) {
      p.currentHp = Math.min(p.maxHp, p.currentHp + heal);
      entries.push(`${p.name} restored a little HP using Leftovers! (+${heal} HP)`);
    }
  }

  return { pokemon: p, log: entries };
}

// ─────────────────────────────────────────────────────────────────────────────
// MOVE EXECUTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * canActThisTurn(pokemon, opts) → { canAct: boolean, log: string[] }
 *
 * Checks whether the Pokémon can move this turn given its status.
 *
 * @param {object} pokemon
 * @param {object} [opts]  - { paralysisRoll, thawRoll, wakeRoll } for tests
 */
function canActThisTurn(pokemon, opts = {}) {
  const log = [];

  switch (pokemon.status) {
    case STATUS.SLEEP: {
      if (pokemon.sleepTurns > 0) {
        // Still sleeping
        return { canAct: false, sleepTurns: pokemon.sleepTurns - 1, log: [`${pokemon.name} is fast asleep!`] };
      }
      // Wake up!
      log.push(`${pokemon.name} woke up!`);
      return { canAct: false, wake: true, sleepTurns: 0, log }; // Waking turn is lost
    }

    case STATUS.FREEZE: {
      // [GEN1] 10% chance to thaw per turn (house-rule; real Gen 1 only thaws via fire moves)
      const thawRoll = opts.thawRoll !== undefined ? opts.thawRoll : Math.random();
      if (thawRoll < 0.10) {
        log.push(`${pokemon.name} thawed out!`);
        return { canAct: false, thaw: true, log }; // Thawing turn is lost
      }
      return { canAct: false, log: [`${pokemon.name} is frozen solid!`] };
    }

    case STATUS.PARALYSIS: {
      // [GEN1] 25% chance to be fully paralyzed
      const paralysisRoll = opts.paralysisRoll !== undefined ? opts.paralysisRoll : Math.random();
      if (paralysisRoll < 0.25) {
        return { canAct: false, log: [`${pokemon.name} is fully paralyzed! It can't move!`] };
      }
      return { canAct: true, log };
    }

    default:
      return { canAct: true, log };
  }
}

/**
 * executeMove(attacker, defender, move, log, events, targetKey, opts) → { attacker, defender, log, events }
 *
 * Runs a single move: accuracy check → damage → secondary effect.
 * Returns clones of attacker and defender.
 */
function executeMove(attacker, defender, move, log, events, targetKey, opts = {}) {
  let atk = { ...attacker };
  let def = { ...defender };
  const entries = [...log];
  const newEvents = [...events];

  entries.push(`${atk.name} used ${move.name}!`);

  // PP reduction
  const usedMoveIdx = atk.moves.findIndex((m) => m.name === move.name);
  if (usedMoveIdx !== -1) {
    atk = {
      ...atk,
      moves: atk.moves.map((m, i) =>
        i === usedMoveIdx ? { ...m, currentPp: Math.max(0, m.currentPp - 1) } : m
      ),
    };
  }

  // Accuracy check
  const hit = doesMoveHit(move, atk, def, opts);
  if (!hit) {
    entries.push(`${atk.name}'s attack missed!`);
    return { attacker: atk, defender: def, log: entries, events: newEvents };
  }

  // Crit Check
  let isCrit = false;
  if (move.power > 0) {
    // Gen 1 Crit rate is baseSpeed / 512. High crit moves are baseSpeed / 64
    // We approximate base speed with currentStats.speed (ignoring stat modifiers for this chance calculation for simplicity)
    const baseSpeed = atk.currentStats.speed || 80;
    const critChance = HIGH_CRIT_MOVES.has(move.name) ? Math.min(0.99, baseSpeed / 64) : Math.min(0.99, baseSpeed / 512);
    if ((opts.critRoll !== undefined ? opts.critRoll : Math.random()) < critChance) {
      isCrit = true;
    }
  }

  // Damage
  const damage = calculateDamage(atk, def, move, { ...opts, isCrit });

  if (damage > 0) {
    def = { ...def, currentHp: Math.max(0, def.currentHp - damage) };

    if (isCrit) {
      entries.push(`A critical hit!`);
    }

    const typeMultiplier = getTypeEffectiveness(move.type, def.types);
    if (typeMultiplier >= 2) {
      entries.push(`It's super effective! (−${damage} HP)`);
    } else if (typeMultiplier === 0) {
      entries.push(`It had no effect!`);
    } else if (typeMultiplier <= 0.5) {
      entries.push(`It's not very effective... (−${damage} HP)`);
    } else {
      entries.push(`${def.name} took ${damage} damage!`);
    }

    newEvents.push({
      type: "damage",
      targetKey: targetKey,
      amount: damage,
      effectiveness: typeMultiplier,
      isCrit: isCrit
    });

    if (def.currentHp <= 0) {
      entries.push(`${def.name} fainted!`);
      newEvents.push({ type: "faint", targetKey: targetKey });
    }
  }

  // Secondary / status effects from moves
  if (move.statusEffect && def.currentHp > 0) {
    const result = applyStatus(def, move.statusEffect);
    def = result.target;
    entries.push(result.log);
  }

  // Stat stage modifying moves
  if (STAT_STAGE_MOVES[move.name] && def.currentHp > 0) {
    const changes = STAT_STAGE_MOVES[move.name];
    changes.forEach(({ target, stat, stages }) => {
      let t = target === "attacker" ? atk : def;
      
      // Initialize if missing
      if (!t.statStages) {
        t.statStages = { attack: 0, defense: 0, specialAttack: 0, specialDefense: 0, speed: 0, accuracy: 0, evasion: 0 };
      }

      const oldStage = t.statStages[stat] || 0;
      let newStage = Math.max(-6, Math.min(6, oldStage + stages));
      t.statStages[stat] = newStage;

      // Formatting name (e.g. "specialAttack" -> "Special Attack")
      let statDisplay = stat.charAt(0).toUpperCase() + stat.slice(1);
      if (stat === "specialAttack") statDisplay = "Special Attack";
      if (stat === "specialDefense") statDisplay = "Special Defense";

      if (newStage === oldStage) {
        entries.push(`${t.name}'s ${statDisplay} won't go any ${stages > 0 ? "higher" : "lower"}!`);
      } else {
        const adverb = Math.abs(stages) > 1 ? "sharply " : "";
        const verb = stages > 0 ? "rose!" : "fell!";
        entries.push(`${t.name}'s ${statDisplay} ${adverb}${verb}`);
      }
    });
  }

  return { attacker: atk, defender: def, log: entries, events: newEvents };
}

// ─────────────────────────────────────────────────────────────────────────────
// SWITCH HANDLING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * executeSwitch(playerState, switchToIndex) → { playerState, log }
 *
 * Swaps the active Pokémon for the one at switchToIndex in the bench.
 * Returns updated player state.
 *
 * @param {object} playerState - { active: pokemon, bench: [pokemon,...] }
 * @param {number} switchToIndex - index in bench array
 */
function executeSwitch(playerState, switchToIndex, log) {
  const entries = [...log];
  const newActive = playerState.bench[switchToIndex];

  if (!newActive) {
    entries.push(`Invalid switch target!`);
    return { playerState, log: entries };
  }
  if (newActive.currentHp <= 0) {
    entries.push(`${newActive.name} has already fainted and cannot be sent out!`);
    return { playerState, log: entries };
  }

  entries.push(`${playerState.active.name} was withdrawn!`);
  entries.push(`Go, ${newActive.name}!`);

  const newBench = [...playerState.bench];
  newBench[switchToIndex] = playerState.active;

  return {
    playerState: {
      ...playerState,
      active: newActive,
      bench: newBench,
    },
    log: entries,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TURN ORDER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * determineTurnOrder(p1State, p2State, p1Action, p2Action) → "p1First" | "p2First"
 *
 * Turn order rules (Gen 1):
 * 1. Switching always goes before attacking.
 * 2. Among attacks, higher priority moves go first (only Quick Attack = +1 in v1).
 * 3. Tie-break: higher Speed stat (post-paralysis) goes first.
 * 4. Speed tie: 50/50 coin flip.
 *
 * @param {object} p1State  - player 1's state { active: pokemon, ... }
 * @param {object} p2State  - player 2's state { active: pokemon, ... }
 * @param {object} p1Action - { type: "move"|"switch", move?: object, switchTo?: number }
 * @param {object} p2Action - same shape
 * @returns {"p1First"|"p2First"}
 */
function determineTurnOrder(state, actions) {
  // actions: { p1: action1, p2: action2, ... }
  const keys = Object.keys(actions).filter(k => actions[k]);
  
  return keys.sort((k1, k2) => {
    const a1 = actions[k1];
    const a2 = actions[k2];
    
    const isSw1 = a1.type === ACTION_TYPE.SWITCH;
    const isSw2 = a2.type === ACTION_TYPE.SWITCH;
    if (isSw1 && !isSw2) return -1;
    if (isSw2 && !isSw1) return 1;

    if (isSw1 && isSw2) return 0; // Switches have same priority

    const p1Priority = a1.move?.priority || 0;
    const p2Priority = a2.move?.priority || 0;
    if (p1Priority !== p2Priority) return p2Priority - p1Priority;

    const s1Speed = getEffectiveStat(state[k1].active, "speed");
    const s2Speed = getEffectiveStat(state[k2].active, "speed");
    if (s1Speed !== s2Speed) return s2Speed - s1Speed;

    return Math.random() < 0.5 ? -1 : 1;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// WIN CONDITION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * checkWinCondition(playerState) → boolean
 * Returns true if all Pokémon on this side have fainted.
 */
function checkWinCondition(playerState) {
  const allFainted =
    playerState.active.currentHp <= 0 &&
    playerState.bench.every((p) => p.currentHp <= 0);
  return allFainted;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN TURN RESOLVER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * resolveTurn(battleState, p1Action, p2Action, opts) → { newState, log }
 *
 * The main entry point. Takes the current battle state and both players'
 * chosen actions, returns the next battle state and a log of what happened.
 *
 * Battle State Shape:
 * {
 *   p1: {
 *     id: string,
 *     active: {
 *       id: number,
 *       name: string,
 *       types: string[],
 *       level: number,
 *       currentHp: number,
 *       maxHp: number,
 *       status: STATUS | null,
 *       sleepTurns: number,
 *       heldItem: string | null,
 *       moves: [{ name, type, power, accuracy, pp, currentPp, priority?, statusEffect? }],
 *       currentStats: { attack, defense, specialAttack, specialDefense, speed },
 *       statStages: { attack, defense, specialAttack, specialDefense, speed, accuracy, evasion }
 *     },
 *     bench: [pokemon, ...] // up to 5 more Pokémon (same shape as active)
 *   },
 *   p2: { ... same shape ... },
 *   turn: number,
 *   winner: null | "p1" | "p2",
 * }
 *
 * Action Shape:
 * { type: "move", move: moveObject }  OR  { type: "switch", switchTo: number }
 *
 * @param {object} battleState
 * @param {object} p1Action
 * @param {object} p2Action
 * @param {object} [opts] - RNG overrides for testing: { randomFactor, hitRoll, paralysisRoll, thawRoll }
 * @returns {{ newState: object, log: string[], events: object[] }}
 */
function resolveTurn(battleState, actions, opts = {}) {
  if (battleState.winner) {
    return { newState: battleState, log: ["The battle is already over!"], events: [] };
  }

  let state = cloneState(battleState);
  let log = [];
  let events = [];

  const turnOrderKeys = determineTurnOrder(state, actions);

  // ── Helper: apply one action ──────────────────────────────────────────────
  function applyAction(actorKey, action) {
    if (state[actorKey].active.currentHp <= 0) return; // fainted before they could move

    if (action.type === ACTION_TYPE.SWITCH) {
      const result = executeSwitch(state[actorKey], action.switchTo, log);
      state[actorKey] = result.playerState;
      log = result.log;
      return;
    }

    const actor = state[actorKey].active;
    const actCheck = canActThisTurn(actor, opts);
    log = [...log, ...actCheck.log];

    if (actCheck.wake) {
      state[actorKey].active = { ...state[actorKey].active, status: STATUS.NONE, sleepTurns: 0 };
    } else if (actCheck.thaw) {
      state[actorKey].active = { ...state[actorKey].active, status: STATUS.NONE };
    } else if (actCheck.sleepTurns !== undefined) {
      state[actorKey].active = { ...state[actorKey].active, sleepTurns: actCheck.sleepTurns };
    }

    if (!actCheck.canAct) return;

    // Determine targets
    const isMultiTarget = ["earthquake", "surf", "blizzard", "thunder", "self-destruct", "explosion"].includes(action.move.name);
    
    let targets = [];
    const playerKeys = Object.keys(state).filter(k => k !== "turn" && k !== "winner");

    if (isMultiTarget) {
      // Hit all alive opponents
      targets = playerKeys.filter(k => k !== actorKey && state[k].active.currentHp > 0);
    } else {
      // Single target
      if (action.targetId && state[action.targetId] && state[action.targetId].active.currentHp > 0) {
        targets = [action.targetId];
      } else {
         // Target missing or fainted, pick a random alive opponent
         const aliveOpponents = playerKeys.filter(k => k !== actorKey && state[k].active.currentHp > 0);
         if (aliveOpponents.length > 0) {
           const randTarget = aliveOpponents[Math.floor(Math.random() * aliveOpponents.length)];
           targets = [randTarget];
         }
      }
    }

    if (targets.length === 0) {
       log.push(`But there was no target!`);
       return;
    }

    for (const tKey of targets) {
       const def = state[tKey].active;
       if (def.currentHp <= 0) continue;

       const result = executeMove(
         state[actorKey].active,
         def,
         action.move,
         log,
         events,
         tKey,
         opts
       );
       state[actorKey].active = result.attacker;
       state[tKey].active = result.defender;
       log = result.log;
       events = result.events;
    }
  }

  // Iterate over actions in turn order
  for (const k of turnOrderKeys) {
     applyAction(k, actions[k]);
  }

  // ── End-of-turn effects ───────────────────────────────────────────────────
  const playerKeys = Object.keys(state).filter(k => k !== "turn" && k !== "winner");
  for (const playerKey of playerKeys) {
    if (state[playerKey].active.currentHp > 0) {
      const result = applyEndOfTurnEffects(state[playerKey].active, log);
      state[playerKey].active = result.pokemon;
      log = result.log;
    }
  }

  state.turn += 1;

  // ── Check win conditions ──────────────────────────────────────────────────
  const aliveKeys = playerKeys.filter(k => !checkWinCondition(state[k]));

  if (aliveKeys.length === 1) {
    state.winner = aliveKeys[0];
    log.push(`${state.winner} is the last one standing and wins the battle!`);
  } else if (aliveKeys.length === 0 && playerKeys.length > 0) {
    state.winner = "draw";
    log.push("Everyone fainted! It's a draw!");
  }

  return { newState: state, log, events };
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  // Core
  resolveTurn,
  calculateDamage,
  applyStatus,
  applyEndOfTurnEffects,
  // Helpers (exported for testing)
  getTypeEffectiveness,
  isSpecialMove,
  getEffectiveStat,
  getStatWithStage,
  doesMoveHit,
  canActThisTurn,
  executeMove,
  executeSwitch,
  determineTurnOrder,
  checkWinCondition,
  // Constants
  STATUS,
  ACTION_TYPE,
  SPECIAL_TYPES,
};
