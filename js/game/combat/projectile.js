// Projectiles: independent battle entities thrown by an attack or released
// by a technique.
//
// An attack with a `projectile` entry (see createAttackDefinition in
// js/game/combat/attacks.js) releases one projectile when its time crosses
// `spawnAt`, and a technique with one releases it as it lets go (see
// js/game/combat/technique.js). The Fighter queues the release with its
// facing at that moment; the Battle then turns it into a live Projectile,
// owns it, moves it every fixed step, lets it meet the other projectiles
// and pull fighters (see clashProjectiles and js/game/combat/pull.js),
// resolves its hits through CombatSystem and removes it once it is spent.
// Behaviour is data on the character (`projectiles`), and so is the art
// (`projectileAnimations`, normalized separately from fighter poses), both
// named after the attack that throws it (`<attack>_object`), e.g. #0001's
// Red, thrown by its attack2:
//
//   projectiles: {
//     attack2_object: {
//       animation: 'attack2_object', speed: 900, lifetime: 0.34,
//       hitbox: { x: -16, y: -16, w: 32, h: 32 },
//       damage: 3, baseLaunch: 2, directionalLaunch: 'horizontal', hitstun: 0.36, blockstun: 0.16, hitstop: 0.08,
//       blockPush: 520, repel: true,
//     },
//   },
//
// `damage` (one of the tiers 1, 3, 5 or 10, required), `baseLaunch` and
// `directionalLaunch` are the projectile's own damage, Base Launch and
// Directional Launch (see js/data/launch.js), validated here exactly like
// an attack's, and so are the shared hit effects (`paralyze`,
// `blockPush`, `quake`, `charm`, `float`, `fear`, `gaze`, `drain`; see
// js/game/combat/hit-effects.js). A horizontal launch
// travels along the projectile's own direction. A projectile with Base
// Launch 0 or no direction never launches.
//
// Every projectile is an attack (its definition's `offense`, see
// js/game/combat/offense.js), whoever throws it, casts it or turns it back,
// and every one is blockable: a Shield that blocks any strike of it stops
// it there, an erasing one included (no projectile flies on through a
// Shield to strike the fighter behind it later).
//
// An attack may throw a volley of one projectile (see `volley` in
// js/game/combat/attacks.js): each shot a Projectile of its own, carrying
// the throw it belongs to (`volleyOf`). A Shield that blocks one of them
// stops the volley: the shots of it still flying are gone and the throw
// throws no more (CombatSystem.stopVolley), so a volley never costs a
// Shield more than one block, as a blocked strike stops a string.
//
// A piercing projectile (`pierce: { hits, interval }`) strikes up to `hits`
// times instead, at least `interval` seconds apart, staying in play between
// them; every strike before the last deals the projectile's own `damage`,
// and its last resolves as its `finisher` (a hit of its own: its `damage`,
// a tier too and required, `baseLaunch` and `directionalLaunch`, its stuns, freeze and hit
// effects defaulting to the projectile's). With `carry` (see
// js/game/combat/attacks.js) each strike that launches nothing drags the
// target along with it, `lift` upward: #0002's whirlwind takes its target
// up and away with it, then flings it on its finisher. A Shield that blocks
// any strike stops it there.
//
//   extra_attack_object: {
//     ..., damage: 1, hitstun: 0.24, carry: { lift: 360 },
//     pierce: { hits: 5, interval: 0.14 },
//     finisher: { damage: 3, baseLaunch: 2, directionalLaunch: 'vertical', hitstun: 0.4 },
//   },
//
// Three more fields make a projectile act on what is round it:
//
//   pull: { radius, speed }   for as long as it flies it draws opponents in,
//                             exactly as an attack's pull does (see
//                             js/game/combat/attacks.js and pull.js), toward
//                             its own centre (or `offset` from it, mirrored
//                             with its direction): #0001's Blue drags its
//                             target into the orb, where its strikes land.
//   repel: true               another fighter's projectile it meets is
//                             turned back the way this one travels and is
//                             this one's owner's from then on, as if thrown
//                             by it (its strikes start over).
//   erase: true               another fighter's projectile it meets is gone,
//                             and it flies on through every fighter it
//                             strikes (each once) instead of stopping;
//                             a Shield that blocks it still stops it.
//
// When two projectiles of different owners meet, erasing beats repelling
// beats neither: an erasing one erases the other (two erasing ones, both
// go), a repelling one turns back one that does neither (two repelling
// ones, both go), and two that do neither pass each other by.
//
// One field bounds how many a thrower keeps in play:
//
//   maxInPlay: 1              its thrower never has more than this many
//                             of its move's projectiles in play at once
//                             (a whole number; 0 is no bound): one more released
//                             takes the place of the oldest still there,
//                             which is gone that step without striking.
//                             The move is its attack family, by codename
//                             (moveFamily: a ground move's and its mid-air
//                             version's count together, attack3_object
//                             and midair_attack3_object both attack3's),
//                             and only those it threw itself count: one
//                             another fighter has turned back is that
//                             fighter's. Without it (0, the default) there
//                             is no bound. #0015's Gift, a present left
//                             where it was set until someone sets it off:
//                             one at a time, wherever it was set.
//
// A fighter's attack with `deflectProjectiles` (every fighter's Deflect, see
// js/game/combat/deflect.js) turns a projectile back the same way, by the
// same turnBack, whatever the projectile is: being repelling, piercing or
// erasing never keeps one from being turned back. Turned back, it is still
// an attack (now its new owner's) and still blockable.
//
// One field is art only:
//
//   rotationSpeed: 2160       degrees per second it spins as it flies,
//                             clockwise on screen (0, the default: never),
//                             whichever way it travels. The angle is its
//                             age x this (Projectile.angle), drawn round its
//                             centre (see drawCenteredFrame in
//                             js/game/rendering/sprite-normalizer.js). Its
//                             hitbox, velocity, launches, pulls and clashes
//                             never turn with it, and being turned back
//                             never resets it: the spin runs on its age.
//
// A projectile flies straight in the direction it was released, hits at most
// once (a piercing one, its `hits`; an erasing one, each fighter once) and
// then disappears. It also disappears when its lifetime runs out, when it
// flies into the Void (the stage's kill boundary; the open air past the
// ledges does not stop it) or when it meets a solid block, the main floor's
// body included; one-way platforms never stop it. Its hitbox is centred on
// its position and mirrors with its direction.

import { resolveHitDamage, resolveHitLaunch } from '../../data/launch.js';
import { resolvePull } from './attacks.js';
import { resolveHitEffects } from './hit-effects.js';
import { assertNoShieldBypass, projectileOffense, resolveOffense } from './offense.js';

const PROJECTILE_DEFAULTS = {
  animation: null,
  speed: 0,
  lifetime: 1,
  hitbox: { x: -4, y: -4, w: 8, h: 8 },
  damage: 0,
  baseLaunch: 0,
  directionalLaunch: null,
  hitstun: 0.2,
  blockstun: 0.12,
  hitstop: 0.06,
  carry: null,    // { lift }: a strike that launches nothing drags its target along
  pierce: null,   // { hits, interval }: strikes more than once (see above)
  finisher: null, // a piercing projectile's last strike
  pull: null,     // { radius, speed }: draws opponents in while it flies (see above)
  repel: false,   // turns back the projectiles it meets (see above)
  erase: false,   // erases the projectiles it meets and flies on through fighters (see above)
  rotationSpeed: 0, // degrees per second its art spins (see above): rendering only
  maxInPlay: 0,   // the most of its move's projectiles its thrower keeps in play (see above); 0: no bound
};

// The attack family projectile `id` belongs to, by codename (see
// codename_rule): the move that throws it, its mid-air version counted
// with the ground one. attack3_object and midair_attack3_object are both
// attack3's; extra_attack_object is extra_attack's.
export function moveFamily(id) {
  return String(id).replace(/^midair_/, '').replace(/_object.*$/, '');
}

// What a finisher takes from its projectile when it does not say.
const FINISHER_INHERITS = Object.freeze([
  'hitstun', 'blockstun', 'hitstop', 'paralyze', 'blockPush', 'quake', 'charm', 'float', 'fear', 'gaze', 'backstab', 'drain',
]);

// Age is a sum of fixed steps; compare against boundaries with a little slack
// (see PHASE_EPSILON in attacks.js).
const TIME_EPSILON = 1e-6;

export function createProjectileDefinition(spec) {
  if (!spec?.id) throw new Error('[Alva] Projectile definitions need an id');
  const owner = `Projectile "${spec.id}"`;
  const def = {
    ...PROJECTILE_DEFAULTS, ...spec,
    damage: resolveHitDamage(spec.damage, owner), ...resolveHitLaunch(spec, owner), ...resolveHitEffects(spec, owner),
  };
  def.pull = resolvePull(spec.pull, owner);
  def.repel = !!def.repel;
  def.erase = !!def.erase;
  if (!Number.isFinite(def.rotationSpeed)) throw new Error(`[Alva] Projectile "${spec.id}"'s rotationSpeed must be a number (degrees per second)`);
  if (!(Number.isInteger(def.maxInPlay) && def.maxInPlay >= 0)) {
    throw new Error(`[Alva] Projectile "${spec.id}"'s maxInPlay must be a whole number (0: no bound)`);
  }
  if (def.pierce) {
    const { hits, interval } = def.pierce;
    if (!(Number.isInteger(hits) && hits >= 2) || !(interval > 0)) {
      throw new Error(`[Alva] Projectile "${spec.id}"'s pierce needs 2 or more hits and a positive interval`);
    }
    def.pierce = Object.freeze({ hits, interval });
    if (def.finisher) {
      const f = def.finisher;
      assertNoShieldBypass(f, `${owner} finisher`);
      const inherited = Object.fromEntries(FINISHER_INHERITS.map((field) => [field, f[field] ?? def[field]]));
      def.finisher = Object.freeze({
        id: spec.id, damage: resolveHitDamage(f.damage, `${owner} finisher`), ...inherited, carry: null,
        ...resolveHitLaunch(f, `${owner} finisher`), ...resolveHitEffects(inherited, `${owner} finisher`),
      });
    }
  } else if (def.finisher) {
    throw new Error(`[Alva] Projectile "${spec.id}" has a finisher but no pierce`);
  }
  def.offense = resolveOffense(spec, projectileOffense(def), owner);
  return Object.freeze(def);
}

const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

// The angle (radians, clockwise on screen) projectile definition `def`'s
// art is drawn at `age` seconds into its flight: its rotationSpeed (degrees
// per second) x its age. Rendering only.
export function projectileAngle(def, age) {
  return def.rotationSpeed ? (def.rotationSpeed * age * Math.PI) / 180 : 0;
}

export class Projectile {
  // `anim` is the normalized projectile animation (SpriteSet.projectile())
  // and `sprites` the set it came from (its owner's at release), whose
  // art-pixel scale it is drawn at whoever owns it later. `direction` is
  // fixed here: the projectile never follows its owner's later facing (only
  // turnBack changes it). `ability` is the attack or technique that
  // released it (its id), kept whoever owns it later: where the attack came
  // from, for the combat events.
  constructor({ owner, def, anim, x, y, direction, sprites = owner?.sprites ?? null, ability = def?.id ?? null, volleyOf = null }) {
    this.owner = owner;
    this.ability = ability;
    // The throw it is one shot of, for a volley (see `volley` in
    // js/game/combat/attacks.js): a Shield that blocks any shot of it
    // stops them all (CombatSystem.stopVolley). Null for a lone shot.
    this.volleyOf = volleyOf;
    // Turned back at least once (by a Deflect or a repelling projectile):
    // still an attack, now its new owner's.
    this.redirected = false;
    this.def = def;
    this.anim = anim;
    this.sprites = sprites;
    this.direction = direction;
    this.speed = def.speed;
    this.vx = def.speed * direction;
    this.x = x;
    this.y = y;
    this.prevX = x;
    this.prevY = y;
    this.renderX = x;
    this.renderY = y;
    this.age = 0; // seconds alive; also the animation and spin clock
    // The age drawn between two fixed steps (see interpolate): art only.
    this.prevAge = 0;
    this.renderAge = 0;
    this.alive = true;
    // Strikes dealt so far, and its age at the latest (a piercing one's
    // next waits for its interval).
    this.hits = 0;
    this.lastStrike = -Infinity;
    // The fighters an erasing projectile has struck and flown through.
    this.through = new Set();
  }

  // Whether it may strike on this step: always, until it has struck; a
  // piercing one again once its interval has passed since its last strike.
  get ready() {
    const pierce = this.def.pierce;
    if (!pierce || this.hits === 0) return true;
    return this.age - this.lastStrike >= pierce.interval - TIME_EPSILON;
  }

  // The hit its next strike deals: its own, and a piercing one's finisher
  // on its last.
  get nextHit() {
    const { pierce, finisher } = this.def;
    return pierce && finisher && this.hits === pierce.hits - 1 ? finisher : this.def;
  }

  // It struck `target` (see CombatSystem.update): counted, and gone after
  // its only strike, its last or any a Shield blocked (an erasing one
  // included: a Shield stops every projectile); an erasing one that hit
  // flies on through, never to strike that target again.
  struck(blocked, target = null) {
    this.hits++;
    this.lastStrike = this.age;
    if (blocked) {
      this.alive = false;
      return;
    }
    if (this.def.erase) {
      this.through.add(target);
      return;
    }
    const pierce = this.def.pierce;
    if (!pierce || blocked || this.hits >= pierce.hits) this.alive = false;
  }

  // Whether it has already flown through `target` (an erasing one strikes
  // each fighter once).
  passed(target) {
    return this.through.has(target);
  }

  // Turned back by a repelling projectile (see clashProjectiles) or a
  // fighter's Deflect (CombatSystem.deflectProjectiles in
  // js/game/combat/combat.js): it flies `direction` at its own speed and is
  // `owner`'s from now on, as if thrown by it, its strikes starting over (so
  // it may strike whoever threw it). Its age runs on, and with it its clip,
  // its spin and the rest of its lifetime: a short-lived shot turned back
  // late may not make it all the way home.
  turnBack(owner, direction) {
    this.owner = owner;
    this.redirected = true;
    // Its new owner's now, and no longer one of its thrower's volley.
    this.volleyOf = null;
    this.direction = direction;
    this.vx = this.speed * direction;
    this.hits = 0;
    this.lastStrike = -Infinity;
    this.through.clear();
  }

  // Builds the projectile an owner released, or null if it has no such
  // projectile or no art for it (never an invisible hitbox). A copy a mimic
  // throws (`borrowed`, see js/game/combat/mimic.js) is another fighter's
  // projectile: its own definition, its own clip and the sprite set it was
  // drawn from (its art-pixel size), now the owner's.
  static release(owner, { id, offset, direction, ability = id, volleyOf = null, borrowed = null }) {
    const def = borrowed ? borrowed.def : owner.projectileDefs?.[id];
    const anim = borrowed ? borrowed.anim : def && owner.sprites.projectile(def.animation);
    if (!anim) {
      console.warn(`[Alva] Projectile "${id}" has no animation frames; not spawned.`);
      return null;
    }
    const b = owner.body;
    return new Projectile({
      owner, def, anim, direction, ability, volleyOf, sprites: borrowed?.sprites ?? owner.sprites,
      x: b.x + (offset?.x ?? 0) * direction,
      y: b.y + (offset?.y ?? 0),
    });
  }

  update(dt, stage) {
    if (!this.alive) return;
    this.prevX = this.x;
    this.prevY = this.y;
    this.prevAge = this.age;
    this.x += this.vx * dt;
    this.age += dt;
    if (this.age >= this.def.lifetime - TIME_EPSILON) {
      this.alive = false;
      return;
    }
    // Gone once it has flown clean into the Void or into a solid block (one
    // there now: never a floor section that has broken away).
    const box = this.hitbox(scratch);
    const v = stage.void;
    if (box.x + box.w < v.left || box.x > v.right || box.y + box.h < v.top || box.y > v.bottom) this.alive = false;
    else if (stage.solids.some((s) => s.active !== false && overlaps(box, s))) this.alive = false;
  }

  // World-space collision box.
  hitbox(out = {}) {
    const hb = this.def.hitbox;
    out.x = this.direction > 0 ? this.x + hb.x : this.x - hb.x - hb.w;
    out.y = this.y + hb.y;
    out.w = hb.w;
    out.h = hb.h;
    return out;
  }

  // Frame on screen: the clip runs on the projectile's own clock and loops
  // for as long as it flies. Speed never depends on it.
  get frameIndex() {
    const n = this.anim.frames.length;
    const i = Math.floor(this.age * this.anim.fps + TIME_EPSILON);
    return this.anim.loop ? i % n : Math.min(i, n - 1);
  }

  get frame() {
    return this.anim.frames[this.frameIndex];
  }

  // Mirrored when its art travels the other way; direction-neutral art
  // (sourceFacing 0) never is. Rendering only.
  get flip() {
    const source = this.anim.sourceFacing;
    return !!source && this.direction !== source;
  }

  // The angle its art is at on this fixed step (see projectileAngle), and
  // the one drawn between steps (from the interpolated age). Rendering only:
  // nothing in the simulation reads either.
  get angle() {
    return projectileAngle(this.def, this.age);
  }

  get renderAngle() {
    return projectileAngle(this.def, this.renderAge);
  }

  // Interpolated position (and spin) for rendering between fixed steps.
  interpolate(alpha) {
    this.renderX = this.prevX + (this.x - this.prevX) * alpha;
    this.renderY = this.prevY + (this.y - this.prevY) * alpha;
    this.renderAge = this.prevAge + (this.age - this.prevAge) * alpha;
  }
}

const scratch = {};
const scratchOther = {};

// Every pair of live projectiles of different owners that meet this step
// (their boxes overlap), settled once, in spawn order: erasing beats
// repelling beats neither (see above). A projectile gone, or turned back
// to the same owner, meets nothing more this step.
export function clashProjectiles(list) {
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    for (let j = i + 1; j < list.length && a.alive; j++) {
      const b = list[j];
      if (!b.alive || a.owner === b.owner) continue;
      if (!overlaps(a.hitbox(scratch), b.hitbox(scratchOther))) continue;
      const rank = (p) => (p.def.erase ? 2 : p.def.repel ? 1 : 0);
      const ra = rank(a);
      const rb = rank(b);
      if (!ra && !rb) continue;
      if (ra === rb) {
        a.alive = false;
        b.alive = false;
      } else {
        const [win, lose] = ra > rb ? [a, b] : [b, a];
        if (win.def.erase) lose.alive = false;
        else lose.turnBack(win.owner, win.direction);
      }
    }
  }
}

// Turns every projectile the fighters released this step into a live
// Projectile in `list`. Each release is consumed exactly once. One whose
// move bounds how many its thrower keeps in play (`maxInPlay`) first
// retires the oldest of them, as many as it takes to make room.
export function spawnProjectiles(fighters, list) {
  for (const f of fighters) {
    for (const release of f.releases) {
      const p = Projectile.release(f, release);
      if (!p) continue;
      if (p.def.maxInPlay > 0) makeRoomFor(p, list);
      list.push(p);
    }
    f.releases.length = 0;
  }
}

// Retires the oldest of `p`'s thrower's projectiles of its move still in
// play (`list` is in release order) until one more keeps within its
// `maxInPlay` (see above). Gone, it strikes nothing more.
function makeRoomFor(p, list) {
  const family = moveFamily(p.def.id);
  const mine = list.filter((q) => q.alive && q.owner === p.owner && !q.redirected && moveFamily(q.def.id) === family);
  for (let i = 0; i <= mine.length - p.def.maxInPlay; i++) mine[i].alive = false;
}

// Drops spent projectiles from `list`, in place, keeping the order.
export function removeDeadProjectiles(list) {
  let n = 0;
  for (const p of list) if (p.alive) list[n++] = p;
  list.length = n;
}
