# The room server

Online Play ([online play](../gameplay/online-play.md)) needs one small
server: it lets players create rooms, lists the public ones, and
introduces the two players of a room to each other. It is
[`server/`](../../server/): a Cloudflare Worker with two Durable Object
classes, plain JavaScript, no framework. It also carries each match, the
two players' input packets passed between them by their room, so the two
browsers never connect to each other and neither ever learns the other's
address ([privacy](#privacy)).

`server/` is development-only for the game: the itch.io release never
includes it ([the itch.io release](itch-release.md)), and the game never
imports it. It is deployed on its own, to Cloudflare, by the owner (the
steps are [below](#putting-it-online-step-by-step)).

| File | Owns |
| --- | --- |
| [`server/src/index.js`](../../server/src/index.js) | The Worker: the routes, the allowed origins (CORS, and a WebSocket upgrade's Origin), the caller's address passed to the Lobby. |
| [`server/src/lobby.js`](../../server/src/lobby.js) | `Lobby`, one Durable Object for every room: ids and codes, the public list, joining, the caps (`MAX_ROOMS`, the daily request budget), the relay's safeguards (`MAX_MATCHES`, the monthly safety stop, the hourly password cap, `ONLINE_OPEN`), the per-address limits, the sweep of silent rooms. |
| [`server/src/room.js`](../../server/src/room.js) | `Room`, one Durable Object per room: both players' WebSockets (hibernated), seats by token, fighters, Ready, the host's start, rematches, a relay password for each player (once the Lobby agrees), the WebRTC signalling passed on scrubbed, leaving, closing, its alarms, its reports to the Lobby. |
| [`server/src/privacy.js`](../../server/src/privacy.js) | What keeps every player's address to themselves: the signalling scrubbed (`scrubSignal`), the relay's servers with a password that lasts an hour from Cloudflare's TURN service (`relayServers`, `hasRelay`), the salted hash the Lobby counts callers by (`callerKey`). |
| [`server/src/rules.js`](../../server/src/rules.js) | What the server accepts: names, room names, codes, modes, visibility (the game's own rules, again). |
| [`server/src/http.js`](../../server/src/http.js) | JSON replies, error codes, body limits, origin patterns. |
| [`server/wrangler.toml`](../../server/wrangler.toml) | The Worker's configuration: its Durable Objects (SQLite-backed, as the free plan requires), the allowed origins and the caps, each with its reasoning. |
| [`server/gateway/`](../../server/gateway/) | The server's `pages.dev` address: a Cloudflare Pages project that passes every request, WebSockets included, unchanged to the Worker over a service binding ([why](#why-the-pagesdev-address); setting it up: [the steps](#putting-it-online-step-by-step)). |
| [`server/tests/`](../../server/tests/) | Its tests, on fake Durable Objects: no account, no network. |

## What it answers

| Request | Answer |
| --- | --- |
| `GET /health` | `{ "ok": true, "service": "alva-rooms", "lobby": true, "relay": …, "open": …, "closed": …, "origin": …, "originAllowed": …, "currentVersion": …, "versionAllowed": … }`: the server is up, its Lobby answers, whether the relay's key is set up, whether Online play is open (`closed`: `"closed"` when switched off, `"month_limit"` once the month's safety stop is reached, else `null`), the version it plays with, and whether the asking game's (`?version=`) plays (`null` when it names none) (open it in a browser: `origin` is then `null`). Readable from any page, so the game can ask it why it cannot play online. |
| `GET /rooms?version=…` | The public rooms: `{ rooms: [{ id, name, host, mode, players, status, version, joinable }] }`, for a game of that version. |
| `POST /rooms` | Create: `{ name, playerName, visibility, mode, session, version }` → `{ room, seat: 'host', token }`, or `{ error: 'full' }` (503). |
| `POST /rooms/join` | Join by `{ code }` (any room) or `{ id }` (a public room), with `{ playerName, session, version }` → `{ room, seat: 'guest', token }`. |
| `GET /rooms/:id/ws?token=…` | The room's WebSocket, for the seat whose token it brings. |

Every field is checked on the server; a refusal is a code the game
translates: `invalid_name`, `invalid_room_name`, `invalid_mode`,
`invalid_visibility`, `invalid_code`, `room_not_found`, `room_full`,
`version_mismatch` (two versions of the game never share a match),
`outdated` (the game is not the current version: [the version
rule](#the-version-rule)), `full`,
`rate_limited`, `origin`, `bad_request`, `relay_unavailable` (no relay
key), `closed` (Online play switched off), `month_limit` (the relay's
monthly safety stop), `server_error` (something failed: logged, see
below). The refusal of an origin is readable from any page, as
`/health` is, so the game can say which address was refused. The room's
messages are listed at
the top of [`server/src/room.js`](../../server/src/room.js).

**Who may call it.** Every request but `/health` must come from one of
`ALLOWED_ORIGINS` in `wrangler.toml`: itch.io's HTML5 game hosts
(`https://html-classic.itch.zone`, `https://html.itch.zone`, and any other
`https://*.itch.zone`, the domain itch.io serves games from), the [native
apps](native-apps.md#origins) (`tauri://localhost` for the desktop apps on
macOS and Linux, `http://tauri.localhost` and `https://tauri.localhost` on
Windows, `https://alva.app` for the Android app; `parseOrigins` reads the
`tauri:` scheme like any other, each an exact origin) and
`http://localhost:*` / `http://127.0.0.1:*` for testing. The game's own
site on GitHub Pages is not on it, so Online Play is for the itch.io page
(adding `https://hiyroscript.github.io` to the list would open it there
too). Change the list there and deploy again (merging into `main` does);
no code changes. The Origin of a WebSocket upgrade
is held to the same list.

**No accounts, no personal data.** No login, cookie or stored identity: the
game makes a random session id for each visit (memory only) so the server
can tell a reconnect. A room's names live as long as the room.

### Privacy

No player ever learns another's network address (IP address), and the
server keeps none:

- **No direct connection.** A direct link between the two browsers (WebRTC)
  would hand each one the other's address while it was set up. So there is
  none: every match goes through a **TURN relay**, Cloudflare's (set up
  once: [the steps](#its-relay-private-connections)). Each player asks
  its room for the relay's servers (`{ type: 'relay' }`, at most 10 per
  player per 10 minutes, only with the other seat taken); the room gets
  them from Cloudflare's TURN service with the Worker's key, with a
  password of that player's own that lasts **an hour**, and the two
  browsers connect through it relay-only, each seeing only the relay's
  address. Without the key no room is made (`relay_unavailable`), and a
  link that cannot be made is "Couldn't connect": there is no other way.
  No match packet goes through the room server.
- **Scrubbed signalling.** Every `signal` a Room passes on goes through
  `scrubSignal` first (`server/src/privacy.js`): only relay candidates,
  their related address (`raddr`, the player's own) blanked; host,
  server-reflexive and peer-reflexive candidates dropped; the SDP's `c=`,
  `a=rtcp` and `o=` addresses blanked; unknown kinds dropped. The game
  scrubs what it sends the same way (`js/online/privacy.js`); a test holds
  the two copies to the same answers. Only the current version plays at
  all ([the version rule](#the-version-rule)), so no older copy is a way
  around any of this.
- **What a player sees of the other:** the name they typed, their fighter,
  Ready, Rematch and whether they are connected, and (over the relay) their
  match packets: input frames, acknowledgements, hashes. Never a token, a
  session or an address. The public list shows a room's name, its host's name, its mode,
  its players and its version.
- **No address kept.** The Lobby's per-minute limits count a salted hash of
  the caller's address (`callerKey`; the salt is random, in memory only),
  never the address, for a minute. Nothing stored holds an address.
  Cloudflare's per-request logs, which would hold callers' addresses, are
  off (`invocation_logs = false` in `wrangler.toml`); the Worker's own log
  lines name none.
- **Who sees what, unavoidably:** Cloudflare runs the server (and the
  `pages.dev` address) and the relay, so it sees players' addresses, as
  any host does. The other player never does. A relay password reaches
  the player it is for (their browser needs it to use the relay), so
  someone could copy theirs and use the relay for something else: it
  stops working within the hour, the server hands out at most
  `RELAY_PASSWORDS_PER_HOUR` an hour in all, and only to players in a room
  with both seats taken ([the relay's safeguards](#the-relays-safeguards)).

### The version rule

Online play is for the current release only (`versionAllowed` in
[`server/src/rules.js`](../../server/src/rules.js)). `CURRENT_VERSION` in
`wrangler.toml` is that release's version, package.json's (a test holds the
two equal; each release sets both). The Worker refuses the list (its
`?version=`), creating and joining (the body's `version`) as `outdated` for
a game of any other version, or none, before any Durable Object wakes, and
`/health?version=` says it too (`versionAllowed`). A game run from the
repository's modules plays as `dev`, let in only from `http://localhost`
and `http://127.0.0.1` (any port), so testing on one's own computer still
plays while no real site can claim it. A room keeps its host's version: a
game of another never joins it (`version_mismatch`), and a room left from
an older release closes as `outdated` (`roomVersionCurrent` in
[`server/src/room.js`](../../server/src/room.js)) when a player connects or
asks for the relay, which a deploy brings about at once (it drops every
room's sockets, and the game reconnects). With no `CURRENT_VERSION` at all
only `dev` plays. The game tells the player a new version is out and how to
get it ([online play](../gameplay/online-play.md#the-version-rule)).

So a new `CURRENT_VERSION` locks every older copy out of Online play the
moment it is deployed: deploy it only once the new version can be
downloaded (the itch.io ZIP uploaded, the installers on the Releases page:
[the native apps](native-apps.md#releases)).

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
- A room costs about 20 requests from creation to its last match (create,
  join, two connections, the relay's servers, the signalling, the reports);
  a player waiting in the lobby about 12 a minute (the list refreshes every
  5 s). The match itself costs nothing here: it goes through the relay
  ([privacy](#privacy)), which has its own allowance and safeguards
  ([below](#the-relays-safeguards)).
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

### The relay's safeguards

Cloudflare's TURN relay is free up to **1,000 GB a month**, then $0.05 a GB
(checked on 2026-11-03). The server keeps Online play inside the free
amount, each a line in `server/wrangler.toml`:

- **`MAX_MATCHES` (10) rooms with both players at once.** Those are the
  rooms whose players are connected through the relay; a host waiting
  alone, or anyone in the lobby, does not count, and there is no daily or
  hourly limit on matches. One more join answers `full` ("Servers are full
  right now. Please try again in a few minutes.") until a room ends or a
  player leaves.
- **The monthly safety stop.** The Lobby estimates the month's relay use
  (UTC) from the time rooms spend with both players (menus included, not
  only matches), at `RELAY_GB_PER_HOUR` (0.2 GB, the high end of what a
  match uses: about 0.1 to 0.2 GB an hour, from the game's 60 packets a
  second each way). Once the estimate reaches `RELAY_MONTHLY_GB` (450 GB),
  **Online play closes until the next month**: the name screen, the lobby
  and a room still open all say "Online play has reached its limit for
  this month. It opens again next month." and go back Home; no list, no
  room, no join, no relay password. 450 is under half the free amount, so
  even a billing month that does not start on the 1st, and so straddles
  two calendar months, stays inside it. That still leaves about 2,250
  hours of two players in a room a month (some 27,000 five-minute
  matches).
- **Passwords that last an hour,** at most `RELAY_PASSWORDS_PER_HOUR`
  (120) handed out an hour server-wide (10 matches use about 20 to 40).
  Past it, a player's link fails as "Servers are full", with **Try again**.
  Two players can stay in a room far longer than an hour, so between
  matches the host's browser makes a link older than 40 minutes again
  (`CONFIG.online.linkRenewMs`), with new passwords; the players notice
  nothing.
- **`ONLINE_OPEN`, the switch.** `"false"` closes Online play for everyone
  ("Online play is closed right now. Please try again later.", back Home;
  a room still open closes when a player connects or asks for the relay);
  `"true"` opens it again. The rest of the game is not affected. Merging
  the change deploys it.

What is left: a password already handed out keeps working until its hour
is up, even once Online play has closed, and a copied one could be used
for something else for that hour. The safety stop comes long before the
free amount, so that is room to spare, not a bill. Cloudflare's own figure
is in its dashboard (**Realtime**, and the account's billing); after some
play, compare it with the estimate (Claude can adjust the rate), and turn
on a usage or billing alert there if Cloudflare offers one.

## Testing it on your computer

No Cloudflare account is needed for any of this.

```sh
node --test                        # every test of the repository, the server's included
cd server && npm test              # the server's alone (no install needed)
```

**Two tabs against the deployed server.** It allows `http://localhost:*`,
so the game served from your computer (`python3 -m http.server 8000` from
the repository's root, then `http://localhost:8000` in two tabs or two
browsers) plays online through it with nothing to change: it plays as
`dev`, which the server lets in from there ([the version
rule](#the-version-rule)). In one tab,
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

A local server makes rooms only with the relay's key (`"relay":true` in
its `/health`): give it as variables for that run
(`npx wrangler dev --var TURN_KEY_ID:… --var TURN_KEY_API_TOKEN:…`, never
committed). To try it with no Cloudflare account, `TURN_API_URL` points the
server at a stand-in for Cloudflare's credentials service instead: a small
local TURN server (such as the `node-turn` package) and a page answering
`{ "iceServers": [{ "urls": ["turn:127.0.0.1:3478?transport=udp"], "username": …, "credential": … }] }`
(with any key values). The safeguards' settings can be tried the same way,
for example `--var ONLINE_OPEN:false` or `--var MAX_MATCHES:1`.

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

Done once, on 2026-11-03: the server is deployed, and the game reaches it at
`https://alva-online.pages.dev` (`CONFIG.online.serverUrl`). The steps stay
here for a new deployment (another Cloudflare account, or starting over).

There are two parts, both on Cloudflare's free plan: the Worker itself
(`server/`), which has no public address of its own, and a small Pages
project (`server/gateway/`) that gives it its address, `pages.dev`, and
passes every request to it ([why](#why-the-pagesdev-address)).

This is the owner's part, and it needs **no computer of a particular kind
and no terminal**: everything happens in a web browser, on
a phone, a tablet, a Chromebook or any computer. Cloudflare builds and
deploys both itself, from this repository on GitHub. Nothing here costs
money: the free plan needs no credit card, and its building allowances are
far more than the server needs. Each step is one thing to do; if a step
does not show what it says, take a screenshot (or copy the error text) and
send it to Claude.

**The Worker**

1. **Make sure `server/` is on `main`** on GitHub: Cloudflare deploys from
   the `main` branch.
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
5. **Fill in the settings** on the **Set up your application** screen
   ("Configure your Worker project"):
   - **Project name:** `alva-rooms`. It must be exactly this: it is the name
     in `server/wrangler.toml`, and the build fails if the two differ.
   - **Build command:** leave it empty.
   - **Deploy command:** `npx wrangler deploy`
   - **Preview command:** leave it as it is.
   - **Enable Preview builds:** turn it **off** (only `main` is deployed;
     other branches need no builds).
   - **Protect with Cloudflare Access:** leave it **off**.
   - Open **Advanced settings**: **Path** (the root directory) is `/`;
     change it to **`/server`**.
   - **API token:** leave **Create new token** (Cloudflare makes one for its
     own build; if it asks for a name, type `alva-rooms-build`).
   - **Variable name** and **Variable value:** leave them empty (the
     server's settings are in `server/wrangler.toml`).

   Then tap **Deploy**.
6. **Wait for the build** (a minute or two) to end successfully. The
   Worker gets no address here: `server/wrangler.toml` switches its
   `workers.dev` address off. Its address comes next.

**Its pages.dev address**

7. **Start a Pages project.** Open **Workers & Pages**, then **Create** (or
   **Create application**). Choose **Pages**: at the bottom of the screen,
   a line such as **Looking to deploy Pages? Get started**. (Not the
   import-a-repository screen of step 3: that one makes a Worker, and its
   settings screen has a **Deploy command**.) Then choose **Import an
   existing Git repository**, pick **alva** (GitHub is already connected)
   and tap **Begin setup**.
8. **Fill in the settings** on the **Set up builds and deployments** screen:
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
9. **Check it.** Open the project's address with `/health` at the end, for
   example <https://alva-online.pages.dev/health>. It should start with
   `{"ok":true,"service":"alva-rooms","lobby":true`: the Worker answering
   through its address. (If Cloudflare added letters to the name, for
   example `alva-online-4xk.pages.dev`, because the name was taken, use
   that address.) If it shows `"service":"alva-online","error":"server_error"`
   instead, the Pages project cannot reach the Worker: in its **Settings** ›
   **Bindings**, a **Service binding** named `ROOMS` must point to
   `alva-rooms` (the deploy normally adds it from
   `server/gateway/wrangler.toml`); add it, then **Deployments** › the
   latest › **Retry deployment**.
10. **Send that address to Claude** (the one without `/health`). Claude
    points the game at it (`CONFIG.online.serverUrl`) in a pull request;
    after merging it, upload the new ZIP to itch.io.
11. **Optional:** in the Pages project's **Settings** › **Builds** (or
    **Builds & deployments**) › **Branch control**, set preview branches to
    **None**: only `main` needs a build.

From then on, every merge into `main` builds and deploys both again by
themselves (a change to the server's code or to a `wrangler.toml` reaches
them that way, with nothing to run). If the dashboard offers builds for
other branches than `main`, they can be turned off: only `main` matters.

### Its relay (private connections)

Every match goes through Cloudflare's TURN relay, so neither player ever
learns the other's address ([privacy](#privacy)), through the relay
location nearest each player, and nothing of the match counts against the
room server's plan. **Without its key, no room is made**: Online play says
"The room server can't make private connections right now." Free up to
1,000 GB a month, which [the safeguards](#the-relays-safeguards) keep it
inside. Done once, on a phone:

1. **Subscribe to Realtime.** In the Cloudflare dashboard's menu, open
   **Realtime** (it may be listed as **Calls**). Cloudflare asks for a card
   or PayPal before the first key, even on the free amount: add it and
   subscribe (it shows $0.00).
2. **Make a TURN key.** In **Realtime**, open **TURN Server** and
   **Create** a key. If it asks for a name, type `alva-relay`. Cloudflare
   then shows two values: the key's **ID** (Turn Token ID) and its **API
   token**. Keep the page open: the API token is shown only once. Keep both
   to yourself: they go into Cloudflare, never into the repository or a
   message.
3. **Give them to the server.** Open **Workers & Pages** › **alva-rooms** ›
   **Settings** › **Variables and Secrets**, and tap **Add**. Choose the
   type **Secret**, name it `TURN_KEY_ID`, paste the key's ID as its value.
   **Add** another: type **Secret**, name `TURN_KEY_API_TOKEN`, the API
   token as its value. Then **Deploy** (or **Save**). Secrets stay through
   every later deploy from GitHub.
4. **Remove the old relay's secrets**, if they are there: `TURN_URLS`,
   `TURN_USERNAME` and `TURN_CREDENTIAL` (ExpressTURN's, no longer used):
   delete each one, then **Deploy** (or **Save**).
5. **Check it.** Open <https://alva-online.pages.dev/health>: it should now
   say `"relay":true` and `"open":true`. (With `"relay":false`, the two
   names in step 3 are not exactly right, or not saved yet.)
6. **Optional:** turn on a usage or billing alert in Cloudflare
   (**Notifications**), if it offers one for Realtime.

If Cloudflare's TURN service stops answering, rooms are still made but
their links fail ("Couldn't connect to your opponent") until it answers
again.

### With a terminal instead

On a computer with a terminal (Linux, macOS or Windows) and Node.js 22 or
newer, both deploy from a copy of the repository: in `server`, `npm install`,
then `npx wrangler login` (a browser page asks to **Allow**) and
`npx wrangler deploy` (the Worker); then in `server/gateway`,
`../node_modules/.bin/wrangler pages project create alva-online --production-branch main`
once, and `../node_modules/.bin/wrangler pages deploy` (its address). Deploying
that way does not set up the automatic deploys above.

### Why the pages.dev address

The game could reach the Worker at its own `workers.dev` address, and at
first it was meant to. On this account that address never came to exist:
the dashboard showed it switched on and public, the build was green, and
opening it said the page or server can't be found. Cloudflare's own
nameserver answered that the account's whole `workers.dev` subdomain does
not exist (NXDOMAIN, checked on 2026-11-03), and switching the address off
and on again did not help. Others have reported the same on Cloudflare's
forum.

A `pages.dev` address is made separately from the account's `workers.dev`
subdomain, so the Worker got one from a free Pages project
(`server/gateway/`). Its `_worker.js` passes every request, WebSockets
included, unchanged to the `alva-rooms` Worker over a service binding,
which reaches the Worker by its name, not by any address: the same rooms,
allowed origins and limits. Nothing uses the `workers.dev` address since,
so `server/wrangler.toml` switches it off (`workers_dev = false`, and
`preview_urls = false` for its preview addresses).

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
| "The room server can't be reached from here…" | No answer at all: the server is not deployed or is down, this network blocks `pages.dev`, or the game page is an older copy pointing at another address. | Open the server's `/health` in a browser on the same device and network; if it does not answer, look at the last builds under **Workers & Pages** › **alva-rooms** and **alva-online**. Try another network (mobile data), and check that itch.io plays the newest upload. |
| (opening `/health` says "Your connection is not private", `NET::ERR_CERT_AUTHORITY_INVALID`) | Something on this network or device answers instead of the server, usually a school or work web filter blocking `pages.dev`. Seen on 2026-11-03, while the same address answered on mobile data. | Nothing in the game can get around it: play from another network (mobile data, home Wi-Fi) or another device. |
| (opening `/health` says the page or server can't be found, on any network) | The address does not exist in DNS (what happened to the Worker's own `workers.dev` address: [why the pages.dev address](#why-the-pagesdev-address)). | Check the address in **Workers & Pages** › **alva-online**, and send it to Claude. |
| "The room server doesn't accept this page's address." | The page runs from an origin missing from `ALLOWED_ORIGINS` (the game's GitHub Pages site, for one: Online Play is for the itch.io page). The message does not show the address. | Add that address to `ALLOWED_ORIGINS` in `server/wrangler.toml` and merge (Claude can). |
| "The room server answers, but its rooms are not working right now." | The Worker answers but its Lobby (its Durable Objects) does not, or (`/health` says `"service":"alva-online"`) the Pages project cannot reach the Worker. | Open `/health` (`"lobby": false`, or the binding: step 9 [above](#putting-it-online-step-by-step)) and the Worker's **Logs** in the dashboard, and send them to Claude. |
| "The room server can't make private connections right now." | The server has no relay key (`/health` says `"relay":false`), so it makes no room. | Add the two secrets: [its relay](#its-relay-private-connections). |
| "A new version of Alva is out. Update to play online." | The game is not the server's `CURRENT_VERSION` (`/health?version=…` says `"versionAllowed":false`; `"currentVersion"` is the server's). | The player updates (a native app's Get the update, a refreshed page). If it is the newest copy that is refused, `CURRENT_VERSION` was deployed ahead of it, or the itch.io upload is older: upload the ZIP built from the same commit. |
| "Online play needs a connection this copy of Alva can't make…" | The copy has no WebRTC (the Linux desktop app: [the native apps](native-apps.md#the-desktop-apps-tauri)). Nothing reaches the server. | Play online in a browser (itch.io's page) on that computer. |
| "Couldn't connect to your opponent. One of your networks may be blocking it." (in a room) | The link through the relay did not open within 10 s: Cloudflare's TURN service did not answer, the key is wrong, or a network blocks the relay. | Try again; if it keeps happening, check the two secrets and the Worker's **Logs** ("no relay password from the TURN service"), or try another network. |
| "The room server answers now: try again in a moment." | It failed once, then answered. | Try again. |

When Online play is **closed** instead, it says so in its own message and
goes back Home:

| It says | What it means | What to do |
| --- | --- | --- |
| "Online play is closed right now. Please try again later." | `ONLINE_OPEN` is `"false"` in `server/wrangler.toml` (`/health`: `"closed":"closed"`). | Set it to `"true"` and merge, when you want it open. |
| "Online play has reached its limit for this month. It opens again next month." | The month's estimated relay use reached `RELAY_MONTHLY_GB` (`/health`: `"closed":"month_limit"`). It opens again by itself on the 1st (UTC). | Nothing: that is the safety stop working. To open sooner, compare Cloudflare's real figure with the estimate first ([the safeguards](#the-relays-safeguards)). |
| "Servers are full right now. Please try again in a few minutes." | `MAX_MATCHES` rooms have both players (joining), the relay's passwords for this hour are all handed out (in a room), or a free-plan cap. | Wait a few minutes; a place opens when a room ends or a player leaves. |

**Logs.** `wrangler.toml` turns on Workers Logs (part of the free plan): the
dashboard's **Workers & Pages** › **alva-rooms** › **Logs** lists every
refused origin and every unexpected error, with what failed.

### Later

- **Closing or opening Online play, or changing a cap or the allowed
  origins:** edit `server/wrangler.toml`
  in a pull request; merging it deploys the server again (with a terminal
  instead: `npx wrangler deploy` from the `server` folder).
- **Seeing it work:** the Cloudflare dashboard, **Workers & Pages** ›
  **alva-rooms** shows its builds, requests and errors; **Durable Objects**
  shows the day's usage against the free plan.
- **Changing the server's code:** the same: merged into `main`, it is
  deployed. A deploy restarts the rooms' connections: the game reconnects
  to its room by itself within a few seconds, and a match under way is not
  affected (it never goes through the server).
- **A new release of the game:** `CURRENT_VERSION` follows package.json's
  version, and only that version plays ([the version rule](#the-version-rule));
  deploy it last, once the new version can be downloaded.
