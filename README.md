# Alva

A 2D sprite fighting game for the browser by **hiyroscript**. Pure HTML, CSS and
JavaScript with Canvas 2D: no frameworks, no build step, no WebGL or 3D engine
(the stages' depth is pseudo-3D perspective drawn in Canvas 2D). It runs on
desktop and on phones and tablets in landscape.

This is the first playable foundation: full menu flow, a 48-slot roster
(with two selectable fighters today, #0001 and #0002, see [Roster status](#roster-status)), two compact platform-fighter stages with open ledges and a Void kill boundary, a
Watch Mode for CPU-vs-CPU matches, a
Practice Ground training room, a Discover reference screen, a Settings
dialog, the whole interface in English or French, movement and platform
physics, a tiered Power system (Jump Power and
Speed Power), a camera, a HUD, touch controls in two layouts (a joystick by
default, or the classic buttons) that players can rearrange and resize,
and a data-driven combat system built on Launch Point, Base Launch and
Directional Launch, with #0001's real attacks, attack1 (the Punch) and
attack2 (the Kick), each with its mid-air version, a held ground and
mid-air Shield (a slow fall in the air) on the shared Shield button, a Dash
on a double tap (or one tap of a touch Dash button), a 100-point Energy bar
that a Dash and every Shielded hit spend, its attack3 (the Clone Attack, a
summon) and attack4 (the Sphere Rush, a technique), each on a button of its
own and its own cooldown; #0002's speedster moveset (the One-Two, the
lock-on Homing Attack, the Rapid Kicks,
the Bounce Attack, the rolling Spin Attack, the rising Blue Tornado and the
travelling Whirlwind, each a mechanic of its own; see
[#0002, the speedster](#0002-the-speedster)); and
platform-fighter scoring: every hit's damage adds to the target's Launch
Point, which makes later launching hits send it further, and every fall into
the Void is a point for the opponent. First to 3 points wins. Quick Battle's
CPU really fights, at the difficulty you choose (Easy, Medium, Hard or
Brutal): difficulty changes how well it thinks, never what its fighter can
do.

The full product specification, including the Alva brand system, is in
[`ALVA_SPEC.md`](./ALVA_SPEC.md).

## Run locally

The game uses ES modules and reads sprite pixels, so it has to be served over
HTTP. Opening `index.html` straight from disk (`file://`) won't work.

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

Any static server works (`npx serve`, `npx http-server`, …). You don't need `npm install`.

## Deploy to GitHub Pages

1. Push the repository to GitHub.
2. Go to **Settings → Pages**, choose **Deploy from a branch**, select your branch and `/ (root)`.
3. Open `https://<user>.github.io/alva/`.

`index.html` is the entry point. Every asset and module path is relative
(`./assets/...`, `./js/...`), so the game works under any sub-path, including
`/alva/`. `.nojekyll` stops Jekyll from processing the site.

### Repository name

The product is Alva, but the GitHub repository itself is still named `maxy`, so
until it is renamed the site is served from `/maxy/`. Rename it under
**Settings → General → Repository name** (GitHub redirects the old URL). Nothing
in the code depends on the repository name, so no file changes are needed.

## Controls

| Action | Codename | Keyboard | Touch (landscape) |
| --- | --- | --- | --- |
| Move left / right | `runLeft` / `runRight` | `A` `D` or `←` `→` | **Joystick:** push the joystick left / right · **Classic:** lower-left ◀ ▶ |
| Dash | double tap of `runLeft` / `runRight`; `mouvementLeft` / `mouvementRight` on touch | Double-tap `A` / `D` or `←` / `→` | **Joystick:** one tap of **Left mouvement** / **Right mouvement** (the small ◀ ▶ above the joystick) · **Classic:** double-tap ◀ or ▶ |
| Down (in the air: fast fall; as a hit lands: steer the launch down) | `down` | `S` or `↓` | **Joystick:** hold the down arrow left of the joystick · **Classic:** hold the lower-left down arrow |
| Jump (tap: the normal jump; held a little longer: a higher jump; again in the air: air jump) | `jump` | `W`, `Space` or `↑` | Lower-right, bottom corner |
| Extra attack (#0001: the Throw; #0002: the Whirlwind) | `extra_attack` | `J` | **Shuriken** / **Whirlwind**, lower-right, top |
| Transform* | `transform` | `K` | Lower-right, middle row |
| Shield | `shield` | `L` | **Shield**, lower-right, middle row |
| Attack 1 | `attack1` | `U` | **Punch**, lower-right, bottom row (slot 1) |
| Attack 2 | `attack2` | `I` | **Kick**, lower-right, bottom row (slot 2) |
| Attack 3 (#0001: the Clone Attack; #0002: the Spin Attack) | `attack3` | `O` | Slot 3, left of Transform (**Clone Attack** / **Spin**) |
| Attack 4 (#0001: the Sphere Rush) | `attack4` | `M` | Slot 4, top row (**Sphere Rush**) |
| Attack 5 (a fighter with an attack5 button) | `attack5` | `,` | Slot 5, top row |
| Pause | `pause` | `Esc` or `P` | Timer or pause button, top centre |
| Practice menu (Practice Ground) | `pause` | `Esc` or `P` | Three-dots button, top centre |

On a gamepad: A / Cross jumps, B / Circle is `attack1`, LB `attack2`, LT
`attack3`, L3 `attack4`, R3 `attack5`, X / Square `extra_attack`, Y /
Triangle `transform`, RB / RT `shield`, the D-pad and left stick move and
D-pad down (or the stick held down) is Down.

The codenames are universal: every character has the same controls and the
same move codenames, and only its own ability names (#0001's Shuriken,
Punch, Kick, Clone Attack, Sphere Rush; #0002's One-Two, Homing Attack,
Rapid Kicks, Bounce Attack, Spin Attack, Blue Tornado, Whirlwind) differ. Those live in the
character's `abilityNames`, keyed by move codename; `abilityName(def,
move)` (`js/data/abilities.js`) gives a move left unnamed its neutral name,
e.g. "Mid-air Attack 1". No screen shows them yet. A control's codename is
its one internal name: the key in `CONFIG.bindings`, the field in every
input snapshot (with a matching `…Pressed` edge, e.g. `attack1Pressed`)
and, for the combat buttons (`COMBAT_BUTTONS` in `js/config.js`:
`extra_attack`, `transform`, `attack1` to `attack5`), the key in a
character's `actions`. The moves (`MOVES` in `js/config.js`):

| Move | Codename |
| --- | --- |
| Attack 1 to Attack 5 | `attack1` … `attack5` |
| Their mid-air versions | `midair_attack1` … `midair_attack5` |
| Extra attack | `extra_attack` (one optional special move, outside the numbered ones) |
| Transform | `transform` (reserved: no fighter has one yet) |

What role a numbered attack plays is the character's loadout, never its
number (see [Attack loadouts](#attack-loadouts)). Every numbered attack a
fighter has is a button of its own, pressed directly. #0001 has four:
`attack1` (Punch) and `attack2` (Kick) are ordinary attacks with mid-air
versions, `attack3` is the Clone Attack (a summon) and `attack4` the Sphere
Rush (a technique), on U, I, O and M (touch slots 1 to 4); it has no
`attack5`, whose key and touch slot do nothing for it. #0002 has three
ordinary ones, `attack1`, `attack2` and `attack3` (U, I and O; touch slots
1 to 3), each with its mid-air version. Down is a direction only: in the
air it fast-falls and as a hit lands it steers the launch downward; it
never changes what a button does. The mouvement buttons send one-step
requests (`mouvementLeftPressed` / `mouvementRightPressed`), never a held
direction.

\* Reserved: wired into input and combat, but inactive until a fighter has a
Transform move (neither #0001 nor #0002 has one yet). Its touch button has a
dashed outline.

A fighter may also lack a move altogether. A button left out of its
`actions` (`attack3` to `attack5` for a fighter with fewer numbered
buttons, or a fighter with no extra attack) keeps its key and gamepad button
bound for everyone but does nothing for that fighter, and its touch
controls have no button for it. Without a `defense` the Shield does nothing
for it either.

### Attack loadouts

Every fighter has 2 to 5 numbered attacks, `attack1` and `attack2` always,
numbered in a row from `attack1` to its highest. An optional
`extra_attack` sits outside that count. Every numbered attack is a button
of its own, pressed directly (`js/data/loadout.js`); nothing else reaches
one. What kind of move each button is belongs to the character:

- **An ordinary attack** (`{ ground: 'attackN', air: 'midair_attackN' }`):
  `attackN` on the ground, its mid-air version in the air. `attack1` and
  `attack2` are always ordinary.
- **A summon** (`{ type: 'summon', id: 'attackN' }`): sends out a detached
  entity, such as #0001's Clone Attack (`summons`, js/game/clone.js).
- **A technique** (`{ type: 'technique', id: 'attackN' }`): a multi-phase
  move the fighter performs itself, such as #0001's Sphere Rush
  (`techniques`, js/game/technique.js).

A summon or a technique is keyed by the button it is, ground-only, needs no
mid-air version, and has its own cooldown, which shows under the fighter as
**A3** / **A4** (named after the attack). A press while it cools down, in
the air, or when it cannot happen (no opponent, missing art) does nothing at
all: no other attack in its place and nothing kept for later.

| Numbered attacks | Buttons (touch slots in order) |
| --- | --- |
| 2 | `attack1` `attack2` |
| 3 | `attack1` `attack2` `attack3` |
| 4 | `attack1` … `attack4` |
| 5 | `attack1` … `attack5` |

In data, #0001's:

```js
actions: {
  extra_attack: 'extra_attack',                         // optional
  transform: null,                                      // reserved
  attack1: { ground: 'attack1', air: 'midair_attack1' }, // the Punch
  attack2: { ground: 'attack2', air: 'midair_attack2' }, // the Kick
  attack3: { type: 'summon', id: 'attack3' },           // the Clone Attack
  attack4: { type: 'technique', id: 'attack4' },        // the Sphere Rush
},
```

`js/data/characters.js` refuses to load a definition that breaks any of
these rules (`loadoutProblems` names each one): fewer than two or more than
five numbered attacks, a gap in their numbers, an ordinary button without
its mid-air version, `attack1` or `attack2` that is not ordinary, a summon
or technique not keyed by its own button or of an unknown type, a summon
or technique no button names, a move or clip that is not there, or an
object not named after the attack that makes it.

### Language

Alva speaks **English** and **French**. The first time it is opened on a
device, after the complete intro, Home opens and asks once: a small dialog
titled "Language · Langue" with two choices, **English** and **Français** (the one matching the
browser's language has focus, but nothing is chosen for you). The choice is
saved on the device and applied at once, and a returning player is never
asked again: subsequent launches go from splash directly to Home. Home stays visible but inactive
behind the chooser, and switches language immediately after the choice. Change it later under **Settings → Language**
(the gear at the top right of Home): the whole interface switches immediately, with no
reload, and `<html lang>` follows.

Every player-facing string, and every spoken label (`aria-label`s, dialog
titles, touch-control names), comes from one table in `js/core/i18n.js`,
looked up by stable key (`t('home.play')`). English game copy (Powers,
Launch, difficulty levels, stage names, control names, each fighter's own
touch-button names) is read from the registries that own it, so it cannot
drift; the French table translates every key, and a test fails if one is
missing. Internal identifiers (control and move codenames, character, map
and scheme ids, CSS classes, data keys) are never translated, and proper
names (ALVA, #0001, Shuriken, the credited sources) stay as they are.

### Settings

The gear at the top right of Home opens **Settings**: a translucent glass
dialog over Home (Home stays visible, dimmed and blurred, behind it) with
two sections, **Language** and **Controls**. Everything in it works with
mouse, touch, keyboard and gamepad; Esc or gamepad Back, the close button or
a press on the dim closes it, and focus returns to the gear.

Settings are saved on the device as one small versioned object in
`localStorage` under `alva.settings` (schema version 2: `language`,
`mobileControls` and each scheme's custom touch layout). Only
`js/core/settings.js` touches storage. Settings saved by an older version
(version 1, Mobile Controls only) are migrated: the Joystick / Classic
choice is kept and the language chooser shows once. Anything missing,
corrupt or out of range falls back to its default, value by value; where
storage is blocked, choices last for the visit.

### Mobile Controls

Touch play has two layouts. Pick one under **Settings → Controls → Mobile
Controls**; Quick Battle and Practice Ground use it from their next start.
Watch Mode never shows player controls. Keyboard and gamepad controls are
the same whichever layout is chosen.

- **Joystick** (the default, for anyone who never chose): the lower-left
  corner is one round joystick. Push it left or right to run; it holds the
  same `runLeft` / `runRight` as the keys, so how far you push never changes the
  speed. A small deadzone round the centre keeps a resting thumb from
  drifting, crossing the centre switches direction cleanly, and letting go
  recentres it. Pushing it up or down only moves the knob: Jump and Down
  keep their own buttons. The stick is a plain base and knob, with no
  arrows drawn in it. Above the joystick's top corners sit two small
  Dash buttons, **Left mouvement** and **Right mouvement**: one tap is one
  Dash that way. They hold nothing and need no second tap, and the Dash
  itself is the usual one (grounded only, 15 Energy, its animation, and
  refused while attacking, shielding, exhausted and so on). **Down** is a
  down-arrow button to the left of the joystick, level with its centre:
  hold it in the air to fast-fall, or as a hit lands to steer the launch
  downward; on the ground it does nothing. The lower-right buttons sit
  exactly where Classic Buttons has them. The
  joystick works with any other button at once (hold it right and press
  Jump, Punch, Kick, Shield, Shuriken or Transform with another finger).
- **Classic Buttons**: the original layout: Left, **Down** (the down
  arrow) and Right at the lower left, with thumb sliding between them;
  tap Left or Right twice quickly to Dash.

Both layouts share the lower-right cluster. Its numbered attack buttons
fill fixed slots, as many as the fighter has buttons for: `attack1` in
slot 1 and `attack2` in slot 2 (the bottom row, where Punch and Kick have
always been), then its other numbered buttons in slots 3, 4 and 5, a
honeycomb round Transform and Shield in which no two buttons overlap:

```
          [4]  [5]  [EXTRA]
       [3]  [TRANSFORM] [SHIELD]
          [1]  [2]  [JUMP]
```

So a fighter with 3 attacks fills slots 1–3 and one with 5 fills all five,
whatever kind of move each button is. #0001 uses slots 1 to 4 (Punch, Kick,
Clone Attack, Sphere Rush); #0002 slots 1 to 3.

The keyboard and gamepad Dash stays the double tap. Pushing the joystick
out twice quickly is a double tap too, as with a gamepad stick.

**Customize touch controls** (under Settings → Controls) opens a layout
editor for the layout in use: the real touch controls over a still battle
screen, placed exactly as in play. Every control can be moved and resized,
the joystick and the Dash buttons included, and all five numbered attack
buttons show (in their neutral look where the fighter has none), since the
layout is every fighter's; each is stored by its codename (`attack1` …
`attack5`, `extra_attack`), never by its label or slot:

- **Drag** a control to move it. It stays whole on screen, inside the safe
  area.
- **Select** a control (tap or click it) to resize it with **−** / **+** or
  the size slider, from 70% to 180% of its size; its touch area grows and
  shrinks with it.
- With a **keyboard or gamepad**, move to a control and press Enter / A: the
  arrows or D-pad then nudge it in small steps until Enter / A or Esc /
  Back. ← / → on the focused size slider resize it.
- **Reset to defaults** puts that layout back exactly as Alva draws it;
  **Done** (or Esc / Back) returns to Settings.

Every change is saved as it lands (a drag when it ends, each nudge, each
size step, a reset). Joystick and Classic Buttons keep separate layouts, so
switching layouts later brings back that layout's own arrangement.
Positions are stored as fractions of the screen's safe play area and sizes
as scales, never raw pixels, so a layout made on one screen fits another,
and a resize or rotation re-places everything. A control that has not been
moved stays exactly where the stylesheet puts it. Moving or resizing never
changes what a control does: the same codenames, held buttons, joystick
deadzone, one-tap Dash buttons and multi-touch, and Classic Buttons' Left /
C / Right still slide into one another wherever they sit. The HUD's pause
and More buttons always stay on top of the controls, so no arrangement can
cover them.

- **Movement and combos:** #0001 starts, stops and turns quickly (top
  speed in about 0.08 s, a short stop, a full turn in about 0.12 s) and
  steers well in the air, where steering bends the drift rather than
  replacing it. A running jump carries its speed. Holding Down (`S` /
  `↓`, the touch down arrow) in the air while falling is a **fast fall**. Attacks keep
  some of the speed you carry into them: a running punch slides on, the
  kick steps in, aerials keep their drift and follow the stick almost
  fully, and the Throw can be steered as it throws. Press your next attack
  slightly early and it is **buffered** (0.15 s): it comes out on the
  first step it can, including right after the Shield is let go or a Dash
  ends; presses made during a hit's freeze are kept too, a Dash included.
  An attack that **hits** (a block does not count) can be cut short by
  another attack, a jump or, on the ground, a **Dash** from its strike
  on, so the follow-ups arrive while the opponent is still stunned:
  attack1 → attack2, attack1 → attack1 up close, attack1 → Dash → attack1 to chase a push, attack2 →
  jump → midair_attack1 (and on through the air jump), midair_attack2 → land →
  attack1. A Dash cancel costs 40 Energy instead of 15: two from a full bar,
  and a third empties it (and the Shield with it). A whiffed or blocked
  attack keeps its whole recovery.
  Nothing caps a combo but the Launch Point: the higher it is, the further
  each hit sends the opponent, so the same routes stop working and the
  fight turns into pursuit and ring-outs. An attack faces the direction
  you hold as it starts, and a hit interrupts the attack the opponent was
  making. **Turning in an action:** during an attack or the Shield,
  holding the other direction turns #0001 round at once (as often as you
  like), so an opponent who crosses behind you mid-attack can still be hit
  and a shuriken not yet thrown goes the new way; a Sphere Rush goes the
  way held as Attack 4 is pressed. Turning never walks or runs. A stun, a bind, a Dash and
  the Sphere Rush itself keep their facing.
- **Jumps, launches and the Shield:** tap Jump for the normal jump, or hold
  it a little longer (0.15 s from takeoff) for a **higher jump**, about 1.4×
  the height: from that moment the rise carries on under lighter gravity,
  so the arc stretches rather than kicking. Press Jump again in the air for
  one **air jump** (a direction held changes course; always the same
  height); landing or being hit gives it back. Holding Down while falling
  is the **fast fall**; holding Shield in the air is a **slow fall**
  (below). A harder launch **stuns longer** (0.2 s more per 1000
  units/s, at most 0.7 s more), and a hard one sets the fighter
  **tumbling** in its mid-air hurt pose until it acts or lands, so with the
  air jump a juggle can reach three hits around 35–45 Launch Point. Hold a
  direction as you are hit to **steer your launch** up to 15 degrees that
  way (never its strength). A launch that slams its fighter hard into a
  wall, the floor or a ceiling **rebounds** off it (see
  [Launch bounce](#launch-bounce)): chase the ricochet. Raise the Shield
  just before a hit lands for a **perfect Shield**: free and with no
  blockstun, so you can punish; it
  needs a fresh raise, so tapping Shield does not count.
- **Hit effects:** screen shake scaled to the hit, a one-frame white flash
  on the fighter hit, sparks where it landed (red rings for blocks, white
  for a perfect Shield), fading speed trails behind a tumbling fighter,
  sparks and a small shake where a launch rebounds off the stage, and a
  short slow-motion zoom on a launch that will carry its fighter into the
  Void. Presentation only (`js/game/hit-fx.js`): they never change a
  simulation step. Reduced motion drops the shake and the zoom.
- **Punch (`attack1`):** a punch on the ground, a kunai slash in the
  air. The same button picks the move from whether #0001 is grounded when
  you press it; a mid-air slash that lands keeps playing to the end. Both deal
  3 damage. The punch pushes the opponent away (Base Launch 1, horizontal);
  the mid-air slash launches it upward instead, with no sideways push (Base
  Launch 2, vertical). A Shielded slash does not launch. Internally the
  button is `attack1`, and its moves are `attack1` (the punch) and `midair_attack1` (the
  mid-air slash).
- **Kick (`attack2`):** a slower, heavier spinning high kick on the
  ground, an airborne kick in the air. Both deal 5 damage. The ground kick
  launches the opponent upward (Base Launch 2, vertical); the mid-air kick
  drives it downward just as hard (Base Launch 2, reverse vertical), with no
  sideways push.
  A Shielded kick is neither launched nor driven down. It picks the move the
  same way, and a mid-air kick that lands also plays to the end. Internally
  the button is `attack2`, and its moves are `attack2` (the kick) and `midair_attack2` (the
  mid-air kick).
- **Throw (`extra_attack`):** #0001's projectile attack, on `J`, X / Square on a gamepad and
  the **Shuriken** button on touch. One press plays one three-frame Throw
  (`extra_attack_1 → extra_attack_2 → extra_attack_3`, once, at 12 fps) and releases exactly one
  shuriken as the arm whips forward on `extra_attack_2`; holding the button does not
  throw again. The shuriken leaves the throwing hand and flies straight the
  way #0001 was facing at the release (turn during the wind-up and it goes
  the new way), spinning through its own three-frame loop (`extra_attack_object_1 →
  extra_attack_object_2 → extra_attack_object_3`, 18 fps). Turning, jumping or getting hit after
  the release does not change its course. It hits once (1 damage,
  so +1 Launch Point, and a short hitstun, with Base Launch 0 and no
  Directional Launch: it neither pushes nor launches, however high the
  opponent's Launch Point) and disappears; it
  also vanishes after 1.5 s, in the Void or against a solid rock (the
  stage's own cliff face included); past a ledge it flies on over the open
  air.
  A Shield blocks it, and it is gone. Throw is ground-only for now because there
  are no mid-air Throw sprites: pressing it in the air does nothing. It has a
  0.25 s cooldown. Internally both the button and the move are `extra_attack`,
  #0001's extra attack, and the shuriken it throws is `extra_attack_object`
  (projectile and art alike: `0001_extra_attack_object_1.png` …).
- **Shield:** the game's shared defensive button, `shield`: `L`, RB / RT on
  a gamepad, the **Shield** button on touch. What it does is each
  character's own (its `defense` entry); the button stays the same. #0001
  uses **Shield**: hold it to Shield. The Shield is up for as long as the
  button is held
  (a held state, not a one-press move) and drops the moment it is let go.
  On the ground #0001 raises it on `prepshield` for one frame, holds
  `shielding`, and lowers it on `releaseshield` for one frame after (the
  lower pose is visual only: move, jump or attack straight away). In the
  air there is only the held pose, `midair_shielding`: no raise or lower
  pose, and #0001 **falls slowly**: a faster fall (a fast fall included)
  brakes to 200 units/s within 0.2 s and stays there while the Shield is
  up (a rise is untouched), keeping his sideways momentum but not
  steering. Let go and he falls normally again. On the ground the Shield
  holds him in place: no walking, running, Dash or jump, though holding a
  direction turns him round. While Shield is held no attack, Throw, Clone
  Attack, Sphere Rush or Dash starts; let go of Shield first (an attack
  pressed meanwhile comes out as you let go). An attack already playing
  is never cut short: the Shield comes up the moment it ends. The Shield
  is a full circle: any
  hit that reaches #0001's hurtboxes, from either side, melee, shuriken,
  clone or Sphere Rush contact alike, is blocked. A blocked hit adds no
  Launch Point, launches nothing and shows no hurt pose; it costs **25
  Energy**, once for that hit, and the Shield holds through its hitstop
  and blockstun. Holding the Shield costs nothing, and neither does an
  attack that misses. It goes up with any Energy left and never works while
  exhausted (below). A block with less than 25 left still stands but takes
  all of it, which empties the bar: the Shield drops at once. It is drawn as a wavy
  black circle round #0001 with a thin red line on its outer side, over a
  barely-there black interior so he stays in plain view; it follows him,
  is sized from his visual height and its edge visibly wavers like the
  Void's, drifting slowly (still with reduced motion). It is art only: what
  is blocked is decided by his normal hurtboxes, never by the larger circle.
- **Dash:** press left or right twice in a row (two `runLeftPressed` /
  `runRightPressed` edges, the second within 0.22 s of the first, keyboard,
  touch, D-pad or left stick alike) while standing on the ground, or tap
  **Left mouvement** / **Right mouvement** (`mouvementLeft` /
  `mouvementRight`) once in the Joystick touch layout: that one-tap request
  (`InputManager.queueTouchMouvement`) goes through the same `Fighter.tryDash`,
  with every rule and cost below, and forgets any first tap waiting. #0001 bursts that way at about 2.7× its top speed
  (900 units / s) for one pass of its two-frame `mouvment` clip (`mouvment_1 → mouvment_2`,
  once, at 10 fps: 0.2 s, about 180 units), facing the Dash at once, then
  runs on from that speed if you keep holding the direction. It costs 15
  Energy (all that is left, emptying the bar, when there is less). It is movement only: no hitbox, damage, launch or
  invulnerability, and it still obeys the stage: a solid stops it, and
  running off a ledge ends it and #0001 falls. When it ends, the burst
  eases back into the run within a few steps if you hold the direction, or
  into a short slide if you let go; an attack pressed late in the Dash
  comes out as it ends. An attack that hit can be cut short by a Dash
  (a Dash cancel, 40 Energy). No Dash in the air, while
  attacking (unless the attack hit), shielding (or holding Shield),
  stunned, bound or already dashing (holding Down never stops one); an
  attack or the Shield on the same step wins over it, and a double tap
  that cannot Dash is used up, never saved for later (except through a
  hit's freeze, when it comes out as the freeze ends).
  Left then right (or right then left) is not a double tap.
- **Energy:** each fighter's one resource, 100 at most and at the start.
  It is spent only by a Dash (15, as it starts; 40 for a Dash cancel) and
  by the Shield (25 for every hit it blocks; holding it is free). It refills by itself at 12 per
  second whatever the fighter is doing (shielding included): one passive
  rate, which nothing held makes faster. It shows over the fighter's name
  tag only while below full, as one thin bright purple bar that shrinks
  from the right. A Dash or a block still happens with less Energy left than
  it costs, but then takes all of it. At 0, however it gets there, the
  fighter is exhausted: the bar turns gray and Shield and Dash stay locked
  until Energy is completely full again (a partial refill does not unlock
  them); the bar disappears at 100. Exhausted, a fighter still moves, jumps,
  attacks and uses A3 / A4: nothing else ever costs Energy.
- **Down:** hold `S` / `↓` (on touch the down arrow, left of the joystick or
  between Left and Right in Classic Buttons; D-pad down or left stick down on
  a gamepad). It is a direction only: in the air while falling it is the
  **fast fall**, and held as a hit lands it bends the launch downward (see
  Launch steering). On the ground it does nothing at all: no pose, no
  stance, no change to movement, the Dash, Energy, cooldowns or what any
  button does. There is no drop-through control: walk off an edge to come
  down. Menus read their own Down.
- **Clone Attack (attack3):** press Attack 3 (`O`, LT on a gamepad, the
  **Clone Attack** touch button) on the ground. A clone appears behind the
  opponent in a smoke cloud (`attack3_object_1 → … → attack3_object_10`, 20
  fps), performs #0001's normal attack1, then vanishes through the cloud
  animation in reverse (`attack3_object_10 → … → attack3_object_1`). #0001
  itself performs nothing and is free at once: it can run, jump, attack or
  Dash while its clone plays. attack3 then cools down for 5 s (below), hit
  or miss. Pressed while it is still cooling down, in the air, or with no
  opponent to appear behind, it does nothing at all: no attack1 in its
  place, no cooldown spent, and nothing kept for later.
  The clone appears on the opponent's back side, facing it, at the spot where
  the opponent stood when you pressed Attack 3; it never follows, so an opponent
  who moves away makes it miss. Its punch is attack1's (3 damage, same hitbox
  and hitstun, Base Launch 1 horizontal, pushing the opponent away from the
  clone), hits
  once, and a Shield blocks it like any attack. If
  there is no ground behind the opponent at its foot height (it stands at a
  platform's edge or a ledge with its back to the drop, or it is in the
  air), the clone
  appears over the opponent instead and performs #0001's midair_attack2 kick
  (5 damage, Base Launch 2 reverse vertical, driving the opponent
  downward); same cloud, same cooldown. The
  impact freezes the opponent and the clone, never #0001. The clone cannot be
  hit, blocks nobody and is not followed by the camera. Once summoned it
  finishes appearing, attacking and vanishing whatever #0001 does next.
- **Sphere Rush (attack4):** press Attack 4 (`M`, L3 on a gamepad, the
  **Sphere Rush** touch button) on the ground; it goes the way you hold as
  you press it. #0001 forms a blue sphere, dashes forward once it is complete, and must connect
  during the rush. A miss stops him dead and he lets the sphere go on a
  brief release pose before he is free again. A hit traps the opponent in
  the spinning sphere, adding 1 Launch Point at once and then every half
  second, with no launch, while the sphere keeps growing, until it explodes
  two seconds later
  for 10 more and a sideways launch at Base Launch 3 (three times the
  opponent's new Launch Point); #0001 then recovers. The entire technique
  requires ground beneath #0001; losing ground cancels it and makes him
  fall. Starting it spends its 5-second cooldown, whether it then hits,
  misses, meets a wall or is interrupted; pressed while it cools down or in
  the air it does nothing at all.
  In detail: #0001 stands still while
  the sphere forms in his rear palm (`attack4_1 → attack4_3`, holding `attack4_3`,
  with `attack4_object_1 → attack4_object_6`, 0.5 s). Only then does he rush forward at a
  fixed speed for one pass of `attack4_4 → attack4_6` (0.25 s, about 262 world
  units), carrying the finished sphere behind him and swinging it forward on
  `attack4_6`; the sphere itself is what has to touch the opponent. No contact
  by the end of the rush (or a wall first) is a miss: #0001 stops where he
  is, the sphere vanishes without exploding, and he shows the release pose
  `attack4_12` alone for one frame (1/12 s) before he is free. A hit (no
  damage and no launch) stops the rush at once and traps the opponent, shown
  hurt on that very frame: it can't move, jump, attack, Throw or Defend,
  but gravity still applies. #0001 plays `attack4_7 → attack4_8` and
  holds `attack4_8` while the sphere on the opponent keeps spinning
  (`attack4_object_7 → attack4_object_8 → attack4_object_9`, looped) and grows steadily larger (drawn
  from its own size to 1.4× by the blast, still centred on the opponent).
  While it is held the opponent takes 1 damage (+1 Launch Point, Base Launch
  0, no Directional Launch) on the very step the sphere catches it, then
  0.5, 1.0 and 1.5 s after the hit, counted on the fixed-step clock, with no
  launch, stun or freeze. Exactly 2 s after the hit it explodes (`attack4_object_10 → attack4_object_11`,
  once) with #0001 on `attack4_9`, the explosion pose: the opponent is
  released, then takes 10 (14 in all: 4 ticks and the blast; the explosion
  is never also a tick) and is launched sideways, away from #0001, at Base
  Launch 3: the 10 is added first, then the new Launch Point is tripled
  (from 0, 4 + 10 = 14 and 3 × 14 = 42; from 111, 111 + 10 = 121 and
  3 × 121 = 363). It is the technique's only launching hit and uses
  the same shared launch as every other hit. Only once the blast is over does
  #0001 recover through `attack4_10 → attack4_11 → attack4_12`. A Shield blocks the
  contact (25 Energy, no Launch Point): no trap, no tick, no explosion, and
  the technique ends there, #0001 free at once. A hit on #0001 cancels it
  (no armour), freeing the opponent with no further ticks. Once it is
  over, #0001 is simply free.
- **Launch Point:** every fighter's own number, shown under its name in the
  HUD. It starts at 0 on every fresh life and every hit adds exactly the
  damage it deals: attack1 3, midair_attack1 3, attack2 5, midair_attack2 5, the
  shuriken 1, the Sphere Rush 1 per tick and 10 on the blast (a Shielded
  hit adds nothing). It has no maximum and no % sign, never goes
  below 0 and resets to 0 when the fighter respawns. Each hit then launches
  with its **Base Launch** (0, 1, 2 or 3) times the target's new Launch
  Point, in its **Directional Launch** (see [Launch](#launch)). No amount of
  Launch Point stops a fighter acting or takes it out: only the Void does,
  and each fall is a point for the opponent.
- **Attack 3 and Attack 4 cooldowns (A3, A4):** the Clone Attack (`attack3`,
  shown as **A3**) and the Sphere Rush (`attack4`, **A4**) each have their
  own 5-second cooldown, keyed by the attack itself, started the moment the
  move is used (the clone summoned, the rush started), whether it hits or
  not. A press while it is cooling down does nothing, and is never kept
  for later. While it
  cools down it shows as a small white ring, outlined in black, under the
  fighter's feet, labelled A3 or A4: it fills clockwise as the ability
  recovers, with the seconds left inside, and disappears the moment it is
  ready. A lone ring sits centred under the fighter, two sit side by side,
  and with both ready nothing is drawn. Both recover in real time, one
  second per second, whatever #0001 does. A restart or rematch, a new fighter in Practice Ground and every
  respawn after the Void clear them. They cost no Energy.
- **Menus:** arrow keys or WASD to move, `Enter` to select, `Esc` to go back. Mouse and touch work too.
- **Touch:** two layouts, Joystick (the default) and Classic Buttons (see [Mobile Controls](#mobile-controls)). Several fingers work at once (hold the joystick or Right and press Jump, or hold Down and press Punch). The combat buttons show icons, not letters: for #0001, **Shuriken** (Throw), **Shield** (held), **Punch** (attack1), **Kick** (attack2), **Clone Attack** (attack3) and **Sphere Rush** (attack4), beside Transform (dashed: #0001 has none yet) and Jump. Which buttons a fighter has comes from its `actions` (`abilityPresence` in `js/ui/mobile-abilities.js`), so a move it does not have (left out of `actions`) has its button hidden, unnamed and untouchable, its place left empty, while one mapped to `null` stays reserved (dashed). The touch layout editor still shows every control, so a layout can place a button for the fighters that have it. The icons of the fighter's own buttons (Shuriken, Punch, Kick, the numbered glyphs of the Clone Attack and the Sphere Rush, and Transform once a fighter has one) come from its `mobileAbilities` in `js/data/characters.js` and follow Player 1's fighter, in Practice Ground too when you change fighter; a fighter with no `transform` entry keeps the dashed, reserved Transform star. Shield, Jump and Down are the same for everyone. Only the presentation is per fighter: the buttons always send the same control codenames (`extra_attack`, `transform`, `shield`, `attack1` … `attack5`). A fighter with more numbered attack buttons shows up to five, in fixed slots round Transform and Shield (see [Mobile Controls](#mobile-controls)); #0001 shows four, Punch, Kick, Clone Attack and Sphere Rush in slots 1 to 4; #0002 shows three, **Punch**, **Kick** and **Spin** (its One-Two / Homing Attack, Rapid Kicks / Bounce Attack and Spin Attack / Blue Tornado), with **Whirlwind** on top. The combat buttons are the same elements in both layouts, in the same places: switching (`TouchControls.setScheme`) only swaps the lower-left corner (Left / Down / Right, or Down and the joystick with its Dash buttons), after letting go of everything held. Each layout can also be rearranged and resized by the player (see [Mobile Controls](#mobile-controls)); the buttons keep what they do wherever they sit. The viewport disables page zoom (`maximum-scale=1, user-scalable=no`) and the play surfaces, joystick and buttons set `touch-action: none`, so rapid taps never zoom or scroll the page.
- **Gamepad (standard layout):** D-pad or left stick left / right to move (twice in a row to Dash) and down for Down in battle (they still navigate menus), A to jump, X / Square for the extra attack (#0001's Throw), B / Circle for `attack1`, LB for `attack2`, LT, L3 and R3 for `attack3` to `attack5` (#0001's Clone Attack and Sphere Rush on LT and L3), Y / Triangle for the reserved Transform, RB or RT for Shield, Start to pause.
- **Debug:** `` ` `` toggles the collider, hurtbox and attack-hitbox overlay in battle (a hitbox shows only while it can connect; hurtboxes look the same with the Shield up, and a shielding fighter is labelled `shield`; a flying shuriken's hitbox is outlined in magenta and labelled; a clone's attack hitbox shows in the attack colour, labelled `clone attack1` (or `clone midair_attack2` overhead), only on its active frame; the Sphere Rush's sphere hitbox is a dashed cyan box labelled `attack4 dash` while it can connect, then a dashed cyan cross marks the sphere on the caught opponent, which is labelled `bound`; solids, the main floor's block among them, are outlined in red and the Void's fixed kill line is dashed violet).

Touch controls show on touch-first devices (coarse pointer, or a touch actually detected). A narrow desktop window doesn't count as a phone. On a phone held in portrait, the game pauses and asks you to rotate.

## Current content

- **Characters:** #0001 (roster slot 01) and #0002 (roster slot 02), both playable (`available: true`; see [Roster status](#roster-status)). The other 46 slots are locked
- **Maps:** Desert (a sandstone mesa with 2 rock outcrops, 1360 units wide) and City (a rooftop with 7 one-way platforms and a stair bulkhead, 1440 wide) for Quick Battle and Watch Mode; the Practice Ground training room (one flat training block, 1280 wide) for practice. Each is a compact main stage with open air past both ledges and the Void a short way beyond (see [Stages and the Void](#stages-and-the-void))
- **Animations:** Idle, Run, Jump, Fall, Land (jump/fall play while airborne; land plays once on touchdown), Hurt and Mid-air Hurt (shown during hitstun on the ground / in the air), attack1 (4 frames), midair_attack1 (the kunai slash, 3 frames: `0001_midair_attack1_1`–`3`), attack2 (7 frames) and midair_attack2 (the airborne kick, 5 frames: `0001_midair_attack2_1`–`5`), each played once at 12 fps, Shield (`0001_prepshield_1` to raise it, `0001_shielding_1` held, `0001_releaseshield_1` to lower it) and Mid-air Shield (`0001_midair_shielding_1`, the held pose only), single frames drawn at 1×, Dash (`0001_mouvment_1`–`2`, drawn at 1×, played once at 10 fps), Throw (3 fighter frames, played once at 12 fps), Shuriken (3 looping projectile frames at 18 fps, normalized and drawn separately from the fighter poses), the clone appear / vanish cloud (`0001_attack3_object_1`–`0001_attack3_object_10`, an effect at 20 fps: forwards as a clone appears, the same frames in reverse as it vanishes), the Sphere Rush poses (`0001_attack4_1`–`0001_attack4_12` as one-shot fighter clips at 12 fps: formation 1–3, rush 4–6, contact 7–8 with 8 held, explosion 9, recovery 10–12, and 12 alone as the whiff release) and its blue sphere (`0001_attack4_object_1`–`0001_attack4_object_11` as three effects at 12 fps: formation 1–6 once, spinning on the opponent 7–9 looped while it is drawn ever larger, explosion 10–11 once)
- **#0002's animations:** 85 frames in `assets/characters/0002/`, cut from one sprite sheet, 1× and drawn at #0001's size per art pixel: Idle (8), Run (12), the spin Jump (the ball, 8, looped), Fall (1), the Dash (the figure-eight blur, 4), Hurt and Mid-air Hurt, the ground guard, the One-Two (4), the Rapid Kicks (4, played twice), the Homing Attack, Bounce Attack and Spin Attack balls (8 each), the Blue Tornado (4, looped), the Whirlwind (9) and its travelling tornado (4, a projectile). No Land clip.
- **Attacks:** attack1 and attack2, each on the ground and in the air, a ground Throw that releases one shuriken, the attack3 Clone Attack and the attack4 Sphere Rush (ground only), each on its own 5-second cooldown. #0002: see [#0002, the speedster](#0002-the-speedster). #0001's damage: attack1 3, midair_attack1 3, attack2 5, midair_attack2 5, shuriken 1, Sphere Rush 1 as it catches the opponent and every 0.5 s after while it holds it (4 in all), then 10 on the explosion. Transform is reserved.
- **Shield:** #0001 shields, on the ground and in the air: held, full circle, free to hold, 25 Energy for each hit it blocks. #0002 guards on the ground only (it has no mid-air guard art; in the air the Shield button does nothing for it). A fighter with no `defense` has no Shield: the Shield button does nothing for it.
- **Movement:** running, jumping (the normal jump on a tap, a higher jump held a little longer, one air jump), air steering, the fast fall, the air Shield's slow fall and a grounded Dash on a double tap (15 Energy); attacks keep and add their own momentum, turn with the direction held, early presses are buffered, and a hit opens a follow-up, a Dash cancel included (see Controls above).
- **Powers:** Jump Power and Speed Power, each in three tiers. #0001 has Jump Power 2 and Speed Power 2 (its original jump and speed); #0002 has Jump Power 2 and Speed Power 3 (the fastest).
- **Launch:** every hit's damage adds to the target's Launch Point, then the hit launches at its Base Launch (0, 1, 2 or 3) × that new Launch Point, in its Directional Launch. #0001's attack1 is Base Launch 1 horizontal, its attack2 and midair_attack1 Base Launch 2 vertical, its midair_attack2 Base Launch 2 reverse vertical (downward), the Sphere Rush blast Base Launch 3 horizontal, and the shuriken and Sphere Rush ticks Base Launch 0 with no direction (they never launch).
- **HUD:** each fighter has one compact, semi-transparent glass card, pulled in close on either side of the timer: its portrait (the character's own `visual.portrait` crop, turned to face the timer whichever way its art is drawn), one thin divider, and its name with its Launch Point beneath it, under its tag: **P1** and **CPU** in Quick Battle, **CPU 1** and **CPU 2** in Watch Mode. The right-hand card mirrors the left-hand one. In a battle three small dots under each card fill as that fighter scores its points (○ ○ ○, then ● ○ ○ ...). Over each fighter itself, following it: its bright purple Energy bar above its name tag while below full, and its A3 / A4 cooldown rings under its feet while cooling down.
- **Modes:** Quick Battle (Splash → Home → Select Mode → Select Difficulty → Select Fighter → Select Stage → Battle): 5 minutes against a CPU that fights with the whole moveset at the difficulty you choose (Easy, Medium, Hard or Brutal; see [Quick Battle difficulty](#quick-battle-difficulty)), first to 3 points. Each time a fighter falls into the Void its opponent scores a point at once; the one that fell is out of play for 2 seconds, then back at its spawn with 0 Launch Point, full Energy and Attack 3 and Attack 4 ready, while the fight and the timer carry on. The third point wins the match (a short **K.O.** beat, then the result; the loser does not come back). If both fall together, or one falls while the other is still waiting to come back, that fall scores nothing. If time runs out first, more points wins, then lower Launch Point; equal on both is a draw. Watch Mode (Home → Watch Mode → Select Difficulty → Select CPU 1 → Select CPU 2 → Select Stage → CPU vs CPU Battle): the same battle with the combat AI on both sides, for watching only (see [Watch Mode](#watch-mode)). Practice Ground: training on its own stage with a stand-still, non-attacking CPU dummy from the start (which you can change or disable; difficulty never applies to it), no timer, rounds or points; the Void takes a fighter out for 2 seconds, then puts it back at its spawn (below).

## Design

Alva's interface follows Seren's restrained visual discipline: near-black and
charcoal surfaces, off-white typography, gray hierarchy and thin translucent
borders. Green is the sole interface accent, used sparingly for primary actions,
selection and progress. Check marks, filled indicators and an off-white focus
ring with dark separation keep states identifiable beyond colour.

- **Tokens** live at the top of `styles.css` (`--bg`, `--surface*`, `--text*`,
  `--border*`, `--accent*`, `--action*`, radii, shadows, `--focus-ring`). Deeper
  green action fills preserve contrast for white labels; muted text is lifted
  for legibility on charcoal.
- **Wordmark:** `js/ui/logo.js` draws ALVA from geometric SVG letterforms and
  inherits `currentColor`, so it needs no font download. `alvafav.PNG`
  is the site favicon.
- **Home** pairs an oversized off-white ALVA wordmark, the line "Fan project.
  Big heart." and a Play action with an angled strip of semi-transparent glass
  over the black background. A crisp green slash separates the two zones.
  Plain-text credits roll upward inside the glass in an endless loop and stand
  still for reduced-motion users. Wheel/trackpad, pointer or touch dragging,
  and focused arrow/Page keys scroll the credits manually. Automatic movement
  resumes from that position after about 2 seconds of inactivity; reduced-motion
  mode remains manual-only. Under Play come three outlined secondary actions,
  in this order: **Watch Mode** opens its CPU-vs-CPU setup directly (never
  Select Mode), **Practice Ground** opens the training room directly, and
  **Discover** opens the in-game reference. Play, Watch Mode and Practice
  Ground each start a match, so they are open only while a fighter is
  playable (#0001 is): with none, they are disabled, out of Tab and arrow
  navigation, and described by a "No fighters available" note under the
  menu, and focus starts on Discover. A compact gear button in the top
  right corner (inside the safe area, reached with → or ↑ from the menu)
  opens Settings. The strip shifts outward on narrow screens, and short
  landscape screens tighten the four actions, and shrink the wordmark only as
  much as they need, so they fit above the footer.
- **Settings** is a translucent glass dialog over Home, in the same glass as
  the pause and Practice panels: **Language** (English and Français as two
  radio buttons, the one in use ticked) and **Controls** (Mobile Controls as
  two cards, Joystick, marked Default, and Classic Buttons, each with a small
  drawing of its lower-left corner, and **Customize touch controls**). Both
  choices save at once; the dialog stays open. It scrolls on its own on
  short landscape screens.
- **The touch layout editor** fills the screen with a dusk stand-in for a
  stage and the real touch controls; a compact glass bar across the top
  holds the layout's name, a short hint, the size controls, Reset to
  defaults and Done, and fades while a control is dragged. The selected
  control wears a dashed green ring (solid while it is being moved with the
  keys).
- **Select Difficulty** takes Seren's four-level ascending scale into Alva's
  own language: four large charcoal cards (01 Easy, 02 Medium, 03 Hard, 04
  Brutal), each with its big mono index, a four-bar scale lit one to four
  bars in the green accent (the rest hollow, so the level reads by shape as
  well as tone; Brutal's top bar is a step brighter), its name and one short
  line. One row on wide screens, 2 × 2 on narrow ones, compact in short
  landscape. The current level wears the same green "Current" check pill as
  the selected stage.
- **Discover** takes its composition from Seren's Cars & more reference: an
  index rail (**POWER**, **LAUNCH**, **PASSIVES**) beside one scrollable page of
  structured entries, in Alva's charcoal, off-white and green. The open
  section wears a green bar, a faint wash and bolder type; the rail runs
  across the top on narrow windows but stays at the side in short
  landscape.
- **Practice Ground** is a pale, cool-gray simulation room: original Canvas
  artwork with a gridded back wall and one compact training block in
  perspective, open at both edges. Its HUD has Player 1's card, a three-dots
  More button top centre and the practice CPU's card, the same cards as
  Quick Battle's without the score dots; the Practice menu and the Change
  Fighter and CPU dialogs are translucent glass over the paused stage. The
  Launch Point each hit adds to the practice CPU floats over its head in red
  (`+3`).
- **Other screens** retain their established layouts, controls and navigation;
  only interface colours change. Battle keeps readable dark translucent chrome.
- Character sprites and stage artwork keep their original colours. No artwork,
  Canvas rendering, physics or combat is changed by the interface theme.

## How it's built

```
index.html            entry point
styles.css            all UI styling (Alva dark/green design tokens + screens)
ALVA_SPEC.md          product specification
UPDATES.md            named updates (movement, effect, bounce): what each changed
CLAUDE.md             notes for Claude sessions working on the repo
alvafav.PNG           site favicon
assets/characters/0001/   #0001 sprite frames (unchanged originals)
js/
  main.js, config.js  boot + global config (bindings, render, timing)
  core/               app controller, screen manager, menu navigation,
                      asset loader, input (keyboard/touch/gamepad), device,
                      audio stub, settings (saved language, Mobile
                      Controls and custom touch layouts), i18n (every
                      English and French string), touch-layout (control
                      ids, layout checks and geometry)
  screens/            splash, home, mode, difficulty, character, map, Watch
                      Mode's setup (watch-screens.js), battle, practice,
                      discover
  game/               arena (shared loop + rendering), battle (Quick Battle
                      and Watch Mode), Practice
                      session, controllers (player, combat AI, training),
                      fighter state machine, physics, camera,
                      combat, launch bounces, projectiles, summoned clones,
                      techniques, sprite normalizer/animator, HUDs,
                      fighter status (Energy bar, A3 / A4 rings), the Shield's
                      circle, touch controls (Joystick and Classic
                      Buttons)
  stages/             Desert, City and Practice renderers (procedural Canvas 2D),
                      the shared one-point perspective and the Void
  data/               characters.js, maps.js, practice-map.js, powers.js,
                      launch.js, difficulty.js
  ui/                 wordmark, icons, overlays, credits, stage preview,
                      fighter roster, mobile ability icons, the first-launch
                      language dialog, the Settings dialog and the touch
                      layout editor
```

- **Sprite normalization.** The idle, jump, fall, land and hurt frames are pixel art at roughly 16× scale, the mid-air hurt, attack1, attack2 (with their mid-air versions) and extra_attack frames at 8×, and the run frames at 4×; the mouvment (Dash) and Shield frames are drawn at 1× (one file pixel per art pixel), so each clip's `heightRatio` sizes it against idle's 52 art pixels at that same scale. When a frame loads, the game reads its alpha channel once and finds the visible bounds. It then detects the pixel grid from every colour transition and resamples the frame to 1 pixel per art pixel. Every frame is drawn at the same world scale, anchored bottom-centre at the upper-body centroid, so the fighter keeps the same size and position when switching between animations. When the size stays close to the target, each art pixel maps to a whole number of device pixels. The Sphere Rush poses are fighter poses at 2×, normalized like the rest. A clip whose art misleads the upper-body centroid (a head that should stay still while the arms swing, or a punch's arm or a kick's swoosh drawn beside the body) can place its own anchor per frame (`anchorX`). Each fighter is drawn at its own art scale (`Arena.pxPerArtOf`), and the view is sized for a fighter of the reference height (`CONFIG.render.fighterHeight`, #0001's 88 units) whoever is picked, so a shorter or taller fighter simply stands shorter or taller on the same stage. Projectile and effect art (`extra_attack_object`, the shuriken, at 8×; `attack3_object`, the clone cloud, and `attack4_object`, the Sphere Rush sphere, at 2×) goes through the same grid detection but keeps its own art size, centre-anchored at the fighter's art-pixel scale, and is never fitted to the fighter's height.
- **Simulation.** Fixed 60 Hz steps with interpolated rendering, so movement is the same at 30, 60 and 120 Hz. Colliders, hurtboxes and pushboxes are set in data and don't depend on PNG size.
- **Stages.** Flat parallax layers (sky, far, mid, near, atmosphere) are generated once from a seeded RNG into cached `Path2D` geometry; the playable geometry (main stage, platforms, solids) is drawn in one shared one-point perspective (`js/stages/perspective.js`) so it has depth. Collision comes only from `js/data/maps.js`, so any layer can later be swapped for image art.

### Stages and the Void

Every stage is a compact platform-fighter stage. Its map (`js/data/maps.js`,
`js/data/practice-map.js`) keeps four things apart:

- **Main stage** (`mainStage`): the finite main floor. Fighters stand on its
  top only between its `left` and `right` edges; below its top it is a solid
  block (a cliff, facade or block face), drawn and collided exactly alike.
- **Off-stage space**: the open air past both ledges. There are no side walls,
  visible or invisible: fighters can run, jump or be knocked off either ledge
  and fall below the stage, and drift back if they still can.
- **Camera bounds** (`cameraBounds`): where the camera may travel: the Void's
  rectangle plus a 140-unit strip past it (`cameraAround`), so the black edge
  comes into view as a fighter nears it but the camera never wanders deep
  into it.
- **The Void** (`voidBounds`): the kill boundary, a blast zone set by margins
  around the main stage (`voidAround`): 340–380 units past each ledge,
  400–420 below the stage's top and 760–800 above it (clear of any jump from
  the highest footing, so only a launch reaches it). A fighter whose centre
  leaves this fixed rectangle (`StageCollision.inVoid`) is taken by it: out
  of play at once (not drawn, hit, targeted or framed), and back at its own
  spawn 2 seconds later (`CONFIG.battle.respawnSeconds`, on the simulation
  clock), fresh. In Quick Battle each fall is also a point for the opponent,
  and the third point ends the match instead (a short **K.O.** beat, then
  the result). On screen
  the Void is one solid black layer with a single gently wavering edge,
  lined on the stage's side by a thin red rim (about 1.5 CSS px, no glow)
  traced from exactly the same points, so the two never drift apart; it
  only shows once the view nears it (never in neutral play), and holds still
  (rim included) with reduced motion. The drawn edge and its rim are art
  only: the kill line never moves. The Shield's circle (see Shield) shares
  this look, black with a red line, on the same kind of slow waves.

The camera is a platform-fighter view: fighters stand about a tenth of the
viewport tall, the whole main stage with some air past its ledges fits across
a 16:9 view (narrower screens zoom out further, never below 8.8 %), and the
framing leans toward the stage's centre while it follows the fight.

Desert is a sandstone mesa over open desert air; City a rooftop block over
the street canyon; Practice Ground a training block against its gridded
wall. All three are drawn in the same pseudo-3D perspective, with the
Practice Ground's projection shared by every stage.

### Quick Battle difficulty

**Play → Quick Battle** goes through four setup steps (Mode, Difficulty,
Fighter, Stage), shown in the header's progress steps: Splash → Home → Select
Mode → Select Difficulty → Select Fighter → Select Stage → Battle. Back from
Select Fighter returns to Select Difficulty, and Back from there to Select
Mode. The choice is Quick Battle's own (`app.selection.difficulty`, Medium
on a fresh start) and stays through Restart Battle, Rematch and every Void
respawn; Practice Ground never reads it.

- **Easy:** slower reactions, often too late or not at all; pauses, misjudges
  spacing, rarely uses the Clone Attack or the Sphere Rush. Still attacks:
  inexperienced, not disabled.
- **Medium:** a balanced opponent: Punch, Kick, Throw, occasional Shield,
  Clone Attack and Sphere Rush, answers slow threats, still gets caught.
- **Hard:** fast reactions; Shields and dodges real threats, punishes
  recovery, spaces, jumps in, dashes and uses the Clone Attack and the
  Sphere Rush deliberately.
- **Brutal:** reacts within a few frames (never instantly), reassesses
  constantly, manages Energy and cooldowns, and uses the full moveset. It
  still waits, spaces and retreats when that is the stronger choice.

**Difficulty changes how well the CPU thinks, not what its fighter is
allowed to do.** `js/data/difficulty.js` holds one profile per level, the
only place a level is validated (anything unknown is Medium): reaction
window, lapse chance, reassessment interval, decision noise, hesitation,
spacing error, motion lookahead, and weights for defense, punishing, the
summons and techniques (`specials`), Dash, planning, aggression, stage sense
and Energy care. Every trait
is ordered from Easy to Brutal. None of it touches a fighter: damage, launch,
speed, jumps, Dash, Shield, Energy, cooldowns, hitboxes, respawns and scoring
are the character's and the match's own, identical on every level.

The CPU is `CombatAIController` (`js/game/combat-ai.js`), a controller like
Player 1's: `Fighter.update` asks it for the same input snapshot a player
produces, and it only ever holds and presses buttons (`runLeft` /
`runRight`, `down`, `jump`, `shield`, `extra_attack`, every numbered attack
button the fighter has, `attack1` to `attack5`, and a double tap of a
direction for a Dash). #0001's Clone Attack is a press of `attack3` and its
Sphere Rush a press of `attack4`, exactly as a player does; `down` it only
holds to fast-fall. The fighter
and combat engine decide what those do, so the CPU cannot attack while
stunned, skip recovery, bypass a cooldown or spawn anything itself. Each
step it **senses** the fight from what the simulation shows (both fighters,
their attacks and phases, Shield, techniques, Energy, cooldowns, projectiles,
clones, the stage, the score and the clock; never the player's raw input),
**evaluates** options built from the fighter's own move data (reach from its
hitboxes, Throw range from its projectile, its summons and techniques from
its `actions`, nothing hard-coded for #0001; a reserved button is never
pressed; a summon or technique only when it is ready and likely to land),
and **acts** over as many steps as needed (turn then strike, turn then
press Attack 4 for a Sphere Rush, tap-release-tap to Dash). Something new
the opponent does is only answered after a reaction delay sampled from the
level (or missed on a lapse), and prediction is limited to projecting
current motion a short, level-set horizon ahead. It never walks off the main
floor, follows the opponent up platforms and down by walking off their edges
(the platform drop is the training CPU's alone), and stands still while its
opponent is out in the Void. Its randomness is an injected seeded RNG, so
tests are deterministic.

### Watch Mode

**Home → Watch Mode** is Alva's CPU-vs-CPU spectator mode: Home → Watch
Mode → Select Difficulty → Select CPU 1 → Select CPU 2 → Select Stage →
CPU vs CPU Battle. Its four setup steps (Difficulty, CPU 1, CPU 2, Stage)
show in the header's progress steps under the kicker "Watch Mode", and Back
retraces them to Home, landing on each choice.

- **Spectator only.** Both fighters are `CombatAIController`s, one each, and
  nobody controls either: no gameplay input is read and the touch controls
  are hidden, in either Mobile Controls layout. Pause (`Esc`, `P`, gamepad Start or the HUD's pause button),
  Resume, Restart Battle, Rematch, Change Stage and Return to Home work as in
  Quick Battle.
- **One difficulty for both.** The chosen level (Easy, Medium, Hard or
  Brutal) drives both CPUs. As in Quick Battle, it changes only how they
  decide, never their fighters or the rules.
- **Any two fighters.** CPU 1 and CPU 2 each pick from the shared roster,
  and may be different fighters or the same one. A mirror match loads its
  fighter once.
- **The normal battle.** It is the real `Battle` (`mode: 'watch'`), so the
  5-minute timer, first to 3 points, Void scoring and respawns, Launch
  Point, Energy, Shields, the Clone Attack and the Sphere Rush, clones, projectiles, stage
  physics, camera, hit effects and result rules are all unchanged. The HUD
  and the results name the sides **CPU 1** and **CPU 2** ("CPU 1 Wins",
  "CPU 2 fell into the Void for the final point.").
- **Its own choices.** Watch Mode keeps them in `app.selection.watch`
  (difficulty, `cpu1CharacterId`, `cpu2CharacterId`, stage), apart from
  Quick Battle's, so neither setup changes the other's.
- **Two random streams.** Each CPU draws from its own seeded RNG, both
  derived from the battle's seed (`deriveSeed` in `js/core/utils.js`), so a
  seeded match is reproducible while the two CPUs never make the same random
  choices, even in a mirror match. Unseeded, every match differs.

### Practice Ground

**Home → Practice Ground** starts at once with the default fighter (the
first playable one, `practiceDefaultFighter` in
`js/screens/practice-screen.js`) and a practice CPU of the same fighter,
sharing its one loaded sprite set, on the training stage: no fighter or
stage select, countdown, timer, points or result. It runs until you choose
Return. With no playable fighter Home keeps it closed, and reached
any other way it starts nothing: it loads no fighter and says a fighter is
unavailable, with Back to Home.

- **Your fighter and the practice CPU.** `PracticeSession`
  (`js/game/practice.js`) and Quick Battle's `Battle` both extend `Arena`
  (`js/game/arena.js`), which owns the fixed-step world, the camera and all
  Canvas drawing. The practice session holds your fighter and the practice
  CPU, paired and framed together from the start. With the CPU disabled,
  moves aimed at an opponent fall back or miss: attack3 has nobody to
  appear behind, so it is an ordinary attack1 (no cooldown started); the Sphere
  Rush dashes, finds no one, releases on `attack4_12` and ends (its cooldown
  spent).
- **Stage.** `PRACTICE_MAP` (`js/data/practice-map.js`) is deliberately not
  in `MAPS`, which feeds Select Stage. `js/stages/practice-theme.js` draws the
  room as one square grid in one-point perspective: a back wall, and a
  compact training block with open edges (its top, its outer side past
  either ledge, a ruler along its front edge). A fighter that falls into the
  Void is out of play for 2 seconds, then back at its own spawn in a fresh
  training state: 0 Launch Point, full Energy, both A3 / A4 cooldowns ready and
  nothing transient left, with nothing keeping hold of or aiming at it. You
  and the CPU each wait out your own 2 seconds; no point is scored and
  practice goes on.
- **More menu.** The three-dots button, top centre where Quick Battle's
  timer sits (or `Esc` / `P` / Start), freezes practice under a light glass
  menu with **Change Fighter**, **Change CPU** (**Enable CPU** once you have
  disabled it) and **Return**. Press More, `Esc` or `P` again (or tap the dim) to carry
  on.
- **Change Fighter** opens the full roster as a large glass dialog over the
  paused stage. It is the same roster component as Select Fighter
  (`js/ui/fighter-roster.js`). Confirming swaps the fighter in place at the
  spawn with 0 Launch Point and no cooldowns and resumes; `Esc` / Back returns to the
  menu. Practice keeps its own fighter: Quick Battle's selection never
  changes, and every new visit starts with the default fighter again.
- **Practice CPU.** Change CPU opens a second copy of the roster dialog
  (Change CPU, or Select CPU once it is disabled). Confirming loads that
  fighter and puts it 320 units to your right, facing you, labelled CPU, and
  resumes; the camera frames you both.
  It is a training dummy with no controller: it never moves, jumps, attacks
  or defends, but it takes real hits, hitstun, launches and binds,
  so clones, shurikens, attack1 / attack2 and the Sphere Rush all land on it. Its
  Launch Point builds up (and launching hits send it further) like anyone's.
  Each hit floats the Launch Point it added (`+3`, `+1` for each Sphere Rush tick, `+10`
  for the blast) in red over its head for under a second, straight from the
  combat system's resolved hit. Change CPU swaps it for
  another fighter; **Disable CPU**, beside Back in that dialog, removes it
  (and its card) and returns you to the paused menu. Changing your own
  fighter keeps the CPU. Its own HUD card, on the right, shows its portrait,
  name and Launch Point, rebound whenever it changes.
- Every new visit starts with the default fighter and CPU again, at 0 Launch
  Point, whatever the last visit changed or disabled.

### Powers

Powers are fighter abilities owned at one of three tiers: Jump Power and Speed Power. `js/data/powers.js` holds each Power's frozen tier table (tier number, name, description and gameplay value) in the one `POWERS` registry, their single source of truth: a fighter declares one tier of each (`powers: { jump: 2, speed: 2 }`), `Fighter` resolves them once (`getJumpVelocity`, `getMaxSpeed`) and the Discover screen reads the names and descriptions.

Values are in world units per second, at the global gravity of 2500:

| Power | Tier 1 | Tier 2 | Tier 3 | Controls |
| --- | --- | --- | --- | --- |
| Jump Power | 650 | 920 | 1000 | the initial upward speed of the normal jump |
| Speed Power | 270 | 330 | 360 | the top speed of normal left / right movement, on the ground and in the air |

- #0001 declares `powers: { jump: 2, speed: 2 }`: exactly the 920 jump and 330 top speed it always had, so it moves and jumps identically. Movement has no raw `jumpVelocity` or `maxSpeed`: the tiers are the only sources.
- Speed Power only sets the normal top speed. Acceleration, deceleration, the turn boost, air control, gravity, falling, the jump, launches, projectiles (the shuriken's 700), the Shield (which only slows a fighter) and techniques (the Sphere Rush's 1050 dash) never depend on it, and neither Power changes the launch a fighter deals or takes.
- A declared tier the table lacks (or a fighter with no tier of a Power) is logged and gets tier 2.
- To add another Power, add its tier table and an entry to `POWERS`; Discover lists it with no screen changes. The tiers are not upgradeable or selectable in game.

### Launch

Every fighter has a **Launch Point** that starts at 0 and increases by damage received. Every hit declares a **Base Launch** of 0, 1, 2 or 3 and a **Directional Launch**. After a hit's damage is added, its launch strength is:

```
launch strength = Base Launch × the target's new Launch Point
```

Base Launch 0 therefore never launches, while 1 uses normal Launch Point strength, 2 doubles it and 3 triples it. That multiplication is the whole strength calculation: no base velocity is added and horizontal and vertical launches use the same strength. Directional Launch only decides where the strength goes. The strength then becomes a speed through one conversion, `LAUNCH_UNIT_SPEED`: 10 world units per second per point, the same for every hit and direction, so a strength of 120 launches at 1200 units/s. Without it launches were on the damage scale, far below the world's (gravity 2500, a jump 920), and nothing visibly moved until very high Launch Points. The source of truth is `js/data/launch.js`.

- **Launch Point** (`combat.launchPoint`, the number on each HUD card) starts at 0 on every fresh life, grows by exactly the damage received (a Shielded hit adds nothing), never goes below 0 and has no maximum. It never defeats a fighter by itself, and it resets to 0 when the fighter respawns from the Void, in a Practice reset and at every round or rematch. On time in Quick Battle, level on points, the lower Launch Point wins.
- **Base Launch** (`baseLaunch`) is a multiplier, never a velocity. `BASE_LAUNCH_VALUES` holds the only legal values, `[0, 1, 2, 3]`. At 120 Launch Point: 0 → 0, 1 → 120, 2 → 240, 3 → 360.
- **Directional Launch** (`directionalLaunch`) is one of `null` (no launch at all, whatever the Base Launch), `'horizontal'` (along the hit's travel: the attacker's facing for melee, the projectile's direction, the clone's facing or the technique's captured facing), `'vertical'` (upward: `vy = −strength × 10`, as world y grows downward) or `'reverseVertical'` (downward: `vy = +strength × 10`). It never changes the magnitude, and it is never encoded as a negative Base Launch.
- **Order.** `CombatSystem.applyHit` adds the hit's damage to the target's Launch Point first, then computes `baseLaunch × launchPoint` (`resolveLaunchStrength`) and turns it into a velocity along the direction at `LAUNCH_UNIT_SPEED` per point (`resolveDirectionalLaunch`). A hit that launches replaces the target's sideways speed (a vertical one sends it straight up or down) and, when it has one, its vertical speed; a hit that does not launch leaves the target's velocity alone.
- **Shield.** A hit that a raised Shield blocks is the one exception: it adds no Launch Point and launches nothing (its launch strength is 0, whatever its Base Launch and direction). The Shield pays 25 Energy for it instead. There is no chip damage and no halved launch.
- **Validation.** `resolveHitLaunch` validates both fields once, when a hit's definition is built (`createAttackDefinition`, `createProjectileDefinition`, `createTechniqueDefinition`). A hit that declares neither has Base Launch 0 and no direction. Any Base Launch other than 0-3 (0.5, 4, −1 ...) is logged and becomes 0; an unknown direction is logged and becomes `null`; a nonzero Base Launch with no direction is logged and never launches. Neither field is ever derived from the damage, the hitbox or the other field.
- **Events.** Each resolved hit records `damage`, `launchPointBefore`, `launchPointAfter`, `baseLaunch` (0-3), `directionalLaunch`, `launchStrength` (`baseLaunch × launchPointAfter`) and `finalLaunch` (the world-space `{ x, y }` velocity given), plus `energyCost` (25 on a Shield block, 0 on a hit).

Melee, projectiles, summoned clones and techniques all resolve through that one path; `applyHit` never checks which fighter, attack or technique it is resolving.

#0001's hits:

| Hit | Damage | Base Launch | Directional Launch |
| --- | --- | --- | --- |
| attack1 (ground punch) | 3 | 1 | horizontal |
| attack2 (ground spinning kick) | 5 | 2 | vertical |
| midair_attack1 (kunai slash) | 3 | 2 | vertical |
| midair_attack2 (airborne kick) | 5 | 2 | reverse vertical |
| Shuriken | 1 | 0 | none |
| Sphere Rush contact | 0 | 0 | none |
| Sphere Rush tick (on the contact step, then every 0.5 s while held) | 1 | 0 | none |
| Sphere Rush explosion | 10 | 3 | horizontal |

So from 117, attack1 adds 3 (120) and pushes at a strength of 120 (1200 units/s); from 115, attack2 adds 5 (120) and launches upward at 240 (2400 units/s), and midair_attack2 drives downward at 240; from 117, midair_attack1 launches upward at 240; from 119, a shuriken or a Sphere Rush tick adds 1 (120) and launches at 0 × 120 = 0; from 110, the Sphere Rush explosion adds 10 (120) and launches sideways at 360 (3600 units/s); a whole Sphere Rush on a fresh target adds 4 × 1 + 10 = 14 and launches it at 3 × 14 = 42. On a fresh target an attack2 is 2 × 5 = 10, a 100 units/s hop; an attack2 that leaves the target at 30 Launch Point lifts it about 70 units, and at 60 about 280. The Clone Attack performs ground attack1's own definition (or midair_attack2's, overhead), so it inherits that hit's damage, Base Launch and Directional Launch with nothing of its own.

#### Launch bounce

A launch that drives its fighter hard into stage geometry **rebounds** off it instead of stopping dead, and can ricochet on to the next surface: hit → fly → wall → rebound → chase. It never changes a launch's strength; only the velocity the launch leaves the fighter with can rebound, so the Launch Point decides it by itself. The runtime and every tuning value live in `js/game/launch-bounce.js` (`LAUNCH_BOUNCE`; a character may override any of them with its own `launchBounce`).

- **Only launches.** Physics (`stepBody`) still stops a body at whatever it meets and never bounces anything; it reports the speed each contact stopped (`impactVx`, `impactVy`). A launching hit starts a launch sequence on the fighter, and only then can a stop become a rebound. Walking into a wall, jumping into a ceiling and landing are unchanged, and so is falling back down after an upward or sideways launch: a surface only rebounds a fighter the launch is carrying into it (a spike into the floor, say), never one gravity brought there.
- **Threshold and restitution.** A contact rebounds at 500 units/s or more into the surface (only what crosses it counts, so glancing contacts don't); slower is an ordinary stop. The speed comes back reversed × 0.72 off a wall, 0.6 off a floor or platform top, 0.65 off a ceiling, and what ran along the surface is kept, so diagonal impacts ricochet. Corners rebound on both axes at once. Every rebound is weaker, so a ricochet dies away: attack1 rebounds its target off a wall right behind it from about 50 Launch Point, a midair_attack2 spike off the floor from about 25 (once, then it lands), and a big launch between two walls ricochets two or three times.
- **Geometry only.** Solids (Desert's rock outcrops, City's bulkhead) and the main floor's cliff faces rebound; one-way platforms only from above; the Void never (it is not geometry), and there are still no side walls.
- **Stun and freeze.** A rebound keeps its fighter stunned at least 0.2 s, and a hard one (1200 units/s or more) freezes it at the surface for 0.05 s first: fly, impact, pause, rebound.
- **No wall loops.** A rebounding fighter can be hit like any other (a new launch replaces its velocity), but its rebounds count on until it recovers, at most 5, and it flies through the attacker's pushbox instead of being pinned in reach, so punching someone into a wall over and over ends within a few hits.
- **Every launch.** Clones' hits and the Sphere Rush explosion rebound like any launch (the blast into a rock ricochets back across the mesa); a Shield's block and the shuriken never launch, so they never rebound.

#0001's two mid-air attacks: **midair_attack1** is the three-frame kunai slash (`0001_midair_attack1_1`–`3`) and **midair_attack2** the five-frame airborne kick (`0001_midair_attack2_1`–`5`), each with its own art, timing, hitbox, damage and stun, and each file named after the button that makes it.

### #0002, the speedster

#0002 is fast (Speed Power 3, quick off the mark, a 1100 units/s Dash) and
has three numbered attacks, each an ordinary attack on a button of its own
with a mid-air version, and an extra attack. Every move is a
mechanic of its own, built on generic engine features any fighter can use
(see [Adding a fighter](#adding-a-fighter)):

| Button | On the ground | In the air |
| --- | --- | --- |
| `attack1` (U) | **One-Two**: two strikes in one press, the jab holding the target for the straight, which pushes it away | **Homing Attack**: a lock-on dash. It hangs for 0.15 s, then dashes at 1000 units/s at its opponent (within 240 units and not behind it), re-aimed every step; with nobody there it dashes straight ahead. A hit pops the target up and #0002 springs off it with its air jump back. Once per airtime |
| `attack2` (I) | **Rapid Kicks**: after a 0.2 s wind-up, three kicks hold the target in place and a fourth flings it away sideways. A Shield stops the flurry at the kick it blocks | **Bounce Attack**: it plunges at 1300 units/s until it meets the ground or an opponent (which it spikes downward), and bounces back up about a jump's height, the attack over so it can bounce again. Twice per airtime |
| `attack3` (O) | **Spin Attack**: it curls up (0.17 s), then rolls at 400 units/s plus 0.8 of the running speed it had, as a smaller target (the ball's hurtbox), rolling on through the opponent it bowls over. A Shield stops it dead and sends it back | **Blue Tornado**: spun into a tornado it rises about 175 units, carrying its target up with it, then flings it upward. Once per airtime, and it leaves #0002 in free fall (no attack or air jump until it lands) |
| `extra_attack` (J) | **Whirlwind**: it spins up a whirlwind and sends it off as a slow tornado (260 units/s) that catches its target, dragging and lifting it through four strikes, then flings it upward on the fifth. A long cooldown (1.4 s) | — |

Its Homing Attack, Bounce Attack and Blue Tornado never start while it is
still flying from a launch: it has to recover first (an air jump, a fast
fall or landing), so none of them can cancel a launch that carries it
away. Its Shield is the guard on the ground only.

#0002's hits:

| Hit | Damage | Base Launch | Directional Launch |
| --- | --- | --- | --- |
| One-Two jab, then straight | 1, 2 | 0, 1 | none, horizontal |
| Rapid Kicks (three kicks, then the finisher) | 1 each, 3 | 0, 2 | none, horizontal |
| Homing Attack | 2 | 1 | vertical |
| Bounce Attack | 2 | 2 | reverse vertical |
| Spin Attack | 2 | 1 | horizontal |
| Blue Tornado (three strikes, then the finisher) | 1 each, 2 | 0, 2 | none (carried along), vertical |
| Whirlwind tornado (four strikes, then the finisher) | 1 each, 2 | 0, 2 | none (carried along), vertical |

Its tuning came out of seeded CPU-vs-CPU fights against #0001 (120
one-minute fights per level on Desert): at Hard and Brutal the two fall
into the Void about as often as each other, while at Easy and Medium
#0002's CPU still wins more (its speed and air game are harder for a slower
CPU to answer).

### Discover

**Home → Discover** opens the reference, a character-neutral explanation of Alva's mechanics. **POWER** (open by default) explains Jump Power and Speed Power, each with its three tiers. **LAUNCH** explains the launch system generically, straight from `js/data/launch.js`: Launch Point, the four Base Launch values (0 no launch, 1 normal, 2 double, 3 triple, each marked with its own number) with the formula `Launch strength = Base Launch × Launch Point`, and the four Directional Launches (none, horizontal, vertical, reverse vertical). Neither page says which fighter or attack uses a Power, tier, Base Launch or direction, and neither shows tuning numbers. **PASSIVES** is intentionally empty until Alva has passives. Arrow keys, the D-pad or the stick move between Back, the sections and the page (↑ / ↓ scroll a long page); Back, `Esc` or gamepad B returns Home.

### Roster status

There are **two selectable fighters**: #0001 in roster slot 01 and #0002 in
slot 02, each fully implemented (every sprite in its own
`assets/characters/<id>/`, its animations, attacks, Shield, Dash, projectile
and effect art, tuning, body, ability names, credits and the engine tests of
its combat) and playable, its definition saying `available: true`. Both are
preloaded at startup, and #0001, the first playable one, is Quick Battle's
initial pick, both Watch Mode CPUs and the Practice Ground default.
Disabling either is only setting that to `false`: every file of it stays.

A definition existing is not the same as it being playable.
`getCharacter(id)` finds any definition, so the engine and its tests build
fighters from it directly; `isPlayable(def)`, `getPlayableCharacter(id)` and
`playableCharacters()` (all in `js/data/characters.js`) answer whether one may
be picked or started, and every route that selects, preloads or starts a
fighter goes through them:

- **Startup** names the first playable fighter for Quick Battle and both
  Watch Mode CPUs, and preloads only playable ones (`initialSelection` and
  `App.preloadFighters` in `js/core/app.js`); `App.loadCharacter` loads
  nothing for a fighter that is not playable. With none playable, the
  selections start as `null` and nothing is preloaded.
- **Home** disables Play, Watch Mode and Practice Ground while no fighter
  is playable (see Home above).
- **The roster** shows a fighter that is not playable locked, like an empty
  slot: not focusable, selectable or confirmable, and no portrait or preview
  loads. With no playable fighter at all nothing is selected, Confirm stays
  disabled, labelled "No fighters available", and Select Fighter and Watch
  Mode's CPU screens focus Back.
- **Battle** refuses to start with a fighter that is not playable, whether
  it comes from a stale selection or straight from the route's parameters
  (a disabled fighter, a removed fighter's id, `null` or an unknown id), in
  Quick Battle and on either side of Watch Mode: it loads nothing and shows
  the loading overlay's "Fighter unavailable" error, with Back to Home.
- **Practice Ground** does the same with no playable fighter, and never
  swaps a fighter or CPU that is not playable.

New fighters are added through the same generic definitions (see below).
`tests/empty-roster.test.mjs` disables both for its own run to check that
every route stays closed with no playable fighter, and reopens with one.

### Adding a fighter

1. Put the frames in `assets/characters/<id>/`, each named `<id>_<codename>_<frame>.png` with the universal codename, never the move's name in game: `0027_idle_1.png`, `0027_attack2_3.png`, `0027_midair_attack2_1.png`, `0027_extra_attack_1.png`, and for whatever an attack creates `0027_attack4_object_3.png`. The last part is always the frame, `_1` even for a single frame, and every frame is numbered. List them with `frames(id, codename, count, from)` / `framePath(id, codename, frame)` from the same file.
2. Add a definition to `CHARACTERS` in `js/data/characters.js`, its moves keyed by the universal move codenames (see [Controls](#controls)) whatever it calls them in game, following the [attack loadout](#attack-loadouts) rules: `attack1` and `attack2`, up to `attack5`, every one a button of its own, each ordinary one with its `midair_attackN`, and `attack3` to `attack5` optionally a summon or a technique. A definition that breaks a rule is refused as the module loads, with every problem named. Also its animations, movement, Power tiers such as `powers: { jump: 2, speed: 2 }`, collider and hurtboxes. Movement is ground `acceleration` / `deceleration` / `turnBoost` / `overspeedDeceleration`, air `airAcceleration` / `airDeceleration` / `airTurnBoost`, `gravityScale`, `maxFallSpeed`, `fastFallAcceleration` / `fastFallSpeed`, `coyoteTime`, `jumpBuffer`, `highJumpWindow` / `highJumpHeight`, `airJumps` / `airJumpRatio`, `attackBuffer`, `hitstunFriction` / `hitstunAirDrag` and the Dash's two; the newer fields are optional (see `Fighter.moveHorizontal`). How it responds to launches is `launchReaction` (`stunPerThousand`, `maxStun`, `tumbleSpeed`, `steerAngle`; see `resolveLaunchReaction` in `js/game/combat.js`), and a Shield's `perfectWindow` / `perfectRearm` set its perfect block and `slowFallSpeed` / `slowFallBrake` its slow fall in the air.
3. Give it a free `rosterSlot`.
4. Set `available: true` once it is ready to be played (see [Roster status](#roster-status)).
5. Optionally, name its moves in `abilityNames`, keyed by move codename (e.g. `attack4: 'Sphere Rush'`); a move it leaves out keeps its neutral name.

A move can be more than a timed hitbox; each of these is data on the attack (see the schema in `js/game/combat.js`), and #0002 uses them all:

- **`hits`**: a multi-hit attack lists its strikes, each live in its own window (`at`, `active`) with its own damage and launch, its box and stuns defaulting to the attack's. The attack's startup, active phase, overall box, damage and finisher follow from them. A Shield that blocks a strike stops the string.
- **`motion`**: movement the attack makes itself: `homing` (a lock-on dash that springs off what it meets), `bounce` (a plunge that rebounds off the ground or an opponent, ending the attack), `rise` (a lift) or `roll` (a ground roll that carries the running speed). A motion attack never turns, and never starts while its fighter is still flying from a launch.
- **`carry: { lift }`**: a hit that lands and launches nothing gives its target the velocity of what struck it, less `lift` upward.
- **`airUses`**: how many times it may start per airtime (landing or being hit gives them back); **`freeFall: true`**: started in the air, it leaves the fighter in free fall until it lands or is hit.
- **`passThrough: true`**: no pushbox while it plays; **`hurtboxes`**: the fighter's own replaced while it plays.

A projectile may pierce (`pierce: { hits, interval }`), striking again every `interval` until its last strike, its `finisher`, and it may `carry` too. A clip whose art reaches below the feet (a kick's trails under the standing foot) places the feet with `anchorY`, art pixels down from the top of each frame, beside `anchorX`.

A fighter whose art arrives before its attributes can still be added: give an attack whose art is in `pending: true` (art only: one pass of the clip, no hit; declaring combat fields on one is refused), leave out of `actions` any button it does not have (its touch button is hidden and the CPU never presses it), and keep `null` for a `transform` still to come (reserved, dashed). Its `attack1` and `attack2` (each with its mid-air version) are always required. Its `powers` and `movement`, which the engine cannot build a fighter without, are still its own. A clip whose art misleads the automatic anchor (effects drawn beside the body, or swinging limbs that nudge it from frame to frame) can place each frame's anchor itself with `anchorX`, and `visual.portrait.centerX` centres a portrait crop by hand.

The tests already run a second, made-up fighter (`tests/sample-fighter.mjs`, never in the game) with different moves on the same codenames: a melee `extra_attack` usable in the air, a real `transform`, three numbered attacks (`attack3` a summon on its own button, performing its `attack2`), no Shield. The loadout matrix (`tests/loadout-fighters.mjs`, `tests/loadout.test.mjs`) builds one fighter for each row of the [attack loadouts](#attack-loadouts) table and checks its buttons, each button's move, mid-air versions, input buffer, touch slots and CPU, plus every rule broken on purpose. It goes through combat, the CPU, the touch buttons and the codename checks (`tests/sample-fighter.test.mjs`), so anything that only works for #0001 shows up there first. A new character is checked against the same codename rules automatically. The screen tests that need more than one fighter to pick (the roster, Quick Battle, Watch Mode, Practice Ground) register test-only ones from `tests/test-fighters.mjs` beside #0001 (#0001's definition under neutral ids, and a disabled one, taken out again after each run).

To add attacks, create animations with real frames, define them in `attacks` under their universal codenames (`attack1` … `attack5`, `midair_attack1` … `midair_attack5`, `extra_attack`; see the schema in `js/game/combat.js`), give each its `damage`, `baseLaunch` and `directionalLaunch`, optionally how it moves (`momentum` / `airMomentum`, `control` / `airControl`, `friction`, a `step`) and when a hit opens a follow-up (`hitCancel`), and map them in `actions`: every numbered button is `{ ground: 'attackN', air: 'midair_attackN' }`, picked by whether the fighter is grounded (as #0001's `attack1: { ground: 'attack1', air: 'midair_attack1' }` and `attack2: { ground: 'attack2', air: 'midair_attack2' }`), `extra_attack: 'extra_attack'` is one attack, and `transform: null` is reserved. A projectile an attack throws is named after it (`projectiles.extra_attack_object`, thrown by `extra_attack`), and so is its art. Time `startup` / `active` / `recovery` to whole frames of the clip so the hitbox is live only while the strike is on screen. An attack without frames is refused rather than faked. Base Launch and Directional Launch are declared separately from damage (see [Launch](#launch)):

```js
attacks: {
  attack1: {
    animation: 'attack1', startup: 1 / 12, active: 1 / 12, recovery: 2 / 12, damage: 6,
    hitbox: { x: 12, y: -64, w: 28, h: 16 },
    baseLaunch: 1,                   // 1 x the target's new Launch Point
    directionalLaunch: 'horizontal', // along the hit's facing
    hitstun: 0.3, blockstun: 0.14, hitstop: 0.05,
    momentum: 0.75, friction: 0.4,   // keeps most of a run and slides on it
    hitCancel: 1 / 12,               // once it hits, an attack, a jump or a Dash may cut it short from here
  },
  midair_attack2: {
    animation: 'midair_attack2', startup: 2 / 12, active: 1 / 12, recovery: 0, damage: 8,
    hitbox: { x: 14, y: -100, w: 22, h: 80 },
    baseLaunch: 2,                        // twice the target's new Launch Point
    directionalLaunch: 'reverseVertical', // drives the opponent downward
    hitstun: 0.24, blockstun: 0.15, hitstop: 0.07,
    airMomentum: 1, airControl: 0.4,      // keeps its drift, steers with 40% of the air control
  },
},
```

To make one of `attack3` to `attack5` a summon or a technique, give its button a typed descriptor keyed by that same attack (`{ type, id }` with `id` the button itself) instead of `{ ground, air }`; `Fighter.tryAction` sees the type and hands the press to `Fighter.trySpecial`:

- `{ type: 'summon', id }` names an entry in `summons` (see the schema in `js/game/clone.js`), as #0001's `attack3: { type: 'summon', id: 'attack3' }` (the Clone Attack) does. It starts the summon's `cooldown` and spawns a detached clone that performs one of the fighter's own `attacks` through an `effectAnimations` cloud named after it (`attack3_object`); the fighter itself is free at once. An optional `noGround: { attack, offset }` names another of its attacks, and where to appear relative to the opponent, for when there is no ground behind the opponent at its foot height.
- `{ type: 'technique', id }` names an entry in `techniques` (see the schema and phases in `js/game/technique.js`), as #0001's `attack4: { type: 'technique', id: 'attack4' }` (the Sphere Rush) does. The fighter itself performs it, facing the direction held as it is pressed: fighter clips from `animations` for its form / dash / confirm / explosion / release phases and its whiff release (`attack4_form` … `attack4_whiff_release`), an effect from `effectAnimations` for each stage of the sphere (`attack4_object_build`, `_impact`, `_explosion`), a dash speed, hand offsets per frame, a sphere hitbox, a delay, the sphere's growth on the target and the data for its hits (the contact, an optional `tickHit` every `tickInterval` while the target is held, and the explosion). Its `cooldown` starts when it starts.

Either is ground-only, starts only while the fighter is free to act, costs no Energy and needs no mid-air version. While it is cooling down, in the air, or when it cannot happen (no opponent for a summon, missing art or invalid data, logged), the press does nothing at all: no other attack in its place, no cooldown started, nothing kept for later. The cooldown is keyed by the attack itself (`attack3`, `attack4`), recovers in real time and shows under the fighter as **A3** / **A4**.

To choose how a fighter defends, give it a `defense` entry. The one type so far is `{ type: 'shield', groundAnimation, airAnimation, groundStartAnimation, groundReleaseAnimation }`, optionally with `slowFallSpeed` / `slowFallBrake` for a slow fall while it is up in the air (like #0001's `shielding`, `midair_shielding`, `prepshield` and `releaseshield`): a held, full-circle Shield (see Shield above). The held clips are required: without the one for where the fighter is, the Shield is refused (and logged once), never faked; the raise and lower poses are optional. The type is checked, so a future fighter can defend another way on the same Shield button (`shield`); an unknown type is an error.

Energy and the Dash are data too. An `energy` entry (`{ max, regen, dashCost, dashCancelCost, shieldHitCost }`, see `resolveEnergy` in `js/game/combat.js`) sets the fighter's resource; every field is optional and defaults to 100, 12 / s (its one passive refill rate), 15, the fighter's `dashCost` and 25 (#0001 sets `dashCancelCost` to 40). A Shield pays `shieldHitCost` for each hit it blocks. A cost larger than what is left is still paid by taking the rest, which exhausts the fighter; neither a Dash nor a Shield works while it is exhausted. To give a fighter a Dash, add a `mouvment` clip to `animations` (its frames `<id>_mouvment_1.png`, …) and `movement.dashSpeed` / `movement.dashTapWindow`: the Dash lasts one pass of the clip and pays `dashCost`. Without the clip (or a `dashSpeed`) it never dashes: a Dash without frames is refused and logged, never faked with the run.

### Adding a map

Add an entry to `MAPS` in `js/data/maps.js` (size, ground, bounds, spawns, platforms, solids), then register a theme renderer in `js/stages/index.js`. Every `MAPS` entry becomes a stage on Quick Battle's and Watch Mode's Select Stage; the Practice Ground stage lives apart in `js/data/practice-map.js`.

## Credits

**ALVA**, created by hiyroscript.

**Original work.** Game design, code, interface, ALVA wordmark, and Desert / City
stage artwork by hiyroscript.

**#0001 sprite source.** Original sprite material from:

- *Jump Ultimate Stars*
- The Spriters Resource. Source sheet uploaded by Dazz, contributor FRET.

**#0002 sprite source.** Sprite sheet by thespriteanimations on
[DeviantArt](https://www.deviantart.com/thespriteanimations/art/Sprite-Sheet-1350194762).

**Rights.** hiyroscript did not create or claim ownership of the original
third-party character/game artwork. Original characters, games, and related
properties belong to their respective rights holders.

**Project.** Unofficial fan project. No affiliation or endorsement is implied.

The in-game credits (the Home credits roll) render from one list in
`js/ui/credits.js`; a line there may link to its source (opening in a new
tab). There is no in-game Help screen; this README and
[`ALVA_SPEC.md`](./ALVA_SPEC.md) document the controls. The game ships with
no audio.
