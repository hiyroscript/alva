# Defense

The shared `shield` button (L, RB / RT on a gamepad, the touch **Shield**
button) is the same for every fighter, and does one thing on the ground
and another in the air:

| Where | What the button does | Read from |
| --- | --- | --- |
| On the ground | **Shield**: held, a guard all round the fighter | the fighter's `defense` entry |
| In the air | **Deflect**: a fresh press, an aerial strike that turns projectiles back | the fighter's `deflect` entry |

No fighter Shields in the air, and there is no slow fall. The product
rules are [`ALVA_SPEC.md`](../../ALVA_SPEC.md) §7.2.5.

| Module | Owns |
| --- | --- |
| [`js/game/combat/defense.js`](../../js/game/combat/defense.js) | `createDefenseDefinition`: the typed `defense` schema and its defaults (`SHIELD_DEFAULTS`); an air Shield's fields are refused. |
| [`js/game/combat/deflect.js`](../../js/game/combat/deflect.js) | `createDeflectDefinition`: the `deflect` schema, an attack definition whose strike is fixed (`DEFLECT_DAMAGE`, `DEFLECT_BASE_LAUNCH`). |
| [`js/game/fighters/fighter.js`](../../js/game/fighters/fighter.js) | Raising, holding and lowering the Shield (`shieldAllowed`, the Shield step in `Fighter.update`), its poses, the perfect Shield's clock (`perfectShield`); starting the Deflect (`tryDeflect`). |
| [`js/game/combat/combat.js`](../../js/game/combat/combat.js) | What a block does (`CombatSystem.applyHit`); the projectiles a live Deflect turns back (`CombatSystem.deflectProjectiles`). |
| [`js/game/combat/combat-state.js`](../../js/game/combat/combat-state.js) | `shielding`, `shieldStun`, `canShield` (any Energy left). |
| [`js/game/rendering/shield-fx.js`](../../js/game/rendering/shield-fx.js) | The Shield's look, drawn by the Arena only; no gameplay code reads it. |

## Defense types

`defense` is typed so a future fighter can defend another way on the
same button; an unknown type is refused when the fighter is built. A
fighter with no `defense` does nothing on the button on the ground. The
one type so far is the **Shield**:

| Field | Default | Meaning |
| --- | --- | --- |
| `type` | — | `'shield'` |
| `groundAnimation` | null | The held guard. Required to Shield. |
| `groundStartAnimation` / `groundReleaseAnimation` | null | Optional one-pass raise and lower poses. |
| `perfectWindow` / `perfectRearm` | 0 / 0 | A hit within `perfectWindow` s of raising a Shield that had been down at least `perfectRearm` s is blocked for free, with no blockstun. 0: no perfect Shield. |
| `stall` | 0 | A melee blow it blocks freezes the attacker at least this many seconds (the hit's own hitstop if longer); a projectile's, a clone's or a technique's hit stalls nothing. 0: none. |

There is no air Shield: `airAnimation`, `slowFallSpeed` and
`slowFallBrake` are refused when the fighter is built, whatever their
value.

## How the Shield works

- It is a held state, on the ground only: up while `shield` is held and
  the Shield is allowed (the fighter on the ground, free to act, not
  exhausted, with its held art), down the step it is let go. It never cuts
  an attack, Dash, technique, summon startup, stun or paralysis short; it
  comes up the step that ends if `shield` is still held, a landing
  included (held through a jump it rises as the fighter lands, with its
  raise pose).
- It takes the step: while it is held no attack, summon, technique, Dash
  or jump starts (an attack or a jump pressed meanwhile is buffered
  for the release; a summon or technique is not kept).
- It holds the fighter in place (no walking or running, the speed running
  down). The held direction still turns the fighter. Leaving the ground
  (a block's push off a ledge) drops it.
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

## The Deflect

In the air the same button is the fighter's **Deflect**, its `deflect`
entry: an attack in every way (it goes through `createAttackDefinition`,
plays its own `deflect` clip, has a startup, an active phase, a recovery,
a melee hitbox, its stuns and hitstop, a cooldown, its momentum and
steering), resolved by the same `CombatSystem` as any attack. Its strike
is always **3** Launch Points at **Base Launch 2**, the shared rule
(`DEFLECT_DAMAGE`, `DEFLECT_BASE_LAUNCH`): a fighter leaves both out, and
any other value is refused. Its direction is the fighter's own.

| Field | Meaning |
| --- | --- |
| `animation` | Its clip (`deflect`). Required; missing art refuses it (logged once), never faked. |
| `startup` / `active` / `recovery` | Its phases, whole frames of its clip. |
| `hitbox` | Its live box, facing right from the fighter's origin: what its strike meets, and what it catches projectiles with. Required. |
| `directionalLaunch`, `hitstun`, `blockstun`, `hitstop`, `cooldown`, `airMomentum`, `airControl`, `airUses`, `hitCancel` | As for any attack ([combat](combat.md#attacks)). |
| `deflectProjectiles` | `true`: while it is live its box turns projectiles back (below). |
| `damage` / `baseLaunch` | Never authored: always 3 and 2. |

A Deflect may not be multi-hit (`hits`), throw a projectile, be `pending`
or `groundOnly`.

- **The press.** A fresh `shield` press (`shieldPressed`) in the air,
  never the button held: holding it starts nothing more, and a press it
  cannot use is never kept for later (it is not buffered). It needs the
  fighter in the air and free to act, or in an attack that hit and may be
  cut short (the shared hit-cancel, [combat](combat.md)): never stunned,
  paralyzed, in a Dash or an air dash, mid-attack otherwise, already
  Deflecting, cooling down, in free fall or out of `airUses`. Tried before
  the attack buttons: an attack pressed on the same step loses to it.
- **Not a Shield.** `combat.shielding` stays false throughout: no block,
  no perfect Shield, no Energy, no blockstun, no stall, no Shield look and
  no slow fall. A blow that reaches the fighter lands in full and ends the
  Deflect, as it ends any attack; two strikes that connect on the same step
  trade.
- **Turning projectiles back.** On every step, before any projectile
  strikes, `CombatSystem.deflectProjectiles` turns back every other
  fighter's live projectile that meets a live `deflectProjectiles` box
  (startup and recovery turn nothing back). The projectile is the deflecting
  fighter's from that step (`Projectile.turnBack`, the same as a
  repelling projectile's): it flies away from the fighter (to the side of
  it the projectile is on), at its own speed, its strikes starting over, so
  it can strike its old owner; it keeps the rest of its lifetime. It is the
  same projectile, never a copy, and is never destroyed for it. Being
  unblockable, repelling, piercing or erasing never stops a projectile
  being turned back. Only an attack that says so turns projectiles back.

## Each fighter's defense

| Fighter | `defense` (on the ground) | `deflect` (in the air) |
| --- | --- | --- |
| [#0001](../characters/0001.md#defense-energy-and-launch-reaction) | Infinity: stalling the melee blows it blocks for 0.25 s; perfect Shield 0.1 s after 0.25 s down. | The arm sweep: 1 / 2 / 2 frames at 15 fps (1/3 s), the front from the waist to over the head out to 50 units, launching upward. |
| [#0002](../characters/0002.md#defense-energy-and-launch-reaction) | A guard; perfect Shield 0.1 s after 0.25 s down. | The swat: 1 / 2 / 2 frames at 20 fps (1/4 s), the front from the head to the knees out to 38 units, launching sideways. |

## Tests

- [`tests/systems/defense.test.mjs`](../../tests/systems/defense.test.mjs):
  the shared input and the Shield, run with #0001's `defense` (its art,
  poses, costs and perfect Shield; no Shield in the air for #0001 or
  #0002, and the refused air fields) and fixtures for raise and
  lower poses, plus the rule that only the Arena draws the Shield's look.
- [`tests/systems/deflect.test.mjs`](../../tests/systems/deflect.test.mjs):
  the Deflect for both fighters: the press, its length, the 3 / Base
  Launch 2 rule, that it is no Shield, the projectiles it turns back (only
  while live, before they strike, to strike their thrower), Red's repel
  alongside it, and the CPU's use of it.
- [`tests/systems/hit-effects.test.mjs`](../../tests/systems/hit-effects.test.mjs):
  `unblockable`, `blockPush` and the stall.
- [`tests/systems/energy.test.mjs`](../../tests/systems/energy.test.mjs):
  what blocks cost.
- [`tests/systems/sample-fighter.test.mjs`](../../tests/systems/sample-fighter.test.mjs):
  a fighter with no `defense`.
- [`tests/fighters/0002/fighter-0002.test.mjs`](../../tests/fighters/0002/fighter-0002.test.mjs):
  #0002's guard and Deflect art.
