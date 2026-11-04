import { compare, decimal, formatExact, fraction, ZERO } from '../domain/exact.ts';
import { normalizeConsumption } from '../domain/normalize.ts';
import type { Answer, Consumption, ContractReference, Meter, NormalizedScenario, Priority, UserScenario, Validated } from '../domain/types.ts';

export type FormStep = 'welcome' | 'purpose' | 'consumption' | 'preferences' | 'review';
export interface FormDraft {
  purpose: UserScenario['purpose'] | '';
  source: UserScenario['consumption_source'] | '';
  sample_confirmed: boolean;
  meter: Meter | '';
  allocation: 'SPLIT' | 'SHARE' | 'UNKNOWN' | '';
  total: string;
  normal: string;
  reduced: string;
  days: string;
  indicative_total: string;
  indicative_preset: UserScenario['indicative_preset'];
  share: string;
  priority: Priority | '';
  e_bill: Answer | '';
  direct_debit: Answer | '';
  current_contract: ContractReference | null;
}
export const emptyForm: FormDraft = {
  purpose: '', source: '', sample_confirmed: false, meter: '', allocation: '', total: '', normal: '', reduced: '', days: '',
  indicative_total: '', indicative_preset: null, share: '', priority: '', e_bill: '', direct_debit: '', current_contract: null,
};
export type FormField = 'purpose' | 'source' | 'sample_confirmed' | 'meter' | 'allocation' | 'total' | 'normal' | 'reduced' | 'days' | 'indicative_total' | 'share' | 'priority' | 'e_bill' | 'direct_debit' | 'consumption';
export interface FormError { field: FormField; message: string }
export type QuantityPreview = Pick<NormalizedScenario, 'original_total_kwh' | 'original_period_days' | 'total_kwh_30' | 'normal_kwh_30' | 'reduced_kwh_30' | 'allocation_source'>;

export function changeMeter(form: FormDraft, meter: Meter): FormDraft {
  // Never reinterpret a single total as one of the two zones.
  return { ...form, meter, allocation: '', total: '', normal: '', reduced: '', share: '', sample_confirmed: false };
}
export function changeSource(form: FormDraft, source: FormDraft['source']): FormDraft {
  return { ...form, source, allocation: '', share: '', sample_confirmed: false,
    ...(form.source === 'DEMO_SAMPLE' && source !== 'DEMO_SAMPLE' ? { total: '', normal: '', reduced: '', days: '', meter: '' as const } : {}) };
}
function consumptionOf(form: FormDraft): Consumption {
  const days = /^\d{1,3}$/.test(form.days.trim()) ? Number(form.days.trim()) : NaN;
  if (form.source === 'INDICATIVE') {
    return form.meter === 'DUAL' && form.allocation === 'SHARE'
      ? { quantity_mode: 'TOTAL_AND_SHARE', total_kwh: form.indicative_total, reduced_share_percent: form.share, period_days: 30 }
      : { quantity_mode: 'TOTAL', total_kwh: form.indicative_total, period_days: 30 };
  }
  return form.meter === 'DUAL' && form.allocation === 'SPLIT'
    ? { quantity_mode: 'SPLIT', normal_kwh: form.normal, reduced_kwh: form.reduced, period_days: days }
    : { quantity_mode: 'TOTAL', total_kwh: form.total, period_days: days };
}
function quantityMessage(raw: string, label: string, max: number): string {
  if (!raw.trim()) return `Συμπλήρωσε ${label}. Το 0 είναι έγκυρη τιμή.`;
  try {
    if (compare(decimal(raw), fraction(max)) > 0) return `Η τιμή ξεπερνά το όριο των ${max.toLocaleString('el-GR')}. Έλεγξε τη μονάδα και την περίοδο.`;
  } catch { /* Formatting / negative inputs are described below, never coerced. */ }
  return `Δώσε μη αρνητικό αριθμό με έως δύο δεκαδικά, π.χ. 125,5. Για χίλιες γράψε 1000, χωρίς διαχωριστικό χιλιάδων.`;
}

/** Validate only quantities before preferences have been asked. Preview exposes no invented profile answers. */
export function validateConsumptionDraft(form: FormDraft): { errors: FormError[]; preview: QuantityPreview | null } {
  const errors: FormError[] = [];
  if (!form.source) errors.push({ field: 'source', message: 'Επίλεξε αν έχεις στοιχεία λογαριασμού ή θέλεις ενδεικτική χρήση.' });
  if (!form.meter) errors.push({ field: 'meter', message: 'Επίλεξε τον τύπο μέτρησης ή «Δεν γνωρίζω».' });
  if (form.meter === 'DUAL' && !form.allocation) errors.push({ field: 'allocation', message: 'Επίλεξε αν γνωρίζεις την κατανομή στις δύο ζώνες.' });
  if (form.meter === 'DUAL' && form.allocation && !(form.source !== 'INDICATIVE' ? ['SPLIT', 'UNKNOWN'] : ['SHARE', 'UNKNOWN']).includes(form.allocation)) errors.push({ field: 'allocation', message: 'Διάλεξε κατανομή που αντιστοιχεί στην πηγή των στοιχείων σου.' });
  if (errors.length) return { errors, preview: null };
  // These sentinels are used only to invoke the existing quantity validator, never passed to recommend().
  const checked = normalizeConsumption({ scenario_id: 'quantity-validation', revision: 1, purpose: 'EXISTING_SUPPLY',
    consumption_source: form.source, indicative_preset: form.source === 'INDICATIVE' ? form.indicative_preset : null,
    meter_type: form.meter, consumption: consumptionOf(form), priority: 'NO_CLEAR_PREFERENCE',
    condition_answers: { e_bill: 'UNKNOWN', direct_debit: 'UNKNOWN' }, current_contract: null, catalog_revision: 'DEMO-1' });
  if (!checked.ok) {
    for (const error of checked.errors) {
      let field: FormField = 'consumption';
      let message = error.message;
      if (error.field === 'period_days') {
        field = 'days'; message = !form.days.trim() ? 'Συμπλήρωσε πόσες ημέρες καλύπτει ο λογαριασμός.' : 'Οι ημέρες πρέπει να είναι ακέραιος αριθμός από 1 έως 366. Το 0 δεν είναι έγκυρο.';
      } else if (error.field === 'total_kwh' || error.field === 'normal_kwh' || error.field === 'reduced_kwh' || error.field === 'reduced_share_percent') {
        field = error.field === 'total_kwh' ? form.source === 'INDICATIVE' ? 'indicative_total' : 'total'
          : error.field === 'normal_kwh' ? 'normal' : error.field === 'reduced_kwh' ? 'reduced' : 'share';
        message = quantityMessage(form[field], field === 'share' ? 'το ποσοστό μειωμένης ζώνης' : 'τις kWh', field === 'share' ? 100 : 50000);
      } else if (error.code === 'NORMALIZED_KWH_OUT_OF_RANGE') {
        message = 'Η χρήση αντιστοιχεί σε περισσότερες από 5.000 kWh ανά 30 ημέρες, έξω από το εύρος του demo. Έλεγξε τις kWh και τις ημέρες· μην εισάγεις ευρώ ή τη συνολική ένδειξη του μετρητή.';
      } else if (error.code === 'PERIOD_KWH_OUT_OF_RANGE') {
        message = 'Το άθροισμα ξεπερνά τις 50.000 kWh ανά λογαριασμό, έξω από το εύρος του demo. Έλεγξε τις δύο ζώνες.';
      } else if (error.field === 'indicative_preset') {
        field = 'indicative_total'; message = 'Επίλεξε μία αφετηρία ή γράψε τη δική σου ενδεικτική χρήση.';
      }
      if (!errors.some(e => e.field === field)) errors.push({ field, message });
    }
    const order: FormField[] = ['source', 'meter', 'allocation', 'total', 'normal', 'reduced', 'days', 'indicative_total', 'share', 'consumption'];
    errors.sort((a, b) => order.indexOf(a.field) - order.indexOf(b.field));
    return { errors, preview: null };
  }
  const n = checked.value;
  return { errors: [], preview: { original_total_kwh: n.original_total_kwh, original_period_days: n.original_period_days,
    total_kwh_30: n.total_kwh_30, normal_kwh_30: n.normal_kwh_30, reduced_kwh_30: n.reduced_kwh_30, allocation_source: n.allocation_source } };
}
export function validatePreferences(form: FormDraft): FormError[] {
  const errors: FormError[] = [];
  if (!form.priority) errors.push({ field: 'priority', message: 'Διάλεξε τι σε ενδιαφέρει ή «Δεν έχω σαφή προτίμηση».' });
  if (!form.e_bill) errors.push({ field: 'e_bill', message: 'Απάντησε για τον ηλεκτρονικό λογαριασμό. Μπορείς να επιλέξεις «Δεν γνωρίζω».' });
  if (!form.direct_debit) errors.push({ field: 'direct_debit', message: 'Απάντησε για την πάγια εντολή. Μπορείς να επιλέξεις «Δεν γνωρίζω».' });
  return errors;
}
export function validateFormStep(form: FormDraft, step: FormStep): FormError[] {
  const purpose: FormError[] = form.purpose ? [] : [{ field: 'purpose', message: 'Επίλεξε αν έχεις συμβόλαιο ή ψάχνεις νέα παροχή.' }];
  const sample: FormError[] = form.source === 'DEMO_SAMPLE' && !form.sample_confirmed ? [{ field: 'sample_confirmed', message: 'Έλεγξε τις προσυμπληρωμένες kWh και ημέρες και επιβεβαίωσε τα στοιχεία του demo δείγματος.' }] : [];
  if (step === 'purpose') return purpose;
  if (step === 'consumption') return [...validateConsumptionDraft(form).errors, ...sample];
  if (step === 'preferences') return validatePreferences(form);
  if (step === 'review') return [...purpose, ...validateConsumptionDraft(form).errors, ...sample, ...validatePreferences(form)];
  return [];
}
export function toUserScenario(form: FormDraft, previous: UserScenario | null): Validated<UserScenario> {
  const errors = validateFormStep(form, 'review');
  if (errors.length) return { ok: false, errors: errors.map(e => ({ ...e, code: 'INVALID_FORM' })) };
  const scenario: UserScenario = {
    scenario_id: previous?.scenario_id ?? 'comparison', revision: previous?.revision ?? 1,
    purpose: form.purpose as UserScenario['purpose'], consumption_source: form.source as UserScenario['consumption_source'],
    indicative_preset: form.source === 'INDICATIVE' ? form.indicative_preset : null,
    meter_type: form.meter as Meter, consumption: consumptionOf(form), priority: form.priority as Priority,
    condition_answers: { e_bill: form.e_bill as Answer, direct_debit: form.direct_debit as Answer },
    current_contract: form.purpose === 'EXISTING_SUPPLY' ? form.current_contract : null, catalog_revision: 'DEMO-1',
  };
  const normalized = normalizeConsumption(scenario);
  return normalized.ok ? { ok: true, value: scenario } : normalized;
}
export function formFromScenario(scenario: UserScenario | null): FormDraft {
  if (!scenario) return { ...emptyForm };
  const c = scenario.consumption;
  const indicative = scenario.consumption_source === 'INDICATIVE';
  return { ...emptyForm, purpose: scenario.purpose, source: scenario.consumption_source, sample_confirmed: scenario.consumption_source === 'DEMO_SAMPLE', meter: scenario.meter_type,
    allocation: scenario.meter_type !== 'DUAL' ? '' : c.quantity_mode === 'SPLIT' ? 'SPLIT' : c.quantity_mode === 'TOTAL_AND_SHARE' ? 'SHARE' : 'UNKNOWN',
    total: c.quantity_mode === 'TOTAL' && !indicative ? c.total_kwh : '', normal: c.quantity_mode === 'SPLIT' ? c.normal_kwh : '',
    reduced: c.quantity_mode === 'SPLIT' ? c.reduced_kwh : '', days: String(c.period_days),
    indicative_total: indicative && c.quantity_mode !== 'SPLIT' ? c.total_kwh : '',
    indicative_preset: scenario.indicative_preset, share: c.quantity_mode === 'TOTAL_AND_SHARE' ? c.reduced_share_percent : '',
    priority: scenario.priority, e_bill: scenario.condition_answers.e_bill, direct_debit: scenario.condition_answers.direct_debit,
    current_contract: scenario.current_contract };
}
export function normalizationText(preview: QuantityPreview): string {
  const approx = (preview.total_kwh_30.n * 100n) % preview.total_kwh_30.d === 0n ? '' : '≈ ';
  return `${formatExact(preview.original_total_kwh)} kWh / ${preview.original_period_days} ημέρες → ${approx}${formatExact(preview.total_kwh_30)} kWh / 30 ημέρες`;
}
export function quantityNotice(preview: QuantityPreview): string | null {
  if (compare(preview.total_kwh_30, ZERO) === 0) return 'Με μηδενική χρήση συγκρίνουμε μόνο τα πάγια.';
  if (compare(preview.total_kwh_30, fraction(1500)) >= 0) return 'Έλεγξε ότι οι kWh αφορούν κατανάλωση αυτής της περιόδου και όχι τη συνολική ένδειξη του μετρητή. Η σύγκριση παραμένει διαθέσιμη.';
  return null;
}
