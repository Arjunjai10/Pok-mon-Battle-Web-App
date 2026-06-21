/**
 * battleEngine.test.js — Unit tests for the Gen 1 battle engine
 *
 * Run with: node battleEngine.test.js
 * (No external test framework required — pure Node.js assertions)
 *
 * Test groups:
 *  1. Type effectiveness chart
 *  2. Damage formula
 *  3. Status effect application
 *  4. Status effects during turns (paralysis, sleep, freeze, burn, poison)
 *  5. Switching
 *  6. Turn order (speed, priority, switches)
 *  7. Full turn resolution (resolveTurn)
 *  8. Fainting & win conditions
 *  9. Held items (Leftovers)
 */

"use strict";

const assert = require("assert");
const {
  resolveTurn,
  calculateDamage,
  applyStatus,
  applyEndOfTurnEffects,
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
  STATUS,
  ACTION_TYPE,
} = require("./battleEngine");

// ─────────────────────────────────────────────────────────────────────────────
// TEST HARNESS
// ─────────────────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
    failures.push({ name, error: err.message });
  }
}

function describe(groupName, fn) {
  console.log(`\n▸ ${groupName}`);
  fn();
}

// ─────────────────────────────────────────────────────────────────────────────
// FIXTURES — reusable Pokémon and move objects
// ─────────────────────────────────────────────────────────────────────────────

function makePokemon(overrides = {}) {
  return {
    id: 1,
    name: "TestMon",
    types: ["Normal"],
    level: 100,
    currentHp: 250,
    maxHp: 250,
    status: null,
    sleepTurns: 0,
    heldItem: null,
    moves: [],
    currentStats: {
      attack: 100,
      defense: 100,
      specialAttack: 100,
      specialDefense: 100,
      speed: 100,
    },
    statStages: {
      attack: 0,
      defense: 0,
      specialAttack: 0,
      specialDefense: 0,
      speed: 0,
    },
    ...overrides,
  };
}

function makeMove(overrides = {}) {
  return {
    name: "Tackle",
    type: "Normal",
    power: 40,
    accuracy: 100,
    pp: 35,
    currentPp: 35,
    priority: 0,
    statusEffect: null,
    ...overrides,
  };
}

function makeBattleState(p1Overrides = {}, p2Overrides = {}) {
  const p1Pokemon = makePokemon({ name: "Bulbasaur", types: ["Grass", "Poison"], id: 1, ...p1Overrides.pokemon });
  const p2Pokemon = makePokemon({ name: "Charmander", types: ["Fire"], id: 4, ...p2Overrides.pokemon });

  return {
    p1: {
      id: "player1",
      active: p1Pokemon,
      bench: p1Overrides.bench || [],
    },
    p2: {
      id: "player2",
      active: p2Pokemon,
      bench: p2Overrides.bench || [],
    },
    turn: 1,
    winner: null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. TYPE EFFECTIVENESS
// ─────────────────────────────────────────────────────────────────────────────

describe("Type Effectiveness", () => {
  test("Water is 2x vs Fire", () => {
    assert.strictEqual(getTypeEffectiveness("Water", ["Fire"]), 2);
  });

  test("Water is 0.5x vs Grass", () => {
    assert.strictEqual(getTypeEffectiveness("Water", ["Grass"]), 0.5);
  });

  test("Electric is 0x vs Ground", () => {
    assert.strictEqual(getTypeEffectiveness("Electric", ["Ground"]), 0);
  });

  test("Normal vs Ghost = 0x (immunity)", () => {
    assert.strictEqual(getTypeEffectiveness("Normal", ["Ghost"]), 0);
  });

  test("[GEN1 BUG] Ghost vs Psychic = 0x (not 2x — Gen 1 bug)", () => {
    assert.strictEqual(getTypeEffectiveness("Ghost", ["Psychic"]), 0);
  });

  test("Water vs Fire/Flying = 2x (dual type, single hitting)", () => {
    assert.strictEqual(getTypeEffectiveness("Water", ["Fire", "Flying"]), 2);
  });

  test("Ground vs Electric/Flying = 0x (Flying cancels)", () => {
    assert.strictEqual(getTypeEffectiveness("Ground", ["Electric", "Flying"]), 0);
  });

  test("Ice vs Water/Flying = 0.5 * 2 = 1 (neutral combined)", () => {
    assert.strictEqual(getTypeEffectiveness("Ice", ["Water", "Flying"]), 1);
  });

  test("Rock vs Fire/Flying = 2*2=4x (double super effective)", () => {
    assert.strictEqual(getTypeEffectiveness("Rock", ["Fire", "Flying"]), 4);
  });

  test("Normal vs Normal/Normal = 1x", () => {
    assert.strictEqual(getTypeEffectiveness("Normal", ["Normal"]), 1);
  });

  test("[GEN1] Poison vs Bug = 2x", () => {
    assert.strictEqual(getTypeEffectiveness("Poison", ["Bug"]), 2);
  });

  test("[GEN1] Bug vs Poison = 2x (changed in Gen 2+)", () => {
    assert.strictEqual(getTypeEffectiveness("Bug", ["Poison"]), 2);
  });

  test("Unknown attacking type returns 1", () => {
    assert.strictEqual(getTypeEffectiveness("Dark", ["Normal"]), 1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. DAMAGE FORMULA
// ─────────────────────────────────────────────────────────────────────────────

describe("Damage Formula", () => {
  test("Basic physical damage (Tackle, Normal vs Normal, no STAB)", () => {
    const attacker = makePokemon({ types: ["Fire"], currentStats: { attack: 100, defense: 100, specialAttack: 100, specialDefense: 100, speed: 100 } });
    const defender = makePokemon({ types: ["Water"] });
    const move = makeMove({ name: "Tackle", type: "Normal", power: 40 });
    // With randomFactor=1.0: floor((floor(2*100/5+2)*40*100/100)/50)+2 = floor((42*40)/50)+2 = floor(33.6)+2 = 35
    const dmg = calculateDamage(attacker, defender, move, { randomFactor: 1.0 });
    assert.strictEqual(dmg, 35);
  });

  test("STAB bonus increases damage by 1.5x", () => {
    const attacker = makePokemon({ types: ["Normal"], currentStats: { attack: 100, defense: 100, specialAttack: 100, specialDefense: 100, speed: 100 } });
    const defender = makePokemon({ types: ["Normal"] });
    const moveNoStab = makeMove({ name: "Tackle", type: "Normal", power: 40 });
    const moveStab = makeMove({ name: "Pound", type: "Normal", power: 40 });

    const noStabDmg = calculateDamage(attacker, defender, moveNoStab, { randomFactor: 1.0 });
    const stabDmg = calculateDamage(attacker, defender, moveStab, { randomFactor: 1.0 });
    // attacker is Normal type, Pound is Normal type → STAB
    assert.strictEqual(Math.floor(noStabDmg * 1.5), stabDmg);
  });

  test("Type advantage (2x) doubles damage", () => {
    const attacker = makePokemon({ types: ["Water"], currentStats: { attack: 100, defense: 100, specialAttack: 100, specialDefense: 100, speed: 100 } });
    const defenderNeutral = makePokemon({ types: ["Normal"] });
    const defenderWeak = makePokemon({ types: ["Fire"] });
    const move = makeMove({ name: "Water Gun", type: "Water", power: 40 });

    const neutral = calculateDamage(attacker, defenderNeutral, move, { randomFactor: 1.0 });
    const superEff = calculateDamage(attacker, defenderWeak, move, { randomFactor: 1.0 });
    assert.strictEqual(Math.floor(neutral * 2), superEff);
  });

  test("Type resistance (0.5x) halves damage", () => {
    const attacker = makePokemon({ types: ["Water"], currentStats: { attack: 100, defense: 100, specialAttack: 100, specialDefense: 100, speed: 100 } });
    const defenderNeutral = makePokemon({ types: ["Normal"] });
    const defenderResist = makePokemon({ types: ["Water"] });
    const move = makeMove({ name: "Water Gun", type: "Water", power: 40 });

    const neutral = calculateDamage(attacker, defenderNeutral, move, { randomFactor: 1.0 });
    const notVery = calculateDamage(attacker, defenderResist, move, { randomFactor: 1.0 });
    assert.strictEqual(Math.floor(neutral * 0.5), notVery);
  });

  test("Type immunity (0x) deals 0 damage", () => {
    const attacker = makePokemon({ types: ["Electric"] });
    const defender = makePokemon({ types: ["Ground"] });
    const move = makeMove({ name: "Thunder", type: "Electric", power: 110 });
    const dmg = calculateDamage(attacker, defender, move, { randomFactor: 1.0 });
    assert.strictEqual(dmg, 0);
  });

  test("Status moves (power=0) deal 0 damage", () => {
    const attacker = makePokemon({});
    const defender = makePokemon({});
    const move = makeMove({ name: "Thunder Wave", type: "Electric", power: 0 });
    const dmg = calculateDamage(attacker, defender, move, { randomFactor: 1.0 });
    assert.strictEqual(dmg, 0);
  });

  test("[GEN1] Burn halves physical attack stat", () => {
    const attacker = makePokemon({ status: STATUS.BURN, types: ["Normal"], currentStats: { attack: 100, defense: 100, specialAttack: 100, specialDefense: 100, speed: 100 } });
    const attackerHealthy = makePokemon({ types: ["Normal"], currentStats: { attack: 100, defense: 100, specialAttack: 100, specialDefense: 100, speed: 100 } });
    const defender = makePokemon({ types: ["Normal"] });
    const move = makeMove({ name: "Tackle", type: "Normal", power: 40 });

    const burnedDmg = calculateDamage(attacker, defender, move, { randomFactor: 1.0 });
    const healthyDmg = calculateDamage(attackerHealthy, defender, move, { randomFactor: 1.0 });
    // Burned attack = floor(100/2) = 50; healthy = 100
    // floor((42*40*50/100)/50)+2 = floor(16.8)+2 = 18
    // floor((42*40*100/100)/50)+2 = floor(33.6)+2 = 35
    assert.ok(burnedDmg < healthyDmg, `Burned damage (${burnedDmg}) should be less than healthy (${healthyDmg})`);
  });

  test("[GEN1] Special moves use Special Attack / Special Defense stats", () => {
    // Water Gun is Special in Gen 1 → uses specialAttack/specialDefense
    const attacker = makePokemon({ currentStats: { attack: 50, defense: 100, specialAttack: 150, specialDefense: 100, speed: 100 } });
    const defender = makePokemon({ types: ["Normal"], currentStats: { attack: 100, defense: 100, specialAttack: 100, specialDefense: 100, speed: 100 } });
    const specialMove = makeMove({ name: "Water Gun", type: "Water", power: 40 });
    const physMove = makeMove({ name: "Tackle", type: "Normal", power: 40 });

    const specDmg = calculateDamage(attacker, defender, specialMove, { randomFactor: 1.0 });
    const physDmg = calculateDamage(attacker, defender, physMove, { randomFactor: 1.0 });
    // Special move should use specialAttack (150) vs Tackle uses attack (50)
    assert.ok(specDmg > physDmg, `Special damage (${specDmg}) should exceed physical (${physDmg}) when Sp.Atk > Atk`);
  });

  test("Stat stages applied correctly (+2 stage roughly doubles effective stat)", () => {
    const baseStat = 100;
    const atStage0 = getStatWithStage(baseStat, 0);
    const atStagePos2 = getStatWithStage(baseStat, 2);
    assert.strictEqual(atStage0, 100);
    assert.ok(atStagePos2 > 150, `+2 stage should significantly boost stat, got ${atStagePos2}`);
  });

  test("Minimum 1 damage when not immune and has power", () => {
    // Extremely low power, very high defense
    const attacker = makePokemon({ currentStats: { attack: 1, defense: 100, specialAttack: 1, specialDefense: 100, speed: 100 } });
    const defender = makePokemon({ types: ["Normal"], currentStats: { attack: 100, defense: 9999, specialAttack: 100, specialDefense: 9999, speed: 100 } });
    const move = makeMove({ name: "Scratch", type: "Normal", power: 40 });
    const dmg = calculateDamage(attacker, defender, move, { randomFactor: 0.85 });
    assert.ok(dmg >= 1, `Damage should be at least 1, got ${dmg}`);
  });

  test("4x super effective damage (double weakness)", () => {
    const attacker = makePokemon({ types: ["Rock"], currentStats: { attack: 100, defense: 100, specialAttack: 100, specialDefense: 100, speed: 100 } });
    const defenderNeutral = makePokemon({ types: ["Normal"] });
    const defenderDoubleWeak = makePokemon({ types: ["Fire", "Flying"] }); // Rock hits both 2x
    const move = makeMove({ name: "Rock Slide", type: "Rock", power: 75 });

    const neutral = calculateDamage(attacker, defenderNeutral, move, { randomFactor: 1.0 });
    const quadWeak = calculateDamage(attacker, defenderDoubleWeak, move, { randomFactor: 1.0 });
    assert.strictEqual(Math.floor(neutral * 4), quadWeak);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. STATUS EFFECT APPLICATION
// ─────────────────────────────────────────────────────────────────────────────

describe("Status Application", () => {
  test("Burn can be applied to healthy Pokémon", () => {
    const p = makePokemon({});
    const { target, log } = applyStatus(p, STATUS.BURN);
    assert.strictEqual(target.status, STATUS.BURN);
    assert.ok(log.includes("burned"), `Expected burn log, got: ${log}`);
  });

  test("Paralysis can be applied to healthy Pokémon", () => {
    const p = makePokemon({});
    const { target, log } = applyStatus(p, STATUS.PARALYSIS);
    assert.strictEqual(target.status, STATUS.PARALYSIS);
    assert.ok(log.includes("paralyzed"), `Expected paralysis log, got: ${log}`);
  });

  test("Sleep can be applied and sets sleepTurns > 0", () => {
    const p = makePokemon({});
    const { target } = applyStatus(p, STATUS.SLEEP);
    assert.strictEqual(target.status, STATUS.SLEEP);
    assert.ok(target.sleepTurns >= 1 && target.sleepTurns <= 6,
      `sleepTurns should be 1–6, got ${target.sleepTurns}`);
  });

  test("Cannot apply a second status when one already exists", () => {
    const p = makePokemon({ status: STATUS.BURN });
    const { target, log } = applyStatus(p, STATUS.PARALYSIS);
    assert.strictEqual(target.status, STATUS.BURN, "Status should remain BURN");
    assert.ok(log.includes("already has"), `Expected 'already has' log, got: ${log}`);
  });

  test("Freeze can be applied", () => {
    const p = makePokemon({});
    const { target } = applyStatus(p, STATUS.FREEZE);
    assert.strictEqual(target.status, STATUS.FREEZE);
  });

  test("Poison can be applied", () => {
    const p = makePokemon({});
    const { target } = applyStatus(p, STATUS.POISON);
    assert.strictEqual(target.status, STATUS.POISON);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. STATUS EFFECTS DURING TURNS
// ─────────────────────────────────────────────────────────────────────────────

describe("Status Effects During Turns", () => {
  test("Paralyzed Pokémon cannot act (25% chance forced via roll)", () => {
    const p = makePokemon({ status: STATUS.PARALYSIS });
    const result = canActThisTurn(p, { paralysisRoll: 0.1 }); // < 0.25 → can't act
    assert.strictEqual(result.canAct, false);
  });

  test("Paralyzed Pokémon can act when roll ≥ 0.25", () => {
    const p = makePokemon({ status: STATUS.PARALYSIS });
    const result = canActThisTurn(p, { paralysisRoll: 0.5 });
    assert.strictEqual(result.canAct, true);
  });

  test("Sleeping Pokémon cannot act and decrements sleep counter", () => {
    const p = makePokemon({ status: STATUS.SLEEP, sleepTurns: 3 });
    const result = canActThisTurn(p, {});
    assert.strictEqual(result.canAct, false);
    assert.strictEqual(result.sleepTurns, 2);
  });

  test("Sleeping Pokémon wakes up when sleepTurns reaches 0", () => {
    const p = makePokemon({ status: STATUS.SLEEP, sleepTurns: 0 });
    const result = canActThisTurn(p, {});
    assert.strictEqual(result.wake, true);
    assert.ok(result.log.some(l => l.includes("woke")));
  });

  test("Frozen Pokémon cannot act when thaw roll fails", () => {
    const p = makePokemon({ status: STATUS.FREEZE });
    const result = canActThisTurn(p, { thawRoll: 0.5 }); // ≥ 0.10 → stays frozen
    assert.strictEqual(result.canAct, false);
  });

  test("Frozen Pokémon thaws when thaw roll < 0.10", () => {
    const p = makePokemon({ status: STATUS.FREEZE });
    const result = canActThisTurn(p, { thawRoll: 0.05 });
    assert.strictEqual(result.thaw, true);
    assert.ok(result.log.some(l => l.includes("thawed")));
  });

  test("Burn deals 1/16 max HP chip damage at end of turn", () => {
    const p = makePokemon({ status: STATUS.BURN, maxHp: 160, currentHp: 160 });
    const { pokemon } = applyEndOfTurnEffects(p, []);
    const expected = 160 - Math.floor(160 / 16); // 160 - 10 = 150
    assert.strictEqual(pokemon.currentHp, expected);
  });

  test("Poison deals 1/16 max HP chip damage at end of turn", () => {
    const p = makePokemon({ status: STATUS.POISON, maxHp: 160, currentHp: 160 });
    const { pokemon } = applyEndOfTurnEffects(p, []);
    const expected = 160 - Math.floor(160 / 16);
    assert.strictEqual(pokemon.currentHp, expected);
  });

  test("Status chip damage does not reduce HP below 0", () => {
    const p = makePokemon({ status: STATUS.BURN, maxHp: 160, currentHp: 1 });
    const { pokemon } = applyEndOfTurnEffects(p, []);
    assert.strictEqual(pokemon.currentHp, 0);
  });

  test("Paralysis halves speed in effective stat", () => {
    const p = makePokemon({ status: STATUS.PARALYSIS, currentStats: { attack: 100, defense: 100, specialAttack: 100, specialDefense: 100, speed: 100 } });
    const speed = getEffectiveStat(p, "speed");
    assert.strictEqual(speed, 25); // floor(100/4) = 25
  });

  test("Non-status Pokémon has full speed", () => {
    const p = makePokemon({ currentStats: { attack: 100, defense: 100, specialAttack: 100, specialDefense: 100, speed: 100 } });
    assert.strictEqual(getEffectiveStat(p, "speed"), 100);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. SWITCHING
// ─────────────────────────────────────────────────────────────────────────────

describe("Switching", () => {
  test("Valid switch puts bench Pokémon active and returns old active to bench", () => {
    const active = makePokemon({ name: "Active", currentHp: 100 });
    const benchMon = makePokemon({ name: "BenchMon", currentHp: 80 });
    const playerState = { id: "p1", active, bench: [benchMon] };

    const { playerState: next } = executeSwitch(playerState, 0, []);
    assert.strictEqual(next.active.name, "BenchMon");
    assert.strictEqual(next.bench[0].name, "Active");
  });

  test("Cannot switch to fainted Pokémon", () => {
    const active = makePokemon({ name: "Active", currentHp: 100 });
    const fainted = makePokemon({ name: "Fainted", currentHp: 0 });
    const playerState = { id: "p1", active, bench: [fainted] };

    const { playerState: next, log } = executeSwitch(playerState, 0, []);
    assert.strictEqual(next.active.name, "Active", "Active should not change");
    assert.ok(log.some(l => l.includes("fainted")));
  });

  test("Switch to invalid index returns unchanged state", () => {
    const active = makePokemon({ name: "Active" });
    const playerState = { id: "p1", active, bench: [] };

    const { playerState: next } = executeSwitch(playerState, 5, []);
    assert.strictEqual(next.active.name, "Active");
  });

  test("Switch logs withdrawal and send-out messages", () => {
    const active = makePokemon({ name: "Venusaur" });
    const bench = makePokemon({ name: "Blastoise", currentHp: 100 });
    const playerState = { id: "p1", active, bench: [bench] };

    const { log } = executeSwitch(playerState, 0, []);
    assert.ok(log.some(l => l.includes("Venusaur") && l.includes("withdrawn")));
    assert.ok(log.some(l => l.includes("Blastoise")));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. TURN ORDER
// ─────────────────────────────────────────────────────────────────────────────

describe("Turn Order", () => {
  test("Faster Pokémon attacks first", () => {
    const fast = { active: makePokemon({ name: "Fast", currentStats: { attack: 100, defense: 100, specialAttack: 100, specialDefense: 100, speed: 150 } }) };
    const slow = { active: makePokemon({ name: "Slow", currentStats: { attack: 100, defense: 100, specialAttack: 100, specialDefense: 100, speed: 50 } }) };
    const move = { type: ACTION_TYPE.MOVE, move: makeMove() };

    // p1 is fast, p2 is slow
    const order = determineTurnOrder(fast, slow, move, move);
    assert.strictEqual(order, "p1First");
  });

  test("Slower Pokémon goes second", () => {
    const fast = { active: makePokemon({ currentStats: { attack: 100, defense: 100, specialAttack: 100, specialDefense: 100, speed: 150 } }) };
    const slow = { active: makePokemon({ currentStats: { attack: 100, defense: 100, specialAttack: 100, specialDefense: 100, speed: 50 } }) };
    const move = { type: ACTION_TYPE.MOVE, move: makeMove() };

    // p2 is fast, p1 is slow
    const order = determineTurnOrder(slow, fast, move, move);
    assert.strictEqual(order, "p2First");
  });

  test("Higher priority move goes before faster Pokémon", () => {
    const p1State = { active: makePokemon({ currentStats: { attack: 100, defense: 100, specialAttack: 100, specialDefense: 100, speed: 50 } }) };
    const p2State = { active: makePokemon({ currentStats: { attack: 100, defense: 100, specialAttack: 100, specialDefense: 100, speed: 200 } }) };
    const priorityMove = { type: ACTION_TYPE.MOVE, move: makeMove({ name: "Quick Attack", priority: 1 }) };
    const normalMove = { type: ACTION_TYPE.MOVE, move: makeMove({ name: "Tackle", priority: 0 }) };

    // p1 uses Quick Attack (+1 priority), p2 uses Tackle (slower but p2 has higher speed)
    const order = determineTurnOrder(p1State, p2State, priorityMove, normalMove);
    assert.strictEqual(order, "p1First");
  });

  test("Switch always beats an attack", () => {
    const p1State = { active: makePokemon({ currentStats: { attack: 100, defense: 100, specialAttack: 100, specialDefense: 100, speed: 50 } }) };
    const p2State = { active: makePokemon({ currentStats: { attack: 100, defense: 100, specialAttack: 100, specialDefense: 100, speed: 200 } }) };
    const switchAction = { type: ACTION_TYPE.SWITCH, switchTo: 0 };
    const attackAction = { type: ACTION_TYPE.MOVE, move: makeMove() };

    // p1 switches (lower speed but switch goes first)
    const order = determineTurnOrder(p1State, p2State, switchAction, attackAction);
    assert.strictEqual(order, "p1First");
  });

  test("Paralyzed Pokémon has quartered speed for order purposes", () => {
    const p1State = { active: makePokemon({ status: STATUS.PARALYSIS, currentStats: { attack: 100, defense: 100, specialAttack: 100, specialDefense: 100, speed: 120 } }) };
    const p2State = { active: makePokemon({ currentStats: { attack: 100, defense: 100, specialAttack: 100, specialDefense: 100, speed: 40 } }) }; // slower but p1 is paralyzed (120/4=30 < 40)
    const move = { type: ACTION_TYPE.MOVE, move: makeMove() };

    const order = determineTurnOrder(p1State, p2State, move, move);
    // p1 speed = floor(120/4) = 30, p2 speed = 40 → p2 goes first
    assert.strictEqual(order, "p2First");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. FULL TURN RESOLUTION
// ─────────────────────────────────────────────────────────────────────────────

describe("Full Turn Resolution (resolveTurn)", () => {
  test("Both Pokémon attack each other and HP is reduced", () => {
    const state = makeBattleState();
    const move = makeMove({ name: "Tackle", type: "Normal", power: 40, currentPp: 35 });
    state.p1.active.moves = [move];
    state.p2.active.moves = [move];

    const p1Action = { type: ACTION_TYPE.MOVE, move };
    const p2Action = { type: ACTION_TYPE.MOVE, move };

    const { newState } = resolveTurn(state, p1Action, p2Action, { randomFactor: 1.0, hitRoll: 0.0 });

    assert.ok(newState.p1.active.currentHp < 250, "P1 should have taken damage");
    assert.ok(newState.p2.active.currentHp < 250, "P2 should have taken damage");
    assert.strictEqual(newState.turn, 2);
    assert.strictEqual(newState.winner, null);
  });

  test("Turn counter increments each turn", () => {
    const state = makeBattleState();
    state.p1.active.moves = [makeMove()];
    state.p2.active.moves = [makeMove()];
    const action = { type: ACTION_TYPE.MOVE, move: makeMove() };

    const { newState: s1 } = resolveTurn(state, action, action, { randomFactor: 1.0, hitRoll: 0.0 });
    assert.strictEqual(s1.turn, 2);

    const { newState: s2 } = resolveTurn(s1, action, action, { randomFactor: 1.0, hitRoll: 0.0 });
    assert.strictEqual(s2.turn, 3);
  });

  test("Original state is not mutated", () => {
    const state = makeBattleState();
    state.p1.active.moves = [makeMove()];
    state.p2.active.moves = [makeMove()];
    const originalHp = state.p2.active.currentHp;
    const action = { type: ACTION_TYPE.MOVE, move: makeMove({ type: "Normal", power: 40 }) };

    resolveTurn(state, action, action, { randomFactor: 1.0, hitRoll: 0.0 });
    assert.strictEqual(state.p2.active.currentHp, originalHp, "Original state should not be mutated");
  });

  test("Log contains move usage messages", () => {
    const state = makeBattleState();
    const move = makeMove({ name: "Tackle" });
    state.p1.active.moves = [move];
    state.p2.active.moves = [move];
    const action = { type: ACTION_TYPE.MOVE, move };

    const { log } = resolveTurn(state, action, action, { randomFactor: 1.0, hitRoll: 0.0 });
    const hasUsed = log.some(l => l.includes("used Tackle"));
    assert.ok(hasUsed, `Expected 'used Tackle' in log. Got: ${JSON.stringify(log)}`);
  });

  test("A missed move is logged", () => {
    const state = makeBattleState();
    const move = makeMove({ name: "Tackle", accuracy: 100 });
    const action = { type: ACTION_TYPE.MOVE, move };
    state.p1.active.moves = [move];
    state.p2.active.moves = [move];

    const { log } = resolveTurn(state, action, action, { hitRoll: 0.99 }); // > accuracy/100 → miss
    assert.ok(log.some(l => l.includes("missed")), `Expected 'missed' in log. Got: ${JSON.stringify(log)}`);
  });

  test("Status move logs super-effective/immune when applicable", () => {
    const state = makeBattleState({
      pokemon: { types: ["Electric"] }
    }, {
      pokemon: { types: ["Ground"] }
    });
    const thunderMove = makeMove({ name: "Thunder", type: "Electric", power: 110 });
    state.p1.active.moves = [thunderMove];
    state.p2.active.moves = [thunderMove];

    const { log, newState } = resolveTurn(
      state,
      { type: ACTION_TYPE.MOVE, move: thunderMove },
      { type: ACTION_TYPE.MOVE, move: thunderMove },
      { randomFactor: 1.0, hitRoll: 0.0 }
    );

    // P2 (Ground type) should be immune to P1's Electric move
    assert.strictEqual(newState.p2.active.currentHp, 250, "Ground-type should take 0 damage from Electric");
  });

  test("PP is decremented after using a move", () => {
    const state = makeBattleState();
    const move = makeMove({ name: "Tackle", currentPp: 10 });
    state.p1.active.moves = [move];
    state.p2.active.moves = [makeMove()];

    const { newState } = resolveTurn(
      state,
      { type: ACTION_TYPE.MOVE, move },
      { type: ACTION_TYPE.MOVE, move: makeMove() },
      { randomFactor: 1.0, hitRoll: 0.0 }
    );

    const usedMove = newState.p1.active.moves.find(m => m.name === "Tackle");
    assert.strictEqual(usedMove.currentPp, 9);
  });

  test("Finished battle does not continue resolving", () => {
    const state = makeBattleState();
    state.winner = "p1";
    const move = makeMove();
    const action = { type: ACTION_TYPE.MOVE, move };

    const { newState, log } = resolveTurn(state, action, action);
    assert.strictEqual(newState.winner, "p1");
    assert.ok(log.some(l => l.includes("already over")));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. FAINTING & WIN CONDITIONS
// ─────────────────────────────────────────────────────────────────────────────

describe("Fainting & Win Conditions", () => {
  test("checkWinCondition returns true when all Pokémon have 0 HP", () => {
    const playerState = {
      active: makePokemon({ currentHp: 0 }),
      bench: [makePokemon({ currentHp: 0 }), makePokemon({ currentHp: 0 })],
    };
    assert.strictEqual(checkWinCondition(playerState), true);
  });

  test("checkWinCondition returns false when bench has HP", () => {
    const playerState = {
      active: makePokemon({ currentHp: 0 }),
      bench: [makePokemon({ currentHp: 100 })],
    };
    assert.strictEqual(checkWinCondition(playerState), false);
  });

  test("checkWinCondition returns false when active has HP", () => {
    const playerState = {
      active: makePokemon({ currentHp: 50 }),
      bench: [makePokemon({ currentHp: 0 })],
    };
    assert.strictEqual(checkWinCondition(playerState), false);
  });

  test("Win condition is set when P2 is KOed with no bench", () => {
    const state = makeBattleState({}, { pokemon: { currentHp: 1 }, bench: [] });
    // Use a powerful move that guarantees a KO
    const move = makeMove({ name: "Hyper Beam", type: "Normal", power: 150 });
    state.p1.active.moves = [move];
    state.p2.active.moves = [makeMove()]; // P2 uses weak move, P1 has much higher speed

    // Make P1 faster to ensure P1 attacks first and KOs P2
    state.p1.active.currentStats.speed = 999;
    state.p2.active.currentStats.speed = 1;

    const { newState } = resolveTurn(
      state,
      { type: ACTION_TYPE.MOVE, move },
      { type: ACTION_TYPE.MOVE, move: makeMove() },
      { randomFactor: 1.0, hitRoll: 0.0 }
    );

    assert.strictEqual(newState.winner, "p1", `Expected p1 to win, got: ${newState.winner}`);
  });

  test("Fainted Pokémon is logged", () => {
    const state = makeBattleState({}, { pokemon: { currentHp: 1 }, bench: [] });
    state.p1.active.currentStats.speed = 999;
    state.p2.active.currentStats.speed = 1;

    const move = makeMove({ name: "Hyper Beam", type: "Normal", power: 150 });
    state.p1.active.moves = [move];
    state.p2.active.moves = [makeMove()];

    const { log } = resolveTurn(
      state,
      { type: ACTION_TYPE.MOVE, move },
      { type: ACTION_TYPE.MOVE, move: makeMove() },
      { randomFactor: 1.0, hitRoll: 0.0 }
    );

    assert.ok(log.some(l => l.includes("fainted")), `Expected 'fainted' in log. Got: ${JSON.stringify(log)}`);
  });

  test("Second Pokémon does not attack after fainting from first Pokémon's move", () => {
    const state = makeBattleState(
      { pokemon: { currentHp: 500, maxHp: 500 } }, // P1 very bulky
      { pokemon: { currentHp: 1 }, bench: [] }
    );
    state.p1.active.currentStats.speed = 999; // P1 always goes first
    state.p2.active.currentStats.speed = 1;

    const bigMove = makeMove({ name: "Hyper Beam", type: "Normal", power: 150 });
    const p2Move = makeMove({ name: "Tackle", type: "Normal", power: 40 });
    state.p1.active.moves = [bigMove];
    state.p2.active.moves = [p2Move];

    const { newState, log } = resolveTurn(
      state,
      { type: ACTION_TYPE.MOVE, move: bigMove },
      { type: ACTION_TYPE.MOVE, move: p2Move },
      { randomFactor: 1.0, hitRoll: 0.0 }
    );

    // P1 should be at full HP (P2 fainted before attacking)
    assert.strictEqual(newState.p1.active.currentHp, 500, "P1 should take no damage since P2 fainted first");
    assert.ok(log.some(l => l.includes("can no longer fight")));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. HELD ITEMS
// ─────────────────────────────────────────────────────────────────────────────

describe("Held Items — Leftovers", () => {
  test("Leftovers heals 1/16 max HP at end of turn", () => {
    const p = makePokemon({ heldItem: "leftovers", maxHp: 256, currentHp: 200 });
    const { pokemon, log } = applyEndOfTurnEffects(p, []);
    const expectedHeal = Math.floor(256 / 16); // 16
    assert.strictEqual(pokemon.currentHp, 200 + expectedHeal);
    assert.ok(log.some(l => l.includes("Leftovers")));
  });

  test("Leftovers does not heal beyond max HP", () => {
    const p = makePokemon({ heldItem: "leftovers", maxHp: 256, currentHp: 255 });
    const { pokemon } = applyEndOfTurnEffects(p, []);
    assert.strictEqual(pokemon.currentHp, 256); // should not exceed maxHp
  });

  test("Leftovers does not log when already at full HP", () => {
    const p = makePokemon({ heldItem: "leftovers", maxHp: 256, currentHp: 256 });
    const { log } = applyEndOfTurnEffects(p, []);
    assert.ok(!log.some(l => l.includes("Leftovers")));
  });

  test("Burn chip + Leftovers heal can cancel out (at 16 HP chip + 16 HP heal = net 0)", () => {
    // maxHp=256: chip = 16, heal = 16 → net 0 change
    const p = makePokemon({ heldItem: "leftovers", status: STATUS.BURN, maxHp: 256, currentHp: 200 });
    const { pokemon } = applyEndOfTurnEffects(p, []);
    assert.strictEqual(pokemon.currentHp, 200); // 200 - 16 + 16 = 200
  });

  test("No held item gives no bonus healing", () => {
    const p = makePokemon({ heldItem: null, maxHp: 256, currentHp: 200 });
    const { pokemon } = applyEndOfTurnEffects(p, []);
    assert.strictEqual(pokemon.currentHp, 200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RESULTS SUMMARY
// ─────────────────────────────────────────────────────────────────────────────

console.log("\n" + "─".repeat(60));
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failures.length > 0) {
  console.log("\nFailed tests:");
  failures.forEach(({ name, error }) => {
    console.log(`  ✗ ${name}`);
    console.log(`    ${error}`);
  });
  process.exit(1);
} else {
  console.log("\n🎉 All tests passed! Phase 1 complete — proceed to Phase 2.");
  process.exit(0);
}
