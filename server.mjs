import { fetchBinanceMarket } from './public/binance.js';
import { normalizeCandles } from './public/market-schema.js';
import { validMarket } from './public/markets.js';
export { normalizeCandles } from './public/market-schema.js';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';

const root = fileURLToPath(new URL('.', import.meta.url));
const publicRoot = resolve(root, 'public');
const port = Number(process.env.PORT || 4173);
const frames = ['1h', '15m', '5m'];
const marketStates = new Map();



async function snapshot(symbol = 'BTC-USDT', frame = '1h') {
  const key = `${symbol}:${frame}`, state = marketStates.get(key) ?? {};
  marketStates.set(key,state);
  if(state.cache && Date.now()-state.cache.fetchedAt<2000) return state.cache;
  if(state.pending) return state.pending;
  state.pending = fetchBinanceMarket(symbol, undefined, frame).then(data => state.cache=data);
  try { return await state.pending; } finally {state.pending=null;}
}

const types = { '.png': 'image/png', '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.md': 'text/plain; charset=utf-8' };
export const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'");
  if (req.method !== 'GET') { res.writeHead(405); return res.end('Solo lectura'); }
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/market') {
      const symbol = url.searchParams.get('symbol') ?? 'BTC-USDT';
      if (!validMarket(symbol)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Mercado no permitido. Selecciona BTC-USDT o ETH-USDT.' }));
      }
      try {
        const data = await snapshot(symbol, url.searchParams.get('frame') ?? '1h');
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
  server.listen(port, '127.0.0.1', () => console.log(`Scalping Cripto disponible en http://127.0.0.1:${port}`));
}
