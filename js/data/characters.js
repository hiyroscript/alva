// Character database.
//
// Adding a fighter should only require:
//   1. dropping frames into ./assets/characters/<id>/, each named
//      <id>_<codename>_<frame>.png (see frames below): 0027_idle_1.png,
//      0027_attack2_3.png, 0027_midair_attack2_1.png,
//      0027_attack4_object_2.png. The codename is the universal one, never
//      the move's name in game
//   2. adding a definition to CHARACTERS below, its moves keyed by the
//      universal move codenames (MOVES in js/config.js: attack1 to attack5,
//      midair_attack1 to midair_attack5, extra_attack, transform) whatever
//      it calls them in game, and its loadout following js/data/loadout.js:
//      attack1 and attack2 at least, attack5 at most, each numbered attack
//      with a button of its own also in the air (midair_attackN), and with
//      Charge replacements attack3 and attack4 made by Charge + attack1 and
//      Charge + attack2 instead of buttons of their own. Also its Power
//      tiers (`powers`, see js/data/powers.js) and each hit's `damage`, Base
//      Launch (`baseLaunch`: 0, 1, 2 or 3) and Directional Launch
//      (`directionalLaunch`: null, 'horizontal', 'vertical' or
//      'reverseVertical'), e.g. `damage: 10, baseLaunch: 2,
//      directionalLaunch: 'vertical'` (see js/data/launch.js)
//   3. giving it a rosterSlot
//   4. setting `available: true` once it is ready to be played
//   5. optionally, naming its moves in `abilityNames` (keyed by move
//      codename; see js/data/abilities.js)
//
// A definition that breaks the loadout rules is refused as this module
// loads (assertLoadout, js/data/loadout.js), naming every problem.
//
// A fighter whose art comes before its combat attributes can still be
// added: an attack whose art is in is `pending` (art only, see
// js/game/combat.js). What the engine cannot build a fighter without, its
// `powers` and `movement`, is still its own.
//
// A definition existing is not the same as it being playable. getCharacter
// finds any definition (the engine and its tests build fighters from it);
// only an `available` one is playable (isPlayable, getPlayableCharacter,
// playableCharacters below): only those are preloaded, offered by a roster
// or started in a Battle, Watch Mode or Practice Ground. With none
// available, every game-start route stays closed.
//
// Every field the engine reads lives here; nothing about any one fighter is
// hard-coded in the game systems.

import { assertLoadout } from './loadout.js';

// Every fighter's art follows one pattern, in a folder of its own id:
// ./assets/characters/<id>/<id>_<codename>_<frame>.png. The codename is the
// universal one (idle, run, attack2, midair_attack2, extra_attack,
// attack4_object...), never the move's name in game, and the last part is
// always the frame: 0001_attack1_3.png is attack1, frame 3. Charge's
// sustained loop is the one lettered pair, charge_a and charge_b.
export const framePath = (id, codename, frame) => `./assets/characters/${id}/${id}_${codename}_${frame}.png`;

// Frames `from` to `from + count - 1` of `codename`, in order.
export const frames = (id, codename, count, from = 1) =>
  Array.from({ length: count }, (_, i) => framePath(id, codename, from + i));

// Playback rate of #0001's attack1 clips (attack1, midair_attack1). Their
// phases below are whole frames at this rate, so tuning it keeps combat in
// sync with the art.
const ATTACK1_FPS = 12;
// Same for attack2 (attack2, midair_attack2): its phases are whole frames
// at this rate.
const ATTACK2_FPS = 12;
// Playback rate of the Charge clips (startup, sustained loop and release).
const CHARGE_FPS = 10;
// Playback rate of the Shield clips: the raise and lower poses around the
// grounded hold each show for one frame at this rate.
const SHIELD_FPS = 12;
// Playback rate of the mouvment clip (the Dash). A Dash lasts exactly one
// pass of it (2 frames = 0.2 s at 10 fps), so tuning it keeps the burst on
// the art.
const MOUVMENT_FPS = 10;
// Playback rate of the extra_attack clip (the Throw). Its phases and the
// shuriken's release point below are whole frames at this rate.
const EXTRA_ATTACK_FPS = 12;
// Playback rate of the extra_attack_object spin (the thrown shuriken). Art
// only: it never changes how fast the projectile travels.
const EXTRA_ATTACK_OBJECT_FPS = 18;
// Playback rate of attack3_object, the Clone Attack's cloud. The same rate
// plays it forwards as the clone appears and backwards as it vanishes, so
// both take one pass of the clip (10 frames = 0.5 s at 20 fps).
const ATTACK3_OBJECT_FPS = 20;
// Playback rate of #0001's attack4 poses (the Sphere Rush). The rush lasts
// exactly one pass of attack4_dash at this rate, so tuning it keeps the
// rush's contact window on the dash art.
const ATTACK4_FPS = 12;
// Playback rate of attack4_object, the Sphere Rush's blue sphere. The rush
// waits for one full pass of attack4_object_build (6 frames = 0.5 s)
// before it dashes.
const ATTACK4_OBJECT_FPS = 12;

export const CHARACTERS = [
  {
    id: '0001',
    displayName: '#0001',
    // Temporarily disabled: its definition, art and tuning are kept whole,
    // but no roster, menu or match offers it until this is true again.
    available: false,
    rosterSlot: 0,

    // The source art faces right. A clip drawn the other way would override
    // this with its own `sourceFacing`; it only decides whether the sprite
    // is mirrored, never the fighter's facing or its boxes.
    sourceFacing: 1,

    animations: {
      idle: {
        frames: frames('0001', 'idle', 4),
        fps: 7,
        loop: true,
        // Only used if the pixel grid of a frame cannot be detected: the
        // animation is then scaled so its tallest frame is this fraction of
        // visual.height.
        heightRatio: 1,
      },
      run: {
        frames: frames('0001', 'run', 6),
        fps: 11,
        loop: true,
        heightRatio: 0.9,
        // Playback rate follows horizontal speed, clamped to this minimum.
        minSpeedScale: 0.7,
      },
      // Airborne clips play once and hold their last frame for the rest of
      // the ascent / descent.
      jump: {
        frames: frames('0001', 'jump', 2),
        fps: 10,
        loop: false,
        heightRatio: 0.98,
      },
      fall: {
        frames: frames('0001', 'fall', 2),
        fps: 10,
        loop: false,
        heightRatio: 1,
      },
      // mouvment, the Dash: mouvment_1 leans into the burst, mouvment_2 is
      // the low, stretched-out sprint. Played once per Dash, which lasts
      // exactly one pass of it. Drawn at 1x (one file pixel per art pixel,
      // unlike the upscaled rest of #0001), so its grid cannot be detected:
      // heightRatio then sizes it by its tallest frame, mouvment_1's 41 px
      // against idle's 52, which puts it at exactly one art pixel per file
      // pixel, the same scale as every other pose.
      mouvment: {
        frames: frames('0001', 'mouvment', 2),
        fps: MOUVMENT_FPS,
        loop: false,
        heightRatio: 41 / 52,
      },
      // Plays once on touchdown; the fighter holds the land state for exactly
      // one pass of this clip (frames / fps).
      land: {
        frames: frames('0001', 'land', 2),
        fps: 12,
        loop: false,
        heightRatio: 0.83,
      },
      // Hitstun poses: `hurt` while grounded, `midair_hurt` while airborne.
      // Single frames, held for as long as the stun lasts.
      hurt: {
        frames: frames('0001', 'hurt', 1),
        fps: 12,
        loop: false,
        heightRatio: 0.9,
      },
      midair_hurt: {
        frames: frames('0001', 'midair_hurt', 1),
        fps: 12,
        loop: false,
        heightRatio: 0.65,
      },
      // attack1 (the Punch) and midair_attack1 (the kunai slash). Each plays
      // once; the attack definitions below time startup / active / recovery
      // to these frames.
      attack1: {
        frames: frames('0001', 'attack1', 4),
        fps: ATTACK1_FPS,
        loop: false,
        heightRatio: 1.04,
      },
      midair_attack1: {
        frames: frames('0001', 'midair_attack1', 3),
        fps: ATTACK1_FPS,
        loop: false,
        heightRatio: 1.29,
      },
      // attack2 (the Kick) and midair_attack2 (the airborne kick). Played
      // once, like attack1.
      attack2: {
        frames: frames('0001', 'attack2', 7),
        fps: ATTACK2_FPS,
        loop: false,
        heightRatio: 1.02,
      },
      midair_attack2: {
        frames: frames('0001', 'midair_attack2', 5),
        fps: ATTACK2_FPS,
        loop: false,
        heightRatio: 1.08,
      },
      // Charge: one logical fighter state drawn as two clips. The startup
      // (charge_1, charge_2) plays once when Charge begins; the sustained
      // loop (charge_a, charge_b) then alternates for as long as Charge is
      // held. The loop frames are lettered, not numbered: they are the loop,
      // never frames 3 and 4.
      charge: {
        frames: frames('0001', 'charge', 2),
        fps: CHARGE_FPS,
        loop: false,
        heightRatio: 1,
      },
      charge_loop: {
        frames: [framePath('0001', 'charge', 'a'), framePath('0001', 'charge', 'b')],
        fps: CHARGE_FPS,
        loop: true,
        heightRatio: 1,
      },
      // Letting go of Charge shows charge_1 again for one Charge frame-time
      // before the normal state resumes. The same file as the startup's
      // first frame, on purpose, never a copy.
      charge_release: {
        frames: frames('0001', 'charge', 1),
        fps: CHARGE_FPS,
        loop: false,
        heightRatio: 1,
      },
      // Shield, what #0001's `shield` button does (see `defense` below): four
      // single frames, each drawn at 1x like the mouvment clip, so
      // heightRatio sizes each by its own height against idle's 52 art pixels
      // (one art pixel per file pixel, the scale of every other pose). On the
      // ground, prepshield raises the guard for one frame, shielding is the
      // held guard for as long as `shield` is held, and releaseshield lowers
      // it for one frame after. In the air there is only the held guard,
      // midair_shielding: no raise or lower pose. All face right like the
      // rest of #0001.
      prepshield: {
        frames: frames('0001', 'prepshield', 1),
        fps: SHIELD_FPS,
        loop: false,
        heightRatio: 51 / 52,
      },
      shielding: {
        frames: frames('0001', 'shielding', 1),
        fps: SHIELD_FPS,
        loop: false,
        heightRatio: 47 / 52,
      },
      releaseshield: {
        frames: frames('0001', 'releaseshield', 1),
        fps: SHIELD_FPS,
        loop: false,
        heightRatio: 45 / 52,
      },
      midair_shielding: {
        frames: frames('0001', 'midair_shielding', 1),
        fps: SHIELD_FPS,
        loop: false,
        heightRatio: 49 / 52,
      },
      // extra_attack, the Throw: extra_attack_1 raises the shuriken by the
      // face, extra_attack_2 whips the arm across and lets go (the release
      // frame), extra_attack_3 follows through. Faces right like the rest
      // of #0001. Ground only: there is no mid-air Throw art.
      extra_attack: {
        frames: frames('0001', 'extra_attack', 3),
        fps: EXTRA_ATTACK_FPS,
        loop: false,
        heightRatio: 0.9,
      },
      // attack4, the Sphere Rush: one set of twelve poses (attack4_1-12)
      // split into logical clips, each played once by its own technique
      // phase (see chargedTechniques.attack4). attack4_form (1-3): the rear
      // palm opens for the sphere to form in. attack4_dash (4-6): the rush,
      // sphere carried behind, swung forward on attack4_6. The rest only a
      // hit shows: attack4_confirm (7-8), the palm driven into the opponent,
      // attack4_8 held while the sphere on it grows; attack4_explosion (9),
      // the pose of the blast itself; attack4_release (10-12), the recovery
      // once the blast is over. attack4_whiff_release reuses attack4_12 (the
      // same file, never a copy) alone, for one frame after a rush that
      // caught nobody. Faces right like the rest of #0001.
      attack4_form: {
        frames: frames('0001', 'attack4', 3),
        fps: ATTACK4_FPS,
        loop: false,
        heightRatio: 0.94,
      },
      attack4_dash: {
        frames: frames('0001', 'attack4', 3, 4),
        fps: ATTACK4_FPS,
        loop: false,
        heightRatio: 0.88,
      },
      attack4_confirm: {
        frames: frames('0001', 'attack4', 2, 7),
        fps: ATTACK4_FPS,
        loop: false,
        heightRatio: 0.79,
      },
      attack4_explosion: {
        frames: frames('0001', 'attack4', 1, 9),
        fps: ATTACK4_FPS,
        loop: false,
        heightRatio: 0.77,
      },
      attack4_release: {
        frames: frames('0001', 'attack4', 3, 10),
        fps: ATTACK4_FPS,
        loop: false,
        heightRatio: 1,
      },
      attack4_whiff_release: {
        frames: frames('0001', 'attack4', 1, 12),
        fps: ATTACK4_FPS,
        loop: false,
        heightRatio: 1,
      },
    },

    // Projectile art, kept apart from the fighter poses above: it is
    // normalized at its own size around a centre anchor, never scaled to the
    // fighter's height (see SpriteSet.build). Frames loop while it flies.
    // `sourceFacing` is the way the art travels; it is mirrored when thrown
    // the other way. Left out, the art is treated as direction-neutral.
    projectileAnimations: {
      // extra_attack_object, the shuriken extra_attack throws: three
      // rotations of it, spinning clockwise, rolling forward when thrown
      // right, so it is mirrored when thrown left.
      extra_attack_object: {
        frames: frames('0001', 'extra_attack_object', 3),
        fps: EXTRA_ATTACK_OBJECT_FPS,
        loop: true,
        sourceFacing: 1,
      },
    },

    // Effect art: not a fighter pose and not a projectile, and always named
    // after the attack that creates it (<attack>_object...). Normalized like
    // projectile art (own size, centre anchor, the fighter's art-pixel
    // scale, never fitted to the fighter's height) and drawn by whatever
    // uses it. `sourceFacing: 0` marks direction-neutral art: never mirrored.
    effectAnimations: {
      // attack3_object, the smoke cloud attack3's clone appears from and
      // vanishes into: played 1 -> 10 once as it appears, then the same
      // frames 10 -> 1 as it vanishes (reversed at runtime, never duplicated
      // on disk).
      attack3_object: {
        frames: frames('0001', 'attack3_object', 10),
        fps: ATTACK3_OBJECT_FPS,
        loop: false,
        sourceFacing: 0,
      },
      // attack4_object, the Sphere Rush's blue sphere (attack4_object_1-11),
      // split into three clips: attack4_object_build forms it in the hand
      // (1-6, once), attack4_object_impact is the sphere spinning on the
      // caught opponent (7 -> 8 -> 9, looped until it explodes, drawn ever
      // larger by the technique's sphereGrowth) and
      // attack4_object_explosion is the delayed blast (10-11, the lighter,
      // brighter frames, once). A round effect: never mirrored.
      attack4_object_build: {
        frames: frames('0001', 'attack4_object', 6),
        fps: ATTACK4_OBJECT_FPS,
        loop: false,
        sourceFacing: 0,
      },
      attack4_object_impact: {
        frames: frames('0001', 'attack4_object', 3, 7),
        fps: ATTACK4_OBJECT_FPS,
        loop: true,
        sourceFacing: 0,
      },
      attack4_object_explosion: {
        frames: frames('0001', 'attack4_object', 2, 10),
        fps: ATTACK4_OBJECT_FPS,
        loop: false,
        sourceFacing: 0,
      },
    },

    // Projectile behaviour, keyed by id: `<attack>_object`, the attack that
    // throws it. See js/game/projectile.js for the schema
    // (createProjectileDefinition). The hitbox is centred on the
    // projectile and mirrors with its direction; the combat fields resolve
    // exactly like an attack's (CombatSystem.applyHit). One hit at most.
    projectiles: {
      extra_attack_object: {
        animation: 'extra_attack_object',
        speed: 700,
        lifetime: 1.5,
        hitbox: { x: -5, y: -5, w: 10, h: 10 },
        // Adds 1 to the target's Launch Point. Base Launch 0 and no
        // direction: never a launching hit. It adds its damage and stun
        // without pushing or launching the target, at any Launch Point.
        damage: 1,
        baseLaunch: 0,
        directionalLaunch: null,
        hitstun: 0.16,
        blockstun: 0.1,
        hitstop: 0.04,
      },
    },

    // A still idle frame for the airborne, landing, hurt and charge clips if
    // their frames fail to load. `frame` holds a single frame instead of
    // looping, so the fighter never stretches or rotates to fake a pose.
    // Attacks, the Shield and the Dash never fall back: one whose frames are
    // missing is refused (see Fighter.tryAction, shieldAllowed and tryDash).
    animationFallbacks: {
      jump: { animation: 'idle', frame: 0 },
      fall: { animation: 'idle', frame: 0 },
      land: { animation: 'idle', frame: 0 },
      hurt: { animation: 'idle', frame: 0 },
      midair_hurt: { animation: 'idle', frame: 0 },
      charge: { animation: 'idle', frame: 0 },
      charge_loop: { animation: 'idle', frame: 0 },
    },

    visual: {
      // World-unit height of the tallest frame of the reference animation.
      height: 88,
      referenceAnimation: 'idle',
      // Horizontal anchor: 'torso' uses the opaque-pixel centroid of the upper
      // body so the character doesn't slide between frames/animations.
      // 'center' uses the visible bounding box centre.
      anchor: 'torso',
      // 'auto' detects upscaled pixel-art grids. A number forces a size.
      pixelSize: 'auto',
      // Roster portrait crop (fractions of the normalized idle frame).
      portrait: { animation: 'idle', frame: 0, centerY: 0.24, size: 0.5 },
    },

    // Powers, each owned at one tier. The tier tables in js/data/powers.js
    // turn these into gameplay values: Jump Power 2 is the normal jump and
    // Speed Power 2 the normal top speed, the only sources of this fighter's
    // jump strength and movement speed. (Launch is not a Power: Base Launch
    // and Directional Launch belong to each hit below.)
    powers: {
      jump: 2,
      speed: 2,
    },

    // Every other movement stat (see Fighter.moveHorizontal). The top speed
    // is Speed Power's; a Dash never changes it, it owns the horizontal
    // speed for its own length.
    movement: {
      // Ground: from rest to top speed in about 0.08 s; letting go stops a
      // run in about 0.08 s (about 10 units of slide), so it can stop right
      // beside an opponent; pressing the other way brakes at acceleration x
      // turnBoost, then accelerates: a full turn in about 0.12 s.
      acceleration: 4200,
      deceleration: 4200,
      turnBoost: 2.6,
      // Faster than top speed on the ground (the end of a Dash): the excess
      // bleeds off at this rate, whatever is held.
      overspeedDeceleration: 6000,
      // Air: steering bends the drift rather than replacing it. Top speed
      // in about 0.12 s, a turn braking at airAcceleration x airTurnBoost
      // (a full reversal in about 10 steps, softer than the ground's), and a
      // light drag so a running jump carries its speed.
      airAcceleration: 3000,
      airDeceleration: 380,
      airTurnBoost: 2.0,
      gravityScale: 1,
      maxFallSpeed: 1500,
      // Fast fall: Down (the Charge input) held in the air while already
      // descending speeds the fall up toward fastFallSpeed, reaching it in
      // about 0.1 s.
      fastFallAcceleration: 12000,
      fastFallSpeed: 1400,
      coyoteTime: 0.1,
      jumpBuffer: 0.12,
      // Higher jump: a tap is the normal jump (Jump Power 2's 169 units);
      // Jump still held highJumpWindow after takeoff (a press a little
      // longer than a tap) carries it on up to highJumpHeight x that
      // (about 237 units), rising a little slower from then on.
      highJumpWindow: 0.15,
      highJumpHeight: 1.4,
      // One more jump in the air before landing again, at airJumpRatio x
      // the normal jump's speed; landing, or being hit, gives it back.
      airJumps: 1,
      airJumpRatio: 0.9,
      // Combat input buffer: an extra_attack, attack1 or attack2 press the
      // fighter cannot act on yet is kept this long and comes out on the
      // first step it can.
      attackBuffer: 0.15,
      // How a hit's push or launch runs down while this fighter is stunned
      // (ground, air): its own, apart from the movement stats above.
      hitstunFriction: 1600,
      hitstunAirDrag: 210,
      // Used only by the training CPU's platform drop; see Fighter.update.
      dropThroughTime: 0.28,
      // Dash: two presses of the same direction (left or right), the second
      // within dashTapWindow seconds of the first, start a grounded burst at
      // dashSpeed (about 2.7x the top speed) for one pass of the dash clip:
      // 0.2 s, about 180 units on open ground.
      dashSpeed: 900,
      dashTapWindow: 0.22,
    },

    // Collision is independent from sprite/PNG dimensions.
    collider: { width: 34, height: 80 },
    pushbox: { width: 36 },
    hurtboxes: [
      { x: -15, y: -80, w: 30, h: 34 }, // upper body
      { x: -17, y: -46, w: 34, h: 46 }, // lower body
    ],

    stats: {
      // Charge replacements' cooldowns (attack3's summon, attack4's
      // technique) recover this many seconds per second while the fighter is
      // actually in Charge; 1 per second otherwise.
      chargedCooldownRate: 2,
    },

    // How #0001 responds to being launched (see resolveLaunchReaction in
    // js/game/combat.js). A harder launch stuns longer: 0.2 s more per 1000
    // units/s, 0.7 s more at most, so a big hit is a clear moment to chase
    // (and the air jump can extend a juggle at middling Launch Point, never
    // past three hits). Launched at 1100 units/s or faster it tumbles
    // (its mid-air hurt pose) until it acts or lands. Left / Right, Jump and
    // Charge held as a hit lands bend its launch by up to 15 degrees toward
    // them (never its strength): a skill for surviving, and for slipping a
    // follow-up.
    launchReaction: {
      stunPerThousand: 0.2,
      maxStun: 0.7,
      tumbleSpeed: 1100,
      steerAngle: 15,
    },

    // Energy (see resolveEnergy in js/game/combat.js): 100 at most, shown
    // over the fighter's head as a bright purple bar while below full,
    // spent only by Dash (dashCost, as it starts; dashCancelCost for one
    // that cuts short an attack that hit: two from a full bar, and a third
    // empties it) and Shield (shieldHitCost, for each hit it blocks;
    // holding it is free). Either still works with
    // less left than it costs, but then takes all of it. It refills by
    // itself at `regen` per second, at `chargeRegen` while in Charge (apart
    // from, and on top of, Charge's faster charged cooldowns). Emptied, it
    // turns gray: no Dash or Shield until it is full again.
    energy: {
      max: 100,
      regen: 12,
      chargeRegen: 30,
      dashCost: 15,
      dashCancelCost: 40,
      shieldHitCost: 25,
    },

    // What the shared `shield` input (L, RB / RT, the touch Shield button)
    // does for this fighter. #0001 shields: held `shield` keeps a Shield up
    // all round him, `groundAnimation` on the ground (raised by
    // `groundStartAnimation`, lowered by `groundReleaseAnimation`) and
    // `airAnimation` in the air, where he falls slowly. Every hit it
    // blocks costs energy.shieldHitCost and deals nothing else: no Launch
    // Point, no launch (see createDefenseDefinition and
    // CombatSystem.applyHit in js/game/combat.js).
    defense: {
      type: 'shield',
      groundAnimation: 'shielding',
      groundStartAnimation: 'prepshield',
      groundReleaseAnimation: 'releaseshield',
      airAnimation: 'midair_shielding',
      // Slow fall: up in the air, the Shield brakes any faster fall to 200
      // units/s (from the fast fall's 1400 in 0.2 s) and holds it there,
      // about a seventh of the normal fall's top speed. Sideways he only
      // drifts, as with any Shield.
      slowFallSpeed: 200,
      slowFallBrake: 6000,
      // Perfect Shield: a hit within 0.1 s of raising it (after at least
      // 0.25 s down) is blocked for free, with no blockstun: time it and
      // punish the attacker's recovery.
      perfectWindow: 0.1,
      perfectRearm: 0.25,
    },

    // Control codenames -> move codenames (both universal, see js/config.js),
    // following the loadout rules (js/data/loadout.js). A numbered attack's
    // button is { ground, air }, picked by whether the fighter is grounded
    // when it is pressed; the extra_attack's is one attack; null means the
    // button is wired but reserved: no artwork, no attack. #0001 has four
    // numbered attacks and Charge: attack1 and attack2 have buttons of their
    // own, attack3 and attack4 come from Charge (chargeReplacements below),
    // so there is no attack3, attack4 or attack5 button.
    actions: {
      extra_attack: 'extra_attack', // the Throw: #0001's shuriken
      transform: null, // reserved: no Transform move yet
      attack1: { ground: 'attack1', air: 'midair_attack1' }, // the Punch / the kunai slash
      attack2: { ground: 'attack2', air: 'midair_attack2' }, // the Kick / the airborne kick
    },

    // How the touch controls present this fighter's own buttons: an icon
    // (a key of ICONS in js/ui/icons.js) and an accessible name for each.
    // UI only (see js/ui/mobile-abilities.js): the buttons still send
    // extra_attack, transform, attack1 and attack2, and nothing here reaches
    // combat. Each names the button's ability family, not every move it
    // makes: Punch is also midair_attack1 (the mid-air kunai slash), and
    // with Charge held attack3 (the Clone Attack). With no `transform` entry
    // (no Transform yet) its Transform button stays reserved (dashed). The
    // Shield, Jump and movement buttons are universal.
    mobileAbilities: {
      extra_attack: { label: 'Shuriken', icon: 'shuriken' },
      attack1: { label: 'Punch', icon: 'punch' },
      attack2: { label: 'Kick', icon: 'kick' },
    },

    // #0001's in-game ability names, keyed by the universal move codenames
    // (MOVES in js/config.js). Read through abilityName (js/data/abilities.js),
    // which gives a move left out here its neutral name: midair_attack1 and
    // midair_attack2 are still unnamed. Names only: no screen shows them
    // yet, and nothing here reaches combat.
    abilityNames: {
      extra_attack: 'Shuriken',
      attack1: 'Punch',
      attack2: 'Kick',
      attack3: 'Clone Attack',
      attack4: 'Sphere Rush',
    },

    // Charge replacements (see js/data/loadout.js): what a numbered attack
    // button does when pressed while the fighter is already Charging (since
    // an earlier step) and still holding Charge, instead of its normal
    // attack. attack1's is attack3 and attack2's attack4, the attacks
    // themselves: they have no button of their own. Each is typed: a
    // `summon` (see `summons`) sends out a detached entity while the fighter
    // keeps charging; a `technique` (see `chargedTechniques`) is performed
    // by the fighter itself. Each has its own cooldown (the summon's or
    // technique's `cooldown`), started when it is used, hit or miss; a press
    // while it is still cooling down does nothing at all. If it cannot
    // happen for another reason (no opponent, missing art), the press falls
    // through to the button's normal attack. Their cooldowns show under the
    // fighter as A3 and A4.
    chargeReplacements: {
      attack1: { type: 'summon', id: 'attack3' }, // the Clone Attack
      attack2: { type: 'technique', id: 'attack4' }, // the Sphere Rush
    },

    // Summons, keyed by the attack they are. See js/game/clone.js for the
    // schema (createSummonDefinition). A clone is a temporary attack entity,
    // not a fighter: it appears through the `cloud` effect, performs one of
    // the owner's attacks once with that attack's own art and combat data,
    // then vanishes through the same cloud played in reverse. Normally it
    // appears behind the opponent and performs `attack`; with nothing to
    // stand on there at the opponent's foot height, the optional `noGround`
    // fallback places it and picks its attack instead.
    summons: {
      // attack3, the Clone Attack.
      attack3: {
        attack: 'attack1',
        cloud: 'attack3_object',
        // Seconds before attack3 can be used again, from the moment the
        // summon is accepted, whichever way it appears and whether or not it
        // hits. Its hit is the attack's own: 3 as attack1, 5 as
        // midair_attack2.
        cooldown: 5,
        // World units behind the opponent (on its back side) at the summon;
        // attack1's punch reaches forward from there into the opponent.
        behindDistance: 48,
        // Cloud centre from the clone's origin (bottom-centre), facing right:
        // half the fighter's visual height, so the smoke wraps the body.
        effectOffset: { x: 0, y: -44 },
        // No ground behind the opponent at its foot height (past a platform's
        // edge, or the opponent is airborne): the clone appears over it
        // instead and performs the airborne kick (midair_attack2), driving
        // it downward. `offset` is the clone's origin from the opponent's
        // (facing right, mirrored): feet at its upper body, where
        // midair_attack2's own hitbox lands on its hurtboxes.
        noGround: {
          attack: 'midair_attack2',
          offset: { x: 0, y: -36 },
        },
      },
    },

    // Charged techniques, keyed by the attack they are. See
    // js/game/charged-technique.js for the schema (createTechniqueDefinition)
    // and the phases. Not an attack, a projectile or a summon: #0001
    // performs it himself.
    chargedTechniques: {
      // attack4, the Sphere Rush. The sphere forms in #0001's rear palm
      // (attack4_form + attack4_object_build, 0.5 s), then he rushes forward
      // for one pass of attack4_dash (0.25 s, about 262 world units)
      // carrying it behind him and swinging it forward on attack4_6. It must
      // connect during that rush: a miss stops him and he lets the sphere go
      // on the attack4_whiff_release pose (attack4_12, one frame) before he
      // is free. A hit binds the opponent (no damage of its own) and the
      // sphere moves onto it, spinning there (attack4_object_7-9 looped)
      // while attack4_confirm plays attack4_7 -> attack4_8 and holds
      // attack4_8 as the sphere grows. While it is held, 1 Launch Point is
      // added at once on the hit's own step and then every 0.5 s, with no
      // launch (0, 0.5, 1 and 1.5 s after the hit). 2 s after the hit it
      // explodes (attack4_object_10-11) while #0001 is on attack4_explosion
      // (attack4_9): 10 more Launch Point, then Base Launch 3 sideways, which
      // releases the opponent (14 damage in all: 4 ticks and the blast);
      // once the blast is over he recovers through attack4_release
      // (attack4_10-12). The whole technique needs ground under #0001. A
      // Shield blocks the contact: no bind, tick or explosion, and the rush
      // ends there.
      attack4: {
        formAnimation: 'attack4_form',
        dashAnimation: 'attack4_dash',
        confirmAnimation: 'attack4_confirm',
        explosionAnimation: 'attack4_explosion',
        releaseAnimation: 'attack4_release',
        whiffReleaseAnimation: 'attack4_whiff_release',
        sphereBuild: 'attack4_object_build',
        sphereImpact: 'attack4_object_impact',
        sphereExplosion: 'attack4_object_explosion',
        // Seconds before attack4 can be used again, from the moment the
        // rush starts forming: spent on a hit, a miss, a wall or an
        // interruption alike.
        cooldown: 5,
        // World units per second, in the facing snapshotted at the start.
        dashSpeed: 1050,
        // Sphere centre from #0001's origin (bottom-centre), facing right,
        // one per frame: the rear palm in attack4_1-5 (the fist in attack4_1,
        // the open palm in attack4_2-3, trailing behind in attack4_4-5), then
        // the hand at the end of the forward swing in attack4_6.
        handOffsets: {
          attack4_form: [{ x: -15, y: -47 }, { x: -25, y: -42 }, { x: -25, y: -42 }],
          attack4_dash: [{ x: -32, y: -51 }, { x: -34, y: -51 }, { x: 32, y: -47 }],
        },
        // Around the sphere centre: the visible orb of the complete sphere.
        sphereHitbox: { x: -24, y: -24, w: 48, h: 48 },
        // Sphere centre from the opponent's origin once it hits (x along
        // the rush): over the caught opponent's body.
        targetOffset: { x: 0, y: -48 },
        // Seconds from the hit to the explosion.
        explosionDelay: 2.0,
        // The sphere on the opponent, drawn at its own art size from the hit,
        // grows steadily through the attack4_8 hold to this multiple of it as
        // it explodes; the blast bursts at that size. Visual only.
        sphereGrowth: { startScale: 1, endScale: 1.4 },
        // The sphere's contact: the setup, no damage and no launch. The bind
        // that follows (not this hitstun) is what holds the opponent; its
        // first tickHit lands on this same step.
        firstHit: {
          damage: 0,
          baseLaunch: 0,
          directionalLaunch: null,
          hitstun: 0.2,
          blockstun: 0.15,
          hitstop: 0.06,
        },
        // While the opponent is held, before the explosion: one tickHit on
        // the contact's own step, then one every tickInterval seconds since
        // it. Launch Point only: no launch, stun or freeze, so the hold never
        // stutters.
        tickInterval: 0.5,
        tickHit: {
          damage: 1,
          baseLaunch: 0,
          directionalLaunch: null,
          hitstun: 0,
          blockstun: 0,
          hitstop: 0,
        },
        // The explosion: the big one, and the technique's only launching
        // hit. Its 10 damage is added first, then the target's new Launch
        // Point is tripled and sent sideways along the technique's facing.
        explosionHit: {
          damage: 10,
          baseLaunch: 3,
          directionalLaunch: 'horizontal',
          hitstun: 0.55,
          blockstun: 0.3,
          hitstop: 0.12,
        },
      },
    },

    // Attack definitions, keyed by id. See js/game/combat.js for the schema
    // (createAttackDefinition). Phases are whole frames of the attack's clip,
    // so the hitbox is live only while the strike is on screen. Hitboxes face
    // right from the fighter's origin (bottom-centre) and mirror with facing.
    // Each also says how #0001 moves through it (momentum, control,
    // friction, a step-in) and, for the numbered attacks, when a hit opens a
    // follow-up (hitCancel, from the strike: another attack, a jump or, on
    // the ground, a Dash). Roles: attack1 the quick combo starter (a long
    // stun, the lightest freeze), attack2 the committed launcher (a
    // step-in, a heavier freeze), midair_attack1 the pursuit tool,
    // midair_attack2 the spike into grounded pressure, extra_attack (the
    // Throw) spacing only. Each attack's `damage` is added to the target's
    // Launch Point first; its Base Launch then multiplies that new Launch
    // Point and its Directional Launch sends the result: attack1 pushes
    // sideways (1, horizontal), attack2 and midair_attack1 launch upward (2,
    // vertical) and midair_attack2 drives the target downward (2, reverse
    // vertical).
    // Damage and Base Launch are authored separately: neither is derived
    // from the other.
    attacks: {
      // Frame 1 wind-up, frame 2 punch, frames 3-4 recovery. Keeps 0.75 of
      // a run and slides on it (no steering, so a jab string never creeps
      // after its target); its stun covers attack2's wind-up.
      attack1: {
        animation: 'attack1',
        startup: 1 / ATTACK1_FPS,
        active: 1 / ATTACK1_FPS,
        recovery: 2 / ATTACK1_FPS,
        damage: 3,
        baseLaunch: 1,
        directionalLaunch: 'horizontal',
        hitbox: { x: 12, y: -64, w: 28, h: 16 },
        hitstun: 0.32,
        blockstun: 0.14,
        hitstop: 0.05,
        cooldown: 0.15,
        groundOnly: true,
        momentum: 0.75,
        friction: 0.4,
        hitCancel: 1 / ATTACK1_FPS,
      },
      // Frames 1-2 wind-up (kunai drawn back, then overhead), frame 3 the
      // downward kunai slash. The clip has no recovery frame, so the attack
      // ends with it; the longer cooldown makes up for the missing recovery.
      // The hitbox covers the slash arc in front of the fighter, and it
      // launches the target upward. Chosen only by attack1's `air` branch.
      // Keeps all its drift and nearly all the air steering, for pursuit;
      // its stun holds a juggled target for the next aerial.
      midair_attack1: {
        animation: 'midair_attack1',
        startup: 2 / ATTACK1_FPS,
        active: 1 / ATTACK1_FPS,
        recovery: 0,
        damage: 3,
        baseLaunch: 2,
        directionalLaunch: 'vertical',
        hitbox: { x: 14, y: -100, w: 22, h: 80 },
        hitstun: 0.32,
        blockstun: 0.15,
        hitstop: 0.05,
        cooldown: 0.16,
        airMomentum: 1,
        airControl: 0.85,
        hitCancel: 2 / ATTACK1_FPS,
      },
      // Frames 1-3 wind-up (step in, lead jab, spin), frames 4-5 the kick
      // (low sweep rising into a high kick, both drawn with motion trails),
      // frames 6-7 recovery (kick apex, settle). One hit per attack, so the
      // lead jab is part of the wind-up. The hitbox spans the kick's arc in
      // front of the fighter, knee height to overhead. Slower and heavier than
      // attack1, and it launches the opponent upward instead of pushing it
      // away. Steps in on frame 1 (forward speed raised to 280: about 20
      // units) and keeps half a run.
      attack2: {
        animation: 'attack2',
        startup: 3 / ATTACK2_FPS,
        active: 2 / ATTACK2_FPS,
        recovery: 2 / ATTACK2_FPS,
        damage: 5,
        baseLaunch: 2,
        directionalLaunch: 'vertical',
        hitbox: { x: 10, y: -88, w: 24, h: 78 },
        hitstun: 0.28,
        blockstun: 0.15,
        hitstop: 0.09,
        cooldown: 0.15,
        groundOnly: true,
        momentum: 0.5,
        friction: 0.5,
        step: { at: 0, speed: 280 },
        hitCancel: 3 / ATTACK2_FPS,
      },
      // Frames 1-2 wind-up, frame 3 kick (the forward-low arc), frames 4-5
      // recovery. Drives the target hard downward. Chosen only by attack2's
      // `air` branch. Keeps its drift and most of the steering: never
      // frozen sideways.
      midair_attack2: {
        animation: 'midair_attack2',
        startup: 2 / ATTACK2_FPS,
        active: 1 / ATTACK2_FPS,
        recovery: 2 / ATTACK2_FPS,
        damage: 5,
        baseLaunch: 2,
        directionalLaunch: 'reverseVertical',
        hitbox: { x: 8, y: -44, w: 40, h: 40 },
        hitstun: 0.28,
        blockstun: 0.14,
        hitstop: 0.08,
        cooldown: 0.1,
        airMomentum: 1,
        airControl: 0.7,
        hitCancel: 2 / ATTACK2_FPS,
      },
      // The Throw (extra_attack). Frame 1 wind-up, frame 2 release, frame 3
      // follow-through. No melee hitbox: the damage is the shuriken's
      // (extra_attack_object, 1), released once, as the attack reaches frame
      // 2, from the throwing hand (`offset` is from the fighter's origin,
      // facing right, and mirrors with facing). Keeps half a run and some
      // steering, so #0001 is never rooted while he throws; no hitCancel: a
      // spacing tool, not a combo starter.
      extra_attack: {
        animation: 'extra_attack',
        startup: 1 / EXTRA_ATTACK_FPS,
        active: 1 / EXTRA_ATTACK_FPS,
        recovery: 1 / EXTRA_ATTACK_FPS,
        hitbox: null,
        projectile: { id: 'extra_attack_object', spawnAt: 1 / EXTRA_ATTACK_FPS, offset: { x: 16, y: -38 } },
        cooldown: 0.25,
        groundOnly: true,
        momentum: 0.5,
        control: 0.3,
        friction: 0.6,
      },
    },
  },
];

// Any definition by id, available or not; null for an unknown id.
export function getCharacter(id) {
  return CHARACTERS.find((c) => c.id === id) || null;
}

// Whether `def` may be selected, preloaded or played.
export function isPlayable(def) {
  return !!def?.available;
}

// `id`'s definition only if it is playable: null for an unknown, missing or
// disabled fighter, so no game-start route can instantiate one.
export function getPlayableCharacter(id) {
  const def = getCharacter(id);
  return isPlayable(def) ? def : null;
}

// Every playable definition, in CHARACTERS order (empty while none is).
export function playableCharacters() {
  return CHARACTERS.filter(isPlayable);
}

// Every frame a character needs before battle: fighter poses, projectiles
// and effects, each file once (two clips may share one, e.g. #0001's
// attack4_12 in attack4_release and attack4_whiff_release, or charge_1 in
// charge and charge_release).
export function characterFramePaths(def) {
  const out = [];
  for (const anim of Object.values(def.animations)) out.push(...anim.frames);
  for (const anim of Object.values(def.projectileAnimations || {})) out.push(...anim.frames);
  for (const anim of Object.values(def.effectAnimations || {})) out.push(...anim.frames);
  return [...new Set(out)];
}

// No definition that breaks the attack loadout rules is ever loaded.
for (const def of CHARACTERS) assertLoadout(def);
