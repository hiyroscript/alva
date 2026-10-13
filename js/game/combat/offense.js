// Attack classification: what an action, an entity or a hit is capable of
// doing, apart from how it is executed.
//
// Purpose: one shared answer to "is this an attack?" for every fighter and
// every kind of move. An action's execution type (an ordinary attack, a
// projectile, a technique, a summon, the Deflect, the Shield) decides HOW it
// works: its timing, its animation, its cooldown, what it spawns. Its
// classification decides WHAT it can do: whether it is an attack (it can
// deal damage, directly or through whatever it creates), whether it is a
// defense, or both. The two never replace each other: a technique stays a
// technique and is an attack, a summon stays a summon and is an attack, the
// Deflect is an attack and a defense.
//
// Inputs: the frozen definitions the combat schemas build (attacks.js,
// projectile.js, technique.js, summon.js, deflect.js, defense.js) and a
// Fighter's resolved tables of them.
// Outputs: classifyHit, isHarmfulHit, attackOffense, projectileOffense,
// techniqueOffense, summonOffense, actionOffense, resolveOffense,
// assertNoShieldBypass, SHIELD_BYPASS_FIELDS, ATTACK_SOURCES and the two
// fixed profiles NOT_AN_ATTACK and PURE_DEFENSE.
// Important constraints: classification is inferred from a definition's
// damaging components (a hit that deals damage, paralyzes or launches; a
// projectile it releases; a clone that strikes; a projectile it turns
// back), never from a name, a codename, a button or a fighter. A definition
// may state `offensive` (true or false) for its readers, but only to agree
// with what it does: a damaging move declared harmless, or a harmless one
// declared an attack, is refused. And nothing may declare a way past an
// active Shield (SHIELD_BYPASS_FIELDS): every attack is blockable, so such a
// field is refused wherever a hit is built, never quietly ignored.
//
// A profile is frozen:
//
//   { attack: true, defense: false, sources: ['strike'] }
//
// `sources` names the damaging (or redirecting) components it was inferred
// from: 'strike' (one hit of its own), 'strikes' (a multi-hit string),
// 'projectile' (it releases one, or is one), 'finisher' (a piercing
// projectile's last strike), 'burst' (a technique's hit round its caster),
// 'clone' (a summoned clone that strikes) and 'redirect' (it turns
// projectiles back, the Deflect's defensive half).
//
// Every hit that reaches a fighter goes through CombatSystem.applyHit
// (js/game/combat/combat.js), whatever made it; its event names the
// offensive source (ATTACK_SOURCES) and the ability it came from.

// Where a hit that reaches a fighter came from (CombatSystem events'
// `source`): a fighter's own melee strike, the strike of an attack that
// also turns projectiles back (every Deflect's), a projectile (thrown, cast
// or turned back), a summoned clone's strike or a technique's burst.
export const ATTACK_SOURCES = Object.freeze(['melee', 'deflect', 'projectile', 'summon', 'technique']);

// Fields no hit, attack, projectile, technique or summon may declare: each
// would let an attack through an active Shield, and every attack is
// blockable. `unblockable` was the hit effect that did; the rest are the
// names a future one would most likely take.
export const SHIELD_BYPASS_FIELDS = Object.freeze([
  'unblockable', 'ignoreShield', 'ignoresShield', 'bypassShield', 'pierceShield', 'shieldPierce', 'guardBreak',
]);

const profile = (attack, defense, sources) => Object.freeze({ attack, defense, sources: Object.freeze(sources) });

// Neither an attack nor a defense: movement, a pending attack, an empty
// button.
export const NOT_AN_ATTACK = profile(false, false, []);

// A defense that deals nothing: the Shield.
export const PURE_DEFENSE = profile(false, true, []);

// Throws, naming `owner`, if `spec` declares any way past an active Shield
// (SHIELD_BYPASS_FIELDS), whatever its value: there is none.
export function assertNoShieldBypass(spec, owner = 'A hit') {
  if (!spec) return;
  const declared = SHIELD_BYPASS_FIELDS.filter((field) => spec[field] !== undefined);
  if (declared.length) {
    throw new Error(`[Alva] ${owner} declares ${declared.join(', ')}: every attack is blockable by an active Shield, so nothing may bypass one`);
  }
}

// Whether hit definition `hit` can do anything to whoever it reaches: it
// adds Launch Point, paralyzes or launches.
export function isHarmfulHit(hit) {
  return !!hit && (hit.damage > 0 || hit.paralyze > 0 || (hit.baseLaunch > 0 && !!hit.directionalLaunch));
}

// The classification of one hit (what CombatSystem.applyHit resolves).
export function classifyHit(hit) {
  return isHarmfulHit(hit) ? profile(true, false, ['strike']) : NOT_AN_ATTACK;
}

// An attack definition's (js/game/combat/attacks.js): a strike of its own
// or a string of them that can harm, a projectile it throws, or projectiles
// it turns back (then it is a defense too: the Deflect). A pending attack
// has none of them.
export function attackOffense(def) {
  const sources = [];
  if (def?.hits) {
    if (def.hits.some(isHarmfulHit)) sources.push('strikes');
  } else if (def?.hitbox && isHarmfulHit(def)) {
    sources.push('strike');
  }
  if (def?.projectile) sources.push('projectile');
  const defense = !!def?.deflectProjectiles;
  if (defense) sources.push('redirect');
  return sources.length ? profile(true, defense, sources) : NOT_AN_ATTACK;
}

// A projectile definition's (js/game/combat/projectile.js): its own hit,
// and a piercing one's finisher. Whoever owns it (its thrower, or a fighter
// that turned it back) it stays an attack.
export function projectileOffense(def) {
  const sources = [];
  if (isHarmfulHit(def)) sources.push('projectile');
  if (def?.finisher && isHarmfulHit(def.finisher)) sources.push('finisher');
  return sources.length ? profile(true, false, sources) : NOT_AN_ATTACK;
}

// A technique definition's (js/game/combat/technique.js): its burst's hit
// and the projectile it releases. Executed as a technique, it is an attack
// all the same.
export function techniqueOffense(def) {
  const sources = [];
  if (def?.burst && isHarmfulHit(def.burst.hit)) sources.push('burst');
  if (def?.projectile) sources.push('projectile');
  return sources.length ? profile(true, false, sources) : NOT_AN_ATTACK;
}

// A summon definition's (js/game/combat/summon.js): its clone performs one
// of its owner's attacks, so the summon is an attack whenever that attack
// is (`attacks`, the owner's resolved table; every attack a clone may
// perform, its no-ground one included, is weighed). Without the table, a
// summon is classified by what every summon does: send a clone that
// strikes (the registry checks the attack really can: see
// assertCombatRules in js/data/characters.js).
export function summonOffense(def, attacks = null) {
  if (!attacks) return profile(true, false, ['clone']);
  const ids = [def?.attack, def?.noGround?.attack].filter(Boolean);
  return ids.some((id) => attackOffense(attacks[id]).attack) ? profile(true, false, ['clone']) : NOT_AN_ATTACK;
}

// Checks `spec`'s own `offensive` (if it states one) against `inferred`
// and returns `inferred`: a declaration may only agree with what the
// definition does, never decide it.
export function resolveOffense(spec, inferred, owner) {
  const declared = spec?.offensive;
  if (declared === undefined) return inferred;
  if (typeof declared !== 'boolean') throw new Error(`[Alva] ${owner}'s offensive must be true or false`);
  if (declared !== inferred.attack) {
    const does = inferred.attack ? `can deal damage (${inferred.sources.join(', ')})` : 'deals no damage';
    throw new Error(`[Alva] ${owner} declares offensive: ${declared}, but it ${does}: whether it is an attack follows from what it does`);
  }
  return inferred;
}

// What fighter `f`'s `action` (a combat button, or `shield`) does where it
// is (`grounded`), classified: the attack, summon or technique the button
// maps to, the Shield on the ground or the Deflect in the air on `shield`;
// anything else (movement, a reserved or absent button) is no attack.
export function actionOffense(f, action, grounded = !!f?.body?.grounded) {
  if (action === 'shield') {
    if (grounded) return f?.defense ? f.defense.offense ?? PURE_DEFENSE : NOT_AN_ATTACK;
    return f?.deflect ? attackOffense(f.deflect) : NOT_AN_ATTACK;
  }
  const mapping = f?.def?.actions?.[action];
  if (!mapping) return NOT_AN_ATTACK;
  if (typeof mapping === 'object' && Object.hasOwn(mapping, 'type')) {
    if (mapping.type === 'technique') return techniqueOffense(f.techniqueDefs?.[mapping.id]);
    if (mapping.type === 'summon') {
      const summon = f.summonDefs?.[mapping.id];
      return summon ? summonOffense(summon, f.attacks) : NOT_AN_ATTACK;
    }
    return NOT_AN_ATTACK;
  }
  const id = typeof mapping === 'string' ? mapping : grounded ? mapping.ground : mapping.air;
  return attackOffense(f.attacks?.[id]);
}
