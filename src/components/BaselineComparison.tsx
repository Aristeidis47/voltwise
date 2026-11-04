import { buildBaselineView } from '../app/baseline.ts';
import { formatExact, formatMoney } from '../domain/exact.ts';
import type { RecommendationResult } from '../domain/types.ts';

export default function BaselineComparison({ result, candidateIds }: { result: RecommendationResult; candidateIds?: readonly string[] }) {
  const n = result.normalized_scenario;
  if (!n || n.purpose !== 'EXISTING_SUPPLY') return null;
  const view = buildBaselineView(result, candidateIds), baseline = view.baseline;
  const evaluations = baseline ? [baseline, ...view.rows.map(row => row.evaluation).filter(e => e.program.program_id !== baseline.program.program_id)] : [];
  return <section className="baseline-comparison" aria-label="Σύγκριση με το σημερινό demo πρόγραμμα">
    <h2>Σήμερα / εναλλακτική</h2>
    {baseline ? <>
      <p className="field-help">«Σήμερα» σημαίνει το ακριβές demo πρόγραμμα στο ίδιο σενάριο {formatExact(n.total_kwh_30)} kWh / 30 ημέρες, με ίδιους όρους εκπτώσεων και κατανομή. Δεν ανακατασκευάζουμε παλιό πραγματικό λογαριασμό.</p>
      <table className="baseline-table"><caption>Χρέωση ενέργειας + πάγιο · ενδεικτικά δεδομένα · χωρίς ΦΠΑ</caption><thead><tr><th scope="col">Πρόγραμμα</th><th scope="col">Ενέργεια</th><th scope="col">Πάγιο</th><th scope="col">Σύνολο / 30 ημέρες</th></tr></thead><tbody>
        {evaluations.map((e, index) => <tr key={e.program.program_id}><th scope="row">{index === 0 ? 'Σήμερα: ' : 'Εναλλακτική: '}{e.program.program_name}</th><td>{formatMoney(e.charges!.energy_total_cents)}</td><td>{formatMoney(e.charges!.fixed_fee_cents_30)}</td><td {...(index === 0 ? { 'data-testid': 'baseline-total', 'data-cents': e.charges!.total_cents } : { 'data-baseline-alternative': e.program.program_id, 'data-cents': e.charges!.total_cents })}>{formatMoney(e.charges!.total_cents)}</td></tr>)}
      </tbody></table>
      {view.still_first && <p className="inline-note">Το τρέχον demo πρόγραμμά σου παραμένει οικονομικότερο ή ισότιμο στην κατηγορία που επέλεξες, με αυτές τις παραδοχές.</p>}
      <div data-testid="baseline-text">{view.rows.length ? view.rows.map(row => <p key={row.evaluation.program.program_id} data-baseline-difference={row.evaluation.program.program_id} data-cents={row.difference}><strong>{row.evaluation.program.program_name}:</strong> {row.message}</p>) : <p>{view.no_candidate_message}</p>}</div>
      <details><summary>Ποιο ακριβές πρόγραμμα χρησιμοποιήθηκε;</summary><p className="field-help">{baseline.program.provider_name} · {baseline.program.program_name} · {baseline.program.program_revision} · Όροι {baseline.program.terms_revision}.</p></details>
    </> : <p data-testid="baseline-text">{view.unavailable}</p>}
    <div className="exit-fee-note"><h3>Τέλος πρόωρης αποχώρησης · ξεχωριστά</h3>
      <p data-testid="current-exit-fee" data-cents={view.fee.amount ?? 'unknown'}>{view.fee.amount === null ? 'Άγνωστο ποσό' : `${formatMoney(view.fee.amount)} · εφάπαξ`}.</p><p>{view.fee.message}</p>
      {view.fee.source && <details><summary>Πηγή ποσού demo</summary><p>{view.fee.source}</p></details>}
    </div>
    <p className="field-help">Δεν υπολογίζεται συνολικό όφελος αλλαγής, συμψηφισμός ή απόσβεση ρήτρας. Η διαφορά χρέωσης δεν αποτελεί εξοικονόμηση από αλλαγή συμβολαίου.</p>
  </section>;
}
