// Alva's room server: a Cloudflare Worker and its two Durable Object
// classes (the Lobby and one Room per room). It introduces two players and
// nothing more: no accounts, no matchmaking, no chat, and never the match's
// own traffic, which goes straight from one browser to the other
// (docs/gameplay/online-play.md). How to run it on your own computer and how
// to put it online: docs/development/online-server.md.
//
// Endpoints (JSON):
//   GET  /health            { ok, service, lobby, relay, origin, originAllowed }: the
//                           server is up, its Lobby answers, and whether a TURN relay
//                           is set up for its matches (readable from any page)
//   GET  /rooms             the public rooms
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
// through a TURN relay (its servers in the Worker's secrets:
// server/src/privacy.js), so no player learns another's address. Without
// one, no room is made or joined (`relay_unavailable`).
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
import { json, error, parseOrigins, originAllowed, corsHeaders, withCors } from './http.js';
import { validRoomId } from './rules.js';
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

  if (url.pathname === '/health' && request.method === 'GET') return health(env, origin, fromGame);
  if (!fromGame) {
    console.warn(`[alva-rooms] refused a request from origin ${origin ?? '(none)'} (not in ALLOWED_ORIGINS)`);
    return error('origin', PUBLIC);
  }
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });

  const lobby = () => env.LOBBY.get(env.LOBBY.idFromName('lobby'));
  // The request passed on to the Lobby, its body read here first (a few
  // hundred bytes; anything over BODY_LIMIT is refused before any Durable
  // Object is woken).
  const forward = async (target, path) => {
    const headers = new Headers({ 'content-type': 'application/json', 'x-alva-ip': request.headers.get('cf-connecting-ip') ?? '' });
    let body;
    if (request.method === 'POST') {
      body = await request.text();
      if (body.length > BODY_LIMIT) return error('bad_request');
    }
    return target.fetch(`https://lobby${path}`, { method: request.method, headers, body });
  };

  // No room is made or joined without a relay to connect its players.
  const joining = request.method === 'POST' && (url.pathname === '/rooms' || url.pathname === '/rooms/join');
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

// Whether the server is up: the Worker answers, and the Lobby (a Durable
// Object, so the storage and the migration behind every room) answers too.
// It also tells the asking page its origin and whether it is allowed.
async function health(env, origin, fromGame) {
  let lobby = false;
  try {
    const res = await env.LOBBY.get(env.LOBBY.idFromName('lobby')).fetch('https://lobby/health');
    lobby = res.ok;
  } catch (err) {
    console.error('[alva-rooms] the Lobby did not answer /health', err?.stack ?? err);
  }
  const body = { ok: lobby, service: 'alva-rooms', lobby, relay: hasRelay(env), origin: origin ?? null, originAllowed: fromGame };
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
