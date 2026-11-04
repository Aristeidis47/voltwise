import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DEMO_CATALOG, demoContract } from '../src/data/demoPrograms.ts';
import { recommend } from '../src/domain/recommend.ts';
import { formatMoney } from '../src/domain/exact.ts';
import { scenario, total, split } from '../src/tests/fixtures.ts';

const provided = process.env.VOLTWISE_PLAYWRIGHT_MODULE ?? 'playwright';
const { chromium } = await import(isAbsolute(provided) ? pathToFileURL(provided).href : provided);
const url = process.env.VOLTWISE_SMOKE_URL ?? 'http://127.0.0.1:4174/';
const output = resolve('artifacts/review'); await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.VOLTWISE_CHROME_PATH ? { executablePath: process.env.VOLTWISE_CHROME_PATH } : { channel: 'chrome' }) });
const errors = [], consoleErrors = [], failedResponses = [], externalRequests = [], cases = [];
async function pageFor(width, height = 900) {
  const context = await browser.newContext({ viewport: { width, height }, isMobile: width < 600, hasTouch: width < 600 });
  const page = await context.newPage(); page.setDefaultTimeout(8000);
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('response', r => { if (r.status() >= 400) failedResponses.push(r.url()); });
  page.on('request', r => { if (new URL(r.url()).origin !== new URL(url).origin) externalRequests.push(r.url()); });
  await page.goto(url); return page;
}
const radio = (page, name) => page.getByRole('radio', { name, exact: true }).locator('..').click();
const next = page => page.getByRole('button', { name: 'Συνέχεια', exact: true }).click();
async function fits(page) {
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Horizontal overflow');
  assert.deepEqual(await page.evaluate(() => [...new Set([...document.querySelectorAll('[id]')].map(e => e.id).filter((id, i, ids) => ids.indexOf(id) !== i))]), [], 'Duplicate IDs');
  assert.equal(await page.locator('main#main-content').count(), 1);
}
async function enter(page, input, { sample = false } = {}) {
  await page.getByRole('button', { name: 'Ας ξεκινήσουμε' }).click(); await radio(page, input.purpose === 'NEW_SUPPLY' ? 'Νέα παροχή' : 'Έχω συμβόλαιο');
  if (input.current_contract) {
    await page.getByText('Σημερινό πρόγραμμα · προαιρετικό', { exact: true }).click(); await page.locator('#current-demo-program').selectOption(input.current_contract.program_id);
  }
  await next(page);
  if (sample) {
    await page.getByRole('button', { name: 'Δες με δείγμα λογαριασμού' }).click(); await page.getByRole('button', { name: 'Χρήση αυτών των demo στοιχείων' }).click(); await page.locator('#field-sample_confirmed').check();
  } else {
    await radio(page, input.consumption_source === 'INDICATIVE' ? 'Δεν έχω λογαριασμό' : 'Έχω στοιχεία λογαριασμού');
    await radio(page, input.meter_type === 'DUAL' ? 'Διζωνική μέτρηση' : input.meter_type === 'UNKNOWN' ? 'Δεν γνωρίζω' : 'Μονή μέτρηση');
    const c = input.consumption;
    if (input.meter_type === 'DUAL') await radio(page, c.quantity_mode === 'SPLIT' ? 'Ναι, έχω χωριστές kWh' : 'Γνωρίζω μόνο το σύνολο');
    if (input.consumption_source === 'INDICATIVE') await page.locator('#field-indicative_total').fill(c.total_kwh);
    else {
      if (c.quantity_mode === 'SPLIT') { await page.locator('#field-normal').fill(c.normal_kwh); await page.locator('#field-reduced').fill(c.reduced_kwh); }
      else await page.locator('#field-total').fill(c.total_kwh);
      await page.locator('#field-days').fill(String(c.period_days));
    }
  }
  await fits(page); await next(page);
  for (const [name, value] of [['priority', input.priority], ['e_bill', input.condition_answers.e_bill], ['direct_debit', input.condition_answers.direct_debit]]) await page.locator(`input[name="${name}"][value="${value}"]`).locator('..').click();
  await next(page); await page.getByRole('button', { name: 'Δες τη σύγκριση' }).click(); await page.getByRole('heading', { name: 'Αποτελέσματα demo', exact: true }).waitFor(); await fits(page);
}
async function auditAmounts(page, input, literal) {
  const result = recommend(input, DEMO_CATALOG), get = id => result.evaluations.find(e => e.program.program_id === id);
  assert.deepEqual(DEMO_CATALOG.programs.map(p => get(p.program_id).charges?.total_cents ?? null), literal, 'Independent literal amounts');
  const category = result.primary_category === 'FIXED_RATE' ? result.fixed_category : result.cheapest_category;
  assert.equal(await page.getByTestId('first-programs').getAttribute('data-program-ids'), category.first_program_ids.join(','));
  const featured = await page.locator('[data-featured-id]').evaluateAll(es => es.map(e => e.dataset.featuredId)); assert.equal(new Set(featured).size, featured.length);
  for (const id of featured) assert.equal(Number(await page.locator(`[data-featured-id="${id}"] [data-amount-cents]`).getAttribute('data-amount-cents')), get(id).charges.total_cents);
  const showAll = page.getByRole('button', { name: /^Δες όλα τα/ }); if (await showAll.count()) await showAll.click();
  for (const entry of category.ranked_entries) assert.equal(Number(await page.locator(`[data-program-id="${entry.program_id}"]`).getAttribute('data-total-cents')), entry.total_cents);
  await page.getByRole('button', { name: 'Σύγκριση δύο προγραμμάτων', exact: true }).click();
  const valid = result.evaluations.filter(e => e.charges);
  for (const e of valid) {
    const id = e.program.program_id;
    const current = [await page.locator('#pair-0').inputValue(), await page.locator('#pair-1').inputValue()];
    if (!current.includes(id)) await page.locator('#pair-0').selectOption(id);
    assert.equal(Number(await page.locator(`[data-pair-total="${id}"]`).getAttribute('data-cents')), e.charges.total_cents);
    await page.locator(`#pair-details-${id}`).click();
    for (const [test, amount] of [['energy-total', e.charges.energy_total_cents], ['fixed-fee', e.charges.fixed_fee_cents_30], ['breakdown-total', e.charges.total_cents]]) assert.equal((await page.getByTestId(test).innerText()).replaceAll('\u00a0', ' '), formatMoney(amount));
    await fits(page); await page.getByRole('button', { name: 'Πίσω στη σύγκριση' }).click();
  }
  await page.getByRole('button', { name: 'Πίσω στα αποτελέσματα' }).click();
}
const samples = [
  { name: 'existing-manual-single', input: scenario({ consumption: total('900', 90), current_contract: demoContract('A1') }), amounts: [5000, 4600, 4300, 5700, null] },
  { name: 'new-indicative-unknown', input: scenario({ purpose: 'NEW_SUPPLY', consumption_source: 'INDICATIVE', indicative_preset: 'CUSTOM', meter_type: 'UNKNOWN', consumption: total('450.5'), priority: 'NO_CLEAR_PREFERENCE', condition_answers: { e_bill: 'NO', direct_debit: 'UNKNOWN' } }), amounts: [7408, 6406, 6257, 8409, null] },
  { name: 'existing-sample-dual-discount-one-winner-many-roles', sample: true, input: scenario({ consumption_source: 'DEMO_SAMPLE', meter_type: 'DUAL', consumption: split('360', '240', 60), current_contract: demoContract('A1'), priority: 'FIXED_RATE', condition_answers: { e_bill: 'YES', direct_debit: 'YES' } }), amounts: [5000, 4600, 4300, 3300, 4620] },
  { name: 'new-manual-dual-tiny-rounding', input: scenario({ purpose: 'NEW_SUPPLY', meter_type: 'DUAL', consumption: split('0.03', '0.07') }), amounts: [202, 1001, 401, 302, 601] },
];
try {
  for (const width of [320, 390, 1440]) for (const sample of samples) {
    const page = await pageFor(width, width === 320 ? 720 : 900); await enter(page, sample.input, sample); await auditAmounts(page, sample.input, sample.amounts);
    if (sample.sample) { assert.equal(await page.locator('[data-featured-id]').count(), 1); assert.equal(await page.locator('[data-featured-id="C1"] .tag').count(), 3); }
    if (sample.name === 'existing-manual-single') await page.screenshot({ path: resolve(output, `results-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: 'Τι αλλάζει αν…', exact: true }).click(); await page.locator('#trial-kwh').fill('700');
    assert.equal(await page.locator('#trial-kwh').inputValue(), '700');
    await page.locator('#trial-kwh').fill(''); assert.equal(await page.locator('[data-pair-total]').count(), 0); assert.equal(await page.getByTestId('pair-intersection').count(), 0);
    await page.getByRole('button', { name: 'Επαναφορά όλης της δοκιμής', exact: true }).click(); await fits(page);
    if (sample.sample && width === 1440) await page.screenshot({ path: resolve(output, 'trial-desktop.png'), fullPage: true });
    cases.push({ case: sample.name, width, passed: true }); await page.context().close();
  }
  for (const width of [360, 1440]) {
    const page = await pageFor(width); await enter(page, scenario({ meter_type: 'DUAL', consumption: split('0', '0') }));
    await page.getByRole('button', { name: 'Τι αλλάζει αν…', exact: true }).click(); await page.locator('#trial-kwh').fill('300');
    assert((await page.locator('#trial-share-slider').getAttribute('aria-valuetext')).includes('Άγνωστο'));
    await page.getByText('Αντέχει η αρχική επιλογή σε ένα εύρος χρήσης;', { exact: true }).click(); await page.locator('#range-lower').fill('0'); await page.locator('#range-upper').fill('60');
    assert((await page.getByTestId('range-not-computable').innerText()).includes('κατανομή ζωνών'));
    await page.locator('#trial-pair-0').selectOption('A1'); await page.locator('#trial-pair-1').selectOption('A2');
    assert((await page.getByTestId('pair-intersection').innerText()).includes('200,00')); assert.equal(await page.getByTestId('pair-global-limit').count(), 1);
    await page.locator('#trial-share').fill('100'); assert.equal(await page.getByTestId('range-not-computable').count(), 0);
    assert((await page.locator('.trial-analysis').last().innerText()).includes('δεν παραμένει οικονομικότερο'));
    await fits(page); await page.screenshot({ path: resolve(output, `range-fixed-${width}.png`), fullPage: true });
    cases.push({ case: 'regression-unknown-dual-global-proof-and-valid-unified-pair', width, passed: true }); await page.context().close();
  }
  {
    const page = await pageFor(390); await enter(page, scenario({ priority: 'FIXED_RATE' }));
    await page.getByRole('button', { name: 'Τι αλλάζει αν…', exact: true }).click(); await page.locator('#trial-kwh').fill('150');
    await page.getByText('Αντέχει η αρχική επιλογή σε ένα εύρος χρήσης;', { exact: true }).click(); await page.locator('#range-lower').fill('');
    await page.getByRole('button', { name: 'Στα αρχικά αποτελέσματα' }).click(); await page.getByRole('button', { name: 'Διόρθωση στοιχείων', exact: true }).click(); await fits(page);
    await page.getByRole('button', { name: 'Διόρθωση κατανάλωσης', exact: true }).click(); await page.locator('#field-total').fill('700');
    await page.getByRole('button', { name: 'Ακύρωση διορθώσεων', exact: true }).click();
    assert.equal(await page.getByTestId('first-programs').getAttribute('data-program-ids'), 'A2');
    await page.getByRole('button', { name: 'Τι αλλάζει αν…', exact: true }).click(); assert.equal(await page.locator('#trial-kwh').inputValue(), '150'); assert.equal(await page.locator('#range-lower').inputValue(), '');
    assert.equal(await page.locator('[data-pair-total="A1"]').getAttribute('data-cents'), '2600');
    await page.getByRole('button', { name: 'Στα αρχικά αποτελέσματα' }).click(); await page.getByRole('button', { name: 'Διόρθωση στοιχείων', exact: true }).click();
    await page.getByRole('button', { name: 'Διόρθωση κατανάλωσης', exact: true }).click(); assert.equal(await page.locator('#field-total').inputValue(), '300');
    await page.locator('#field-total').fill('700'); await next(page); await next(page); await page.getByRole('button', { name: 'Δες τη σύγκριση' }).click();
    await page.getByRole('button', { name: 'Τι αλλάζει αν…', exact: true }).click(); assert.equal(await page.locator('#trial-kwh').inputValue(), '700.00');
    await fits(page); cases.push({ case: 'cancel-edit-retains-trial-and-range-resubmit-replaces-them', width: 390, passed: true }); await page.context().close();
  }
  {
    const page = await pageFor(320, 640); await enter(page, scenario({ consumption: total('0.01') }));
    await page.getByRole('button', { name: 'Τι αλλάζει αν…', exact: true }).click(); await page.getByText('Αντέχει η αρχική επιλογή σε ένα εύρος χρήσης;', { exact: true }).click();
    assert((await page.getByTestId('range-precision').innerText()).includes('0,008000 έως 0,012000')); assert.equal(await page.getByTestId('range-single-point').count(), 0);
    await page.getByRole('button', { name: 'Χρήση των εμφανιζόμενων ορίων', exact: true }).click(); assert.equal(await page.getByTestId('range-single-point').count(), 1);
    await page.locator('#range-upper').fill(''); assert.equal(await page.locator('#range-upper').getAttribute('aria-invalid'), 'true'); assert.equal(await page.locator('#range-upper').getAttribute('aria-describedby'), 'range-error');
    await page.waitForFunction(() => document.querySelector('[data-testid="trial-announcement"]').textContent.includes('0,01'));
    await page.evaluate(() => { window.reviewAnnouncements = []; new MutationObserver(() => window.reviewAnnouncements.push(document.querySelector('[data-testid="trial-announcement"]').textContent)).observe(document.querySelector('[data-testid="trial-announcement"]'), { childList: true, subtree: true, characterData: true }); });
    for (const q of ['20', '21', '22', '23']) await page.locator('#trial-kwh').fill(q);
    await page.waitForFunction(() => document.querySelector('[data-testid="trial-announcement"]').textContent.includes('23,00'));
    assert.equal(await page.evaluate(() => window.reviewAnnouncements.filter(Boolean).length), 1, 'Coalesce live announcements');
    await page.locator('#trial-kwh').focus();
    for (let i = 0; i < 10; i++) {
      const geometry = await page.evaluate(() => { const a = document.activeElement.getBoundingClientRect(), b = document.querySelector('.trial-live-summary').getBoundingClientRect(); return { a: { top: a.top, bottom: a.bottom }, b: { top: b.top, bottom: b.bottom } }; });
      assert(geometry.a.bottom <= geometry.b.top || geometry.a.top >= geometry.b.bottom, 'Focused control obscured by summary'); await page.keyboard.press('Tab');
    }
    await fits(page); await page.screenshot({ path: resolve(output, 'keyboard-320.png') });
    cases.push({ case: 'range-precision-single-point-accessible-errors-debounced-status-keyboard', width: 320, passed: true }); await page.context().close();
  }
  {
    const page = await pageFor(1440); await enter(page, scenario()); await page.getByRole('button', { name: 'Διόρθωση στοιχείων', exact: true }).click();
    await page.getByRole('button', { name: 'Διόρθωση κατανάλωσης', exact: true }).click(); await page.getByRole('button', { name: 'Πίσω', exact: true }).click();
    assert.equal(await page.locator('#current-demo-program').isVisible(), false); await page.getByRole('button', { name: 'Ακύρωση διορθώσεων', exact: true }).click();
    await page.reload(); assert.equal(await page.getByRole('button', { name: 'Ας ξεκινήσουμε', exact: true }).count(), 1);
    assert((await page.locator('.privacy-note').innerText()).includes('ανανέωση'));
    cases.push({ case: 'desktop-internal-back-and-reload-session-disclosure', width: 1440, passed: true }); await page.context().close();
  }
  {
    const page = await pageFor(1440);
    assert.equal(await page.locator('.skip-link').evaluate(e => getComputedStyle(e).clipPath), 'inset(50%)');
    await page.locator('.skip-link').focus(); await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'main-content');
    const colors = await page.locator('.primary-button').evaluate(e => ({ fg: getComputedStyle(e).color, bg: getComputedStyle(e).backgroundColor }));
    const luminance = color => color.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
    const values = [luminance(colors.fg), luminance(colors.bg)].sort((a, b) => b - a);
    const ratio = (values[0] + .05) / (values[1] + .05); assert(ratio >= 4.5);
    await page.getByRole('button', { name: 'Ας ξεκινήσουμε', exact: true }).focus();
    assert.equal(await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle), 'solid');
    await fits(page); await page.screenshot({ path: resolve(output, 'desktop-welcome.png') });
    cases.push({ case: 'keyboard-skip-link-and-primary-button-contrast', width: 1440, contrast: Number(ratio.toFixed(2)), passed: true }); await page.context().close();
  }
  assert.deepEqual(errors, []); assert.deepEqual(consoleErrors, []); assert.deepEqual(failedResponses, []); assert.deepEqual(externalRequests, []);
  console.log(JSON.stringify({ cases, errors, consoleErrors, failedResponses, externalRequests }, null, 2));
} finally { await writeFile(resolve(output, 'report.json'), JSON.stringify({ cases, errors, consoleErrors, failedResponses, externalRequests }, null, 2)); await browser.close(); }
