# Combat

How a button press becomes a move, how moves are defined, and how hits
are found and resolved: one system for every fighter. A fighter's moves
are data in its definition; the shared code turns that data into attacks,
projectiles, summons and techniques and resolves every hit the same way.

The product rules are [`ALVA_SPEC.md`](../../ALVA_SPEC.md) §7.2.4 (combat),
§7.2.4a (Combat Assist) and §7.2.6 (summons and techniques); Launch is its own guide
([launch](launch.md)), and so are the Shield and the Deflect
([defense](defense.md)) and Energy ([energy](energy.md)).

| Module | Owns |
| --- | --- |
| [`js/data/loadout.js`](../../js/data/loadout.js) | The loadout rules and the readers of a fighter's `actions` (`loadoutProblems`, `assertLoadout`, `actionType`, `specialAction`, `specialAttacks`, `describeLoadout`). |
| [`js/game/combat/attacks.js`](../../js/game/combat/attacks.js) | The attack schema: `createAttackDefinition`, attack phases (`attackPhase`, `strikeLive`), motions, strikes, `attackReach` (for readers such as the CPU), and what kind of strike an attack is (`isMeleeAttack`, `isRangedAttack`: one reading for Combat Assist and the CPU's moveset). |
| [`js/game/combat/combat-assist.js`](../../js/game/combat/combat-assist.js) | Combat Assist's rules of measure: `assistsAttack` (melee, never homing), `meleeGap` (an attack's box against a target's hurtboxes), `approachDistance`, `approachClear`, `assistRange` and `assistSpeed` (one Dash's travel, or one air dash's), `ASSIST_MARGIN`. |
| [`js/game/combat/combat-state.js`](../../js/game/combat/combat-state.js) | `CombatState`, one per fighter: Launch Point, Energy, the attack in progress and its clock, stun, blockstun, hitstop, paralysis, cooldowns (`CooldownTimers` for summons and techniques). |
| [`js/game/combat/combat.js`](../../js/game/combat/combat.js) | `CombatSystem`: turns back the projectiles a live `deflectProjectiles` box meets (`deflectProjectiles`), then finds every hit each fixed step and resolves it through one `applyHit`; launch reaction (`resolveLaunchReaction`, `resolveLaunchStun`, `steerLaunch`); `worldBox`. |
| [`js/game/combat/deflect.js`](../../js/game/combat/deflect.js) | The Deflect's schema (`createDeflectDefinition`): an attack definition with the fixed strike every Deflect has ([defense](defense.md#the-deflect)). |
| [`js/game/combat/hit-effects.js`](../../js/game/combat/hit-effects.js) | The shared hit effects any hit may carry (`unblockable`, `paralyze`, `blockPush`): `resolveHitEffects`, `HIT_EFFECT_FIELDS`. |
| [`js/game/combat/pull.js`](../../js/game/combat/pull.js) | Pulls: `applyPulls` (every attack and projectile pull live this step), `pullToward`. |
| [`js/game/combat/projectile.js`](../../js/game/combat/projectile.js) | Projectiles: `createProjectileDefinition`, `Projectile` (with `turnBack`, shared by repel and the Deflect), `clashProjectiles` (repel and erase), `projectileAngle` (the art's spin), spawning and cleanup. |
| [`js/game/combat/summon.js`](../../js/game/combat/summon.js) | Summons: `createSummonDefinition`, `summonProblem`, the `Clone` entity, spawning and cleanup. |
| [`js/game/combat/technique.js`](../../js/game/combat/technique.js) | Techniques: `createTechniqueDefinition`, `techniqueProblem`, the `Technique` runtime and its phases. |
| [`js/game/fighters/fighter.js`](../../js/game/fighters/fighter.js) | Turning presses into moves (`tryAction`, `tryDeflect`, `startAttack`, `trySpecial`, `trySummon`, `tryTechnique`), the combat input buffer, hit-cancels, attack motion, summon startups, Combat Assist's approach (`tryCombatAssist`, `assistIntents`, `stepCombatAssist`, `finishCombatAssist`, `cancelCombatAssist`). |

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
  `<attack>_object` (a technique's included), a summon's cloud
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

For example, #0001 has five (attack4 and attack5 techniques) and #0002
three ordinary ones ([character docs](../characters/README.md)).

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
| `lockMovement`, `momentum`, `airMomentum`, `control`, `airControl`, `friction`, `step` | true, 1, 1, 0, 0, 1, null | How the fighter moves while it plays ([movement](movement.md#5-attack-movement)): by default it keeps all the speed it starts with (a Dash's burst included), unsteered, under the normal friction. |
| `hitCancel` | null | Seconds in: from then on, once it has hit, another attack (the Deflect included), a jump, a Dash or an air dash may cut it short. |
| `projectile` | null | `{ id, spawnAt, offset }`: releases that projectile once, as its time crosses `spawnAt`. |
| `pending` | false | Art only: one pass of its clip, no hit (declaring combat fields on one is refused). |
| `hits`, `carry`, `motion`, `pull`, `deflectProjectiles`, `airUses`, `freeFall`, `passThrough`, `hurtboxes` | — | See below. |
| `unblockable` / `paralyze` / `blockPush` | false / 0 / 0 | The shared hit effects (below). |

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
combat input buffer for the universal `attackBuffer` (0.15 s,
[movement](movement.md#2-the-universal-values)) and tried every step, so
it comes out on the first step it can; in the air, a press whose ground
attack could start once the fighter lands is kept too (pressed just
before touchdown, it comes out on the ground). Summons and techniques are
never buffered.

An attack may also cut a Dash or an air dash short once the Dash is past
its `dashCancelTime` (0.05 s), keeping the Dash's speed: a Dash attack
([movement](movement.md#6-the-dash-and-the-air-dash)). And an attack
started in the air whose recovery runs on the ground is over on
touchdown (the landing cancel, [movement](movement.md#7-landing)).

The Shield button's move in the air, the Deflect, is an attack too, from
the fighter's `deflect` entry (not its `actions`): `Fighter.tryDeflect`
starts it on a fresh `shield` press in the air, under the same rules
(free to follow up, its cooldown over, not in free fall), before the
attack buttons are tried on that step; it is never buffered
([defense](defense.md#the-deflect)). Both start through the same
`startAttack`.

A hit (never a block) or a paralysis takes the target out of its own
attack on its next step. The Shield, a stun, a Dash before its cancel
time, a technique, a summon's startup or Combat Assist's approach rules a
new attack out (the approach takes this step's presses itself: see
below).

**Pace.** Every ordinary attack's phases are whole frames of its clip,
and every attack clip plays at a rate that is a whole number of 60 Hz
steps per frame (20, 15, 12 or 30 fps), so each frame lasts exactly as
long as its gameplay does. Light strikes freeze for two steps (1/30 s),
heavier ones longer; a dramatic finisher (Hollow Purple) longest. The
freeze holds the body's velocity, never loses it.

### Attack mechanics beyond a timed hitbox

Each is data on an attack (or a projectile), validated as its definition
is built, and usable by any fighter (#0001 and #0002 use them between
them today):

- **Strikes** (`hits`): a multi-hit attack lists its strikes, each live in
  its own window (`at` to `at + active`) and striking at most once, with
  its own `damage`, `baseLaunch` and `directionalLaunch`; its `hitbox`,
  `hitstun`, `blockstun`, `hitstop`, `carry` and hit effects default to
  the attack's.
  The attack's startup, active phase, overall box, damage (their sum) and
  launch (the last strike's) follow from them; declaring those on the
  attack as well is refused. A Shield that blocks a strike stops the
  string.
- **Carry** (`carry: { lift }`): a real hit that launches nothing gives
  its target the velocity of what struck it, less `lift` upward.
- **Motion** (`motion: { type, ... }`, `MOTION_DEFAULTS`): movement the
  attack makes itself, owning the body while it lasts. `hover` (no
  fields): the fighter stands on the air for the whole attack, its drift
  steered as its `airMomentum` and `airControl` allow (#0001's Floating
  Straight, Blue and air High Kick). `homing` (`range`,
  `speed` required; `rebound`, `recoil`, `exit`): hang, lock on, dash at
  the target, spring off what it meets. `bounce` (`fallSpeed` required;
  `rebound`): hang, plunge, rebound off the ground or an opponent, the
  attack over. `rise` (`speed` required): hang, then lift. `roll`
  (`speed` required; `keep`, `maxSpeed`, `friction`, `recoil`): curl, then
  roll on the running speed. A motion attack keeps its physical facing,
  and never starts while its fighter is still flying from a launch.
- **Pull** (`pull: { radius, speed, offset }`): while the attack is active
  it draws every opponent whose middle is within `radius` of its point
  (`offset`, facing right and mirrored) straight toward it at up to
  `speed`, never past it, a grounded one along the ground, an airborne one
  on both axes; a raised Shield, a paralysed fighter and one out of play
  hold their ground. The same rule runs a projectile's pull, toward its
  centre (`applyPulls` in [`pull.js`](../../js/game/combat/pull.js), each
  step after everything has moved and before hits resolve, so whoever is
  drawn into a hitbox is struck that step). `attackReach` widens the box
  to the pull's circle for the CPU.
- **Hit effects** (on any hit: an attack, a strike, a projectile, a
  finisher, a technique's burst; [`hit-effects.js`](../../js/game/combat/hit-effects.js)):
  `unblockable` (a raised Shield takes it in full and pays nothing),
  `paralyze` (seconds a real hit holds its target in place: no acting, no
  sideways speed, its hurt pose; the longer hold wins, it runs down like
  hitstun, and any hit that launches the target ends it), `blockPush` (a
  Shield that blocks it is shoved along the hit's direction). Each
  defaults to changing nothing; a value of the wrong kind is refused.
- **Turning projectiles back** (`deflectProjectiles: true`): while its
  active phase is open, its hitbox turns back every other fighter's
  projectile it meets, before any projectile strikes that step
  (`CombatSystem.deflectProjectiles`). Only every fighter's Deflect has it
  ([defense](defense.md#the-deflect)); it needs a hitbox.
- **Per airtime** (`airUses`) and **free fall** (`freeFall: true`).
- **Body** (`passThrough: true`: no pushbox while it plays; `hurtboxes`:
  the fighter's own replaced while it plays).

## Hit resolution

Each fixed step, after every fighter has moved (see the step order in
[the architecture overview](../architecture/overview.md#one-fixed-step)),
`CombatSystem.update` resolves, in order: the projectiles a live
Deflect turns back (`deflectProjectiles`: from then on they are the
deflecting fighter's, so none of them strikes it this step), fighters'
melee hitboxes (and strikes), live projectiles, summoned clones, then
techniques (a burst due on its release step). Every hit goes through one
`applyHit(attacker, target, def, ...)`, which never checks which fighter,
attack or technique it is resolving:

1. A target whose Shield is up blocks it (from any side) unless the hit is
   `unblockable`: a perfect Shield blocks for free with no blockstun,
   otherwise the Shield pays `energy.shieldHitCost`; a hit with
   `blockPush` shoves it back, and a Shield with a `stall` freezes a melee
   attacker for that long ([defense](defense.md)).
2. Otherwise the hit's `damage` is added to the target's Launch Point,
   then its launch strength is `baseLaunch` × that new Launch Point, sent
   along its `directionalLaunch` and bent by the target's launch steering
   ([launch](launch.md)).
3. Hitstun (plus the launch's extra stun) or blockstun, and the hit's
   hitstop (the attacker freezes too, unless the hit is detached: a
   projectile's, a clone's or a technique's).
4. A hit ends the target's technique and cancels its summon startup (no
   armour).
5. A launch ends any paralysis; a real hit that `paralyze`s and launches
   nothing holds the target.
6. The launch replaces the target's velocity, or a `carry` drags it.
7. One event is recorded (`type` hit or block, attacker, target, move,
   damage, Launch Point before and after, launch values, stun, `perfect`,
   the point it landed, the `paralysis` it put on and the `stall` it
   caused, and the projectile, summon or technique behind it), and the
   target's own reaction runs (`Fighter.takeHit`: its air jumps and
   per-airtime attacks back, a tumble, a launch sequence).

The events feed the hit effects and Practice Ground's damage numbers;
nothing reads them back into the simulation.

## Projectiles

`projectiles.<attack>_object`, released by an attack's `projectile`
entry. Fields (`PROJECTILE_DEFAULTS`): `animation` (a
`projectileAnimations` clip; missing art refuses the attack), `speed`,
`lifetime` (1 s), `hitbox` (centred, mirrored with its direction),
`damage`, `baseLaunch`, `directionalLaunch`, `hitstun`, `blockstun`,
`hitstop`, `carry`, `pierce: { hits, interval }` with an optional
`finisher` (its last strike), `pull: { radius, speed }`, `repel`, `erase`
and the hit effects, and `rotationSpeed` (degrees per second its art
spins as it flies, clockwise; 0, the default, is none: art only, see
[rendering](rendering.md#projectile-spin)). A projectile flies straight
in the direction its
thrower faced at the release, never turns, hits once by default (a
piercing one up to its `hits`, an erasing one each fighter once, flying
on through), and is gone on a block, at the end of its lifetime, in the
Void or against a solid. Its hits credit its thrower and freeze only its
target. When two of different owners meet (`clashProjectiles`), erasing
beats repelling beats neither: a repelling one turns the other back, its
owner's from then on; an erasing one makes it disappear; two of the same
rank that act both go; two that do neither pass each other by. A live
Deflect turns one back the same way (`Projectile.turnBack`), whatever it
is: away from the deflecting fighter, its strikes starting over, the rest
of its lifetime kept.

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

No fighter in the roster summons today; the loadout matrix's Case D
([`tests/fighters/fixtures/loadout-fighters.mjs`](../../tests/fighters/fixtures/loadout-fighters.mjs))
and the sample fighter keep the system tested.

## Techniques

A numbered button that is a technique (`{ type: 'technique', id }`)
starts `techniques[id]`: a multi-phase move the fighter itself performs,
run by [`js/game/combat/technique.js`](../../js/game/combat/technique.js).
It is not an attack, a projectile or a summon; while it runs it owns the
fighter.

**One form: the cast.** The fighter stands committed to a casting pose,
then lets go of what it casts all at once. Its phases are explicit:
*cast* (`castAnimation`, once from the press step: the fighter stands
still in the facing snapshotted at the start, the direction held on the
press step if any), *release* (on its first step it releases, exactly
once, its `projectile: { id, offset }`, thrown the snapshotted way as an
attack throws one, and its `burst: { hitbox, hit }`, whose hit is dealt
once to every opponent the box meets, facing right from the fighter and
mirrored, so a box round the fighter reaches both sides; then
`releaseAnimation` plays once) and *done*. Fields: `castAnimation`,
`releaseAnimation`, `cooldown`, `projectile`, `burst`; the burst's hit is
validated like an attack's (damage, launch, stuns and hit effects). E.g.
#0001's Unlimited Void (a burst that no Shield stops and that paralyzes)
and Hollow Purple (a projectile that erases) ([its
specification](../characters/0001.md#each-move-in-detail)). Nothing in the
runtime reads a fighter or a button; a technique of a different shape
would be a new form in the runtime with its own fields, not a
reinterpretation of these.

Any clip missing, the projectile's art missing, nothing to release, or
invalid data, and the press does nothing (logged, no cooldown). Losing
the ground or a hit on the fighter end it: whatever it had not released
yet never is, and what it already let go stays.

## Cooldowns

Ordinary attacks have short recovery cooldowns (`CombatState.cooldowns`).
Summons and techniques have their own (`CombatState.abilityCooldowns`, a
`CooldownTimers` keyed by the button: #0001's `attack4` and `attack5`),
started the moment the move is accepted, recovering in real time whatever
the fighter does, and drawn under the fighter as rings labelled by the
button (A4, A5) while they run
([rendering](rendering.md#fighter-status)). None of them costs Energy.

## Combat Assist

The human player's option (Home › Settings › Combat, on by default; the
store is [`js/core/settings.js`](../../js/core/settings.js)): a melee
press made just out of reach closes the gap first, with the Dash's
`mouvment` clip on the ground or flat across with the air dash's
`midair_mouvment` in the air, then starts the very attack asked for. The rules are
[`ALVA_SPEC.md`](../../ALVA_SPEC.md) §7.2.4a; here is how the code does it.

- **Who.** `Fighter.combatAssistOn`: the fighter's controller is a
  player's (`kind === 'player'`) with `combatAssist === true`. The
  screens read the setting as a session starts and pass it to `Battle` /
  `PracticeSession` (`combatAssist`), which give it to the
  `PlayerController` alone. A CPU's controller (`CombatAIController`,
  `TrainingAIController`) or none (the practice dummy) never has it, so
  the exclusion is structural: no slot, label or fighter id is read, and
  [`js/game/ai/combat-ai.js`](../../js/game/ai/combat-ai.js) has no
  Combat Assist code.
- **Start.** `tryAction` has checked the press may start its attack now;
  before `startAttack`, `tryCombatAssist` may start the approach instead:
  a melee attack with no homing motion (`assistsAttack`: a homing dash's
  own lock-on is its approach, so it is never served, whatever its range),
  the fighter free to act (`canAct`:
  never out of a hit-cancel or a Dash), its opponent in play, the art
  (`mouvment` on the ground, `midair_mouvment` in the air, where an air
  dash must also be left, with no free fall or launch), and
  `approachDistance` finite and above 0: not already within the attack's
  own reach (`attackReach`, its motion and pull included), its box out of
  reach by at most `assistRange` (one Dash's travel, or one air dash's),
  on the box's level and short of the pushboxes meeting; with
  `approachClear` (no solid's side on the way; on the ground, footing
  where it stops). Then it pays `dashCost` (`spendEnergy`: never while
  exhausted), in the air takes the air dash (`airDashes`), and sets
  `fighter.combatAssist` (`air` says which kind). Otherwise the attack
  starts where the fighter is, as ever.
- **Each step.** While `fighter.combatAssist` is set, `Fighter.update`
  hands the step's presses to `assistIntents` instead of the ordinary
  loop: a jump, a Dash request (read before the intents now, by
  `dashAsked`), a Shield press or hold cancels it and the move goes on
  through its own section of the step; else the first combat button
  decides (an attack `assistsAttack` accepts replaces the attack served,
  anything else, a homing attack included, cancels and is tried by
  `tryAction` at once, a reserved button does nothing).
  Then `stepCombatAssist` checks it may go on, measures again and either
  finishes (`finishCombatAssist`: stop, then `tryAction(action, held,
  false)`, never another approach) or plans this step's move (`need`),
  which the horizontal movement turns into `dashSpeed` (`airDashSpeed`,
  flat with gravity held off, in the air) or less. After the body moves,
  leaving the ground (in the air, meeting it) or a wall cancels it; a hit cancels it in
  `takeHit`, a stun or paralysis on the next step, and the arena and
  Practice Ground cancel it when its target or its fighter goes. It is
  never in the combat buffer, so a replaced or cancelled attack never
  comes out later.
- **State and art.** `canAct()` is false while it runs; the visual state
  is `assist`, playing `mouvment` at the Dash's rate (`midair_mouvment` at
  the air dash's, in the air); facing is locked
  toward the target; the speed trail draws as a Dash's. `reset` and
  `respawn` clear it.

## What a fighter may leave out

| Left out | Result |
| --- | --- |
| `extra_attack` in `actions` | the J / X button does nothing for it; its touch button is hidden |
| `attack3` to `attack5` | those buttons do nothing for it |
| `summons` / `techniques` | no special moves; the CPU never plans one |
| `projectiles` | no projectile attacks |
| `deflect` | the Shield button does nothing in the air |
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
- [`tests/systems/combat-assist.test.mjs`](../../tests/systems/combat-assist.test.mjs):
  Combat Assist for every fighter's melee buttons, its Energy, the newest
  press winning, every cancellation, the stage, and that no CPU ever has
  it.
- The shared capabilities on bespoke data:
  [`deflect.test.mjs`](../../tests/systems/deflect.test.mjs),
  [`projectile-spin.test.mjs`](../../tests/systems/projectile-spin.test.mjs),
  [`hit-effects.test.mjs`](../../tests/systems/hit-effects.test.mjs),
  [`pull.test.mjs`](../../tests/systems/pull.test.mjs),
  [`projectile-clash.test.mjs`](../../tests/systems/projectile-clash.test.mjs),
  [`technique.test.mjs`](../../tests/systems/technique.test.mjs).
- Each fighter's moves: [`tests/fighters/0001/`](../../tests/fighters/0001/)
  (every move's mechanic, its combos, the CPU playing it),
  [`tests/fighters/0002/`](../../tests/fighters/0002/).
- Every pairing of playable fighters in a real battle:
  [`tests/integration/roster-matrix.test.mjs`](../../tests/integration/roster-matrix.test.mjs).
