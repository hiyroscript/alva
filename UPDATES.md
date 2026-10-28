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
| **Mash Combo update** | branch `claude/gallant-johnson-ovqtek` (no pull request yet) | `7b63c5f` | Five rapid presses set off a twelve-turn automatic series of two close-range strikes; clips no longer stick on one frame |

They were made in that order and build on each other: the effect update
assumes the movement update, and the bounce update assumes both. The Mash
Combo update, much later, assumes the [strict combat
rules](#strict-combat-rules) and the [universal Step-in](#universal-step-in-and-no-attack-steering).

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
  shot out on a long neck, biting whatever it meets from right in front of
  its face out to 198 units: three bites that hold, then a fling of 5),
  Snapping Jaws (a shorter one in the air, from its face out to 118
  units), Phantom Hands (a barrage of ghostly hands, the last straight up)
  and Floating Hands (the same barrage as it `hover`s, once per airtime),
  the Deadlights (a technique, a Special: its maw opens onto the lights,
  and everyone in front who faces it takes 1 and floats helpless for
  1.6 s; 3 s), the Red Balloon (a summon, a Special: a phantom of #0005
  rises out of a bunch of balloons 60 units behind the opponent and bites
  its back, 3, leaving it afraid for 2.5 s; 3 s) and Dark Tendrils (black
  tendrils from its maw, 24 to 324 units, seizing whoever they meet and
  reeling in everyone in front of it, #0005 rooted where it stands). Its
  guard is a thicket of black tendrils; its Deflect a claw swept round. It
  throws no projectile and never heals but by feeding on fear.
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
  - a pull never shoves its owner (`Fighter.drawnBy`, `separateFighters`):
    a fighter it draws, while drawn and while still carried helpless toward
    the owner on the pull's speed, stops against the owner's body instead
    of pushing it back (Dark Tendrils let go of whoever they reel in from
    their far end while it is still rushing in; it used to shove #0005 back
    about 160 units). The same holds for #0001's Blue and Maximum Blue.
    `separate` (`js/game/physics.js`) takes the part of the overlap each
    body moves.
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
#0005 : opponent). Against #0001: Medium 35 : 47, Hard 37 : 49, Brutal
37 : 48. Against #0002: Medium 43 : 46, Hard 44 : 45, Brutal 45 : 42.
Against #0003: Medium 54 : 36, Hard 38 : 46, Brutal 42 : 41. Against
#0004: Medium 59 : 15, Hard 48 : 39, Brutal 47 : 37; 529 : 491 in all,
even at Brutal, a little behind at Hard and ahead at Medium. The first cut
scored 380 : 597: its hits mostly 1-damage holds, and its Long Bite and
Snapping Jaws bit only far out, useless up close (the owner's report).
Heavier finishers and a quicker Long Bite made up for that at first (510 :
496); once both bites reached up close and Dark Tendrils rooted it, those
made it far too strong (581 : 431), so every finisher is back at its first
value and the Long Bite at 15 fps. What stays: a 14 Energy refill and 20°
of launch steering.

**A shared test's count corrected.** `cpu-behaviour`'s lead-protection
scenario (C, D) counts how often a CPU ahead late goes in after a free
opponent. It counted a combo following up the CPU's own hit as going in,
though its comment says "initiating, not countering" and the same file's
`watch` already leaves combos out; with #0005 in the roster, its combos
following up its own hits alone failed the scenario at Brutal. It now
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
`pull.js`, and the pull's hold on whom it draws in `pull.js`,
`separateFighters` (`fighter.js`) and `separate` (`js/game/physics.js`);
the drop in `js/game/rendering/fighter-status.js` and
`js/game/arena.js`, the feeding glow in `js/game/rendering/hit-fx.js`; the
CPU in `js/game/ai/cpu-intelligence/` (`capabilities`, `perception`,
`situation`, `evaluator`, `defense`, `brain`); `js/ui/credits.js`,
`js/localization/`.

**Tests:** new `tests/fighters/0005/fighter-0005.test.mjs` (the real PNGs,
scale and anchors, every move's mechanic, the tendrils-into-Deadlights
combo, the CPU against every fighter using every move, names, credits, and
a whole-repository check that the source character is named nowhere),
`tests/systems/float.test.mjs`, `fear.test.mjs` and `gaze.test.mjs`;
`pull` (the front-only pull, and a pull never shoving its owner),
`hit-effects`, `launch`, `cooldown-policy`, `combat-assist`, `combo-assist`
and `special-abilities` for the new effects and the fifth fighter;
`cpu-behaviour`'s lead-protection count (above); `cpu-intelligence`'s shared
fights on two seeds rather than one (the pull's hold changes how #0001 and
#0002 fight, and on one seed Easy's rarest moves came down to a single
use); the roster, credits and screens in
`tests/integration/empty-roster.test.mjs`, `discover.test.mjs`,
`settings.test.mjs` and the other fighters' tests (the playable list).

## Queued Combo Assist

Not a named update (it can become one if the owner names it). Asked for in
`max`: make fighting more responsive and beginner-friendly without losing
commitment or depth, by letting a repeated Attack 1 / Attack 2 press made
while the attack still plays queue the other attack, instead of being
thrown away. The CPU, its difficulty levels, every cooldown, Energy,
Launch Point, movement and every fighter's moves are unchanged.

**What it changed.**

- **The queued follow-up** (Combo Assist on, the human player only).
  Attack 1 pressed again at any point while Attack 1 plays (startup,
  strike, recovery, an impact freeze) queues Attack 2 to start on the very
  step Attack 1 plays out in full, and the reverse. The attack playing is
  never touched: no cut, restart, replay, second strike or projectile, its
  cooldown once. The follow-up is read from the attack really playing
  (Attack 1 repeated during the Attack 2 its own press made queues Attack
  1), for the place that attack started in, and is tried through the
  ordinary request path (its cooldown, art, airtime, Combat Assist): if it
  cannot start then, it is dropped, never retried or swapped. One at most
  per attack; a held button is one press. Any newer request (another
  attack, a summon or technique, a jump, a Dash, the Shield, the Deflect),
  a hit, a paralysis, an attack ended early (a cut, a landing cancel, a
  bounce, a landed slam), input locked, the Void or a respawn drops it.
  It keeps no timer and is apart from the 0.15 s input buffer, which is
  unchanged. **Intentional change:** a repeat during the attack used to be
  discarded; with Combo Assist off it still is.
- **Natural completion** is now told apart from every other end of an
  attack: `CombatState.finished`, set only when an attack's time reaches
  its end.
- **The ability HUD** lights the queued move's tile (a steady edge, no
  motion; "queued next" for screen readers, in English and French) while
  it waits; its cooldown still shows over it. The touch controls show no
  live move state, so the queue has no marker on a touch screen.
- **Settings › Combat**: Combo Assist's line now reads "Press Attack 1 or
  Attack 2 again, while it plays or just after, to follow up with the other
  attack. Each attack keeps its own cooldown." (French alike). The saved
  `comboAssist` setting and schema are unchanged.

**Where to tune it.** Which buttons alternate: `COMBO_PAIRS` in
`js/game/combat/combo-assist.js`. When a repeat counts and what drops the
queue: `Fighter.noteFollowUp` and `queueFollowUp`; where it is tried in
the step: the end of the combat intents in `Fighter.update`. The queued
tile's look: `.ah-tile.is-queued` in `css/ability-hud.css`.

**Code:** `js/game/combat/combo-assist.js` (`followUpAction`),
`js/game/combat/combat-state.js` (`finished`),
`js/game/fighters/fighter.js` (`comboQueue`, `noteFollowUp`,
`queueFollowUp`, `queuedFollowUp`, the dispatch in `update`, `takeHit`,
`reset`), `js/game/combat/move-status.js` (`moveQueued`, `abilityStatus`'s
`queued`), `js/ui/ability-hud.js`, `css/ability-hud.css`, the string
tables.

**Tests:** new `tests/systems/combo-queue.test.mjs` (every fighter: every
phase, the attack never touched, the same result as the attack pressed on
that step, held buttons, mashing against several kinds of target, the
follow-up read from the attack playing, cooldowns, every early end and
newer request, one move per step, the air, the four Combat Assist / Combo
Assist combinations, the HUD's reading, CPUs, determinism);
`combo-assist`'s test of a press during the attack rewritten for the new
contract (its protections kept: never cut or restarted, never buffered,
nothing with the setting off); `request-devices` (keyboard, touch and a
controller, on the ground and in the air), `ability-hud` (the queued tile)
and `settings` (the new line). Checked in headless Chromium too: Practice
Ground with the keyboard (a double press, a held key, a manual cut, the
Shield after a repeat, mashing; the queued HUD tile) and with touch in
both mobile layouts in landscape (a double tap, a held button).

## Fighting feel: strings, follow-ups and touch

Not a named update (it can become one if the owner names it). Asked for
as four of the suggestions made after the
[Queued Combo Assist](#queued-combo-assist) work: make the two-hit string
land over a chosen Launch Point range, even out the mashing rhythm, show
cooldowns on the touch buttons, and find the phantom press after a long
touch hold. No move, cooldown, damage, Energy or movement value changed,
and the CPU's own play is untouched (every change below is the human
player's, or the touch interface).

**What it changed.**

- **Combat Assist measures a sliding target where its slide ends.** A
  target pushed by a hit slides helplessly in hitstun; measured where it
  was, it was still in reach as the follow-up started and slid out during
  the startup, so the follow-up whiffed by a few units (the cause of most
  failed strings). `slideStop` / `assistTarget` in
  `js/game/combat/combat-assist.js` now measure such a target where its
  slide ends (hitstun friction while the stun lasts, the ordinary
  deceleration after; within a few units of the real stop, never short).
  Strictly additive: when that point is out of reach and no approach can
  get there, the target is measured where it is, as before.
- **The chosen ranges** (default settings, every spacing where both moves
  reach): Attack 1 then Attack 2 lands up to at least 60 Launch Point for
  every fighter (before: as low as 15 for #0004 and 20 for #0002); Attack
  2 then Attack 1 up to at least 30 (before: 15 for #0001), except after
  an Attack 2 that ends in a Base Launch 3 fling meant to end the string
  (#0005's Long Bite), which only has to land up to 15. Measured worst
  cases now: #0001 95 / 60, #0002 70 / 35, #0003 90 / 105, #0004 75 / 35,
  #0005 105 / 15. With Combat Assist off nothing changed (spacing is the
  player's own); Combat Assist never makes a string worse.
- **Mashing rhythm.** The same three presses of Attack 1 gave three
  attacks on #0002 and #0005 but only two on #0001, #0003 and #0004, whose
  shorter Attack 2 ends before Attack 1's 0.5 s repeat delay: the queued
  follow-up was dropped. Now a queued follow-up whose own cooldown alone
  holds it, with no more than the repeat delay left, waits it out in the
  combat buffer (`Fighter.holdFollowUp`) and starts the first step it may
  (0.2 s later on #0001, 0.1 s on #0003 and #0004), still shown as
  queued; any newer request, a hit or input locked drops it, and a longer
  cooldown (3 s, 5 s) still drops it at once. The pause inside a mashed
  Attack 1 / Attack 2 cycle (the repeat delay less the shorter attack,
  16–26 % of the time) is the universal delay's and is kept: retiming an
  attack could only shorten it by slowing that attack, never quicken the
  cycle.
- **Touch buttons show the live move state** (`TouchControls.showStatus`,
  called each frame by Quick Battle and Practice Ground): a cooldown's
  sweep, with seconds for a 3 s or 5 s one, the repeat delay as a faint
  sweep, a move spent for this airtime muted, and Combo Assist's queued
  follow-up lit, read through `abilityStatus` exactly as the ability HUD
  does. No animation; only changes are written. The rings over the
  fighter stay on touch.
- **One press per touch** (bug). The touch controls took a `click` with
  no `detail` as an assistive technology's activation and pressed the
  button again; Chromium's touch emulation sends exactly such a click
  after every tap and long hold, so every touch button (attacks, Jump,
  Shield, the Dash buttons, Classic's Run) pressed twice there. A click
  within 600 ms of a pointer lifting off the controls is now that
  pointer's own and never a second press; a real assistive activation
  still taps. Not yet checked on a physical phone.

**Where to tune it.** The slide's projection: `slideStop` (it reads the
universal `hitstunFriction` and `deceleration`). The chosen ranges:
`tests/systems/basic-strings.test.mjs` (and ALVA_SPEC.md 7.2.4b). The
follow-up's wait: `holdFollowUp` (bounded by `REPEAT_COOLDOWN`). The touch
states: `.tc-btn.is-cooling`, `.is-repeat`, `.is-spent`, `.is-queued` and
`[data-seconds]` in `css/touch-controls.css`. The click window:
`POINTER_CLICK_MS` in `js/ui/touch-controls.js`.

**Code:** `js/game/combat/combat-assist.js` (`slideStop`,
`assistTarget`), `js/game/fighters/fighter.js` (`combatAssistFor`,
`assistPlan`, the approach's `ahead`, `holdFollowUp`, `queuedFollowUp`,
`noteFollowUp`, the buffer's `hold`), `js/ui/touch-controls.js`
(`showStatus`, `paintStatus`, `notePointerEnd`, the assistive click),
`css/touch-controls.css`, `js/screens/battle-screen.js`,
`js/screens/practice-screen.js`.

**Tests:** new `tests/systems/basic-strings.test.mjs`; `combat-assist`
(slideStop's math and against real slides, a sliding target approached
where it stops, the fallback), `combo-queue` (the wait, three presses
being three attacks on every fighter, newer requests during the wait; the
"dropped while cooling" test rewritten for the new contract),
`controls-ui` (one press per touch, the live move state). Checked in
headless Chromium too: Practice Ground in both touch layouts at 844×390
(a single tap one Jab, a double tap the Jab then Red, every button one
press whatever the hold, the queued and cooling buttons drawn), and an
assistive activation still pressing.

## Controller customization and beginner-first layouts

Not a named update (it can become one if the owner names it). Asked for in
`max`: complete controller customization (the right stick configurable on
its own, every button the browser exposes) and a fresh, beginner-first
redesign of the universal and every fighter's recommended controller
layout, without changing any move, mechanic, timing, cooldown, the
keyboard, touch or the CPU.

**What it changed.**

- **Bindings name their stick.** A binding is now `{ button, modifier,
  stick, direction, activation }`: a direction is read on the stick it
  names (left stick, right stick, D-pad, or left stick or D-pad), never on
  whatever moves the fighter, so the two sticks are configured apart and
  the stick that does not move is free for actions. A stick pushed on its
  own can be the input itself (a *stick input*), on any action but Pause and
  Movement, with or without a button held first; directions gained
  `forward` and `back`, read against the fighter's facing. The left
  stick or D-pad source now reads each axis apart (its up never stops
  a run on the stick).
- **The resolver reads each stick apart** (`js/core/controller-resolver.js`):
  a push past half its travel is one press, in the one direction it went
  out, held until the stick comes back under `STICK_RELEASE` (0.35): never
  repeated while held, never pressed again by a wobble, drift near the
  middle never a press, both sticks at once each their own. A held stick
  input (the Fast fall) is held while its axis is past the run threshold,
  as before. A stick held through a menu, a fighter change or a new
  controller is stale until let go, as a button is. A stick input bound to
  the Dash Dashes the way it was pushed. Modifier first, one owner per
  press and ground / air context apply to stick inputs too.
- **Conflicts by physical input** (`profileConflicts`): errors for the same
  input with the same modifier where both apply and neither is the more
  specific (now across sticks: the same side of the same stick, a D-pad
  button beside a stick input on that side, directions on two sticks that
  can both hold) and for the left or right of what moves the fighter (its
  up and down are free now); warnings for a modifier that is another
  action's button and, new, a direction held with a button that is another
  action's stick input on that stick. A registered fighter's layout must be
  free of warnings too.
- **Universal recommended controls**, redesigned together: the left stick
  moves (down in the air fast-falls), Cross / A jumps, **R1 / RB Dashes**
  (was L1 / LB: the right index finger, so the left thumb aims and the
  right thumb never leaves Jump and the attacks), **L1 / LB is the Shield
  held and the Deflect pressed** (was Circle / B: guarding no longer holds
  the right thumb off every attack, and a bumper makes the Deflect crisp),
  Options / Menu pauses. Three face buttons, both triggers and the right
  stick are left to every fighter.
- **Every fighter's layout, redesigned move by move**, one input a move,
  no combination and no direction held with a button: Square / X the quick
  strike on the ground and in the air, Triangle / Y and Circle / B the
  other everyday strikes (strings roll left to right), R2 / RT the ranged
  move, L2 / LT the Special, the right stick up for a move that rises, down
  for one that drives down or plunges, forward for one sent the way the
  fighter faces. #0001: Jab □, High Kick △, Maximum Blue ○, Red R2,
  Unlimited Void L2, Hollow Purple right stick forward; air Floating
  Straight □, High Kick △, Blue ○, Red Kick R2. #0002: One-Two □, Rapid
  Kicks △, Spin Attack ○, Whirlwind R2; air Homing Attack □, Blue Tornado
  right stick up, Bounce Attack right stick down. #0003: Chakra Punch □,
  Heel Drop △, Chakra Haymaker ○, Cherry Blossom Impact right stick down,
  Mystical Palm Technique L2; air Leaping Kick □, Heavenly Foot of Pain
  right stick down. #0004: Dance Combo □, Leek Swing △, Crescent Kick ○,
  Melody R2, World is Mine L2, Ievan Polkka right stick forward; air Air
  Dance □, Leekspin right stick up, Stage Dive right stick down. #0005:
  Claw Swipe □, Long Bite △, Phantom Hands ○, Dark Tendrils R2, Deadlights
  L2, Red Balloon right stick up; air Claw Rake □, Snapping Jaws △,
  Floating Hands ○. Each definition explains its choices; each fighter's
  specification has the table and the reason for every move. The fallback
  for a fighter with no layout is single inputs only (free face buttons,
  triggers, the right stick, then the D-pad and stick clicks).
- **Saved layouts upgraded** (settings version 6): a profile saved under
  version 4 or 5 has each binding converted (its direction on the stick or
  pad that moved the fighter then, so it plays as it did); the player's own
  choices (the bindings that differ from what that fighter recommended
  then: `LEGACY_UNIVERSAL_DEFAULTS` and each definition's
  `controller.previous`) are kept and today's layout fills in the rest
  where that conflicts with nothing, else the whole old layout is kept; a
  profile with nothing of the player's own is dropped, so an uncustomized
  fighter plays with today's layout.
- **Presentation.** The binding dialog captures either stick (a direction
  as a button goes down, or a stick pushed and let go on its own, a button
  held through it as its modifier; drift ignored) and has Stick and
  Direction fields (Button gains None, stick only, for every action that
  allows it); the diagram lights the left or right stick on its own with
  its arrow, a stick input lit as the input, the D-pad's sides by their
  buttons; every phrase names its stick ("Right stick forward", "L2 +
  Right stick up"); the ability HUD's chips show the stick's mark with the
  arrow (R↑, L↓ + □), forward drawn as the side the fighter faces (R→
  turning to R←). New strings in English and French.

**Where to tune it.** The universal defaults (`UNIVERSAL_DEFAULTS`), the
fallback inputs, the direction vocabulary and the conflict rules in
`js/data/controller-profiles.js`; each fighter's layout in its definition
(`controller.layout`; `controller.previous` is history, never tuned); the
stick thresholds (`DIRECTION_DEADZONE`, `STICK_RELEASE`, `RUN_THRESHOLD`,
`DASH_AIM_THRESHOLD`) in `js/core/controller-resolver.js`; the stick marks
and arrows in `js/ui/controller-glyphs.js`.

**Code:** `js/data/controller-profiles.js`, `js/core/controller-resolver.js`,
`js/core/settings.js` (version 6, the upgrade), `js/data/characters/helpers.js`
(`pad`, `flick`, `legacyPad`), each `js/data/characters/<id>.js`
(`controller`), `js/ui/controller-editor.js`, `js/ui/controller-glyphs.js`,
`js/ui/ability-hud.js`, `css/controller.css`, `css/ability-hud.css`, the
string tables, `js/data/fighter-profiles.js` (the review hashes: the
definitions changed, their difficulty and play-style did not).

**Tests:** `controller-profiles` (the new vocabulary, defaults, every
layout's one-input rule and shared language, bindings on every button and
either stick, physical inputs, conflicts across sticks, the upgrade of
saved profiles), `controller-input` (R1 / L1, a Dash into an attack, the
guard dropped into a strike, every fighter's whole layout and shared
universal layout played on the pad, the right stick's presses at their
thresholds, both sticks at once, stick combinations, holds and held stick
inputs, staleness, every universal action remapped), `controller-ui`
(capture on either stick, the text fields, the diagram), `ability-hud`
(stick chips, the facing arrow), `settings` (version 6 and the version 5
upgrade), and the old assertions in `defense`, `down`, `explicit-mouvement`,
`loadout`, `request-devices`, `special-abilities`, `i18n` and the fighter
tests updated to the new layouts. Checked in headless Chromium too, with an
injected standard-mapping DualSense and Xbox pad: the editor and its
diagram, a right-stick capture, and in Practice Ground R1 Dashing, L1
guarding, #0002's Spin Attack on Circle and its right-stick Blue Tornado
and Bounce Attack, #0001's Hollow Purple only when pushed forward, and the
HUD's arrow turning with the fighter. Not yet checked on physical
controllers.

## Controller comfort rules made strict

Not a named update. Asked for by the owner after the layout redesign above:
the comfort of the recommended controller layout is a strict rule for
every fighter, on the roster now and added later, never a preference.

**What it changed.**

- **Written down as a rule** where it governs: `CLAUDE.md`, ALVA_SPEC.md
  7.4a, [adding characters](./docs/characters/adding-characters.md#the-comfort-rules-strict)
  (the ten rules and why each exists), the characters index and the input
  guide. A layout that breaks a rule is redesigned, never the rule relaxed,
  and the universal inputs are never retuned for one fighter.
- **Enforced as the registry loads** (`comfortProblems` in
  `js/data/controller-profiles.js`, run by `controllerLayoutProblems` and
  so by `assertControllerLayout`): one input a move (no button held first,
  no direction held with a button, no hold); only the comfortable inputs
  (`COMFORT_INPUTS`: Square, Triangle, Circle, R2, L2, the right stick up,
  down or forward); Square never empty on the ground or in the air; a
  plunge only on the right stick down and a free-fall move only on the right
  stick; in the air the right stick up only for a move that rises and down
  only for one that plunges. A definition that breaks one never loads.
  The rules a machine cannot judge (input by what the player sees, string
  follow-ups on the face, R2 ranged and L2 Special, the right stick on the
  ground only for a visible direction, alike moves sharing an input) are
  listed as just as strict, for review.
- **The fallback** for a fighter with no designed layout now uses only the
  comfortable inputs (no D-pad, stick clicks or right stick back).

All five fighters already keep every rule: no layout changed.

**Where to tune it.** Nowhere, on purpose: `COMFORT_INPUTS` and
`comfortProblems` in `js/data/controller-profiles.js` are the rule.

**Tests:** `controller-profiles` (every rule refused, for the roster's
fighters and a fighter to come; every playable fighter keeps them all; the
registry runs them).

## Combat feel overhaul and shield walking

> **Shield walking is superseded**: removed for good in
> [Shield walking removed](#shield-walking-removed), where a raised ground
> Shield holds its fighter still. What follows records the walk as it was
> when it was added.

Not a named update (it can become one if the owner names it). Asked for in
`max`: make fighting feel responsive, fluid and continuous (attacks that
no longer plant the fighter, momentum kept through every legal change of
action, Combat Assist that never takes control, a mobility economy that
does not discourage the Dash), without changing any fighter's identity,
timing, hitboxes, damage or cooldown classes; and, added by the owner,
**shield walking**: walking behind a raised Shield, slower than usual, with
no animation of its own, the waving Shield animation running much faster
instead.

**Root causes found** (confirmed in the code, measured with the new
`tests/benchmarks/feel-metrics.mjs` on the same inputs before and after):

- **Attacks planted by default.** The attack defaults were `control: 0`
  and `friction: 1`, and no roster ground attack set `control`: a held
  direction did nothing during an attack, so every ordinary ground attack
  braked a full run to a dead stop (lowest speed 0 for every one, with the
  direction held), and a standing attack could not be moved at all (2 units,
  the step after it ended).
- **Steering coupled to speed.** `steer` used one `control` share for both
  the acceleration and the top speed it steered toward, so a 0.5 aerial
  could never drift faster than half the run.
- **Combat Assist stopped the fighter dead** at the end of its approach
  (`finishCombatAssist` zeroed the velocity: 0 units/s handed into the
  attack after a 1250 units/s approach), and it was on by default.
- **The Dash economy**: 25 Energy a Dash (five in a row empty the bar,
  then about 8 s exhausted) and the attacks' 0.5 s repeat delay borrowed
  for the Dash's reuse.

Not causes, checked and left alone: the land and Shield-release poses
(already pose-only, never holding anyone), the input buffers (attack 0.15
s, jump 0.12 s, coyote 0.1 s, all kept through the impact freeze and
already firing on the first legal step), hitstop (short for light hits,
velocity frozen, never lost) and the ordinary 0.5 s attack repeat delay
(different-move follow-ups and Combo Assist already flow, and the repeat
delay is what keeps a single strike from looping).

**What it changed.**

- **Attack mobility tiers** (`js/data/attack-mobility.js`, new): every
  attack names a tier, `quick`, `medium`, `heavy` or `planted`, chosen
  for what it does (never its name, slot, damage or length), and the tier
  supplies its movement: `momentum` / `airMomentum`, `control` /
  `airControl` (steering authority) and, new, `topSpeed` / `airTopSpeed`
  (the share of top speed that steering builds toward), and `friction`.
  A field the attack writes wins over its tier's. An attack that names no
  tier is `medium`, so nothing defaults to standing still.

  | Tier | control / air | topSpeed / air | momentum / air | friction |
  | --- | --- | --- | --- | --- |
  | quick | 0.8 / 0.9 | 1 / 1 | 1 / 1 | 0.6 |
  | medium | 0.55 / 0.7 | 0.6 / 0.9 | 0.9 / 1 | 0.8 |
  | heavy | 0.2 / 0.4 | 0.25 / 0.6 | 0.6 / 0.9 | 1 |
  | planted | 0 / 0 | — | 1 / 1 | 1 (the old defaults) |

- **Steering decoupled** (`steer` takes a speed share apart from its
  authority; `steerAttack` passes the attack's). Quick strikes keep the
  whole run with a direction held; heavy ones slow to a walk.
- **Every attack classified**, the reason in each definition's comment
  and a table in each fighter's specification: quick: every Jab-like
  strike (#0001 Jab and Floating Straight, #0002 One-Two, #0003 Chakra
  Punch, #0004 Dance Combo and Air Dance, #0005 Claw Swipe and Claw Rake);
  medium: the launchers and everyday kicks, ordinary casts, pull and
  hover aerials, homing recoveries and every Deflect; heavy: finishers,
  long flurries, trap casts and plunges (#0001 Red, Maximum Blue, Red
  Kick; #0002 Rapid Kicks, Bounce Attack, Blue Tornado, Whirlwind; #0003
  Heavenly Foot of Pain, Chakra Haymaker; #0004 Stage Dive; #0005 Long
  Bite); planted: #0002's Spin Attack curl, #0005's Dark Tendrils and its
  phantom's bite. Preserved on purpose: every plunge's and lift's drift
  (`airTopSpeed` = its `airControl`, exactly as before), the hovers' hang
  (`airMomentum`), #0001's High Kick and #0003's Haymaker lunges
  (`friction` 0.6 / 0.7), #0002's Rapid Kicks and #0005's Long Bite
  momentum, the Tendrils' root (`momentum: 0`). No timing, hitbox, damage,
  launch, cooldown or motion changed.
- **Combat Assist**: off for a new player (an aid they turn on; settings
  version 7). A player whose settings were saved before keeps exactly
  what they had (versions 1 and 2, and any older object without a valid
  value, keep it on, as they played: `LEGACY_COMBAT_ASSIST`). The finished
  approach now hands its fighter into the attack at a run (top speed
  toward the target, the horizontal share of its heading in the air; the
  approach's own Dash speed is spent), and the attack keeps its share as
  any attack thrown at a run does. The stale run held through the request
  neither turns nor steers the assisted attack (`Fighter.attackSteer`), so
  it never walks out of its own strike.
- **Shield walking**: a direction held behind a raised Shield walks the
  fighter at `shieldWalkSpeed` (130 units/s, new universal movement value,
  about a third of the run) with the run's acceleration and braking; no
  walk in blockstun; no run or Dash behind it; free of Energy. No new art:
  the held Shield pose stays, and the Shield's wavy ring drifts
  `SHIELD_WALK_WAVE_RATE` (4) times faster while the fighter walks, each
  fighter's ring keeping the lead it gains so its waves never jump
  (`shieldWaveTime`, render-only, in `js/game/rendering/shield-fx.js`; the
  Fighter only reports `shieldWalking`). Every held Shield clip is one
  frame, so the "waving shield animation" is that ring.
- **Jump out of Shield**: a jump press drops a raised Shield and jumps on
  that step, carrying the walk's speed; never in blockstun (the press
  waits in the jump buffer for the stun to end).
- **The Dash economy**: `DASH_ENERGY_COST` 25 → 20 (a Dash, an air dash, a
  Dash cancel), and the Dash's and air dash's reuse timers use their own
  universal `dashRepeat` (0.4 s, was the attacks' 0.5 s). Measured
  variants (regen 12/s): 25 / 0.5 s five Dashes before exhaustion, one per
  2.1 s sustained; 20 / 0.5 s seven, one per 1.7 s; 25 / 0.35 s five in
  1.4 s; 20 / 0.4 s (chosen) seven in 2.4 s, one per 1.7 s. Spamming still
  exhausts within a few seconds; the Dash's speed, length and 0.05 s cancel
  commitment are unchanged, so it stays readable and punishable.
- **The CPU** obeys the same steering. On the ground it holds no direction
  through its own strike, since its predictions play attacks out unsteered
  (`Executor.finish`); its capability model and recovery prediction read
  the new fields (`topSpeed`, `airTopSpeed`, `mobility`).
- **Copy**: Discover's movement guide gains Shield walk (English and
  French); its Dash line now names the right shoulder button (R1 / RB has
  been the default since the controller redesign).

**Measured** (`node tests/benchmarks/feel-metrics.mjs`, same inputs; units
and units/s):

| Proxy | Before | After |
| --- | --- | --- |
| Lowest speed of a quick strike thrown at a run, direction held | 0 | 420 (the whole run) |
| Distance a running Jab carries, held (#0001) | 29 | 133 |
| A standing Jab steered with a direction held (#0001) | 2 | 118 |
| Back-spacing during a running Jab (#0001) | +26 (forward) | -85 (back) |
| Medium strikes held on (#0004 Leek Swing) | 0 → stop, 8 travelled | 252 kept, 108 travelled |
| Heavy strikes from a standstill (#0005 Long Bite, 0.87 s) | 2 | 91 (a slow walk) |
| An aerial's drift held on (#0001 Floating Straight) | 313 | 420 |
| Dash → Attack 1, six steps on | 620 | 970 |
| Combat Assist's speed into its attack | 0 | 372 |
| Dashes in 10 s, spamming | 7 | 9 |
| Ground / air reversal at full speed | 6 / 10 steps | unchanged |
| #0005 Dark Tendrils (planted) | 2 | 2 (unchanged) |

These are responsiveness proxies from automated runs only: **nothing here
has been playtested**. CPU behaviour against the competent reference
shifted with it: at the ledge the CPU's launch share among its
commitments fell from about 0.65 to 0.58 (seeds 3-10, every level), KOs
34-37 of 40 against 36-38. That shift comes from the scripted opponent's
own strikes now steering it out of the corner; with them unsteered the
CPU is back at 0.62-0.74. The test now asks for a majority.

**Not done, and why.**

- **Player platform drop-through**: Down is the natural input, but touch
  had no Down (the joystick reads sideways only and the mobile Down
  button was removed), so it would have been a keyboard- and
  controller-only privilege. Left for the owner, who asked for a touch
  Down button: done in [Touch Down button and platform
  drop](#touch-down-button-and-platform-drop).
- **Directional air dashes**: a direction held with the Dash button breaks
  the controller comfort rules and has no clean touch form; the flat air
  dash is kept.
- **Reversing out of Combat Assist's approach**: the approach lasts at most
  a sixth of a second, and a jump, a Dash, the Shield or another move
  already cancel it.

**Where to tune it.** The tiers in `js/data/attack-mobility.js`; each
attack's tier and overrides in its fighter's definition; `shieldWalkSpeed`
and `dashRepeat` in `js/data/movement.js`; `DASH_ENERGY_COST` in
`js/game/combat/combat-state.js`; `SHIELD_WALK_WAVE_RATE` in
`js/game/rendering/shield-fx.js`; `DEFAULT_COMBAT_ASSIST` and
`LEGACY_COMBAT_ASSIST` in `js/core/settings.js`.

**Code:** `js/data/attack-mobility.js` (new), `js/game/combat/attacks.js`,
`js/game/fighters/movement.js`, `js/game/fighters/fighter.js` (the Shield
walk, the jump out of it, `attackSteer`, `finishCombatAssist`,
`dashRepeat`), `js/data/movement.js`, `js/game/combat/combat-state.js`,
`js/core/settings.js`, `js/game/battle.js`, `js/game/practice.js`,
`js/game/fighters/fighter-controller.js`, `js/ui/settings-dialog.js`,
`js/game/rendering/shield-fx.js`, `js/game/arena.js`, the CPU
(`executor.js`, `capabilities.js`, `prediction.js`, `values.js`),
`js/data/cooldowns.js` (`mobility` classified as routine), each
`js/data/characters/<id>.js`, `js/data/fighter-profiles.js` (the review
hashes: every definition changed, and each rating and play-style
description was rechecked against it and still holds),
`js/localization/strings/fr.js`,
`tests/benchmarks/feel-metrics.mjs` (new), and the specification and
guides.

**Tests:** `attack-mobility` (new: the tiers, resolution, every attack
naming its tier, and for every playable fighter quick strikes keeping the
run, steering in every phase, heavy and planted moves committed, aerials
keeping their drift, refused presses leaving the speed alone, run →
strike → run / jump, plunges' authored drift), `defense` (Shield walking
for every fighter, the jump out of it, blockstun, the ring's faster waves),
`settings` (version 7, the version 6 migration keeping each choice, Combat
Assist off for a new player), `dash` (the 0.4 s repeat, the cost, spamming
running dry), `movement-rules` (authority apart from speed), and the old
assertions rewritten for the new rules in `movement`, `moves-0001`,
`combat-assist` (the handoff, the assisted attack equal to one thrown at a
run, the defaults), `combo-assist`, `energy`, `combat-rules`,
`air-mouvment`, `cpu-behaviour`, `practice-ground`, `quick-battle`,
`battle-screen`, `discover` and `i18n`. Determinism at 30, 60 and 144 fps
(`roster-matrix`) passes unchanged. Checked in headless Chromium too: in
Practice Ground with a fresh profile (Combat Assist off), L + D walks #0001
behind its Shield at 130 units/s in its held pose with the ring drawn,
Space jumps straight out of it, and a running Jab with D held keeps 420
units/s throughout; no page errors. Not yet played by hand, on a
controller or on a phone.

## Touch Down button and platform drop

Not a named update (it can become one if the owner names it). Asked for
by the owner after the combat feel overhaul: "Add a down button for touch
controls", which unlocks the player platform drop that overhaul had left
undone, and a decision on the CPU's ledge statistic (below).

**What it changed.**

- **A touch Down button** in both touch layouts: a small round button with
  a down chevron at the far left of the lower-left cluster, level with the
  stick's middle (Joystick) or the Left / Right arrows' (Classic Buttons),
  the place the owner chose for the Joystick layout's down arrow before it
  was removed. Held, it holds `down` exactly as S / ↓ or the left stick
  held down: the fast fall in the air, and on a platform the drop below.
  The joystick still reads sideways only. Classic's sliding Run arrows
  never take its pointer, and it never slides into them. The cluster
  moves right by the button's width and a gap (`--tc-down-room`). The
  touch layout editor lists it in both schemes (id `down`): a layout
  saved while the old down arrow existed gets its old position back.
  Labelled Down / Bas.
- **The platform drop**: a fresh Down press while standing on a one-way
  platform drops the fighter through it (S / ↓, the left stick pushed
  down or the player's own Fast fall binding, the touch Down button: one
  press, never a combination). Held
  Down never drops: a fast fall that lands on a platform stands on it,
  and Down must be let go and pressed again to drop. It needs a fighter
  free to act and not behind its Shield (no drop out of an attack, a stun,
  a paralysis, the Shield or a Dash); a jump pressed on the same step
  jumps. The main floor, solids and a platform whose `dropThrough` is
  false (Sol-Noir's water-tower deck) never drop; Asperitas's moving
  clouds do. The platform is ignored for `dropThroughTime` (0.28 s, as
  before), then solid from above again. Movement is unchanged otherwise:
  held Down still never slows or stops a walk, a run or a Dash.
- **The CPU** never presses Down on the ground: it plans no drop (it
  walks off a platform's edge instead, as before), so its route-finding
  and predictions are untouched. It still fast-falls in the air.

**The CPU ledge statistic, left as it is.** After the combat feel
overhaul, the CPU's share of launching moves when its opponent is near
the ledge dropped from about 0.65 to 0.58 in the automated benchmark.
The CPU itself did not get worse: with the scripted test opponent's
strikes played unsteered (as before the overhaul) it is back at 0.62 to
0.74. What changed is the opponent, whose own strikes now steer it out
of the corner. Teaching the CPU to predict steered attacks would mean
reworking its prediction layer (a large, risky AI change) for a
statistic about a scripted opponent, so it was left alone; the test asks
for a majority.

**Where to tune it.** The button's size and place: `.tc-down` and
`--tc-down-room` in `css/touch-controls.css`; its icon `ICONS.down` in
`js/ui/icons.js`. How long a dropped platform stays ignored:
`dropThroughTime` in `js/data/movement.js`. Which platforms allow it:
each platform's `dropThrough` in `js/data/maps.js`.

**Code:** `js/ui/touch-controls.js` (the button, both schemes, the
editor's `controlElement`, Classic's pointer guard),
`css/touch-controls.css`, `js/ui/icons.js`, `js/core/touch-layout.js`
(`down` in both schemes' ids), `js/game/fighters/fighter.js` (the drop on
a fresh press), `js/game/ai/cpu-intelligence/executor.js` (no Down on the
ground), comments in `js/core/input-manager.js`, `js/data/maps.js`,
`js/data/movement.js`, `fighter-controller.js` and `stage-model.js`, and
the specification and guides (`ALVA_SPEC.md`, `docs/systems/input.md`,
`docs/systems/movement.md#platform-drop`, `docs/gameplay/stages.md`).

**Tests:** `drop-through` (new: every playable fighter dropping to the
floor, held Down never dropping, the floor, a deck that forbids it and a
solid never dropping, no drop out of an attack, a stun, a paralysis, the
Shield or a Dash, a jump pressed with it, the drop's window, a moving
cloud, every device on the real InputManager, the CPU never pressing Down
on the ground), and `down`, `controls-ui`, `touch-layout`, `battle-screen`,
`practice-ground` and `i18n` updated for the button. Checked in headless
Chromium too, on a phone-sized touch screen in a Quick Battle on
Sol-Noir: in both layouts the Down button sits at the far left, level
with the stick's or the arrows' middle; a touch on it drops #0001 through
the overpass to the rooftop below, and the water-tower deck holds; on a
desktop, S drops it through the scaffold and no touch controls show; no
page errors. Not yet played by hand on a phone or a controller.

## #0006, three sisters as one fighter, and ensembles

Not a named update (it can become one if the owner names it). Asked for
as: study the repository, read `character_rule` and `max`, and add
character #0006 from a supplied sprite sheet. `max` asked for a fighter
that is three characters functioning together as ONE: one controller, one
body, one hurtbox, one Launch Point, one Energy bar, one Shield, one combat
state, three individually drawn and animated members always present
together; a move performed by one member while the other two step back,
two- and three-member combinations only when written as such, the Deflect
by one member alone; no companions, followers, summons or switching. It
also said not to design any attack yet, to leave the fighter unplayable
until it meets the playable-character requirements, and to identify what
remains. `character_rule` was not touched; the characters are named
nowhere.

**What it added**

- **Ensembles**, a shared capability any fighter may opt into: a fighter
  drawn as several members (`ensemble` in its definition;
  `js/data/ensemble.js` for its data and rules, `js/game/rendering/ensemble.js`
  for its art at runtime). Members, back to front, each with an id, a
  `home` in the group and clips of her own (`<id>_<codename>_<member>_<frame>.png`);
  every member plays the fighter's state on the same fixed step; a move
  names who performs it (`members` on an attack, a technique or the
  Deflect), a single performer stepping to the fighter's origin while the
  others line up behind and everyone glides home after (`retreat`,
  `spacing`, `glide`, a move's own `formation`); an idle float on each
  member's own beat. One fighter throughout: one Fighter, body, hurtbox,
  combat state and controller; a move is one move however many perform it.
  Presentation only, advanced on fixed steps and drawn between them. The
  registry refuses a broken ensemble (`assertEnsemble`).
- **The Fighter, the Arena and the menus** build and draw any fighter the
  same way: `buildFighterSprites` and `createAnimator` (a SpriteSet and a
  SpriteAnimator, or an EnsembleSprites and an EnsembleAnimator),
  `fighterParts` (what is drawn: one part, or one per member) for the
  fighter, its hit flash and its speed trail; the roster's preview,
  Select Stage's preview and the HUD portrait draw the group. The Fighter
  passes each step's performers (`performedMove`), its art's facing
  (`visualFacing`) and its interpolation to the animator. An ordinary
  fighter is drawn exactly as before.
- **A fighter whose moves are still to come**: an unplayable fighter with
  no move at all (no `actions`, `attacks`, `summons`, `techniques` or
  `projectiles`) is not held to the loadout rules yet; the moment it has a
  move, or is made playable, every rule applies.
- **#0006** in roster slot 06, `available: false`: three members, pink in
  the middle hovering 14 art pixels over her sisters, green 19 behind and
  blue 19 in front; 72 frames cut at 1× from the sheet (the flat grey
  background (70, 71, 71) made transparent, nothing redrawn), every
  universal clip for each (idle, a low flight for the run, a rise, a drop,
  a landing, a dazed hurt, a spinning mid-air hurt, a force-field bubble
  for the Shield, the Dash and the air dash), green's whirl for the
  Deflect, which she alone performs. One collider (40 × 84), pushbox (52)
  and hurtbox (`{ -30, -92, 60, 92 }`) round the group; the group 57 art
  pixels (96.5 units) tall at home. No moves, ability names, touch buttons
  or Discover profile yet; its controller layout is `{}`. Credited to the
  sheet's maker, NotEverything123, linked to where it was found, with the
  credits the sheet gives (Cosbydaf, Kenshin Himura, Misse-the-cat).
- **The naming contract** (`codename_rule`) gained the member child key.

**What remains before #0006 is playable**: its moves (from its canon, at
least attack1 and attack2 with their mid-air versions, each naming its
performer(s), their art cut from the sheet under each performer's own
codenames), its controller layout by the comfort rules, its touch buttons,
ability names and descriptions in both languages, its Discover profile, and
its balance against the roster.

**Where to tune it.** The formation and its motion: `ensemble` in
`js/data/characters/0006.js` (`home` per member, `retreat` 18, `spacing`
18, `glide` 260, `float` 3 art pixels every 1.4 s); the shared defaults
`ENSEMBLE_DEFAULTS` in `js/data/ensemble.js`; how fast the float fades
(`FLOAT_FADE`) in `js/game/rendering/ensemble.js`. Its body and Deflect:
`collider`, `pushbox`, `hurtboxes` and `deflect` in its definition.

**Code:** `js/data/ensemble.js` and `js/game/rendering/ensemble.js` (new),
`js/data/characters/0006.js` (new), `js/data/characters.js` (registration,
`assertEnsemble`, member frames), `js/data/characters/helpers.js`
(`memberFramePath`, `memberFrames`), `js/data/loadout.js` (clips read from
a move's performers; moves still to come), `js/game/fighters/fighter.js`,
`js/game/arena.js`, `js/game/rendering/hit-fx.js`, `js/core/app.js`,
`js/ui/fighter-roster.js`, `js/ui/stage-preview.js`, `js/ui/credits.js`,
the English and French strings, and the specification and guides
(`ALVA_SPEC.md`, `docs/characters/0006.md`, the character system,
rendering, combat, adding a fighter, testing, module responsibilities).

**Tests:** `ensemble` (new: the rules and every broken shape refused, the
loadout waiting for moves still to come, the formation, one Fighter and one
combat state, every member on the fighter's state on the same step, moves
of one, two and three members as one move, the Deflect of one, a wide
strike landing once, the idle float, the facing, determinism at 30, 60,
75 and 144 Hz, the parts drawn, an ordinary fighter untouched), on a
test-only fighter (`tests/fighters/fixtures/ensemble-fighter.mjs`);
`fighter-0006` (new: registration, the real PNGs, all three always drawn
and moving together, hurt and launched together, one hurtbox, the Shield,
green's Deflect turning a projectile back, both facings, the Void and the
respawn in a real Battle, the camera, the CPU, credits, the characters
named nowhere); `codenames` (member file names), and `empty-roster`,
`settings`, `i18n`, `loadout`, `combat-rules` and `cooldown-policy`
updated for a sixth registered fighter with no moves yet. Checked in
headless Chromium too: idle, run, jump, fall, Dash, Shield, turning, a
single performer, a pair, all three, green's Deflect, a hit and a launch,
and (in a throwaway local copy with #0006 made playable with test moves)
the roster slot and preview, the HUD card and Practice Ground; no page
errors. Not yet played by hand.

## #0006 playable: its moves

Not a named update (it can become one if the owner names it). Asked for
as: keep the loadout rule as it is (a fighter has at least two attacks; the
exception for a fighter whose moves are still to come was a one-time one),
finish #0006 and open a new pull request. `character_rule` was not
touched; the characters are named nowhere.

- **The exception is gone.** `loadoutProblems` holds every fighter to the
  loadout rules again, playable or not: an ensemble with no moves, or one
  numbered attack, is refused like any fighter (`ensemble` tests it).
- **#0006's moves**, each from the three sisters' canon and performed by
  the sister whose power it is (`members`): pink's **Power Punch** (a jab
  that holds, a cross), **Heat Vision** (a technique: a beam from her eyes,
  1500 units/s, the fastest shot in the roster) and **Ice Breath** (a
  technique, its Special: a freezing gale, `paralyze` 1.4 s, every 3 s);
  green's **Tornado Spin** (a `roll` that `pull`s whoever is near,
  `carry`s them through four turns and sweeps them up) and **Flying
  Punch** (its finisher: 5, Base Launch 3, once per airtime); blue's
  **Flying Kick** and **Sonic Scream** (a technique: a wave that `carry`s,
  `repel`s shots and shoves a Shield, `blockPush`); and all three's
  **Triple Strike** (a `homing` dash locking on within 220 units, one hit
  for 5 however many draw it, on the ground and once per airtime). 54 new
  frames of the sisters cut from the sheet under each performer's
  codenames, and 5 of the beam and the wave (`attack3_object`,
  `attack5_object`); a technique's cast
  and release share its codename's files (`0006_attack4_pink_1` ...).
  The sheet's fireballs stay unused: not a power of theirs.
- **Playable**: `available: true`, its controller layout by the comfort
  rules (Square the Power Punch / Flying Kick, Triangle the Tornado Spin /
  Flying Punch, Circle the Triple Strike, R2 Heat Vision, L2 Ice Breath,
  the right stick forward the Sonic Scream), touch buttons, names and
  descriptions in English and French, a Discover profile (3/5, a
  versatile trio for every range), its `energy` (14 / s) and its
  `launchReaction` (as #0003's and #0005's).
- **A body of a single fighter's size**: collider 32 × 84, pushbox 36,
  hurtbox `{ -18, -88, 36, 88 }` (it was 40 × 84, 52 and 60 wide round the
  whole group: the easiest target in the roster, and held out of its own
  Deflect's reach in a mirror match).
- **Touch buttons and ability tiles of an ensemble** show the move's own
  art from its first performer (`clipFor` in `js/data/ensemble.js`, read
  by `previewFrame` in `js/data/ability-preview.js`); before, they found no
  frame and fell back to a glyph.

Found on the way, in #0006's own data: its Sonic Scream's wave touched the
floor and was gone the step it appeared (a shot meeting a solid block,
the main floor included, is gone); its Flying Kick and Flying Punch had
step-ins, which move a fighter only on the ground; and with no
`launchReaction` it never tumbled, so the CPU judged it never in danger.
`adding-characters.md` now warns of the first two.

**Balance** (seeded CPU-vs-CPU Watch Mode battles at equal levels, Desert
and City, both sides, six seeds: 120 matches a level): #0006 wins 0.51 at
Medium, 0.43 at Hard and 0.36 at Brutal, the low end of the roster at the
higher levels (the others 0.45 to 0.63 over the same kind of runs);
strongest against #0004, weakest against #0001 and #0005. As first
written it won 0.85 at Hard (a Triple Strike locking on from 280 units
after a twelfth of a second, for 5 in a 70 × 80 box); the steps from there
are in [#0006's specification](docs/characters/0006.md#balance).

**Where to tune it.** Every value is in `js/data/characters/0006.js`: the
moves' phases are whole frames of their clips at `FPS_0006`; the Triple
Strike's lock-on is its `motion` (`range` 220); Ice Breath's freeze its
`burst.hit.paralyze`; the beam and the wave are its `projectiles`.

**Code:** `js/data/characters/0006.js`, `js/data/loadout.js` (the
exception removed), `js/data/ensemble.js` (`clipFor`),
`js/data/ability-preview.js`, `js/data/fighter-profiles.js`, the English
and French strings; the specification and guides (`ALVA_SPEC.md`,
`README.md`, `docs/characters/0006.md`, the roster, adding a fighter, the
character system, combat, defense, Energy, input, launch, movement,
rendering, the AI, module responsibilities, testing).

**Tests:** `fighter-0006` rewritten (registration and kit, performers,
names, touch buttons, controller layout, the 131 files, every move's
mechanic, the CPU playing its whole kit); `ensemble` (the exception's test
replaced by its refusal); the roster-wide tables (`cooldown-policy`,
`special-abilities`: seven Specials, `controller-profiles`: no layout of
settings version 5 for a fighter added since, `empty-roster`, `discover`,
each fighter's roster list); and the shared tests that read every playable
fighter made to read an ensemble's clips (`combat-assist`, `combo-assist`,
`move-cancel`, `universal-movement`), skip a homing dash where Combat
Assist never serves one, read a pair of attacks on the ground and in the
air (`combo-queue`) and count a fighter as back on the stage while its
feet are on it (`cpu-intelligence`). Checked in headless Chromium: every
move in Practice Ground (beam, gale and freeze, wave, tornado, the Triple
Strike on the ground and in the air), the ability tiles and the phone
layout's touch buttons showing each sister's art; no page errors. Not yet
played by hand.

## Shield walking removed

Not a named update (it can become one if the owner names it). Asked for in
`max`: remove Shield walking for good, for every fighter, every device and
the CPU, so that raising the ground Shield plants the fighter until it is
lowered (the stationary guard asked of Warriors of the Universe), without
touching anything else about the Shield, combat, movement or physics. It
undoes the walk added in [Combat feel overhaul and shield
walking](#combat-feel-overhaul-and-shield-walking). `character_rule` was
not touched.

**What it removed.**

- **The walk** (`js/game/fighters/fighter.js`): the Shield's movement
  branch no longer steers toward a share of top speed; a raised Shield
  steers with no direction (`moveHorizontal(0, …)`), whatever is held.
  `Fighter.shieldWalking` is gone, with its resets and the jump's.
- **Its value** (`js/data/movement.js`): `shieldWalkSpeed` (130) and its
  section, so `MOVEMENT_FIELDS` and the registry's refusals no longer know
  it; nothing replaces it (no zero, no other speed).
- **Its look** (`js/game/rendering/shield-fx.js`): `SHIELD_WALK_WAVE_RATE`,
  `shieldWaveTime` and its per-fighter `WeakMap`. The ring waves on the
  Arena's effects clock as it did before the walk, its interior and rim on
  the same waves, still with reduced motion.
- **Its copy**: Discover's Shield walk card (`MOVEMENT_GUIDE`'s
  `shieldWalk`) and its French (`movement.shieldWalk.name` /
  `.description`).

**What it changed.**

- **The raise plants the fighter.** The step the Shield goes up, the
  fighter's own sideways speed stops (a run, a Dash's burst, an attack's
  slide): no slide behind it. Its own means the fighter was free on its
  last step and nothing has hit it or drawn it in since (`ownSpeed` in
  `Fighter.update`); speed an outside force gave it (a pull's drag, a
  launch's or a stun's slide) runs down behind the Shield instead, as a
  block's push does. Without that distinction a Shield raised while a
  pull drags its fighter stopped dead, and a perfect Shield against
  #0001's Maximum Blue came too late (`shield-protection` caught it). A
  Shield press that raises nothing (a stun, exhaustion, no art, a Dash,
  the air) stops nothing.
- **Kept as it was**: a block's push (`blockPush`, set after the Shield is
  up) shoves it and runs down under the normal deceleration, pushboxes
  still part fighters, a moving platform carries it (its carry is not
  velocity), turning behind it, the jump out of it (now straight up, with
  only what is left of a push), the jump buffer through blockstun, the
  perfect Shield, its Energy costs, blockstun, hitstop, the stall, every
  pose and the aerial Deflect. The CPU needed no change: it never held a
  direction behind its Shield.
- **Copy**: How to Play's Shield and the controller's Shield line now say
  that a raised Shield holds you in place (release it to move, or jump out
  of it); English and French.
- **Documents**: the specification (universal movement, momentum, the
  Shield, its look, the Energy table, the controls), defense, movement
  (its Shield section is now "The Shield holds still", and the Shield is
  named as the one deliberate stop among the momentum rules), Energy,
  input and testing.

**Where to tune it.** Nowhere, on purpose: there is no Shield movement
value. The push a blow gives a Shield is its `blockPush`; how fast that
runs down is the universal `deceleration`.

**Code:** `js/game/fighters/fighter.js`, `js/game/fighters/movement.js`
(a comment), `js/data/movement.js`, `js/game/rendering/shield-fx.js`,
`js/game/arena.js` (a comment), `js/localization/strings/en.js` and
`fr.js`, and the documents above.

**Tests:** `defense` replaces the walk's tests with A to M: the Shield
raised standing (seconds of Left, Right and both, turning only), raised at
a run (stopped on that step, either way, a Dash's burst too), presses that
raise nothing stopping nothing, a pull's drag running down, directions
mashed, let go into a run from rest, the jump out of it and the air after
it, blockstun with a jump pressed early and within the buffer, a block's
push alike with a direction held either way, a moving cloud carrying it,
every playable fighter (#0006's ensemble drawn still round it), the CPU's
own inputs and six seeded CPU fights (never stuck, acting again after
every Shield), the keyboard, touch and a controller step for step alike,
30, 60 and 144 fps alike, and the ring (no faster waves, no clock of its
own, interior and rim on one wave). Against the old code 19 of them fail.
`momentum` now names the Shield the one deliberate stop (its overspeed
check no longer runs a Shield); `discover` and `i18n` read the new copy
and the card's absence. `jokull`'s full matches check five seeded matches
instead of three: with the CPUs' paths moved by this change, none of the
three broke the ice, though over twelve other seeds as much ice broke
before and after (7 sections each). Checked in headless Chromium too: in
Practice Ground, run, raise the Shield with the run still held, hold
Right then Left, let go, with the keyboard (L, D, A, then Space out of
it), a stubbed DualSense (L1, the left stick) and real touches on a
phone-sized page (the stick and the Shield button): the run stopped on
the raise, not a unit moved in two seconds, the fighter turned, it ran
again once the Shield was down, the ring drawn; no page errors. Not yet
played by hand.

## Combat Assist and Combo Assist removed, Automatic turn-around

Not a named update (it can become one if the owner names it). Asked for in
`max`: remove Combat Assist and Combo Assist from the game entirely, and
add one Combat setting in their place, **Automatic turn-around**, on by
default for every player (those upgrading included), which makes the
human player's fighter face the closest valid enemy and does nothing
else. It undoes Combat Assist (from the early combat work, last changed in
[Fighting feel: strings, follow-ups and
touch](#fighting-feel-strings-follow-ups-and-touch)) and Combo Assist
([Combo Assist, move cancellation and controller
art](#combo-assist-move-cancellation-and-controller-art), [Queued Combo
Assist](#queued-combo-assist)). Those entries stay as the history of what
was. `character_rule` was not touched.

**What it removed.**

- **Combat Assist**: `js/game/combat/combat-assist.js` and everything of it
  in the Fighter (`combatAssist`, `combatAssistOn`, `combatAssistFor`,
  `assistPlan`, `tryCombatAssist`, `assistIntents`, `stepCombatAssist`,
  `finishCombatAssist`, `cancelCombatAssist`, the `assist` visual state,
  its movement branch, its fast-fall and Energy exceptions, its wall and
  ground checks), `tryAction`'s `assist` / `toward` options, the attack
  record's `turnHold` and `attackSteer`, the arena's, Practice Ground's
  and the hit effects' references (the speed trail is a Dash's again
  only).
- **Combo Assist**: `js/game/combat/combo-assist.js`, the Fighter's
  `comboAssistOn`, `comboAction`, `comboQueue`, `noteFollowUp`,
  `queueFollowUp`, `holdFollowUp`, `queuedFollowUp`, the buffer's `hold`
  and `button`, and `CombatState.finished` (only the queue read it).
- **The queued look**: `moveQueued` and `abilityStatus`'s `queued`, the
  ability HUD's and the touch buttons' `is-queued` (their styles too) and
  the "queued next" wording.
- **Settings**: both options, their strings (English and French, the
  Energy word in Combat Assist's line included) and their defaults
  (`DEFAULT_COMBAT_ASSIST`, `LEGACY_COMBAT_ASSIST`, `DEFAULT_COMBO_ASSIST`).

**What stays.** The player's move cancellation (`playerMayCut`), the press
for the attack already playing being no request (`repeatsMove`: never a
cut, a restart or a kept press), the 0.15 s buffer, hit-cancels, Dash
cancels, every cooldown, `isMeleeAttack` / `isRangedAttack` /
`attackReach` (the CPU reads them), and every move's own movement.

**What it added.**

- **Automatic turn-around** (Settings › Combat, the section's only setting:
  "Automatically makes your fighter face the closest enemy.", On
  (Default) / Off; French "Retournement automatique", "Oriente
  automatiquement votre combattant vers l’ennemi le plus proche.",
  Activé / Désactivé). The player's controller carries it
  (`PlayerController`'s `automaticTurnAround`, on unless given false);
  `Battle` and `PracticeSession` take it as a session starts. The
  Fighter's `automaticTurnAround` is true only for a `player`-kind
  controller with it on, so no CPU, dummy or other controller ever has it.
- **Targeting** (`js/game/fighters/turn-around.js`): `isValidEnemy`,
  `closestEnemy` (squared world distance, ties to the first listed) and
  `facingToward` (1, -1, or null at the same x), over `Fighter.enemies`
  (the opponent today; a reused list).
- **The facing** (`js/game/fighters/fighter.js`): `turnAroundFacing`, read
  through `attackTargetFacing` by the existing attack orientation
  (`faceAttackTarget`, `updateAttackFacing`, which the CPU's
  `attackFacing` already used) and by `updateFacing` for every other
  state; `facingLocked` (a stun, a paralysis, a technique, a summon's
  startup, a Dash, a motion attack) holds it; `settleFacing` replaces the
  arena's post-movement `updateAttackFacing` pass, so the player's facing
  is settled after both fighters move too. Off, the manual rules are
  exactly what they were.
- **Settings** version 8 (`automaticTurnAround`); versions 1 to 7 migrate,
  every other choice kept (language, Mobile Controls, touch layouts,
  controller profiles and their upgrade), both old assist values dropped
  and Automatic turn-around on.

**Strings by hand.** The basic two-hit strings' promised ranges were only
ever met with Combat Assist's approach closing the gap the first hit
opened (the old test asserted them with it on). No move was retuned: the
test now pins what holds by hand, Attack 1 into Attack 2 hit-confirmed up
to 40 Launch Point for every fighter and Attack 2 into Attack 1 on a fresh
target, and the specification says so (7.2.4b).

**Where to tune it.** Nowhere: there is no turn-around value. Which
enemies count is `isValidEnemy`; which moves keep their facing is
`facingLocked`.

**Code:** `js/game/fighters/fighter.js`, new `js/game/fighters/turn-around.js`,
`js/game/fighters/fighter-controller.js`, `js/game/arena.js`,
`js/game/battle.js`, `js/game/practice.js`, `js/game/combat/combat-state.js`,
`js/game/combat/move-status.js`, `js/game/combat/attacks.js` (a comment),
`js/game/rendering/hit-fx.js`, `js/core/settings.js`,
`js/ui/settings-dialog.js`, `js/ui/ability-hud.js`, `js/ui/touch-controls.js`,
`js/screens/battle-screen.js`, `js/screens/practice-screen.js`, both string
tables, `css/settings.css`, `css/ability-hud.css`, `css/touch-controls.css`;
removed `js/game/combat/combat-assist.js` and `js/game/combat/combo-assist.js`.
The specification (6.10, 7.2.2, 7.2.3, 7.2.4, 7.2.4a, 7.2.4b, 7.2.5, 7.2.8,
7.3, 7.4) and the documents (README, combat, movement, input, energy, AI,
the battle and practice guides, the module map, testing, the fighter
pages).

**Tests:** new `tests/systems/turn-around.test.mjs` (on by default, either
side, a crossing, standing, running away and in the air with the movement
unchanged, Off, no enemy, one out of play, overlapping x, several enemies
and ties, attacks, techniques and summons aimed, Dashes, air dashes and
every motion attack keeping their course, stuns, released projectiles,
never a CPU, a Quick Battle CPU's aim its own, Practice Ground's swaps and
removal, respawn and restart, 30 / 60 / 144 fps) and
`tests/systems/direct-input.test.mjs` (each button its own move, a repeat
nothing, mashing, a press out of reach whiffing with the same course as
with no target, melee and ranged, nothing of either assist left: the
generic parts of the removed suites); removed `combat-assist`,
`combo-assist` and `combo-queue`; `basic-strings` rewritten for strings
made by hand; `settings` (schema 8, the 1 to 7 migrations, the Combat
section, navigation), `i18n`, `ability-hud`, `controls-ui`,
`request-devices`, `battle-screen`, `quick-battle`, `practice-ground`,
`watch-mode` (the player's setting never reaching a Watch CPU),
`facing`, `move-cancel`, `controller-input`, `ui-consistency` and the
`player-rig` helper (the arena's facing pass) updated; the feel-metrics
benchmark lost its assist handoff.

### Follow-up: never walking backwards

Asked for after the above: Automatic turn-around turns the fighter only
when it is not moving left or right. Before, a player running away from
its enemy ran backwards, still facing it. Now, while a direction is held,
or while the fighter is still sliding on the ground from a run or a Dash
(faster than `TURN_SPEED`, the 20 units/s past which a run turns a fighter
by hand), the manual facing rules apply: it faces the way it goes. Once
it stops, or in the air with nothing held, it turns to the closest enemy
as before. An attack pressed or held with a direction faces that
direction, as by hand. Movement is unchanged either way.

**Code:** `js/game/fighters/fighter.js` (`TURN_SPEED`, `movingSideways`,
`turnAroundFacing`, `updateFacing`, `settleFacing`); the specification
(7.2.2, 7.2.4a), README, combat, movement and testing documents.

**Tests:** `turn-around`: running either way faces the way it runs (the
same facing and movement as with it off), sliding keeps it, stopping turns
it; the air with and without a direction held; an attack with a direction
held; the Dash and the air dash faced again once the fighter has stopped.

## Strict combat rules

Not a named update (it can become one if the owner names it). Asked for in
`max` as strict, permanent, universal gameplay rules that supersede the
older rules below wherever they disagree: the [Combo Assist, move
cancellation and controller art](#combo-assist-move-cancellation-and-controller-art)
entry's player move cancellation, the 0.5-second repeat delay of the
[combat feel overhaul](#combat-feel-overhaul-and-shield-walking) and every
earlier entry that mentions it, special cooldowns starting "on
acceptance", the Dash's 20 Energy, and every statement that attacks,
projectiles, summons or techniques never spend Energy. Those entries stay
as the record of what each change was at the time.

**What it changed.**

- **No broad attack cancellation.** The behaviour PR #114 (`85fd4af`)
  added, a human player's new valid request cutting its own attack short
  in any phase, hit or not, is removed (`Fighter.playerMayCut`,
  `shieldPressedAt` and the attack record's `startedAt` are gone; the rest
  of that commit, removed since or not, is untouched). An attack that can
  harm is cut short only by an established, legitimate window: its
  authored, hit-confirmed `hitCancel` (into another attack, a jump, a Dash
  or the Deflect), a Dash past its `dashCancelTime`, the landing cancel, a
  slam's or a plunge's own contact. A request made during it waits in the
  buffer and comes out as it ends. `Fighter.cutAttack` now ends only a
  move that may be cut, whoever calls it. Nothing ever cuts into itself
  (the CPU's old "once its repeat delay has run since it became
  cancellable" self-cancel and `CombatState.cancellableFor` are gone), and
  `repeatsMove` (the press for the move already playing is no request)
  applies to every fighter.
- **Non-attacking moves and the Deflect are cancellable.** A move whose
  classification is no attack (a heal of its own, a pending attack) and,
  by explicit rule, the Deflect (attack and defense: `yieldsToRequests` in
  `js/game/combat/offense.js`, recorded as each definition's `freeCancel`)
  give way to any valid request (`Fighter.moveYields`, folded into
  `canFollowUp`): another attack, a special on the ground, a jump or air
  jump, a Dash or air dash, a fresh Shield press, from the step after the
  move began, never in a forced state, never into itself, and only once
  the replacement is known to start. A cancelled Deflect strikes and turns
  back nothing more (what it turned back stays turned) and keeps its 15
  Energy; a heal cancelled before it lets go heals nothing and starts no
  cooldown. Harmful techniques and summon startups keep their commitment.
- **No 0.5-second repeat delay.** `REPEAT_COOLDOWN` is gone: an ordinary
  move has no cooldown at all (`COOLDOWN_CLASSES.ordinary` is 0, a
  declared `cooldown` must equal the policy exactly). Only 3 s
  (exceptional) and 5 s (ten-damage) remain, classified exactly as before.
  No hidden timer replaces it; the Dash's own `dashRepeat` (0.4 s) is a
  movement timer and stays.
- **Cooldowns start on release.** A 3 s or 5 s cooldown starts once, as
  its move is released (`RELEASE_EVENTS` in `js/data/cooldowns.js`): a
  strike as it goes live, a string as its last strike goes live, a throw
  as its projectile spawns (`attackReleaseAt`, `CombatState.releaseAttack`),
  a slam as its impact lands (`Fighter.landSlam`), a technique as its cast
  lets go (`Technique.takeCooldown`), a summon as its clone appears
  (`spawnClones`). Interrupted before then, none starts; released, it runs
  on whatever follows.
- **One Energy price, 15.** `js/data/energy.js` holds every price:
  `ENERGY_COST` (15) for the Dash, air dash and Dash cancel (was 20), the
  Deflect, each block, and each ordinary move that creates a construct (a
  projectile, a burst, a clone: `createsConstruct`,
  `constructEnergyCost`), paid once as it starts, never refunded. Moves
  with a 3 s or 5 s cooldown pay nothing for their construct. Newly
  costing 15: #0001 Red and Maximum Blue, #0003 Cherry Blossom Impact,
  #0004 the Melody, #0006 Heat Vision and the Sonic Scream. `resolveEnergy`
  knows `constructCost`; each definition's `energyCost` is derived and
  validated (`resolveMoveEnergy`).
- **CPU parity.** `moveReady`, `readySoon`, `readyInAir` and the
  defense / plan follow-up checks mirror the Fighter: each move's real
  `energyCost`, refusal while exhausted, `repeatsMove`, `moveYields` (so a
  CPU may cancel its own Deflect or heal), cooldowns read live (so an
  interrupted startup is ready at once). Difficulty changes none of it.
- **A loop the repeat delay hid.** Pressed on the very step it rebounds,
  #0002's Bounce Attack started its hang on the floor, which counted as a
  landing and gave its air uses back: an endless bounce. Touching the floor
  in the hang of an attack started in the air is no landing now
  (`Fighter.update`), so it bounces twice per airtime, as authored.
- **Interface.** The ability HUD and touch buttons lose the repeat-delay
  look (`data-state="repeat"`, `is-repeat`); a cooldown shows only from
  its release; a move that costs Energy is muted while exhausted
  (`moveRestriction` `energy`, "No Energy until the bar refills" / "Plus
  d’Énergie jusqu’à ce que la barre se remplisse"). How to Play's Energy
  and Deflect copy says the new rules.

**Consequences.** Mashing an ordinary attack plays whole attacks back to
back (no restart, no delay between them). #0001's repeated Jabs remain no
true combo (a Jab never cuts into itself). Basic strings now go through
the hit-confirmed window: Attack 1 into Attack 2 still lands on a fresh
target for every fighter, but against a heavily battered target (40
Launch Point) #0002's and #0004's first hit launches it out of reach
before the second (it reached 40 only through PR #114's broad cut). The
CPU uses projectiles a little less now that they cost Energy, and its
slow, dominated moves (#0006's ground flurry) come up rarely now that its
quick strikes never wait. No move's damage, timing, range, trajectory or
cooldown class was changed.

**Code:** `js/data/cooldowns.js`, new `js/data/energy.js`,
`js/game/combat/offense.js` (`yieldsToRequests`), `attacks.js`
(`attackReleaseAt`, `releaseAt`, `energyCost`, `freeCancel`),
`technique.js`, `summon.js`, `deflect.js`, `combat-state.js`,
`move-status.js`, `js/game/fighters/fighter.js`,
`js/game/ai/cpu-intelligence/` (`capabilities.js`, `evaluator.js`,
`defense.js`, `plans.js`), `js/game/rendering/fighter-status.js`,
`js/ui/ability-hud.js`, `js/ui/touch-controls.js`, their stylesheets, the
English and French strings, each fighter's definition comments; the
specification (7.2.2 to 7.2.6, 7.3), the combat, energy, defense, input,
movement and AI guides, module responsibilities, adding characters, every
fighter's specification and the docs index.

**Tests:** new `tests/systems/strict-combat-rules.test.mjs` (release
points from each attack's structure; release timing for a strike, a
string, a throw, a slam's impact, a technique and a summon, before and
after release, exactly once; the construct Energy policy, the roster's
table, one payment per activation, Energy refusals, no refunds; the CPU's
costs and cooldown reading); `move-cancel` rewritten (no request cuts an
attack in any phase, player or CPU; the buffer; no restart; hit-confirmed
windows still cut; the Deflect cancelled into an aerial, an air jump and an
air dash, its reflection stopping, its Energy kept, invalid requests
ending nothing; a heal cancelled before and after release; harmful
specials committed; identical results for player, CPU and bare
controllers); `cooldown-policy`, `combat-rules`, `energy`, `dash`, `combo`,
`technique`, `basic-strings`, `direct-input`, `request-devices`,
`attack-mobility`, `movement`, `loadout`, `charm`, `down`, `codenames`,
`ensemble`, `fighter-status`, `sample-fighter`, `slam`, `combat-ai`,
`cpu-intelligence` (rare moves get extra seeds rather than a lower bar),
`controller-input`, `ability-hud`, `controls-ui`, `discover`,
`practice-ground` and the fighter suites updated to the new rules.

## Universal Step-in and no attack steering

Not a named update (it can become one if the owner names it). Asked for in
`max` as strict, universal rules for every fighter, present and future,
player and CPU alike, superseding the
[combat feel overhaul](#combat-feel-overhaul-and-shield-walking)'s attack
mobility tiers and every entry or document that describes steering a
grounded attack; the owner then asked that every move keep moving in the
air, whatever it is. Those entries stay as the record of what each change was at the
time.

**What it changed.**

- **Attack Steering removed on the ground.** Nothing held moves a fighter
  through a grounded attack: no direction, no Run, no switch, in any phase,
  whatever the move (strikes, throws, Specials, 3 s and 5 s cooldown
  moves). `steerAttack` is gone; every attack moves through `attackDrift`
  (`js/game/fighters/movement.js`): its Step-in, then on the ground its
  speed running down under `friction` x the ground deceleration, the
  direction held ignored.
- **Universal air control in the air.** In the air every move, whatever it
  is (aerials, hovers, plunges, lifts, the Deflect, a homing dash's hang
  and recovery, a grounded attack carried off a ledge), keeps exactly the
  air control a fighter has outside an attack (`attackDrift` in the air is
  `steer` with the direction held), from its `airMomentum` share of the
  drift. No move has air control of its own any more (the tiers' and the
  plunges' and lifts' reduced `airControl` / `airTopSpeed` are gone); only
  a motion setting the speed itself (a homing dash's dash, a roll off a
  ledge) overrides it while it does. `lockMovement` and its normal-locomotion bypass are gone
  (`Fighter.moveDir` is 0 through any attack). `js/data/attack-mobility.js`
  and its tiers (`quick`, `medium`, `heavy`, `planted`) are deleted, and an
  attack declaring `mobility`, `control`, `airControl`, `topSpeed`,
  `airTopSpeed` or `lockMovement` is refused (`STEERING_FIELDS`). `steer`
  lost its steering-share and speed-share parameters: it is ordinary
  locomotion only. What an attack keeps of its entry speed is now
  `momentum` / `airMomentum` (1 unless written) and its slide's `friction`
  (1 unless written): the authored values stay (#0002's Rapid Kicks 0.8,
  #0005's Long Bite 0.4 and Dark Tendrils 0, the air shares of the hovers
  and motions, the High Kick's and the Haymaker's lunge friction); the
  tiers' values are gone.
- **The universal Step-in** (`js/data/attack-movement.js`, new). Every
  grounded direct melee strike steps in by itself, once per activation:
  as its time reaches half way to its first strike its forward speed is
  raised to at least 360 (`STEP_IN`), the way the strike faces then, and
  runs down: about 11 units from a standstill. Each definition records the
  verdict (`stepIn`): `authored` (its own `step`: #0001's High Kick, #0003's
  Heel Drop and Chakra Haymaker, unchanged), `universal`, `declined`
  (`step: false`, new: #0005's Phantom Hands and Dark Tendrils, whose hands
  and tendrils strike, and the phantom's bite) or `exempt` (throws, motions,
  the Deflect, pending moves). The activation records its Step-in
  (`activationStep`: none in the air): an aerial never steps in, landing
  never makes it lunge, a grounded one off the ground by its time skips
  it, and once made nothing redirects it. `step: null`
  is refused (write `false`).
- **CPU.** Its predictions call the same `attackDrift` and
  `activationStep` (a predicted strike gains its real Step-in, a throw
  none); the recovery simulation plays a lift's hang and lift with its
  held toward the stage under the universal air control (`riseOf` gives
  `hang` and `airMomentum`);
  a Step-in counts toward `approach` or `mobility` only when it really
  travels (`lunge`, from `stepInTravel`, at least 32 units: none does
  today), and the threat reach adds the real travel; the executor holds no
  direction through a grounded attack and steers its aerials in the air as
  its plan wants (holding nothing through them, or only toward ground over
  the Void, measured worse: an edge-guard plunge then fell into the Void).

**Consequences.** Running into an attack and holding on no longer keeps
the run: it runs down at the universal deceleration (a Dash attack at the
overspeed brake: #0001's Dash Jab goes from 1160 to 620 units/s in six
steps, where it went from 1210 to 970 before). Every aerial now has the
full air control (it reaches top speed either way), where the tiers gave
most a share of it and plunges and lifts less. Holding a direction during an attack still
turns it. Grounded strikes now lean in about 11 units, so repeated strikes
creep forward (a fresh flurry may reach a target its last one flung,
once it is free again); #0001's High Kick, #0003's Heel Drop and Haymaker
keep their own lunges. No move's damage, timing, hitbox, launch, stun,
cooldown or Energy changed.

**Measured** (`tests/benchmarks/cpu-benchmark.mjs --seeds 1`, 144 games a
matchup over every pairing, both stages; the code before the change, then
after): Brutal v Hard 93.1% [88-96] then 93.1% [88-96], points 2.88 : 0.76
then 2.90 : 0.92; Hard v Medium 93.1% [88-96] then 89.6% [84-94]; Medium v
Easy 99.3% [96-100] then 100% [97-100]; Brutal v the balanced reference 100% then 100%,
its self-eliminations 1 then 4 in 144 games. Inactivity and stuck
navigation stayed at 0 throughout.

**Where to tune it.** `STEP_IN` (speed, lead) in
`js/data/attack-movement.js`; a move's own `step`, `momentum`,
`airMomentum` and `friction` in its fighter's definition; `MAJOR_LUNGE` in
`js/game/ai/cpu-intelligence/capabilities.js`.

**Code:** new `js/data/attack-movement.js`; `js/data/attack-mobility.js`
deleted; `js/game/fighters/movement.js`, `js/game/fighters/fighter.js`,
`js/game/combat/attacks.js`, `combat-state.js`, `deflect.js`,
`js/data/cooldowns.js`, every fighter's definition (steering fields and
tier comments removed, `step: false` on #0005's hands, tendrils and
phantom bite) and its reviewed profile hash; `js/game/ai/cpu-intelligence/`
(`prediction.js`, `capabilities.js`, `values.js`, `situation.js`,
`executor.js`); the specification (7.2.2, 7.2.3, 7.2.4), the movement,
combat, defense and AI guides, module responsibilities, adding characters,
testing and every fighter's specification.

**Tests:** new `tests/systems/step-in.test.mjs` (the policy and its
refusals; every fighter's verdicts; every playable fighter's every move
on the ground from rest, a run and a Dash with nothing, Run, back,
switching and late Run held: identical paths; every aerial and the
Deflect under exactly the universal air control; the Step-in from rest, slight and once;
none in the air or on landing; a turn after it never redirecting it; a CPU's and a
player's Run alike; normal movement back at once; the CPU's prediction
matching the Fighter step for step; a wall; a summon and its phantom
never moving; the CPU's lunge reading); `attack-mobility` removed;
`movement-rules`, `movement`, `slam`, `pull`, `defense`, `combat-ai`,
`cpu-intelligence` (the level-by-level head-to-head plays two seeds), the
#0001, #0002 and #0006 suites and the test fixtures updated;
`tests/benchmarks/feel-metrics.mjs` now measures the Step-in, the
displacement a held direction adds to a ground attack (0) and to an
aerial (the air control), and normal movement's return.

## #0007, the street soldier

Not a named update (it can become one if the owner names it). Asked for
as: study the repository, read `character_rule` and add #0007 from a
supplied sprite sheet, then open a pull request. `character_rule` asks for
abilities with real mechanics from the character's canon (not only
animations and damage), no move the character cannot perform in canon,
the sheet's DeviantArt page credited, the character named nowhere, and a
moveset half melee and half weapons, every melee attack close range.
`character_rule` was not touched.

**What it added**

- **The fighter.** #0007 in roster slot 07, playable: 77 frames cut from
  the sheet into `assets/characters/0007/` (1× crops, each tight to its own
  art, the flat teal background (0, 119, 120) made transparent, nothing
  redrawn or recoloured, every file `0007_<codename>_<frame>.png`): 65 of
  the fighter, 12 of what its weapons send out (the Pistol's flash and
  bullet, the Molotov Cocktail's fire, the rocket). Two of the sheet's
  frames touched and were parted where they meet; two drawings the sheet
  repeats within a move (the stance's third, the kick's tuck) are played
  again from one file, never copied. Drawn at the roster's art-pixel size
  (a 44-pixel fighting stance, about 74 units tall); its fists, kicks,
  swings and blasts reach far from its body, so every clip authors its own
  `anchorX` on its white vest (and the Deflect its `anchorY`). Movement is
  the universal one; its Energy refills at 14 a second.
- **Half melee, half weapons**, four of each, from its canon (a fighter of
  the streets who learns boxing and other fighting styles and uses the
  weapons he picks up; a heavy weapon cannot be fired off the ground, and
  he fires none in mid-air). Its melee are its two ordinary attacks with
  their mid-air versions, each reaching no further than an arm's or a
  leg's length: the **Street Combo** (a jab and a cross that hold, then a
  hook: 1, 1, 3), the **Uppercut** (5, straight up, and a jump may chase
  its target), the **Flying Kick** (3, Base Launch 2) and the **Hammer
  Fist** (3, a spike). Its weapons are its three techniques and its extra
  attack, every one fired standing on the ground: the **Pistol** (a fast
  shot out to 560 units, 15 Energy), the **Molotov Cocktail** (a technique:
  a lit bottle that bursts into flames 150 units ahead, a fire that never
  moves and burns whoever stays in it four times, 1, 1, 1, then 3 straight
  up, never at #0007's feet; 15 Energy), the **Sawn-Offs** (a technique: a
  sawn-off in each hand fired to both sides at once, 5 straight up to
  whoever is in front or behind; 15 Energy) and the **Rocket Launcher** (a
  technique, its Special: 0.75 s heaving it up and aiming, any hit breaking
  it, then a rocket for 10 at Base Launch 3 that drives a raised Shield
  back; 5 s). Its guard is a boxer's high guard; its Dash the combat roll,
  its air dash the dive; its Deflect a two-fisted swat. The sheet's sniper
  rifle, submachine gun and assault rifle, its katana and shovel, its
  aerial rocket launcher, its motorcycle and train, its intro, wins and
  losses are no move.
- **No new engine feature.** Every mechanic is shared data any fighter can
  use: strikes (`hits`) and `hitCancel`, a projectile with no `speed` that
  `pierce`s (as #0004's dancing double), a technique's burst round its
  fighter, `blockPush`, the policy's cooldowns and Energy.
- **Its controller layout** by the comfort rules (Square the Street Combo /
  Flying Kick, Triangle the Uppercut / Hammer Fist, Circle the Sawn-Offs,
  R2 the Pistol, L2 the Rocket Launcher, the right stick forward the
  Molotov Cocktail), touch buttons, names and descriptions in English and
  French, a Discover profile (3/5) and its credits (the sheet by
  xxalexsmashxx on DeviantArt, linked by the deviation's number alone).

Found on the way: the CPU behaviour test of the closing Void in overtime
(K) measured its danger at the CPU's own height 0.05 s into the
scenario, where #0007's CPU has already jumped in; it now measures at the
floor where the CPU starts, as it means to. The disabled test fighter
moved from slot 07 (now #0007's) to slot 11.

**Balance** (seeded CPU-vs-CPU Watch Mode battles at equal levels, Desert
and City, both sides, six seeds: 144 matches a level): #0007 wins 0.47 at
Medium, 0.52 at Hard and 0.59 at Brutal, inside the roster's usual range;
strongest against #0001, weakest against #0002. As first written it won
0.67 at Medium and Brutal, on a Pistol fired a fifteenth of a second after
the press; the steps from there are in [#0007's
specification](docs/characters/0007.md#balance).

**Where to tune it.** Every value is in `js/data/characters/0007.js`:
the moves' phases are whole frames of their clips at `FPS_0007`; the
weapons' reach and power are its `projectiles` and its techniques'
`burst`; the Rocket Launcher's heave is `FPS_0007.attack5_cast`; the fire's
burns are `attack3_object.pierce`.

**Code:** `js/data/characters/0007.js` (new), `js/data/characters.js`,
`js/data/fighter-profiles.js`, `js/ui/credits.js`, the English and French
strings; the specification and guides (`ALVA_SPEC.md`, `README.md`,
`docs/characters/0007.md` (new), the roster, adding a fighter, the
character system, module responsibilities, combat, defense, Energy, input,
launch, rendering, the AI, testing).

**Tests:** new `tests/fighters/0007/fighter-0007.test.mjs` (registration
and kit; half melee and half weapons, every melee move close range and no
weapon in the air; its names, touch buttons and controller layout; the 77
files, clean and tight, none a copy, at one scale, anchored on its body;
every move's mechanic; the CPU playing its whole kit; its source named
nowhere); the roster-wide tables (`cooldown-policy`, `special-abilities`:
eight Specials, `strict-combat-rules`, `step-in`, `controller-profiles`),
`empty-roster`, `discover`, `practice-ground`, `watch-mode`,
`quick-battle`, `settings` (its credits), each fighter's roster list and
`cpu-behaviour` (K, above).

## #0007's standing idle

Not a named update. Asked for as: make #0007's idle the sheet's first
three stance frames instead of its last three, in a new pull request.

- **Its idle** is now the standing stance (`0007_idle_1` to `_3`, cut
  from the sheet's first three STANCE frames at 1× like the rest: upright,
  arms loose, its eyes looking on, glancing aside, a blink), looped at 4
  fps, anchored on its vest. It was the crouched fighting stance (two
  files, its third drawing a repeat of its first).
- **Its reference height** follows its idle: 55 art pixels (from 44), so
  `visual.height` is about 93 units (from 74) and every clip's
  `heightRatio` is over 55; every frame still draws at one art pixel per
  file pixel, the roster's size.
- **Its body** is measured from its idle, as every fighter's is: collider
  28 × 90 (from 72), hurtboxes `{ -16, -94, 32, 47 }` and `{ -18, -47, 36,
  47 }`, so the standing head is inside it.
- **Balance**, the same runs as before (144 matches a level): 0.43 at
  Medium, 0.49 at Hard, 0.56 at Brutal (from 0.47, 0.52, 0.59): a taller
  target; nothing else retuned.

**Code:** `js/data/characters/0007.js` (`ART_0007`, the idle clip, `FPS_0007.idle`,
`visual`, the body) and its reviewed profile hash; three frames in
`assets/characters/0007/`; `docs/characters/0007.md`.

**Tests:** `fighter-0007` (78 files, the idle's frames and height, the
reference height, the portrait).

## #0007's blink

Not a named update. Asked for as: #0007's standing idle blinks rapidly,
which looks odd; fix it, in a new pull request.

- Its three idle drawings differ only in the eyes (open, half shut, shut),
  so looped straight through at 4 fps they blinked every 0.75 s. The idle
  now holds the eyes open for 2.75 s, then blinks once, quickly (half
  shut, shut, half shut: 3/8 s), at 8 fps (`STANCE_0007` in
  `js/data/characters/0007.js`): the same three files, nothing redrawn,
  added or removed.

**Tests:** `fighter-0007` (the idle's frames, and its blink: eyes open
2.75 s of every loop, one blink of 3/8 s).

## Mash Combo update

Asked for (the `max` brief, "ALVA — MASH COMBO UPDATE") as a new universal
combat mechanic with strict fighter requirements, CPU support, and a fix for
animations sticking on one frame. Every rule it brought is strict. It adds
to the combat rules without replacing any: outside a series every move,
cancel, buffer and cooldown works exactly as before.

- **The mechanic** ([combat](./docs/systems/combat.md#mash-combo),
  [`ALVA_SPEC.md`](./ALVA_SPEC.md) §7.2.4c). Five fresh presses of one
  button of a fighter's pair, on the ground (each within 0.3 s of the last,
  all five within a rolling 0.8 s, on the simulation clock; held buttons,
  autorepeat, other buttons, aerial presses, slow presses and hits never
  count; presses made while the first move plays do) set off twelve
  automatic turns of the pair, alternating, the mashed move first, six
  each. Each turn plays twice as fast (startup, strikes, recovery, Step-in
  and clip; strike windows swept so none is skipped). Turns 1 to 11 launch
  nothing (effective Base Launch 0 for every strike; their damage still
  counts); turn 12 launches as authored from the Launch Point built.
  Nothing the fighter's controls ask for cancels it; a stun, a paralysis,
  a launch, losing the ground, the Void or a respawn ends it at once; a
  turn a Shield blocks ends it there. No armour, no new button, no
  setting.
- **The pairs** (`mashCombo` in each definition; refused by the registry
  if missing or invalid, for every future fighter too): #0001 Jab + High
  Kick; #0002 One-Two + Rapid Kicks; #0003 Chakra Punch + Chakra
  Haymaker; #0004 Dance Combo + Crescent Kick; #0005 Claw Swipe +
  **Backhand Rake**; #0006 Power Punch (pink) + **Knockout Punch**
  (green); #0007 Street Combo + Uppercut. #0005 and #0006 had no second
  close-range strike and every button taken, so each gained a button-less
  partner strike under the new codename `mash_attack` (#0005's on its
  Deflect's claw-sweep frames, #0006's green on her Flying Punch's fist,
  copied under the move's codename), performed only as a turn; nothing of
  theirs was removed or changed.
- **The CPU**: all four levels set one off through five legal presses
  (from neutral, or as a hit-confirm), weigh the real launch rule, avoid
  Shields, ledges at their back, hazards and walling opponents, never
  while protecting a lead, and less often soon after the last; they read
  an opponent's series (busy through its turns, its finisher coming) and
  answer it with the Shield, which ends it.
- **Shown**: afterimages of the performing fighter (or sister), a slash on
  each strike that lands, a finisher burst and shake, and a *Mash Combo
  7/12* counter (*Combo frénétique* in French) over the fighter.
- **Stuck frames, fixed**: the same move started on the very step its
  last activation ended kept the same clip key, so `SpriteAnimator.play`
  skipped it and the whole new activation showed the old one's last frame
  (reproduced for every fighter). Each move activation now restarts its
  clip once as it begins (`activation`, in `SpriteAnimator` and
  `EnsembleAnimator`); a clip with no usable fps holds its first frame.
  The holds the art means (a single-frame pose, the Shield, an impact
  freeze, a clip shorter than its move holding its last frame: 17 such
  attacks, all authored) are unchanged.

**Where to tune it:** `MASH_COMBO` in
[`js/data/mash-combo.js`](./js/data/mash-combo.js) (presses, window, gap,
turns, rate, arm wait, close range, Step-in limit); `HIT_FX.trail.mash*`,
`HIT_FX.sparks.slash` / `finisher` and `HIT_FX.mash` in
`js/game/rendering/hit-fx.js`; `MASH_COUNTER_STYLE` in
`js/game/rendering/fighter-status.js`; the CPU's `MASH_MEMORY` in
`js/game/ai/cpu-intelligence/brain.js` and `Evaluator.mashCombos`.

**Code:** new `js/data/mash-combo.js` and `js/game/combat/mash-combo.js`;
`js/config.js` (`MOVES.mash_attack`); `js/data/characters.js` (the
check); every `js/data/characters/<id>.js` (its pair; #0005's and
#0006's partner strikes and art); `js/game/fighters/fighter.js` (presses,
start, turns, lock, interruption, activation); `js/game/combat/combat-state.js`
(`sweepAttack`); `js/game/combat/combat.js` (swept windows, launch
suppression, single-strike blocks recorded); `js/game/arena.js` (the
Void, the counter); `js/game/rendering/` (`sprite-animator.js`,
`ensemble.js`, `hit-fx.js`, `fighter-status.js`); the CPU
(`capabilities.js`, `perception.js`, `situation.js`, `prediction.js`,
`defense.js`, `evaluator.js`, `plans.js`, `brain.js`); the strings; the
reviewed profile hashes; `codename_rule`; the specification and guides.

**Tests:** new `tests/systems/mash-combo.test.mjs` and
`tests/systems/animation-restart.test.mjs`; revised to keep their rules
below the five-press exception: `direct-input` (mashing one press short of
the count; a series' turns are its pair), `fighter-0002` (the flurry
spam pressed as a hand chains flurries, never five in a row),
`cpu-behaviour` (postures measured outside the CPU's own series, a
neutral series counted as going in, eight seeds), `combat-ai` (every
activation counted), `cpu-intelligence` (one more seed for a rare
aerial), `jokull` (two seeds that break a wing); updated for the new
moves, names, art and event fields: `fighter-0005`, `fighter-0006`,
`codenames`, `ability-names`, `sample-fighter` (its pair),
`cooldown-policy`, `launch`, `loadout`, `ui-consistency` (*Mash Combo*, a
game term).


## #0008, the rubber pirate

Not a named update (it can become one if the owner names it). Asked for
as: study the repository, read `character_rule` and add character 0008
from a supplied sprite sheet, then open a pull request. `character_rule`
asks for abilities with real mechanics from the character's canon (not
only animations and damage), no move the character cannot perform in
canon, the sheet's DeviantArt page credited and the character named
nowhere. `character_rule` was not touched.

**What it added**

- **The fighter.** #0008 in roster slot 08, playable: 104 frames cut from
  the sheet into `assets/characters/0008/` (1× crops, each tight to its own
  art, the flat teal background (0, 102, 102) made transparent, nothing
  redrawn or recoloured, the white sparks of a snap kept with the frame
  they touch, every file `0008_<codename>_<frame>.png`), all of the
  fighter: it throws nothing. Drawn at the roster's art-pixel size (a
  47-pixel fighting stance, about 80 units tall); its stretched limbs, its
  balloon and its giant fist reach far from its body, so every clip
  authors its own `anchorX` on its blue shorts (and the Stamp its
  `anchorY`, its legs reaching below its feet). Movement is the universal
  one; its Energy refills at the shared 12 a second (no move of its costs
  any).
- **Every move its own body**, from its canon (a pirate whose whole body
  is rubber, who fights by stretching it, blows himself up so that bullets
  bounce off, and recovers by eating), each with a mechanic: **Jab and
  Straight** (1 that holds, then 3) and the **Gum-Gum Gatling** (five
  stretched fists out to 110 units that hold, then 3 at Base Launch 2);
  the **Gum-Gum Pistol** (the arm stretched far back, then the fist out to
  96 units: 5 at Base Launch 3); the **Gum-Gum Stamp** (both legs stretched
  down 122 units below its feet, a spike); the **Gum-Gum Rocket** (a homing
  slingshot, once per airtime); the **Gum-Gum Balloon** (blown up all round
  it: projectiles that meet it are bounced back at their thrower, whoever
  touches it bounced up; the **Floating Balloon** in the air hovers); the
  **Feast** (a technique and a Special: two joints of meat devoured to
  heal 10; 3 s) and the **Gum-Gum Giant Pistol** (a technique and a
  Special: 0.75 s blowing a fist up to a giant's and swinging it back, any
  hit breaking it, then 10 at Base Launch 3 out to 224 units that drives a
  raised Shield back; 5 s). Its stretched limbs are still its body: while
  the Pistol, the Gatling and the Stamp play, its hurtboxes take in the
  arm or legs, so a blow or a shot that meets them strikes it. Its Mash
  Combo pairs Jab and Straight with the **Crescent Kick**, a button-less
  close-range partner (every other ground move reaches far, surrounds it
  or strikes nobody). Its guard is its arms wound into a rubber wall; its
  Deflect a whirl of its limbs; its Dash a blurred lunge, its air dash a
  flat flight.
- **Its rubber body**: the first fighter with a `launchBounce` of its own.
  Launched into a wall, the floor or a ceiling it rebounds from 400 units/s
  (everyone else 500) and sends back more of it (0.9, 0.8, 0.85 against
  0.72, 0.6, 0.65).
- **The shared engine, used as it is**: strikes (`hits`) and `hitCancel`,
  `hurtboxes` while a move plays, `motion` (`homing`, `hover`),
  `deflectProjectiles` on an ordinary attack (until now only the Deflects
  had it; a move that has it is a defense too, so it gives way to any
  request, by the rule the Deflect already follows), a technique's `heal`
  and `burst`, `blockPush`, `launchBounce`, the policy's cooldowns.
- **One CPU addition, for any fighter**: a shot coming at the CPU may be
  answered with any move of its own whose box turns projectiles back (not
  only its Deflect), pressed when that box will be live as the shot
  arrives, weighed like the Deflect (worth more when the turned-back shot
  can still reach its thrower). Without it the CPU never used the Balloon.
- **Its controller layout** by the comfort rules (Square Jab and Straight
  / Gum-Gum Stamp, Triangle Gum-Gum Gatling / Gum-Gum Rocket, Circle the
  Balloon both ways, R2 the Gum-Gum Pistol, L2 the Feast, the right stick
  forward the Giant Pistol), touch buttons, names and descriptions in
  English and French (the French names as the French translations give
  them, *Gomu Gomu no …*), a Discover profile (3/5) and its credits (the
  sheet by degue-1297 on DeviantArt, linked by the deviation's number
  alone, and the sheet's own credit: ripped by Alejo & Grim).

Found on the way: two shared tests assumed what #0008 is not.
`universal-movement`'s "a hit restores both air jumps" pressed the first
aerial with a hitbox and expected it to hit a target beside it; the Stamp
only strikes below, so it now picks an aerial whose box takes in the
fighter's own height. `move-cancel`'s rule-A and buffer tests assumed every
ground attack keeps its commitment; a defense gives way by explicit rule,
so they now pair only committed attacks first, and a new test covers the
Balloon giving way. `cpu-behaviour` E now starts its CPU at 100 Launch
Point (from 90): at 90, #0008 (no launch that ends a life from mid-stage
at once) does not yet put #0007's CPU in danger, so at Medium it rightly
kept fighting and landed a Mash Combo before breaking off. The roster-wide
tables, lists and credits gained #0008.

**Balance** (seeded CPU-vs-CPU Watch Mode battles at equal levels, Desert
and City, both sides, six seeds: 168 matches a level): #0008 wins 0.61 at
Medium, 0.52 at Hard and 0.44 at Brutal, inside the roster's usual range;
strongest against #0001 and #0005, weakest against #0006 (and #0007 at
Medium). As first written it won 0.64, 0.44 and 0.44; the steps from there
are in [#0008's specification](docs/characters/0008.md#balance).

**Where to tune it.** Every value is in `js/data/characters/0008.js`: the
moves' phases are whole frames of their clips at `FPS_0008` (the orders
`JAB_STRAIGHT_0008`, `GATLING_0008`, `PISTOL_0008` and the rest); reaches
are the attacks' `hitbox` and the Giant Pistol's `burst`; the limbs open to
a hit are the attacks' `hurtboxes`; the Rocket is its `motion`; the rubber
rebound is `launchBounce`; the heal is `techniques.attack4.heal`.

**Code:** `js/data/characters/0008.js` (new), `js/data/characters.js`,
`js/data/fighter-profiles.js`, `js/ui/credits.js`, the English and French
strings, `js/game/ai/cpu-intelligence/defense.js` (the projectile answer);
the specification and guides (`ALVA_SPEC.md`, `README.md`,
`docs/characters/0008.md` (new), the roster, adding a fighter, the
character system, module responsibilities, combat, defense, Energy, input,
launch, rendering, the AI, testing).

**Tests:** new `tests/fighters/0008/fighter-0008.test.mjs` (registration
and kit; every move its body, none costing Energy; its Mash Combo; its
names, touch buttons and controller layout; the 104 files, clean and
tight, none a copy, at one scale, anchored on its body; every move's
mechanic, its outstretched arm struck by a shot and its legs open to a
hit; the Balloon bouncing a shot back into its thrower; its rubber
rebound; the CPU playing its whole kit; its source named nowhere); the
roster-wide tables (`cooldown-policy`, `special-abilities`: ten Specials,
`strict-combat-rules`, `step-in`, `mash-combo`), `empty-roster`,
`discover`, `practice-ground`, `watch-mode`, `settings` (its credits), each
fighter's roster list, `move-cancel`, `universal-movement` and
`cpu-behaviour` (above).

## The match's end: celebration, result toast and Match Results

Not a named update (it can become one if the owner names it). Asked for in
`max`: a match that ends without stopping the world, its own announcement,
CPU celebrations, a result toast, a Match Results dialog with full match
statistics and real navigation, Settings and an X on every dialog that
pauses play, and the teams named in Roman numerals.

**What it changed.**

- **The lifecycle** (`js/game/battle.js`). The phases are `intro`, `fight`
  and `celebration`: `timeup`, `ko` and `result` are gone, with
  `CONFIG.battle.timeUpSeconds` and `koSeconds`. `Battle.finishMatch` ends
  the match exactly once, the moment it is decided (the third point inside
  its step, the clock or overtime at the start of one), and freezes
  `Battle.final` (outcome, reason, winner, score, both Launch Points,
  overtime, length, statistics). `Battle.result` returns the frozen result
  once there is one (the old rule is `liveResult`). Inputs are locked in
  the intro only; respawns, hazards and scoring run only while
  `matchLive`; the clock stops and every respawn wait is called off at the
  end. The world, the camera and the player's controls go on.
- **CPU celebrations** (`js/game/ai/celebration.js`, new). A CPU's combat
  AI makes way for a `CelebrationController` on its own seeded stream
  (`CELEBRATION_STREAMS`) and comes back on a restart: the winner picks
  among ability spam, the Void run, idle, a dash dance and jump spam; a
  loser idles; after a draw both idle, dash dance or jump.
- **Match statistics** (`js/game/match-stats.js`, new; `CombatState`'s
  new `energySpent` and `launchPointRecovered` totals). One counter set per
  side, from the combat events and deflections and those totals, kept
  across lives, frozen into the result.
- **The battle screen** (`js/screens/battle-screen.js`). VICTORY! /
  DEFEAT. / GAME. (Watch Mode: VICTORY! over TEAM I or TEAM II) replace the
  K.O. and TIME beats; a non-modal result toast at the bottom centre ("Team
  I wins!", "Team II wins!", "No winner, game ended with a draw.", green
  View match results); the Match Results dialog (outcome, both teams,
  ending, length, statistics table, Rematch, Change fighters, Change stage,
  Return to home screen, an X), which pauses nothing; once the match is
  over the pause controls open it. The old result menu, its kickers and the
  final-fall line ("… fell into the Void for the final point.") are gone.
- **Settings and the X** on the pause menu, Practice Ground's menu and
  roster dialogs, and Return to home? over a paused battle
  (`dialogControls`, `js/ui/components.js`; `ConfirmDialog`'s `onSettings`).
  Settings opens over them with play still frozen.
- **Navigation.** `ScreenManager.backTo` (Change fighters back to Select
  Fighter or Watch Mode's Select CPU 1).
- **Team names.** Team I and Team II (Équipe I, Équipe II) wherever a side
  is named; the HUD's cards are named for their teams for screen readers.

**Where to tune it:** `FINAL_BANNER_SECONDS` (`js/screens/battle-screen.js`);
the celebration's `WEIGHTS`, `DURATIONS`, `DANCE_RADIUS`, `DANCE_TURN`,
`ABILITY_GAP`, `JUMP_GAP`, `AIR_CHANCE` and `STALL_JUMP`
(`js/game/ai/celebration.js`); the toast and dialog styles
(`css/battle-overlays.css`).

**Code:** `js/game/battle.js`, `js/game/match-stats.js` (new),
`js/game/ai/celebration.js` (new), `js/game/combat/combat-state.js`,
`js/config.js`, `js/screens/battle-screen.js`,
`js/screens/practice-screen.js`, `js/core/screen-manager.js`,
`js/ui/components.js`, `js/ui/overlays.js`, `js/ui/hud.js`,
`js/localization/strings/`, `css/battle-overlays.css`, `css/settings.css`,
`css/overlays.css`.

**Tests:** `tests/systems/celebration.test.mjs` and
`tests/systems/match-stats.test.mjs` (new);
`tests/interface/battle-screen.test.mjs` (the announcements, the toast,
the Match Results, its navigation, the pause menu's Settings and X),
`tests/integration/quick-battle.test.mjs` (Change fighters, Return to home
screen), `tests/integration/watch-mode.test.mjs`,
`tests/integration/match-score.test.mjs`,
`tests/integration/overtime.test.mjs`,
`tests/integration/practice-ground.test.mjs`,
`tests/interface/ability-hud.test.mjs`,
`tests/interface/ui-consistency.test.mjs`,
`tests/systems/platform-hazards.test.mjs` and the CPU match helpers
updated.

## #0009, the young monk of the four elements

Not a named update (it can become one if the owner names it). Asked for
as: study the repository, read `character_rule` and add 0009 from a
supplied sprite sheet, then open a pull request. `character_rule` asks
for abilities with real mechanics from the character's canon (not only
animations and damage), no move the character cannot perform in canon,
the sheet's DeviantArt page credited, the character named nowhere and
#0008's source named nowhere either. `character_rule` was not touched.

**What it added**

- **The fighter.** #0009 in roster slot 09, playable: 111 frames cut from
  the sheet into `assets/characters/0009/` (1× crops of whole pieces of
  its art, each tight, the flat green background (0, 150, 0) made
  transparent, nothing redrawn or recoloured, every file
  `0009_<codename>_<frame>.png`): 84 of the fighter, 21 of its wind and
  its rock (projectiles) and 6 of its sphere (an effect). The sheet draws
  the aerial staff spin's body and whirl apart, the whirl to go over the
  raised hands: each Deflect frame is one body with one whirl laid behind
  it, nothing redrawn. A drawing the sheet repeats is one file played
  again (the air palm in two rows, the wind's puffs). Drawn at the
  roster's art-pixel size (a 49-pixel fighting stance, about 83 units
  tall); its staff, water, fire and whirl reach far from its body, so every
  clip authors its own `anchorX` on its trousers. Movement is the
  universal one; its Energy refills at the shared 12 a second.
- **Its four elements and its staff**, from its canon (a boy monk of the
  air nomads, the one person who bends all four elements, who would
  rather move an opponent than hurt one), each with a mechanic: **Swift
  Strikes** (1 that holds, then 3) and the **Fire Kick** (fire swept round
  its feet, either side, that holds, then a flaming kick, 3 at Base Launch
  2), its Mash Combo pair; the **Staff Swing** (a great arc out to 96
  units) and the **Rising Air Kick** (a lift on the air, once per
  airtime) in the air; the **Air Blast** (a cone of wind that drags its
  target along with it, 1 and 1, before flinging it, 3 at Base Launch 2,
  and blows other fighters' shots back) and, in the air, the **Air Gust**
  (a quick push and a turned-back shot, floating as it blows); the
  **Earth Pillar** (a column of rock that stands where it rises, throwing
  up only a fighter standing on the ground there, 5 at Base Launch 2, and
  erasing every shot that meets it); the **Freezing Splash** (a technique
  and a Special: water thrown into an icy splash that freezes for a
  second; 3 s); the **Air Sphere** (a technique and a Special: its
  glowing trance, open only in danger, a burst round it, 10 at Base Launch
  3 straight up; 5 s). Its guard is its arms raised across its body; its
  Deflect its staff twirled overhead; its Dash a low lunge, its air dash a
  flat leap. It heals nobody, summons nobody and carries nothing but its
  staff.
- **Light on the wind**: its `launchReaction` steers a launch up to 30°,
  the roster's most (everyone else 15° to 20°).
- **One shared capability, for any technique: only in danger.** A
  technique's `minLaunchPoint` (a whole number of Launch Points, 0 by
  default) is the least its own fighter must have for it to start: below
  it a press does nothing at all (nothing paid, nothing kept), the CPU
  never plans it (`moveReady`) and the ability HUD shows it held back
  (`danger`, "Only in danger: more Launch Point needed"); one `inDanger`
  in `js/game/combat/technique.js` answers all three. Only the start reads
  it: once cast, it plays out, and its cooldown, Energy and classification
  are its own as ever. #0009's Air Sphere opens at 30: its trance comes
  over it only in mortal danger.
- **Two CPU readings, for any fighter.** An ordinary attack whose shot
  stands where it appears (no speed: the Earth Pillar) is a ranged move
  the CPU reads and uses (`readMoveset` skipped it until now: only
  techniques had stationary shots), and a shot that is a `quake` meets
  only an opponent its predicted path has standing on the ground
  (`projectileContact`, as a quake strike, burst or impact already did).
- **Test-only fighters moved.** Test A and Test B, which the screen tests
  register in roster slots 09 and 10, now sit in slots 31 and 32, out of
  the way of the roster's own fighters.
- **Its controller layout** by the comfort rules (Square Swift Strikes /
  Staff Swing, Triangle the Fire Kick, R2 the Air Blast / Air Gust, L2 the
  Air Sphere, the right stick forward the Freezing Splash, the right stick
  up the Earth Pillar on the ground and the Rising Air Kick in the air),
  touch buttons, names and descriptions in English and French, a Discover
  profile (4/5) and its credits (the sheet by gameinvader247 on
  DeviantArt, linked by the deviation's number alone, and the sheet's own
  credit: GameInvader).

Found on the way: "Palm Strike" is the move of a fighter slot 03 once
had, and a guard keeps it out of the strings; #0009's first strike is
named Swift Strikes. The step-in, cooldown-policy and CPU tests that press
every move now put a fighter in the danger its techniques need first
(`endanger` in the fighter harness).

**Balance** (seeded CPU-vs-CPU Watch Mode battles at equal levels, Desert
and City, both sides, six seeds: 192 matches a level): #0009 wins 0.57 at
Medium, 0.45 at Hard and 0.48 at Brutal, inside the roster's usual range;
strongest against #0003 and #0004, weakest against #0006 and #0007. As
first written it won 0.83, 0.79 and 0.70; the steps from there are in
[#0009's specification](docs/characters/0009.md#balance).

**Where to tune it.** Every value is in `js/data/characters/0009.js`: the
moves' phases are whole frames of their clips at `FPS_0009` (the orders
`SWIFT_STRIKES_0009`, `FIRE_KICK_0009`, `AIR_BLAST_0009` and the rest);
reaches are the attacks' `hitbox`es and the techniques' `burst`es; the
wind, the gust and the rock are its `projectiles`; the trance's danger is
`techniques.attack5.minLaunchPoint`; its steering is
`launchReaction.steerAngle`.

**Code:** `js/data/characters/0009.js` (new), `js/data/characters.js`,
`js/data/fighter-profiles.js`, `js/ui/credits.js`, the English and French
strings, `js/game/combat/technique.js` (`minLaunchPoint`, `inDanger`),
`js/game/fighters/fighter.js`, `js/game/combat/move-status.js`,
`js/game/ai/cpu-intelligence/capabilities.js`, `js/game/ai/moveset.js`,
`js/game/ai/cpu-intelligence/prediction.js`; the specification and guides
(`ALVA_SPEC.md`, `README.md`, `docs/characters/0009.md` (new), the roster,
adding a fighter, the character system, module responsibilities, combat,
defense, Energy, input, launch, rendering, the AI, testing).

**Tests:** new `tests/fighters/0009/fighter-0009.test.mjs` (registration
and kit; Energy for what it creates and nothing else; its Mash Combo; its
names, touch buttons and controller layout; the 111 files, clean and
tight, none a copy, at one scale, anchored on its body, its objects
centred; every move's mechanic: the holds, the fire sweep either side, the
staff's reach, the lift once per airtime, the wind dragging its target and
blowing a pistol shot back, the gust's hover, the rock throwing up a
standing target, passing one in the air, standing still and stopping a
shot, the freeze and its broken cast, the trance held back out of danger
and bursting either side in it; its Deflect turning a shot back; its
steering; the CPU playing its whole kit and its trance in danger; its
source named nowhere); `technique.test.mjs` (a technique open only in
danger, for the player, the HUD and the CPU); the roster-wide tables
(`cooldown-policy`, `special-abilities`: twelve Specials,
`strict-combat-rules`, `step-in`, `mash-combo`), `empty-roster`,
`discover`, `practice-ground`, `watch-mode`, `quick-battle`, `settings`
(its credits), each fighter's roster list, `cpu-intelligence` (the
opportunity for a technique that needs danger) and the test fighters'
slots.
