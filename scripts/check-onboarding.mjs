import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Use an existing browser-testing installation; no runtime/app dependency is added.
const provided = process.env.VOLTWISE_PLAYWRIGHT_MODULE ?? 'playwright';
const { chromium } = await import(isAbsolute(provided) ? pathToFileURL(provided).href : provided);
const url = process.env.VOLTWISE_SMOKE_URL ?? 'http://127.0.0.1:4174/';
const output = resolve('artifacts/onboarding');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.VOLTWISE_CHROME_PATH ? { executablePath: process.env.VOLTWISE_CHROME_PATH } : { channel: 'chrome' }) });
const results = [];
const browserErrors = [], externalRequests = [], consoleErrors = [], failedResponses = [];
async function pageFor(width) {
  const context = await browser.newContext({ viewport: { width, height: 820 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on('pageerror', e => browserErrors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('response', r => { if (r.status() >= 400) failedResponses.push({ url: r.url(), status: r.status() }); });
  page.on('request', r => { if (new URL(r.url()).origin !== new URL(url).origin) externalRequests.push(r.url()); });
  await page.goto(url);
  return page;
}
async function clickRadio(page, label) {
  const radio = page.getByRole('radio', { name: label, exact: true });
  await radio.locator('..').click();
  assert(await radio.isChecked(), label);
}
const next = page => page.getByRole('button', { name: 'Συνέχεια', exact: true }).click();
async function fits(page) { assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Horizontal overflow'); }
async function start(page, purpose = 'Έχω συμβόλαιο') {
  await page.getByRole('button', { name: 'Ας ξεκινήσουμε' }).click();
  await clickRadio(page, purpose); await next(page);
}
async function preferences(page, priority = 'Χαμηλότερο εκτιμώμενο κόστος', e = 'NO', d = 'NO') {
  await next(page);
  await clickRadio(page, priority);
  await page.locator(`input[name="e_bill"][value="${e}"]`).locator('..').click();
  await page.locator(`input[name="direct_debit"][value="${d}"]`).locator('..').click();
  await fits(page); await next(page);
}
async function enterResults(page, first) {
  await page.getByRole('button', { name: 'Δες τη σύγκριση' }).click();
  await page.getByRole('heading', { name: 'Αποτελέσματα demo', exact: true }).waitFor();
  assert.equal(await page.getByTestId('first-programs').getAttribute('data-program-ids'), first);
  assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'H1');
  await fits(page);
}
try {
  {
    const page = await pageFor(360);
    await fits(page); await page.screenshot({ path: resolve(output, 'welcome-360.png'), fullPage: true });
    await page.getByRole('button', { name: 'Ας ξεκινήσουμε' }).click();
    await next(page); await page.getByRole('alert').waitFor();
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'field-purpose');
    await clickRadio(page, 'Έχω συμβόλαιο'); await next(page);
    await clickRadio(page, 'Έχω στοιχεία λογαριασμού'); await clickRadio(page, 'Μονή μέτρηση');
    const kwh = page.getByLabel('Συνολική κατανάλωση (kWh)', { exact: true });
    const days = page.getByLabel('Διάρκεια λογαριασμού (ημέρες)', { exact: true });
    assert.equal(await kwh.getAttribute('inputmode'), 'decimal'); assert.equal(await days.getAttribute('inputmode'), 'numeric');
    await next(page); assert.equal(await kwh.getAttribute('aria-invalid'), 'true');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'field-total');
    await kwh.fill('300'); await days.fill('0'); await next(page);
    assert.equal(await days.getAttribute('aria-invalid'), 'true'); assert((await page.locator('#days-error').innerText()).includes('Το 0 δεν είναι έγκυρο'));
    await kwh.fill('-5'); await days.fill('30'); await next(page); assert.equal(await kwh.getAttribute('aria-invalid'), 'true');
    await kwh.fill('6000'); await next(page); assert((await page.getByRole('alert').first().innerText()).includes('5.000 kWh'));
    await kwh.fill('900'); await days.fill('90');
    assert((await page.locator('.normalization').innerText()).includes('300,00'));
    await fits(page); await page.screenshot({ path: resolve(output, 'consumption-360.png'), fullPage: true });
    await next(page); await next(page); assert.equal(await page.evaluate(() => document.activeElement?.id), 'field-priority');
    await clickRadio(page, 'Χαμηλότερο εκτιμώμενο κόστος');
    await page.locator('input[name="e_bill"][value="YES"]').locator('..').click();
    await page.locator('input[name="direct_debit"][value="NO"]').locator('..').click(); await next(page);
    await page.getByRole('button', { name: 'Διόρθωση κατανάλωσης' }).click();
    assert.equal(await kwh.inputValue(), '900'); assert.equal(await days.inputValue(), '90');
    await kwh.fill('1200'); await days.fill('120');
    await page.getByRole('button', { name: 'Πίσω', exact: true }).click(); await next(page);
    assert.equal(await kwh.inputValue(), '1200'); await next(page);
    assert(await page.locator('input[name="e_bill"][value="YES"]').isChecked()); await next(page);
    await page.screenshot({ path: resolve(output, 'review-360.png'), fullPage: true });
    assert.equal(await page.locator('input[type="email"],input[type="tel"]').count(), 0);
    await enterResults(page, 'B1');
    assert.equal(await page.locator('[data-program-id="B1"]').getAttribute('data-total-cents'), '4300');
    results.push({ case: 'manual-single-errors-correction-back', width: 360, passed: true }); await page.context().close();
  }
  {
    const page = await pageFor(390); await start(page);
    await clickRadio(page, 'Έχω στοιχεία λογαριασμού'); await clickRadio(page, 'Διζωνική μέτρηση'); await clickRadio(page, 'Ναι, έχω χωριστές kWh');
    await page.getByLabel('Κανονική ζώνη (kWh)', { exact: true }).fill('360');
    await page.getByLabel('Μειωμένη ζώνη (kWh)', { exact: true }).fill('240');
    await page.getByLabel('Διάρκεια λογαριασμού (ημέρες)', { exact: true }).fill('60');
    assert((await page.locator('.normalization').innerText()).includes('180,00'));
    assert((await page.locator('.normalization').innerText()).includes('120,00'));
    await fits(page); await page.screenshot({ path: resolve(output, 'dual-390.png'), fullPage: true });
    await preferences(page, 'Προβλεψιμότητα χρέωσης ενέργειας'); await enterResults(page, 'A2');
    assert.equal(await page.locator('[data-program-id="D1"]').getAttribute('data-total-cents'), '4620');
    results.push({ case: 'manual-dual', width: 390, passed: true }); await page.context().close();
  }
  {
    const page = await pageFor(320); await start(page, 'Νέα παροχή');
    await clickRadio(page, 'Δεν έχω λογαριασμό'); await clickRadio(page, 'Δεν γνωρίζω');
    const input = page.getByLabel('Δική σου ενδεικτική χρήση (kWh / 30 ημέρες)', { exact: true });
    assert.equal(await input.inputValue(), ''); await next(page); assert.equal(await input.getAttribute('aria-invalid'), 'true');
    await page.getByRole('button', { name: '300 kWh / 30 ημέρες', exact: true }).click();
    await input.fill('450,5'); await fits(page);
    await preferences(page, 'Δεν έχω σαφή προτίμηση', 'UNKNOWN', 'UNKNOWN'); await enterResults(page, 'B1');
    assert.equal(await page.locator('[data-program-id="B1"]').getAttribute('data-total-cents'), '6257');
    assert.equal(await page.locator('[data-program-id="D1"]').count(), 0);
    results.push({ case: 'new-supply-indicative-custom-unknown-meter', width: 320, passed: true }); await page.context().close();
  }
  {
    const page = await pageFor(390); await start(page, 'Νέα παροχή');
    await clickRadio(page, 'Δεν έχω λογαριασμό'); await clickRadio(page, 'Διζωνική μέτρηση'); await clickRadio(page, 'Θα δοκιμάσω ένα ποσοστό');
    await page.getByRole('button', { name: '300 kWh / 30 ημέρες', exact: true }).click();
    const share = page.getByLabel('Υπόθεση μεριδίου μειωμένης ζώνης (%)', { exact: true });
    await share.fill('101'); await next(page); assert.equal(await share.getAttribute('aria-invalid'), 'true');
    await share.fill('50'); await fits(page);
    await preferences(page, 'Προβλεψιμότητα χρέωσης ενέργειας'); await enterResults(page, 'D1');
    assert.equal(await page.locator('[data-program-id="D1"]').getAttribute('data-total-cents'), '4350');
    results.push({ case: 'indicative-dual-explicit-share', width: 390, passed: true }); await page.context().close();
  }
  for (const [quantity, meter, allocation, first, amount] of [['300','Διζωνική μέτρηση','Γνωρίζω μόνο το σύνολο','B1','4300'], ['0','Μονή μέτρηση',null,'A1','200']]) {
    const page = await pageFor(360); await start(page); await clickRadio(page, 'Έχω στοιχεία λογαριασμού'); await clickRadio(page, meter);
    if (allocation) await clickRadio(page, allocation);
    await page.getByLabel('Συνολική κατανάλωση (kWh)', { exact: true }).fill(quantity);
    await page.getByRole('button', { name: '30 ημέρες', exact: true }).click();
    await preferences(page); await enterResults(page, first);
    assert.equal(await page.locator(`[data-program-id="${first}"]`).getAttribute('data-total-cents'), amount);
    if (allocation) assert.equal(await page.locator('[data-program-id="D1"]').count(), 0);
    results.push({ case: allocation ? 'unknown-dual-allocation' : 'zero-usage', width: 360, passed: true }); await page.context().close();
  }
  {
    const page = await pageFor(360);
    await page.getByRole('button', { name: 'Ας ξεκινήσουμε' }).focus(); await page.keyboard.press('Enter');
    await page.getByRole('radio', { name: 'Έχω συμβόλαιο', exact: true }).focus(); await page.keyboard.press('Space');
    await page.getByRole('button', { name: 'Συνέχεια', exact: true }).focus(); await page.keyboard.press('Enter');
    for (const name of ['Έχω στοιχεία λογαριασμού', 'Μονή μέτρηση']) { await page.getByRole('radio', { name, exact: true }).focus(); await page.keyboard.press('Space'); }
    const quantity = page.getByLabel('Συνολική κατανάλωση (kWh)', { exact: true }); await quantity.focus(); await page.keyboard.type('300');
    await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => document.activeElement?.id), 'field-days'); await page.keyboard.type('30');
    await page.getByRole('button', { name: 'Συνέχεια', exact: true }).focus(); await page.keyboard.press('Enter');
    for (const selector of ['input[name="priority"][value="LOWEST_SCENARIO_COST"]', 'input[name="e_bill"][value="YES"]', 'input[name="direct_debit"][value="YES"]']) { await page.locator(selector).focus(); await page.keyboard.press('Space'); }
    await page.getByRole('button', { name: 'Συνέχεια', exact: true }).focus(); await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Δες τη σύγκριση' }).focus(); await page.keyboard.press('Enter');
    await page.getByRole('heading', { name: 'Αποτελέσματα demo' }).waitFor();
    assert.equal(await page.getByTestId('first-programs').getAttribute('data-program-ids'), 'C1');
    results.push({ case: 'keyboard-only-and-full-discount', width: 360, passed: true }); await page.context().close();
  }
  assert.deepEqual(failedResponses, []); assert.deepEqual(browserErrors, []); assert.deepEqual(consoleErrors, []); assert.deepEqual(externalRequests, []);
  const report = { cases: results, browserErrors, consoleErrors, externalRequests, failedResponses };
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally { await browser.close(); }
