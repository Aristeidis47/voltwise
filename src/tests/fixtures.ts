import type { Consumption, UserScenario } from '../domain/types.ts';

export function scenario(overrides: Partial<UserScenario> = {}): UserScenario {
  return { scenario_id: 'test', revision: 1, purpose: 'EXISTING_SUPPLY', consumption_source: 'BILL_MANUAL', indicative_preset: null,
    meter_type: 'SINGLE', consumption: total('300'), priority: 'LOWEST_SCENARIO_COST',
    condition_answers: { e_bill: 'NO', direct_debit: 'NO' }, current_contract: null, catalog_revision: 'DEMO-1', ...overrides };
}
export const total = (quantity: string, days = 30): Consumption => ({ quantity_mode: 'TOTAL', total_kwh: quantity, period_days: days });
export const split = (normal: string, reduced: string, days = 30): Consumption => ({ quantity_mode: 'SPLIT', normal_kwh: normal, reduced_kwh: reduced, period_days: days });

/** Literal expected values independently derived in VERIFIED_EXAMPLES.md, never calculated by the implementation. */
export const verifiedCases: readonly { id: string; input: UserScenario; totals: readonly (number | null)[]; cheapest: readonly string[]; fixed: readonly string[] }[] = [
  { id: 'E01', input: scenario({ consumption: total('900', 90), condition_answers: { e_bill:'YES',direct_debit:'NO' } }), totals: [5000,4600,4300,5700,null], cheapest: ['B1'], fixed: ['A2'] },
  { id: 'E02', input: scenario({ consumption: total('150'), priority: 'FIXED_RATE' }), totals: [2600,2800,2350,3000,null], cheapest: ['B1'], fixed: ['A1'] },
  { id: 'E03', input: scenario({ consumption: total('200'), priority: 'FIXED_RATE' }), totals: [3400,3400,3000,3900,null], cheapest: ['B1'], fixed: ['A1','A2'] },
  { id: 'E04', input: scenario({ consumption: total('600') }), totals: [9800,8200,8200,11100,null], cheapest: ['A2','B1'], fixed: ['A2'] },
  { id: 'E05', input: scenario({ consumption: total('700') }), totals: [11400,9400,9500,12900,null], cheapest: ['A2'], fixed: ['A2'] },
  { id: 'E06', input: scenario({ consumption: total('50'), priority: 'NO_CLEAR_PREFERENCE' }), totals: [1000,1600,1050,1200,null], cheapest: ['A1'], fixed: ['A1'] },
  { id: 'E07', input: scenario({ condition_answers: { e_bill: 'YES', direct_debit: 'YES' } }), totals: [5000,4600,4300,3300,null], cheapest: ['C1'], fixed: ['C1'] },
  { id: 'E08', input: scenario({ condition_answers: { e_bill: 'YES', direct_debit: 'UNKNOWN' } }), totals: [5000,4600,4300,5700,null], cheapest: ['B1'], fixed: ['A2'] },
  { id: 'E09', input: scenario({ meter_type: 'DUAL', consumption: split('360','240',60), priority: 'FIXED_RATE' }), totals: [5000,4600,4300,5700,4620], cheapest: ['B1'], fixed: ['A2'] },
  { id: 'E10', input: scenario({ meter_type: 'DUAL', consumption: split('150','150'), priority: 'FIXED_RATE' }), totals: [5000,4600,4300,5700,4350], cheapest: ['B1'], fixed: ['D1'] },
  { id: 'E11', input: scenario({ meter_type: 'DUAL', priority: 'FIXED_RATE' }), totals: [5000,4600,4300,5700,null], cheapest: ['B1'], fixed: ['A2'] },
  { id: 'E12', input: scenario({ consumption: total('0') }), totals: [200,1000,400,300,null], cheapest: ['A1'], fixed: ['A1'] },
  { id: 'E13', input: scenario({ consumption: total('1',7) }), totals: [269,1051,456,377,null], cheapest: ['A1'], fixed: ['A1'] },
  { id: 'E14', input: scenario({ consumption: total('199,99'), priority: 'FIXED_RATE' }), totals: [3400,3400,3000,3900,null], cheapest: ['B1'], fixed: ['A1','A2'] },
  { id: 'E15', input: scenario({ meter_type: 'DUAL', consumption: split('0.03','0.07') }), totals: [202,1001,401,302,601], cheapest: ['A1'], fixed: ['A1'] },
  { id: 'E16', input: scenario({ meter_type: 'DUAL', consumption: split('0','300') }), totals: [5000,4600,4300,5700,3000], cheapest: ['D1'], fixed: ['D1'] },
  { id: 'E17', input: scenario({ meter_type: 'DUAL', consumption: split('300','0') }), totals: [5000,4600,4300,5700,5700], cheapest: ['B1'], fixed: ['A2'] },
];
