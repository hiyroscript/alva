// #0018's definition: everything that makes #0018 the fighter it is, and
// nothing any other fighter shares. Registered in js/data/characters.js;
// see docs/characters/0018.md for what each move does in play.
//
// The pink-haired schoolgirl in a sailor uniform, cut from one supplied
// sprite sheet (see assets/characters/0018/). A devoted stalker who will cut
// down anyone in her way, she fights the way she does in her canon: with
// what she carries (a kitchen knife, a katana, an axe, a flash grenade) and
// her diary, the phone that tells her where her prey will be. Every move is
// one she makes there: she summons nobody, makes no clone, never heals and
// has no power beyond her weapons, her athleticism and her diary. Five
// numbered attacks, each a button of its own, plus her extra_attack:
//
//   attack1  the Kitchen Knife, a quick backhand slash; in the air the Air
//            Katana, her katana swept round before her
//   attack2  the Stalker's Lunge, a low knife lunge along the ground
//            (motion `roll`) that lands far harder in a back turned to her
//            (`backstab`); in the air the Stalker's Dive, the same knife
//            driven at her prey wherever it is (motion `homing`), the same
//            backstab
//   attack3  the Flash Grenade, a hop and a grenade lobbed in an arc (a
//            projectile's `arc`, a capability added for her); in the air
//            the Air Flash Grenade, dropped from her hand. Its flash holds
//            still (`paralyze`) whoever it reaches facing it (`gaze`): a
//            back turned to it is passed by
//   attack4  the Diary, a technique: she checks her diary for where her
//            prey will be, then slips out of its sight (`cloak`): a shimmer
//            to a player, gone to a CPU, until she strikes or is struck
//   attack5  the Axe Swing, a technique: her axe hefted low, then swung
//            up and round in a great arc, 10, sending its target sky-high
//            and shoving even a raised guard back (`blockPush`)
//   extra_attack  the Katana Draw, her katana drawn from over her shoulder
//            in one cut and sheathed again; on the ground only
//
// Her Mash Combo (js/data/mash-combo.js) alternates the Kitchen Knife and
// the Katana Draw, her two close-range strikes.
//
// Her Shield is her katana held up before her, on the ground. In the air
// the Shield button is her Deflect: a flying knee that kicks projectiles
// back. Her Dash is a sprint, leaning far forward; her air dash the same
// lean. Her cooldowns are the shared policy's (js/data/cooldowns.js),
// derived from what each move does, never authored here: the Axe Swing
// waits 5 s (its 10) and the Diary 3 s (its cloak), both from their
// release; the Flash Grenade and the Air Flash Grenade 3 s (the hold of
// their flash), from the throw; nothing else waits at all, and the Deflect
// none. None of her moves costs Energy but the Deflect (her grenade, her one
// projectile, has its 3 s instead).
//
// What of the sheet is no move: her entrance, her ordinary rising and
// landing poses, her falls, her lying and getting up, her losing and
// winning poses (her axe, the boy and the hearts), her other cuts (the
// rising slash, the katana's slash and thrust, the low slashes, the flurry
// of stabs and its cuts, the cuts that open before her), the three
// ultimates (the frenzy of cuts, the shredding cuts and the black cloak's
// blinding light), the glow of her diary, the grenade rolling and going off,
// the portrait, the palette swaps and the sheet's logo.

import { framePath, pad, flick } from './helpers.js';

// Height in art pixels of #0018's idle, her stance (her reference clip: the
// tallest of its frames). Her art is 1x (one file pixel per art pixel, cut
// with the sheet's flat navy made transparent), so no pixel grid is ever
// looked for in it (`visual.pixelSize: 1`): each clip's heightRatio, its
// tallest frame over this, sizes it at exactly one art pixel per file pixel.
const ART_0018 = 50;

// World units per art pixel: the roster's common art-pixel size.
const UNIT_0018 = 88 / 52;

// Playback rates of #0018's clips. Each attack's phases below are whole
// frames of its clip at its rate, so tuning a rate keeps the timing on the
// art; every attack's rate is a whole number of 60 Hz steps per frame, so
// each frame lasts exactly as long as its gameplay does. (The Dash and the
// air dash last the universal Dash's length, whatever these say: their
// clips are shown once across it.)
const FPS_0018 = Object.freeze({
  idle: 4,
  run: 12,
  mouvment: 12,
  midair_mouvment: 12,
  jump: 12,
  fall: 8,
  land: 15,
  hurt: 12,
  shield: 15,
  deflect: 15,
  attack1: 20,
  midair_attack1: 15,
  attack2: 15,
  attack3: 20,
  midair_attack3: 15,
  attack4: 10,
  attack5_cast: 10,
  attack5_release: 15,
  extra_attack: 20,
});

// The Launch Points the Axe Swing deals: a full swing of an axe, an
// ultimate-level blow.
const AXE_0018 = 10;
// The Stalker's Lunge's run along the ground (motion `roll`): its own
// speed, the share of her running speed it keeps, its top speed, how fast
// it runs down, and how hard a Shield that stops it sends her back: about
// 120 units from a standstill, low and fast, then she is all but still.
const LUNGE_0018 = Object.freeze({ type: 'roll', speed: 700, keep: 0.3, maxSpeed: 900, friction: 2000, recoil: 220 });
// What either Stalker's move deals instead to a back turned to her: 5 at
// Base Launch 3, sent flying, held longer (`backstab`).
const BACKSTAB_0018 = Object.freeze({ damage: 5, baseLaunch: 3, directionalLaunch: 'horizontal', hitstun: 0.5, hitstop: 0.1 });
// The Stalker's Dive (motion `homing`): how far she sees her prey (units),
// the speed she dives at, how hard she springs off what she meets (up and
// back) and the share of her speed she keeps once it is over.
const DIVE_0018 = Object.freeze({ type: 'homing', range: 220, speed: 950, rebound: 520, recoil: 160, exit: 0.3 });
// The Flash Grenade's hop off the ground (motion `rise`), units/s.
const HOP_0018 = 240;
// How long the flash holds still whoever it reaches facing it, seconds.
const FLASH_0018 = 1;
// The Diary's cloak: how long she is out of sight, seconds.
const CLOAK_0018 = 3;

// Where her body is in each file of a codename (`anchorX`, art pixels from
// the left of the file's visible art), file by file: the middle of her
// uniform, its navy blouse and skirt, which every frame draws on her body.
// Her knife, her katana and its arc, her axe, her hair streaming behind her
// and her arms thrown out would pull the automatic anchor off her body.
const ANCHORS_0018 = Object.freeze({
  idle: [15.5, 13.5],
  run: [11.5, 11.5, 11.5, 13.5, 13.5, 13.5],
  mouvment: [24.5, 24.5],
  midair_mouvment: [24.5, 24.5],
  jump: [17.5, 17.5],
  fall: [20.5, 20.5],
  land: [18.5],
  hurt: [13.5, 13.5],
  midair_hurt: [15.5, 25.5],
  prepshield: [15.5],
  shielding: [14.5],
  releaseshield: [15.5],
  deflect: [19.5, 19.5, 15.5],
  attack1: [19.5, 21.5, 20.5],
  midair_attack1: [14.5, 16.5, 24.5],
  attack2: [18.5, 21.5, 16.5, 26.5, 17.5],
  midair_attack2: [21.5, 16.5, 26.5],
  attack3: [17.5, 17.5, 17.5, 20.5, 17.5, 18.5, 18.5],
  midair_attack3: [20.5, 17.5, 18.5, 18.5],
  attack4: [13.5, 13.5, 15.5, 13.5, 14.5, 16.5, 13.5],
  attack5: [23.5, 22.5, 18.5, 22.5],
  extra_attack: [13.5, 14.5, 16.5, 24.5, 15.5],
});

// The height in art pixels of each file of a codename, file by file (what
// sizes a clip: its tallest frame over ART_0018). Every clip stands on the
// bottom of its art: her feet, or her body where she lies flat.
const HEIGHTS_0018 = Object.freeze({
  idle: [49, 50],
  run: [50, 50, 50, 50, 50, 50],
  mouvment: [42, 42],
  midair_mouvment: [42, 42],
  jump: [51, 52],
  fall: [51, 52],
  land: [41],
  hurt: [42, 45],
  midair_hurt: [45, 30],
  prepshield: [50],
  shielding: [48],
  releaseshield: [50],
  deflect: [45, 45, 44],
  attack1: [48, 45, 45],
  midair_attack1: [51, 53, 54],
  attack2: [49, 39, 37, 33, 42],
  midair_attack2: [39, 37, 33],
  attack3: [41, 51, 52, 46, 50, 57, 57],
  midair_attack3: [46, 50, 57, 57],
  attack4: [50, 51, 50, 51, 51, 50, 51],
  attack5: [45, 45, 44, 44],
  extra_attack: [50, 48, 50, 50, 50],
});

// A clip of codename `codename`'s files, in the order `order` plays them (a
// file shown twice is one file on disk), sized by its tallest frame against
// the idle, each frame anchored on her body.
const clip = (codename, order, fps, extra = {}) => ({
  frames: order.map((n) => framePath('0018', codename, n)),
  fps,
  loop: false,
  heightRatio: Math.max(...order.map((n) => HEIGHTS_0018[codename][n - 1])) / ART_0018,
  anchorX: order.map((n) => ANCHORS_0018[codename][n - 1]),
  ...extra,
});

// The Kitchen Knife's art: her knife held low behind her (1), slashed round
// before her in a grey arc (2, held), and up by her face (3, held).
const KITCHEN_KNIFE_0018 = [1, 2, 2, 3, 3];
// The Air Katana's: her katana over her shoulder (1), swept round before
// her in a pale blue arc (2, held), and the blade out low (3).
const AIR_KATANA_0018 = [1, 2, 2, 3];
// The Stalker's Lunge's: her knife raised, set (1), leaning in low (2), then
// away low along the ground, a streak behind her (3), stretched out flat in
// her lunge, her knife out before her (4, held), and up again (5, held).
const STALKER_LUNGE_0018 = [1, 2, 3, 4, 4, 4, 5, 5];
// The Stalker's Dive's: leaning in (1, held: the lock-on), away in a streak
// (2), and stretched out flat, knife first, as she dives (3, held).
const STALKER_DIVE_0018 = [1, 1, 2, 3, 3, 3, 3, 3];
// The Flash Grenade's on the ground: crouched (1), springing up (2, 3),
// her arm drawn back (4, held), whipped round from below (5, held) and over
// her head as the grenade goes (6), her hand still up (7, held) as she
// comes down. In the air (its own files of the same throw): her arm drawn
// back (1), whipped round (2) and over (3), her hand still up (4, held).
const FLASH_GRENADE_0018 = [1, 2, 3, 4, 4, 5, 5, 6, 7, 7];
const AIR_FLASH_GRENADE_0018 = [1, 2, 3, 4, 4];
// The Diary's cast: her stance (1), her head bowed, her eyes lost in shadow
// (2), her phone drawn from her skirt (3, 4, 5) and held up before her face
// as she reads (6, held). Its release: the phone lowered the way it came
// (5, 4, 3: the sheet draws it so) and put away (7).
const DIARY_CAST_0018 = [1, 2, 3, 4, 5, 6, 6];
const DIARY_RELEASE_0018 = [5, 4, 3, 7];
// The Axe Swing's cast: her axe hefted low before her (1, held), its head
// drawn back down by her feet (2, held long). Its release: swung round in a great
// arc, its haft and head blurred (3, held), and up on her shoulder (4, held).
const AXE_CAST_0018 = [1, 1, 2, 2, 2, 2];
const AXE_RELEASE_0018 = [3, 3, 4, 4];
// The Katana Draw's: her stance, her eyes in shadow (1), her hand on the
// hilt over her shoulder (2), drawn in one cut, a pale blue arc (3, held),
// the blade out low (4) and sheathed (5).
const KATANA_DRAW_0018 = [1, 2, 3, 3, 4, 5];
// Her Deflect's: a flying knee, her leg drawn up (1, 2, held), and tucked
// (3).
const DEFLECT_0018 = [1, 2, 2, 3];

export const CHARACTER_0018 = {
  id: '0018',
  displayName: '#0018',
  available: true,
  rosterSlot: 17,

  // Every clip is drawn facing right.
  sourceFacing: 1,

  // Anchors: see ANCHORS_0018.
  animations: {
    // Her stance, her knife hand at her side: two poses, swaying.
    idle: { ...clip('idle', [1, 2], FPS_0018.idle), loop: true },
    // The run: the sheet's six strides, her hair streaming. Its rate
    // follows the speed, down to 0.6 of it (and up past it on a Dash's
    // run-on).
    run: { ...clip('run', [1, 2, 3, 4, 5, 6], FPS_0018.run), loop: true, minSpeedScale: 0.6 },
    // Springing up, her arms out, then spread; falling, her arms flung wide;
    // touching down crouched.
    jump: clip('jump', [1, 2], FPS_0018.jump),
    fall: clip('fall', [1, 2], FPS_0018.fall),
    land: clip('land', [1], FPS_0018.land),
    // mouvment, the Dash: a sprint, leaning far forward, streaks behind
    // her, shown across the whole Dash.
    mouvment: clip('mouvment', [1, 2], FPS_0018.mouvment),
    // midair_mouvment, the air dash: the same lean, played once across the
    // whole air dash.
    midair_mouvment: clip('midair_mouvment', [1, 2], FPS_0018.midair_mouvment),
    // Hitstun: `hurt` rocked back, then doubled over, her eyes in shadow;
    // `midair_hurt` thrown back, then flung flat.
    hurt: clip('hurt', [1, 2], FPS_0018.hurt),
    midair_hurt: clip('midair_hurt', [1, 2], FPS_0018.hurt),
    // Her guard, on the ground: her hand on her knife (prepshield), her
    // katana held up before her (shielding), and her hand on her knife again
    // (releaseshield).
    prepshield: clip('prepshield', [1], FPS_0018.shield),
    shielding: clip('shielding', [1], FPS_0018.shield),
    releaseshield: clip('releaseshield', [1], FPS_0018.shield),
    // deflect, her Deflect (see DEFLECT_0018).
    deflect: clip('deflect', DEFLECT_0018, FPS_0018.deflect),
    // attack1, the Kitchen Knife (see KITCHEN_KNIFE_0018).
    attack1: clip('attack1', KITCHEN_KNIFE_0018, FPS_0018.attack1),
    // midair_attack1, the Air Katana (see AIR_KATANA_0018).
    midair_attack1: clip('midair_attack1', AIR_KATANA_0018, FPS_0018.midair_attack1),
    // attack2 and midair_attack2, the Stalker's Lunge and the Stalker's
    // Dive (see STALKER_LUNGE_0018).
    attack2: clip('attack2', STALKER_LUNGE_0018, FPS_0018.attack2),
    midair_attack2: clip('midair_attack2', STALKER_DIVE_0018, FPS_0018.attack2),
    // attack3 and midair_attack3, the Flash Grenade on the ground and in the
    // air (see FLASH_GRENADE_0018).
    attack3: clip('attack3', FLASH_GRENADE_0018, FPS_0018.attack3),
    midair_attack3: clip('midair_attack3', AIR_FLASH_GRENADE_0018, FPS_0018.midair_attack3),
    // attack4, the Diary, a technique: its cast and its release (see
    // DIARY_CAST_0018), from the attack4 files.
    attack4_cast: clip('attack4', DIARY_CAST_0018, FPS_0018.attack4),
    attack4_release: clip('attack4', DIARY_RELEASE_0018, FPS_0018.attack4),
    // attack5, the Axe Swing, a technique: its cast and its release (see
    // AXE_CAST_0018), from the attack5 files.
    attack5_cast: clip('attack5', AXE_CAST_0018, FPS_0018.attack5_cast),
    attack5_release: clip('attack5', AXE_RELEASE_0018, FPS_0018.attack5_release),
    // extra_attack, the Katana Draw (see KATANA_DRAW_0018).
    extra_attack: clip('extra_attack', KATANA_DRAW_0018, FPS_0018.extra_attack),
  },

  // Its projectile's art, centred where it is: the grenade, its pin up (the
  // sheet draws it five times along its arc, the same drawing each time: one
  // file), tumbling as it flies (its spin: see the projectile). Drawn flying
  // right: mirrored when it flies left.
  projectileAnimations: {
    attack3_object: {
      frames: [framePath('0018', 'attack3_object', 1)],
      fps: 1,
      loop: true,
      sourceFacing: 1,
    },
  },

  // A still stance frame for the airborne, landing and hurt clips if their
  // frames fail to load. Attacks, the Shield, the Deflect, the Dash and the
  // air dash never fall back: one whose frames are missing is refused.
  animationFallbacks: {
    jump: { animation: 'idle', frame: 0 },
    fall: { animation: 'idle', frame: 0 },
    land: { animation: 'idle', frame: 0 },
    hurt: { animation: 'idle', frame: 0 },
    midair_hurt: { animation: 'idle', frame: 0 },
  },

  visual: {
    // Her 50-pixel stance at the roster's common art-pixel size, 88/52
    // world units per art pixel (so every fighter's pixels are the same
    // size on screen): about 85 units.
    height: ART_0018 * UNIT_0018,
    referenceAnimation: 'idle',
    anchor: 'torso',
    pixelSize: 1,
    portrait: { animation: 'idle', frame: 1, centerY: 0.24, size: 0.56 },
    // The colours she bursts in when the Void takes her (see
    // js/game/rendering/hit-fx.js), picked from her art: her pink hair, its
    // deeper pink, her navy uniform, her skin and her red bow.
    eliminationPalette: ['#fdb2fa', '#ef68a8', '#3a2699', '#ffb99b', '#e80008'],
  },

  // Her body, measured from her stance: her head under its mass of pink
  // hair, then her uniform and legs. Collision is independent of the art.
  collider: { width: 26, height: 80 },
  pushbox: { width: 28 },
  hurtboxes: [
    { x: -15, y: -84, w: 30, h: 30 }, // head and hair
    { x: -13, y: -54, w: 26, h: 54 }, // uniform and legs
  ],

  // How #0018 responds to being launched (see resolveLaunchReaction in
  // js/game/combat/combat.js): light and quick to come back, 0.15 s more
  // stun per 1000 units/s and 0.45 s more at most, tumbling from 1150
  // units/s, and a held direction bends a launch by up to 20 degrees.
  launchReaction: {
    stunPerThousand: 0.15,
    maxStun: 0.45,
    tumbleSpeed: 1150,
    steerAngle: 20,
  },

  // Her guard, what the `shield` input does for #0018 on the ground: her
  // katana held up before her (see the clips). Her perfect Shield opens for
  // 0.1 s after 0.25 s down.
  defense: {
    type: 'shield',
    groundAnimation: 'shielding',
    groundStartAnimation: 'prepshield',
    groundReleaseAnimation: 'releaseshield',
    perfectWindow: 0.1,
    perfectRearm: 0.25,
  },

  // Her Deflect, what the `shield` input does for #0018 in the air (schema:
  // js/game/combat/deflect.js): her leg drawn up (the startup), then her
  // flying knee (live for two frames: 12 units behind her to 36 in front,
  // from her feet to over her head), and tucked (its recovery). Every
  // Deflect's 3, Base Launch 2, here sideways, kicked away before her; while
  // it is live it turns the other fighter's projectiles back at their
  // thrower, now #0018's. Four fifteenths of a second in all, keeping the
  // whole of her drift, under the universal air control, never stepping in
  // (a defense: js/data/attack-movement.js); no cooldown of its own.
  deflect: {
    animation: 'deflect',
    startup: 1 / FPS_0018.deflect,
    active: 2 / FPS_0018.deflect,
    recovery: 1 / FPS_0018.deflect,
    hitbox: { x: -12, y: -78, w: 48, h: 80 },
    directionalLaunch: 'horizontal',
    hitstun: 0.3,
    blockstun: 0.12,
    hitstop: 0.05,
    deflectProjectiles: true,
  },

  // Five numbered attacks, each a button of its own (see
  // js/data/loadout.js): attack1, attack2 and attack3 ordinary attacks
  // with their mid-air versions, attack4 and attack5 techniques (on the
  // ground); and her extra_attack, on the ground only (its attack is
  // `groundOnly`).
  actions: {
    extra_attack: 'extra_attack', // the Katana Draw
    attack1: { ground: 'attack1', air: 'midair_attack1' }, // the Kitchen Knife / the Air Katana
    attack2: { ground: 'attack2', air: 'midair_attack2' }, // the Stalker's Lunge / the Stalker's Dive
    attack3: { ground: 'attack3', air: 'midair_attack3' }, // the Flash Grenade, on the ground and in the air
    attack4: { type: 'technique', id: 'attack4' }, // the Diary
    attack5: { type: 'technique', id: 'attack5' }, // the Axe Swing
  },

  // Her Mash Combo pair (js/data/mash-combo.js): the Kitchen Knife and the
  // Katana Draw, her two close-range strikes. Mashing either button sets off
  // twelve turns.
  mashCombo: { attacks: ['attack1', 'extra_attack'] },

  // Her Special abilities (js/data/special-abilities.js): the Diary, the
  // phone that tells her where her prey will be, and her slipping out of its
  // sight; and the Axe Swing, 10 that shoves even a raised guard back, after
  // a breakable wind-up. Her knife, her katana, her lunge, her dive and her
  // grenade are her everyday tools: ordinary to the player.
  specialAbilities: ['attack4', 'attack5'],

  // UI only: a frame of each move's own art (zero-based frames): her katana
  // drawn in its arc, her knife's grey arc and her katana's in the air, her
  // lunge stretched out flat (on the ground and in the air), her arm over her
  // head as the grenade goes (on the ground and in the air), her phone held
  // up before her face, and her axe swung round.
  mobileAbilities: {
    extra_attack: { label: 'Katana Draw', preview: { animation: 'extra_attack', frame: 2 } },
    attack1: { label: 'Kitchen Knife', preview: { animation: 'attack1', frame: 1 }, previews: { air: { animation: 'midair_attack1', frame: 1 } } },
    attack2: { label: 'Stalker\'s Lunge', preview: { animation: 'attack2', frame: 3 }, previews: { air: { animation: 'midair_attack2', frame: 4 } } },
    attack3: { label: 'Flash Grenade', preview: { animation: 'attack3', frame: 7 }, previews: { air: { animation: 'midair_attack3', frame: 2 } } },
    attack4: { label: 'Diary', preview: { animation: 'attack4_cast', frame: 5 } },
    attack5: { label: 'Axe Swing', preview: { animation: 'attack5_release', frame: 0 } },
  },

  // In-game ability names (js/data/abilities.js).
  abilityNames: {
    extra_attack: 'Katana Draw',
    attack1: 'Kitchen Knife',
    midair_attack1: 'Air Katana',
    attack2: 'Stalker\'s Lunge',
    midair_attack2: 'Stalker\'s Dive',
    attack3: 'Flash Grenade',
    midair_attack3: 'Air Flash Grenade',
    attack4: 'Diary',
    attack5: 'Axe Swing',
  },

  // What each move does, in a line, for the controller editor (Settings ›
  // Controls › Controller controls). English here; other languages by key
  // (ability.0018.<move>.description).
  abilityDescriptions: {
    extra_attack: 'Draws her katana from over her shoulder in one cut and sheathes it again, knocking the opponent away.',
    attack1: 'A quick backhand slash of her kitchen knife.',
    midair_attack1: 'Sweeps her katana round before her in the air, knocking the opponent away.',
    attack2: 'Lunges low along the ground, knife first. Into a back turned to her it strikes far harder and sends the opponent flying.',
    midair_attack2: 'Dives knife first at the opponent wherever it is; into a back turned to her it strikes far harder. Once per jump.',
    attack3: 'Hops and lobs a flash grenade in an arc: whoever it reaches facing it is blinded and held still. Turning away avoids it.',
    midair_attack3: 'Lobs a flash grenade in an arc from the air: whoever it reaches facing it is blinded and held still. Turning away avoids it.',
    attack4: 'Checks her diary for where her prey will be, then slips out of its sight until she strikes or is struck.',
    attack5: 'Hefts her axe low, then swings it up and round in a great arc: a ruinous blow that sends the opponent sky-high and shoves even a raised guard back. A hit before the swing breaks it.',
  },

  // Her recommended controller layout (js/data/controller-profiles.js):
  // every move on one input of its own, no combination anywhere, chosen
  // for what each move does rather than its attack number. The universal
  // actions keep everyone's inputs (the left stick, Jump on Cross / A, Dash
  // on R1 / RB, L1 / LB for the Shield and the Deflect, Options / Menu to
  // pause).
  //
  //   Square / X     her quick blows: the Kitchen Knife, and in the air the
  //                  Air Katana, her basic aerial
  //   Triangle / Y   the Katana Draw, her other everyday strike, a thumb's
  //                  roll from Square for her Mash Combo
  //   R2 / RT        the Flash Grenade, on the ground and in the air: her
  //                  one ranged move, lobbed before her
  //   right stick    the Stalker's Lunge, and in the air the Stalker's
  //   forward        Dive: each sent out the way she faces, at her prey
  //   L2 / LT        the Diary, her first Special: a deliberate trigger,
  //                  never squeezed by accident
  //   Circle / B     the Axe Swing, her other Special: a deliberate press
  //                  for a long, breakable wind-up
  controller: {
    layout: {
      'ground:attack1': pad('west'),
      'ground:extra_attack': pad('north'),
      'ground:attack2': flick('forward'),
      'ground:attack3': pad('r2'),
      'ground:attack4': pad('l2'),
      'ground:attack5': pad('east'),
      'air:attack1': pad('west'),
      'air:attack2': flick('forward'),
      'air:attack3': pad('r2'),
    },
  },

  // Techniques, keyed by the attack they are (schema and phases:
  // js/game/combat/technique.js). A cast: #0018 stands committed to it,
  // then lets go all at once. A hit on #0018 before it lets go breaks it
  // (nothing released), and it needs the ground throughout. Its cooldown
  // begins as it releases (a cast broken before then starts none).
  techniques: {
    // The Diary: seven tenths of a second with her phone out, her eyes in
    // shadow, reading where her prey will be (nothing protects her), then
    // she is gone from its sight: cloaked for CLOAK_0018 seconds (`cloak`,
    // see CombatState.cloakFor). Meanwhile she is drawn as a faint shimmer
    // and a CPU cannot see her at all (it sees her where she vanished,
    // doing nothing), but she can be hit, pushed and pulled exactly as
    // ever. Her first move (an attack, the Deflect, a technique) or any hit
    // that reaches her shows her again at once: the moment to be behind her
    // prey, for her lunge's backstab. Two fifths of a second more as the
    // phone is put away, which any move cuts short (it harms nobody, so it
    // gives way). The policy's 3 s, for its cloak, from the release; no
    // Energy.
    attack4: {
      castAnimation: 'attack4_cast',
      releaseAnimation: 'attack4_release',
      cloak: CLOAK_0018,
    },
    // The Axe Swing: three fifths of a second with her axe hefted low, then
    // its head drawn back by her feet (nothing protects her), then the swing:
    // whoever is within its arc, from 24 units behind her round to 60 in
    // front of her and from the floor to over her head, takes AXE_0018 at
    // Base Launch 3 straight up, swept from low up and over (the sheet's
    // upward move): sent sky-high; a Shield that blocks it is shoved 600
    // units/s back along it (`blockPush`). Four fifteenths of a second more, the swing
    // and the axe up on her shoulder. Once every 5 seconds (the policy's,
    // for 10 damage), from the release; no Energy.
    attack5: {
      castAnimation: 'attack5_cast',
      releaseAnimation: 'attack5_release',
      burst: {
        hitbox: { x: -24, y: -80, w: 84, h: 82 },
        hit: {
          damage: AXE_0018, baseLaunch: 3, directionalLaunch: 'vertical', blockPush: 600,
          hitstun: 0.5, blockstun: 0.22, hitstop: 0.12,
        },
      },
    },
  },

  // Its projectile (schema: js/game/combat/projectile.js), named after the
  // attack that throws it; the Air Flash Grenade throws its own, the same
  // grenade in the same art.
  projectiles: {
    // The Flash Grenade's grenade: lobbed (`arc`), 520 units/s the way she
    // faces, leaving going up at 120 units/s and falling at 1500 units/s
    // every second, a turn and a half a second as it tumbles: from her hop
    // it comes down on a fighter about 150 to 270 units off and passes over
    // one nearer; the floor ends it, and so does the end of its 1.4 s.
    // Whoever it reaches facing it (`gaze`: a back turned to the side it
    // comes from is passed by, the grenade flying on) takes 1 and is held
    // still by its flash for FLASH_0018 s (a paralysis: no launch,
    // helpless): knocked out of the fight long enough to be got behind. The
    // policy's 3 s, for its hold, from the throw; no Energy.
    attack3_object: {
      animation: 'attack3_object',
      speed: 520,
      lifetime: 1.4,
      arc: { lift: 120, gravity: 1500 },
      hitbox: { x: -11, y: -11, w: 22, h: 22 },
      damage: 1,
      hitstun: 0.3,
      blockstun: 0.12,
      hitstop: 0.06,
      paralyze: FLASH_0018,
      gaze: true,
      rotationSpeed: 540,
    },
    // The Air Flash Grenade's: the same grenade dropped level from her
    // hand (no lift), 400 units/s the way she faces, falling at 1500 units/s
    // every second: it comes down on whoever is below and ahead of her, the
    // further the higher she throws it. The same flash.
    midair_attack3_object: {
      animation: 'attack3_object',
      speed: 400,
      lifetime: 1.4,
      arc: { lift: 0, gravity: 1500 },
      hitbox: { x: -11, y: -11, w: 22, h: 22 },
      damage: 1,
      hitstun: 0.3,
      blockstun: 0.12,
      hitstop: 0.06,
      paralyze: FLASH_0018,
      gaze: true,
      rotationSpeed: 540,
    },
  },

  // Attack definitions (schema: createAttackDefinition in
  // js/game/combat/attacks.js). Phases are whole frames of each clip, and
  // every hitbox is measured from its art (facing right from the origin,
  // mirrored with facing). Only the grenades have a cooldown (the policy's
  // 3 s, for their flash's hold): none of the others deals 10, heals or
  // holds. Each moves by the shared attack movement
  // (js/data/attack-movement.js): never steered on the ground, the aerials
  // under the universal air control; the Kitchen Knife and the Katana Draw
  // step in by the shared Step-in.
  attacks: {
    // The Kitchen Knife: her knife held low behind her (frame 1, a
    // twentieth of a second), slashed round before her in a grey arc
    // (frames 2-3, live: from 2 units before her out to 40, from her waist
    // to over her shoulder), 3, Base Launch 1 sideways. Up by her face
    // (frames 4-5): a quarter of a second in all, her quickest blow. Once it
    // has hit, it opens a follow-up. It steps in by the shared Step-in. On
    // the ground only (its air move is the Air Katana).
    attack1: {
      animation: 'attack1',
      startup: 1 / FPS_0018.attack1,
      active: 2 / FPS_0018.attack1,
      recovery: 2 / FPS_0018.attack1,
      damage: 3,
      baseLaunch: 1,
      directionalLaunch: 'horizontal',
      hitbox: { x: 2, y: -66, w: 38, h: 40 },
      hitstun: 0.3,
      blockstun: 0.12,
      hitstop: 1 / 30,
      groundOnly: true,
      hitCancel: 3 / FPS_0018.attack1,
    },
    // The Air Katana: her katana over her shoulder (frame 1, a fifteenth of
    // a second), swept round before her in a pale blue arc (frames 2-3,
    // live: from 4 units behind her out to 62, from her knees to over her
    // head), 3, Base Launch 2 sideways. The blade out low (frame 4): four
    // fifteenths of a second. Her drift under the universal air control.
    midair_attack1: {
      animation: 'midair_attack1',
      startup: 1 / FPS_0018.midair_attack1,
      active: 2 / FPS_0018.midair_attack1,
      recovery: 1 / FPS_0018.midair_attack1,
      damage: 3,
      baseLaunch: 2,
      directionalLaunch: 'horizontal',
      hitbox: { x: -4, y: -88, w: 66, h: 66 },
      hitstun: 0.32,
      blockstun: 0.12,
      hitstop: 0.05,
    },
    // The Stalker's Lunge: her knife raised, set, and leaning in (frames
    // 1-2, two fifteenths of a second), then away low along the ground the
    // way she faces (motion `roll`, LUNGE_0018: 700 units/s and 0.3 of her
    // running speed, up to 900, running down at 2000 units/s every second:
    // about 130 units from a standstill), stretched out flat, her knife out
    // before her (frames 3-6, live: from her middle out to 58 units, from her
    // knees to her shoulder), 3, Base Launch 1 sideways. Into a back turned
    // to her (`backstab`, BACKSTAB_0018) it deals 5 instead, at Base Launch
    // 3, sent flying. Up again (frames 7-8): eight fifteenths of a second in
    // all. A Shield that blocks her stops her dead and sends her back; a
    // wall stops her. Once it has hit, it opens a follow-up. On the ground
    // only (its air move is the Stalker's Dive).
    attack2: {
      animation: 'attack2',
      startup: 2 / FPS_0018.attack2,
      active: 4 / FPS_0018.attack2,
      recovery: 2 / FPS_0018.attack2,
      damage: 3,
      baseLaunch: 1,
      directionalLaunch: 'horizontal',
      hitbox: { x: 0, y: -54, w: 58, h: 40 },
      hitstun: 0.32,
      blockstun: 0.14,
      hitstop: 0.05,
      backstab: BACKSTAB_0018,
      motion: LUNGE_0018,
      groundOnly: true,
      hitCancel: 6 / FPS_0018.attack2,
    },
    // The Stalker's Dive: leaning in (frames 1-2, two fifteenths of a
    // second, the hang: she finds her prey within 220 units), then she dives
    // knife first straight at it (motion `homing`, DIVE_0018: 950 units/s,
    // for up to a third of a second), stretched out flat (frames 3-7, live:
    // from 6 units behind her out to 54, from her knees to her shoulder),
    // 3, Base Launch 2 sideways; into a back turned to her, 5 at Base Launch
    // 3 (`backstab`, BACKSTAB_0018). She springs off what she meets. Once
    // per airtime; 0.6 of her drift kept.
    midair_attack2: {
      animation: 'midair_attack2',
      startup: 2 / FPS_0018.attack2,
      active: 5 / FPS_0018.attack2,
      recovery: 1 / FPS_0018.attack2,
      damage: 3,
      baseLaunch: 2,
      directionalLaunch: 'horizontal',
      hitbox: { x: -6, y: -54, w: 60, h: 44 },
      hitstun: 0.34,
      blockstun: 0.14,
      hitstop: 0.05,
      backstab: BACKSTAB_0018,
      airUses: 1,
      motion: DIVE_0018,
      airMomentum: 0.6,
    },
    // The Flash Grenade: crouched (frame 1, a twentieth of a second), then a
    // hop (motion `rise`, HOP_0018: up at 240 units/s for three twentieths,
    // then on under gravity, about 45 units in all), her arm drawn back and
    // whipped round (frames 4-7), and over her head as the grenade leaves
    // her hand 16 units before her and 86 up as she starts down (frame 8,
    // seven twentieths in): lobbed in an arc (see attack3_object). Her hand
    // still up (frames 9-10) as she comes down: half a second in all, back
    // on the ground as it ends (so the button pressed again is this move
    // again, held by its cooldown, never the Air Flash Grenade at once). The
    // policy's 3 s, for its hold, from the throw; no Energy. On the ground
    // only (its air move is the Air Flash Grenade).
    attack3: {
      animation: 'attack3',
      startup: 1 / FPS_0018.attack3,
      active: 3 / FPS_0018.attack3,
      recovery: 6 / FPS_0018.attack3,
      hitbox: null,
      projectile: { id: 'attack3_object', spawnAt: 7 / FPS_0018.attack3, offset: { x: 16, y: -86 } },
      motion: { type: 'rise', speed: HOP_0018 },
      groundOnly: true,
    },
    // The Air Flash Grenade: her arm drawn back (frame 1, a fifteenth of a
    // second), whipped round (frame 2), and over her head as the grenade
    // leaves her hand 16 units before her and 86 up (frame 3, two fifteenths
    // in): lobbed in an arc (see midair_attack3_object). Her hand still up
    // (frames 4-5): a third of a second in all. Her drift under the
    // universal air control. The policy's 3 s, for its hold, from the
    // throw.
    midair_attack3: {
      animation: 'midair_attack3',
      startup: 2 / FPS_0018.midair_attack3,
      active: 1 / FPS_0018.midair_attack3,
      recovery: 2 / FPS_0018.midair_attack3,
      hitbox: null,
      projectile: { id: 'midair_attack3_object', spawnAt: 2 / FPS_0018.midair_attack3, offset: { x: 16, y: -86 } },
    },
    // The Katana Draw: her stance, her eyes in shadow, and her hand to the
    // hilt over her shoulder (frames 1-2, a tenth of a second), then drawn in
    // one cut, a pale blue arc (frames 3-4, live: from 2 units before her
    // out to 62, from her waist to over her head), 3, Base Launch 2
    // sideways. The blade out low and sheathed (frames 5-6): three tenths of
    // a second in all. Once it has hit, it opens a follow-up. It steps in by
    // the shared Step-in. On the ground only: the sheet draws it standing.
    extra_attack: {
      animation: 'extra_attack',
      startup: 2 / FPS_0018.extra_attack,
      active: 2 / FPS_0018.extra_attack,
      recovery: 2 / FPS_0018.extra_attack,
      damage: 3,
      baseLaunch: 2,
      directionalLaunch: 'horizontal',
      hitbox: { x: 2, y: -82, w: 60, h: 56 },
      hitstun: 0.32,
      blockstun: 0.12,
      hitstop: 1 / 30,
      groundOnly: true,
      hitCancel: 4 / FPS_0018.extra_attack,
    },
  },
};
