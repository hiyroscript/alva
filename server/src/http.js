// HTTP plumbing shared by the Worker and its Durable Objects: JSON replies,
// error replies with the codes the game translates, reading a JSON body
// with a size limit, and which origins may call the server (CORS, and the
// Origin of a WebSocket upgrade).

// The error codes the game knows (js/online/server-client.js), with their
// HTTP statuses.
export const ERRORS = Object.freeze({
  bad_request: 400,
  invalid_name: 400,
  invalid_room_name: 400,
  invalid_mode: 400,
  invalid_visibility: 400,
  invalid_code: 400,
  forbidden: 403,
  origin: 403,
  room_not_found: 404,
  not_found: 404,
  room_full: 409,
  version_mismatch: 409,
  too_large: 413,
  rate_limited: 429,
  server_error: 500,
  full: 503,
  relay_unavailable: 503,
});

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

export const error = (code, headers) => json({ error: code }, ERRORS[code] ?? 400, headers);

// The request's JSON body (an object), or null when it is missing, too
// large or not an object.
export async function readJson(request, limit = 2048) {
  const text = await request.text();
  if (!text || text.length > limit) return null;
  try {
    const value = JSON.parse(text);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

// The allowed origins from the ALLOWED_ORIGINS variable (wrangler.toml): a
// comma-separated list, each an exact origin or a pattern with * standing
// for one or more host labels (https://*.itch.zone) or a port
// (http://localhost:*).
export function parseOrigins(list) {
  return String(list ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((pattern) => {
      // The two wildcards are marked first, everything else escaped, then
      // the marks become what they stand for.
      const marked = pattern.toLowerCase().replace('://*.', '://\u0001.').replace(/:\*$/, '\u0002');
      const source = marked
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .replace('\u0001', '(?:[a-z0-9-]+\\.)*[a-z0-9-]+')
        .replace('\u0002', '(?::\\d{1,5})?');
      return new RegExp(`^${source}$`, 'i');
    });
}

// Whether `origin` (an Origin header) is one of `allowed` (parseOrigins).
export function originAllowed(origin, allowed) {
  if (typeof origin !== 'string' || !origin || origin === 'null') return false;
  return allowed.some((re) => re.test(origin));
}

// The CORS headers for a reply to `origin` (already allowed).
export function corsHeaders(origin) {
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '600',
    vary: 'Origin',
  };
}

// `response` with the CORS headers for `origin` added.
export function withCors(response, origin) {
  if (!origin || response.status === 101) return response;
  const out = new Response(response.body, response);
  for (const [k, v] of Object.entries(corsHeaders(origin))) out.headers.set(k, v);
  return out;
}

// Today in UTC as YYYY-MM-DD: the free plan's day, which starts at 00:00 UTC.
export const utcDay = (ms) => new Date(ms).toISOString().slice(0, 10);

// A number variable from wrangler.toml, or `fallback`.
export function numberVar(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
