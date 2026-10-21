// An ensemble's art at runtime: one fighter, drawn as its members.
//
// Purpose: a fighter whose definition has an `ensemble` (js/data/ensemble.js)
// is still one Fighter with one body, but it is drawn as several members,
// each with its own sprite set and its own animator, placed round the
// fighter's origin in a formation. This module holds the three pieces that
// make that work, and the two factories every mode builds fighters' art
// with:
//
//   EnsembleSprites   the members' sprite sets as one: what the Fighter and
//                     the shared systems ask a SpriteSet (has, duration,
//                     projectile, effect, worldPerArt, makePortrait...)
//                     answered for the group
//   EnsembleAnimator  what the Fighter asks an animator (play, setSpeed,
//                     update, frame, anim), played by every member at once:
//                     the same logical state on the same step, each in its
//                     own clip, plus where each member stands (the
//                     formation), gliding between places, and the idle float
//   fighterParts      what a renderer draws for any fighter: one part for
//                     an ordinary fighter, one per member for an ensemble
//
//   buildFighterSprites(def, getImage)   a SpriteSet, or EnsembleSprites
//   createAnimator(sprites)              a SpriteAnimator, or EnsembleAnimator
//
// Inputs: a character definition, its decoded frames, and every fixed step
// the Fighter's visual state (Fighter.updateState: the clip, who performs
// it, the way it faces).
// Important constraints: presentation only. Nothing here moves the body,
// changes a hitbox or a hurtbox, or feeds back into the simulation. It
// advances only on fixed steps (update), so it is deterministic; renderers
// read it between steps through interpolate, so it looks the same at any
// frame rate.

import { SpriteSet } from './sprite-normalizer.js';
import { SpriteAnimator } from './sprite-animator.js';
import { ENSEMBLE_DEFAULTS, isEnsemble } from '../../data/ensemble.js';

// How fast the idle float fades in and out as a member starts or stops
// floating (its share a second), so it never pops.
const FLOAT_FADE = 4;

// The fighter's sprites: an EnsembleSprites for a fighter drawn as
// several members, else an ordinary SpriteSet.
export function buildFighterSprites(def, getImage) {
  return isEnsemble(def) ? EnsembleSprites.build(def, getImage) : SpriteSet.build(def, getImage);
}

// The animator a fighter with `sprites` plays its clips on.
export function createAnimator(sprites) {
  return sprites?.members ? new EnsembleAnimator(sprites) : new SpriteAnimator(sprites);
}

// The definition one member's own sprite set is built from: the fighter's,
// with the member's clips in place of its own. Only the reference member
// carries the fighter's projectile and effect art (built once, at the same
// art-pixel size as every member).
function memberDef(def, member, reference) {
  return {
    ...def,
    animations: member.animations,
    projectileAnimations: reference ? def.projectileAnimations : undefined,
    effectAnimations: reference ? def.effectAnimations : undefined,
    animationFallbacks: member.animationFallbacks ?? def.animationFallbacks,
  };
}

// The members' sprite sets, answering for the group.
export class EnsembleSprites {
  // `sets`: one SpriteSet per member, in the ensemble's order.
  constructor(def, sets) {
    this.def = def;
    const ensemble = def.ensemble;
    this.members = ensemble.members.map((m, i) => ({ id: m.id, home: m.home, def: m, set: sets[i] }));
    const refId = ensemble.referenceMember ?? ensemble.members[0].id;
    this.reference = this.members.find((m) => m.id === refId);
    // The group's height in art pixels, standing at home: from the
    // fighter's origin (its feet) up to the top of the highest member's
    // reference clip, a member's home lifting her by its height. The
    // fighter's visual.height is that tall, and every member is drawn at the
    // one art-pixel size it gives, so their pixels match: one fighter, one
    // scale.
    this.groupArtHeight = Math.max(...this.members.map((m) => m.set.refArtHeight - m.home.y));
    this.groupWorldPerArt = def.visual.height / this.groupArtHeight;
    for (const m of this.members) m.set.worldPerArt = this.groupWorldPerArt;
  }

  static build(def, getImage) {
    const refId = def.ensemble.referenceMember ?? def.ensemble.members[0].id;
    const sets = def.ensemble.members.map((m) => SpriteSet.build(memberDef(def, m, m.id === refId), getImage));
    return new EnsembleSprites(def, sets);
  }

  get usable() {
    return this.members.every((m) => m.set.usable);
  }

  get missing() {
    return this.members.flatMap((m) => m.set.missing);
  }

  get worldPerArt() {
    return this.groupWorldPerArt;
  }

  // The group's height at home (see the constructor): what a menu sizes it by.
  get refArtHeight() {
    return this.groupArtHeight;
  }

  // The fighter's projectile and effect art (the reference member carries it).
  get projectiles() {
    return this.reference.set.projectiles;
  }

  get effects() {
    return this.reference.set.effects;
  }

  // Every member's clips under one key each, the first member (in the
  // ensemble's order) that has it answering: for readers that want a clip
  // of the fighter's and nothing more (a preview frame).
  get animations() {
    const out = {};
    for (const m of [...this.members].reverse()) Object.assign(out, m.set.animations);
    return out;
  }

  // The member `id`'s sprite set, or null.
  member(id) {
    return this.members.find((m) => m.id === id)?.set ?? null;
  }

  // Clip `key` is there: every member whose definition has it loaded it,
  // and at least one does (a group clip is every member's, a move's clip
  // its performers').
  has(key) {
    if (!key) return false;
    let any = false;
    for (const m of this.members) {
      if (m.set.has(key)) any = true;
      else if (m.def.animations?.[key]) return false;
    }
    return any;
  }

  // One pass of clip `key` for the group: its longest member's, so every
  // member's pass fits in it (0 without the art).
  duration(key) {
    return Math.max(0, ...this.members.map((m) => m.set.duration(key)));
  }

  // The reference member's clip for `key` (a SpriteAnimator over the group
  // plays that one).
  resolve(key) {
    return this.reference.set.resolve(key);
  }

  projectile(key) {
    return this.reference.set.projectile(key);
  }

  effect(key) {
    return this.reference.set.effect(key);
  }

  // The group's portrait: every member's portrait frame (visual.portrait's
  // clip and frame, each member's own) drawn at its home, back to front, at
  // 1 px per art pixel; then the fighter's portrait crop of that (its
  // `centerY` down the group, a square `size` x the group's width, centred).
  makePortrait() {
    const cfg = this.def.visual.portrait || {};
    const placed = [];
    for (const m of this.members) {
      const anim = m.set.animations[cfg.animation] || m.set.animations.idle;
      const f = anim?.frames[Math.min(cfg.frame || 0, anim.frames.length - 1)];
      if (!f?.canvas) return null;
      placed.push({ f, x: m.home.x - f.anchorArtX, y: m.home.y - f.anchorArtY });
    }
    const left = Math.min(...placed.map((p) => p.x));
    const top = Math.min(...placed.map((p) => p.y));
    const right = Math.max(...placed.map((p) => p.x + p.f.artW));
    const bottom = Math.max(...placed.map((p) => p.y + p.f.artH));
    const w = right - left;
    const size = Math.max(1, Math.round(w * (cfg.size ?? 1)));
    const cy = (bottom - top) * (cfg.centerY ?? 0.5);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const ox = (size - w) / 2 - left;
    const oy = size / 2 - cy - top;
    for (const { f, x, y } of placed) {
      ctx.drawImage(f.canvas, 0, 0, f.w, f.h, Math.round(x + ox), Math.round(y + oy), Math.round(f.artW), Math.round(f.artH));
    }
    return canvas;
  }
}

// Where each member stands for a move (art pixels, facing right from the
// fighter's origin): `members` the ensemble's, `performers` the ids of
// those performing it (null: none, the group at home), `formation` the
// move's own places for any of them. A Map of id -> { x, y }.
//
// With no performers every member is at home. A single performer steps to
// the fighter's origin (where any fighter's art stands, so its hitbox
// measured from its art lines up); several keep their home places, moved
// together so their middle is the origin. The others line up behind the
// rearmost performer, `retreat` back and `spacing` apart, the one nearest
// the front first, at their home heights. A move's `formation` places any
// member it names instead.
export function formationTargets(members, performers, { retreat, spacing }, formation = null) {
  const out = new Map();
  if (!performers) {
    for (const m of members) out.set(m.id, { x: m.home.x, y: m.home.y });
    return out;
  }
  const acting = members.filter((m) => performers.includes(m.id));
  const shift = acting.length ? acting.reduce((sum, m) => sum + m.home.x, 0) / acting.length : 0;
  for (const m of acting) out.set(m.id, acting.length === 1 ? { x: 0, y: 0 } : { x: m.home.x - shift, y: m.home.y });
  const rear = acting.length ? Math.min(...acting.map((m) => out.get(m.id).x)) : 0;
  const aside = members.filter((m) => !performers.includes(m.id)).sort((a, b) => b.home.x - a.home.x);
  for (const [k, m] of aside.entries()) out.set(m.id, { x: rear - retreat - k * spacing, y: m.home.y });
  for (const [id, place] of Object.entries(formation ?? {})) if (out.has(id)) out.set(id, { x: place.x, y: place.y });
  return out;
}

// Every member playing the fighter's visual state at once.
export class EnsembleAnimator {
  constructor(sprites) {
    this.sprites = sprites;
    const e = sprites.def.ensemble;
    this.spec = {
      retreat: e.retreat ?? ENSEMBLE_DEFAULTS.retreat,
      spacing: e.spacing ?? ENSEMBLE_DEFAULTS.spacing,
      glide: e.glide ?? ENSEMBLE_DEFAULTS.glide,
      aside: e.asideAnimation ?? ENSEMBLE_DEFAULTS.asideAnimation,
      float: { ...ENSEMBLE_DEFAULTS.float, ...(e.float ?? {}) },
    };
    const n = sprites.members.length;
    // Each member's own animator and place. x and y are its offset from
    // the fighter's origin in art pixels as the world sees it (x already
    // turned the way the fighter faces), with its float `lift` apart; the
    // prev values are the last step's, and the render values are what
    // interpolate draws between them.
    this.members = sprites.members.map((m, i) => ({
      id: m.id,
      home: m.home,
      animator: new SpriteAnimator(m.set),
      performing: false,
      x: m.home.x, y: m.home.y, lift: 0, float: 0,
      prevX: m.home.x, prevY: m.home.y, prevLift: 0,
      renderX: m.home.x, renderY: m.home.y,
      // Each member floats on its own beat, evenly apart.
      phase: i / n,
    }));
    this.reference = this.members.find((m) => m.id === sprites.reference.id);
    this.stateKey = null;
    this.performers = null;
    this.formation = null;
    this.facing = 1;
    this.time = 0;
  }

  // The member a reader of one frame sees (frame, anim): the first
  // performer while a move plays, else the reference member. A convenience
  // for code that knows one sprite; the group is drawn by fighterParts.
  get lead() {
    return (this.performers && this.members.find((m) => m.performing)) || this.reference;
  }

  get anim() {
    return this.lead.animator.anim;
  }

  get frame() {
    return this.lead.animator.frame;
  }

  get index() {
    return this.lead.animator.index;
  }

  // The fighter's visual state `stateKey`, for every member on this step:
  // the members `performers` names play it (all of them when null), the
  // others their aside clip; `formation`, the move's own places.
  play(stateKey, { restart = false, performers = null, formation = null } = {}) {
    this.stateKey = stateKey;
    this.performers = performers;
    this.formation = formation;
    for (const m of this.members) {
      m.performing = !performers || performers.includes(m.id);
      m.animator.play(m.performing ? stateKey : this.spec.aside, { restart: restart && m.performing });
    }
  }

  // Playback speed (a run's stride, a Dash's single pass): every member's.
  setSpeed(scale) {
    for (const m of this.members) m.animator.setSpeed(m.performing ? scale : 1);
  }

  // One fixed step: every member's clip advances, then every member moves
  // toward its place for the current state (turned the way `facing` is) at
  // most glide x dt, and floats while it idles.
  update(dt, facing = this.facing) {
    this.facing = facing;
    this.time += dt;
    const targets = formationTargets(this.members, this.performers, this.spec, this.formation);
    const reach = this.spec.glide * dt;
    const { height, period } = this.spec.float;
    for (const m of this.members) {
      m.animator.update(dt);
      m.prevX = m.x;
      m.prevY = m.y;
      m.prevLift = m.lift;
      const t = targets.get(m.id);
      const dx = t.x * facing - m.x;
      const dy = t.y - m.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= reach) {
        m.x = t.x * facing;
        m.y = t.y;
      } else {
        m.x += (dx / dist) * reach;
        m.y += (dy / dist) * reach;
      }
      // The float: up off its place and back, never below it, faded in
      // while it plays its idle clip and out otherwise.
      const floating = m.animator.stateKey === 'idle' ? 1 : 0;
      m.float += Math.sign(floating - m.float) * Math.min(Math.abs(floating - m.float), FLOAT_FADE * dt);
      m.lift = -height * m.float * (1 - Math.cos(2 * Math.PI * (this.time / period + m.phase))) / 2;
    }
  }

  // Every member at its place for the current state, at once, no float: a
  // spawn or a respawn starts the group in formation.
  snap(facing = this.facing) {
    this.facing = facing;
    const targets = formationTargets(this.members, this.performers, this.spec, this.formation);
    for (const m of this.members) {
      const t = targets.get(m.id);
      m.x = m.prevX = m.renderX = t.x * facing;
      m.y = m.prevY = m.renderY = t.y;
      m.lift = m.prevLift = 0;
      m.float = 0;
    }
  }

  // Where each member is drawn this frame, `alpha` of the way from the last
  // step to this one (as the fighter's body is: see Fighter.interpolate).
  interpolate(alpha) {
    for (const m of this.members) {
      m.renderX = m.prevX + (m.x - m.prevX) * alpha;
      m.renderY = m.prevY + (m.y - m.prevY) * alpha + m.prevLift + (m.lift - m.prevLift) * alpha;
    }
  }
}

// What a renderer draws for fighter `f`: [{ frame, x, y, flip }] in world
// units (x, y where the frame's anchor goes), back to front. An ordinary
// fighter is one part, its own frame at its interpolated position; an
// ensemble is one part per member, at its place round the fighter, each
// mirrored by its own clip's source facing, the members performing a move
// drawn last (in front).
export function fighterParts(f, x = f.renderX, y = f.renderY) {
  const animator = f.animator;
  if (!animator?.members) {
    const frame = animator?.frame;
    return frame ? [{ frame, x, y, flip: f.spriteFlip }] : [];
  }
  const unit = f.sprites.worldPerArt;
  const facing = f.visualFacing ?? f.facing;
  const members = animator.performers
    ? [...animator.members.filter((m) => !m.performing), ...animator.members.filter((m) => m.performing)]
    : animator.members;
  const parts = [];
  for (const m of members) {
    const frame = m.animator.frame;
    if (!frame) continue;
    const source = m.animator.anim?.sourceFacing ?? f.def.sourceFacing ?? 1;
    parts.push({ frame, x: x + m.renderX * unit, y: y + m.renderY * unit, flip: facing !== source, member: m.id });
  }
  return parts;
}

// The fighter standing idle, `time` seconds into its idle clip, as the art
// a menu draws round its origin: [{ frame, dx, dy }] (dx, dy in art pixels,
// facing right), back to front. One part for an ordinary fighter; one per
// member for an ensemble, each at its home on its own idle clip.
export function idlePose(sprites, time) {
  const at = (set) => {
    const idle = set?.animations.idle;
    return idle ? idle.frames[Math.floor(time * idle.fps + 1e-9) % idle.frames.length] : null;
  };
  const parts = sprites?.members
    ? sprites.members.map((m) => ({ frame: at(m.set), dx: m.home.x, dy: m.home.y }))
    : [{ frame: at(sprites), dx: 0, dy: 0 }];
  return parts.filter((p) => p.frame);
}

// The art-pixel box round the fighter's origin a pose covers: { left,
// right, top, bottom } (top negative: up from the feet).
export function poseBounds(parts) {
  const box = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
  for (const { frame: f, dx, dy } of parts) {
    box.left = Math.min(box.left, dx - f.anchorArtX);
    box.right = Math.max(box.right, dx - f.anchorArtX + f.artW);
    box.top = Math.min(box.top, dy - f.anchorArtY);
    box.bottom = Math.max(box.bottom, dy - f.anchorArtY + f.artH);
  }
  return box;
}
