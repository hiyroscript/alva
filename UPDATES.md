# Named updates

Some larger pieces of work have a name, so they can be referred to later
("make the bounce update's rebounds softer", "undo part of the movement
update"). Each entry says what the update added, where its tuning lives, and
which tests cover it. Anything not listed under an update is unchanged by it.

| Name | Pull request | Commit | In one line |
| --- | --- | --- | --- |
| **Movement update** | [#49](https://github.com/hiyroscript/alva/pull/49) | `a34fbdd` | Movement feel, attack momentum and combo flow for #0001 |
| **Effect update** | [#50](https://github.com/hiyroscript/alva/pull/50) | `487b9af` | Short hop, air jump, launch reaction, perfect Shield and hit effects |
| **Bounce update** | [#51](https://github.com/hiyroscript/alva/pull/51) | `f7c1e28` | Hard launches rebound off walls, floors and ceilings |

They were made in that order and build on each other: the effect update
assumes the movement update, and the bounce update assumes both.

## Movement update

Makes #0001's movement quicker and its attacks flow into each other.
MultiVersus was the reference for the feel only; every ALVA mechanic is kept.

**What it added**

- **Ground movement:** top speed in about 0.1 s, a short natural stop, and
  turns that brake hard before accelerating.
- **Air steering:** bends the drift instead of replacing it, so a running
  jump carries its speed.
- **Fast fall:** Down (the Charge input) held in the air while falling. A
  Charge held from the air no longer starts charging on landing.
- **Dash handoff:** a Dash eases into the run instead of sliding on.
- **Attack momentum:** a running BA1 slides on, BA2 steps in, aerials keep
  their drift, and the Throw can back off. An attack faces the direction
  held as it starts.
- **Combat input buffer:** a Throw, BA1 or BA2 press that comes too early is
  kept for 0.12 s and fires on the first step it can.
- **Hit-cancel:** a hit that connects (not a block or a whiff) can be cut
  short into another attack or a jump.
- A hit now interrupts the target's own attack.
- **Combo routes:** at low Launch Point, BA1 → BA2, BA1 → BA1,
  BA2 → jump → mid-air BA1 and mid-air BA2 → land → BA1 all connect. They
  break naturally as Launch Point grows.

**Where to tune it** (`js/data/characters.js`, #0001)

- `movement`: `acceleration`, `deceleration`, `turnBoost`,
  `overspeedDeceleration`, `airAcceleration`, `airDeceleration`,
  `airTurnBoost`, `fastFallAcceleration`, `fastFallSpeed`, `attackBuffer`,
  `hitstunFriction`, `hitstunAirDrag`.
- Each attack in `attacks`: `momentum` / `airMomentum`, `control` /
  `airControl`, `friction`, `step`, `hitCancel`, plus `hitstun`,
  `hitstop` and `cooldown`, which set the combo routes.

**Code:** `Fighter.moveHorizontal`, `moveAttack` and `attackStartSpeed` in
`js/game/character.js`; `CombatState` in `js/game/combat.js`. The combat
AI (`js/game/combat-ai.js`) predicts attack drift from the same data.

**Tests:** `tests/movement.test.mjs`, `tests/combo.test.mjs`.

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

## Adding a named update

When a new piece of work gets a name, add a row to the table and a section in
the same shape: what it added, where to tune it, the code, and the tests.
