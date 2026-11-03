// Alva's room server: a Cloudflare Worker and its two Durable Object
// classes (the Lobby and one Room per room). It introduces two players and
// nothing more: no accounts, no matchmaking, no chat, and never the match's
// own traffic, which goes straight from one browser to the other
// (docs/gameplay/online-play.md). How to run it on your own computer and how
// to put it online: docs/development/online-server.md.
//
// Endpoints (JSON):
//   GET  /health            { ok: true }: the server is up
//   GET  /rooms             the public rooms
//   POST /rooms             create a room → { room, seat, token }, or { error: 'full' } (503)
//   POST /rooms/join        join by code (or a public room by id) → { room, seat, token }
//   GET  /rooms/:id/ws      the room's WebSocket (?token= from create or join)
//
// Only the game may call it: every request but /health must come from one
// of the ALLOWED_ORIGINS (wrangler.toml), which the replies' CORS headers
// name, and a WebSocket upgrade is held to the same list. The caller's
// address is passed to the Lobby for its per-minute limits only.

import { Lobby } from './lobby.js';
import { Room } from './room.js';
import { json, error, parseOrigins, originAllowed, corsHeaders, withCors } from './http.js';
import { validRoomId } from './rules.js';

export { Lobby, Room };

const WS_PATH = /^\/rooms\/([^/]+)\/ws$/;
const BODY_LIMIT = 2048;

// The Worker's answer to `request` (also what the tests call).
export async function handle(request, env) {
  const url = new URL(request.url);
  const origin = request.headers.get('origin');
  const allowed = parseOrigins(env.ALLOWED_ORIGINS);
  const fromGame = originAllowed(origin, allowed);

  if (url.pathname === '/health' && request.method === 'GET') {
    return withCors(json({ ok: true, service: 'alva-rooms' }), fromGame ? origin : null);
  }
  if (!fromGame) return error('origin');
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

export default {
  fetch(request, env) {
    return handle(request, env).catch(() => error('bad_request'));
  },
};
