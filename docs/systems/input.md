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
| [`js/data/controller-profiles.js`](../../js/data/controller-profiles.js) | Controller profiles: the actions a fighter can bind (`controllerActions`, from its definition), the universal defaults, each fighter's recommended layout (its own `controller.layout`, else a safe fallback), binding checks, conflicts and stored-profile sanitizing. |
| [`js/core/controller-resolver.js`](../../js/core/controller-resolver.js) | `ControllerResolver`: Player 1's presses resolved, for the fighter and where it is, into control codenames (combinations, directions, activations, one owner per press). |
| [`js/ui/controller-cursor.js`](../../js/ui/controller-cursor.js) | The circular controller cursor, part of `MenuNavigator`. |
| [`js/ui/controller-dialog.js`](../../js/ui/controller-dialog.js), [`js/ui/controller-editor.js`](../../js/ui/controller-editor.js), [`js/ui/controller-glyphs.js`](../../js/ui/controller-glyphs.js) | Controller Connections; Settings › Controls › Controller controls (roster, editor, binding dialog); button names, binding phrases and the controller diagram. |
| [`js/game/fighters/fighter-controller.js`](../../js/game/fighters/fighter-controller.js) | `PlayerController` (Player 1 reads the snapshot; it alone carries the player's Combat Assist and Combo Assist settings, and its presses alone may cut its own attack short, see [combat](combat.md#the-players-requests)), `blankInput`, `HELD_CONTROLS`. |
| [`js/ui/touch-controls.js`](../../js/ui/touch-controls.js) | `TouchControls`: the two touch layouts, multi-touch, the fighter's art on its buttons (`setCharacter`, `showArt`), airborne art (`setAirborne`) and custom placement (`applyLayout`). |
| [`js/ui/mobile-abilities.js`](../../js/ui/mobile-abilities.js) | Which buttons a fighter has (`abilityPresence`, from its `actions`), and each button's name and frame (`previewFrame`, from its `mobileAbilities`). |
| [`js/core/touch-layout.js`](../../js/core/touch-layout.js) | Stable control ids, layout geometry and sanitizing. |
| [`js/ui/touch-layout-editor.js`](../../js/ui/touch-layout-editor.js) | The layout editor. |
| [`js/core/settings.js`](../../js/core/settings.js) | The saved Mobile Controls choice and each layout's custom placement, Combat Assist and Combo Assist on or off, and each fighter's saved controller layout (the only module touching storage). |
| [`js/core/menu-navigator.js`](../../js/core/menu-navigator.js) | Menu navigation with one shared highlight for keyboard, mouse, touch and the controller (its D-pad, buttons and cursor); menus read their own bindings, never gameplay edges. |

## Controls

| Action | Codename | Keyboard | Controller (recommended) | Touch |
| --- | --- | --- | --- | --- |
| Move left / right | `runLeft` / `runRight` | A D or ← → | Left stick | Joystick, or Classic ◀ ▶ |
| Dash (on the ground) / air dash (in the air) | `mouvementLeft` / `mouvementRight` (request-only) | Q / E | L1 / LB: the way the stick points, else the way the fighter faces | Both layouts: one tap of **Left movement** / **Right movement** |
| Down (fast fall in the air; steer a launch down) | `down` | S or ↓ | Left stick down | none |
| Jump (tap: normal; held a little longer: higher; again in the air: an air jump, twice: the triple jump) | `jump` | W, Space or ↑ | Cross / A | the upward arrow |
| Extra attack | `extra_attack` | J | the fighter's own layout | top of the cluster |
| Transform (reserved) | `transform` | K | none | dashed button |
| Shield (on the ground, held) / Deflect (in the air, a fresh press) | `shield` | L | Circle / B (held on the ground, pressed in the air) | **Shield** glyph always; named **Deflect** while airborne when supported |
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

## Touch controls

Touch controls show on touch-first devices only (a coarse pointer or an
observed touch), never because a desktop window is narrow; Watch Mode,
where nobody plays, hides them. Two layouts, chosen under Settings →
Controls → Mobile Controls:

- **Joystick** (the default): one round joystick holding `runLeft` /
  `runRight` past a small deadzone (digital, like every other input), with
  two one-tap Mouvement/Dash buttons with double directional arrows above it.
- **Classic Buttons**: single Left and Right Run arrows with thumb sliding,
  with smaller double-arrow Mouvement buttons directly above their matching Run buttons.

Run presses and joystick flicks never request Mouvement. Keyboard and controller
requests are rising edges, never auto-repeat or held actions: one press of the
controller's Dash button requests once, toward the stick's side (past a third of
its travel) or, with the stick near the middle, the way the fighter faces; held,
it never requests again. Touch Mouvement holds no Run input.
Opposing simultaneous requests cancel. The CPU emits the same explicit request
fields; normal CPU running never Dashes.

Both share the lower-right cluster: the numbered attack buttons fill fixed
slots, as many as the fighter has numbered attacks (`attackSlots`:
`attack1` in slot 1, `attack2` in slot 2, then the rest in order), round
Transform and Shield:

```
          [4]  [5]  [EXTRA]
       [3]  [TRANSFORM] [SHIELD]
          [1]  [2]  [JUMP]
```

All action buttons, including Jump and Extra Attack, share the same diameter,
border, background, shadow and pressed feedback. Reserved/unavailable states
still communicate ability status. The extra attack and numbered attack buttons show a frame of the
fighter's own art, chosen in its `mobileAbilities`
(`preview: { animation, frame }`, `previews.air` for a distinct airborne
move, `collection: 'projectileAnimations'` to pick projectile art, an
optional `fallbackIcon`); Jump, Shield, Transform, the arrows, the joystick
and the Dash buttons keep their universal glyphs. Jump is an upward arrow
without a baseline. Defence always shows the shield glyph, including in the
air; its accessible name becomes **Deflect** when the fighter has one,
with the same button still sending `shield`. A button with nothing to
show falls back to a neutral glyph with its name and input unchanged.
Presentation never changes a button's codename or what it sends. In the
air, ground-only abilities stay visible but dimmed (`aria-disabled`).

**Custom layouts.** Settings → Controls → Customize touch controls opens
the editor over a still battle screen: every control can be moved and
resized (70 % to 180 %), by pointer, keyboard or gamepad, and all five
numbered buttons always show their matching one-to-five pip icons. Every
editor control uses a universal icon and a neutral localized name, regardless
of the selected fighter: Extra Attack uses the ring, Transform the star,
Defence the shield, Jump the upward arrow, and movement the scheme's arrows
or joystick. Gameplay keeps each fighter's authored attack artwork.
Positions are stored as fractions
of the safe touch area and sizes as scales, keyed by control id, never by
label or slot; each layout keeps its own arrangement. Both Classic Mouvement
buttons are independently editable. Older Classic saves retain every existing
custom control; the new buttons use defaults until customized. Reset restores
all four directional controls without changing the other scheme.

**Combat Assist** and **Combo Assist** (Settings → Combat), and the
player's move cancellation, are not part of the input system: no binding,
device or `InputManager` code knows them. Keyboard, controller and touch
presses reach the fighter in the same snapshot as ever, one `…Pressed` edge
per press (a key held, a touch control held or a controller button held is
one press, never a stream: holding never strings attacks), and the Fighter
decides what each press asks for, whether it cuts the player's attack and
whether a melee press closes in, while the player's controller carries the
settings ([combat](combat.md#the-players-requests)). `runLeft` /
`runRight` (the keys, the touch Run buttons and joystick, the stick) only
hold a direction: their press edges request nothing, so Run never cancels
an attack or Combat Assist's approach.

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
touch and play hide it.

**Play.** Each sample is resolved for the fighter being played, as it is
at that step (on the ground or in the air, its facing), through that
fighter's controller profile (`js/data/controller-profiles.js`: the
player's saved layout for its id, else its recommended one), into the same
codenames a keyboard sends (`js/core/controller-resolver.js`). The Fighter
decides what they do, exactly as for the keyboard. The rules:

- **One owner per press.** Each press goes to at most one action, which
  owns the button until it is let go. A held action (Jump, the Shield, a
  Fast fall on a button) is held only while its own press is.
- **Modifier first.** A button pressed while a modifier is held (R2 then
  Square, or both in the same sample) is that combination and nothing
  else: R2 + Square is Red, never the Jab; R2 + Circle is Maximum Blue,
  never the Shield, and its Circle never raises the Shield, even once R2 is
  let go (release and press Circle again). Where the combination means
  nothing (R2 + Circle in the air) the press does nothing. A combination is
  never read back into an earlier press (Square then R2 is the Jab), and
  plain presses never wait for a possible modifier: no ordinary action is
  delayed.
- **Directions.** Among one press's bindings, a stick direction beats
  left-or-right, which beats anywhere (Down + Square beats Square). The
  stick points past `DIRECTION_DEADZONE` (half its travel) the way its
  dominant axis does; an exact diagonal reads vertical. A directional press
  never doubles as the Fast fall on its own step. Running and a Fast fall
  on the stick need `RUN_THRESHOLD` (0.45) of travel on their axis.
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
  controller changes, every button held is stale until let go (the Cross
  that confirmed Resume never jumps), and presses made for another fighter
  are dropped. Options / Menu (the Pause binding) asks for the pause menu
  and never reaches the fighter. In Watch Mode nobody plays: the controller
  only navigates.

**Universal recommended controls**, the same for every fighter: the left
stick moves; Cross / A jumps; L1 / LB is the Dash and air dash (the right
thumb never leaves the attack buttons); the stick pushed down fast-falls
and steers a launch down; Circle / B held is the Shield on the ground and a
fresh press of it the Deflect in the air; Options / Menu pauses. Each
fighter's own moves are authored for it in its definition
(`controller.layout`, see [adding characters](../characters/adding-characters.md#controller-layout)),
chosen for each move, not its attack number:

| #0001 | Recommended | | #0002 | Recommended |
| --- | --- | --- | --- | --- |
| Jab | Square / X | | One-Two | Square / X |
| High Kick | Triangle / Y | | Rapid Kicks | Triangle / Y |
| Red | R2 + Square / RT + X | | Spin Attack | R1 / RB |
| Maximum Blue | R2 + Circle / RT + B | | Whirlwind | R2 + Triangle / RT + Y |
| Unlimited Void | L2 + Triangle / LT + Y | | Homing Attack (air) | Square / X (any way but down; starts the stick's way, else its facing) |
| Hollow Purple | R2 + Triangle / RT + Y | | Bounce Attack (air) | Down + Square / Down + X |
| Floating Straight (air) | Square / X | | Blue Tornado (air) | R1 / RB |
| Red Kick (air) | Triangle / Y | | | |
| Blue (air) | R1 / RB | | | |
| High Kick (air) | L2 + Square / LT + X | | | |

A fighter with no authored layout gets a safe, conflict-free fallback
(face buttons, then R1, then trigger combinations), flagged in the editor
as not designed yet; a fighter's layout may never retune the universal
actions, and a registered fighter whose layout is incomplete, invalid or
conflicting never loads (`assertControllerLayout`).

**Customizing.** Settings › Controls › Controller controls › Customize
controller controls opens the fighter roster (all 48 slots; a locked slot
never opens), then the chosen fighter's editor: its portrait, name and the
family the buttons are named for, and every action it has (Movement,
Defense, Ground attacks, Aerial attacks, Special abilities, Other), each
with its real name, a line on what it does, its input and activation, and a
diagram lighting the input of the action in focus. Every move row shows
the move's own artwork beside its name, the frame its touch button shows
(`mobileAbility` / `previewFrame` from the fighter's `mobileAbilities`:
the ground preview on its ground row, the air one on its aerial row, a
projectile's, technique's or summon's where authored; mirrored where its
clip faces left), decorative only, with the touch button's glyph where it
has none or its file fails to load (`EditorLayer.rowArt`); Movement,
Defense and Pause rows have none. Choosing an action opens
the binding dialog, which listens to Player 1's controller (a button, a
modifier held first, the stick pointing first; for Fast fall a direction
alone; for Movement the stick or pad moved) and can also be set in text with
the D-pad, arrows or a click (button, held modifier, stick direction,
activation), with Retry, Cancel and Confirm. While it listens the
controller only listens: no menu behind it and no gameplay. Conflicts are
checked live (`profileConflicts`): two actions on the same input where both
apply, or a button the Movement source moves with, is an error that keeps
Save off; a modifier that is also another action's own button is a warning.
Shared buttons that resolve one way are not conflicts: the same button on
the ground and in the air (Spin Attack and Blue Tornado, the Shield and the
Deflect), a combination beside its plain button, a direction beside none.
**Save** stores the whole layout for that fighter alone, under its id
(`controllerProfiles` in the settings, version 5); **Cancel** discards
unsaved changes after asking; **Restore defaults** asks, then puts that
fighter alone back on its recommended layout. Saved layouts load on every
visit; a malformed stored binding falls back to the recommended one, never
the rest of the settings.

## Tests

- [`tests/systems/controller-devices.test.mjs`](../../tests/systems/controller-devices.test.mjs):
  identification across browsers, button names, zero / one / four / five
  controllers, unsupported devices, disconnection, reconnection, Player 1,
  Reconnect, no or blocked Gamepad API, focus loss, triggers.
- [`tests/systems/controller-profiles.test.mjs`](../../tests/systems/controller-profiles.test.mjs):
  the actions from each definition, the universal defaults, every playable
  fighter's authored layout, the fallback, bindings, conflicts and valid
  reuse, stored profiles, and no fighter named in the shared engine.
- [`tests/systems/controller-input.test.mjs`](../../tests/systems/controller-input.test.mjs):
  the controller in play on real Fighters: universal controls, every #0001
  and #0002 default, combinations, directions at their boundaries, ground /
  air context, custom bindings, menus, a lost controller, a fighter change.
- [`tests/interface/controller-ui.test.mjs`](../../tests/interface/controller-ui.test.mjs):
  the Home indicator, Controller Connections, the cursor, Settings ›
  Controller controls, the editor (its move art for both fighters, ground
  and air, mirroring and fallbacks) and binding capture, in both languages.
- [`tests/systems/request-devices.test.mjs`](../../tests/systems/request-devices.test.mjs):
  the keyboard, touch and a controller making the same requests: a held
  button is one press, Combo Assist and move cancellation from each, Run
  never a request.

- [`tests/interface/controls-ui.test.mjs`](../../tests/interface/controls-ui.test.mjs):
  both layouts, the art on every button for both fighters, fallbacks, names
  in both languages, multi-touch.
- [`tests/interface/touch-layout.test.mjs`](../../tests/interface/touch-layout.test.mjs):
  custom layouts and the editor.
- [`tests/systems/codenames.test.mjs`](../../tests/systems/codenames.test.mjs):
  the codename vocabulary and the retired names that must stay gone.
- [`tests/systems/dash.test.mjs`](../../tests/systems/dash.test.mjs),
  [`down.test.mjs`](../../tests/systems/down.test.mjs) and
  [`explicit-mouvement.test.mjs`](../../tests/systems/explicit-mouvement.test.mjs):
  press edges and Dash requests from every device.

These run on mocked controllers (`tests/helpers/fake-gamepad.mjs`); real
PlayStation and Xbox hardware still needs a browser check.
