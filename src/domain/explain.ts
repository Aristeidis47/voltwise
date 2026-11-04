import { formatExact, formatMoney } from './exact.ts';
import type { Exact } from './exact.ts';
import { COST_NOTICE } from './recommend.ts';
import type { CategoryId, Evaluation, NormalizedScenario } from './types.ts';

/** Deterministic copy derived only from the evaluated facts. No generated numbers. */
const quantityLabel = (q: Exact) => (q.n * 100n) % q.d === 0n ? formatExact(q) : `${q.n}/${q.d} (≈ ${formatExact(q)})`;
export function explainProgram(evaluation: Evaluation, scenario: NormalizedScenario, category: CategoryId): readonly string[] {
  const p = evaluation.program;
  const lines = [`${p.provider_name} / ${p.program_name} — φανταστικό demo.`, COST_NOTICE];
  if (!evaluation.charges) return [...lines, `Δεν υπολογίζεται: ${evaluation.reason_codes.join(', ')}.`];
  const c = evaluation.charges;
  lines.push(`Αρχικά στοιχεία: ${quantityLabel(scenario.original_total_kwh)} kWh σε ${scenario.original_period_days} ημέρες. Σύγκριση για ${quantityLabel(scenario.total_kwh_30)} kWh / 30 ημέρες, ${category === 'FIXED_RATE' ? 'μεταξύ επιλογών σταθερής τιμής' : 'με τις τιμές του σεναρίου'}.`);
  for (const line of c.energy_lines) lines.push(`${({ UNIFIED: 'Ενιαία', NORMAL: 'Κανονική ζώνη', REDUCED: 'Μειωμένη ζώνη' })[line.zone]}: ${quantityLabel(line.quantity_kwh_30)} kWh × ${line.rate.replace('.', ',')} €/kWh = ${formatMoney(line.amount_cents)}.`);
  if (c.energy_rounding_adjustment_cents) lines.push(`Διόρθωση στρογγυλοποίησης: ${formatMoney(c.energy_rounding_adjustment_cents)}.`);
  lines.push(`Ενέργεια ${formatMoney(c.energy_total_cents)} + πάγιο ${formatMoney(c.fixed_fee_cents_30)} = ${formatMoney(c.total_cents)}.`);
  const discount = evaluation.discount_evaluation;
  if (discount?.status === 'APPLIED') lines.push(`Εφαρμόστηκε η έκπτωση με όλους τους απαιτούμενους όρους. Επίδραση στη χρέωση: ${formatMoney(c.discount_effect_cents)}. Δεν αλλάζει το πάγιο.`);
  else if (discount && discount.status !== 'NOT_APPLICABLE') lines.push(`Βασική τιμή χωρίς έκπτωση. Μη αποδεκτοί όροι: ${discount.unmet_condition_ids.join(', ') || 'κανένας'}. Άγνωστοι όροι: ${discount.unknown_condition_ids.join(', ') || 'κανένας'}.`);
  lines.push(p.price_type === 'FIXED' ? `Σταθερή τιμή ανά kWh για ${p.fixed_rate_months} μήνες στους demo όρους, όχι σταθερός λογαριασμός. Η χρήση και η απώλεια έκπτωσης αλλάζουν το ποσό.` : 'Μόνο τιμή στιγμιότυπου demo. Δεν γνωρίζουμε την επόμενη τιμή.');
  const difference = evaluation.baseline_difference_cents;
  if (difference === null) lines.push('Χωρίς ακριβές, πλήρες και υπολογίσιμο τρέχον demo συμβόλαιο δεν υπολογίζεται διαφορά από αλλαγή.');
  else lines.push(difference === 0 ? 'Ίδιο συγκρινόμενο κόστος με το τρέχον demo πρόγραμμα.'
    : `${difference > 0 ? 'Χαμηλότερο' : 'Υψηλότερο'} συγκρινόμενο κόστος κατά ${formatMoney(Math.abs(difference))} / 30 ημέρες έναντι του ακριβούς demo baseline. Δεν είναι καθαρό όφελος αλλαγής.`);
  return lines;
}
