# Notes for Claude

## Named updates

The owner refers to past work by name: the **movement update**, the
**effect update**, the **bounce update** and the **Mash Combo update**. [`UPDATES.md`](./UPDATES.md)
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
- Run the tests with `node --test`
  ([testing](./docs/development/testing.md)).
