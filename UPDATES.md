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
- **Attack momentum:** a running BA1 slides on, BA2 steps in, aerials keep
  their drift and follow the stick almost fully, and the Throw can back
  off. An attack faces the direction held as it starts.
- **Combat input buffer:** a Throw, BA1 or BA2 press that comes too early is
  kept for 0.15 s and fires on the first step it can.
- **Hit-cancel:** a hit that connects (not a block or a whiff) can be cut
  short into another attack, a jump or, on the ground, a Dash.
- **Dash cancel:** the Dash out of a hit costs 40 Energy instead of 15, so
  a full bar allows two and a third empties it (the Shield goes with it).
  That is what keeps BA1 → Dash → BA1 from looping. A Dash asked for during
  the hit's freeze comes out the step it ends.
- A hit now interrupts the target's own attack.
- **Combo routes:** at low Launch Point, BA1 → BA2, BA1 → BA1,
  BA2 → jump → mid-air BA1 and mid-air BA2 → land → BA1 all connect;
  BA1 → Dash → BA1 chases BA1's push up to about 85 Launch Point, and
  BA2 → jump → mid-air BA1 carries on into a third aerial (through the air
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
| `attacks.maba1` | `airControl` | 0.6 | 0.85 |
| `attacks.maba1` | `hitstun` | 0.28 | 0.32 |
| `attacks.maba1` | `cooldown` | 0.18 | 0.16 |
| `attacks.maba2` | `airControl` | 0.4 | 0.7 |
| `energy` | `dashCancelCost` | (none) | 40 |

The mid-air attacks were named `midairBa1` and `midairBa2` when this pass
was made; they are `maba1` and `maba2` now (see
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
lowered afterwards: BA1 and mid-air BA1 5 → 3, BA2 and mid-air BA2 10 → 5,
the Sphere Rush blast 15 → 10 (`damage` in `js/data/characters.js`). Each
hit now pushes and launches a little less, so:

- From 0 Launch Point, BA1 → BA1 strings up to 6 hits (was 4) and the
  BA1 → Dash → BA1 chase up to 7 (was 5): the same three Dashes empty the
  bar, then plain BA1s carry on until the push ends it. Neither loops;
  `tests/combo.test.mjs` allows 6 and 7.
- Each route's Launch Point limit moved up, by about 2 for the BA1 routes
  and about 5 for the BA2 routes: BA2 → jump → mid-air BA1 now reaches
  about 65, and the third aerial through the air jump about 45.
- The combat AI weighs a hit's damage at `damage / 6` instead of `/ 10`
  (`hitValue` in `js/game/combat-ai.js`), so it values its hits, and so its
  charged actions, as it did before the cut.

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
  - `movement`: `shortHopWindow`, `shortHopHeight`, `airJumps`,
    `airJumpRatio`;
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
- short hop and air jump in `tests/movement.test.mjs`
- perfect Shield in `tests/defense.test.mjs`

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

**Tests:** `tests/launch-bounce.test.mjs`, plus the BA2 spike tests in
`tests/basic-attack-2.test.mjs`.

## Control and move codenames

Not a named update, and it changes no behaviour or tuning: later work
renamed the gameplay controls and the moves to one canonical codename each.
The codenames are universal, the same for every character (`ACTIONS` and
`MOVES` in `js/config.js`); a character's own ability names are separate. Where an entry above names a field, it names where that field lives
now. Old → new:

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
perfect Shield's `perfectWindow` and `perfectRearm`) keeps its name, as
`movement` does, and so do the art files (`throw1`–`3`,
`midair1ba1`–`3`, `midair2ba1`–`5`). The regression checks are in
`tests/codenames.test.mjs`.

## Adding a named update

When a new piece of work gets a name, add a row to the table and a section in
the same shape: what it added, where to tune it, the code, and the tests.
