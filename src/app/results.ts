import { formatExact, formatMoney } from '../domain/exact.ts';
import type { Catalog, Category, CategoryId, Evaluation, RecommendationResult } from '../domain/types.ts';

export const RESULT_COST_LABEL = 'Χρέωση ενέργειας + πάγιο · ενδεικτικά δεδομένα';
export const priorityLabels = {
  LOWEST_SCENARIO_COST: 'Χαμηλότερο εκτιμώμενο κόστος',
  FIXED_RATE: 'Προβλεψιμότητα χρέωσης ενέργειας',
  NO_CLEAR_PREFERENCE: 'Δεν έχω σαφή προτίμηση',
};
export const answerLabels = { YES: 'Ναι', NO: 'Όχι', UNKNOWN: 'Δεν γνωρίζω' };
export const conditionLabels = { E_BILL: 'Ηλεκτρονικός λογαριασμός', DIRECT_DEBIT: 'Πάγια εντολή' };
export const categoryFor = (result: RecommendationResult, id: CategoryId): Category => id === 'FIXED_RATE' ? result.fixed_category : result.cheapest_category;
export const primaryCategory = (result: RecommendationResult): Category => categoryFor(result, result.primary_category ?? 'CHEAPEST_SCENARIO');
export function reasonLabel(code: string): string {
  if (code === 'UNSUPPORTED_PRICING_MODEL') return 'Το μαθηματικό μοντέλο δεν υποστηρίζει αυτούς τους όρους ή κλιμακωτές χρεώσεις. Δεν εκτιμάται κόστος ή σημείο ισοφάρισης.';
  if (code === 'METER_NOT_DUAL') return 'Απαιτεί διζωνική μέτρηση. Δήλωσες μονή μέτρηση.';
  if (code === 'METER_TYPE_UNKNOWN') return 'Απαιτεί επιβεβαιωμένη διζωνική μέτρηση. Δεν γνωρίζουμε τον τύπο της παροχής σου.';
  if (code === 'ALLOCATION_UNKNOWN') return 'Λείπουν οι kWh ανά ζώνη ή ένα ρητό υποθετικό μερίδιο. Δεν υποθέτουμε κατανομή.';
  if (code === 'EXCLUDED_VARIABLE_RATE') return 'Έχει μεταβλητή τιμή και δεν ανήκει στην προτεραιότητά σου για σταθερή τιμή.';
  if (code === 'DUPLICATE_PROGRAM_ID') return 'Υπάρχουν διπλές εγγραφές και δεν μπορεί να ταυτοποιηθεί μοναδικά το πρόγραμμα.';
  return 'Τα δεδομένα τιμολόγησης ή οι όροι είναι ελλιπή ή μη συμβατά με αυτή τη σύγκριση.';
}
export function priceTypeText(e: Evaluation): string {
  if (e.reason_codes.includes('INVALID_PRICE_TYPE')) return 'Τα δεδομένα τύπου τιμής είναι ελλιπή. Δεν τεκμηριώνεται σταθερότητα τιμής.';
  return e.program.price_type === 'FIXED'
    ? `Σταθερή τιμή ανά kWh για ${e.program.fixed_rate_months} μήνες στους demo όρους. Δεν σημαίνει σταθερό τελικό λογαριασμό. Η χρήση και η απώλεια έκπτωσης αλλάζουν το ποσό.`
    : 'Μεταβλητή τιμή: χρησιμοποιείται μόνο το συγκεκριμένο στιγμιότυπο demo. Δεν γνωρίζουμε την επόμενη τιμή και δεν εγγυόμαστε μελλοντικό κόστος.';
}
export function baselineText(e: Evaluation): string {
  const difference = e.baseline_difference_cents;
  if (difference === null) return e.baseline_comparison_status === 'NO_EXACT_CONTRACT'
    ? 'Δεν έχει οριστεί ακριβές τρέχον πρόγραμμα. Δεν υπολογίζεται διαφορά κόστους από αλλαγή.'
    : 'Τα δεδομένα του τρέχοντος συμβολαίου δεν αρκούν για συγκρίσιμο υπολογισμό. Δεν υπολογίζεται διαφορά κόστους από αλλαγή.';
  if (difference === 0) return 'Ίδιο συγκρινόμενο κόστος με το ακριβές τρέχον demo πρόγραμμα. Δεν υπολογίζεται καθαρό όφελος αλλαγής.';
  return `${difference > 0 ? 'Χαμηλότερο' : 'Υψηλότερο'} συγκρινόμενο κόστος κατά ${formatMoney(Math.abs(difference))} / 30 ημέρες έναντι του ακριβούς τρέχοντος demo προγράμματος. Αφορά μόνο ενέργεια και πάγιο, όχι καθαρό όφελος αλλαγής.`;
}
export function rationale(result: RecommendationResult, e: Evaluation, scope?: CategoryId): readonly string[] {
  const n = result.normalized_scenario;
  if (!n || !e.charges) return e.reason_codes.map(reasonLabel);
  const categoryId = scope ?? (primaryCategory(result).ranked_entries.some(r => r.program_id === e.program.program_id) ? result.primary_category ?? 'CHEAPEST_SCENARIO' : 'CHEAPEST_SCENARIO');
  const category = categoryFor(result, categoryId);
  const entry = category.ranked_entries.find(r => r.program_id === e.program.program_id);
  const messages: string[] = [];
  const scopeText = categoryId === 'FIXED_RATE' ? 'συμβατές επιλογές σταθερής τιμής' : 'συμβατά προγράμματα με τις τιμές του σεναρίου';
  if (entry) {
    messages.push(entry.dense_rank === 1
      ? `${entry.tied_program_ids.length > 1 ? 'Ισοβαθμεί στο' : 'Έχει το'} χαμηλότερο συγκρινόμενο κόστος για ${formatExact(n.total_kwh_30)} kWh / 30 ημέρες, ανάμεσα σε ${category.ranked_entries.length} ${scopeText}.`
      : `Βρίσκεται στη θέση ${entry.dense_rank} στη σειρά κόστους για ${formatExact(n.total_kwh_30)} kWh / 30 ημέρες, στο ίδιο σύνολο συμβατών προγραμμάτων.`);
    if (entry.tied_program_ids.length > 1) {
      const others = entry.tied_program_ids.filter(id => id !== e.program.program_id).map(id => result.evaluations.find(item => item.program.program_id === id)!.program.program_name);
      messages.push(`Ίδιο κόστος στην ακρίβεια εμφάνισης με: ${others.join(', ')}. Η σειρά παρουσίασης δεν σπάει την ισοπαλία.`);
    } else if (entry.dense_rank === 1) {
      const next = category.ranked_entries.find(r => r.total_cents > entry.total_cents);
      if (next) messages.push(`Στο ίδιο σενάριο κοστίζει ${formatMoney(next.total_cents - entry.total_cents)} λιγότερο από την επόμενη επιλογή, ${result.evaluations.find(item => item.program.program_id === next.program_id)!.program.program_name}. Δεν είναι εξοικονόμηση από αλλαγή συμβολαίου.`);
    }
  }
  messages.push(`Ενέργεια ${formatMoney(e.charges.energy_total_cents)} + πάγιο ${formatMoney(e.charges.fixed_fee_cents_30)} = ${formatMoney(e.charges.total_cents)} / 30 ημέρες.`);
  if (result.primary_category === 'FIXED_RATE' && e.program.price_type !== 'FIXED') messages.push(reasonLabel('EXCLUDED_VARIABLE_RATE'));
  const d = e.discount_evaluation;
  messages.push(d?.status === 'APPLIED' ? 'Η μειωμένη τιμή εφαρμόστηκε επειδή επιβεβαίωσες όλους τους απαιτούμενους όρους έκπτωσης.'
    : d?.status === 'NOT_APPLICABLE' ? 'Το κόστος δεν εξαρτάται από ηλεκτρονικό λογαριασμό ή πάγια εντολή.'
    : 'Χρησιμοποιήθηκε η βασική τιμή, επειδή δεν επιβεβαιώθηκαν όλοι οι απαιτούμενοι όροι έκπτωσης.');
  return messages;
}
export function programView(result: RecommendationResult, evaluation: Evaluation, catalog: Catalog) {
  const p = evaluation.program;
  const rule = catalog.discount_rules.find(d => d.discount_id === p.discount_rule_id);
  const n = result.normalized_scenario;
  const personal = primaryCategory(result).first_program_ids.includes(p.program_id);
  const reasonScope = personal ? result.primary_category ?? 'CHEAPEST_SCENARIO'
    : result.fixed_category.first_program_ids.includes(p.program_id) ? 'FIXED_RATE' : 'CHEAPEST_SCENARIO';
  return {
    id: p.program_id, evaluation, program: p, charges: evaluation.charges,
    total_cents: evaluation.charges?.total_cents ?? null,
    personal,
    cheapest: result.cheapest_category.first_program_ids.includes(p.program_id),
    fixed: result.fixed_category.first_program_ids.includes(p.program_id),
    reason: rationale(result, evaluation, reasonScope), price_type_text: priceTypeText(evaluation), baseline_text: baselineText(evaluation),
    conditions: (rule?.condition_ids ?? []).map(id => ({ id, label: conditionLabels[id],
      answer: n ? n.condition_answers[id === 'E_BILL' ? 'e_bill' : 'direct_debit'] : null })),
    discount_rule: rule ?? null,
  };
}
export type ProgramView = ReturnType<typeof programView>;
export const monetaryFact = (value: unknown): string => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? formatMoney(value) : 'Άγνωστο — δεν εκτιμάται';
export function comparisonDifference(a: ProgramView, b: ProgramView): number | null {
  return a.total_cents === null || b.total_cents === null ? null : a.total_cents - b.total_cents;
}
export function buildResultsView(result: RecommendationResult, catalog: Catalog) {
  const programs = result.evaluations.map(e => programView(result, e, catalog));
  const category = primaryCategory(result);
  // One featured card per program even if it satisfies both recommendation categories.
  const ids = [...new Set([...category.first_program_ids, ...result.cheapest_category.first_program_ids, ...result.fixed_category.first_program_ids])];
  return { programs, primary: category,
    featured: ids.map(id => programs.find(p => p.id === id)!).filter(Boolean),
    ranked: category.ranked_entries.map(entry => ({ entry, view: programs.find(p => p.id === entry.program_id)! })),
    excluded: category.exclusion_reasons.map(item => ({ view: programs.find(p => p.id === item.program_id)!, reasons: item.reasons.map(reasonLabel) })),
    comparable: result.cheapest_category.ranked_entries.map(entry => programs.find(p => p.id === entry.program_id)!),
    same_first_set: result.category_relation === 'SAME_FIRST_SET',
  };
}
export function defaultComparison(result: RecommendationResult, preferredId?: string): readonly string[] {
  const available = result.cheapest_category.ranked_entries.map(e => e.program_id);
  const candidates = [preferredId, ...primaryCategory(result).first_program_ids, ...result.cheapest_category.first_program_ids,
    ...result.fixed_category.first_program_ids, ...available].filter((id): id is string => !!id && available.includes(id));
  return [...new Set(candidates)].slice(0, 2);
}
