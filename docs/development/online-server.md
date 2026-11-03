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
| [`server/gateway/`](../../server/gateway/) | The server's `pages.dev` address: a Cloudflare Pages project that passes every request, WebSockets included, unchanged to the Worker over a service binding ([why and how](#if-the-workersdev-address-never-works-the-pagesdev-address)). |
| [`server/tests/`](../../server/tests/) | Its tests, on fake Durable Objects: no account, no network. |

## What it answers

| Request | Answer |
| --- | --- |
| `GET /health` | `{ "ok": true, "service": "alva-rooms", "lobby": true, "origin": …, "originAllowed": … }`: the server is up and its Lobby answers (open it in a browser: `origin` is then `null`). Readable from any page, so the game can ask it why it cannot play online. |
| `GET /rooms` | The public rooms: `{ rooms: [{ id, name, host, mode, players, status, version, joinable }] }`. |
| `POST /rooms` | Create: `{ name, playerName, visibility, mode, session, version }` → `{ room, seat: 'host', token }`, or `{ error: 'full' }` (503). |
| `POST /rooms/join` | Join by `{ code }` (any room) or `{ id }` (a public room), with `{ playerName, session, version }` → `{ room, seat: 'guest', token }`. |
| `GET /rooms/:id/ws?token=…` | The room's WebSocket, for the seat whose token it brings. |

Every field is checked on the server; a refusal is a code the game
translates: `invalid_name`, `invalid_room_name`, `invalid_mode`,
`invalid_visibility`, `invalid_code`, `room_not_found`, `room_full`,
`version_mismatch` (two versions of the game never share a match), `full`,
`rate_limited`, `origin`, `bad_request`, `server_error` (something failed:
logged, see below). The refusal of an origin is readable from any page, as
`/health` is, so the game can say which address was refused. The room's
messages are listed at
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

**The pages.dev gateway, locally** (`server/gateway/`), in front of that
local server: with `npx wrangler dev` running in `server`, start it from
a second terminal (`cd server/gateway`, then
`../node_modules/.bin/wrangler pages dev --port 8788`). Its `ROOMS` binding
shows `[connected]`, and `http://localhost:8788` answers as the server does
(set `serverUrl: 'http://localhost:8788'` to play through it). Start the
Worker first: started the other way round, the Worker can fail with
"Address already in use". The gateway has its own `package.json` so that
wrangler takes its folder, not `server/`, as the Pages project.

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
   It should start with `{"ok":true,"service":"alva-rooms","lobby":true`.
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

### If the workers.dev address never works: the pages.dev address

A Worker's own `workers.dev` address can fail to exist at all. It happened
to this account: the dashboard showed `alva-rooms.<name>.workers.dev`
switched on and public, the build was green, and opening it said the page
or server can't be found. Cloudflare's own nameserver answered that the
whole `<name>.workers.dev` subdomain does not exist (NXDOMAIN, checked on
2026-11-03), and switching the address off and on again did not help.
Others have reported the same on Cloudflare's forum.

The way around it is a second address, `https://alva-online.pages.dev`,
from a free Cloudflare Pages project (`server/gateway/`). It passes every
request, WebSockets included, unchanged to the same `alva-rooms` Worker
over a service binding, so nothing about the server changes: the same
rooms, allowed origins and limits. A `pages.dev` address is made separately
from the account's `workers.dev` subdomain. The Pages project is set up once,
from GitHub, on a phone:

1. **Merge the pull request that adds `server/gateway/`.** Cloudflare
   builds the Pages project from `main`, so the folder has to be there first.
2. **Start a Pages project.** In Cloudflare, open **Workers & Pages**, then
   **Create** (or **Create application**). Choose **Pages** (it may be a
   tab, or a line such as **Looking to deploy Pages? Get started**), then
   **Import an existing Git repository**. Pick **alva** (GitHub is
   already connected from the Worker) and tap **Begin setup**.
3. **Fill in the settings** on the **Set up builds and deployments** screen:
   - **Project name:** `alva-online`. It must be exactly this: it is the
     name in `server/gateway/wrangler.toml`.
   - **Production branch:** `main`.
   - **Framework preset:** **None**.
   - **Build command:** leave it empty.
   - **Build output directory:** `public`.
   - Open **Root directory (advanced)**: set **Path** to
     **`server/gateway`**.
   - **Environment variables:** none.

   Then tap **Save and Deploy**, and wait for the deploy (under a minute).
4. **Check it.** Open the project's address with `/health` at the end, for
   example <https://alva-online.pages.dev/health>. It should start with
   `{"ok":true,"service":"alva-rooms","lobby":true`: the Worker itself
   answering through the new address. (If Cloudflare added letters to the
   name, for example `alva-online-4xk.pages.dev`, because the name was
   taken, use that address.)
5. **Send that address to Claude** (the one without `/health`). Claude
   points the game at it (`CONFIG.online.serverUrl`) in a pull request; after
   merging it, upload the new ZIP to itch.io.
6. **Optional:** in the project's **Settings** › **Builds** (or **Builds &
   deployments**) › **Branch control**, set preview branches to **None**:
   only `main` needs a build.

If step 4 shows `{"ok":false,"service":"alva-online","error":"server_error"}`,
the gateway works but cannot reach the Worker: in the project's
**Settings** › **Bindings**, a **Service binding** named `ROOMS` must point to
`alva-rooms` (the deploy normally adds it from `server/gateway/wrangler.toml`).
Add it if it is missing, then deploy again (**Deployments** › the latest ›
**Retry deployment**).

On the free plan, each request through `pages.dev` runs the gateway's small
script and then the Worker, both counted against the day's Workers requests
(100,000 a day). That is far more than the lobby's polling and the rooms
need: the Durable Objects' own allowance, which the server's caps watch, is
unchanged.

### If Online play says it is unavailable

The message then says why, in a second sentence, from the server's own
answer (`/health`):

| It says | What it means | What to do |
| --- | --- | --- |
| "This copy of the game has no room server set up." | `CONFIG.online.serverUrl` is empty in this build. | Upload a build made after the server's address was added (the ZIP of a later run of the workflow). |
| "The room server can't be reached from here…" | No answer at all: the Worker is not deployed, is down, or the network blocks `workers.dev`. | Open the server's `/health` in a browser; if it does not answer, look at the last build under **Workers & Pages** › **alva-rooms** › **Deployments** / **Builds**. Try another network. |
| (opening `/health` says the page or server can't be found, on any network) | The address does not exist in DNS: for a `workers.dev` address with the build green and the address switched on, Cloudflare never created the account's subdomain. | Set up [the pages.dev address](#if-the-workersdev-address-never-works-the-pagesdev-address) and send it to Claude. |
| "The room server doesn't accept this page's address (…)" | The page runs from an origin missing from `ALLOWED_ORIGINS`. | Add that address to `ALLOWED_ORIGINS` in `server/wrangler.toml` and merge (Claude can). |
| "The room server answers, but its rooms are not working right now." | The Worker answers but its Lobby (its Durable Objects) does not. | Open `/health` (`"lobby": false`) and the Worker's **Logs** in the dashboard, and send them to Claude. |
| "The room server answers now: try again in a moment." | It failed once, then answered. | Try again. |

**Logs.** `wrangler.toml` turns on Workers Logs (part of the free plan): the
dashboard's **Workers & Pages** › **alva-rooms** › **Logs** lists every
refused origin and every unexpected error, with what failed.

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
