// Native shells have stable local origins. Keep them in sync with
// server/wrangler.toml so online multiplayer works in installed apps.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseOrigins, originAllowed } from '../../server/src/http.js';

const config = readFileSync(new URL('../../server/wrangler.toml', import.meta.url), 'utf8');
const line = config.match(/^ALLOWED_ORIGINS\s*=\s*"([^"]+)"/m)?.[1] ?? '';
const allowed = parseOrigins(line);

test('native desktop and mobile app origins are accepted by the room server', () => {
  for (const origin of ['alva://app', 'https://localhost', 'capacitor://localhost']) {
    assert.equal(originAllowed(origin, allowed), true, origin);
  }
});

test('unrelated custom origins remain refused', () => {
  for (const origin of ['alva://other', 'https://evil.example', 'capacitor://evil.example', 'null']) {
    assert.equal(originAllowed(origin, allowed), false, origin);
  }
});
