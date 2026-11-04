import { baselineText, primaryCategory, reasonLabel } from './results.ts';
import { formatMoney } from '../domain/exact.ts';
import type { FeeEvidence, RecommendationResult } from '../domain/types.ts';

export function exitFeeView(fee: FeeEvidence) {
  if (fee.status === 'UNKNOWN') return { amount: null, message: 'Δεν γνωρίζουμε το τέλος πρόωρης αποχώρησης. Έλεγξε το σημερινό συμβόλαιο πριν αποφασίσεις. Δεν θεωρείται μηδενικό και δεν υπολογίζεται καθαρό όφελος αλλαγής.', source: null };
  return { amount: fee.amount_cents, source: fee.evidence_reference,
    message: fee.status === 'KNOWN_ZERO'
      ? 'Ρητά μηδενικό τέλος στους συγκεκριμένους demo όρους. Δεν προσθέτει εφάπαξ επιβάρυνση στο σενάριο, αλλά η σύγκριση παραμένει μόνο ενέργεια και πάγιο.'
      : `Το τέλος ${formatMoney(fee.amount_cents)} είναι ξεχωριστή εφάπαξ επιβάρυνση αποχώρησης. Μπορεί να περιορίσει ή να υπερκαλύψει τη διαφορά χρέωσης. Δεν προστίθεται στο μηνιαίο κόστος, δεν συμψηφίζεται και δεν υπολογίζεται απόσβεση ή καθαρό όφελος αλλαγής.` };
}
export function buildBaselineView(result: RecommendationResult, candidateIds?: readonly string[]) {
  const baseline = result.baseline_evaluation;
  const contract = result.normalized_scenario?.current_contract;
  const exact = contract?.identity_status === 'EXACT_DEMO';
  const original = exact ? result.evaluations.find(e => e.program.program_id === contract.program_id) : null;
  const category = primaryCategory(result);
  const preferred = candidateIds ?? [...new Set([...category.first_program_ids, ...result.cheapest_category.first_program_ids, ...result.fixed_category.first_program_ids])];
  const chosen = candidateIds ? preferred : preferred.filter(id => id !== baseline?.program.program_id);
  const ids = chosen.length ? chosen : category.ranked_entries.filter(e => e.program_id !== baseline?.program.program_id).slice(0, 2).map(e => e.program_id);
  return {
    baseline: baseline?.charges ? baseline : null,
    rows: baseline?.charges ? ids.map(id => result.evaluations.find(e => e.program.program_id === id))
      .filter(e => !!e?.charges && e.baseline_difference_cents !== null).map(e => ({ evaluation: e!, difference: e!.baseline_difference_cents!, message: baselineText(e!) })) : [],
    unavailable: !exact ? 'Δεν έχει οριστεί ακριβές τρέχον πρόγραμμα. Η εταιρεία από μόνη της ή το «δεν γνωρίζω» δεν αρκούν. Δεν υπολογίζεται διαφορά κόστους από αλλαγή.'
      : `Δεν υπολογίζεται το σημερινό demo πρόγραμμα με τα διαθέσιμα στοιχεία. ${original?.reason_codes.map(reasonLabel).join(' ') || 'Έλεγξε την έκδοση και τους όρους.'} Δεν εμφανίζεται ποσό διαφοράς.`,
    still_first: !!baseline && category.first_program_ids.includes(baseline.program.program_id),
    no_candidate_message: candidateIds ? 'Η επιλεγμένη εναλλακτική δεν έχει συγκρίσιμη χρέωση. Δεν υπολογίζεται διαφορά.' : 'Δεν υπάρχει άλλη υπολογίσιμη επιλογή για σύγκριση. Δεν κατασκευάζεται ποσό διαφοράς.',
    fee: exitFeeView(result.switching_assessment.exit_fee_evidence),
  };
}
