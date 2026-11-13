// The itch.io release's one rule about other hosts (validate.mjs): the only
// addresses its page, stylesheet and scripts may name are the links the
// player opens (openedLinks: the credits' links to the sprite sources and
// the Releases page the native apps' update button opens, never loaded)
// and, for Online Play, the room server, the single host in
// CONFIG.online.serverUrl
// (js/config.js), with its WebSocket form (ws: for http, wss: for https).
// Nothing else: no script, style, image or service from anywhere else, and
// no other path to the server's own host than through that address. With
// serverUrl empty, as before there is a server, nothing more is allowed.
//
// Kept apart from validate.mjs (which needs esbuild) so the tests can hold
// the rule without installing anything (tests/online/itch-hosts.test.mjs).

import { RELEASES_URL } from '../../js/core/native-shell.js';

// Any absolute web or WebSocket address in a text.
export const EXTERNAL_URL = /(?:https?|wss?):\/\/[^'"`\s)<>]+/g;

// The links the player opens, in their own browser (never loaded by the
// game): every address in the credits (`creditsText`, js/ui/credits.js) and
// the Releases page (js/core/native-shell.js RELEASES_URL).
export const openedLinks = (creditsText) => new Set([...(creditsText.match(EXTERNAL_URL) ?? []), RELEASES_URL]);

// The origins the room server at `serverUrl` is reached by: its own
// (scheme and host, with any port) and its WebSocket one. None for an empty
// or malformed address, or one that is not http(s).
export function serverOrigins(serverUrl) {
  if (typeof serverUrl !== 'string' || !serverUrl.trim()) return [];
  let url;
  try {
    url = new URL(serverUrl.trim());
  } catch {
    return [];
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return [];
  const ws = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return [url.origin, `${ws}//${url.host}`];
}

// Whether `address` is on one of `origins`: exactly the origin, or a path
// under it (never a longer host that merely starts the same way).
const onOrigin = (address, origins) => origins.some((o) => address === o || address.startsWith(`${o}/`) || address.startsWith(`${o}?`));

// Every address in `text` (from `file`) that is neither one of `approved`
// (openedLinks) nor the room server's: one problem each.
export function hostProblems(text, file, { approved = new Set(), serverUrl = '' } = {}) {
  const origins = serverOrigins(serverUrl);
  const problems = [];
  for (const address of text.match(EXTERNAL_URL) ?? []) {
    if (approved.has(address) || onOrigin(address, origins)) continue;
    problems.push(`${file}: ${address} is another host, neither a link the player opens nor the room server (CONFIG.online.serverUrl)`);
  }
  return problems;
}
