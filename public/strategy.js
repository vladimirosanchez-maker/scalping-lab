export const SECONDS = { '1h': 3600, '15m': 900, '5m': 300 };
export const defaults = { capital: 6000, riskPct: 0.5, leverage: 5, marginCap: 3000,
  feeIn: 0.05, feeOut: 0.05, slipBps: 2, fundingReserve: 0, minRR: 2, adxMin: 20,
  stopBufferBps: 2, maxTrades: 3, maxStops: 2 };
const last = a => a.at(-1);
const finite = Number.isFinite;

export function ema(values, period) {
  const out = Array(values.length).fill(null);
  if (values.length < period) return out;
  let value = values.slice(0, period).reduce((s, x) => s + x, 0) / period;
  out[period - 1] = value;
  const alpha = 2 / (period + 1);
  for (let i = period; i < values.length; i++) { value += alpha * (values[i] - value); out[i] = value; }
  return out;
}

export function rsi(values, period = 14) {
  const out = Array(values.length).fill(null);
  if (values.length <= period) return out;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) { const d = values[i] - values[i - 1]; gain += Math.max(0, d); loss += Math.max(0, -d); }
  gain /= period; loss /= period;
  const value = () => gain === 0 && loss === 0 ? 50 : loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  out[period] = value();
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    gain = (gain * (period - 1) + Math.max(0, d)) / period;
    loss = (loss * (period - 1) + Math.max(0, -d)) / period;
    out[i] = value();
  }
  return out;
}

export function dmi(candles, period = 14) {
  const n = candles.length;
  const adx = Array(n).fill(null), plus = [...adx], minus = [...adx], atr = [...adx], dx = [...adx];
  let tr = 0, upSum = 0, downSum = 0;
  for (let i = 1; i < n; i++) {
    const c = candles[i], p = candles[i - 1];
    const range = Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
    const up = c.high - p.high, down = p.low - c.low;
    const pdm = up > down && up > 0 ? up : 0, mdm = down > up && down > 0 ? down : 0;
    if (i <= period) { tr += range; upSum += pdm; downSum += mdm; }
    else { tr = tr - tr / period + range; upSum = upSum - upSum / period + pdm; downSum = downSum - downSum / period + mdm; }
    if (i >= period) {
      atr[i] = tr / period;
      plus[i] = tr ? 100 * upSum / tr : 0; minus[i] = tr ? 100 * downSum / tr : 0;
      const total = plus[i] + minus[i];
      dx[i] = total ? 100 * Math.abs(plus[i] - minus[i]) / total : 0;
      if (i === period * 2 - 1) adx[i] = dx.slice(period, i + 1).reduce((a, b) => a + b, 0) / period;
      else if (i >= period * 2) adx[i] = (adx[i - 1] * (period - 1) + dx[i]) / period;
    }
  }
  return { adx, plus, minus, atr };
}

export function vwap(candles) {
  let day = null, pv = 0, volume = 0;
  return candles.map(c => {
    const key = Math.floor(c.time / 86400);
    if (key !== day) { day = key; pv = 0; volume = 0; }
    pv += (c.high + c.low + c.close) / 3 * c.volume; volume += c.volume;
    return volume ? pv / volume : null;
  });
}

export function indicators(candles) {
  const values = candles.map(c => c.close);
  return { ema20: ema(values, 20), ema55: ema(values, 55), ema200: ema(values, 200),
    vwap: vwap(candles), rsi: rsi(values), ...dmi(candles) };
}

// A swing is usable only after two complete candles to its right.
// Markers are placed at confirmation, never backdated as an entry signal.
export function pivots(candles, span = 2) {
  const result = [];
  for (let i = span; i < candles.length - span; i++) {
    const neighbors = candles.slice(i - span, i + span + 1).filter((_, j) => j !== span);
    const high = neighbors.every(c => c.high < candles[i].high);
    const low = neighbors.every(c => c.low > candles[i].low);
    if (high === low) continue; // Ambiguous outside bars are not swings.
    const kind = high ? 'high' : 'low';
    const price = candles[i][kind];
    const previous = result.filter(p => p.kind === kind).at(-1);
    const label = !previous ? (high ? 'H' : 'L') : high ? (price > previous.price ? 'HH' : price < previous.price ? 'LH' : 'EH') : (price > previous.price ? 'HL' : price < previous.price ? 'LL' : 'EL');
    result.push({ index: i, time: candles[i].time, confirmedIndex: i + span,
      confirmedTime: candles[i + span].time, kind, price, label });
  }
  return result;
}

export function structure(swings) {
  const highs = swings.filter(p => p.kind === 'high').slice(-2);
  const lows = swings.filter(p => p.kind === 'low').slice(-2);
  if (highs.length < 2 || lows.length < 2) return 'neutral';
  if (highs[1].price > highs[0].price && lows[1].price > lows[0].price) return 'long';
  if (highs[1].price < highs[0].price && lows[1].price < lows[0].price) return 'short';
  return 'neutral';
}

export function closed(candles, frame, asOf) { return candles.filter(c => c.time + SECONDS[frame] <= asOf); }
function check(label, pass, detail) { return { label, pass: Boolean(pass), detail }; }
const f = v => finite(v) ? v.toFixed(2) : '—';

export function analyze(snapshot, config = defaults, now = Date.now()) {
  const asOf = Math.floor(now / 1000 / 300) * 300;
  const data = {};
  let healthy = now - snapshot.fetchedAt < 35000 && now >= snapshot.fetchedAt - 5000;
  for (const frame of Object.keys(SECONDS)) {
    const bars = closed(snapshot.candles[frame], frame, asOf);
    const ind = indicators(bars), swings = pivots(bars);
    const values = Object.fromEntries(Object.entries(ind).map(([key, a]) => [key, last(a)]));
    const fresh = bars.length >= 250 && last(bars).time + SECONDS[frame] === Math.floor(asOf / SECONDS[frame]) * SECONDS[frame];
    const contiguous = bars.slice(-220).every((c, i, arr) => i === 0 || c.time - arr[i - 1].time === SECONDS[frame]);
    healthy &&= fresh && contiguous && Object.values(values).every(finite);
    data[frame] = { bars, ind, swings, values, structure: structure(swings), fresh: fresh && contiguous };
  }
  const h = data['1h'], m = data['15m'], s = data['5m'];
  const hv = h.values, hc = last(h.bars), mv = m.values, mc = last(m.bars), sv = s.values, sc = last(s.bars);
  if (!hc || !mc || !sc) return { healthy: false, data, direction: 'neutral', hourly: [], setup: [], trigger: [], status: 'Datos insuficientes', asOf };
  const hourlyFor = dir => {
    const long = dir === 'long';
    return [
      check('Estructura de 1H', h.structure === dir, long ? 'Máximos y mínimos ascendentes (HH + HL)' : 'Máximos y mínimos descendentes (LL + LH)'),
      check('Precio y EMA 20 / 55', long ? hc.close > hv.ema20 && hv.ema20 > hv.ema55 : hc.close < hv.ema20 && hv.ema20 < hv.ema55, long ? 'Precio > EMA 20 > EMA 55' : 'Precio < EMA 20 < EMA 55'),
      check('EMA 200', long ? hc.close > hv.ema200 : hc.close < hv.ema200, `Precio ${long ? 'sobre' : 'bajo'} EMA 200 (${f(hv.ema200)})`),
      check('RSI 14', long ? hv.rsi > 50 : hv.rsi < 50, `RSI ${f(hv.rsi)} · se pide ${long ? '> 50' : '< 50'}`),
      check('Dirección DI', long ? hv.plus > hv.minus : hv.minus > hv.plus, `+DI ${f(hv.plus)} / −DI ${f(hv.minus)}`),
      check('Fuerza ADX', hv.adx > config.adxMin && hv.adx > h.ind.adx.at(-2), `ADX ${f(hv.adx)} · debe superar ${config.adxMin} y subir`),
    ];
  };
  const hl = hourlyFor('long'), hs = hourlyFor('short');
  const direction = hl.every(c => c.pass) ? 'long' : hs.every(c => c.pass) ? 'short' : 'neutral';
  const closest = direction === 'neutral' ? (hl.filter(c => c.pass).length >= hs.filter(c => c.pass).length ? 'long' : 'short') : direction;
  const long = closest === 'long';
  const pullback = last(m.swings);
  const recentPullback = pullback && pullback.kind === (long ? 'low' : 'high') && m.bars.length - 1 - pullback.index <= 12;
  const setup = [
    check('Dirección permitida en 1H', direction !== 'neutral', 'Las seis condiciones de 1H deben cumplirse'),
    check('Estructura de 15m', m.structure === closest, long ? 'HH + HL confirmados' : 'LL + LH confirmados'),
    check('Retroceso reciente', recentPullback, 'Último giro confirmado en la dirección del retroceso, en las últimas 12 velas'),
    check('VWAP de sesión', long ? mc.close > mv.vwap : mc.close < mv.vwap, `${long ? 'Encima' : 'Debajo'} del VWAP (${f(mv.vwap)})`),
    check('EMA 20 / 55', long ? mc.close > mv.ema20 && mc.close > mv.ema55 : mc.close < mv.ema20 && mc.close < mv.ema55, 'Precio del lado de la tendencia en ambas EMA'),
    check('RSI y DI', long ? mv.rsi > 50 && mv.plus > mv.minus : mv.rsi < 50 && mv.minus > mv.plus, `RSI ${f(mv.rsi)} y DI alineado`),
  ];
  const swing = last(s.swings.filter(p => p.kind === (long ? 'low' : 'high')));
  const level = swing ? last(s.swings.filter(p => p.kind === (long ? 'high' : 'low') && p.index < swing.index)) : null;
  const recentSwing = swing && s.bars.length - 1 - swing.index <= 12;
  const prev = s.bars.at(-2);
  const broke = recentSwing && level && prev && (long ? prev.close <= level.price && sc.close > level.price : prev.close >= level.price && sc.close < level.price);
  const rejection = swing && s.bars.some((bar, i) => {
    if (i < Math.max(swing.index, s.bars.length - 6)) return false;
    const tolerance = (s.ind.atr[i] || 0) * 0.15;
    return ['ema20', 'ema55', 'vwap'].some(key => {
      const ref = s.ind[key][i];
      return finite(ref) && (long ? bar.low <= ref + tolerance && bar.close > ref && bar.close > bar.open : bar.high >= ref - tolerance && bar.close < ref && bar.close < bar.open);
    });
  });
  const momentum = long ? sv.rsi > 50 && s.ind.rsi.slice(-4, -1).some(v => finite(v) && v <= 50) : sv.rsi < s.ind.rsi.at(-2) && s.ind.rsi.slice(-4, -1).some(v => v >= 50 && v <= 60);
  const adxTurn = sv.adx > s.ind.adx.at(-2) && (s.ind.adx.at(-2) <= s.ind.adx.at(-3) || s.ind.adx.at(-3) <= s.ind.adx.at(-4));
  const confirmations = [
    check('Rechazo de EMA / VWAP', rejection, 'Toque y cierre a favor en las últimas 6 velas; tolerancia 0,15 ATR'),
    check('DI a favor', long ? sv.plus > sv.minus : sv.minus > sv.plus, `+DI ${f(sv.plus)} / −DI ${f(sv.minus)}`),
    check('ADX recuperándose', adxTurn, `ADX ${f(sv.adx)} · sube después de una pausa reciente`),
    check('RSI confirma el impulso', momentum, long ? 'Recupera 50 desde las últimas 3 velas' : 'Cae tras pasar por 50–60 en las últimas 3 velas'),
  ];
  const trigger = [check('Ruptura con cierre de 5m', broke, level ? `Cruzar ${f(level.price)} con cierre; giro de retroceso de máximo 12 velas` : 'Falta un máximo/mínimo anterior al retroceso'), ...confirmations];
  const prepared = setup.every(c => c.pass);
  const signal = healthy && prepared && broke && confirmations.filter(c => c.pass).length >= 3;
  const rawStop = swing ? swing.price * (1 + (long ? -1 : 1) * config.stopBufferBps / 10000) : null;
  const validStop = rawStop && (long ? rawStop < sc.close : rawStop > sc.close);
  return { healthy, data, asOf, direction, closest, hourly: closest === 'long' ? hl : hs,
    hourlyLong: hl, hourlyShort: hs, setup, trigger, prepared, signal: Boolean(signal),
    level: level?.price, stop: validStop ? rawStop : null, entry: sc.close,
    signalTime: sc.time + 300,
    status: !healthy ? 'Datos sin validar' : signal ? `Señal técnica ${closest.toUpperCase()}` : direction === 'neutral' ? 'NO OPERAR' : prepared ? 'Esperar ruptura de 5m' : `Esperar retroceso ${direction.toUpperCase()}` };
}

export function riskPlan(input, config = defaults, contract = null) {
  const { direction, entry, stop, tp } = input;
  const sizingMode = input.sizingMode ?? 'risk';
  if (!['risk', 'margin'].includes(sizingMode)) return { error: 'Selecciona el modo de cálculo por margen o por riesgo.' };
  const long = direction === 'long';
  if (!['long', 'short'].includes(direction) || ![entry, stop].every(v => finite(v) && v > 0)) return { error: 'Introduce entrada y stop positivos.' };
  const distance = long ? entry - stop : stop - entry;
  if (distance <= 0) return { error: long ? 'El stop LONG debe estar debajo de la entrada.' : 'El stop SHORT debe estar encima de la entrada.' };
  const relevant = ['capital', 'riskPct', 'leverage', 'marginCap', 'feeIn', 'feeOut', 'slipBps', 'fundingReserve', 'minRR'];
  if (!Number.isInteger(config.leverage) || config.leverage < 1 || config.leverage > 10) return { error: 'Selecciona un apalancamiento entero entre 1X y 10X.' };
  if (!relevant.every(k => finite(config[k]) && config[k] >= 0) || config.capital <= 0 || config.riskPct <= 0 || config.riskPct > 100 || config.leverage < 1 || config.marginCap <= 0 || config.minRR <= 0 || config.feeIn >= 100 || config.feeOut >= 100 || config.slipBps >= 10000) return { error: 'Revisa los parámetros de riesgo y costes.' };
  const budget = config.capital * config.riskPct / 100;
  const a = config.feeIn / 100 + config.slipBps / 10000;
  const b = config.feeOut / 100 + config.slipBps / 10000;
  const unitLoss = distance + entry * a + stop * b;
  const precision = Number.isInteger(contract?.quantityPrecision) ? contract.quantityPrecision : 4;
  const step = 10 ** -precision;
  const maxMargin = Math.min(config.marginCap, config.capital);
  const available = budget - config.fundingReserve;
  const marginQty = maxMargin * config.leverage / entry;
  const rawQty = sizingMode === 'margin' ? marginQty : Math.min(available / unitLoss, marginQty);
  const qty = Math.floor((rawQty + 1e-12) / step) * step;
  if (!(qty > 0) || qty < Number(contract?.tradeMinQuantity || step) || qty * entry < Number(contract?.tradeMinUSDT || 0)) return { error: 'El presupuesto no alcanza el tamaño mínimo; revisa riesgo, margen o reserva.' };
  const loss = qty * unitLoss + config.fundingReserve;
  const need = (config.minRR * loss + config.fundingReserve) / qty;
  const target = long ? (need + entry * (1 + a)) / (1 - b) : (entry * (1 - a) - need) / (1 + b);
  const exit = tp === undefined || tp === null || tp === '' ? target : Number(tp);
  if (!finite(exit) || exit <= 0 || (long ? exit <= entry : exit >= entry)) return { error: 'El objetivo debe estar a favor de la operación y ser positivo.' };
  const costsLoss = qty * (entry * a + stop * b) + config.fundingReserve;
  const costsWin = qty * (entry * a + exit * b) + config.fundingReserve;
  const profit = qty * (long ? exit - entry : entry - exit) - costsWin;
  const withinBudget = loss <= budget + 1e-9;
  const meetsRR = profit / loss + 1e-9 >= config.minRR;
  return { qty, entry, stop, tp: exit, target, loss, profit, rr: profit / loss, budget, sizingMode, withinBudget, meetsRR,
    notional: qty * entry, margin: qty * entry / config.leverage, costsLoss, costsWin,
    acceptable: meetsRR && withinBudget,
    precision, approximateContract: !contract };
}

export function dayKey(now = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
}

export function dailyStats(trades, now = Date.now()) {
  const today = trades.filter(t => dayKey(t.time) === dayKey(now)).sort((a, b) => a.time - b.time);
  let stops = 0;
  for (const trade of today) stops = trade.outcome === 'SL' ? stops + 1 : 0;
  let longest = 0, streak = 0;
  for (const trade of today) { streak = trade.outcome === 'SL' ? streak + 1 : 0; longest = Math.max(longest, streak); }
  return { count: today.length, consecutiveStops: stops, maxStopStreak: longest,
    pnl: today.reduce((sum, t) => sum + (Number(t.pnl) || 0), 0) };
}
