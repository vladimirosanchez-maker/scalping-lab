// Independent implementation of the corrected LazyBear Squeeze Momentum formula.
// https://www.tradingview.com/script/nqQ1DT5a-Squeeze-Momentum-Indicator-LazyBear/
export function sma(values, period) {
  return values.map((_, i) => {
    if (i < period - 1) return null;
    const window = values.slice(i - period + 1, i + 1);
    return window.every(Number.isFinite) ? window.reduce((a, b) => a + b, 0) / period : null;
  });
}
export function squeezeMomentum(bars, bbLength = 20, bbMultiplier = 2, kcLength = 20, kcMultiplier = 1.5, useTrueRange = true) {
  const closes = bars.map(b => b.close), basis = sma(closes, bbLength), mean = sma(closes, kcLength);
  const ranges = bars.map((b, i) => useTrueRange && i ? Math.max(b.high - b.low, Math.abs(b.high - bars[i - 1].close), Math.abs(b.low - bars[i - 1].close)) : b.high - b.low);
  const rangeMean = sma(ranges, kcLength);
  const deviation = bars.map((b, i) => {
    if (!Number.isFinite(mean[i])) return null;
    const window = bars.slice(i - kcLength + 1, i + 1);
    const midpoint = (Math.max(...window.map(b => b.high)) + Math.min(...window.map(b => b.low))) / 2;
    return b.close - (midpoint + mean[i]) / 2;
  });
  let previous = 0;
  return bars.map((b, i) => {
    let state = null, value = null;
    if (Number.isFinite(basis[i]) && Number.isFinite(rangeMean[i])) {
      const variance = closes.slice(i - bbLength + 1, i + 1).reduce((sum, c) => sum + (c - basis[i]) ** 2, 0) / bbLength;
      const bb = bbMultiplier * Math.sqrt(variance), kc = kcMultiplier * rangeMean[i];
      state = basis[i] - bb > mean[i] - kc && basis[i] + bb < mean[i] + kc ? 'on' : basis[i] - bb < mean[i] - kc && basis[i] + bb > mean[i] + kc ? 'off' : 'neutral';
    }
    const window = deviation.slice(i - kcLength + 1, i + 1);
    if (i >= kcLength - 1 && window.length === kcLength && window.every(Number.isFinite)) {
      const xMean = (kcLength - 1) / 2, yMean = window.reduce((a, b) => a + b, 0) / kcLength;
      let covariance = 0, variance = 0;
      window.forEach((v, x) => { covariance += (x - xMean) * (v - yMean); variance += (x - xMean) ** 2; });
      value = yMean + covariance / variance * xMean;
    }
    const color = value > 0 ? (value > previous ? '#00dd00' : '#008000') : (value < previous ? '#ff0000' : '#800000');
    if (value !== null) previous = value;
    return { time:b.time, value, color, state };
  });
}
