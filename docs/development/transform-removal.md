# Permanent Transform removal — implementation report

Transform no longer exists as an active gameplay feature. Its shared action and
move, keyboard/gamepad bindings, touch button, editor ID, character slots,
preview treatment, icon, and localization have been removed. No compatibility
alias, reserved replacement, or hidden button remains.

## Touch layout and saved settings

Both Joystick and Classic retain the coordinates and sizes of all remaining
controls. Removing the obsolete element leaves open space in the staggered
cluster; browser screenshots confirmed clear separation without moving the
numbered slots, Shield, Jump, or Extra Attack. There is no element or input hit
region in that space.

The existing allowlist sanitizer discards the obsolete saved ID independently
in each scheme. Valid positions, scales, language, scheme choice, and Combat
Assist preferences survive. Future saves omit the ID. Settings version remains 3.
K still performs menu Back; Y / Triangle has no gameplay assignment.

## Verification

- `node --test`: **1,056 passed, 0 failed, 0 skipped**.
- Chromium served from `python3 -m http.server 8000`: **31 automated browser
  scenarios passed, no page errors or console errors**. Quick Battle covered
  both fighters, both touch schemes, both languages, and 844×390, 667×375,
  and 1024×768 viewports. Checks included on-screen hit targets and no circular
  button overlap. Additional checks covered simultaneous movement/jump touches
  and release, CPU Watch Mode, Practice Ground with both fighters using keyboard
  ground/air attacks, and legacy-layout editing/resizing/saving in both schemes.
- Visually inspected Chromium screenshots of both control schemes, both
  fighters, a French editor with customized controls, and a 667×375 view with
  simulated safe-area insets. Remaining controls render without the retired
  button; artwork and labels remain intact.
- Gamepad input was verified with simulated standard button events in the Node
  suite, including Y/Triangle remaining unassigned and other mappings surviving.
- `git diff --check` and the feature-reference audit passed. Remaining uses of
  “transform” in production are graphics/layout operations. Regression tests
  retain the retired name only to test rejection or old saved data.
- `character_rule` is byte-for-byte unchanged. Existing art, combat values,
  movement physics, profile ratings, and play-style descriptions are unchanged.
  `controller.PNG` was inspected: it is an unlabeled controller silhouette.

Physical gamepad testing, real phone/tablet touch ergonomics, actual device
notches, and browsers other than Chromium were not available. Browser checks
were automated with screenshot inspection; they are not a claim of hands-on
hardware playtesting. Custom layouts can still intentionally overlap controls,
as before.

## Changed files and reasons

| File | Reason |
| --- | --- |
| [`ALVA_SPEC.md`](../../ALVA_SPEC.md) | Remove the retired action, bindings, editor entry, preview rules, and mobile diagrams from the current specification. |
| [`README.md`](../../README.md) | Remove the obsolete Transform row from the controls table. |
| [`UPDATES.md`](../../UPDATES.md) | Record permanent removal without rewriting historical entries. |
| [`codename_rule`](../../codename_rule) | Remove Transform from the current control vocabulary. |
| [`css/touch-controls.css`](../../css/touch-controls.css) | Delete the obsolete selector and update the cluster diagram; retain every other coordinate and rendering transform. |
| [`docs/characters/0001.md`](../../docs/characters/0001.md) | Remove the reserved action and star-icon descriptions. |
| [`docs/characters/0002.md`](../../docs/characters/0002.md) | Remove the reserved action from the example loadout. |
| [`docs/characters/adding-characters.md`](../../docs/characters/adding-characters.md) | Remove the obsolete action slot and glyph instructions. |
| [`docs/development/conventions.md`](../../docs/development/conventions.md) | Update the supported control and move vocabulary. |
| [`docs/systems/combat.md`](../../docs/systems/combat.md) | Remove the reserved move and capability documentation. |
| [`docs/systems/input.md`](../../docs/systems/input.md) | Update controls, touch diagrams, editor icons, and the independent K/menu and Y/gameplay behavior. |
| [`js/config.js`](../../js/config.js) | Remove the binding, combat button, action, label, and move; English registry-generated localization follows automatically. |
| [`js/core/input-manager.js`](../../js/core/input-manager.js) | Unmap standard gamepad button 3 without reassigning it. |
| [`js/core/touch-layout.js`](../../js/core/touch-layout.js) | Remove the ID from both schemes; existing sanitization discards old entries on load and save. |
| [`js/data/abilities.js`](../../js/data/abilities.js) | Remove obsolete ability-name commentary. |
| [`js/data/ability-preview.js`](../../js/data/ability-preview.js) | Remove obsolete preview commentary; retain all remaining sprite selection. |
| [`js/data/characters/0001.js`](../../js/data/characters/0001.js) | Delete the unused action slot and its comment; no move data changes. |
| [`js/data/characters/0002.js`](../../js/data/characters/0002.js) | Delete the unused action slot and future-feature comment; no move data changes. |
| [`js/data/fighter-profiles.js`](../../js/data/fighter-profiles.js) | Refresh reviewed source hashes; keep ratings and descriptions unchanged. |
| [`js/data/loadout.js`](../../js/data/loadout.js) | Update the loadout contract commentary; the existing registry-based validator now rejects the deleted action and move. |
| [`js/game/ai/moveset.js`](../../js/game/ai/moveset.js) | Remove the obsolete example; shared discovery follows the reduced combat list. |
| [`js/game/fighters/fighter.js`](../../js/game/fighters/fighter.js) | Update supported-action and buffering comments; shared processing follows the reduced combat list. |
| [`js/localization/strings/fr.js`](../../js/localization/strings/fr.js) | Delete the obsolete French control label. |
| [`js/ui/icons.js`](../../js/ui/icons.js) | Delete the dedicated star glyph. |
| [`js/ui/mobile-abilities.js`](../../js/ui/mobile-abilities.js) | Delete fallback, reserved-set, presence, and own-glyph special treatment; preserve generic unavailable/absent handling. |
| [`js/ui/touch-controls.js`](../../js/ui/touch-controls.js) | Stop constructing the button and update presentation comments and layout diagram. |
| [`tests/fighters/0001/fighter-0001.test.mjs`](../../tests/fighters/0001/fighter-0001.test.mjs) | Update the exact loadout and remove obsolete presentation expectations. |
| [`tests/fighters/0002/fighter-0002.test.mjs`](../../tests/fighters/0002/fighter-0002.test.mjs) | Update the exact loadout and remove obsolete presentation expectations. |
| [`tests/fighters/fixtures/sample-fighter.mjs`](../../tests/fighters/fixtures/sample-fighter.mjs) | Delete Awakening animations, action, hit definition, name, and mobile metadata; retain Extra Attack, numbered attacks, and summon. |
| [`tests/integration/practice-ground.test.mjs`](../../tests/integration/practice-ground.test.mjs) | Update fighter-switching labels and input coverage for the remaining buttons. |
| [`tests/integration/watch-mode.test.mjs`](../../tests/integration/watch-mode.test.mjs) | Update input snapshots and fighter-switching expectations. |
| [`tests/interface/battle-screen.test.mjs`](../../tests/interface/battle-screen.test.mjs) | Update the expected touch cluster for Quick Battle. |
| [`tests/interface/controls-ui.test.mjs`](../../tests/interface/controls-ui.test.mjs) | Remove obsolete glyph/slot tests, assert the glyph stays absent, and retain coverage for sprites, presence, switching, layout geometry, localization, and multi-touch. |
| [`tests/interface/i18n.test.mjs`](../../tests/interface/i18n.test.mjs) | Update the expected controls and explicitly check neither language registers the retired label. |
| [`tests/interface/settings.test.mjs`](../../tests/interface/settings.test.mjs) | Use a supported attack to retain malformed string-coordinate validation coverage. |
| [`tests/interface/touch-layout.test.mjs`](../../tests/interface/touch-layout.test.mjs) | Update IDs and control fixtures; check both legacy layouts, editor absence, unchanged preferences, and clean save/reload. |
| [`tests/systems/ability-names.test.mjs`](../../tests/systems/ability-names.test.mjs) | Remove the obsolete neutral move name. |
| [`tests/systems/codenames.test.mjs`](../../tests/systems/codenames.test.mjs) | Update exact registries and snapshots; assert absence across configuration and playable/sample fighter metadata. |
| [`tests/systems/combat-ai.test.mjs`](../../tests/systems/combat-ai.test.mjs) | Update CPU actions and assert retired state/press fields are absent. |
| [`tests/systems/combat-assist.test.mjs`](../../tests/systems/combat-assist.test.mjs) | Use unavailable Extra Attack to retain generic assist rejection and cancellation coverage. |
| [`tests/systems/combo.test.mjs`](../../tests/systems/combo.test.mjs) | Use unavailable Extra Attack to retain generic attack-buffer rejection coverage. |
| [`tests/systems/defense.test.mjs`](../../tests/systems/defense.test.mjs) | Update snapshots and gamepad expectations while retaining defensive controls. |
| [`tests/systems/down.test.mjs`](../../tests/systems/down.test.mjs) | Update snapshots and gamepad expectations while retaining Down and fast fall coverage. |
| [`tests/systems/explicit-mouvement.test.mjs`](../../tests/systems/explicit-mouvement.test.mjs) | Retain other gamepad mappings and verify K and repeated Y/Triangle presses produce no gameplay action while menu Back works. |
| [`tests/systems/loadout.test.mjs`](../../tests/systems/loadout.test.mjs) | Retain optional Extra Attack validation and reject attempted retired actions (including null) and moves. |
| [`tests/systems/sample-fighter.test.mjs`](../../tests/systems/sample-fighter.test.mjs) | Update move resolution, CPU moveset, and ability names after deleting Awakening. |
| `docs/development/transform-removal.md` | Record this implementation, file inventory, validation, and remaining manual limitations. |
