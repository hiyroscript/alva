# Adding a fighter

A step-by-step guide to adding a fighter without copying an existing one
and discovering what to change. Everything here is data: no engine code
changes. The naming contract is [`codename_rule`](../../codename_rule);
the rules a definition must follow are in
[`ALVA_SPEC.md`](../../ALVA_SPEC.md) §3 and §7.2; what each field does is
in [`docs/systems/`](../systems/).

The steps below use `0027` as the new fighter's id.

## 1. Choose an id and a slot

- **Id:** four digits, as a string with its leading zeroes (`'0027'`),
  unique in `CHARACTERS`. It names the art folder, every art file and the
  definition module, and the HUD shows it as `#0027` (`displayName`).
- **Roster slot:** `rosterSlot` is 0-based (slot 01 is 0); pick a free one
  of the 48 (`CONFIG.roster.totalSlots`). Today 0 and 1 are taken.

## 2. Add the art

Put every frame in `assets/characters/0027/`, named
`0027_<codename>_<frame>.png`: the universal codename, never the move's
name in game, and the frame counted from 1 (`_1` even for a single
frame). Lowercase with underscores.

| What | Codename |
| --- | --- |
| Idle, run, jump, fall, land, hurt, mid-air hurt | `idle`, `run`, `jump`, `fall`, `land`, `hurt`, `midair_hurt` |
| The Shield (raise, hold, lower: on the ground) | `prepshield`, `shielding`, `releaseshield` |
| The Deflect (the Shield button in the air) | `deflect` |
| The Dash and the air dash | `mouvment`, `midair_mouvment` (spelled that way on purpose) |
| Numbered attacks and their mid-air versions | `attack1` … `attack5`, `midair_attack1` … `midair_attack5` |
| The extra attack | `extra_attack` |
| A summon's startup pose (the owner's own) | `attackN_summon` |
| Anything an attack creates (projectile, cloud, object) | `<attack>_object`, e.g. `extra_attack_object`, `attack3_object`; distinct object types as `attackN_object_<type>` |

Art is never redrawn, recoloured or generated: use the frames as supplied.
A clip can reuse another's file (the same path in both clips), never a
copy on disk. No fighter art goes at the repository root.

Art may come at any scale. If the frames are upscaled pixel art the grid
is detected automatically (`visual.pixelSize: 'auto'`); if they are 1×
(one file pixel per art pixel), set `visual.pixelSize: 1` and size each clip
with `heightRatio` (its tallest frame over the reference clip's height).
By convention every fighter's art pixel is 88 / 52 world units, so set
`visual.height` to your reference clip's art height × 88 / 52. Optionally
give `visual.eliminationPalette`: 3–5 CSS colours picked from the art (its
hair, clothes, skin, signature glow), which the Void's burst is drawn in
when the fighter is taken; without one it bursts in a neutral white, grey
and amber.

## 3. Write the definition module

Create `js/data/characters/0027.js` exporting the definition:

```js
import { frames } from './helpers.js';

// Playback rates of 0027's clips: its attack phases below are whole
// frames at these rates.
const FPS = Object.freeze({ idle: 8, run: 12, attack1: 12, attack2: 12 });

export const CHARACTER_0027 = {
  id: '0027',
  displayName: '#0027',
  available: false, // until it is ready to be played (step 6)
  rosterSlot: 2,
  sourceFacing: 1, // the art faces right
  animations: {
    idle: { frames: frames('0027', 'idle', 4), fps: FPS.idle, loop: true },
    run: { frames: frames('0027', 'run', 6), fps: FPS.run, loop: true, minSpeedScale: 0.7 },
    jump: { frames: frames('0027', 'jump', 2), fps: 10, loop: false },
    fall: { frames: frames('0027', 'fall', 2), fps: 10, loop: false },
    hurt: { frames: frames('0027', 'hurt', 1), fps: 12, loop: false },
    midair_hurt: { frames: frames('0027', 'midair_hurt', 1), fps: 12, loop: false },
    attack1: { frames: frames('0027', 'attack1', 4), fps: FPS.attack1, loop: false },
    midair_attack1: { frames: frames('0027', 'midair_attack1', 3), fps: FPS.attack1, loop: false },
    attack2: { frames: frames('0027', 'attack2', 5), fps: FPS.attack2, loop: false },
    midair_attack2: { frames: frames('0027', 'midair_attack2', 4), fps: FPS.attack2, loop: false },
  },
  animationFallbacks: { jump: { animation: 'idle', frame: 0 }, fall: { animation: 'idle', frame: 0 } },
  visual: {
    height: 88, referenceAnimation: 'idle', anchor: 'torso', pixelSize: 'auto',
    portrait: { animation: 'idle', frame: 0, centerY: 0.25, size: 0.5 },
    eliminationPalette: ['#e8e8ee', '#3a6fd8', '#d23a2a'], // optional
  },
  collider: { width: 32, height: 78 },
  pushbox: { width: 34 },
  hurtboxes: [{ x: -16, y: -78, w: 32, h: 78 }],
  // No movement and no powers: see step 4.
  actions: { /* step 5 */ },
  attacks: { /* step 5 */ },
};
```

Keep the fighter's own constants (playback rates, art measurements,
shared hitboxes) in this module, beside the definition. Then register it
in [`js/data/characters.js`](../../js/data/characters.js):

```js
import { CHARACTER_0027 } from './characters/0027.js';

export const CHARACTERS = [
  CHARACTER_0001,
  CHARACTER_0002,
  CHARACTER_0027,
];
```

The registry validates it as the module loads: a definition that breaks
the loadout rules, or that declares movement of its own (step 4), is
refused with every problem named.

**Clips.** A clip is `{ frames, fps, loop }`, plus optionally
`heightRatio`, `minSpeedScale` / `maxSpeedScale` (run: the slowest and
fastest it plays, × its rate, following the speed), `sourceFacing`, `anchorX` /
`anchorY` (per-frame anchors in art pixels, for art the automatic anchor
gets wrong). `land` is optional (without it the fighter lands straight
into its stance). Projectile art goes in `projectileAnimations`, effect art
(clouds, objects) in `effectAnimations`; both are normalized at their own
size, never fitted to the fighter's height. `animationFallbacks` names a
still frame for the airborne, landing and hurt clips if their frames fail
to load; attacks, the Shield, the Deflect, the Dash and the air dash never
fall back.

## 4. Movement: nothing to write

**All fighters share universal baseline locomotion. Character identity
changes the moveset, not run/jump/Dash fundamentals.** A new fighter runs,
turns, jumps, triple-jumps, fast-falls, Dashes and air dashes on the
universal values ([`js/data/movement.js`](../../js/data/movement.js),
[movement](../systems/movement.md#2-the-universal-values)) without
declaring any of them. Do not give it a `movement` profile, `powers`
(Jump Power and Speed Power are retired) or any movement field: the
registry refuses the definition. A fighter that looks heavy is no slower,
and one that is fast in its canon is no faster: put that speed in its
moves (a `motion` such as `homing`, `roll`, `bounce` or `rise`, a `step`,
its attacks' `momentum`).

What it does bring is art: a `mouvment` clip for the Dash and a
`midair_mouvment` clip for the air dash (each is played once across the
universal Dash, whatever its frame count). Every playable fighter needs
both, so every playable fighter has the same capabilities. The same two
clips are what the human player's Combat Assist plays as it closes in
before a melee attack, on the ground and in the air
([combat](../systems/combat.md#combat-assist)): that needs nothing else
from a fighter, as an attack's own `hitbox` (and no `projectile`) is what
makes it melee.

Optionally `energy: { regen }`, its refill rate per second (12 when left
out). That is all a fighter sets of its Energy: the bar (100) and every
cost (a Dash, an air dash or a Dash cancel 25, a Deflect 15, a block 15;
Combat Assist nothing) are the same for everyone, and a definition that
writes another is refused ([Energy](../systems/energy.md)).
Optionally too `launchReaction` (extra stun, tumble,
steering; [launch](../systems/launch.md#launch-reaction-per-fighter)) and
`launchBounce` (overrides of the shared rebound settings).

## 5. Give it moves

**Buttons.** `actions` maps each combat button to a move, following
[the loadout rules](../systems/combat.md#loadouts): `attack1` and
`attack2` always, up to `attack5`, numbered in a row, each a button of its
own:

```js
actions: {
  extra_attack: 'extra_attack',                          // optional
  transform: null,                                       // reserved
  attack1: { ground: 'attack1', air: 'midair_attack1' },
  attack2: { ground: 'attack2', air: 'midair_attack2' },
  attack3: { type: 'summon', id: 'attack3' },            // optional: a summon...
  attack4: { type: 'technique', id: 'attack4' },         // ...or a technique, or another ordinary attack
},
```

A button left out does nothing for this fighter (its touch button is
hidden and the CPU never presses it).

**Attacks.** Each ordinary attack and its mid-air version is an entry in
`attacks` ([the field table](../systems/combat.md#attacks)). Time
`startup` / `active` / `recovery` to whole frames of the clip so the
hitbox is live only while the strike is on screen; measure the `hitbox`
from the art, facing right from the fighter's origin. Every hit declares
its `damage` (added to the target's Launch Point), one of the four tiers
and nothing else: 1 for a light hit or a tick of a multi-hit string, 3
for a solid one, 5 for a heavy hit or a major launcher, 10 for an
exceptional, ultimate-level one (anything else, `damage: 2` included, is
refused as the registry loads: [combat](../systems/combat.md#damage));
its `baseLaunch` (0 to
3: by `codename_rule`'s launch levels, 1 for light, 2 for medium, 3 for
big-impact attacks) and its `directionalLaunch` (`null`, `'horizontal'`,
`'vertical'` or `'reverseVertical'`), each authored separately. Add how
it moves (`momentum`, `control`, `friction`, `step`), whether a hit
opens a follow-up (`hitCancel`) and an optional longer repeat
`cooldown` (0.5 s minimum by default, with finite longer overrides;
independent of the move's phases,
[combat](../systems/combat.md#cooldowns)). For more than a timed hitbox, use the
attack mechanics: strikes (`hits`), `carry`, `motion` (`hover`, `homing`,
`bounce`, `rise`, `roll`), `pull`, `airUses`, `freeFall`, `passThrough`,
`hurtboxes`, and on any hit the shared hit effects (`unblockable`,
`paralyze`, `blockPush`)
([combat](../systems/combat.md#attack-mechanics-beyond-a-timed-hitbox)).
An attack whose art is in but whose attributes are not can be
`pending: true` for now (art only, no hit).

**A projectile** is an attack with `hitbox: null` and `projectile: { id:
'extra_attack_object', spawnAt, offset }`, plus an entry in `projectiles`
and its art in `projectileAnimations`
([projectiles](../systems/combat.md#projectiles)). It may pierce
(`pierce`, `finisher`), pull (`pull`), turn other fighters' projectiles
back (`repel`) or erase them and fly through fighters (`erase`).

**A summon** (a clone of the fighter performing one of its own attacks)
is a `summons.attackN` entry with its `attack`, its `cloud` (an
`effectAnimations` entry named `attackN_object`), a `cooldown` if it
should have one (0, the default, is none), and
optionally `startupAnimation` (`attackN_summon`) and `noGround`
([summons](../systems/combat.md#summons)).

**A technique** is a `techniques.attackN` entry. The runtime supports one
form, the cast: two fighter clips (`castAnimation`, `releaseAnimation`,
named `attackN_cast` and `attackN_release` by convention), a `cooldown`
if it should have one (0, the default, is none: #0001's have none), and
what it lets go of as the cast ends, a `projectile` (an entry of
`projectiles`, `attackN_object`), a `burst` round the fighter (a `hitbox`
and its `hit`), or both ([techniques](../systems/combat.md#techniques);
#0001's Unlimited Void and Hollow Purple). A technique of a different
shape needs a new form in the runtime first.

**Character-specific mechanics** belong in the definition when the
shared schema can express them (as #0002's homing dash or plunge are
`motion` data, and #0001's Maximum Blue drawing its target in is a
projectile's `pull`). When it cannot, add the mechanic to the shared system as
a capability any fighter can opt into, named for what it does, never for
the fighter or for its button: never a check for `'0027'` in shared code.

## 6. Defense, touch buttons and names

- **Defense:** `defense: { type: 'shield', groundAnimation:
  'shielding', ... }` for a Shield on the ground
  ([defense](../systems/defense.md)); `stall` to freeze the melee
  attackers it blocks; leave `defense` out for none. There is no Shield in
  the air (an `airAnimation` or slow fall is refused).
- **Deflect:** `deflect: { animation: 'deflect', startup, active,
  recovery, hitbox, directionalLaunch, ..., deflectProjectiles: true }`
  for the Shield button in the air ([the
  Deflect](../systems/defense.md#the-deflect)): an attack whose strike is
  always 3 at Base Launch 2 (leave `damage` and `baseLaunch` out) and that
  costs every fighter 15 Energy as it starts; its `cooldown`, if any, is
  exempt from the ordinary 0.5 s baseline. Its box
  is also what catches projectiles, so cover the front of the body the
  move sweeps. Leave it out for none (the button then does nothing in the
  air).
- **Touch buttons:** `mobileAbilities.<button>` gives each button its
  `label` and a frame of its own art: `preview: { animation, frame }`
  (frame counted from 0), `previews.air` for a distinct airborne move,
  `collection: 'projectileAnimations'` to pick projectile art, and an
  optional `fallbackIcon` ([input](../systems/input.md#touch-controls)).
  Pick the frame that reads as the move (its strike, its release), not
  blindly the first. Jump, Shield (Deflect in the air) and Transform keep
  their universal glyphs.
- **Ability names:** `abilityNames`, keyed by move codename
  (`attack1: 'Uppercut'`); a move left out keeps its neutral name
  ("Attack 1").
- **Localization:** the English names are read from `mobileAbilities` and
  `abilityNames`; add their French translations to
  [`js/localization/strings/fr.js`](../../js/localization/strings/fr.js)
  as `ability.0027.<button>` and `ability.0027.<midair move>`
  ([localization](../systems/localization.md)). The i18n test fails while a
  key is missing in either language.
- **Credits:** add a credit group for its sprite source to
  [`js/ui/credits.js`](../../js/ui/credits.js), its lines as translation
  keys with their English and French strings, exactly as the source was
  supplied; never invent a credit.

## 7. The Discover profile

Before it is made playable, give it a profile in
[`js/data/fighter-profiles.js`](../../js/data/fighter-profiles.js): the
card Discover's Fighters page shows for it. A playable fighter without a
valid, current one fails
[`tests/fighters/profiles.test.mjs`](../../tests/fighters/profiles.test.mjs).

```js
'0027': Object.freeze({
  difficulty: 3,
  descriptionKey: 'discover.fighter.0027.playStyle',
  reviewedSourceHash: '…',
}),
```

1. **Read its finished definition and specification**, then assign ONE
   difficulty rating, a whole number from 1 to 5. There is exactly one
   rating: never a "to play" and a "to master" score. It rates both
   together, how hard the fighter is to pick up and play effectively AND
   how hard it is to master. Read it against the scale (also
   `DIFFICULTY_SCALE` in the module), and compare it with the current
   fighters' ratings so the roster stays consistent:

   | Rating | Means | Today |
   | --- | --- | --- |
   | 1 | Very easy to learn and comparatively simple to master. | |
   | 2 | An easy core game plan with little extra to master. | |
   | 3 | Approachable fundamentals, with meaningful decision-making and execution depth at higher levels. | #0002: readable rushdown; mastery in momentum, air uses, free fall, approach angles, not overcommitting |
   | 4 | Demanding to use well, with substantial mastery requirements. | |
   | 5 | Difficult both to pilot effectively and to master: highly layered mechanics, situational decisions, setup or resource requirements, punishing commitments. | #0001: a large, contextual space-control and setup toolkit, Energy and cooldown management, punishable long casts |

   Judge it; never compute it from move counts, Energy costs or any other
   data.
2. **Write its play-style description** under
   `discover.fighter.0027.playStyle` in
   [`en.js`](../../js/localization/strings/en.js) and a natural French
   translation in [`fr.js`](../../js/localization/strings/fr.js). Use two
   concise sentences, about 30–55 words total, covering combat approach,
   strengths and vulnerabilities. No named abilities or move inventories,
   numerical mechanics, difficulty commentary, backstory, or claims of faster
   universal movement. Keep both languages semantically consistent and use
   no real or canonical character name ([`codename_rule`](../../codename_rule)).
   Review the actual definition and specification: they remain authoritative.
   A copy-only rewrite does not change difficulty or the review hash; only
   record a new hash after reviewing a changed definition under the contract.
3. **Record the review hash**: the SHA-256 of its definition's source, its
   line endings normalized to `\n`:

   ```sh
   node -e "const s=require('fs').readFileSync('js/data/characters/0027.js','utf8').replace(/\r\n?/g,'\n');console.log(require('crypto').createHash('sha256').update(s,'utf8').digest('hex'))"
   ```

   (or run `node --test tests/fighters/profiles.test.mjs`: a stale hash
   fails with the current one in its message).

**Whenever the definition changes later** (a retuned hit, a new move, a
renamed clip, even a comment), the profile test fails: "#0027 changed
since its Discover profile was reviewed. Recheck its difficulty and
play-style description, then update reviewedSourceHash". Recheck the
rating and the description against the new definition, change them if
the change calls for it, and only then record the new hash. Never update
the hash without that review, and never put the hash in the definition
itself.

## 8. Make it playable

Set `available: true`. From then on it is preloaded, offered on every
roster, browsable on Discover's Fighters page with its rating and
description, and can start a Quick Battle, either side of Watch Mode, or
Practice Ground. Until then its slot shows locked and no route can start
it.

## 9. Test it

Run the whole suite (`node --test`; see [testing](../development/testing.md)).
A new fighter is covered automatically by:

- the loadout validation as the registry loads, and
  [`tests/systems/loadout.test.mjs`](../../tests/systems/loadout.test.mjs);
- the codename and asset checks in
  [`tests/systems/codenames.test.mjs`](../../tests/systems/codenames.test.mjs)
  (every frame path exists);
- [`tests/systems/universal-movement.test.mjs`](../../tests/systems/universal-movement.test.mjs)
  and [`momentum.test.mjs`](../../tests/systems/momentum.test.mjs) (once
  playable: it moves exactly as every other fighter does, keeps its
  momentum, triple-jumps, and has the Dash and air dash art);
- [`tests/integration/roster-matrix.test.mjs`](../../tests/integration/roster-matrix.test.mjs)
  (once playable: every pairing with the other fighters, both ways and
  mirrored, in a real Watch Mode battle);
- [`tests/fighters/profiles.test.mjs`](../../tests/fighters/profiles.test.mjs)
  (once playable: a valid Discover profile, a description in both
  languages and a review hash matching its definition);
- the localization and touch-control tests.

Then add its own tests in `tests/fighters/0027/` for what is its own:
its art (files, crops, scale), each move's timing and hits, its
mechanics, its CPU play. Build fighters with the harness's
`harnessFor(CHARACTER_0027)` (or pass `character` to `makeFighter` /
`duel`), never the default fighter. Finally write its specification,
`docs/characters/0027.md`, and list it in
[`docs/characters/README.md`](README.md) and
[`ALVA_SPEC.md`](../../ALVA_SPEC.md) §7.2.9. Check it in a real browser
too: the tests cannot see scale, anchoring or paint.
