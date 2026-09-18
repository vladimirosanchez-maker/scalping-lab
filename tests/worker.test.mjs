import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { responseHeaders } from '../worker/index.js';
const env = { ALLOWED_ORIGIN: 'https://example.github.io' };

test('Hosted API allows only the configured site for CORS', () => {
  assert.equal(responseHeaders(env.ALLOWED_ORIGIN, env.ALLOWED_ORIGIN).get('access-control-allow-origin'), env.ALLOWED_ORIGIN);
  assert.equal(responseHeaders('https://other.example', env.ALLOWED_ORIGIN).get('access-control-allow-origin'), null);
});
test('Hosted API is read-only and cannot proxy arbitrary paths', async () => {
  const post = await worker.fetch(new Request('https://api.example/api/market', { method: 'POST' }), env, {});
  assert.equal(post.status, 405);
  const arbitrary = await worker.fetch(new Request('https://api.example/private-url'), env, {});
  assert.equal(arbitrary.status, 404);
  const forbidden = await worker.fetch(new Request('https://api.example/api/market', { headers: { Origin: 'https://other.example' } }), env, {});
  assert.equal(forbidden.status, 403);
});
test('Hosted API health and CORS preflight work without market access', async () => {
  const health = await worker.fetch(new Request('https://api.example/health'), env, {});
  assert.equal(health.status, 200); assert.equal((await health.json()).ok, true);
  const preflight = await worker.fetch(new Request('https://api.example/api/market', { method: 'OPTIONS', headers: { Origin: env.ALLOWED_ORIGIN } }), env, {});
  assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('access-control-allow-methods'), 'GET, OPTIONS');
});
