# Defense

The shared `shield` button (L, RB / RT on a gamepad, the touch **Shield**
button) is the same for every fighter; what it does is the fighter's own
`defense` entry. The product rules are
[`ALVA_SPEC.md`](../../ALVA_SPEC.md) §7.2.5.

| Module | Owns |
| --- | --- |
| [`js/game/combat/defense.js`](../../js/game/combat/defense.js) | `createDefenseDefinition`: the typed `defense` schema and its defaults (`SHIELD_DEFAULTS`). |
| [`js/game/fighters/fighter.js`](../../js/game/fighters/fighter.js) | Raising, holding and lowering the Shield (`shieldAllowed`, the Shield step in `Fighter.update`), its poses, the slow fall, the perfect Shield's clock (`perfectShield`). |
| [`js/game/combat/combat.js`](../../js/game/combat/combat.js) | What a block does (`CombatSystem.applyHit`). |
| [`js/game/combat/combat-state.js`](../../js/game/combat/combat-state.js) | `shielding`, `shieldStun`, `canShield` (any Energy left). |
| [`js/game/rendering/shield-fx.js`](../../js/game/rendering/shield-fx.js) | The Shield's look, drawn by the Arena only; no gameplay code reads it. |

## Defense types

`defense` is typed so a future fighter can defend another way on the
same button; an unknown type is refused when the fighter is built. A
fighter with no `defense` does nothing on the button. The one type so far
is the **Shield**:

| Field | Default | Meaning |
| --- | --- | --- |
| `type` | — | `'shield'` |
| `groundAnimation` | null | The held guard on the ground. Required to Shield on the ground. |
| `airAnimation` | null | The held guard in the air. None: no Shield in the air (the button does nothing there). |
| `groundStartAnimation` / `groundReleaseAnimation` | null | Optional one-pass raise and lower poses on the ground. |
| `perfectWindow` / `perfectRearm` | 0 / 0 | A hit within `perfectWindow` s of raising a Shield that had been down at least `perfectRearm` s is blocked for free, with no blockstun. 0: no perfect Shield. |
| `slowFallSpeed` / `slowFallBrake` | 0 / 6000 | Up in the air, a faster fall brakes toward `slowFallSpeed` at `slowFallBrake` per second. 0: it falls as ever. |
| `stall` | 0 | A melee blow it blocks freezes the attacker at least this many seconds (the hit's own hitstop if longer); a projectile's, a clone's or a technique's hit stalls nothing. 0: none. |

## How the Shield works

- It is a held state: up while `shield` is held and the Shield is
  allowed (the fighter free to act, not exhausted, with the held art for
  where it is), down the step it is let go. It never cuts an attack, Dash,
  technique, summon startup, stun or paralysis short; it comes up the step that
  ends if `shield` is still held.
- It takes the step: while it is held no attack, summon, technique, Dash
  or jump starts (an attack or a jump pressed meanwhile is buffered
  for the release; a summon or technique is not kept).
- On the ground it holds the fighter in place (no walking or running, the
  speed running down); in the air it drifts with no steering and, with
  `slowFallSpeed`, falls slowly. The held direction still turns the
  fighter.
- It is a full circle: any hit that reaches the fighter's own hurtboxes,
  from either side, is blocked (never a bigger circle: the drawn ring is
  art only). A blocked hit adds no Launch Point, launches nothing,
  deals no hitstun and paralyzes nothing; the Shield pays
  `energy.shieldHitCost` for it ([Energy](energy.md)) and holds through
  its hitstop and blockstun. A block that empties the bar drops the Shield
  at once; the block itself stands.
- Two hit effects get past it ([combat](combat.md#attack-mechanics-beyond-a-timed-hitbox)):
  an `unblockable` hit lands in full on a raised Shield, which pays
  nothing for it, and a blocked hit with `blockPush` still shoves the
  Shield back along its direction. A raised Shield is never drawn in by a
  pull.

Missing held art refuses the Shield (logged once per clip); missing raise
or lower poses are skipped. There is no Dodge and no chip-damage Block.

## Each fighter's defense

| Fighter | `defense` |
| --- | --- |
| [#0001](../characters/0001.md#defense-energy-and-launch-reaction) | Infinity: a Shield on the ground and in the air (held poses, slow fall to 90 units/s), stalling the melee blows it blocks for 0.25 s; perfect Shield 0.1 s after 0.25 s down. |
| [#0002](../characters/0002.md#defense-energy-and-launch-reaction) | A guard on the ground only (`airAnimation: null`); perfect Shield 0.1 s after 0.25 s down; no slow fall. |

## Tests

- [`tests/systems/defense.test.mjs`](../../tests/systems/defense.test.mjs):
  the shared input and the Shield, run with #0001's `defense` (its art,
  poses, slow fall, costs and perfect Shield) and fixtures for raise and
  lower poses, plus the rule that only the Arena draws the Shield's look.
- [`tests/systems/hit-effects.test.mjs`](../../tests/systems/hit-effects.test.mjs):
  `unblockable`, `blockPush` and the stall.
- [`tests/systems/energy.test.mjs`](../../tests/systems/energy.test.mjs):
  what blocks cost.
- [`tests/systems/sample-fighter.test.mjs`](../../tests/systems/sample-fighter.test.mjs):
  a fighter with no `defense`.
- [`tests/fighters/0002/fighter-0002.test.mjs`](../../tests/fighters/0002/fighter-0002.test.mjs):
  a ground-only guard.
