# Named updates

Some larger pieces of work have a name, so they can be referred to later
("make the bounce update's rebounds softer", "undo part of the movement
update"). Each entry says what the update added, where its tuning lives, and
which tests cover it. Anything not listed under an update is unchanged by it.

| Name | Pull request | Commit | In one line |
| --- | --- | --- | --- |
| **Movement update** | [#49](https://github.com/hiyroscript/alva/pull/49), then [#57](https://github.com/hiyroscript/alva/pull/57) ([second pass](#second-pass)) | `a34fbdd`, then `e75dbb6` | Movement feel, attack momentum and combo flow for #0001 |
| **Effect update** | [#50](https://github.com/hiyroscript/alva/pull/50) | `487b9af` | Short hop, air jump, launch reaction, perfect Shield and hit effects |
| **Bounce update** | [#51](https://github.com/hiyroscript/alva/pull/51) | `f7c1e28` | Hard launches rebound off walls, floors and ceilings |

They were made in that order and build on each other: the effect update
assumes the movement update, and the bounce update assumes both.

## Movement update

Makes #0001's movement quicker and its attacks flow into each other.
MultiVersus was the reference for the feel only; every ALVA mechanic is kept.
A [second pass](#second-pass) later made it snappier and opened the combos
further; the list below is the update as it stands now.

**What it added**

- **Ground movement:** top speed in about 0.08 s, a short natural stop, and
  turns that brake hard before accelerating.
- **Air steering:** bends the drift instead of replacing it, so a running
  jump carries its speed.
- **Fast fall:** Down (the Charge input) held in the air while falling. A
  Charge held from the air no longer starts charging on landing.
- **Dash handoff:** a Dash eases into the run instead of sliding on.
- **Attack momentum:** a running attack1 slides on, attack2 steps in, aerials keep
  their drift and follow the stick almost fully, and the Throw can back
  off. An attack faces the direction held as it starts.
- **Combat input buffer:** a Throw, attack1 or attack2 press that comes too early is
  kept for 0.15 s and fires on the first step it can.
- **Hit-cancel:** a hit that connects (not a block or a whiff) can be cut
  short into another attack, a jump or, on the ground, a Dash.
- **Dash cancel:** the Dash out of a hit costs 40 Energy instead of 15, so
  a full bar allows two and a third empties it (the Shield goes with it).
  That is what keeps attack1 → Dash → attack1 from looping. A Dash asked for during
  the hit's freeze comes out the step it ends.
- A hit now interrupts the target's own attack.
- **Combo routes:** at low Launch Point, attack1 → attack2, attack1 → attack1,
  attack2 → jump → midair_attack1 and midair_attack2 → land → attack1 all connect;
  attack1 → Dash → attack1 chases attack1's push up to about 85 Launch Point, and
  attack2 → jump → midair_attack1 carries on into a third aerial (through the air
  jump up to about 40). They break naturally as Launch Point grows.

**Where to tune it** (`js/data/characters.js`, #0001)

- `movement`: `acceleration`, `deceleration`, `turnBoost`,
  `overspeedDeceleration`, `airAcceleration`, `airDeceleration`,
  `airTurnBoost`, `fastFallAcceleration`, `fastFallSpeed`, `attackBuffer`,
  `hitstunFriction`, `hitstunAirDrag`.
- `energy.dashCancelCost`: what a Dash cancel costs.
- Each attack in `attacks`: `momentum` / `airMomentum`, `control` /
  `airControl`, `friction`, `step`, `hitCancel`, plus `hitstun`,
  `hitstop` and `cooldown`, which set the combo routes.

**Code:** `Fighter.moveHorizontal`, `moveAttack`, `attackStartSpeed`,
`tryDash` and `dashAsked` in `js/game/character.js`; `CombatState` and
`resolveEnergy` in `js/game/combat.js`. The combat AI
(`js/game/combat-ai.js`) predicts attack drift from the same data.

**Tests:** `tests/movement.test.mjs`, `tests/combo.test.mjs` (the Dash
cancel included), and the Dash cancel's cost in `tests/energy.test.mjs`.

### Second pass

Pull request [#57](https://github.com/hiyroscript/alva/pull/57), commit `e75dbb6`. Asked for as "the
movement update needs to feel better and combos to be even more open".
Values it changed, old → new, for undoing any one of them:

| Where | Field | Before | After |
| --- | --- | --- | --- |
| `movement` | `acceleration` | 3400 | 4200 |
| `movement` | `deceleration` | 3800 | 4200 |
| `movement` | `turnBoost` | 2.4 | 2.6 |
| `movement` | `airAcceleration` | 2400 | 3000 |
| `movement` | `airTurnBoost` | 1.8 | 2.0 |
| `movement` | `fastFallAcceleration` | 7500 | 12000 |
| `movement` | `attackBuffer` | 0.12 | 0.15 |
| `attacks.midair_attack1` | `airControl` | 0.6 | 0.85 |
| `attacks.midair_attack1` | `hitstun` | 0.28 | 0.32 |
| `attacks.midair_attack1` | `cooldown` | 0.18 | 0.16 |
| `attacks.midair_attack2` | `airControl` | 0.4 | 0.7 |
| `energy` | `dashCancelCost` | (none) | 40 |

The mid-air attacks were named `midairBa1` and `midairBa2` when this pass
was made; they are `midair_attack1` and `midair_attack2` now (see
[Control and move codenames](#control-and-move-codenames)).

It also added the Dash cancel itself (`Fighter.tryDash` accepts an attack
that may be cut short), and kept a Dash asked for during a hit's freeze
(`Fighter.dashAsked`, `frozenDash`). Setting `dashCancelCost` does not turn
Dash cancels off. To take them out, put back `canAct()` in place of
`canFollowUp()` in `tryDash`.

Measured, in steps of 1/60 s: top speed 6 → 5, a full turn 8 → 7, a full
air reversal 13 → 10, a fast fall from a jump's apex 11 → 9. The longest
true combo from 0 Launch Point is still 9 hits. At 40–60 it went from one
or two hits to a four-hit Dash chase.

### Later: #0001's damage cut

Not part of the update, but it moves the numbers above. #0001's damage was
lowered afterwards: attack1 and midair_attack1 5 → 3, attack2 and midair_attack2 10 → 5,
the Sphere Rush blast 15 → 10 (`damage` in `js/data/characters.js`). Each
hit now pushes and launches a little less, so:

- From 0 Launch Point, attack1 → attack1 strings up to 6 hits (was 4) and the
  attack1 → Dash → attack1 chase up to 7 (was 5): the same three Dashes empty the
  bar, then plain BA1s carry on until the push ends it. Neither loops;
  `tests/combo.test.mjs` allows 6 and 7.
- Each route's Launch Point limit moved up, by about 2 for the attack1 routes
  and about 5 for the attack2 routes: attack2 → jump → midair_attack1 now reaches
  about 65, and the third aerial through the air jump about 45.
- The combat AI weighs a hit's damage at `damage / 6` instead of `/ 10`
  (`hitValue` in `js/game/combat-ai.js`), so it values its hits, and so its
  Charge replacements, as it did before the cut.

### Later: turning during actions

Not part of the update, but it changes one of its rules. "An attack faces
the direction held as it starts" still holds, and now a direction held
while the attack plays turns it too, at once, either way (the Shield and
Charge as well). So holding back during the Throw now turns it rather than
backing off facing forward. See
[Jump, Shield, turning and joystick changes](#jump-shield-turning-and-joystick-changes).

## Effect update

Named for its hit effects, but it also holds the jump, launch and Shield
changes listed below. A request about the short hop, air jump, tumble,
launch steering or perfect Shield is about this update.

**What it added**

- **Short hop:** tapping Jump gives a low hop (about 59 units, 0.35 of a
  full jump); holding it gives the full jump.
- **Air jump:** one more jump in the air, reusing the jump frames, at 0.9 of
  the jump's speed. A held direction changes course. Landing or being hit
  gives it back. The CPU uses it to get back to the stage.
- **Launch stun:** a harder launch stuns longer, 0.2 s more per 1000
  units/s, up to 0.7 s more.
- **Tumble:** a fighter launched at 1100 units/s or faster tumbles in its
  mid-air hurt pose until it acts or lands.
- **Launch steering:** the direction held as a hit lands bends the launch by
  up to 15°. It never changes the launch's strength, and Down does nothing
  on the ground.
- **Perfect Shield:** a hit within 0.1 s of raising the Shield (after it has
  been down for 0.25 s) is blocked with no Energy cost and no blockstun. The
  CPU's chance of one is its `guard` trait to the fourth power, so it
  scales with difficulty.
- **Hit effects** (display only, they never change the fight):
  - screen shake scaled to the hit;
  - a one-frame white flash on the fighter who got hit;
  - sparks where the hit landed, a red ring on a block and a white one on a
    perfect block;
  - fading speed trails behind fighters flying fast;
  - a slow-motion zoom on a launch predicted to reach the Void.

  With reduced motion on, the shake and zoom are dropped.

**Where to tune it**

- `js/data/characters.js`, #0001:
  - `movement`: `airJumps`, `airJumpRatio` (`shortHopWindow` and
    `shortHopHeight` are gone, see below);
  - `launchReaction`: `stunPerThousand`, `maxStun`, `tumbleSpeed`,
    `steerAngle`;
  - `defense`: `perfectWindow`, `perfectRearm`.
- `js/game/hit-fx.js`: `HIT_FX` (`shake`, `flash`, `sparks`, `trail`,
  `lethal`).

**Code:** the jump and Shield timing in `js/game/character.js`;
`resolveLaunchReaction`, `resolveLaunchStun`, `steerLaunch` and the perfect
Shield in `CombatSystem.applyHit` (`js/game/combat.js`); `HitEffects` and
`launchIsLethal` in `js/game/hit-fx.js`, drawn by `js/game/arena.js`.

**Tests:**
- `tests/hit-fx.test.mjs`
- `tests/launch-reaction.test.mjs`
- the air jump in `tests/movement.test.mjs`
- perfect Shield in `tests/defense.test.mjs`

### Later: the short hop is gone

Not part of the update. The short hop was removed: a tap is the normal
jump again, exactly as before the update, and Jump held a little longer
gives a higher jump instead. The air jump is unchanged. See
[Jump, Shield, turning and joystick changes](#jump-shield-turning-and-joystick-changes).

## Bounce update

A launch that drives its fighter hard into a wall, floor or ceiling now
rebounds off it instead of stopping dead, and can ricochet on to the next
surface. Ordinary movement still stops: walking into a wall, jumping into a
ceiling and landing are unchanged.

**What it added**

- **Rebounds:** only a launch carrying its fighter into a surface at 500+
  units/s rebounds, so gravity alone never bounces anyone. The part of the
  speed going into the surface comes back reversed and scaled (wall 0.72,
  floor 0.6, ceiling 0.65); the part along it is kept. A corner rebounds
  once on both axes.
- **Rebound stun:** a rebound leaves at least 0.2 s of hitstun. A hard one
  (1200+ units/s) freezes the fighter at the surface for 0.05 s.
- **No wall loops:** rebounds count up until the fighter recovers, capped at
  5 even across new launches. A fighter flying off a rebound passes through
  the other fighter. Punching a battered opponent into a wall over and over
  now ends within about six hits.
- **Effects:**
  - sparks off the surface, and a small shake on hard rebounds;
  - the Void slow-motion zoom now accounts for rebounds;
  - the debug overlay labels ricocheting fighters.

**Where to tune it**

- `js/game/launch-bounce.js`: `LAUNCH_BOUNCE` (`enabled`,
  `minImpactSpeed`, `wallRestitution`, `floorRestitution`,
  `ceilingRestitution`, `maxBounces`, `stun`, `hitstop`, `hitstopSpeed`).
- A character can override any of these with its own `launchBounce` entry
  in `js/data/characters.js`; `enabled: false` turns bouncing off.
- `js/game/hit-fx.js`: `HIT_FX.bounce` for the rebound sparks and shake.

**Code:**
- `js/game/launch-bounce.js` decides the rebounds.
- `stepBody` in `js/game/physics.js` reports the speed it stopped
  (`impactVx` / `impactVy`).
- `js/game/character.js` applies the rebound's stun and freeze.

**Tests:** `tests/launch-bounce.test.mjs`, plus the attack2 spike tests in
`tests/attack2.test.mjs`.

## Jump, Shield, turning and joystick changes

Not a named update (it can become one if the owner names it). Asked for as:
remove the movement buttons inside the joystick (the ◀ ▶ arrows on its
base; the Left / Right mouvement buttons on top stay), remove the small
jump (the jump works as before, pressing slightly longer gives a higher
jump), shielding mid-air performs a slow fall, keep the double jump and the
quick fall, allow turning left and right while performing an action, and
put the Joystick layout's Charge on the left (to the left of the
joystick).

**What it changed**

- **Joystick touch layout:** the ◀ ▶ arrows drawn inside the stick are
  gone (a plain base and knob); the Left / Right mouvement Dash buttons
  above its top corners are unchanged. Charge (the down arrow) moved from
  under Jump to the left of the stick, level with its centre, and the
  lower-right cluster no longer rises for it. Classic Buttons is
  unchanged.
- **Higher jump (the short hop's replacement):** a tap is the normal jump.
  Jump still held 0.15 s after takeoff makes it rise on to 1.4× the height
  (about 237 units instead of 169), under lighter gravity from then to the
  apex, so there is no kick in speed. Decided once; the air jump, a hit,
  the apex or landing ends it. The air jump is never a higher one. Both
  CPUs let go of Jump inside the window, so their jumps are the normal
  ones, as before.
- **Air Shield slow fall:** with the Shield up in the air, a faster fall
  brakes to 200 units/s within 0.2 s and stays there; a rise is untouched,
  sideways it only drifts, and letting go falls normally again.
- **Turning during actions:** during an attack, the Shield or Charge, the
  held direction turns the fighter at once, as often as the player likes.
  Whatever the action does afterwards goes the new way: the hitbox, a step-in
  still to come, a shuriken not yet thrown, a Sphere Rush started from the
  Charge. A stun, a bind, a Dash and the Sphere Rush itself still hold the
  facing. The combat AI never holds a direction that would turn its own
  attack away from its opponent.
- The air jump and the fast fall are unchanged.

**Where to tune it** (`js/data/characters.js`, #0001)

- `movement`: `highJumpWindow` (0.15), `highJumpHeight` (1.4).
- `defense`: `slowFallSpeed` (200), `slowFallBrake` (6000). Left out (or
  0), a Shield falls as ever (`SHIELD_DEFAULTS` in `js/game/combat.js`).
- The Joystick layout's geometry: `--tc-stick-left`, `.tc-charge-down`,
  `.tc-dash-left` and `.tc-joystick` in `styles.css`.

**Code:** the higher jump (`Fighter.highJump`, `highJumpLift`), the slow
fall and `updateFacing` in `js/game/character.js`; the fall cap in
`stepBody` (`js/game/physics.js`); `jumpTapHold` in
`js/game/fighter-controller.js` and the mid-attack guard in
`CombatAIController.guard` (`js/game/combat-ai.js`); the layout in
`js/game/touch-controls.js`, `styles.css` and the Settings card, now in
`js/ui/settings-dialog.js` (it was `js/screens/settings-screen.js` before
Settings became a dialog).

**Tests:**
- the higher jump and the CPUs' jumps in `tests/movement.test.mjs`
- the slow fall in `tests/defense.test.mjs`
- turning in `tests/facing.test.mjs`, `tests/attack1.test.mjs`,
  `tests/attack2.test.mjs`, `tests/extra-attack.test.mjs`, and the CPU's
  guard in `tests/combat-ai.test.mjs`
- the Joystick layout in `tests/controls-ui.test.mjs`

## Roster reset

Not a named update (it can become one if the owner names it). Asked for
as: remove the fighters in roster slots 02 and 03 completely, keep #0001
whole but disable it for now, and leave zero playable fighters until a
future one is enabled. It deleted content and closed routes; no tuning of
#0001 or of any shared system changed.

**What it changed**

- **Removed:** both fighters' definitions in `js/data/characters.js` and
  every constant that only served them (their frame bases, art heights,
  playback rates, the underscore frame helper, the temporary movement
  baseline and the shared world-per-art-pixel size), their art folders
  under `assets/characters/`, their tests and the real-art helpers only
  those tests used, their translations (ability names and sprite credits,
  in English and French), their sprite credit group, the palm glyph only
  one of them used, and the obsolete `max` prompt file. Every comment,
  test and document that described them was rewritten generically. Git
  history still holds them; the current tree does not.
- **#0001 disabled, not removed:** `available: false`, in slot 01, with its
  art, animations, attacks, Charge replacements, Shield, Dash, abilities,
  tuning, body, credits, translations and engine tests all kept.
- **Playability:** `isPlayable`, `getPlayableCharacter` and
  `playableCharacters` (`js/data/characters.js`) tell a playable fighter
  from a definition that merely exists (`getCharacter`, still an identity
  lookup the engine and its tests build #0001 from).
- **Zero playable fighters handled everywhere:** startup names no fighter
  and preloads none (`initialSelection`, `App.preloadFighters`), and
  `App.loadCharacter` loads nothing for a fighter that is not playable;
  Home disables Play, Watch Mode and Practice Ground under a "No fighters
  available" note, focus on Discover; the roster locks every slot (#0001's
  too), selects nothing and keeps Confirm disabled; Select Fighter and
  Watch Mode's CPU screens focus Back; the Battle screen refuses a side
  that is not playable (disabled, removed, missing or unknown, from a stale
  selection or the route itself) before loading anything, with a
  "Fighter unavailable" error that offers only Back to Home; Practice
  Ground's default fighter is the first playable one
  (`practiceDefaultFighter`, never a fixed id), and with none it starts
  nothing and shows the same error.

**Where to change it**

- `available` on a definition in `js/data/characters.js`: `true` makes it
  playable again. Nothing else needs undoing.

**Code:** `js/data/characters.js`; `initialSelection`, `preloadFighters` and
`loadCharacter` in `js/core/app.js`; `HomeScreen.syncMatchActions` in
`js/screens/home-screen.js` (with `.home-note` in `styles.css`);
`FighterRoster` in `js/ui/fighter-roster.js`; `CharacterSelectScreen` in
`js/screens/character-select-screen.js`; `BattleScreen.enter` / `refuse`
in `js/screens/battle-screen.js`; `practiceDefaultFighter` and `enter` in
`js/screens/practice-screen.js`; the Back-only error in
`LoadingOverlay.showError` (`js/ui/overlays.js`); the new strings in
`js/core/i18n.js`.

**Tests:** the shipped state in `tests/empty-roster.test.mjs` (the data,
the removed fighters' absence, startup, the roster, Select Fighter and
Watch Mode's CPU screens, Practice Ground and Home); the Battle screen's
refusals in `tests/battle-screen.test.mjs`. The screen tests that need a
fighter to pick register test-only ones from `tests/test-fighters.mjs`
(#0001's definition under neutral ids, taken out again after each run).

### Later: #0001 re-enabled

#0001 is playable again: `available: true` in `js/data/characters.js`, the
one change "Where to change it" above names, and nothing else in the game
changed. With it, slot 01 is open on every roster and #0001 is what startup
preloads, Quick Battle's initial pick, both Watch Mode CPUs and the
Practice Ground default (all by being the first playable fighter, never a
fixed id). Home's match actions are open and its "No fighters available"
note hidden. Every zero-fighter path stays in the code and is still
tested.

**Tests:** `tests/empty-roster.test.mjs` checks the shipped state (#0001
alone playable and every default) and disables #0001 for its own run to
keep the zero-fighter checks; `tests/discover.test.mjs` does the same for
Discover. Where a screen test needs a fighter that exists but is not
playable, it registers `TEST_DISABLED` (`tests/test-fighters.mjs`, slot 07)
instead of #0001 (`tests/battle-screen.test.mjs`,
`tests/touch-layout.test.mjs`). The Watch Mode and Practice Ground tests
expect #0001 as the first playable fighter.

## Control and move codenames

History: this section records an earlier rename, and several of the names
it introduced (`uniqueba`, `ba1`, `ba2`, `maba1`, `maba2`, `cba1`, `cba2`,
CBA1 / CBA2) were themselves retired by the
[attack codename migration](#attack-codenames-and-loadouts) below. None of
them is current.

Not a named update, and it changes no behaviour or tuning: later work
renamed the gameplay controls and the moves to one canonical codename each.
The codenames are universal, the same for every character (`ACTIONS` and
`MOVES` in `js/config.js`); a character's own ability names are separate.
Old → new, as it was then:

| Old | New |
| --- | --- |
| `left` / `right` (controls) | `runLeft` / `runRight` |
| `leftPressed` / `rightPressed` | `runLeftPressed` / `runRightPressed` |
| `dashLeftPressed` / `dashRightPressed` | `mouvementLeftPressed` / `mouvementRightPressed` |
| `queueTouchDash` / `touchDash` | `queueTouchMouvement` / `touchMouvement` |
| `primary` (control), `throw` (attack and clip) | `uniqueba` |
| `special` | `transform` |
| `defense` (control) | `shield` |
| `action1` / `action2` | `ba1` / `ba2` |
| `midairBa1` / `midairBa2` | `maba1` / `maba2` |
| `ba1Clone` (summon) | `cba1` |
| `rasenRush` (technique) | `cba2` |
| CAB1 / CAB2 (cooldown labels) | CBA1 / CBA2 |

A character's `defense` entry (what the `shield` button does, with the
perfect Shield's `perfectWindow` and `perfectRearm`) kept its name, as
`movement` did; the art files kept theirs until the migration below. The
regression checks are in `tests/codenames.test.mjs`.

## Attack codenames and loadouts

Not a named update (it can become one if the owner names it), and it
changes no behaviour or tuning of #0001: the same inputs play the same
fight, step for step. Asked for (the `max` prompt and `codename_rule`) as a
real, repository-wide migration of the attack codenames, the art's file
names, the input fields, the character schema, the Charge mappings, the
spawned objects' names, the touch controls, the combat AI, the docs and the
tests, with no alias left for any old name. Where an entry above names a
field, it names where that field lives now.

**What it changed**

- **Attack codenames.** Every character's numbered attacks are `attack1`
  to `attack5`, each with its mid-air version `midair_attack1` to
  `midair_attack5`; the one optional special attack is `extra_attack`;
  `transform` stays reserved. `MOVES` gives each a neutral label ("Attack
  3", "Mid-air Attack 3", "Extra Attack") and nothing about its role.
- **Loadouts** (`js/data/loadout.js`): 2 to 5 numbered attacks, `attack1`
  and `attack2` always, contiguous; every numbered attack with a button has
  its mid-air version; with Charge replacements (`chargeReplacements`,
  replacing `chargedActions`) `attack3` is always Charge + `attack1` and
  `attack4` Charge + `attack2`, with no button of their own, and a fifth
  attack is a third button. `js/data/characters.js` refuses a definition
  that breaks a rule (`assertLoadout`, every problem named).
- **Controls.** The combat buttons are `extra_attack`, `transform` and
  `attack1` to `attack5` (`COMBAT_BUTTONS`), with `extra_attackPressed`,
  `attack1Pressed` … `attack5Pressed`; J, U and I keep their jobs, and O, M
  and `,` (gamepad LT, L3, R3) are `attack3` to `attack5`. A fighter only
  acts on the buttons its `actions` has; the input buffer covers all of
  them.
- **Touch controls.** Up to five numbered attack buttons in fixed slots (a
  honeycomb round Transform and Shield), as many as the fighter has
  buttons for; #0001 shows two. Custom layouts store `attack1` …
  `attack5` and `extra_attack` by id (a saved layout's old ids are simply
  left out: those controls go back to their default place).
- **Cooldowns** are keyed by the attack itself (`attack3`, `attack4`) and
  labelled **A3** / **A4** under the fighter.
- **Animation keys** follow the file codenames: `mouvment` (the Dash
  clip), `midair_hurt`, `charge` / `charge_loop` / `charge_release`,
  `prepshield` / `shielding` / `releaseshield` / `midair_shielding`,
  `attack4_form` … `attack4_whiff_release`, and for spawned objects
  `extra_attack_object` (projectile and art), `attack3_object` (the clone
  cloud), `attack4_object_build` / `_impact` / `_explosion` (the sphere).
- **Art.** Every file of #0001 renamed byte for byte to
  `<id>_<codename>_<frame>.png`, the unused Dodge frames included; the
  `frames(id, codename, count, from)` / `framePath` helpers build every
  path from the character's id.
- **Tests.** `basic-attack`, `basic-attack-2`, `charged-ba2` and `throw`
  became `attack1`, `attack2`, `attack4-sphere-rush` and `extra-attack`
  (`.test.mjs`); the loadout matrix is new (`tests/loadout-fighters.mjs`,
  `tests/loadout.test.mjs`); the sample fighter is now three attacks with
  Charge.

Old → new, for #0001 (the old names survive nowhere else):

| Old | New |
| --- | --- |
| `ba1` / `maba1` (button, moves, clips) | `attack1` / `midair_attack1` |
| `ba2` / `maba2` | `attack2` / `midair_attack2` |
| `cba1` (Charge + `ba1`, the Clone Attack summon) | `attack3` (Charge + `attack1`) |
| `cba2` (Charge + `ba2`, the Sphere Rush technique) | `attack4` (Charge + `attack2`) |
| `uniqueba` (button, move, clip) | `extra_attack` |
| `chargedActions` | `chargeReplacements` |
| `shuriken` (projectile and art) | `extra_attack_object` |
| `cloneCloud` | `attack3_object` |
| `rasenForm` … `rasenWhiffRelease` | `attack4_form` … `attack4_whiff_release` |
| `rasenSphereBuild` / `Impact` / `Explosion` | `attack4_object_build` / `_impact` / `_explosion` |
| `dash`, `midairHurt` (clips) | `mouvment`, `midair_hurt` |
| `chargeStart`, `chargeLoop`, `chargeRelease` (clips) | `charge`, `charge_loop`, `charge_release` |
| `shieldStart`, `shield`, `shieldRelease`, `midairShield` (clips) | `prepshield`, `shielding`, `releaseshield`, `midair_shielding` |
| CBA1 / CBA2 (cooldown labels) | A3 / A4 |
| `0001_1ba1.png`, `0001_midair1ba1.png`, `0001_throw1.png`, `0001_shuriken1.png` | `0001_attack1_1.png`, `0001_midair_attack1_1.png`, `0001_extra_attack_1.png`, `0001_extra_attack_object_1.png` |
| `0001_cloneav1.png`, `0001_rasen1.png`, `0001_prasen1.png` | `0001_attack3_object_1.png`, `0001_attack4_1.png`, `0001_attack4_object_1.png` |
| `0001_charge1.png`, `0001_chargea.png`, `0001_dash1.png` | `0001_charge_1.png`, `0001_charge_a.png`, `0001_mouvment_1.png` |
| `0001_hurt.png`, `0001_midairhurt.png`, `0001_releaseblock.png` | `0001_hurt_1.png`, `0001_midair_hurt_1.png`, `0001_releaseshield_1.png` |

Kept on purpose: the fighter states (`dash`, `shield`, `shieldRelease`,
`chargeRelease`), the Dash's tuning (`dashSpeed`, `dashTapWindow`,
`dashCost`, `dashCancelCost`), the generic engine concepts (`summons`,
`chargedTechniques`, `chargedCooldowns`, `chargedCooldownRate`, the Clone
class) and the `mouvementLeft` / `mouvementRight` touch controls, whose
spelling differs from the art's requested `mouvment` stem.

**Where to change it**

- The rules: `js/data/loadout.js` (`CHARGE_REPLACES`,
  `MIN_NUMBERED_ATTACKS`, `loadoutProblems`); the codenames:
  `NUMBERED_ATTACKS`, `COMBAT_BUTTONS`, `ACTIONS`, `MOVES` and
  `CONFIG.bindings` in `js/config.js`.
- The touch slots: `.tc-attack[data-slot]` in `styles.css` and
  `attackSlots` in `js/game/touch-controls.js`.

**Code:** `js/data/loadout.js`, `js/data/characters.js`, `js/config.js`,
`js/game/character.js` (`COMBAT_ACTIONS`, `tryChargeReplacement`, the clip
keys), `js/game/fighter-controller.js` (`HELD_CONTROLS`, `blankInput`),
`js/core/input-manager.js`, `js/game/combat-ai.js`,
`js/game/fighter-status.js` (`cooldownIndicators`, `cooldownLabel`),
`js/ui/mobile-abilities.js`, `js/game/touch-controls.js`,
`js/core/touch-layout.js`, `js/core/i18n.js`, `js/ui/icons.js` (`pip3` to
`pip5`).

**Tests:** `tests/loadout.test.mjs` (the matrix, the Charge routing, the
buffer, the keys, the CPU and every rule broken on purpose),
`tests/codenames.test.mjs` (the vocabulary, the files and a scan for every
retired name), the touch matrix and slot geometry in
`tests/controls-ui.test.mjs`, and the byte-for-byte checks of the renamed
art in `tests/charge.test.mjs`, `tests/defense.test.mjs`,
`tests/extra-attack.test.mjs`, `tests/clone.test.mjs` and
`tests/attack4-sphere-rush.test.mjs`.

## Adding a named update

When a new piece of work gets a name, add a row to the table and a section in
the same shape: what it added, where to tune it, the code, and the tests.
