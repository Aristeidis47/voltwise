import assert from 'node:assert/strict';
import { it } from 'node:test';
import { initialAppState, reduceApp } from './state.ts';
import { DEMO_CATALOG, demoContract } from '../data/demoPrograms.ts';
import { scenario, total } from '../tests/fixtures.ts';

const reduce = (state: typeof initialAppState, action: Parameters<typeof reduceApp>[1]) => reduceApp(state,action,DEMO_CATALOG);
function submitted() { return reduce(reduce(initialAppState,{ type:'SET_DRAFT',scenario:scenario() }),{ type:'SUBMIT' }); }

it('does not navigate to uncomputed results or trial', () => {
  assert.equal(reduce(initialAppState,{ type:'RESULTS' }),initialAppState);
  assert.equal(reduce(initialAppState,{ type:'OPEN_TRIAL' }),initialAppState);
  assert.equal(initialAppState.base_result,null);
});
it('new supply clears a previous contract and all computed results', () => {
  const draft = reduce(initialAppState,{ type:'SET_DRAFT',scenario:scenario({ current_contract:demoContract('A1') }) });
  const changed = reduce(reduce(draft,{ type:'SUBMIT' }),{ type:'SELECT_PURPOSE',purpose:'NEW_SUPPLY' });
  assert.equal(changed.draft!.current_contract,null); assert.equal(changed.base_result,null); assert.equal(changed.trial_result,null);
});
it('invalid submissions retain the draft and do not produce a new result', () => {
  const state = reduce(reduce(initialAppState,{ type:'SET_DRAFT',scenario:scenario({ consumption:total('') }) }),{ type:'SUBMIT' });
  assert.equal(state.screen,'REVIEW'); assert.equal(state.base_result,null); assert(state.errors.length>0);
});
it('trial and reset preserve the immutable initial result', () => {
  const state = submitted();
  const changed = reduce(state,{ type:'APPLY_TRIAL',trial:{ trial_id:'t',base_scenario_id:'test',base_revision:1,
    total_kwh_30_override:'50',reduced_share_override_percent:null,condition_answers:{ e_bill:'NO',direct_debit:'NO' } } });
  assert.deepEqual(changed.base_result!.cheapest_category.first_program_ids,['B1']);
  assert.deepEqual(changed.trial_result!.cheapest_category.first_program_ids,['A1']);
  assert.equal(changed.base_result,state.base_result);
  const reset = reduce(changed,{ type:'RESET_TRIAL' }); assert.equal(reset.trial_result,null); assert.equal(reset.base_result,state.base_result);
});
it('invalid trial clears a previous computed trial instead of showing it as a new result', () => {
  const state = submitted();
  const changed = reduce(state,{ type:'APPLY_TRIAL',trial:{ trial_id:'t',base_scenario_id:'test',base_revision:1,
    total_kwh_30_override:'',reduced_share_override_percent:null,condition_answers:{ e_bill:'NO',direct_debit:'NO' } } });
  assert.equal(changed.trial_result,null); assert(changed.errors.length>0); assert.equal(changed.base_result,state.base_result);
});
it('cancel restores submitted inputs, while re-submission increments revision and drops trial', () => {
  const state = submitted();
  const editing = reduce(state,{ type:'SET_DRAFT',scenario:scenario({ consumption:total('700') }) });
  const cancelled = reduce(editing,{ type:'CANCEL_EDIT' }); assert.deepEqual(cancelled.draft!.consumption,total('300'));
  const resubmitted = reduce(editing,{ type:'SUBMIT' });
  assert.equal(resubmitted.submitted!.revision,2); assert.equal(resubmitted.trial_result,null);
  assert.deepEqual(resubmitted.base_result!.cheapest_category.first_program_ids,['A2']);
});
it('reset returns to an empty session and does not mutate the initial state', () => {
  assert.deepEqual(reduce(submitted(),{ type:'RESET' }),initialAppState);
  assert.equal(initialAppState.draft,null);
});
