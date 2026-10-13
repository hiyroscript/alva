// The human player's fighter against one opponent, stepped in
// Battle.update's order with the real CombatSystem, projectiles and clones
// (imported by the *.test.mjs files; not a test file itself). The player's
// fighter is driven by a real PlayerController, so it is the human
// player's in every way the Fighter reads (Fighter.playerControlled,
// combatAssistOn, comboAssistOn); `controller` swaps in any other one (a
// CPU's, or a bare one with no kind) to compare.
import { CONFIG } from '../../js/config.js';
import { Fighter, separateFighters } from '../../js/game/fighters/fighter.js';
import { PlayerController, blankInput } from '../../js/game/fighters/fighter-controller.js';
import { CombatSystem } from '../../js/game/combat/combat.js';
import { spawnProjectiles, removeDeadProjectiles, clashProjectiles } from '../../js/game/combat/projectile.js';
import { spawnClones, updateClones, removeDeadClones } from '../../js/game/combat/summon.js';
import { applyPulls } from '../../js/game/combat/pull.js';
import { StageCollision, resolveSolidOverlap } from '../../js/game/physics.js';
import { fakeSpritesOf, stageMap, DT } from './fighter-harness.mjs';

export const FLAT = new StageCollision(stageMap());

// This step's input with `actions` pressed (held, and their press edge).
export const press = (...actions) => Object.fromEntries(actions.flatMap((a) => [[a, true], [`${a}Pressed`, true]]));

// The player (Combat Assist `combatAssist`, Combo Assist `comboAssist`) at
// `x` facing right, its opponent `gap` units to its right facing it (no
// controller by default: a training dummy). `tick(input)` feeds the player
// one input snapshot (anything left out is not held) and the opponent
// `foeInput` when it has a controller of the rig's own (`foeHeld`).
export function playerRig({
  character, foeCharacter = character, gap = 200, x = 800, stage = FLAT, combatAssist = true, comboAssist = true,
  controller, foeController = null, sprites, foeFacing = -1,
} = {}) {
  const held = {};
  const input = { sample: () => ({ ...blankInput(), ...held }) };
  const player = new Fighter({
    def: character, sprites: sprites ?? fakeSpritesOf(character), stage, slot: 'p1', label: 'P1',
    spawn: { x, facing: 1 }, controller: controller ?? new PlayerController(input, { combatAssist, comboAssist }),
  });
  const foe = new Fighter({
    def: foeCharacter, sprites: fakeSpritesOf(foeCharacter), stage, slot: 'p2', label: 'CPU',
    spawn: { x: x + gap, facing: foeFacing }, controller: foeController,
  });
  player.opponent = foe;
  foe.opponent = player;
  const fighters = [player, foe];
  const system = new CombatSystem();
  const projectiles = [];
  const clones = [];
  const events = [];
  const ctx = { stage, gravity: CONFIG.sim.gravity };
  const tick = (now = {}) => {
    for (const k of Object.keys(held)) delete held[k];
    Object.assign(held, now);
    const live = fighters.filter((f) => !f.lostToVoid);
    for (const f of live) f.update(DT, ctx);
    separateFighters(player, foe, stage);
    for (const f of live) resolveSolidOverlap(f.body, stage);
    for (const f of live) f.updateAttackFacing();
    spawnProjectiles(live, projectiles);
    for (const p of projectiles) p.update(DT, stage);
    clashProjectiles(projectiles);
    updateClones(clones, DT);
    spawnClones(live, clones, stage);
    applyPulls(live, projectiles, DT);
    events.push(...system.update(live, projectiles, clones));
    removeDeadProjectiles(projectiles);
    removeDeadClones(clones);
    return player;
  };
  // Steps with `input` until `pred` holds; throws instead of hanging.
  const until = (pred, input = {}, limit = 600) => {
    for (let i = 0; i < limit; i++) {
      if (pred()) return i;
      tick(input);
    }
    if (pred()) return limit;
    throw new Error('condition never reached');
  };
  return { player, foe, tick, until, events, projectiles, clones, system, input, held };
}

// Moves `r`'s opponent to `gap` world units right of the player (body to
// body), standing.
export function placeFoeAt(r, gap) {
  r.foe.body.x = r.player.body.x + gap;
  r.foe.body.prevX = r.foe.body.x;
}

// The id of the player's attack in progress, or null.
export const attackOf = (f) => f.combat.attack?.def.id ?? null;
