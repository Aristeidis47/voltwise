import { recommend } from '../domain/recommend.ts';
import { evaluateTrial } from './trial.ts';
import type { Catalog, RecommendationResult, TrialInput, UserScenario, ValidationError } from '../domain/types.ts';

export type Screen = 'START' | 'REVIEW' | 'RESULTS' | 'TRIAL';
export interface AppState {
  readonly screen: Screen;
  readonly purpose: UserScenario['purpose'] | null;
  readonly draft: UserScenario | null;
  readonly submitted: UserScenario | null;
  readonly base_result: RecommendationResult | null;
  readonly trial_result: RecommendationResult | null;
  readonly errors: readonly ValidationError[];
}
export const initialAppState: AppState = { screen: 'START', purpose: null, draft: null, submitted: null, base_result: null, trial_result: null, errors: [] };
export type Action =
  | { type: 'SELECT_PURPOSE'; purpose: UserScenario['purpose'] }
  | { type: 'SET_DRAFT'; scenario: UserScenario }
  | { type: 'SUBMIT_SCENARIO'; scenario: UserScenario }
  | { type: 'SUBMIT' }
  | { type: 'EDIT' }
  | { type: 'CANCEL_EDIT' }
  | { type: 'OPEN_TRIAL' }
  | { type: 'APPLY_TRIAL'; trial: TrialInput }
  | { type: 'RESET_TRIAL' }
  | { type: 'RESULTS' }
  | { type: 'RESET' };

export function reduceApp(state: AppState, action: Action, catalog: Catalog): AppState {
  switch (action.type) {
    case 'SUBMIT_SCENARIO': return reduceApp(reduceApp(state, { type: 'SET_DRAFT', scenario: action.scenario }, catalog), { type: 'SUBMIT' }, catalog);
    case 'SELECT_PURPOSE': return { ...initialAppState, purpose: action.purpose, screen: 'REVIEW',
      draft: state.draft ? { ...state.draft, purpose: action.purpose, current_contract: action.purpose === 'NEW_SUPPLY' ? null : state.draft.current_contract } : null };
    case 'SET_DRAFT': return { ...state, screen: 'REVIEW', purpose: action.scenario.purpose,
      draft: structuredClone(action.scenario), trial_result: null, errors: [] };
    case 'SUBMIT': {
      if (!state.draft) return state;
      const submitted = { ...state.draft, revision: state.submitted ? state.submitted.revision + 1 : state.draft.revision };
      const result = recommend(submitted, catalog);
      if (result.status === 'INVALID_INPUT' || result.status === 'INVALID_CATALOG') return { ...state, errors: result.validation_errors, screen: 'REVIEW' };
      return { ...state, screen: 'RESULTS', draft: submitted, submitted: structuredClone(submitted), base_result: result, trial_result: null, errors: [] };
    }
    case 'EDIT': return state.draft ? { ...state, screen: 'REVIEW', errors: [] } : state;
    case 'CANCEL_EDIT': return state.submitted && state.base_result ? { ...state, screen: 'RESULTS', draft: structuredClone(state.submitted), errors: [] } : state;
    case 'OPEN_TRIAL': return state.base_result ? { ...state, screen: 'TRIAL', errors: [] } : state;
    case 'APPLY_TRIAL': {
      const base = state.base_result?.normalized_scenario;
      if (!base) return state;
      const evaluated = evaluateTrial(base, action.trial, catalog);
      if (!evaluated.ok) return { ...state, trial_result: null, errors: evaluated.errors };
      return { ...state, screen: 'TRIAL', trial_result: evaluated.value, errors: [] };
    }
    case 'RESET_TRIAL': return { ...state, trial_result: null, errors: [] };
    case 'RESULTS': return state.base_result ? { ...state, screen: 'RESULTS', errors: [] } : state;
    case 'RESET': return initialAppState;
  }
}
