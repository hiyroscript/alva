# Combat

How a button press becomes a move, how moves are defined, and how hits
are found and resolved: one system for every fighter. A fighter's moves
are data in its definition; the shared code turns that data into attacks,
projectiles, summons and techniques and resolves every hit the same way.

The product rules are [`ALVA_SPEC.md`](../../ALVA_SPEC.md) §7.2.4 (combat)
and §7.2.6 (summons and techniques); Launch is its own guide
([launch](launch.md)), and so are the Shield ([defense](defense.md)) and
Energy ([energy](energy.md)).

| Module | Owns |
| --- | --- |
| [`js/data/loadout.js`](../../js/data/loadout.js) | The loadout rules and the readers of a fighter's `actions` (`loadoutProblems`, `assertLoadout`, `actionType`, `specialAction`, `specialAttacks`, `describeLoadout`). |
| [`js/game/combat/attacks.js`](../../js/game/combat/attacks.js) | The attack schema: `createAttackDefinition`, attack phases (`attackPhase`, `strikeLive`), motions, strikes, `attackReach` (for readers such as the CPU). |
| [`js/game/combat/combat-state.js`](../../js/game/combat/combat-state.js) | `CombatState`, one per fighter: Launch Point, Energy, the attack in progress and its clock, stun, blockstun, hitstop, binds, cooldowns (`CooldownTimers` for summons and techniques). |
| [`js/game/combat/combat.js`](../../js/game/combat/combat.js) | `CombatSystem`: finds every hit each fixed step and resolves it through one `applyHit`; launch reaction (`resolveLaunchReaction`, `resolveLaunchStun`, `steerLaunch`); `worldBox`. |
| [`js/game/combat/projectile.js`](../../js/game/combat/projectile.js) | Projectiles: `createProjectileDefinition`, `Projectile`, spawning and cleanup. |
| [`js/game/combat/summon.js`](../../js/game/combat/summon.js) | Summons: `createSummonDefinition`, `summonProblem`, the `Clone` entity, spawning and cleanup. |
| [`js/game/combat/technique.js`](../../js/game/combat/technique.js) | Techniques: `createTechniqueDefinition`, `techniqueProblem`, the `Technique` runtime and its phases. |
| [`js/game/fighters/fighter.js`](../../js/game/fighters/fighter.js) | Turning presses into moves (`tryAction`, `trySpecial`, `trySummon`, `tryTechnique`), the combat input buffer, hit-cancels, attack motion, summon startups. |

## Loadouts

Every fighter's moves go by the universal move codenames (`MOVES` in
[`js/config.js`](../../js/config.js)): the numbered attacks `attack1` to
`attack5`, their mid-air versions `midair_attack1` to `midair_attack5`, one
optional `extra_attack`, and the reserved `transform`. What a player calls
a move is the fighter's `abilityNames`, never its codename. The rules,
checked for every definition as the registry loads (`assertLoadout`: a
definition that breaks one is refused, every problem named):

- 2 to 5 numbered attacks, `attack1` and `attack2` always, numbered in a
  row from `attack1`. `extra_attack` is outside that count.
- Every numbered attack is a button of its own (`actions.attackN`),
  pressed directly, and its entry says what kind of move it is
  (`ACTION_TYPES`):
  - an ordinary attack, `{ ground: 'attackN', air: 'midair_attackN' }`,
    chosen by whether the fighter is grounded as the button is pressed;
    it always has its mid-air version;
  - a summon, `{ type: 'summon', id: 'attackN' }` (`summons.attackN`);
  - a technique, `{ type: 'technique', id: 'attackN' }` (`techniques.attackN`).
- `attack1` and `attack2` are always ordinary; `attack3` to `attack5` may
  be any kind. A summon or technique is keyed by its own button, is
  ground-only, has no mid-air version and has its own cooldown.
- Whatever an attack creates is named after it: a projectile
  `<attack>_object`, a summon's cloud and a technique's object
  `<attack>_object...`, a technique's own poses `<attack>_...`.
- `extra_attack: 'extra_attack'` is one attack; `transform: null` is
  wired but reserved; a button left out of `actions` does nothing for that
  fighter (its touch button is hidden and the CPU never presses it).

| Numbered attacks | Buttons (touch slots in order) |
| --- | --- |
| 2 | `attack1` `attack2` |
| 3 | `attack1` `attack2` `attack3` |
| 4 | `attack1` … `attack4` |
| 5 | `attack1` … `attack5` |

For example, #0001 has four (attack3 a summon, attack4 a technique) and
#0002 three ordinary ones ([character docs](../characters/README.md)).

## Attacks

An attack entry (`attacks.<codename>`) becomes a frozen definition through
`createAttackDefinition`. Fields and their defaults (`ATTACK_DEFAULTS`):

| Field | Default | Meaning |
| --- | --- | --- |
| `animation` | — | The fighter clip it plays; real frames are required (an attack without them is refused and logged, never faked). |
| `startup` / `active` / `recovery` | 0.08 / 0.06 / 0.18 s | Phases, normally whole frames of the clip. The hitbox exists only in `active`. |
| `hitbox` | `{ x: 0, y: -60, w: 30, h: 20 }` | Facing right from the fighter's origin (bottom-centre), mirrored with facing. `null` for a projectile attack. |
| `damage` | 0 | Added to the target's Launch Point. |
| `baseLaunch` / `directionalLaunch` | 0 / `null` | The hit's launch ([launch](launch.md)). |
| `hitstun` / `blockstun` / `hitstop` | 0.2 / 0.12 / 0.06 s | |
| `cooldown` | 0 | A short recovery cooldown after it ends or is cut short. |
| `groundOnly` | false | It never starts in the air (and an air press of it is never buffered). |
| `lockMovement`, `momentum`, `airMomentum`, `control`, `airControl`, `friction`, `step` | true, 1, 1, 0, 0, 1, null | How the fighter moves while it plays ([movement](movement.md#attack-movement)). |
| `hitCancel` | null | Seconds in: from then on, once it has hit, another attack, a jump or a Dash may cut it short. |
| `projectile` | null | `{ id, spawnAt, offset }`: releases that projectile once, as its time crosses `spawnAt`. |
| `pending` | false | Art only: one pass of its clip, no hit (declaring combat fields on one is refused). |
| `hits`, `carry`, `motion`, `airUses`, `freeFall`, `passThrough`, `hurtboxes` | — | See below. |

### From a press to a move

`Fighter.tryAction(action)` reads the button's entry: a summon or
technique goes to `trySpecial` (dispatched on its type); otherwise the
attack for where the fighter is (`attackFor`: the `ground` or `air`
branch) starts if the fighter may follow up (free, or in an attack that
hit and is past its `hitCancel`), its cooldown is over, it is not
`groundOnly` in the air, its per-airtime starts are not used up, the
fighter is not in free fall, and its art (and its projectile's art) is
there. An attack faces the direction held as it starts (the combat AI
faces its target instead). A press that cannot start yet is kept by the
combat input buffer for `movement.attackBuffer` and tried every step;
summons and techniques are never buffered.

A hit (never a block) or a bind takes the target out of its own attack on
its next step. The Shield, a stun, a Dash, a technique or a summon's
startup rules a new attack out.

### Attack mechanics beyond a timed hitbox

Each is data on an attack (or a projectile), validated as its definition
is built, and usable by any fighter (#0002 uses them all today):

- **Strikes** (`hits`): a multi-hit attack lists its strikes, each live in
  its own window (`at` to `at + active`) and striking at most once, with
  its own `damage`, `baseLaunch` and `directionalLaunch`; its `hitbox`,
  `hitstun`, `blockstun`, `hitstop` and `carry` default to the attack's.
  The attack's startup, active phase, overall box, damage (their sum) and
  launch (the last strike's) follow from them; declaring those on the
  attack as well is refused. A Shield that blocks a strike stops the
  string.
- **Carry** (`carry: { lift }`): a real hit that launches nothing gives
  its target the velocity of what struck it, less `lift` upward.
- **Motion** (`motion: { type, ... }`, `MOTION_DEFAULTS`): movement the
  attack makes itself, owning the body while it lasts. `homing` (`range`,
  `speed` required; `rebound`, `recoil`, `exit`): hang, lock on, dash at
  the target, spring off what it meets. `bounce` (`fallSpeed` required;
  `rebound`): hang, plunge, rebound off the ground or an opponent, the
  attack over. `rise` (`speed` required): hang, then lift. `roll`
  (`speed` required; `keep`, `maxSpeed`, `friction`, `recoil`): curl, then
  roll on the running speed. A motion attack keeps its physical facing,
  and never starts while its fighter is still flying from a launch.
- **Per airtime** (`airUses`) and **free fall** (`freeFall: true`).
- **Body** (`passThrough: true`: no pushbox while it plays; `hurtboxes`:
  the fighter's own replaced while it plays).

## Hit resolution

Each fixed step, after every fighter has moved (see the step order in
[the architecture overview](../architecture/overview.md#one-fixed-step)),
`CombatSystem.update` resolves, in order: fighters' melee hitboxes (and
strikes), live projectiles, summoned clones, then techniques (their ticks,
a due explosion, the rushing object's contact). Every hit goes through one
`applyHit(attacker, target, def, ...)`, which never checks which fighter,
attack or technique it is resolving:

1. A target whose Shield is up blocks it (from any side): a perfect
   Shield blocks for free with no blockstun, otherwise the Shield pays
   `energy.shieldHitCost` ([defense](defense.md)).
2. Otherwise the hit's `damage` is added to the target's Launch Point,
   then its launch strength is `baseLaunch` × that new Launch Point, sent
   along its `directionalLaunch` and bent by the target's launch steering
   ([launch](launch.md)).
3. Hitstun (plus the launch's extra stun) or blockstun, and the hit's
   hitstop (the attacker freezes too, unless the hit is detached: a
   projectile's, a clone's or a technique's).
4. A hit ends the target's technique and cancels its summon startup (no
   armour).
5. The launch replaces the target's velocity, or a `carry` drags it.
6. One event is recorded (`type` hit or block, attacker, target, move,
   damage, Launch Point before and after, launch values, stun, `perfect`,
   the point it landed, and the projectile, summon or technique behind
   it), and the target's own reaction runs (`Fighter.takeHit`: its air
   jumps and per-airtime attacks back, a tumble, a launch sequence).

The events feed the hit effects and Practice Ground's damage numbers;
nothing reads them back into the simulation.

## Projectiles

`projectiles.<attack>_object`, released by an attack's `projectile`
entry. Fields (`PROJECTILE_DEFAULTS`): `animation` (a
`projectileAnimations` clip; missing art refuses the attack), `speed`,
`lifetime` (1 s), `hitbox` (centred, mirrored with its direction),
`damage`, `baseLaunch`, `directionalLaunch`, `hitstun`, `blockstun`,
`hitstop`, `carry`, and `pierce: { hits, interval }` with an optional
`finisher` (its last strike). A projectile flies straight in the direction
its thrower faced at the release, never turns, hits once by default (or
pierces), and is gone on a block, at the end of its lifetime, in the Void
or against a solid. Its hits credit its thrower and freeze only its
target.

## Summons

A numbered button that is a summon (`{ type: 'summon', id }`) starts
`summons[id]`: the shared summon system in
[`js/game/combat/summon.js`](../../js/game/combat/summon.js). The one kind
of summon so far is a **clone** of its owner: a temporary attack entity
(not a fighter) drawn with the owner's art, performing one of the owner's
own attacks once.

| Field | Default | Meaning |
| --- | --- | --- |
| `attack` | — | The owner attack the clone performs (needs a hitbox and real frames). |
| `cloud` | — | The effect clip it appears and vanishes through (`effectAnimations`, named `<attack>_object`). |
| `startupAnimation` | null | An owner clip played once before the clone is sent out (the owner committed, still, keeping its facing); none: sent out on the press. |
| `cooldown` | 0 | Seconds before it can be used again, from the press. |
| `behindDistance` | 48 | World units behind the target it appears. |
| `effectOffset` | `{ x: 0, y: 0 }` | The cloud's centre from the clone's origin, facing right. |
| `noGround` | null | `{ attack, offset }`: where there is no ground behind the target, appear at `offset` from the target and perform this attack instead. |

A clone lives through three phases (appear: the cloud forwards; attack:
the attack once, with its own data; vanish: the cloud backwards) and is
then removed. It never moves, turns or retargets, has no Launch Point,
hurtboxes, pushbox or physics, and its hit is the attack's own, resolved
by `applyHit` and credited to the owner. No opponent in play, or missing
art, and the press does nothing (no cooldown). The exact rules:
[`ALVA_SPEC.md`](../../ALVA_SPEC.md) §7.2.6.

#0001's Clone Attack (`attack3`) is the one summon today
([its specification](../characters/0001.md#attack3-the-clone-attack)).

## Techniques

A numbered button that is a technique (`{ type: 'technique', id }`)
starts `techniques[id]`: a multi-phase move the fighter itself performs,
run by [`js/game/combat/technique.js`](../../js/game/combat/technique.js).
It is not an attack, a projectile or a summon; while it runs it owns the
fighter.

**One form so far.** The runtime implements one shape of technique: an
object formed in the hand, carried on a grounded rush, binding what it
meets, ticking while it holds it, then exploding. Its phases are
explicit (form, dash, then whiff release, or confirm, wait, explode,
release; then done). Its fields name the fighter clips for those phases
(`formAnimation`, `dashAnimation`, `confirmAnimation`,
`explosionAnimation`, `releaseAnimation`, `whiffReleaseAnimation`), the
object's effect clips (`sphereBuild`, `sphereImpact`, `sphereExplosion`),
`cooldown`, `dashSpeed`, per-frame `handOffsets`, `sphereHitbox`,
`targetOffset`, `explosionDelay`, `sphereGrowth`, and its hits
(`firstHit`, `tickHit` every `tickInterval`, `explosionHit`), each
validated like an attack's. The field names come from the first technique
built on it, #0001's Sphere Rush
([its specification](../characters/0001.md#attack4-the-sphere-rush)), but
nothing in the runtime reads a fighter or a button. A technique of a
different shape (one that does not rush, hold or explode) would be a new
form in the runtime with its own fields, not a reinterpretation of these.

Any clip or effect missing, or invalid data, and the press does nothing
(logged, no cooldown). Losing the ground, a hit on the fighter, a
blocked contact or a lost bind end it.

## Cooldowns

Ordinary attacks have short recovery cooldowns (`CombatState.cooldowns`).
Summons and techniques have their own (`CombatState.abilityCooldowns`, a
`CooldownTimers` keyed by the button: `attack3`, `attack4`), started the
moment the move is accepted, recovering in real time whatever the fighter
does, and drawn under the fighter as A3 / A4 rings while they run
([rendering](rendering.md#fighter-status)). None of them costs Energy.

## What a fighter may leave out

| Left out | Result |
| --- | --- |
| `extra_attack` in `actions` | the J / X button does nothing for it; its touch button is hidden |
| `attack3` to `attack5` | those buttons do nothing for it |
| `summons` / `techniques` | no special moves; the CPU never plans one |
| `projectiles` | no projectile attacks |
| `transform` (or `null`) | reserved: the button is wired, does nothing, dashed on touch |

## Tests

- [`tests/systems/loadout.test.mjs`](../../tests/systems/loadout.test.mjs)
  over the loadout matrix
  ([`tests/fighters/fixtures/loadout-fighters.mjs`](../../tests/fighters/fixtures/loadout-fighters.mjs)),
  every rule broken on purpose.
- [`tests/systems/combo.test.mjs`](../../tests/systems/combo.test.mjs),
  [`fighter-stats.test.mjs`](../../tests/systems/fighter-stats.test.mjs),
  [`codenames.test.mjs`](../../tests/systems/codenames.test.mjs),
  [`sample-fighter.test.mjs`](../../tests/systems/sample-fighter.test.mjs)
  (a fighter that is not #0001, with different moves on the same
  codenames).
- Each fighter's moves: [`tests/fighters/0001/`](../../tests/fighters/0001/)
  (attack1, attack2, the Throw, the Clone Attack and its startup, the
  Sphere Rush), [`tests/fighters/0002/`](../../tests/fighters/0002/).
- Every pairing of playable fighters in a real battle:
  [`tests/integration/roster-matrix.test.mjs`](../../tests/integration/roster-matrix.test.mjs).
