// #0006's definition: everything that makes #0006 the fighter it is, and
// nothing any other fighter shares. Registered in js/data/characters.js;
// see docs/characters/0006.md for what it is in play.
//
// Three small flying sisters, cut from one supplied sprite sheet (see
// assets/characters/0006/), who are ONE fighter: one body, one hurtbox, one
// Launch Point, one Energy bar, one Shield and one controller, drawn as
// three members (its `ensemble`, js/data/ensemble.js). Each member has her
// own art and her own place in the group: pink, the tallest, hovering in
// the middle a little above her sisters; green behind her and blue in
// front. Everything that happens to #0006 happens to all three on the same
// step, each in her own art: they idle (floating, each on her own beat),
// fly along the ground (the run), rise and drop (jump, fall), land, Dash and
// air dash, raise a force-field bubble each (the Shield), get hit and are
// flung spinning, together. Movement is the universal one.
//
// Its moves are still to come: no attack has been designed yet, so it has
// no `actions` and no `attacks`, and it is not playable (`available:
// false`) until they are (see js/data/loadout.js: a fighter whose moves are
// still to come). When they are, each names the member(s) performing it
// (`members`: one for an ordinary move; two or all three only for a
// combination written as one) and the others step back behind them. The
// one move it already has is the universal one every fighter's Shield
// button makes in the air, the Deflect, performed by one member: green,
// a whirl that bats projectiles back.
//
// The sheet's attacks (punches, kicks, a dash punch, eye beams, an icy
// breath, a sonic scream, fireballs, a whirlwind), its being caught and
// shocked, its knockout and its icons are not used yet.

import { memberFramePath } from './helpers.js';

// Height in art pixels of each member's idle (her reference clip). The art
// is 1x (one file pixel per art pixel, cut from one sprite sheet with its
// flat background made transparent), so no pixel grid is ever looked for
// in it (`visual.pixelSize: 1`): each clip's heightRatio, its tallest frame
// over its member's idle, is what sizes it, at exactly one art pixel per
// file pixel.
const IDLE_0006 = Object.freeze({ pink: 43, blue: 30, green: 30 });

// Height in art pixels of the whole group at home (its reference): pink's
// idle, lifted by her home's 14 over her sisters' heads.
const GROUP_0006 = IDLE_0006.pink + 14;

// World units per art pixel: the roster's common art-pixel size.
const UNIT_0006 = 88 / 52;

// Playback rates of #0006's clips. The Deflect's phases below are whole
// frames of its clip at its rate (a whole number of 60 Hz steps a frame).
// (The Dash and the air dash last the universal Dash's length, whatever
// these say: each member's clip is shown once across it.)
const FPS_0006 = Object.freeze({
  idle: 6,
  run: 12,
  jump: 10,
  fall: 10,
  land: 15,
  hurt: 12,
  midair_hurt: 12,
  shield: 15,
  mouvment: 12,
  deflect: 15,
});

// Member `member`'s clip of codename `codename`: its files in the order
// `order` plays them (a file shown twice is one file on disk), sized by its
// tallest frame (`height`, art pixels) against her idle.
const clip = (member, codename, order, fps, height, extra = {}) => ({
  frames: order.map((n) => memberFramePath('0006', codename, member, n)),
  fps,
  loop: false,
  heightRatio: height / IDLE_0006[member],
  ...extra,
});

// 1 to n.
const range = (n) => Array.from({ length: n }, (_, i) => i + 1);

// The clips every member plays together (js/data/ensemble.js GROUP_CLIPS),
// for member `member`: `order` the files her idle and run play, `h` her
// clips' tallest frames.
const groupClips = (member, order, h) => ({
  // Hovering in place, her hair stirring: a loop.
  idle: clip(member, 'idle', order.idle, FPS_0006.idle, h.idle, { loop: true }),
  // Flying along just over the ground, legs trailing: a loop whose rate
  // follows the speed, down to 0.6 of it.
  run: clip(member, 'run', order.run, FPS_0006.run, h.run, { loop: true, minSpeedScale: 0.6 }),
  // Rising, an arm thrust up; dropping, arms out; touching down, hands
  // together, a knee bent.
  jump: clip(member, 'jump', [1], FPS_0006.jump, h.jump),
  fall: clip(member, 'fall', [1], FPS_0006.fall, h.fall),
  land: clip(member, 'land', [1], FPS_0006.land, h.land),
  // Hit: dazed, eyes squeezed shut; flung: spinning head over heels (a
  // loop, for as long as she is in the air).
  hurt: clip(member, 'hurt', [1], FPS_0006.hurt, h.hurt),
  midair_hurt: clip(member, 'midair_hurt', [1, 2, 3], FPS_0006.midair_hurt, h.midair_hurt, { loop: true }),
  // The Shield: a force-field bubble in her colour forming round her,
  // held, and shrinking away. (The sheet's bubble grows larger still; the
  // held one is its middle size, so the three bubbles cluster rather than
  // bury each other.)
  prepshield: clip(member, 'prepshield', [1], FPS_0006.shield, h.prepshield),
  shielding: clip(member, 'shielding', [1], FPS_0006.shield, h.shielding),
  releaseshield: clip(member, 'releaseshield', [1], FPS_0006.shield, h.releaseshield),
  // The Dash: a lunge into flight, then flat out, fist first; the air
  // dash: flying forward, legs streaming behind.
  mouvment: clip(member, 'mouvment', [1, 2], FPS_0006.mouvment, h.mouvment),
  midair_mouvment: clip(member, 'midair_mouvment', [1], FPS_0006.mouvment, h.midair_mouvment),
});

// Green's Deflect: the arm drawn up (1), the whirl, an arc swept round in
// front of her from her head to her feet (2, held a frame), done (3).
const DEFLECT_0006 = [1, 2, 2, 3];

export const CHARACTER_0006 = {
  id: '0006',
  displayName: '#0006',
  // Not playable until its moves are designed (see above).
  available: false,
  rosterSlot: 5,

  // Every clip is drawn facing right.
  sourceFacing: 1,

  // No clips of its own: an ensemble's art is its members' (below).
  animations: {},

  // Its three members, back to front (drawn in this order). Home places
  // are in art pixels from the fighter's origin, facing right: pink in the
  // middle, hovering 14 above the ground; green 19 behind, blue 19 in
  // front, both on it. When a move names some of them, a single performer
  // steps to the origin, the others line up behind it, 18 back and 18
  // apart, idling; and all glide back home after, at 260 art pixels a
  // second. Idle, each floats up to 3 art pixels and down again every 1.4
  // s, a third of a beat apart.
  ensemble: {
    referenceMember: 'pink',
    retreat: 18,
    spacing: 18,
    glide: 260,
    asideAnimation: 'idle',
    float: { height: 3, period: 1.4 },
    members: [
      {
        id: 'pink',
        home: { x: 0, y: -14 },
        // Her idle shows its first frame again as its sixth (one file).
        animations: groupClips('pink',
          { idle: [1, 2, 3, 4, 5, 1, 6], run: range(7) },
          {
            idle: 43, run: 35, jump: 42, fall: 43, land: 42, hurt: 37, midair_hurt: 37,
            prepshield: 42, shielding: 45, releaseshield: 42, mouvment: 31, midair_mouvment: 40,
          }),
      },
      {
        id: 'green',
        home: { x: -19, y: 0 },
        animations: {
          ...groupClips('green',
            { idle: range(3), run: range(5) },
            {
              idle: 30, run: 29, jump: 36, fall: 30, land: 30, hurt: 29, midair_hurt: 29,
              prepshield: 33, shielding: 42, releaseshield: 29, mouvment: 25, midair_mouvment: 28,
            }),
          // deflect, her Deflect (see DEFLECT_0006).
          deflect: clip('green', 'deflect', DEFLECT_0006, FPS_0006.deflect, 33),
        },
      },
      {
        id: 'blue',
        home: { x: 19, y: 0 },
        animations: groupClips('blue',
          { idle: range(3), run: range(6) },
          {
            idle: 30, run: 29, jump: 36, fall: 30, land: 30, hurt: 32, midair_hurt: 32,
            prepshield: 30, shielding: 43, releaseshield: 29, mouvment: 25, midair_mouvment: 28,
          }),
      },
    ],
  },

  // A still idle frame (each member's own) for the airborne, landing and
  // hurt clips if their frames fail to load. The Shield, the Deflect, the
  // Dash and the air dash never fall back.
  animationFallbacks: {
    jump: { animation: 'idle', frame: 0 },
    fall: { animation: 'idle', frame: 0 },
    land: { animation: 'idle', frame: 0 },
    hurt: { animation: 'idle', frame: 0 },
    midair_hurt: { animation: 'idle', frame: 0 },
  },

  visual: {
    // The group at home, pink hovering over her sisters, 57 art pixels at
    // the roster's common art-pixel size, 88/52 world units per art pixel
    // (every member is drawn at that size, so their pixels match every
    // fighter's): about 96 units. Each of them is small: blue and green
    // about 51 units, pink 73 with her bow.
    height: GROUP_0006 * UNIT_0006,
    referenceAnimation: 'idle',
    anchor: 'torso',
    pixelSize: 1,
    // The group's portrait: all three idling at home, cropped round their
    // heads.
    portrait: { animation: 'idle', frame: 0, centerY: 0.4, size: 0.8 },
    // The colours it bursts in when the Void takes it (see
    // js/game/rendering/hit-fx.js), picked from its art: pink's red bow,
    // blue's golden hair and her blue, green's green, and their skin.
    eliminationPalette: ['#f83737', '#38b0e0', '#2ec22e', '#f8f058', '#f8d8b8'],
  },

  // One body for the three, measured round the group at home: from blue's
  // and green's feet to pink's bow, over the middle of the group (green's
  // back and blue's front stick out past it, as limbs do). Collision is
  // independent of the art: one collider, one pushbox, one hurtbox. Hit
  // anywhere on it, #0006 takes the one hit, once.
  collider: { width: 40, height: 84 },
  pushbox: { width: 52 },
  hurtboxes: [
    { x: -30, y: -92, w: 60, h: 92 },
  ],

  // Its Energy, its launch reaction and how it rebounds are the shared
  // defaults: only the refill rate could be its own, and it keeps 12 a
  // second.

  // Its guard, what the `shield` input does for #0006 on the ground: all
  // three raise a force-field bubble at once, one Shield (one protection,
  // one Energy bar, one block for each hit). Its perfect Shield opens for
  // 0.1 s after 0.25 s down.
  defense: {
    type: 'shield',
    groundAnimation: 'shielding',
    groundStartAnimation: 'prepshield',
    groundReleaseAnimation: 'releaseshield',
    perfectWindow: 0.1,
    perfectRearm: 0.25,
  },

  // Its recommended controller layout (js/data/controller-profiles.js):
  // nothing of its own to bind yet, its moves still to come. The universal
  // actions keep everyone's inputs (the left stick, Jump on Cross / A, Dash
  // on R1 / RB, L1 / LB for the Shield and the Deflect, Options / Menu to
  // pause). Each move it is given brings its binding here, chosen by the
  // comfort rules: the registry refuses a layout that leaves one out.
  controller: {
    layout: {},
  },

  // Its Deflect, what the `shield` input does for #0006 in the air (schema:
  // js/game/combat/deflect.js), performed by green alone (`members`): she
  // steps to the front while pink and blue drop back. Frame 1 her arm
  // drawn up, then the whirl (frame 2, two frames, live: the arc in front
  // of her from over her head to her feet, out to 32 units), then done a
  // frame more. Every Deflect's 3, Base Launch 2, here sideways, the way
  // the arc sweeps; while it is live it turns the other fighter's
  // projectiles back at their thrower, now #0006's. A little over a
  // quarter of a second in all, keeping the whole of its drift, steered as
  // a medium strike (js/data/attack-mobility.js); no cooldown of its own.
  deflect: {
    animation: 'deflect',
    members: ['green'],
    startup: 1 / FPS_0006.deflect,
    active: 2 / FPS_0006.deflect,
    recovery: 1 / FPS_0006.deflect,
    hitbox: { x: -4, y: -60, w: 36, h: 62 },
    directionalLaunch: 'horizontal',
    hitstun: 0.3,
    blockstun: 0.12,
    hitstop: 0.05,
    mobility: 'medium',
    deflectProjectiles: true,
  },
};
