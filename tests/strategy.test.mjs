import test from 'node:test';
import assert from 'node:assert/strict';
import { ema, rsi, dmi, vwap, pivots, closed, structure, analyze, riskPlan, defaults, dailyStats, SECONDS } from '../public/strategy.js';
import { normalizeCandles } from '../server.mjs';

const near = (a, b, epsilon = 1e-8) => assert.ok(Math.abs(a - b) < epsilon, `${a} ≠ ${b}`);
function series(n, start = 0, step = 300) {
  return Array.from({ length: n }, (_, i) => ({ time: start + i * step, open: 100 + i, high: 102 + i, low: 99 + i, close: 101 + i, volume: 10 }));
}
export function fixture(now = Date.now()) {
  const candles = {};
  for (const [frame, seconds] of Object.entries(SECONDS)) {
    const current = Math.floor(now / 1000 / seconds) * seconds;
    candles[frame] = series(600, current - 599 * seconds, seconds).map((b, i) => {
      const close = 77000 + Math.sin(i * 0.35) * 190 + i * 1.2;
      const open = 77000 + Math.sin((i - 1) * 0.35) * 190 + (i - 1) * 1.2;
      return { ...b, open, close, high: Math.max(open, close) + 30, low: Math.min(open, close) - 30 };
    });
  }
  return { fetchedAt: now, candles, premium: { markPrice: '77590', lastFundingRate: '0.0001', nextFundingTime: now + 3600000 }, contract: { quantityPrecision: 4, tradeMinQuantity: 0.0001, tradeMinUSDT: 2 } };
}

test('EMA uses SMA seed and correct exponential recurrence', () => {
  assert.deepEqual(ema([1, 2, 3, 4, 5], 3), [null, null, 2, 3, 4]);
  assert.deepEqual(ema([1], 3), [null]);
});
test('RSI uses Wilder seed and smoothing, including flat/up/down edge cases', () => {
  const prices = [44.34,44.09,44.15,43.61,44.33,44.83,45.10,45.42,45.84,46.08,45.89,46.03,45.61,46.28,46.28,46.00];
  near(rsi(prices)[14], 70.46413502109705);
  near(rsi(prices)[15], 66.24961855355505);
  assert.equal(rsi(Array(30).fill(100)).at(-1), 50);
  assert.equal(rsi(Array.from({ length: 30 }, (_, i) => i)).at(-1), 100);
  assert.equal(rsi(Array.from({ length: 30 }, (_, i) => 100 - i)).at(-1), 0);
});
test('DMI and ADX distinguish force from direction and avoid zero division', () => {
  const result = dmi(series(40));
  near(result.plus[14], 100 / 3); near(result.minus[14], 0);
  assert.equal(result.adx[26], null); near(result.adx[27], 100); near(result.atr[14], 3);
  const down = series(40).map((b, i) => ({ ...b, open: 100 - i, high: 101 - i, low: 98 - i, close: 99 - i }));
  const negative = dmi(down); near(negative.adx.at(-1), 100); assert.ok(negative.minus.at(-1) > negative.plus.at(-1));
  const flat = series(40).map(b => ({ ...b, open: 100, high: 100, low: 100, close: 100 }));
  assert.equal(dmi(flat).adx.at(-1), 0);
});
test('VWAP is volume weighted and resets at midnight UTC', () => {
  const bars = [
    { time: 86100, high: 12, low: 8, close: 10, volume: 2 },
    { time: 86200, high: 24, low: 16, close: 20, volume: 1 },
    { time: 86400, high: 33, low: 27, close: 30, volume: 4 },
  ];
  assert.deepEqual(vwap(bars), [10, 40 / 3, 30]);
});
test('A pivot cannot exist until both right-hand candles have closed', () => {
  const highs = [10, 12, 20, 13, 11, 10, 9];
  const bars = highs.map((high, i) => ({ time: i * 300, high, low: i, open: i + 1, close: i + 2, volume: 1 }));
  assert.equal(pivots(bars.slice(0, 4)).length, 0);
  const swing = pivots(bars.slice(0, 5))[0];
  assert.equal(swing.index, 2); assert.equal(swing.confirmedIndex, 4); assert.equal(swing.confirmedTime, 1200);
  assert.deepEqual(pivots(bars)[0], swing);
});
test('Structure requires both highs and lows to agree', () => {
  const s = [{ kind: 'high', price: 10 }, { kind: 'low', price: 5 }, { kind: 'high', price: 12 }, { kind: 'low', price: 6 }];
  assert.equal(structure(s), 'long'); s[3].price = 4; assert.equal(structure(s), 'neutral'); s[2].price = 9; assert.equal(structure(s), 'short');
});
test('Open higher-timeframe candles are not included at a 5m close', () => {
  assert.equal(closed(series(4, 0, 3600), '1h', 7500).length, 2);
});
test('Risk sizing respects total budget after commissions and adverse slippage', () => {
  for (const direction of ['long', 'short']) {
    const entry = 77590, stop = direction === 'long' ? 77490 : 77690;
    const p = riskPlan({ direction, entry, stop }, defaults);
    assert.ok(!p.error); assert.ok(p.loss <= 30); assert.ok(p.margin <= 3000); near(p.rr, 2, 1e-8);
    assert.ok(p.qty < 15000 / entry); assert.ok(p.costsLoss > 0);
    const pnlIndependent = p.qty * Math.abs(p.tp - entry) - p.costsWin;
    near(pnlIndependent, p.profit);
  }
});
test('The original 100/200 setup fails net 1:2 even with zero slippage', () => {
  const p = riskPlan({ direction: 'short', entry: 77590, stop: 77690, tp: 77390 }, { ...defaults, slipBps: 0 });
  assert.ok(p.rr < 1); assert.equal(p.acceptable, false);
});
test('Funding reserve, margin cap and quantity increments are honored', () => {
  const p = riskPlan({ direction: 'long', entry: 77590, stop: 77400 }, { ...defaults, fundingReserve: 3, marginCap: 100 });
  assert.ok(p.loss <= 30); assert.ok(p.margin <= 100); near(p.rr, 2); near(p.qty * 10000, Math.round(p.qty * 10000));
});
test('Wrong stops, impossible targets and exhausted budget reject a plan', () => {
  assert.ok(riskPlan({ direction: 'long', entry: 100, stop: 101 }).error);
  assert.ok(riskPlan({ direction: 'short', entry: 100, stop: 99 }).error);
  assert.ok(riskPlan({ direction: 'long', entry: 100, stop: 90, tp: 80 }).error);
  assert.ok(riskPlan({ direction: 'long', entry: 100, stop: 90 }, { ...defaults, fundingReserve: 50 }).error);
  assert.ok(riskPlan({ direction: 'long', entry: NaN, stop: 90 }).error);
  for (const leverage of [0, 11, 125, 1.5]) assert.ok(riskPlan({ direction: 'long', entry: 100, stop: 90 }, { ...defaults, leverage }).error);
});

test('Capital, margin and 1X/10X leverage reconcile with both net exit scenarios', () => {
  for (const leverage of [1, 10]) for (const direction of ['long', 'short']) {
    const config = { ...defaults, capital: 1000, marginCap: 100, leverage, feeIn: 0.02, feeOut: 0.05, fundingReserve: 0.5 };
    const p = riskPlan({ direction, entry: 77590, stop: direction === 'long' ? 77490 : 77690 }, config);
    assert.ok(!p.error); assert.equal(p.budget, 5); assert.ok(p.margin <= 100);
    near(p.notional, p.margin * leverage);
    for (const [exit, gross, net] of [[p.stop, -p.qty * 100, -p.loss], [p.tp, p.qty * Math.abs(p.tp - p.entry), p.profit]]) {
      const costs = p.qty * p.entry * config.feeIn / 100 + p.qty * exit * config.feeOut / 100 + p.qty * (p.entry + exit) * config.slipBps / 10000 + config.fundingReserve;
      near(gross - costs, net);
    }
  }
});

test('Explicit margin mode responds to leverage and margin instead of silently fixing risk', () => {
  const input = { direction: 'long', entry: 10000, stop: 9900, tp: 10300, sizingMode: 'margin' };
  const config = { ...defaults, capital: 1000, marginCap: 100, leverage: 1, slipBps: 0 };
  const base = riskPlan(input, config);
  const leveraged = riskPlan(input, { ...config, leverage: 10 });
  near(leveraged.qty, base.qty * 10); near(leveraged.loss, base.loss * 10); near(leveraged.profit, base.profit * 10);
  const larger = riskPlan(input, { ...config, marginCap: 200 });
  near(larger.profit, base.profit * 2); near(larger.loss, base.loss * 2);
  assert.equal(leveraged.withinBudget, false); assert.equal(leveraged.acceptable, false);
  const capped = riskPlan(input, { ...config, capital: 50, marginCap: 100 });
  assert.ok(capped.margin <= 50);
  const riskSized = riskPlan({ ...input, sizingMode: 'risk' }, { ...config, leverage: 10 });
  assert.ok(riskSized.loss <= riskSized.budget); assert.ok(riskSized.qty < leveraged.qty);
});
test('Daily limits use Bogotá midnight and remain blocked after two stops followed by a win', () => {
  const now = Date.parse('2026-09-11T06:00:00Z');
  const trades = [
    { time: Date.parse('2026-09-11T04:59:00Z'), outcome: 'SL', pnl: -10 },
    { time: Date.parse('2026-09-11T05:01:00Z'), outcome: 'SL', pnl: -10 },
    { time: Date.parse('2026-09-11T05:02:00Z'), outcome: 'SL', pnl: -10 },
    { time: Date.parse('2026-09-11T05:03:00Z'), outcome: 'TP', pnl: 20 },
  ];
  assert.deepEqual(dailyStats(trades, now), { count: 3, consecutiveStops: 0, maxStopStreak: 2, pnl: 0 });
});
test('Analysis blocks stale, missing and gapped data; ignores mutations of open candles', () => {
  const now = Math.floor(Date.now() / 3600000) * 3600000 + 12 * 60000;
  const data = fixture(now), first = analyze(data, defaults, now);
  assert.equal(first.healthy, true);
  for (const frame of Object.keys(SECONDS)) data.candles[frame].at(-1).close += 999999;
  const second = analyze(data, defaults, now);
  assert.deepEqual(first.hourly, second.hourly); assert.deepEqual(first.setup, second.setup); assert.deepEqual(first.trigger, second.trigger);
  data.fetchedAt -= 36000; assert.equal(analyze(data, defaults, now).healthy, false);
  data.fetchedAt = now; data.candles['5m'].splice(-4, 1); assert.equal(analyze(data, defaults, now).healthy, false);
  const partial = fixture(now); partial.candles['1h'] = partial.candles['1h'].slice(-200); assert.equal(analyze(partial, defaults, now).healthy, false);
});
test('API normalization sorts bars and rejects malformed OHLC', () => {
  const rows = series(300).map(c => ({ ...c, time: c.time * 1000 }));
  const sorted = normalizeCandles([...rows].reverse()); assert.equal(sorted[0].time, 0);
  rows[5].high = 1; assert.throws(() => normalizeCandles(rows), /inválidas/);
});

test('A closed breakout with aligned higher frames produces LONG and mirrored SHORT; open breakout cannot', () => {
  const now = Date.parse('2026-09-12T01:12:00Z');
  function wave(frame, phase) {
    const seconds = SECONDS[frame], current = Math.floor(now / 1000 / seconds) * seconds;
    return Array.from({ length: 600 }, (_, i) => {
      const price = j => 70000 + j * 5 + 100 * Math.sin(j * 0.35 + phase);
      const open = price(i - 1), close = price(i);
      return { time: current - (599 - i) * seconds, open, close,
        high: Math.max(open, close) + 10 + (i % 2) * 0.01,
        low: Math.min(open, close) - 10 - (i % 2) * 0.01, volume: 10 };
    });
  }
  const candles = { '1h': wave('1h', 0), '15m': wave('15m', 0), '5m': wave('5m', 3.5) };
  const before = analyze({ candles, fetchedAt: now }, defaults, now);
  assert.equal(before.signal, false);
  candles['5m'].at(-1).close += 200; candles['5m'].at(-1).high += 200;
  assert.equal(analyze({ candles, fetchedAt: now }, defaults, now).signal, false);
  const breakout = candles['5m'].at(-2); breakout.close += 140; breakout.high = Math.max(breakout.high, breakout.close + 5);
  const long = analyze({ candles, fetchedAt: now }, defaults, now);
  assert.equal(long.direction, 'long'); assert.equal(long.signal, true); assert.ok(long.stop < long.entry);
  const mirrored = Object.fromEntries(Object.entries(candles).map(([frame, bars]) => [frame, bars.map(b => ({ ...b,
    open: 150000 - b.open, close: 150000 - b.close, high: 150000 - b.low, low: 150000 - b.high }))]));
  const short = analyze({ candles: mirrored, fetchedAt: now }, defaults, now);
  assert.equal(short.direction, 'short'); assert.equal(short.signal, true); assert.ok(short.stop > short.entry);
  const stale = analyze({ candles, fetchedAt: now - 36000 }, defaults, now);
  assert.equal(stale.signal, false);
});
