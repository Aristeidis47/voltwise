import { add, compare, decimal, divide, exactKey, fraction, multiply, subtract, ZERO } from './exact.ts';
import type { Exact } from './exact.ts';
import type { CategoryId, Evaluation, RecommendationResult } from './types.ts';
import { supportsLinearPricing } from './pricing.ts';

export interface LinearTariff { readonly program_id: string; readonly fee: Exact; readonly rate: Exact }
export type IntersectionStatus = 'IN_RANGE' | 'AT_ZERO' | 'OUTSIDE_RANGE' | 'NEGATIVE_INTERSECTION' | 'PARALLEL_DIFFERENT' | 'IDENTICAL';
export interface Intersection { readonly status: IntersectionStatus; readonly kwh: Exact | null }
export const linearCost = (tariff: LinearTariff, q: Exact): Exact => add(tariff.fee, multiply(tariff.rate, q));

/** Mathematical equality before rounding. The caller supplies rates for one frozen scenario. */
export function breakEven(a: LinearTariff, b: LinearTariff): Intersection {
  const rateDifference = subtract(a.rate, b.rate);
  if (compare(rateDifference, ZERO) === 0) return { status: compare(a.fee, b.fee) === 0 ? 'IDENTICAL' : 'PARALLEL_DIFFERENT', kwh: null };
  const q = divide(subtract(b.fee, a.fee), rateDifference);
  return { status: compare(q, ZERO) < 0 ? 'NEGATIVE_INTERSECTION' : compare(q, ZERO) === 0 ? 'AT_ZERO'
    : compare(q, fraction(5000)) > 0 ? 'OUTSIDE_RANGE' : 'IN_RANGE', kwh: q };
}
type Prepared = { status: 'AVAILABLE'; tariffs: readonly LinearTariff[] } | { status: 'NEEDS_EXPLICIT_SHARE' | 'NO_CANDIDATES' | 'NOT_EVALUATED' | 'UNSUPPORTED_PRICING_MODEL'; tariffs: readonly [] };
function prepare(result: RecommendationResult, selectedIds?: readonly string[], scope: CategoryId | null = result.primary_category): Prepared {
  const n = result.normalized_scenario;
  if (result.status === 'INVALID_INPUT' || result.status === 'INVALID_CATALOG' || !n) return { status: 'NOT_EVALUATED', tariffs: [] };
  const category = scope === 'FIXED_RATE' ? result.fixed_category : result.cheapest_category;
  // An unpriced dual tariff may still beat a unified tariff elsewhere in the domain.
  // It must not disappear from a whole-category proof just because q currently lacks a split.
  if (!selectedIds && n.meter_type === 'DUAL' && n.reduced_share === null && result.evaluations.some(e =>
    e.program.pricing_basis === 'DUAL_ZONE' && e.comparability_status !== 'INVALID_PROGRAM_DATA'
    && (scope !== 'FIXED_RATE' || e.program.price_type === 'FIXED'))) return { status: 'NEEDS_EXPLICIT_SHARE', tariffs: [] };
  const ids = selectedIds ?? category.ranked_entries.map(e => e.program_id);
  const items = ids.map(id => result.evaluations.find(e => e.program.program_id === id))
    .filter((e): e is Evaluation => !!e?.charges && category.ranked_entries.some(r => r.program_id === e.program.program_id));
  if (!items.length || items.length !== ids.length) return { status: 'NO_CANDIDATES', tariffs: [] };
  if (items.some(e => !e.discount_evaluation || !supportsLinearPricing(e.program, e.discount_evaluation.effective_rates))) return { status: 'UNSUPPORTED_PRICING_MODEL', tariffs: [] };
  if (items.some(e => e.discount_evaluation?.effective_rates.basis === 'DUAL_ZONE') && n.reduced_share === null) return { status: 'NEEDS_EXPLICIT_SHARE', tariffs: [] };
  return { status: 'AVAILABLE', tariffs: items.map(e => {
    const rates = e.discount_evaluation!.effective_rates;
    const rate = rates.basis === 'UNIFIED' ? decimal(rates.unified_rate, 6)
      : add(multiply(subtract(fraction(1), n.reduced_share!), decimal(rates.normal_rate, 6)), multiply(n.reduced_share!, decimal(rates.reduced_rate, 6)));
    return { program_id: e.program.program_id, fee: fraction(e.charges!.fixed_fee_cents_30, 100), rate };
  }) };
}
function minimumIds(tariffs: readonly LinearTariff[], q: Exact): string[] {
  let best: Exact | null = null;
  let ids: string[] = [];
  for (const t of tariffs) {
    const cost = linearCost(t, q);
    const comparison = best === null ? -1 : compare(cost, best);
    if (comparison < 0) { best = cost; ids = [t.program_id]; }
    else if (comparison === 0) ids.push(t.program_id);
  }
  return ids.sort();
}
const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every(id => b.includes(id));

export function comparePair(result: RecommendationResult, ids: readonly [string, string], scope: CategoryId | null = result.primary_category) {
  const prepared = prepare(result, ids, scope);
  if (ids[0] === ids[1] || prepared.status !== 'AVAILABLE') return {
    status: 'NOT_COMPUTABLE' as const, reason: ids[0] === ids[1] ? 'DISTINCT_PROGRAMS_REQUIRED' : prepared.status,
  };
  const a = prepared.tariffs[0]!, b = prepared.tariffs[1]!;
  const intersection = breakEven(a, b);
  const all = prepare(result, undefined, scope);
  const q = intersection.kwh;
  const inDomain = q !== null && compare(q, ZERO) >= 0 && compare(q, fraction(5000)) <= 0;
  const at = q === null ? ZERO : q;
  const globallyCheaper = inDomain && all.status === 'AVAILABLE' ? all.tariffs.filter(t => compare(linearCost(t, at), linearCost(a, at)) < 0).map(t => t.program_id) : [];
  const exactLeft = q !== null && compare(q, ZERO) > 0 && inDomain ? divide(q, fraction(2)) : ZERO;
  const exactRight = q !== null && inDomain ? divide(add(q, fraction(5000)), fraction(2)) : fraction(5000);
  const first = result.evaluations.find(e => e.program.program_id === ids[0])!;
  const second = result.evaluations.find(e => e.program.program_id === ids[1])!;
  return { status: 'AVAILABLE' as const, state_id: result.state_id, category_id: scope,
    global_comparison_status: all.status,
    program_ids: ids, coefficients: [a, b], intersection,
    difference_cents: first.charges!.total_cents - second.charges!.total_cents,
    lower_winner_ids: intersection.status === 'AT_ZERO' ? [] : minimumIds([a, b], exactLeft),
    upper_winner_ids: q !== null && compare(q, fraction(5000)) === 0 ? [] : minimumIds([a, b], exactRight),
    globally_cheaper_program_ids_at_intersection: globallyCheaper };
}
export function analyzeWinners(result: RecommendationResult) {
  const prepared = prepare(result);
  if (prepared.status !== 'AVAILABLE') return { status: prepared.status, state_id: result.state_id, intervals: [], boundary_points: [] };
  const { tariffs } = prepared;
  const cuts = new Map<string, Exact>([[exactKey(ZERO), ZERO], [exactKey(fraction(5000)), fraction(5000)]]);
  for (let i = 0; i < tariffs.length; i++) for (let j = i + 1; j < tariffs.length; j++) {
    const crossing = breakEven(tariffs[i]!, tariffs[j]!);
    if (crossing.kwh && ['IN_RANGE', 'AT_ZERO'].includes(crossing.status)) cuts.set(exactKey(crossing.kwh), crossing.kwh);
  }
  const sorted = [...cuts.values()].sort(compare);
  const kept = sorted.filter((q, index) => {
    if (index === 0 || index === sorted.length - 1) return true;
    const left = minimumIds(tariffs, divide(add(sorted[index - 1]!, q), fraction(2)));
    const right = minimumIds(tariffs, divide(add(q, sorted[index + 1]!), fraction(2)));
    return !sameSet(left, right) || !sameSet(left, minimumIds(tariffs, q));
  });
  const intervals = kept.slice(0, -1).map((lower, index) => ({ lower, upper: kept[index + 1]!,
    raw_winner_ids: minimumIds(tariffs, divide(add(lower, kept[index + 1]!), fraction(2))) }));
  return { status: 'AVAILABLE' as const, state_id: result.state_id, category_id: result.primary_category,
    intervals, boundary_points: kept.map(q => ({ q, raw_winner_ids: minimumIds(tariffs, q) })) };
}
/** Endpoint proof is exact for affine costs. Never substitutes a sparse grid. */
export function checkRange(initial: RecommendationResult, active: RecommendationResult, lower: Exact, upper: Exact) {
  if (compare(lower, ZERO) < 0 || compare(upper, fraction(5000)) > 0 || compare(lower, upper) > 0) return { status: 'INVALID_RANGE' as const, checks: [] };
  if (!initial.normalized_scenario || !active.normalized_scenario || initial.primary_category !== active.primary_category
    || initial.normalized_scenario.scenario_id !== active.normalized_scenario.scenario_id
    || initial.normalized_scenario.scenario_revision !== active.normalized_scenario.scenario_revision) return { status: 'NOT_EVALUATED' as const, checks: [] };
  const first = initial.primary_category === 'FIXED_RATE' ? initial.fixed_category.first_program_ids : initial.cheapest_category.first_program_ids;
  const prepared = prepare(active);
  if (prepared.status === 'NEEDS_EXPLICIT_SHARE' && compare(lower, ZERO) === 0 && compare(upper, ZERO) === 0
    && compare(active.normalized_scenario.total_kwh_30, ZERO) === 0 && active.normalized_scenario.normal_kwh_30 !== null) {
    const category = active.primary_category === 'FIXED_RATE' ? active.fixed_category : active.cheapest_category;
    const items = active.evaluations.filter(e => e.charges && category.ranked_entries.some(r => r.program_id === e.program.program_id));
    const values = items.map(e => e.charges!.total_exact_eur);
    const min = values.reduce((a, b) => compare(a, b) < 0 ? a : b);
    return { status: 'AVAILABLE' as const, checks: first.map(id => {
      const item = items.find(e => e.program.program_id === id);
      return { program_id: id, status: !item ? 'NOT_ELIGIBLE' : compare(item.charges!.total_exact_eur, min) === 0 ? 'REMAINS_MINIMUM' : 'DOES_NOT_REMAIN' };
    }) };
  }
  if (prepared.status !== 'AVAILABLE') return { status: prepared.status, checks: [] };
  return { status: 'AVAILABLE' as const, checks: first.map(id => {
    const original = prepared.tariffs.find(t => t.program_id === id);
    const stays = original && prepared.tariffs.every(t => compare(linearCost(original, lower), linearCost(t, lower)) <= 0
      && compare(linearCost(original, upper), linearCost(t, upper)) <= 0);
    return { program_id: id, status: !original ? 'NOT_ELIGIBLE' : stays ? 'REMAINS_MINIMUM' : 'DOES_NOT_REMAIN' };
  }), envelope: analyzeWinners(active) };
}
