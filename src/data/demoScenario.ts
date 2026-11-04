import type { UserScenario } from '../domain/types.ts';

/** Explicitly loaded developer example; never silently personalizes a new session. */
export function createDemoScenario(purpose: UserScenario['purpose']): UserScenario {
  return { scenario_id: 'developer-demo', revision: 1, purpose, consumption_source: 'INDICATIVE',
    indicative_preset: 'KWH_300', meter_type: 'SINGLE', consumption: { quantity_mode: 'TOTAL', total_kwh: '300', period_days: 30 },
    priority: 'LOWEST_SCENARIO_COST', condition_answers: { e_bill: 'NO', direct_debit: 'NO' },
    current_contract: null, catalog_revision: 'DEMO-1' };
}
