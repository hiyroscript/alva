// What keeps every player's network address to themselves
// (docs/development/online-server.md, "Privacy").
//
// The two browsers of a match never connect to each other: the match goes
// through its Room (server/src/room.js), so neither ever learns the other's
// IP address, and nothing the server sends a player names one. The server
// itself keeps no address either: the Lobby's per-minute limits count a
// salted hash of the caller's address (callerKey, below), in memory only,
// and Cloudflare's per-request logs, which would hold callers' addresses,
// are off (wrangler.toml).

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
