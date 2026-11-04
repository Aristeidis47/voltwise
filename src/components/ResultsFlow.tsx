import { useEffect, useRef, useState } from 'react';
import { answerLabels, buildResultsView, defaultComparison, priorityLabels, RESULT_COST_LABEL } from '../app/results.ts';
import { formatExact, formatMoney } from '../domain/exact.ts';
import type { Catalog, RecommendationResult, TrialInput, UserScenario, ValidationError } from '../domain/types.ts';
import { createRangeDraft, createTrialDraft, trialDefaultPair, trialInput } from '../app/trial.ts';
import type { TrialDraft } from '../app/trial.ts';
import Brand from './Brand.tsx';
import { CostBreakdown, CostScope, DiscountFacts, ProgramAmount, ProgramTags, ProgramTerms } from './ProgramFacts.tsx';
import PairFacts from './PairFacts.tsx';
import WhatIf from './WhatIf.tsx';
import BaselineComparison from './BaselineComparison.tsx';

type View = 'LIST' | 'DETAIL' | 'COMPARE' | 'WHAT_IF';
export default function ResultsFlow({ result, catalog, onEdit, onReset, trialResult, trialErrors, onTrialChange, onResetTrial, consumptionSource, isActive = true }: {
  result: RecommendationResult; catalog: Catalog; onEdit: () => void; onReset: () => void;
  trialResult: RecommendationResult | null; trialErrors: readonly ValidationError[];
  onTrialChange: (input: TrialInput) => void; onResetTrial: () => void;
  consumptionSource?: UserScenario['consumption_source'];
  isActive?: boolean;
}) {
  const [screen, setScreen] = useState<View>('LIST');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailOrigin, setDetailOrigin] = useState<'LIST' | 'COMPARE'>('LIST');
  const [pair, setPair] = useState<readonly string[]>(() => defaultComparison(result));
  const [showAll, setShowAll] = useState(false);
  const [trialDraft, setTrialDraft] = useState(() => createTrialDraft(result.normalized_scenario!));
  const [rangeDraft, setRangeDraft] = useState(() => createRangeDraft(result.normalized_scenario!));
  const [trialPair, setTrialPair] = useState<readonly string[]>(() => trialDefaultPair(result));
  const heading = useRef<HTMLHeadingElement>(null);
  const main = useRef<HTMLElement>(null);
  const returnFocus = useRef<string | null>(null);
  const model = buildResultsView(result, catalog);
  const n = result.normalized_scenario;
  const selected = model.programs.find(p => p.id === detailId);
  useEffect(() => {
    if (!isActive) return;
    const target = screen === 'LIST' && returnFocus.current ? document.getElementById(returnFocus.current) : null;
    if (target) target.focus(); else { (screen === 'WHAT_IF' ? main.current?.querySelector('h1') : heading.current)?.focus(); window.scrollTo({ top: 0, behavior: 'instant' }); }
  }, [screen, detailId, isActive]);
  function openDetail(id: string, focusId: string, origin: 'LIST' | 'COMPARE' = 'LIST') {
    if (origin === 'LIST') returnFocus.current = focusId;
    setDetailId(id); setDetailOrigin(origin); setScreen('DETAIL');
  }
  function openCompare(id?: string, trigger = 'open-comparison') {
    if (id) setPair(defaultComparison(result, id));
    if (screen === 'LIST') returnFocus.current = trigger;
    setScreen('COMPARE');
  }
  function changeTrial(draft: TrialDraft) {
    setTrialDraft(draft); onTrialChange(trialInput(result.normalized_scenario!, draft));
  }
  function openTrial() {
    if (screen === 'COMPARE') setTrialPair(pair);
    else if (screen === 'DETAIL') setTrialPair(trialDefaultPair(result, detailId ?? undefined));
    if (screen === 'LIST') returnFocus.current = 'open-what-if';
    onTrialChange(trialInput(result.normalized_scenario!, trialDraft)); setScreen('WHAT_IF');
  }
  const labelFor = (id: string) => model.programs.find(p => p.id === id)?.program.program_name ?? id;
  const personalIds = model.primary.first_program_ids;
  const noPreference = n?.priority === 'NO_CLEAR_PREFERENCE';
  const visibleRanking = showAll ? model.ranked : model.ranked.filter((p, index) => index < 3 || p.entry.dense_rank === 1);
  return <div className="app-shell"><Brand /><main ref={main} id={isActive ? 'main-content' : undefined} tabIndex={-1} className="results-page">
    {screen === 'LIST' && <>
      <div className="results-heading"><p className="eyebrow">Η σύγκρισή σου</p><h1 ref={heading} tabIndex={-1}>Αποτελέσματα demo</h1>
        <p>Επιλογές με βάση τη χρήση σου και τους όρους που δήλωσες.</p></div>
      {n && <section className="scenario-summary" aria-label="Οι παραδοχές σου">
        {consumptionSource === 'DEMO_SAMPLE' && <p className="sample-origin-label">Κατανάλωση από φανταστικό demo δείγμα — όχι πραγματικός λογαριασμός.</p>}
        <p className="mini-label">Προτεραιότητά σου</p><p className="priority-value">{priorityLabels[n.priority]}</p>
        <p className="scenario-quantity">{formatExact(n.total_kwh_30)} kWh / 30 ημέρες <span>· {n.meter_type === 'SINGLE' ? 'Μονή μέτρηση' : n.meter_type === 'DUAL' ? 'Διζωνική μέτρηση' : 'Άγνωστη μέτρηση'}</span></p>
        <details><summary>Με ποιες παραδοχές υπολογίστηκε;</summary><p>Αρχικά στοιχεία: {formatExact(n.original_total_kwh)} kWh σε {n.original_period_days} ημέρες. Η σύγκριση χρησιμοποιεί κοινή βάση 30 ημερών.</p>
          {n.normal_kwh_30 !== null && <p>Κανονική: {formatExact(n.normal_kwh_30)} kWh · Μειωμένη: {formatExact(n.reduced_kwh_30!)} kWh / 30 ημέρες.{n.allocation_source === 'ASSUMED_SHARE' ? ' Η κατανομή είναι υπόθεση.' : ''}</p>}
          {n.meter_type !== 'SINGLE' && n.normal_kwh_30 === null && <p>Δεν γνωρίζουμε κατανομή ανά ζώνη. Συγκρίνονται μόνο ενιαίες τιμές.</p>}
          <p>Ηλεκτρονικός λογαριασμός: {answerLabels[n.condition_answers.e_bill]} · Πάγια εντολή: {answerLabels[n.condition_answers.direct_debit]}.</p>
        </details><div className="scenario-actions"><button className="text-button" onClick={onEdit}>Διόρθωση στοιχείων</button>
          <button id="open-comparison" aria-label="Σύγκρινε δύο επιλογές" className="text-button" disabled={model.comparable.length < 2} onClick={() => openCompare()}>Σύγκριση δύο <span aria-hidden="true">↔</span></button></div>
        {model.comparable.length < 2 && <p className="field-help">Χρειάζονται δύο υπολογίσιμα προγράμματα για σύγκριση.</p>}
        <button id="open-what-if" className="primary-button full-width" onClick={openTrial}>Τι αλλάζει αν…</button>
        {trialResult && <p className="field-help">Η δοκιμή διατηρείται ξεχωριστά. Εδώ βλέπεις τα αρχικά αποτελέσματα.</p>}
      </section>}
      <div className="recommendation-intro" data-testid="first-programs" data-program-ids={personalIds.join(',')}>
        <h2>{!personalIds.length ? 'Δεν υπάρχει επιλογή για την προτεραιότητά σου' : noPreference ? 'Πρώτα στη σειρά κόστους' : personalIds.length > 1 ? 'Ισότιμες προτάσεις με βάση την προτεραιότητά σου' : 'Η πρόταση με βάση την προτεραιότητά σου'}</h2>
        <p>{!personalIds.length ? 'Δεν χαλαρώνουμε την προτίμησή σου σιωπηρά. Δες τις αιτίες ή άλλαξε τα στοιχεία σου.'
          : noPreference ? 'Δεν δήλωσες σαφή προτίμηση. Η σειρά βασίζεται μόνο στο συγκρινόμενο κόστος, χωρίς υπόθεση για την ανοχή σου σε μεταβολές τιμής.'
          : result.primary_category === 'FIXED_RATE' ? 'Προηγείται το χαμηλότερο κόστος μεταξύ των συμβατών επιλογών σταθερής τιμής.' : 'Προηγείται το χαμηλότερο εκτιμώμενο κόστος με τις τιμές αυτού του σεναρίου.'}</p>
        {model.same_first_set && personalIds.length > 0 && <p className="same-choice-note">{personalIds.length === 1 ? 'Ίδια επιλογή για κόστος και σταθερή τιμή.' : 'Οι ίδιες πρώτες επιλογές καλύπτουν και τις δύο κατηγορίες.'} Κάθε πρόγραμμα εμφανίζεται μία φορά στις προτάσεις.</p>}
        {result.category_relation === 'OVERLAPPING_FIRST_SETS' && <p className="same-choice-note">Υπάρχει επικάλυψη στις κατηγορίες. Κρατάμε όλες τις ισοπαλίες και εμφανίζουμε κάθε πρόταση μία φορά.</p>}
      </div>
      <div className="featured-programs">{model.featured.map(view => <article key={view.id} className={`featured-program ${view.personal ? 'is-personal' : ''}`} data-featured-id={view.id}>
        <ProgramTags view={view} noPreference={noPreference} /><p className="provider-label">{view.program.provider_name}</p><h3>{view.program.program_name}</h3>
        {!view.personal && result.primary_category === 'FIXED_RATE' && view.program.price_type === 'VARIABLE_SNAPSHOT' && <p className="outside-preference">Χαμηλότερο κόστος σεναρίου, εκτός της προτεραιότητάς σου για σταθερή τιμή.</p>}
        <ProgramAmount view={view} />
        <div className="why-block"><h4>{view.personal ? noPreference ? 'Γιατί προηγείται στο κόστος' : 'Γιατί προτείνεται' : 'Γιατί είναι εναλλακτική'}</h4><p>{view.reason[0]}</p><p>{view.reason.find(line => line.startsWith('Ενέργεια'))}</p><p>{view.reason[view.reason.length - 1]}</p></div>
        <p className="price-caution">{view.price_type_text}</p>
        <button id={`featured-details-${view.id}`} className="outline-button" onClick={() => openDetail(view.id, `featured-details-${view.id}`)}>Λεπτομέρειες προγράμματος <span aria-hidden="true">→</span><span className="sr-only"> {view.program.program_name}</span></button>
      </article>)}</div>
      <section className="compare-invitation"><div><h2>Δες δύο επιλογές δίπλα δίπλα</h2><p>Ίδιες kWh και όροι, καθαρή σύγκριση παγίου, ενέργειας και προϋποθέσεων.</p></div>
        <button id="open-comparison-bottom" className="primary-button" disabled={model.comparable.length < 2} onClick={() => openCompare(undefined, 'open-comparison-bottom')}>Σύγκριση δύο προγραμμάτων <span aria-hidden="true">↔</span></button>
        {model.comparable.length < 2 && <p className="field-help">Χρειάζονται τουλάχιστον δύο υπολογίσιμα, συμβατά προγράμματα.</p>}
      </section>
      <section className="ranking-section" aria-labelledby="ranking-title"><h2 id="ranking-title">Η σειρά με την προτεραιότητά σου</h2><p className="field-help">{RESULT_COST_LABEL}. Όλα τα ποσά είναι για 30 ημέρες, χωρίς ΦΠΑ.</p>
        {model.ranked.length === 0 ? <p className="inline-note">Δεν υπάρχουν κατάλληλα προγράμματα σε αυτή την κατηγορία.</p> : <ol className="ranking-list">{visibleRanking.map(({ entry, view }) => <li key={view.id} data-program-id={view.id} data-total-cents={view.total_cents}>
          <span className="rank-position" aria-label={`Θέση ${entry.dense_rank}`}>{entry.dense_rank}</span><div className="rank-copy"><strong>{view.program.program_name}</strong><span>{view.program.provider_name}</span>
            {entry.tied_program_ids.length > 1 && <small>Ίδιο κόστος στην ακρίβεια εμφάνισης</small>}</div><div className="rank-value"><strong>{formatMoney(entry.total_cents)}</strong><span>/ 30 ημέρες</span></div>
          <button id={`rank-details-${view.id}`} className="text-button" onClick={() => openDetail(view.id, `rank-details-${view.id}`)}>Λεπτομέρειες<span className="sr-only"> {view.program.program_name}</span></button>
        </li>)}</ol>}
        {model.ranked.length > visibleRanking.length && <button className="outline-button" onClick={() => setShowAll(true)}>Δες όλα τα {model.ranked.length} προγράμματα</button>}
      </section>
      {model.excluded.length > 0 && <details className="excluded-programs"><summary>{model.excluded.length === 1 ? 'Γιατί δεν προτείνεται 1 επιλογή;' : `Γιατί δεν προτείνονται ${model.excluded.length} επιλογές;`}</summary><ul>{model.excluded.map(({ view, reasons }) => <li key={view.id}><strong>{view.program.program_name}</strong>{reasons.map(reason => <p key={reason}>{reason}</p>)}
        <button id={`excluded-details-${view.id}`} className="text-button" onClick={() => openDetail(view.id, `excluded-details-${view.id}`)}>Δες τα στοιχεία<span className="sr-only"> {view.program.program_name}</span></button></li>)}</ul></details>}
      <BaselineComparison result={result} />
      <CostScope /><button className="text-button" onClick={onReset}>Νέα σύγκριση</button>
    </>}
    {screen === 'DETAIL' && selected && <>
      <button className="back-link" onClick={() => setScreen(detailOrigin)}>← {detailOrigin === 'COMPARE' ? 'Πίσω στη σύγκριση' : 'Πίσω στα αποτελέσματα'}</button>
      <p className="eyebrow">Λεπτομέρειες προγράμματος</p><p className="provider-label">{selected.program.provider_name}</p><h1 ref={heading} tabIndex={-1}>{selected.program.program_name}</h1>
      <ProgramTags view={selected} noPreference={noPreference} /><ProgramAmount view={selected} />
      <section className="fact-section"><h2>{selected.personal ? 'Γιατί προτείνεται' : selected.total_cents === null ? 'Γιατί δεν υπολογίζεται' : 'Γιατί έχει αυτή τη θέση'}</h2><ul className="reason-list">{selected.reason.map(reason => <li key={reason}>{reason}</li>)}</ul></section>
      <CostBreakdown view={selected} /><DiscountFacts view={selected} /><ProgramTerms view={selected} />
      <BaselineComparison result={result} candidateIds={[selected.id]} />
      <CostScope />
      <button id={`detail-compare-${selected.id}`} className="primary-button full-width" disabled={!selected.charges || model.comparable.length < 2} onClick={() => openCompare(selected.id)}>Σύγκρινε με άλλο πρόγραμμα <span aria-hidden="true">↔</span></button>
      <button className="outline-button trial-entry" onClick={openTrial}>Τι αλλάζει αν…</button>
      {(!selected.charges || model.comparable.length < 2) && <p className="field-help">Η σύγκριση απαιτεί δύο συμβατά προγράμματα με πλήρη δεδομένα.</p>}
    </>}
    {screen === 'COMPARE' && <>
      <button className="back-link" onClick={() => setScreen('LIST')}>← Πίσω στα αποτελέσματα</button>
      <p className="eyebrow">Ίδιες παραδοχές</p><h1 ref={heading} tabIndex={-1}>Σύγκριση δύο προγραμμάτων</h1>
      <p className="comparison-intro">Συγκρίνεις όλα τα συμβατά προγράμματα με τις τιμές του σεναρίου. Η προσωπική σου προτεραιότητα παραμένει: {n ? priorityLabels[n.priority] : 'μη διαθέσιμη'}.</p>
      <div className="pair-selectors">{[0, 1].map(index => <div key={index}><label htmlFor={`pair-${index}`}>{index === 0 ? 'Πρώτο πρόγραμμα' : 'Δεύτερο πρόγραμμα'}</label>
        <select id={`pair-${index}`} value={pair[index] ?? ''} onChange={event => setPair(previous => index === 0 ? [event.target.value, previous[1] ?? ''] : [previous[0] ?? '', event.target.value])}>
          <option value="" disabled>Επίλεξε πρόγραμμα</option>{model.comparable.map(view => <option key={view.id} value={view.id} disabled={pair[1 - index] === view.id}>{view.program.program_name} · {view.program.provider_name}</option>)}
        </select></div>)}</div>
      {pair.length === 2 && pair[0] && pair[1] && <PairFacts result={result} views={[model.programs.find(v => v.id === pair[0])!, model.programs.find(v => v.id === pair[1])!]} labelFor={labelFor} onDetail={id => openDetail(id, `pair-details-${id}`, 'COMPARE')} />}
      <button className="primary-button full-width" onClick={openTrial}>Τι αλλάζει αν…</button>
    </>}
    {screen === 'WHAT_IF' && <WhatIf initial={result} active={trialErrors.length ? null : trialResult ?? result} errors={trialErrors} catalog={catalog}
      draft={trialDraft} range={rangeDraft} pair={trialPair} onDraft={changeTrial} onRange={setRangeDraft} onPair={setTrialPair}
      onBack={() => setScreen('LIST')} onReset={() => { setTrialDraft(createTrialDraft(n!)); setRangeDraft(createRangeDraft(n!)); onResetTrial(); }} />}
    <p className="privacy-note">Φανταστικοί πάροχοι και τιμές · Δεν είναι πραγματικές προσφορές</p>
  </main></div>;
}

