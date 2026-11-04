import { useReducer } from 'react';
import { initialAppState, reduceApp } from './app/state.ts';
import { DEMO_CATALOG } from './data/demoPrograms.ts';
import OnboardingFlow from './components/OnboardingFlow.tsx';
import ResultsFlow from './components/ResultsFlow.tsx';

export default function App() {
  const [state, dispatch] = useReducer((s: typeof initialAppState, a: Parameters<typeof reduceApp>[1]) => reduceApp(s, a, DEMO_CATALOG), initialAppState);
  const onboarding = state.screen === 'START' || state.screen === 'REVIEW' || !state.base_result;
  return <>
  {onboarding && <OnboardingFlow
    initialScenario={state.draft} submissionErrors={state.errors}
    onCancel={state.base_result ? () => dispatch({ type: 'CANCEL_EDIT' }) : undefined}
    onSubmit={scenario => dispatch({ type: 'SUBMIT_SCENARIO', scenario })} />}
  {state.base_result && <div hidden={onboarding}><ResultsFlow key={state.base_result.state_id} result={state.base_result} catalog={DEMO_CATALOG} isActive={!onboarding}
    consumptionSource={state.submitted?.consumption_source}
    trialResult={state.trial_result} trialErrors={state.errors}
    onTrialChange={trial => dispatch({ type: 'APPLY_TRIAL', trial })} onResetTrial={() => dispatch({ type: 'RESET_TRIAL' })}
    onEdit={() => dispatch({ type: 'EDIT' })}
    onReset={() => { if (window.confirm('Να καθαριστούν οι είσοδοι της συνεδρίας;')) dispatch({ type: 'RESET' }); }} /></div>}
  </>;
}
