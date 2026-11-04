import type { Exact } from './exact.ts';

export type Answer = 'YES' | 'NO' | 'UNKNOWN';
export type Meter = 'SINGLE' | 'DUAL' | 'UNKNOWN';
export type Priority = 'LOWEST_SCENARIO_COST' | 'FIXED_RATE' | 'NO_CLEAR_PREFERENCE';
export type CategoryId = 'CHEAPEST_SCENARIO' | 'FIXED_RATE';
export type Answers = Readonly<{ e_bill: Answer; direct_debit: Answer }>;
export type Consumption = Readonly<{ period_days: number } & (
  | { quantity_mode: 'TOTAL'; total_kwh: string }
  | { quantity_mode: 'SPLIT'; normal_kwh: string; reduced_kwh: string }
  | { quantity_mode: 'TOTAL_AND_SHARE'; total_kwh: string; reduced_share_percent: string }
)>;
export type UnknownFeeReason = 'CONTRACT_NOT_IDENTIFIED' | 'TERMS_NOT_VERIFIED' | 'AMOUNT_NOT_PROVIDED' | 'AMOUNT_NOT_RESOLVED_FOR_CASE';
export type FeeEvidence = Readonly<
  | { status: 'UNKNOWN'; amount_cents: null; evidence_reference: string | null; unknown_reason: UnknownFeeReason }
  | { status: 'KNOWN_ZERO' | 'KNOWN_AMOUNT'; amount_cents: number; evidence_reference: string; unknown_reason: null }
>;
export type ContractReference = Readonly<{
  identity_status: 'EXACT_DEMO' | 'UNAVAILABLE';
  program_id: string | null;
  program_revision: string | null;
  terms_revision: string | null;
  pricing_data_status: 'COMPLETE' | 'INCOMPLETE';
  evidence_scope: 'FICTIONAL_SCENARIO';
  exit_fee_evidence: FeeEvidence;
}>;
export interface UserScenario {
  readonly scenario_id: string;
  readonly revision: number;
  readonly purpose: 'EXISTING_SUPPLY' | 'NEW_SUPPLY';
  readonly consumption_source: 'BILL_MANUAL' | 'INDICATIVE' | 'DEMO_SAMPLE';
  readonly indicative_preset: 'KWH_150' | 'KWH_300' | 'KWH_600' | 'CUSTOM' | null;
  readonly meter_type: Meter;
  readonly consumption: Consumption;
  readonly priority: Priority;
  readonly condition_answers: Answers;
  readonly current_contract: ContractReference | null;
  readonly catalog_revision: string;
}
export interface NormalizedScenario {
  readonly purpose: UserScenario['purpose'];
  readonly scenario_id: string;
  readonly scenario_revision: number;
  readonly state_id: string;
  readonly reference_days: 30;
  readonly original_period_days: number;
  readonly original_total_kwh: Exact;
  readonly total_kwh_30: Exact;
  readonly normal_kwh_30: Exact | null;
  readonly reduced_kwh_30: Exact | null;
  readonly reduced_share: Exact | null;
  readonly allocation_source: 'NOT_APPLICABLE' | 'UNKNOWN' | 'REPORTED_SPLIT' | 'ASSUMED_SHARE';
  readonly meter_type: Meter;
  readonly priority: Priority;
  readonly condition_answers: Answers;
  readonly current_contract: ContractReference | null;
  readonly catalog_revision: string;
}
export interface TrialInput {
  readonly trial_id: string;
  readonly base_scenario_id: string;
  readonly base_revision: number;
  readonly total_kwh_30_override: string | null;
  readonly reduced_share_override_percent: string | null;
  readonly condition_answers: Answers;
}
export type Rates = Readonly<
  | { basis: 'UNIFIED'; unified_rate: string }
  | { basis: 'DUAL_ZONE'; normal_rate: string; reduced_rate: string }
>;
export interface Program {
  readonly calculation_model: 'LINEAR_V1';
  readonly program_id: string;
  readonly program_revision: string;
  readonly provider_id: string;
  readonly provider_name: string;
  readonly program_name: string;
  readonly is_demo: true;
  readonly is_real_offer: false;
  readonly currency: 'EUR';
  readonly reference_days: 30;
  readonly vat_included: false;
  readonly price_type: 'FIXED' | 'VARIABLE_SNAPSHOT';
  readonly fixed_rate_months: number | null;
  readonly minimum_commitment_months: number;
  readonly price_reference: 'DEMO_FIXED_TERMS' | 'DEMO_SNAPSHOT_1';
  readonly pricing_basis: Rates['basis'];
  readonly supported_meters: readonly Meter[];
  readonly requires_allocation: boolean;
  readonly fixed_fee_cents_30: number;
  readonly base_rates: Rates;
  readonly discount_rule_id: string | null;
  readonly terms_revision: string;
  readonly exit_fee_terms: FeeEvidence;
  readonly activation_fee_cents: number;
  readonly deposit_cents: number;
}
export interface DiscountRule {
  readonly discount_id: string;
  readonly revision: string;
  readonly applies_to: 'ENERGY_RATE';
  readonly condition_ids: readonly ('E_BILL' | 'DIRECT_DEBIT')[];
  readonly match_mode: 'ALL';
  readonly effect_type: 'REPLACE_RATE';
  readonly replacement_rates: Rates;
  readonly failure_behavior: 'KEEP_BASE_RATE';
  readonly stacking: 'NONE';
  readonly explanation: string;
}
export interface Catalog {
  readonly catalog_id: 'VOLTWISE_FICTIONAL';
  readonly revision: 'DEMO-1';
  readonly currency: 'EUR';
  readonly reference_days: 30;
  readonly vat_included: false;
  readonly is_demo: true;
  readonly is_real_offer: false;
  readonly notice: string;
  readonly programs: readonly Program[];
  readonly discount_rules: readonly DiscountRule[];
}
export interface ValidationError { readonly field: string; readonly code: string; readonly message: string }
export type Validated<T> = { ok: true; value: T } | { ok: false; errors: readonly ValidationError[] };
export interface DiscountEvaluation {
  readonly discount_id: string | null;
  readonly status: 'NOT_APPLICABLE' | 'APPLIED' | 'NOT_MET' | 'UNCONFIRMED';
  readonly unmet_condition_ids: readonly string[];
  readonly unknown_condition_ids: readonly string[];
  readonly effective_rates: Rates;
}
export interface EnergyLine {
  readonly zone: 'UNIFIED' | 'NORMAL' | 'REDUCED';
  readonly quantity_kwh_30: Exact;
  readonly rate: string;
  readonly amount_exact_eur: Exact;
  readonly amount_cents: number;
}
export interface Charges {
  readonly energy_lines: readonly EnergyLine[];
  readonly energy_total_exact_eur: Exact;
  readonly energy_total_cents: number;
  readonly energy_rounding_adjustment_cents: number;
  readonly fixed_fee_cents_30: number;
  readonly total_exact_eur: Exact;
  readonly total_cents: number;
  readonly base_price_counterfactual_cents: number;
  readonly discount_effect_cents: number;
}
export type BaselineStatus = 'AVAILABLE' | 'NO_EXACT_CONTRACT' | 'INCOMPLETE_CONTRACT' | 'BASELINE_NOT_COMPUTABLE';
export interface Evaluation {
  readonly program: Program;
  readonly state_id: string;
  readonly comparability_status: 'COMPARABLE' | 'INVALID_PROGRAM_DATA' | 'INCOMPATIBLE_INPUT';
  readonly reason_codes: readonly string[];
  readonly discount_evaluation: DiscountEvaluation | null;
  readonly charges: Charges | null;
  readonly baseline_comparison_status: BaselineStatus;
  readonly baseline_difference_cents: number | null;
}
export interface Category {
  readonly category_id: CategoryId;
  readonly status: 'AVAILABLE' | 'EMPTY' | 'NOT_EVALUATED';
  readonly ranked_entries: readonly { program_id: string; total_cents: number; dense_rank: number; tied_program_ids: readonly string[] }[];
  readonly first_program_ids: readonly string[];
  readonly exclusion_reasons: readonly { program_id: string; reasons: readonly string[] }[];
}
export type CategoryRelation = 'SAME_FIRST_SET' | 'OVERLAPPING_FIRST_SETS' | 'DIFFERENT_FIRST_SETS' | 'ONE_CATEGORY_EMPTY' | 'BOTH_EMPTY' | 'NOT_EVALUATED';
export interface RecommendationResult {
  readonly status: 'READY' | 'INVALID_INPUT' | 'INVALID_CATALOG' | 'NO_COMPARABLE_PROGRAMS';
  readonly state_id: string | null;
  readonly catalog_revision: string;
  readonly normalized_scenario: NormalizedScenario | null;
  readonly validation_errors: readonly ValidationError[];
  readonly evaluations: readonly Evaluation[];
  readonly cheapest_category: Category;
  readonly fixed_category: Category;
  readonly primary_category: CategoryId | null;
  readonly category_relation: CategoryRelation;
  readonly baseline_evaluation: Evaluation | null;
  readonly switching_assessment: { status: 'NOT_CALCULATED_HW1'; net_savings_cents: null; exit_fee_evidence: FeeEvidence };
  readonly notices: readonly string[];
}
