// A fingerprint of an online match, so the two browsers can tell that their
// simulations still agree (LockstepSession compares one every
// CONFIG.online.hashInterval steps). Both run the same Battle from the same
// seed on the same inputs, so every number below must be identical, bit
// for bit, on both: a single difference is a desync.
//
// battleState(battle) is the key state as a plain object (what the debug
// log prints on a mismatch): the phase and period, the clock, the score,
// each fighter's position, velocity, facing, state, Launch Point, Energy,
// whether it is out of play and its respawn wait, and every projectile's
// place, and how many clones there are. hashState(state) folds it into one
// 32-bit FNV-1a hash of the numbers' exact bits (Float64) and the strings'
// characters. Reading only: nothing in the match changes.

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

const scratch = new DataView(new ArrayBuffer(8));

// The match's key state, plain and JSON-safe.
export function battleState(battle) {
  return {
    phase: battle.phase ?? null,
    period: battle.period ?? null,
    timeLeft: Number.isFinite(battle.timeLeft) ? battle.timeLeft : null,
    elapsed: battle.elapsed ?? 0,
    score: { p1: battle.score?.p1 ?? 0, p2: battle.score?.p2 ?? 0 },
    fighters: (battle.fighters ?? []).map((f) => ({
      slot: f.slot,
      x: f.body.x,
      y: f.body.y,
      vx: f.body.vx,
      vy: f.body.vy,
      facing: f.facing,
      state: f.state,
      launchPoint: f.combat.launchPoint,
      energy: f.combat.energy,
      out: !!f.lostToVoid,
      respawn: f.respawnTimer ?? null,
    })),
    projectiles: (battle.projectiles ?? []).map((p) => [p.x ?? p.body?.x ?? 0, p.y ?? p.body?.y ?? 0]),
    clones: battle.clones?.length ?? 0,
  };
}

// FNV-1a over `value`, walked in a fixed order: numbers by their Float64
// bytes, strings by their UTF-16 units, booleans and null as tags, arrays
// in order, objects by their keys in insertion order (battleState always
// builds them the same way).
export function hashState(value, hash = FNV_OFFSET) {
  const byte = (b) => {
    hash ^= b & 0xff;
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  };
  const walk = (v) => {
    if (v === null || v === undefined) byte(0);
    else if (typeof v === 'number') {
      byte(1);
      scratch.setFloat64(0, v);
      for (let i = 0; i < 8; i++) byte(scratch.getUint8(i));
    } else if (typeof v === 'boolean') byte(v ? 2 : 3);
    else if (typeof v === 'string') {
      byte(4);
      for (let i = 0; i < v.length; i++) {
        const c = v.charCodeAt(i);
        byte(c);
        byte(c >> 8);
      }
    } else if (Array.isArray(v)) {
      byte(5);
      for (const item of v) walk(item);
      byte(6);
    } else {
      byte(7);
      for (const key of Object.keys(v)) {
        walk(key);
        walk(v[key]);
      }
      byte(8);
    }
  };
  walk(value);
  return hash >>> 0;
}

// The match's hash now.
export const battleHash = (battle) => hashState(battleState(battle));
