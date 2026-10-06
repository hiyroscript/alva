# Notes for Claude

## Named updates

The owner refers to past work by name: the **movement update**, the
**effect update** and the **bounce update**. [`UPDATES.md`](./UPDATES.md)
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
- Run the tests with `node --test`
  ([testing](./docs/development/testing.md)).
