import { chromium } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

// Synthetic market data and chart handles exist only in this isolated test.
const data = { fetchedAt: Date.now(), candles: {}, premium: null, contract: null };
for (const [frame, seconds] of Object.entries({ '1h': 3600, '15m': 900, '5m': 300 })) {
  const start = Math.floor(Date.now() / 1000 / seconds) * seconds - 599 * seconds;
  data.candles[frame] = Array.from({ length: 600 }, (_, i) => {
    const close = 77500 + Math.sin(i / 8) * 200 + i / 5;
    return { time: start + i * seconds, open: close - 5, close, high: close + 15, low: close - 15, volume: 10 + i % 15 };
  });
}
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const app = (await readFile('public/app.js', 'utf8')).replace('charts.push(c); return c;', 'charts.push(c); (window.__zoomCharts ??= {})[id] = c; return c;');
await page.route('**/app.js', route => route.fulfill({ contentType: 'text/javascript', body: app }));
await page.route('**/api/market*', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...data, symbol: new URL(route.request().url()).searchParams.get('symbol'), fetchedAt: Date.now() }) }));
const ranges = () => page.evaluate(() => Object.values(window.__zoomCharts).map(c => c.timeScale().getVisibleLogicalRange()));
const span = r => r.to - r.from;
const near = (a, b) => assert.ok(Math.abs(a - b) < 0.02, `${a} ≠ ${b}`);
function aligned(rs) { assert.equal(rs.length, 4); for (const r of rs) { near(r.from, rs[0].from); near(r.to, rs[0].to); } }
async function settle() { await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
async function wheel(delta) { await page.mouse.wheel(0, delta); await page.waitForTimeout(120); await settle(); }
try {
  await page.goto('http://127.0.0.1:4173');
  await page.waitForFunction(() => document.querySelector('#connection').textContent.includes('Datos en vivo'));
  await page.locator('#price-chart').scrollIntoViewIfNeeded();
  const box = await page.locator('#price-chart').boundingBox();
  const leftAxis = await page.evaluate(() => window.__zoomCharts['price-chart'].priceScale('left').width());
  const width = await page.evaluate(() => document.querySelector('#price-chart').getBoundingClientRect().width - window.__zoomCharts['price-chart'].priceScale('right').width() - window.__zoomCharts['price-chart'].priceScale('left').width());
  const x = box.x + leftAxis + width * 0.55, y = box.y + box.height * 0.5;
  await page.mouse.move(x, y);
  const scroll = await page.evaluate(() => window.scrollY);
  const before = await ranges(); aligned(before);
  await wheel(-120);
  const zoomed = await ranges(); aligned(zoomed);
  assert.ok(span(zoomed[0]) < span(before[0]) * 0.9, 'Wheel up zooms in noticeably');
  near(before[0].from + span(before[0]) * 0.55, zoomed[0].from + span(zoomed[0]) * 0.55);
  near(await page.evaluate(() => window.scrollY), scroll);
  await wheel(120);
  const out = await ranges(); aligned(out); near(span(out[0]), span(before[0]));
  await wheel(-240);
  const saved = await ranges();
  await page.locator('#refresh').click(); await settle();
  const refreshed = await ranges(); aligned(refreshed); near(refreshed[0].from, saved[0].from); near(refreshed[0].to, saved[0].to);

  // A rolling history must preserve timestamps when browsing earlier candles.
  await page.evaluate(() => window.__zoomCharts['price-chart'].timeScale().setVisibleLogicalRange({ from: 400, to: 450 }));
  await settle();
  for (const [frame, bars] of Object.entries(data.candles)) {
    const seconds = { '1h': 3600, '15m': 900, '5m': 300 }[frame];
    bars.shift(); bars.push({ ...bars.at(-1), time: bars.at(-1).time + seconds });
  }
  await page.locator('#refresh').click(); await settle();
  const rolling = await ranges(); aligned(rolling); near(rolling[0].from, 399); near(rolling[0].to, 449);

  await page.locator('#fit-chart').click(); await settle();
  await page.mouse.move(x, y);
  for (let i = 0; i < 7; i++) await wheel(-600);
  const minimum = await ranges(); aligned(minimum); near(span(minimum[0]), 8);
  for (let i = 0; i < 9; i++) await wheel(600);
  const maximum = await ranges(); aligned(maximum); near(span(maximum[0]), 610);
  await page.locator('#fit-chart').click(); await settle(); near(span((await ranges())[0]), 105);

  // Wheel gestures over an indicator also preserve the shared interval.
  await page.locator('#rsi-chart').scrollIntoViewIfNeeded();
  const rsiBox = await page.locator('#rsi-chart').boundingBox();
  await page.mouse.move(rsiBox.x + rsiBox.width / 2, rsiBox.y + 30);
  const indicatorBefore = await ranges(); await wheel(-120); const indicatorAfter = await ranges();
  aligned(indicatorAfter); assert.ok(span(indicatorAfter[0]) < span(indicatorBefore[0]));

  for (const frame of ['15m', '5m']) {
    await page.locator(`.time-tabs [data-frame="${frame}"]`).click(); await settle();
    await page.locator('#price-chart').scrollIntoViewIfNeeded();
    const b = await page.locator('#price-chart').boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + 100);
    const prior = await ranges(); await wheel(-120); const next = await ranges(); aligned(next); assert.ok(span(next[0]) < span(prior[0]));
  }
  // Explicit saved views survive switching, unsaved edits, and reload.
  await page.locator('.time-tabs [data-frame="1h"]').click(); await settle();
  await page.evaluate(() => window.__zoomCharts['price-chart'].timeScale().setVisibleLogicalRange({from: 410, to: 470})); await settle();
  await page.locator('[data-series="ema20"]').uncheck();
  await page.locator('#save-view').click();
  assert.match(await page.locator('#toast').innerText(), /Vista guardada/);
  await page.locator('.time-tabs [data-frame="5m"]').click(); await settle();
  await page.locator('.time-tabs [data-frame="1h"]').click(); await settle();
  near((await ranges())[0].from, 410); near((await ranges())[0].to, 470);
  assert.equal(await page.locator('[data-series="ema20"]').isChecked(), false);
  await page.locator('#fit-chart').click();
  await page.locator('.time-tabs [data-frame="15m"]').click();
  await page.locator('.time-tabs [data-frame="1h"]').click(); await settle();
  near((await ranges())[0].from, 410);
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#connection').textContent.includes('Datos en vivo')); await settle();
  aligned(await ranges()); near((await ranges())[0].to, 470);
  await page.evaluate(() => {
    const c = window.__zoomCharts['price-chart'];
    c.timeScale().setVisibleLogicalRange({from: 450, to: 490});
    c.priceScale('right').setVisibleRange({from: 77000, to: 79000});
    window.__zoomCharts['adx-chart'].priceScale('left').setVisibleRange({from:10,to:60});
  }); await settle();
  await page.locator('#save-view').click();
  await page.locator('#market-select').selectOption('ETH-USDT');
  await page.waitForFunction(() => document.querySelector('#connection').textContent.includes('Datos en vivo')); await settle();
  near(span((await ranges())[0]), 105);
  await page.locator('#market-select').selectOption('BTC-USDT');
  await page.waitForFunction(() => document.querySelector('#connection').textContent.includes('Datos en vivo')); await settle();
  near((await ranges())[0].from, 450); near((await ranges())[0].to, 490);
  const priceRange = await page.evaluate(() => window.__zoomCharts['price-chart'].priceScale('right').getVisibleRange());
  near(priceRange.from, 77000); near(priceRange.to, 79000);
  const adxRange = await page.evaluate(() => window.__zoomCharts['adx-chart'].priceScale('left').getVisibleRange());
  near(adxRange.from,10); near(adxRange.to,60);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForFunction(() => !document.querySelector('#refresh').disabled);
  await page.mouse.move(1450, 300); const outside = await page.evaluate(() => window.scrollY); await wheel(200);
  assert.ok((await page.evaluate(() => window.scrollY)) > outside, 'Wheel outside charts scrolls the page');
  assert.deepEqual(errors, []);
  await mkdir('artifacts', { recursive: true });
  await writeFile('artifacts/zoom-results.json', JSON.stringify({ passed: true, checks: ['zoom up/down', 'cursor anchor', 'four synchronized panes', 'no page scroll inside charts', 'refresh retains zoom', 'rolling history retains timestamp range', 'zoom limits', 'center reset', 'indicator wheel', 'all timeframes', 'page scroll outside charts'], errors }, null, 2));
  console.log('Zoom: all browser checks passed.');
} finally { await browser.close(); }
