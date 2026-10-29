# Conventions

## Codenames

[`codename_rule`](../../codename_rule) is the authoritative naming
contract; it applies to every fighter.

- **Controls** have one codename each, the same for every fighter:
  `runLeft`, `runRight`, `down`, `jump`, `shield`, `extra_attack`,
  `attack1` … `attack5`, `pause`, and the touch-only
  `mouvementLeft` / `mouvementRight`. Each is the key in
  `CONFIG.bindings`, the field in every input snapshot (with a
  `…Pressed` edge), and for combat buttons the key in a fighter's
  `actions`.
- **Moves** go by `attack1` … `attack5`, `midair_attack1` …
  `midair_attack5` and `extra_attack`. A
  number names a move's slot, never its role: whether `attack3` is an
  ordinary attack, a summon or a technique is the fighter's loadout.
  Never name an internal concept after one fighter's ability (a pull is a
  pull, not "Blue"; the technique runtime's cast is not "the Void").
- **Art files** are `assets/characters/<id>/<id>_<codename>_<frame>.png`,
  frames from 1. Whatever an attack creates is `<attack>_object`.
- **`mouvment`** (the Dash's clip and its art, and `midair_mouvment`) is
  spelled that way on purpose and is part of the contract; the touch
  controls' `mouvementLeft` / `mouvementRight` keep their own spelling.
  Universal movement (`js/data/movement.js`, `fighter.movement`) is a
  different thing with an ordinary name.
- **Player-facing names** (Jab, Hollow Purple, Whirlwind) live in a
  fighter's `abilityNames` and `mobileAbilities` only.
- Retired names (listed in
  [`tests/systems/codenames.test.mjs`](../../tests/systems/codenames.test.mjs))
  must not come back; only [`UPDATES.md`](../../UPDATES.md) may mention
  them, as history, and the code and its guides only where older saved
  settings holding one are read.

## Code

- Vanilla JavaScript ES modules, no build step and no dependencies. Every
  import and URL is relative. (The itch.io export in `tools/itch/` is
  development tooling with one dev dependency, esbuild; the game never
  imports it: [the itch.io release](itch-release.md).)
- Shared code reads per-fighter values from the fighter's definition and
  never checks a fighter's id. A comment may give a fighter's value as an
  example; say whose ("e.g. #0001's").
- Module introductions say what the module owns, what it reads, what it
  exposes and the constraints that keep gameplay compatible (see
  `js/game/fighters/movement.js` or `js/data/characters.js`). Comments
  explain why and what a rule is for, not what the next line does.
- The simulation is fixed-step and deterministic: no wall-clock time, no
  unseeded randomness in gameplay (the CPU gets an injected seeded RNG),
  and timing comparisons against step boundaries use a small epsilon
  (`PHASE_EPSILON` and its local copies).
- Missing art is refused and logged, never faked.
- Every player-facing string goes through a translation key
  ([localization](../systems/localization.md)).
- Only `js/core/settings.js` touches storage.

## Stylesheets

The stylesheet is split by area into `css/`, and `index.html` links the
parts in cascade order:

| Part | Styles |
| --- | --- |
| `base.css` | Design tokens (`:root`), reset, screens and transitions. Always first. |
| `components.css` | Shared controls, the menu screen frame, panels. |
| `splash.css`, `home.css`, `setup.css`, `discover.css`, `settings.css` | Their screens (setup: Select Mode, Difficulty, Fighter, CPU and Stage; settings: the dialog, the language chooser and the touch layout editor). |
| `battle.css`, `touch-controls.css`, `battle-overlays.css`, `practice.css`, `ability-hud.css` | Battle chrome and the HUD; the touch controls; banners and the pause and result panels; Practice Ground; the ability HUD (Player 1's moves in the bottom-right corner). |
| `overlays.css` | Loading, the dialogs' shared contract (one dim, one glass, the dialog layer) and the confirm, choice, information and install dialogs, the rotate prompt. |
| `responsive.css` | Breakpoint adjustments. Always last. |

Later parts may override earlier ones, so a rule's place matters: add a
rule to the part for its area, and keep a rule that overrides another
area's after it. Moving a rule to an earlier part can change the cascade.
No `url()` in the CSS (paths would resolve from `css/`), no preprocessor,
no framework. [`tests/interface/stylesheets.test.mjs`](../../tests/interface/stylesheets.test.mjs)
checks that every part is linked once, base first and responsive last.

Shared rules every part follows
([`tests/interface/ui-consistency.test.mjs`](../../tests/interface/ui-consistency.test.mjs)
checks them):

- **Case.** No `text-transform`: every label shows its translation as
  written, in sentence case.
- **Hover** starts with `:where(html:not(.is-touch-input))` and pairs with
  `.is-cursor-target` (the controller cursor's hover); a button's hover
  needs `:enabled`. **The focus ring** starts with
  `:where(html:not(.is-pointer-input))`. `:where()` keeps the rule's
  specificity what it would be without the prefix (see
  [Interaction states](../systems/input.md#interaction-states)).
- **Corners.** A rectangular menu control or dialog panel uses
  `var(--radius-menu)` (3 px, the Home Play button's); pills and circles
  keep theirs.
- **Dialogs.** A dialog's panel is `.glass .glass--panel` over the shared
  `var(--scrim)` dim; its own rules set size and layout, never its fill,
  opacity, blur or z-index (the dialog stack places it).

## Documentation

- [`ALVA_SPEC.md`](../../ALVA_SPEC.md) decides what the game does; the
  guides in `docs/` explain how the code does it. Change the spec when a
  rule changes, and the guide that explains it.
- A fighter's own values and moves belong in its
  [character specification](../characters/README.md), not in a shared
  section.
- History belongs in [`UPDATES.md`](../../UPDATES.md); current documents
  describe the game as it is.
- Never name the source character behind a fighter (see
  [`character_rule`](../../character_rule) and the credits rules in
  [`ALVA_SPEC.md`](../../ALVA_SPEC.md) §6.6). `character_rule` itself is
  protected: never edit, move or rename it.
