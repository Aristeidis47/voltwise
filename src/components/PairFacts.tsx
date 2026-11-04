import { comparisonDifference, RESULT_COST_LABEL } from '../app/results.ts';
import type { ProgramView } from '../app/results.ts';
import { comparePair } from '../domain/analysis.ts';
import { formatExact, formatMoney } from '../domain/exact.ts';
import type { RecommendationResult } from '../domain/types.ts';
import { CostScope, RateText } from './ProgramFacts.tsx';

export default function PairFacts({ result, views, labelFor, onDetail }: { result: RecommendationResult; views: readonly [ProgramView, ProgramView]; labelFor: (id: string) => string; onDetail?: (id: string) => void }) {
  const [a, b] = views;
  const pair = comparePair(result, [a.id, b.id], 'CHEAPEST_SCENARIO');
  const n = result.normalized_scenario!;
  const difference = comparisonDifference(a, b);
  if (difference === null) return <p className="inline-note">Δεν υπάρχουν αρκετά δεδομένα για σύγκριση κόστους.</p>;
  return <div className="pair-facts">
    <p className="pair-context">{formatExact(n.total_kwh_30)} kWh / 30 ημέρες · ίδιοι όροι εκπτώσεων και ίδια κατανομή ζωνών</p>
    <table className="pair-table"><caption>{RESULT_COST_LABEL}, χωρίς ΦΠΑ.</caption><thead><tr><th scope="col">Στοιχείο</th>{views.map(v => <th scope="col" key={v.id}>{v.program.program_name}</th>)}</tr></thead>
      <tbody><tr><th scope="row">Τιμή που χρησιμοποιήθηκε</th>{views.map(v => <td key={v.id}><RateText rates={v.evaluation.discount_evaluation?.effective_rates ?? null} /></td>)}</tr>
        <tr><th scope="row">Ενέργεια</th>{views.map(v => <td key={v.id}>{formatMoney(v.charges!.energy_total_cents)}</td>)}</tr>
        <tr><th scope="row">Πάγιο</th>{views.map(v => <td key={v.id}>{formatMoney(v.charges!.fixed_fee_cents_30)}</td>)}</tr>
        <tr className="pair-total"><th scope="row">Σύνολο / 30 ημέρες</th>{views.map(v => <td key={v.id} data-pair-total={v.id} data-cents={v.total_cents}>{formatMoney(v.total_cents!)}</td>)}</tr>
        <tr><th scope="row">Τύπος τιμής</th>{views.map(v => <td key={v.id}>{v.program.price_type === 'FIXED' ? 'Σταθερή ανά kWh' : 'Μεταβλητή · στιγμιότυπο'}</td>)}</tr>
        <tr><th scope="row">Έκπτωση με όρους</th>{views.map(v => <td key={v.id}>{v.evaluation.discount_evaluation?.status === 'NOT_APPLICABLE' ? 'Δεν υπάρχει' : v.evaluation.discount_evaluation?.status === 'APPLIED' ? 'Εφαρμόστηκε' : 'Δεν εφαρμόστηκε'}</td>)}</tr>
        {onDetail && <tr><th scope="row">Πλήρεις όροι</th>{views.map(v => <td key={v.id}><button id={`pair-details-${v.id}`} className="text-button" onClick={() => onDetail(v.id)}>Λεπτομέρειες<span className="sr-only"> {v.program.program_name}</span></button></td>)}</tr>}
      </tbody></table>
    <p className="pair-difference" data-testid="pair-difference">{difference === 0 ? 'Ίδιο συγκρινόμενο κόστος στην ακρίβεια εμφάνισης.' : `${difference < 0 ? a.program.program_name : b.program.program_name}: χαμηλότερο συγκρινόμενο κόστος κατά ${formatMoney(Math.abs(difference))} / 30 ημέρες για αυτό το ζευγάρι.`} Δεν είναι εξοικονόμηση από αλλαγή συμβολαίου.</p>
    <section className="fact-section"><h2>Πού ισοφαρίζουν οι δύο χρεώσεις;</h2>
      {pair.status === 'NOT_COMPUTABLE' ? <p data-testid="unsupported-intersection">{pair.reason === 'NEEDS_EXPLICIT_SHARE' ? 'Τα τρέχοντα ποσά συγκρίνονται, αλλά δεν υπολογίζεται όριο χωρίς γνωστή κατανομή για θετική διζωνική χρήση.' : 'Δεν υπολογίζεται σημείο ισοφάρισης: το μοντέλο ή τα συγκρίσιμα δεδομένα δεν επαρκούν. Δεν προσεγγίζουμε κλιμακωτές χρεώσεις ως μία ενιαία τιμή.'}</p>
        : pair.intersection.status === 'IDENTICAL' ? <p>Τα δύο προγράμματα έχουν ίδια χρέωση σε όλο το εύρος του demo. Δεν υπάρχει μοναδικό σημείο ισοφάρισης.</p>
        : pair.intersection.status === 'PARALLEL_DIFFERENT' || pair.intersection.status === 'NEGATIVE_INTERSECTION' || pair.intersection.status === 'OUTSIDE_RANGE' ? <p>Δεν αλλάζει η μεταξύ τους σειρά στο εύρος 0–5.000 kWh / 30 ημέρες, με αυτούς τους όρους.</p>
        : <><p data-testid="pair-intersection">{pair.intersection.status === 'AT_ZERO' ? 'Ίδιο κόστος στο μηδέν.' : `Ίδιο κόστος περίπου στις ${formatExact(pair.intersection.kwh!)} kWh / 30 ημέρες.`}</p>
          {pair.lower_winner_ids.length > 0 && <p>Κάτω από το όριο: {pair.lower_winner_ids.map(labelFor).join(', ')}.</p>}
          {pair.upper_winner_ids.length > 0 && <p>Πάνω από το όριο: {pair.upper_winner_ids.map(labelFor).join(', ')}.</p>}
          {pair.globally_cheaper_program_ids_at_intersection.length > 0 && <p className="inline-note">Στο όριο, {pair.globally_cheaper_program_ids_at_intersection.map(labelFor).join(', ')} κοστίζει λιγότερο και από τα δύο. Η τομή του ζευγαριού δεν είναι αλλαγή του συνολικά οικονομικότερου προγράμματος.</p>}
        </>}
      <p className="field-help">Κρατάμε σταθερές τις τιμές demo, τους όρους εκπτώσεων και το μερίδιο κάθε ζώνης. Το όριο προκύπτει πριν από στρογγυλοποίηση και δεν προβλέπει μελλοντικές τιμές.</p>
      {pair.status === 'AVAILABLE' && pair.global_comparison_status !== 'AVAILABLE' && <p className="inline-note" data-testid="pair-global-limit">Η τομή αφορά μόνο αυτό το ζευγάρι. Δεν έχει ολοκληρωθεί ο έλεγχος όλων των επιλογών: λείπουν στοιχεία για την ανάλυση άλλων προγραμμάτων, όπως η κατανομή ζωνών.</p>}
      <p className="field-help">Σταθερή τιμή ανά kWh δεν σημαίνει σταθερός τελικός λογαριασμός. Η μεταβλητή τιμή χρησιμοποιείται μόνο ως στιγμιότυπο σεναρίου.</p>
    </section><CostScope />
  </div>;
}
