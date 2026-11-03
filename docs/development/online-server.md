# The room server

Online Play ([online play](../gameplay/online-play.md)) needs one small
server: it lets players create rooms, lists the public ones, and
introduces the two players of a room to each other. It is
[`server/`](../../server/): a Cloudflare Worker with two Durable Object
classes, plain JavaScript, no framework. It never carries a match: once the
two browsers are introduced, the match's inputs go straight from one to the
other (WebRTC), so a match costs the server a handful of messages.

`server/` is development-only for the game: the itch.io release never
includes it ([the itch.io release](itch-release.md)), and the game never
imports it. It is deployed on its own, to Cloudflare, by the owner (the
steps are [below](#putting-it-online-step-by-step)).

| File | Owns |
| --- | --- |
| [`server/src/index.js`](../../server/src/index.js) | The Worker: the routes, the allowed origins (CORS, and a WebSocket upgrade's Origin), the caller's address passed to the Lobby. |
| [`server/src/lobby.js`](../../server/src/lobby.js) | `Lobby`, one Durable Object for every room: ids and codes, the public list, joining, the caps (`MAX_ROOMS`, the daily request budget), the per-address limits, the sweep of silent rooms. |
| [`server/src/room.js`](../../server/src/room.js) | `Room`, one Durable Object per room: both players' WebSockets (hibernated), seats by token, fighters, Ready, the host's start, rematches, signalling relayed, leaving, closing, its alarms, its reports to the Lobby. |
| [`server/src/rules.js`](../../server/src/rules.js) | What the server accepts: names, room names, codes, modes, visibility (the game's own rules, again). |
| [`server/src/http.js`](../../server/src/http.js) | JSON replies, error codes, body limits, origin patterns. |
| [`server/wrangler.toml`](../../server/wrangler.toml) | The Worker's configuration: its Durable Objects (SQLite-backed, as the free plan requires), the allowed origins and the caps, each with its reasoning. |
| [`server/tests/`](../../server/tests/) | Its tests, on fake Durable Objects: no account, no network. |

## What it answers

| Request | Answer |
| --- | --- |
| `GET /health` | `{ "ok": true, "service": "alva-rooms" }`: the server is up (open it in a browser). |
| `GET /rooms` | The public rooms: `{ rooms: [{ id, name, host, mode, players, status, version, joinable }] }`. |
| `POST /rooms` | Create: `{ name, playerName, visibility, mode, session, version }` → `{ room, seat: 'host', token }`, or `{ error: 'full' }` (503). |
| `POST /rooms/join` | Join by `{ code }` (any room) or `{ id }` (a public room), with `{ playerName, session, version }` → `{ room, seat: 'guest', token }`. |
| `GET /rooms/:id/ws?token=…` | The room's WebSocket, for the seat whose token it brings. |

Every field is checked on the server; a refusal is a code the game
translates: `invalid_name`, `invalid_room_name`, `invalid_mode`,
`invalid_visibility`, `invalid_code`, `room_not_found`, `room_full`,
`version_mismatch` (two versions of the game never share a match), `full`,
`rate_limited`, `origin`, `bad_request`. The room's messages are listed at
the top of [`server/src/room.js`](../../server/src/room.js).

**Who may call it.** Every request but `/health` must come from one of
`ALLOWED_ORIGINS` in `wrangler.toml`: itch.io's HTML5 game hosts
(`https://html-classic.itch.zone`, `https://html.itch.zone`, and any other
`https://*.itch.zone`, the domain itch.io serves games from) and
`http://localhost:*` / `http://127.0.0.1:*` for testing. Change the list
there and deploy again; no code changes. The Origin of a WebSocket upgrade
is held to the same list.

**No accounts, no personal data.** No login, cookie or stored identity: the
game makes a random session id for each visit (memory only) so the server
can tell a reconnect. A room's names live as long as the room. Addresses are
held in memory for a minute, for the rate limits, and never stored or
logged.

**Cleaning up.** A room with no activity for `ROOM_IDLE_MINUTES` (10)
closes itself (an alarm); a host gone for 15 s (a reload has that long to
come back) closes it ("The host closed the room."); a guest gone that long
frees the seat. The Lobby's own alarm drops any room that stops reporting.

## Staying on the free plan

Cloudflare's free Workers plan allows, per day (resetting at 00:00 UTC),
**100,000 Durable Object requests** (HTTP requests, WebSocket connections
and alarms count one each; incoming WebSocket messages count at 20 : 1) and
**13,000 GB-s of Durable Object duration**; past either, requests fail
until the next day. (Checked on 2026-11-03 at
<https://developers.cloudflare.com/durable-objects/platform/pricing/>;
check again before changing the caps.) The free plan only offers
SQLite-backed Durable Objects, which `wrangler.toml` creates.

- Rooms hibernate their WebSockets and the Lobby only works while answering
  a request, so an idle server spends almost no duration.
- A room costs about 15 requests from creation to its last match; a player
  waiting in the lobby about 12 a minute (the list refreshes every 5 s). The
  match itself costs nothing here.
- `MAX_ROOMS` (50) rooms at once: one more answers `full` ("Servers are full
  right now. Please try again in a few minutes.").
- The daily budget: the Lobby counts every request it handles and those each
  Room reports, and past `BUDGET_SHARE` (0.8) of `DAILY_REQUEST_LIMIT`
  (100,000) refuses new rooms as `full`, while the rooms already open play
  on.
- Per address, a minute: `CREATE_PER_MINUTE` (10) rooms,
  `JOIN_PER_MINUTE` (30) joins, `LIST_PER_MINUTE` (120) list reads.

itch.io itself sets no player limit on an HTML5 game; the caps protect the
Cloudflare plan. The Worker's own free allowance (100,000 requests a day)
runs alongside, and every request but `/health` also reaches a Durable
Object, so the budget keeps both.

## Testing it on your computer

No Cloudflare account is needed for any of this.

```sh
node --test                        # every test of the repository, the server's included
cd server && npm test              # the server's alone (no install needed)
```

Two tabs against a local server:

```sh
cd server
npm install                        # once: wrangler, the Cloudflare tool (development only)
npx wrangler dev                   # the server on http://localhost:8787, its Durable Objects in memory
```

Then, for the game, set `serverUrl: 'http://localhost:8787'` in
`CONFIG.online` (`js/config.js`; never commit it), serve the repository
(`python3 -m http.server 8000` from its root) and open
`http://localhost:8000` in two tabs (or two browsers). In one, Online play →
a name → Create room; in the other, Online play → another name → Join with
code (or the public list). Open `http://localhost:8787/health` to see the
server is up.

## Putting it online, step by step

This is the owner's part, done once. Nothing here costs money: the free
Cloudflare plan needs no credit card. Each step is one thing to do; if a
step does not show what it says, copy everything the terminal printed and
paste it to Claude.

1. **Merge the first pull request** ("Online Play, part 1: game and server
   code") on GitHub. It is safe: until the second pull request, Online play
   says "Online play is unavailable right now." Don't upload a new itch.io
   build until the second pull request is merged.
2. **Create a free Cloudflare account** at <https://dash.cloudflare.com/sign-up>.
   Enter your email and a password, then open the email Cloudflare sends and
   click its link to confirm the address. You should see the Cloudflare
   dashboard. No credit card is needed.
3. **Install Node.js**, if `node --version` in a terminal does not already
   print v22 or higher: go to <https://nodejs.org>, download the **LTS**
   version (22 or newer) for your computer, open the file and click through
   the installer with its default choices.
4. **Get the repository and open a terminal in its `server` folder.**
   - On GitHub, on the repository's page, click the green **Code** button,
     then **Download ZIP**, and unzip the file (double-click it). Inside is a
     folder `alva-main`, and inside that a folder `server`.
   - **Windows:** open the `server` folder in File Explorer, click the
     address bar at the top, type `cmd` and press Enter. A black terminal
     window opens, already in that folder.
   - **Mac:** in Finder, right-click (or Control-click) the `server` folder
     and choose **New Terminal at Folder** (if it is not there: open
     Terminal from Applications › Utilities, type `cd ` with a space, drag
     the `server` folder onto the window and press Return).
5. **Install the tool and log in.** In the terminal type `npm install` and
   press Enter; after a little while it says "added … packages". Then type
   `npx wrangler login` and press Enter: your browser opens a Cloudflare
   page; log in if asked, then click **Allow**. The terminal then says it
   is logged in.
6. **Deploy.** Type `npx wrangler deploy` and press Enter. The first time it
   may ask you to register a **workers.dev subdomain**: answer yes and type
   a short name (letters and digits, for example your name). When it is
   done it prints an address ending in **`.workers.dev`**, like
   `https://alva-rooms.yourname.workers.dev`. Copy it.
7. **Check it.** Open that address with `/health` at the end in your
   browser, for example `https://alva-rooms.yourname.workers.dev/health`.
   It should show `{"ok":true,"service":"alva-rooms"}`.
8. **Send that address to Claude** (the one without `/health`). Claude then
   makes the second pull request ("Online Play, part 2: go live"), which
   points the game at your server.

A TURN server (for players behind very strict networks) is not needed now;
if a friend can never connect, tell Claude: it is a small follow-up.

### Later

- **Changing a cap or the allowed origins:** edit `server/wrangler.toml`,
  then `npx wrangler deploy` again from the `server` folder.
- **Seeing it work:** the Cloudflare dashboard, **Workers & Pages** ›
  **alva-rooms** shows its requests and errors; **Durable Objects** shows
  the day's usage against the free plan.
- **Changing the server's code:** the same `npx wrangler deploy`.
- **A new release of the game:** a room only takes a guest whose game has
  the host's `CONFIG.version` (`js/config.js`), so two players never mix
  versions in a match. Raise it with any release that changes how a match
  plays (an old tab left open would otherwise meet a new one and desync).
