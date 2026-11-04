import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const provided = process.env.VOLTWISE_PLAYWRIGHT_MODULE ?? 'playwright';
const { chromium } = await import(isAbsolute(provided) ? pathToFileURL(provided).href : provided);
const url = process.env.VOLTWISE_SMOKE_URL ?? 'http://127.0.0.1:4174/';
const output = resolve('artifacts/optional'); await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.VOLTWISE_CHROME_PATH ? { executablePath: process.env.VOLTWISE_CHROME_PATH } : { channel: 'chrome' }) });
const errors = [], consoleErrors = [], failedResponses = [], externalRequests = [], cases = [];
async function fits(page) { assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Horizontal overflow'); }
const next = page => page.getByRole('button', { name: 'Συνέχεια', exact: true }).click();
const radio = (page, name) => page.getByRole('radio', { name, exact: true }).locator('..').click();
async function start(width, purpose = 'Έχω συμβόλαιο') {
  const context = await browser.newContext({ viewport: { width, height: 820 }, isMobile: true, hasTouch: true });
  const page = await context.newPage(); page.setDefaultTimeout(8000);
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('response', r => { if (r.status() >= 400) failedResponses.push(r.url()); });
  page.on('request', r => { if (new URL(r.url()).origin !== new URL(url).origin) externalRequests.push(r.url()); });
  await page.goto(url); await page.getByRole('button', { name: 'Ας ξεκινήσουμε' }).click(); await radio(page, purpose); return page;
}
async function selectContract(page, id, unknown = false) {
  await page.getByText('Σημερινό πρόγραμμα · προαιρετικό', { exact: true }).click();
  await page.locator('#current-demo-program').selectOption(id);
  if (unknown) await page.locator('input[name="contract-fee"][value="UNKNOWN"]').check();
}
async function manual(page) {
  await radio(page, 'Έχω στοιχεία λογαριασμού'); await radio(page, 'Μονή μέτρηση');
  await page.getByLabel('Συνολική κατανάλωση (kWh)', { exact: true }).fill('300');
  await page.getByRole('button', { name: '30 ημέρες', exact: true }).click();
}
async function finish(page) {
  await next(page);
  for (const [name, value] of [['priority', 'LOWEST_SCENARIO_COST'], ['e_bill', 'NO'], ['direct_debit', 'NO']]) await page.locator(`input[name="${name}"][value="${value}"]`).locator('..').click();
  await next(page); await fits(page); await page.getByRole('button', { name: 'Δες τη σύγκριση' }).click();
  await page.getByRole('heading', { name: 'Αποτελέσματα demo', exact: true }).waitFor(); await fits(page);
}
const attr = (page, test, name = 'data-cents') => page.getByTestId(test).getAttribute(name);
async function sample(page) {
  await page.getByRole('button', { name: 'Δες με δείγμα λογαριασμού', exact: true }).click();
  await page.getByRole('button', { name: 'Χρήση αυτών των demo στοιχείων', exact: true }).click();
}
try {
  {
    const page = await start(360); await next(page); await manual(page); await finish(page);
    assert.equal(await page.getByTestId('baseline-total').count(), 0);
    assert.equal(await page.locator('[data-baseline-difference]').count(), 0);
    assert.equal(await page.getByTestId('first-programs').getAttribute('data-program-ids'), 'B1');
    cases.push({ case: 'ordinary-flow-skips-both-optional-routes', width: 360, passed: true }); await page.context().close();
  }
  {
    const page = await start(320); await selectContract(page, 'A1'); await fits(page);
    await page.screenshot({ path: resolve(output, 'contract-picker-320.png'), fullPage: true });
    await next(page); await page.getByRole('button', { name: 'Δες με δείγμα λογαριασμού' }).focus(); await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'sample-title');
    assert.equal(await page.locator('input[type="file"]').count(), 0);
    await fits(page); await page.screenshot({ path: resolve(output, 'sample-preview-320.png'), fullPage: true });
    await page.getByRole('button', { name: 'Χρήση αυτών των demo στοιχείων' }).click();
    assert.equal(await page.locator('#field-normal').inputValue(), '360'); assert.equal(await page.locator('#field-reduced').inputValue(), '240'); assert.equal(await page.locator('#field-days').inputValue(), '60');
    assert((await page.locator('.normalized-value').innerText()).includes('300,00'));
    await next(page); assert.equal(await page.evaluate(() => document.activeElement?.id), 'field-sample_confirmed');
    assert((await page.getByRole('alert').innerText()).includes('επιβεβαίωσε'));
    await page.keyboard.press('Space'); await finish(page);
    assert.equal(await attr(page, 'baseline-total'), '5000');
    assert.equal(await page.locator('[data-baseline-alternative="B1"]').getAttribute('data-cents'), '4300');
    assert.equal(await page.locator('[data-baseline-difference="B1"]').getAttribute('data-cents'), '700');
    assert.equal(await attr(page, 'current-exit-fee'), '0'); assert((await page.locator('.sample-origin-label').innerText()).includes('φανταστικό'));
    await page.locator('.baseline-comparison').scrollIntoViewIfNeeded(); await fits(page); await page.locator('.baseline-comparison').screenshot({ path: resolve(output, 'today-alternative-320.png') });
    await page.getByRole('button', { name: 'Τι αλλάζει αν…', exact: true }).click(); await page.locator('#trial-kwh').fill('600');
    assert.equal(await attr(page, 'baseline-total'), '9800');
    assert.equal(await page.locator('[data-baseline-difference="B1"]').getAttribute('data-cents'), '1600');
    await page.getByRole('button', { name: 'Στα αρχικά αποτελέσματα' }).click(); assert.equal(await attr(page, 'baseline-total'), '5000');
    await page.locator('#featured-details-B1').click(); assert.equal(await attr(page, 'baseline-total'), '5000');
    assert((await page.getByTestId('baseline-text').innerText()).includes('7,00 €'));
    cases.push({ case: 'exact-contract-sample-confirmation-cost-breakdown-and-trial-baseline', width: 320, passed: true }); await page.context().close();
  }
  {
    const page = await start(390); await selectContract(page, 'A1', true); await next(page); await manual(page); await finish(page);
    assert.equal(await attr(page, 'baseline-total'), '5000'); assert.equal(await attr(page, 'current-exit-fee'), 'unknown');
    assert((await page.locator('.exit-fee-note').innerText()).includes('πριν αποφασίσεις'));
    assert.equal(await page.locator('[data-baseline-difference="B1"]').getAttribute('data-cents'), '700');
    await page.getByRole('button', { name: 'Διόρθωση στοιχείων', exact: true }).click();
    await page.getByRole('button', { name: 'Διόρθωση σημερινού προγράμματος' }).click();
    assert.equal(await page.locator('#current-demo-program').inputValue(), 'A1'); assert(await page.locator('input[name="contract-fee"][value="UNKNOWN"]').isChecked());
    cases.push({ case: 'exact-pricing-unknown-fee-and-edit-preservation', width: 390, passed: true }); await page.context().close();
  }
  for (const selection of ['PROVIDER_ONLY', '']) {
    const page = await start(360); await selectContract(page, selection); await next(page); await manual(page); await finish(page);
    assert.equal(await page.getByTestId('baseline-total').count(), 0); assert.equal(await page.locator('[data-baseline-difference]').count(), 0); assert.equal(await attr(page, 'current-exit-fee'), 'unknown');
    assert((await page.getByTestId('baseline-text').innerText()).includes('Δεν έχει οριστεί ακριβές'));
    cases.push({ case: selection ? 'provider-only-no-numeric-savings' : 'explicit-unknown-no-numeric-savings', width: 360, passed: true }); await page.context().close();
  }
  {
    const page = await start(320); await selectContract(page, 'D1'); await next(page); await manual(page); await finish(page);
    assert.equal(await page.getByTestId('baseline-total').count(), 0); assert.equal(await page.locator('[data-baseline-difference]').count(), 0);
    assert((await page.getByTestId('baseline-text').innerText()).includes('διζωνική')); await fits(page);
    assert.equal(await attr(page, 'current-exit-fee'), '0');
    cases.push({ case: 'incompatible-baseline-no-invented-today-cost', width: 320, passed: true }); await page.context().close();
  }
  {
    const page = await start(390); await next(page); await manual(page);
    await page.getByRole('button', { name: 'Δες με δείγμα λογαριασμού' }).click();
    await page.getByRole('button', { name: 'Κλείσιμο δείγματος χωρίς αλλαγές' }).click();
    assert.equal(await page.locator('#field-total').inputValue(), '300'); assert.equal(await page.locator('#field-days').inputValue(), '30');
    assert.equal(await page.locator('#field-sample_confirmed').count(), 0); assert.equal(await page.evaluate(() => document.activeElement?.id), 'open-bill-sample');
    await sample(page); await page.locator('#field-sample_confirmed').check();
    await page.locator('#field-normal').fill('400'); assert.equal(await page.locator('#field-sample_confirmed').isChecked(), false);
    await next(page); assert((await page.getByRole('alert').innerText()).includes('επιβεβαίωσε'));
    await page.locator('#field-sample_confirmed').check(); await next(page);
    await page.getByRole('button', { name: 'Πίσω', exact: true }).click(); assert(await page.locator('#field-sample_confirmed').isChecked());
    await page.getByRole('button', { name: 'Καθαρισμός δείγματος — δικά μου στοιχεία' }).click();
    assert.equal(await page.locator('#field-normal').count(), 0); await manual(page);
    assert.equal(await page.locator('#field-sample_confirmed').count(), 0); await finish(page);
    assert.equal(await page.locator('.sample-origin-label').count(), 0);
    cases.push({ case: 'sample-cancel-no-mutation-edit-reconfirmation-and-clear', width: 390, passed: true }); await page.context().close();
  }
  {
    const page = await start(360); await selectContract(page, 'A1'); await radio(page, 'Νέα παροχή');
    assert.equal(await page.locator('#current-demo-program').count(), 0); await radio(page, 'Έχω συμβόλαιο');
    await page.getByText('Σημερινό πρόγραμμα · προαιρετικό', { exact: true }).click(); assert.equal(await page.locator('#current-demo-program').inputValue(), '');
    await radio(page, 'Νέα παροχή'); await next(page); await sample(page); await page.locator('#field-sample_confirmed').check(); await finish(page);
    assert.equal(await page.locator('.baseline-comparison').count(), 0); assert.equal(await page.getByTestId('current-exit-fee').count(), 0);
    assert.equal(await page.getByTestId('first-programs').getAttribute('data-program-ids'), 'B1');
    assert.equal(await page.locator('input[type="file"]').count(), 0);
    cases.push({ case: 'new-supply-clears-contract-and-allows-sample-without-baseline', width: 360, passed: true }); await page.context().close();
  }
  assert.deepEqual(errors, []); assert.deepEqual(consoleErrors, []); assert.deepEqual(failedResponses, []); assert.deepEqual(externalRequests, []);
  console.log(JSON.stringify({ cases, errors, consoleErrors, failedResponses, externalRequests }, null, 2));
} finally { await writeFile(resolve(output, 'report.json'), JSON.stringify({ cases, errors, consoleErrors, failedResponses, externalRequests }, null, 2)); await browser.close(); }
