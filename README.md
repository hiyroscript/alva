# Alva

A 2D sprite fighting game for the browser by **hiyroscript**. Pure HTML, CSS and
JavaScript with Canvas 2D: no frameworks, no build step, no WebGL or 3D engine
(the stages' depth is pseudo-3D perspective drawn in Canvas 2D). It runs on
desktop and on phones and tablets in landscape.

This is the first playable foundation: full menu flow, a 48-slot roster, two
compact platform-fighter stages with open ledges and a Void kill boundary, a
Practice Ground training room, a Discover reference screen,
movement and platform physics, a tiered Power system (Jump Power and Speed
Power), a camera, a HUD, touch controls,
and a data-driven combat system built on Launch Point, Base Launch and
Directional Launch, with #0001's two real attacks, Basic Attack 1
(BA1) and Basic Attack 2 (BA2), a held ground and mid-air Shield on the
shared Defense input, a Dash on a double tap, a 100-point Energy bar that a
Dash and every Shielded hit spend, a held Charge
stance, a Charged BA1 Clone Attack (CAB1) and a
Charged BA2 Sphere Rush (CAB2), each on its own cooldown, and
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

| Action | Keyboard | Touch (landscape) |
| --- | --- | --- |
| Move left / right | `A` `D` or `←` `→` | Lower-left ◀ ▶ |
| Dash | Double-tap `A` / `D` or `←` / `→` | Double-tap ◀ or ▶ |
| Charge (in the air: fast fall) | `S` or `↓` | Lower-left **C** |
| Jump (tap: short hop; hold: full; again in the air: air jump) | `W`, `Space` or `↑` | Lower-right, bottom corner |
| Throw | `J` | Lower-right, top (**T**) |
| Special* | `K` | Lower-right, middle row |
| Defense | `L` | Lower-right, middle row (**D**) |
| Basic Attack 1 (BA1) | `U` | Lower-right, bottom row (**BA1**) |
| Basic Attack 2 (BA2) | `I` | Lower-right, bottom row (**BA2**) |
| Pause | `Esc` or `P` | Timer or pause button, top centre |
| Practice menu (Practice Ground) | `Esc` or `P` | Three-dots button, top centre |

\* Reserved: wired into input and combat, but inactive until #0001 has matching
attack animations. Its touch button has a dashed outline.

- **Movement and combos:** #0001 starts, stops and turns quickly (top
  speed in about 0.1 s, a short stop, a full turn in about 0.14 s) and
  steers well in the air, where steering bends the drift rather than
  replacing it. A running jump carries its speed. Holding Charge (`S` /
  `↓`, **C**) in the air while falling is a **fast fall**. Attacks keep
  some of the speed you carry into them: a running punch slides on, the
  kick steps in, aerials keep their drift and can be steered, and the
  Throw can back off as it throws. Press your next attack slightly early
  and it is **buffered** (0.12 s): it comes out on the first step it can,
  including right after the Shield is let go or a Dash ends; presses made
  during a hit's freeze are kept too. An attack that **hits** (a block
  does not count) can be cut short by another attack or a jump from its
  strike on, so the intended follow-ups arrive while the opponent is still
  stunned: BA1 → BA2, BA1 → BA1 up close, BA2 → jump → mid-air BA1, mid-air
  BA2 → land → BA1. A whiffed or blocked attack keeps its whole recovery.
  Nothing caps a combo but the Launch Point: the higher it is, the further
  each hit sends the opponent, so the same routes stop working and the
  fight turns into pursuit and ring-outs. An attack faces the direction
  you hold as it starts, and a hit interrupts the attack the opponent was
  making.
- **Jumps, launches and the Shield:** tap Jump for a **short hop** (about a
  third of the height, low enough to hit a standing opponent with a rising
  mid-air BA1), hold it for the full jump, and press it again in the air
  for one **air jump** (a direction held changes course); landing or being
  hit gives it back. A harder launch **stuns longer** (0.2 s more per 1000
  units/s, at most 0.7 s more), and a hard one sets the fighter
  **tumbling** in its mid-air hurt pose until it acts or lands, so with the
  air jump a juggle can reach three hits around 30–40 Launch Point. Hold a
  direction as you are hit to **steer your launch** up to 15 degrees that
  way (never its strength). A launch that slams its fighter hard into a
  wall, the floor or a ceiling **rebounds** off it (see
  [Launch bounce](#launch-bounce)): chase the ricochet. Raise the Shield
  just before a hit lands for a **perfect Shield**: free and with no
  blockstun, so you can punish; it
  needs a fresh raise, so tapping Defense does not count.
- **Hit effects:** screen shake scaled to the hit, a one-frame white flash
  on the fighter hit, sparks where it landed (red rings for blocks, white
  for a perfect Shield), fading speed trails behind a tumbling fighter,
  sparks and a small shake where a launch rebounds off the stage, and a
  short slow-motion zoom on a launch that will carry its fighter into the
  Void. Presentation only (`js/game/hit-fx.js`): they never change a
  simulation step. Reduced motion drops the shake and the zoom.
- **Basic Attack 1 (BA1):** a punch on the ground, a kunai slash in the
  air. The same button picks the move from whether #0001 is grounded when
  you press it; a mid-air BA1 that lands keeps playing to the end. Both deal
  5 damage. The punch pushes the opponent away (Base Launch 1, horizontal);
  the mid-air slash launches it upward instead, with no sideways push (Base
  Launch 2, vertical). A Shielded slash does not launch. Internally this is
  the `action1` input.
- **Basic Attack 2 (BA2):** a slower, heavier spinning high kick on the
  ground, an airborne kick in the air. Both deal 10 damage. The ground kick
  launches the opponent upward (Base Launch 2, vertical); the mid-air kick
  drives it downward just as hard (Base Launch 2, reverse vertical), with no
  sideways push.
  A Shielded BA2 is neither launched nor driven down. It picks the move the
  same way, and a mid-air BA2 that lands also plays to the end. Internally
  this is the `action2` input.
- **Throw:** #0001's projectile attack, on `J`, X / Square on a gamepad and
  the **Shuriken** button on touch. One press plays one three-frame Throw
  (`throw1 → throw2 → throw3`, once, at 12 fps) and releases exactly one
  shuriken as the arm whips forward on `throw2`; holding the button does not
  throw again. The shuriken leaves the throwing hand and flies straight the
  way #0001 was facing at the release, spinning through its own three-frame
  loop (`shuriken1 → shuriken2 → shuriken3`, 18 fps). Turning, jumping or
  getting hit afterwards does not change its course. It hits once (1 damage,
  so +1 Launch Point, and a short hitstun, with Base Launch 0 and no
  Directional Launch: it neither pushes nor launches, however high the
  opponent's Launch Point) and disappears; it
  also vanishes after 1.5 s, in the Void or against a solid rock (the
  stage's own cliff face included); past a ledge it flies on over the open
  air.
  A Shield blocks it, and it is gone. Throw is ground-only for now because there
  are no mid-air Throw sprites: pressing it in the air does nothing. It has a
  0.25 s cooldown. Internally it is the `primary` input.
- **Defense:** the game's generic defensive input: `L`, RB / RT on a
  gamepad, **D** on touch. Different characters may implement Defense
  differently; the button stays the same. #0001 uses **Shield**: hold
  Defense to Shield. The Shield is up for as long as Defense is held
  (a held state, not a one-press move) and drops the moment it is let go.
  On the ground #0001 raises it on `prepshield` for one frame, holds
  `shielding`, and lowers it on `releaseblock` for one frame after (the
  lower pose is visual only: move, jump or attack straight away). In the
  air there is only the held pose, `midairshielding`: no raise or lower
  pose, and #0001 keeps falling under gravity, keeping his momentum but
  not steering. On the ground the Shield holds him in place: no walking,
  running, Dash or jump. While Defense is held no attack, Throw, charged
  move or Dash starts; let go of Defense first (an attack pressed
  meanwhile comes out as you let go). An attack already playing
  is never cut short: the Shield comes up the moment it ends. Holding
  Charge and Defense together shields. The Shield is a full circle: any
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
- **Dash:** press left or right twice in a row (the second press within
  0.22 s of the first, keyboard, touch, D-pad or left stick alike) while
  standing on the ground. #0001 bursts that way at about 2.7× its top speed
  (900 units / s) for one pass of its two-frame dash clip (`dash1 → dash2`,
  once, at 10 fps: 0.2 s, about 180 units), facing the Dash at once, then
  runs on from that speed if you keep holding the direction. It costs 15
  Energy (all that is left, emptying the bar, when there is less). It is movement only: no hitbox, damage, launch or
  invulnerability, and it still obeys the stage: a solid stops it, and
  running off a ledge ends it and #0001 falls. When it ends, the burst
  eases back into the run within a few steps if you hold the direction, or
  into a short slide if you let go; an attack pressed late in the Dash
  comes out as it ends. No Dash in the air, while
  attacking, shielding (or holding Defense), charging (or holding Charge),
  stunned, bound or already dashing; an attack or the Shield on the same
  step wins over it, and a double tap that cannot Dash is used up, never
  saved for later.
  Left then right (or right then left) is not a double tap.
- **Energy:** each fighter's one resource, 100 at most and at the start.
  It is spent only by a Dash (15, as it starts) and by the Shield (25 for
  every hit it blocks; holding it is free). It refills by itself at 12 per
  second whatever the fighter is doing (shielding included), and at 30 per
  second while it is in the Charge stance. It shows over the fighter's name
  tag only while below full, as one thin bright purple bar that shrinks
  from the right. A Dash or a block still happens with less Energy left than
  it costs, but then takes all of it. At 0, however it gets there, the
  fighter is exhausted: the bar turns gray and Shield and Dash stay locked
  until Energy is completely full again (a partial refill does not unlock
  them); the bar disappears at 100. Exhausted, a fighter still moves, jumps,
  attacks, charges and uses CAB1 / CAB2: nothing else ever costs Energy.
- **Charge:** hold `S` / `↓` (**C** on touch, D-pad down or left stick down
  on a gamepad) while #0001 is on the ground. Held, it plays
  `charge1 → charge2` once, then loops `chargea ↔ chargeb` for as long as you
  hold it. Charge must be held; it never toggles. Let go and #0001 shows
  `charge1` briefly as a release pose (one Charge frame, 0.1 s), then returns
  to its normal state; the next Charge starts from the beginning again.
  #0001 stays in place while charging. Charge has no hitbox, armour or
  invulnerability; what it does give, for as long as it is held, is faster
  recovery of the charged cooldowns (below) and a faster Energy refill
  (above), two separate benefits. The Shield, Jump, Throw or
  getting hit take over from it at once, without waiting for the release
  pose; so do BA1 and BA2 if you let go of Charge as you press them. Pressed
  while Charge is still held, BA1 is the Clone Attack and BA2 the Sphere Rush
  (below). It works on one-way platforms without dropping through them.
  There is no drop-through control: walk off an edge to come down. In the
  air, the same key is the fast fall, and a Charge held down from the air
  does not start on landing: let go and hold it again to charge.
- **Clone Attack (Charged BA1):** while already holding Charge, press BA1. A
  clone appears behind the opponent in a smoke cloud (`cloneav1 → … →
  cloneav10`, 20 fps), performs #0001's normal BA1, then vanishes through the
  cloud animation in reverse (`cloneav10 → … → cloneav1`). #0001 remains in
  Charge while the button stays held. Charged BA1 then cools down for 5 s
  (below), hit or miss; pressed while it is still cooling down it does
  nothing at all (no BA1 in its place). With no opponent to appear behind,
  the press is an ordinary BA1 and no cooldown starts.
  The clone appears on the opponent's back side, facing it, at the spot where
  the opponent stood when you pressed BA1; it never follows, so an opponent
  who moves away makes it miss. Its punch is BA1's (5 damage, same hitbox
  and hitstun, Base Launch 1 horizontal, pushing the opponent away from the
  clone), hits
  once, and a Shield blocks it like any attack. If
  there is no ground behind the opponent at its foot height (it stands at a
  platform's edge or a ledge with its back to the drop, or it is in the
  air), the clone
  appears over the opponent instead and performs #0001's Mid-air BA2 kick
  (10 damage, Base Launch 2 reverse vertical, driving the opponent
  downward); same cloud, same cooldown. The
  impact freezes the opponent and the clone, never #0001. The clone cannot be
  hit, blocks nobody and is not followed by the camera. Once summoned it
  finishes appearing, attacking and vanishing whatever #0001 does next.
  Pressing Charge and BA1 on the same step from standing is an ordinary BA1.
- **Sphere Rush (Charged BA2):** Hold Charge first, then press BA2. #0001
  forms a blue sphere, dashes forward once it is complete, and must connect
  during the rush. A miss stops him dead and he lets the sphere go on a
  brief release pose before he is free again. A hit traps the opponent in
  the spinning sphere, adding 1 Launch Point at once and then every half
  second, with no launch, while the sphere keeps growing, until it explodes
  two seconds later
  for 15 more and a sideways launch at Base Launch 3 (three times the
  opponent's new Launch Point); #0001 then recovers. The entire technique
  requires ground beneath #0001; losing ground cancels it and makes him
  fall. Starting it spends its 5-second cooldown, whether it then hits,
  misses, meets a wall or is interrupted.
  In detail: #0001 leaves Charge (no release pose) and stands still while
  the sphere forms in his rear palm (`rasen1 → rasen3`, holding `rasen3`,
  with `prasen1 → prasen6`, 0.5 s). Only then does he rush forward at a
  fixed speed for one pass of `rasen4 → rasen6` (0.25 s, about 262 world
  units), carrying the finished sphere behind him and swinging it forward on
  `rasen6`; the sphere itself is what has to touch the opponent. No contact
  by the end of the rush (or a wall first) is a miss: #0001 stops where he
  is, the sphere vanishes without exploding, and he shows the release pose
  `rasen12` alone for one frame (1/12 s) before he is free. A hit (no
  damage and no launch) stops the rush at once and traps the opponent, shown
  hurt on that very frame: it can't move, jump, attack, Charge, Throw or
  Defend, but gravity still applies. #0001 plays `rasen7 → rasen8` and
  holds `rasen8` while the sphere on the opponent keeps spinning
  (`prasen7 → prasen8 → prasen9`, looped) and grows steadily larger (drawn
  from its own size to 1.4× by the blast, still centred on the opponent).
  While it is held the opponent takes 1 damage (+1 Launch Point, Base Launch
  0, no Directional Launch) on the very step the sphere catches it, then
  0.5, 1.0 and 1.5 s after the hit, counted on the fixed-step clock, with no
  launch, stun or freeze. Exactly 2 s after the hit it explodes (`prasen10 → prasen11`,
  once) with #0001 on `rasen9`, the explosion pose: the opponent is
  released, then takes 15 (19 in all: 4 ticks and the blast; the explosion
  is never also a tick) and is launched sideways, away from #0001, at Base
  Launch 3: the 15 is added first, then the new Launch Point is tripled
  (from 0, 4 + 15 = 19 and 3 × 19 = 57; from 106, 106 + 15 = 121 and
  3 × 121 = 363). It is the technique's only launching hit and uses
  the same shared launch as every other hit. Only once the blast is over does
  #0001 recover through `rasen10 → rasen11 → rasen12`. A Shield blocks the
  contact (25 Energy, no Launch Point): no trap, no tick, no explosion, and
  the technique ends there, #0001 free at once. Once it starts you can let go of Charge; a hit on
  #0001 cancels it (no armour), freeing the opponent with no further ticks. Afterwards, Charge must be
  let go and held again to charge. Pressing Charge and BA2 on the same step
  from standing, or letting go of Charge as you press BA2, is an ordinary
  BA2.
- **Launch Point:** every fighter's own number, shown under its name in the
  HUD. It starts at 0 on every fresh life and every hit adds exactly the
  damage it deals: BA1 5, mid-air BA1 5, BA2 10, mid-air BA2 10, the
  shuriken 1, the Sphere Rush 1 per tick and 15 on the blast (a Shielded
  hit adds nothing). It has no maximum and no % sign, never goes
  below 0 and resets to 0 when the fighter respawns. Each hit then launches
  with its **Base Launch** (0, 1, 2 or 3) times the target's new Launch
  Point, in its **Directional Launch** (see [Launch](#launch)). No amount of
  Launch Point stops a fighter acting or takes it out: only the Void does,
  and each fall is a point for the opponent.
- **Charged cooldowns (CAB1, CAB2):** Charged BA1 (**CAB1**) and Charged BA2
  (**CAB2**) each have their own 5-second cooldown, started the moment the
  move is used (the clone summoned, the rush started), whether it hits or
  not. A charged press while it is cooling down does nothing. While it
  cools down it shows as a small white ring, outlined in black, under the
  fighter's feet, labelled CAB1 or CAB2: it fills clockwise as the ability
  recovers, with the seconds left inside, and disappears the moment it is
  ready. A lone ring sits centred under the fighter, two sit side by side,
  and with both ready nothing is drawn. While #0001 is actually in its Charge stance both recover twice as
  fast (the character's `stats.chargedCooldownRate`), so a fresh cooldown
  takes about 2.5 s of uninterrupted charging; running, jumping, attacking,
  shielding, being hit or performing the Sphere Rush recover at the normal
  rate. A restart or rematch, a new fighter in Practice Ground and every
  respawn after the Void clear them. They cost no Energy.
- **Menus:** arrow keys or WASD to move, `Enter` to select, `Esc` to go back. Mouse and touch work too.
- **Touch:** several fingers work at once (hold Right and press Jump, or hold C and press Punch). You can slide your thumb between Left / Charge / Right, and tap ◀ or ▶ twice to Dash. The combat buttons show icons, not letters: for #0001, **Shuriken** (Throw), **Shield** (held, Defense), **Punch** (Basic Attack 1) and **Kick** (Basic Attack 2), beside Special and Jump. Hold C, then press Punch for the Clone Attack or Kick for the Sphere Rush. The icons of the fighter's own buttons (Shuriken, Punch, Kick) come from its `mobileAbilities` in `js/data/characters.js` and follow Player 1's fighter, in Practice Ground too when you change fighter; Shield, Special, Jump and Charge are the same for everyone. Only the presentation is per fighter: the buttons still send the unchanged internal inputs (`primary`, `defense`, `action1`, `action2`). The viewport disables page zoom (`maximum-scale=1, user-scalable=no`) and the play surfaces and buttons set `touch-action: none`, so rapid taps never zoom or scroll the page.
- **Gamepad (standard layout):** D-pad or left stick left / right to move (twice in a row to Dash) and down to Charge in battle (they still navigate menus), A to jump, X / Square to Throw, B / Circle for Basic Attack 1, LB for Basic Attack 2, Y / Triangle for the reserved Special, RB or RT for Defense, Start to pause.
- **Debug:** `` ` `` toggles the collider, hurtbox and attack-hitbox overlay in battle (a hitbox shows only while it can connect; hurtboxes look the same with the Shield up, and a shielding fighter is labelled `shield`; a flying shuriken's hitbox is outlined in magenta and labelled; a clone's attack hitbox shows in the attack colour, labelled `clone ba1` (or `clone midairBa2` overhead), only on its active frame; the Sphere Rush's sphere hitbox is a dashed cyan box labelled `charged ba2 dash` while it can connect, then a dashed cyan cross marks the sphere on the caught opponent, which is labelled `bound`; solids, the main floor's block among them, are outlined in red and the Void's fixed kill line is dashed violet).

Touch controls show on touch-first devices (coarse pointer, or a touch actually detected). A narrow desktop window doesn't count as a phone. On a phone held in portrait, the game pauses and asks you to rotate.

## Current content

- **Characters:** #0001
- **Maps:** Desert (a sandstone mesa with 2 rock outcrops, 1360 units wide) and City (a rooftop with 7 one-way platforms and a stair bulkhead, 1440 wide) for Quick Battle; the Practice Ground training room (one flat training block, 1280 wide) for practice. Each is a compact main stage with open air past both ledges and the Void a short way beyond (see [Stages and the Void](#stages-and-the-void))
- **Animations:** Idle, Run, Jump, Fall, Land (jump/fall play while airborne; land plays once on touchdown), Hurt and Mid-air Hurt (shown during hitstun on the ground / in the air), Basic Attack 1 (4 frames), Mid-air Basic Attack 1 (the kunai slash, 3 frames: `0001_midair2ba1`–`3`), Basic Attack 2 (7 frames) and Mid-air Basic Attack 2 (the airborne kick, 5 frames: `0001_midair1ba1`–`5`), each played once at 12 fps, Shield (`0001_prepshield` to raise it, `0001_shielding` held, `0001_releaseblock` to lower it) and Mid-air Shield (`0001_midairshielding`, the held pose only), single frames drawn at 1×, Dash (`0001_dash1`–`2`, drawn at 1×, played once at 10 fps), Charge (charge1 → charge2 once, then chargea ↔ chargeb while held, at 10 fps, with charge1 shown briefly on release), Throw (3 fighter frames, played once at 12 fps), Shuriken (3 looping projectile frames at 18 fps, normalized and drawn separately from the fighter poses), the clone appear / vanish cloud (`0001_cloneav1`–`0001_cloneav10`, an effect at 20 fps: forwards as a clone appears, the same frames in reverse as it vanishes), the Sphere Rush poses (`0001_rasen1`–`0001_rasen12` as one-shot fighter clips at 12 fps: formation 1–3, rush 4–6, contact 7–8 with 8 held, explosion 9, recovery 10–12, and 12 alone as the whiff release) and its blue sphere (`0001_prasen1`–`0001_prasen11` as three effects at 12 fps: formation 1–6 once, spinning on the opponent 7–9 looped while it is drawn ever larger, explosion 10–11 once)
- **Attacks:** Basic Attack 1 and Basic Attack 2, each on the ground and in the air, a ground Throw that releases one shuriken, the Charged BA1 Clone Attack and the Charged BA2 Sphere Rush (ground only), each on its own 5-second cooldown. #0001's damage: BA1 5, mid-air BA1 5, BA2 10, mid-air BA2 10, shuriken 1, Sphere Rush 1 as it catches the opponent and every 0.5 s after while it holds it (4 in all), then 15 on the explosion. Special is reserved.
- **Defense:** #0001 shields, on the ground and in the air: held, full circle, free to hold, 25 Energy for each hit it blocks.
- **Movement:** running, jumping (a short hop on a tap, one air jump), air steering, the fast fall and a grounded Dash on a double tap (15 Energy); attacks keep and add their own momentum, early presses are buffered, and a hit opens a follow-up (see Controls above).
- **Powers:** Jump Power and Speed Power, each in three tiers. #0001 has Jump Power 2 and Speed Power 2 (its original jump and speed).
- **Launch:** every hit's damage adds to the target's Launch Point, then the hit launches at its Base Launch (0, 1, 2 or 3) × that new Launch Point, in its Directional Launch. #0001's BA1 is Base Launch 1 horizontal, its BA2 and mid-air BA1 Base Launch 2 vertical, its mid-air BA2 Base Launch 2 reverse vertical (downward), the Sphere Rush blast Base Launch 3 horizontal, and the shuriken and Sphere Rush ticks Base Launch 0 with no direction (they never launch).
- **HUD:** each fighter has one compact, semi-transparent glass card, pulled in close on either side of the timer: its portrait (the character's own `visual.portrait` crop, turned to face the timer whichever way its art is drawn), one thin divider, and its name with its Launch Point beneath it. The CPU's card mirrors Player 1's. In Quick Battle three small dots under each card fill as that fighter scores its points (○ ○ ○, then ● ○ ○ ...). Over each fighter itself, following it: its bright purple Energy bar above its name tag while below full, and its CAB1 / CAB2 cooldown rings under its feet while cooling down.
- **Modes:** Quick Battle (Splash → Home → Select Mode → Select Difficulty → Select Fighter → Select Stage → Battle): 99 seconds against a CPU that fights with the whole moveset at the difficulty you choose (Easy, Medium, Hard or Brutal; see [Quick Battle difficulty](#quick-battle-difficulty)), first to 3 points. Each time a fighter falls into the Void its opponent scores a point at once; the one that fell is out of play for 2 seconds, then back at its spawn with 0 Launch Point, full Energy and both charged abilities ready, while the fight and the timer carry on. The third point wins the match (a short **K.O.** beat, then the result; the loser does not come back). If both fall together, or one falls while the other is still waiting to come back, that fall scores nothing. If time runs out first, more points wins, then lower Launch Point; equal on both is a draw. Practice Ground: training on its own stage with a stand-still, non-attacking CPU dummy from the start (which you can change or disable; difficulty never applies to it), no timer, rounds or points; the Void takes a fighter out for 2 seconds, then puts it back at its spawn (below).

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
  mode remains manual-only. **Practice Ground**, the secondary action under
  Play, opens the training room directly, and **Discover** beneath it opens
  the in-game reference. The strip shifts outward on narrow screens.
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
  (`+5`).
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
                      asset loader, input (keyboard/touch/gamepad), device, audio stub
  screens/            splash, home, mode, difficulty, character, map, help,
                      battle, practice, discover
  game/               arena (shared loop + rendering), Quick Battle, Practice
                      session, controllers (player, combat AI, training),
                      fighter state machine, physics, camera,
                      combat, launch bounces, projectiles, summoned clones, charged
                      techniques, sprite normalizer/animator, HUDs,
                      fighter status (Energy bar, CAB rings), the Shield's
                      circle, touch
                      controls
  stages/             Desert, City and Practice renderers (procedural Canvas 2D),
                      the shared one-point perspective and the Void
  data/               characters.js, maps.js, practice-map.js, powers.js,
                      launch.js, difficulty.js
  ui/                 wordmark, icons, overlays, shared help content, stage
                      preview, fighter roster
```

- **Sprite normalization.** The idle, jump, fall, land and hurt frames are pixel art at roughly 16× scale, the mid-air hurt, Basic Attack 1 and 2 and Charge frames at 8×, and the run frames at 4×; the Dash and Shield frames are drawn at 1× (one file pixel per art pixel), so each clip's `heightRatio` sizes it against idle's 52 art pixels at that same scale. When a frame loads, the game reads its alpha channel once and finds the visible bounds. It then detects the pixel grid from every colour transition and resamples the frame to 1 pixel per art pixel. Every frame is drawn at the same world scale, anchored bottom-centre at the upper-body centroid, so the fighter keeps the same size and position when switching between animations. When the size stays close to the target, each art pixel maps to a whole number of device pixels. The Sphere Rush poses are fighter poses at 2×, normalized like the rest. Projectile and effect art (the shuriken at 8×, the clone cloud and the Sphere Rush sphere at 2×) goes through the same grid detection but keeps its own art size, centre-anchored at the fighter's art-pixel scale, and is never fitted to the fighter's height.
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
  only: the kill line never moves. The Shield's circle (see Defense) shares
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
  spacing, rarely uses Charge. Still attacks: inexperienced, not disabled.
- **Medium:** a balanced opponent: both Basic Attacks, Throw, occasional
  Shield and Charge, answers slow threats, still gets caught.
- **Hard:** fast reactions; Shields and dodges real threats, punishes
  recovery, spaces, jumps in, dashes and uses charged actions deliberately.
- **Brutal:** reacts within a few frames (never instantly), reassesses
  constantly, manages Energy and cooldowns, and uses the full moveset. It
  still waits, spaces and retreats when that is the stronger choice.

**Difficulty changes how well the CPU thinks, not what its fighter is
allowed to do.** `js/data/difficulty.js` holds one profile per level, the
only place a level is validated (anything unknown is Medium): reaction
window, lapse chance, reassessment interval, decision noise, hesitation,
spacing error, motion lookahead, and weights for defense, punishing, charged
actions, Dash, planning, aggression, stage sense and Energy care. Every trait
is ordered from Easy to Brutal. None of it touches a fighter: damage, launch,
speed, jumps, Dash, Shield, Energy, cooldowns, hitboxes, respawns and scoring
are the character's and the match's own, identical on every level.

The CPU is `CombatAIController` (`js/game/combat-ai.js`), a controller like
Player 1's: `Fighter.update` asks it for the same input snapshot a player
produces, and it only ever holds and presses buttons (movement, Jump,
Defense, Charge, Throw, BA1, BA2, and a double tap for a Dash). The fighter
and combat engine decide what those do, so the CPU cannot attack while
stunned, skip recovery, bypass a cooldown or spawn anything itself. Each
step it **senses** the fight from what the simulation shows (both fighters,
their attacks and phases, Shield, Charge, Energy, cooldowns, projectiles,
clones, the stage, the score and the clock; never the player's raw input),
**evaluates** options built from the fighter's own move data (reach from its
hitboxes, Throw range from its projectile, charged actions from
`chargedActions`, nothing hard-coded for #0001; a reserved button is never
pressed), and **acts** over as many steps as needed (turn then strike, hold
Charge then press the charged action, tap-release-tap to Dash). Something new
the opponent does is only answered after a reaction delay sampled from the
level (or missed on a lapse), and prediction is limited to projecting
current motion a short, level-set horizon ahead. It never walks off the main
floor, follows the opponent up platforms and down by walking off their edges
(the platform drop is the training CPU's alone), and stands still while its
opponent is out in the Void. Its randomness is an injected seeded RNG, so
tests are deterministic.

### Practice Ground

**Home → Practice Ground** starts at once with #0001 and a practice CPU
(#0001 too, sharing its one loaded sprite set) on the training stage: no
fighter or stage select, countdown, timer, points or result. It runs until you
choose Return.

- **Your fighter and the practice CPU.** `PracticeSession`
  (`js/game/practice.js`) and Quick Battle's `Battle` both extend `Arena`
  (`js/game/arena.js`), which owns the fixed-step world, the camera and all
  Canvas drawing. The practice session holds your fighter and the practice
  CPU, paired and framed together from the start. With the CPU disabled,
  moves aimed at an opponent fall back or miss: Charged BA1 has nobody to
  appear behind, so it is an ordinary BA1 (no cooldown started); the Sphere
  Rush dashes, finds no one, releases on `rasen12` and ends (its cooldown
  spent).
- **Stage.** `PRACTICE_MAP` (`js/data/practice-map.js`) is deliberately not
  in `MAPS`, which feeds Select Stage. `js/stages/practice-theme.js` draws the
  room as one square grid in one-point perspective: a back wall, and a
  compact training block with open edges (its top, its outer side past
  either ledge, a ruler along its front edge). A fighter that falls into the
  Void is out of play for 2 seconds, then back at its own spawn in a fresh
  training state: 0 Launch Point, full Energy, both charged cooldowns ready and
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
  changes, and every new visit starts with #0001 again.
- **Practice CPU.** Change CPU opens a second copy of the roster dialog
  (Change CPU, or Select CPU once it is disabled). Confirming loads that
  fighter and puts it 320 units to your right, facing you, labelled CPU, and
  resumes; the camera frames you both.
  It is a training dummy with no controller: it never moves, jumps, attacks,
  charges or defends, but it takes real hits, hitstun, launches and binds,
  so clones, shurikens, BA1 / BA2 and the Sphere Rush all land on it. Its
  Launch Point builds up (and launching hits send it further) like anyone's.
  Each hit floats the Launch Point it added (`+5`, `+1` for each Sphere Rush tick, `+15`
  for the blast) in red over its head for under a second, straight from the
  combat system's resolved hit. Change CPU swaps it for
  another fighter; **Disable CPU**, beside Back in that dialog, removes it
  (and its card) and returns you to the paused menu. Changing your own
  fighter keeps the CPU. Its own HUD card, on the right, shows its portrait,
  name and Launch Point, rebound whenever it changes.
- Every new visit starts with #0001 and the #0001 CPU again, at 0 Launch Point,
  whatever the last visit changed or disabled.

### Powers

Powers are fighter abilities owned at one of three tiers: Jump Power and Speed Power. `js/data/powers.js` holds each Power's frozen tier table (tier number, name, description and gameplay value) in the one `POWERS` registry, their single source of truth: a fighter declares one tier of each (`powers: { jump: 2, speed: 2 }`), `Fighter` resolves them once (`getJumpVelocity`, `getMaxSpeed`) and the Discover screen reads the names and descriptions.

Values are in world units per second, at the global gravity of 2500:

| Power | Tier 1 | Tier 2 | Tier 3 | Controls |
| --- | --- | --- | --- | --- |
| Jump Power | 650 | 920 | 1000 | the initial upward speed of the normal jump |
| Speed Power | 270 | 330 | 360 | the top speed of normal left / right movement, on the ground and in the air |

- #0001 declares `powers: { jump: 2, speed: 2 }`: exactly the 920 jump and 330 top speed it always had, so it moves and jumps identically. Movement has no raw `jumpVelocity` or `maxSpeed`: the tiers are the only sources.
- Speed Power only sets the normal top speed. Acceleration, deceleration, the turn boost, air control, gravity, falling, the jump, launches, projectiles (the shuriken's 700), the Shield (which only slows a fighter) and charged techniques (the Sphere Rush's 1050 dash) never depend on it, and neither Power changes the launch a fighter deals or takes.
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

Melee, projectiles, summoned clones and charged techniques all resolve through that one path; `applyHit` never checks which fighter, attack or technique it is resolving.

#0001's hits:

| Hit | Damage | Base Launch | Directional Launch |
| --- | --- | --- | --- |
| BA1 (ground punch) | 5 | 1 | horizontal |
| BA2 (ground spinning kick) | 10 | 2 | vertical |
| Mid-air BA1 (kunai slash) | 5 | 2 | vertical |
| Mid-air BA2 (airborne kick) | 10 | 2 | reverse vertical |
| Shuriken | 1 | 0 | none |
| Sphere Rush contact | 0 | 0 | none |
| Sphere Rush tick (on the contact step, then every 0.5 s while held) | 1 | 0 | none |
| Sphere Rush explosion | 15 | 3 | horizontal |

So from 115, BA1 adds 5 (120) and pushes at a strength of 120 (1200 units/s); from 110, BA2 adds 10 (120) and launches upward at 240 (2400 units/s), and mid-air BA2 drives downward at 240; from 115, mid-air BA1 launches upward at 240; from 119, a shuriken or a Sphere Rush tick adds 1 (120) and launches at 0 × 120 = 0; from 105, the Sphere Rush explosion adds 15 (120) and launches sideways at 360 (3600 units/s); a whole Sphere Rush on a fresh target adds 4 × 1 + 15 = 19 and launches it at 3 × 19 = 57. On a fresh target a BA2 is 2 × 10 = 20, a 200 units/s hop; a BA2 that leaves the target at 30 Launch Point lifts it about 70 units, and at 60 about 280. The Clone Attack performs ground BA1's own definition (or mid-air BA2's, overhead), so it inherits that hit's damage, Base Launch and Directional Launch with nothing of its own.

#### Launch bounce

A launch that drives its fighter hard into stage geometry **rebounds** off it instead of stopping dead, and can ricochet on to the next surface: hit → fly → wall → rebound → chase. It never changes a launch's strength; only the velocity the launch leaves the fighter with can rebound, so the Launch Point decides it by itself. The runtime and every tuning value live in `js/game/launch-bounce.js` (`LAUNCH_BOUNCE`; a character may override any of them with its own `launchBounce`).

- **Only launches.** Physics (`stepBody`) still stops a body at whatever it meets and never bounces anything; it reports the speed each contact stopped (`impactVx`, `impactVy`). A launching hit starts a launch sequence on the fighter, and only then can a stop become a rebound. Walking into a wall, jumping into a ceiling and landing are unchanged, and so is falling back down after an upward or sideways launch: a surface only rebounds a fighter the launch is carrying into it (a spike into the floor, say), never one gravity brought there.
- **Threshold and restitution.** A contact rebounds at 500 units/s or more into the surface (only what crosses it counts, so glancing contacts don't); slower is an ordinary stop. The speed comes back reversed × 0.72 off a wall, 0.6 off a floor or platform top, 0.65 off a ceiling, and what ran along the surface is kept, so diagonal impacts ricochet. Corners rebound on both axes at once. Every rebound is weaker, so a ricochet dies away: BA1 rebounds its target off a wall right behind it from about 50 Launch Point, a mid-air BA2 spike off the floor from about 25 (once, then it lands), and a big launch between two walls ricochets two or three times.
- **Geometry only.** Solids (Desert's rock outcrops, City's bulkhead) and the main floor's cliff faces rebound; one-way platforms only from above; the Void never (it is not geometry), and there are still no side walls.
- **Stun and freeze.** A rebound keeps its fighter stunned at least 0.2 s, and a hard one (1200 units/s or more) freezes it at the surface for 0.05 s first: fly, impact, pause, rebound.
- **No wall loops.** A rebounding fighter can be hit like any other (a new launch replaces its velocity), but its rebounds count on until it recovers, at most 5, and it flies through the attacker's pushbox instead of being pinned in reach, so punching someone into a wall over and over ends within a few hits.
- **Every launch.** Clones' hits and the Sphere Rush explosion rebound like any launch (the blast into a rock ricochets back across the mesa); a Shield's block and the shuriken never launch, so they never rebound.

The two mid-air Basic Attacks swapped moves: **mid-air BA1** is the three-frame kunai slash (`0001_midair2ba1`–`3`), which used to be mid-air BA2, and **mid-air BA2** is the five-frame airborne kick (`0001_midair1ba1`–`5`), which used to be mid-air BA1. Each move kept its own art, timing, hitbox, damage and stun. The frame file names are the originals.

### Discover

**Home → Discover** opens the reference, a character-neutral explanation of Alva's mechanics. **POWER** (open by default) explains Jump Power and Speed Power, each with its three tiers. **LAUNCH** explains the launch system generically, straight from `js/data/launch.js`: Launch Point, the four Base Launch values (0 no launch, 1 normal, 2 double, 3 triple, each marked with its own number) with the formula `Launch strength = Base Launch × Launch Point`, and the four Directional Launches (none, horizontal, vertical, reverse vertical). Neither page says which fighter or attack uses a Power, tier, Base Launch or direction, and neither shows tuning numbers. **PASSIVES** is intentionally empty until Alva has passives. Arrow keys, the D-pad or the stick move between Back, the sections and the page (↑ / ↓ scroll a long page); Back, `Esc` or gamepad B returns Home.

### Adding a fighter (#0002)

1. Put the frames in `assets/characters/0002/`.
2. Add a definition to `CHARACTERS` in `js/data/characters.js` (animations, movement, Power tiers such as `powers: { jump: 2, speed: 2 }`, collider, hurtboxes, stats). Movement is ground `acceleration` / `deceleration` / `turnBoost` / `overspeedDeceleration`, air `airAcceleration` / `airDeceleration` / `airTurnBoost`, `gravityScale`, `maxFallSpeed`, `fastFallAcceleration` / `fastFallSpeed`, `coyoteTime`, `jumpBuffer`, `shortHopWindow` / `shortHopHeight`, `airJumps` / `airJumpRatio`, `attackBuffer`, `hitstunFriction` / `hitstunAirDrag` and the Dash's two; the newer fields are optional (see `Fighter.moveHorizontal`). How it responds to launches is `launchReaction` (`stunPerThousand`, `maxStun`, `tumbleSpeed`, `steerAngle`; see `resolveLaunchReaction` in `js/game/combat.js`), and a Shield's `perfectWindow` / `perfectRearm` set its perfect block.
3. Give it a free `rosterSlot`.

To add attacks, create animations with real frames, define them in `attacks` (see the schema in `js/game/combat.js`), give each its `damage`, `baseLaunch` and `directionalLaunch`, optionally how it moves (`momentum` / `airMomentum`, `control` / `airControl`, `friction`, a `step`) and when a hit opens a follow-up (`hitCancel`), and map them in `actions`: a string for one attack, or `{ ground, air }` to pick by whether the fighter is grounded (as #0001's `action1: { ground: 'ba1', air: 'midairBa1' }` and `action2: { ground: 'ba2', air: 'midairBa2' }` do). Time `startup` / `active` / `recovery` to whole frames of the clip so the hitbox is live only while the strike is on screen. An attack without frames is refused rather than faked. Base Launch and Directional Launch are declared separately from damage (see [Launch](#launch)):

```js
attacks: {
  jab: {
    animation: 'jab', startup: 1 / 12, active: 1 / 12, recovery: 2 / 12, damage: 6,
    hitbox: { x: 12, y: -64, w: 28, h: 16 },
    baseLaunch: 1,                   // 1 x the target's new Launch Point
    directionalLaunch: 'horizontal', // along the hit's facing
    hitstun: 0.3, blockstun: 0.14, hitstop: 0.05,
    momentum: 0.75, friction: 0.4,   // keeps most of a run and slides on it
    hitCancel: 1 / 12,               // once it hits, an attack or a jump may cut it short from here
  },
  airSpike: {
    animation: 'airSpike', startup: 2 / 12, active: 1 / 12, recovery: 0, damage: 8,
    hitbox: { x: 14, y: -100, w: 22, h: 80 },
    baseLaunch: 2,                        // twice the target's new Launch Point
    directionalLaunch: 'reverseVertical', // drives the opponent downward
    hitstun: 0.24, blockstun: 0.15, hitstop: 0.07,
    airMomentum: 1, airControl: 0.4,      // keeps its drift, steers with 40% of the air control
  },
},
```

To give a fighter a charged action, map a combat button in `chargedActions` to a typed descriptor. Pressed while already charging, with Charge still held, the button does that instead of its normal attack; `Fighter.tryChargedAction` dispatches on the type:

- `{ type: 'summon', id }` names an entry in `summons` (see the schema in `js/game/clone.js`), as #0001's `action1: { type: 'summon', id: 'ba1Clone' }` (the Clone Attack) does. It starts the summon's `cooldown` and spawns a detached clone that performs one of the fighter's own `attacks` through an `effectAnimations` cloud, while the fighter keeps charging. An optional `noGround: { attack, offset }` names another of its attacks, and where to appear relative to the opponent, for when there is no ground behind the opponent at its foot height.
- `{ type: 'technique', id }` names an entry in `chargedTechniques` (see the schema and phases in `js/game/charged-technique.js`), as #0001's `action2: { type: 'technique', id: 'rasenRush' }` (the Sphere Rush) does. The fighter itself performs it: fighter clips from `animations` for its form / dash / confirm / explosion / release phases and its whiff release, an effect from `effectAnimations` for each stage of the sphere, a dash speed, hand offsets per frame, a sphere hitbox, a delay, the sphere's growth on the target and the data for its hits (the contact, an optional `tickHit` every `tickInterval` while the target is held, and the explosion). Its `cooldown` starts when it starts.

While either is cooling down the press does nothing. Without an opponent (for a summon), the art or valid data, the press falls through to the normal attack, and no cooldown starts. A character's `stats.chargedCooldownRate` sets how much faster its charged cooldowns recover while it is in Charge.

To choose how a fighter defends, give it a `defense` entry. The one type so far is `{ type: 'shield', groundAnimation, airAnimation, groundStartAnimation, groundReleaseAnimation }` (like #0001's `shield`, `midairShield`, `shieldStart` and `shieldRelease`): a held, full-circle Shield (see Defense above). The held clips are required: without the one for where the fighter is, the Shield is refused (and logged once), never faked; the raise and lower poses are optional. The type is checked, so a future fighter can defend another way on the same Defense button; an unknown type is an error.

Energy and the Dash are data too. An `energy` entry (`{ max, regen, chargeRegen, dashCost, shieldHitCost }`, see `resolveEnergy` in `js/game/combat.js`) sets the fighter's resource; every field is optional and defaults to #0001's values (100, 12 / s, 30 / s in Charge, 15, 25). A Shield pays `shieldHitCost` for each hit it blocks. A cost larger than what is left is still paid by taking the rest, which exhausts the fighter; neither a Dash nor a Shield works while it is exhausted. To give a fighter a Dash, add a `dash` clip to `animations` and `movement.dashSpeed` / `movement.dashTapWindow`: the Dash lasts one pass of the clip and pays `dashCost`. Without the clip (or a `dashSpeed`) it never dashes: a Dash without frames is refused and logged, never faked with the run.

### Adding a map

Add an entry to `MAPS` in `js/data/maps.js` (size, ground, bounds, spawns, platforms, solids), then register a theme renderer in `js/stages/index.js`. Every `MAPS` entry becomes a Quick Battle stage on Select Stage; the Practice Ground stage lives apart in `js/data/practice-map.js`.

## Credits

**ALVA**, created by hiyroscript.

**Original work.** Game design, code, interface, ALVA wordmark, and Desert / City
stage artwork by hiyroscript.

**#0001 sprite source.** Original sprite material from:

- *Jump Ultimate Stars*
- The Spriters Resource. Source sheet uploaded by Dazz, contributor FRET.

**Rights.** hiyroscript did not create or claim ownership of the original
third-party character/game artwork. Original characters, games, and related
properties belong to their respective rights holders.

**Project.** Unofficial fan project. No affiliation or endorsement is implied.

The in-game credits (Home credits roll and Credits tab) render from one list in
`js/ui/help-content.js`. The game ships with no audio.
