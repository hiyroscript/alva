# Input and controls

Every device sends the same control codenames, the same for every
fighter; a fighter only decides what its combat buttons do. The product
rules are [`ALVA_SPEC.md`](../../ALVA_SPEC.md) §7.4 (input), §6.10
(Settings) and §6.10a (the touch layout editor).

| Module | Owns |
| --- | --- |
| [`js/config.js`](../../js/config.js) | The codenames (`ACTIONS`, `COMBAT_BUTTONS`, `NUMBERED_ATTACKS`, `MOVES`), their neutral names (`ACTION_LABELS`), keyboard `bindings` and `menuBindings`. |
| [`js/core/input-manager.js`](../../js/core/input-manager.js) | `InputManager`: keyboard, gamepad and touch state merged into one snapshot per step (`sample()`), with one-step `…Pressed` edges (never key auto-repeat) and one-tap Dash requests (`queueTouchMouvement`). |
| [`js/game/fighters/fighter-controller.js`](../../js/game/fighters/fighter-controller.js) | `PlayerController` (Player 1 reads the snapshot), `blankInput`, `HELD_CONTROLS`. |
| [`js/ui/touch-controls.js`](../../js/ui/touch-controls.js) | `TouchControls`: the two touch layouts, multi-touch, the fighter's art on its buttons (`setCharacter`, `showArt`), airborne art (`setAirborne`) and custom placement (`applyLayout`). |
| [`js/ui/mobile-abilities.js`](../../js/ui/mobile-abilities.js) | Which buttons a fighter has (`abilityPresence`, from its `actions`), and each button's name and frame (`previewFrame`, from its `mobileAbilities`). |
| [`js/core/touch-layout.js`](../../js/core/touch-layout.js) | Stable control ids, layout geometry and sanitizing. |
| [`js/ui/touch-layout-editor.js`](../../js/ui/touch-layout-editor.js) | The layout editor. |
| [`js/core/settings.js`](../../js/core/settings.js) | The saved Mobile Controls choice and each layout's custom placement (the only module touching storage). |
| [`js/core/menu-navigator.js`](../../js/core/menu-navigator.js) | Menu navigation with one shared highlight for keyboard, mouse, touch and gamepad; menus read their own bindings, never gameplay edges. |

## Controls

| Action | Codename | Keyboard | Gamepad | Touch |
| --- | --- | --- | --- | --- |
| Move left / right | `runLeft` / `runRight` | A D or ← → | D-pad / left stick | Joystick, or Classic ◀ ▶ |
| Dash (on the ground) / air dash (in the air) | a double tap of `runLeft` / `runRight`; `mouvementLeft` / `mouvementRight` on touch | double-tap A / D or ← / → | double-tap the D-pad or stick | Joystick: one tap of **Left mouvement** / **Right mouvement**; Classic: double-tap ◀ or ▶ |
| Down (fast fall in the air; steer a launch down) | `down` | S or ↓ | D-pad down / stick down | none |
| Jump (tap: normal; held a little longer: higher; again in the air: an air jump, twice: the triple jump) | `jump` | W, Space or ↑ | A / Cross | the upward arrow |
| Extra attack | `extra_attack` | J | X / Square | top of the cluster |
| Transform (reserved) | `transform` | K | Y / Triangle | dashed button |
| Shield (on the ground, held) / Deflect (in the air, a fresh press) | `shield` | L | RB / RT | **Shield**, named and drawn **Deflect** while airborne |
| Attack 1 to Attack 5 | `attack1` … `attack5` | U I O M , | B, LB, LT, L3, R3 | slots 1 to 5 |
| Pause (the Practice menu in Practice Ground) | `pause` | Esc or P | Start | the timer / pause or More button |

A control's codename is its one internal name: its key in
`CONFIG.bindings` and `ACTIONS`, its field in every input snapshot (with a
`…Pressed` edge), and for the combat buttons its key in a fighter's
`actions`. A button a fighter has no move on keeps its key and pad button
bound for everyone and does nothing for that fighter; its touch button is
hidden. What each fighter's buttons do is in its
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
  two one-tap Dash buttons above it.
- **Classic Buttons**: Left and Right with thumb sliding; double-tap to
  Dash.

Both share the lower-right cluster: the numbered attack buttons fill fixed
slots, as many as the fighter has numbered attacks (`attackSlots`:
`attack1` in slot 1, `attack2` in slot 2, then the rest in order), round
Transform and Shield:

```
          [4]  [5]  [EXTRA]
       [3]  [TRANSFORM] [SHIELD]
          [1]  [2]  [JUMP]
```

The extra attack and numbered attack buttons show a frame of the
fighter's own art, chosen in its `mobileAbilities`
(`preview: { animation, frame }`, `previews.air` for a distinct airborne
move, `collection: 'projectileAnimations'` to pick projectile art, an
optional `fallbackIcon`); Jump, Shield, Transform, the arrows, the joystick
and the Dash buttons keep their universal glyphs (the Shield button's turns
to the Deflect's, with the name **Deflect**, while the fighter is in the air
and has a Deflect: the same button sending `shield`). A button with nothing to
show falls back to a neutral glyph with its name and input unchanged.
Presentation never changes a button's codename or what it sends. In the
air, ground-only abilities stay visible but dimmed (`aria-disabled`).

**Custom layouts.** Settings → Controls → Customize touch controls opens
the editor over a still battle screen: every control can be moved and
resized (70 % to 180 %), by pointer, keyboard or gamepad, and all five
numbered buttons show (in their neutral look where a fighter has none)
because the layout is every fighter's. Positions are stored as fractions
of the safe touch area and sizes as scales, keyed by control id, never by
label or slot; each layout keeps its own arrangement.

## Tests

- [`tests/interface/controls-ui.test.mjs`](../../tests/interface/controls-ui.test.mjs):
  both layouts, the art on every button for both fighters, fallbacks, names
  in both languages, multi-touch.
- [`tests/interface/touch-layout.test.mjs`](../../tests/interface/touch-layout.test.mjs):
  custom layouts and the editor.
- [`tests/systems/codenames.test.mjs`](../../tests/systems/codenames.test.mjs):
  the codename vocabulary and the retired names that must stay gone.
- [`tests/systems/dash.test.mjs`](../../tests/systems/dash.test.mjs) and
  [`down.test.mjs`](../../tests/systems/down.test.mjs): press edges from
  every device.
