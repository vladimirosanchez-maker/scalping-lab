import { normalizeCandles } from '../public/market-schema.js';

const frames = ['1h', '15m', '5m'];

async function bingx(path, params) {
  const url = new URL(path, 'https://open-api.bingx.com');
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`BingX respondió HTTP ${response.status}`);
  const result = await response.json();
  if (result.code !== 0) throw new Error(`BingX ${result.code}: ${result.msg}`);
  return result.data;
}

export function responseHeaders(origin, allowedOrigin) {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Vary': 'Origin',
  });
  if (origin === allowedOrigin) headers.set('Access-Control-Allow-Origin', allowedOrigin);
  return headers;
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin');
    const headers = responseHeaders(origin, env.ALLOWED_ORIGIN);
    if (origin && origin !== env.ALLOWED_ORIGIN) return Response.json({ error: 'Origen no permitido' }, { status: 403, headers });
    const url = new URL(request.url);
    if (!['/api/market', '/health'].includes(url.pathname)) return Response.json({ error: 'No encontrado' }, { status: 404, headers });
    if (request.method === 'OPTIONS') {
      headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
      headers.set('Access-Control-Max-Age', '86400');
      return new Response(null, { status: 204, headers });
    }
    if (request.method !== 'GET') return Response.json({ error: 'Solo lectura' }, { status: 405, headers });
    if (url.pathname === '/health') return Response.json({ ok: true, service: 'scalping-btc-api' }, { headers });
    try {
      const cache = caches.default;
      const cacheKey = new Request(new URL('/api/market', url.origin));
      const saved = await cache.match(cacheKey);
      if (saved) return new Response(saved.body, { headers });
      const contractKey = new Request(new URL('/cache/btc-contract', url.origin));
      const cachedContract = await cache.match(contractKey);
      const results = await Promise.allSettled([
        ...frames.map(interval => bingx('/openApi/swap/v3/quote/klines', { symbol: 'BTC-USDT', interval, limit: 600 })),
        bingx('/openApi/swap/v2/quote/premiumIndex', { symbol: 'BTC-USDT' }),
        cachedContract ? cachedContract.json() : bingx('/openApi/swap/v2/quote/contracts', { symbol: 'BTC-USDT' }),
      ]);
      const candles = {};
      frames.forEach((frame, i) => {
        if (results[i].status !== 'fulfilled') throw results[i].reason;
        candles[frame] = normalizeCandles(results[i].value);
      });
      const contracts = results[4].status === 'fulfilled' ? results[4].value : null;
      if (!cachedContract && contracts) ctx.waitUntil(cache.put(contractKey, Response.json(contracts, { headers: { 'Cache-Control': 'public, max-age=3600' } })).catch(error => console.error(JSON.stringify({ event: 'contract_cache_failed', message: error.message }))));
      const payload = {
        source: 'BingX · BTC-USDT Perpetual', fetchedAt: Date.now(), candles,
        premium: results[3].status === 'fulfilled' ? results[3].value : null,
        contract: contracts?.find(c => c.symbol === 'BTC-USDT') ?? null,
      };
      ctx.waitUntil(cache.put(cacheKey, Response.json(payload, { headers: { 'Cache-Control': 'public, max-age=2' } })).catch(error => console.error(JSON.stringify({ event: 'market_cache_failed', message: error.message }))));
      return Response.json(payload, { headers });
    } catch (error) {
      console.error(JSON.stringify({ event: 'market_fetch_failed', message: error.message }));
      return Response.json({ error: `No se pudo actualizar el mercado. ${error.message}` }, { status: 502, headers });
    }
  },
};
