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
- **Fast fall:** Down held in the air while falling. (Down is now a
  direction only; see [Attack 3 and Attack 4 on their own
  buttons](#attack-3-and-attack-4-on-their-own-buttons).)
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

**Where to tune it** (`js/data/characters.js`, #0001)

- `movement`: `highJumpWindow` (0.15), `highJumpHeight` (1.4).
- `defense`: `slowFallSpeed` (200), `slowFallBrake` (6000). Left out (or
  0), a Shield falls as ever (`SHIELD_DEFAULTS` in `js/game/combat.js`).
- The Joystick layout's geometry: `--tc-stick-left`, `.tc-stick-down`,
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

### Later: the touch Down buttons are gone

The down arrow this moved beside the joystick, and Classic Buttons' middle
one, were later removed altogether, with `--tc-stick-left`, `--tc-down` and
`.tc-stick-down`; the stick now sits at the cluster's left edge. The CPU's
attacks now also face their opponent by themselves. See [CPU facing, the
Jump arrow, no touch Down, ground and air
icons](#cpu-facing-the-jump-arrow-no-touch-down-ground-and-air-icons).

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
  matrix is new (`tests/loadout-fighters.mjs`, `tests/loadout.test.mjs`);
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
- The touch slots: `.tc-attack[data-slot]` in `styles.css` and
  `attackSlots` in `js/game/touch-controls.js`.

**Code:** `js/data/loadout.js`, `js/data/characters.js`, `js/config.js`,
`js/game/character.js` (`COMBAT_ACTIONS`, `tryAction`, the clip keys), `js/game/fighter-controller.js` (`HELD_CONTROLS`, `blankInput`),
`js/core/input-manager.js`, `js/game/combat-ai.js`,
`js/game/fighter-status.js` (`cooldownIndicators`, `cooldownLabel`),
`js/ui/mobile-abilities.js`, `js/game/touch-controls.js`,
`js/core/touch-layout.js`, `js/core/i18n.js`, `js/ui/icons.js` (`pip3` to
`pip5`).

**Tests:** `tests/loadout.test.mjs` (the matrix, each button's move, the
buffer, the keys, the CPU and every rule broken on purpose),
`tests/codenames.test.mjs` (the vocabulary, the files and a scan for every
retired name), the touch matrix and slot geometry in
`tests/controls-ui.test.mjs`, and the byte-for-byte checks of the renamed
art in `tests/defense.test.mjs`,
`tests/extra-attack.test.mjs`, `tests/clone.test.mjs` and
`tests/attack4-sphere-rush.test.mjs`.

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

- `js/data/characters.js`, #0002: each attack's damage, launch, timing,
  `hits`, `motion` fields (`range`, `speed`, `rebound`, `recoil`, `exit`,
  `fallSpeed`, `keep`, `maxSpeed`, `friction`), `airUses`, `freeFall` and
  `cooldown`; the tornado's `speed`, `lifetime`, `carry.lift`, `pierce` and
  `finisher`; `powers`, `movement` and the body.
- The motion kinds' defaults: `MOTION_DEFAULTS` in `js/game/combat.js`;
  the homing lock-on's allowance behind: `HOMING_BEHIND` in
  `js/game/character.js`.

**Code:** `createAttackDefinition` (`resolveStrikes`, `resolveMotion`),
`attackReach`, `strikeLive`, `CombatSystem.strike` and `carry` in
`applyHit` (`js/game/combat.js`); `startMotion`, `moveMotion`, `lockOn`,
`aimAt`, `motionContact`, `attackContact`, `airStartBlocked`,
`freeFall`, `hurtboxes` and `passingThrough` in `js/game/character.js`;
`pierce` / `finisher` in `js/game/projectile.js`; `anchorY` in
`js/game/sprite-normalizer.js` and `js/ui/sprite-art.js`; `motionFits`,
`travelTime` and `steerHome` in `js/game/combat-ai.js`;
`js/ui/credits.js`, `js/ui/icons.js`, `js/core/i18n.js`.

**Tests:** `tests/fighter-0002.test.mjs` (the real PNGs, crops, scale and
anchors, its ordinary buttons, every move's mechanics, the engine rules and their
validation, the CPU); the roster, credits and translations in
`tests/empty-roster.test.mjs`, `tests/settings.test.mjs` and
`tests/i18n.test.mjs`; the roster screens in
`tests/practice-ground.test.mjs` and `tests/watch-mode.test.mjs`.

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
  down, and then the touch down arrows, since removed): the fast fall and downward launch steering
  only. On the ground it is nothing: no state, no pose, no lock on
  movement or the Dash, no change to any button. Menus keep their own Down.
- **Energy** refills at its one passive `regen` rate; **cooldowns** recover
  in real time (`CombatState.abilityCooldowns`, updated with the rest of
  the combat state every step).
- **Renamed:** `js/game/technique.js` (the `Technique` class) and the
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

**Where to tune it** (`js/data/characters.js`, #0001)

- `summons.attack3` and `techniques.attack4`: unchanged, `cooldown`
  included.
- `mobileAbilities.attack3` / `attack4`: the touch names and glyphs.
- The CPU's judgement of them: the `specials` trait in
  `js/data/difficulty.js`.

**Code:** `js/data/loadout.js`; `Fighter.tryAction`, `trySpecial`,
`trySummon`, `tryTechnique` and the fast fall in `js/game/character.js`;
`js/game/technique.js`; `CombatState.update` and `updateEnergy` in
`js/game/combat.js`; `cooldownIndicators` in `js/game/fighter-status.js`;
`readMoveset`, `specialOptions`, `specialValue` and `actDash` in
`js/game/combat-ai.js`; `js/game/touch-controls.js`,
`js/core/touch-layout.js`, `js/core/input-manager.js`, `js/config.js`,
`js/core/i18n.js`, `js/ui/settings-dialog.js` and `styles.css`.

**Tests:** `tests/down.test.mjs` (Down as a direction only),
`tests/loadout.test.mjs`, `tests/clone.test.mjs`,
`tests/attack4-sphere-rush.test.mjs`, `tests/fighter-status.test.mjs`,
`tests/energy.test.mjs`, `tests/combat-ai.test.mjs`,
`tests/controls-ui.test.mjs`, and the repository-wide scan for the
retired mechanic in `tests/codenames.test.mjs`.

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

**Where to tune it** (`js/data/characters.js`)

- The summoning pose: `ATTACK3_SUMMON_FPS` (10) and
  `summons.attack3.startupAnimation` (remove it for the old immediate
  summon).
- Each button's picture: `mobileAbilities.<button>.preview` per fighter
  (`animation`, `frame` from 0).
- The picture's size in its button: `.tc-sprite-icon` in `styles.css`.

**Code:** `trySummon`, `finishSummon`, `cancelSummon`, `canAct`,
`updateFacing`, `updateState` and `animationFor` in
`js/game/character.js`; `startupAnimation` and `summonProblem` in
`js/game/clone.js`; the hit in `CombatSystem.applyHit`
(`js/game/combat.js`); `detachFromPlay` and `destroy` in
`js/game/arena.js`; `setFighter` and `removeCPU` in `js/game/practice.js`;
`readMoveset` in `js/game/combat-ai.js`; `previewFrame`, `mobileAbility`,
`jumpArt` and `SPRITE_BUTTONS` in `js/ui/mobile-abilities.js`;
`setCharacter`, `showArt` and `spriteFailed` in
`js/game/touch-controls.js`; `js/ui/icons.js`; `styles.css`.

**Tests:** `tests/summon-startup.test.mjs` (the restored bytes, the clip,
the press, the poses in order, the commitment, every interruption, the
refusals, a summon with no startup, the CPU); `tests/clone.test.mjs` (the
clone after the startup); `tests/controls-ui.test.mjs` (the art, Jump,
fallbacks, the glyphs that stay, names in English and French, both
fighters, multi-touch, the editor); `tests/touch-layout.test.mjs`,
`tests/practice-ground.test.mjs` and `tests/battle-screen.test.mjs` (art
following Player 1, never the CPU, layouts kept);
`tests/codenames.test.mjs` (the new files and clip, and a check that the
retired mechanic's names are still caught).

### Later: Jump's arrow, and art for the air

Jump no longer shows a fighter's jump: it is always the up arrow, and the
`jump` entries and `jumpArt` are gone. The buttons now also show each
fighter's mid-air moves while it is in the air, and #0002's Whirlwind
shows its tornado (the `tornado` glyph is back, as its fallback). See [CPU
facing, the Jump arrow, no touch Down, ground and air
icons](#cpu-facing-the-jump-arrow-no-touch-down-ground-and-air-icons).

## CPU facing, the Jump arrow, no touch Down, ground and air icons

Not a named update (it can become one if the owner names it). Asked for
(the `max` prompt) as: CPU-controlled fighters face their opponent
throughout their attacks (only the bots: real players' facing is
unchanged); the Jump button always shows an upward arrow; the mobile Down
button is removed from both layouts with its code and styles; and the
attack buttons show the move they make on the ground or in the air, with
#0002's Extra Attack showing the tornado.

**What it changed**

- **CPU facing.** The combat AI sends `face` with its buttons
  (`CombatAIController.track`): toward its opponent's current position,
  read every step, unchanged within 2 units of level (no flicker on an
  overlap), 0 with nobody in play. It is in `blankInput` (0) and never in
  Player 1's sample. `Fighter.tryAction` starts an attack or technique
  facing it on the press step, and `updateFacing` keeps an ordinary
  attack, on the ground or in the air, turned to it in every phase,
  whatever is held. A move committed to its direction (an attack with a
  `motion`, a summon's startup) keeps `facing`, its path, boxes and
  projectiles; only the sprite looks (`Fighter.lookFacing`, read by
  `spriteFlip`), and the fighter turns that way once it is over. A
  technique stays committed. A projectile keeps its release direction.
  The AI no longer turns before a strike (one step of a held direction,
  which walked and could tap toward a Dash): `actAttack` and the jump-in
  press at once, intents carry no `face`, the turn penalty in `options`
  and `this.turning` are gone, a roll's fit is judged the way it will set
  off, and `guard` still keeps it from steering an attack away.
- **Jump** is always `ICONS.jump`, for every fighter, on the ground and
  in the air: no longer in `SPRITE_BUTTONS`, no `jump` preview in any
  `mobileAbilities`, no `jumpArt`.
- **No touch Down.** `DPAD` is Left and Right (a slightly wider gap,
  inside the hit radius), `STICK_DOWN` / `stickDown` and its listeners
  are gone, the stick sits at the Joystick cluster's left edge, `down` is
  out of `TOUCH_CONTROL_IDS` (the editor cannot place it, and a saved
  layout's `down` entry is dropped as it loads), the Settings previews and
  scheme descriptions lose it, and so do `ICONS.down`, `--tc-down`,
  `--tc-stick-left`, `.tc-stick-down` and `.sp-down`. The `down` input
  itself, its keys, the gamepad's down and menu Down are unchanged.
- **Ground and air icons.** `buttonMove` reads the move each button makes
  on the ground and in the air from `actions`; `mobileAbilities` entries
  may give `previews: { ground, air }` (each with an optional `label`,
  translated as `ability.<id>.<button>.<state>`, and `icon`), and a
  preview may name its `collection`. In the air a ground-only move keeps
  its ground picture, faded (`.is-unavailable`), and still sends its
  input. `TouchControls.setAirborne`, called by the Battle and Practice
  screens after every frame (and on a restart, rematch or fighter change)
  from Player 1's own fighter, redraws only buttons whose look changed.
  #0001: the kunai slash (`midair_attack1_3`) and the airborne kick
  (`midair_attack2_3`) in the air; Throw, Clone Attack and Sphere Rush
  fade. #0002: Homing Attack (`midair_attack1_1`), Bounce Attack
  (`midair_attack2_3`) and Blue Tornado (`midair_attack3_3`), named so in
  English and French; the Whirlwind fades.
- **#0002's Extra Attack** shows its tornado,
  `projectileAnimations.extra_attack_object` frame 0, with the `tornado`
  glyph (back in `js/ui/icons.js`) as its fallback, still named Whirlwind,
  still ground-only.

**Where to tune it**

- The overlap deadzone: `FACE_DEADZONE` (2) in `js/game/combat-ai.js`.
- Each button's pictures and air names: `mobileAbilities` per fighter in
  `js/data/characters.js`; the French names in `js/core/i18n.js`.
- The out-of-reach look: `.tc-btn.is-unavailable` in `styles.css`; the
  Classic gap: `.tc-dpad`.

**Code:** `updateFacing`, `tryAction`, `lookFacing` and `spriteFlip` in
`js/game/character.js`; `blankInput` in `js/game/fighter-controller.js`;
the player sample in `js/core/input-manager.js`; `track`, `emit`,
`actAttack`, `actJump`, `meleeOptions`, `options` and `guard` in
`js/game/combat-ai.js`; `buttonMove`, `previewFrame`, `mobileAbility`,
`mobileAbilityLabelKey` and `PREVIEW_COLLECTIONS` in
`js/ui/mobile-abilities.js`; `setCharacter`, `setAirborne`,
`showAbilities` and the clusters in `js/game/touch-controls.js`;
`TOUCH_CONTROL_IDS` in `js/core/touch-layout.js`; `syncTouch` in
`js/screens/battle-screen.js` and `js/screens/practice-screen.js`;
`js/ui/settings-dialog.js`; `js/ui/icons.js`; `styles.css`.

**Tests:** `tests/facing.test.mjs` (the press turn, crossing in startup
and active frames, the air, rolls, homing dashes and plunges, projectiles,
the summon startup and the Sphere Rush, nothing for players);
`tests/combat-ai.test.mjs` (every #0001 and #0002 CPU attack looking at
its opponent through 20 s fights on every level, no turn step, crossing,
the roll, overlap, nobody in play, determinism);
`tests/controls-ui.test.mjs` and `tests/touch-layout.test.mjs` (no Down
anywhere, old layouts, Jump's arrow, ground and air art and names,
redraws only on change, the tornado and its fallback);
`tests/battle-screen.test.mjs` and `tests/practice-ground.test.mjs` (the
airborne sync); `tests/fighter-0002.test.mjs`, `tests/i18n.test.mjs`,
`tests/codenames.test.mjs` and `tests/down.test.mjs`.

## Adding a named update

When a new piece of work gets a name, add a row to the table and a section in
the same shape: what it added, where to tune it, the code, and the tests.
