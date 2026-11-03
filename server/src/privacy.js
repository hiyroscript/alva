// What keeps every player's network address to themselves
// (docs/development/online-server.md, "Privacy").
//
// Two browsers in a match never connect straight to each other: each one
// reaches the other only through a TURN relay (Cloudflare's), so neither
// can learn the other's IP address. This file holds the server's part:
//
//   - scrubSignal: the WebRTC signalling a Room passes from one player to
//     the other (offer, answer, ICE candidates) loses every address it
//     could carry before it is sent on. Only relay candidates go through
//     (the relay's own address, never the player's), with their "related
//     address" (raddr, the player's own public address) blanked; host,
//     server-reflexive and peer-reflexive candidates are dropped; and the
//     SDP's connection lines (c=, a=rtcp, o=) are blanked. So even a copy
//     of the game that tried to connect directly could not hand anyone an
//     address through the server. The game scrubs its own signalling the
//     same way before sending it (js/online/privacy.js, the same rules).
//   - relayServers: short-lived TURN credentials for one player, from
//     Cloudflare's TURN service with the key in the Worker's secrets
//     (TURN_KEY_ID, TURN_KEY_API_TOKEN), filtered to the relay addresses a
//     browser needs.
//
// The server itself never stores or logs an address: the Lobby's
// per-minute limits count a salted hash of the caller's address, in memory
// only (server/src/lobby.js), and nothing the server answers or relays
// names one.

// Signalling message kinds a Room passes on; anything else is dropped.
const SIGNAL_KINDS = new Set(['offer', 'answer', 'ice', 'retry']);
const SDP_LIMIT = 12 * 1024;
const CANDIDATE_LIMIT = 1024;

// One ICE candidate line ("candidate:… typ relay raddr … rport …", with or
// without SDP's "a=" in front), scrubbed: null unless it is a relay
// candidate, and then with its related address blanked.
export function scrubCandidateLine(line) {
  if (typeof line !== 'string' || line.length > CANDIDATE_LIMIT) return null;
  const prefix = line.startsWith('a=') ? 'a=' : '';
  const parts = line.slice(prefix.length).trim().split(/\s+/);
  if (!/^candidate:/i.test(parts[0] ?? '')) return null;
  const typ = parts.indexOf('typ');
  if (typ < 0 || parts[typ + 1]?.toLowerCase() !== 'relay') return null;
  for (let i = typ + 2; i < parts.length - 1; i++) {
    if (parts[i] === 'raddr') parts[i + 1] = '0.0.0.0';
    if (parts[i] === 'rport') parts[i + 1] = '0';
  }
  return prefix + parts.join(' ');
}

// An SDP (offer or answer) with no address but the relay's: candidate
// lines scrubbed (or dropped), connection and origin lines blanked.
export function scrubSdp(sdp) {
  if (typeof sdp !== 'string' || sdp.length > SDP_LIMIT) return null;
  const eol = sdp.includes('\r\n') ? '\r\n' : '\n';
  const out = [];
  for (const line of sdp.split(/\r?\n/)) {
    if (line.startsWith('a=candidate:')) {
      const kept = scrubCandidateLine(line);
      if (kept) out.push(kept);
    } else if (/^c=IN IP[46] /.test(line)) {
      out.push(line.startsWith('c=IN IP6') ? 'c=IN IP6 ::' : 'c=IN IP4 0.0.0.0');
    } else if (/^a=rtcp:\d+ IN IP[46] /.test(line)) {
      out.push(line.replace(/ IN IP[46] \S+$/, ' IN IP4 0.0.0.0'));
    } else if (/^o=/.test(line)) {
      out.push(line.replace(/ IN IP[46] \S+$/, ' IN IP4 127.0.0.1'));
    } else {
      out.push(line);
    }
  }
  return out.join(eol);
}

// A signalling message as the other player may receive it, or null when
// nothing of it may pass. { kind: 'offer' | 'answer', sdp: { type, sdp } },
// { kind: 'ice', candidate: { candidate, sdpMid, sdpMLineIndex,
// usernameFragment } | null } (null: no more candidates) or
// { kind: 'retry' }.
export function scrubSignal(data) {
  if (!data || typeof data !== 'object' || !SIGNAL_KINDS.has(data.kind)) return null;
  if (data.kind === 'retry') return { kind: 'retry' };
  if (data.kind === 'offer' || data.kind === 'answer') {
    const type = data.sdp?.type;
    if (type !== data.kind) return null;
    const sdp = scrubSdp(data.sdp?.sdp);
    return sdp === null ? null : { kind: data.kind, sdp: { type, sdp } };
  }
  const c = data.candidate;
  if (c === null || c === undefined) return { kind: 'ice', candidate: null };
  if (typeof c !== 'object') return null;
  // An empty candidate marks the end of one m-line's candidates.
  if (c.candidate === '') return { kind: 'ice', candidate: { candidate: '', ...where(c) } };
  const line = scrubCandidateLine(c.candidate);
  return line ? { kind: 'ice', candidate: { candidate: line, ...where(c) } } : null;
}

// The parts of a candidate that say which media line it belongs to.
function where(c) {
  const out = {};
  if (typeof c.sdpMid === 'string' && c.sdpMid.length <= 32) out.sdpMid = c.sdpMid;
  if (Number.isInteger(c.sdpMLineIndex) && c.sdpMLineIndex >= 0 && c.sdpMLineIndex < 16) out.sdpMLineIndex = c.sdpMLineIndex;
  if (typeof c.usernameFragment === 'string' && c.usernameFragment.length <= 256) out.usernameFragment = c.usernameFragment;
  return out;
}

// ---- The relay ---------------------------------------------------------------------

// How long a player's relay credentials last: a room's whole session of
// rematches; a new peer link asks for new ones.
export const RELAY_TTL_SECONDS = 6 * 60 * 60;

// Whether the Worker has a TURN key to make relay credentials with.
export const hasRelay = (env) => !!(env?.TURN_KEY_ID && env?.TURN_KEY_API_TOKEN);

// Cloudflare's TURN service: short-lived credentials for one player.
export const turnApiUrl = (env) => `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(env.TURN_KEY_ID)}/credentials/generate-ice-servers`;

// The relay servers for one player, as RTCPeerConnection's iceServers:
// only TURN entries with their credentials (no STUN: a relay-only link
// never uses it), and of their addresses the UDP one on 3478 and the TLS
// one on 443 (Cloudflare lists more, including port 53, which browsers
// refuse or time out on; each extra address is one more allocation).
// Throws when the service does not answer with any.
export async function relayServers(env, fetchImpl = globalThis.fetch?.bind(globalThis)) {
  if (!hasRelay(env)) throw new Error('relay_unavailable');
  const res = await fetchImpl(env.TURN_API_URL || turnApiUrl(env), {
    method: 'POST',
    headers: { authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ ttl: RELAY_TTL_SECONDS }),
  });
  if (!res.ok) throw new Error(`relay service answered ${res.status}`);
  const data = await res.json();
  const servers = pickRelayServers(data?.iceServers);
  if (!servers.length) throw new Error('relay service gave no TURN server');
  return servers;
}

// The TURN entries of a TURN service's answer (an iceServers object or an
// array of them), each with its preferred addresses.
export function pickRelayServers(iceServers) {
  const list = Array.isArray(iceServers) ? iceServers : iceServers ? [iceServers] : [];
  const out = [];
  for (const s of list) {
    if (!s || typeof s.username !== 'string' || typeof s.credential !== 'string') continue;
    const urls = (Array.isArray(s.urls) ? s.urls : [s.urls]).filter((u) => typeof u === 'string' && /^turns?:/i.test(u));
    const usable = urls.filter((u) => !/:53(\?|$)/.test(u));
    const preferred = usable.filter((u) => /^turn:[^?]*:3478\?transport=udp$/i.test(u) || /^turns:[^?]*:443(\?|$)/i.test(u));
    const chosen = preferred.length ? preferred : usable;
    if (chosen.length) out.push({ urls: chosen, username: s.username, credential: s.credential });
  }
  return out;
}

// ---- Addresses, never kept -----------------------------------------------------------

// A caller's address as the Lobby's per-minute limits count it: a salted
// 64-bit hash, so not even the Lobby's memory holds the address itself. The
// salt is the Lobby's own, random, in memory only and gone when it restarts
// (as its counts are); without it the hash names nobody. (Synchronous on
// purpose: a cryptographic digest would add nothing the secret salt does
// not, and would make every request wait on it.)
export function callerKey(ip, salt) {
  const text = `${salt}|${ip || '?'}`;
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}
