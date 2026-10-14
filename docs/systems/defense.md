# Defense

The shared `shield` button (L, Circle / B on a controller by default, the
touch **Shield** button) is the same for every fighter, and does one thing
on the ground and another in the air. A controller may give the two
different inputs (the Shield held, the Deflect pressed: Settings ›
Controls › Controller controls); both still send `shield`:

| Where | What the button does | Read from |
| --- | --- | --- |
| On the ground | **Shield**: held, a guard all round the fighter | the fighter's `defense` entry |
| In the air | **Deflect**: a fresh press, an aerial strike that turns projectiles back | the fighter's `deflect` entry |

No fighter Shields in the air, and there is no slow fall. The product
rules are [`ALVA_SPEC.md`](../../ALVA_SPEC.md) §7.2.5.

The Shield is a defense and never an attack; the Deflect is both an attack
and a defense ([attack classification](combat.md#attack-classification)).
Every attack is blockable: a raised Shield blocks whatever reaches it.

| Module | Owns |
| --- | --- |
| [`js/game/combat/defense.js`](../../js/game/combat/defense.js) | `createDefenseDefinition`: the typed `defense` schema and its defaults (`SHIELD_DEFAULTS`); an air Shield's fields are refused, and so are a hit's (a Shield deals nothing: its `offense` is `PURE_DEFENSE`). |
| [`js/game/combat/deflect.js`](../../js/game/combat/deflect.js) | `createDeflectDefinition`: the `deflect` schema, an attack definition whose strike is fixed (`DEFLECT_DAMAGE`, `DEFLECT_BASE_LAUNCH`). |
| [`js/game/fighters/fighter.js`](../../js/game/fighters/fighter.js) | Raising, holding and lowering the Shield (`shieldAllowed`, the Shield step in `Fighter.update`), its poses, the perfect Shield's clock (`perfectShield`); starting the Deflect and paying for it (`tryDeflect`). |
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
| `perfectWindow` / `perfectRearm` | 0 / 0 | A hit within `perfectWindow` s of raising a Shield that had been down at least `perfectRearm` s is a perfect block: no blockstun, for the same 15 Energy as any block. 0: no perfect Shield. |
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
  raise pose). The one exception is the human player's own attack: a
  Shield press made after that attack began cuts it and goes up on that
  step ([combat](combat.md#the-players-requests)).
- It takes the step: while it is held no attack, summon, technique, Dash
  or jump starts (an attack or a jump pressed meanwhile is buffered
  for the release; a summon or technique is not kept).
- It holds the fighter in place (no walking or running, the speed running
  down). The held direction still turns the fighter. Leaving the ground
  (a block's push off a ledge) drops it.
- It is a full circle: every hit that reaches the fighter's own
  hurtboxes, from any side, is blocked (never a bigger circle: the drawn
  ring is art only), whatever made it: a melee strike, each strike of a
  string, a Deflect's strike, a projectile (thrown, cast, piercing,
  erasing, or turned back), a finisher, a clone's strike, a technique's
  burst. No damage, launch, size, speed or effect gets a hit through, and
  no field can declare a way past it (`unblockable` and the rest are
  refused: [combat](combat.md#attack-classification)). A blocked hit adds
  no Launch Point, launches nothing, deals no hitstun, paralyzes nothing,
  carries nothing and never cuts the fighter's own technique or summon
  startup short; a blocked projectile is stopped there (an erasing or
  piercing one too), so nothing it threw comes through later. The Shield
  pays 15 Energy for it (`BLOCK_ENERGY_COST`, the same for every fighter
  and every block, a perfect one's included: [Energy](energy.md)) and
  holds through its hitstop and blockstun. No block gives Energy back.
- A Shield up when a hit reaches it blocks that hit even if paying for it
  empties the bar (it pays what is left). The fighter is then exhausted
  and the Shield drops at once: only a hit after that (another one on the
  same step included, hits resolving in a fixed order) can land. The
  block itself stands.
- What a blocked hit still does: its hitstop and blockstun, a `blockPush`
  shove along its direction (and nothing more), and the Shield's `stall`
  on a melee attacker. A raised Shield is never drawn in by a pull.

Missing held art refuses the Shield (logged once per clip); missing raise
or lower poses are skipped. There is no Dodge and no chip-damage Block.

## The Deflect

In the air the same button is the fighter's **Deflect**, its `deflect`
entry: an attack in every way (it goes through `createAttackDefinition`,
plays its own `deflect` clip, has a startup, an active phase, a recovery,
a melee hitbox, its stuns and hitstop, its own cooldown, exempt from the 0.5 s baseline, its
momentum and steering), resolved by the same `CombatSystem` as any attack.
It costs 15 Energy (`DEFLECT_ENERGY_COST`), paid once as it starts. Its strike
is always **3** Launch Points at **Base Launch 2**, the shared rule
(`DEFLECT_DAMAGE`, `DEFLECT_BASE_LAUNCH`): a fighter leaves both out, and
any other value is refused. Its direction is the fighter's own.

| Field | Meaning |
| --- | --- |
| `animation` | Its clip (`deflect`). Required; missing art refuses it (logged once), never faked. |
| `startup` / `active` / `recovery` | Its phases, whole frames of its clip. |
| `hitbox` | Its live box, facing right from the fighter's origin: what its strike meets, and what it catches projectiles with. Required. |
| `directionalLaunch`, `hitstun`, `blockstun`, `hitstop`, `cooldown` (finite and non-negative, no baseline floor), `airMomentum`, `airControl`, `airUses`, `hitCancel` | As for any attack ([combat](combat.md#attacks)). |
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
  Deflecting, cooling down, exhausted, in free fall or out of `airUses`.
  Tried before the attack buttons: an attack pressed on the same step
  loses to it.
- **Its Energy.** 15 (`DEFLECT_ENERGY_COST`), paid as it starts
  (`Fighter.tryDeflect`, through `payEnergy`; no refill on that step),
  whatever it then meets: a whiff has paid it all the same, and one that
  strikes or turns a projectile back gives none of it back. Exhausted, it
  does not start; with less than 15 left it takes the rest.
- **An attack and a defense.** Its `offense` is `{ attack: true, defense:
  true }`: its strike is an attack in every way (startup, active frames,
  recovery, hit detection, damage, launch, hitstop, hit-cancels, being
  cut short, the CPU's offense), blocked by a raised ground Shield like
  any other; turning projectiles back is a real defense. Every Deflect
  turns projectiles back (`deflectProjectiles: false` is refused).
- **Not a Shield.** `combat.shielding` stays false throughout: no block,
  no perfect Shield, no block's Energy (only its own 15), no blockstun, no
  stall, no Shield look and no slow fall. A blow it does not turn back
  reaches the fighter and lands in full, ending the Deflect, as it ends
  any attack; two strikes that connect on the same step trade.
- **Turning projectiles back.** On every step, before any projectile
  strikes, `CombatSystem.deflectProjectiles` turns back every other
  fighter's live projectile that meets a live `deflectProjectiles` box
  (startup and recovery turn nothing back). The projectile is the deflecting
  fighter's from that step (`Projectile.turnBack`, the same as a
  repelling projectile's): it flies away from the fighter (to the side of
  it the projectile is on), at its own speed, its strikes starting over, so
  it can strike its old owner; it keeps the rest of its lifetime. It is the
  same projectile, never a copy, and is never destroyed for it. Being
  repelling, piercing or erasing never stops a projectile being turned
  back. Turned back, it is still an attack (now the deflecting fighter's,
  its events `redirected`, keeping the ability that made it) and still
  blockable: its new target's raised Shield blocks it and stops it. Only
  an attack that says so turns projectiles back.

## Each fighter's defense

| Fighter | `defense` (on the ground) | `deflect` (in the air) |
| --- | --- | --- |
| [#0001](../characters/0001.md#defense-energy-and-launch-reaction) | Infinity: stalling the melee blows it blocks for 0.25 s; perfect Shield 0.1 s after 0.25 s down. | The arm sweep: 1 / 2 / 2 frames at 15 fps (1/3 s), the front from the waist to over the head out to 50 units, launching upward; no cooldown. |
| [#0002](../characters/0002.md#defense-energy-and-launch-reaction) | A guard; perfect Shield 0.1 s after 0.25 s down. | The swat: 1 / 2 / 2 frames at 20 fps (1/4 s), the front from the head to the knees out to 38 units, launching sideways; a 0.05 s cooldown. |
| [#0003](../characters/0003.md#defense-energy-and-launch-reaction) | A guard of crossed arms; perfect Shield 0.1 s after 0.25 s down. | The rising backhand sweep: 1 / 2 / 2 frames at 20 fps (1/4 s), the front from the feet to over the head out to 46 units, launching upward; no cooldown. |

## Tests

- [`tests/systems/defense.test.mjs`](../../tests/systems/defense.test.mjs):
  the shared input and the Shield, run with #0001's `defense` (its art,
  poses, costs and perfect Shield; no Shield in the air for #0001 or
  #0002, and the refused air fields) and fixtures for raise and
  lower poses, plus the rule that only the Arena draws the Shield's look.
- [`tests/systems/deflect.test.mjs`](../../tests/systems/deflect.test.mjs):
  the Deflect for both fighters: the press, its length, the 3 / Base
  Launch 2 rule, its 15 Energy, that it is no Shield, the projectiles it turns back (only
  while live, before they strike, to strike their thrower), Red's repel
  alongside it, and the CPU's use of it.
- [`tests/systems/hit-effects.test.mjs`](../../tests/systems/hit-effects.test.mjs):
  `paralyze`, `blockPush` and the stall, a hit that once got past a Shield
  blocked like any other, and every way past one refused.
- [`tests/systems/shield-protection.test.mjs`](../../tests/systems/shield-protection.test.mjs):
  every damage source of every fighter (melee, strings, projectiles,
  piercing, erasing, finishers, techniques, clones, Deflects, projectiles
  turned back, and a test-only fighter's summon, two-source cast,
  lingering field and hybrid strike) against an open target, a raised,
  perfect, from-behind and last-Energy Shield; same-step hits and
  exhaustion; blocks never reaching a real hit's handlers.
- [`tests/systems/attack-classification.test.mjs`](../../tests/systems/attack-classification.test.mjs):
  the Shield a defense only, the Deflect both.
- [`tests/systems/energy.test.mjs`](../../tests/systems/energy.test.mjs)
  and [`tests/systems/combat-rules.test.mjs`](../../tests/systems/combat-rules.test.mjs):
  what blocks, perfect blocks and Deflects cost, for every fighter, and
  that none gives any back.
- [`tests/systems/sample-fighter.test.mjs`](../../tests/systems/sample-fighter.test.mjs):
  a fighter with no `defense`.
- [`tests/fighters/0002/fighter-0002.test.mjs`](../../tests/fighters/0002/fighter-0002.test.mjs):
  #0002's guard and Deflect art.
- [`tests/fighters/0003/fighter-0003.test.mjs`](../../tests/fighters/0003/fighter-0003.test.mjs):
  #0003's guard and Deflect, and its quakes against a raised Shield.
