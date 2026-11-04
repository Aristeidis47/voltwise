import { contractSelection, selectDemoContract, setContractFeeKnowledge } from '../app/optional.ts';
import { DEMO_PROGRAMS } from '../data/demoPrograms.ts';
import type { ContractReference } from '../domain/types.ts';
import { formatMoney } from '../domain/exact.ts';

export default function CurrentContractPicker({ contract, onChange }: { contract: ContractReference | null; onChange: (contract: ContractReference | null) => void }) {
  const selected = DEMO_PROGRAMS.find(p => p.program_id === contract?.program_id);
  return <details className="optional-route" open={contract !== null}>
    <summary>Σημερινό πρόγραμμα · προαιρετικό</summary>
    <p>Για τη δοκιμή, μπορείς να ορίσεις ένα ακριβές <strong>φανταστικό</strong> πρόγραμμα ως σημερινό. Δεν αντιστοιχίζουμε πραγματικό συμβόλαιο σε demo τιμές.</p>
    <label htmlFor="current-demo-program">Ακριβές σημερινό demo πρόγραμμα</label>
    <select id="current-demo-program" value={contractSelection(contract)} onChange={e => onChange(selectDemoContract(e.target.value))}>
      <option value="">Παράλειψη / Δεν γνωρίζω / Δεν υπάρχει στο demo</option>
      <option value="PROVIDER_ONLY">Γνωρίζω μόνο την εταιρεία, όχι το ακριβές πρόγραμμα</option>
      {DEMO_PROGRAMS.map(p => <option key={p.program_id} value={p.program_id}>{p.provider_name} · {p.program_name}</option>)}
    </select>
    {selected ? <>
      <p className="field-help">Ακριβής έκδοση: {selected.program_revision} · Όροι: {selected.terms_revision}. Ο ίδιος κανόνας κατανάλωσης και εκπτώσεων θα εφαρμοστεί στο σημερινό και στις εναλλακτικές.</p>
      <fieldset className="contract-fee-options"><legend>Τέλος πρόωρης αποχώρησης</legend>
        <label><input type="radio" name="contract-fee" value="DEMO_TERMS" checked={contract!.exit_fee_evidence.status === 'KNOWN_ZERO'} onChange={() => onChange(setContractFeeKnowledge(contract!, true))} /><span>Γνωστό: 0 € στους συγκεκριμένους demo όρους</span></label>
        {contract!.exit_fee_evidence.status === 'KNOWN_AMOUNT' && <label><input type="radio" name="contract-fee" value="KNOWN_AMOUNT" checked readOnly /><span>Γνωστό ακριβές ποσό: {formatMoney(contract!.exit_fee_evidence.amount_cents!)} · πηγή {contract!.exit_fee_evidence.evidence_reference}</span></label>}
        <label><input type="radio" name="contract-fee" value="UNKNOWN" checked={contract!.exit_fee_evidence.status === 'UNKNOWN'} onChange={() => onChange(setContractFeeKnowledge(contract!, false))} /><span>Δεν γνωρίζω αν ισχύει τέλος για την περίπτωσή μου</span></label>
      </fieldset>
      <p className="field-help">Τα πέντε demo προϊόντα έχουν ρητά μηδενικό τέλος. Αυτό δεν τεκμηριώνει τη ρήτρα ενός πραγματικού συμβολαίου. Δεν εισάγονται πραγματικές τιμές ή ασαφή ποσά.</p>
      {contract!.exit_fee_evidence.status === 'UNKNOWN' && <p className="inline-note">Η ρήτρα πρέπει να ελεγχθεί πριν αποφασίσεις. Η σύγκριση χρέωσης ενέργειας και παγίου μπορεί να εμφανιστεί, αλλά δεν είναι καθαρό όφελος αλλαγής.</p>}
    </> : <p className="inline-note">{contract ? 'Η εταιρεία από μόνη της δεν προσδιορίζει τη χρέωση. ' : ''}Χωρίς ακριβές πρόγραμμα δεν εμφανίζεται ποσό εξοικονόμησης ή διαφοράς από αλλαγή. Μπορείς να συνεχίσεις κανονικά.</p>}
  </details>;
}
