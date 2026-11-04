import { add, compare, decimal, divide, exactKey, fraction, multiply, ONE, subtract, ZERO } from './exact.ts';
import type { Exact } from './exact.ts';
import type { Answers, ContractReference, FeeEvidence, NormalizedScenario, TrialInput, Validated, ValidationError } from './types.ts';

export const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
export const unknownFee = (): FeeEvidence => ({ status: 'UNKNOWN', amount_cents: null, evidence_reference: null, unknown_reason: 'CONTRACT_NOT_IDENTIFIED' });
export function validFee(value: unknown): value is FeeEvidence {
  if (!record(value)) return false;
  if (value.status === 'UNKNOWN') return value.amount_cents === null
    && (value.evidence_reference === null || typeof value.evidence_reference === 'string')
    && ['CONTRACT_NOT_IDENTIFIED', 'TERMS_NOT_VERIFIED', 'AMOUNT_NOT_PROVIDED', 'AMOUNT_NOT_RESOLVED_FOR_CASE'].includes(String(value.unknown_reason));
  return ['KNOWN_ZERO', 'KNOWN_AMOUNT'].includes(String(value.status))
    && Number.isSafeInteger(value.amount_cents) && typeof value.amount_cents === 'number'
    && (value.status === 'KNOWN_ZERO' ? value.amount_cents === 0 : value.amount_cents > 0)
    && typeof value.evidence_reference === 'string' && value.evidence_reference.trim().length > 0 && value.unknown_reason === null;
}
export function validAnswers(value: unknown): value is Answers {
  return record(value) && typeof value.e_bill === 'string' && typeof value.direct_debit === 'string'
    && ['YES', 'NO', 'UNKNOWN'].includes(value.e_bill) && ['YES', 'NO', 'UNKNOWN'].includes(value.direct_debit);
}
function contractReference(value: unknown): ContractReference | null {
  if (value === null || value === undefined) return null;
  const c = record(value) ? value : {};
  if (c.identity_status !== 'EXACT_DEMO') return {
    identity_status: 'UNAVAILABLE', program_id: null, program_revision: null, terms_revision: null,
    pricing_data_status: 'INCOMPLETE', evidence_scope: 'FICTIONAL_SCENARIO', exit_fee_evidence: unknownFee(),
  };
  return {
    identity_status: c.identity_status === 'EXACT_DEMO' ? 'EXACT_DEMO' : 'UNAVAILABLE',
    program_id: typeof c.program_id === 'string' ? c.program_id : null,
    program_revision: typeof c.program_revision === 'string' ? c.program_revision : null,
    terms_revision: typeof c.terms_revision === 'string' ? c.terms_revision : null,
    pricing_data_status: c.pricing_data_status === 'COMPLETE' && c.evidence_scope === 'FICTIONAL_SCENARIO' ? 'COMPLETE' : 'INCOMPLETE',
    evidence_scope: 'FICTIONAL_SCENARIO', exit_fee_evidence: validFee(c.exit_fee_evidence) ? { ...c.exit_fee_evidence } : unknownFee(),
  };
}
export function normalizeConsumption(input: unknown): Validated<NormalizedScenario> {
  const errors: ValidationError[] = [];
  const fail = (field: string, code: string, message: string) => errors.push({ field, code, message });
  if (!record(input)) return { ok: false, errors: [{ field: 'scenario', code: 'INVALID_SCENARIO', message: 'Απαιτούνται στοιχεία σεναρίου.' }] };
  const c = record(input.consumption) ? input.consumption : {};
  if (typeof input.scenario_id !== 'string' || !input.scenario_id.trim()) fail('scenario_id', 'REQUIRED', 'Λείπει το αναγνωριστικό.');
  if (!Number.isSafeInteger(input.revision) || Number(input.revision) < 1) fail('revision', 'INVALID_REVISION', 'Άκυρη έκδοση.');
  if (!['EXISTING_SUPPLY', 'NEW_SUPPLY'].includes(String(input.purpose))) fail('purpose', 'REQUIRED', 'Επίλεξε σκοπό.');
  if (!['BILL_MANUAL', 'INDICATIVE', 'DEMO_SAMPLE'].includes(String(input.consumption_source))) fail('consumption_source', 'REQUIRED', 'Επίλεξε πηγή κατανάλωσης.');
  if (!['SINGLE', 'DUAL', 'UNKNOWN'].includes(String(input.meter_type))) fail('meter_type', 'REQUIRED', 'Επίλεξε μέτρηση ή Δεν γνωρίζω.');
  if (!['LOWEST_SCENARIO_COST', 'FIXED_RATE', 'NO_CLEAR_PREFERENCE'].includes(String(input.priority))) fail('priority', 'REQUIRED', 'Επίλεξε προτεραιότητα.');
  if (!validAnswers(input.condition_answers)) fail('condition_answers', 'REQUIRED', 'Απάντησε στους όρους, ακόμη και Δεν γνωρίζω.');
  if (input.catalog_revision !== 'DEMO-1') fail('catalog_revision', 'CATALOG_REVISION_MISMATCH', 'Άγνωστη έκδοση demo.');
  if (input.purpose === 'NEW_SUPPLY' && input.current_contract != null) fail('current_contract', 'CONTRACT_ON_NEW_SUPPLY', 'Η νέα παροχή δεν έχει τρέχον συμβόλαιο.');
  const days = c.period_days;
  if (!Number.isSafeInteger(days) || Number(days) < 1 || Number(days) > 366) fail('period_days', 'INVALID_DAYS', 'Δώσε ακέραιες ημέρες από 1 έως 366.');
  if (input.consumption_source === 'INDICATIVE') {
    if (days !== 30) fail('period_days', 'INDICATIVE_REQUIRES_30_DAYS', 'Το ενδεικτικό σενάριο αφορά 30 ημέρες.');
    if (!['KWH_150', 'KWH_300', 'KWH_600', 'CUSTOM'].includes(String(input.indicative_preset))) fail('indicative_preset', 'REQUIRED', 'Επίλεξε ενδεικτικό σενάριο.');
  } else if (input.indicative_preset != null) fail('indicative_preset', 'UNEXPECTED_PRESET', 'Η αφετηρία αφορά μόνο ενδεικτική χρήση.');
  const read = (field: string, max: number): Exact => {
    try {
      const value = decimal(c[field]);
      if (compare(value, fraction(max)) > 0) throw new RangeError();
      return value;
    } catch { fail(field, 'INVALID_QUANTITY', `Δώσε αριθμό από 0 έως ${max}, με έως δύο δεκαδικά.`); return ZERO; }
  };
  let total = ZERO, normal: Exact | null = null, reduced: Exact | null = null, share: Exact | null = null;
  let source: NormalizedScenario['allocation_source'] = input.meter_type === 'DUAL' ? 'UNKNOWN' : 'NOT_APPLICABLE';
  if (c.quantity_mode === 'SPLIT') {
    if (input.meter_type !== 'DUAL') fail('quantity_mode', 'SPLIT_REQUIRES_DUAL', 'Η κατανομή απαιτεί διζωνική μέτρηση.');
    if (c.total_kwh != null || c.reduced_share_percent != null) fail('consumption', 'CONFLICTING_QUANTITIES', 'Μη δίνεις ανεξάρτητο σύνολο ή μερίδιο μαζί με τις δύο ζώνες.');
    normal = read('normal_kwh', 50000); reduced = read('reduced_kwh', 50000); total = add(normal, reduced);
    share = compare(total, ZERO) > 0 ? divide(reduced, total) : null; source = 'REPORTED_SPLIT';
  } else if (c.quantity_mode === 'TOTAL' || c.quantity_mode === 'TOTAL_AND_SHARE') {
    total = read('total_kwh', 50000);
    if (c.normal_kwh != null || c.reduced_kwh != null) fail('consumption', 'CONFLICTING_QUANTITIES', 'Δώσε ένα συνεπές σύνολο στοιχείων.');
    if (c.quantity_mode === 'TOTAL_AND_SHARE') {
      if (input.meter_type !== 'DUAL' || input.consumption_source !== 'INDICATIVE') fail('quantity_mode', 'INVALID_SHARE_CONTEXT', 'Η υπόθεση κατανομής απαιτεί διζωνικό ενδεικτικό σενάριο.');
      share = divide(read('reduced_share_percent', 100), fraction(100));
      normal = multiply(total, subtract(ONE, share)); reduced = multiply(total, share); source = 'ASSUMED_SHARE';
    } else if (c.reduced_share_percent != null) fail('reduced_share_percent', 'UNEXPECTED_SHARE', 'Άγνωστη κατανομή δεν έχει μερίδιο.');
  } else fail('quantity_mode', 'REQUIRED', 'Επίλεξε τρόπο εισαγωγής κατανάλωσης.');
  if (compare(total, fraction(50000)) > 0) fail('consumption', 'PERIOD_KWH_OUT_OF_RANGE', 'Το σύνολο υπερβαίνει το όριο demo.');
  if (input.consumption_source === 'INDICATIVE' && input.indicative_preset !== 'CUSTOM') {
    const preset = { KWH_150: 150, KWH_300: 300, KWH_600: 600 }[String(input.indicative_preset)];
    if (preset !== undefined && compare(total, fraction(preset)) !== 0) fail('indicative_preset', 'PRESET_MISMATCH', 'Οι kWh δεν συμφωνούν με την αφετηρία.');
  }
  if (errors.length) return { ok: false, errors };
  const factor = fraction(30, Number(days));
  const q = multiply(total, factor);
  if (compare(q, fraction(5000)) > 0) return { ok: false, errors: [{ field: 'consumption', code: 'NORMALIZED_KWH_OUT_OF_RANGE', message: 'Η χρήση υπερβαίνει τις 5.000 kWh/30 ημέρες του demo.' }] };
  return { ok: true, value: {
    purpose: input.purpose as NormalizedScenario['purpose'],
    scenario_id: input.scenario_id as string, scenario_revision: input.revision as number,
    state_id: `${input.scenario_id}:${input.revision}:base`, reference_days: 30,
    original_period_days: Number(days), original_total_kwh: total, total_kwh_30: q,
    normal_kwh_30: normal === null ? null : multiply(normal, factor),
    reduced_kwh_30: reduced === null ? null : multiply(reduced, factor), reduced_share: share,
    allocation_source: source, meter_type: input.meter_type as NormalizedScenario['meter_type'],
    priority: input.priority as NormalizedScenario['priority'], condition_answers: { ...(input.condition_answers as Answers) },
    current_contract: contractReference(input.current_contract), catalog_revision: input.catalog_revision as string,
  } };
}

export function applyTrial(base: NormalizedScenario, trial: TrialInput): Validated<NormalizedScenario> {
  const errors: ValidationError[] = [];
  const fail = (field: string, code: string) => errors.push({ field, code, message:
    field === 'total_kwh_30_override' ? 'Δώσε κατανάλωση από 0 έως 5.000 kWh / 30 ημέρες, με έως δύο δεκαδικά. Το κενό δεν είναι μηδενική χρήση.'
      : field === 'reduced_share_override_percent' ? 'Δώσε ποσοστό από 0 έως 100 με έως δύο δεκαδικά, μόνο για γνωστή διζωνική μέτρηση.'
        : 'Έλεγξε τις παραδοχές της δοκιμής.' });
  if (trial.base_scenario_id !== base.scenario_id || trial.base_revision !== base.scenario_revision || !trial.trial_id?.trim()) fail('trial_id', 'STALE_TRIAL');
  if (!validAnswers(trial.condition_answers)) fail('condition_answers', 'REQUIRED');
  let q = base.total_kwh_30, share = base.reduced_share;
  try { if (trial.total_kwh_30_override !== null) q = decimal(trial.total_kwh_30_override); } catch { fail('total_kwh_30_override', 'INVALID_QUANTITY'); }
  try {
    if (trial.reduced_share_override_percent !== null) {
      if (base.meter_type !== 'DUAL') fail('reduced_share_override_percent', 'SHARE_REQUIRES_DUAL');
      share = divide(decimal(trial.reduced_share_override_percent), fraction(100));
      if (compare(share, ONE) > 0) fail('reduced_share_override_percent', 'INVALID_SHARE');
    }
  } catch { fail('reduced_share_override_percent', 'INVALID_SHARE'); }
  if (compare(q, fraction(5000)) > 0) fail('total_kwh_30_override', 'NORMALIZED_KWH_OUT_OF_RANGE');
  if (errors.length) return { ok: false, errors };
  const explicitZeroSplit = compare(q, ZERO) === 0 && base.normal_kwh_30 !== null;
  const normal = share !== null ? multiply(q, subtract(ONE, share)) : explicitZeroSplit ? ZERO : null;
  const reduced = share !== null ? multiply(q, share) : explicitZeroSplit ? ZERO : null;
  const stateId = `${base.scenario_id}:${base.scenario_revision}:${trial.trial_id}:${exactKey(q)}:${share === null ? 'unknown' : exactKey(share)}:${trial.condition_answers.e_bill}:${trial.condition_answers.direct_debit}`;
  return { ok: true, value: { ...base, state_id: stateId,
    total_kwh_30: q, normal_kwh_30: normal, reduced_kwh_30: reduced, reduced_share: share,
    allocation_source: base.meter_type !== 'DUAL' ? 'NOT_APPLICABLE' : normal === null ? 'UNKNOWN'
      : trial.reduced_share_override_percent !== null || trial.total_kwh_30_override !== null ? 'ASSUMED_SHARE' : base.allocation_source,
    condition_answers: { ...trial.condition_answers },
  } };
}
