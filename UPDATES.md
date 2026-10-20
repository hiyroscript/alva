# Named updates

Some larger pieces of work have a name, so they can be referred to later
("make the bounce update's rebounds softer", "undo part of the movement
update"). Each entry says what the update added, where its tuning lives, and
which tests cover it. Anything not listed under an update is unchanged by it.

This file is the project's history. The pull requests, commits, values and
descriptions below record what each change was when it was made; the
file paths in "Where to tune it", "Code" and "Tests" point at where those
things live now (see [Repository reorganization](#repository-reorganization)
for where they moved). The game as it is now is specified in
[`ALVA_SPEC.md`](./ALVA_SPEC.md) and explained in [`docs/`](./docs/README.md).

| Name | Pull request | Commit | In one line |
| --- | --- | --- | --- |
| **Movement update** | [#49](https://github.com/hiyroscript/alva/pull/49), then [#57](https://github.com/hiyroscript/alva/pull/57) ([second pass](#second-pass)) | `a34fbdd`, then `e75dbb6` | The shared movement feel, attack momentum and combo flow, first tuned on #0001 |
| **Effect update** | [#50](https://github.com/hiyroscript/alva/pull/50) | `487b9af` | Short hop, air jump, launch reaction, perfect Shield and hit effects |
| **Bounce update** | [#51](https://github.com/hiyroscript/alva/pull/51) | `f7c1e28` | Hard launches rebound off walls, floors and ceilings |

They were made in that order and build on each other: the effect update
assumes the movement update, and the bounce update assumes both.

## Movement update

The movement update reworked how fighters move and how attacks flow into
each other. MultiVersus was the reference for the feel only; every ALVA
mechanic is kept. It has three layers: the shared mechanics it built into
the Fighter, the per-fighter values those mechanics read, and the tuning
it gave #0001, the only fighter at the time. A [second pass](#second-pass)
later made it snappier and opened the combos further; the lists below are
the update as it stands now.

### The shared mechanics

What the update added to the movement and combat systems. They are the
Fighter's, for every fighter that has the data they read (today
[`js/game/fighters/movement.js`](./js/game/fighters/movement.js) and
[`js/game/fighters/fighter.js`](./js/game/fighters/fighter.js);
explained in [docs/systems/movement.md](./docs/systems/movement.md)):

- **Ground responsiveness:** acceleration to top speed, a natural stop
  under deceleration, and turns that brake hard (acceleration × the turn
  boost, never softer than letting go) before accelerating the other way.
- **Air steering:** steering bends the drift instead of replacing it, so
  a running jump carries its speed.
- **Fast fall:** Down held in the air while falling speeds the fall up to
  a set speed. (Down is now a direction only; see [Attack 3 and Attack 4
  on their own buttons](#attack-3-and-attack-4-on-their-own-buttons).)
- **Dash handoff:** after a Dash, the excess over top speed bleeds off
  (overspeed deceleration), so the Dash eases into the run instead of
  sliding on.
- **Attack momentum:** an attack keeps a share of the speed it started
  with (`momentum`, `airMomentum`; on the ground never more than that
  share of top speed), may be steered with a share of normal control
  (`control`, `airControl`), runs the rest down under its `friction`, and
  may step in by itself (`step`). An attack faces the direction held as it
  starts.
- **Combat input buffer:** an attack press that comes too early is kept
  for the fighter's `attackBuffer` and fires on the first step it can.
- **Hit-cancel:** an attack that connects (not a block or a whiff) can be
  cut short from its `hitCancel` time into another attack, a jump or, on
  the ground, a Dash.
- **Dash cancel:** that Dash costs `energy.dashCancelCost` instead of the
  plain `dashCost`, which is what keeps a hit → Dash → hit chase from
  looping. A Dash asked for during the hit's freeze comes out the step it
  ends.
- **Combat interruption:** a hit now interrupts the target's own attack.

### The per-fighter values

Each fighter supplies the numbers those mechanics read, in its own
definition (today `js/data/characters/<id>.js`; every field, its unit and
default in [docs/systems/movement.md](./docs/systems/movement.md); since
[universal movement](#universal-movement-and-momentum) these are one set of
values for every fighter):

- `movement`: `acceleration`, `deceleration`, `turnBoost`,
  `overspeedDeceleration`, `airAcceleration`, `airDeceleration`,
  `airTurnBoost`, `fastFallAcceleration`, `fastFallSpeed`, `attackBuffer`,
  `hitstunFriction`, `hitstunAirDrag`.
- `energy.dashCancelCost`: what a Dash cancel costs (the fighter's
  `dashCost` when it declares none).
- Each attack in `attacks`: `momentum` / `airMomentum`, `control` /
  `airControl`, `friction`, `step`, `hitCancel`, plus `hitstun`,
  `hitstop` and `cooldown`, which set its combo routes.

### #0001's tuning

The update was tuned on #0001, and these values and routes are #0001's
own (in [`js/data/characters/0001.js`](./js/data/characters/0001.js);
specified in [docs/characters/0001.md](./docs/characters/0001.md)). They
are not requirements for any other fighter: #0002, added later, has its
own profile and routes.

- **Movement:** top speed in about 0.08 s, a short natural stop, a full
  turn in about 0.12 s; aerials keep their drift and follow the stick
  almost fully.
- **Attacks:** a running attack1 slides on, attack2 steps in, and the
  Throw can back off. The buffer covers its Throw, attack1 and attack2
  presses, for 0.15 s.
- **Dash cancel:** 40 Energy instead of 15, so a full bar allows two and a
  third empties it (the Shield goes with it). That is what keeps its
  attack1 → Dash → attack1 from looping.
- **Combo routes:** at low Launch Point, attack1 → attack2, attack1 →
  attack1, attack2 → jump → midair_attack1 and midair_attack2 → land →
  attack1 all connect; attack1 → Dash → attack1 chases attack1's push up to
  about 85 Launch Point, and attack2 → jump → midair_attack1 carries on
  into a third aerial (through the air jump up to about 40). They break
  naturally as Launch Point grows.

**Where to tune it:** each fighter's `movement`, `energy` and `attacks`
(above); #0001's in `js/data/characters/0001.js`.

**Code:** `steer`, `steerAttack` and `attackStartSpeed` in
`js/game/fighters/movement.js` (they were `Fighter.moveHorizontal`,
`moveAttack` and `attackStartSpeed`, which now call them); `tryDash` and
`dashAsked` in `js/game/fighters/fighter.js`; `CombatState` and
`resolveEnergy` in `js/game/combat/combat-state.js`. The combat AI
(`js/game/ai/combat-ai.js`) predicts attack drift from the same data.

**Tests:** `tests/systems/movement.test.mjs`, `tests/systems/combo.test.mjs`
(the Dash cancel included), and the Dash cancel's cost in
`tests/systems/energy.test.mjs`, all with #0001's values;
`tests/systems/movement-profile.test.mjs` for the shared rules with any
values and every playable fighter.

### Second pass

Pull request [#57](https://github.com/hiyroscript/alva/pull/57), commit `e75dbb6`. Asked for as "the
movement update needs to feel better and combos to be even more open".
Values it changed in #0001's definition (the only fighter then), old →
new, for undoing any one of them:

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

It also added the Dash cancel itself, a shared rule (`Fighter.tryDash` accepts an attack
that may be cut short), and kept a Dash asked for during a hit's freeze
(`Fighter.dashAsked`, `frozenDash`). Setting `dashCancelCost` does not turn
Dash cancels off. To take them out, put back `canAct()` in place of
`canFollowUp()` in `tryDash`.

Measured on #0001, in steps of 1/60 s: top speed 6 → 5, a full turn 8 → 7, a full
air reversal 13 → 10, a fast fall from a jump's apex 11 → 9. The longest
true combo from 0 Launch Point is still 9 hits. At 40–60 it went from one
or two hits to a four-hit Dash chase.

### Later: #0001's damage cut

Not part of the update, but it moves the numbers above. #0001's damage was
lowered afterwards: attack1 and midair_attack1 5 → 3, attack2 and midair_attack2 10 → 5,
the Sphere Rush blast 15 → 10 (`damage` in `js/data/characters/0001.js`). Each
hit now pushes and launches a little less, so:

- From 0 Launch Point, attack1 → attack1 strings up to 6 hits (was 4) and the
  attack1 → Dash → attack1 chase up to 7 (was 5): the same three Dashes empty the
  bar, then plain BA1s carry on until the push ends it. Neither loops;
  `tests/systems/combo.test.mjs` allows 6 and 7.
- Each route's Launch Point limit moved up, by about 2 for the attack1 routes
  and about 5 for the attack2 routes: attack2 → jump → midair_attack1 now reaches
  about 65, and the third aerial through the air jump about 45.
- The combat AI weighs a hit's damage at `damage / 6` instead of `/ 10`
  (`hitValue` in `js/game/ai/combat-ai.js`), so it values its hits, and so its
  Clone Attack and Sphere Rush, as it did before the cut.

### Later: turning during actions

Not part of the update, but it changes one of its rules. "An attack faces
the direction held as it starts" still holds, and now a direction held
while the attack plays turns it too, at once, either way (the Shield as
well). So holding back during the Throw now turns it rather than
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

- Each fighter's definition (#0001's then; `js/data/characters/0001.js`):
  - `movement`: `airJumps`, `airJumpRatio` (`shortHopWindow` and
    `shortHopHeight` are gone, see below);
  - `launchReaction`: `stunPerThousand`, `maxStun`, `tumbleSpeed`,
    `steerAngle`;
  - `defense`: `perfectWindow`, `perfectRearm`.
- `js/game/rendering/hit-fx.js`: `HIT_FX` (`shake`, `flash`, `sparks`, `trail`,
  `lethal`).

**Code:** the jump and Shield timing in `js/game/fighters/fighter.js`;
`resolveLaunchReaction`, `resolveLaunchStun`, `steerLaunch` and the perfect
Shield in `CombatSystem.applyHit` (`js/game/combat/combat.js`); `HitEffects` and
`launchIsLethal` in `js/game/rendering/hit-fx.js`, drawn by `js/game/arena.js`.

**Tests:**
- `tests/systems/hit-fx.test.mjs`
- `tests/systems/launch-reaction.test.mjs`
- the air jump in `tests/systems/movement.test.mjs`
- perfect Shield in `tests/systems/defense.test.mjs`

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

- `js/game/combat/launch-bounce.js`: `LAUNCH_BOUNCE` (`enabled`,
  `minImpactSpeed`, `wallRestitution`, `floorRestitution`,
  `ceilingRestitution`, `maxBounces`, `stun`, `hitstop`, `hitstopSpeed`).
- A character can override any of these with its own `launchBounce` entry
  (`js/data/characters/<id>.js`); `enabled: false` turns bouncing off.
- `js/game/rendering/hit-fx.js`: `HIT_FX.bounce` for the rebound sparks and shake.

**Code:**
- `js/game/combat/launch-bounce.js` decides the rebounds.
- `stepBody` in `js/game/physics.js` reports the speed it stopped
  (`impactVx` / `impactVy`).
- `js/game/fighters/fighter.js` applies the rebound's stun and freeze.

**Tests:** `tests/systems/launch-bounce.test.mjs`, plus the attack2 spike tests in
`tests/fighters/0001/attack2.test.mjs`.

## Jump, Shield, turning and joystick changes

Not a named update (it can become one if the owner names it). Asked for as:
remove the movement buttons inside the joystick (the ◀ ▶ arrows on its
base; the Left / Right mouvement buttons on top stay), remove the small
jump (the jump works as before, pressing slightly longer gives a higher
jump), shielding mid-air performs a slow fall, keep the double jump and the
quick fall, allow turning left and right while performing an action, and
put the Joystick layout's down arrow on the left (to the left of the
joystick).

**What it changed**

- **Joystick touch layout:** the ◀ ▶ arrows drawn inside the stick are
  gone (a plain base and knob); the Left / Right mouvement Dash buttons
  above its top corners are unchanged. The down arrow moved from under
  Jump to the left of the stick, level with its centre, and the
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
- **Turning during actions:** during an attack or the Shield, the held
  direction turns the fighter at once, as often as the player likes.
  Whatever the action does afterwards goes the new way: the hitbox, a step-in
  still to come, a shuriken not yet thrown. A Sphere Rush faces the
  direction held as Attack 4 is pressed. A stun, a bind, a Dash and the
  Sphere Rush itself still hold the facing. The combat AI never holds a direction that would turn its own
  attack away from its opponent.
- The air jump and the fast fall are unchanged.

**Where to tune it** (each fighter's definition; the values are #0001's,
in `js/data/characters/0001.js`)

- `movement`: `highJumpWindow` (0.15), `highJumpHeight` (1.4).
- `defense`: `slowFallSpeed` (200), `slowFallBrake` (6000). Left out (or
  0), a Shield falls as ever (`SHIELD_DEFAULTS` in `js/game/combat/defense.js`).
- The Joystick layout's geometry: `--tc-stick-left`, `.tc-stick-down`,
  `.tc-dash-left` and `.tc-joystick` in `css/touch-controls.css`.

**Code:** the higher jump (`Fighter.highJump`, `highJumpLift`), the slow
fall and `updateFacing` in `js/game/fighters/fighter.js`; the fall cap in
`stepBody` (`js/game/physics.js`); `jumpTapHold` in
`js/game/fighters/fighter-controller.js` and the mid-attack guard in
`CombatAIController.guard` (`js/game/ai/combat-ai.js`); the layout in
`js/ui/touch-controls.js`, `css/touch-controls.css` and the Settings card, now in
`js/ui/settings-dialog.js` (it was `js/screens/settings-screen.js` before
Settings became a dialog).

**Tests:**
- the higher jump and the CPUs' jumps in `tests/systems/movement.test.mjs`
- the slow fall in `tests/systems/defense.test.mjs`
- turning in `tests/systems/facing.test.mjs`, `tests/fighters/0001/attack1.test.mjs`,
  `tests/fighters/0001/attack2.test.mjs`, `tests/fighters/0001/extra-attack.test.mjs`, and the CPU's
  guard in `tests/systems/combat-ai.test.mjs`
- the Joystick layout in `tests/interface/controls-ui.test.mjs`

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
  art, animations, attacks, Clone Attack and Sphere Rush, Shield, Dash, abilities,
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

- `available` on a definition (`js/data/characters/<id>.js` today):
  `true` makes it playable again. Nothing else needs undoing.

**Code:** `js/data/characters.js`; `initialSelection`, `preloadFighters` and
`loadCharacter` in `js/core/app.js`; `HomeScreen.syncMatchActions` in
`js/screens/home-screen.js` (with `.home-note` in `css/home.css`);
`FighterRoster` in `js/ui/fighter-roster.js`; `CharacterSelectScreen` in
`js/screens/character-select-screen.js`; `BattleScreen.enter` / `refuse`
in `js/screens/battle-screen.js`; `practiceDefaultFighter` and `enter` in
`js/screens/practice-screen.js`; the Back-only error in
`LoadingOverlay.showError` (`js/ui/overlays.js`); the new strings in
`js/localization/`.

**Tests:** the shipped state in `tests/integration/empty-roster.test.mjs` (the data,
the removed fighters' absence, startup, the roster, Select Fighter and
Watch Mode's CPU screens, Practice Ground and Home); the Battle screen's
refusals in `tests/interface/battle-screen.test.mjs`. The screen tests that need a
fighter to pick register test-only ones from `tests/fighters/fixtures/test-fighters.mjs`
(#0001's definition under neutral ids, taken out again after each run).

### Later: #0001 re-enabled

#0001 is playable again: `available: true` in its definition (`js/data/characters/0001.js` today), the
one change "Where to change it" above names, and nothing else in the game
changed. With it, slot 01 is open on every roster and #0001 is what startup
preloads, Quick Battle's initial pick, both Watch Mode CPUs and the
Practice Ground default (all by being the first playable fighter, never a
fixed id). Home's match actions are open and its "No fighters available"
note hidden. Every zero-fighter path stays in the code and is still
tested.

**Tests:** `tests/integration/empty-roster.test.mjs` checks the shipped state (#0001
alone playable and every default) and disables #0001 for its own run to
keep the zero-fighter checks; `tests/interface/discover.test.mjs` does the same for
Discover. Where a screen test needs a fighter that exists but is not
playable, it registers `TEST_DISABLED` (`tests/fighters/fixtures/test-fighters.mjs`, slot 07)
instead of #0001 (`tests/interface/battle-screen.test.mjs`,
`tests/interface/touch-layout.test.mjs`). The Watch Mode and Practice Ground tests
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
regression checks are in `tests/systems/codenames.test.mjs`.

## Attack codenames and loadouts

Not a named update (it can become one if the owner names it), and it
changes no behaviour or tuning of #0001: the same inputs play the same
fight, step for step. Asked for (the `max` prompt and `codename_rule`) as a
real, repository-wide migration of the attack codenames, the art's file
names, the input fields, the character schema, the attack3 and attack4
mappings, the spawned objects' names, the touch controls, the combat AI,
the docs and the tests, with no alias left for any old name. Where an entry
above names a field, it names where that field lives now. (attack3 and
attack4 were later given buttons of their own: see [Attack 3 and Attack 4
on their own buttons](#attack-3-and-attack-4-on-their-own-buttons).)

**What it changed**

- **Attack codenames.** Every character's numbered attacks are `attack1`
  to `attack5`, each with its mid-air version `midair_attack1` to
  `midair_attack5`; the one optional special attack is `extra_attack`;
  `transform` stays reserved. `MOVES` gives each a neutral label ("Attack
  3", "Mid-air Attack 3", "Extra Attack") and nothing about its role.
- **Loadouts** (`js/data/loadout.js`): 2 to 5 numbered attacks, `attack1`
  and `attack2` always, contiguous; every ordinary numbered attack has its
  mid-air version. `js/data/characters.js` refuses a definition that breaks
  a rule (`assertLoadout`, every problem named). (#0001's `attack3` and
  `attack4` were reached from `attack1` and `attack2` then; each is now a
  button of its own.)
- **Controls.** The combat buttons are `extra_attack`, `transform` and
  `attack1` to `attack5` (`COMBAT_BUTTONS`), with `extra_attackPressed`,
  `attack1Pressed` … `attack5Pressed`; J, U and I keep their jobs, and O, M
  and `,` (gamepad LT, L3, R3) are `attack3` to `attack5`. A fighter only
  acts on the buttons its `actions` has; the input buffer covers all of
  them.
- **Touch controls.** Up to five numbered attack buttons in fixed slots (a
  honeycomb round Transform and Shield), as many as the fighter has
  buttons for (#0001 showed two then; four now). Custom layouts store `attack1` …
  `attack5` and `extra_attack` by id (a saved layout's old ids are simply
  left out: those controls go back to their default place).
- **Cooldowns** are keyed by the attack itself (`attack3`, `attack4`) and
  labelled **A3** / **A4** under the fighter.
- **Animation keys** follow the file codenames: `mouvment` (the Dash
  clip), `midair_hurt`,
  `prepshield` / `shielding` / `releaseshield` / `midair_shielding`,
  `attack4_form` … `attack4_whiff_release`, and for spawned objects
  `extra_attack_object` (projectile and art), `attack3_object` (the clone
  cloud), `attack4_object_build` / `_impact` / `_explosion` (the sphere).
- **Art.** Every file of #0001 renamed byte for byte to
  `<id>_<codename>_<frame>.png`, the unused Dodge frames included; the
  `frames(id, codename, count, from)` / `framePath` helpers build every
  path from the character's id.
- **Tests.** The old attack test files became `attack1`, `attack2`,
  `attack4-sphere-rush` and `extra-attack` (`.test.mjs`); the loadout
  matrix is new (`tests/fighters/fixtures/loadout-fighters.mjs`, `tests/systems/loadout.test.mjs`);
  the sample fighter has three numbered attacks.

Old → new, for #0001 (the old names survive nowhere else):

| Old | New |
| --- | --- |
| `ba1` / `maba1` (button, moves, clips) | `attack1` / `midair_attack1` |
| `ba2` / `maba2` | `attack2` / `midair_attack2` |
| `cba1` (the Clone Attack summon) | `attack3` |
| `cba2` (the Sphere Rush technique) | `attack4` |
| `uniqueba` (button, move, clip) | `extra_attack` |
| `shuriken` (projectile and art) | `extra_attack_object` |
| `cloneCloud` | `attack3_object` |
| `rasenForm` … `rasenWhiffRelease` | `attack4_form` … `attack4_whiff_release` |
| `rasenSphereBuild` / `Impact` / `Explosion` | `attack4_object_build` / `_impact` / `_explosion` |
| `dash`, `midairHurt` (clips) | `mouvment`, `midair_hurt` |
| `shieldStart`, `shield`, `shieldRelease`, `midairShield` (clips) | `prepshield`, `shielding`, `releaseshield`, `midair_shielding` |
| CBA1 / CBA2 (cooldown labels) | A3 / A4 |
| `0001_1ba1.png`, `0001_midair1ba1.png`, `0001_throw1.png`, `0001_shuriken1.png` | `0001_attack1_1.png`, `0001_midair_attack1_1.png`, `0001_extra_attack_1.png`, `0001_extra_attack_object_1.png` |
| `0001_cloneav1.png`, `0001_rasen1.png`, `0001_prasen1.png` | `0001_attack3_object_1.png`, `0001_attack4_1.png`, `0001_attack4_object_1.png` |
| `0001_dash1.png` | `0001_mouvment_1.png` |
| `0001_hurt.png`, `0001_midairhurt.png`, `0001_releaseblock.png` | `0001_hurt_1.png`, `0001_midair_hurt_1.png`, `0001_releaseshield_1.png` |

Kept on purpose: the fighter states (`dash`, `shield`, `shieldRelease`),
the Dash's tuning (`dashSpeed`, `dashTapWindow`, `dashCost`,
`dashCancelCost`), the generic engine concepts (`summons`, the techniques
and their cooldowns, the Clone class) and the `mouvementLeft` /
`mouvementRight` touch controls, whose spelling differs from the art's
requested `mouvment` stem.

**Where to change it**

- The rules: `js/data/loadout.js` (`MIN_NUMBERED_ATTACKS`,
  `loadoutProblems`); the codenames:
  `NUMBERED_ATTACKS`, `COMBAT_BUTTONS`, `ACTIONS`, `MOVES` and
  `CONFIG.bindings` in `js/config.js`.
- The touch slots: `.tc-attack[data-slot]` in `css/touch-controls.css` and
  `attackSlots` in `js/ui/touch-controls.js`.

**Code:** `js/data/loadout.js`, `js/data/characters.js`, `js/config.js`,
`js/game/fighters/fighter.js` (`COMBAT_ACTIONS`, `tryAction`, the clip keys), `js/game/fighters/fighter-controller.js` (`HELD_CONTROLS`, `blankInput`),
`js/core/input-manager.js`, `js/game/ai/combat-ai.js`,
`js/game/rendering/fighter-status.js` (`cooldownIndicators`, `cooldownLabel`),
`js/ui/mobile-abilities.js`, `js/ui/touch-controls.js`,
`js/core/touch-layout.js`, `js/localization/`, `js/ui/icons.js` (`pip3` to
`pip5`).

**Tests:** `tests/systems/loadout.test.mjs` (the matrix, each button's move, the
buffer, the keys, the CPU and every rule broken on purpose),
`tests/systems/codenames.test.mjs` (the vocabulary, the files and a scan for every
retired name), the touch matrix and slot geometry in
`tests/interface/controls-ui.test.mjs`, and the byte-for-byte checks of the renamed
art in `tests/systems/defense.test.mjs`,
`tests/fighters/0001/extra-attack.test.mjs`, `tests/fighters/0001/clone.test.mjs` and
`tests/fighters/0001/attack4-sphere-rush.test.mjs`.

## #0002, the speedster

Not a named update (it can become one if the owner names it). Asked for
as: add character #0002 from a supplied sprite sheet, following the
`codename_rule` and `character_rule` files: abilities with real mechanics
based on the character's canon, not animations with plain damage; three
ordinary numbered buttons; credited to the sheet's DeviantArt page; and
never naming the character anywhere.

**What it added**

- **The fighter.** #0002 in roster slot 02, playable: 85 frames cut from
  the sheet into `assets/characters/0002/` (tight 1× crops, the green
  background made transparent, every file `0002_<codename>_<frame>.png`),
  drawn at #0001's size per art pixel (66 units tall). Speed Power 3, a
  1100 units/s Dash on its figure-eight art, a ground-only guard, no Land
  clip.
- **Its buttons:** three numbered attacks, each an ordinary attack with a
  button and its mid-air version (U, I, O; touch slots 1 to 3), plus the
  extra attack. Down only fast-falls in the air, as for every fighter.
- **Its moves**, each a mechanic: the One-Two (two strikes in one press),
  the Homing Attack (lock on, dash, re-aim every step, spring off the
  target with the air jump back; once per airtime), the Rapid Kicks (three
  holding kicks and a flinging finisher; a Shield stops the flurry), the
  Bounce Attack (plunge, spike, rebound off the ground or the target;
  twice per airtime), the Spin Attack (a roll that carries the running
  speed, as a smaller target, passing through what it bowls over; a Shield
  stops it dead), the Blue Tornado (a lift that carries its target up, then
  free fall), and the Whirlwind (a slow, piercing tornado that drags and
  lifts its target through five strikes).
- **Engine features they are built on, generic for any fighter:** strikes
  (`hits`), `carry`, attack `motion` (`homing`, `bounce`, `rise`, `roll`),
  `airUses`, `freeFall`, `passThrough`, attack `hurtboxes`, piercing
  projectiles (`pierce`, `finisher`), and a clip's
  `anchorY` (the feet, for art that reaches below them). No motion attack
  starts while its fighter is still flying from a launch.
- **The CPU** plays it from the data: each attack's reach swept along its
  motion (`attackReach`), the travel time of a moving strike before it can
  arrive (for #0001's CPU facing it too), ledge safety for rolls and
  plunges, and the Blue Tornado to recover (fast-falling first to end a
  launch). Ground reach now counts a
  roll's path for every fighter; #0001's attacks have no motion, so its
  own play is unchanged.
- **UI:** its touch buttons (Punch, Kick, a new Spin glyph, a new Whirlwind
  tornado glyph), French names, and a credit group, "#0002 sprite source",
  linked to the sheet's DeviantArt page (by the deviation's number).
- **Roster:** the test-only fighter Test A moved from slot 02 to slot 09,
  and only slot 03's removed fighter is still checked for absence.

**Balance, measured.** Tuned from seeded CPU-vs-CPU fights against #0001
(120 one-minute fights per level on Desert, Void falls #0001 : #0002):
Easy 11 : 2, Medium 42 : 6, Hard 26 : 18, Brutal 14 : 10. The first cut
was far stronger (falls about 40 : 9 at Hard), through three things now
fixed: its launches could be cancelled by its own aerials (the no-motion-
out-of-a-launch rule), its recovery was near endless (the Blue Tornado's
free fall, a shorter air dash), and its sideways launchers were too
strong for this stage's close side kill lines (the Spin Attack is Base
Launch 1). The #0002 mirror still scores fewer Void falls than #0001's.

**Where to tune it**

- `js/data/characters/0002.js`: each attack's damage, launch, timing,
  `hits`, `motion` fields (`range`, `speed`, `rebound`, `recoil`, `exit`,
  `fallSpeed`, `keep`, `maxSpeed`, `friction`), `airUses`, `freeFall` and
  `cooldown`; the tornado's `speed`, `lifetime`, `carry.lift`, `pierce` and
  `finisher`; `powers`, `movement` and the body.
- The motion kinds' defaults: `MOTION_DEFAULTS` in `js/game/combat/attacks.js`;
  the homing lock-on's allowance behind: `HOMING_BEHIND` in
  `js/game/fighters/fighter.js`.

**Code:** `createAttackDefinition` (`resolveStrikes`, `resolveMotion`),
`attackReach`, `strikeLive`, `CombatSystem.strike` and `carry` in
`applyHit` (`js/game/combat/attacks.js`, `js/game/combat/combat.js`); `startMotion`, `moveMotion`, `lockOn`,
`aimAt`, `motionContact`, `attackContact`, `airStartBlocked`,
`freeFall`, `hurtboxes` and `passingThrough` in `js/game/fighters/fighter.js`;
`pierce` / `finisher` in `js/game/combat/projectile.js`; `anchorY` in
`js/game/rendering/sprite-normalizer.js` and `js/ui/sprite-art.js`; `motionFits`,
`travelTime` and `steerHome` in `js/game/ai/combat-ai.js`;
`js/ui/credits.js`, `js/ui/icons.js`, `js/localization/`.

**Tests:** `tests/fighters/0002/fighter-0002.test.mjs` (the real PNGs, crops, scale and
anchors, its ordinary buttons, every move's mechanics, the engine rules and their
validation, the CPU); the roster, credits and translations in
`tests/integration/empty-roster.test.mjs`, `tests/interface/settings.test.mjs` and
`tests/interface/i18n.test.mjs`; the roster screens in
`tests/integration/practice-ground.test.mjs` and `tests/integration/watch-mode.test.mjs`.

## Attack 3 and Attack 4 on their own buttons

Not a named update (it can become one if the owner names it). Asked for
(the `max` prompt) as a complete removal of the held Down stance that used
to route #0001's Attack 1 and Attack 2 buttons to its Clone Attack and
Sphere Rush: its state, input, poses, routing, faster cooldowns and
faster Energy, AI, UI, translations, docs, tests and art. Attack 3 and
Attack 4 became buttons of their own; neither move changed.

**What it changed**

- **Loadouts** (`js/data/loadout.js`): every numbered attack a fighter has
  is a button of its own, pressed directly. A numbered button is an
  ordinary attack (`{ ground, air }`), a summon (`{ type: 'summon', id }`)
  or a technique (`{ type: 'technique', id }`), keyed by the attack it is;
  `attack1` and `attack2` are always ordinary, and a summon or technique is
  ground-only with no mid-air version. `actionType`, `specialAction` and
  `specialAttacks` read them; `describeLoadout` gives each button's `types`.
- **#0001:** `attack3` is `{ type: 'summon', id: 'attack3' }` (the Clone
  Attack) and `attack4` `{ type: 'technique', id: 'attack4' }` (the Sphere
  Rush), on O / M, gamepad LT / L3, and touch slots 3 and 4, named Clone
  Attack and Sphere Rush (French: Attaque du clone, Ruée sphérique) with
  the neutral `pip3` / `pip4` glyphs. Each is ground-only, free, on its own
  5-second cooldown (A3 / A4 under the fighter), and a press while it cools
  down, in the air, or when it cannot happen (no opponent, missing art)
  does nothing at all: no Punch or Kick in its place, nothing kept for
  later. A Sphere Rush faces the direction held as it is pressed. The
  summon leaves #0001 free at once, in its own idle.
- **Down** is the plain `down` control (S / ↓, D-pad down, left stick
  down, the touch down arrows): the fast fall and downward launch steering
  only. On the ground it is nothing: no state, no pose, no lock on
  movement or the Dash, no change to any button. Menus keep their own Down.
- **Energy** refills at its one passive `regen` rate; **cooldowns** recover
  in real time (`CombatState.abilityCooldowns`, updated with the rest of
  the combat state every step).
- **Renamed:** `js/game/combat/technique.js` (the `Technique` class) and the
  characters' `techniques`; `CombatState.abilityCooldowns`; the CPU's
  `specials`; the difficulty trait `specials`; the touch control `down`
  (`.tc-stick-down`, `--tc-down`, `.sp-down`). A saved touch layout's old
  ids are dropped by the sanitizer: that control goes back to its default
  place.
- **Removed:** the four pose PNGs of the stance and their clips, its state
  and release pose, its stat block (`stats`), its Energy rate, #0002's
  opt-out flag, and the CPU's planner, opening and punish logic for it.
- **The CPU** presses Attack 3 and Attack 4 directly when they fit: the
  Clone Attack at an opponent likely to stay put, the Sphere Rush when in
  line for it, worth less the closer the opponent could strike first while
  the sphere forms (`specialOptions`, `specialValue`). Its Dash now lets go
  of a direction it was already running in before its first tap, so a
  Dash out of a run registers.

**Where to tune it** (`js/data/characters/0001.js`)

- `summons.attack3` and `techniques.attack4`: unchanged, `cooldown`
  included.
- `mobileAbilities.attack3` / `attack4`: the touch names and glyphs.
- The CPU's judgement of them: the `specials` trait in
  `js/data/difficulty.js`.

**Code:** `js/data/loadout.js`; `Fighter.tryAction`, `trySpecial`,
`trySummon`, `tryTechnique` and the fast fall in `js/game/fighters/fighter.js`;
`js/game/combat/technique.js`; `CombatState.update` and `updateEnergy` in
`js/game/combat/combat-state.js`; `cooldownIndicators` in `js/game/rendering/fighter-status.js`;
`readMoveset`, `specialOptions`, `specialValue` and `actDash` in
`js/game/ai/combat-ai.js`; `js/ui/touch-controls.js`,
`js/core/touch-layout.js`, `js/core/input-manager.js`, `js/config.js`,
`js/localization/`, `js/ui/settings-dialog.js` and the `css/` parts.

**Tests:** `tests/systems/down.test.mjs` (Down as a direction only),
`tests/systems/loadout.test.mjs`, `tests/fighters/0001/clone.test.mjs`,
`tests/fighters/0001/attack4-sphere-rush.test.mjs`, `tests/systems/fighter-status.test.mjs`,
`tests/systems/energy.test.mjs`, `tests/systems/combat-ai.test.mjs`,
`tests/interface/controls-ui.test.mjs`, and the repository-wide scan for the
retired mechanic in `tests/systems/codenames.test.mjs`.

### Later: the Clone Attack's summoning startup

Not part of this change, but it alters one line of it: the summon no
longer leaves #0001 free at once. He first performs a short summoning
startup, and the touch buttons no longer show glyphs for Attack 3 and
Attack 4. See [Sprite buttons and the summoning
startup](#sprite-buttons-and-the-summoning-startup). The stance stays
removed: only four of its poses came back, renamed for Attack 3.

## Sprite buttons and the summoning startup

Not a named update (it can become one if the owner names it). Asked for
(the `max` prompt) as: the fighters' touch action buttons show frames of
their own animations instead of white glyphs (Run / movement, Shield and
Transform keep theirs), and #0001's old held Down stance art is recovered
from history and repurposed as a visible startup for Attack 3, so #0001
summons the clone before it appears. The stance itself stays removed.

**What it changed**

- **Touch art.** The extra attack, attack1 to attack5 and Jump show one
  frame of the fighter's own art, in its own colours: an image element
  (`.tc-sprite-icon`, empty alt, hidden from assistive technology, no
  pointer events) fitted whole inside the round button (70%, aspect kept,
  crisp pixels). Each fighter picks its frames in `mobileAbilities` as
  `preview: { animation, frame }` (a clip of its own, a frame counted from
  0); Jump has an entry with no label, so it keeps its name. #0001:
  `extra_attack_2` (the release), `attack1_2`, `attack2_5`,
  `attack3_summon_3` (the hand seal), `attack4_5` (the rush), `jump_2`.
  #0002: `extra_attack_6` (the tornado sent off), `attack1_4`, `attack2_2`,
  `attack3_5`, `jump_1`. The art follows Player 1's fighter and is swapped
  in place (`TouchControls.showArt`): the same buttons and images, the same
  `data-action`, slots, custom layouts, held state and names. A button
  with nothing to show (no fighter yet, a preview naming no frame, a file
  that fails to load) falls back to its neutral glyph (ring, pips, jump
  arrow) and keeps its name and input. Left / Right / Down, the joystick,
  the Dash buttons, Shield and the reserved Transform star are unchanged.
  The fighter glyphs that became unused (`shuriken`, `punch`, `kick`,
  `spin`, `tornado`) are gone from `js/ui/icons.js`.
- **The summoning startup.** A summon may name `startupAnimation`, an
  owner clip played once from the accepted press before the summon is
  sent out (`Fighter.pendingSummon`, visual state `summon`, between
  `bound` and `attack`). The fighter stands still (speed 0), keeps its
  facing and can do nothing else; the cooldown runs from the press. A hit
  (on its own step, straight to the hurt pose), lost ground, the Void, a
  reset or respawn, a Practice Ground fighter or CPU change, the arena
  going, or a target no longer in play cut it short: no clone, never
  another target, the cooldown spent. Without `startupAnimation` a summon
  is sent out on the press, as before.
- **#0001's Clone Attack** names `startupAnimation: 'attack3_summon'`:
  `0001_attack3_summon_1` to `_4` at 10 fps, 0.4 s (24 steps), the clone
  queued on the step after the last pose. The four files are the stance's
  old poses, byte for byte from commit `538d73a`: its two startup poses
  as `_1` and `_2`, its two held poses as `_3` and `_4`. The clone's own
  smoke (`attack3_object`), placement, attack, timing and its 5 s cooldown
  are unchanged.
- **The CPU** still presses Attack 3 directly; the startup holds it as it
  holds a player, and its lead for the summon counts the startup
  (`readMoveset`). Nothing else in its play changed.

**Where to tune it** (`js/data/characters/0001.js`)

- The summoning pose: `ATTACK3_SUMMON_FPS` (10) and
  `summons.attack3.startupAnimation` (remove it for the old immediate
  summon).
- Each button's picture: `mobileAbilities.<button>.preview` per fighter
  (`animation`, `frame` from 0).
- The picture's size in its button: `.tc-sprite-icon` in `css/touch-controls.css`.

**Code:** `trySummon`, `finishSummon`, `cancelSummon`, `canAct`,
`updateFacing`, `updateState` and `animationFor` in
`js/game/fighters/fighter.js`; `startupAnimation` and `summonProblem` in
`js/game/combat/summon.js`; the hit in `CombatSystem.applyHit`
(`js/game/combat/combat.js`); `detachFromPlay` and `destroy` in
`js/game/arena.js`; `setFighter` and `removeCPU` in `js/game/practice.js`;
`readMoveset` in `js/game/ai/combat-ai.js`; `previewFrame`, `mobileAbility`,
`jumpArt` and `SPRITE_BUTTONS` in `js/ui/mobile-abilities.js`;
`setCharacter`, `showArt` and `spriteFailed` in
`js/ui/touch-controls.js`; `js/ui/icons.js`; `css/touch-controls.css`.

**Tests:** `tests/fighters/0001/summon-startup.test.mjs` (the restored bytes, the clip,
the press, the poses in order, the commitment, every interruption, the
refusals, a summon with no startup, the CPU); `tests/fighters/0001/clone.test.mjs` (the
clone after the startup); `tests/interface/controls-ui.test.mjs` (the art, Jump,
fallbacks, the glyphs that stay, names in English and French, both
fighters, multi-touch, the editor); `tests/interface/touch-layout.test.mjs`,
`tests/integration/practice-ground.test.mjs` and `tests/interface/battle-screen.test.mjs` (art
following Player 1, never the CPU, layouts kept);
`tests/systems/codenames.test.mjs` (the new files and clip, and a check that the
retired mechanic's names are still caught).

## Repository reorganization

Not a named update (it can become one if the owner names it), and it
changes no behaviour or tuning: the same inputs play the same fight, step
for step. Asked for (the `max` prompt) as a reorganization of the code,
documentation, styles and tests around a universal character system, so
that shared mechanics no longer read as #0001's and each fighter's own
data and documentation stand on their own. `character_rule` was not
touched.

**What it changed**

- **Fighter definitions:** each fighter's definition moved out of
  `js/data/characters.js` into a module of its own
  (`js/data/characters/0001.js`, `0002.js`, with their own constants;
  `framePath` / `frames` in `js/data/characters/helpers.js`).
  `js/data/characters.js` is the registry: the same `CHARACTERS` array
  (mutable, one instance), `getCharacter`, `isPlayable`,
  `getPlayableCharacter`, `playableCharacters`, `characterFramePaths`,
  and `framePath` / `frames` re-exported.
- **`js/game/` by responsibility:** `fighters/`, `combat/`, `ai/` and
  `rendering/`. `combat.js` was split into `combat/attacks.js` (attack
  schema), `combat/defense.js`, `combat/combat-state.js` (`CombatState`,
  `CooldownTimers`, `resolveEnergy`) and `combat/combat.js`
  (`CombatSystem`, launch reaction, `worldBox`). The movement arithmetic
  moved from the Fighter into `fighters/movement.js` (the Fighter keeps
  its state and step order and calls it). `readMoveset` moved into
  `ai/moveset.js`. The DOM HUD and touch controls moved to `js/ui/`.
- **Localization:** `js/core/i18n.js` became `js/localization/i18n.js`,
  with one string table per language in `js/localization/strings/`.
- **Styles:** `styles.css` became the ordered parts in `css/`, linked
  from `index.html`; concatenated, they are byte for byte the old file.
- **Tests:** grouped into `tests/systems/`, `tests/fighters/<id>/`,
  `tests/fighters/fixtures/`, `tests/interface/`, `tests/integration/`
  and `tests/helpers/`; the harness names its default fighter
  (`DEFAULT_CHARACTER`) and adds `harnessFor(character)`. New:
  `tests/systems/movement-profile.test.mjs`,
  `tests/integration/roster-matrix.test.mjs`,
  `tests/interface/stylesheets.test.mjs`.
- **Documentation:** a slimmer README; `docs/` (architecture, systems,
  characters, gameplay, development); the product specification's
  fighter-specific sections moved into `docs/characters/0001.md` and
  `0002.md`, which it names as part of itself; the movement update above
  rewritten into its shared mechanics, the per-fighter values and #0001's
  tuning. Stale statements corrected along the way: two selectable roster
  slots (not one), a summon with nobody to appear behind does nothing (it
  does not fall back to attack1), the touch layout editor shows every
  numbered button, `dashCancelCost` defaults to the fighter's `dashCost`,
  and the repository's name.
- **`codename_rule`:** the mid-air dodge it described for fighters with
  no mid-air Shield frames (its `<id>_dodge_<frame>` art, 25 Energy, a
  horizontal launch of 1) was removed at the owner's request. The game
  never implemented it, so nothing plays differently: a fighter with no
  mid-air Shield frames has no Shield in the air, and the button does
  nothing there.

Where things moved:

| Before | Now |
| --- | --- |
| `js/data/characters.js` (definitions) | `js/data/characters/0001.js`, `0002.js`, `helpers.js` |
| `js/game/character.js` | `js/game/fighters/fighter.js` (+ `fighters/movement.js`) |
| `js/game/fighter-controller.js` | `js/game/fighters/fighter-controller.js` |
| `js/game/combat.js` | `js/game/combat/attacks.js`, `defense.js`, `combat-state.js`, `combat.js` |
| `js/game/projectile.js`, `technique.js`, `launch-bounce.js` | `js/game/combat/` |
| `js/game/clone.js` | `js/game/combat/summon.js` |
| `js/game/combat-ai.js` | `js/game/ai/combat-ai.js` (+ `ai/moveset.js`) |
| `js/game/camera.js`, `sprite-animator.js`, `sprite-normalizer.js`, `hit-fx.js`, `shield-fx.js`, `fighter-status.js` | `js/game/rendering/` |
| `js/game/hud.js`, `js/game/touch-controls.js` | `js/ui/` |
| `js/core/i18n.js` | `js/localization/i18n.js`, `strings/en.js`, `strings/fr.js`, `format.js` |
| `styles.css` | `css/*.css` |
| `tests/*.test.mjs`, `tests/*.mjs` | `tests/<group>/...` |

**Tests:** the whole suite, unchanged in what it checks (its source scans
widened to the new files), plus the new tests above; seeded CPU-vs-CPU
traces for every pairing compared byte for byte against the code before
the move.

## #0001 replaced

Not a named update (it can become one if the owner names it). Asked for
as: read `character_rule` and rework #0001 from scratch, deleting
everything of the old #0001 (its images included) and replacing it with a
new character from a supplied sprite sheet: abilities with real mechanics
based on the character's canon, not animations with plain damage;
credited to the sheet's DeviantArt page; never naming the character
anywhere. `character_rule` was not touched.

**What it removed.** The first #0001's 92 frames, its definition (the
Punch, the kunai slash, the Kick, the airborne kick, the Shuriken, the
Clone Attack with its summoning startup, the Sphere Rush, a Shield with
raise and lower poses), its tests (`tests/fighters/0001/`), its touch
names and French ability names, and its sprite credits (the Jump Ultimate
Stars material from The Spriters Resource). The technique runtime's rush
form (form, dash, confirm, wait, explode; binds and ticks) went with the
only technique built on it. Git history still holds them all.

**What it added**

- **The fighter.** #0001, the limitless sorcerer, in roster slot 01,
  playable: 74 frames cut from the sheet into `assets/characters/0001/`
  (tight 1× crops, the flat navy background (33, 31, 63) made transparent,
  nothing redrawn or recoloured, every file `0001_<codename>_<frame>.png`),
  drawn at the roster's art-pixel size (a 63-pixel idle, about 107 units
  tall). Jump Power 2, Speed Power 2, a 950 units/s Dash, one air jump.
- **Its buttons:** five numbered attacks, each a button of its own (U, I,
  O, M, `,`; touch slots 1 to 5): three ordinary attacks with mid-air
  versions and two techniques, plus the extra attack.
- **Its moves**, each a mechanic: the Jab and the Floating Straight
  (standing on the air while it strikes), Red (a repelling orb: pushes,
  shoves a Shield back, turns the other fighter's projectiles around,
  theirs no longer), the Red Kick (a lock-on flying kick), Maximum Blue (an
  attracting orb that drags its target in and grinds it), Blue (a palm
  that yanks an opponent in), Unlimited Void (a technique: a sure hit round
  #0001 that no Shield stops and that paralyzes for 1.8 s), Hollow Purple
  (a technique: a chanted sphere that no Shield stops, erasing projectiles
  and flying through everything), the High Kick (its launcher, hovering in
  the air), and Infinity (a Shield all round it that stalls the blows it
  blocks and all but stops its fall).
- **Engine features they are built on, generic for any fighter:** the
  `hover` attack motion; pulls on attacks and projectiles
  (`js/game/combat/pull.js`); projectiles that `repel` or `erase` and
  `clashProjectiles` to settle two that meet; the shared hit effects
  `unblockable`, `paralyze` (a timed hold that replaces binds, ended by any
  launch) and `blockPush` (`js/game/combat/hit-effects.js`); a Shield's
  `stall`; and the technique runtime's one form is now the cast (stand
  committed, then release a projectile, a burst round the fighter, or
  both).
- **The CPU** plays it from the data: a pulling attack's reach is its
  box widened to the pull's circle, a projectile is worth what its hit is
  (every strike of a piercing one) and reaches as far as its pull, a
  paralysis counts as the free hits it opens (and a paralysed opponent as
  an opening), an unblockable technique is a smaller risk against a raised
  Shield, and it never shields against a hit no Shield stops.
- **UI:** its touch buttons (each move's own frame, the orbs for Red,
  Maximum Blue and Hollow Purple), French names, and a credit group,
  "#0001 sprite source", linked to the sheet's DeviantArt page by the
  deviation's number alone (so the address names nothing), with the
  credits the sheet itself gives. Its translation keys are
  `credits.sprites0001.*`, as every other fighter's credit group is named.

**Balance, measured.** Tuned from seeded CPU-vs-CPU fights against #0002
(200 one-minute fights per level on Desert, Void falls #0001 : #0002).
The first cut was far too strong (over 40 fights per level: 0 : 49 at
Medium, 1 : 56 at Hard, 0 : 58 at Brutal; #0002 could not get past Red,
and the High Kick launched too fast and too hard). Red became a push (2, Base Launch 1, 600 units/s for 0.5 s, a
1.1 s cooldown), the High Kick a telegraphed launcher (4, landing a
quarter of a second in, a longer recovery), Maximum Blue a trap (3.5 s
cooldown, a 120-unit pull, three strikes), the Jab, Floating Straight,
Red Kick and Blue a point lighter, and Infinity's stall 0.25 s. Now: Easy
121 : 4, Medium 90 : 60, Hard 63 : 66, Brutal 61 : 82. At Easy #0002's
Whirlwind carries a slow-reacting #0001 off the stage far more often than
the other way round.

**Where to tune it**

- `js/data/characters/0001.js`: each attack's damage, launch, timing,
  hitbox, `pull`, `motion` and `cooldown`; Red's, Maximum Blue's and Hollow
  Purple's `speed`, `lifetime`, `pull`, `pierce`, `finisher`,
  `blockPush`, `repel`, `erase` and `unblockable`; Unlimited Void's burst
  box and hit (its `paralyze`); each technique's cooldown and clip rates
  (`FPS_0001`); Infinity's `stall` and slow fall; `powers`, `movement`,
  `energy` and the body.
- The capabilities' defaults: `MOTION_DEFAULTS` in
  `js/game/combat/attacks.js`, the hit effects' in
  `js/game/combat/hit-effects.js`, the Shield's in
  `js/game/combat/defense.js`.

**Code:** `js/data/characters/0001.js`; `js/game/combat/hit-effects.js`,
`js/game/combat/pull.js`; `hover` and `resolvePull` in
`js/game/combat/attacks.js`; `repel`, `erase` and `clashProjectiles` in
`js/game/combat/projectile.js`; the cast form in
`js/game/combat/technique.js`; `paralyze` in
`js/game/combat/combat-state.js`; the hit effects and the stall in
`CombatSystem.applyHit` (`js/game/combat/combat.js`); `stall` in
`js/game/combat/defense.js`; the step order (pulls, clashes) in
`js/game/arena.js`; `shotValue`, `hitValue` and `specialOptions` in
`js/game/ai/combat-ai.js`; `js/ui/credits.js`, `js/localization/`.

**Tests:** `tests/fighters/0001/` (`fighter-0001`: the real PNGs, crops,
scale, anchors, data and names; `moves-0001`: every move's mechanic;
`combos-0001`: its routes; `cpu-0001`: the CPU playing and facing it);
the shared capabilities on bespoke data in
`tests/systems/hit-effects.test.mjs`, `pull.test.mjs`,
`projectile-clash.test.mjs` and `technique.test.mjs`; every system,
interface and integration test that used the first #0001's moves adapted
to the new ones.

## Deflect and air dash

Not a named update (it can become one if the owner names it). Asked for
in `max`: no fighter Shields in the air any more, and the Shield button
in the air is a Deflect, an aerial strike that turns projectiles back; a
mid-air mouvment of each fighter's own beside its Dash; and #0001's three
projectiles spinning very fast.

**What it removed.** The air Shield: #0001's held Infinity in the air
(`midair_shielding`, its one frame `0001_midair_shielding_1.png`, deleted)
and its slow fall (`slowFallSpeed` 90, `slowFallBrake` 6000), and the
defense schema's `airAnimation`, `slowFallSpeed` and `slowFallBrake`
(now refused if declared). #0002's `airAnimation: null` went with it.
`midair_shielding` is a retired codename.

**What it added**

- **The Deflect** (`js/game/combat/deflect.js`, `Fighter.tryDeflect`):
  a fresh Shield press in the air starts the fighter's `deflect`, an
  attack definition like any other (its own clip, phases, hitbox, stuns,
  cooldown), never a Shield (no block, perfect Shield, Energy, blockstun,
  stall, Shield look or slow fall). Every Deflect strikes for 3 at Base
  Launch 2, the shared rule (`DEFLECT_DAMAGE`, `DEFLECT_BASE_LAUNCH`); a
  fighter cannot author other values. Held, the button starts nothing
  more; a press it cannot use is not kept. It may cut short an attack that
  hit, as any attack may, and wins over an attack button pressed with it.
- **Turning projectiles back** (`deflectProjectiles`, an attack
  capability, and `CombatSystem.deflectProjectiles`): while a Deflect is
  live, every other fighter's projectile its box meets is turned back
  before any projectile strikes on that step, by the repel's own
  `Projectile.turnBack`: the deflecting fighter's from then on, flying
  away from it, its strikes starting over (so it can strike its thrower),
  the rest of its lifetime kept; the same projectile, never destroyed for
  it, whatever it is.
- **The air dash** (`movement.airDashSpeed`, `movement.airDashUses`, the
  `midair_mouvment` clip, `Fighter.tryAirDash` behind `tryMouvment`): the
  same requests that Dash on the ground air dash in the air, flat across
  at its own speed for one pass of its clip, no fall, then normal air
  physics at no more than top speed. One per airtime for both fighters,
  given back on landing and by a hit. The Dash's costs, cancel and
  restrictions, and never while flying from a launch or in free fall.
- **Projectile spin** (`rotationSpeed`, degrees per second, 0 by
  default; `projectileAngle`, `Projectile.angle` / `renderAngle`,
  `drawCenteredFrame`'s rotation): art only, from the projectile's own age.
  #0001's Red, Maximum Blue and Hollow Purple spin at 2160 (six turns a
  second). A projectile is now drawn at the art scale of the fighter whose
  art it is, whoever owns it.
- **The CPU** (`readMoveset`: `groundShield`, `deflect`, `dash`,
  `airDash`; `deflectCatches`, `airDashHome`): it never holds the Shield in
  the air, Deflects a shot in the air when its Deflect would be live as the
  shot arrives (a careful level watching such a shot every step), uses the
  Deflect as an aerial strike too, air dashes home from off the stage and
  in the air to close in.
- **The touch Shield button** is named and drawn **Deflect**
  (`touch.deflect`, `ICONS.deflect`) while the fighter is in the air.
- **Art**, cut from the two supplied sheets at 1x with their flat
  backgrounds made transparent, nothing redrawn. #0001: `deflect` 1-4, the
  last row's arm across the body, palm out, sweep over the head with its
  trail and arm raised; `midair_mouvment` 1, the sheet's one flying leap
  (the Dash's drawing, its own file). #0002: `deflect` 1-3, the sheet's
  aerial swat (its first frame the same drawing as the fall pose);
  `midair_mouvment` 1, its stretched-out flying pose.

**Tuning chosen.** #0001's Deflect: 15 fps, startup 1 frame, active 2,
recovery 2 (1/3 s), a box from the waist to well over the head out to 50
units (`{ x: 6, y: -118, w: 44, h: 98 }`), upward, hitstun 0.32, a 0.3 s
cooldown. #0002's: 20 fps, 1 / 2 / 2 frames (1/4 s), from the head to the
knees out to 38 units (`{ x: 6, y: -64, w: 32, h: 56 }`), sideways,
hitstun 0.3, a 0.3 s cooldown. Each box covers the front of the body its
art sweeps, so a Deflect catches a shot before it reaches the body. Air
dashes: #0001 950 units/s, #0002 1100, each 0.2 s (one 5 fps frame).

**Balance, measured.** Seeded CPU-vs-CPU fights on Desert, up to one
minute each, 200 per level (100 each way round), Void falls #0001 :
#0002. Before (the same fights on the code before the change): Easy
97 : 2, Medium 93 : 58, Hard 49 : 70, Brutal 60 : 94. After: Easy 109 : 1,
Medium 111 : 60, Hard 81 : 45, Brutal 82 : 93. #0001 falls more often:
it lost its air Shield, and #0002's Deflect turns its orbs back at it.
With #0002's projectile catching off, Hard is 65 : 66; with neither
fighter's Deflect, 72 : 60; with neither air dash, 83 : 50. Counts this
size vary by up to about twenty between seed ranges (two other ranges:
Hard 91 : 43 and 88 : 39, Brutal 90 : 90 and 104 : 75). Left as measured:
the levers are the Deflects' windows and boxes in the definitions and the
CPU's Deflect choice in `chooseDefense`.

**Where to tune it**

- `js/data/characters/0001.js` and `0002.js`: each `deflect` (phases,
  `hitbox`, `directionalLaunch`, stuns, `cooldown`, `airMomentum`,
  `airControl`, `airUses`), `FPS_*.deflect` and `.midair_mouvment`,
  `movement.airDashSpeed` / `airDashUses`, `ORB_SPIN_0001`.
- `js/game/combat/deflect.js`: `DEFLECT_DAMAGE`, `DEFLECT_BASE_LAUNCH`.
- `js/game/ai/combat-ai.js`: the Deflect option's weight in
  `chooseDefense`, `airDashHome`, the airborne air dash option in
  `options`.

**Code:** `js/game/combat/deflect.js`; `deflectProjectiles` in
`js/game/combat/attacks.js` and `CombatSystem.deflectProjectiles` in
`js/game/combat/combat.js`; `rotationSpeed`, `projectileAngle` and
`turnBack` in `js/game/combat/projectile.js`; `drawCenteredFrame` in
`js/game/rendering/sprite-normalizer.js`; `Arena.drawProjectile`; the
ground-only Shield in `js/game/combat/defense.js`; `tryDeflect`,
`startAttack`, `tryMouvment`, `tryAirDash`, `airDashUses` and the step in
`js/game/fighters/fighter.js`; `js/game/ai/moveset.js`,
`js/game/ai/combat-ai.js`; `js/ui/touch-controls.js`, `js/ui/icons.js`,
`js/localization/strings/`; both definitions and their new frames.

**Tests:** `tests/systems/deflect.test.mjs`, `air-mouvment.test.mjs`,
`projectile-spin.test.mjs` (new); `defense.test.mjs` (no Shield in the air
for either fighter, the refused fields), `dash.test.mjs`, `combo.test.mjs`
(the air dash cancel), `movement.test.mjs`, `codenames.test.mjs`,
`combat-ai.test.mjs`, `sample-fighter.test.mjs`,
`tests/fighters/0001/`, `tests/fighters/0002/`,
`tests/interface/controls-ui.test.mjs` (the Deflect label) and
`tests/integration/roster-matrix.test.mjs` updated.

## Universal movement and momentum

Not a named update (it can become one if the owner names it). Asked for in
`max`: make Alva feel fast, fluid and momentum-driven, with combat and
movement flowing into each other; give every fighter exactly the same
baseline movement (no fighter faster because of its lore); add a triple
jump; keep momentum through every legal change of action; make attacks and
animations faster while keeping the art and the gameplay in step.

**The rule.** All fighters share universal baseline locomotion. Character
identity changes the moveset, not run/jump/Dash fundamentals.

**What it removed.**

- Each fighter's `movement` profile (`js/data/characters/<id>.js`). #0001
  had acceleration 4200, air acceleration 3000, a 950 Dash and air dash;
  #0002, "the speedster", acceleration 4800, air acceleration 3200 and an
  1100 Dash and air dash. Both had deceleration 4200, turn boost 2.6,
  overspeed deceleration 6000, air drag 380, air turn boost 2.0, fast fall
  12000 / 1400, one air jump at 0.9, coyote 0.1, jump buffer 0.12, attack
  buffer 0.15, the higher jump 0.15 / 1.4, Dashes lasting one pass of their
  clips (0.2 s).
- **Jump Power and Speed Power** (`js/data/powers.js`, `POWERS`,
  `getJumpVelocity`, `getMaxSpeed`, each fighter's `powers`): Jump Power
  650 / 920 / 1000, Speed Power 270 / 330 / 360. #0001 had Jump Power 2 and
  Speed Power 2 (920, 330), #0002 Jump Power 2 and Speed Power 3 (920,
  360). With one movement for everyone a tier had nothing left to choose,
  so the system went rather than stay as a back door. Discover's **Power**
  page went with it (its tier meter style too), and
  `tests/systems/powers.test.mjs` and `movement-profile.test.mjs`.
- The cap that kept a grounded attack from carrying more than its share of
  top speed (`attackStartSpeed`'s clamp), the air dash's cut to top speed
  as it ended, and the air jump's set-off at top speed in a held direction.

**What it added**

- **Universal movement** (`js/data/movement.js`, `BASE_FIGHTER_MOVEMENT`):
  one frozen set of values every Fighter reads (`fighter.movement`), never
  a definition's. The registry refuses a definition that declares
  `movement`, `powers` or any movement field (`assertUniversalMovement`).
  Faster than before: top speed 420, acceleration 6000 (five steps to top
  speed), deceleration 4800, turn boost 2.2, air acceleration 4000, air
  drag 360, fast fall 14000 / 1500, the jump 920, the higher jump unchanged.
- **The triple jump**: `airJumps: 2` at `airJumpRatio` 0.78 (each air jump
  about 105 units, kept so no stage's highest footing reaches the upper
  Void). Landing, a hit and a homing dash's spring off what it hit give
  both back.
- **Momentum.** Attacks keep the speed they start with (all of it unless
  their data says otherwise, never capped at top speed); jumps and air
  jumps leave the sideways speed alone; a Dash never slows a faster
  fighter (`dashSpeedToward`) and its speed carries on after it; landing
  keeps the speed; hitstop holds velocity. Above top speed the excess
  bleeds off at a rate, never at once: `overspeedHoldDeceleration` 2400
  while held, `overspeedDeceleration` 5400 let go, the turn pressed back;
  in the air a **burst** of the fighter's own (`Fighter.burst`, from its
  Dash or air dash) at `airOverspeedDeceleration` 2600, a launch's speed
  never, so launches are untouched.
- **Dash flow.** The Dash and air dash: 1250 units/s for 1/6 s (about 208
  units), their clips played once across them whatever their frame count.
  After `dashCancelTime` (0.05 s) an attack, a Deflect or a jump may cut
  either short, keeping its speed (run → Dash → attack, jump → air dash →
  aerial). A Dash request is buffered like an attack press (it used to be
  used up), and one in the air that no air dash answers is the Dash on
  landing.
- **Landing.** The landing cancel (an aerial's recovery is over on
  touchdown), the land pose never holding anyone (running goes straight
  past it), and a ground attack pressed just before touchdown kept by the
  buffer (a ground-only one too).
- **Faster, step-aligned attacks.** Every attack clip plays at a whole
  number of 60 Hz steps per frame (20, 15, 12, 30 fps), phases still whole
  frames, hitstop two steps for light strikes. #0001: Jab and Floating
  Straight 15 → 20 fps (the Jab 0.4 → 0.3 s), Red 15 → 20, Red Kick 20 →
  30 (homing 950 → 1050), Maximum Blue and Blue 12 → 15 (Blue's pull 1100
  → 1300 so it reaches as far in its shorter window), Unlimited Void's cast
  0.6 → 0.5 s (paralysis 1.8 → 1.7 s, so the free time is about the same),
  Hollow Purple's chant 1 → 5/6 s; the High Kick kept 12 fps with a
  shorter recovery. #0002: One-Two 15 → 20 fps, Homing Attack 9/60 → 7/60
  s hang and 1000 → 1100, Bounce Attack 1300 → 1400, Spin Attack curl
  10/60 → 8/60 s and its roll cap 820 → 1000, the Whirlwind 18 → 20, the
  Rapid Kicks kept their 0.2 s wind-up and gained a hit-cancel once the
  finisher is out. Momentum shares raised to carry runs and Dashes
  (`momentum` 1 for the Jab, the One-Two and the High Kick; casts stay
  planted on purpose); Deflects keep all their drift (`airMomentum` 1) and
  their own timing.
- **Animation.** The run clip follows the speed up to 1.6× its rate on a
  Dash's run-on (`maxSpeedScale`); both fighters' run, idle, jump and fall
  clips play faster; a Dash leaves faint afterimages (`HIT_FX.trail.dashAlpha`).
- **The camera** follows quicker (`FOLLOW_X` 7, `FOLLOW_Y` 4) and caps its
  lead (`LEAD_SPEED` 700).
- **The CPU** simulates attack drift with the Fighter's own rules, knows
  the Dash's run-on (`moveset.dash.reach`), Dashes in from where a Dash and
  a strike reach, strikes out of a Dash past its cancel time, and follows
  up out of hit-cancels (`chase`) as readily as its level punishes.
- **Discover's Movement page** (`MOVEMENT_SUMMARY`, `MOVEMENT_GUIDE`): one
  entry, Universal movement, with the run, the jump, the triple jump, the
  fast fall, the Dash and the air dash; no tiers, no numbers.

**Balance, measured.** Seeded CPU-vs-CPU fights on Desert, one minute
each, 200 per level (100 each way round), Void falls #0001 : #0002. Before
(the code before the change): Easy 106 : 4, Medium 91 : 58, Hard 78 : 44,
Brutal 77 : 85. After: Easy 130 : 7, Medium 94 : 111, Hard 103 : 119,
Brutal 114 : 81; fights are more decisive (about 10% more hits a minute,
twice the falls on Hard). Universal movement alone (both fighters' old
moves on the new movement, 120 fights) left Hard at 67 : 39: #0002's lost
run and Dash advantage changed little. #0001's High Kick at 15 fps like
its other moves made its Jab strings into it far longer (Hard 50 : 175),
so it kept its quarter-second startup. With the CPU's hit-cancel chase off,
Hard is 73 : 101.

**Where to tune it**

- `js/data/movement.js`: every movement value.
- `js/data/characters/0001.js` and `0002.js`: `FPS_*`, each attack's
  phases, `momentum`, `friction`, `airMomentum`, `hitstop`, `hitCancel`
  and motion speeds.
- `js/game/rendering/camera.js`: `LEAD`, `LEAD_SPEED`, `FOLLOW_X`,
  `FOLLOW_Y`; `js/game/rendering/hit-fx.js`: `HIT_FX.trail.dashAlpha`;
  `RUN_MAX_SPEED_SCALE` in `js/game/fighters/fighter.js`.
- `js/game/ai/combat-ai.js`: `chase`, the Dash option in `options`.

**Code:** `js/data/movement.js` (new); `js/data/powers.js` (deleted);
`js/game/fighters/movement.js`, `js/game/fighters/fighter.js`,
`js/game/fighters/fighter-controller.js`, `js/data/characters.js`, both
definitions, `js/game/ai/combat-ai.js`, `js/game/ai/moveset.js`,
`js/game/rendering/camera.js`, `js/game/rendering/hit-fx.js`,
`js/screens/discover-screen.js`, `css/discover.css`,
`js/localization/strings/`.

**Tests:** `tests/systems/universal-movement.test.mjs` (the values, the
registry refusing a fighter's own, every playable fighter measured field by
field, identical traces for #0001 and #0002, the triple jump for each
fighter), `momentum.test.mjs` and `movement-rules.test.mjs` (new);
`movement.test.mjs`, `dash.test.mjs`, `air-mouvment.test.mjs`,
`combo.test.mjs`, `combat-ai.test.mjs` (the CPU's cancels),
`platform-stage.test.mjs` (the triple jump and the upper Void, the camera
at speed), `hit-fx.test.mjs` (Dash trails), `tests/interface/discover.test.mjs`,
`i18n.test.mjs`, `tests/fighters/0001/`, `tests/fighters/0002/` and others
updated.

## Quick Battle play types and the overtime tie

Not a named update (it can become one if the owner names it). Asked for in
`max`: give Quick Battle a Regular Play / Custom Play choice, let Custom
Play pick the CPU's fighter, and end an exact overtime tie on a result
instead of starting a fresh battle.

**What it changed.**

- **The play-type dialog.** Selecting Quick Battle on Select Mode opens a
  modal `role="dialog"` choice (`ChoiceDialog`, `js/ui/overlays.js`, on a
  new `#choice-dialog` root): **Custom Play** and **Regular Play**, Regular
  Play the default focus. A choice becomes `app.selection.playType`;
  Esc, gamepad Back, the close button or a press around the panel dismiss
  it without choosing, focus back on the Quick Battle card. The confirm
  dialog is unchanged (its cancel and Escape stay one result).
- **Regular Play:** Mode → Difficulty → Fighter → Battle. Confirming the
  fighter draws the CPU's fighter from `playableCharacters()` and the stage
  from `MAPS` (`drawRegularPlay`, `js/screens/quick-battle-setup.js`) into
  `cpuCharacterId` and `mapId`, then starts the Battle. Restart Battle and
  Rematch keep the draw.
- **Custom Play:** Mode → Difficulty → Fighter → CPU → Stage → Battle,
  with a new Select CPU screen (`quick-cpu`, `js/screens/quick-cpu-screen.js`),
  another instance of the fighter roster screen.
- **Two fighters.** Quick Battle's CPU no longer plays Player 1's fighter:
  `BattleScreen.enter()` checks `characterId` and `cpuCharacterId` on their
  own and refuses the match if either is not playable. `Battle` itself is
  unchanged.
- **Setup steps** follow the play type (`QUICK_BATTLE_CUSTOM_SETUP`, five
  steps; `QUICK_BATTLE_REGULAR_SETUP`, three; `js/ui/components.js`),
  re-read as each setup screen is entered. `WATCH_SETUP` is unchanged.
- **Change Stage** is explicit (`BattleScreen.changeStage`): the mode's own
  Select Stage, which after Regular Play takes the Battle's place (steps
  Mode · Difficulty · Fighter · Stage, Back to Select Fighter).
- **The tie.** `Battle.result`'s rule is unchanged (points, then the lower
  Launch Point within 1e-6, then `'draw'`). The battle screen now shows a
  draw on the result menu ("End of overtime", "Tie", "Overtime ended with
  the points and Launch Point equal.") instead of restarting, in Quick
  Battle and Watch Mode alike.

**Code:** `js/ui/components.js`, `js/ui/overlays.js`,
`js/screens/mode-select-screen.js`, `difficulty-select-screen.js`,
`character-select-screen.js`, `map-select-screen.js`, `battle-screen.js`,
`quick-battle-setup.js` and `quick-cpu-screen.js` (new),
`js/core/app.js`, `index.html`, `css/overlays.css`, `css/settings.css`
(the shared close button), `js/localization/strings/`.

**Tests:** `tests/integration/quick-battle.test.mjs` (new: the dialog,
both routes, their steps and Back, the draw, the CPU's own fighter, Change
Stage); `tests/interface/battle-screen.test.mjs` (the tie on the result
menu, each side refused on its own), `tests/integration/watch-mode.test.mjs`
(Watch Mode's tie), `tests/integration/difficulty.test.mjs` (the steps of
each play type), `tests/interface/i18n.test.mjs` and
`tests/integration/practice-ground.test.mjs` updated.

## Adding a named update

When a new piece of work gets a name, add a row to the table and a section in
the same shape: what it added, where to tune it, the code, and the tests.


## Mouvement controls and mobile button consistency

Run now only runs: repeated directional presses and joystick flicks cannot
activate ground or air Dash. Mouvement uses Q/E on keyboard, Select/View/Share
(standard button 8) plus direction on gamepad, and dedicated left/right buttons
in both mobile layouts. Combat AI requests Mouvement explicitly; existing
movement physics, Energy, cooldowns, buffering and cancellation are unchanged.
Classic adds independently customizable smaller Mouvement buttons above Run,
preserving old layouts and Run sliding. Both schemes share centered mirrored
double arrows. Jump and Extra Attack inherit the standard action-button style;
settings previews, English/French guidance and current documentation follow suit.

## CPU Intelligence

Not a named update (it can become one if the owner names it). Asked for in
`max`: replace the combat CPU with one universal, layered intelligence for
every fighter at every difficulty, Easy a casual player, Medium a tryhard,
Hard tournament level, Brutal elite with a measured 95% target.

**What it changed.**

- **The CPU.** `CombatAIController` (`js/game/ai/combat-ai.js`) is now CPU
  Intelligence (`js/game/ai/cpu-intelligence/`): capability analysis with
  move roles, perception with a reaction delay and lapses, a world model
  and forward simulation on the game's own rules, an opponent model,
  strategic modes with hysteresis, expected-utility tactics, combo
  follow-ups, stage navigation, recovery and edge-guarding, an executor of
  legal inputs, difficulty humanization and telemetry with a debug trace
  ([docs/systems/ai.md](./docs/systems/ai.md)). The old controller's code is
  gone; every mode builds the CPU the same way as before.
- **Always playing.** A liveness monitor: free to act, the CPU is never
  still for longer than a deliberate pause. While its opponent is out of
  play it repositions near where it will come back instead of standing
  still.
- **Every move, every level.** Every level uses every move, the Dash, the
  air dash, the Shield and the Deflect (as a projectile counter and as an
  attack); Easy now Dashes too.
- **Difficulty.** `js/data/difficulty.js` holds a new set of thinking
  traits (`CAPABILITY`: reaction window, lapses, cadence, noise, range,
  prediction and timing error, lookahead, plan depth, combo reliability,
  guard, perfect Shield, punish, opportunity, adaptation, Energy, risk and
  stage sense, launch steering, recovery skill, initiative). Hard reacts in
  0.15–0.22 s. The four lines on Select Difficulty (English and French)
  describe the new players.

**Where to tune it.** The profiles in `js/data/difficulty.js`; what
outcomes are worth (`KO_VALUE` and the rest) in
`js/game/ai/cpu-intelligence/values.js`; the strategic modes' weights
(`PARAMS`) in `strategy.js`; the liveness pause (`STILL_LIMIT`) in
`telemetry.js`.

**Measured** (`node tests/benchmarks/cpu-benchmark.mjs --seeds 4`, 64
games per matchup): Brutal 98.7% against the benchmark composition (Hard,
Medium, five reference styles), 92.2% against Hard alone (below the 95%
target); Hard 79.7% against Medium; Medium 93.8% against Easy; no invalid
input, inactivity or stuck navigation. Details and limitations in
[docs/systems/ai.md](./docs/systems/ai.md#benchmark).

**Code:** `js/game/ai/cpu-intelligence/` (new: `brain.js`,
`capabilities.js`, `perception.js`, `situation.js`, `stage-model.js`,
`prediction.js`, `opponent-model.js`, `strategy.js`, `evaluator.js`,
`values.js`, `defense.js`, `plans.js`, `executor.js`, `telemetry.js`),
`js/game/ai/combat-ai.js`, `js/data/difficulty.js`,
`js/localization/strings/fr.js`.

**Tests:** `tests/systems/cpu-intelligence.test.mjs` (new);
`tests/helpers/cpu-match.mjs`, `tests/helpers/reference-opponents.mjs` and
`tests/benchmarks/cpu-benchmark.mjs` (new); `tests/systems/combat-ai.test.mjs`
rewritten for the new contract; tests that expected the CPU to stand still
while its opponent was out, or Easy never to Dash, now expect purposeful
repositioning and every level's full kit (`match-score`, `practice-ground`,
`watch-mode`, `difficulty`, `combat-rules`, `movement`, `cpu-0001`,
`fighter-0002`); the source scans (`loadout`, `universal-movement`, `dash`,
`combat-assist`, `profiles`) cover every CPU Intelligence module.

## Controller system

Not a named update (it can become one if the owner names it). Asked for in
`max`: reliable PlayStation and Xbox controller support, connection
management, a circular menu cursor, comfortable default controls designed
for each fighter, and per-fighter customization of every binding, without
changing any move, mechanic, timing, cooldown or the CPU.

**What it changed.**

- **Controllers.** PlayStation (DualShock 4, DualSense) and Xbox (One,
  Series, 360) pads are identified conservatively by vendor id, product
  name or XInput; Nintendo and generic pads, a bare "Wireless Controller"
  and a non-standard mapping are reported unsupported, never given a
  layout. Up to four supported controllers are active, in the order first
  seen; one is Player 1's and only it is read. A lost controller lets go of
  everything at once; focus loss suspends input.
- **Home.** The controller button is open, with a live indicator (green
  check, red cross, orange exclamation mark) and the status in its name.
  It opens Controller Connections: the count, the status, each controller
  with its assignment and Use for Player 1, unsupported devices, the
  too-many warning and a real Reconnect.
- **Menus.** The D-pad moves focus, Cross / A confirms, Circle / B goes
  back, Options / Menu is Start, the right stick scrolls, and the left
  stick drives a circular cursor that belongs to the menu navigator (hover
  focuses, confirm activates, never outside the active scope).
- **Play.** The old fixed gamepad mapping (B, LB, LT, L3, R3 for the
  numbered attacks, RB / RT for the Shield, Select + direction to Dash) is
  replaced by controller profiles: universal defaults for every fighter
  (left stick, Cross / A Jump, L1 / LB Dash toward the stick or the facing,
  stick down Fast fall, Circle / B held Shield and pressed Deflect, Options
  / Menu Pause) and each fighter's own layout for its moves, authored in its
  definition (#0001: Square Jab, Triangle High Kick, R2 + Square Red,
  R2 + Circle Maximum Blue, L2 + Triangle Unlimited Void, R2 + Triangle
  Hollow Purple; in the air Square, Triangle, R1 Blue, L2 + Square High
  Kick. #0002: Square One-Two, Triangle Rapid Kicks, R1 Spin Attack,
  R2 + Triangle Whirlwind; in the air Square Homing Attack, Down + Square
  Bounce Attack, R1 Blue Tornado). The resolver sends the snapshot's own
  codenames, for the fighter and where it is: one owner per press, modifier
  first (R2 + Circle never raises the Shield), directions by dominant axis,
  press / hold / continuous activations, nothing leaking from menus or from
  another fighter. The Fighter keeps a controller's press for the place it
  was made for (`pressedOnGround` / `pressedInAir`), so a ground move never
  comes out as its air version; keyboard, touch and CPU behave as ever.
- **Customization.** Settings › Controls › Controller controls: the
  roster, each fighter's editor (categories, real names, descriptions, the
  family's button names, a diagram, live conflicts) and a binding dialog
  that captures combinations and directions or takes them in text; Save,
  Cancel and Restore defaults per fighter; settings version 4 stores each
  fighter's layout by its id (version 3 migrates).
- **Rules.** `codename_rule` now separates logical actions (unchanged)
  from physical controller bindings; a registered fighter whose layout is
  incomplete, invalid or conflicting never loads.

**Where to tune it.** The universal defaults (`UNIVERSAL_DEFAULTS`), the
hold threshold and the fallback inputs in
`js/data/controller-profiles.js`; each fighter's layout in its definition
(`controller.layout`); the stick thresholds (`RUN_THRESHOLD`,
`DIRECTION_DEADZONE`, `DASH_AIM_THRESHOLD`) in
`js/core/controller-resolver.js`; the trigger thresholds and
`MAX_CONTROLLERS` in `js/core/controller-manager.js`; the cursor's speed,
deadzone and scrolling in `js/ui/controller-cursor.js`.

**Code:** new `js/core/gamepad-devices.js`, `js/core/controller-manager.js`,
`js/core/controller-resolver.js`, `js/data/controller-profiles.js`,
`js/ui/controller-cursor.js`, `js/ui/controller-dialog.js`,
`js/ui/controller-editor.js`, `js/ui/controller-glyphs.js`,
`css/controller.css`; changed `js/core/input-manager.js`,
`js/core/menu-navigator.js`, `js/core/settings.js`, `js/core/app.js`,
`js/game/fighters/fighter-controller.js`, `js/game/fighters/fighter.js`
(`pressPlace`), `js/screens/home-screen.js`, `js/ui/settings-dialog.js`,
`js/data/characters.js`, `js/data/characters/0001.js`, `0002.js` and
`helpers.js`, `js/data/movement.js` (the Dash's line), the string tables.

**Tests:** new `tests/systems/controller-devices.test.mjs`,
`controller-profiles.test.mjs`, `controller-input.test.mjs`,
`tests/interface/controller-ui.test.mjs` and `tests/helpers/fake-gamepad.mjs`;
the old fixed-mapping checks in `down`, `dash`, `defense`, `explicit-mouvement`
and `loadout` rewritten for controller profiles; `settings` for version 4
and the open controller button; Home's navigation order in `empty-roster`,
`watch-mode` and `practice-ground`; `codenames` (the snapshot's two new
fields). Every test uses mocked pads; real-hardware verification is
separate (see [testing](./docs/development/testing.md#controllers-mocked-then-real-hardware)).

## Combo Assist, move cancellation and controller art

Not a named update (it can become one if the owner names it). Asked for in
`max`: a Combo Assist setting, intelligent player-requested move
cancellation, each attack's artwork in Controller Controls, and two Combat
Assist bugs fixed, as one action-resolution path rather than separate
patches.

**What it changed.**

- **Combo Assist** (Settings › Combat, on by default, its own setting
  apart from Combat Assist; English and French). For the human player
  only: Attack 1 pressed again once its attack is over, while that attack's
  own repeat cooldown runs, is Attack 2, and the reverse, each resolved
  through the fighter's own loadout for the ground or the air. A press
  made while the attack still plays is never cut, restarted or turned into
  the other attack, now or later; the other attack keeps every rule of its
  own (cooldown, art, airtime), and when it cannot start the press stays
  its own. No timer of its own: the attack's own cooldown is the window.
- **The player's move cancellation.** The human player's new request (an
  attack, the Extra Attack, a summon or technique, a jump or air jump, a
  Dash or air dash, a Shield press, a Deflect) cuts its attack in progress
  short, hit or not, in any phase, only once the new move is known to
  start and only if it was asked for after the attack began; the cut
  attack's cooldown starts once and nothing it has not struck or released
  ever is. Its press for the attack playing is no request. Run is never a
  request. Forced states (freeze, stun, blockstun, paralysis) and
  commitments (a technique, a summon's startup, a Dash's first moment,
  Combat Assist's approach) keep their rules; a hit drops the player's
  earlier requests. CPUs, the practice dummy and any other controller keep
  the old rules exactly. **Intentional change:** for the player, a whiffed
  or blocked attack's recovery can now be cut by any valid new request (the
  hit-cancel and Dash cancel still work as before for everyone).
- **Combat Assist, Run held** (bug). The finished approach started its
  attack facing the held direction, so running away (or turning during
  the approach) made the assisted attack whiff. It now faces the way the
  approach went, and the run held as it starts never turns it back (a new
  turn still does). An attack already in reach facing its target turns to
  it the same way.
- **Combat Assist after another move** (bug). It required the fighter to
  be free to act, so a melee press out of a hit-cancel, a Dash past its
  cancel time or the player's own cut started in place with no approach.
  It is now weighed whenever the attack may start, by any route, and a
  buffered press is weighed as it comes out; what it replaces ends only
  once the approach is accepted.
- **Controller Controls art.** Every move row in a fighter's controller
  editor shows the move's own artwork beside its name, the frame its touch
  button shows (ground and aerial versions apart, projectiles, techniques
  and summons where authored, mirrored where the art faces left), with the
  touch button's glyph when there is none or it fails to load.
- **Settings** version 5 (`comboAssist`); version 4 and older migrate,
  every existing choice kept and Combo Assist on.

**Where to tune it.** Which buttons alternate: `COMBO_PAIRS` in
`js/game/combat/combo-assist.js`. The window is each attack's own
`cooldown` (and `REPEAT_COOLDOWN`), unchanged. The art: each fighter's
`mobileAbilities`; its size: `--controller-art` in `css/controller.css`.

**Code:** new `js/game/combat/combo-assist.js`; `js/game/fighters/fighter.js`
(the player's requests: `playerControlled`, `comboAssistOn`, `comboAction`,
`pressRequest`, `repeatsMove`, `playerMayCut`, `attackStartable`;
`combatAssistFor` split from `tryCombatAssist`; `startAttack`'s `toward`,
`startedAt`, `button`, `turnHold`; `cutAttack`, `tryAction`, `tryDash`,
`tryAirDash`, `tryDeflect`, `trySpecial`, `trySummon`, `tryTechnique`,
`assistIntents`, `finishCombatAssist`, `takeHit`, `updateFacing`, the jump
and Shield in `update`), `js/game/combat/combat-assist.js` (`inReach`),
`js/game/fighters/fighter-controller.js`, `js/game/battle.js`,
`js/game/practice.js`, `js/screens/battle-screen.js`,
`js/screens/practice-screen.js`, `js/core/settings.js`,
`js/ui/settings-dialog.js`, `js/ui/controller-editor.js`,
`css/controller.css`, the string tables.

**Tests:** new `tests/systems/combo-assist.test.mjs`,
`tests/systems/move-cancel.test.mjs`, `tests/systems/request-devices.test.mjs`
and `tests/helpers/player-rig.mjs`; `combat-assist` (Run held, follow-ups,
in reach behind, the air), `controller-ui` (the editor's art), `settings`
(schema 5, the version 4 migration, Combo Assist in the store and the
dialog). Existing tests needed no rewrite apart from `settings`, whose
stored objects are now version 5 and whose "future version" is 6.
Checked in headless Chromium too: the Settings › Combat panel in English
and French, the editor's art for #0001 and #0002 at desktop and short
landscape sizes, and Practice Ground with the keyboard (Run held, Combat
Assist's approach and hit, Combo Assist's Red).

## #0003, the medic brawler

Not a named update (it can become one if the owner names it). Asked for
as: read `character_rule` and add character #0003 from a supplied sprite
sheet: abilities with real mechanics based on the character's canon, not
animations with plain damage; no move the character cannot perform in
canon; two or more numbered attacks, the number left to the work;
credited to the sheet's page on The Spriters Resource; never naming the
character anywhere. `character_rule` was not touched.

**What it added**

- **The fighter.** #0003 in roster slot 03, playable: 82 frames cut from
  the sheet into `assets/characters/0003/` (component-masked 1× crops, the
  flat blue background (128, 128, 255) made transparent, nothing redrawn
  or recoloured, every file `0003_<codename>_<frame>.png`), drawn at the
  roster's art-pixel size (a 48-pixel idle, about 81 units tall). Movement
  is the universal one; its Energy refills at 15 a second, the roster's
  quickest.
- **Its buttons:** four numbered attacks, each a button of its own (U, I,
  O, M; touch slots 1 to 4): two ordinary attacks with mid-air versions
  and two techniques, plus the extra attack. Transform stays reserved (the
  sheet's sealed-strength poses have no move).
- **Its moves**, each a mechanic: the Chakra Punch (a straight that shoves
  a raised Shield back), the Leaping Kick (a `rise` off the air: its
  anti-air and its way back to the stage), the Heel Drop (an axe kick
  driving its target down, then a crack round the heel that pops up only
  whoever still stands on the ground), the Heavenly Foot of Pain (a
  heel-first plunge that lands and splits the ground round it, 2 s
  cooldown), Cherry Blossom Impact (a technique: the ground erupts either
  side of it and throws up everyone standing on it; jumping clears it, a
  Shield blocks it; 4 s cooldown), the Mystical Palm Technique (a
  technique: a second knelt, breakable by any hit, that takes 10 Launch
  Point off itself; 12 s cooldown) and the Chakra Haymaker (its finisher, a
  lunging overhand blow that drives a Shield across the ground).
- **Engine features they are built on, generic for any fighter:**
  - `quake`, a hit effect (`js/game/combat/hit-effects.js`): a hit that
    runs through the ground reaches only fighters standing on it
    (`hitReaches`, asked at every place a hit meets a fighter); an
    airborne one is passed by with nothing used up. Declared on any hit
    (attack, strike, projectile, finisher, burst, impact), inherited like
    the other hit effects.
  - the `slam` attack motion (`js/game/combat/attacks.js`): hang, plunge
    at `fallSpeed`, and on meeting the ground strike once with its
    optional `impact` (`hitbox`, `hit`) round the landing point, then play
    the recovery on the ground in its `<attack>_impact` clip: no landing
    cancel, no rebound. A plunge that runs out in the air lands nothing.
    `attackReach`, the attack classification (`impact` source) and the
    loadout's clip check know it.
  - a technique's `heal` (`js/game/combat/technique.js`): Launch Point
    taken off its own fighter as the cast lets go, never below 0
    (`CombatState.heal`; no hit, so recovery runs on as it was;
    `Fighter.heals` records it). A technique that only heals is no attack.
    A soft green heal glow shows it (`HIT_FX.sparks.heal`, paint only).
- **The CPU** plays it from the data: quakes reach only fighters its
  prediction has on the ground (both ways), a slam's reach runs to where
  it would land with its impact, and a heal (the new `heal` role) is cast
  only once the whole heal counts and the opponent could not reach it
  before the cast lets go (`healPlan` in `brain.js`).
- **UI:** its touch buttons (each move's own frame), English and French
  names and one-line descriptions, a recommended controller layout, a
  Discover profile (3 / 5), and a credit group, "#0003 sprite source":
  "Sprite sheet ripped by Dazz & Fret on The Spriters Resource" (the
  sheet's own credit), linked to the sheet's page by the asset's number.
- **Roster:** the absence checks for the fighter that once held slot 03
  (removed in the [roster reset](#roster-reset)) are retired, as #0002's
  were for slot 02: `REMOVED_IDS` is empty, and the scan for its old
  names no longer flags the sheet's rippers, who are #0003's credit now.
  The test-only fighter Test B moved from slot 03 to slot 10.

**Balance, measured.** Tuned from seeded CPU-vs-CPU matches (full Watch
Mode battles, first to 3, on Desert and City, 20 matches per cell; points
#0003 : opponent). Against #0001: Medium 38 : 46, Hard 38 : 45, Brutal
33 : 47. Against #0002: Medium 28 : 54, Hard 28 : 59, Brutal 32 : 50. The
first cut scored about 5 : 24 at Hard against either: it had nothing in
the air and no way back to the stage. Fixed by the Leaping Kick's rise,
Base Launch 3 on its three big blows, a faster Heel Drop, a Deflect that
reaches down to its feet, and a quicker launch reaction and Energy
refill. #0002 stays its hard matchup (its quick Deflect swats #0003's
jump-ins).

**Where to tune it**

- `js/data/characters/0003.js`: each attack's damage, launch, timing,
  hitbox, `blockPush`, `quake`, `hits`, `motion` (the Leaping Kick's rise
  `speed`; the slam's `fallSpeed`, `SLAM_PLUNGE_0003` and its `impact`
  box and hit), `airUses` and `cooldown`; each technique's burst, `heal`,
  cooldown and clip rates (`FPS_0003`); the Deflect, `energy.regen`,
  `launchReaction` and the body.
- The new capabilities' defaults: `MOTION_DEFAULTS.slam` in
  `js/game/combat/attacks.js`, `quake` in `js/game/combat/hit-effects.js`,
  `heal` in `js/game/combat/technique.js`; the glow in `HIT_FX` in
  `js/game/rendering/hit-fx.js`.

**Code:** `js/data/characters/0003.js`, registered in
`js/data/characters.js`; `js/data/fighter-profiles.js`;
`js/data/loadout.js` (the technique release and the impact clip);
`createHit`, `hitReaches` and `quake` in `js/game/combat/hit-effects.js`;
`slam` and `attackReach` in `js/game/combat/attacks.js`; `impact` and the
`hitReaches` checks in `js/game/combat/combat.js`; the heal in
`js/game/combat/technique.js` and `js/game/combat/combat-state.js`;
`js/game/combat/offense.js`, `js/game/combat/projectile.js`; the plunge,
the landing and the heal in `js/game/fighters/fighter.js`; the glow in
`js/game/rendering/hit-fx.js` and `js/game/arena.js`; the CPU in
`js/game/ai/cpu-intelligence/` (`capabilities`, `prediction`,
`evaluator`, `defense`, `brain`); `js/ui/credits.js`,
`js/localization/`.

**Tests:** new `tests/fighters/0003/fighter-0003.test.mjs` (the real PNGs,
scale and anchors, every move's mechanic, the CPU, names, credits, and a
whole-repository check that the source character is named nowhere),
`tests/systems/quake.test.mjs` and `tests/systems/slam.test.mjs`; the
heal in `tests/systems/technique.test.mjs`; `hit-effects`,
`attack-classification`, `combat-assist`, `combo-assist` and
`cpu-intelligence` made to hold for a fighter with no projectile, a
ground-only extra attack, a slam and a heal; the roster, credits and
screens in `tests/integration/empty-roster.test.mjs`,
`practice-ground.test.mjs`, `watch-mode.test.mjs`,
`tests/interface/battle-screen.test.mjs`, `controller-ui.test.mjs`,
`discover.test.mjs`, `settings.test.mjs` and
`tests/fighters/fixtures/test-fighters.mjs`.

## Ability HUD and the cooldown policy

Not a named update (it can become one if the owner names it). Asked for
as: an animated, hero-shooter-inspired ability HUD for keyboard and
controller play, with a ground / air scroll-wheel transition, the moves'
own art and real inputs and cooldowns; and a strict universal cooldown
policy: 5 s for a ten-damage attack, 3 s for a highly special effect
(healing, paralysis, a hard hold), nothing beyond the 0.5 s repeat delay
for anything else. `character_rule` was not touched.

**What it added**

- **The cooldown policy** (`js/data/cooldowns.js`): every move's reuse
  delay derived from its structured data, never authored. `moveImpact`
  reads everything one use can do to one target (strikes, a multi-hit's
  finisher, its projectile and that projectile's finisher, a slam's
  impact, a technique's burst and heal, a summoned clone's attack);
  `cooldownClass` gives `tenDamage` (any hit of 10, or 10 in all: 5 s),
  else `exceptional` (`heal`, `paralyze`: 3 s), else `ordinary` (0.5 s;
  none for the exempt Deflect). The first that applies decides, so the
  two never add up. `ROUTINE_EFFECTS` lists what earns nothing (a pull,
  a quake, a launch, a slam, a bounce, ordinary hitstun …), and every hit
  effect must be in one list or the other. `resolveCooldown` refuses any
  authored value the policy does not give, so a future fighter cannot
  declare an 8-second move. The builders take the fighter's own
  `projectiles` / `attacks` as context (`createAttackDefinition`,
  `createTechniqueDefinition`, `createSummonDefinition`); every definition
  records its `cooldownClass`.
- **The roster, reclassified** (authored `cooldown` fields removed from
  all three definitions): #0001 Unlimited Void 3 s (unchanged, now a
  paralysis), Hollow Purple 5 s (unchanged, now 10 damage); #0002
  Whirlwind 5 s (unchanged, its tornado's 10-damage finisher), its
  Deflect 0.05 s → none; #0003 Mystical Palm Technique 12 s → 3 s (heal),
  Cherry Blossom Impact 4 s → 0.5 s, the Heavenly Foot of Pain 2 s → 0.5 s.
  Damage, timing, hitboxes, launches and animations are untouched.
- **A read-only move status** (`js/game/combat/move-status.js`):
  `abilityGroups` (each place's moves from the loadout), `moveCooldown`,
  `moveRestriction` (airtime spent, free fall, missing art: never shown as
  a cooldown) and `abilityStatus`, read from `CombatState.cooldowns` and
  `abilityCooldowns` alone.
- **The ability HUD** (`js/ui/ability-hud.js`, `css/ability-hud.css`):
  Player 1's moves bottom right in Quick Battle and Practice Ground, art
  over a 1px divider over the input, current place on top and the other
  beneath, smaller and dimmed, swapping in about 320 ms (CSS transforms
  and opacity, retargeted mid-swap, instant with reduced motion);
  keyboard keycaps from `CONFIG.bindings` or the fighter's resolved
  controller profile in PlayStation or Xbox glyphs, following
  `InputManager.lastDevice`; special cooldowns with a sweep and seconds,
  the repeat delay as a faint sweep. Hidden on touch screens, in Watch
  Mode, at results; faded under pause and Practice menus. While it shows,
  the world-space cooldown rings of Player 1 step aside
  (`Arena.hudCooldownsFor`).
- **The CPU**: weighs the new cooldowns from the same definitions. One
  CPU statistic was loosened: Brutal may empty its Energy one time more
  than Easy in the seeded fights (it spends its last Energy only for a hit
  that can end a life; on `main` seed 1 already broke the old strict
  comparison, and #0002's Deflect losing its 0.05 s delay flipped seed 3).

**Where to tune it:** the lengths and the exceptional / routine effects in
`js/data/cooldowns.js`; the HUD's sizes, opacity and swap timing in the
custom properties at the top of `css/ability-hud.css`.

**Tests:** new `tests/systems/cooldown-policy.test.mjs` and
`tests/interface/ability-hud.test.mjs`; `combat-rules`, `technique`,
`deflect`, `combo-assist`, `sample-fighter`, `cpu-intelligence`,
`fighter-0003`, `moves-0001`, `practice-ground`, `down` and the fixtures
updated for the policy.

## Special abilities and installing Alva

Not a named update (it can become one if the owner names it). Asked for in
`max`: a deliberate, player-facing Special classification in place of the
automatic one, quicker ordinary-attack pacing for Cherry Blossom Impact, an
orange exclamation mark over a fighter performing a Special, and a working
Home Download button that installs Alva as a web app. `character_rule` was
not touched.

**What it added**

- **The Special classification** (`js/data/special-abilities.js`): each
  fighter names its own Specials by move codename (`specialAbilities`):
  #0001 `['attack4', 'attack5']` (Unlimited Void, Hollow Purple), #0002
  `[]`, #0003 `['attack4']` (the Mystical Palm Technique): three in all.
  `isSpecialAbility` replaces the controller editor's old automatic rule
  (`controllerActions` put every technique, summon and projectile-throwing
  attack under Special abilities), so Red, Maximum Blue, the Whirlwind and
  Cherry Blossom Impact moved to Ground attacks, their action ids and every
  binding unchanged; an empty category is not shown (#0002 has none).
  The registry refuses a list naming anything the fighter cannot perform
  where it lists it (`assertSpecialAbilities`). `specialAction` and
  `specialAttacks` keep meaning a summon or technique; cooldowns stay the
  policy's (the Whirlwind keeps its 5 s).
- **Cherry Blossom Impact's timing** (#0003): `attack3_cast` 10 → 20 fps,
  `attack3_release` 15 → 20 fps: 0.4 s + 1/3 s (about 0.73 s) → 0.2 s +
  0.25 s (0.45 s), every frame kept, three 60 Hz steps a frame, the burst
  still on the release's first frame. Its damage, launch, quake, hitbox
  and 0.5 s repeat delay are unchanged. The Specials' own timings, and Red,
  Maximum Blue and the Whirlwind, are untouched.
- **The Special ability mark** (`specialMarkRect`, `specialMarkBob`,
  `drawSpecialMark` in `js/game/rendering/fighter-status.js`;
  `activeMove` / `activeSpecialAbility` in `js/game/combat/move-status.js`;
  `Arena.specialMarkRect`): an orange (`#ff9f1c`), dark-outlined
  exclamation mark over a fighter from the step its Special is accepted to
  the step it ends (finished, hit, ground lost, reset), above its Energy
  bar or name tag, bobbing 2 CSS px (still with reduced motion). For
  players and CPUs alike, both at once if need be.
- **Installing Alva** (`js/core/web-app-install.js`,
  `js/ui/install-dialog.js`, `manifest.webmanifest`, `assets/icons/`):
  Home's Download button is enabled and opens the install dialog: the
  explanation, the browser's own installation where it offers one
  (`beforeinstallprompt` kept for the press; success only on
  `appinstalled`), the manual steps per platform where it does not (Safari
  on iPhone and iPad, Android browsers, Edge, Chrome, Safari on a Mac,
  Firefox), and "Alva is already installed!" inside the installed app.
  A relative manifest (standalone, `./`, `#050506`) and icons from
  `alvafav.PNG` (192 / 512, any and maskable; a 180 Apple touch icon);
  no service worker. English and French.
- **The Download icon's animation** (`css/home.css`, `ICONS.download`'s
  arrow now its own group): every 3.2 s the arrow lifts and drops into
  the tray with a faint accent-green glow, then rests; paused under the
  dialog, stopped once installed, still with reduced motion.

**Where to tune it:** each fighter's `specialAbilities`; Cherry Blossom
Impact's `FPS_0003.attack3_cast` / `attack3_release`; the mark's colour
(`SPECIAL_MARK_STYLE`), size and bob in `fighter-status.js`; the install
copy in `js/localization/strings/en.js` and `fr.js` (`install.*`); the
Download animation's keyframes and timing in `css/home.css`.

**Tests:** new `tests/systems/special-abilities.test.mjs` and
`tests/interface/install.test.mjs`; `fighter-status` (the mark on the
canvas), `controller-profiles`, `controller-ui`, `loadout`,
`fighter-0003`, `settings`, the Home tests in `empty-roster`,
`practice-ground` and `watch-mode` updated, and the three Discover
profiles' review hashes recorded again (their ratings and descriptions
still hold).

## #0004, the virtual singer

Not a named update (it can become one if the owner names it). Asked for
as: read `character_rule` and add character #0004 from a supplied sprite
sheet: abilities with real mechanics based on the character's canon, not
animations with plain damage; no move the character cannot perform in
canon; credited to the sheet's page on DeviantArt; never naming the
character anywhere. `character_rule` was not touched.

**What it added**

- **The fighter.** #0004 in roster slot 04, playable: 128 frames cut from
  the sheet into `assets/characters/0004/` (component-masked 1× crops, the
  flat purple background (128, 0, 128) made transparent, nothing redrawn
  or recoloured, every file `0004_<codename>_<frame>.png`): 77 of the
  fighter, 51 of what its moves create (its notes, its little double, the
  39-frame ring of sound). Drawn at the roster's art-pixel size (a 49-pixel
  idle, about 83 units tall); its long twin tails would drag the automatic
  anchor, so every clip where they, the leek or a kick's trail swing wide
  authors its own `anchorX`. Movement is the universal one; its Energy
  refills at 14 a second.
- **Its buttons:** five numbered attacks, each a button of its own (U, I,
  O, M, ","; touch slots 1 to 5): three ordinary attacks with mid-air
  versions and two techniques, plus the extra attack. Transform stays
  reserved (the sheet's intro, win, lose and cut-in pictures are no move).
- **Its moves**, from its canon (a singer whose voice is its power, the
  leek its signature item, a song that charms, a chibi double waving a
  leek, dancing): the Dance Combo (a swipe that holds, then a punch), the
  Air Dance (a sweep, then a rising crescent), the Leek Swing (its longest
  reach, shoving a raised Shield back), the Leekspin (a `rise` that
  `carry`s its target up and flings it: its way back to the stage), the
  Crescent Kick (its anti-air), the Stage Dive (a `slam`: a spike on the
  stage, a crouching landing that pops up whoever is near), Ievan Polkka
  (a technique: its little double appears in front and stands there
  waving its leek, a stationary piercing projectile, six strikes and a
  launch, 5 s), World is Mine (a technique, its Special: half a second of
  singing, then a ring of sound round it that charms everyone it reaches
  for 2.5 s, 3 s) and the Melody (a sung note that turns projectiles
  back). Its Deflect is an uppercut that turns projectiles back.
- **Engine features they are built on, generic for any fighter:**
  - `charm`, a hit effect (`js/game/combat/hit-effects.js`; seconds,
    inherited by strikes and finishers like the other hit effects): a real
    hit charms its target (`CombatState.charmBy`; a different charmer
    replaces the charm, the same one keeps the longer). While charmed,
    every hit the fighter would land on its charmer is no hit
    (`Combat.charmed`): it heals the charmer by the hit's damage
    (`CombatState.heal`), launches, stuns and freezes nothing, and comes
    out as a `charmed` event (never a confirm for a string or Combo
    Assist). The Shield rule is asked first: a blocked hit charms nobody
    and a raised Shield still blocks a charmed fighter's hit. Hits on
    anyone else are untouched. It is an exceptional effect in the cooldown
    policy (3 s, `EXCEPTIONAL_EFFECTS`). A pink heart (`drawCharmMark`)
    floats over a charmed fighter, and the charmer's heal glow shows each
    healing hit.
  - a technique burst's `effect` (`js/game/combat/technique.js`): art
    (`{ animation, offset }`, one of the fighter's `effectAnimations`)
    played once where the burst went out, behind the fighters
    (`Fighter.effects`, `Arena.addCastEffect`). Art only; the loadout
    refuses an effect clip that is missing.
- **The CPU** plays it from the data: a charm is worth 4 a second (0.5
  while the target is already charmed) in the evaluator, and a charmed
  CPU plans movement instead of attacks, follows up nothing, answers none
  of its charmer's threats with a strike or a projectile, and keeps out of
  its reach until the charm runs out (`me.charmed` in `situation.js`,
  `brain.js`, `defense.js`).
- **UI:** its touch buttons (each move's own frame), English and French
  names and one-line descriptions (the songs keep their titles in both),
  a recommended controller layout, a Discover profile (4 / 5), and a
  credit group, "#0004 sprite source": "Sprite sheet by xmaygrrr on
  DeviantArt", linked to the sheet's page by the deviation's number alone.
- **Roster:** the credit and name scans no longer flag the sheet's artist
  as a retired credit (a fighter removed in the [roster
  reset](#roster-reset) had the same artist): they are #0004's credit now.

**Balance, measured.** Tuned from seeded CPU-vs-CPU matches (full Watch
Mode battles, first to 3, on Desert and City, 20 matches per cell; points
#0004 : opponent). Against #0001: Medium 31 : 50, Hard 44 : 45, Brutal
47 : 37. Against #0002: Medium 38 : 51, Hard 53 : 34, Brutal 54 : 36.
Against #0003: Medium 35 : 53, Hard 35 : 49, Brutal 43 : 39; 380 : 394 in
all. The first cut scored 342 : 413: the CPU never sang (a charm valued at
2 a second, a burst only head high). Fixed by valuing the charm at 4, a
burst a jump's height high, a quicker launch reaction (0.15 s per 1000
units/s up to 0.55 s, tumbling from 1100, 18°) and a 14 Energy refill.
Its Dance Combo's first strike was brought forward to 0.1 s so that a Dash
attack lands at speed.

**Where to tune it**

- `js/data/characters/0004.js`: each attack's damage, launch, timing,
  hitbox, `blockPush`, `hits`, `carry`, `motion` (the Leekspin's rise
  `speed`; the Stage Dive's `fallSpeed`, `DIVE_PLUNGE` and its `impact`),
  `airUses`; the double's `pierce`, `finisher` and `lifetime`; World is
  Mine's burst box, `charm` seconds and `effect` offset; the Melody's speed
  and `repel`; clip rates (`FPS_0004`), anchors, the Deflect,
  `energy.regen`, `launchReaction` and the body.
- The new capabilities' defaults: `charm` in
  `js/game/combat/hit-effects.js`; the CPU's charm value in
  `js/game/ai/cpu-intelligence/evaluator.js`; the heart's colours and size
  (`CHARM_MARK_STYLE`, `charmMarkRect`) in
  `js/game/rendering/fighter-status.js`.

**Code:** `js/data/characters/0004.js`, registered in
`js/data/characters.js`; `js/data/fighter-profiles.js`;
`js/data/cooldowns.js`, `js/data/loadout.js` (the burst's art); the charm
in `js/game/combat/hit-effects.js`, `attacks.js`, `projectile.js`,
`offense.js`, `combat-state.js` and `combat.js`; the burst's art in
`js/game/combat/technique.js`, `js/game/fighters/fighter.js` and
`js/game/arena.js`; the heart in `js/game/rendering/fighter-status.js` and
`js/game/arena.js`, the heal glow in `js/game/rendering/hit-fx.js`; the
CPU in `js/game/ai/cpu-intelligence/` (`capabilities`, `perception`,
`situation`, `evaluator`, `defense`, `brain`); `js/ui/credits.js`,
`js/localization/`.

**Tests:** new `tests/fighters/0004/fighter-0004.test.mjs` (the real PNGs,
scale and anchors, every move's mechanic, the CPU, names, credits, and a
whole-repository check that the source character is named nowhere) and
`tests/systems/charm.test.mjs`; the burst's art in
`tests/systems/technique.test.mjs`; `hit-effects`, `launch`,
`cooldown-policy` and `special-abilities` for the charm and the fourth
fighter; the roster, credits and screens in
`tests/integration/empty-roster.test.mjs`, `discover.test.mjs`,
`settings.test.mjs`, `i18n.test.mjs` and the other fighters' tests (the
playable list).

## Transform removed

Not a named update (it can become one if the owner names it). Asked for in
`max`: the Transform button, its action and everything built for it
deleted for good. No playable fighter ever had a move on it: a reserved
button (K on the keyboard, a dashed star on touch, mapped to null by all
four fighters), `transform` since the
[control codenames](#control-and-move-codenames) and `special` before.
The game now behaves as though it had never been in its control
architecture. `character_rule` was not touched.

**What it removed**

- **The action.** `transform` is no longer in `ACTIONS`, `COMBAT_BUTTONS`,
  `ACTION_LABELS`, `MOVES` or the keyboard `bindings` (`js/config.js`), so
  no input snapshot carries `transform` / `transformPressed`, the Fighter,
  the CPU and Combat Assist never see it, and K does nothing in play. K is
  still menu Back (`CONFIG.menuBindings.back`), as are Esc and Backspace.
- **The touch button** (`js/ui/touch-controls.js`,
  `css/touch-controls.css`): no element, handler, name, star glyph
  (`ICONS.transform`), dashed reserved look or `.tc-transform` place, in
  either scheme, in battle, Practice Ground or the layout editor. The
  mobile presentation lost its Transform-only rules
  (`js/ui/mobile-abilities.js`: the `RESERVED` set, the star fallback, a
  fighter's own glyph for a non-art button). A combat button mapped to
  null still shows reserved, dashed.
- **The cluster.** Slot 3 moved into the place Transform held, beside
  Shield (`right: 1.5 pitch`, it was 2.5): a compact honeycomb of three
  rows (three, two and three buttons), one pitch between neighbours, the
  same size for every fighter, so the rule that widened the cluster for a
  third numbered button (`data-attack-buttons`) is gone with it. No other
  button moved; a custom layout's placed controls are where they were.
- **The fighters.** `transform: null` and its "reserved" comments left
  #0001 to #0004 (their art untouched); the four Discover profiles' review
  hashes recorded again (their ratings and descriptions still hold).
- **The loadout.** An `actions.transform` (reserved or not) is now refused
  like any other name that is no combat button, and `attacks.transform` as
  no move codename.
- **Controllers.** `ground:transform` and `air:transform` are no action ids
  (`ACTION_ID`, `MOVE_CONTROLS` in `js/data/controller-profiles.js`): never
  offered, bound or resolved.
- **Saved settings** stay safe with no settings version change: a saved
  touch layout's `transform` entry and a saved controller profile's
  `ground:transform` / `air:transform` bindings are dropped by the
  sanitizing that already discarded retired ids, every other position,
  size and binding kept. Reset to defaults gives the new layout.
- **French:** `control.transform` ("Transformation"); English derives its
  control names from `ACTION_LABELS`.
- **The documents:** the specification, the input and combat guides,
  conventions, the character specifications, adding a fighter, the README
  and `codename_rule` describe the game without it.

**Where to tune it:** the cluster's places in `css/touch-controls.css`
(`.tc-shield`, `.tc-attack[data-slot]`, `.tc-extra_attack`, `.tc-jump`).

**Tests:** a guard in `tests/systems/codenames.test.mjs` that no
Transform control, move, binding, style, glyph or translation is left in
the code, the stylesheet, the page or the current documents (graphics
transforms untouched), with K pressing nothing in play; the touch
controls with no Transform element in either scheme and the 3-2-3
honeycomb (`controls-ui`); old touch layouts and the editor
(`touch-layout`, `settings`); old controller profiles
(`controller-profiles`) and no pad input ever sending it
(`controller-input`); a definition with one refused (`loadout`); the test
fighter's own Transform (Awakening) removed from
`tests/fighters/fixtures/sample-fighter.mjs` and the reserved-button tests
(`combo`, `combat-assist`, `combat-ai`, `attack-classification`,
`special-abilities`) driven by a reserved `extra_attack` instead; every
other test that expected the button updated.

## Adamaris, the volcano and the Void's ripple

Not a named update (it can become one if the owner names it). Asked for in
`max`: a fourth stage, Adamaris, with a continuous beach and a volcano whose
eruptions throw rocks; Desert and City renamed; the credits' "all stages";
a five-minute clock; and the Void rippling where it takes a fighter.

**What it added**

- **Continuous ground** (`js/game/physics.js`: `resolveGround`,
  `GROUND_TYPES`; a map's `ground`): a stage's floor may run `reach` past
  both sides of the Void instead of ending in ledges. The main stage stays
  the combat area for the camera, the Void and overtime; every finite stage
  keeps exactly its collision. The CPU's `StageModel` takes the combat
  area's edges for ledges there (`ledges` false).
- **Adamaris** (`js/data/maps.js`, fourth in `MAPS`, slot 04;
  `js/stages/adamaris-theme.js`): the beach, the sea, the volcano, palms;
  English and French names, tagline and traits.
- **Stage hazards** (`js/data/stage-hazards.js`, `js/game/stage-hazards.js`,
  a map's `hazards`): `StageHazards` and `VolcanoController`, two random
  states (dormant, erupting) with eruption phases, and volcanic rocks
  (1 damage each, Base Launch 1 small / 2 large, upward) with red warnings
  at their exact landings. Rocks are never projectiles and have no owner:
  `CombatSystem.hazardHit` applies them through `applyHit` with no attacker
  (`source: 'hazard'`, `attack: false`, `hazard` on the event). The Arena
  runs them after the fighters' hits each step (only while a Battle's fight
  is on: `hazardsLive`), the theme draws them, the preview runs its own
  (opening on an eruption), and the CPU steps out of visible warnings
  (`avoidHazards` in `brain.js`, `StageModel.dangerZones`).
- **The Void's ripple** (`voidCrossing` in `js/game/arena.js`,
  `HitEffects.addVoidRipple` and `HIT_FX.voidRipple`,
  `StageTheme.rippleOffset` and `drawVoidRipples`): every Void elimination
  disturbs the drawn edge where the fighter crossed it, on every stage.
- **Renames:** Desert is shown as **Yerma**, City as **Sol-Noir** (ids,
  themes and layouts kept).
- **Credits:** "Game design, code, interface, ALVA wordmark, and all
  stages by hiyroscript." (and the French), no stage named.
- **Clock:** `CONFIG.battle.matchSeconds` 420 → 300 (5:00); overtime kept
  at 60 s.

**Where to tune it:** `VOLCANO` and `VOLCANIC_ROCKS` in
`js/data/stage-hazards.js`; Adamaris's `ground`, Void margins and rock
`targets` in `js/data/maps.js`; `HIT_FX.voidRipple` in
`js/game/rendering/hit-fx.js`; the volcano's size and the beach's depths at
the top of `js/stages/adamaris-theme.js`.

**Tests:** `tests/systems/stage-hazards.test.mjs`,
`tests/systems/adamaris.test.mjs`, `tests/systems/void-ripple.test.mjs`;
continuous and finite ground in `platform-stage`; the roster, Random Stage
and Adamaris's preview in `stage-select`; names, credits and the clock in
`i18n`, `overtime`, `battle-screen`, `watch-mode`, `practice-ground`,
`quick-battle` and `discover`.

## CPU match play: objectives, deliberate waiting, breaking off

Not a named update (it can become one if the owner names it). Asked for in
`max`: make the CPUs play like people of their level rather than tireless
machines: a match-level strategy above the exchange, deliberate waiting,
breaking off to recover, intelligent Shield use, no twitching, and a
rebalance of the four levels with Easy, far too strong, first.

**What it changed.**

- **Why Easy was too strong.** Its range error never reached the
  simulation of its own strikes (only the opponent's position it reported),
  so it misjudged nothing that mattered; it followed up hits on the step
  they landed, with no hit-confirm; it took a fresh decision the moment
  any action ended (its slow `think` only paced reassessment); it saw
  finishers nearly as surely as Brutal; and the liveness rule ("never still
  for more than 0.45 s") with its footwork kept it pressing about 100 times
  a minute, as often as Brutal.
- **The match objective** (`js/game/ai/cpu-intelligence/objective.js`,
  new): build, finish, stabilize, protect, survive, force, regroup, chosen
  from the score, the clock, overtime's tiebreak and closing Void, both
  fighters' exposure by the real launch rules, and how long nothing has
  happened; it persists (dwell, a keep bonus, urgent events), checks its own
  progress, grows impatient, and informs the strategy (modes, the bar, risk,
  waiting), never the moves.
- **Choosing to commit** (`brain.js`): the value of waiting for a clearer
  chance against a free opponent, openings taken at once, fresh decisions on
  the level's cadence, a hit-confirm before a combo, pressure that is not
  working reset, unseen finishers weighed without the life they end.
- **Deliberate waiting** (`hold` in `plans.js`): a wait with a reason, a
  spot, a Shield ready (as the opponent closes in on its level, a few
  blocks, never without Energy, then rested) and explicit exits. Footwork
  settles with a dead band and a stopping distance, and, impatient, steps
  into its own range instead of waiting at the edge of the opponent's; the
  range error is a lasting impression, not a flicker.
- **Breaking off to recover** (`saferSpot`, `retreat`): a safer spot from
  the real launch rules (never through the opponent, never under a hazard's
  warning), Dashing clear when pressed, abandoned when cut off.
- **Liveness, aware of intent** (`liveness` in `brain.js`, `WAIT_LIMIT` in
  `telemetry.js`): a wait the plan means is waiting; stillness nothing
  means is an incident by cause (a walk the ledge guard keeps holding back
  among them); a wait is never endless. Rule A in `ALVA_SPEC.md` §7.2.8 now
  says so, in place of "never still".
- **The opponent model** learns how the CPU's own attacks fare (blocked,
  whiffed, punished), how long the opponent sits behind its Shield, how much
  it moves; the evaluator and the strategy read those habits.
- **Difficulty.** Three new traits (`patience`, `discipline`, `awareness`)
  and a retuned Easy, Medium and Hard (`js/data/difficulty.js`); Brutal's
  thinking traits unchanged. Easy and Medium's lines on Select Difficulty
  (English and French) describe the new players.
- **Fixes found on the way:** a heal of its own can be cast while the
  opponent respawns; navigating down to an opponent picks an edge with
  footing below it; a press and a Shield from two plans never mix in one
  snapshot (`Executor.redo`).

No mechanic changed: damage, launches, Launch Point recovery, Energy,
movement, the Shield, the Deflect, hitboxes, timing, cooldowns, Combat
Assist, scoring, respawns, the match clock, overtime and the stages are as
they were.

**Where to tune it.** The profiles (and the three new traits) in
`js/data/difficulty.js`; what each objective asks (`BIAS`), the pace
prior and the objective scores in `objective.js`; the value of waiting, the
pressure budget, the hold's patience, blocks and Shield time, and the safer
spot's weights in `brain.js`; `STILL_LIMIT` and `WAIT_LIMIT` in
`telemetry.js`.

**Measured** (`node tests/benchmarks/cpu-benchmark.mjs --suite all
--seeds 4`, 256 games per matchup, against the previous CPU measured the
same way): Brutal 99.2% against the benchmark composition (98.5% before)
and 94.5% against Hard alone (91.8%), still short of 95% there; Hard 94.1%
against Medium (86.3%); Medium 99.2% against Easy (93.0%), Easy scoring
0.23 points a match (0.86). Against the competent reference Easy presses
66 times a minute (102 before) and takes 144 Launch Point a match (56).
Head to head, the new Medium and Hard lose to the old ones (23%, 27%) and
Brutal is as strong as before (50%). No inactivity or stuck navigation in
4,864 matches; no stillness past 10 s. Details, the comparison with
the previous CPU and the limitations in
[docs/systems/ai.md](./docs/systems/ai.md#benchmark); no human playtesting
has been done ([the checklist](./docs/systems/ai.md#human-playtesting)).

**Code:** `js/game/ai/cpu-intelligence/objective.js` (new), `brain.js`,
`plans.js`, `strategy.js`, `telemetry.js`, `evaluator.js`,
`opponent-model.js`, `executor.js`, `situation.js`, `capabilities.js`;
`js/data/difficulty.js`, `js/localization/strings/fr.js`.

**Tests:** `tests/systems/cpu-behaviour.test.mjs` and
`tests/helpers/cpu-scenario.mjs` (new: scenarios A to N, the liveness
monitor, the telemetry); `CompetentOpponent` in
`tests/helpers/reference-opponents.mjs` and the behaviour suite in
`tests/benchmarks/cpu-benchmark.mjs` (new); how each side played in
`tests/helpers/cpu-match.mjs`; tests that required a CPU never to stand
still now require that it never stands still without meaning it
(`cpu-intelligence`, `combat-ai`, `match-score`).

## #0005, the dancing clown

Not a named update (it can become one if the owner names it). Asked for
as: study the repository, read `character_rule` and add character #0005
from a supplied sprite sheet: abilities with real mechanics based on the
character's canon, not animations with plain damage; no move the character
cannot perform in canon; credited to the sheet's page on DeviantArt; never
naming the character anywhere. `character_rule` was not touched.

**What it added**

- **The fighter.** #0005 in roster slot 05, playable: 80 frames cut from
  the sheet into `assets/characters/0005/` (1× crops, each tight to its own
  art, the flat red-orange background (191, 51, 0) made transparent,
  nothing redrawn or recoloured, every file `0005_<codename>_<frame>.png`):
  78 of the fighter, 2 of the red balloons its summon appears through.
  Drawn at the roster's art-pixel size (a 64-pixel idle, about 108 units
  tall: the tallest of the roster); its claws, neck, tendrils and ghostly
  hands reach far from its body, so every clip authors its own `anchorX`
  (and the Claw Rake and the Deflect their `anchorY`). Movement is the
  universal one; its Energy refills at 14 a second.
- **Its buttons:** five numbered attacks, each a button of its own (U, I,
  O, M, ","; touch slots 1 to 5): three ordinary attacks with mid-air
  versions, a technique and a summon, plus the extra attack (J). The
  sheet's intro, walk, victory dance and defeat, its transformations, its
  detached head and the rising bite are no move.
- **Its moves**, from its canon (a shapeshifter in a clown's shape that
  hunts by fear and feeds on it, its true self lights that leave whoever
  sees them floating, appearing wherever it likes with red balloons as the
  herald, its jaws stretching far beyond a human's): the Claw Swipe and
  the Claw Rake (a sweep that holds, then a spike), the Long Bite (its head
  on a long neck, the jaws 120 to 198 units out and nothing closer: three
  bites that hold, then a fling of 5), Snapping Jaws (a shorter one in the
  air), Phantom Hands (a barrage of ghostly hands, the last 5 straight up)
  and Floating Hands (the same barrage as it `hover`s, once per airtime),
  the Deadlights (a technique, a Special: its maw opens onto the lights,
  and everyone in front who faces it takes 1 and floats helpless for
  1.6 s; 3 s), the Red Balloon (a summon, a Special: a phantom of #0005
  rises out of a bunch of balloons 60 units behind the opponent and bites
  its back, 3, leaving it afraid for 2.5 s; 3 s) and Dark Tendrils (black
  tendrils from its maw, 24 to 324 units, seizing whoever they meet and
  reeling in everyone in front of it). Its guard is a thicket of black
  tendrils; its Deflect a claw swept round. It throws no projectile and
  never heals but by feeding on fear.
- **Engine features they are built on, generic for any fighter:**
  - `float`, a hit effect (`js/game/combat/hit-effects.js`; seconds,
    inherited by strikes and finishers): a real hit that launches nothing
    makes its target float (`CombatState.float`): held exactly as a
    paralysis holds it, but lifted off the ground and rising at
    `FLOAT_RISE_SPEED` (42 units/s) with no gravity (`Fighter`'s
    immobilized step), until it runs out and the fighter falls; a launch
    ends it at once. Exceptional in the cooldown policy (3 s).
  - `fear`, a hit effect: a real hit frightens its target, by its attacker
    (`CombatState.frightenBy`; a different frightener replaces the fear,
    the same one keeps the longer). While it lasts, every real hit the
    frightener lands on it lands in full and also feeds the frightener:
    its damage comes off the frightener's own Launch Point, never below 0
    (`CombatState.heal`, the hit event's `fed`). A blocked hit frightens
    and feeds nobody; anyone else's hits feed nobody. Exceptional (3 s). A
    trembling drop of cold sweat (`drawFearMark`) floats over a frightened
    fighter, and the frightener's heal glow shows each hit that feeds it.
  - `gaze`, a hit effect (true or false): the hit reaches only a fighter
    facing where it comes from (`hitReaches`, now given the source's
    position at every place a hit meets a fighter); one with its back
    turned is passed by with nothing used up. A raised Shield still blocks
    it. Routine (no cooldown of its own).
  - a pull's `front` (`js/game/combat/pull.js`): a pull that reaches only
    the side its attack faces (or its projectile flies).
  - It is the roster's first summon: the summon system was already there,
    tested on test-only fighters.
- **The CPU** plays it from the data: a float weighs as the hold it is, a
  fear as 3 a second (0.5 while one is running) and every hit on an
  opponent frightened of it by what it would feed; a gaze burst counts on
  an opponent only if it faces the CPU; an attack's own pull that would
  reel an opponent it could finish by a ledge back to safety costs it that
  finish. Frightened itself, it keeps just out of its opponent's reach
  until the fear runs out (`me.frightened` in `situation.js`, `brain.js`,
  `evaluator.js`, `capabilities.js`, `perception.js`, `defense.js`).
- **UI:** its touch buttons (each move's own frame), English and French
  names and one-line descriptions, a recommended controller layout, a
  Discover profile (4 / 5), and a credit group, "#0005 sprite source":
  "Sprite sheet posted by imhomiejaydev on DeviantArt", linked to the
  sheet's page by the deviation's number alone, with the sheet's own
  credit, "Sprites by regularDor8go".

**Balance, measured.** Tuned from seeded CPU-vs-CPU matches (full Watch
Mode battles, first to 3, on Desert and City, 20 matches per cell; points
#0005 : opponent). Against #0001: Medium 36 : 53, Hard 34 : 52, Brutal
32 : 49. Against #0002: Medium 42 : 45, Hard 36 : 49, Brutal 46 : 39.
Against #0003: Medium 40 : 41, Hard 36 : 44, Brutal 43 : 37. Against
#0004: Medium 54 : 24, Hard 56 : 32, Brutal 55 : 31; 510 : 496 in all. The
first cut scored 380 : 597 (its hits mostly 1-damage holds, its Long Bite
and Deadlights punished on most starts). Fixed by a quicker Long Bite (20
fps, from 15), finishers of 5 on Phantom Hands and Snapping Jaws (from 3),
a 14 Energy refill and 20° of launch steering. Floating Hands' finisher
stays 3: at 5 too (521 : 513) the CPU behaviour scenarios no longer held.

**A shared test's count corrected.** `cpu-behaviour`'s lead-protection
scenario (C, D) counts how often a CPU ahead late goes in after a free
opponent. It counted a combo following up the CPU's own hit as going in,
though its comment says "initiating, not countering" and the same file's
`watch` already leaves combos out; with #0005's Phantom Hands launching
upward into its air game, that alone failed the scenario at Brutal. It now
leaves out combo follow-ups and strikes against a threat as `watch` does,
and every level passes with room to spare. Its failure messages now count
the pairings it runs (five) instead of saying "of 4".

**Where to tune it**

- `js/data/characters/0005.js`: each attack's damage, launch, timing,
  hitbox and `hits`; the Long Bite's reach; Floating Hands' `airUses`; the
  Deadlights' burst box, `float` seconds and cast; the Red Balloon's
  `behindDistance`, bite and `fear` seconds; Dark Tendrils' `pull`
  (`radius`, `speed`, `offset`) and hitstun; clip rates (`FPS_0005`),
  anchors, the Deflect, `energy.regen`, `launchReaction` and the body.
- The new capabilities' defaults: `float`, `fear`, `gaze` and
  `FLOAT_RISE_SPEED` in `js/game/combat/hit-effects.js`; the CPU's fear and
  feeding values and its pull penalty in
  `js/game/ai/cpu-intelligence/evaluator.js`, its frightened spacing in
  `brain.js`; the drop's colours, size and tremble (`FEAR_MARK_STYLE`,
  `fearMarkRect`, `fearMarkTremble`) in
  `js/game/rendering/fighter-status.js`.

**Code:** `js/data/characters/0005.js`, registered in
`js/data/characters.js`; `js/data/fighter-profiles.js`;
`js/data/cooldowns.js`; the float, the fear and the gaze in
`js/game/combat/hit-effects.js`, `attacks.js`, `projectile.js`,
`offense.js`, `combat-state.js` and `combat.js`, the float's rise in
`js/game/fighters/fighter.js`; the front-only pull in `attacks.js` and
`pull.js`; the drop in `js/game/rendering/fighter-status.js` and
`js/game/arena.js`, the feeding glow in `js/game/rendering/hit-fx.js`; the
CPU in `js/game/ai/cpu-intelligence/` (`capabilities`, `perception`,
`situation`, `evaluator`, `defense`, `brain`); `js/ui/credits.js`,
`js/localization/`.

**Tests:** new `tests/fighters/0005/fighter-0005.test.mjs` (the real PNGs,
scale and anchors, every move's mechanic, the tendrils-into-Deadlights
combo, the CPU against every fighter using every move, names, credits, and
a whole-repository check that the source character is named nowhere),
`tests/systems/float.test.mjs`, `fear.test.mjs` and `gaze.test.mjs`;
`pull`, `hit-effects`, `launch`, `cooldown-policy`, `combat-assist`,
`combo-assist` and `special-abilities` for the new effects and the fifth
fighter; `cpu-behaviour`'s lead-protection count (above); the roster, credits and screens in
`tests/integration/empty-roster.test.mjs`, `discover.test.mjs`,
`settings.test.mjs` and the other fighters' tests (the playable list).
