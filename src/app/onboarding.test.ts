import assert from 'node:assert/strict';
import { it } from 'node:test';
import { changeMeter, changeSource, emptyForm, formFromScenario, normalizationText, quantityNotice, toUserScenario, validateConsumptionDraft, validateFormStep } from './onboarding.ts';
import type { FormDraft } from './onboarding.ts';
import { DEMO_CATALOG, demoContract } from '../data/demoPrograms.ts';
import { exactKey } from '../domain/exact.ts';
import { recommend } from '../domain/recommend.ts';
import { initialAppState, reduceApp } from './state.ts';
import { scenario, split, total } from '../tests/fixtures.ts';

const bill = (changes: Partial<FormDraft> = {}): FormDraft => ({ ...emptyForm, purpose:'EXISTING_SUPPLY', source:'BILL_MANUAL', meter:'SINGLE', total:'900', days:'90', ...changes });
const complete = (changes: Partial<FormDraft> = {}): FormDraft => bill({ priority:'LOWEST_SCENARIO_COST',e_bill:'NO',direct_debit:'NO', ...changes });

it('onboarding starts without silent choices or invented consumption', () => {
  assert.equal(emptyForm.purpose,''); assert.equal(emptyForm.source,''); assert.equal(emptyForm.priority,'');
  assert.equal(validateConsumptionDraft(emptyForm).preview,null);
  assert.equal(toUserScenario(emptyForm,null).ok,false);
});
it('quantity preview works before preferences without making those answers submit-ready', () => {
  const draft = bill();
  const checked = validateConsumptionDraft(draft); assert(checked.preview);
  assert.equal(exactKey(checked.preview.total_kwh_30),'300/1');
  assert(!('condition_answers' in checked.preview));
  assert.equal(validateFormStep(draft,'preferences').length,3);
  assert.equal(toUserScenario(draft,null).ok,false);
});
it('manual input preserves original days and quantities, not just rounded monthly usage', () => {
  const result = toUserScenario(complete(),null); assert(result.ok);
  assert.deepEqual(result.value.consumption,total('900',90));
  assert.equal(result.value.current_contract,null);
  assert.equal(recommend(result.value,DEMO_CATALOG).evaluations.find(e=>e.program.program_id==='B1')!.charges!.total_cents,4300);
});
it('dual input normalizes both zones over the same bill period', () => {
  const result = validateConsumptionDraft(bill({ meter:'DUAL',allocation:'SPLIT',normal:'360',reduced:'240',days:'60' }));
  assert(result.preview); assert.equal(exactKey(result.preview.normal_kwh_30!),'180/1');
  assert.equal(exactKey(result.preview.reduced_kwh_30!),'120/1');
});
it('unknown dual allocation does not invent a distribution', () => {
  const result = toUserScenario(complete({ meter:'DUAL',allocation:'UNKNOWN',total:'300',days:'30' }),null); assert(result.ok);
  const evaluation = recommend(result.value,DEMO_CATALOG).evaluations.find(e=>e.program.program_id==='D1')!;
  assert.equal(evaluation.charges,null); assert.deepEqual(evaluation.reason_codes,['ALLOCATION_UNKNOWN']);
});
it('zero is valid consumption while empty fields and zero days have understandable errors', () => {
  const zero = validateConsumptionDraft(bill({ total:'0',days:'30' })); assert(zero.preview);
  assert(quantityNotice(zero.preview)!.includes('μόνο τα πάγια'));
  const missing = validateConsumptionDraft(bill({ total:'',days:'' }));
  assert.deepEqual(missing.errors.map(e=>e.field),['total','days']);
  assert(missing.errors.some(e=>e.field==='total' && e.message.includes('Συμπλήρωσε')));
  assert(missing.errors.some(e=>e.field==='days' && e.message.includes('Συμπλήρωσε')));
  const invalid = validateConsumptionDraft(bill({ days:'0' }));
  assert(invalid.errors.some(e=>e.field==='days' && e.message.includes('Το 0 δεν είναι έγκυρο')));
});
it('large, negative, malformed and normalized-out-of-range quantities cannot progress', () => {
  for (const input of ['-5','1.000','abc','Infinity','50000.01']) assert(validateConsumptionDraft(bill({ total:input })).errors.length>0,input);
  const large = validateConsumptionDraft(bill({ total:'200',days:'1' }));
  assert.equal(large.preview,null); assert(large.errors.some(e=>e.message.includes('5.000 kWh ανά 30 ημέρες')));
  const sum = validateConsumptionDraft(bill({ meter:'DUAL',allocation:'SPLIT',normal:'30000',reduced:'30000',days:'366' }));
  assert(sum.errors.some(e=>e.message.includes('50.000 kWh')));
});
it('changing meter clears incompatible entries rather than moving total into a zone', () => {
  const changed = changeMeter(bill(),'DUAL');
  assert.equal(changed.total,''); assert.equal(changed.normal,''); assert.equal(changed.allocation,''); assert.equal(changed.days,'90');
  assert.equal(validateConsumptionDraft(changed).preview,null);
});
it('changing source retains bill inputs separately and never treats a 90-day total as monthly', () => {
  const changed = changeSource(bill(),'INDICATIVE');
  assert.equal(changed.total,'900'); assert.equal(changed.indicative_total,'');
  assert.equal(validateConsumptionDraft(changed).preview,null);
  const restored = changeSource(changed,'BILL_MANUAL'); assert.equal(exactKey(validateConsumptionDraft(restored).preview!.total_kwh_30),'300/1');
});
it('indicative use requires a selected or custom starting value and always uses 30 days', () => {
  const draft = complete({ purpose:'NEW_SUPPLY',source:'INDICATIVE',meter:'UNKNOWN',indicative_total:'450,5',indicative_preset:'CUSTOM' });
  const result = toUserScenario(draft,null); assert(result.ok);
  assert.deepEqual(result.value.consumption,total('450,5',30));
  assert.equal(result.value.current_contract,null);
  assert.equal(validateConsumptionDraft({ ...draft,indicative_preset:null }).preview,null);
});
it('indicative dual share is explicit and validated, with unknown allowed', () => {
  const draft = complete({ source:'INDICATIVE',meter:'DUAL',allocation:'SHARE',indicative_total:'300',indicative_preset:'KWH_300',share:'40' });
  const checked = validateConsumptionDraft(draft); assert(checked.preview);
  assert.equal(exactKey(checked.preview.normal_kwh_30!),'180/1'); assert.equal(checked.preview.allocation_source,'ASSUMED_SHARE');
  assert.equal(validateConsumptionDraft({ ...draft,share:'' }).preview,null);
  assert.equal(validateConsumptionDraft({ ...draft,share:'101' }).preview,null);
  assert.equal(validateConsumptionDraft({ ...draft,allocation:'UNKNOWN',share:'' }).preview!.normal_kwh_30,null);
});
it('unknown discount answers are explicit and never turned into consent', () => {
  const result = toUserScenario(complete({ e_bill:'UNKNOWN',direct_debit:'UNKNOWN' }),null); assert(result.ok);
  assert.deepEqual(result.value.condition_answers,{ e_bill:'UNKNOWN',direct_debit:'UNKNOWN' });
  const c1 = recommend(result.value,DEMO_CATALOG).evaluations.find(e=>e.program.program_id==='C1')!;
  assert.equal(c1.charges!.total_cents,5700);
});
it('editing round-trips original inputs and clears a contract for new supply', () => {
  const previous = scenario({ meter_type:'DUAL',consumption:split('360','240',60),current_contract:demoContract('A1') });
  const draft = formFromScenario(previous);
  const restored = toUserScenario(draft,previous); assert(restored.ok);
  assert.deepEqual(restored.value,previous);
  const fresh = toUserScenario({ ...draft,purpose:'NEW_SUPPLY' },previous); assert(fresh.ok); assert.equal(fresh.value.current_contract,null);
});
it('normalization retains exact recurring fractions and high-use reminders do not block valid use', () => {
  const q = validateConsumptionDraft(bill({ total:'1',days:'7' })); assert(q.preview);
  assert.equal(exactKey(q.preview.total_kwh_30),'30/7'); assert(normalizationText(q.preview).includes('4,29'));
  const high = validateConsumptionDraft(bill({ total:'1800',days:'30' })); assert(high.preview);
  assert(quantityNotice(high.preview)); assert.equal(high.errors.length,0);
});
it('completed form submission atomically reaches results without a required baseline', () => {
  const parsed = toUserScenario(complete(),null); assert(parsed.ok);
  const state = reduceApp(initialAppState,{ type:'SUBMIT_SCENARIO',scenario:parsed.value },DEMO_CATALOG);
  assert.equal(state.screen,'RESULTS'); assert.equal(state.submitted!.current_contract,null);
  assert.deepEqual(state.base_result!.cheapest_category.first_program_ids,['B1']);
});
