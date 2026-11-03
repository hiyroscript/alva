// The pages.dev gateway (a Cloudflare Pages project in advanced mode; its
// configuration and the reason it exists: ../wrangler.toml). Every request
// goes to the alva-rooms Worker unchanged, over the ROOMS service binding,
// WebSocket upgrades included. So the Worker answers exactly as it does at
// its own address: the same routes, the same allowed origins and CORS
// headers, the same limits (it reads the caller's address from
// cf-connecting-ip, which passes through).
//
// If the binding is missing or the Worker cannot be reached, the answer is
// readable from any page and says so in the shapes the game reads:
// `error: 'server_error'` for a request, and `ok: false` for /health, which
// the game shows as "the room server answers, but its rooms are not
// working right now".

export default {
  async fetch(request, env) {
    if (!env?.ROOMS) {
      console.error('[alva-online] the ROOMS service binding is missing: see server/gateway/wrangler.toml');
      return unavailable();
    }
    try {
      return await env.ROOMS.fetch(request);
    } catch (err) {
      console.error(`[alva-online] ${request.method} ${new URL(request.url).pathname}: the alva-rooms Worker did not answer`, err?.stack ?? err);
      return unavailable();
    }
  },
};

function unavailable() {
  return new Response(JSON.stringify({ ok: false, service: 'alva-online', error: 'server_error' }), {
    status: 502,
    headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
  });
}
