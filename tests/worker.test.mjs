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

test('Only BTC and ETH are accepted; their cached candles and contracts stay separate', async t => {
  const invalid = await worker.fetch(new Request('https://api.example/api/market?symbol=DOGE-USDT'), env, {});
  assert.equal(invalid.status, 400);
  const previousCache = globalThis.caches;
  const store = new Map();
  globalThis.caches = { default: {
    match: async request => store.get(request.url)?.clone(),
    put: async (request, response) => { store.set(request.url, response.clone()); },
  } };
  t.after(() => { if (previousCache === undefined) delete globalThis.caches; else globalThis.caches = previousCache; });
  const requests = [];
  t.mock.method(globalThis, 'fetch', async input => {
    const url = new URL(input), symbol = url.searchParams.get('symbol');
    requests.push(symbol);
    const price = symbol === 'ETH-USDT' ? 3000 : 77000;
    const data = url.pathname.endsWith('klines') ? Array.from({ length: 300 }, (_, i) => ({ time: i * 300000, open: price, close: price, high: price + 1, low: price - 1, volume: 1 })) : url.pathname.endsWith('contracts') ? [{ symbol, quantityPrecision: symbol === 'ETH-USDT' ? 2 : 4 }] : { symbol, markPrice: price };
    return Response.json({ code: 0, data });
  });
  const pending = [], ctx = { waitUntil: promise => pending.push(promise) };
  for (const symbol of ['BTC-USDT', 'ETH-USDT', 'BTC-USDT', 'ETH-USDT']) {
    const result = await worker.fetch(new Request(`https://api.example/api/market?symbol=${symbol}`), env, ctx);
    const payload = await result.json();
    assert.equal(payload.symbol, symbol); assert.equal(payload.contract.symbol, symbol);
    assert.equal(payload.candles['5m'][0].close, symbol === 'ETH-USDT' ? 3000 : 77000);
    await Promise.all(pending);
  }
  assert.equal(requests.filter(s => s === 'BTC-USDT').length, 5);
  assert.equal(requests.filter(s => s === 'ETH-USDT').length, 5);
});


test('Upstream rate limits are cached and respected across markets', async t => {
  const previous = globalThis.caches, store = new Map(), pending = [];
  globalThis.caches = { default: {
    match: async request => store.get(request.url)?.clone(),
    put: async (request, response) => { store.set(request.url, response.clone()); },
  } };
  t.after(() => { if (previous === undefined) delete globalThis.caches; else globalThis.caches = previous; });
  const retryAt = Date.now() + 900000;
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return Response.json({code:109429, msg:`can retry after time: ${retryAt}`}); });
  const ctx = { waitUntil: promise => pending.push(promise) };
  const first = await worker.fetch(new Request('https://api.example/api/market?symbol=BTC-USDT'), env, ctx);
  assert.equal(first.status, 503); assert.equal((await first.json()).retryAt, retryAt);
  await Promise.all(pending);
  const count = calls;
  const second = await worker.fetch(new Request('https://api.example/api/market?symbol=ETH-USDT'), env, ctx);
  assert.equal(second.status, 503); assert.ok(Number(second.headers.get('Retry-After')) > 0);
  assert.equal(calls, count, 'Do not bombard BingX while a restriction is active');
});
