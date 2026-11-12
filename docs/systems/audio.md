# Audio

Alva's sound (the **Sound update**): a theme for each battle stage in five
versions, Practice Ground's factory ambience, and eleven sound effects: the
Sound update's seven, and four the owner added with the match entrance
([battle](../gameplay/battle.md#the-matchs-entrance)): the spawn, the
bolt's strike, the bolt covering the screen and the reveal. Nothing else:
no menu, hit, jump, footstep, announcer, click, countdown, Energy, hazard
or character sound, and no menu or title theme. The menus' old
`play('move')` calls stay silent. The list is closed: only the owner adds
to it, as with the entrance's four.

| Kind | Sound | Where it plays |
| --- | --- | --- |
| 1 | A stage theme's **Main Battle** version (×5 stages) | The battle's regular clock |
| 2 | Its **Overtime** version (×5) | Overtime, following the closing Void |
| 3 | Its **Post-match Victory** version (×5) | After the match, the side the player cares about having won |
| 4 | Its **Post-match Defeat** version (×5) | After the match, that side having lost |
| 4b | Its **Post-match Draw** version (×5) | After any draw, in every mode |
| 5 | **Practice Ground's ambience** | The whole time on Practice Ground: a factory, not music |
| 6 | **Opponent ejected** | The player's opponent taken by the Void or ejected |
| 7 | **Player ejected** | The player's own fighter taken by the Void or ejected |
| 8 | **Universal ejection** | Every ejection in Local Play and Watch Mode |
| 9 | **Successful Deflect** | A Deflect actually turning a projectile back |
| 10 | **Perfect Shield** | A perfect block, in place of the block's sound |
| 11 | **Shield block** | An ordinary blocked hit |
| 12 | **Shield hold** | A loop while a Shield is up |
| 13 | **Spawn** (`sfx.spawn`) | A fighter appearing as its spawn burst pops: every Void respawn (Practice Ground's too, as its ejections play there) and both of a match entrance's spawns |
| 14 | **Bolt strike** (`sfx.boltStrike`) | The match entrance's bolt striking, at its contact |
| 15 | **Bolt cover** (`sfx.boltCover`) | The bolt striking again and covering the screen, peaking at full cover |
| 16 | **Reveal** (`sfx.entranceReveal`) | The cover clearing to the stage, leading into the stage's theme |

## Route A: composed in code, synthesized live

Every sound is made live on Web Audio, in the browser, from code: no audio
file is shipped, downloaded or decoded. The other route (rendering each piece
offline to `.ogg` / `.m4a` files) was weighed and set aside because:

- **Transitions are musical.** The sequencer knows the musical clock, so a
  change of version lands exactly on the next beat or bar line and the
  outgoing version fades with an equal-power curve; with files, every piece
  would need sample-exact loop points and authored intro, loop and outro
  segments, and a change could only land where a file allows.
- **Overtime follows the Void continuously.** Its layers, filter and pitch
  tension are written from `Battle.overtimeVoidPressure` as each bar comes;
  a fixed recording cannot escalate with a value only known during play.
- **Nothing to download.** 25 pieces of music at 1–1.5 MB each would weigh
  more than the whole game; the themes are a few kilobytes of data. The
  itch.io release needs no new files, checks or fallbacks for Safari.
- **Variation.** Every pass of a loop can differ (other instruments, a
  harmony line, a key lift), and every effect is varied a little each play.

The cost is CPU: notes are scheduled a fifth of a second ahead by a timer,
drums and plucked or struck tones are rendered once into buffers and then
replayed by one node a note, and only the synths that need it (brass, leads,
pads, bass) are built per note.

## Architecture

```
music voice ─┐                       ┌─ the stage's reverb ─┐
(channels)   ├─ sends ───────────────┤                      ├─ music ─┐
             └─ dry ─────────────────┴─ the stage's delay ──┘  (HP 30) ├─ bed ─ duck ─ pause ─ low-pass ─┐
ambience ──── (hall reverb) ─────────────────────────────── ambience ─┘   (-4 dB)  (-10 dB) (900 Hz)   │
effects ───── (small room) ──────────────────────────────── sfx ───────────────────────────────────────┤
                                                                                                         master ─ glue compressor ─ limiter ─ speakers
```

| Module | Owns |
| --- | --- |
| [`js/core/audio-manager.js`](../../js/core/audio-manager.js) | `AudioManager` (the app's `audio`): the context and its unlock, the buses, the levels (Settings › Audio, live), the director's changes carried out, the effects and their limits, the Shield hums, the ambience, pause, mute and the page's visibility. |
| [`js/core/audio/sounds.js`](../../js/core/audio/sounds.js) | The only sounds Alva has (`ALLOWED_SOUNDS`, 37 ids of the sixteen kinds) and `SoundRegistry`, which refuses anything else. |
| [`js/core/audio/perspective.js`](../../js/core/audio/perspective.js) | `audioPerspective(mode)`: whose point of view decides the ejection and ending sounds. |
| [`js/core/audio/director.js`](../../js/core/audio/director.js) | `MusicDirector`: the version state machine (`idle → battle → overtime → postVictory \| postDefeat \| postDraw`), overtime's intensity, the quantize and fade of each change. |
| [`js/core/audio/sequencer.js`](../../js/core/audio/sequencer.js) | `compileTheme`, `renderBar` (a bar's notes from a theme's data), `MusicVoice` (one version playing: its channels, the sidechain pump, its faders). |
| [`js/core/audio/theory.js`](../../js/core/audio/theory.js) | Scales, the themes' notation (melodies in scale degrees, chord-relative lines, chords, rhythms). |
| [`js/core/audio/instruments.js`](../../js/core/audio/instruments.js) | The instruments: rendered drums and tones (`SampleBank`), live synths (`SYNTHS`), `playNote`. |
| [`js/core/audio/dsp.js`](../../js/core/audio/dsp.js) | The JavaScript sample rendering: drums, the plucked strings (Karplus-Strong, tuned exactly), bells, steel pan, marimba, the reverbs' impulse responses, the audio's own random stream. |
| [`js/core/audio/sfx.js`](../../js/core/audio/sfx.js) | The effects' recipes and `ShieldHum`. |
| [`js/core/audio/ambience.js`](../../js/core/audio/ambience.js) | `FactoryAmbience`. |
| [`js/core/audio/themes/`](../../js/core/audio/themes/) | The five themes as data, and what they share (`common.js`). |
| [`js/core/audio/battle-audio.js`](../../js/core/audio/battle-audio.js) | `BattleAudio`: a battle screen's or Practice Ground's ears on its Arena, turning what happens into the engine's events. |

### The game's events

The game drives the engine through `BattleAudio`, created by the Battle
screen (and Online Play's on top of it) and Practice Ground:

| Event | From |
| --- | --- |
| `battleStarted(stage, mode, { localSlot })` | The battle built (Quick Battle, Adventure, Watch Mode, Local Play, Online Play); with a match entrance, its reveal (the `entranceReveal` cue), so the theme starts as the stage appears |
| `entranceStarted()` | A match entrance beginning (the battle attached in its entrance, or `Battle.restart` into one): the music fades out as leaving does and waits for the reveal |
| `entranceBolt()` / `entranceCover()` / `entranceReveal(stage)` | The entrance's `entranceBolt`, `entranceCover` and `entranceReveal` cues (`Battle.stepEntrance`), each once, at its step's start: on the simulation clock, so a pause holds them |
| `fighterSpawned(fighter)` | The `spawned` cue: `Arena.updateRespawns` as a fighter is back, and a match entrance's spawns, as the burst pops |
| `practiceStarted()` | Practice Ground's session built |
| `overtimeStarted()` | `Battle.startOvertime` (the Arena's `overtime` cue) |
| `overtimePressure(p)` | Every frame the world ran: `Battle.overtimeVoidPressure`, never a clock of its own |
| `matchEnded(winner)` | `Battle.finishMatch` (`matchEnded` cue), once |
| `restarted()` | `Battle.restart` (Restart, Rematch) of a battle with no entrance (a battle screen's always has one: `entranceStarted`) |
| `fighterEjected(fighter)` | `Arena.checkVoid` and `Battle.ejectLoser`, where `HitEffects.addElimination` fires: once per exit |
| `deflected(fighter, { direction })` | `CombatSystem.deflectProjectiles`, the first projectile a Deflect turns back (its `first` record, where its 15 Energy is paid) |
| `blocked(fighter, { perfect })` | Each `block` event of the step, a perfect one marked |
| `shieldHeld(fighter, on)` | `combat.shielding` rising or falling (blockstun keeps it up) |
| `paused()` / `resumed()` | The pause menu, Practice Ground's menu (Online Play has no pause) |
| `left()` | The battle or Practice left (Home, Change Stage, Change fighters, Leave room, a new Adventure level) |

The cues come from inside a simulation step through `Arena.cue`, a listener
that is only ever called, never read: it never runs when nobody listens, a
listener that throws cannot stop a step, and a match steps identically with
or without one. Online Play's lockstep is delay-based and never rewinds, so
every cue is heard exactly once, on both browsers, for confirmed steps only.
The engine never touches the simulation, its timing, its randomness (it has
its own stream) or the lockstep.

### Whose point of view

`audioPerspective(mode, { localSlot })`:

| Mode | Ejections | Post-match music |
| --- | --- | --- |
| Quick Battle (Regular and Custom), Adventure | Player 1's fighter is the player, the CPU the opponent | Victory if Player 1 wins, Defeat if Player 1 loses |
| Online Play | This device's player is the player | From this player's side |
| Local Play | The universal ejection for both, always | Always Victory, whoever wins |
| Watch Mode | The universal ejection | Victory |
| Practice Ground | The player's fighter is the player, the dummy the opponent | None: the ambience |
| Any draw | — | The stage's own Draw version, in every mode |

### The versions and their changes

One music bus, one active voice. The director's state machine:

- **Start**: the Main Battle from its intro.
- **Battle → Overtime**: on the next bar line, or the next beat when a bar
  is longer than 1.5 s (`BAR_QUANTUM_LIMIT`; every theme's is), into
  Overtime's one-bar pickup (a riser and a drum roll), the old version
  fading over 0.35 s. The OVERTIME banner shows meanwhile.
- **Battle or Overtime → the ending**: on the next beat, into the Victory,
  Defeat or Draw sting, the old version gone within 0.3 s (under a beat).
  The sting then flows into its calm loop, under the celebration and the
  Match Results, until the player leaves.
- **Restart, Rematch**: the old version fades in 0.25 s, then the Main
  Battle starts clean from its intro, overtime's intensity back to 0. On a
  battle screen every match has its entrance: the old version fades out as
  the bolt strikes (as leaving does, 0.6 s), nothing plays under the versus
  screen, and the Main Battle starts from its intro with the reveal.
- **Pause**: the bed (music and ambience) ducks about 10 dB under a 900 Hz
  low-pass, the Shield hums hold, overtime's intensity stays where it is;
  resume restores them.
- **Leaving**: everything fades out in 0.6 s. Nothing plays on the menus.

A change never lands on notes already written (it waits for the first beat
past them), never leaves a gap (the new version starts where the old one
stops) and never doubles up (equal-power curves, or for a restart the old one
gone first).

### The effects

Every effect is synthesized: a tight transient, a weighty low end, a bright,
crisp top and a short tail through the effects' own small room. Each play is
varied ±4 % in pitch and level (`SFX_VARIATION`), sits a little left or right
by where its fighter is on screen (`PAN_SPREAD`), and the bed ducks about
-4 dB for 0.22 s under an ejection, a Deflect and a Perfect Shield. At most
two copies of one effect play at once (`SFX_LIMITS.perSound`) and ten in all.

- **Opponent ejected**: a huge, rewarding boom, a bright "shing" rising into
  place, a crowd-like roar of noise spread wide, a triumphant major brass hit.
- **Player ejected**: a falling sweep, a muffled low boom, a hollow, detuned
  minor tail. Negative, never harsh.
- **Universal ejection**: a punchy boom and impact with an open fifth (no
  third: neither good nor bad news).
- **Deflect**: a sharp metallic parry ringing out and a whoosh reversing,
  swept across the stereo field the way the projectile now flies. Only for a
  real turn-back, once per Deflect.
- **Perfect Shield**: a crystalline "ting" and a shimmering bloom, replacing
  the block's sound for that hit.
- **Shield block**: a muted thump of energy, understated.
- **Shield hold**: a low, soft hum wavering like the Shield's circle, in
  over about 80 ms, out over about 120 ms, one per fighter, held silent while
  paused.

The match entrance's four are one family on A and E: the strike hums on A,
the cover's line rises a fifth from A to E at full cover, and the reveal
leaves that E for the stage's own tonic (`revealRoot`: its theme's `tonic`,
between A3 and A4), so each leads into the next and the last into the
stage's music.

- **Spawn**: cued as the fighter appears, on the burst's pop: a bright,
  punchy pop and a soft low thump at once, then a shimmer on A and E rising
  a fifth into place and a sparkly tail, about 0.4 s. Its pitch varies a
  quarter as much as the other effects' (±1 %); the same for every fighter.
  The burst's own closing-in is the visual swell before the pop: a sound
  swelling before it would have to start before its cue, so it would sound
  through a pause or ahead of a stalled online step.
- **Bolt strike**: a sharp electric crack exactly at contact, a few snaps of
  crackle and a short sizzle over a low thud, then a quiet hum (detuned
  saws on A2 and E3 through a fluttering low-pass) under the bolt's
  flicker, gone by the time the black has faded in.
- **Bolt cover**: a bigger, brighter crack, a roar of noise swelling open
  (spread left and right) with the glow's bloom while a low line rises from
  A to E, both peaking at full cover (0.28 s), then letting go.
- **Reveal**: an airy whoosh falling away and a soft reverse swell gliding
  up a tone into the stage's tonic with its fifth and octave, resolving as
  the green clears; the stage's Main Battle starts under it.

### Practice Ground's ambience

A room of machines, never music: a low hum and the room's tone, the wall
lights' faint buzz (flickering now and then), a conveyor's rattle swelling
and fading over tens of seconds, and, each on its own random clock, distant
presses (sometimes twice), hisses of steam, metallic clanks, runs of chain.
Every interval and pitch is drawn wide enough that nothing settles into a
beat, so it never loops like a recording. It fades in as Practice starts and
out as it ends, ducks under the menu, and stays low.

## The themes

Each theme is data in [`js/core/audio/themes/`](../../js/core/audio/themes/):
its tempo, tonic and mode, its channels (instrument, level, pan, octave,
reverb and delay sends, whether it pumps under the kick), its parts and its
five versions. Every version of a stage is the same hook, key centre and
instrument set; a version may move the mode (`scale`), the key
(`transpose`), the tempo and the level. The hooks are written in scale
degrees, so the same line is heard in another mode as the version changes.

| Stage | Key, tempo | Identity | Hook |
| --- | --- | --- | --- |
| **Yerma** (`desert`) | D Phrygian dominant, 134 | An oud carries the hook, a brass section answers, darbuka and frame drums on a maqsum groove, a wide wind drone, swelling strings | D Eb F# A, a long A, the F# G F# Eb turn; the same rhythm a step up over Eb, again from C over C minor, home to D |
| **Sol-Noir** (`city`) | F minor, 124 | Dark synthwave: gated drums, a driving arpeggiated bass, a glassy pluck arpeggio, a neon lead, the hook on brass stabs on the off-beats | C C, a jump to F, Eb C, a long Ab; rising from Ab to C over Db; a step higher over Ab; G F Eb C |
| **Asperitas** | D Lydian, 140 | Orchestral-electronic: airy choir pads, celesta arpeggios, a harp, taiko under a half-time beat that doubles for the climax, a high flying lead | Up from A to D, a turn through C#, out to E; down from the bright G#; up a B minor arpeggio to a high A |
| **Adamaris** | A Mixolydian, 126, swung | Island epic: a steel-pan hook in the tresillo's 3-3-2, a marimba, a tremolo-picked surf guitar, tribal toms and a son clave on a log drum, an overdriven volcanic low end | E E F# E C# A in 3-3-2; D D E D B G; F# F# A F# E D; C# D C# B |
| **Jökull** | E Dorian, 112 | Nordic epic: a horn section over war drums, a throat chant on every bar, icy glass bells, a deep drone, a cold, wide hall | E held, F# G up to B; A G F# down to D; E F# G B C#; E D C# B |

Every Main Battle is an intro, then a loop of about 100–130 s (eight
sections: the hook, the hook with its answer, a build, a climax, a
breakdown, the hook varied, the build again, the climax a step higher) that
changes on every pass. Overtime is the same hook 15 % faster, a step up,
and but for Yerma (already the darkest) in a darker mode (Sol-Noir into
Phrygian, Asperitas and Jökull into Aeolian, Adamaris into Dorian), with
double-time drums and the layers its
intensity brings in: the clock's ticking from quarters to sixteenths, a
pulsing sub (from 0.2), risers every four, two, then every bar (from 0.45,
0.75, 0.92), a cluster of strings bending up to a semitone sharp (from
0.35), dissonant ostinatos and the stage's own (Sol-Noir's sirens,
Adamaris's eruptions and rumble, Jökull's cracking ice and blizzard gusts), a
filter opening as the Void closes. Victory restates the hook in a major mode
(Mixolydian or Ionian; Lydian for Asperitas) with a big final hit; Defeat
slows it into a minor mode (Phrygian or Aeolian) with a falling cadence; Draw
leaves it unresolved on suspended chords with a dignified open hit. Each
ending is a short sting (4–6 s) then a calm loop.

### Levels

Every channel's level was set from measurements, not by guesswork: each
channel rendered on its own (an `OfflineAudioContext` driving
`MusicVoice`) and set to its role's target loudness in the 200–5000 Hz
band (the hook's carrier loudest, then the answering lines, harmonies,
arpeggios and pads; the drums and the bass by their whole level), then
every version rendered through the whole engine and checked. At the default
settings, after the master's compressor and limiter:

| What | Level (RMS) |
| --- | --- |
| Main Battle, every stage | about -22 dB (within 1.5 dB of each other), peaks under -4 dB |
| Overtime | as loud at first, 2–3 dB louder as the Void closes |
| Victory sting | -18 to -21 dB (its big final hit) |
| Defeat and Draw stings | about -25 dB |
| The calm loops after the match | -29 to -35 dB |
| Practice Ground's ambience | about -27 dB |
| The ejections | peaks about -10 dB, over the music ducked by 4 dB |
| Deflect, Perfect Shield | peaks about -13 to -15 dB, the Perfect Shield above the block |
| Shield block | about -16 dB |
| Shield held | about -30 dB, well under the music |
| Bolt cover, bolt strike | about -11 and -12 dB: a little over the Deflect and the Perfect Shield, under the ejections |
| Spawn | about -17 dB, with the block: under the ejections |
| Reveal | about -22 dB, soft, at the music's level |

The match entrance's four were levelled against the effects already there
the same way: each rendered alone in an `OfflineAudioContext` through the
engine's own effects bus, small room, glue compressor and limiter at the
default settings, its loudest 50 ms compared (measured so, the ejections
come out at about -9 dB, the Deflect and the Perfect Shield -12 to -13, the
block -17).

Every render was free of clicks and gaps, every change of version landed on
its beat, and each Main Battle's loop came round with no seam. A new theme
is levelled the same way: render it, compare it with these.

### The notation

[`js/core/audio/theory.js`](../../js/core/audio/theory.js) says it all; in
short:

- A melody: `>1:2 2:1 3:1 >5:4 .:4` — scale degrees (8 the tonic an octave
  up), `'` / `,` an octave up / down, `#` / `b` a semitone, `:n` sixteenths,
  `>` an accent, `_` a ghost note, `.` a rest.
- A chord-relative line (bass, arpeggios): `R 3 5 7 8 9 10 12` (`R#` the
  root a semitone up, overtime's clash).
- Chords, one a bar: `1 6 3 7`, `1sus2`, `4sus4`, `5`, `7b`.
- A beat: one string a drum, one character a sixteenth (`X` accent, `x`,
  `o` ghost, `.`).

A part that does not fill whole bars, a section playing an unknown part or
channel, or a malformed token is refused as the theme is compiled.

## Adding a stage's theme

1. Add the stage's id to `THEMED_STAGES` in
   [`js/core/audio/sounds.js`](../../js/core/audio/sounds.js): its five
   versions become allowed sounds (and only they).
2. Write `js/core/audio/themes/<id>.js` in the shape of the others: `id`,
   `bpm`, `tonic` (MIDI), `scale`, `reverb`, `delay`, `channels` (spread
   `OVERTIME_CHANNELS` and `HIT_CHANNELS` from `common.js`), `parts`,
   `sections` and the five `versions` (Overtime with `overtime:
   OVERTIME_LAYERS` and a `lowpass` range, 10–20 % faster than the Main
   Battle). Read the stage's art and hazards first; give it its own hook,
   key, tempo and instruments.
3. Add it to `THEMES` in `themes/index.js`.
4. Run `node --test tests/systems/audio.test.mjs`: it checks the five
   versions, the loop's length, overtime's tempo, the stings' lengths, every
   note's range and that no two stages share a key, mode and tempo or a hook.
5. Listen: render it offline (an `OfflineAudioContext` driving the engine)
   and check its levels against the others, then play it.

A new effect or any other sound is not added this way: the owner's list is
closed, and the registry refuses anything outside it.

## Settings › Audio

Master volume, Music volume and Sound effects volume (0–100 %, by default
80, 70 and 85; the ambience follows the music's) and Mute all, saved in
`js/core/settings.js` (version 12, `audio: { master, music, sfx, muted }`,
each value checked on its own, every older version migrated to the
defaults). Each slider's value is squared into a gain, so its travel feels
even; every change is a short ramp, applied at once (a battle paused under
the dialog included). Moving the effects slider plays the Shield block's
sound. Muted, the master is silent and no effect is even made, from the very
unlock.

## Unlock, visibility, no Web Audio

The AudioContext is made on the first press or key, never before; a
context the browser suspends (iOS, Safari) resumes on the next gesture. A
hidden page suspends it, shown resumes it. Without Web Audio the engine does
nothing and the game is silent and fully playable.

## Tests

- [`tests/systems/audio.test.mjs`](../../tests/systems/audio.test.mjs): the
  point-of-view table; the state machine (battle, overtime, each ending,
  restart, pause, leave); the guard (exactly the 33 sounds, nothing else
  registrable, no audio file loaded anywhere, the menus' `play('move')`
  silent, no fighter named in audio code or audio in a fighter's file); the
  engine on a mocked AudioContext (nothing before a gesture, one context,
  mute from the unlock, live levels by ramps, changes on the beat or bar with
  equal-power fades and no gap or double, pause, the effects' limits and
  ducks, visibility, Practice's ambience); real Battles through
  `BattleAudio` (one ejection a exit, `ejectLoser` after a Void fall
  included, the Deflect only for a real turn-back and once, a perfect block
  never stacked on a block, the Shield's hum up and down, overtime's
  intensity the battle's own, every mode's endings and ejections, Practice
  Ground, and a match stepping identically with or without a listener);
  Settings › Audio's version 12; the themes (five versions, lengths, tempo,
  ranges, unique hooks, the Draw's suspended chords, overtime's layers, the
  notation).
- [`tests/interface/settings.test.mjs`](../../tests/interface/settings.test.mjs):
  the Audio tab by gamepad, keyboard and pointer, its sliders' ARIA, Mute
  all, the effects slider's preview, French, version 12's stored shape.
- [`tests/helpers/fake-audio.mjs`](../../tests/helpers/fake-audio.mjs): the
  mocked Web Audio.
