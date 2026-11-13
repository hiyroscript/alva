# Notes for Claude

## Named updates

The owner refers to past work by name: the **movement update**, the
**effect update**, the **bounce update**, the **Mash Combo update**, the
**online update**, the **camera & mobile layout update**, the **spawn &
landscape update**, the **launch & energy update**, the **Void
update**, the **Screen Pad update**, the **Adventure update** and the
**Sound update**. [`UPDATES.md`](./UPDATES.md)
says what each one is, which pull request and commit it was, where its
tuning lives and which tests cover it. Read it whenever an update is named,
and add an entry there when the owner names a new one.

## Where things are

- [`ALVA_SPEC.md`](./ALVA_SPEC.md) is the product specification; each
  fighter's own specification is in [`docs/characters/`](./docs/characters/)
  and is part of it. [`docs/README.md`](./docs/README.md) maps the rest of
  the documentation.
- The game is one character system: shared rules in `js/game/`, each
  fighter's values and capabilities in `js/data/characters/<id>.js`. Never
  special-case a fighter's id in shared code
  ([the character system](./docs/architecture/character-system.md)).
  Movement is universal (`js/data/movement.js`): no fighter has its own
  run, jump or Dash numbers.
- [`codename_rule`](./codename_rule) is the naming contract for controls,
  moves and art (`mouvment` is spelled that way on purpose).
- [`character_rule`](./character_rule) is protected: never edit, move,
  rename or reformat it.
- **Controller comfort is a strict rule.** Every fighter's recommended
  controller layout, on the roster now or added later, keeps the comfort
  rules: one input a move (no combination, no direction held with a button,
  no hold), only Square / Triangle / Circle / R2 / L2 or the right stick up,
  down or forward, Square never empty, a plunge or a free-fall move only on
  the right stick, each input chosen for what the player sees the move do.
  Never relax them to fit a fighter: redesign the layout instead. The
  universal inputs (left stick, Cross / A, R1 / RB, L1 / LB, Options /
  Menu) are the same for everyone and a fighter never retunes them. The
  rules and their reasons are in
  [adding characters](./docs/characters/adding-characters.md#the-comfort-rules-strict);
  the registry refuses a layout that breaks the checkable ones
  (`comfortProblems` in `js/data/controller-profiles.js`).
- **Touch comfort is a strict rule.** Every fighter's touch controls, on
  the roster now or added later, keep the touch comfort rules: one button a
  move, one plain tap (no combination, hold, modifier or sequence); the
  fighter never places, sizes or adds a touch control, and never dresses a
  universal one; every button it has named and showing its move's own art;
  beside Jump only its two Mash Combo buttons (its `mashCombo` pair, read by
  `mashRow` in `js/data/mash-combo.js`), nothing else ever, a pair with one
  button putting it next to Jump. The shared touch controls keep the rest
  for everyone (the universal controls, 130 % and 110 %, flush corners,
  nothing past the top HUD). Never relax them or special-case a fighter's
  buttons around them: fix the fighter. The rules and their reasons are in
  [adding characters](./docs/characters/adding-characters.md#the-touch-comfort-rules-strict);
  the registry refuses a fighter that breaks the checkable ones
  (`touchComfortProblems` in `js/data/touch-comfort.js`).
- **Stage geometry and the Void are a strict rule** (the Void update). Every
  finite main stage, Practice Ground's included, is exactly
  `MAIN_STAGE_LENGTH` (1400) long, and every stage's Void, Adamaris's and
  Practice Ground's included, is the same `VOID_MARGINS` around its main
  stage (468 past each ledge, 1040 above its top, 400 below), both in
  `js/data/maps.js`: a stage is built with `mainStageAround` and
  `voidAround` and never gets a length or margins of its own; whatever
  sits on it is placed for that size. Overtime closes the Void from every
  side, the top included, on its accelerating curve
  (`CONFIG.battle.overtimeVoid`, `closingVoid` / `overtimePressure` in
  `js/game/physics.js`), never onto the main stage; a match's loser still
  on the stage is ejected (`Battle.ejectLoser`). Change the shared values,
  never one stage; after any change to them re-derive the HUD fire
  (`tests/benchmarks/launch-thresholds.mjs`) and check the stage art at the
  camera's edges ([stages](./docs/gameplay/stages.md)).
- **Sound is a closed list** (the Sound update): the five stage themes in
  their five versions, Practice Ground's ambience and eleven effects (the
  Sound update's seven, and the four the owner added with the match
  entrance: the spawn, the bolt's strike, the bolt covering the screen and
  the reveal), all synthesized live, no audio file. Never add another sound
  (no menu, hit, jump or character sound): the registry refuses it
  (`ALLOWED_SOUNDS` in `js/core/audio/sounds.js`). Only the owner adds to
  the list. Sound only listens to the game, never feeds back, and never
  names a fighter ([audio](./docs/systems/audio.md)).
- **Releases are automatic** ([the native apps](./docs/development/native-apps.md#releases)):
  a new `## ` entry in `UPDATES.md` pushed to `main` releases the next
  version (`.github/workflows/release.yml`); a later addition to an
  entry goes in as a `### ` subsection, which releases nothing. When the
  owner says "release X.Y.Z", run the Release workflow by hand
  (`workflow_dispatch` on `main`, input `version` X.Y.Z) and reply with
  just https://github.com/hiyroscript/alva/releases/latest once it is
  published.
- Run the tests with `node --test`
  ([testing](./docs/development/testing.md)).
