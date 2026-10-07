# Characters

The roster's fighters, each specified on its own. Everything a fighter
does runs on the shared systems ([`docs/systems/`](../systems/)); a
fighter's page covers only what is its own: its art, body, its moves with
their exact values (movement is universal, never a fighter's own), its defense,
Energy and launch reaction, its touch buttons, and how it plays. These
pages are part of the product specification
([`ALVA_SPEC.md`](../../ALVA_SPEC.md) §7.2.9).

| Fighter | Slot | Playable | Numbered attacks | Specification |
| --- | --- | --- | --- | --- |
| #0001 | 01 | yes | 5: Jab / Floating Straight, Red / Red Kick, Maximum Blue / Blue, Unlimited Void (technique), Hollow Purple (technique); extra attack: the High Kick | [0001.md](0001.md) |
| #0002 | 02 | yes | 3: One-Two / Homing Attack, Rapid Kicks / Bounce Attack, Spin Attack / Blue Tornado; extra attack: the Whirlwind | [0002.md](0002.md) |

The other 46 of the 48 roster slots are locked placeholders. #0001 is
the first playable fighter, so it is what startup preloads first, Quick
Battle's initial pick, both Watch Mode CPUs and the Practice Ground
default; that is an ordering, not a special role: each of those reads
"the first playable fighter", never a fixed id. Disabling a fighter is
setting its `available: false`; every file of it stays.

Where things are:

| | |
| --- | --- |
| Definitions | [`js/data/characters/<id>.js`](../../js/data/characters/), registered in [`js/data/characters.js`](../../js/data/characters.js) |
| Discover profiles (one 1–5 difficulty, a play-style description, a review hash): #0001 5/5, #0002 3/5 | [`js/data/fighter-profiles.js`](../../js/data/fighter-profiles.js), rechecked whenever a definition changes ([how](adding-characters.md#7-the-discover-profile)) |
| Art | [`assets/characters/<id>/`](../../assets/characters/) |
| Fighter-specific tests | [`tests/fighters/<id>/`](../../tests/fighters/) |
| Test-only fighters (never in the game) | [`tests/fighters/fixtures/`](../../tests/fighters/fixtures/): a sample fighter with different moves on the same codenames, the loadout matrix, and screen-test fighters |
| How fighters are built | [the character system](../architecture/character-system.md) |
| Adding one | [adding-characters.md](adding-characters.md) |

Credits for each fighter's sprite source are in the game's credits roll
and the [README](../../README.md#credits). Neither fighter's source
character is named anywhere in the repository.
