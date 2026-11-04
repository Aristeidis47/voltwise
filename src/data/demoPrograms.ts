import type { Catalog, ContractReference, DiscountRule, Program } from '../domain/types.ts';

export const DEMO_NOTICE = 'Φανταστικά δεδομένα για εκπαιδευτικό demo — δεν είναι πραγματικές προσφορές.';
const common = {
  calculation_model: 'LINEAR_V1',
  program_revision: 'DEMO-1', is_demo: true, is_real_offer: false, currency: 'EUR',
  reference_days: 30, vat_included: false, activation_fee_cents: 0, deposit_cents: 0,
} as const;
function program(id: string, provider: string, name: string, fee: number, rates: Program['base_rates'], discount: string | null = null): Program {
  const variable = id === 'B1';
  return Object.freeze({
    ...common, program_id: id, provider_id: `DEMO_${provider}`,
    provider_name: `Πάροχος ${({ A: 'Α', B: 'Β', C: 'Γ', D: 'Δ' } as Record<string, string>)[provider]} — Demo`,
    program_name: name, fixed_fee_cents_30: fee, base_rates: Object.freeze(rates),
    pricing_basis: rates.basis, requires_allocation: rates.basis === 'DUAL_ZONE',
    supported_meters: Object.freeze(rates.basis === 'UNIFIED' ? ['SINGLE', 'DUAL', 'UNKNOWN'] as const : ['DUAL'] as const),
    discount_rule_id: discount, price_type: variable ? 'VARIABLE_SNAPSHOT' : 'FIXED',
    fixed_rate_months: variable ? null : 12, minimum_commitment_months: variable ? 0 : 12,
    price_reference: variable ? 'DEMO_SNAPSHOT_1' : 'DEMO_FIXED_TERMS',
    terms_revision: `DEMO-1/${id}/TERMS-1`,
    exit_fee_terms: Object.freeze({ status: 'KNOWN_ZERO', amount_cents: 0, evidence_reference: `DEMO-1/${id}/TERMS-1`, unknown_reason: null }),
  });
}
export const DEMO_PROGRAMS: readonly Program[] = Object.freeze([
  program('A1', 'A', 'Μικρό Πάγιο', 200, { basis: 'UNIFIED', unified_rate: '0.160' }),
  program('A2', 'A', 'Πολλές kWh', 1000, { basis: 'UNIFIED', unified_rate: '0.120' }),
  program('B1', 'B', 'Στιγμιότυπο', 400, { basis: 'UNIFIED', unified_rate: '0.130' }),
  program('C1', 'C', 'Με Προϋποθέσεις', 300, { basis: 'UNIFIED', unified_rate: '0.180' }, 'C1_EBILL_AND_DD'),
  program('D1', 'D', 'Δύο Ζώνες', 600, { basis: 'DUAL_ZONE', normal_rate: '0.170', reduced_rate: '0.080' }),
]);
export const DEMO_DISCOUNTS: readonly DiscountRule[] = Object.freeze([Object.freeze({
  discount_id: 'C1_EBILL_AND_DD', revision: 'DEMO-1', applies_to: 'ENERGY_RATE',
  condition_ids: Object.freeze(['E_BILL', 'DIRECT_DEBIT'] as const), match_mode: 'ALL', effect_type: 'REPLACE_RATE',
  replacement_rates: Object.freeze({ basis: 'UNIFIED', unified_rate: '0.100' }),
  failure_behavior: 'KEEP_BASE_RATE', stacking: 'NONE',
  explanation: 'Η μειωμένη τιμή απαιτεί ηλεκτρονικό λογαριασμό ΚΑΙ πάγια εντολή. Το πάγιο δεν αλλάζει.',
})]);
export const DEMO_CATALOG: Catalog = Object.freeze({
  catalog_id: 'VOLTWISE_FICTIONAL', revision: 'DEMO-1', currency: 'EUR', reference_days: 30,
  vat_included: false, is_demo: true, is_real_offer: false, notice: DEMO_NOTICE,
  programs: DEMO_PROGRAMS, discount_rules: DEMO_DISCOUNTS,
});
export function demoContract(id: string): ContractReference {
  const item = DEMO_PROGRAMS.find(p => p.program_id === id);
  if (!item) throw new RangeError('Unknown demo program');
  return Object.freeze({ identity_status: 'EXACT_DEMO', program_id: id,
    program_revision: item.program_revision, terms_revision: item.terms_revision,
    pricing_data_status: 'COMPLETE', evidence_scope: 'FICTIONAL_SCENARIO', exit_fee_evidence: item.exit_fee_terms });
}
