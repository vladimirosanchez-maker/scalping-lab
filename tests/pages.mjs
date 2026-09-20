import { chromium, webkit, devices } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import assert from 'node:assert/strict';

const live = process.argv.includes('--live');
const engine = process.env.TEST_BROWSER === 'webkit' ? webkit : chromium;
const browser = await engine.launch(engine === chromium ? { channel: 'msedge', headless: true } : { headless: true });
const { defaultBrowserType, ...device } = devices['iPhone 13'];
const page = await browser.newPage(device);
page.setDefaultTimeout(45000);
const errors = [], marketResponses = [];
page.on('pageerror', e => errors.push(e.message));
page.on('response', r => { if (new URL(r.url()).pathname === '/api/market' || new URL(r.url()).hostname === 'fapi.binance.com') marketResponses.push(r.status()); });
const site = 'https://vladimirosanchez-maker.github.io/scalping-lab/';
if (!live) {
  const base = resolve('dist');
  await page.route(`${site}**`, async route => {
    const relative = decodeURIComponent(new URL(route.request().url()).pathname.slice('/scalping-lab/'.length)) || 'index.html';
    const file = resolve(base, relative);
    if (!file.startsWith(base + sep)) return route.abort();
    try {
      const body = await readFile(file);
      const contentType = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' }[extname(file)] || 'text/plain';
      await route.fulfill({ body, contentType });
    } catch { await route.fulfill({ status: 404, body: 'Not found' }); }
  });
}
try {
  const response = await page.goto(site);
  assert.equal(response.status(), 200);
  await page.waitForFunction(() => document.querySelector('#connection')?.textContent.includes('Datos en vivo'), { timeout: 45000 });
  assert.ok(await page.locator('canvas').count() >= 8);
  assert.equal(await page.locator('.ohlc-value').count(), 4);
  await page.locator('.time-tabs [data-frame="5m"]').click();
  assert.equal(await page.locator('#chart-frame').innerText(), '5M');
  await page.locator('#plan-capital').fill('1000');
  await page.locator('#plan-margin').fill('100');
  await page.locator('#plan-leverage').selectOption('5');
  await page.locator('#plan-entry').fill('77590');
  await page.locator('#plan-stop').fill('77490');
  await page.waitForSelector('.exit-card .net-total');
  assert.equal(await page.locator('.exit-card').count(), 2);
  await page.locator('#market-select').selectOption('ETH-USDT');
  await page.waitForFunction(() => document.querySelector('#chart-symbol').textContent === 'ETHUSDT' && document.querySelector('#connection').textContent.includes('Datos en vivo'));
  assert.equal(await page.locator('#plan-entry').inputValue(), '');
  assert.equal(await page.locator('.exit-card').count(), 0);
  assert.match(await page.locator('#volume-value').innerText(), /ETH/);
  await page.locator('#plan-entry').fill('3000.25');
  await page.locator('#plan-stop').fill('2980.15');
  await page.waitForSelector('.exit-card .net-total');
  assert.match(await page.locator('.plan-metrics').innerText(), /ETH/);
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#connection')?.textContent.includes('Datos en vivo'));
  assert.equal(await page.locator('#market-select').inputValue(), 'ETH-USDT');
  assert.equal(await page.locator('#chart-symbol').innerText(), 'ETHUSDT');
  await page.locator('#market-select').selectOption('BTC-USDT');
  await page.waitForFunction(() => document.querySelector('#chart-symbol').textContent === 'BTCUSDT' && document.querySelector('#connection').textContent.includes('Datos en vivo'));
  assert.match(await page.locator('#volume-value').innerText(), /BTC/);
  await page.locator('#market-select').selectOption('ETH-USDT');
  await page.waitForFunction(() => document.querySelector('#connection').textContent.includes('Datos en vivo'));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  for (const [frame,label] of [['4h','4H'],['1d','D'],['1w','W'],['1M','M']]) {
    await page.locator(`.time-tabs [data-frame="${frame}"]`).click();
    await page.waitForFunction(frame => document.querySelector('#price-chart').dataset.frame === frame && document.querySelector('#connection').textContent.includes('Datos en vivo'), frame);
    assert.equal(await page.locator('#chart-frame').innerText(),label);
    await page.locator('#save-view').click();
    assert.match(await page.locator('#toast').innerText(), /Vista guardada/);
  }
  assert.match(await page.locator('#history-note').innerText(), /EMA 200 no disponible/);
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#price-chart').dataset.frame === '1M' && document.querySelector('#connection').textContent.includes('Datos en vivo'));
  assert.equal(await page.locator('#chart-frame').innerText(),'M');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.locator('#guide-top').click();
  assert.equal(await page.locator('#guide-dialog').evaluate(e => e.open), true);
  await page.locator('#guide-dialog .close-dialog').click();
  assert.ok(marketResponses.length >= 1 && marketResponses.every(status => status === 200));
  assert.deepEqual(errors, []);
  await mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: `artifacts/pages-iphone-${engine === webkit ? 'webkit' : 'chromium'}-${live ? 'live' : 'build'}.png`, fullPage: true });
  console.log(JSON.stringify({ live, engine: engine === webkit ? 'webkit' : 'chromium', site, marketResponses, errors, mobile: 'passed', calculator: 'passed' }));
} finally { await browser.close(); }
