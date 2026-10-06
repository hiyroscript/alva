# Architecture overview

Alva is plain HTML, CSS and vanilla JavaScript ES modules with Canvas 2D:
no framework, build step, bundler, package dependencies or WebGL. The
browser loads the files as they are in the repository, so every path is
relative and the game runs from any static server or GitHub Pages
sub-path. The product's architecture rules are
[`ALVA_SPEC.md`](../../ALVA_SPEC.md) §2 and §4; which module owns what is
in [module responsibilities](module-responsibilities.md).

## From the page to a hit

```
index.html                 the screens' <section>s, overlays, css/ parts in cascade order
└─ js/main.js              boot (and the boot error if it fails)
   └─ js/core/App          managers, frame loop, selection state, language, settings
      ├─ ScreenManager     splash → home → setup screens → battle / practice / discover
      ├─ InputManager      keyboard, gamepad and touch → one snapshot per step
      ├─ AssetLoader       fighter frames, preloaded for playable fighters
      └─ screens/BattleScreen or PracticeScreen
         └─ game/Battle or game/PracticeSession   (both extend game/Arena)
            └─ Arena       fixed-step world, camera, canvas drawing
               ├─ Fighter × 2       state machine; controller → input; movement rules
               ├─ CombatSystem      hits from fighters, projectiles, clones, techniques
               ├─ projectiles, clones (summons)
               └─ HitEffects, camera, stage theme (presentation only)
```

1. `index.html` holds one `<section>` per screen (hidden until shown),
   the overlays, and links the stylesheet parts (`css/`, in cascade
   order) and `js/main.js`.
2. `App` (`js/core/app.js`) builds the managers, applies the saved
   settings and language, registers every screen, preloads the playable
   fighters' frames, and runs the `requestAnimationFrame` loop: each frame
   it updates the active screen.
3. A match screen (`BattleScreen`, `PracticeScreen`) loads the chosen
   fighters' sprites (`SpriteSet`, normalized once per frame), refuses a
   fighter that is not playable, and creates a `Battle` (Quick Battle or
   Watch Mode) or a `PracticeSession`. Both extend `Arena`.
4. `Arena.frame(dt)` feeds the clamped frame time into an accumulator and
   runs as many fixed steps of 1/60 s as it holds (at most six per frame),
   then interpolates positions and draws. The frame rate never changes a
   step, only how many run per frame.

## One fixed step

`Arena.update` (a mode first runs its own rules: `Battle` its phases and
timer):

1. Respawns whose wait is over come back.
2. Every fighter in play updates (`Fighter.update`): reads its
   controller's input, then cooldowns, the impact freeze, the Dash or air
   dash, summon startups, a Deflect (a fresh Shield press in the air),
   combat presses (or the input buffer), a Dash or air dash request,
   its technique, the Shield (on the ground), horizontal movement, jumps, the fast fall,
   integration and collision, launch rebounds, landing, Energy refill,
   facing and its visual state ([movement](../systems/movement.md#1-the-shared-implementation)).
3. Rebounds show their impact; pushboxes keep fighters apart and out of
   solids; attack facing is re-sampled for side switches.
4. Projectiles released this step spawn and every projectile moves;
   live clones advance and the ones summoned this step spawn.
5. `CombatSystem.update` first turns back the projectiles a live Deflect
   meets, then resolves every hit ([combat](../systems/combat.md#hit-resolution))
   and its events go to the hit effects.
6. Spent projectiles and finished clones are dropped, and any fighter now
   in the Void is handed to the mode (`onVoid`: a point and a respawn in a
   Battle, a respawn in Practice Ground).

Rendering (camera, interpolation, effects, drawing) happens after the
steps, from the state they left; nothing it does is read by the next
step. The simulation is deterministic: the same inputs and seeds give the
same match step for step.

## Data and code

Content is data, behaviour is shared code:

| Data | Read by |
| --- | --- |
| Fighters: `js/data/characters.js` and one module per fighter in `js/data/characters/` | the Fighter, combat, the AI, the touch controls, the roster, localization |
| Loadout rules: `js/data/loadout.js` | the registry (validation), the Fighter, the AI, the touch controls |
| Powers, Launch: `js/data/powers.js`, `js/data/launch.js` | the Fighter, combat, Discover, localization |
| CPU levels: `js/data/difficulty.js` | the Battle and the combat AI |
| Stages: `js/data/maps.js`, `js/data/practice-map.js` | physics (collision), the stage themes, Select Stage |
| Codenames, bindings, timing: `js/config.js` | input, combat, the HUD, everything |

How the fighter data and the shared systems divide the work is in
[the character system](character-system.md).

## Constraints that keep it working

- **No build step.** The repository is the site. `index.html` stays at the
  root; every URL is relative (`./js/...`, `./css/...`, `./assets/...`).
- **Fixed-step simulation.** Gameplay never reads wall-clock time;
  presentation (hit effects, camera, stage animation) never feeds back.
- **One rule set for every fighter.** Shared systems read every per-fighter
  value from the fighter's definition; none reads a fighter's id.
- **No fabricated art.** A move, Shield, Dash or projectile without its
  frames is refused (and logged), never faked.
- **Codenames are contracts.** Control, move, animation and file
  codenames are universal and fixed ([`codename_rule`](../../codename_rule),
  [conventions](../development/conventions.md#codenames)).
