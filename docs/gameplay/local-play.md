# Local Play

**Home → Local play** is two people on one device, each on their own game
controller: Home → Local play → Select local mode → Quick Battle → Player
1's fighter → Player 2's fighter → Select Stage → Battle. The product rules
are [`ALVA_SPEC.md`](../../ALVA_SPEC.md) §6.5b; this guide is how the code
carries them out.

| Module | Owns |
| --- | --- |
| [`js/screens/local-play-screens.js`](../../js/screens/local-play-screens.js) | Select local mode (`LocalModeSelectScreen`, `local-mode`), each player's fighter (`LocalFighterScreen`, `local-character-p1` / `local-character-p2`) and the stage (`LocalMapScreen`, `local-map`): Quick Battle's own screens configured for Local Play, each owned by one player's controller. |
| [`js/ui/local-play.js`](../../js/ui/local-play.js) | The players' identity: their tones (`LOCAL_PLAYER_COLORS`, from `CONFIG.localPlay.colors`), badges (`playerChip`) and the setup's turn note (`TurnNote`). |
| [`js/core/controller-manager.js`](../../js/core/controller-manager.js) | Player 2's controller, `localReady`, and the session (`startLocal`, `endLocal`, `missingPlayers`, `assignLocal`). |
| [`js/core/input-manager.js`](../../js/core/input-manager.js) | One `ControllerChannel` a player (`player(slot)`), `setLocalPlay`, the menus' owner (`setMenuOwner`). |
| [`js/game/battle.js`](../../js/game/battle.js) | `BATTLE_MODES.local`: two `PlayerController`s, each on its own channel; the players' marker colours. |
| [`js/screens/battle-screen.js`](../../js/screens/battle-screen.js) | The Local Play battle: both move HUDs, the controllers-only rule, the lost-controller pause, the winner by name. |

## Home

Play and **Local play** share the menu's first row, two equal grid columns
(`.home-actions-row`) spanning exactly the full-width actions under them;
the menu still has four rows. Local play is the outlined secondary action,
always shown. It is open only while `localPlayOpen`: a playable fighter and
`ControllerManager.localReady` (the Gamepad API answering, Player 1's
controller and another active supported one). Then it wears the Download
button's green edge and glow (`is-ready`, the same `home-download-glow`
keyframes, still with reduced motion); otherwise it is disabled, described
by "Connect two controllers to play locally." (its `aria-describedby` and
its cell's tooltip) or, with no fighter, by the no-fighters note. It
follows every controller connected or lost at once, and a press queries the
controllers again before starting anything. Home ends any session
(`App.endLocalPlay`).

## The session

`App.startLocalPlay` starts a session on the two controllers assigned now:
Player 1's own (the one chosen in Controller Connections, if any) and
Player 2 the first other active one. Each keeps their controller until
Home: a third or fourth controller connected meanwhile is spare and never
reads for either player. A lost controller leaves its player's seat empty
(`missingPlayers`); the seat comes back to the same device (same index and
id) or to a device with its id that was not connected when it was lost, and
to nothing else unless the players choose it (`assignLocal`, the Battle's
"Use … for Player 2"). Two controllers of the same model are two devices.

## Two input pipelines

Each player has their own `ControllerChannel`: its own binding resolver
(press edges, held buttons, sticks, combinations, holds, stale presses), its
own menu repeat and its own snapshot, compiled from that player's fighter's
controller profile (the player's saved layout for that fighter, else its
recommended one; a mirror match shares the compiled profile, never a
resolver). A Local Play fighter samples its own channel
(`ControllerChannel.sample`): controller only, so the keyboard and the touch
controls move neither fighter (the touch controls are hidden). Everything
that flushes or resets input (a menu closing, a pause, the page losing
focus, a controller changing) does so for both channels; a fighter's
respawn flushes only its own player's (`PlayerController.flush`).

Menus listen to their owner (`Screen.menuOwner`, set on every screen
change): Player 1 on Select local mode, their fighter and the stage, Player
2 on their fighter, either one (`'any'`) in the battle's pause menu and
Match Results. Each command says whose controller sent it
(`MenuNavigator.commandSource`), and a Local Play setup step takes a choice
from its owner alone (`accepts`): the keyboard, the pointer and the other
player's controller never choose a fighter or a stage there (Back stays
open to them). While a controller is lost the step waits (`onHold`): Confirm
and Start disabled, its choices kept, and the turn note says which
controller to reconnect.

In play, either player's Pause binding asks for the pause menu, once a frame
however many press it.

## The battle

`mode: 'local'` is the real `Battle`, every rule unchanged: first to 3, Void
scoring and respawns, Launch Point, Energy and Shields, the clock and
overtime, statistics, the celebration. Both sides are `PlayerController`s
with the player's Automatic turn-around setting; neither is ever a CPU.

- **Identity.** Player 1 is red and Player 2 blue (`--player-1` /
  `--player-2`, `CONFIG.localPlay.colors`): the HUD cards (P1 / P2 tags,
  edges, score dots), the ground rings, name tags and off-screen pointers
  (`Arena.markerColors`, by slot), the move HUDs, the toast and the Match
  Results. Every indicator also carries the player's tag or name.
- **Two move HUDs.** `AbilityHUD.setPlayer`: Player 1's bottom left, Player
  2's bottom right, each its own fighter, wheel, cooldowns and restrictions,
  and its own controller's family and model (never the last device used).
  Both carry their fighters' cooldowns (`hudCooldownsFor`, a list). They
  show on touch screens too, and hide under the pause menu and the Match
  Results.
- **A lost controller** pauses the match at once (clock and fighters
  stopped) and the pause panel shows whose went, Reconnect, Return to home,
  any spare controller to use in its place, and Resume, open once both are
  back (focused then). A button held as a controller comes back is no
  press.
- **The end** names the winner: PLAYER 1 WINS! (red), PLAYER 2 WINS!
  (blue) or DRAW; "Player 2 wins!"; PLAYER 2 — WINNER. Rematch keeps both
  fighters, the stage and the controllers; Change fighters returns to
  Player 1's fighter and Change stage to Local Play's Select Stage.

## Tests

[`tests/systems/local-play-input.test.mjs`](../../tests/systems/local-play-input.test.mjs)
(the controllers and the two pipelines on real Fighters) and
[`tests/integration/local-play.test.mjs`](../../tests/integration/local-play.test.mjs)
(Home, the setup, the battle, its HUDs, pause, lost controllers, the end and
its navigation, French). Real controllers, layout and paint need a browser:
check two pads of different families and two of the same model, desktop
and a short landscape screen, unplugging either mid-match.
