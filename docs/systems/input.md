# Input and controls

Every device sends the same control codenames, the same for every
fighter; a fighter only decides what its combat buttons do. The product
rules are [`ALVA_SPEC.md`](../../ALVA_SPEC.md) §7.4 (input), §7.4a (game
controllers), §6.2 (Home's controller button), §6.10 (Settings), §6.10a
(the touch layout editor) and §6.10b (controller controls).

| Module | Owns |
| --- | --- |
| [`js/config.js`](../../js/config.js) | The codenames (`ACTIONS`, `COMBAT_BUTTONS`, `NUMBERED_ATTACKS`, `MOVES`), their neutral names (`ACTION_LABELS`), keyboard `bindings` and `menuBindings`. |
| [`js/core/input-manager.js`](../../js/core/input-manager.js) | `InputManager`: keyboard, touch and Player 1's controller merged into one snapshot per step (`sample(context)`, the fighter as it is at that step), with one-step `…Pressed` edges (never key auto-repeat) and one-tap Dash requests (`queueTouchMouvement`); in menus the controller's commands and cursor stick (`onPadMenu`, `onPadCursor`); binding capture (`startCapture`). |
| [`js/core/gamepad-devices.js`](../../js/core/gamepad-devices.js) | Which pads are PlayStation or Xbox controllers (`identifyController`, conservative), the normalized button names (`PAD_BUTTONS`: `south` is Cross / A) and each family's own names for them. |
| [`js/core/controller-manager.js`](../../js/core/controller-manager.js) | `ControllerManager`: the physical controllers: up to four active, the status (`connected`, `disconnected`, `tooMany`), Player 1's controller, a real `refresh()`, and Player 1's buttons and sticks each frame (`poll()`). |
| [`js/data/controller-profiles.js`](../../js/data/controller-profiles.js) | Controller profiles: the actions a fighter can bind (`controllerActions`, from its definition), the binding shape, the universal defaults, each fighter's recommended layout (its own `controller.layout`, else a safe fallback), binding checks, conflicts by physical input, stored-profile sanitizing and the upgrade of profiles saved before the sticks were named (`upgradeStoredProfiles`). |
| [`js/core/controller-resolver.js`](../../js/core/controller-resolver.js) | `ControllerResolver`: Player 1's presses resolved, for the fighter and where it is, into control codenames (combinations, directions on their own stick, each stick's pushes as presses of their own, activations, one owner per press). |
| [`js/ui/controller-cursor.js`](../../js/ui/controller-cursor.js) | The circular controller cursor, part of `MenuNavigator`. |
| [`js/ui/controller-dialog.js`](../../js/ui/controller-dialog.js), [`js/ui/controller-editor.js`](../../js/ui/controller-editor.js), [`js/ui/controller-glyphs.js`](../../js/ui/controller-glyphs.js) | Controller Connections; Settings › Controls › Controller controls (roster, editor, binding dialog); button and stick names, binding phrases, chips (`stickGlyph`) and the controller diagram, either stick lit on its own. |
| [`js/game/fighters/fighter-controller.js`](../../js/game/fighters/fighter-controller.js) | `PlayerController` (Player 1 reads the snapshot; it alone carries the player's Automatic turn-around setting, see [combat](combat.md#facing-and-automatic-turn-around); its presses go through the same request and cancellation rules as a CPU's, see [combat](combat.md#requests-and-cancellation)), `blankInput`, `HELD_CONTROLS`. |
| [`js/ui/touch-controls.js`](../../js/ui/touch-controls.js) | `TouchControls`: the two touch layouts, multi-touch, the fighter's art on its buttons (`setCharacter`, `showArt`), airborne art (`setAirborne`) and custom placement (`applyLayout`). |
| [`js/ui/ability-hud.js`](../../js/ui/ability-hud.js), [`css/ability-hud.css`](../../css/ability-hud.css) | The ability HUD: Player 1's moves, their art and their keyboard or controller inputs in the bottom-right corner, on a ground / air wheel, with their cooldowns ([below](#the-ability-hud)). |
| [`js/ui/mobile-abilities.js`](../../js/ui/mobile-abilities.js) | Which buttons a fighter has (`abilityPresence`, from its `actions`), and each button's name and frame (`previewFrame`, from its `mobileAbilities`). |
| [`js/core/touch-layout.js`](../../js/core/touch-layout.js) | Stable control ids, layout geometry and sanitizing. |
| [`js/ui/touch-layout-editor.js`](../../js/ui/touch-layout-editor.js) | The layout editor. |
| [`js/core/settings.js`](../../js/core/settings.js) | The saved Mobile Controls choice and each layout's custom placement, Automatic turn-around on or off, and each fighter's saved controller layout (the only module touching storage). |
| [`js/core/menu-navigator.js`](../../js/core/menu-navigator.js) | Menu navigation with one shared highlight for keyboard, mouse, touch and the controller (its D-pad, buttons and cursor); menus read their own bindings, never gameplay edges. It also owns the dialog stack (see [Dialog layers](#dialog-layers)). |
| [`js/core/input-modality.js`](../../js/core/input-modality.js) | The input modality (mouse, touch, keyboard or gamepad) on `<html>`, which keeps hover, focus and selection apart (see [Interaction states](#interaction-states)). |

## Controls

| Action | Codename | Keyboard | Controller (recommended) | Touch |
| --- | --- | --- | --- | --- |
| Move left / right | `runLeft` / `runRight` | A D or ← → | Left stick | Joystick, or Classic ◀ ▶ |
| Dash (on the ground) / air dash (in the air) | `mouvementLeft` / `mouvementRight` (request-only) | Q / E | R1 / RB: the way the left stick points, else the way the fighter faces | Both layouts: one tap of **Left movement** / **Right movement** |
| Down (fast fall in the air; steer a launch down; a fresh press on a one-way platform drops through it) | `down` | S or ↓ | Left stick down | both layouts: the small **Down** button at the far left of the lower-left cluster |
| Jump (tap: normal; held a little longer: higher; again in the air: an air jump, twice: the triple jump) | `jump` | W, Space or ↑ | Cross / A | the upward arrow |
| Extra attack | `extra_attack` | J | the fighter's own layout | top of the cluster |
| Shield (on the ground, held: it holds the fighter still, a direction held with it only turns it, Jump jumps out of it) / Deflect (in the air, a fresh press) | `shield` | L | L1 / LB (held on the ground, pressed in the air) | **Shield** glyph always; named **Deflect** while airborne when supported |
| Attack 1 to Attack 5 | `attack1` … `attack5` | U I O M , | the fighter's own layout (see below) | slots 1 to 5 |
| Pause (the Practice menu in Practice Ground) | `pause` | Esc or P | Options / Menu | the timer / pause or More button |

A held control's codename is its one internal name: its key in
`CONFIG.bindings` and `ACTIONS`, its field in every input snapshot (with a
`…Pressed` edge), and for the combat buttons its key in a fighter's
`actions`. A key a fighter has no move on stays bound for everyone and
does nothing for that fighter; its touch button is hidden, and its
controller layout simply has no action for it. What each fighter's buttons do is in its
[character specification](../characters/README.md). The mouvement
buttons' spelling (`mouvementLeft`) and the Dash clip's (`mouvment`)
differ on purpose ([conventions](../development/conventions.md#codenames)).
Menus read their own keys (`CONFIG.menuBindings`): the arrows or W A S D
move, Enter, Space or J confirm, and Esc, Backspace or K go back. K does
nothing in play.

### Mash Combo input

A [Mash Combo](combat.md#mash-combo) needs no button of its own: it is five
fresh presses of one of the fighter's two Mash Combo moves' existing
buttons, read from the same `…Pressed` edges every device produces, so it
works the same on the keyboard, touch (either layout: each tap is one
press; a held touch button is one press), a PlayStation or Xbox pad, any
custom binding a player gives those moves, and the CPU's executor. Only
fresh edges count: a held key or button is one press, and a key's
operating-system autorepeat makes none (`InputManager` ignores `repeat`
keydowns). A controller press resolved for the air (`pressedInAir`) never
counts. The timing is on the simulation clock (60 Hz steps), never the
frame rate; a sample takes one press per button per step, so presses
faster than every other step (about 30 a second) are no faster for it. No
universal input changes, and a controller layout never names it.

## Touch controls

Touch controls show on touch-first devices only (a coarse pointer or an
observed touch), never because a desktop window is narrow; Watch Mode,
where nobody plays, hides them. Two layouts, chosen under Settings →
Controls → Mobile Controls:

- **Joystick** (the default): one round joystick holding `runLeft` /
  `runRight` past a small deadzone (digital, like every other input; up and
  down on it hold nothing), with two one-tap Mouvement/Dash buttons with
  double directional arrows above it.
- **Classic Buttons**: single Left and Right Run arrows with thumb sliding,
  with smaller double-arrow Mouvement buttons directly above their matching Run buttons.

Both put a small **Down** button (a downward chevron, the Dash buttons'
size) at the far left of the lower-left cluster, level with the middle of
the stick or of the Run arrows; the cluster starts that much further in
(`--tc-down-room` in
[`css/touch-controls.css`](../../css/touch-controls.css)). Held, it holds
`down` exactly as S / ↓ or the left stick down do: the fast fall in the
air, and pressed while standing on a one-way platform, a drop through it
([movement](movement.md#platform-drop)). Its press stops at the button, so
Classic's sliding Run container never takes it for a Run arrow.

Run presses and joystick flicks never request Mouvement. Keyboard and controller
requests are rising edges, never auto-repeat or held actions: one press of the
controller's Dash button requests once, toward the stick's side (past a third of
its travel) or, with the stick near the middle, the way the fighter faces; held,
it never requests again. Touch Mouvement holds no Run input.
Opposing simultaneous requests cancel. The CPU emits the same explicit request
fields; normal CPU running never Dashes.

Both share the lower-right cluster: the numbered attack buttons fill fixed
slots, as many as the fighter has numbered attacks (`attackSlots`:
`attack1` in slot 1, `attack2` in slot 2, then the rest in order), in a
honeycomb round Shield: three rows of three, two and three buttons, one
pitch between neighbours, slot 3 beside Shield in the middle row:

```
          [4]  [5]  [EXTRA]
            [3]  [SHIELD]
          [1]  [2]  [JUMP]
```

The cluster is the same size for every fighter (two numbered attacks to
five): a fighter with fewer leaves only its missing slots empty, and no
button ever overlaps another.

All action buttons, including Jump and Extra Attack, share the same diameter,
border, background, shadow and pressed feedback. Reserved/unavailable states
still communicate ability status. The extra attack and numbered attack buttons show a frame of the
fighter's own art, chosen in its `mobileAbilities`
(`preview: { animation, frame }`, `previews.air` for a distinct airborne
move, `collection: 'projectileAnimations'` to pick projectile art, an
optional `fallbackIcon`); Jump, Shield, the arrows, the joystick and the
Dash buttons keep their universal glyphs. Jump is an upward arrow
without a baseline. Defence always shows the shield glyph, including in the
air; its accessible name becomes **Deflect** when the fighter has one,
with the same button still sending `shield`. A button with nothing to
show falls back to a neutral glyph with its name and input unchanged.
Presentation never changes a button's codename or what it sends. In the
air, ground-only abilities stay visible but dimmed (`aria-disabled`).

### Touch controls' live move state

After each frame the screens call `TouchControls.showStatus(fighter)` with
Player 1's fighter (`BattleScreen.update`, `restart`, `rematch`;
`PracticeGroundScreen.update`), right after `setAirborne`. Each combat
button's move for the current place is read through `abilityStatus`
exactly as the ability HUD reads it ([below](#the-ability-hud)) and
painted on the button itself, with no element of its own:

- `is-cooling`: a 3 s or 5 s cooldown, from the moment its move is
  released (never while it still casts), a dark sweep over the art
  recovering clockwise from the top (`--tc-progress`, the button's
  `::after`) and its seconds (`data-seconds`, drawn by its `::before`). An
  ordinary move has no cooldown, so never shows one;
- `is-spent`: spent for this airtime, free fall, a move that costs Energy
  while the fighter is exhausted, or missing art (dashed, dimmed), apart
  from `is-unavailable` (a ground-only move in the air).

Only what changed is written (each button caches what it shows), and a
button with nothing to show is never written to; nothing animates. Another
fighter's state, or none, clears it, and `setCharacter` starts clean. The
rings over Player 1's fighter stay on a touch screen, where a thumb covers
the button it presses.

**One press per touch.** A press is the pointer going down on a button. A
`click` with no `detail` is an assistive technology's activation (a short
tap, or one Dash), except within `POINTER_CLICK_MS` (600 ms) of a pointer
lifting off the controls (`notePointerEnd`): that click is the pointer's
own trailing one, which a browser may report with no `detail` (Chromium's
touch emulation does for every tap and long hold), and counting it would
press the button a second time.

**Custom layouts.** Settings → Controls → Customize touch controls opens
the editor over a still battle screen: every control can be moved and
resized (70 % to 180 %), by pointer, keyboard or gamepad, and all five
numbered buttons always show their matching one-to-five pip icons. Every
editor control uses a universal icon and a neutral localized name, regardless
of the selected fighter: Extra Attack uses the ring, Defence the shield,
Jump the upward arrow, and movement the scheme's arrows or joystick. Gameplay keeps each fighter's authored attack artwork.
Positions are stored as fractions
of the safe touch area and sizes as scales, keyed by control id, never by
label or slot; each layout keeps its own arrangement. Both Classic Mouvement
buttons are independently editable. Older Classic saves retain every existing
custom control; the new buttons use defaults until customized. Reset restores
all four directional controls without changing the other scheme. A saved
entry under an id no scheme has any more (the retired `transform`) is
dropped as the layout is read, every other entry kept as saved, with no
settings migration. `down` is a control again (Down, first in each scheme's
list): an entry saved while the old down arrow existed puts it back where
the player had it.

**Automatic turn-around** (Settings → Combat) and move cancellation
are not part of the input system: no binding, device or
`InputManager` code knows them, and no new control exists for them.
Keyboard, controller and touch presses reach the fighter in the same
snapshot as ever, one `…Pressed` edge per press (a key held, a touch
control held or a controller button held is one press, never a stream:
holding never strings attacks), and the Fighter decides what each press
starts, every combat button asking for its own move only, and never cuts
an attack that can harm short outside its hit-confirmed window
([combat](combat.md#requests-and-cancellation)); the player's controller carries
the setting. So a repeat works identically on every device: a press
released and made again during the attack is nothing, a held control is
one press, and a controller's ground / air resolution (`pressedOnGround` /
`pressedInAir`) decides the place a press counts in, as for any press.
`runLeft` / `runRight` (the keys, the touch Run buttons and joystick, the
stick) only hold a direction: their press edges request nothing, so Run
never cancels an attack. With Automatic turn-around on, Run moves the
fighter either way while it keeps facing its enemy; directional controller
bindings (forward and back on a stick, the Dash with no stick pushed) read
the facing the fighter has at that step, which is the enemy's side, so
"forward" is toward the enemy (the facing is settled after every fighter
has moved, before the next step's controls are resolved).

## The ability HUD

For keyboard and controller play, Quick Battle and Practice Ground show
Player 1's moves in the bottom-right corner (`AbilityHUD`,
`js/ui/ability-hud.js`; the spec's §7.3 has the whole look). It is
information only: no focus, no pointer, no input of its own. A touch
screen (`html.is-touch`) hides it: the touch controls are that layout's
interface, and nothing about them changes.

- **Moves** come from the fighter's loadout (`abilityGroups`,
  `js/game/combat/move-status.js`), in control order: each button's ground
  move on the ground row, each button's air move that is not ground-only
  on the air row. A reserved button (mapped to null), a button the fighter
  lacks and a missing move show nothing. Nothing in it names a fighter: a new fighter's
  two to five numbered attacks and extra attack show with no code changed.
- **Art** is each button's authored touch preview (`previewFrame`), the
  distinct air move's own air artwork in the air row; a missing or failed
  frame shows the button's neutral glyph (once failed, a file is not tried
  again). Each tile keeps its one image element; only a fighter change
  rebuilds tiles.
- **Inputs** follow `InputManager.lastDevice` (a pad's press or a stick
  pushed past half makes it `gamepad`, a key `keyboard`; a pad that is only
  connected never counts). Keyboard: the button's first key in
  `CONFIG.bindings` as a keycap (`keyCapLabel`: letters bare, the comma as
  `,`). Controller: the binding of `<place>:<button>` in the fighter's
  resolved profile (`InputManager.profileFor`: the player's saved layout
  through `resolveProfile`, else the recommended one), drawn by
  `abilityInput` in Player 1's pad's family (`buttonGlyph`: □ ✕ ○ △ and
  L2 / R2 on PlayStation, A B X Y and LT / RT on Xbox; the default family
  with no identified pad): a direction held with the button, then the
  modifier, then the button, joined by `+`, a hold marked HOLD. A
  direction always shows its stick (`stickGlyph`): R↑ is the right stick
  up, L↓ the left stick down, never a bare arrow; a stick that is the input
  itself is a solid chip (R↓), one held with a button a dashed one;
  'forward' and 'back' are drawn as the side they are for the fighter's
  facing now (R→, then R← once it turns), so the chip is always the push
  that works. The tile's accessible name says it in words (`bindingText`,
  `activationText`: "Right stick forward"). A change of device or pad
  family, a saved layout changing (`controllerProfiles`), the language
  changing, or the fighter turning while one of its inputs points forward
  or back redraws the inputs, never the tiles.
- **The wheel** turns with `Fighter.grounded` (`data-place` on the wheel;
  the stylesheet's transforms and opacity do the rest, retargeting a
  change mid-turn, at once with reduced motion).
- **Cooldowns and restrictions** are read each frame through
  `abilityStatus` from the combat state ([combat](combat.md#cooldowns)):
  `cooling` (a 3 s or 5 s cooldown, from its release: sweep and seconds),
  `restricted` (spent for this airtime, free fall, no Energy while
  exhausted for a move that costs it, a technique held back until its
  fighter is in the danger it needs (`danger`: its Launch Point under the
  technique's `minLaunchPoint`, [combat](combat.md#techniques); #0009's
  Air Sphere), or missing art: muted, no countdown; `data-restriction`
  says which) or `ready`. There is no repeat-delay
  state: an ordinary move has no cooldown at all. Only changed values
  reach the DOM.
  The touch controls show the same states on their own buttons
  ([below](#touch-controls-live-move-state)).
- **Screens.** `BattleScreen.syncAbilityHud` and
  `PracticeGroundScreen.syncAbilityHud` show it for Player 1 after each
  frame (`AbilityHUD.show`), hide it at a result and in Watch Mode, and
  clear it on leaving; the pause menu and Practice Ground's menu and
  rosters fade it out (CSS). While it shows (not on a touch screen) the
  screen sets `hudCooldownsFor` on its Battle or practice session, so the
  rings over Player 1 step aside ([rendering](rendering.md#fighter-status)).

## Game controllers

**Supported controllers.** PlayStation (DualShock 4, DualSense) and Xbox
(Xbox One, Xbox Series, and Xbox 360 pads, which share their layout)
controllers, read through the browser's Gamepad API in its standard
mapping. Identification is conservative (`identifyController`): the USB
vendor id first (Sony is PlayStation, Microsoft is Xbox), then a product
name, then XInput (the Xbox protocol itself). A Nintendo or generic pad, a
bare "Wireless Controller" with no vendor, or a supported pad the browser
exposes without the standard mapping is listed as unsupported, with its
reason, and never given a layout. Buttons go by position under one
normalized name (`south`, `east`, `west`, `north`, `l1`, `r1`, `l2`, `r2`,
`select`, `start`, `l3`, `r3`, the D-pad), so one layout serves both
families; the interface names them as the connected controller does
(Cross / A, Circle / B, Square / X, Triangle / Y, L1 / LB, R1 / RB, L2 / LT,
R2 / RT, L3 / LS, R3 / RS, Options / Menu), never one family's names for the
other's buttons.

**Connections.** Up to four supported controllers are active at once, in
the order they were first seen; a fifth stays inactive (no menus, no play)
until one of the four goes. Four connections are a limit, not multiplayer:
one controller is Player 1's and only it is ever read, never several merged.
Player 1 is the controller the player chose in Controller Connections
(whenever it is connected: it gets Player 1 back as it reconnects), else
the one that has it, else the first active one. Lost, its held inputs are
let go at once (no endless run, no stuck Shield, no Dash), and the next
controller takes over. Browsers expose a controller only after a press on
it, may hide it while the page is out of focus (everything is let go then,
and what is still held when focus returns is no press), and may lack the
Gamepad API or block it: the status then reads disconnected and the
dialog says why; nothing throws.

**Home's controller button** carries the status, bottom right: green with
a check (one to four connected), red with a cross (none), orange with an
exclamation mark (more than four), one at a time, updated live, and in the
button's name ("Controller connections: Connected"). It opens **Controller
Connections**: the count (out of four), the status, each controller (its
number, name, family, status and assignment: Player 1, Available or
Inactive past the limit) with **Use for Player 1** on the available ones,
unsupported devices with their reason, the too-many warning, and
**Reconnect**, which really queries the browser again (new controllers
found, lost ones removed, the count, assignments, indicator and list
brought up to date) and says what it found. It never reloads the game,
touches a setting or pretends to connect hardware: it tells the player to
press a button on the controller if none shows.

**Menus.** The D-pad moves focus (with repeat), Cross / A confirms,
Circle / B goes back, Options / Menu is Start, and the right stick scrolls
the panel under the cursor, whatever a fighter's layout says. The left
stick moves the **circular controller cursor** (`js/ui/controller-cursor.js`,
part of `MenuNavigator`, never a second navigation engine): a ring with a
centre dot, eased in from a radial deadzone to a top speed that is a share
of the viewport per second, stopping quickly and kept on screen. Over an
enabled item of the active scope (the screen, or the top dialog) it
focuses it as a mouse hover does, and Cross / A activates what it is on;
nothing outside the scope is ever reached, so nothing passes through a
dialog. With the D-pad the cursor glides onto the newly focused item. It
shows only while the controller navigates a menu; the keyboard, the mouse,
touch and play hide it. The item under it wears `.is-cursor-target`, the
same look as a mouse hover, only while the cursor is over it: it goes when
the cursor moves off, hides, or a dialog opens or closes.

**What can be bound.** Every button of the standard mapping: the four face
buttons, L1 / R1, the analog L2 / R2 (pressed past half their travel, let
go below a third, so a trigger resting half way never flickers), the D-pad's
four sides, L3 / R3 (the stick clicks), Create / Share / View and
Options / Menu; and both sticks, each on its own, pushed up, down, left,
right, left or right, forward (the way the fighter faces) or back. The
centre button (PS, Xbox, the standard mapping's 17th) and the DualSense's
touchpad are not offered: the system reserves the first on most platforms
and the standard mapping does not include the second, so neither can be
read reliably. Menus keep their own fixed controls whatever the gameplay
layout says (below), so no layout can lock a player out of a menu; Pause is
always a button, and Esc, P and the touch pause button always pause.

**A binding** is `{ button, modifier, stick, direction, activation }`
(`js/data/controller-profiles.js`): the button pressed, or none when a stick
pushed is the input itself (a *stick input*: "Right stick up"); a button
held first (`modifier`, for a button or a stick input: "R2 + Square",
"L2 + Right stick up"); a direction and the stick it is read on, always
named (`stick`: `leftStick`, `rightStick`, `dpad`, or `leftStickDpad`, the
left stick or the D-pad), held as the button goes down ("Right stick
down + Square") or, with no button, pushed; and how it activates. Movement's
binding is its source alone (`leftStick`, `dpad`, `leftStickDpad`,
`rightStick`): what moves the fighter, and nothing else. No other binding
reads it, so changing what moves the fighter never moves an attack's
direction to another stick, and the stick that does not move is free for
actions of its own. Which actions take what: every move takes any button,
a direction, a stick input, a modifier, a press or a hold; Jump, the Shield
and the Fast fall stay held (continuous), on a button or a stick; the Dash
takes a button or a stick input (pushed left or right, it Dashes that way)
but no direction to hold, since its button already reads the movement
stick; the Deflect a press or a hold; Pause a press of a button.

**Play.** Each sample is resolved for the fighter being played, as it is
at that step (on the ground or in the air, its facing), through that
fighter's controller profile (`js/data/controller-profiles.js`: the
player's saved layout for its id, else its recommended one), into the same
codenames a keyboard sends (`js/core/controller-resolver.js`). The Fighter
decides what they do, exactly as for the keyboard. The rules:

- **One owner per press.** Each press (of a button, or of a stick pushed in
  a direction) goes to at most one action, which owns it until it is let
  go. A held action (Jump, the Shield, a Fast fall on a button) is held
  only while its own press is.
- **Modifier first.** A button pressed, or a stick pushed, while a modifier
  is held (R2 then Square, or both in the same sample) is that combination
  and nothing else: a combination's button never raises the Shield, even
  once the modifier is let go (release and press it again). Where the
  combination means nothing in this place the press does nothing. A
  combination is never read back into an earlier press (Square then R2 is
  Square), and plain presses never wait for a possible modifier: no
  ordinary action is delayed.
- **Directions.** A direction is read on its own stick, never on whatever
  moves the fighter: "Right stick down + Square" is never "Left stick
  down + Square". Among one press's bindings, a stick direction (forward
  and back included) beats left-or-right, which beats anywhere. A stick
  points past `DIRECTION_DEADZONE` (half its travel) the way its dominant
  axis does; an exact diagonal reads vertical; 'forward' and 'back' are
  read against the fighter's facing at that step. Running and a
  continuous stick input (the Fast fall on the stick) need `RUN_THRESHOLD`
  (0.45) of travel on their axis. A directional press never doubles as a
  held stick input on the same side of the same stick on its own step.
- **Stick inputs.** Each stick (and the D-pad) is read apart, so both
  sticks can be pushed at once, a plunge on the right stick while the left
  one drifts and fast-falls. A push past `DIRECTION_DEADZONE` is one press,
  in the one direction its dominant axis gives as it goes out, and stays
  that press whatever the stick does until it comes back under
  `STICK_RELEASE` (0.35): a stick held never repeats, a wobble at the edge
  never presses again, rolling round to another side is still the first
  push, and drift near the middle never presses at all. A stick input
  bound to the Dash Dashes the way it was pushed (left or right).
- **Activation.** `press` acts as the input goes down; `hold` once it has
  been held `HOLD_THRESHOLD` (a tap does nothing); `continuous` holds its
  control while held. Nothing repeats while held. The Shield is always held
  (never a toggle), Jump keeps its higher jump when held, Pause is a press.
- **Context.** A ground action is never chosen in the air, nor an air
  action on the ground. A controller's combat presses say where they were
  made for (`pressedOnGround` / `pressedInAir` in the snapshot), and the
  Fighter never lets one buffered for the ground come out in the air, or
  the reverse (`pressPlace`); keyboard, touch and CPU presses make no such
  claim and behave as ever.
- **Nothing leaks.** Menus never resolve presses. As play starts or
  resumes, as the fighter changes (Practice Ground), and as Player 1's
  controller changes, every button and every stick held is stale until let
  go (the Cross that confirmed Resume never jumps, a stick held through the
  pause menu raises no Shield it is bound to; a stick held still moves the
  fighter), and presses made for another fighter are dropped. The Pause
  binding asks for the pause menu and never reaches the fighter. In Watch
  Mode nobody plays: the controller only navigates.

### Universal recommended controls

The same for every fighter, chosen together as one layout for the hands, so
a player who switches fighters never relearns how to move, jump, Dash or
defend:

| Action | PlayStation | Xbox | Why |
| --- | --- | --- | --- |
| Movement | Left stick | Left stick | The left thumb steers, all the time. |
| Jump (and air jumps; held a little longer, higher) | Cross | A | The button every platformer jumps on, under the right thumb. |
| Dash / air dash | R1 | RB | The right index finger: the left thumb aims it (the stick's way, else facing), the right thumb stays on Jump and the attacks, so a Dash flows into a jump or a strike with no hand moved. A bumper's short travel suits a quick, frequent press. |
| Fast fall | Left stick down (in the air) | Left stick down | Push down to fall faster; it also steers a launch down. |
| Shield (held, on the ground) / Deflect (pressed, in the air) | L1 | LB | One guard button on a finger of its own: guarding never takes the right thumb off the attacks (let go and strike at once), the left thumb keeps steering, turning and walking behind it while it is held, the right thumb's Jump jumps straight out of it, and a bumper makes the Deflect's timing crisp. |
| Pause | Options | Menu | The pause button of every game. |

Before, the Dash was on L1 / LB and the guard on Circle / B: guarding held
the right thumb off every attack, and a face button was spent on it. Now
the four face buttons are Jump and three attacks, the bumpers the two
universal tools, and both triggers and the right stick are every fighter's
own.

### Recommended layouts

Each fighter's own moves are authored for it in its definition
(`controller.layout`, see [adding characters](../characters/adding-characters.md#controller-layout)),
one input a move, no combination and no direction held with a button,
chosen for what each move looks like and how it is used, never its attack
number. These are the **comfort rules**, strict for every fighter now and
to come ([the rules and why](../characters/adding-characters.md#the-comfort-rules-strict)):
the registry refuses a layout that breaks a checkable one
(`comfortProblems`), and a layout is redesigned, never a rule relaxed. One language runs through them all: Square / X is the quick strike
on the ground and in the air, Triangle / Y and Circle / B the other
everyday strikes (a string rolls left to right across them), R2 / RT sends
the ranged move, L2 / LT is the Special, and the right stick holds the
moves whose direction the player can see: up for a move that rises, down
for one that drives down or plunges, forward for one sent the way the
fighter faces. Each fighter's specification has the full table and why:
[#0001](../characters/0001.md#controller-layout),
[#0002](../characters/0002.md#controller-layout),
[#0003](../characters/0003.md#controller-layout),
[#0004](../characters/0004.md#controller-layout),
[#0005](../characters/0005.md#controller-layout),
[#0006](../characters/0006.md#controller-layout),
[#0007](../characters/0007.md#controller-layout),
[#0008](../characters/0008.md#controller-layout),
[#0009](../characters/0009.md#controller-layout).

| | Square / X | Triangle / Y | Circle / B | R2 / RT | L2 / LT | Right stick |
| --- | --- | --- | --- | --- | --- | --- |
| #0001 ground | Jab | High Kick | Maximum Blue | Red | Unlimited Void | forward: Hollow Purple |
| #0001 air | Floating Straight | High Kick | Blue | Red Kick | | |
| #0002 ground | One-Two | Rapid Kicks | Spin Attack | Whirlwind | | |
| #0002 air | Homing Attack | | | | | up: Blue Tornado; down: Bounce Attack |
| #0003 ground | Chakra Punch | Heel Drop | Chakra Haymaker | | Mystical Palm Technique | down: Cherry Blossom Impact |
| #0003 air | Leaping Kick | | | | | down: Heavenly Foot of Pain |
| #0004 ground | Dance Combo | Leek Swing | Crescent Kick | Melody | World is Mine | forward: Ievan Polkka |
| #0004 air | Air Dance | | | | | up: Leekspin; down: Stage Dive |
| #0005 ground | Claw Swipe | Long Bite | Phantom Hands | Dark Tendrils | Deadlights | up: Red Balloon |
| #0005 air | Claw Rake | Snapping Jaws | Floating Hands | | | |
| #0006 ground | Power Punch | Tornado Spin | Triple Strike | Heat Vision | Ice Breath | forward: Sonic Scream |
| #0006 air | Flying Kick | Flying Punch | Triple Strike | | | |
| #0007 ground | Street Combo | Uppercut | Sawn-Offs | Pistol | Rocket Launcher | forward: Molotov Cocktail |
| #0007 air | Flying Kick | Hammer Fist | | | | |
| #0008 ground | Jab and Straight | Gum-Gum Gatling | Gum-Gum Balloon | Gum-Gum Pistol | Feast | forward: Gum-Gum Giant Pistol |
| #0008 air | Gum-Gum Stamp | Gum-Gum Rocket | Floating Balloon | | | |
| #0009 ground | Swift Strikes | Fire Kick | | Air Blast | Air Sphere | forward: Freezing Splash; up: Earth Pillar |
| #0009 air | Staff Swing | | | Air Gust | | up: Rising Air Kick |

A fighter with no authored layout gets a safe, conflict-free fallback (the
comfortable inputs in order, one input a move), flagged in the editor as
not designed yet; a fighter's layout may never retune the universal
actions, and a registered fighter whose layout is incomplete, invalid,
uncomfortable (a comfort rule broken) or conflicting (a warning included)
never loads (`assertControllerLayout`).

### Customizing

Settings › Controls › Controller controls › Customize controller controls
opens the fighter roster (all 48 slots; a locked slot never opens), then
the chosen fighter's editor: its portrait, name and the family the buttons
are named for, and every action it has (Movement, Defense, Ground attacks,
Aerial attacks, Special abilities, Other; a category it has nothing in is
left out, so #0002 has no Special abilities), each with its real name, a
line on what it does, its input and activation, and a diagram lighting the
input of the action in focus: its button, its modifier, and its stick
(left or right, each on its own) with the arrow it points; a stick input's
stick lit as the input. Every move row shows the move's own artwork beside
its name, the frame its touch button shows (`mobileAbility` /
`previewFrame` from the fighter's `mobileAbilities`: the ground preview on
its ground row, the air one on its aerial row, a projectile's,
technique's or summon's where authored; mirrored where its clip faces
left), decorative only, with the touch button's glyph where it has none or
its file fails to load (`EditorLayer.rowArt`); Movement, Defense and Pause
rows have none. **Special abilities** holds only the moves the fighter
itself classifies as Special (its `specialAbilities`,
[combat](combat.md#special-abilities)): #0001's Unlimited Void and Hollow
Purple, #0003's Mystical Palm Technique, #0004's World is Mine, #0005's
Deadlights and Red Balloon, #0006's Ice Breath, #0007's Rocket
Launcher, #0008's Feast and Gum-Gum Giant Pistol and #0009's Freezing
Splash and Air Sphere, each tagged Ground or Air. Every other move, a
projectile, a technique or the Whirlwind's tornado included, sits under
Ground attacks or Aerial attacks where it is played. A row's category
never changes its action id, so no binding moves with it.

Choosing an action opens the binding dialog. It listens to Player 1's
controller: the last button pressed is the button, a button held before it
the modifier, and whichever stick (left or right) points as the button goes
down gives the direction, that stick named; a stick pushed out and let go
with no button pressed meanwhile is a stick input (that stick, the way it
was pushed; a button held through it its modifier); for Movement, the stick
or pad used is the source. A stick resting off centre never counts. Every
part can also be set in text with the D-pad, arrows or a click: the button
(or **None (stick only)**), the button held first, the stick a direction is
read on (**None (any direction)** for a button that needs none) and its
direction (up, down, left, right, left or right, forward, back), and the
activation; then Retry, Cancel and Confirm. No controller is needed: with
none connected the dialog says so and the fields do it all. While it
listens the controller only listens: no menu behind it and no gameplay.

**Conflicts** are checked live (`profileConflicts`), by the physical inputs
a binding is made of, not by the button names it mentions:

- an **error** keeps Save (and Confirm) off: two actions set off by the
  same input with the same modifier where both can apply, and nothing
  making one the more specific (the same button with no direction twice;
  directions that can be met at once and are as specific as each other,
  "Left stick down + Square" beside "Right stick up + Square"; the same
  side of the same stick, "Right stick left" beside "Right stick forward";
  a D-pad button beside a stick input on that side of the D-pad); or an
  input the Movement source moves with (the left and right of its stick or
  D-pad, as a button, a modifier or a stick input; its up and down are
  free, so the D-pad's up can be Jump while the D-pad moves);
- a **warning** only informs: a modifier that is also another action's own
  button (holding it triggers that action first), or a direction held with
  a button that is, on that stick, another action's stick input (pushing
  it triggers that action first).

Shared inputs that resolve one way are not conflicts: the same input on the
ground and in the air, the Shield and the Deflect, a combination beside its
plain button, a direction beside none, left-or-right beside left, forward
beside back, up on the left stick beside up on the right one.

**Save** stores the whole layout for that fighter alone, under its id
(`controllerProfiles` in the settings, version 6); **Cancel** discards
unsaved changes after asking; **Restore defaults** asks, then puts that
fighter alone back on its recommended layout, today's. Saved layouts load
on every visit and play at once; a malformed stored binding falls back to
the recommended one, never the rest of the settings or another fighter's
layout. A stored binding for an action id that no longer exists
(`ACTION_ID`; the retired `transform` button's, on the ground and in the
air) is dropped as the settings are read, every other binding kept as
saved.

### Saved layouts

Layouts saved before the sticks were named (settings versions 4 and 5) had
no `stick`: a direction was read on whatever moved the fighter. Reading
them, the settings upgrade each fighter's profile for that fighter
(`upgradeStoredProfiles`):

- every binding takes today's shape, its direction on the stick or pad that
  moved the fighter in that profile, so it plays exactly as it did;
- the player's own choices are kept: every binding that differs from what
  that fighter recommended then (the old universal defaults,
  `LEGACY_UNIVERSAL_DEFAULTS`, and the fighter's own old layout, kept in
  its definition as `controller.previous`);
- the bindings that were only the old recommended ones give way to today's
  recommended layout, as long as that mix conflicts with nothing; where it
  would, the whole layout the player played with is kept as it was;
- a profile with no choice of the player's own is dropped: that fighter
  plays with today's recommended layout, as does every fighter never
  customized. A profile for a fighter the game does not know is kept as
  saved, in today's shape.

One fighter's profile never touches another's, and nothing is written
until a setting changes.

## Interaction states

Four states, never confused (`js/core/input-modality.js`, the rules in
`css/base.css`):

- **Default:** the resting look. Opening a screen or a dialog focuses its
  default control for the keys and the controller, but that focus shows
  nothing while the last input was a pointer.
- **Hover:** only while a real mouse pointer is over a control (CSS
  `:hover`), or the controller cursor (`.is-cursor-target`); it goes the
  moment the pointer leaves. Every hover rule starts with
  `:where(html:not(.is-touch-input))`, so a finger never leaves a sticky
  hover, and disabled buttons take none.
- **Focus:** the focus ring shows only for keyboard and controller
  navigation. Every ring rule starts with
  `:where(html:not(.is-pointer-input))`: focus moved by script, by a press
  or by the mouse (the navigator moves focus on hover, invisibly, so the
  keys pick up where the pointer was) shows nothing.
- **Selected:** a saved or chosen value (`.is-current`, `.is-selected`,
  `.is-active`, `aria-checked`), whatever the input.

The modality is `html[data-input]`: `mouse` (a mouse or pen moved or
pressed: `is-pointer-input`), `touch` (a finger pressed:
`is-pointer-input is-touch-input`), `keyboard` (any key but a modifier
alone) or `gamepad` (a controller drove a menu): neither class, so the
ring shows. A page starts in mouse modality (touch where the primary
pointer cannot hover), so nothing is ringed until a key or a controller is
used.

## Dialog layers

The navigator's scopes are the open dialogs, oldest first, and it applies
them as a stack (`MenuNavigator.syncLayers`):

- each top-level dialog overlay (one outside the screen) sits one layer
  above the dialog opened before it, from z-index 60 (`LAYER_BASE`), set
  inline while it is open and removed as it closes; none has a fixed place
  of its own, so any supported nesting order works (Settings › Controller
  controls › roster › editor › binding, or the editor's confirmations, or
  the pause menu's Return to home?);
- everything beneath the top dialog is inert (pointer, keyboard and
  assistive technology), the screen included once the top dialog is not
  part of it; a dialog inside the screen (the pause, result and Practice
  dialogs) leaves the screen live and stacks by its own stylesheet;
- commands (arrows, Enter / Cross, Escape / Circle, Start) reach the top
  dialog alone, and a dialog hidden without closing its scope is dropped;
- when a dialog closes, the one beneath is live again and, unless the
  closing code put focus somewhere live, gets back the control it had
  (else its default); when the last one closes on a navigable screen,
  focus goes back to what opened it.

## Tests

- [`tests/interface/ability-hud.test.mjs`](../../tests/interface/ability-hud.test.mjs):
  the ability HUD on real fighters: each fighter's rows (ground-only moves
  never in the air, nothing but the fighter's own buttons), the wheel and rapid changes of
  place, the art and its fallback, keyboard keys, PlayStation and Xbox
  glyphs, a saved layout, device switching, cooldowns through changes of
  place and on recovery, from the release only, no repeat delay, the Energy
  restriction, airtime restrictions, a repeated
  press lighting nothing (no queued look or wording), a fighter swap, which
  screens show it, its stylesheet and the arena's rings.
- [`tests/systems/controller-devices.test.mjs`](../../tests/systems/controller-devices.test.mjs):
  identification across browsers, button names, zero / one / four / five
  controllers, unsupported devices, disconnection, reconnection, Player 1,
  Reconnect, no or blocked Gamepad API, focus loss, triggers.
- [`tests/systems/controller-profiles.test.mjs`](../../tests/systems/controller-profiles.test.mjs):
  the actions from each definition, the universal defaults, every playable
  fighter's authored layout (one input a move, the shared button language),
  the fallback, bindings (every button, either stick, stick inputs,
  modifiers), physical inputs, conflicts and valid reuse, stored profiles,
  the upgrade of profiles saved before, and no fighter named in the shared
  engine.
- [`tests/systems/controller-input.test.mjs`](../../tests/systems/controller-input.test.mjs):
  the controller in play on real Fighters: universal controls (R1 Dashing,
  L1 guarding, a Dash into an attack, the guard dropped into a strike),
  every #0001 and #0002 default, every playable fighter's whole layout and
  shared universal layout, the right stick (one press per push, deadzone,
  release, wobble, forward by facing, both sticks at once), combinations on
  buttons and sticks, directions read on their own stick at their
  boundaries, ground / air context, custom bindings and every universal
  action remapped, menus (sticks included), a lost controller, a fighter
  change.
- [`tests/interface/ui-consistency.test.mjs`](../../tests/interface/ui-consistency.test.mjs):
  the interaction states and the input modality, the dialog stack (order,
  inert layers, Back, focus coming back, stale scopes), and the shared
  look: sentence case, one glass and dim, the menu corners.
- [`tests/interface/controller-ui.test.mjs`](../../tests/interface/controller-ui.test.mjs):
  the Home indicator, Controller Connections, the cursor, Settings ›
  Controller controls, the editor (its move art for both fighters, ground
  and air, mirroring and fallbacks), binding capture (combinations, a
  direction on either stick, a stick input, a stick input with a modifier,
  drift ignored, the fields with no controller), the diagram lighting
  either stick on its own, in both languages.
- [`tests/systems/request-devices.test.mjs`](../../tests/systems/request-devices.test.mjs):
  the keyboard, touch and a controller making the same requests: a held
  button is one press, a repeat during the attack nothing and a press
  during its cooldown never another move (on the ground and in the air),
  a different attack pressed during the Jab never cutting it on any
  device, Run never a request.

- [`tests/interface/controls-ui.test.mjs`](../../tests/interface/controls-ui.test.mjs):
  both layouts, the art on every button for both fighters, fallbacks, names
  in both languages, multi-touch, one press per touch (a pointer's own
  trailing click never a second one; assistive activation kept), and the
  live move state (cooldowns from their release, no repeat delay, a spent
  or unpaid move, nothing queued; nothing written when nothing changed).
- [`tests/interface/touch-layout.test.mjs`](../../tests/interface/touch-layout.test.mjs):
  custom layouts and the editor.
- [`tests/systems/codenames.test.mjs`](../../tests/systems/codenames.test.mjs):
  the codename vocabulary and the retired names that must stay gone.
- [`tests/systems/mash-combo.test.mjs`](../../tests/systems/mash-combo.test.mjs):
  a Mash Combo from the keyboard, touch, a DualSense, an Xbox pad and a
  custom binding, through the real `InputManager`; a key's autorepeat
  never a press.
- [`tests/systems/dash.test.mjs`](../../tests/systems/dash.test.mjs),
  [`down.test.mjs`](../../tests/systems/down.test.mjs) and
  [`explicit-mouvement.test.mjs`](../../tests/systems/explicit-mouvement.test.mjs):
  press edges and Dash requests from every device.

These run on mocked controllers (`tests/helpers/fake-gamepad.mjs`); real
PlayStation and Xbox hardware still needs a browser check.
