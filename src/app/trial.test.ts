import assert from 'node:assert/strict';
import { it } from 'node:test';
import { DEMO_CATALOG } from '../data/demoPrograms.ts';
import { recommend } from '../domain/recommend.ts';
import { analyzeWinners, checkRange, comparePair } from '../domain/analysis.ts';
import { calculateCharges } from '../domain/pricing.ts';
import { exactKey, fraction } from '../domain/exact.ts';
import type { Catalog, Program, RecommendationResult } from '../domain/types.ts';
import { scenario, split, total } from '../tests/fixtures.ts';
import { approximateRangeDefaults, changedAssumptions, createRangeDraft, createTrialDraft, evaluateTrial, explainPairMovement, initialRange, programChanges, readRange, shortcutQuantity, trialDefaultPair, trialInput, winnerChange } from './trial.ts';

const get = (r: RecommendationResult, id: string) => r.evaluations.find(e => e.program.program_id === id)!;
function change(r: RecommendationResult, quantity: string | null, answers = r.normalized_scenario!.condition_answers, share: string | null = null) {
  const base = r.normalized_scenario!, d = createTrialDraft(base);
  const next = evaluateTrial(base, trialInput(base, { ...d, quantity_override: quantity, answers, share_override: share }), DEMO_CATALOG);
  assert(next.ok); return next.value;
}
it('W01: 300→150 kWh changes fixed pair A2→A1, with independently verified components', () => {
  const base = recommend(scenario({ priority: 'FIXED_RATE' }), DEMO_CATALOG), saved = structuredClone(base);
  assert.deepEqual(trialDefaultPair(base), ['A2', 'A1']);
  const next = change(base, '150');
  assert.deepEqual(programChanges(base, next, ['A1', 'A2']), [{ id: 'A1', before: 5000, after: 2600, delta: -2400 }, { id: 'A2', before: 4600, after: 2800, delta: -1800 }]);
  assert.equal(get(next, 'A1').charges!.energy_total_cents, 2400);
  assert.equal(get(next, 'A2').charges!.energy_total_cents, 1800);
  assert.deepEqual(winnerChange(base, next, ['A1', 'A2']), { before: ['A2'], after: ['A1'], status: 'CHANGED' });
  assert.deepEqual(winnerChange(base, next).after, ['A1']);
  const crossing = comparePair(next, ['A1', 'A2']); assert.equal(crossing.status, 'AVAILABLE');
  if (crossing.status === 'AVAILABLE') assert.equal(exactKey(crossing.intersection.kwh!), '200/1');
  assert.deepEqual(base, saved);
  assert(explainPairMovement(base, next, ['A1', 'A2'])!.includes('μικρότερο πάγιο'));
});
it('W02: disabling a required term changes C1→B1 without double subtraction', () => {
  const base = recommend(scenario({ condition_answers: { e_bill: 'YES', direct_debit: 'YES' } }), DEMO_CATALOG);
  const next = change(base, null, { e_bill: 'YES', direct_debit: 'NO' });
  assert.equal(get(base, 'C1').charges!.total_cents, 3300);
  assert.equal(get(next, 'C1').charges!.energy_total_cents, 5400);
  assert.equal(get(next, 'C1').charges!.total_cents, 5700);
  assert.equal(get(next, 'C1').charges!.discount_effect_cents, 0);
  assert.equal(get(next, 'B1').charges!.total_cents, 4300);
  assert.equal(get(next, 'C1').discount_evaluation!.status, 'NOT_MET');
  const crossing = comparePair(next, ['C1', 'B1'], 'CHEAPEST_SCENARIO'); assert.equal(crossing.status, 'AVAILABLE');
  if (crossing.status === 'AVAILABLE') assert.equal(exactKey(crossing.intersection.kwh!), '20/1');
  assert.deepEqual(winnerChange(base, next, ['C1', 'B1']), { before: ['C1'], after: ['B1'], status: 'CHANGED' });
  assert.deepEqual(changedAssumptions(base.normalized_scenario!, next.normalized_scenario!), ['Άλλαξες τον όρο πάγιας εντολής.']);
  assert(explainPairMovement(base, next, ['C1', 'B1'])!.includes('kWh παρέμειναν ίδιες'));
  const combined = change(base, '350', { e_bill: 'YES', direct_debit: 'NO' });
  assert(explainPairMovement(base, combined, ['C1', 'B1'])!.includes('περισσότερες από μία'));
});
it('W03: 300→350 does not change B1/A2 winner; 300→700 does', () => {
  const base = recommend(scenario(), DEMO_CATALOG), next = change(base, '350');
  assert.deepEqual(programChanges(base, next, ['B1', 'A2']).map(p => p.after), [4950, 5200]);
  assert.equal(winnerChange(base, next, ['B1', 'A2']).status, 'UNCHANGED');
  assert.equal(explainPairMovement(base, next, ['B1', 'A2']), null);
  const high = change(base, '700');
  assert.deepEqual(programChanges(base, high, ['B1', 'A2']).map(p => p.after), [9500, 9400]);
  assert.equal(winnerChange(base, high, ['B1', 'A2']).status, 'CHANGED');
  assert(explainPairMovement(base, high, ['B1', 'A2'])!.includes('υψηλότερο πάγιο'));
});
it('ties retain both winners and distinguish entering/leaving a displayed tie', () => {
  const base = recommend(scenario({ priority: 'FIXED_RATE' }), DEMO_CATALOG), tied = change(base, '199.99');
  assert.equal(winnerChange(base, tied, ['A1', 'A2']).status, 'BECAME_TIE');
  assert.deepEqual(winnerChange(base, tied, ['A1', 'A2']).after, ['A1', 'A2']);
  assert.equal(winnerChange(tied, change(tied, '150'), ['A1', 'A2']).status, 'LEFT_TIE');
  assert.equal(winnerChange(base, base, ['A1', 'A1']).status, 'NOT_COMPARABLE');
});
it('opening a trial or changing a discount keeps exact recurring consumption, not its display approximation', () => {
  const base = recommend(scenario({ consumption: total('1', 7) }), DEMO_CATALOG), n = base.normalized_scenario!;
  const draft = createTrialDraft(n); assert.equal(draft.quantity_text, '4.29'); assert.equal(draft.quantity_override, null);
  const next = change(base, null, { e_bill: 'YES', direct_debit: 'UNKNOWN' });
  assert.equal(exactKey(next.normalized_scenario!.total_kwh_30), '30/7');
  assert.equal(next.normalized_scenario!.condition_answers.direct_debit, 'UNKNOWN');
  assert.equal(get(next, 'C1').discount_evaluation!.status, 'UNCONFIRMED');
});
it('dual quantity changes preserve the exact share and use it in every plan and intersection', () => {
  const base = recommend(scenario({ meter_type: 'DUAL', consumption: split('2', '1') }), DEMO_CATALOG);
  const next = change(base, '600');
  assert.equal(exactKey(next.normalized_scenario!.reduced_share!), '1/3');
  assert.equal(exactKey(next.normalized_scenario!.normal_kwh_30!), '400/1');
  assert.equal(exactKey(next.normalized_scenario!.reduced_kwh_30!), '200/1');
  assert.equal(get(next, 'D1').charges!.total_cents, 9000); // 400*.17 + 200*.08 + 6
  const crossing = comparePair(next, ['A2', 'D1'], 'CHEAPEST_SCENARIO');
  assert.equal(crossing.status, 'AVAILABLE'); if (crossing.status === 'AVAILABLE') assert.equal(exactKey(crossing.intersection.kwh!), '200/1');
});
it('zero dual use has no invented positive-use split or analytical threshold', () => {
  const base = recommend(scenario({ meter_type: 'DUAL', consumption: split('0', '0') }), DEMO_CATALOG);
  assert.equal(comparePair(base, ['A1', 'D1']).status, 'NOT_COMPUTABLE');
  const unknown = change(base, '300'); assert.equal(get(unknown, 'D1').charges, null);
  assert.equal(winnerChange(base, unknown, ['A1', 'D1']).status, 'NOT_COMPARABLE');
  const explicit = change(base, '300', base.normalized_scenario!.condition_answers, '40');
  assert.equal(get(explicit, 'D1').charges!.total_cents, 4620);
  assert.equal(comparePair(explicit, ['A1', 'D1'], 'CHEAPEST_SCENARIO').status, 'AVAILABLE');
});
for (const invalid of ['', '-1', '5000.01', '1e3', '1.001']) it(`invalid trial '${invalid}' produces no result or reused price`, () => {
  const base = recommend(scenario(), DEMO_CATALOG).normalized_scenario!, draft = createTrialDraft(base);
  const next = evaluateTrial(base, trialInput(base, { ...draft, quantity_override: invalid }), DEMO_CATALOG);
  assert.equal(next.ok, false); if (!next.ok) assert(next.errors.length > 0);
});
it('range defaults retain exact fractions, clip explicitly, reject reversed/empty bounds and prove stability', () => {
  const fractional = recommend(scenario({ consumption: total('1', 7) }), DEMO_CATALOG).normalized_scenario!;
  const parsed = readRange(fractional, createRangeDraft(fractional)); assert(parsed.ok);
  assert.deepEqual(parsed.value.map(exactKey), ['24/7', '36/7']);
  assert.equal(shortcutQuantity(fractional, 1), '5.14');
  const base = recommend(scenario({ priority: 'FIXED_RATE' }), DEMO_CATALOG), n = base.normalized_scenario!;
  assert.equal(checkRange(base, base, fraction(240), fraction(360)).checks[0]!.status, 'REMAINS_MINIMUM');
  assert.equal(checkRange(base, base, fraction(150), fraction(360)).checks[0]!.status, 'DOES_NOT_REMAIN');
  assert.equal(readRange(n, { ...createRangeDraft(n), lower_override: '' }).ok, false);
  assert.equal(readRange(n, { ...createRangeDraft(n), lower_override: '400' }).ok, false);
  const large = recommend(scenario({ consumption: total('4500') }), DEMO_CATALOG).normalized_scenario!;
  assert.equal(exactKey(initialRange(large)[1]), '5000/1'); assert.equal(shortcutQuantity(large, 1), null);
});
for (const mutation of ['MODEL', 'PROGRAM_TIERS', 'RATE_TIERS', 'CONDITIONAL_THRESHOLD'] as const) it(`rejects unsupported ${mutation} without fabricating price or break-even`, () => {
  let catalog: Catalog = structuredClone(DEMO_CATALOG);
  if (mutation === 'CONDITIONAL_THRESHOLD') catalog = { ...catalog, discount_rules: catalog.discount_rules.map(rule => ({ ...rule, minimum_kwh: '200' })) };
  else catalog = { ...catalog, programs: catalog.programs.map(p => p.program_id !== 'C1' ? p : mutation === 'MODEL' ? { ...p, calculation_model: 'TIERED_V1' } as unknown as Program : mutation === 'PROGRAM_TIERS' ? { ...p, tiers: [{ from: 0, rate: '.1' }] } : { ...p, base_rates: { ...p.base_rates, tiers: [] } }) };
  const r = recommend(scenario(), catalog); assert.equal(get(r, 'C1').charges, null);
  assert.equal(comparePair(r, ['C1', 'A1'], 'CHEAPEST_SCENARIO').status, 'NOT_COMPUTABLE');
});
it('analytical and low-level pricing guards reject a forged tiered evaluation even if old charges remain', () => {
  const base = recommend(scenario(), DEMO_CATALOG), item = get(base, 'A1');
  const program = { ...item.program, calculation_model: 'TIERED_V1' } as unknown as Program;
  const forged = { ...base, evaluations: base.evaluations.map(e => e === item ? { ...e, program } : e) };
  const pair = comparePair(forged, ['A1', 'A2'], 'CHEAPEST_SCENARIO');
  assert.equal(pair.status, 'NOT_COMPUTABLE'); if (pair.status === 'NOT_COMPUTABLE') assert.equal(pair.reason, 'UNSUPPORTED_PRICING_MODEL');
  assert.equal(analyzeWinners(forged).status, 'UNSUPPORTED_PRICING_MODEL');
  assert.throws(() => calculateCharges(program, base.normalized_scenario!, item.discount_evaluation!), /Unsupported/);
});
it('review: a positive trial cannot silently discard an unknown dual slope from global/range proofs', () => {
  const base = recommend(scenario({ meter_type: 'DUAL', consumption: split('0', '0') }), DEMO_CATALOG);
  const unknown = change(base, '300');
  assert.equal(get(unknown, 'D1').charges, null);
  assert.equal(analyzeWinners(unknown).status, 'NEEDS_EXPLICIT_SHARE');
  assert.equal(checkRange(base, unknown, fraction(0), fraction(60)).status, 'NEEDS_EXPLICIT_SHARE');
  assert.equal(checkRange(base, unknown, fraction(0), fraction(0)).status, 'NEEDS_EXPLICIT_SHARE', 'Do not reuse charges at q=300 for a zero-only range');
  const known = change(base, '300', base.normalized_scenario!.condition_answers, '100');
  const proof = checkRange(base, known, fraction(0), fraction(60));
  assert.equal(proof.status, 'AVAILABLE'); assert.equal(proof.checks[0]!.status, 'DOES_NOT_REMAIN');
  // Independent counterexample at 60 kWh: A1=2+9.60=11.60; D1=6+4.80=10.80.
  const at60 = change(base, '60', base.normalized_scenario!.condition_answers, '100');
  assert.equal(get(at60, 'A1').charges!.total_cents, 1160); assert.equal(get(at60, 'D1').charges!.total_cents, 1080);
});
it('review: unknown dual allocation limits global claims without disabling a valid unified pair crossing', () => {
  const base = recommend(scenario({ meter_type: 'DUAL' }), DEMO_CATALOG);
  const pair = comparePair(base, ['A1', 'A2'], 'CHEAPEST_SCENARIO');
  assert.equal(pair.status, 'AVAILABLE'); if (pair.status === 'AVAILABLE') {
    assert.equal(exactKey(pair.intersection.kwh!), '200/1'); assert.equal(pair.global_comparison_status, 'NEEDS_EXPLICIT_SHARE');
  }
  assert.equal(analyzeWinners(base).status, 'NEEDS_EXPLICIT_SHARE');
});
it('review: a zero point can be checked only using the charges at that point, not a positive active trial', () => {
  const base = recommend(scenario({ meter_type: 'DUAL', consumption: split('0', '0') }), DEMO_CATALOG);
  const point = checkRange(base, base, fraction(0), fraction(0));
  assert.equal(point.status, 'AVAILABLE'); assert.equal(point.checks[0]!.status, 'REMAINS_MINIMUM');
  const unknown = recommend(scenario({ meter_type: 'DUAL', consumption: total('0') }), DEMO_CATALOG);
  assert.equal(checkRange(unknown, unknown, fraction(0), fraction(0)).status, 'NEEDS_EXPLICIT_SHARE');
});
it('review: rounded default range endpoints do not masquerade as an exact single-point range', () => {
  const base = recommend(scenario({ consumption: total('0.01') }), DEMO_CATALOG).normalized_scenario!;
  const draft = createRangeDraft(base); assert.equal(draft.lower_text, '0.01'); assert.equal(draft.upper_text, '0.01');
  const bounds = readRange(base, draft); assert(bounds.ok); assert.deepEqual(bounds.value.map(exactKey), ['1/125', '3/250']);
  assert(approximateRangeDefaults(base, draft)!.includes('0,008000 έως 0,012000'));
  const explicit = { ...draft, lower_override: '0.01', upper_override: '0.01' };
  assert.equal(approximateRangeDefaults(base, explicit), null);
  const point = readRange(base, explicit); assert(point.ok); assert.deepEqual(point.value.map(exactKey), ['1/100', '1/100']);
});
