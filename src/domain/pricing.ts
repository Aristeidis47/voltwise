import { add, cents, compare, decimal, fraction, multiply, ZERO } from './exact.ts';
import { record, validFee } from './normalize.ts';
import type { Answers, Catalog, Charges, DiscountEvaluation, DiscountRule, EnergyLine, Evaluation, NormalizedScenario, Program, Rates } from './types.ts';

export function validCatalog(catalog: Catalog): boolean {
  return record(catalog) && catalog.catalog_id === 'VOLTWISE_FICTIONAL' && catalog.revision === 'DEMO-1'
    && catalog.currency === 'EUR' && catalog.reference_days === 30 && catalog.vat_included === false
    && catalog.is_demo === true && catalog.is_real_offer === false && typeof catalog.notice === 'string' && !!catalog.notice.trim()
    && Array.isArray(catalog.programs) && Array.isArray(catalog.discount_rules);
}
const onlyKeys = (value: object, keys: readonly string[]) => Object.keys(value).every(key => keys.includes(key));
const programKeys = ['calculation_model', 'program_id', 'program_revision', 'provider_id', 'provider_name', 'program_name', 'is_demo', 'is_real_offer', 'currency', 'reference_days', 'vat_included', 'price_type', 'fixed_rate_months', 'minimum_commitment_months', 'price_reference', 'pricing_basis', 'supported_meters', 'requires_allocation', 'fixed_fee_cents_30', 'base_rates', 'discount_rule_id', 'terms_revision', 'exit_fee_terms', 'activation_fee_cents', 'deposit_cents'] as const;
export function validRates(rates: Rates): boolean {
  try {
    if (!record(rates)) return false;
    if (rates.basis === 'UNIFIED') return compare(decimal(rates.unified_rate, 6), ZERO) >= 0
      && onlyKeys(rates, ['basis', 'unified_rate']);
    return rates.basis === 'DUAL_ZONE' && onlyKeys(rates, ['basis', 'normal_rate', 'reduced_rate'])
      && compare(decimal(rates.normal_rate, 6), ZERO) >= 0 && compare(decimal(rates.reduced_rate, 6), ZERO) >= 0;
  } catch { return false; }
}
/** Closed schema: tiers, quantity-dependent discounts or future formulas require an explicit new model. */
export function supportsLinearPricing(program: Program, effectiveRates?: Rates): boolean {
  return record(program) && program.calculation_model === 'LINEAR_V1' && onlyKeys(program, programKeys)
    && validRates(program.base_rates) && (effectiveRates === undefined || validRates(effectiveRates));
}
function ruleFor(program: Program, rules: readonly DiscountRule[]): DiscountRule | undefined {
  return rules.find(r => r.discount_id === program.discount_rule_id);
}
export function validateProgram(program: Program, rules: readonly DiscountRule[]): readonly string[] {
  const reasons: string[] = [];
  if (!record(program)) return ['INVALID_PROGRAM_DATA'];
  if (program.calculation_model !== 'LINEAR_V1' || !onlyKeys(program, programKeys)) reasons.push('UNSUPPORTED_PRICING_MODEL');
  if (![program.program_id, program.provider_id, program.provider_name, program.program_name].every(v => typeof v === 'string' && !!v.trim())
    || program.program_revision !== 'DEMO-1' || program.terms_revision !== `DEMO-1/${program.program_id}/TERMS-1`) reasons.push('INVALID_PROGRAM_IDENTITY');
  if (program.is_demo !== true || program.is_real_offer !== false || program.currency !== 'EUR'
    || program.reference_days !== 30 || program.vat_included !== false) reasons.push('UNSUPPORTED_COST_SCOPE');
  if (!['FIXED', 'VARIABLE_SNAPSHOT'].includes(program.price_type)
    || (program.price_type === 'FIXED' ? program.fixed_rate_months !== 12 || program.minimum_commitment_months !== 12 || program.price_reference !== 'DEMO_FIXED_TERMS'
      : program.fixed_rate_months !== null || program.minimum_commitment_months !== 0 || program.price_reference !== 'DEMO_SNAPSHOT_1')) reasons.push('INVALID_PRICE_TYPE');
  if (![program.fixed_fee_cents_30, program.activation_fee_cents, program.deposit_cents].every(v => Number.isSafeInteger(v) && v >= 0)) reasons.push('INVALID_FEE');
  if (!validFee(program.exit_fee_terms)) reasons.push('INVALID_EXIT_FEE_EVIDENCE');
  if (!validRates(program.base_rates)) reasons.push('MISSING_OR_INVALID_RATE');
  if (!Array.isArray(program.supported_meters) || program.pricing_basis !== program.base_rates?.basis
    || program.requires_allocation !== (program.pricing_basis === 'DUAL_ZONE')
    || (program.pricing_basis === 'UNIFIED'
      ? program.supported_meters.length !== 3 || !['SINGLE', 'DUAL', 'UNKNOWN'].every(v => program.supported_meters.includes(v as NormalizedScenario['meter_type']))
      : program.supported_meters.length !== 1 || program.supported_meters[0] !== 'DUAL')) reasons.push('INVALID_METER_RULE');
  if (program.discount_rule_id !== null) {
    const matches = rules.filter(r => r.discount_id === program.discount_rule_id);
    const rule = matches[0];
    if (matches.length !== 1 || !rule || !onlyKeys(rule, ['discount_id', 'revision', 'applies_to', 'condition_ids', 'match_mode', 'effect_type', 'replacement_rates', 'failure_behavior', 'stacking', 'explanation']) || rule.revision !== 'DEMO-1' || rule.applies_to !== 'ENERGY_RATE'
      || rule.match_mode !== 'ALL' || rule.effect_type !== 'REPLACE_RATE' || rule.failure_behavior !== 'KEEP_BASE_RATE'
      || rule.stacking !== 'NONE' || !Array.isArray(rule.condition_ids) || rule.condition_ids.length === 0
      || new Set(rule.condition_ids).size !== rule.condition_ids.length || !rule.condition_ids.every(id => ['E_BILL', 'DIRECT_DEBIT'].includes(id))
      || !validRates(rule.replacement_rates) || rule.replacement_rates.basis !== program.pricing_basis) reasons.push('INVALID_DISCOUNT_RULE');
  }
  if (!reasons.length) {
    // Every accepted program must remain representable in integer cents over the supported domain.
    try {
      for (const rates of [program.base_rates, ruleFor(program, rules)?.replacement_rates].filter((r): r is Rates => r !== undefined)) {
        const values = rates.basis === 'UNIFIED' ? [rates.unified_rate] : [rates.normal_rate, rates.reduced_rate];
        for (const rate of values) cents(add(fraction(program.fixed_fee_cents_30, 100), multiply(fraction(5000), decimal(rate, 6))));
      }
    } catch { reasons.push('MONEY_OUT_OF_RANGE'); }
  }
  return reasons;
}
export function eligibility(program: Program, scenario: NormalizedScenario): readonly string[] {
  if (program.pricing_basis === 'UNIFIED') return [];
  if (scenario.meter_type === 'SINGLE') return ['METER_NOT_DUAL'];
  if (scenario.meter_type === 'UNKNOWN') return ['METER_TYPE_UNKNOWN'];
  if (scenario.normal_kwh_30 === null || scenario.reduced_kwh_30 === null) return ['ALLOCATION_UNKNOWN'];
  return [];
}
export function evaluateDiscount(program: Program, answers: Answers, rules: readonly DiscountRule[]): DiscountEvaluation {
  const rule = ruleFor(program, rules);
  if (!rule) return { discount_id: null, status: 'NOT_APPLICABLE', unmet_condition_ids: [], unknown_condition_ids: [], effective_rates: program.base_rates };
  const answer = (id: 'E_BILL' | 'DIRECT_DEBIT') => id === 'E_BILL' ? answers.e_bill : answers.direct_debit;
  const unmet = rule.condition_ids.filter(id => answer(id) === 'NO');
  const unknown = rule.condition_ids.filter(id => answer(id) === 'UNKNOWN');
  const applied = !unmet.length && !unknown.length;
  return { discount_id: rule.discount_id, status: applied ? 'APPLIED' : unmet.length ? 'NOT_MET' : 'UNCONFIRMED',
    unmet_condition_ids: unmet, unknown_condition_ids: unknown, effective_rates: applied ? rule.replacement_rates : program.base_rates };
}
function energyLines(rates: Rates, scenario: NormalizedScenario): readonly EnergyLine[] {
  const line = (zone: EnergyLine['zone'], quantity: EnergyLine['quantity_kwh_30'], rate: string): EnergyLine => {
    const exact = multiply(quantity, decimal(rate, 6));
    return { zone, quantity_kwh_30: quantity, rate, amount_exact_eur: exact, amount_cents: cents(exact) };
  };
  if (rates.basis === 'UNIFIED') return [line('UNIFIED', scenario.total_kwh_30, rates.unified_rate)];
  if (scenario.normal_kwh_30 === null || scenario.reduced_kwh_30 === null) throw new RangeError('Unknown allocation');
  return [line('NORMAL', scenario.normal_kwh_30, rates.normal_rate), line('REDUCED', scenario.reduced_kwh_30, rates.reduced_rate)];
}
export function calculateCharges(program: Program, scenario: NormalizedScenario, discount: DiscountEvaluation): Charges {
  if (!supportsLinearPricing(program, discount.effective_rates)) throw new RangeError('Unsupported pricing model');
  if (eligibility(program, scenario).length || compare(scenario.total_kwh_30, ZERO) < 0 || compare(scenario.total_kwh_30, fraction(5000)) > 0) throw new RangeError('Incompatible normalized input');
  const lines = energyLines(discount.effective_rates, scenario);
  const energy = lines.reduce((sum, line) => add(sum, line.amount_exact_eur), ZERO);
  const energyCents = cents(energy);
  const baseEnergy = energyLines(program.base_rates, scenario).reduce((sum, line) => add(sum, line.amount_exact_eur), ZERO);
  const total = energyCents + program.fixed_fee_cents_30;
  const base = cents(baseEnergy) + program.fixed_fee_cents_30;
  return { energy_lines: lines, energy_total_exact_eur: energy, energy_total_cents: energyCents,
    energy_rounding_adjustment_cents: energyCents - lines.reduce((sum, line) => sum + line.amount_cents, 0),
    fixed_fee_cents_30: program.fixed_fee_cents_30, total_exact_eur: add(energy, fraction(program.fixed_fee_cents_30, 100)),
    total_cents: total, base_price_counterfactual_cents: base, discount_effect_cents: base - total };
}
export function evaluateProgram(program: Program, scenario: NormalizedScenario, rules: readonly DiscountRule[], extraReasons: readonly string[] = []): Evaluation {
  const invalid = [...extraReasons, ...validateProgram(program, rules)];
  const incompatible = invalid.length ? [] : eligibility(program, scenario);
  const reasons = [...invalid, ...incompatible];
  const discount = reasons.length ? null : evaluateDiscount(program, scenario.condition_answers, rules);
  return { program, state_id: scenario.state_id,
    comparability_status: invalid.length ? 'INVALID_PROGRAM_DATA' : incompatible.length ? 'INCOMPATIBLE_INPUT' : 'COMPARABLE',
    reason_codes: reasons, discount_evaluation: discount,
    charges: discount === null ? null : calculateCharges(program, scenario, discount),
    baseline_comparison_status: 'NO_EXACT_CONTRACT', baseline_difference_cents: null };
}
