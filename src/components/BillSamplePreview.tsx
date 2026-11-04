import { useEffect, useRef } from 'react';
import { DEMO_BILL_SAMPLE } from '../data/demoBill.ts';
import { add, decimal, formatExact } from '../domain/exact.ts';

export default function BillSamplePreview({ onUse, onClose }: { onUse: () => void; onClose: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const sample = DEMO_BILL_SAMPLE, c = sample.consumption;
  return <section className="sample-preview" aria-labelledby="sample-title">
    <p className="eyebrow">ΕΚΠΑΙΔΕΥΤΙΚΟ DEMO · ΟΧΙ ΠΡΑΓΜΑΤΙΚΟΣ ΛΟΓΑΡΙΑΣΜΟΣ</p>
    <h2 id="sample-title" ref={heading} tabIndex={-1}>Φανταστικό δείγμα λογαριασμού</h2>
    <p>Έτοιμο παράδειγμα {sample.sample_id}. Δεν αφορά πραγματικό πελάτη ή πάροχο και δεν επιλέγει σημερινό συμβόλαιο.</p>
    <dl className="sample-document"><div><dt>Περίοδος κατανάλωσης</dt><dd>{c.period_days} ημέρες</dd></div>
      <div><dt>Κανονική ζώνη</dt><dd>{c.normal_kwh} kWh</dd></div><div><dt>Μειωμένη ζώνη</dt><dd>{c.reduced_kwh} kWh</dd></div>
      <div><dt>Συνολική κατανάλωση</dt><dd>{formatExact(add(decimal(c.normal_kwh), decimal(c.reduced_kwh)))} kWh</dd></div></dl>
    <p>Η χρήση του δείγματος θα αντικαταστήσει τις kWh, τις ημέρες και τη μέτρηση με τα παραπάνω διζωνικά στοιχεία. Έπειτα θα τα ελέγξεις και θα τα επιβεβαιώσεις.</p>
    <button type="button" className="primary-button full-width" onClick={onUse}>Χρήση αυτών των demo στοιχείων</button>
    <button type="button" className="text-button" onClick={onClose}>Κλείσιμο δείγματος χωρίς αλλαγές</button>
    <p className="field-help">Το δείγμα είναι ενσωματωμένο στην εφαρμογή. Δεν γίνεται μεταφόρτωση ή ανάγνωση πραγματικού PDF/OCR.</p>
  </section>;
}
