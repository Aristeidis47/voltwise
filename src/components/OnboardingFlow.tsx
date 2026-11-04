import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { changeMeter, changeSource, formFromScenario, normalizationText, quantityNotice, toUserScenario, validateConsumptionDraft, validateFormStep } from '../app/onboarding.ts';
import type { FormDraft, FormError, FormField, FormStep, QuantityPreview } from '../app/onboarding.ts';
import type { Meter, UserScenario, ValidationError } from '../domain/types.ts';
import { formatExact } from '../domain/exact.ts';
import { contractSelection, applyBillSample, updateDraft } from '../app/optional.ts';
import { DEMO_PROGRAMS } from '../data/demoPrograms.ts';
import CurrentContractPicker from './CurrentContractPicker.tsx';
import BillSamplePreview from './BillSamplePreview.tsx';
import Brand, { Bolt } from './Brand.tsx';

const steps: FormStep[] = ['purpose', 'consumption', 'preferences', 'review'];
const stepLabels = ['Σκοπός', 'Κατανάλωση', 'Προτιμήσεις', 'Έλεγχος'];
const priorityLabels = { LOWEST_SCENARIO_COST: 'Χαμηλότερο εκτιμώμενο κόστος', FIXED_RATE: 'Προβλεψιμότητα χρέωσης ενέργειας', NO_CLEAR_PREFERENCE: 'Δεν έχω σαφή προτίμηση' };
const answerLabels = { YES: 'Ναι', NO: 'Όχι', UNKNOWN: 'Δεν γνωρίζω' };
const fieldTarget = (field: FormField) => field === 'consumption' ? 'consumption-question' : `field-${field}`;

interface ChoiceOption { value: string; label: string; description?: string; symbol?: string }
function ChoiceGroup({ name, legend, value, options, onChange, error, help, compact = false }: {
  name: FormField; legend: string; value: string; options: readonly ChoiceOption[]; onChange: (value: string) => void;
  error?: string; help?: string; compact?: boolean;
}) {
  return <fieldset id={fieldTarget(name)} tabIndex={-1} className={`question ${error ? 'invalid-group' : ''}`}
    aria-describedby={[help && `${name}-help`, error && `${name}-error`].filter(Boolean).join(' ') || undefined} aria-invalid={!!error}>
    <legend>{legend}</legend>
    {help && <p id={`${name}-help`} className="field-help">{help}</p>}
    <div className={compact ? 'choice-grid compact' : 'choice-grid'}>
      {options.map(option => <label className="choice" key={option.value}>
        <input type="radio" name={name} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)}
          aria-labelledby={`${name}-${option.value}-label`} aria-describedby={option.description ? `${name}-${option.value}-description` : undefined} />
        <span className="choice-content">
          {option.symbol && <span className="choice-symbol" aria-hidden="true">{option.symbol}</span>}
          <span className="choice-copy"><span id={`${name}-${option.value}-label`} className="choice-title">{option.label}</span>
            {option.description && <span id={`${name}-${option.value}-description`} className="choice-description">{option.description}</span>}</span>
          <span className="radio-dot" aria-hidden="true" />
        </span>
      </label>)}
    </div>
    {error && <p id={`${name}-error`} className="field-error">{error}</p>}
  </fieldset>;
}
function NumberField({ field, label, value, onChange, onBlur, error, help, unit = 'kWh', integer = false }: {
  field: FormField; label: string; value: string; onChange: (value: string) => void; onBlur: () => void;
  error?: string; help?: string; unit?: string; integer?: boolean;
}) {
  return <div className="number-field">
    <label htmlFor={fieldTarget(field)}>{label}</label>
    {help && <p className="field-help" id={`${field}-help`}>{help}</p>}
    <div className="input-with-unit"><input id={fieldTarget(field)} name={field} type="text" inputMode={integer ? 'numeric' : 'decimal'}
      autoComplete="off" value={value} onChange={event => onChange(event.target.value)} onBlur={onBlur}
      aria-invalid={!!error} aria-describedby={[help && `${field}-help`, error && `${field}-error`].filter(Boolean).join(' ') || undefined} />
      <span aria-hidden="true">{unit}</span></div>
    {error && <p className="field-error" id={`${field}-error`}>{error}</p>}
  </div>;
}
function QuantitySummary({ preview }: { preview: QuantityPreview }) {
  const notice = quantityNotice(preview);
  return <section className="normalization" aria-labelledby="normalization-title">
    <p className="mini-label" id="normalization-title">Κοινή βάση σύγκρισης</p>
    <p className="normalized-value"><strong>{formatExact(preview.total_kwh_30)}</strong> kWh <span>/ 30 ημέρες</span></p>
    <p className="conversion">{normalizationText(preview)}</p>
    {preview.normal_kwh_30 !== null && <p className="conversion">Κανονική: {formatExact(preview.normal_kwh_30)} · Μειωμένη: {formatExact(preview.reduced_kwh_30!)} kWh / 30 ημέρες</p>}
    <p>Χρησιμοποιούμε 30 ημέρες ως κοινή «μηνιαία» βάση, όχι ως πρόβλεψη της επόμενης κατανάλωσής σου.</p>
    {notice && <p className="quantity-notice">{notice}</p>}
  </section>;
}
function SummaryRow({ label, children }: { label: string; children: ReactNode }) {
  return <div className="summary-row"><dt>{label}</dt><dd>{children}</dd></div>;
}

export default function OnboardingFlow({ initialScenario, onSubmit, submissionErrors, onCancel }: {
  initialScenario: UserScenario | null; onSubmit: (scenario: UserScenario) => void; submissionErrors: readonly ValidationError[];
  onCancel?: () => void;
}) {
  const [form, setForm] = useState(() => formFromScenario(initialScenario));
  const [step, setStep] = useState<FormStep>(initialScenario ? 'review' : 'welcome');
  const [attempted, setAttempted] = useState(false);
  const [touched, setTouched] = useState<Set<FormField>>(new Set());
  const [showSample, setShowSample] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const check = validateConsumptionDraft(form);
  const stepErrors = validateFormStep(form, step);
  const shownErrors = stepErrors.filter(e => attempted || touched.has(e.field));
  const error = (field: FormField) => shownErrors.find(e => e.field === field)?.message;
  const touch = (field: FormField) => setTouched(previous => new Set(previous).add(field));
  const update = (patch: Partial<FormDraft>) => setForm(previous => updateDraft(previous, patch));
  function go(next: FormStep) { setAttempted(false); setTouched(new Set()); setShowSample(false); setStep(next); }
  useEffect(() => { heading.current?.focus(); window.scrollTo({ top: 0, behavior: 'instant' }); }, [step]);
  function focusError(errors: readonly FormError[]) {
    requestAnimationFrame(() => document.getElementById(fieldTarget(errors[0]!.field))?.focus());
  }
  function next() {
    if (stepErrors.length) { setAttempted(true); focusError(stepErrors); return; }
    if (step === 'review') {
      const scenario = toUserScenario(form, initialScenario);
      if (scenario.ok) onSubmit(scenario.value);
      return;
    }
    go(steps[steps.indexOf(step) + 1]!);
  }
  const title = { welcome: '', purpose: 'Πού βρίσκεσαι σήμερα;', consumption: 'Πόσο ρεύμα χρησιμοποιείς;', preferences: 'Τι έχει σημασία για εσένα;', review: 'Μια τελευταία ματιά.' }[step];
  const subtitle = { welcome: '', purpose: 'Διάλεξε την περίπτωση που σε αφορά.', consumption: 'Χρειαζόμαστε τις kWh και την περίοδο που καλύπτουν, όχι το ποσό του λογαριασμού.', preferences: 'Οι απαντήσεις σου καθορίζουν ποιες επιλογές προτείνονται και ποιες εκπτώσεις εφαρμόζονται.', review: 'Έλεγξε τις παραδοχές σου. Μπορείς να τις διορθώσεις πριν από τη σύγκριση.' }[step];
  if (step === 'welcome') return <div className="app-shell"><Brand /><main id="main-content" tabIndex={-1} className="welcome">
    <div className="welcome-art" aria-hidden="true"><span className="orbit one" /><span className="orbit two" /><Bolt large /><span className="art-note">Η δική σου χρήση.<br />Η δική σου επιλογή.</span></div>
    <p className="eyebrow">Λίγη περισσότερη σιγουριά στην επιλογή</p>
    <h1 ref={heading} tabIndex={-1}>Το ρεύμα σου,<br /><span>με τους δικούς σου όρους.</span></h1>
    <p className="welcome-description">Σύγκρινε προγράμματα ρεύματος με βάση τη χρήση σου και δες τι αλλάζει όταν αλλάζουν οι ανάγκες σου.</p>
    <div className="demo-callout"><strong>Μια δοκιμή, χωρίς δεσμεύσεις.</strong><p>Οι πάροχοι, τα προγράμματα και οι τιμές είναι φανταστικά, για αυτό το εκπαιδευτικό demo.</p></div>
    <button className="primary-button" onClick={() => go('purpose')}>Ας ξεκινήσουμε <span aria-hidden="true">→</span></button>
    <p className="privacy-note">Χωρίς εγγραφή ή προσωπικά στοιχεία. Η ανανέωση της σελίδας καθαρίζει τη συνεδρία.</p>
  </main></div>;

  return <div className="app-shell"><Brand /><main id="main-content" tabIndex={-1} className="wizard">
    {onCancel && <div className="edit-notice"><p>Διορθώνεις τα αρχικά στοιχεία. Νέα υποβολή θα αντικαταστήσει την αρχική σύγκριση και θα καθαρίσει τη Δοκιμή.</p><button type="button" className="text-button" onClick={onCancel}>Ακύρωση διορθώσεων</button></div>}
    <nav className="step-progress" aria-label="Βήματα σύγκρισης"><ol>{steps.map((s, index) => <li key={s} aria-current={step === s ? 'step' : undefined}
      className={steps.indexOf(step) > index ? 'complete' : step === s ? 'current' : ''}><span className="step-number" aria-hidden="true">{steps.indexOf(step) > index ? '✓' : index + 1}</span><span>{stepLabels[index]}</span></li>)}</ol></nav>
    <div className="step-heading"><p className="eyebrow">Βήμα {steps.indexOf(step) + 1} από 4</p><h1 ref={heading} tabIndex={-1}>{title}</h1><p>{subtitle}</p></div>
    <form noValidate onSubmit={event => { event.preventDefault(); next(); }}>
      {attempted && shownErrors.length > 0 && <div className="error-summary" role="alert"><strong>Χρειάζονται μερικές διορθώσεις.</strong><ul>{shownErrors.map(e => <li key={e.field}><a href={`#${fieldTarget(e.field)}`} onClick={event => { event.preventDefault(); document.getElementById(fieldTarget(e.field))?.focus(); }}>{e.message}</a></li>)}</ul></div>}
      {step === 'purpose' && <>
        <ChoiceGroup name="purpose" legend="Για ποια περίπτωση συγκρίνεις;" value={form.purpose} error={error('purpose')}
          onChange={v => update({ purpose: v as FormDraft['purpose'], current_contract: v === 'NEW_SUPPLY' ? null : form.current_contract })}
          options={[{ value: 'EXISTING_SUPPLY', label: 'Έχω συμβόλαιο', description: 'Σκέφτομαι αν υπάρχει καταλληλότερο πρόγραμμα.', symbol: '↔' },
            { value: 'NEW_SUPPLY', label: 'Νέα παροχή', description: 'Επιλέγω πρόγραμμα για ένα νέο ξεκίνημα.', symbol: '+' }]} />
        <p className="inline-note">Δεν χρειάζεται να γνωρίζεις το σημερινό σου πρόγραμμα για να προχωρήσεις.</p>
        {form.purpose === 'EXISTING_SUPPLY' && <CurrentContractPicker contract={form.current_contract} onChange={current_contract => update({ current_contract })} />}
      </>}
      {step === 'consumption' && <>
        <div className="sample-entry"><button id="open-bill-sample" type="button" className="outline-button" aria-expanded={showSample} onClick={() => setShowSample(true)}>Δες με δείγμα λογαριασμού</button><p className="field-help">Προαιρετικό, έτοιμο φανταστικό παράδειγμα. Χωρίς ανάγνωση PDF.</p></div>
        {showSample && <BillSamplePreview onUse={() => { setForm(previous => applyBillSample(previous)); setShowSample(false); setAttempted(false); setTouched(new Set()); requestAnimationFrame(() => document.getElementById('field-normal')?.focus()); }} onClose={() => { setShowSample(false); requestAnimationFrame(() => document.getElementById('open-bill-sample')?.focus()); }} />}
        <div id="consumption-question" tabIndex={-1}>
          <ChoiceGroup name="source" legend="Έχεις στοιχεία κατανάλωσης;" value={form.source === 'DEMO_SAMPLE' ? 'BILL_MANUAL' : form.source} error={error('source')}
            onChange={v => setForm(previous => changeSource(previous, v as FormDraft['source']))}
            options={[{ value: 'BILL_MANUAL', label: 'Έχω στοιχεία λογαριασμού', description: 'Θα γράψω τις kWh και τις ημέρες που αναφέρει.' },
              { value: 'INDICATIVE', label: 'Δεν έχω λογαριασμό', description: 'Θα δοκιμάσω μια δική μου υπόθεση κατανάλωσης.' }]} />
          {form.source === 'DEMO_SAMPLE' && <div className="sample-origin"><strong>Προέλευση: φανταστικό demo δείγμα</strong><p>Οι παρακάτω τιμές είναι προσυμπληρωμένες για δοκιμή. Μπορείς να τις αλλάξεις και να τις επιβεβαιώσεις ξανά.</p><button type="button" className="text-button" onClick={() => setForm(previous => changeSource(previous, 'BILL_MANUAL'))}>Καθαρισμός δείγματος — δικά μου στοιχεία</button></div>}
          {form.source && <>
            <ChoiceGroup name="meter" legend="Τι μέτρηση έχει η παροχή;" value={form.meter} error={error('meter')}
              onChange={v => setForm(previous => changeMeter(previous, v as Meter))}
              options={[{ value: 'SINGLE', label: 'Μονή μέτρηση', description: 'Ένα σύνολο kWh, χωρίς χωριστές ζώνες.' },
                { value: 'DUAL', label: 'Διζωνική μέτρηση', description: 'Χωριστή κανονική και μειωμένη ζώνη.' }, { value: 'UNKNOWN', label: 'Δεν γνωρίζω', description: 'Θα συγκρίνουμε μόνο προγράμματα ενιαίας τιμής.' }]} />
            {form.meter === 'DUAL' && <ChoiceGroup name="allocation" legend={form.source !== 'INDICATIVE' ? 'Γνωρίζεις τις kWh κάθε ζώνης;' : 'Θέλεις να ορίσεις κατανομή στις ζώνες;'}
              value={form.allocation} error={error('allocation')} onChange={v => update({ allocation: v as FormDraft['allocation'], share: '' })}
              options={form.source !== 'INDICATIVE'
                ? [{ value: 'SPLIT', label: 'Ναι, έχω χωριστές kWh' }, { value: 'UNKNOWN', label: 'Γνωρίζω μόνο το σύνολο', description: 'Θα συγκρίνουμε μόνο ενιαίες τιμές μέχρι να δοθεί η κατανομή.' }]
                : [{ value: 'SHARE', label: 'Θα δοκιμάσω ένα ποσοστό', description: 'Θα σημειωθεί ως υπόθεση, όχι ως πραγματική μέτρηση.' }, { value: 'UNKNOWN', label: 'Δεν γνωρίζω ακόμη', description: 'Θα συγκρίνουμε μόνο προγράμματα ενιαίας τιμής.' }]} />}
            {form.meter && (form.meter !== 'DUAL' || form.allocation) && <>
              {form.source !== 'INDICATIVE' ? <>
                <section className="input-card" aria-labelledby="bill-data-title"><h2 id="bill-data-title">Στοιχεία του λογαριασμού</h2><p className="field-help">Αντίγραψε την κατανάλωση σε kWh. Μην γράψεις ευρώ ή τη συνολική ένδειξη του μετρητή.</p>
                  {form.meter === 'DUAL' && form.allocation === 'SPLIT' ? <>
                    <NumberField field="normal" label="Κανονική ζώνη (kWh)" value={form.normal} error={error('normal')} onChange={v => update({ normal: v })} onBlur={() => touch('normal')} />
                    <NumberField field="reduced" label="Μειωμένη ζώνη (kWh)" value={form.reduced} error={error('reduced')} onChange={v => update({ reduced: v })} onBlur={() => touch('reduced')} />
                  </> : <NumberField field="total" label="Συνολική κατανάλωση (kWh)" value={form.total} error={error('total')} onChange={v => update({ total: v })} onBlur={() => touch('total')} />}
                  <NumberField field="days" label="Διάρκεια λογαριασμού (ημέρες)" value={form.days} error={error('days')} unit="ημέρες" integer
                    help="Γράψε πόσες ημέρες καλύπτει η κατανάλωση: από 1 έως 366." onChange={v => update({ days: v })} onBlur={() => touch('days')} />
                  <div className="day-shortcuts" role="group" aria-label="Γρήγορη επιλογή ημερών">{[30, 60, 120].map(days => <button key={days} type="button" aria-pressed={form.days === String(days)} onClick={() => update({ days: String(days) })}>{days} ημέρες</button>)}
                    <button type="button" onClick={() => document.getElementById('field-days')?.focus()}>Άλλη διάρκεια</button></div>
                </section>
              </> : <section className="input-card" aria-labelledby="indicative-title"><h2 id="indicative-title">Ενδεικτική χρήση</h2>
                <p>Διάλεξε αφετηρία και άλλαξέ τη ελεύθερα. Δεν εκτιμήσαμε τη χρήση του σπιτιού σου.</p>
                <div className="preset-grid" role="group" aria-label="Αφετηρίες ενδεικτικής χρήσης">{[150, 300, 600].map(q => <button type="button" key={q}
                  aria-pressed={form.indicative_preset === `KWH_${q}`} onClick={() => update({ indicative_total: String(q), indicative_preset: `KWH_${q}` as FormDraft['indicative_preset'] })}><strong>{q}</strong><span>kWh / 30 ημέρες</span></button>)}</div>
                <NumberField field="indicative_total" label="Δική σου ενδεικτική χρήση (kWh / 30 ημέρες)" value={form.indicative_total} error={error('indicative_total')}
                  help="Από 0 έως 5.000 kWh. Μπορείς να γράψεις αριθμό χωρίς να διαλέξεις αφετηρία." onChange={v => update({ indicative_total: v, indicative_preset: 'CUSTOM' })} onBlur={() => touch('indicative_total')} />
                {form.meter === 'DUAL' && form.allocation === 'SHARE' && <NumberField field="share" label="Υπόθεση μεριδίου μειωμένης ζώνης (%)" value={form.share} unit="%" error={error('share')}
                  help="Ποιο ποσοστό της συνολικής χρήσης υποθέτεις ότι γίνεται στη μειωμένη ζώνη; Από 0% έως 100%." onChange={v => update({ share: v })} onBlur={() => touch('share')} />}
                <p className="inline-note">Περίοδος αναφοράς: 30 ημέρες. Πρόκειται για κατασκευασμένο σενάριο δοκιμής, όχι πρόβλεψη.</p>
              </section>}
            </>}
          </>}
          {error('consumption') && <p className="field-error" role="alert">{error('consumption')}</p>}
          {check.preview && <QuantitySummary preview={check.preview} />}
          {form.source === 'DEMO_SAMPLE' && <div className="sample-confirmation"><label><input id="field-sample_confirmed" type="checkbox" checked={form.sample_confirmed} onChange={e => update({ sample_confirmed: e.target.checked })} aria-invalid={!!error('sample_confirmed')} aria-describedby={error('sample_confirmed') ? 'sample-confirmation-error' : undefined} /><span>Έλεγξα τις kWh και τις ημέρες και επιβεβαιώνω αυτά τα στοιχεία του demo δείγματος.</span></label>{error('sample_confirmed') && <p id="sample-confirmation-error" className="field-error">{error('sample_confirmed')}</p>}</div>}
        </div>
      </>}
      {step === 'preferences' && <>
        <ChoiceGroup name="priority" legend="Ποια είναι η προτεραιότητά σου;" value={form.priority} error={error('priority')} onChange={v => update({ priority: v as FormDraft['priority'] })}
          options={[{ value: 'LOWEST_SCENARIO_COST', label: priorityLabels.LOWEST_SCENARIO_COST, description: 'Σύγκριση με τις τιμές του σεναρίου. Δεν εγγυάται το μελλοντικό κόστος.' },
            { value: 'FIXED_RATE', label: priorityLabels.FIXED_RATE, description: 'Προτείνουμε σταθερή τιμή ανά kWh. Το ποσό εξακολουθεί να εξαρτάται από τη χρήση και τις εκπτώσεις.' },
            { value: 'NO_CLEAR_PREFERENCE', label: priorityLabels.NO_CLEAR_PREFERENCE, description: 'Δείξε μου τις επιλογές σε σειρά κόστους.' }]} />
        <section className="discount-section" aria-labelledby="discount-heading"><p className="eyebrow">Προϋποθέσεις εκπτώσεων</p><h2 id="discount-heading">Μόνο με τους όρους που δέχεσαι.</h2>
          <p>Ένα από τα demo προγράμματα δίνει έκπτωση μόνο με ηλεκτρονικό λογαριασμό <strong>και</strong> πάγια εντολή. Η απάντηση εδώ δεν ενεργοποιεί καμία υπηρεσία.</p>
          <ChoiceGroup name="e_bill" legend="Θα επέλεγες ηλεκτρονικό λογαριασμό;" value={form.e_bill} error={error('e_bill')} compact help="Να λαμβάνεις τον λογαριασμό ηλεκτρονικά, αντί για χαρτί."
            onChange={v => update({ e_bill: v as FormDraft['e_bill'] })} options={Object.entries(answerLabels).map(([value, label]) => ({ value, label }))} />
          <ChoiceGroup name="direct_debit" legend="Θα επέλεγες πάγια εντολή;" value={form.direct_debit} error={error('direct_debit')} compact help="Αυτόματη εξόφληση μέσω τράπεζας. Δεν ζητάμε τραπεζικά στοιχεία."
            onChange={v => update({ direct_debit: v as FormDraft['direct_debit'] })} options={Object.entries(answerLabels).map(([value, label]) => ({ value, label }))} />
          {(form.e_bill && form.direct_debit) && <p className="inline-note">{form.e_bill === 'YES' && form.direct_debit === 'YES' ? 'Η υπό όρους έκπτωση θα εφαρμοστεί στο σχετικό demo πρόγραμμα.' : 'Θα χρησιμοποιήσουμε τη βασική τιμή χωρίς αυτή την έκπτωση. Το πρόγραμμα παραμένει διαθέσιμο.'}</p>}
        </section>
      </>}
      {step === 'review' && <>
        {check.preview && <QuantitySummary preview={check.preview} />}
        <section className="review-card"><div className="review-heading"><h2>Η κατανάλωσή σου</h2><button className="text-button" type="button" onClick={() => go('consumption')}>Διόρθωση κατανάλωσης</button></div>
          <dl><SummaryRow label="Περίπτωση">{form.purpose === 'NEW_SUPPLY' ? 'Νέα παροχή' : 'Έχω συμβόλαιο'}</SummaryRow>
            <SummaryRow label="Πηγή">{form.source === 'DEMO_SAMPLE' ? 'Φανταστικό demo δείγμα — στοιχεία που επιβεβαίωσες' : form.source === 'INDICATIVE' ? 'Ενδεικτικό σενάριο — υπόθεση χρήσης' : 'Χειροκίνητα στοιχεία λογαριασμού'}</SummaryRow>
            <SummaryRow label="Μέτρηση">{form.meter === 'SINGLE' ? 'Μονή' : form.meter === 'DUAL' ? 'Διζωνική' : 'Δεν γνωρίζω'}</SummaryRow>
            {form.meter === 'DUAL' && form.allocation === 'UNKNOWN' && <SummaryRow label="Κατανομή">Άγνωστη — σύγκριση μόνο ενιαίων τιμών</SummaryRow>}
            {form.allocation === 'SHARE' && <SummaryRow label="Κατανομή">Υπόθεση: {form.share}% στη μειωμένη ζώνη</SummaryRow>}
          </dl></section>
        <section className="review-card"><div className="review-heading"><h2>Οι επιλογές σου</h2><button className="text-button" type="button" onClick={() => go('preferences')}>Διόρθωση προτιμήσεων</button></div>
          <dl><SummaryRow label="Προτεραιότητα">{form.priority && priorityLabels[form.priority]}</SummaryRow><SummaryRow label="Ηλεκτρονικός λογαριασμός">{form.e_bill && answerLabels[form.e_bill]}</SummaryRow><SummaryRow label="Πάγια εντολή">{form.direct_debit && answerLabels[form.direct_debit]}</SummaryRow></dl></section>
        {form.purpose === 'EXISTING_SUPPLY' && <section className="review-card"><div className="review-heading"><h2>Σημερινό πρόγραμμα · προαιρετικό</h2><button type="button" className="text-button" onClick={() => go('purpose')}>Διόρθωση σημερινού προγράμματος</button></div>
          <p>{form.current_contract?.identity_status === 'EXACT_DEMO' ? `${DEMO_PROGRAMS.find(p => p.program_id === form.current_contract?.program_id)?.program_name ?? form.current_contract.program_id} · ${form.current_contract.terms_revision}` : contractSelection(form.current_contract) === 'PROVIDER_ONLY' ? 'Μόνο η εταιρεία — χωρίς ακριβές πρόγραμμα ή συγκρίσιμο κόστος σήμερα.' : 'Παραλείφθηκε — χωρίς σύγκριση με σημερινό πρόγραμμα.'}</p>
          <p className="field-help">{form.current_contract?.identity_status === 'EXACT_DEMO' && form.current_contract.exit_fee_evidence.status !== 'UNKNOWN' ? 'Τέλος αποχώρησης: γνωστό από τους συγκεκριμένους demo όρους, θα παρουσιαστεί ξεχωριστά.' : 'Άγνωστο τέλος αποχώρησης — πρέπει να ελεγχθεί πριν αποφασίσεις.'}</p></section>}
        <div className="scope-note"><strong>Τι θα συγκρίνουμε</strong><p>Μόνο ενέργεια και πάγιο ανά 30 ημέρες, χωρίς ΦΠΑ και άλλες χρεώσεις. Δεν είναι εκτίμηση τελικού λογαριασμού.</p>
          <p>{form.current_contract?.identity_status === 'EXACT_DEMO' ? 'Η σύγκριση με το τρέχον demo πρόγραμμα αφορά μόνο ενέργεια και πάγιο, όχι καθαρό όφελος αλλαγής.' : 'Δεν έχει δηλωθεί ακριβές τρέχον πρόγραμμα, οπότε δεν υπολογίζουμε εξοικονόμηση από αλλαγή.'}</p></div>
      </>}
      {submissionErrors.length > 0 && <p role="alert" className="field-error">Δεν ολοκληρώθηκε ο υπολογισμός. Έλεγξε τα στοιχεία σου και δοκίμασε ξανά.</p>}
      <div className="step-actions"><button type="button" className="back-button" onClick={() => go(step === 'purpose' ? 'welcome' : steps[steps.indexOf(step) - 1]!)}><span aria-hidden="true">←</span> Πίσω</button>
        <button type="submit" className="primary-button">{step === 'review' ? 'Δες τη σύγκριση' : 'Συνέχεια'} <span aria-hidden="true">→</span></button></div>
    </form>
    <p className="privacy-note">Φανταστικά προγράμματα · Χωρίς προσωπικά στοιχεία</p>
  </main></div>;
}
