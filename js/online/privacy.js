// What keeps the player's network address to themselves in Online Play
// (docs/gameplay/online-play.md, "Privacy").
//
// The two browsers of a match never connect straight to each other: each
// reaches the other only through a TURN relay (js/online/peer.js connects
// relay-only, with credentials the room hands it), so neither learns the
// other's IP address. On top of that, every signalling message this
// browser sends (offer, answer, ICE candidates) is scrubbed here first:
// only relay candidates go out (the relay's own address, never the
// player's), with their related address (raddr, the player's public
// address) blanked; host, server-reflexive and peer-reflexive candidates
// are dropped; the SDP's connection lines (c=, a=rtcp, o=) are blanked. The
// room server scrubs what it passes on again, by its own copy of these
// rules (server/src/privacy.js); a test holds the two copies to the same
// answers (server/tests/privacy.test.mjs).

// Signalling message kinds that may be sent or taken; anything else is
// dropped.
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

// A signalling message as it may be sent (or taken), or null when nothing
// of it may: { kind: 'offer' | 'answer', sdp: { type, sdp } },
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

// The relay (TURN) servers among `iceServers`: the only ones a relay-only
// link may use. None, and no link is made.
export function relayOnly(iceServers) {
  if (!Array.isArray(iceServers)) return [];
  return iceServers
    .filter((s) => s && typeof s.username === 'string' && typeof s.credential === 'string')
    .map((s) => ({ urls: (Array.isArray(s.urls) ? s.urls : [s.urls]).filter((u) => typeof u === 'string' && /^turns?:/i.test(u)), username: s.username, credential: s.credential }))
    .filter((s) => s.urls.length);
}
