export function normalizeCandles(rows) {
  if (!Array.isArray(rows) || rows.length < 250) throw new Error('Historial de velas insuficiente');
  const candles = rows.map(row => ({
    time: Number(row.time) / 1000, open: Number(row.open), high: Number(row.high),
    low: Number(row.low), close: Number(row.close), volume: Number(row.volume),
  })).sort((a, b) => a.time - b.time);
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    if (!Object.values(c).every(Number.isFinite) || !Number.isInteger(c.time) || c.low <= 0 || c.volume < 0 ||
        c.high < Math.max(c.open, c.close) || c.low > Math.min(c.open, c.close) ||
        (i && candles[i - 1].time >= c.time)) throw new Error('BingX devolvió velas inválidas');
  }
  return candles;
}

