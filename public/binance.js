import { FRAMES } from './timeframes.js';
import { normalizeCandles } from './market-schema.js';
// Public Binance USD-M perpetual market data; no account credentials.
const decimals = value => String(value).replace(/0+$/, '').split('.')[1]?.length ?? 0;
export function contractsFromExchangeInfo(info) {
  return (info.symbols ?? []).filter(s => ['BTCUSDT', 'ETHUSDT'].includes(s.symbol) && s.contractType === 'PERPETUAL' && s.status === 'TRADING').map(s => {
    const filter = name => s.filters.find(f => f.filterType === name);
    const lot = filter('LOT_SIZE'), price = filter('PRICE_FILTER'), minimum = filter('MIN_NOTIONAL');
    if (!lot || !price || !(Number(lot.stepSize) > 0) || !(Number(price.tickSize) > 0)) throw new Error('Especificaciones de Binance incompletas');
    return { symbol: s.symbol.replace('USDT', '-USDT'), quantityPrecision: decimals(lot.stepSize),
      quantityStep: Number(lot.stepSize), pricePrecision: decimals(price.tickSize), priceTick: Number(price.tickSize),
      tradeMinQuantity: Number(lot.minQty), tradeMinUSDT: Number(minimum?.notional ?? 0) };
  });
}
export async function binance(path, params = {}, signal) {
  const url = new URL(path, 'https://fapi.binance.com');
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, key === 'symbol' ? String(value).replace('-', '') : String(value));
  const response = await fetch(url, { signal: signal ?? AbortSignal.timeout(12000) });
  if (!response.ok) {
    const error = new Error(`Binance respondió HTTP ${response.status}`);
    if ([418, 429].includes(response.status)) {
      const delay = Number(response.headers.get('Retry-After')) || 60;
      error.retryAt = Date.now() + Math.max(1, delay) * 1000;
    }
    throw error;
  }
  const result = await response.json();
  if (result.code < 0) throw new Error(`Binance ${result.code}: ${result.msg}`);
  if (path.endsWith('/exchangeInfo')) return contractsFromExchangeInfo(result);
  if (path.endsWith('/klines')) {
    if (!Array.isArray(result)) throw new Error('Historial de Binance inválido');
    return result.map(row => ({time: row[0], open: row[1], high: row[2], low: row[3], close: row[4], volume: row[5]}));
  }
  return result;
}


let contractCache = null;
export async function fetchBinanceMarket(symbol, signal, selected = '1h') {
  if (!['BTC-USDT', 'ETH-USDT'].includes(symbol)) throw new Error('Mercado no permitido');
  if (!Object.hasOwn(FRAMES, selected)) throw new Error('Temporalidad no permitida');
  const frames = [...new Set(['1h', '15m', '5m', selected])];
  const results = await Promise.allSettled([
    ...frames.map(interval => binance('/fapi/v1/klines', { symbol, interval, limit: 600 }, signal)),
    binance('/fapi/v1/premiumIndex', { symbol }, signal),
    contractCache && Date.now() - contractCache.time < 3600000 ? Promise.resolve(contractCache.data) : binance('/fapi/v1/exchangeInfo', {}, signal),
  ]);
  const candles = {};
  frames.forEach((frame, i) => {
    if (results[i].status !== 'fulfilled') throw results[i].reason;
    candles[frame] = normalizeCandles(results[i].value, ['1h','15m','5m'].includes(frame) ? 250 : 1);
  });
  if (results[frames.length + 1].status === 'fulfilled') contractCache = {time:Date.now(), data:results[frames.length + 1].value};
  return {symbol, source:`Binance · ${symbol} Perpetual`, fetchedAt:Date.now(), candles,
    premium:results[frames.length].status === 'fulfilled' ? results[frames.length].value : null,
    contract: contractCache?.data.find(c => c.symbol === symbol) ?? null};
}
