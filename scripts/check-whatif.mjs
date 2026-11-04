import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const provided = process.env.VOLTWISE_PLAYWRIGHT_MODULE ?? 'playwright';
const { chromium } = await import(isAbsolute(provided) ? pathToFileURL(provided).href : provided);
const url = process.env.VOLTWISE_SMOKE_URL ?? 'http://127.0.0.1:4174/';
const output = resolve('artifacts/whatif'); await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.VOLTWISE_CHROME_PATH ? { executablePath: process.env.VOLTWISE_CHROME_PATH } : { channel: 'chrome' }) });
const errors = [], consoleErrors = [], failedResponses = [], externalRequests = [], cases = [];
async function fits(page) { assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Horizontal overflow'); }
async function makePage(width, { quantity = '300', priority = 'LOWEST_SCENARIO_COST', e = 'NO', d = 'NO', dual = null, days = '30' } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 820 }, isMobile: true, hasTouch: true });
  const page = await context.newPage(); page.setDefaultTimeout(8000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('response', r => { if (r.status() >= 400) failedResponses.push(r.url()); });
  page.on('request', r => { if (new URL(r.url()).origin !== new URL(url).origin) externalRequests.push(r.url()); });
  await page.goto(url); await page.getByRole('button', { name: 'Ας ξεκινήσουμε' }).click();
  const choose = async name => page.getByRole('radio', { name, exact: true }).locator('..').click();
  const next = () => page.getByRole('button', { name: 'Συνέχεια', exact: true }).click();
  await choose('Έχω συμβόλαιο'); await next(); await choose('Έχω στοιχεία λογαριασμού');
  await choose(dual ? 'Διζωνική μέτρηση' : 'Μονή μέτρηση');
  if (dual) {
    await choose('Ναι, έχω χωριστές kWh');
    await page.getByLabel('Κανονική ζώνη (kWh)', { exact: true }).fill(dual[0]);
    await page.getByLabel('Μειωμένη ζώνη (kWh)', { exact: true }).fill(dual[1]);
  } else await page.getByLabel('Συνολική κατανάλωση (kWh)', { exact: true }).fill(quantity);
  if (days === '30') await page.getByRole('button', { name: '30 ημέρες', exact: true }).click();
  else await page.getByLabel('Διάρκεια λογαριασμού (ημέρες)', { exact: true }).fill(days);
  await next();
  for (const [name, value] of [['priority', priority], ['e_bill', e], ['direct_debit', d]]) await page.locator(`input[name="${name}"][value="${value}"]`).locator('..').click();
  await next(); await page.getByRole('button', { name: 'Δες τη σύγκριση' }).click();
  await page.getByRole('heading', { name: 'Αποτελέσματα demo', exact: true }).waitFor();
  return page;
}
const open = async page => { await page.getByRole('button', { name: 'Τι αλλάζει αν…', exact: true }).click(); await page.getByRole('heading', { name: 'Τι αλλάζει αν…', exact: true }).waitFor(); };
const pair = async (page, a, b) => { // Change in an order that never selects a disabled duplicate.
  if (await page.locator('#trial-pair-1').inputValue() === a) await page.locator('#trial-pair-1').selectOption(b);
  await page.locator('#trial-pair-0').selectOption(a); await page.locator('#trial-pair-1').selectOption(b);
};
const cents = async (page, id) => Number(await page.locator(`[data-pair-total="${id}"]`).getAttribute('data-cents'));
const status = async (page, expected) => assert.equal(await page.getByTestId('winner-change').getAttribute('data-status'), expected);
try {
  {
    const page = await makePage(360, { priority: 'FIXED_RATE' }); await open(page);
    assert.equal(await page.locator('#trial-pair-0').inputValue(), 'A2');
    assert.equal(await page.locator('#trial-pair-1').inputValue(), 'A1');
    await page.locator('#trial-kwh').fill('150'); await status(page, 'CHANGED');
    assert.equal(await cents(page, 'A1'), 2600); assert.equal(await cents(page, 'A2'), 2800);
    assert.equal(await page.getByTestId('trial-global-winner').getAttribute('data-program-ids'), 'A1');
    assert((await page.getByTestId('pair-intersection').innerText()).includes('200,00'));
    assert((await page.getByTestId('pair-intersection').locator('..').innerText()).includes('Στιγμιότυπο'));
    await fits(page); await page.screenshot({ path: resolve(output, 'consumption-change-360.png'), fullPage: true });
    await page.locator('#trial-kwh').fill('200'); await status(page, 'BECAME_TIE');
    await page.locator('#trial-kwh').fill(''); assert.equal(await page.locator('[data-pair-total]').count(), 0);
    assert.equal(await page.getByTestId('pair-intersection').count(), 0); assert((await page.getByRole('alert').innerText()).includes('κενό'));
    assert.equal(await page.locator('#trial-kwh').getAttribute('aria-invalid'), 'true');
    for (const q of ['-1', '5000.01', '1e3']) { await page.locator('#trial-kwh').fill(q); assert.equal(await page.locator('[data-pair-total]').count(), 0); }
    await page.getByRole('button', { name: 'Επαναφορά όλης της δοκιμής' }).click();
    assert.equal(await page.locator('#trial-kwh').inputValue(), '300.00'); assert.equal(await cents(page, 'A2'), 4600);
    await page.locator('#trial-kwh').fill('150'); await page.getByRole('button', { name: 'Στα αρχικά αποτελέσματα' }).click();
    assert.equal(await page.getByTestId('first-programs').getAttribute('data-program-ids'), 'A2');
    await open(page); assert.equal(await page.locator('#trial-kwh').inputValue(), '150'); await status(page, 'CHANGED');
    await page.getByText('Αντέχει η αρχική επιλογή σε ένα εύρος χρήσης;', { exact: true }).click();
    assert((await page.locator('.trial-analysis').last().innerText()).includes('παραμένει οικονομικότερο'));
    await page.locator('#range-lower').fill('150'); assert((await page.locator('.trial-analysis').last().innerText()).includes('δεν παραμένει'));
    await page.locator('#range-lower').fill(''); assert((await page.getByRole('alert').innerText()).includes('κενά'));
    cases.push({ case: 'W01-consumption-crossing-tie-invalid-reset-preserved-base-range', width: 360, passed: true }); await page.context().close();
  }
  {
    const page = await makePage(320, { e: 'YES', d: 'YES' }); await open(page); await pair(page, 'C1', 'B1');
    assert.equal(await cents(page, 'C1'), 3300);
    await page.locator('input[name="trial-direct_debit"][value="NO"]').check(); await status(page, 'CHANGED');
    assert.equal(await cents(page, 'C1'), 5700); assert.equal(await cents(page, 'B1'), 4300);
    assert.equal(await page.getByTestId('trial-global-winner').getAttribute('data-program-ids'), 'B1');
    assert((await page.getByTestId('winner-change').innerText()).includes('βασική τιμή, χωρίς έκπτωση'));
    await page.locator('input[name="trial-direct_debit"][value="UNKNOWN"]').check(); assert.equal(await cents(page, 'C1'), 5700);
    await page.locator('input[name="trial-direct_debit"][value="YES"]').check(); assert.equal(await cents(page, 'C1'), 3300);
    await page.locator('#trial-kwh').fill('350'); assert.equal(await cents(page, 'C1'), 3800);
    await fits(page); await page.screenshot({ path: resolve(output, 'discount-change-320.png'), fullPage: true });
    cases.push({ case: 'W02-discount-off-unknown-on-no-double-counting', width: 320, passed: true }); await page.context().close();
  }
  {
    const page = await makePage(390); await page.getByRole('button', { name: 'Σύγκριση δύο προγραμμάτων', exact: true }).click(); await open(page);
    assert.equal(await page.locator('#trial-pair-0').inputValue(), 'B1'); assert.equal(await page.locator('#trial-pair-1').inputValue(), 'A2');
    await page.locator('#trial-kwh').fill('350'); await status(page, 'UNCHANGED'); assert.equal(await cents(page, 'B1'), 4950); assert.equal(await cents(page, 'A2'), 5200);
    await page.locator('#trial-kwh').fill('700'); await status(page, 'CHANGED'); assert.equal(await cents(page, 'B1'), 9500); assert.equal(await cents(page, 'A2'), 9400);
    await page.getByRole('button', { name: 'Αρχικές kWh', exact: true }).click(); await page.locator('#trial-slider').focus(); await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('#trial-kwh').inputValue(), '310'); assert.equal(await cents(page, 'B1'), 4430);
    await page.getByRole('button', { name: '+20% της αρχικής χρήσης', exact: true }).click(); assert.equal(await page.locator('#trial-kwh').inputValue(), '360.00');
    await fits(page); await page.screenshot({ path: resolve(output, 'whatif-controls-390.png') });
    cases.push({ case: 'W03-unchanged-then-global-crossing-compare-entry-keyboard-slider-shortcut', width: 390, passed: true }); await page.context().close();
  }
  {
    const page = await makePage(360, { dual: ['150', '150'], priority: 'FIXED_RATE' }); await open(page); await pair(page, 'D1', 'A2');
    await page.locator('#trial-kwh').fill('600'); assert.equal(await cents(page, 'D1'), 8100); assert.equal(await cents(page, 'A2'), 8200);
    assert((await page.locator('.trial-outcome').innerText()).includes('Κανονική: 300,00 kWh · Μειωμένη: 300,00'));
    await page.locator('#trial-share').fill('0'); assert.equal(await cents(page, 'D1'), 10800);
    await page.locator('#trial-share').fill('101'); assert.equal(await page.locator('[data-pair-total]').count(), 0);
    await page.getByRole('button', { name: 'Επαναφορά αρχικής κατανομής' }).click(); assert.equal(await cents(page, 'D1'), 8100);
    await page.locator('#trial-share-slider').focus(); await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('#trial-share').inputValue(), '51'); assert.equal(await cents(page, 'D1'), 8046);
    await fits(page); cases.push({ case: 'dual-shared-allocation-preserved-and-explicitly-edited', width: 360, passed: true }); await page.context().close();
  }
  {
    const page = await makePage(320, { dual: ['0', '0'] }); await open(page); await pair(page, 'A1', 'D1');
    assert.equal(await page.getByTestId('pair-intersection').count(), 0); assert.equal(await page.getByTestId('unsupported-intersection').count(), 1);
    await page.locator('#trial-kwh').fill('300'); assert.equal(await page.getByTestId('trial-unavailable').count(), 1); assert.equal(await page.getByTestId('pair-intersection').count(), 0);
    await page.locator('#trial-share').fill('40'); assert.equal(await cents(page, 'D1'), 4620); assert.equal(await page.getByTestId('pair-intersection').count(), 1);
    await fits(page); cases.push({ case: 'zero-dual-no-fake-positive-use-threshold-until-explicit-share', width: 320, passed: true }); await page.context().close();
  }
  assert.deepEqual(errors, []); assert.deepEqual(consoleErrors, []); assert.deepEqual(failedResponses, []); assert.deepEqual(externalRequests, []);
  console.log(JSON.stringify({ cases, errors, consoleErrors, failedResponses, externalRequests }, null, 2));
} finally { await writeFile(resolve(output, 'report.json'), JSON.stringify({ cases, errors, consoleErrors, failedResponses, externalRequests }, null, 2)); await browser.close(); }
