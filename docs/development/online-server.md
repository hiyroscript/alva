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
`http://localhost:*` / `http://127.0.0.1:*` for testing. The game's own
site on GitHub Pages is not on it, so Online Play is for the itch.io page
(adding `https://hiyroscript.github.io` to the list would open it there
too). Change the list there and deploy again (merging into `main` does);
no code changes. The Origin of a WebSocket upgrade
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

**Two tabs against the deployed server.** It allows `http://localhost:*`,
so the game served from your computer (`python3 -m http.server 8000` from
the repository's root, then `http://localhost:8000` in two tabs or two
browsers) plays online through it with nothing to change. In one tab,
Online play → a name → Create room; in the other, Online play → another
name → Join with code (or the public list).

**Two tabs against a local server** (to try a change to the server's code
before it is merged):

```sh
cd server
npm install                        # once: wrangler, the Cloudflare tool (development only)
npx wrangler dev                   # the server on http://localhost:8787, its Durable Objects in memory
```

Then, for the game, set `serverUrl: 'http://localhost:8787'` in
`CONFIG.online` (`js/config.js`; never commit it: the committed address is
the deployed server's), serve the repository and open it in two tabs as
above. Open `http://localhost:8787/health` to see the server is up.

## Putting it online, step by step

Done once, on 2026-11-03: the server is deployed, and its address is
`CONFIG.online.serverUrl`. The steps stay here for a new deployment (another
Cloudflare account, or starting over).

This is the owner's part, and it needs **no computer of a particular kind
and no terminal**: everything happens in a web browser, on
a phone, a tablet, a Chromebook or any computer. Cloudflare builds and
deploys the server itself, from this repository on GitHub (its "Workers
Builds": it runs `npx wrangler deploy` in the `server` folder on its own
machines). Nothing here costs money: the free plan needs no credit card,
and its building allowance (3,000 build minutes a month) is far more than
the server needs. Each step is one thing to do; if a step does not show
what it says, take a screenshot (or copy the error text) and send it to
Claude.

1. **Merge the first pull request** ("Online Play, part 1: game and server
   code") on GitHub. Cloudflare deploys from the `main` branch, so the
   `server` folder has to be there first. It is safe: until the second pull
   request, Online play says "Online play is unavailable right now." Don't
   upload a new itch.io build until the second pull request is merged.
2. **Create a free Cloudflare account** at <https://dash.cloudflare.com/sign-up>.
   Enter your email and a password, then open the email Cloudflare sends and
   tap its link to confirm the address. You should see the Cloudflare
   dashboard. No credit card is needed. (If it asks what you want to do
   first, skip it.)
3. **Start a new Worker from GitHub.** In the dashboard's menu, open
   **Workers & Pages** (on a phone, the menu is behind the ☰ button at the
   top), then **Create** (or **Create application**), and choose to
   **import a repository** from Git (the option that connects GitHub).
4. **Let Cloudflare see the repository.** Choose **GitHub** and connect your
   GitHub account: a GitHub page opens asking to install Cloudflare's app.
   Choose your account (`hiyroscript`), then **Only select repositories**,
   pick **alva**, and tap **Install** (or **Install & Authorize**). You come
   back to Cloudflare; pick **alva** in its list of repositories.
5. **Fill in the settings** on the **Set up your application** screen:
   - **Project name:** `alva-rooms`. It must be exactly this: it is the name
     in `server/wrangler.toml`, and the build fails if the two differ.
   - **Build command:** leave it empty.
   - **Deploy command:** `npx wrangler deploy`
   - **Preview command:** leave it as it is.
   - **Enable Preview builds:** turn it **off** (only `main` is deployed;
     other branches need no builds).
   - **Protect with Cloudflare Access:** leave it **off** (with it on, the
     game cannot reach the server).
   - Open **Advanced settings**: **Path** (the root directory) is `/`;
     change it to **`/server`**.
   - **API token:** leave **Create new token** (Cloudflare makes one for its
     own build; if it asks for a name, type `alva-rooms-build`).
   - **Variable name** and **Variable value:** leave them empty (the
     server's settings are in `server/wrangler.toml`).

   Then tap **Deploy**.
6. **Wait for the build** (a minute or two). The page shows the build's
   log; it ends successfully with a line naming the deployed address, which
   ends in **`.workers.dev`**, like `https://alva-rooms.yourname.workers.dev`.
   You can also find it later on the Worker's page (open **Workers & Pages**,
   then **alva-rooms**; the address is near the top, or under its
   **Settings**, **Domains & Routes**). Copy it. (The first time, Cloudflare
   may ask you to choose a **workers.dev subdomain**: any short name, for
   example your name.)
7. **Check it.** Open that address with `/health` at the end in your
   browser, for example `https://alva-rooms.yourname.workers.dev/health`.
   It should show `{"ok":true,"service":"alva-rooms"}`.
8. **Send that address to Claude** (the one without `/health`). Claude then
   makes the second pull request ("Online Play, part 2: go live"), which
   points the game at your server.

From then on, every merge into `main` builds and deploys the server again by
itself (a change to the server's code or to `server/wrangler.toml` reaches it
that way, with nothing to run). If the dashboard offers builds for other
branches than `main`, they can be turned off: only `main` matters.

A TURN server (for players behind very strict networks) is not needed now;
if a friend can never connect, tell Claude: it is a small follow-up.

### With a terminal instead

On a computer with a terminal (Linux, macOS or Windows) and Node.js 22 or
newer, the same server deploys from the `server` folder of a copy of the
repository: `npm install`, then `npx wrangler login` (a browser page asks to
**Allow**), then `npx wrangler deploy`, which prints the `.workers.dev`
address. Deploying that way does not set up the automatic deploys above.

### Later

- **Changing a cap or the allowed origins:** edit `server/wrangler.toml`
  in a pull request; merging it deploys the server again (with a terminal
  instead: `npx wrangler deploy` from the `server` folder).
- **Seeing it work:** the Cloudflare dashboard, **Workers & Pages** ›
  **alva-rooms** shows its builds, requests and errors; **Durable Objects**
  shows the day's usage against the free plan.
- **Changing the server's code:** the same: merged into `main`, it is
  deployed. A deploy restarts the rooms' connections: the game reconnects
  to its room by itself within a few seconds, and a match under way is not
  affected (it never goes through the server).
- **A new release of the game:** a room only takes a guest whose game has
  the host's `CONFIG.version` (`js/config.js`), so two players never mix
  versions in a match. Raise it with any release that changes how a match
  plays (an old tab left open would otherwise meet a new one and desync).
