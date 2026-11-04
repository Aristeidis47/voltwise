import { compare, decimal, formatExact, fraction, multiply } from '../domain/exact.ts';
import type { Exact } from '../domain/exact.ts';
import { applyTrial } from '../domain/normalize.ts';
import { recommendNormalized } from '../domain/recommend.ts';
import { comparePair } from '../domain/analysis.ts';
import type { Answers, Catalog, NormalizedScenario, RecommendationResult, TrialInput, Validated } from '../domain/types.ts';
import { primaryCategory } from './results.ts';

export interface TrialDraft {
  readonly quantity_text: string;
  readonly quantity_override: string | null;
  readonly share_text: string;
  readonly share_override: string | null;
  readonly answers: Answers;
}
export interface RangeDraft { readonly lower_text: string; readonly upper_text: string; readonly lower_override: string | null; readonly upper_override: string | null }
export function createTrialDraft(base: NormalizedScenario): TrialDraft {
  return { quantity_text: formatExact(base.total_kwh_30).replace(',', '.'), quantity_override: null,
    share_text: base.reduced_share === null ? '' : formatExact(multiply(base.reduced_share, fraction(100))).replace(',', '.'),
    share_override: null, answers: { ...base.condition_answers } };
}
export function trialInput(base: NormalizedScenario, draft: TrialDraft): TrialInput {
  return { trial_id: 'interactive', base_scenario_id: base.scenario_id, base_revision: base.scenario_revision,
    total_kwh_30_override: draft.quantity_override, reduced_share_override_percent: draft.share_override, condition_answers: draft.answers };
}
export function evaluateTrial(base: NormalizedScenario, input: TrialInput, catalog: Catalog): Validated<RecommendationResult> {
  const applied = applyTrial(base, input);
  if (!applied.ok) return applied;
  const result = recommendNormalized(applied.value, catalog);
  return result.status === 'INVALID_INPUT' || result.status === 'INVALID_CATALOG' ? { ok: false, errors: result.validation_errors } : { ok: true, value: result };
}
export function shortcutQuantity(base: NormalizedScenario, direction: -1 | 1): string | null {
  const value = multiply(base.total_kwh_30, fraction(direction === -1 ? 4 : 6, 5));
  return compare(value, fraction(5000)) > 0 ? null : formatExact(value).replace(',', '.');
}
export function initialRange(base: NormalizedScenario): readonly [Exact, Exact] {
  const lower = multiply(base.total_kwh_30, fraction(4, 5));
  const upper = multiply(base.total_kwh_30, fraction(6, 5));
  return [lower, compare(upper, fraction(5000)) > 0 ? fraction(5000) : upper];
}
export function createRangeDraft(base: NormalizedScenario): RangeDraft {
  const [lower, upper] = initialRange(base);
  return { lower_text: formatExact(lower).replace(',', '.'), upper_text: formatExact(upper).replace(',', '.'), lower_override: null, upper_override: null };
}
export function readRange(base: NormalizedScenario, draft: RangeDraft): Validated<readonly [Exact, Exact]> {
  try {
    const defaults = initialRange(base);
    const lower = draft.lower_override === null ? defaults[0] : decimal(draft.lower_override);
    const upper = draft.upper_override === null ? defaults[1] : decimal(draft.upper_override);
    if (compare(lower, upper) > 0 || compare(upper, fraction(5000)) > 0) throw new RangeError();
    return { ok: true, value: [lower, upper] };
  } catch { return { ok: false, errors: [{ field: 'range', code: 'INVALID_RANGE', message: 'Δώσε δύο τιμές από 0 έως 5.000 kWh, με το κάτω όριο μικρότερο ή ίσο με το πάνω. Τα κενά πεδία δεν είναι μηδέν.' }] }; }
}
export function trialDefaultPair(result: RecommendationResult, preferred?: string): readonly string[] {
  const available = result.cheapest_category.ranked_entries.map(p => p.program_id);
  return [...new Set([preferred, ...primaryCategory(result).ranked_entries.map(p => p.program_id), ...available]
    .filter((id): id is string => !!id && available.includes(id)))].slice(0, 2);
}
export function approximateRangeDefaults(base: NormalizedScenario, draft: RangeDraft): string | null {
  const defaults = initialRange(base);
  const hasRoundedDefault = defaults.some((value, index) => (index === 0 ? draft.lower_override : draft.upper_override) === null && (value.n * 100n) % value.d !== 0n);
  return hasRoundedDefault ? `Τα προτεινόμενα όρια προκύπτουν από την ακριβή αρχική χρήση: περίπου ${formatExact(defaults[0], 6)} έως ${formatExact(defaults[1], 6)} kWh. Τα πεδία δείχνουν δύο δεκαδικά· μέχρι να τα αλλάξεις, ο έλεγχος κρατά τα όρια πριν από στρογγυλοποίηση.` : null;
}
function firstIds(result: RecommendationResult, pair?: readonly string[]): readonly string[] | null {
  if (!pair) return primaryCategory(result).status === 'AVAILABLE' ? primaryCategory(result).first_program_ids : null;
  if (pair.length !== 2 || pair[0] === pair[1]) return null;
  const items = pair.map(id => result.evaluations.find(e => e.program.program_id === id));
  if (items.some(e => !e?.charges)) return null;
  const first = items[0]!, second = items[1]!;
  return first.charges!.total_cents === second.charges!.total_cents ? [...pair].sort()
    : [first.charges!.total_cents < second.charges!.total_cents ? pair[0]! : pair[1]!];
}
export function winnerChange(initial: RecommendationResult, active: RecommendationResult, pair?: readonly string[]) {
  const before = firstIds(initial, pair), after = firstIds(active, pair);
  const status = before === null || after === null ? 'NOT_COMPARABLE'
    : before.length === after.length && before.every(id => after.includes(id)) ? 'UNCHANGED'
      : after.length > 1 ? 'BECAME_TIE' : before.length > 1 ? 'LEFT_TIE' : 'CHANGED';
  return { before, after, status } as const;
}
export function changedAssumptions(initial: NormalizedScenario, active: NormalizedScenario): readonly string[] {
  const changes: string[] = [];
  if (compare(initial.total_kwh_30, active.total_kwh_30) !== 0) changes.push(`Χρήση: ${formatExact(initial.total_kwh_30)} → ${formatExact(active.total_kwh_30)} kWh / 30 ημέρες.`);
  if ((initial.reduced_share === null) !== (active.reduced_share === null)
    || initial.reduced_share !== null && active.reduced_share !== null && compare(initial.reduced_share, active.reduced_share) !== 0) changes.push('Άλλαξες τη δηλωμένη κατανομή στις δύο ζώνες. Πρόκειται για υπόθεση δοκιμής.');
  if (initial.condition_answers.e_bill !== active.condition_answers.e_bill) changes.push('Άλλαξες τον όρο ηλεκτρονικού λογαριασμού.');
  if (initial.condition_answers.direct_debit !== active.condition_answers.direct_debit) changes.push('Άλλαξες τον όρο πάγιας εντολής.');
  return changes;
}
export function programChanges(initial: RecommendationResult, active: RecommendationResult, ids: readonly string[]) {
  return ids.map(id => {
    const before = initial.evaluations.find(e => e.program.program_id === id)?.charges?.total_cents ?? null;
    const after = active.evaluations.find(e => e.program.program_id === id)?.charges?.total_cents ?? null;
    return { id, before, after, delta: before === null || after === null ? null : after - before };
  });
}
/** Describes a change, without claiming a single cause when several assumptions changed. */
export function explainPairMovement(initial: RecommendationResult, active: RecommendationResult, ids: readonly string[]): string | null {
  const movement = winnerChange(initial, active, ids);
  if (movement.status !== 'CHANGED' || ids.length !== 2) return null;
  const before = initial.normalized_scenario!, after = active.normalized_scenario!;
  const conditionChange = before.condition_answers.e_bill !== after.condition_answers.e_bill || before.condition_answers.direct_debit !== after.condition_answers.direct_debit;
  const shareChange = (before.reduced_share === null) !== (after.reduced_share === null)
    || before.reduced_share !== null && after.reduced_share !== null && compare(before.reduced_share, after.reduced_share) !== 0;
  const quantityChange = compare(after.total_kwh_30, before.total_kwh_30);
  if (conditionChange && quantityChange === 0 && !shareChange) return 'Η αλλαγή όρων άλλαξε την ενεργή τιμή του προγράμματος με έκπτωση. Οι kWh παρέμειναν ίδιες· η βασική τιμή χρησιμοποιείται όταν δεν επιβεβαιώνονται όλοι οι όροι.';
  if (Number(conditionChange) + Number(shareChange) + Number(quantityChange !== 0) > 1) return 'Άλλαξες περισσότερες από μία παραδοχές. Η νέα σειρά συνυπολογίζει όλες τις αλλαγές· δεν αποδίδεται μόνο στις kWh.';
  if (shareChange) return 'Άλλαξες τη χρήση ανά ζώνη. Αυτό αλλάζει τη σταθμισμένη χρέωση του διζωνικού προγράμματος, με ίδιο συνολικό αριθμό kWh.';
  const pair = comparePair(active, [ids[0]!, ids[1]!], 'CHEAPEST_SCENARIO');
  if (pair.status !== 'AVAILABLE') return null;
  const winner = pair.coefficients.find(t => t.program_id === movement.after![0])!;
  const other = pair.coefficients.find(t => t.program_id !== winner.program_id)!;
  if (quantityChange < 0 && compare(winner.fee, other.fee) < 0) return 'Με λιγότερες kWh, το μικρότερο πάγιο της νέας επιλογής αντισταθμίζει την ακριβότερη ενέργεια.';
  if (quantityChange > 0 && compare(winner.rate, other.rate) < 0) return 'Με περισσότερες kWh, η χαμηλότερη χρέωση ενέργειας της νέας επιλογής αντισταθμίζει το υψηλότερο πάγιο.';
  return 'Η μεταξύ τους σειρά άλλαξε με την κατανάλωση που επέλεξες, κρατώντας σταθερές τιμές, κατανομή και όρους.';
}
