# Alva

A 2D sprite fighting game for the browser by **hiyroscript**. Pure HTML,
CSS and JavaScript with Canvas 2D: no frameworks, no build step, no WebGL
(the stages' depth is pseudo-3D perspective drawn in Canvas 2D). It runs
on desktop and on phones and tablets in landscape.

## What kind of game

A platform fighter. Fighters battle on compact stages with open ledges
over a **Void**: every fall into it is a point for the opponent, and the
first to 3 points wins. There is no health bar. Every hit's damage adds to
the target's **Launch Point**, and a launching hit sends it flying harder
the higher that number is (its **Base Launch** × the new Launch Point,
along its **Directional Launch**), so fights build from close combos to
pursuit and ring-outs.

Every fighter runs on the same shared systems (movement, combat, the
Shield, Energy, Launch, the CPU, controls) and brings its own moves and
art as data. **All fighters share universal baseline locomotion.
Character identity changes the moveset, not run/jump/Dash fundamentals:**
every fighter runs, jumps, triple-jumps and Dashes exactly alike, and
speed you build carries on through jumps, attacks and landings. Moves are
mechanics, not just poses with damage: summons, techniques, projectiles
that pull, repel or erase (and a Deflect that turns them back), paralysis
and unblockable hits, homing dashes, hovers, plunges, rolls, lifts and
multi-hit strings are all part of the shared engine for any fighter to
use.

## What's in it

- **Two playable fighters** on a 48-slot roster:
  [#0001](docs/characters/0001.md), the limitless sorcerer (Red pushing
  away and turning projectiles back, Maximum Blue dragging its target in,
  a paralyzing Unlimited Void no Shield stops, Hollow Purple erasing
  everything in its path, and Infinity, a Shield that stalls the blows it
  blocks) and
  [#0002](docs/characters/0002.md), the speedster (a lock-on Homing
  Attack, a plunging Bounce Attack, a rolling Spin Attack, a rising Blue
  Tornado and a travelling Whirlwind). Both Shield on the ground and
  Deflect in the air (a strike that knocks projectiles back at their
  thrower), and both Dash on the ground and air dash.
- **Quick Battle** against a CPU at four difficulties (Easy, Medium, Hard,
  Brutal): difficulty changes how well it thinks, never what its fighter
  can do. Seven minutes; level on points at the end, a minute of overtime
  while the Void closes in from the sides and below, then the lower Launch
  Point.
- **Watch Mode**: CPU against CPU, any two fighters, mirror matches
  included, under the same clock and overtime.
- **Practice Ground**: a training room with a stand-still dummy, damage
  numbers and fighter swaps.
- **Two stages**, Desert and City, plus the training room: open ledges,
  platforms, a Void kill boundary and a platform-fighter camera.
- **Shared mechanics**: universal, momentum-driven movement (a fast run,
  a higher jump, the triple jump, the fast fall, a Dash and an air dash
  that flow straight into attacks and jumps), a held Shield with a perfect
  Shield, Energy, hit-cancels and an input buffer, launch steering and
  tumbling, launches that rebound off walls, and hit effects.
- **Every input**: keyboard, gamepad, and touch in two layouts (a joystick
  or classic buttons) that players can rearrange and resize, with each
  fighter's own art on its touch buttons.
- **Combat Assist** for the human player (on by default, in Settings): a
  melee attack pressed just out of reach closes the short gap first, and
  never costs Energy. Never for ranged attacks, never for a CPU.
- **The whole interface in English and French**, Settings, and a
  **Discover** reference that explains universal movement and Launch.

## Run it

The game uses ES modules and reads sprite pixels, so serve it over HTTP
(opening `index.html` from disk won't work):

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

Any static server works; there is nothing to install. Run the tests with
`node --test`.

## Deploy it

GitHub Pages: **Settings → Pages → Deploy from a branch**, the branch and
`/ (root)`, then open `https://<user>.github.io/alva/`. `index.html` is the
entry point and every path is relative, so the game works under any
sub-path; `.nojekyll` keeps Jekyll out. More in
[running and deploying](docs/development/setup.md).

## Controls

| Action | Keyboard | Gamepad |
| --- | --- | --- |
| Move | A D or ← → | D-pad / left stick |
| Dash (in the air: air dash) | double-tap a direction | double-tap a direction |
| Jump (hold a little longer: higher; again in the air: air jump) | W, Space or ↑ | A |
| Down (fast fall; steer a launch down) | S or ↓ | D-pad / stick down |
| Attack 1 / 2 / 3 / 4 / 5 | U / I / O / M / , | B / LB / LT / L3 / R3 |
| Extra attack | J | X |
| Shield (hold, on the ground) / Deflect (press, in the air) | L | RB / RT |
| Transform (reserved) | K | Y |
| Pause | Esc or P | Start |

What each attack button does is the fighter's own; a fighter with fewer
than five numbered attacks leaves the rest unused. On touch: a joystick
(or Left / Right buttons) at the lower left and the action buttons at the
lower right. Details, and the touch layouts, in [input](docs/systems/input.md).

## How the repository is organized

```
index.html              entry point (the screens' sections, overlays)
css/                    the stylesheet, one part per area, linked in cascade order
js/
  main.js, config.js    boot; codenames, bindings, timing and render settings
  core/                 app controller, screens, input, settings, assets, device
  data/                 registries: characters.js and one module per fighter in
                        characters/, universal movement, loadout rules, Launch,
                        difficulty, maps
  game/                 arena, battle, practice, physics
    fighters/           the Fighter, its movement rules, controllers
    combat/             attacks, defense, combat state, hit resolution,
                        projectiles, summons, techniques, launch bounce
    ai/                 the combat AI and its moveset reader
    rendering/          camera, sprites, hit and Shield effects, fighter status
  localization/         the translator and one string table per language
  stages/               procedural stage art
  screens/, ui/         screens; interface components, HUD, touch controls
assets/characters/<id>/ each fighter's art
tests/                  systems/, fighters/<id>/, interface/, integration/, helpers/
docs/                   architecture, systems, characters, gameplay, development
ALVA_SPEC.md            the product specification
UPDATES.md              history: the named updates and other large changes
codename_rule           the naming contract for controls, moves and art
character_rule          the owner's direction for fighters (protected)
max                     the owner's working prompt for the current task (not a specification)
```

## Documentation

- [`ALVA_SPEC.md`](ALVA_SPEC.md): the product specification, the authority
  on what the game does and looks like.
- [`docs/`](docs/README.md): how it is built, system by system, fighter by
  fighter.
- [`UPDATES.md`](UPDATES.md): what changed when (the **movement**,
  **effect** and **bounce** updates, among others).

## Extending it

- **A fighter:** art in `assets/characters/<id>/`, a definition module in
  `js/data/characters/<id>.js`, one line in `js/data/characters.js`. No
  engine code. See [adding a fighter](docs/characters/adding-characters.md).
- **A stage:** an entry in `js/data/maps.js` and a theme in `js/stages/`.
  See [stages](docs/gameplay/stages.md#adding-a-stage).
- **A mechanic:** add it to the shared system it belongs to, as data any
  fighter can opt into (never a check for one fighter), document it in
  [`ALVA_SPEC.md`](ALVA_SPEC.md) and its guide in
  [`docs/systems/`](docs/systems/), and test it for more than one fighter
  ([testing](docs/development/testing.md)).

## Credits

**ALVA**, created by hiyroscript.

**Original work.** Game design, code, interface, ALVA wordmark, and Desert / City
stage artwork by hiyroscript.

**#0001 sprite source.** Sprite sheet by Finhj on
[DeviantArt](https://www.deviantart.com/finhj/art/1084627848). Sheet
credits: ZetrasBlack, R0B4N.

**#0002 sprite source.** Sprite sheet by thespriteanimations on
[DeviantArt](https://www.deviantart.com/thespriteanimations/art/Sprite-Sheet-1350194762).

**Rights.** hiyroscript did not create or claim ownership of the original
third-party character/game artwork. Original characters, games, and related
properties belong to their respective rights holders.

**Project.** Unofficial fan project. No affiliation or endorsement is implied.

The in-game credits (the Home credits roll) render from one list in
`js/ui/credits.js`; a line there may link to its source (opening in a new
tab). There is no in-game Help screen; this README, [input](docs/systems/input.md)
and [`ALVA_SPEC.md`](ALVA_SPEC.md) document the controls. The game ships
with no audio.
