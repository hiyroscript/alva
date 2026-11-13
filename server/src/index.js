// Alva's room server: a Cloudflare Worker and its two Durable Object
// classes (the Lobby and one Room per room). It introduces two players and
// nothing more: no accounts, no matchmaking, no chat, and never the match's
// own traffic, which goes between the two browsers through the relay
// (docs/gameplay/online-play.md). How to run it on your own computer and how
// to put it online: docs/development/online-server.md.
//
// Endpoints (JSON):
//   GET  /health            { ok, service, lobby, relay, open, closed, origin, originAllowed,
//                           currentVersion, versionAllowed }:
//                           the server is up, its Lobby answers, whether the relay's key
//                           is set up for its matches, whether Online play is open
//                           (closed: 'closed' switched off, 'month_limit' the month's
//                           safety stop), and whether the asking game's version
//                           (?version=) plays (readable from any page)
//   GET  /rooms             the public rooms (?version= the game's)
//   POST /rooms             create a room → { room, seat, token }, or { error: 'full' } (503)
//   POST /rooms/join        join by code (or a public room by id) → { room, seat, token }
//   GET  /rooms/:id/ws      the room's WebSocket (?token= from create or join)
//
// Only the game may call it: every request but /health must come from one
// of the ALLOWED_ORIGINS (wrangler.toml), which the replies' CORS headers
// name, and a WebSocket upgrade is held to the same list. The caller's
// address is passed to the Lobby for its per-minute limits only (which
// count a salted hash of it, never the address: server/src/privacy.js).
// The two players of a match never connect straight to each other: only
// through a TURN relay, Cloudflare's (its key in the Worker's secrets:
// server/src/privacy.js), so no player learns another's address. Without
// it, no room is made or joined (`relay_unavailable`). With ONLINE_OPEN
// "false" (wrangler.toml), Online play is closed: the list, creating and
// joining are refused (`closed`) before any Durable Object wakes, and a
// room still open closes when a player connects or asks for the relay. The
// relay's other safeguards are the Lobby's (server/src/lobby.js).
//
// The version rule (server/src/rules.js versionAllowed): the list (its
// ?version=), creating and joining (their body's `version`) are refused as
// `outdated` for any game but CURRENT_VERSION's (wrangler.toml), and 'dev'
// but from a computer's own address, before any Durable Object wakes. A
// room keeps its host's version, so a game of another can never join it
// (`version_mismatch`), and a room left from an older release closes as
// `outdated` (server/src/room.js).
//
// So that "Online play is unavailable" can say why, two answers are
// readable from any page (`access-control-allow-origin: *`), as they hold
// nothing private: /health, which also says whether the Lobby answers and
// whether the asking page's origin is allowed, and the refusal of an origin
// that is not ({ error: 'origin' }). An unexpected failure is answered as
// `server_error` (with the game's CORS headers, so it can read it) and
// logged, for the Cloudflare dashboard's logs.

import { Lobby } from './lobby.js';
import { Room } from './room.js';
import { json, error, parseOrigins, originAllowed, corsHeaders, withCors, onlineOpen } from './http.js';
import { validRoomId, validVersion, versionAllowed, currentVersion } from './rules.js';
import { hasRelay } from './privacy.js';

// What any page may read.
const PUBLIC = Object.freeze({ 'access-control-allow-origin': '*' });

export { Lobby, Room };

const WS_PATH = /^\/rooms\/([^/]+)\/ws$/;
const BODY_LIMIT = 2048;

// The Worker's answer to `request` (also what the tests call).
export async function handle(request, env) {
  const url = new URL(request.url);
  const origin = request.headers.get('origin');
  const allowed = parseOrigins(env.ALLOWED_ORIGINS);
  const fromGame = originAllowed(origin, allowed);

  if (url.pathname === '/health' && request.method === 'GET') return health(env, origin, fromGame, url.searchParams.get('version'));
  if (!fromGame) {
    console.warn(`[alva-rooms] refused a request from origin ${origin ?? '(none)'} (not in ALLOWED_ORIGINS)`);
    return error('origin', PUBLIC);
  }
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });

  const lobby = () => env.LOBBY.get(env.LOBBY.idFromName('lobby'));
  // A POST's body is read here first (a few hundred bytes; anything over
  // BODY_LIMIT is refused before any Durable Object is woken), then passed
  // on to the Lobby as it came.
  const lobbyRoute = url.pathname === '/rooms' || url.pathname === '/rooms/join';
  let body;
  if (request.method === 'POST' && lobbyRoute) {
    body = await request.text();
    if (body.length > BODY_LIMIT) return withCors(error('bad_request'), origin);
  }
  const forward = (target, path) => {
    const headers = new Headers({ 'content-type': 'application/json', 'x-alva-ip': request.headers.get('cf-connecting-ip') ?? '' });
    return target.fetch(`https://lobby${path}`, { method: request.method, headers, body });
  };

  // Online play switched off: no list, no room, no join.
  if (lobbyRoute && !onlineOpen(env)) return withCors(error('closed'), origin);
  // Only the current version plays (and 'dev' only from a computer's own
  // address): no list, no room, no join for any other.
  if (request.method === 'POST' && lobbyRoute) {
    const fields = jsonObject(body);
    if (!fields) return withCors(error('bad_request'), origin);
    if (!versionAllowed(validVersion(fields.version), env, origin)) return withCors(error('outdated'), origin);
  }
  if (url.pathname === '/rooms' && request.method === 'GET' && !versionAllowed(validVersion(url.searchParams.get('version')), env, origin)) {
    return withCors(error('outdated'), origin);
  }
  // No room is made or joined without a relay to connect its players.
  const joining = request.method === 'POST' && lobbyRoute;
  if (joining && !hasRelay(env)) return withCors(error('relay_unavailable'), origin);
  if (url.pathname === '/rooms' && (request.method === 'GET' || request.method === 'POST')) {
    return withCors(await forward(lobby(), '/rooms'), origin);
  }
  if (url.pathname === '/rooms/join' && request.method === 'POST') {
    return withCors(await forward(lobby(), '/rooms/join'), origin);
  }
  const ws = url.pathname.match(WS_PATH);
  if (ws && request.method === 'GET') {
    const id = validRoomId(ws[1]);
    if (!id) return withCors(error('room_not_found'), origin);
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return withCors(error('bad_request'), origin);
    const room = env.ROOM.get(env.ROOM.idFromName(id));
    return room.fetch(`https://room/ws?token=${encodeURIComponent(url.searchParams.get('token') ?? '')}`, { headers: request.headers });
  }
  return withCors(error('not_found'), origin);
}

// A POST's body as an object, or null when it is not one (the Lobby
// checks every field again; the Worker reads only the version).
function jsonObject(text) {
  try {
    const value = JSON.parse(text);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

// Whether the server is up: the Worker answers, and the Lobby (a Durable
// Object, so the storage and the migration behind every room) answers too.
// It also tells the asking page its origin and whether it is allowed, the
// version it plays with, and whether the page's own (`version`, when it
// says) plays.
async function health(env, origin, fromGame, version) {
  let lobby = false;
  let closed = onlineOpen(env) ? null : 'closed';
  try {
    const res = await env.LOBBY.get(env.LOBBY.idFromName('lobby')).fetch('https://lobby/health');
    lobby = res.ok;
    if (lobby) closed ??= (await res.json().catch(() => ({}))).closed ?? null;
  } catch (err) {
    console.error('[alva-rooms] the Lobby did not answer /health', err?.stack ?? err);
  }
  const body = {
    ok: lobby, service: 'alva-rooms', lobby, relay: hasRelay(env), open: !closed, closed, origin: origin ?? null, originAllowed: fromGame,
    currentVersion: currentVersion(env), versionAllowed: version ? versionAllowed(validVersion(version), env, origin) : null,
  };
  return json(body, lobby ? 200 : 503, PUBLIC);
}

export default {
  async fetch(request, env) {
    try {
      return await handle(request, env);
    } catch (err) {
      console.error(`[alva-rooms] ${request.method} ${new URL(request.url).pathname} failed`, err?.stack ?? err);
      const origin = request.headers.get('origin');
      return withCors(error('server_error'), originAllowed(origin, parseOrigins(env?.ALLOWED_ORIGINS)) ? origin : null);
    }
  },
};
