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

## Adding a named update

When a new piece of work gets a name, add a row to the table and a section in
the same shape: what it added, where to tune it, the code, and the tests.
