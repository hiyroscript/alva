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
| #0003 | 03 | yes | 4: Chakra Punch / Leaping Kick, Heel Drop / Heavenly Foot of Pain, Cherry Blossom Impact (technique), Mystical Palm Technique (technique); extra attack: the Chakra Haymaker | [0003.md](0003.md) |
| #0004 | 04 | yes | 5: Dance Combo / Air Dance, Leek Swing / Leekspin, Crescent Kick / Stage Dive, Ievan Polkka (technique), World is Mine (technique); extra attack: the Melody | [0004.md](0004.md) |
| #0005 | 05 | yes | 5: Claw Swipe / Claw Rake, Long Bite / Snapping Jaws, Phantom Hands / Floating Hands, Deadlights (technique), Red Balloon (summon); extra attack: Dark Tendrils | [0005.md](0005.md) |
| #0006 | 06 | yes | 5: Power Punch / Flying Kick, Tornado Spin / Flying Punch, Heat Vision (technique), Ice Breath (technique), Sonic Scream (technique); extra attack: the Triple Strike; three members drawn as one fighter (an ensemble), each move performed by its sister(s) | [0006.md](0006.md) |
| #0007 | 07 | yes | 5: Street Combo / Flying Kick, Uppercut / Hammer Fist (its melee), Molotov Cocktail (technique), Sawn-Offs (technique), Rocket Launcher (technique) (its weapons); extra attack: the Pistol; half melee, half weapons | [0007.md](0007.md) |

The other 41 of the 48 roster slots are locked placeholders. #0001 is the
first playable fighter, so it is what
startup preloads first, Quick Battle's initial pick, both Watch Mode CPUs
and the Practice Ground default; that is an ordering, not a special role:
each of those reads "the first playable fighter", never a fixed id.
Disabling a fighter is setting its `available: false`; every file of it
stays.

Where things are:

| | |
| --- | --- |
| Definitions | [`js/data/characters/<id>.js`](../../js/data/characters/), registered in [`js/data/characters.js`](../../js/data/characters.js) |
| Discover profiles (one 1–5 difficulty, a play-style description, a review hash): #0001 5/5, #0002 3/5, #0003 3/5, #0004 4/5, #0005 4/5, #0006 3/5, #0007 3/5 | [`js/data/fighter-profiles.js`](../../js/data/fighter-profiles.js), rechecked whenever a definition changes ([how](adding-characters.md#7-the-discover-profile)) |
| Art | [`assets/characters/<id>/`](../../assets/characters/) |
| Fighter-specific tests | [`tests/fighters/<id>/`](../../tests/fighters/) |
| A fighter drawn as several members (#0006) | its `ensemble` ([the character system](../architecture/character-system.md#ensembles-one-fighter-several-members), [adding a fighter](adding-characters.md#a-fighter-of-several-members)) |
| Test-only fighters (never in the game) | [`tests/fighters/fixtures/`](../../tests/fighters/fixtures/): a sample fighter with different moves on the same codenames, the loadout matrix, screen-test fighters, and an ensemble with moves of one, two and three members |
| How fighters are built | [the character system](../architecture/character-system.md) |
| Controller layout: the comfort rules, strict for every fighter now and to come | [adding-characters.md](adding-characters.md#the-comfort-rules-strict), enforced as the registry loads (`comfortProblems`) |
| Adding one | [adding-characters.md](adding-characters.md) |

Credits for each fighter's sprite source are in the game's credits roll
and the [README](../../README.md#credits). No fighter's source
character is named anywhere in the repository.
