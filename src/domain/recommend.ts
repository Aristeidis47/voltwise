import { normalizeConsumption, unknownFee } from './normalize.ts';
import { evaluateProgram, validCatalog } from './pricing.ts';
import type { BaselineStatus, Catalog, Category, CategoryId, CategoryRelation, Evaluation, NormalizedScenario, RecommendationResult } from './types.ts';

export const COST_NOTICE = 'Ενέργεια + πάγιο / 30 ημέρες, χωρίς ΦΠΑ. Δεν είναι τελικός λογαριασμός.';
export function rankPrograms(evaluations: readonly Evaluation[], categoryId: CategoryId): Category {
  const eligible = evaluations.filter(e => e.charges !== null && (categoryId !== 'FIXED_RATE' || e.program.price_type === 'FIXED'));
  const sorted = [...eligible].sort((a, b) => a.charges!.total_cents - b.charges!.total_cents
    || (a.program.program_id < b.program.program_id ? -1 : a.program.program_id > b.program.program_id ? 1 : 0));
  let rank = 0, previous: number | null = null;
  const entries = sorted.map(e => {
    const total = e.charges!.total_cents;
    if (total !== previous) { rank++; previous = total; }
    return { program_id: e.program.program_id, total_cents: total, dense_rank: rank,
      tied_program_ids: sorted.filter(p => p.charges!.total_cents === total).map(p => p.program.program_id) };
  });
  return { category_id: categoryId, status: entries.length ? 'AVAILABLE' : 'EMPTY', ranked_entries: entries,
    first_program_ids: entries.filter(e => e.dense_rank === 1).map(e => e.program_id),
    exclusion_reasons: evaluations.filter(e => !eligible.includes(e)).map(e => ({ program_id: e.program.program_id,
      reasons: e.charges === null ? e.reason_codes : ['EXCLUDED_VARIABLE_RATE'] })) };
}
export function categoryRelation(a: readonly string[], b: readonly string[]): CategoryRelation {
  if (!a.length && !b.length) return 'BOTH_EMPTY';
  if (!a.length || !b.length) return 'ONE_CATEGORY_EMPTY';
  if (a.length === b.length && a.every(id => b.includes(id))) return 'SAME_FIRST_SET';
  return a.some(id => b.includes(id)) ? 'OVERLAPPING_FIRST_SETS' : 'DIFFERENT_FIRST_SETS';
}
function emptyCategory(id: CategoryId): Category {
  return { category_id: id, status: 'NOT_EVALUATED', ranked_entries: [], first_program_ids: [], exclusion_reasons: [] };
}
export function unavailableResult(status: 'INVALID_INPUT' | 'INVALID_CATALOG', errors: RecommendationResult['validation_errors'], catalog: Catalog): RecommendationResult {
  return { status, state_id: null, catalog_revision: catalog?.revision ?? '', normalized_scenario: null,
    validation_errors: errors, evaluations: [], cheapest_category: emptyCategory('CHEAPEST_SCENARIO'), fixed_category: emptyCategory('FIXED_RATE'),
    primary_category: null, category_relation: 'NOT_EVALUATED', baseline_evaluation: null,
    switching_assessment: { status: 'NOT_CALCULATED_HW1', net_savings_cents: null, exit_fee_evidence: unknownFee() },
    notices: ['Φανταστικά εκπαιδευτικά δεδομένα — δεν είναι πραγματικές προσφορές.', COST_NOTICE] };
}
/** Reuses validated normalized input for trials; never imports UI or demo fixtures. */
export function recommendNormalized(scenario: NormalizedScenario, catalog: Catalog): RecommendationResult {
  if (!validCatalog(catalog)) return unavailableResult('INVALID_CATALOG', [{ field: 'catalog', code: 'INVALID_CATALOG', message: 'Άγνωστος ή μη συγκρίσιμος κατάλογος demo.' }], catalog);
  const counts = new Map<string, number>();
  for (const p of catalog.programs) counts.set(p.program_id, (counts.get(p.program_id) ?? 0) + 1);
  const evaluations = catalog.programs.map(p => evaluateProgram(p, scenario, catalog.discount_rules,
    (counts.get(p.program_id) ?? 0) > 1 ? ['DUPLICATE_PROGRAM_ID'] : []));
  const contract = scenario.current_contract;
  let baselineStatus: BaselineStatus = contract?.identity_status === 'EXACT_DEMO' ? 'INCOMPLETE_CONTRACT' : 'NO_EXACT_CONTRACT';
  let baseline: Evaluation | null = null;
  let contractTermsResolved = false;
  if (contract?.identity_status === 'EXACT_DEMO' && contract.pricing_data_status === 'COMPLETE') {
    const candidates = evaluations.filter(e => e.program.program_id === contract.program_id
      && e.program.program_revision === contract.program_revision && e.program.terms_revision === contract.terms_revision);
    if (candidates.length === 1) {
      const candidate = candidates[0]!;
      contractTermsResolved = candidate.comparability_status !== 'INVALID_PROGRAM_DATA';
      if (candidate.charges) { baseline = candidate; baselineStatus = 'AVAILABLE'; }
      else baselineStatus = 'BASELINE_NOT_COMPUTABLE';
    }
  }
  const compared = evaluations.map(e => ({ ...e, baseline_comparison_status: baselineStatus,
    baseline_difference_cents: baseline?.charges && e.charges ? baseline.charges.total_cents - e.charges.total_cents : null }));
  const cheapest = rankPrograms(compared, 'CHEAPEST_SCENARIO');
  const fixed = rankPrograms(compared, 'FIXED_RATE');
  // Do not borrow a known-zero fee from an unverified/mismatched contract version.
  // A missing zone allocation can prevent recurring pricing without invalidating exact contract fee evidence.
  const fee = contractTermsResolved ? contract!.exit_fee_evidence : unknownFee();
  const notices = [catalog.notice, COST_NOTICE, 'Σύγκριση σεναρίου, όχι εγγύηση μελλοντικού κόστους ή καθαρό όφελος αλλαγής.'];
  if (catalog.programs.some(p => p.price_type === 'VARIABLE_SNAPSHOT')) notices.push('Η μεταβλητή τιμή είναι μόνο στιγμιότυπο demo. Δεν γνωρίζουμε την επόμενη τιμή.');
  if (scenario.meter_type === 'UNKNOWN' || (scenario.meter_type === 'DUAL' && scenario.normal_kwh_30 === null)) notices.push('Δεν έχει δηλωθεί πλήρης διζωνική κατανομή· συγκρίνονται μόνο ενιαίες τιμές.');
  if (scenario.purpose === 'EXISTING_SUPPLY' && fee.status === 'UNKNOWN') notices.push('Δεν γνωρίζουμε τη ρήτρα πρόωρης αποχώρησης. Δεν υπολογίζεται καθαρό όφελος αλλαγής.');
  return { status: cheapest.status === 'AVAILABLE' ? 'READY' : 'NO_COMPARABLE_PROGRAMS', state_id: scenario.state_id,
    catalog_revision: catalog.revision, normalized_scenario: scenario, validation_errors: [], evaluations: compared,
    cheapest_category: cheapest, fixed_category: fixed,
    primary_category: scenario.priority === 'FIXED_RATE' ? 'FIXED_RATE' : 'CHEAPEST_SCENARIO',
    category_relation: categoryRelation(cheapest.first_program_ids, fixed.first_program_ids),
    baseline_evaluation: baseline,
    switching_assessment: { status: 'NOT_CALCULATED_HW1', net_savings_cents: null, exit_fee_evidence: fee }, notices };
}
export function recommend(input: unknown, catalog: Catalog): RecommendationResult {
  const normalized = normalizeConsumption(input);
  if (!normalized.ok) return unavailableResult('INVALID_INPUT', normalized.errors, catalog);
  return recommendNormalized(normalized.value, catalog);
}
