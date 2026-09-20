import { sma, squeezeMomentum } from './oscillators.js';
import { fetchBinanceMarket } from './binance.js';
import { createChart, CandlestickSeries, LineSeries, HistogramSeries, BaselineSeries, createSeriesMarkers } from './vendor/charts.js';
import { MARKET_API } from './config.js';
import { MARKETS, validMarket } from './markets.js';
import { defaults, analyze, indicators, pivots, closed, riskPlan, dailyStats, SECONDS } from './strategy.js';

const $ = id => document.getElementById(id);
const num = (v, digits = 2) => Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v).toLocaleString('es-CO', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '—';
const time = value => new Date(value).toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
const dateTime = value => new Date(value).toLocaleString('es-CO', { timeZone: 'America/Bogota', hour12: false, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
function readStorage(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
let toastTimer;
function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 5500); }
function save(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { toast('No se pudo guardar en este navegador. Exporta tu diario para conservarlo.'); } }
const fields = [
  ['capital', 'Capital de referencia · USDT', 1, 100000000, 1], ['riskPct', 'Riesgo previsto por operación · %', 0.01, 5, 0.01],
  ['leverage', 'Apalancamiento · X', 1, 10, 1], ['marginCap', 'Margen máximo por operación · USDT', 1, 100000000, 1],
  ['feeIn', 'Comisión de entrada · %', 0, 2, 0.001], ['feeOut', 'Comisión de salida · %', 0, 2, 0.001],
  ['slipBps', 'Deslizamiento por lado · pb', 0, 100, 0.1], ['fundingReserve', 'Reserva de funding · USDT', 0, 1000000, 0.01],
  ['minRR', 'Ganancia / pérdida neta mínima', 0.1, 20, 0.1], ['adxMin', 'Umbral ADX de 1H', 1, 70, 1],
  ['stopBufferBps', 'Colchón fuera del giro · pb', 0, 100, 0.1], ['maxTrades', 'Máximo de operaciones al día', 1, 20, 1],
  ['maxStops', 'Límite de stops consecutivos', 1, 10, 1],
];
const stored = readStorage('scalping-config-v1', {});
let config = { ...defaults };
for (const [key, , min, max] of fields) if (Number.isFinite(stored[key]) && stored[key] >= min && stored[key] <= max) config[key] = stored[key];
if (!Number.isInteger(config.leverage)) config.leverage = defaults.leverage;
let trades = readStorage('scalping-journal-v1', []);
if (!Array.isArray(trades)) trades = [];
trades = trades.filter(t => t && Number.isFinite(t.time) && Number.isFinite(t.pnl) && ['long', 'short'].includes(t.direction) && ['TP', 'SL', 'MANUAL'].includes(t.outcome)).slice(-2000);
let snapshot = null, analysis = null, selected = readStorage('scalping-frame-v1', '1h'), fetching = false, fetchFailed = false;
if (!Object.hasOwn(SECONDS, selected)) selected = '1h';
let currentMarket = readStorage('scalping-market-v1', 'BTC-USDT');
if (!validMarket(currentMarket)) currentMarket = 'BTC-USDT';
let marketRequest = null, retryAfter = 0;
let savedViews = readStorage('scalping-views-v1', {});
if (!savedViews || typeof savedViews !== 'object' || Array.isArray(savedViews)) savedViews = {};
const viewKey = () => `${currentMarket}:${selected}`;
const asset = () => MARKETS[currentMarket].asset;
const priceDecimals = () => snapshot?.contract?.pricePrecision ?? MARKETS[currentMarket].pricePrecision;
let hoveredCandleTime = null;
let plan = null, planInput = null, planTime = null, newsUntil = 0, obstacleTime = null, priceLines = [];
let displayedFrame = null, displayedLength = 0, displayedFirstTime = null, lastAnalysisClose = null, lastDay = null;
const colors = { ema20: '#eec078', ema55: '#83b8fb', ema200: '#ba9ef4', vwap: '#38dfb0', rsi: '#ffeb00', adx: '#eeeeee', plus: '#00c800', minus: '#ee0000' };
const charts = [];
function chart(id, bottom = false) {
  const c = createChart($(id), {
    autoSize: true, layout: { background: { color: '#11191f' }, textColor: '#8198a4', fontFamily: 'Segoe UI, sans-serif', fontSize: 10, attributionLogo: id === 'price-chart' },
    grid: { vertLines: { color: '#1b283055' }, horzLines: { color: '#1b2830aa' } },
    crosshair: { mode: 0, vertLine: { color: '#5a727e', labelBackgroundColor: '#30444f' }, horzLine: { color: '#5a727e', labelBackgroundColor: '#30444f' } },
    leftPriceScale: { visible:true, minimumWidth:52, borderColor:'#243139' },
    rightPriceScale: { borderColor: '#243139', minimumWidth: 76 },
    handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
    handleScale: { mouseWheel: false, pinch: true, axisPressedMouseMove: true, axisDoubleClickReset: true },
    timeScale: { visible: bottom, borderColor: '#243139', timeVisible: true, secondsVisible: false, rightOffset: 5, barSpacing: 7, tickMarkFormatter: t => new Date(t * 1000).toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour12: false, hour: '2-digit', minute: '2-digit' }) },
    localization: { locale: 'es-CO', timeFormatter: t => dateTime(t * 1000) },
  });
  charts.push(c); return c;
}
const priceChart = chart('price-chart');
const candleSeries = priceChart.addSeries(CandlestickSeries, { upColor: '#39d7a4', downColor: '#ef7885', borderVisible: false, wickUpColor: '#39d7a4', wickDownColor: '#ef7885', priceLineColor: '#7b9d96', priceFormat: { type: 'price', precision: 1, minMove: 0.1 } });
const lineSeries = {};
for (const key of ['ema20', 'ema55', 'ema200', 'vwap']) lineSeries[key] = priceChart.addSeries(LineSeries, { color: colors[key], lineWidth: 1, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false });
const markers = createSeriesMarkers(candleSeries, []);
const volumeChart = chart('volume-chart');
const volumeSeries = volumeChart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceLineVisible: false, lastValueVisible: false });
const rsiChart = chart('rsi-chart', true);
const rsiBand = rsiChart.addSeries(BaselineSeries, {
  baseValue: { type: 'price', price: 30 }, topLineColor: 'transparent', bottomLineColor: 'transparent',
  topFillColor1: '#7760ad22', topFillColor2: '#7760ad22', bottomFillColor1: 'transparent', bottomFillColor2: 'transparent',
  lineVisible: false, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
  autoscaleInfoProvider: () => null,
});
const rsiSeries = rsiChart.addSeries(LineSeries, { color: colors.rsi, lineWidth: 1, priceLineVisible: false, lastValueVisible: true, autoscaleInfoProvider: original => { const info = original(); return { priceRange: { minValue: Math.min(20, info?.priceRange.minValue ?? 20), maxValue: Math.max(80, info?.priceRange.maxValue ?? 80) } }; } });
for (const level of [30, 50, 70]) rsiSeries.createPriceLine({ price: level, color: level === 50 ? '#78708080' : '#a59ab3a0', lineWidth: 1, lineStyle: 2, axisLabelVisible: true });
const rsiAverage = rsiChart.addSeries(LineSeries, { color:'#eeeeee', lineWidth:1, priceLineVisible:false, lastValueVisible:true });
const adxChart = chart('adx-chart');
adxChart.applyOptions({ leftPriceScale: { visible:true, minimumWidth:52, borderColor:'#243139' } });
const squeezeSeries = adxChart.addSeries(HistogramSeries, { priceScaleId:'right', base:0, priceLineVisible:false, lastValueVisible:true });
const squeezeZero = adxChart.addSeries(LineSeries, { priceScaleId:'right', lineVisible:false, pointMarkersVisible:true, pointMarkersRadius:2, priceLineVisible:false, lastValueVisible:false, crosshairMarkerVisible:false });
for (const key of ['adx', 'plus', 'minus']) lineSeries[key] = adxChart.addSeries(LineSeries, { color: colors[key], lineWidth: 1, priceScaleId:'left', visible:key === 'adx', priceLineVisible: false, lastValueVisible:key === 'adx' });
lineSeries.adx.createPriceLine({ price:23, color:'#eeeeee', lineWidth:1, lineStyle:0, axisLabelVisible:true });
let syncing = false;
function setChartRange(range) {
  syncing = true;
  try { for (const c of charts) c.timeScale().setVisibleLogicalRange(range); }
  finally { syncing = false; }
}
for (const c of charts) c.timeScale().subscribeVisibleLogicalRangeChange(range => {
  if (!range || syncing) return;
  setChartRange(range);
});
// One wheel handler owns the gesture, so the page and the library cannot
// scroll or zoom a second time. All panes share the same time window.
for (const [index, id] of ['price-chart', 'volume-chart', 'rsi-chart', 'adx-chart'].entries()) {
  $(id).addEventListener('wheel', event => {
    if (!event.deltaY || !snapshot) return;
    const range = priceChart.timeScale().getVisibleLogicalRange();
    if (!range) return;
    event.preventDefault();
    event.stopPropagation();
    const container = $(id).getBoundingClientRect();
    const leftAxis = charts[index].priceScale('left').width();
    const width = container.width - leftAxis - charts[index].priceScale('right').width();
    if (width <= 0) return;
    const fraction = Math.max(0, Math.min(1, (event.clientX - container.left - leftAxis) / width));
    const span = range.to - range.from;
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? container.height : 1);
    const nextSpan = Math.max(8, Math.min(snapshot.candles[selected].length + 10,
      span * Math.exp(Math.max(-0.6, Math.min(0.6, delta * 0.0015)))));
    const anchor = range.from + span * fraction;
    const from = Math.max(-5, Math.min(snapshot.candles[selected].length + 5 - nextSpan,
      anchor - nextSpan * fraction));
    setChartRange({ from, to: from + nextSpan });
  }, { passive: false, capture: true });
}
function ohlc(bar) {
  if (!bar) return;
  const row = $('ohlc');
  row.replaceChildren();
  const stamp = document.createElement('span');
  stamp.className = 'ohlc-time';
  stamp.textContent = dateTime(bar.time * 1000);
  row.append(stamp);
  const direction = bar.close > bar.open ? 'positive' : bar.close < bar.open ? 'negative' : 'ohlc-neutral';
  for (const [label, value, color, description] of [
    ['O', bar.open, 'ohlc-neutral', 'Apertura'],
    ['H', bar.high, 'positive', 'Máximo'],
    ['L', bar.low, 'negative', 'Mínimo'],
    ['C', bar.close, direction, 'Cierre de la vela; precio provisional si sigue abierta'],
  ]) {
    const item = document.createElement('strong');
    item.className = `ohlc-value ${color}`;
    item.dataset.field = label;
    item.title = description;
    item.textContent = `${label} ${num(value, priceDecimals())}`;
    row.append(item);
  }
}
priceChart.subscribeCrosshairMove(param => {
  const bar = param.seriesData.get(candleSeries);
  hoveredCandleTime = bar?.time ?? null;
  if (bar) ohlc(bar); else if (snapshot) ohlc(snapshot.candles[selected].at(-1));
});
$('price-chart').addEventListener('mouseleave', () => {
  hoveredCandleTime = null;
  if (snapshot) ohlc(snapshot.candles[selected].at(-1));
});
function centerChart() {
  if (!snapshot) return;
  for (const c of charts) c.priceScale('right').applyOptions({ autoScale: true });
  adxChart.priceScale('left').applyOptions({autoScale:true});
  const length = snapshot.candles[selected].length;
  setChartRange({ from: length - 100, to: length + 5 });
}
function restoreView() {
  const view = savedViews[viewKey()];
  if (!view || !Number.isFinite(view.span) || view.span < 8 || view.span > 610 || !Number.isFinite(view.anchor)) { centerChart(); return; }
  const bars = snapshot.candles[selected];
  const end = view.live ? bars.length + view.anchor : (view.anchor - bars[0].time) / SECONDS[selected];
  const to = Math.max(view.span - 5, Math.min(bars.length + 5, end));
  setChartRange({ from: to - view.span, to });
  charts.forEach((c, i) => {
    const scale = c === adxChart && view.layoutVersion !== 2 ? null : view.scales?.[i];
    c.priceScale('right').applyOptions({ autoScale: scale?.autoScale !== false });
    if (scale?.autoScale === false && Number.isFinite(scale.range?.from) && Number.isFinite(scale.range?.to) && scale.range.to > scale.range.from) c.priceScale('right').setVisibleRange(scale.range);
  });
  const left = view.adxScale;
  adxChart.priceScale('left').applyOptions({autoScale:left?.autoScale !== false});
  if (left?.autoScale === false && Number.isFinite(left.range?.from) && Number.isFinite(left.range?.to) && left.range.to > left.range.from) adxChart.priceScale('left').setVisibleRange(left.range);
  document.querySelectorAll('[data-series]').forEach(input => {
    input.checked = view.indicators?.[input.dataset.series] !== false;
    lineSeries[input.dataset.series].applyOptions({ visible: input.checked });
  });
}
function saveView() {
  const range = priceChart.timeScale().getVisibleLogicalRange();
  if (!snapshot || !range) { toast('Espera a que carguen las velas para guardar la vista.'); return; }
  const bars = snapshot.candles[selected], live = range.to >= bars.length - 2;
  const view = { layoutVersion:2, adxScale:{autoScale:adxChart.priceScale('left').options().autoScale, range:adxChart.priceScale('left').getVisibleRange()}, span: range.to - range.from, live,
    anchor: live ? range.to - bars.length : bars[0].time + range.to * SECONDS[selected],
    scales: charts.map(c => ({ autoScale: c.priceScale('right').options().autoScale, range: c.priceScale('right').getVisibleRange() })),
    indicators: Object.fromEntries([...document.querySelectorAll('[data-series]')].map(input => [input.dataset.series, input.checked])),
  };
  const next = { ...savedViews, [viewKey()]: view };
  try { localStorage.setItem('scalping-views-v1', JSON.stringify(next)); savedViews = next; toast(`Vista guardada · ${asset()} ${selected.toUpperCase()}. Se restaurará al volver a esta temporalidad.`); }
  catch { toast('No se pudo guardar la vista. Revisa el almacenamiento de este navegador.'); }
}
function seriesData(bars, values) { return bars.map((b, i) => Number.isFinite(values[i]) ? { time: b.time, value: values[i] } : { time: b.time }); }
function renderCharts() {
  if (!snapshot) return;
  const bars = snapshot.candles[selected], ind = indicators(bars);
  const rsiClosed = ind.rsi.map((value, i) => bars[i].time + SECONDS[selected] <= Date.now() / 1000 ? value : null);
  const rsiMean = sma(rsiClosed, 14), squeeze = squeezeMomentum(bars);
  const prevRange = priceChart.timeScale().getVisibleLogicalRange();
  const atEnd = !prevRange || prevRange.to >= displayedLength - 2;
  const switched = selected !== displayedFrame;
  const rangeShift = atEnd ? bars.length - displayedLength :
    displayedFirstTime === null ? 0 : -(bars[0].time - displayedFirstTime) / SECONDS[selected];
  syncing = true;
  try {
    candleSeries.setData(bars);
    for (const key of ['ema20', 'ema55', 'ema200', 'vwap']) lineSeries[key].setData(seriesData(bars, ind[key]));
    volumeSeries.setData(bars.map(b => ({ time: b.time, value: b.volume, color: b.close >= b.open ? '#28624f' : '#603946' })));
    rsiBand.setData(bars.map(bar => ({ time: bar.time, value: 70 })));
    rsiSeries.setData(seriesData(bars, rsiClosed));
    rsiAverage.setData(seriesData(bars, rsiMean));
    squeezeSeries.setData(squeeze.map(p => p.value === null ? {time:p.time} : {time:p.time,value:p.value,color:p.color}));
    squeezeZero.setData(squeeze.map(p => p.state === null ? {time:p.time} : {time:p.time,value:0,color:p.state === 'on' ? '#080808' : p.state === 'off' ? '#888888' : '#247aff'}));
    for (const key of ['adx', 'plus', 'minus']) lineSeries[key].setData(seriesData(bars, ind[key]));
  } finally { syncing = false; }
  displayedFrame = selected;
  displayedLength = bars.length;
  displayedFirstTime = bars[0].time;
  if (switched || !prevRange) restoreView();
  else setChartRange({ from: prevRange.from + rangeShift, to: prevRange.to + rangeShift });
  ohlc(bars.find(bar => bar.time === hoveredCandleTime) ?? bars.at(-1));
  $('chart-frame').textContent = selected.toUpperCase();
  $('volume-value').textContent = `${num(bars.at(-1).volume, 4)} ${asset()} · vela abierta`;
  $('rsi-value').textContent = `${num(rsiClosed.filter(Number.isFinite).at(-1))} · SMA ${num(rsiMean.filter(Number.isFinite).at(-1))} · al cierre`;
  $('adx-value').textContent = `ADX ${num(ind.adx.at(-1))} · SQZ ${num(squeeze.at(-1).value)} · vela abierta`;
  renderMarkers(); renderPriceLines();
}
function renderMarkers() {
  if (!snapshot) return;
  const ms = [];
  if ($('show-swings').checked) {
    const bars = closed(snapshot.candles[selected], selected, analysis?.asOf ?? Date.now() / 1000);
    for (const pivot of pivots(bars).slice(-45)) ms.push({ time: pivot.confirmedTime, position: pivot.kind === 'high' ? 'aboveBar' : 'belowBar', color: pivot.kind === 'high' ? '#9cadd2' : '#6eb5a0', shape: 'circle', text: `${pivot.label} ✓`, size: 0.4 });
  }
  if (selected === '5m' && analysis?.signal && !fetchFailed && analysis.healthy) ms.push({ time: analysis.signalTime - 300, position: analysis.closest === 'long' ? 'belowBar' : 'aboveBar', shape: analysis.closest === 'long' ? 'arrowUp' : 'arrowDown', color: '#eec078', text: `Técnica ${analysis.closest.toUpperCase()}`, size: 1 });
  markers.setMarkers(ms.sort((a, b) => a.time - b.time));
}
function renderPriceLines() {
  priceLines.forEach(p => candleSeries.removePriceLine(p)); priceLines = [];
  if (!$('show-plan').checked || !plan || plan.error) return;
  for (const [price, title, color] of [[plan.entry, 'Mi entrada', '#c2d4e6'], [plan.stop, 'Mi SL', '#f47d88'], [plan.tp, 'Mi TP', '#38dfb0']]) priceLines.push(candleSeries.createPriceLine({ price, title, color, lineWidth: 1, lineStyle: 2, axisLabelVisible: true }));
}
function checklist(title, checks, open, extra = '') {
  return `<details ${open ? 'open' : ''}><summary>${title}<span>${checks.filter(c => c.pass).length}/${checks.length}</span></summary>${extra}${checks.map(c => `<div class="condition ${c.pass ? 'pass' : ''}"><span class="condition-icon">${c.pass ? '✓' : '·'}</span><div><strong>${c.label}</strong><small>${c.detail}</small></div></div>`).join('')}</details>`;
}
function renderAnalysis() {
  if (!snapshot) return;
  analysis = analyze(snapshot, config);
  if (lastAnalysisClose !== analysis.signalTime) {
    obstacleTime = null; $('obstacle-clear').checked = false;
    lastAnalysisClose = analysis.signalTime;
  }
  const healthy = analysis.healthy && !fetchFailed;
  $('connection').textContent = healthy ? '● Datos en vivo · 3 s' : '● Datos sin validar';
  $('connection').className = `connection ${healthy ? 'ok' : 'error'}`;
  $('signal-status').textContent = healthy ? analysis.status : 'NO OPERAR · datos';
  $('signal-status').parentElement.classList.toggle('ready', healthy && analysis.signal);
  $('signal-description').textContent = !healthy ? 'Hay un error de conexión, retraso o historial incompleto. Las señales quedan bloqueadas.' : analysis.signal ? 'La última vela cerrada cumple las reglas técnicas. Revisa el plan, las noticias y el espacio hasta el objetivo.' : analysis.direction === 'neutral' ? `1H aún no permite una dirección. Se muestra el checklist ${analysis.closest?.toUpperCase() || ''} más cercano; no es una señal.` : analysis.prepared ? 'La zona de 15m está preparada. Todavía falta confirmar el gatillo de 5m.' : 'La dirección de 1H está definida. Espera que el retroceso de 15m cumpla sus condiciones.';
  $('signal-time').textContent = `Último cierre de 5m: ${analysis.signalTime ? dateTime(analysis.signalTime * 1000) : '—'} · Bogotá`;
  $('step-1h').textContent = !healthy ? 'Datos sin validar' : analysis.direction === 'neutral' ? 'Sin dirección confirmada' : `Solo ${analysis.direction.toUpperCase()}`;
  $('step-15m').textContent = !healthy ? 'Datos sin validar' : analysis.prepared ? 'Zona preparada' : 'Esperar retroceso';
  $('step-5m').textContent = !healthy ? 'Datos sin validar' : analysis.signal ? `Señal técnica ${analysis.closest.toUpperCase()}` : 'Esperar confirmación';
  $('detail-1h').textContent = `${analysis.hourly.filter(c => c.pass).length}/6 condiciones · ${analysis.closest?.toUpperCase() || '—'}`;
  $('detail-15m').textContent = `${analysis.setup.filter(c => c.pass).length}/6 condiciones de zona`;
  $('detail-5m').textContent = `Ruptura + 3 de 4 confirmaciones`;
  const currentOpen = [...$('checklists').querySelectorAll('details')].map(d => d.open);
  $('checklists').innerHTML = checklist(`01 · Dirección 1H · ${analysis.closest?.toUpperCase() || '—'}`, analysis.hourly, currentOpen[0] ?? true) + checklist('02 · Zona de 15 minutos', analysis.setup, currentOpen[1] ?? false) + checklist('03 · Confirmación de 5 minutos', analysis.trigger, currentOpen[2] ?? false);
  $('use-setup').disabled = !healthy || !analysis.prepared || !analysis.stop;
  renderGates(); renderMarkers();
}
function renderGates() {
  const stats = dailyStats(trades);
  const blockers = [];
  if (!analysis?.healthy || fetchFailed) blockers.push('datos vigentes');
  if (!analysis?.signal) blockers.push('señal técnica completa');
  if (Date.now() >= newsUntil) { newsUntil = 0; $('news-clear').checked = false; blockers.push('noticias'); }
  $('news-expiry').textContent = newsUntil ? `Válida hasta ${time(newsUntil)} · Bogotá` : 'Comprobación manual; válida 30 minutos.';
  if (!$('obstacle-clear').checked || obstacleTime !== analysis?.signalTime) blockers.push('espacio para el TP');
  if (stats.count >= config.maxTrades || stats.maxStopStreak >= config.maxStops) blockers.push('sesión bloqueada por límites');
  const tolerance = analysis?.data['5m'].values.atr * 0.15;
  if (!plan || plan.error || !plan.acceptable || planTime !== analysis?.signalTime || planInput?.direction !== analysis?.direction || Math.abs(plan.entry - analysis.entry) > tolerance) blockers.push('plan neto válido para esta señal');
  $('gate-status').textContent = blockers.length ? `Pendiente: ${blockers.join(' · ')}.` : 'Checklist completo para revisión manual. Revisa el precio ejecutable en Binance; esta app no envía órdenes.';
  $('gate-status').classList.toggle('positive', !blockers.length);
}
async function refresh() {
  if (fetching || Date.now() < retryAfter) return;
  fetching = true; $('refresh').disabled = true;
  const requestedMarket = currentMarket;
  const controller = new AbortController();
  marketRequest = controller;
  const timeout = setTimeout(() => controller.abort(), 18000);
  try {
    let response, data;
    if (MARKET_API === 'binance') {
      data = await fetchBinanceMarket(requestedMarket, controller.signal);
      response = { ok: true };
    } else {
      const endpoint = new URL(MARKET_API, location.href);
      endpoint.searchParams.set('symbol', requestedMarket);
      response = await fetch(endpoint, { signal: controller.signal, cache: 'no-store' });
      data = await response.json();
    }
    if (marketRequest !== controller || currentMarket !== requestedMarket) return;
    if (!response.ok || data.error) {
      retryAfter = Number.isFinite(data.retryAt) ? Math.min(data.retryAt, Date.now() + 15 * 60000) : Date.now() + 15000;
      throw new Error(data.error || 'No se recibió una respuesta válida');
    }
    retryAfter = 0;
    const responseMarket = data.symbol ?? data.contract?.symbol ?? data.premium?.symbol ?? 'BTC-USDT';
    if (responseMarket !== requestedMarket) throw new Error('Los datos no corresponden a la moneda seleccionada');
    if (!data.candles || !Object.keys(SECONDS).every(frame => Array.isArray(data.candles[frame]) && data.candles[frame].length >= 250) || !Number.isFinite(data.fetchedAt)) throw new Error('Historial incompleto. Se bloquean las señales.');
    snapshot = data; fetchFailed = false; $('error-banner').hidden = true;
    const precision = priceDecimals();
    candleSeries.applyOptions({ priceFormat: { type: 'price', precision, minMove: 10 ** -precision } });
    $('last-price').textContent = num(snapshot.candles['5m'].at(-1).close, precision);
    $('mark-price').textContent = num(snapshot.premium?.markPrice, precision);
    $('funding').textContent = snapshot.premium ? `${num(Number(snapshot.premium.lastFundingRate) * 100, 4)} %` : 'No disponible';
    $('funding-next').textContent = snapshot.premium?.nextFundingTime ? `Próximo: ${dateTime(Number(snapshot.premium.nextFundingTime))}` : 'Verificar en Binance';
    $('updated').textContent = time(snapshot.fetchedAt);
    renderAnalysis(); renderCharts();
  } catch (error) {
    if (marketRequest !== controller || currentMarket !== requestedMarket) return;
    if (Number.isFinite(error.retryAt)) retryAfter = error.retryAt;
    fetchFailed = true;
    $('error-banner').textContent = `${error.message}. ${snapshot ? 'El gráfico conserva la última consulta; no lo uses como dato actual.' : 'No se muestran precios de demostración.'} Se reintentará automáticamente${retryAfter > Date.now() ? ` a las ${time(retryAfter)}` : ''}.`;
    $('error-banner').hidden = false;
    $('connection').textContent = '● Sin conexión'; $('connection').className = 'connection error';
    $('signal-status').textContent = 'NO OPERAR · sin conexión';
    if (snapshot) renderAnalysis(); else { $('signal-description').textContent = 'No hay datos reales disponibles. Espera a que se restablezca la conexión.'; renderGates(); }
  } finally {
    clearTimeout(timeout);
    if (marketRequest === controller) { marketRequest = null; fetching = false; $('refresh').disabled = false; }
  }
}
function renderMarket() {
  $('market-select').value = currentMarket;
  $('market-icon').textContent = MARKETS[currentMarket].glyph;
  $('market-icon').classList.toggle('ethereum', currentMarket === 'ETH-USDT');
  $('workspace-title').textContent = `Scalping ${asset()}`;
  $('chart-symbol').textContent = `${asset()}USDT`;
  $('plan-market').textContent = `CALCULADORA · ${asset()}`;
  document.title = `Scalping Lab · ${asset()}`;
  const precision = MARKETS[currentMarket].pricePrecision;
  for (const id of ['plan-entry', 'plan-stop', 'plan-tp']) {
    $(id).step = String(10 ** -precision); $(id).min = String(10 ** -precision);
  }
  candleSeries.applyOptions({ priceFormat: { type: 'price', precision, minMove: 10 ** -precision } });
}
function changeMarket(symbol) {
  if (!validMarket(symbol) || symbol === currentMarket) return;
  marketRequest?.abort(); marketRequest = null; fetching = false;
  currentMarket = symbol; save('scalping-market-v1', symbol);
  snapshot = null; analysis = null; fetchFailed = false; hoveredCandleTime = null;
  displayedFrame = null; displayedLength = 0; displayedFirstTime = null; lastAnalysisClose = null;
  clearTimeout(calculatorTimer); lastCalculatedInputs = null;
  for (const id of ['plan-entry', 'plan-stop', 'plan-tp']) $(id).value = '';
  obstacleTime = null; $('obstacle-clear').checked = false;
  newsUntil = 0; $('news-clear').checked = false;
  invalidatePlan(); markers.setMarkers([]);
  candleSeries.setData([]); volumeSeries.setData([]); rsiSeries.setData([]); rsiBand.setData([]); rsiAverage.setData([]); squeezeSeries.setData([]); squeezeZero.setData([]);
  for (const series of Object.values(lineSeries)) series.setData([]);
  for (const id of ['last-price', 'mark-price', 'funding', 'funding-next', 'updated', 'volume-value', 'rsi-value', 'adx-value']) $(id).textContent = '—';
  $('ohlc').textContent = `Cargando ${asset()}…`;
  $('signal-status').textContent = `Cargando ${asset()}…`;
  $('signal-status').parentElement.classList.remove('ready');
  $('signal-description').textContent = 'Esperando velas e indicadores del mercado seleccionado.';
  $('signal-time').textContent = 'Señales solo con datos del mercado seleccionado';
  $('checklists').replaceChildren(); $('use-setup').disabled = true;
  for (const frame of ['1h', '15m', '5m']) { $(`step-${frame}`).textContent = 'Esperando datos…'; $(`detail-${frame}`).textContent = asset(); }
  $('error-banner').hidden = true; $('connection').textContent = '● Conectando'; $('connection').className = 'connection';
  renderMarket(); renderGates(); refresh();
}
$('market-select').onchange = event => changeMarket(event.target.value);
function renderSettings() {
  $('settings-fields').innerHTML = fields.map(([key, label, min, max, step]) => `<label>${label}<input name="${key}" type="number" min="${min}" max="${max}" step="${step}" value="${config[key]}" required></label>`).join('');
}
function syncCalculator() {
  document.querySelectorAll('#risk-form [data-config]').forEach(input => { input.value = config[input.dataset.config]; });
}
syncCalculator();
function openSettings() { renderSettings(); $('settings-dialog').showModal(); }
for (const id of ['open-settings', 'settings-top']) $(id).onclick = openSettings;
for (const id of ['open-guide', 'guide-top']) $(id).onclick = () => $('guide-dialog').showModal();
document.querySelectorAll('.close-dialog').forEach(b => b.onclick = () => b.closest('dialog').close());
$('settings-form').onsubmit = e => {
  e.preventDefault();
  const data = new FormData(e.target);
  config = Object.fromEntries(fields.map(([key]) => [key, Number(data.get(key))]));
  save('scalping-config-v1', config); $('settings-dialog').close();

  syncCalculator(); invalidatePlan(); calculatePlan(false); renderDaily(); renderAnalysis(); toast('Parámetros guardados. Plan actualizado si los precios son válidos.');
};
$('reset-settings').onclick = () => { for (const [key] of fields) $('settings-form').elements[key].value = defaults[key]; };
function invalidatePlan() {
  plan = null; planTime = null; planInput = null;
  $('plan-result').innerHTML = '<p class="muted">Completa los precios y calcula el plan con los parámetros actuales.</p>';
  renderPriceLines(); renderGates();
}
let calculatorTimer;
let lastCalculatedInputs = null;
const calculatorInputs = () => JSON.stringify([...$('risk-form').querySelectorAll('input, select')].map(input => input.value));
function scheduleCalculation() {
  if (plan && !plan.error && calculatorInputs() === lastCalculatedInputs) return;
  const previousHeight = $('plan-result').getBoundingClientRect().height;
  invalidatePlan();
  $('plan-result').style.minHeight = `${previousHeight}px`;
  clearTimeout(calculatorTimer);
  calculatorTimer = setTimeout(() => calculatePlan(false), 200);
}
$('risk-form').addEventListener('input', scheduleCalculation);
$('risk-form').addEventListener('change', scheduleCalculation);
$('risk-form').onsubmit = e => { e.preventDefault(); calculatePlan(); };
function calculatePlan(interactive = true) {
  clearTimeout(calculatorTimer);
  $('plan-result').style.minHeight = '';
  if (!$('risk-form').checkValidity()) {
    invalidatePlan();
    if (interactive) $('risk-form').reportValidity();
    return;
  }
  const values = Object.fromEntries([...document.querySelectorAll('#risk-form [data-config]')].map(input => [input.dataset.config, Number(input.value)]));
  lastCalculatedInputs = calculatorInputs();
  config = { ...config, ...values };
  save('scalping-config-v1', config);
  planInput = { sizingMode: $('plan-sizing-mode').value, direction: $('plan-direction').value, entry: Number($('plan-entry').value), stop: Number($('plan-stop').value), tp: $('plan-tp').value === '' ? undefined : Number($('plan-tp').value) };
  plan = riskPlan(planInput, config, snapshot?.contract ?? { quantityPrecision: MARKETS[currentMarket].quantityPrecision, tradeMinQuantity: MARKETS[currentMarket].minQuantity, tradeMinUSDT: currentMarket === 'BTC-USDT' ? 50 : 20, estimated: true });
  planTime = analysis?.signalTime ?? null;
  if (plan.error) { $('plan-result').textContent = plan.error; renderPriceLines(); renderGates(); return; }
  const metrics = [
    ['Tamaño de posición', `${num(plan.qty, plan.precision)} ${asset()}`, `${num(plan.notional)} USDT nominales`],
    ['Margen estimado', `${num(plan.margin)} USDT`, `${config.leverage}X · máximo ${num(config.marginCap, 0)}`],
    ['Pérdida prevista', `${num(plan.loss)} USDT`, `Presupuesto ${num(plan.budget)} USDT`],
    ['Ganancia neta prevista', `${num(plan.profit)} USDT`, 'Si se alcanza el objetivo'],
    ['Relación neta', `${num(plan.rr)} : 1`, `Mínimo ${config.minRR} : 1`],
    ['Take profit', num(plan.tp, priceDecimals()), planInput.tp === undefined ? 'Calculado · valida espacio' : 'Objetivo manual'],
  ];
  $('plan-result').innerHTML = `<div class="plan-metrics">${metrics.map(([label, value, small], i) => `<div><span>${label}</span><strong class="${i === 2 ? 'negative' : i === 3 && plan.profit > 0 ? 'positive' : ''}">${value}</strong><small>${small}</small></div>`).join('')}</div><p class="plan-summary">Costes estimados: ${num(plan.costsLoss)} USDT con stop / ${num(plan.costsWin)} USDT con TP. Incluyen ${config.feeIn}% + ${config.feeOut}% de comisiones, ${config.slipBps} pb por lado y ${num(config.fundingReserve)} USDT de reserva.<br><span class="${plan.meetsRR ? 'positive' : 'negative'}">${plan.meetsRR ? 'Cumple la relación neta elegida. Falta validar estructura y espacio hasta el TP.' : 'No cumple tu relación neta mínima. Este plan bloquea el checklist final.'}</span>${plan.approximateContract ? '<br>Precisión aproximada: no se pudo consultar la especificación del contrato.' : ''}</p>`;
  const capitalSummary = document.createElement('p');
  capitalSummary.className = 'capital-summary';
  capitalSummary.innerHTML = `Tu capital: <strong>${num(config.capital)} USDT</strong> · Apalancamiento: <strong>${config.leverage}X</strong><br>Margen utilizado: <strong>${num(plan.margin)} USDT</strong> de ${num(Math.min(config.marginCap, config.capital))} disponibles para esta operación. Riesgo total previsto: ${num(plan.loss)} / ${num(plan.budget)} USDT.`;
  $('plan-result').prepend(capitalSummary);
  const scenarios = document.createElement('div');
  scenarios.className = 'exit-scenarios';
  const scenario = (title, exit, gross, net, negative) => {
    const entryFee = plan.qty * plan.entry * config.feeIn / 100;
    const exitFee = plan.qty * exit * config.feeOut / 100;
    const slip = plan.qty * (plan.entry + exit) * config.slipBps / 10000;
    const rows = [[`Precio de salida ${asset()}`, `${num(exit, 4)} USDT`], ['Resultado bruto', `${gross > 0 ? '+' : ''}${num(gross)} USDT`], ['Comisión de entrada', `−${num(entryFee)} USDT`], ['Comisión de salida', `−${num(exitFee)} USDT`], ['Deslizamiento estimado', `−${num(slip)} USDT`], ['Reserva de funding', `−${num(config.fundingReserve)} USDT`]];
    return `<section class="exit-card"><h3 class="${negative ? 'negative' : 'positive'}">${title}</h3><dl>${rows.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}<div class="net-total"><dt>${negative ? 'Neto a perder' : net >= 0 ? 'Neto a ganar' : 'Neto a perder'}</dt><dd class="${net < 0 ? 'negative' : 'positive'}">${net > 0 ? '+' : ''}${num(net)} USDT</dd></div></dl></section>`;
  };
  scenarios.innerHTML = scenario('Stop loss · SL', plan.stop, -plan.qty * Math.abs(plan.entry - plan.stop), -plan.loss, true) + scenario('Take profit · TP', plan.tp, plan.qty * Math.abs(plan.tp - plan.entry), plan.profit, false);
  $('plan-result').append(scenarios);
  const note = document.createElement('p'); note.className = 'plan-summary';
  note.textContent = (plan.sizingMode === 'margin' ? 'Modo margen: se calcula con el margen que elegiste (limitado a tu capital) × apalancamiento. El porcentaje de riesgo es una referencia; no reduce tu posición.' : 'Modo riesgo: se reduce la posición para mantener la pérdida dentro del presupuesto. Por eso cambiar el apalancamiento puede cambiar el margen utilizado sin cambiar la ganancia o pérdida.') + ' Las comisiones se cobran sobre el valor de la posición. TP vacío: objetivo automático según la relación neta. TP manual: calcula el resultado de tu precio sin moverlo.';
  $('plan-result').append(note);
  if (!plan.withinBudget) {
    const warning = document.createElement('p'); warning.className = 'plan-summary negative';
    warning.textContent = `Este margen implica perder ${num(plan.loss)} USDT con SL, por encima del presupuesto de ${num(plan.budget)} USDT. El checklist de entrada queda bloqueado. Puedes reducir el margen o seleccionar «Ajustar tamaño al riesgo».`;
    $('plan-result').append(warning);
  }
  $('show-plan').checked = true; renderPriceLines(); renderGates();
}
$('use-setup').onclick = () => {
  if (!analysis?.healthy || fetchFailed || !analysis.prepared || !analysis.stop) return toast('Todavía no hay una estructura preparada y válida.');
  $('plan-direction').value = analysis.direction;
  const precision = priceDecimals(), scale = 10 ** precision;
  $('plan-entry').value = analysis.entry.toFixed(precision);
  const stop = analysis.direction === 'long' ? Math.floor(analysis.stop * scale) / scale : Math.ceil(analysis.stop * scale) / scale;
  $('plan-stop').value = stop.toFixed(precision); $('plan-tp').value = '';
  calculatePlan(); toast('Plan orientativo cargado. Comprueba la ruptura y el próximo soporte o resistencia.');
};
document.querySelectorAll('[data-frame]').forEach(b => b.onclick = () => {
  selected = b.dataset.frame;
  save('scalping-frame-v1', selected);
  hoveredCandleTime = null;
  document.querySelectorAll('[data-frame]').forEach(other => other.classList.toggle('selected', other.dataset.frame === selected));
  renderCharts();
});
document.querySelectorAll('[data-series]').forEach(input => input.onchange = () => lineSeries[input.dataset.series].applyOptions({ visible: input.checked }));
$('show-swings').onchange = renderMarkers; $('show-plan').onchange = renderPriceLines;
$('save-view').onclick = saveView;
$('fit-chart').onclick = centerChart; $('refresh').onclick = refresh;
$('news-clear').onchange = e => { newsUntil = e.target.checked ? Date.now() + 30 * 60000 : 0; renderGates(); };
$('obstacle-clear').onchange = e => { obstacleTime = e.target.checked ? analysis?.signalTime : null; renderGates(); };

function renderDaily() {
  const stats = dailyStats(trades);
  $('trade-count').textContent = `${stats.count} / ${config.maxTrades}`;
  $('stop-count').textContent = `${stats.consecutiveStops} / ${config.maxStops}`;
  $('day-pnl').textContent = num(stats.pnl);
  $('day-pnl').className = stats.pnl > 0 ? 'positive' : stats.pnl < 0 ? 'negative' : '';
  const blocked = stats.count >= config.maxTrades || stats.maxStopStreak >= config.maxStops;
  $('daily-status').textContent = blocked ? 'Sesión terminada según tus límites. No busques recuperar ni añadir otra operación.' : 'Puedes esperar. No hay obligación de operar.';
  $('daily-status').classList.toggle('blocked', blocked);
  const list = $('journal-list'); list.replaceChildren();
  if (!trades.length) list.innerHTML = '<p class="empty-state">Cada operación cuenta una historia.<br><span>Registra tu resultado y lo que aprendiste.</span></p>';
  for (const trade of [...trades].sort((a, b) => b.time - a.time).slice(0, 20)) {
    const row = document.createElement('div'); row.className = 'trade-row';
    const top = document.createElement('div'); top.className = 'trade-row-top';
    const dir = document.createElement('strong'); dir.className = trade.direction === 'long' ? 'positive' : 'negative'; dir.textContent = trade.direction.toUpperCase();
    const outcome = document.createElement('span'); outcome.className = 'pill'; outcome.textContent = trade.outcome;
    const pnl = document.createElement('span'); pnl.textContent = `${num(trade.pnl)} USDT`; pnl.className = trade.pnl >= 0 ? 'positive' : 'negative';
    const when = document.createElement('small'); when.textContent = dateTime(trade.time);
    const market = document.createElement('span'); market.className = 'pill'; market.textContent = MARKETS[trade.symbol]?.asset ?? 'BTC';
    top.append(market, dir, outcome, pnl, when); row.append(top);
    if (trade.note) { const note = document.createElement('p'); note.textContent = String(trade.note); row.append(note); }
    list.append(row);
  }
  renderGates();
}
$('add-trade').onclick = () => {
  const form = $('trade-form'); form.reset();
  form.elements.symbol.value = currentMarket;
  const parts = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()).replace(' ', 'T');
  form.elements.when.value = parts;
  $('trade-dialog').showModal();
};
$('trade-form').onsubmit = e => {
  e.preventDefault();
  const data = new FormData(e.target), timestamp = Date.parse(`${data.get('when')}:00-05:00`);
  if (!Number.isFinite(timestamp) || timestamp > Date.now() + 60000) return toast('Usa una fecha válida de una operación ya cerrada, en hora de Bogotá.');
  const pnl = Number(data.get('pnl'));
  if (!Number.isFinite(pnl)) return toast('Introduce un resultado neto válido.');
  const symbol = data.get('symbol');
  if (!validMarket(symbol)) return toast('Selecciona BTC o ETH para el registro.');
  trades.push({ id: crypto.randomUUID(), symbol, time: timestamp, direction: data.get('direction'), outcome: data.get('outcome'), pnl, note: String(data.get('note')).slice(0, 500) });
  save('scalping-journal-v1', trades); $('trade-dialog').close(); renderDaily(); toast('Operación registrada.');
};
$('export-journal').onclick = () => {
  const cell = value => { let text = String(value ?? ''); if (/^[=+@\-\t\r]/.test(text)) text = "'" + text; return `"${text.replaceAll('"', '""')}"`; };
  const rows = [['Fecha UTC', 'Mercado', 'Dirección', 'Salida', 'PnL neto USDT', 'Nota'], ...trades.map(t => [new Date(t.time).toISOString(), t.symbol ?? 'BTC-USDT', t.direction, t.outcome, t.pnl, t.note])];
  const csv = '\uFEFF' + rows.map(row => row.map(cell).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = 'diario-scalping.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
document.querySelectorAll('[data-frame]').forEach(b => b.classList.toggle('selected', b.dataset.frame === selected));
renderMarket(); renderDaily(); refresh();
setInterval(() => { if (!document.hidden) refresh(); }, 3000);
setInterval(() => {
  if (snapshot) {
    const asOf = Math.floor(Date.now() / 300000) * 300;
    if (asOf !== analysis?.asOf || (Date.now() - snapshot.fetchedAt >= 35000 && analysis?.healthy)) renderAnalysis();
  }
  const currentDay = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
  if (currentDay !== lastDay) { lastDay = currentDay; renderDaily(); }
  renderGates();
}, 1000);
function reconnect() {
  marketRequest?.abort(); marketRequest = null; fetching = false;
  refresh();
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) reconnect(); });
window.addEventListener('online', reconnect);
window.addEventListener('pageshow', event => { if (event.persisted) reconnect(); });
