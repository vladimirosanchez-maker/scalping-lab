import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const amount = text => Number(text.replace(/USDT|\s|\./g, '').replace(',', '.'));
async function results() {
  await page.waitForSelector('.exit-card .net-total dd');
  return (await page.locator('.exit-card .net-total dd').allTextContents()).map(amount);
}
async function edit(id, value) {
  await page.locator(`#${id}`).fill(value);
  return results();
}
try {
  await page.goto('http://127.0.0.1:4173');
  await page.waitForFunction(() => document.querySelector('#connection').textContent.includes('Datos en vivo'));
  await page.locator('#plan-capital').fill('6000');
  await page.locator('#plan-margin').fill('1000');
  await page.locator('#plan-leverage').selectOption('1');
  await page.locator('#plan-entry').fill('10000');
  await page.locator('#plan-stop').fill('9900');
  await page.locator('#plan-tp').fill('10300');
  const base = await results();
  await page.locator('#plan-leverage').selectOption('10');
  const ten = await results();
  assert.ok(Math.abs(ten[0] - base[0] * 10) < 0.11);
  assert.ok(Math.abs(ten[1] - base[1] * 10) < 0.11);
  assert.match(await page.locator('#plan-result').innerText(), /por encima del presupuesto/);
  const half = await edit('plan-margin', '500');
  assert.ok(Math.abs(half[0] - ten[0] / 2) < 0.03);
  assert.ok(Math.abs(half[1] - ten[1] / 2) < 0.03);
  const farther = await edit('plan-stop', '9800');
  assert.ok(farther[0] < half[0]); assert.equal(farther[1], half[1]);
  const better = await edit('plan-tp', '10400');
  assert.ok(better[1] > farther[1]);
  if (!await page.locator('.calculator-costs').evaluate(e => e.open)) await page.locator('.calculator-costs summary').click();
  await page.locator('[data-config="feeOut"]').fill('0.1');
  const fees = await results(); assert.ok(fees[0] < better[0]); assert.ok(fees[1] < better[1]);
  await page.locator('#plan-sizing-mode').selectOption('risk');
  const risk = await results(); assert.ok(-risk[0] <= 30);
  const moreCapital = await edit('plan-capital', '12000'); assert.ok(-moreCapital[0] > -risk[0]); assert.ok(-moreCapital[0] <= 60);
  await page.locator('#plan-stop').fill('');
  assert.equal(await page.locator('.net-total').count(), 0, 'Invalid fields clear stale results immediately');
  await edit('plan-stop', '9800');
  assert.equal(await page.locator('.net-total').count(), 2, 'Restoring the previous valid value recalculates');
  await page.locator('#plan-stop').fill('11000');
  await page.waitForFunction(() => document.querySelector('#plan-result').textContent.includes('debajo'));
  assert.equal(await page.locator('.net-total').count(), 0);
  await edit('plan-stop', '9900');
  await page.locator('#plan-tp').fill('');
  const automatic = await results(); assert.ok(Math.abs(automatic[1] / -automatic[0] - 2) < 0.01);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, base, leverage10: ten, halfMargin: half, riskMode: risk, checks: 'Auto recalculation, leverage, margin, SL, TP, fees, capital, risk limits, invalid fields, mobile' }));
} finally { await browser.close(); }
