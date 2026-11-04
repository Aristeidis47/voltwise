import assert from 'node:assert/strict';
import { it } from 'node:test';
import { DEMO_CATALOG, demoContract } from '../data/demoPrograms.ts';
import { DEMO_BILL_SAMPLE } from '../data/demoBill.ts';
import { recommend } from '../domain/recommend.ts';
import { exactKey } from '../domain/exact.ts';
import { scenario, total } from '../tests/fixtures.ts';
import { buildBaselineView, exitFeeView } from './baseline.ts';
import { applyBillSample, contractSelection, selectDemoContract, setContractFeeKnowledge, updateDraft } from './optional.ts';
import { changeMeter, changeSource, emptyForm, formFromScenario, toUserScenario, validateConsumptionDraft, validateFormStep } from './onboarding.ts';
import { createTrialDraft, evaluateTrial, trialInput } from './trial.ts';

const form = () => ({ ...emptyForm, purpose: 'EXISTING_SUPPLY' as const, source: 'BILL_MANUAL' as const, meter: 'SINGLE' as const, total: '900', days: '90', priority: 'LOWEST_SCENARIO_COST' as const, e_bill: 'NO' as const, direct_debit: 'NO' as const });
it('optional routes are not required for the ordinary manual flow', () => {
  const parsed = toUserScenario(form(), null); assert(parsed.ok);
  const result = recommend(parsed.value, DEMO_CATALOG), view = buildBaselineView(result);
  assert.equal(result.status, 'READY'); assert.equal(view.baseline, null); assert.deepEqual(view.rows, []);
  assert.equal(result.switching_assessment.net_savings_cents, null); assert.equal(view.fee.amount, null);
});
it('an exact demo selection includes the precise version and documented zero fee', () => {
  const contract = selectDemoContract('A1')!;
  assert.equal(contractSelection(contract), 'A1'); assert.equal(contract.terms_revision, 'DEMO-1/A1/TERMS-1');
  const result = recommend(scenario({ current_contract: contract }), DEMO_CATALOG), view = buildBaselineView(result, ['B1']);
  assert.equal(view.baseline!.charges!.energy_total_cents, 4800);
  assert.equal(view.baseline!.charges!.fixed_fee_cents_30, 200);
  assert.equal(view.baseline!.charges!.total_cents, 5000);
  assert.equal(view.rows[0]!.evaluation.charges!.total_cents, 4300); assert.equal(view.rows[0]!.difference, 700);
  assert.equal(view.fee.amount, 0); assert.equal(view.fee.source, 'DEMO-1/A1/TERMS-1');
  assert.equal(result.switching_assessment.net_savings_cents, null);
});
it('provider-only and unknown selections produce no baseline, numeric difference or assumed zero fee', () => {
  for (const selection of ['', 'PROVIDER_ONLY']) {
    const contract = selectDemoContract(selection), result = recommend(scenario({ current_contract: contract }), DEMO_CATALOG);
    const view = buildBaselineView(result); assert.equal(view.baseline, null); assert.deepEqual(view.rows, []);
    assert(result.evaluations.every(e => e.baseline_difference_cents === null)); assert.equal(view.fee.amount, null);
    assert.equal(contractSelection(contract), selection);
  }
});
it('an unknown fee preserves an otherwise comparable recurring cost and requires checking before deciding', () => {
  const contract = setContractFeeKnowledge(demoContract('A1'), false);
  assert.equal(contract.exit_fee_evidence.status, 'UNKNOWN'); assert.equal(contract.exit_fee_evidence.amount_cents, null);
  const view = buildBaselineView(recommend(scenario({ current_contract: contract }), DEMO_CATALOG), ['B1']);
  assert.equal(view.rows[0]!.difference, 700); assert.equal(view.fee.amount, null);
  assert(view.fee.message.includes('πριν αποφασίσεις')); assert(view.fee.message.includes('Δεν θεωρείται μηδενικό'));
  assert.equal(setContractFeeKnowledge(contract, true).exit_fee_evidence.status, 'KNOWN_ZERO');
});
it('a known positive fee is a separate exact one-off amount, never subtracted from monthly comparison or ranking', () => {
  // Synthetic contract evidence exercises the existing KNOWN_AMOUNT branch; stock DEMO-1 terms stay zero.
  const contract = { ...demoContract('A1'), exit_fee_evidence: { status: 'KNOWN_AMOUNT' as const, amount_cents: 6000, evidence_reference: 'EXPLICIT_TEST_CASE/60EUR', unknown_reason: null } };
  const result = recommend(scenario({ current_contract: contract }), DEMO_CATALOG), view = buildBaselineView(result, ['B1']);
  assert.equal(view.fee.amount, 6000); assert(view.fee.message.includes('60,00 €')); assert(view.fee.message.includes('εφάπαξ'));
  assert.equal(view.baseline!.charges!.total_cents, 5000); assert.equal(view.rows[0]!.evaluation.charges!.total_cents, 4300);
  assert.equal(view.rows[0]!.difference, 700); assert.deepEqual(result.cheapest_category.first_program_ids, ['B1']);
  assert.equal(result.switching_assessment.net_savings_cents, null);
});
it('unresolved or mismatched exact references cannot borrow a displayed price or zero fee', () => {
  const current_contract = { ...demoContract('A1'), terms_revision: 'WRONG' };
  const view = buildBaselineView(recommend(scenario({ current_contract }), DEMO_CATALOG));
  assert.equal(view.baseline, null); assert.deepEqual(view.rows, []); assert.equal(view.fee.amount, null);
});
it('an incompatible dual baseline does not invent today cost or a difference', () => {
  const view = buildBaselineView(recommend(scenario({ current_contract: demoContract('D1') }), DEMO_CATALOG));
  assert.equal(view.baseline, null); assert.deepEqual(view.rows, []); assert(view.unavailable.includes('διζωνική'));
  assert.equal(view.fee.amount, 0, 'Resolved contractual fee is independent of missing consumption allocation');
});
it('a variable baseline remains calculable with fixed-rate priority without becoming a fixed recommendation', () => {
  const result = recommend(scenario({ priority: 'FIXED_RATE', current_contract: demoContract('B1') }), DEMO_CATALOG);
  const view = buildBaselineView(result, ['A2']);
  assert.equal(view.baseline!.program.program_id, 'B1'); assert.equal(view.rows[0]!.difference, -300);
  assert.deepEqual(result.fixed_category.first_program_ids, ['A2']);
});
it('the current winner is recognized and a same-program comparison correctly remains zero', () => {
  const result = recommend(scenario({ current_contract: demoContract('A1'), consumption: total('50') }), DEMO_CATALOG);
  const view = buildBaselineView(result, ['A1']); assert(view.still_first); assert.equal(view.rows[0]!.difference, 0);
  assert(view.rows[0]!.message.includes('Ίδιο συγκρινόμενο κόστος'));
});
it('trial baseline and alternatives share the new consumption and discount answers', () => {
  const result = recommend(scenario({ current_contract: demoContract('C1'), condition_answers: { e_bill: 'YES', direct_debit: 'YES' } }), DEMO_CATALOG);
  assert.equal(buildBaselineView(result).baseline!.charges!.total_cents, 3300);
  const n = result.normalized_scenario!, draft = createTrialDraft(n);
  const trial = evaluateTrial(n, trialInput(n, { ...draft, answers: { e_bill: 'YES', direct_debit: 'NO' }, quantity_override: '350' }), DEMO_CATALOG);
  assert(trial.ok); const view = buildBaselineView(trial.value, ['B1']);
  assert.equal(view.baseline!.charges!.total_cents, 6600); // 350*.18+3
  assert.equal(view.rows[0]!.evaluation.charges!.total_cents, 4950); assert.equal(view.rows[0]!.difference, 1650);
  assert.equal(buildBaselineView(result).baseline!.charges!.total_cents, 3300);
});
it('loading a sample replaces only consumption fields, without consent, priority or a current contract', () => {
  const original = { ...form(), current_contract: demoContract('B1') }, saved = structuredClone(original);
  const applied = applyBillSample(original); assert.deepEqual(original, saved);
  assert.deepEqual([applied.normal, applied.reduced, applied.days, applied.meter], ['360', '240', '60', 'DUAL']);
  assert.equal(applied.source, 'DEMO_SAMPLE'); assert.equal(applied.sample_confirmed, false);
  assert.equal(applied.current_contract, original.current_contract); assert.equal(applied.priority, original.priority);
  assert.equal(applied.e_bill, original.e_bill); assert.equal(DEMO_BILL_SAMPLE.is_real_bill, false);
});
it('sample quantities have a preview but cannot be submitted until explicitly confirmed', () => {
  const applied = applyBillSample(form()), preview = validateConsumptionDraft(applied).preview!;
  assert.equal(exactKey(preview.total_kwh_30), '300/1'); assert.equal(exactKey(preview.normal_kwh_30!), '180/1');
  assert.equal(exactKey(preview.reduced_kwh_30!), '120/1');
  assert(validateFormStep(applied, 'consumption').some(e => e.field === 'sample_confirmed'));
  assert.equal(toUserScenario(applied, null).ok, false);
  const confirmed = toUserScenario({ ...applied, sample_confirmed: true }, null); assert(confirmed.ok);
  assert.equal(confirmed.value.consumption_source, 'DEMO_SAMPLE'); assert.deepEqual(confirmed.value.consumption, DEMO_BILL_SAMPLE.consumption);
  assert.equal(confirmed.value.current_contract, null);
});
it('editing sample quantities invalidates confirmation while preference-only edits preserve it', () => {
  const applied = { ...applyBillSample(form()), sample_confirmed: true };
  assert.equal(updateDraft(applied, { days: '30' }).sample_confirmed, false);
  assert.equal(updateDraft(applied, { normal: '400' }).sample_confirmed, false);
  assert.equal(updateDraft(applied, { priority: 'FIXED_RATE' }).sample_confirmed, true);
  assert.equal(updateDraft(applied, { days: '60' }).sample_confirmed, true);
  assert.equal(changeMeter(applied, 'SINGLE').sample_confirmed, false);
});
it('leaving the sample never silently rebrands fictional quantities as a real manual bill', () => {
  const applied = { ...applyBillSample(form()), sample_confirmed: true };
  const manual = changeSource(applied, 'BILL_MANUAL');
  assert.deepEqual([manual.total, manual.normal, manual.reduced, manual.days, manual.meter], ['', '', '', '', '']);
  assert.equal(manual.sample_confirmed, false); assert.equal(validateConsumptionDraft(manual).preview, null);
});
it('editing a submitted sample keeps its provenance, confirmed quantities and independent exact baseline', () => {
  const applied = { ...applyBillSample(form()), sample_confirmed: true, current_contract: demoContract('A1') };
  const parsed = toUserScenario(applied, null); assert(parsed.ok);
  const editing = formFromScenario(parsed.value); assert.equal(editing.source, 'DEMO_SAMPLE'); assert.equal(editing.sample_confirmed, true);
  const again = toUserScenario(editing, parsed.value); assert(again.ok); assert.deepEqual(again.value, parsed.value);
  const fresh = toUserScenario({ ...editing, purpose: 'NEW_SUPPLY' }, parsed.value); assert(fresh.ok); assert.equal(fresh.value.current_contract, null);
});
it('an uncomputable alternative never turns into a zero difference against a valid baseline', () => {
  const result = recommend(scenario({ current_contract: demoContract('A1') }), DEMO_CATALOG);
  const view = buildBaselineView(result, ['D1']); assert(view.baseline); assert.deepEqual(view.rows, []);
  assert(view.no_candidate_message.includes('δεν έχει συγκρίσιμη χρέωση'));
});
it('fee presentation distinguishes known zero from unknown without invented evidence', () => {
  assert.equal(exitFeeView(demoContract('A1').exit_fee_evidence).amount, 0);
  const view = exitFeeView(setContractFeeKnowledge(demoContract('A1'), false).exit_fee_evidence);
  assert.equal(view.amount, null); assert.equal(view.source, null);
});
