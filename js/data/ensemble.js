// Ensembles: a fighter drawn as several members, and still one fighter.
//
// Purpose: some fighters are a group: several bodies that are seen together
// and move, fight and get hurt as one. An ensemble is that fighter's art,
// never more fighters: ONE definition, ONE Fighter, one body, one hurtbox,
// one Launch Point, one Energy bar, one Shield, one set of cooldowns and
// one controller. What its `ensemble` adds is presentation: each member's
// own clips, where it stands in the group (its `home`), and which members
// perform each of its moves. Everything that happens to the fighter happens
// to every member on the same step (they run, jump, Dash, shield, get hit
// and fly off together), each in its own art.
//
// Inputs: a character definition (js/data/characters/<id>.js).
// Outputs: isEnsemble, ensembleMembers, memberIds, memberClips, hasClip,
// ensembleFramePaths, ensembleProblems, assertEnsemble, GROUP_CLIPS,
// MIN_MEMBERS, ENSEMBLE_DEFAULTS.
//
// The shape (the formation is in art pixels, facing right from the
// fighter's origin, mirrored with its facing):
//
//   ensemble: {
//     // Back to front: the order they are drawn in.
//     members: [
//       { id: 'red', home: { x: -16, y: 0 }, animations: { idle: {...}, run: {...}, ... } },
//       { id: 'gold', home: { x: 0, y: -4 }, animations: { ... } },
//       { id: 'teal', home: { x: 16, y: 0 }, animations: { ... } },
//     ],
//     referenceMember: 'gold', // carries the fighter's projectile and effect art
//     retreat: 14,             // how far behind the performers the others step back
//     spacing: 16,             // between two of the others, lined up behind
//     glide: 260,              // art pixels a second a member moves between places
//     asideAnimation: 'idle',  // what the others play meanwhile
//     float: { height: 3, period: 1.4 }, // the idle float
//   },
//
// and on any of its moves (an attack, a technique, its Deflect):
//
//   attack1: { ..., members: ['red'] },                 // one member performs it
//   attack3: { ..., members: ['red', 'teal'] },         // a combination of two
//   attack4: { ..., members: ['red', 'gold', 'teal'],   // all of them, placed
//              formation: { gold: { x: 0, y: -20 } } }, // where the move wants
//
// Who performs a move is always the definition's to say: a move of an
// ensemble names its `members` (a single one is the ordinary case; the
// Deflect names exactly one), and a combination of two or more is only ever
// a move that lists them. The members a move does not name step back behind
// the ones that perform it and stay there, in their `asideAnimation`, until
// it is over; then everyone glides back home. A single performer steps to
// the fighter's own origin, so its move's hitbox, measured from its art,
// sits where it would for any fighter. A move is still one move however
// many members perform it: one press, one cooldown, the strikes it
// authors and nothing more.
//
// Size: the fighter's `visual.height` is the whole group's at home, from its
// origin to the top of the highest member (her reference clip, lifted by her
// home), and every member is drawn at the one art-pixel size that gives.
//
// Art: each member's clips are its own, keyed by the universal codenames
// (idle, run, jump, ..., attack1, deflect) and named
// <id>_<codename>_<member>_<frame>.png (see memberFrames in
// js/data/characters/helpers.js). The clips the whole group plays together
// (GROUP_CLIPS) are every member's or none's. An ensemble has no clips of
// its own (`animations` empty): its art is its members'.
//
// Important constraints: data only, read by the registry (assertEnsemble),
// the loadout rules (hasClip) and the renderers
// (js/game/rendering/ensemble.js). Nothing here changes how the fighter
// moves, what it can do or what can hit it.

import { TECHNIQUE_CLIPS } from '../game/combat/technique.js';

// The fewest members an ensemble has: one would be an ordinary fighter.
export const MIN_MEMBERS = 2;

// The clips the whole group plays at once, whatever is happening: every
// member has each of them, or none has.
export const GROUP_CLIPS = Object.freeze([
  'idle', 'run', 'jump', 'fall', 'land', 'hurt', 'midair_hurt',
  'prepshield', 'shielding', 'releaseshield', 'mouvment', 'midair_mouvment',
]);

// What an ensemble leaves out (art pixels, seconds).
export const ENSEMBLE_DEFAULTS = Object.freeze({
  retreat: 14,
  spacing: 16,
  glide: 260,
  asideAnimation: 'idle',
  float: Object.freeze({ height: 3, period: 1.4 }),
});

const MEMBER_ID = /^[a-z]+$/;
const isObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const isPoint = (p) => isObject(p) && Number.isFinite(p.x) && Number.isFinite(p.y);

// Whether `def` is drawn as several members.
export function isEnsemble(def) {
  return !!def?.ensemble;
}

// `def`'s members, back to front (none for an ordinary fighter).
export function ensembleMembers(def) {
  return def?.ensemble?.members ?? [];
}

// Their ids, in the same order.
export function memberIds(def) {
  return ensembleMembers(def).map((m) => m.id);
}

// Every member clip of `def`: { member, key, clip }.
export function memberClips(def) {
  return ensembleMembers(def).flatMap((m) => Object.entries(m.animations ?? {}).map(([key, clip]) => ({ member: m.id, key, clip })));
}

// Whether clip `key` is there for whoever plays it: for an ordinary
// fighter, in its `animations`; for an ensemble, in the `animations` of
// every member in `performers` (every member when null).
export function hasClip(def, key, performers = null) {
  if (!isEnsemble(def)) return !!def?.animations?.[key];
  const who = performers ?? memberIds(def);
  const members = ensembleMembers(def);
  return who.length > 0 && who.every((id) => !!members.find((m) => m.id === id)?.animations?.[key]);
}

// Every frame its members' clips need, each once.
export function ensembleFramePaths(def) {
  return [...new Set(memberClips(def).flatMap(({ clip }) => clip.frames))];
}

// The moves of `def` that may name performers: [label, spec, clips].
function moves(def) {
  const out = [];
  for (const [id, spec] of Object.entries(def?.attacks ?? {})) {
    const clips = [spec.animation, spec.motion?.impact?.animation].filter(Boolean);
    out.push([`attack "${id}"`, spec, clips]);
  }
  for (const [id, spec] of Object.entries(def?.techniques ?? {})) {
    out.push([`technique ${id}`, spec, TECHNIQUE_CLIPS.map((field) => spec[field]).filter(Boolean)]);
  }
  if (def?.deflect) out.push(['its Deflect', def.deflect, [def.deflect.animation].filter(Boolean)]);
  return out;
}

// Every way `def`'s ensemble (or a move's performers) breaks the rules
// above, one sentence each; empty when it keeps them all (and always for an
// ordinary fighter whose moves name no members).
export function ensembleProblems(def) {
  const problems = [];
  const say = (text) => problems.push(text);
  const all = moves(def);
  if (!isEnsemble(def)) {
    for (const [label, spec] of all) {
      if (spec.members !== undefined || spec.formation !== undefined) say(`${label} names members, but the fighter has no \`ensemble\``);
    }
    return problems;
  }
  const e = def.ensemble;
  const members = Array.isArray(e.members) ? e.members : [];
  if (!Array.isArray(e.members) || members.length < MIN_MEMBERS) say(`its ensemble has ${members.length} members: ${MIN_MEMBERS} or more`);
  const ids = members.map((m) => m?.id);
  for (const [i, m] of members.entries()) {
    const who = `member ${i + 1}`;
    if (!isObject(m)) { say(`${who} is not an object`); continue; }
    if (typeof m.id !== 'string' || !MEMBER_ID.test(m.id)) say(`${who}'s id ${JSON.stringify(m.id)} is not lowercase letters (it names its art files)`);
    else if (ids.indexOf(m.id) !== i) say(`member id "${m.id}" is used twice`);
    if (!isPoint(m.home)) say(`member "${m.id}" has no home ({ x, y }, art pixels)`);
    if (!isObject(m.animations) || !m.animations.idle) say(`member "${m.id}" has no idle clip`);
  }
  if (Object.keys(def.animations ?? {}).length) say('an ensemble\'s art is its members\': its own `animations` stays empty');
  if (def.summons && Object.keys(def.summons).length) say('a summon\'s clone of an ensemble has no form yet: an ensemble has no summons');
  if (e.referenceMember !== undefined && !ids.includes(e.referenceMember)) say(`referenceMember "${e.referenceMember}" is no member`);
  for (const field of ['retreat', 'spacing']) {
    if (e[field] !== undefined && !(Number.isFinite(e[field]) && e[field] >= 0)) say(`its ${field} is not a distance (art pixels, 0 or more)`);
  }
  if (e.glide !== undefined && !(Number.isFinite(e.glide) && e.glide > 0)) say('its glide is not a speed (art pixels a second, more than 0)');
  if (e.float !== undefined) {
    const f = e.float;
    if (!isObject(f) || !(Number.isFinite(f.height) && f.height >= 0) || !(Number.isFinite(f.period) && f.period > 0)) {
      say('its float is not { height (art pixels, 0 or more), period (seconds, more than 0) }');
    }
  }
  const aside = e.asideAnimation ?? ENSEMBLE_DEFAULTS.asideAnimation;
  if (!hasClip(def, aside)) say(`its asideAnimation "${aside}" is not every member's`);

  // The group's clips are every member's or none's.
  for (const key of GROUP_CLIPS) {
    const having = members.filter((m) => m?.animations?.[key]).map((m) => m.id);
    if (having.length && having.length < members.length) {
      say(`group clip "${key}" is only ${having.join(', ')}'s: every member plays it, or none does`);
    }
  }
  // Its Shield is the whole group's.
  const shield = def.defense;
  for (const field of ['groundAnimation', 'groundStartAnimation', 'groundReleaseAnimation']) {
    const key = shield?.[field];
    if (key && !hasClip(def, key)) say(`its Shield's ${field} "${key}" is not every member's`);
  }

  // Every move says who performs it, and they have its art.
  for (const [label, spec, clips] of all) {
    const who = spec.members;
    if (!Array.isArray(who) || !who.length) {
      say(`${label} names no members: a move of an ensemble says who performs it`);
      continue;
    }
    const unknown = who.filter((id) => !ids.includes(id));
    if (unknown.length) say(`${label} names ${unknown.join(', ')}, no member`);
    if (new Set(who).size !== who.length) say(`${label} names a member twice`);
    if (spec === def.deflect && who.length !== 1) say(`its Deflect names ${who.length} members: one member performs it`);
    if (!unknown.length) {
      for (const key of clips) if (!hasClip(def, key, who)) say(`${label} plays "${key}", which not every member performing it has`);
    }
    if (spec.formation !== undefined) {
      if (!isObject(spec.formation)) say(`${label}'s formation is not { member: { x, y } }`);
      else {
        for (const [id, place] of Object.entries(spec.formation)) {
          if (!ids.includes(id)) say(`${label}'s formation places "${id}", no member`);
          else if (!isPoint(place)) say(`${label}'s formation place for "${id}" is not { x, y }`);
        }
      }
    }
  }
  return problems;
}

// Throws, naming every problem, if `def` breaks the ensemble rules.
export function assertEnsemble(def) {
  const problems = ensembleProblems(def);
  if (problems.length) {
    throw new Error(`[Alva] Character "${def?.id}" breaks the ensemble rules:\n- ${problems.join('\n- ')}`);
  }
}
