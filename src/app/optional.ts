import { demoContract } from '../data/demoPrograms.ts';
import { DEMO_BILL_SAMPLE } from '../data/demoBill.ts';
import type { ContractReference } from '../domain/types.ts';
import type { FormDraft } from './onboarding.ts';

export function contractSelection(contract: ContractReference | null): string {
  return contract?.identity_status === 'EXACT_DEMO' ? contract.program_id ?? '' : contract ? 'PROVIDER_ONLY' : '';
}
export function selectDemoContract(selection: string): ContractReference | null {
  if (!selection) return null;
  if (selection === 'PROVIDER_ONLY') return { identity_status: 'UNAVAILABLE', program_id: null, program_revision: null,
    terms_revision: null, pricing_data_status: 'INCOMPLETE', evidence_scope: 'FICTIONAL_SCENARIO',
    exit_fee_evidence: { status: 'UNKNOWN', amount_cents: null, evidence_reference: null, unknown_reason: 'CONTRACT_NOT_IDENTIFIED' } };
  // Explicit selection includes the exact versioned fictional terms, including their known-zero fee.
  return demoContract(selection);
}
export function setContractFeeKnowledge(contract: ContractReference, known: boolean): ContractReference {
  return { ...contract, exit_fee_evidence: known && contract.identity_status === 'EXACT_DEMO' && contract.program_id
    ? demoContract(contract.program_id).exit_fee_evidence
    : { status: 'UNKNOWN', amount_cents: null, evidence_reference: null, unknown_reason: 'TERMS_NOT_VERIFIED' } };
}
export function applyBillSample(form: FormDraft): FormDraft {
  const c = DEMO_BILL_SAMPLE.consumption;
  return { ...form, source: 'DEMO_SAMPLE', meter: 'DUAL', allocation: 'SPLIT', total: '',
    normal: c.normal_kwh, reduced: c.reduced_kwh, days: String(c.period_days), share: '', sample_confirmed: false };
}
const consumptionFields = ['total', 'normal', 'reduced', 'days', 'meter', 'allocation', 'share'] as const;
/** A real edit to sample quantities requires confirmation again; preferences do not change provenance. */
export function updateDraft(form: FormDraft, patch: Partial<FormDraft>): FormDraft {
  const changed = consumptionFields.some(key => key in patch && patch[key] !== form[key]);
  return { ...form, ...patch, ...(form.source === 'DEMO_SAMPLE' && changed ? { sample_confirmed: false } : {}) };
}
