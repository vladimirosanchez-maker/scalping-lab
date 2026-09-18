import { normalizeCandles } from './public/market-schema.js';
export { normalizeCandles } from './public/market-schema.js';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';

const root = fileURLToPath(new URL('.', import.meta.url));
const publicRoot = resolve(root, 'public');
const port = Number(process.env.PORT || 4173);
const frames = ['1h', '15m', '5m'];
let cache, pending, contractCache;

async function bingx(path, params = {}) {
  const url = new URL(path, 'https://open-api.bingx.com');
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`BingX respondió HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.code !== 0) throw new Error(`BingX ${payload.code}: ${payload.msg}`);
  return payload.data;
}


async function snapshot() {
  if (cache && Date.now() - cache.fetchedAt < 2000) return cache;
  if (pending) return pending;
  pending = (async () => {
    const results = await Promise.allSettled([
      ...frames.map(interval => bingx('/openApi/swap/v3/quote/klines', { symbol: 'BTC-USDT', interval, limit: 600 })),
      bingx('/openApi/swap/v2/quote/premiumIndex', { symbol: 'BTC-USDT' }),
      contractCache ? Promise.resolve(contractCache) : bingx('/openApi/swap/v2/quote/contracts', { symbol: 'BTC-USDT' }),
    ]);
    const candles = {};
    frames.forEach((frame, i) => {
      if (results[i].status !== 'fulfilled') throw results[i].reason;
      candles[frame] = normalizeCandles(results[i].value);
    });
    if (results[4].status === 'fulfilled') contractCache = results[4].value;
    cache = {
      source: 'BingX · BTC-USDT Perpetual', fetchedAt: Date.now(), candles,
      premium: results[3].status === 'fulfilled' ? results[3].value : null,
      contract: contractCache?.find(c => c.symbol === 'BTC-USDT') || null,
    };
    return cache;
  })();
  try { return await pending; } finally { pending = null; }
}

const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.md': 'text/plain; charset=utf-8' };
export const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'");
  if (req.method !== 'GET') { res.writeHead(405); return res.end('Solo lectura'); }
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/market') {
      try {
        const data = await snapshot();
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify(data));
      } catch (error) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: `No se pudo actualizar el mercado. ${error.message}` }));
      }
    }
    const aliases = {
      '/vendor/charts.js': resolve(root, 'node_modules/lightweight-charts/dist/lightweight-charts.standalone.production.mjs'),
      '/estrategia-original.md': resolve(root, 'scalpingcripto.MD'),
      '/NOTICE': resolve(root, 'NOTICE'),
    };
    const file = aliases[url.pathname] || resolve(publicRoot, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!aliases[url.pathname] && !file.startsWith(publicRoot + sep)) { res.writeHead(403); return res.end(); }
    const content = await readFile(file);
    res.setHeader('Content-Type', types[extname(file)] || 'text/plain; charset=utf-8');
    res.end(content);
  } catch { res.writeHead(404); res.end('No encontrado'); }
});

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  server.listen(port, '127.0.0.1', () => console.log(`Scalping Lab disponible en http://127.0.0.1:${port}`));
}
