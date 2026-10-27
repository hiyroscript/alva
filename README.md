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
pursuit and ring-outs. Launch Point gradually recovers toward 0 when a
fighter goes without taking an unblocked hit.

Every fighter runs on the same shared systems (movement, combat, the
Shield, Energy, Launch, the CPU, controls) and brings its own moves and
art as data. **All fighters share universal baseline locomotion.
Character identity changes the moveset, not run/jump/Dash fundamentals:**
every fighter runs, jumps, triple-jumps and Dashes exactly alike, and
speed you build carries on through jumps, attacks and landings. Moves are
mechanics, not just poses with damage: summons, techniques, projectiles
that pull, repel or erase (and a Deflect that turns them back), paralysis,
charms, homing dashes, hovers, plunges, rolls, lifts and multi-hit strings are all
part of the shared engine for any fighter to use. However a move is
executed, if it can deal damage it is an attack, and a raised Shield
blocks every attack.

## What's in it

- **Seven playable fighters** on a 48-slot roster:
  [#0001](docs/characters/0001.md), the limitless sorcerer (Red pushing
  away and turning projectiles back, Maximum Blue dragging its target in,
  a paralyzing Unlimited Void, Hollow Purple erasing every projectile in
  its path and flying through every fighter it hits, both blocked by a
  raised Shield like any attack, and Infinity, a Shield that stalls the
  blows it blocks),
  [#0002](docs/characters/0002.md), the speedster (a lock-on Homing
  Attack, a plunging Bounce Attack, a rolling Spin Attack, a rising Blue
  Tornado and a travelling Whirlwind),
  [#0003](docs/characters/0003.md), the medic brawler (blows that crack the
  ground and reach only fighters standing on it, a heel-first plunge that
  splits the ground where it lands, Cherry Blossom Impact erupting either
  side of it, and the Mystical Palm Technique, a long kneeling cast that
  heals its own Launch Point),
  [#0004](docs/characters/0004.md), the virtual singer (World is Mine, a
  song that charms everyone it reaches, so that for a while their blows
  heal it instead; Ievan Polkka, a little leek-waving double that dances
  in place and strikes whoever stays by it; a sung note that turns
  projectiles back; a rising leek twirl that carries its target up; dance
  kicks and a stage dive),
  [#0005](docs/characters/0005.md), the dancing clown (the Deadlights, a
  maw of lights that leaves whoever faces them floating helpless; the Red
  Balloon, a phantom that rises out of a bunch of balloons behind its prey
  to bite, leaving it afraid, so that for a while every hit on it heals
  #0005; black tendrils that reel opponents in; a head that stretches out
  on a long neck to bite across the stage; claws and ghostly hands),
  [#0006](docs/characters/0006.md), three flying sisters who are one
  fighter, drawn as three members (an **ensemble**: one body, one hurtbox,
  one Launch Point, one Shield; all three move, guard, get hurt and fly off
  together, and each move is performed by the sister whose power it is
  while the others step back: pink's heat-vision beam and freezing breath,
  green's tornado, blue's sonic scream, and all three streaking at their
  foe together), and [#0007](docs/characters/0007.md), the street
  soldier, half fists and feet and half weapons (a string of punches, an
  uppercut, a flying kick and a hammer fist, all up close; a pistol, a
  molotov cocktail whose fire burns where it lands, a sawn-off in each
  hand fired to both sides at once and a rocket launcher, all fired
  standing on the ground). All seven Shield on the ground and Deflect in
  the air (a strike that knocks projectiles back at their thrower), and
  all seven Dash on the ground and air dash. Each fighter
  marks its own **Special abilities**, its few truly game-changing moves
  (#0001's Unlimited Void and Hollow Purple, #0003's Mystical Palm
  Technique, #0004's World is Mine, #0005's Deadlights and Red Balloon,
  #0006's Ice Breath, #0007's Rocket Launcher): an orange exclamation
  mark floats over
  a fighter while it performs one.
- **Quick Battle** against a CPU at four difficulties (Easy, Medium, Hard,
  Brutal): difficulty changes how well it thinks, never what its fighter
  can do. **Regular Play** picks the difficulty and your fighter, then
  draws the CPU's fighter and the stage at random; **Custom Play** also
  picks the CPU's fighter and the stage. Five minutes; level on points at
  the end, a minute of overtime while the Void closes in from the sides and
  below, then the lower Launch Point, and a tie if that is level too.
- **Watch Mode**: CPU against CPU, any two fighters, mirror matches
  included, under the same clock and overtime.
- **Practice Ground**: a training room with a stand-still dummy, damage
  numbers and fighter swaps.
- **Five stages**, Yerma, Sol-Noir, Asperitas, Adamaris and Jökull, plus the
  training room: open ledges, platforms, a Void kill boundary and a
  platform-fighter camera. Asperitas floats high above the clouds: one
  great cloud to fight on and two smaller cloud hazards that drift, rest,
  fade away from under you and form again somewhere new. Adamaris is a
  tropical beach, the sand running on past the Void, under a volcano whose
  random eruptions rain rocks onto the beach, each landing marked by a red
  warning circle first. Jökull is one immense glacier over a frozen abyss:
  its centre holds for ever, but its two outer wings crack with every
  landing and break away into the abyss on the fifteenth, and a sudden
  blizzard (one weather check in four) can white out the view.
- **The Void reacts**: whenever it takes a fighter it ripples where the
  fighter crossed it.
- **Select Stage**: a 24-slot stage roster (the playable stages first,
  reserved slots for the stages to come), a live preview with each
  stage's details, and **Random Stage**.
- **Shared mechanics**: universal, momentum-driven movement (a fast run,
  a higher jump, the triple jump, the fast fall, a Dash and an air dash
  that flow straight into attacks and jumps), a held Shield with a perfect
  Shield, Energy, hit-cancels and an input buffer, launch steering and
  tumbling, launches that rebound off walls, and hit effects.
- **Every input**: keyboard, PlayStation and Xbox controllers, and touch in
  two layouts (a joystick or classic buttons), both with dedicated
  left/right Mouvement buttons, that players can rearrange and resize,
  with each fighter's own art on its touch buttons.
- **Controllers**: DualShock 4, DualSense, Xbox One and Xbox Series pads,
  up to four connected (one plays Player 1), a connection indicator on
  Home and a Controller Connections dialog with Reconnect, a circular
  cursor for the menus, comfortable recommended controls designed for each
  fighter, and a layout of your own for every fighter (Settings ›
  Controls › Controller controls).
- **Automatic turn-around** for the human player (on by default, in
  Settings › Combat): whenever the fighter isn't moving left or right,
  it turns to face the closest enemy by itself, standing or in the air;
  moving, it faces the way it goes (it never walks backwards). It only
  turns: movement,
  attacks and combos stay entirely the player's, and a Dash or any move
  committed to a direction keeps its own way. Off, the fighter faces the
  way it moves, as ever. Never for a CPU.
- **Add it to your home screen**: Home's Download button explains how to
  install Alva as a lightweight web app (no large download), using the
  browser's own installation where it offers one and step-by-step
  instructions elsewhere (Safari on iPhone and iPad included).
- **The whole interface in English and French**, Settings, and a
  **Discover** reference with three sections: Fighters, Movement, and Launch.
  Fighters each have one 1–5 difficulty rating and a concise play-style
  description; Movement explains universal movement. Shared rosters place fighter identifiers
  (`#0001`, etc.) at the bottom-right of a translucent dark strip; small
  slot indices stay at the top-left.
- **The Mash Combo**, every fighter's: five rapid presses of one of its
  two close-range strikes' buttons on the ground set off twelve automatic
  turns of the two, alternating at twice their speed, the first eleven
  launching nothing and the twelfth with its full launch; nothing the
  player presses cancels it, and a hit, a launch or a Shield stops it
  ([combat](docs/systems/combat.md#mash-combo)). The CPU uses it at every
  level, and reads it coming.

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

| Action | Keyboard | Controller (PlayStation / Xbox) |
| --- | --- | --- |
| Move | A D or ← → | Left stick |
| Dash (in the air: air dash) | Q / E (left / right) | R1 / RB (the way the left stick points, else the way you face) |
| Jump (hold a little longer: higher; again in the air: air jump) | W, Space or ↑ | Cross / A |
| Down (fast fall; steer a launch down) | S or ↓ | Left stick down |
| Attack 1 / 2 / 3 / 4 / 5 | U / I / O / M / , | each fighter's own layout (below) |
| Extra attack | J | each fighter's own layout |
| Shield (hold, on the ground) / Deflect (press, in the air) | L | L1 / LB |
| Pause | Esc or P | Options / Menu |

What each attack button does is the fighter's own; a fighter with fewer
than five numbered attacks leaves the rest unused. On a controller the
universal actions are the same for every fighter, and each fighter's moves
have a layout designed for them, every move one input, no combination:
Square / X is every fighter's quick strike on the ground and in the air,
Triangle / Y and Circle / B its other strikes, R2 / RT its ranged move
(#0001's Red, #0002's Whirlwind, #0004's Melody, #0005's Dark Tendrils),
L2 / LT its Special, and the right stick the moves that go up, down or
forward the way they look (#0002's Blue Tornado up and Bounce Attack down,
#0003's ground-splitters down, #0004's Leekspin up, Stage Dive down and
Ievan Polkka forward, #0001's Hollow Purple forward, #0005's Red Balloon
up). Every input of every fighter can be changed in Settings › Controls ›
Controller controls: every button, either stick on its own (a direction
held with a button, or the stick itself as the input), modifiers, and
press, hold or held activation. In menus the D-pad moves focus, the left
stick moves a circular cursor, Cross / A confirms and Circle / B goes
back. On touch: a joystick (or Left / Right buttons) at the lower left
and the action buttons at the lower right. Details, the controller layouts
and the touch layouts in [input](docs/systems/input.md).

## How the repository is organized

```
index.html              entry point (the screens' sections, overlays)
css/                    the stylesheet, one part per area, linked in cascade order
js/
  main.js, config.js    boot; codenames, bindings, timing and render settings
  core/                 app controller, screens, input (keyboard, touch, game
                        controllers and their binding resolver), settings,
                        assets, device
  data/                 registries: characters.js and one module per fighter in
                        characters/, Discover's fighter profiles, universal
                        movement, loadout rules, controller profiles, Launch,
                        difficulty, maps
  game/                 arena, battle, practice, physics
    fighters/           the Fighter, its movement rules, controllers
    combat/             attacks, defense, combat state, hit resolution,
                        projectiles, summons, techniques, launch bounce
    ai/                 the combat AI and its moveset reader
    rendering/          camera, sprites, hit and Shield effects, fighter status
  localization/         the translator and one string table per language
  stages/               procedural stage art
  screens/, ui/         screens; interface components, HUD, touch controls,
                        controller dialogs, editor and cursor
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
  `js/data/characters/<id>.js` (its recommended controller layout
  included), one line in `js/data/characters.js`, and,
  before it is made playable, its Discover profile (one difficulty rating,
  a play-style description in both languages and a review hash) in
  `js/data/fighter-profiles.js`. No engine code. See [adding a
  fighter](docs/characters/adding-characters.md).
- **A stage:** an entry in `js/data/maps.js` and a theme in `js/stages/`;
  it takes the next slot of the stage roster by itself, and moving or
  vanishing platforms are data (a `dynamic` block). See
  [stages](docs/gameplay/stages.md#adding-a-stage).
- **A mechanic:** add it to the shared system it belongs to, as data any
  fighter can opt into (never a check for one fighter), document it in
  [`ALVA_SPEC.md`](ALVA_SPEC.md) and its guide in
  [`docs/systems/`](docs/systems/), and test it for more than one fighter
  ([testing](docs/development/testing.md)).

## Credits

**ALVA**, created by hiyroscript.

**Original work.** Game design, code, interface, ALVA wordmark, and all
stages by hiyroscript.

**#0001 sprite source.** Sprite sheet by Finhj on
[DeviantArt](https://www.deviantart.com/finhj/art/1084627848). Sheet
credits: ZetrasBlack, R0B4N.

**#0002 sprite source.** Sprite sheet by thespriteanimations on
[DeviantArt](https://www.deviantart.com/thespriteanimations/art/Sprite-Sheet-1350194762).

**#0003 sprite source.** Sprite sheet ripped by Dazz & Fret on
[The Spriters Resource](https://www.spriters-resource.com/ds_dsi/jus/asset/20891/).

**#0004 sprite source.** Sprite sheet by xmaygrrr on
[DeviantArt](https://www.deviantart.com/xmaygrrr/art/758846183).

**#0005 sprite source.** Sprite sheet posted by imhomiejaydev on
[DeviantArt](https://www.deviantart.com/imhomiejaydev/art/853407339); the
sheet's own credit: sprites by regularDor8go.

**#0006 sprite source.** Sprite sheet by NotEverything123
([where it was found](https://share.google/uwRM2BMytKaaK3Ycf)); the sheet's
own credits: Cosbydaf (NGC sprites), Kenshin Himura (rip), Misse-the-cat
(revamped sprites).

**#0007 sprite source.** Sprite sheet by xxalexsmashxx on
[DeviantArt](https://www.deviantart.com/xxalexsmashxx/art/955490753).

**Rights.** hiyroscript did not create or claim ownership of the original
third-party character/game artwork. Original characters, games, and related
properties belong to their respective rights holders.

**Project.** Unofficial fan project. No affiliation or endorsement is implied.

The in-game credits (the Home credits roll) render from one list in
`js/ui/credits.js`; a line there may link to its source (opening in a new
tab). There is no in-game Help screen; this README, [input](docs/systems/input.md)
and [`ALVA_SPEC.md`](ALVA_SPEC.md) document the controls. The game ships
with no audio.
