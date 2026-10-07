# Practice Ground

**Home → Practice Ground** starts at once with the default fighter (the
first playable one, `practiceDefaultFighter` in
`js/screens/practice-screen.js`) and a practice CPU of the same fighter,
sharing its one loaded sprite set, on the training stage: no fighter or
stage select, countdown, timer, points or result. It runs until you choose
Return. With no playable fighter Home keeps it closed, and reached
any other way it starts nothing: it loads no fighter and says a fighter is
unavailable, with Back to Home.

- **Your fighter and the practice CPU.** `PracticeSession`
  (`js/game/practice.js`) and Quick Battle's `Battle` both extend `Arena`
  (`js/game/arena.js`), which owns the fixed-step world, the camera and all
  Canvas drawing. The practice session holds your fighter and the practice
  CPU, paired and framed together from the start. With the CPU disabled,
  moves aimed at an opponent do nothing or miss: a summon has nobody to
  appear behind, so its press does nothing at all (no other attack, no
  cooldown started); a technique still casts and releases (e.g. #0001's
  Unlimited Void, its burst meeting no one), a pull
  draws nobody in and projectiles fly on and expire.
- **Stage.** `PRACTICE_MAP` (`js/data/practice-map.js`) is deliberately not
  in `MAPS`, which feeds Select Stage. `js/stages/practice-theme.js` draws the
  room as one square grid in one-point perspective: a back wall, and a
  compact training block with open edges (its top, its outer side past
  either ledge, a ruler along its front edge). A fighter that falls into the
  Void is out of play for 2 seconds, then back at its own spawn in a fresh
  training state: 0 Launch Point, full Energy, every summon and technique cooldown ready and
  nothing transient left, with nothing keeping hold of or aiming at it. You
  and the CPU each wait out your own 2 seconds; no point is scored and
  practice goes on.
- **More menu.** The three-dots button, top centre where Quick Battle's
  timer sits (or `Esc` / `P` / Start), freezes practice under a light glass
  menu with **Change Fighter**, **Change CPU** (**Enable CPU** once you have
  disabled it) and **Return**. Press More, `Esc` or `P` again (or tap the dim) to carry
  on.
- **Change Fighter** opens the full roster as a large glass dialog over the
  paused stage. It is the same roster component as Select Fighter
  (`js/ui/fighter-roster.js`). Confirming swaps the fighter in place at the
  spawn with 0 Launch Point and no cooldowns and resumes; `Esc` / Back returns to the
  menu. Practice keeps its own fighter: Quick Battle's selection never
  changes, and every new visit starts with the default fighter again.
- **Practice CPU.** Change CPU opens a second copy of the roster dialog
  (Change CPU, or Select CPU once it is disabled). Confirming loads that
  fighter and puts it 320 units to your right, facing you, labelled CPU, and
  resumes; the camera frames you both.
  It is a training dummy with no controller: it never moves, jumps, attacks
  or defends, but it takes real hits, hitstun, launches, pulls and
  paralysis, so every move lands on it: attacks, projectiles, clones and
  techniques. Its
  Launch Point builds up (and launching hits send it further) like anyone's.
  Each hit floats the Launch Point it added (for #0001: `+3` for a Jab,
  `+1` for each of Maximum Blue's grinding strikes and `+3` for its
  collapse, `+10` for Hollow Purple) in red over its head
  for under a second, straight from the
  combat system's resolved hit. Change CPU swaps it for
  another fighter; **Disable CPU**, beside Back in that dialog, removes it
  (and its card) and returns you to the paused menu. Changing your own
  fighter keeps the CPU. Its own HUD card, on the right, shows its portrait,
  name and Launch Point, rebound whenever it changes.
- Every new visit starts with the default fighter and CPU again, at 0 Launch
  Point, whatever the last visit changed or disabled.

The product rules are [`ALVA_SPEC.md`](../../ALVA_SPEC.md) §6.8.

## Tests

[`tests/integration/practice-ground.test.mjs`](../../tests/integration/practice-ground.test.mjs).
