# Combat

How a button press becomes a move, how moves are defined, and how hits
are found and resolved: one system for every fighter. A fighter's moves
are data in its definition; the shared code turns that data into attacks,
projectiles, summons and techniques and resolves every hit the same way.
Whatever executes it, every move that can deal damage is an attack, and a
raised Shield blocks every attack ([attack
classification](#attack-classification)).

The product rules are [`ALVA_SPEC.md`](../../ALVA_SPEC.md) §7.2.4 (combat,
move cancellation included: the strict rules), §7.2.4a (Automatic
turn-around), §7.2.4b (the player's attack buttons) and §7.2.6 (summons and
techniques); Launch is its own guide
([launch](launch.md)), and so are the Shield and the Deflect
([defense](defense.md)) and Energy ([energy](energy.md)).

| Module | Owns |
| --- | --- |
| [`js/data/loadout.js`](../../js/data/loadout.js) | The loadout rules and the readers of a fighter's `actions` (`loadoutProblems`, `assertLoadout`, `actionType`, `specialAction`, `specialAttacks`, `describeLoadout`). |
| [`js/data/special-abilities.js`](../../js/data/special-abilities.js) | The player-facing Special classification, each fighter's own (`specialAbilities` in its definition): `isSpecialAbility`, `specialAbilities`, `performableMoves`, `specialAbilityProblems`, `assertSpecialAbilities`. |
| [`js/game/combat/attacks.js`](../../js/game/combat/attacks.js) | The attack schema: `createAttackDefinition`, attack phases (`attackPhase`, `strikeLive`), motions, strikes, `attackReach` (for readers such as the CPU), and what kind of strike an attack is (`isMeleeAttack`, `isRangedAttack`: one reading for every reader, the CPU's moveset included). |
| [`js/data/cooldowns.js`](../../js/data/cooldowns.js) | The cooldown policy: `COOLDOWN_CLASSES` (ordinary 0, exceptional 3 s, ten-damage 5 s), `RELEASE_EVENTS`, `cooldownClass`, `resolveCooldown`. |
| [`js/data/energy.js`](../../js/data/energy.js) | The Energy policy: `ENERGY_COST` (15, every price), `createsConstruct`, `constructEnergyCost`, `resolveMoveEnergy`. |
| [`js/game/combat/combat-state.js`](../../js/game/combat/combat-state.js) | `CombatState`, one per fighter: Launch Point, Energy, the attack in progress and its clock, stun, blockstun, hitstop, paralysis, a float (`float`, `afloat`), a charm and who put it on (`charmBy`, `charmedTo`), a fear and who put it on (`frightenBy`, `frightenedOf`), cooldowns (`CooldownTimers` for summons and techniques). |
| [`js/game/combat/combat.js`](../../js/game/combat/combat.js) | `CombatSystem`: turns back the projectiles a live `deflectProjectiles` box meets (`deflectProjectiles`), then finds every hit each fixed step and resolves it through one `applyHit`; launch reaction (`resolveLaunchReaction`, `resolveLaunchStun`, `steerLaunch`); `worldBox`. |
| [`js/game/combat/deflect.js`](../../js/game/combat/deflect.js) | The Deflect's schema (`createDeflectDefinition`): an attack definition with the fixed strike every Deflect has ([defense](defense.md#the-deflect)). |
| [`js/game/combat/hit-effects.js`](../../js/game/combat/hit-effects.js) | The shared hit effects any hit may carry (`paralyze`, `blockPush`, `quake`, `charm`, `float`, `fear`, `gaze`): `resolveHitEffects`, `HIT_EFFECT_FIELDS`, `FLOAT_RISE_SPEED`, `hitReaches`, `createHit`; it refuses any way past a Shield. |
| [`js/game/combat/offense.js`](../../js/game/combat/offense.js) | The attack classification: what a definition can do, apart from how it is executed (`attackOffense`, `projectileOffense`, `techniqueOffense`, `summonOffense`, `actionOffense`, `classifyHit`, `isHarmfulHit`, `resolveOffense`), the hit sources events name (`ATTACK_SOURCES`), and the refused Shield bypasses (`SHIELD_BYPASS_FIELDS`, `assertNoShieldBypass`). |
| [`js/game/combat/pull.js`](../../js/game/combat/pull.js) | Pulls: `applyPulls` (every attack and projectile pull live this step), `pullToward`. |
| [`js/game/combat/projectile.js`](../../js/game/combat/projectile.js) | Projectiles: `createProjectileDefinition`, `Projectile` (with `turnBack`, shared by repel and the Deflect), `clashProjectiles` (repel and erase), `projectileAngle` (the art's spin), spawning and cleanup. |
| [`js/game/combat/summon.js`](../../js/game/combat/summon.js) | Summons: `createSummonDefinition`, `summonProblem`, the `Clone` entity, spawning and cleanup. |
| [`js/data/cooldowns.js`](../../js/data/cooldowns.js) | The cooldown policy: `REPEAT_COOLDOWN`, `EXCEPTIONAL_COOLDOWN`, `TEN_DAMAGE_COOLDOWN`, `EXCEPTIONAL_EFFECTS` / `ROUTINE_EFFECTS`, `moveImpact`, `cooldownClass`, `policyCooldown`, `resolveCooldown`. |
| [`js/game/combat/move-status.js`](../../js/game/combat/move-status.js) | A read-only view of a fighter's moves for presentation: `abilityGroups`, `moveCooldown`, `moveRestriction`, `abilityStatus`, `activeMove` and `activeSpecialAbility` (the move being performed now, and whether it is one of its fighter's Specials). |
| [`js/game/combat/technique.js`](../../js/game/combat/technique.js) | Techniques: `createTechniqueDefinition`, `techniqueProblem`, the `Technique` runtime and its phases. |
| [`js/game/fighters/fighter.js`](../../js/game/fighters/fighter.js) | Turning presses into moves (`tryAction`, `attackStartable`, `tryDeflect`, `startAttack`, `trySpecial`, `trySummon`, `tryTechnique`), requests and cancellation (`pressRequest`, `repeatsMove`, `moveYields`, `canFollowUp`, `cutAttack`, `payEnergy`), the combat input buffer, hit-cancels, attack motion, summon startups, facing (`updateFacing`, `facingLocked`, `faceAttackTarget`, `updateAttackFacing`, `settleFacing`) and Automatic turn-around (`automaticTurnAround`, `enemies`, `turnAroundFacing`, `attackTargetFacing`). |
| [`js/game/fighters/turn-around.js`](../../js/game/fighters/turn-around.js) | Automatic turn-around's targeting: `isValidEnemy` (a fighter in play with a real position, never itself, a projectile or an effect), `closestEnemy` (squared world distance, ties to the first listed) and `facingToward` (1, -1, or null at the same x). |

## Loadouts

Every fighter's moves go by the universal move codenames (`MOVES` in
[`js/config.js`](../../js/config.js)): the numbered attacks `attack1` to
`attack5`, their mid-air versions `midair_attack1` to `midair_attack5` and
one optional `extra_attack`. Those are the only combat buttons
(`COMBAT_BUTTONS`): an `actions` entry for any other name is refused. What
a player calls a move is the fighter's `abilityNames`, never its codename. The rules,
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
  ground-only, has no mid-air version and has a cooldown of its own (the
  [cooldown policy](#cooldowns)'s).
- Whatever an attack creates is named after it: a projectile
  `<attack>_object` (a technique's included), a summon's cloud
  `<attack>_object...`, a technique's own poses `<attack>_...`.
- `extra_attack: 'extra_attack'` is one attack, and `extra_attack: null`
  a button wired but reserved; a button left out of `actions` does nothing
  for that fighter (its touch button is hidden and the CPU never presses
  it).
- A fighter drawn as several members (an `ensemble`,
  [rendering](rendering.md#ensembles)) names on each of its moves (an
  attack, a technique, its Deflect) who performs it, `members`, and each
  performer has the move's clip among her own; the loadout reads a move's
  clips from its performers. A move is one move however many members
  perform it: one press, one cooldown, the strikes it authors and nothing
  more; hit anywhere on its one hurtbox, the fighter takes the hit once.

| Numbered attacks | Buttons (touch slots in order) |
| --- | --- |
| 2 | `attack1` `attack2` |
| 3 | `attack1` `attack2` `attack3` |
| 4 | `attack1` … `attack4` |
| 5 | `attack1` … `attack5` |

For example, #0001 has five (attack4 and attack5 techniques), #0002
three ordinary ones, #0003 four (attack3 and attack4 techniques),
#0004 five (attack4 and attack5 techniques), #0005 five (attack4 a
technique, attack5 a summon) and #0006 five (attack3 to attack5
techniques)
([character docs](../characters/README.md)).

## Attacks

An attack entry (`attacks.<codename>`) becomes a frozen definition through
`createAttackDefinition`. Fields and their defaults (`ATTACK_DEFAULTS`):

| Field | Default | Meaning |
| --- | --- | --- |
| `animation` | — | The fighter clip it plays; real frames are required (an attack without them is refused and logged, never faked). |
| `startup` / `active` / `recovery` | 0.08 / 0.06 / 0.18 s | Phases, normally whole frames of the clip. The hitbox exists only in `active`. |
| `hitbox` | `{ x: 0, y: -60, w: 30, h: 20 }` | Facing right from the fighter's origin (bottom-centre), mirrored with facing. `null` for a projectile attack. |
| `damage` | — | Added to the target's Launch Point: 1, 3, 5 or 10 and nothing else (below). Required for an attack with a hitbox; one with none (a throw) may not declare it. |
| `baseLaunch` / `directionalLaunch` | 0 / `null` | The hit's launch ([launch](launch.md)). |
| `hitstun` / `blockstun` / `hitstop` | 0.2 / 0.12 / 0.06 s | |
| `cooldown` | policy | 0 for an ordinary move, else 3 s or 5 s from its release: derived by the [cooldown policy](#cooldowns); leave it out. |
| `energyCost` | policy | 15 for an ordinary attack that throws a projectile (a construct), else 0: derived by the [Energy policy](energy.md#construct-moves); leave it out. |
| `groundOnly` | false | It never starts in the air (and an air press of it is never buffered). |
| `momentum` / `airMomentum` / `friction` | 1 / 1 / 1 | What it keeps of the speed it starts with (on the ground, in the air) and × the ground deceleration its speed runs down under ([movement](movement.md#5-attack-movement)). Nothing steers an attack: `mobility`, `control`, `airControl`, `topSpeed`, `airTopSpeed` and `lockMovement` are refused. |
| `step` | the shared Step-in | `{ at, speed }` for a lunge of its own, `false` for a move that never lunges; left out, a grounded direct strike gets the shared Step-in and anything else none. The definition records the verdict (`stepIn`: `authored`, `universal`, `declined`, `exempt`; [movement](movement.md#5-attack-movement)). |
| `hitCancel` | null | Seconds in: from then on, once it has hit, another attack (the Deflect included), a jump, a Dash or an air dash may cut it short. The only way a request ever cuts an attack that can harm short. |
| `projectile` | null | `{ id, spawnAt, offset }`: releases that projectile once, as its time crosses `spawnAt`. |
| `pending` | false | Art only: one pass of its clip, no hit (declaring combat fields on one is refused). |
| `hits`, `carry`, `motion`, `pull`, `deflectProjectiles`, `airUses`, `freeFall`, `passThrough`, `hurtboxes` | — | See below. |
| `paralyze` / `blockPush` / `quake` / `charm` / `float` / `fear` / `gaze` | 0 / 0 / false / 0 / 0 / 0 / false | The shared hit effects (below). |
| `offensive` | — | Optional, and only to agree with what the attack does ([attack classification](#attack-classification)). |

### From a press to a move

`Fighter.tryAction(action)` reads the button's entry: a summon or
technique goes to `trySpecial` (dispatched on its type); otherwise the
attack for where the fighter is (`attackFor`: the `ground` or `air`
branch) starts if the fighter may follow up (`canFollowUp`: free, in an
attack that hit and is past its `hitCancel`, in a Dash past its cancel
time, or in a move that yields: see [requests and
cancellation](#requests-and-cancellation)), it is not the attack already
playing (never into itself), its cooldown is over (a 3 s or 5 s one: an
ordinary attack has none), its Energy can be paid (`energyCost`, a
throw's 15; never while exhausted), it is not
`groundOnly` in the air, its per-airtime starts are not used up, the
fighter is not in free fall, and its art (and its projectile's art) is
there. An attack faces the direction held as it starts (the combat AI
faces its target as it perceives it instead). A press that cannot start yet is kept by the
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
time, a technique or a summon's startup rules a new attack out, and so
does an attack that can harm outside its hit-confirmed window: a new
request never cuts it, for the human player as for a CPU; it waits in the
buffer ([requests and cancellation](#requests-and-cancellation)). The
Deflect and a move that harms nobody are the exception: they give way to
any valid request. An attack always starts where
the fighter stands: one pressed out of reach whiffs, and nothing moves the
fighter toward its target first (an attack's own `motion`, `step` or pull
is its own data, never an approach).

**Pace.** Every ordinary attack's phases are whole frames of its clip,
and every attack clip plays at a rate that is a whole number of 60 Hz
steps per frame (20, 15, 12 or 30 fps), so each frame lasts exactly as
long as its gameplay does. Light strikes freeze for two steps (1/30 s),
heavier ones longer; a dramatic finisher (Hollow Purple) longest. The
freeze holds the body's velocity, never loses it.

### Attack mechanics beyond a timed hitbox

Each is data on an attack (or a projectile), validated as its definition
is built, and usable by any fighter (#0001 to #0006 use them between them
today):

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
  (its `airMomentum` share) carried on, never steered (#0001's Floating
  Straight, Blue and air High Kick). `homing` (`range`,
  `speed` required; `rebound`, `recoil`, `exit`): hang, lock on, dash at
  the target, spring off what it meets. `bounce` (`fallSpeed` required;
  `rebound`): hang, plunge, rebound off the ground or an opponent, the
  attack over. `rise` (`speed` required): hang, then lift. `roll`
  (`speed` required; `keep`, `maxSpeed`, `friction`, `recoil`): curl, then
  roll on the running speed. `slam` (`fallSpeed` required; `impact`): the
  plunge that lands: hang through the startup, then plunge at `fallSpeed`
  for the active phase, striking whatever the box passes and never stopped
  by it; meeting the ground ends the plunge there, and the attack goes
  straight to its recovery, played on the ground (no landing cancel, no
  rebound) in its `impact.animation` clip (named `<attack>_impact`, from
  the attack's own art) if it has one. Its optional `impact` (`hitbox`,
  `hit`, `animation`) is struck once, the step it lands, at every opponent
  its box meets round the landing point, either side; its hit is
  validated like an attack's. A plunge that runs out in the air lands
  nothing and falls on under gravity (#0003's Heavenly Foot of Pain).
  `attackReach` takes in the plunge and the impact where it would land at
  the furthest. A motion attack keeps its physical facing,
  and never starts while its fighter is still flying from a launch.
- **Pull** (`pull: { radius, speed, offset, front }`): while the attack is
  active it draws every opponent whose middle is within `radius` of its
  point (`offset`, facing right and mirrored) straight toward it at up to
  `speed`, never past it, a grounded one along the ground, an airborne one
  on both axes; a raised Shield, a paralysed (or floating) fighter and one
  out of play hold their ground. With `front: true` it reaches only the
  side it faces: an opponent whose middle is behind its fighter (behind a
  projectile, the way it flies) is left where it is (#0005's Dark
  Tendrils). A pull never shoves its owner: a fighter it draws remembers
  whose pull it was (`Fighter.drawnBy`) while drawn and, once the pull is
  over, for as long as it is still carried toward that fighter, helpless
  (stunned or held), on the speed it was drawn with; meanwhile its pushbox
  stops against that fighter's (`separateFighters`), its speed toward it
  gone, rather than pushing it back. Free to act again, or no longer moving
  toward it, it pushes and is pushed as ever. The same rule runs a projectile's pull, toward its
  centre (`applyPulls` in [`pull.js`](../../js/game/combat/pull.js), each
  step after everything has moved and before hits resolve, so whoever is
  drawn into a hitbox is struck that step). `attackReach` widens the box
  to the pull's circle for the CPU.
- **Hit effects** (on any hit: an attack, a strike, a projectile, a
  finisher, a technique's burst; [`hit-effects.js`](../../js/game/combat/hit-effects.js)):
  `paralyze` (seconds a real hit holds its target in place: no acting, no
  sideways speed, its hurt pose; the longer hold wins, it runs down like
  hitstun, and any hit that launches the target ends it; a blocked hit
  paralyzes nobody), `blockPush` (a Shield that blocks it is shoved along
  the hit's direction, and nothing more), `quake` (true or false: a hit
  that runs through the ground, so it reaches only a fighter standing on
  it; an airborne one is passed by with nothing used up, so a strike stays
  live for it and a projectile flies on, and jumping clears it; a Shield
  raised on the ground blocks it like any hit; `hitReaches`, asked at
  every place a hit meets a fighter), `charm` (seconds a real hit charms
  its target, `CombatState.charmBy`: until it runs out, every hit the
  charmed fighter would land on whoever charmed it, whatever made it, is
  no hit at all but a heal of that fighter, its damage taken off its
  Launch Point (`CombatSystem.charmed`, a `charmed` event); it holds
  nothing in place, it runs down in real time, the longer charm by the
  same fighter wins and another fighter's replaces it, a blocked hit
  charms nobody, and a raised Shield still blocks a charmed fighter's
  hits like any other; #0004's World is Mine), `float` (seconds a real hit
  that launches nothing makes its target float, `CombatState.float`: held
  exactly as a paralysis holds it, but lifted off the ground and rising
  at `FLOAT_RISE_SPEED`, 42 units/s, with no gravity, until it runs out
  and the fighter falls; the longer float wins, it runs down with its
  paralysis, any hit that launches the target ends it, and a blocked hit
  floats nobody; #0005's Deadlights), `fear` (seconds a real hit
  frightens its target, by its attacker, `CombatState.frightenBy`: until
  it runs out, every real hit the frightener lands on it, whatever made
  it, lands in full and also feeds the frightener, its damage taken off
  the frightener's own Launch Point, never below 0, the hit's event
  saying how much as `fed`; it holds nothing in place, it runs down in
  real time, the longer fear by the same fighter wins and another
  fighter's replaces it, and a blocked hit frightens and feeds nobody;
  #0005's Red Balloon), `gaze` (true or false: a hit that has to be seen,
  so it reaches only a fighter facing where it comes from; one with its
  back turned is passed by with nothing used up, as a quake passes a
  fighter in the air; a Shield raised toward it blocks it like any hit;
  `hitReaches`; #0005's Deadlights). A strike inherits its
  attack's and a finisher its projectile's. Each defaults to changing
  nothing; a value of the wrong kind is refused. There is no hit effect
  that gets past a Shield: `unblockable` (gone) and every other field of
  `SHIELD_BYPASS_FIELDS` is refused wherever a hit is built, true or
  false.
- **Turning projectiles back** (`deflectProjectiles: true`): while its
  active phase is open, its hitbox turns back every other fighter's
  projectile it meets, before any projectile strikes that step
  (`CombatSystem.deflectProjectiles`). Only every fighter's Deflect has it
  ([defense](defense.md#the-deflect)); it needs a hitbox.
- **Per airtime** (`airUses`) and **free fall** (`freeFall: true`).
- **Body** (`passThrough: true`: no pushbox while it plays; `hurtboxes`:
  the fighter's own replaced while it plays).

## Attack classification

How a move is **executed** and what it **is** are two separate things. Its
execution type (an ordinary attack, a throw, a technique, a summon, the
Deflect, the Shield) decides how it works: its timing, animation,
cooldown, Energy and what it spawns, and none of that changes. Its
classification, inferred by the shared
[`offense.js`](../../js/game/combat/offense.js) from what the definition
can do, decides whether it is an **attack**, a **defense**, or both. Every
definition the schemas build carries it as `offense` (`{ attack, defense,
sources }`), and a Fighter's button is read with `actionOffense`.

An action is an attack when it can deal damage, directly or indirectly: a
hit of its own that adds Launch Point, paralyzes, floats, charms, frightens or
launches (`strike`), a
multi-hit string (`strikes`), a projectile it releases or is (`projectile`,
a piercing one's `finisher` too), a technique's burst (`burst`), a slam's
impact where it lands (`impact`), a summon's clone that strikes (`clone`),
or projectiles it turns back (`redirect`). A technique that only heals its
own fighter harms nobody, so it is no attack.
So:

| Move | Executed as | Classified |
| --- | --- | --- |
| A punch, a kick, a numbered attack, a multi-hit string, a homing dash, a roll | attack | attack |
| A throw and its projectile, a piercing projectile and its finisher | attack, projectile | attack |
| A cast's burst or projectile (Unlimited Void, Hollow Purple, Cherry Blossom Impact) | technique | attack |
| A cast that only heals its own fighter (the Mystical Palm Technique) | technique | neither |
| A plunge that lands with an impact (the Heavenly Foot of Pain) | attack (in the air) | attack |
| A summon, its clone and the clone's strike | summon | attack |
| The Deflect | attack (in the air) | attack **and** defense |
| A projectile turned back | projectile (now the deflecting fighter's) | attack |
| The Shield | defense | defense only |
| Running, jumping, the Dash, the air dash; a pending attack | movement / art | neither |

A move that misses, is blocked or is turned back stays an attack.
Classification never reads a name, a codename, a button or a fighter: a
future fighter's Shadow Clone, Meteor Storm or Poison Field is classified
from its data with no code written for it. A definition may state
`offensive` (true or false), but only to agree: a damaging move declared
`offensive: false`, or a harmless one declared `true`, is refused, and so
is a Shield that declares any hit field.

**Every attack is blockable.** The one rule, enforced in `applyHit`
([below](#hit-resolution)) for every source: a target whose Shield is up
when a hit reaches it blocks that hit. Nothing may declare its way past
one: `unblockable` and the other `SHIELD_BYPASS_FIELDS` (`ignoreShield`,
`bypassShield`, `pierceShield`, `guardBreak`...) are refused on any
attack, strike, projectile, finisher, technique, burst or summon, so no
character definition can bring a Shield bypass back.

### Special abilities

A third thing again, apart from how a move is executed and whether it is
an attack: whether the game **presents** it to the player as **Special**.
A Special ability is an exceptionally distinctive move whose mechanic
changes how a fight goes, and each fighter says which of its moves are,
in its own definition, by move codename (`specialAbilities`, read through
`isSpecialAbility` in
[`js/data/special-abilities.js`](../../js/data/special-abilities.js)):

| Fighter | `specialAbilities` | Special | Not Special (for all their projectiles, techniques or tornadoes) |
| --- | --- | --- | --- |
| #0001 | `['attack4', 'attack5']` | Unlimited Void (a paralysis round it), Hollow Purple (a sphere that erases projectiles and passes through fighters) | Red, Maximum Blue |
| #0002 | `[]` | none | the Whirlwind |
| #0003 | `['attack4']` | the Mystical Palm Technique (heals its own Launch Point) | Cherry Blossom Impact |
| #0004 | `['attack5']` | World is Mine (a charm: its opponents' hits heal it) | Ievan Polkka, the Melody |
| #0005 | `['attack4', 'attack5']` | the Deadlights (whoever faces them floats helpless), the Red Balloon (a phantom that bites from behind, its fear feeding #0005) | Dark Tendrils |
| #0006 | `['attack4']` | Ice Breath (a gale that freezes whoever it reaches) | Heat Vision, the Sonic Scream, the Triple Strike |

Nothing infers it: a projectile, a pull, a tornado, a ground eruption, a
technique or a summon is not Special because of what it is, and no name,
button or fighter id decides it. The list may name only moves the fighter
can really perform where it lists them (a button performs it there; never
a ground-only move's air version, an art-only `pending` attack, a button
it lacks), each once, or the registry refuses the definition
(`assertSpecialAbilities`); `isSpecialAbility` also ignores anything it
cannot perform. Leaving the field out means none.

Only presentation reads it: the controller editor's **Special abilities**
category ([input](input.md#game-controllers)) and the orange mark over a
fighter performing one ([rendering](rendering.md#the-special-ability-mark)).
The execution type keeps its own readers (`specialAction` and
`specialAttacks` still mean "a summon or a technique" for combat, the CPU
and the loadout rules), and the cooldown keeps the policy's
([below](#cooldowns)): the Whirlwind keeps its 5 s, the Mystical Palm
Technique its 3 s, Cherry Blossom Impact no cooldown (15 Energy), whatever
their labels. Specials keep their longer, deliberate animations (Unlimited
Void 0.5 s + 1/3 s, Hollow Purple 5/6 s + 1/3 s, the Mystical Palm
Technique 1 s + 0.25 s, World is Mine 0.5 s + 1/3 s, the Deadlights 0.4 s +
1/3 s, the Red Balloon's startup 1/3 s, Ice Breath 1/3 s + 7/15 s); a move
that is not
one plays at ordinary-attack pace (Cherry Blossom Impact 0.2 s + 0.25 s).

## Hit resolution

Each fixed step, after every fighter has moved (see the step order in
[the architecture overview](../architecture/overview.md#one-fixed-step)),
`CombatSystem.update` resolves, in order: the projectiles a live
Deflect turns back (`deflectProjectiles`: from then on they are the
deflecting fighter's, so none of them strikes it this step), fighters'
melee hitboxes (and strikes, and a slam's impact the step it lands),
live projectiles, summoned clones, then
techniques (a burst due on its release step). Every hit goes through one
`applyHit(attacker, target, def, ...)`, which never checks which fighter,
attack or technique it is resolving. It is the only place an attack
reaches a fighter, and the only place a Shield is consulted. Before it,
every one of those places asks `hitReaches`: a `quake` hit never reaches
a fighter off the ground and a `gaze` hit never one with its back turned
to where it comes from, and nothing of it is used up. Then:

1. A target whose Shield is up when the hit reaches it blocks it, from
   any side, whatever made it and however hard it hits: no field of the
   hit is consulted. The Shield pays 15 Energy for it
   (`BLOCK_ENERGY_COST`), or all it has left (a block that empties it
   still stands; the Shield then drops, and only a hit after that, even
   later on the same step, can land), a perfect one exactly the same (its
   only difference is no blockstun); a hit with `blockPush` shoves it
   back, and a Shield with a `stall` freezes a melee attacker for that
   long ([defense](defense.md)). A blocked hit adds no Launch Point,
   launches, stuns, paralyzes, floats, charms, frightens and carries
   nothing, and a blocked
   projectile is stopped there, an erasing or piercing one included.
2. Otherwise the hit's `damage` is added to the target's Launch Point,
   then its launch strength is `baseLaunch` × that new Launch Point, sent
   along its `directionalLaunch` and bent by the target's launch steering
   ([launch](launch.md)). The unblocked hit also restarts Launch Point
   recovery; a block preserves the existing recovery schedule.
3. Hitstun (plus the launch's extra stun) or blockstun, and the hit's
   hitstop (the attacker freezes too, unless the hit is detached: a
   projectile's, a clone's or a technique's).
4. A real hit ends the target's technique and cancels its summon startup
   (no armour); a block never does. (Before 2: a hit the target does not
   block whose attacker it has charmed, its `charm` still running, is no
   hit at all: `charmed` takes its damage off the target's Launch Point,
   never below 0, and records a `charmed` event with that `heal`; no
   launch, stun, freeze, paralysis, charm or carry, no recovery
   restarted, no technique broken, no reaction, and the attack that dealt
   it is used up but never confirmed.)
5. A launch ends any paralysis (a float with it); a real hit that
   `paralyze`s or `float`s and launches nothing holds the target
   (floating, rising); a real hit that `charm`s charms it (by the
   attacker), launch or not, and one that `fear`s frightens it (by the
   attacker), launch or not. A real hit on a target that was already
   frightened of its attacker as it landed feeds the attacker: the hit's
   damage also comes off the attacker's own Launch Point, never below 0.
6. The launch replaces the target's velocity, or a `carry` drags it.
7. One event is recorded (`type` hit or block, attacker, target, move,
   damage, Launch Point before and after, launch values, stun, `perfect`,
   the point it landed, the `paralysis` (the longer of its paralysis and
   its float), the `float`, the `charm` and the `fear` it put on, the
   Launch Point it `fed` its attacker and the `stall` it caused, and the projectile, summon or technique behind it; `attack`
   (always true: a blocked attack is still an attack, recorded as a
   block, never as a hit), `source` (`melee`, `deflect`, `projectile`,
   `summon` or `technique`), `ability` (the attack, technique or summon
   that produced it, a projectile's kept when it is turned back) and
   `redirected` (a projectile turned back)), and, on a real hit only, the
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
`finisher` (its last strike), `pull: { radius, speed, front }`, `repel`, `erase`
and the hit effects, and `rotationSpeed` (degrees per second its art
spins as it flies, clockwise; 0, the default, is none: art only, see
[rendering](rendering.md#projectile-spin)). A projectile flies straight
in the direction its
thrower faced at the release (one with no `speed` stays where it appears,
an obstacle: #0004's dancing double), never turns, hits once by default (a
piercing one up to its `hits`, an erasing one each fighter it hits once,
flying on through), and is gone on a block (any projectile, an erasing or
piercing one included: a Shield stops it), at the end of its lifetime, in
the Void or against a solid. Every projectile is an attack, and stays one
when it is turned back. Its hits credit its thrower and freeze only its
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
| `cooldown` | policy | Seconds before reuse, from the moment the clone appears (its release): derived by the [cooldown policy](#cooldowns); leave it out. |
| `energyCost` | policy | 15 for an ordinary summon (its clone a construct), paid as it is accepted; 0 with a special cooldown. Derived; leave it out. |
| `behindDistance` | 48 | World units behind the target it appears. |
| `effectOffset` | `{ x: 0, y: 0 }` | The cloud's centre from the clone's origin, facing right. |
| `noGround` | null | `{ attack, offset }`: where there is no ground behind the target, appear at `offset` from the target and perform this attack instead. |

A clone lives through three phases (appear: the cloud forwards; attack:
the attack once, with its own data; vanish: the cloud backwards) and is
then removed. It never moves, turns or retargets, has no Launch Point,
hurtboxes, pushbox or physics, and its hit is the attack's own, resolved
by `applyHit` and credited to the owner. A summon is an attack (the
summoning, the clone, its strike and the hit it lands are one offensive
action, the owner's): a target whose Shield is up blocks the clone's
strike from whichever side the clone appears, and the registry refuses a
summon whose clone could strike nothing. No opponent in play, missing
art, or Energy it cannot pay (exhausted), and the press does nothing. Its
cooldown starts only as the clone appears (`spawnClones`): a startup
broken by a hit, lost ground or a target gone starts none, and the clone's
own strike never starts it again. The exact rules:
[`ALVA_SPEC.md`](../../ALVA_SPEC.md) §7.2.6.

#0005's Red Balloon is the roster's summon: a phantom of #0005 rising out
of a bunch of red balloons 60 units behind its target to bite its back,
its bite a `fear` ([its
specification](../characters/0005.md#each-move-in-detail)). The loadout
matrix's Case D
([`tests/fighters/fixtures/loadout-fighters.mjs`](../../tests/fighters/fixtures/loadout-fighters.mjs))
and the sample fighter test the system apart from it.

## Techniques

A numbered button that is a technique (`{ type: 'technique', id }`)
starts `techniques[id]`: a multi-phase move the fighter itself performs,
run by [`js/game/combat/technique.js`](../../js/game/combat/technique.js).
It is executed as no ordinary attack (no `combat.attack`), projectile or
summon; while it runs it owns the fighter. What it releases makes it an
attack all the same, blocked by a raised Shield like any other.

**One form: the cast.** The fighter stands committed to a casting pose,
then lets go of what it casts all at once. Its phases are explicit:
*cast* (`castAnimation`, once from the press step: the fighter stands
still in the facing snapshotted at the start, the direction held on the
press step if any), *release* (on its first step it releases, exactly
once, its `projectile: { id, offset }`, thrown the snapshotted way as an
attack throws one, and its `burst: { hitbox, hit }`, whose hit is dealt
once to every opponent the box meets, facing right from the fighter and
mirrored, so a box round the fighter reaches both sides, and its art as it
goes out, if it names any: `effect: { animation, offset }`, an
`effectAnimations` clip named after the technique (`attackN_object...`),
handed to its fighter (`Fighter.effects`, `Technique.takeEffect`) and
played once by the arena where it went out, behind the fighters, art only;
then `releaseAnimation` plays once) and *done*. It may also let go of a
`heal` (a whole number of Launch Points): on the release step its own
fighter's Launch Point drops by that much, never below 0
(`CombatState.heal`); a heal is no hit, so it neither restarts nor
delays Launch Point recovery, records no hit event (the fighter's `heals`
list, read by the hit effects for the glow, records it), and a cast
broken before its release heals nothing. Fields: `castAnimation`,
`releaseAnimation`, `cooldown`, `energyCost`, `projectile`, `burst`, `heal`; the
burst's hit is validated like an attack's (damage, launch, stuns and hit
effects). E.g. #0001's Unlimited Void (a burst that paralyzes) and Hollow
Purple (a projectile that erases), each blocked by a raised Shield ([its
specification](../characters/0001.md#each-move-in-detail)), and #0003's
Cherry Blossom Impact (a burst that is a quake) and Mystical Palm
Technique (a heal, no attack; [its
specification](../characters/0003.md#each-move-in-detail)), and #0004's
Ievan Polkka (a projectile that never moves) and World is Mine (a burst
that charms, its ring of sound its `effect`; [its
specification](../characters/0004.md#each-move-in-detail)), and #0005's
Deadlights (a burst that floats whoever faces it, a `gaze`; [its
specification](../characters/0005.md#each-move-in-detail)). Nothing in the
runtime reads a fighter or a button; a technique of a different shape
would be a new form in the runtime with its own fields, not a
reinterpretation of these.

Any clip missing, the projectile's or the burst effect's art missing, nothing to release (no
projectile, burst or heal), invalid data, or Energy it cannot pay, and
the press does nothing (logged). Losing the ground or a hit on the
fighter end it: whatever it had not released yet never is, and what it
already let go stays. Its cooldown starts on its release step
(`Technique.takeCooldown`), never on the press: a cast broken before then
starts none; one released keeps it. A technique that harms nobody (a heal
of its own) yields to any valid request, before its release (nothing
healed, no cooldown) or in its release pose (the heal and the cooldown
kept); one that harms owns its fighter until it is over.

## Damage

Every hit deals exactly 1, 3, 5 or 10 (`ALLOWED_DAMAGE_VALUES` in
[`js/data/launch.js`](../../js/data/launch.js)): 1 a light hit (a chip, a
tick of a multi-hit string), 3 a solid one, 5 a heavy hit or a major
launcher, 10 an exceptional, ultimate-level one. `resolveHitDamage`
checks it once, as each hit's definition is built, for every kind of hit:
an attack with a hitbox, each strike of a multi-hit attack (`hits`), the
Deflect (always 3), a projectile and its `finisher` (so every strike of a
piercing one), a technique's `burst.hit`, and so a summon's clone, which
performs one of these attacks. Anything else (0, 2, 4, 6 to 9, 11 and up,
a fraction, a negative, none at all) is refused with the hit named, as
the registry loads (`assertCombatRules` in
[`js/data/characters.js`](../../js/data/characters.js)): a future move
written with `damage: 2` never reaches a match. A multi-hit attack's own
`damage` is the sum of its strikes, derived, and need not be a tier; a
blocked hit's event reports `damage: 0` because it dealt none. Difficulty
never touches any of it ([AI](ai.md)).

## Cooldowns

Every discrete move's reuse delay comes from one **cooldown policy**
([`js/data/cooldowns.js`](../../js/data/cooldowns.js)), derived from the
move's structured combat data and never chosen by its fighter. Exactly two
lengths exist; an ordinary move has **no cooldown at all** (the universal
0.5-second repeat delay is gone, and nothing replaces it):

| Class (`cooldownClass`) | When | Cooldown |
| --- | --- | --- |
| `tenDamage` | Any one hit of the move deals 10 (a strike, a multi-hit's finisher, its projectile or that projectile's finisher, a slam's `impact`, a technique's `burst`, a summoned clone's attack), or everything one use can deal one target adds up to 10 or more | `TEN_DAMAGE_COOLDOWN`, 5 s |
| `exceptional` | Otherwise, an effect in `EXCEPTIONAL_EFFECTS`: a technique's `heal`, or any hit's `paralyze`, `charm`, `float` or `fear` | `EXCEPTIONAL_COOLDOWN`, 3 s |
| `ordinary` | Everything else, the Deflect included | 0 |

The first row that applies decides: a move never gets 3 s and 5 s added
(a 10-damage paralysis is 5 s). Everything in `ROUTINE_EFFECTS` (a launch,
`blockPush`, `pull`, `quake`, `gaze`, `carry`, `repel`, `erase`, `pierce`, a
`motion`, hitstun and blockstun, `airUses`, `freeFall` and the rest) earns
nothing however strong it looks; every shared hit effect
(`HIT_EFFECT_FIELDS`) is in one list or the other, checked by the tests,
so a new effect is classified on purpose. `moveImpact(kind, spec,
context)` reads what one use can do to one target (`{ hits, heal }`, a
piercing projectile's every strike included) and `cooldownClass` its
class; the builders call them with the fighter's own `projectiles` (for a
throw or a cast) and `attacks` (for a summon's clone):
`createAttackDefinition(spec, { projectiles })`,
`createTechniqueDefinition(spec, { projectiles })`,
`createSummonDefinition(spec, { attacks, projectiles })`. The Fighter and
`assertCombatRules` always pass them. The cooldown is the move's (its
button's), never one per projectile or hitbox.

A definition leaves `cooldown` out. One that declares it must agree with
the policy exactly (0 for an ordinary move: the old 0.5 s, or any shorter
timer, is refused), or `resolveCooldown` refuses it, naming the move, as
the registry loads: an 8-second move, a 12-second heal or a 0.05 s Deflect
never reaches a match. Negative, non-numeric and non-finite values are
refused too. Running, jumps (ground and air) and the Shield have no move
cooldown; fast fall stays directional movement. No timer changes an
animation phase or locks other moves, and no cooldown is an animation
lock: an ordinary attack still plays its whole length and never restarts
or cuts into itself, it may simply start again the moment it has ended.

**Release, not acceptance.** A 3 s or 5 s cooldown starts only when its
move is **released**, the event that emits what it authors
(`RELEASE_EVENTS`), exactly once per activation:

| Move | Released when |
| --- | --- |
| Single-strike attack | its strike goes live (its startup over: `releaseAt`) |
| Multi-hit attack | its last strike goes live (the whole authored string emitted; an early strike is not enough) |
| Projectile attack | its projectile spawns (time past `spawnAt`, the thrower not stunned) |
| Slam with an `impact` | the impact strikes as it lands (`Fighter.landSlam`); a plunge that runs out in the air never releases |
| Technique (projectile, burst, heal) | its cast is over and it lets go (`Technique.release`, taken by `takeCooldown`) |
| Summon | its clone actually appears (`spawnClones`) |

Pressing the button, the startup, the cast or the summoning pose start
nothing. A move interrupted before its release (a hit, a paralysis, lost
ground, a target gone, a cancel it yields to) starts none and is ready
again at once; one released keeps its cooldown whatever follows (a hit in
its recovery, a miss, a block, a projectile turned back, a clone gone).
Release is not a hit: a projectile that later misses was released all the
same. `CombatState.releaseAttack` and the `released` flags make it
idempotent, so a later step, a second strike, the attack ending or being
cut short never start or restart it.

Attacks use `CombatState.cooldowns`; summons and techniques
`abilityCooldowns`, keyed by the attack each is. An unavailable press of a
summon or technique is discarded, never buffered; a press of an attack
cooling down waits in the 0.15-second input buffer and expires there, or
starts once the timer is ready if that is within the buffer. Dash and air
dash use separate `movementCooldowns` entries (`mouvment` and
`midair_mouvment`, the universal `dashRepeat`), starting as the Dash
starts: a movement timer, outside this policy, untouched by it. All
stores recover on the fixed step, including hitstop, with `PHASE_EPSILON`
at expiry. Reset/respawn clears all; a live overtime transition preserves
them.

The roster, reclassified from its mechanics: #0001's Unlimited Void 3 s
(paralysis) and Hollow Purple 5 s (a 10-damage sphere); #0002's Whirlwind
5 s (its tornado's 10-damage finisher); #0003's Mystical Palm Technique 3 s
(heal); #0004's Ievan Polkka 5 s (its double's six strikes add up to 10)
and World is Mine 3 s (charm); #0005's Deadlights 3 s (float) and Red
Balloon 3 s (its phantom's fear); #0006's Ice Breath 3 s (a freeze, its
paralysis). Everything else, Red, Blue and Maximum Blue (a pull earns
nothing), Cherry Blossom Impact and the Heavenly Foot of Pain (a quake, a
slam and a launch earn nothing), Dark Tendrils (a pull) and #0006's Tornado
Spin (a pull and a carry), Heat Vision and Sonic Scream (a carry, a repel,
a block push) included, has no cooldown, and every Deflect none. The
ordinary ones that create a construct (Red, Maximum Blue, the
Melody, Cherry Blossom Impact, Heat Vision, the Sonic Scream) cost 15
Energy instead ([energy](energy.md#construct-moves)).

**Reading cooldowns.** `CombatState.cooldowns` and
`CombatState.abilityCooldowns` are the only stores. The player's presses,
the CPU (`moveReady` in `js/game/ai/cpu-intelligence/capabilities.js`) and
presentation read them; presentation goes through
[`js/game/combat/move-status.js`](../../js/game/combat/move-status.js):
`moveCooldown(fighter, id, kind)` (`{ id, duration, remaining, progress,
cooling, special }`), `moveRestriction` (`art`, `energy` while exhausted
for a move that costs Energy, `airUses` or `freeFall`: an unavailability
that is no cooldown), `abilityStatus` and
`abilityGroups(def)` (each place's moves, from the loadout). It writes
nothing and keeps no time, so the ability HUD ([input](input.md#the-ability-hud)),
the player's presses and the CPU can never disagree, and changing place
never touches a timer.
Only a running 3 s or 5 s cooldown draws a persistent world-space ring (from its release, never while the move still casts): the same
artwork as the touch button in the center and remaining seconds below, never a
codename ([rendering](rendering.md#fighter-status)).

## Requests and cancellation

Every fighter's presses, the human player's (a `PlayerController`) and a
CPU's alike, go through one action-resolution path in `Fighter.update`,
the same for the keyboard, touch, a controller and the CPU's executor.
The rules are [`ALVA_SPEC.md`](../../ALVA_SPEC.md) §7.2.4 (*Move
cancellation*) and §7.2.4b. They are strict: the broad player
cancellation of PR #114 (any new request cutting the player's attack, hit
or not) is gone.

1. **Raw press.** A combat button's `…Pressed` edge, a jump, a Dash request
   (`mouvementLeftPressed` / `mouvementRightPressed`), a Shield press on the
   ground, a Shield press in the air (the Deflect). Run (`runLeft` /
   `runRight`, held or with its edge) is never one: it only steers (and
   turns, with Automatic turn-around off).
2. **Its own move.** Each combat button asks for the move its own
   `actions` entry maps it to where the fighter is, and never another's:
   Attack 1 cooling down is a request for Attack 1 (it waits in the buffer
   or expires), never Attack 2.
3. **Same move** (`repeatsMove`, via `pressRequest`, anyone's): the
   button's attack is the attack in progress, or the button is the one
   whose press started it (`combat.attack.button`: a ground attack carried
   into the air). Then the press is no request at all: never cut,
   restarted, buffered or kept to follow it; the attack plays on. Once it
   has ended the move may be used again at once.
4. **Eligibility and cancellation** (`tryAction`, `tryDeflect`,
   `trySpecial`, `tryMouvment`, the jump and the Shield in `update`): every
   check of the new move runs first (its art, its place, its airtime, its
   cooldown, its Energy); only then may the move in progress be ended, and
   only if `canFollowUp(at)` allows it:
   - **An attack that can harm** (a strike, a string, a throw, a slam) is
     never cut short by a request, in its startup, active phase or
     recovery, except by its **authored, hit-confirmed window**
     (`CombatState.cancellable`: it hit, its `hitCancel` reached, no
     freeze, stun or paralysis), which another attack, a jump, a Dash or
     an air dash (and the Deflect) may use. A summon or technique never
     cuts an attack short, not even one that hit.
   - **A move that harms nobody** (a technique that only heals, a pending
     attack) **and the Deflect** (by explicit rule: it is a defense; see
     `yieldsToRequests` in `js/game/combat/offense.js`) give way to any
     valid request (`moveYields(at)`): another attack, a special (on the
     ground), a jump or air jump, a Dash or air dash, a fresh Shield press.
     Only a request made after the move began (`moveStartedAt`), never
     during an impact freeze, a stun, blockstun or a paralysis, never into
     itself, and never a Dash (it keeps its own `dashCancelTime`). A
     summon's startup and a technique that harms keep their commitment.
   - A Dash past its `dashCancelTime` may be cut by an attack, a Deflect or
     a jump (`dashCancellable`), and an aerial's recovery by landing.
   Then `cutAttack` ends it (an attack through `CombatState.endAttack`, a
   technique through `endTechnique('cancel')`, a summon's startup through
   `cancelSummon`); it never ends a move that may not be cut. Nothing the
   ended move had not struck or released ever is: a cancelled Deflect's box
   strikes and turns nothing back after that (a projectile it already
   turned back stays turned); a heal cancelled before its release heals
   nothing and starts no cooldown. Energy already paid is never given back;
   the replacement pays its own (a Deflect then an air dash: 15 and 15). The
   new move starts once, where the fighter stands (`startAttack`), facing
   the way it is aimed (Automatic turn-around, see below) or the direction
   held.
5. **Buffer.** A request that may not start yet is kept as ever
   (`bufferAttack`, `bufferDash` and the jump buffer, each with the step it
   was made on) and comes out as the move in progress ends naturally or a
   legitimate window opens; an Energy refusal is never kept; `takeHit`
   drops the player's kept requests.

Same-step precedence is the existing one (a Deflect, the combat buttons in
`COMBAT_BUTTONS` order, the buffered press, the Dash, the Shield, the
jump); a move started on a step never gives way on that step. The CPU
plans with the very same checks (`moveReady`, `canFollowUp`,
`moveYields`, `repeatsMove`), so it never presses what cannot start and
may cancel its own Deflect when a better move is open. Combos are
deliberate presses within these rules: a hit-cancel, a jump or a Dash out
of an attack that hit, a press buffered to come out as an attack ends.

## Facing and Automatic turn-around

The human player's option (Home › Settings › Combat, on by default and for
every player whose settings predate it; the store is
[`js/core/settings.js`](../../js/core/settings.js)): the player's fighter
faces the closest valid enemy by itself. It is an orientation only: it
never moves, steers, Dashes, jumps, attacks, starts a combo, spends Energy
or changes a hitbox, a range or a stun. The rules are
[`ALVA_SPEC.md`](../../ALVA_SPEC.md) §7.2.4a; here is how the code does it.

- **Who.** `Fighter.automaticTurnAround`: the fighter's controller is a
  player's (`kind === 'player'`) with `automaticTurnAround === true`. The
  screens read the setting as a session starts and pass it to `Battle` /
  `PracticeSession` (`automaticTurnAround`), which give it to the
  `PlayerController` alone (on unless given false), every fighter swapped
  in on Practice Ground included. A CPU's controller
  (`CombatAIController`, `TrainingAIController`) or none (the practice
  dummy) never has it, whatever it carries: the exclusion is the
  controller's kind, never a slot, label or fighter id.
- **Which enemy.** `closestEnemy(fighter, fighter.enemies)` in
  [`js/game/fighters/turn-around.js`](../../js/game/fighters/turn-around.js):
  `enemies` is the fighter's opponent today (one reused list, refilled on
  each read, no allocation per step), so a mode with more enemies only has
  to list them. A candidate counts only if it is a fighter (a combat state
  of its own: never a projectile, a clone, an effect or a hazard), not the
  fighter itself, in play (not lost to the Void) and at a finite position;
  the closest by squared world distance between bodies wins, ties going to
  the one listed first.
- **Which way.** `turnAroundFacing()`: 1 or -1 toward it
  (`facingToward`); at the very same x, the way the fighter already faces
  (its art's way while it attacks), never 0 or NaN. Null when it does not
  turn the fighter: the setting off, input locked, a direction held (the
  player is moving it, or aiming an attack that way), the fighter out of
  play, or no valid enemy; the manual rules then apply.
- **Not while moving.** `movingSideways`: a direction held this step
  (`steerHeld.x`), or on the ground a run or a Dash still sliding faster
  than `TURN_SPEED` (20 units/s, the speed past which a run turns the
  fighter by hand). While it holds, `updateFacing` and `settleFacing` leave
  the facing to the manual rules, so the fighter faces the way it moves and
  never walks backwards; drifting in the air with nothing held is not
  moving.
- **When.** Three points of every fixed step, through the one facing
  system: `updateAttackFacing` as the step starts and `faceAttackTarget`
  as an attack, a technique or a summon's startup begins (both read
  `attackTargetFacing()`: a CPU's own `attackFacing`, else
  `turnAroundFacing()`), `updateFacing` at the end of the fighter's update,
  and `settleFacing` once every fighter has moved (`Arena.update`, before
  projectiles spawn and hits resolve), so a side switch by the fighter
  updated second is caught before any hitbox is read and before the next
  step's controls resolve forward and back. A new attack therefore starts
  facing its target on its own step; there is no step where the sprite
  faces one way and the attack another.
- **Committed moves.** `facingLocked` holds the facing through a stun, a
  paralysis, a technique, a summon's startup, a Dash or air dash, and an
  attack with a `motion` (a roll, a homing dash, a plunge, a lift, a
  hover): turning those would rewrite a committed course. An ordinary
  attack turns with its enemy, physical facing and art together (its
  hitbox, a Step-in still to come and unreleased projectile follow), as a
  CPU's does; a motion attack or a technique turns its art only
  (`attackVisualFacing`),
  its course and hitboxes untouched. A released projectile keeps its own
  `direction` for good. The facing is free again the step a lock ends.
- **Off.** `updateFacing`'s manual rules, exactly as before: the run or the
  air steering turns the fighter, a direction held in an attack or the
  Shield turns it at once, a Dash turns it its way, standing still keeps
  the last facing, and an enemy crossing behind never turns it.

## What a fighter may leave out## What a fighter may leave out

| Left out | Result |
| --- | --- |
| `extra_attack` in `actions` | the J / X button does nothing for it; its touch button is hidden |
| `attack3` to `attack5` | those buttons do nothing for it |
| `summons` / `techniques` | no special moves; the CPU never plans one |
| `projectiles` | no projectile attacks |
| `deflect` | the Shield button does nothing in the air |
| a move on `extra_attack` (`extra_attack: null`) | reserved: the button is wired, does nothing, dashed on touch |

## Tests

- [`tests/systems/loadout.test.mjs`](../../tests/systems/loadout.test.mjs)
  over the loadout matrix
  ([`tests/fighters/fixtures/loadout-fighters.mjs`](../../tests/fighters/fixtures/loadout-fighters.mjs)),
  every rule broken on purpose.
- [`tests/systems/combat-rules.test.mjs`](../../tests/systems/combat-rules.test.mjs):
  the shared rules over every fighter and every kind of hit: the damage
  tiers, the cooldowns (none for an ordinary move, release-based 3 s and
  5 s), Energy (15 for everything), difficulty and movement.
- [`tests/systems/strict-combat-rules.test.mjs`](../../tests/systems/strict-combat-rules.test.mjs):
  release-based cooldowns for every kind of move (a strike, a string, a
  throw, a slam's impact, a technique, a summon), before and after
  release, exactly once; the 15-Energy construct cost read from data, the
  roster's table, paid once per activation, refused while exhausted, never
  refunded; the CPU reading the same costs and cooldowns.
- [`tests/systems/special-abilities.test.mjs`](../../tests/systems/special-abilities.test.mjs):
  the roster's Special classification (six in all), the editor
  categories and bindings it leaves unchanged, the list's rules, a future
  fighter opting in with data alone, unchanged execution types and
  cooldowns, Cherry Blossom Impact's quicker frame-aligned timing, and the
  mark's lifecycle for every Special and every other move, a CPU's
  included.
- [`tests/systems/cooldown-policy.test.mjs`](../../tests/systems/cooldown-policy.test.mjs):
  the cooldown policy: each class and its precedence, every way a move can
  deal 10 or carry an exceptional effect, the routine effects that earn
  nothing, refused authored values (the old 0.5 s included), the roster's
  table, a cast broken before its release starting none and one released
  keeping it, and the CPU reading the same cooldowns.
- [`tests/systems/combo.test.mjs`](../../tests/systems/combo.test.mjs),
  [`fighter-stats.test.mjs`](../../tests/systems/fighter-stats.test.mjs),
  [`codenames.test.mjs`](../../tests/systems/codenames.test.mjs),
  [`sample-fighter.test.mjs`](../../tests/systems/sample-fighter.test.mjs)
  (a fighter that is not #0001, with different moves on the same
  codenames).
- [`tests/systems/direct-input.test.mjs`](../../tests/systems/direct-input.test.mjs):
  every button its own move (never another's while it cools down), the
  press for the attack playing (mashed or held) never cutting, restarting
  or replaying it and nothing else following it, mashing never beating an
  attack's length or cooldown, a melee press out of reach starting where
  the fighter stands (the same course as with no target), one reading of
  melee and ranged, and nothing of Combat Assist or Combo Assist left.
- [`tests/systems/basic-strings.test.mjs`](../../tests/systems/basic-strings.test.mjs):
  each fighter's two-hit strings made by hand, at every spacing both
  moves reach: Attack 1 into Attack 2 through its hit-confirmed window on a
  fresh target, Attack 2 into Attack 1 from most spacings, a second press
  never starting before the first's window, and the same button twice
  never a string.
- [`tests/systems/turn-around.test.mjs`](../../tests/systems/turn-around.test.mjs):
  Automatic turn-around on by default, either side, a crossing behind,
  standing and in the air, moving left or right (the manual facing, never
  backwards, the same movement as off) and stopping, attacks pressed with
  a direction held, Off as
  the manual rules, no enemy, one out of play, overlapping x, several
  enemies and ties, ordinary attacks, techniques and summons aimed,
  a Dash, an air dash and every motion attack keeping their course, stuns,
  released projectiles, who has it (never a CPU), Practice Ground's swaps
  and removal, respawn and restart, and determinism at 30, 60 and 144 fps.
- [`tests/systems/facing.test.mjs`](../../tests/systems/facing.test.mjs):
  the manual facing rules and the CPU's attack aim.
- [`tests/systems/move-cancel.test.mjs`](../../tests/systems/move-cancel.test.mjs):
  the strict cancellation rules, for the player and a CPU alike: an
  attack never cut short by any request kind in any phase, the buffer, no
  restart into itself, hit-confirmed windows still cutting, the Deflect
  cancelled into an aerial, an air jump or an air dash (its box and
  reflection gone, its Energy kept, never restarted, invalid requests
  ending nothing), a heal cancelled before and after its release, harmful
  techniques and summons keeping their commitment, identical results for
  player, CPU and bare controllers, determinism.
- The shared capabilities on bespoke data:
  [`deflect.test.mjs`](../../tests/systems/deflect.test.mjs),
  [`projectile-spin.test.mjs`](../../tests/systems/projectile-spin.test.mjs),
  [`hit-effects.test.mjs`](../../tests/systems/hit-effects.test.mjs),
  [`pull.test.mjs`](../../tests/systems/pull.test.mjs),
  [`projectile-clash.test.mjs`](../../tests/systems/projectile-clash.test.mjs),
  [`technique.test.mjs`](../../tests/systems/technique.test.mjs) (the heal
  and a burst's art included), [`quake.test.mjs`](../../tests/systems/quake.test.mjs),
  [`slam.test.mjs`](../../tests/systems/slam.test.mjs),
  [`charm.test.mjs`](../../tests/systems/charm.test.mjs),
  [`float.test.mjs`](../../tests/systems/float.test.mjs),
  [`fear.test.mjs`](../../tests/systems/fear.test.mjs),
  [`gaze.test.mjs`](../../tests/systems/gaze.test.mjs).
- Each fighter's moves: [`tests/fighters/0001/`](../../tests/fighters/0001/)
  (every move's mechanic, its combos, the CPU playing it),
  [`tests/fighters/0002/`](../../tests/fighters/0002/),
  [`tests/fighters/0003/`](../../tests/fighters/0003/),
  [`tests/fighters/0004/`](../../tests/fighters/0004/),
  [`tests/fighters/0005/`](../../tests/fighters/0005/).
- Every pairing of playable fighters in a real battle:
  [`tests/integration/roster-matrix.test.mjs`](../../tests/integration/roster-matrix.test.mjs).
