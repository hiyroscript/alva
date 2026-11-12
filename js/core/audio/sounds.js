// Every sound Alva has, and the guard that keeps it so (the Sound update).
//
// The owner asked for exactly these and nothing else: no menu, hit, jump,
// footstep, announcer, click, countdown, Energy, hazard or character
// sound, no menu or title theme. Sixteen kinds (the first twelve the Sound
// update's; 13 to 16 added by the owner with the match entrance,
// js/game/entrance.js):
//
//    1  a stage theme's Main Battle version (five stages)
//    2  its Overtime version
//    3  its Post-match Victory version
//    4  its Post-match Defeat version
//   4b  its Post-match Draw version
//    5  Practice Ground's factory ambience
//    6  opponent ejected
//    7  player ejected
//    8  the universal ejection (Local Play and Watch Mode)
//    9  a successful Deflect
//   10  a Perfect Shield
//   11  a Shield block
//   12  the Shield held (a loop)
//   13  a fighter spawns or respawns
//   14  the entrance bolt strikes
//   15  the bolt covers the screen
//   16  the cover clears to the stage
//
// 25 pieces of music (five stages, five versions each), one ambience and
// eleven sound effects: ALLOWED_SOUNDS. The engine's registry
// (SoundRegistry) refuses anything else, so no sound can be added by
// accident; a name nobody registered (the menus' old `play('move')`)
// plays nothing at all.

// The five battle stages that have a theme, by map id. Practice Ground has
// none: only its ambience.
export const THEMED_STAGES = Object.freeze(['desert', 'city', 'asperitas', 'adamaris', 'jokull']);

// Each theme's five versions.
export const MUSIC_VERSIONS = Object.freeze(['main', 'overtime', 'victory', 'defeat', 'draw']);

export const AMBIENCE = 'ambience.practice';

export const SFX = Object.freeze({
  ejectOpponent: 'sfx.ejectOpponent',
  ejectPlayer: 'sfx.ejectPlayer',
  ejectUniversal: 'sfx.ejectUniversal',
  deflect: 'sfx.deflect',
  perfectShield: 'sfx.perfectShield',
  block: 'sfx.block',
  shieldHold: 'sfx.shieldHold',
  spawn: 'sfx.spawn',
  boltStrike: 'sfx.boltStrike',
  boltCover: 'sfx.boltCover',
  entranceReveal: 'sfx.entranceReveal',
});

// A theme version's sound id.
export const musicId = (stage, version) => `music.${stage}.${version}`;

// Which of the owner's sixteen kinds each sound is.
export const SOUND_KINDS = Object.freeze({
  ...Object.fromEntries(THEMED_STAGES.flatMap((stage) => [
    [musicId(stage, 'main'), '1'],
    [musicId(stage, 'overtime'), '2'],
    [musicId(stage, 'victory'), '3'],
    [musicId(stage, 'defeat'), '4'],
    [musicId(stage, 'draw'), '4b'],
  ])),
  [AMBIENCE]: '5',
  [SFX.ejectOpponent]: '6',
  [SFX.ejectPlayer]: '7',
  [SFX.ejectUniversal]: '8',
  [SFX.deflect]: '9',
  [SFX.perfectShield]: '10',
  [SFX.block]: '11',
  [SFX.shieldHold]: '12',
  [SFX.spawn]: '13',
  [SFX.boltStrike]: '14',
  [SFX.boltCover]: '15',
  [SFX.entranceReveal]: '16',
});

export const ALLOWED_SOUNDS = Object.freeze(Object.keys(SOUND_KINDS));

export const isAllowedSound = (id) => typeof id === 'string' && Object.hasOwn(SOUND_KINDS, id);

// The engine's sounds by id: what each is made of (a theme version, the
// ambience, an effect's recipe). Only ALLOWED_SOUNDS may be registered,
// each once.
export class SoundRegistry {
  constructor() {
    this.entries = new Map();
  }

  register(id, entry) {
    if (!isAllowedSound(id)) throw new Error(`[Alva] "${id}" is not one of Alva's sounds: nothing outside the owner's closed list (the Sound update's, and the entrance's four) may be registered`);
    if (this.entries.has(id)) throw new Error(`[Alva] Sound "${id}" is registered twice`);
    this.entries.set(id, entry);
    return entry;
  }

  has(id) {
    return this.entries.has(id);
  }

  get(id) {
    return this.entries.get(id) ?? null;
  }

  ids() {
    return [...this.entries.keys()];
  }
}
