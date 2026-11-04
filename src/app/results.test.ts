import assert from 'node:assert/strict';
import { it } from 'node:test';
import { buildResultsView, comparisonDifference, defaultComparison, monetaryFact, rationale } from './results.ts';
import { DEMO_CATALOG, DEMO_PROGRAMS, demoContract } from '../data/demoPrograms.ts';
import { comparePair } from '../domain/analysis.ts';
import { recommend } from '../domain/recommend.ts';
import { verifiedCases, scenario, split, total } from '../tests/fixtures.ts';
import type { Program } from '../domain/types.ts';

for (const example of verifiedCases) it(`result view preserves every computed amount and winner in ${example.id}`, () => {
  const result = recommend(example.input,DEMO_CATALOG);
  const before = structuredClone(result);
  const view = buildResultsView(result,DEMO_CATALOG);
  assert.deepEqual(view.primary.first_program_ids,result.primary_category==='FIXED_RATE' ? example.fixed : example.cheapest);
  assert.equal(new Set(view.featured.map(v=>v.id)).size,view.featured.length);
  for (const program of view.programs) {
    const evaluation = result.evaluations.find(e=>e.program.program_id===program.id)!;
    assert.equal(program.total_cents,evaluation.charges?.total_cents ?? null);
    assert.equal(program.charges,evaluation.charges);
    assert.equal(program.cheapest,example.cheapest.includes(program.id));
    assert.equal(program.fixed,example.fixed.includes(program.id));
    if (program.total_cents === null) assert(!view.featured.some(p=>p.id===program.id));
  }
  assert.deepEqual(result,before);
});
it('same winner receives two category labels in exactly one featured card', () => {
  const result = recommend(scenario({ condition_answers:{e_bill:'YES',direct_debit:'YES'} }),DEMO_CATALOG);
  const view = buildResultsView(result,DEMO_CATALOG);
  assert.equal(view.featured.length,1); assert.equal(view.featured[0]!.id,'C1');
  assert(view.featured[0]!.personal && view.featured[0]!.cheapest && view.featured[0]!.fixed);
  assert(view.same_first_set);
});
it('overlapping first-place sets keep both winners and never manufacture a second A2', () => {
  const view = buildResultsView(recommend(scenario({ consumption:total('600') }),DEMO_CATALOG),DEMO_CATALOG);
  assert.deepEqual(view.featured.map(v=>v.id),['A2','B1']);
  assert(view.featured[0]!.fixed); assert(!view.featured[1]!.fixed);
  assert(view.featured.every(v=>v.reason.some(t=>t.includes('Ίδιο κόστος στην ακρίβεια'))));
});
it('fixed priority shows its actual winner and the cheaper variable alternative without endorsing it as fixed', () => {
  const result = recommend(scenario({ priority:'FIXED_RATE' }),DEMO_CATALOG);
  const view = buildResultsView(result,DEMO_CATALOG);
  assert.deepEqual(view.featured.map(v=>v.id),['A2','B1']);
  assert(view.featured[0]!.personal); assert(!view.featured[1]!.personal);
  assert(view.featured[1]!.reason.some(t=>t.includes('δεν ανήκει στην προτεραιότητά')));
  assert.deepEqual(defaultComparison(result),['A2','B1']);
  assert.equal(comparePair(result,['A2','B1']).status,'NOT_COMPUTABLE');
  const explicitScope = comparePair(result,['A2','B1'],'CHEAPEST_SCENARIO');
  assert.equal(explicitScope.status,'AVAILABLE');
  if (explicitScope.status==='AVAILABLE') { assert.equal(explicitScope.difference_cents,300); assert.equal(explicitScope.category_id,'CHEAPEST_SCENARIO'); }
  assert.equal(result.primary_category,'FIXED_RATE');
});
it('a fixed-price alternative explains its winning fixed category instead of just its lower overall rank', () => {
  const view = buildResultsView(recommend(scenario(),DEMO_CATALOG),DEMO_CATALOG);
  const alternative = view.featured.find(v=>v.id==='A2')!;
  assert(alternative.reason[0]!.includes('χαμηλότερο συγκρινόμενο κόστος'));
  assert(alternative.reason[0]!.includes('σταθερής τιμής'));
});
it('baseline amounts remain absent without exact contract terms and are not substituted by discount effects', () => {
  const view = buildResultsView(recommend(scenario(),DEMO_CATALOG),DEMO_CATALOG);
  assert(view.programs.every(v=>v.evaluation.baseline_difference_cents===null));
  assert(view.programs.every(v=>v.baseline_text.includes('Δεν έχει οριστεί ακριβές')));
  const known = buildResultsView(recommend(scenario({ current_contract:demoContract('A1'),condition_answers:{e_bill:'YES',direct_debit:'YES'} }),DEMO_CATALOG),DEMO_CATALOG).programs.find(p=>p.id==='C1')!;
  assert(known.baseline_text.includes('17,00 €'));
  assert.equal(known.charges!.discount_effect_cents,2400);
  assert(known.baseline_text.includes('όχι καθαρό όφελος'));
});
it('discount detail facts contain the actual answers and all required terms', () => {
  const result = recommend(scenario({ condition_answers:{e_bill:'YES',direct_debit:'UNKNOWN'} }),DEMO_CATALOG);
  const view = buildResultsView(result,DEMO_CATALOG).programs.find(v=>v.id==='C1')!;
  assert.deepEqual(view.conditions.map(c=>[c.id,c.answer]),[['E_BILL','YES'],['DIRECT_DEBIT','UNKNOWN']]);
  assert.equal(view.charges!.total_cents,5700); assert.equal(view.evaluation.discount_evaluation!.status,'UNCONFIRMED');
  assert(view.reason.some(t=>t.includes('βασική τιμή')));
});
it('breakdown view preserves dual rounding adjustment, including tiny valid quantities', () => {
  const view = buildResultsView(recommend(scenario({ meter_type:'DUAL',consumption:split('0.03','0.07') }),DEMO_CATALOG),DEMO_CATALOG).programs.find(p=>p.id==='D1')!;
  assert.equal(view.charges!.energy_rounding_adjustment_cents,-1);
  assert.equal(view.charges!.energy_total_cents,1); assert.equal(view.total_cents,601);
});
it('missing or incompatible data never becomes a zero-priced offer', () => {
  const original = DEMO_PROGRAMS.find(p=>p.program_id==='C1')!;
  const missing = {...original,base_rates:{basis:'UNIFIED'}} as unknown as Program;
  const catalog = {...DEMO_CATALOG,programs:[missing]};
  const view = buildResultsView(recommend(scenario(),catalog),catalog);
  assert.equal(view.featured.length,0); assert.equal(view.ranked.length,0);
  assert.equal(view.excluded[0]!.view.total_cents,null);
  assert(view.excluded[0]!.reasons[0]!.includes('ελλιπή'));
  assert.equal(monetaryFact(undefined),'Άγνωστο — δεν εκτιμάται'); assert.equal(monetaryFact(NaN),'Άγνωστο — δεν εκτιμάται');
});
it('empty fixed category remains empty while comparable variable option is labeled as an alternative', () => {
  const catalog = {...DEMO_CATALOG,programs:DEMO_PROGRAMS.filter(p=>p.program_id==='B1')};
  const result = recommend(scenario({priority:'FIXED_RATE'}),catalog);
  const view = buildResultsView(result,catalog);
  assert.deepEqual(view.primary.first_program_ids,[]); assert.equal(view.featured.length,1);
  assert.equal(view.featured[0]!.personal,false); assert.equal(view.comparable.length,1);
  assert.deepEqual(defaultComparison(result),['B1']);
});
it('comparison difference uses displayed cents and allows zero while rejecting unavailable amounts', () => {
  const result = recommend(scenario({consumption:total('200')}),DEMO_CATALOG);
  const view = buildResultsView(result,DEMO_CATALOG);
  const a1=view.programs.find(p=>p.id==='A1')!,a2=view.programs.find(p=>p.id==='A2')!,d1=view.programs.find(p=>p.id==='D1')!;
  assert.equal(comparisonDifference(a1,a2),0); assert.equal(comparisonDifference(a1,d1),null);
  const pair=comparePair(result,['A1','A2'],'CHEAPEST_SCENARIO'); assert.equal(pair.status,'AVAILABLE');
  if(pair.status==='AVAILABLE') assert.deepEqual(pair.globally_cheaper_program_ids_at_intersection,['B1']);
});
it('stability text refers to price per kWh rather than a guaranteed final bill', () => {
  const result=recommend(scenario({priority:'FIXED_RATE'}),DEMO_CATALOG);
  const a2=buildResultsView(result,DEMO_CATALOG).programs.find(v=>v.id==='A2')!;
  assert(a2.price_type_text.includes('Δεν σημαίνει σταθερό τελικό λογαριασμό'));
  assert(rationale(result,a2.evaluation).some(t=>t.includes('σταθερής τιμής')));
});
