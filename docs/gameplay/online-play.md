# Online Play

**Home → Online play** is two people in two browsers, in rooms they create
and join: no accounts and no matchmaking. Home → Online play → Online name
→ Online lobby → Create room, Join with code or a public room → Room →
Battle. The product rules are [`ALVA_SPEC.md`](../../ALVA_SPEC.md) §6.5c;
this guide is how the code carries them out. The room server is its own
guide: [the room server](../development/online-server.md).

| Module | Owns |
| --- | --- |
| [`js/screens/online-screens.js`](../../js/screens/online-screens.js) | The online name (`OnlineNameScreen`, `online-name`), the lobby (`OnlineLobbyScreen`, `online-lobby`) and its Create room dialog (`CreateRoomDialog`), the room (`OnlineRoomScreen`, `online-room`), the room's fighter (`OnlineFighterScreen`, `online-character`), the messages (`showNotice`) and the events no screen handles itself (`routeOnlineEvents`). |
| [`js/screens/online-battle-screen.js`](../../js/screens/online-battle-screen.js) | `OnlineBattleScreen` (`online-battle`): the Battle screen with Online Play's rules (no pause, Leave match, waiting, the result from this player's side, Rematch, Leave room). |
| [`js/online/online-session.js`](../../js/online/online-session.js) | `OnlineSession` (`App.online`): the player's name and session id, the room's socket and state, the peer link, the host's start. |
| [`js/online/server-client.js`](../../js/online/server-client.js) | `RoomServerClient`: the server's HTTP calls and a room's WebSocket (`RoomLink`); `OnlineError` and its codes. |
| [`js/online/peer.js`](../../js/online/peer.js) | `PeerLink`: the WebRTC DataChannel between the two browsers, relay-only, signalled through the room. |
| [`js/online/privacy.js`](../../js/online/privacy.js) | What keeps each player's address to themselves: `scrubSignal` (the signalling sent and taken, with no address but the relay's) and `relayOnly` (the TURN servers a link may use); the server checks again with its own copy. |
| [`js/online/transport.js`](../../js/online/transport.js) | The transport interface (`send`, `onMessage`, `close`, `onClose`), `MessageTransport`, and `memoryTransportPair` for tests. |
| [`js/online/lockstep.js`](../../js/online/lockstep.js) | `LockstepSession`: delay-based lockstep, resends, waiting and timeouts, the desync check; `LockstepChannel` and `OnlineInput`, each fighter's input. |
| [`js/online/input-frame.js`](../../js/online/input-frame.js) | One player's input for one step as a whole number (`encodeFrame`, `decodeFrame`, `FRAME_FIELDS`). |
| [`js/online/state-hash.js`](../../js/online/state-hash.js) | The match's key state and its hash (`battleState`, `hashState`, `battleHash`). |
| [`js/online/match-setup.js`](../../js/online/match-setup.js) | What a start message means: the stage drawn from the seed (`stageForSeed`), both fighters, names and Automatic turn-around (`readStart`). |
| [`js/online/rules.js`](../../js/online/rules.js) | Names, room names and room codes: what a player may type (the server checks again with its own copy). |
| [`js/core/connectivity.js`](../../js/core/connectivity.js) | `Connectivity`: whether the device is online, live. |
| [`js/game/battle.js`](../../js/game/battle.js) | `BATTLE_MODES.online`: a `PlayerController` on each side, each on its lockstep channel; `labels` (the players' names), per-player Automatic turn-around, `forfeit`. |
| [`js/game/arena.js`](../../js/game/arena.js) | `Arena.advance`: the fixed steps, which an online match hands to its `stepper` (the lockstep). |

`CONFIG.online` ([`js/config.js`](../../js/config.js)) holds its settings:
`serverUrl` (the deployed room server; empty, Online Play ends at "Online
play is unavailable right now."), `inputDelay`, `modes`,
`connectTimeoutMs`, `disconnectGraceMs`,
`loadTimeoutMs`, `listRefreshMs`, `hashInterval`, `resendWindow` and
`colors`.

## Home

**Online play** is the third of the menu's first row, after Local play: a
square the size of the Settings button (one value, `--home-utility-size`,
sizes both at every screen size), its globe (`ICONS.globe`), named "Online
play" (its `aria-label` and tooltip). Play and Local play share the rest of
the row in two equal columns. It opens while the device is online
(`Connectivity`, from `navigator.onLine` and the `online` / `offline`
events) and a fighter is playable, and then wears Local play's green edge
and glow (`is-ready`). Offline it is disabled, described by "You're
offline. Connect to the internet to play online." (its `aria-describedby`
and its cell's tooltip) and glows red (`is-offline`, the `--danger-*`
tokens); with no playable fighter it is disabled like every match action.
It follows the connection live, and a press checks again. Both glows hold
still with reduced motion and pause while a dialog covers Home.

Going offline anywhere in Online Play ends it: the room is left, Home, and
"Connection lost" ("You're offline, so the connection was lost.").

## The name, the lobby and the room

- **Online name.** Asked every time; the last name is remembered
  (`Settings.setOnlineName`, schema 9) and offered again, with Continue
  focused so a controller confirms it without typing. Suggest a name fills
  in "Player 1234". The name is checked (`checkName`): 2 to 16 characters
  once cleaned, letters of any language, digits, spaces and `_ - . '`.
  Continue asks the server for the public rooms; if it cannot be reached
  (or there is no `serverUrl`), "Online play is unavailable right now",
  then Home.
- **Typing.** While a text field has focus, the keys that type are the
  field's ([input](../systems/input.md#text-fields)): ↑ ↓ and Esc still
  navigate, Enter submits the field.
- **Lobby.** Create room opens its dialog: the room's name ("{name}'s room",
  "Salle de {name}", fitted to 24 characters), Public or Private, and the
  mode, a choice of one (`CONFIG.online.modes`). Join with code takes 5
  characters in any case (`normalizeCode`, `isValidCode`). The public rooms
  are read again every `listRefreshMs` while the lobby shows (a hidden page
  skips its turn); a full room, one in a match or one of another version
  shows without Join. Every refusal is a dialog (`showNotice`), the lobby
  staying: "Servers are full right now…" (`full`), "Online play is
  unavailable right now." (`unavailable`), a code nobody has, a full room,
  too many tries, another version.
- **Room.** Its name, its code (a read-only field: Copy code writes it to
  the clipboard, or, where the clipboard is blocked as in itch.io's frame,
  selects it), its visibility and mode, and both seats: each player's name,
  the host's mark, "You", their fighter and Ready. Choose fighter opens the
  shared roster (`online-character`, the choice in `app.selection.online`).
  The peer link is made as soon as both players are there; Ready opens once
  it is up and a fighter is chosen. A failed link says "Couldn't connect to
  your opponent…" and offers Try again. Once both are ready the host's
  browser sends the start; the room fills in the players and sends it to
  both; the drawn stage shows a moment (`STAGE_REVEAL_MS`), then the
  Battle. Leaving asks first (the host is told it closes the room); the
  host leaving closes it for the guest: "The host closed the room."

## The match

Both browsers build the same `Battle` (`mode: 'online'`) from the start
(`readStart`): the host's seed (the Battle's, and on a stream of its own the
stage, `stageForSeed`, drawn as Regular Play draws one), both fighters, each
player's name (`labels`) and each player's own Automatic turn-around. The
host is p1 (left, red), the guest p2 (right, blue): each player is shown on
their own side, by name, in `CONFIG.online.colors`. The local player plays
with their usual devices; their fighter's touch controls and move HUD are
their own.

### Lockstep

`LockstepSession` runs the Battle's steps (it is the Arena's `stepper`:
`Arena.advance` hands it each frame's simulation time, already slowed by any
slow motion):

1. **Input frames.** Each step's local input is the snapshot
   `InputManager.sample` makes for the local fighter as it is (keyboard,
   touch or controller, resolved through the fighter's controller profile
   exactly as offline), encoded into 26 bits (`encodeFrame`): every held
   control and its press edge, the Dash requests and where the presses
   were made for. The snapshot holds no analog value (the sticks are
   resolved into codenames first), so the frame carries all of it.
2. **Delay.** It is sampled for step n + D (D = `inputDelay`, 3 steps,
   50 ms); steps 0 to D − 1 are neutral on both sides.
3. **Resends.** Every animation frame one packet carries every local frame
   the other side has not acknowledged (up to `resendWindow`) and the last
   step this side holds the other's frames through. A lost packet costs
   nothing.
4. **Stepping.** A step runs only once both frames are known; otherwise
   the match waits (nothing runs, nothing is banked). A side that falls
   behind catches up a step a frame. Slow motion and the
   `maxStepsPerFrame` cap change when steps run, never what they do.
5. **Each fighter's input** is a `PlayerController` on a `LockstepChannel`
   (the same `sample()` / `flush()` contract as Local Play's channels), so no
   fighter code knows it is online. A flush (a respawn, the fight starting)
   drops the presses of that player's frames sampled up to n + D, on both
   sides at the same step, and the local devices' buffered presses.
6. **Desync check.** Every `hashInterval` steps each side hashes the match
   (`battleState`: positions, velocities, facing, state, Launch Points,
   Energy, score, clock, projectiles, clones) and sends the hash; a
   difference ends the match ("Connection problem (desync)"), logging both
   states with `CONFIG.debug.online` on.

### Determinism

The simulation was already a pure function of its state, its inputs and its
seed; the audit for Online Play found nothing to fix in it. What it checked:
no `Math.random`, `Date.now()` or `performance.now()` in the step (the CPUs'
and celebrations' randomness is injected, and an online match has neither);
`Map` and `Set` iteration follows insertion order, which the same steps make
the same; reduced motion only changes drawing (the Arena's effects and the
stage themes), never a step; `Arena.frame`'s work outside `update` (the
interpolation, the camera, the themes, the effects clock) writes nothing the
step reads, and the lethal-launch check reads copies; the player settings
that change play (Automatic turn-around) are each player's own, sent in the
start. The only seam is how many steps a frame runs (slow motion,
`maxStepsPerFrame`), which the lockstep now owns. Sprite data the
simulation reads (clip lengths, the normalized art's bounds) comes from the
same PNGs in both browsers; a browser decoding them differently would show
as a desync.

### The rules on top

- **No pause.** Options / Menu, Esc, P and the HUD's pause open the match
  menu (Leave match, an X) while the world runs on; the local player plays
  nothing meanwhile (`muted`). A hidden page or a phone held upright never
  holds the world (the other player would wait).
- **Leaving** is a forfeit (`Battle.forfeit`): 'leave' is sent (three
  copies) and the other side sees "Your opponent left. The match counts as
  a win for you."; both go back to the room.
- **Silence.** After `WAITING_NOTICE_MS` of waiting, "Waiting for
  opponent…"; after `disconnectGraceMs` (`loadTimeoutMs` before the other
  browser was first heard from, while both load) the match ends, "Connection
  lost", back to the room (the lobby if the room is gone).
- **The end** is announced from this player's side (VICTORY!, DEFEAT.,
  GAME.), the toast says "You win!" or "{name} wins!", the Match Results name
  both players and offer Rematch (both must accept: the host's browser then
  starts the next match on a new random stage) and Leave room.

## Transport

`PeerLink` makes the DataChannel: the host offers, the guest answers, the
offer, answer and ICE candidates going through the room's WebSocket as
`signal` messages. The channel is unordered with no retransmissions. A link
not open within `connectTimeoutMs` fails. Gameplay never goes through the
room server: it goes between the two browsers, through a TURN relay.

## Privacy

No player ever learns another's network address (IP address), and nothing
else about them but what they chose to show: the name they typed, their
fighter, Ready and whether they are connected.

- **Relay only.** A direct WebRTC link would hand each browser the other's
  public address during setup. So the two browsers never connect directly:
  before each link, each one asks its room for its own short-lived relay
  credentials (`{ type: 'relay' }`, answered with TURN servers from
  Cloudflare's TURN service), and `PeerLink` connects with
  `iceTransportPolicy: 'relay'` and those servers alone. Each browser then
  only ever sees the relay's address, never the other player's. With no
  relay to be had, no link is made: "Couldn't set up a private connection
  to your opponent." (`relay`), never a direct link instead. A server with
  no relay set up makes no room at all ("The room server can't make
  private connections right now.").
- **Scrubbed signalling.** What a browser sends is scrubbed first
  (`scrubSignal`, `js/online/privacy.js`): only relay candidates, their
  related address (`raddr`, the player's own) blanked; host,
  server-reflexive and peer-reflexive candidates dropped; the SDP's
  connection and origin lines blanked. The room scrubs everything it
  passes on again, by its own copy of the rules, so even a copy of the game
  that tried a direct link could not pass an address through it. What a
  browser takes is scrubbed too.
- **Older copies.** A copy plays online as `ONLINE_VERSION`
  (`js/online/online-session.js`: the game's version marked `+relay`), so
  it never shares a room with an older copy that connected directly
  ("Other version").
- **The server.** It never stores, logs or passes on an address: its
  per-minute limits count a salted hash of it, in memory only, and
  Cloudflare's per-request logs are off ([the room server](../development/online-server.md#privacy)).

## Rollback, later

Version 1 waits for the other player's input. Rollback netcode would play
on with a prediction and correct it when the real input arrives: it needs
`Battle` to snapshot and restore its whole state (fighters, combat states,
projectiles, clones, techniques, summons, hazards, the stage, the
statistics, every RNG's position) cheaply and exactly, which it cannot yet,
and a renderer happy to be told a few steps were replayed. The transport
interface and the input frames would stay as they are; `LockstepSession`'s
wait would become the rewind.

## Tests

[`tests/online/determinism.test.mjs`](../../tests/online/determinism.test.mjs)
(two Battles side by side for 6,000 steps, every fighter on both sides and
every stage, then through the lockstep over a lossy link, and a planted
difference caught),
[`tests/online/lockstep.test.mjs`](../../tests/online/lockstep.test.mjs)
(the frame, the delay, loss and resends, waiting, timeouts, forfeits,
flushes, muting, slow motion, catching up),
[`tests/online/online-play.test.mjs`](../../tests/online/online-play.test.mjs)
(Home, the name, the lobby, the room, the battle and its rules, the relay
for each link and what happens without one, on the real server code in
process), [`tests/online/peer-privacy.test.mjs`](../../tests/online/peer-privacy.test.mjs)
(the link relay-only with TURN servers alone, never without one, and only
scrubbed relay candidates sent or taken), [`tests/online/rules.test.mjs`](../../tests/online/rules.test.mjs)
and [`tests/online/itch-hosts.test.mjs`](../../tests/online/itch-hosts.test.mjs).
The server's own: [`server/tests/`](../../server/tests/). Real browsers on
real networks, WebRTC through NATs, and the itch.io frame need a real test:
two devices, one creating a room and sharing its code.
