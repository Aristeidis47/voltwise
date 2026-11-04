import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEMO_CATALOG, DEMO_PROGRAMS, demoContract } from '../data/demoPrograms.ts';
import { verifiedCases, scenario, split, total } from '../tests/fixtures.ts';
import { applyTrial, normalizeConsumption, validFee } from './normalize.ts';
import { add, cents, compare, decimal, exactKey, formatMoney, fraction, ZERO } from './exact.ts';
import { analyzeWinners, breakEven, checkRange, comparePair } from './analysis.ts';
import { explainProgram } from './explain.ts';
import { recommend, recommendNormalized } from './recommend.ts';
import type { Catalog, ContractReference, Program, RecommendationResult, TrialInput } from './types.ts';

const get = (result: RecommendationResult, id: string) => result.evaluations.find(e => e.program.program_id === id)!;
const subset = (...ids: string[]): Catalog => ({ ...DEMO_CATALOG, programs: DEMO_PROGRAMS.filter(p => ids.includes(p.program_id)) });
function normalized(input = scenario()) { const n = normalizeConsumption(input); assert(n.ok); return n.value; }
function trial(base = normalized(), overrides: Partial<TrialInput> = {}) {
  return applyTrial(base, { trial_id: 'trial', base_scenario_id: base.scenario_id, base_revision: base.scenario_revision,
    total_kwh_30_override: null, reduced_share_override_percent: null, condition_answers: base.condition_answers, ...overrides });
}

describe('Literal verified examples — real expected amounts and first-place sets', () => {
  for (const example of verifiedCases) it(example.id, () => {
    const before = structuredClone(example.input);
    const result = recommend(example.input, DEMO_CATALOG);
    assert.equal(result.status, 'READY');
    assert.deepEqual(['A1','A2','B1','C1','D1'].map(id => get(result,id).charges?.total_cents ?? null), example.totals);
    assert.deepEqual(result.cheapest_category.first_program_ids, example.cheapest);
    assert.deepEqual(result.fixed_category.first_program_ids, example.fixed);
    for (const e of result.evaluations) if (e.charges) {
      const c = e.charges;
      assert.equal(c.energy_total_cents + c.fixed_fee_cents_30, c.total_cents);
      assert.equal(c.energy_lines.reduce((sum,line) => sum + line.amount_cents, 0) + c.energy_rounding_adjustment_cents, c.energy_total_cents);
      assert.equal(cents(c.total_exact_eur), c.total_cents);
    } else assert.equal(e.baseline_difference_cents, null);
    assert.deepEqual(example.input, before, 'Pure calculations must not mutate input');
  });
  it('E18: exact baseline, correct discount, distinct 17€ baseline and 24€ discount effects', () => {
    const result = recommend(scenario({ current_contract: demoContract('A1'), condition_answers: { e_bill:'YES', direct_debit:'YES' } }), DEMO_CATALOG);
    assert.equal(get(result,'C1').charges!.total_cents, 3300);
    assert.equal(get(result,'C1').charges!.discount_effect_cents, 2400);
    assert.equal(get(result,'C1').baseline_difference_cents, 1700);
    assert.equal(result.switching_assessment.net_savings_cents, null);
  });
});

describe('Exact normalization and validation', () => {
  it('retains 30/7 and adds a 30-day fee only once', () => {
    assert.equal(exactKey(normalized(scenario({ consumption: total('1',7) })).total_kwh_30), '30/7');
    assert.equal(get(recommend(scenario({ consumption: total('900',90) }),DEMO_CATALOG),'A1').charges!.fixed_fee_cents_30,200);
  });
  it('accepts Greek decimals, rejects ambiguous text and never coerces empty text to zero', () => {
    assert.equal(compare(decimal('1,25'),fraction(5,4)),0);
    for (const invalid of ['', ' ', '-1', '1.000', '1,000', '1,234.56', 'NaN', 'Infinity', '1e3', 'abc', '.5']) {
      assert.equal(recommend(scenario({ consumption: total(invalid) }),DEMO_CATALOG).status,'INVALID_INPUT',invalid);
    }
    assert.equal(recommend(scenario({ consumption: total('1000') }),DEMO_CATALOG).status,'READY');
  });
  for (const days of [0,-1,1.5,367,NaN,Infinity]) it(`rejects days ${days}`, () => {
    assert.equal(recommend(scenario({ consumption: total('300',days) }),DEMO_CATALOG).status,'INVALID_INPUT');
  });
  it('enforces period and normalized caps, including exact boundary', () => {
    assert.equal(recommend(scenario({ consumption: total('50000',300) }),DEMO_CATALOG).status,'READY');
    assert.equal(recommend(scenario({ consumption: total('50000.01',366) }),DEMO_CATALOG).status,'INVALID_INPUT');
    assert.equal(recommend(scenario({ consumption: total('200',1) }),DEMO_CATALOG).validation_errors[0]!.code,'NORMALIZED_KWH_OUT_OF_RANGE');
    assert.equal(recommend(scenario({ meter_type:'DUAL', consumption:split('30000','30000',366) }),DEMO_CATALOG).status,'INVALID_INPUT');
  });
  it('rejects missing answers, conflicting quantities and new-supply contracts', () => {
    for (const payload of [
      { ...scenario(), condition_answers: { e_bill:'YES' } },
      { ...scenario(), meter_type:'DUAL', consumption:{ ...split('100','200'), total_kwh:'300' } },
      { ...scenario(), consumption: split('100','200') },
      { ...scenario(), purpose:'NEW_SUPPLY', current_contract:demoContract('A1') },
      { ...scenario(), meter_type:'UNKNOWN', consumption:{ quantity_mode:'TOTAL_AND_SHARE', total_kwh:'300', reduced_share_percent:'50', period_days:30 } },
    ]) assert.equal(recommend(payload,DEMO_CATALOG).status,'INVALID_INPUT');
  });
  it('requires explicit indicative presets and normalizes assumed dual shares', () => {
    const input = scenario({ purpose:'NEW_SUPPLY', consumption_source:'INDICATIVE', indicative_preset:'KWH_300', meter_type:'DUAL',
      consumption:{ quantity_mode:'TOTAL_AND_SHARE', total_kwh:'300', reduced_share_percent:'40', period_days:30 } });
    const result = recommend(input,DEMO_CATALOG);
    assert.equal(get(result,'D1').charges!.total_cents,4620);
    assert.equal(result.normalized_scenario!.allocation_source,'ASSUMED_SHARE');
    assert.equal(recommend({ ...input, indicative_preset:null },DEMO_CATALOG).status,'INVALID_INPUT');
    assert.equal(recommend({ ...input, indicative_preset:'KWH_150' },DEMO_CATALOG).status,'INVALID_INPUT');
    assert.equal(recommend({ ...input, consumption:total('300',60) },DEMO_CATALOG).status,'INVALID_INPUT');
  });
  it('distinguishes unknown meter, unknown allocation and explicit zero split', () => {
    assert.deepEqual(get(recommend(scenario({ meter_type:'UNKNOWN' }),DEMO_CATALOG),'D1').reason_codes,['METER_TYPE_UNKNOWN']);
    assert.deepEqual(get(recommend(scenario({ meter_type:'DUAL' }),DEMO_CATALOG),'D1').reason_codes,['ALLOCATION_UNKNOWN']);
    const zero = recommend(scenario({ meter_type:'DUAL', consumption:split('0','0') }),DEMO_CATALOG);
    assert.equal(get(zero,'D1').charges!.total_cents,600);
    assert.equal(zero.normalized_scenario!.reduced_share,null);
    assert.equal(get(recommend(scenario({ meter_type:'DUAL', consumption:total('0') }),DEMO_CATALOG),'D1').charges,null);
  });
  it('rounds half cents up and reconciles two-zone line rounding', () => {
    assert.equal(cents(decimal('0.065',6)),7);
    assert.equal(formatMoney(-1),'−0,01 €');
    const result = recommend(scenario({ meter_type:'DUAL', consumption:split('0.03','0.07') }),DEMO_CATALOG);
    assert.equal(get(result,'D1').charges!.energy_rounding_adjustment_cents,-1);
    assert.equal(get(result,'D1').charges!.total_cents,601);
  });
});

describe('Discount truth table, categories, ties and invalid catalog data', () => {
  for (const e of ['YES','NO','UNKNOWN'] as const) for (const d of ['YES','NO','UNKNOWN'] as const) it(`C1 ${e}/${d}`, () => {
    const result = recommend(scenario({ condition_answers:{ e_bill:e,direct_debit:d } }),DEMO_CATALOG);
    const c1 = get(result,'C1');
    assert.equal(c1.charges!.total_cents,e === 'YES' && d === 'YES' ? 3300 : 5700);
    assert.equal(c1.charges!.fixed_fee_cents_30,300);
    assert.equal(c1.discount_evaluation!.status,e === 'YES' && d === 'YES' ? 'APPLIED' : e === 'NO' || d === 'NO' ? 'NOT_MET' : 'UNCONFIRMED');
    assert.equal(get(result,'B1').charges!.total_cents,4300);
  });
  it('reports equal, overlapping and different first-place sets', () => {
    assert.equal(recommend(scenario({ consumption:total('50') }),DEMO_CATALOG).category_relation,'SAME_FIRST_SET');
    assert.equal(recommend(scenario({ consumption:total('600') }),DEMO_CATALOG).category_relation,'OVERLAPPING_FIRST_SETS');
    assert.equal(recommend(scenario(),DEMO_CATALOG).category_relation,'DIFFERENT_FIRST_SETS');
  });
  it('uses dense ranks and stable ID order without declaring a single winner', () => {
    const result = recommend(scenario({ consumption:total('600') }),{ ...DEMO_CATALOG, programs:[...DEMO_PROGRAMS].reverse() });
    assert.deepEqual(result.cheapest_category.ranked_entries.map(e => [e.program_id,e.dense_rank]),[['A2',1],['B1',1],['A1',2],['C1',3]]);
    assert.deepEqual(result.cheapest_category.first_program_ids,['A2','B1']);
  });
  it('never substitutes a variable rate when no fixed candidate exists', () => {
    const result = recommend(scenario({ priority:'FIXED_RATE' }),subset('B1'));
    assert.equal(result.status,'READY'); assert.equal(result.fixed_category.status,'EMPTY');
    assert.equal(result.primary_category,'FIXED_RATE'); assert.equal(result.category_relation,'ONE_CATEGORY_EMPTY');
  });
  it('distinguishes empty catalog, incompatibility, bad input and corrupt header', () => {
    assert.equal(recommend(scenario(),subset()).status,'NO_COMPARABLE_PROGRAMS');
    assert.equal(recommend(scenario(),subset('D1')).status,'NO_COMPARABLE_PROGRAMS');
    assert.equal(recommend(scenario({ consumption:total('') }),DEMO_CATALOG).cheapest_category.status,'NOT_EVALUATED');
    assert.equal(recommend(scenario(),{ ...DEMO_CATALOG,currency:'USD' } as unknown as Catalog).status,'INVALID_CATALOG');
  });
  it('rejects missing base rate even with a full discount, bad fees and duplicate IDs', () => {
    const c1 = DEMO_PROGRAMS.find(p=>p.program_id==='C1')!;
    const malformed = { ...c1,base_rates:{ basis:'UNIFIED' } } as unknown as Program;
    const result = recommend(scenario({ condition_answers:{ e_bill:'YES',direct_debit:'YES' } }),{ ...subset('B1'),programs:[malformed,...subset('B1').programs] });
    assert.equal(get(result,'C1').charges,null); assert.equal(result.fixed_category.status,'EMPTY');
    for (const fee of [-1,NaN,0.5]) assert.equal(get(recommend(scenario(),{ ...DEMO_CATALOG,programs:[{ ...c1,fixed_fee_cents_30:fee }] }),'C1').charges,null);
    const duplicated = recommend(scenario(),{ ...DEMO_CATALOG,programs:[c1,c1] });
    assert.equal(duplicated.status,'NO_COMPARABLE_PROGRAMS');
    assert(duplicated.evaluations.every(e=>e.reason_codes.includes('DUPLICATE_PROGRAM_ID')));
  });
  it('rejects unresolvable discount rules instead of silently guessing', () => {
    const result = recommend(scenario(),{ ...DEMO_CATALOG, discount_rules:[] });
    assert.equal(get(result,'C1').charges,null);
    assert(get(result,'C1').reason_codes.includes('INVALID_DISCOUNT_RULE'));
  });
});

describe('Baseline and uncertainty never manufacture switching savings', () => {
  it('does not infer baseline from provider or incomplete contract data', () => {
    const noContract = recommend(scenario(),DEMO_CATALOG);
    assert.equal(get(noContract,'B1').baseline_difference_cents,null);
    const incomplete = { ...demoContract('A1'), terms_revision:null };
    const result = recommend(scenario({ current_contract:incomplete }),DEMO_CATALOG);
    assert.equal(get(result,'B1').baseline_difference_cents,null);
    assert.equal(get(result,'B1').baseline_comparison_status,'INCOMPLETE_CONTRACT');
    assert.equal(result.switching_assessment.exit_fee_evidence.status,'UNKNOWN');
  });
  for (const [baseline,candidate,difference] of [['A1','B1',700],['A2','A1',-400],['B1','A2',-300]] as const) it(`${baseline} → ${candidate}: ${difference} cents`, () => {
    const result = recommend(scenario({ current_contract:demoContract(baseline),priority:'FIXED_RATE' }),DEMO_CATALOG);
    assert.equal(get(result,candidate).baseline_difference_cents,difference);
    assert.equal(result.switching_assessment.net_savings_cents,null);
  });
  it('handles current winner, incompatible dual baseline and wrong versions', () => {
    assert.equal(get(recommend(scenario({ current_contract:demoContract('A1'),consumption:total('50') }),DEMO_CATALOG),'A1').baseline_difference_cents,0);
    const dual = recommend(scenario({ meter_type:'DUAL',current_contract:demoContract('D1') }),DEMO_CATALOG);
    assert.equal(get(dual,'B1').baseline_comparison_status,'BASELINE_NOT_COMPUTABLE');
    assert.equal(get(recommend(scenario({ current_contract:{ ...demoContract('A1'),program_revision:'OLD' } }),DEMO_CATALOG),'B1').baseline_difference_cents,null);
  });
  it('does not calculate unknown exit fees or net savings, even when recurring pricing is known', () => {
    const current: ContractReference = { ...demoContract('A1'),exit_fee_evidence:{ status:'UNKNOWN',amount_cents:null,evidence_reference:null,unknown_reason:'AMOUNT_NOT_PROVIDED' } };
    const result = recommend(scenario({ current_contract:current }),DEMO_CATALOG);
    assert.equal(get(result,'B1').baseline_difference_cents,700);
    assert.equal(result.switching_assessment.exit_fee_evidence.amount_cents,null);
    assert.equal(result.switching_assessment.net_savings_cents,null);
    assert(result.notices.some(n=>n.includes('Δεν γνωρίζουμε τη ρήτρα')));
    assert.equal(validFee({ status:'UNKNOWN',amount_cents:0,evidence_reference:null,unknown_reason:'AMOUNT_NOT_PROVIDED' }),false);
    assert.equal(validFee({ status:'KNOWN_ZERO',amount_cents:0,evidence_reference:null,unknown_reason:null }),false);
  });
  it('keeps known one-off amounts outside recurring ranking and does not estimate payback', () => {
    const contract: ContractReference = { ...demoContract('A1'),exit_fee_evidence:{ status:'KNOWN_AMOUNT',amount_cents:10000,evidence_reference:'EXPLICIT_TEST_TERMS',unknown_reason:null } };
    const result = recommend(scenario({ current_contract:contract }),DEMO_CATALOG);
    assert.equal(get(result,'B1').charges!.total_cents,4300);
    assert.equal(result.switching_assessment.net_savings_cents,null);
  });
  it('new supply has no irrelevant early-exit notice or baseline amount', () => {
    const result = recommend(scenario({ purpose:'NEW_SUPPLY' }),DEMO_CATALOG);
    assert.equal(get(result,'B1').baseline_difference_cents,null);
    assert(!result.notices.some(n=>n.includes('Δεν γνωρίζουμε τη ρήτρα')));
  });
});

describe('What-if state, mathematical crossings and exact range proof', () => {
  it('trial preserves the exact original and its dual share without mutating the base', () => {
    const base = normalized(scenario({ meter_type:'DUAL',consumption:split('180','120') }));
    const changed = trial(base,{ total_kwh_30_override:'600' }); assert(changed.ok);
    assert.equal(exactKey(changed.value.normal_kwh_30!),'360/1'); assert.equal(exactKey(changed.value.reduced_kwh_30!),'240/1');
    assert.equal(exactKey(base.total_kwh_30),'300/1');
    const repeating = normalized(scenario({ consumption:total('1',7) }));
    const unchanged = trial(repeating); assert(unchanged.ok); assert.equal(exactKey(unchanged.value.total_kwh_30),'30/7');
  });
  it('rejects stale, invalid and non-dual share trials', () => {
    assert.equal(trial(normalized(),{ base_revision:2 }).ok,false);
    assert.equal(trial(normalized(),{ total_kwh_30_override:'' }).ok,false);
    assert.equal(trial(normalized(),{ total_kwh_30_override:'5000.01' }).ok,false);
    assert.equal(trial(normalized(),{ reduced_share_override_percent:'50' }).ok,false);
  });
  it('distinct trial assumptions cannot reuse an identical result-state identity', () => {
    const base = normalized();
    const a = trial(base,{ total_kwh_30_override:'50' });
    const b = trial(base,{ total_kwh_30_override:'700' });
    assert(a.ok && b.ok);
    assert.notEqual(a.value.state_id,b.value.state_id);
  });
  it('requires an explicit share when zero dual usage becomes positive', () => {
    const base = normalized(scenario({ meter_type:'DUAL',consumption:split('0','0') }));
    const changed = trial(base,{ total_kwh_30_override:'300' }); assert(changed.ok);
    assert.equal(get(recommendNormalized(changed.value,DEMO_CATALOG),'D1').charges,null);
    const allocated = trial(base,{ total_kwh_30_override:'300',reduced_share_override_percent:'50' }); assert(allocated.ok);
    assert.equal(get(recommendNormalized(allocated.value,DEMO_CATALOG),'D1').charges!.total_cents,4350);
  });
  it('distinguishes pair crossing at 200 from a cheaper third offer and real global transitions', () => {
    const result = recommend(scenario(),DEMO_CATALOG);
    const pair = comparePair(result,['A1','A2']); assert.equal(pair.status,'AVAILABLE');
    if (pair.status !== 'AVAILABLE') return;
    assert.equal(exactKey(pair.intersection.kwh!),'200/1');
    assert.deepEqual(pair.globally_cheaper_program_ids_at_intersection,['B1']);
    const envelope = analyzeWinners(result); assert.equal(envelope.status,'AVAILABLE');
    assert.deepEqual(envelope.boundary_points.map(p=>exactKey(p.q)),['0/1','200/3','600/1','5000/1']);
    assert.deepEqual(envelope.intervals.map(i=>i.raw_winner_ids),[['A1'],['B1'],['A2']]);
    assert.deepEqual(envelope.boundary_points[2]!.raw_winner_ids,['A2','B1']);
  });
  it('finds the discounted 50/3 boundary and the fixed-only 200 boundary', () => {
    const discounted = recommend(scenario({ condition_answers:{ e_bill:'YES',direct_debit:'YES' } }),DEMO_CATALOG);
    assert.deepEqual(analyzeWinners(discounted).boundary_points.map(p=>exactKey(p.q)),['0/1','50/3','5000/1']);
    const fixed = recommend(scenario({ priority:'FIXED_RATE' }),DEMO_CATALOG);
    assert.deepEqual(analyzeWinners(fixed).boundary_points.map(p=>exactKey(p.q)),['0/1','200/1','5000/1']);
    assert.equal(comparePair(fixed,['A1','B1']).status,'NOT_COMPUTABLE');
  });
  it('handles identical, parallel, negative, zero and out-of-range crossings', () => {
    const a = { program_id:'x',fee:fraction(2),rate:decimal('0.16') };
    assert.equal(breakEven(a,{ ...a,program_id:'y' }).status,'IDENTICAL');
    assert.equal(breakEven(a,{ ...a,fee:fraction(3) }).status,'PARALLEL_DIFFERENT');
    assert.equal(breakEven(a,{ ...a,fee:fraction(3),rate:decimal('0.18') }).status,'NEGATIVE_INTERSECTION');
    assert.equal(breakEven(a,{ ...a,rate:decimal('0.12') }).status,'AT_ZERO');
    assert.equal(breakEven(a,{ ...a,fee:fraction(1000),rate:decimal('0.15') }).status,'OUTSIDE_RANGE');
  });
  it('proves range stability against every candidate and explains a rounded tie', () => {
    const result = recommend(scenario({ priority:'FIXED_RATE' }),DEMO_CATALOG);
    assert.equal(checkRange(result,result,fraction(150),fraction(300)).checks[0]!.status,'DOES_NOT_REMAIN');
    assert.equal(checkRange(result,result,fraction(250),fraction(350)).checks[0]!.status,'REMAINS_MINIMUM');
    assert.equal(checkRange(result,result,fraction(300),fraction(150)).status,'INVALID_RANGE');
    const tied = recommend(scenario({ priority:'FIXED_RATE',consumption:total('199.99') }),DEMO_CATALOG);
    const checked = checkRange(tied,tied,decimal('199.99'),decimal('199.99'));
    assert.deepEqual(checked.checks.map(c=>[c.program_id,c.status]),[['A1','REMAINS_MINIMUM'],['A2','DOES_NOT_REMAIN']]);
  });
  it('does not prove nontrivial ranges by silently excluding an unknown dual slope', () => {
    const result = recommend(scenario({ meter_type:'DUAL',consumption:split('0','0') }),DEMO_CATALOG);
    assert.equal(analyzeWinners(result).status,'NEEDS_EXPLICIT_SHARE');
    assert.equal(checkRange(result,result,ZERO,fraction(100)).status,'NEEDS_EXPLICIT_SHARE');
    assert.equal(checkRange(result,result,ZERO,ZERO).checks[0]!.status,'REMAINS_MINIMUM');
  });
  it('explanations reproduce charges and limitations without fictitious savings', () => {
    const result = recommend(scenario(),DEMO_CATALOG);
    const explanation = explainProgram(get(result,'B1'),result.normalized_scenario!,'CHEAPEST_SCENARIO').join('\n');
    assert(explanation.includes('39,00 € + πάγιο 4,00 € = 43,00 €'));
    assert(explanation.includes('Δεν γνωρίζουμε την επόμενη τιμή'));
    assert(explanation.includes('δεν υπολογίζεται διαφορά'));
    assert(!explanation.includes('AI score'));
  });
  it('exact operations obey rational equality and division by zero never fabricates a result', () => {
    assert.equal(exactKey(add(fraction(1,3),fraction(2,3))),'1/1');
    assert.throws(()=>fraction(1,0),RangeError);
  });
});

