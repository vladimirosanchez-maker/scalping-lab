import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1536, height: 1100 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await mkdir('artifacts', { recursive: true });
try {
  await page.goto('http://127.0.0.1:4173');
  const notice = await page.request.get('http://127.0.0.1:4173/NOTICE');
  assert.equal(notice.status(), 200); assert.ok((await notice.text()).includes('TradingView'));
  await page.waitForFunction(() => document.querySelector('#connection').textContent.includes('Datos en vivo'), { timeout: 30000 });
  assert.ok(await page.locator('canvas').count() >= 8);
  await page.screenshot({ path: 'artifacts/dashboard-desktop.png', fullPage: true });
  for (const frame of ['15m', '5m', '1h']) {
    await page.locator(`.time-tabs [data-frame="${frame}"]`).click();
    await page.waitForFunction(f => document.querySelector('#chart-frame').textContent.toLowerCase() === f, frame);
  }
  await page.locator('[data-series="ema200"]').uncheck();
  await page.locator('[data-series="ema200"]').check();
  await page.locator('#plan-entry').fill('77590'); await page.locator('#plan-stop').fill('77490');
  await page.locator('#risk-form button[type="submit"]').click();
  await page.waitForSelector('.plan-metrics');
  assert.ok((await page.locator('#plan-result').innerText()).includes('Cumple la relación neta'));
  await page.locator('#plan-tp').fill('77790'); await page.locator('#risk-form button[type="submit"]').click();
  assert.ok((await page.locator('#plan-result').innerText()).includes('No cumple tu relación neta'));
  await page.locator('#plan-stop').fill('78000'); await page.locator('#risk-form button[type="submit"]').click();
  assert.ok((await page.locator('#plan-result').innerText()).includes('debajo'));
  await page.locator('#settings-top').click(); await page.locator('[name="capital"]').fill('5000');
  await page.locator('#settings-form button[type="submit"]').click();
  await page.reload(); await page.waitForFunction(() => document.querySelector('#connection').textContent.includes('Datos en vivo'));
  await page.locator('#settings-top').click(); assert.equal(await page.locator('[name="capital"]').inputValue(), '5000');
  await page.locator('#reset-settings').click(); await page.locator('#settings-form button[type="submit"]').click();
  for (let i = 0; i < 2; i++) {
    await page.locator('#add-trade').click(); await page.locator('[name="outcome"]').selectOption('SL');
    await page.locator('[name="pnl"]').fill('-10'); await page.locator('[name="note"]').fill('<img src=x onerror=alert(1)> Prueba');
    await page.locator('#trade-form button[type="submit"]').click();
  }
  assert.ok((await page.locator('#daily-status').innerText()).includes('Sesión terminada'));
  assert.equal(await page.locator('#journal-list img').count(), 0);
  await page.locator('#news-clear').check(); await page.locator('#obstacle-clear').check();
  assert.ok((await page.locator('#gate-status').innerText()).includes('sesión bloqueada'));
  const downloadPromise = page.waitForEvent('download'); await page.locator('#export-journal').click();
  const download = await downloadPromise; await download.saveAs('artifacts/diario-test.csv');
  await page.locator('#guide-top').click(); assert.equal(await page.locator('#guide-dialog').evaluate(e => e.open), true);
  await page.locator('#guide-dialog .close-dialog').click();
  await page.route('**/api/market', route => route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: 'Fallo de red de prueba' }) }));
  await page.locator('#refresh').click(); await page.waitForSelector('#error-banner:not([hidden])');
  assert.ok((await page.locator('#signal-status').innerText()).includes('NO OPERAR'));
  await page.screenshot({ path: 'artifacts/dashboard-error.png', fullPage: true });
  await page.unroute('**/api/market'); await page.locator('#refresh').click();
  await page.waitForFunction(() => document.querySelector('#connection').textContent.includes('Datos en vivo'));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#guide-top').click(); assert.equal(await page.locator('#guide-dialog').evaluate(e => e.open), true);
  await page.locator('#guide-dialog .close-dialog').click();
  await page.waitForFunction(() => document.querySelector('#toast').hidden);
  await page.screenshot({ path: 'artifacts/dashboard-mobile.png', fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'No horizontal overflow on mobile');
  assert.deepEqual(errors, []);
  await writeFile('artifacts/browser-results.json', JSON.stringify({ passed: true, errors, checks: ['live data', 'charts', 'timeframes', 'indicator toggles', 'net risk', 'invalid stop', 'settings persistence', 'daily stops', 'journal escaping', 'CSV export', 'guide', 'network failure and recovery', 'mobile layout'] }, null, 2));
  console.log('Browser checks passed; screenshots saved in artifacts/.');
} finally { await browser.close(); }
