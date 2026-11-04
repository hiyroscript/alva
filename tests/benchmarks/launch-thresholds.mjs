// Launch Point fire thresholds, re-derived by simulation (not part of
// `node --test`: run it by hand whenever the stages, the Void or launches
// change).
//
//   node tests/benchmarks/launch-thresholds.mjs                 # every playable fighter, every stage
//   node tests/benchmarks/launch-thresholds.mjs --maps desert   # one stage
//   node tests/benchmarks/launch-thresholds.mjs --only 0001     # one fighter
//   node tests/benchmarks/launch-thresholds.mjs --json out.json # the raw table too
//
// The HUD's fire (LAUNCH_POINT_FIRE / _OUT and LAUNCH_POINT_INFERNO / _OUT
// in js/ui/hud.js) says "the next solid hit can end you". This finds, for
// each fighter and stage, the lowest Launch Point (as shown, before the hit
// adds its damage) at which one solid 3-damage hit is lethal: it carries a
// fighter that does nothing to get back into the Void before it could act
// again, the game's own definition of a lethal launch (launchIsLethal in
// js/game/rendering/hit-fx.js: the launch's stun and HIT_FX.lethal.grace
// more, with nothing held). Through the real rules: CombatSystem.applyHit
// (Base Launch x Launch Point x LAUNCH_UNIT_SPEED, the fighter's own launch
// reaction and stun), then the real Fighter stepping on the real stage (its
// drag, gravity, rebounds off outcrops and bulkheads), on the map's own
// Void (regular time: overtime's closing Void is meant to be more dangerous
// than the fire says). A sideways hit is tried toward each ledge, and the
// more open one counts (a wall at one ledge only shelters that side).
//
// The cases, each a fighter caught in the air at a jump's height over the
// main stage (or standing, straight up), hit toward the nearer ledge:
//
//   bl2Ledge    Base Launch 2, sideways, 250 units in from the ledge
//   bl3Third    Base Launch 3, sideways, a third of the stage in from it
//   bl3Centre   Base Launch 3, sideways, from the middle of the stage
//   bl3Up       Base Launch 3, straight up, standing in the middle
//   bl2Third    Base Launch 2, sideways, a third of the stage in from it
//
// Burning (tier 1) is where the next solid hit is a real danger: a Base
// Launch 3 hit ends a life from a third of the stage in (bl3Third) and a
// Base Launch 2 one from near the ledge (its reach at that Launch Point is
// reported). It is the highest bl3Third over the roster on the stages with
// ledges (Adamaris's continuous beach has none to be knocked off: reported,
// not counted). Inferno (tier 2) is where a Base Launch 3 hit ends a life
// from anywhere on the stage, straight up included: the highest bl3Centre
// and bl3Up over the roster and every stage. Each is rounded up to 5 (so
// it holds for every fighter); the fire goes out 5 lower (hysteresis).
//
// Checked against the geometry before the Void update (side 360, top 800),
// this gives 65 and 95 where the HUD had 60 and 100.

import { writeFileSync } from 'node:fs';
import { playableCharacters } from '../../js/data/characters.js';
import { MAPS } from '../../js/data/maps.js';
import { PRACTICE_MAP } from '../../js/data/practice-map.js';
import { StageCollision } from '../../js/game/physics.js';
import { CombatSystem } from '../../js/game/combat/combat.js';
import { HIT_FX } from '../../js/game/rendering/hit-fx.js';
import { makeFighter, DT } from '../helpers/fighter-harness.mjs';

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const ALL_MAPS = [...MAPS, PRACTICE_MAP];
const MAP_IDS = arg('maps', ALL_MAPS.map((m) => m.id).join(',')).split(',');
const ONLY = arg('only', null);
const JSON_OUT = arg('json', null);

const HIT = { damage: 3, hitstun: 0.2, hitstop: 0 };
// How high over the main stage's top a fighter is caught "in the air": at
// the top of a normal jump (about 105), clear of every outcrop and
// bulkhead on the ledges, so it is the air, not a wall, it is launched
// through.
const AIR = 110;

export const CASES = Object.freeze({
  bl2Ledge: { baseLaunch: 2, dir: 'horizontal', from: () => 250, air: true },
  bl3Third: { baseLaunch: 3, dir: 'horizontal', from: (len) => len / 3, air: true },
  bl2Third: { baseLaunch: 2, dir: 'horizontal', from: (len) => len / 3, air: true },
  bl3Centre: { baseLaunch: 3, dir: 'horizontal', from: (len) => len / 2, air: true },
  bl3Up: { baseLaunch: 3, dir: 'vertical', from: (len) => len / 2, air: false },
});

// Whether `character`, at Launch Point `lp`, hit as `c` on `map` toward
// the ledge on side `side` (1 right, -1 left), is in the Void before it
// could act again (the launch's stun and the lethal grace), nothing held.
export function lethal(character, map, c, lp, side = 1) {
  const stage = new StageCollision(map);
  const m = map.mainStage;
  const len = m.right - m.left;
  // `from` units in from that ledge.
  const x = side > 0 ? m.right - c.from(len) : m.left + c.from(len);
  const { fighter, step } = makeFighter({ character, stage, x, facing: -side });
  step();
  if (c.air) {
    Object.assign(fighter.body, { y: m.top - AIR, vy: 0, vx: 0, grounded: false, ground: null });
  }
  fighter.combat.launchPoint = lp;
  const attacker = { facing: side, combat: { hitstop: 0 } };
  const event = new CombatSystem().applyHit(attacker, fighter, { ...HIT, baseLaunch: c.baseLaunch, directionalLaunch: c.dir }, { facing: side });
  const follow = (event.hitstun ?? 0) + HIT_FX.lethal.grace;
  for (let t = 0; t < follow; t += DT) {
    step();
    if (stage.inVoid(fighter.body)) return true;
  }
  return false;
}

// The lowest whole Launch Point from which case `c` is lethal toward
// `side` (lethality only grows with Launch Point), up to `max`.
function thresholdToward(character, map, c, side, max) {
  let lo = 0;
  let hi = max;
  if (!lethal(character, map, c, hi, side)) return Infinity;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (lethal(character, map, c, mid, side)) hi = mid;
    else lo = mid;
  }
  return hi;
}

// ...toward the more open ledge (straight up: either, the same).
export function threshold(character, map, c, max = 600) {
  const right = thresholdToward(character, map, c, 1, max);
  return c.dir === 'vertical' ? right : Math.min(right, thresholdToward(character, map, c, -1, max));
}

const roundUp5 = (n) => Math.ceil(n / 5) * 5;
const hasLedges = (id) => ALL_MAPS.find((m) => m.id === id)?.ground?.type !== 'continuous';

// How far in from the more open ledge (world units, in steps of 10) a Base
// Launch `baseLaunch` sideways hit at Launch Point `lp` is still lethal.
export function reach(character, map, baseLaunch, lp) {
  const len = map.mainStage.right - map.mainStage.left;
  let best = 0;
  for (let from = 10; from <= len / 2; from += 10) {
    const c = { baseLaunch, dir: 'horizontal', from: () => from, air: true };
    if (lethal(character, map, c, lp, 1) || lethal(character, map, c, lp, -1)) best = from;
    else break;
  }
  return best;
}

export function derive({ maps = MAP_IDS, only = ONLY } = {}) {
  const fighters = playableCharacters().filter((f) => !only || f.id === only);
  const stages = ALL_MAPS.filter((m) => maps.includes(m.id));
  const table = [];
  for (const map of stages) {
    for (const character of fighters) {
      const row = { map: map.id, fighter: character.id };
      for (const [id, c] of Object.entries(CASES)) row[id] = threshold(character, map, c);
      table.push(row);
    }
  }
  const most = (key, rows = table) => Math.max(...rows.map((r) => r[key]));
  const least = (key, rows = table) => Math.min(...rows.map((r) => r[key]));
  const ledged = table.filter((r) => hasLedges(r.map));
  const fire = roundUp5(most('bl3Third', ledged.length ? ledged : table));
  const inferno = roundUp5(Math.max(most('bl3Centre'), most('bl3Up')));
  // At the fire's threshold, how far in a Base Launch 2 hit reaches.
  const bl2Reach = {};
  for (const map of stages) {
    const r = fighters.map((f) => reach(f, map, 2, fire));
    bl2Reach[map.id] = [Math.min(...r), Math.max(...r)];
  }
  return {
    table,
    range: Object.fromEntries(Object.keys(CASES).map((k) => [k, [least(k), most(k)]])),
    byStage: Object.fromEntries(stages.map((m) => {
      const rows = table.filter((r) => r.map === m.id);
      return [m.id, Object.fromEntries(Object.keys(CASES).map((k) => [k, [least(k, rows), most(k, rows)]]))];
    })),
    bl2Reach, fire, fireOut: fire - 5, inferno, infernoOut: inferno - 5,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = derive();
  const keys = Object.keys(CASES);
  console.log(['map', 'fighter', ...keys].map((s) => s.padEnd(10)).join(''));
  for (const r of out.table) console.log([r.map, r.fighter, ...keys.map((k) => r[k])].map((s) => String(s).padEnd(10)).join(''));
  console.log('\nrange over the roster, by stage (lowest - highest):');
  for (const [id, r] of Object.entries(out.byStage)) {
    console.log(`  ${id.padEnd(10)} ${keys.map((k) => `${k} ${r[k][0]}-${r[k][1]}`.padEnd(18)).join('')}`);
  }
  console.log(`\nat ${out.fire}, a Base Launch 2 hit is lethal from this far in from the ledge:`);
  for (const [id, [a, b]] of Object.entries(out.bl2Reach)) console.log(`  ${id.padEnd(10)} ${a} - ${b}`);
  console.log(`\nLAUNCH_POINT_FIRE ${out.fire} (out below ${out.fireOut}), LAUNCH_POINT_INFERNO ${out.inferno} (out below ${out.infernoOut})`);
  if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(out, null, 2));
}
