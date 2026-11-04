import { answerLabels, monetaryFact, RESULT_COST_LABEL } from '../app/results.ts';
import type { ProgramView } from '../app/results.ts';
import { formatExact, formatMoney } from '../domain/exact.ts';
import { validFee } from '../domain/normalize.ts';
import type { EnergyLine, Rates } from '../domain/types.ts';

export function ProgramTags({ view, noPreference = false }: { view: ProgramView; noPreference?: boolean }) {
  return <div className="program-tags">
    {view.personal && <span className="tag personal">{noPreference ? 'Πρώτο στη σειρά κόστους' : 'Με βάση την προτεραιότητά σου'}</span>}
    {view.cheapest && <span className="tag">Χαμηλότερο κόστος σεναρίου</span>}
    {view.fixed && <span className="tag">Οικονομικότερο σταθερής τιμής</span>}
  </div>;
}
export function ProgramAmount({ view }: { view: ProgramView }) {
  return <div className="program-amount" data-amount-cents={view.total_cents ?? undefined}>
    {view.total_cents === null ? <strong className="no-amount">Δεν υπολογίζεται κόστος</strong>
      : <><strong>{formatMoney(view.total_cents)}</strong><span> / 30 ημέρες</span></>}
    <p>{RESULT_COST_LABEL}</p><p>Χωρίς ΦΠΑ · Δεν είναι τελικός λογαριασμός</p>
  </div>;
}
const zoneNames: Record<EnergyLine['zone'], string> = { UNIFIED: 'Ενιαία χρέωση', NORMAL: 'Κανονική ζώνη', REDUCED: 'Μειωμένη ζώνη' };
export function RateText({ rates }: { rates: Rates | null }) {
  if (!rates) return <span>Δεν υπάρχουν υπολογίσιμα δεδομένα.</span>;
  return rates.basis === 'UNIFIED' ? <span>{rates.unified_rate.replace('.', ',')} €/kWh</span>
    : <span>Κανονική: {rates.normal_rate.replace('.', ',')} €/kWh<br />Μειωμένη: {rates.reduced_rate.replace('.', ',')} €/kWh</span>;
}
export function CostBreakdown({ view }: { view: ProgramView }) {
  const c = view.charges;
  if (!c) return <p className="inline-note">Δεν εμφανίζουμε ποσό επειδή λείπουν συγκρίσιμα στοιχεία.</p>;
  return <section className="fact-section" aria-label="Ανάλυση χρέωσης">
    <h2>Πώς προκύπτει το ποσό</h2>
    <dl className="cost-breakdown">
      {c.energy_lines.map(line => <div key={line.zone} className="cost-line" data-energy-zone={line.zone} data-cents={line.amount_cents}>
        <dt>{zoneNames[line.zone]}<small>{formatExact(line.quantity_kwh_30)} kWh × {line.rate.replace('.', ',')} €/kWh{(line.quantity_kwh_30.n * 100n) % line.quantity_kwh_30.d !== 0n ? ' (οι kWh εμφανίζονται περίπου)' : ''}</small></dt>
        <dd>{formatMoney(line.amount_cents)}</dd>
      </div>)}
      {c.energy_rounding_adjustment_cents !== 0 && <div className="cost-line" data-testid="rounding-adjustment"><dt>Διόρθωση στρογγυλοποίησης</dt><dd>{formatMoney(c.energy_rounding_adjustment_cents)}</dd></div>}
      <div className="cost-line subtotal"><dt>Σύνολο ενέργειας</dt><dd data-testid="energy-total">{formatMoney(c.energy_total_cents)}</dd></div>
      <div className="cost-line"><dt>Πάγιο για 30 ημέρες</dt><dd data-testid="fixed-fee">{formatMoney(c.fixed_fee_cents_30)}</dd></div>
      <div className="cost-line total"><dt>Συγκρινόμενο κόστος<small>Ενέργεια + πάγιο, χωρίς ΦΠΑ</small></dt><dd data-testid="breakdown-total">{formatMoney(c.total_cents)}</dd></div>
    </dl>
    <p className="field-help">Οι χρεώσεις ζωνών είναι συστατικά της ενέργειας. Η ενέργεια αθροίζεται πριν από τη στρογγυλοποίηση και στη συνέχεια προστίθεται το πάγιο.</p>
  </section>;
}
export function DiscountFacts({ view }: { view: ProgramView }) {
  const d = view.evaluation.discount_evaluation;
  return <section className="fact-section" aria-label="Όροι έκπτωσης"><h2>Έκπτωση και προϋποθέσεις</h2>
    {!view.charges ? <p>Δεν υπάρχουν επαρκή δεδομένα για έγκυρο υπολογισμό έκπτωσης.</p>
      : !view.discount_rule ? <p>Δεν υπάρχει έκπτωση με προϋποθέσεις. Η τιμή δεν εξαρτάται από ηλεκτρονικό λογαριασμό ή πάγια εντολή.</p>
      : <>
        <p>{view.discount_rule.explanation}</p>
        <dl className="condition-list">{view.conditions.map(c => <div className="summary-row" key={c.id}><dt>{c.label}</dt><dd>{c.answer ? answerLabels[c.answer] : 'Δεν έχει απαντηθεί'}</dd></div>)}</dl>
        <p className="discount-status" data-testid="discount-status">{d?.status === 'APPLIED' ? 'Η έκπτωση εφαρμόστηκε.' : d?.status === 'UNCONFIRMED' ? 'Η έκπτωση δεν εφαρμόστηκε: υπάρχει άγνωστος όρος.' : 'Η έκπτωση δεν εφαρμόστηκε: δεν πληρούνται όλοι οι όροι.'}</p>
        <dl className="condition-list"><div className="summary-row"><dt>Βασική τιμή ενέργειας</dt><dd><RateText rates={view.program.base_rates} /></dd></div>
          <div className="summary-row"><dt>Τιμή που χρησιμοποιήθηκε</dt><dd><RateText rates={d?.effective_rates ?? null} /></dd></div>
          {d?.status === 'APPLIED' && <div className="summary-row"><dt>Επίδραση της έκπτωσης / 30 ημέρες</dt><dd>{formatMoney(view.charges.discount_effect_cents)}</dd></div>}
        </dl>
        <p className="field-help">Η επίδραση της έκπτωσης αφορά τη βασική και τη μειωμένη τιμή του ίδιου προγράμματος. Δεν είναι εξοικονόμηση από αλλαγή παρόχου. Το πάγιο παραμένει {formatMoney(view.charges.fixed_fee_cents_30)}.</p>
      </>}
  </section>;
}
export function ProgramTerms({ view }: { view: ProgramView }) {
  const p = view.program;
  const fee = p.exit_fee_terms;
  return <section className="fact-section"><h2>Τιμή και όροι προγράμματος</h2><p className="price-caution">{view.price_type_text}</p>
    <dl><div className="summary-row"><dt>Χρονική αναφορά τιμής</dt><dd>{view.evaluation.reason_codes.includes('INVALID_PRICE_TYPE') ? 'Δεν υπάρχουν πλήρη στοιχεία' : p.price_type === 'FIXED' ? `${p.fixed_rate_months} μήνες στους φανταστικούς όρους` : 'Μόνο το στιγμιότυπο demo'}</dd></div>
      <div className="summary-row"><dt>Ελάχιστη διάρκεια</dt><dd>{!Number.isSafeInteger(p.minimum_commitment_months) || p.minimum_commitment_months < 0 ? 'Δεν υπάρχουν πλήρη στοιχεία' : p.minimum_commitment_months === 0 ? 'Χωρίς ελάχιστη δέσμευση' : `${p.minimum_commitment_months} μήνες`}</dd></div>
      <div className="summary-row"><dt>Συμβατή μέτρηση</dt><dd>{p.pricing_basis === 'DUAL_ZONE' ? 'Διζωνική, με γνωστή κατανομή' : 'Ενιαία τιμή για όλες τις kWh'}</dd></div>
      <div className="summary-row"><dt>Ρήτρα αποχώρησης του demo προϊόντος</dt><dd>{validFee(fee) && fee.status !== 'UNKNOWN' ? formatMoney(fee.amount_cents) : 'Άγνωστη — δεν εκτιμάται'}</dd></div>
      <div className="summary-row"><dt>Ενεργοποίηση / εγγύηση demo</dt><dd>{monetaryFact(p.activation_fee_cents)} / {monetaryFact(p.deposit_cents)}</dd></div>
    </dl><p className="field-help">Οι παραπάνω είναι κατασκευασμένοι όροι αυτού του demo προϊόντος. Δεν τεκμηριώνουν τους όρους του σημερινού πραγματικού συμβολαίου σου.</p>
  </section>;
}
export function CostScope() {
  return <details className="cost-scope"><summary>Τι περιλαμβάνει αυτή η σύγκριση;</summary>
    <p>Μόνο ενέργεια και πάγιο για κοινή περίοδο 30 ημερών, χωρίς ΦΠΑ. Δεν περιλαμβάνονται άλλοι φόροι, ρυθμιζόμενες ή δημοτικές χρεώσεις, οφειλές, εγγυήσεις, κόστος σύνδεσης ή πρόωρης αποχώρησης.</p>
    <p>Δεν υπολογίζεται τελικός λογαριασμός ή καθαρό όφελος αλλαγής. Η 30ήμερη βάση δεν είναι πρόβλεψη μελλοντικής κατανάλωσης ή τιμών.</p>
  </details>;
}
