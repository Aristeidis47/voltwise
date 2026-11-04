import { useEffect, useRef, useState } from 'react';
import { answerLabels, buildResultsView, priorityLabels } from '../app/results.ts';
import { approximateRangeDefaults, changedAssumptions, createRangeDraft, createTrialDraft, explainPairMovement, programChanges, readRange, shortcutQuantity, winnerChange } from '../app/trial.ts';
import type { RangeDraft, TrialDraft } from '../app/trial.ts';
import { analyzeWinners, checkRange } from '../domain/analysis.ts';
import { formatExact, formatMoney, fraction, compare } from '../domain/exact.ts';
import type { Answer, Catalog, RecommendationResult, ValidationError } from '../domain/types.ts';
import PairFacts from './PairFacts.tsx';
import { CostBreakdown, DiscountFacts } from './ProgramFacts.tsx';
import BaselineComparison from './BaselineComparison.tsx';

export default function WhatIf({ initial, active, errors, catalog, draft, range, pair, onDraft, onRange, onPair, onBack, onReset }: {
  initial: RecommendationResult; active: RecommendationResult | null; errors: readonly ValidationError[]; catalog: Catalog;
  draft: TrialDraft; range: RangeDraft; pair: readonly string[]; onDraft: (draft: TrialDraft) => void;
  onRange: (draft: RangeDraft) => void; onPair: (pair: readonly string[]) => void; onBack: () => void; onReset: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); window.scrollTo({ top: 0, behavior: 'instant' }); }, []);
  const base = initial.normalized_scenario!;
  const original = buildResultsView(initial, catalog);
  const model = active ? buildResultsView(active, catalog) : null;
  const n = active?.normalized_scenario;
  const label = (id: string) => original.programs.find(p => p.id === id)?.program.program_name ?? id;
  const names = (ids: readonly string[] | null) => ids?.length ? ids.map(label).join(', ') : 'Καμία υπολογίσιμη επιλογή';
  const selected = pair.map(id => model?.programs.find(p => p.id === id));
  const pairReady = selected.length === 2 && pair[0] !== pair[1] && selected.every(p => !!p?.charges);
  const change = active ? winnerChange(initial, active, pair) : null;
  const movementExplanation = active ? explainPairMovement(initial, active, pair) : null;
  const globalChange = active ? winnerChange(initial, active) : null;
  const changes = n ? changedAssumptions(base, n) : [];
  const envelope = active ? analyzeWinners(active) : null;
  const bounds = readRange(base, range);
  const rangeCheck = active && bounds.ok ? checkRange(initial, active, ...bounds.value) : null;
  const relevant = catalog.discount_rules.flatMap(rule => rule.condition_ids);
  const affectedPrograms = catalog.programs.filter(p => p.discount_rule_id !== null).map(p => p.program_name);
  const boundaries = envelope?.status === 'AVAILABLE' ? envelope.boundary_points.filter(point => compare(point.q, fraction(0)) > 0 && compare(point.q, fraction(5000)) < 0) : [];
  const lowerBoundary = n ? boundaries.filter(point => compare(point.q, n.total_kwh_30) < 0).slice(-1)[0] : undefined;
  const upperBoundary = n ? boundaries.find(point => compare(point.q, n.total_kwh_30) > 0) : undefined;
  const options = original.programs.filter(p => p.charges || model?.programs.find(v => v.id === p.id)?.charges || pair.includes(p.id));
  const sliderValue = /^\d+(?:[.,]\d{1,2})?$/.test(draft.quantity_text) ? Math.min(5000, Number(draft.quantity_text.replace(',', '.'))) : 0;
  const precisionNote = approximateRangeDefaults(base, range);
  const summary = !active ? '' : `Δοκιμή ${formatExact(n!.total_kwh_30)} kWh ανά 30 ημέρες. Πρώτα στην κατηγορία σου: ${names(model!.primary.first_program_ids)}. ${pairReady ? `Οικονομικότερο στο ζευγάρι: ${names(change?.after ?? null)}, ${formatMoney(Math.min(selected[0]!.total_cents!, selected[1]!.total_cents!))}.` : 'Το επιλεγμένο ζευγάρι δεν είναι υπολογίσιμο.'}`;
  const [announcement, setAnnouncement] = useState('');
  useEffect(() => {
    if (!summary) { setAnnouncement(''); return; }
    const timer = window.setTimeout(() => setAnnouncement(summary), 450);
    return () => window.clearTimeout(timer);
  }, [summary]);
  return <div className="what-if">
    <p role="status" aria-live="polite" aria-atomic="true" className="sr-only" data-testid="trial-announcement">{announcement}</p>
    <button className="back-link" onClick={onBack}>← Στα αρχικά αποτελέσματα</button>
    <p className="eyebrow">Δοκίμασε τις παραδοχές σου</p><h1 ref={heading} tabIndex={-1}>Τι αλλάζει αν…</h1>
    <p className="comparison-intro">Εσύ επιλέγεις τη χρήση και τους όρους. Δεν προβλέπουμε μελλοντική κατανάλωση ή τιμές.</p>
    <section className="scenario-summary"><p className="mini-label">Αρχικό σενάριο · παραμένει αποθηκευμένο</p>
      <p><strong>{formatExact(base.total_kwh_30)} kWh / 30 ημέρες</strong></p>
      <p className="field-help">{priorityLabels[base.priority]} · Πρώτα: {names(original.primary.first_program_ids)}.</p>
      <p className="field-help">Ηλεκτρονικός λογαριασμός: {answerLabels[base.condition_answers.e_bill]} · Πάγια εντολή: {answerLabels[base.condition_answers.direct_debit]}.</p>
    </section>
    <section className="trial-controls" aria-labelledby="trial-controls-title"><h2 id="trial-controls-title">Το δικό σου δοκιμαστικό σενάριο</h2>
      <div className="trial-live-summary" data-testid="trial-live-summary" aria-hidden="true">{!active ? <><strong>Διόρθωσε τα στοιχεία δοκιμής</strong><span>Τα ποσά και τα όρια έχουν κρυφτεί.</span></> : pairReady ? <><span>Οικονομικότερο στο ζευγάρι · {formatExact(n!.total_kwh_30)} kWh / 30 ημέρες</span><strong>{names(change?.after ?? null)} · {formatMoney(Math.min(selected[0]!.total_cents!, selected[1]!.total_cents!))}</strong></> : <><strong>Δεν υπολογίζεται το επιλεγμένο ζευγάρι</strong><span>Έλεγξε κατανομή ζωνών και επιλογές.</span></>}</div>
      <label htmlFor="trial-kwh">Κατανάλωση δοκιμής (kWh / 30 ημέρες)</label>
      <input id="trial-kwh" type="text" inputMode="decimal" value={draft.quantity_text} aria-describedby="trial-kwh-help trial-errors" aria-invalid={errors.some(e => e.field.includes('kwh'))} onChange={e => onDraft({ ...draft, quantity_text: e.target.value, quantity_override: e.target.value })} />
      <p id="trial-kwh-help" className="field-help">0–5.000 kWh, έως δύο δεκαδικά. Το κενό δεν σημαίνει μηδενική χρήση. Αλλάζει μόνο η δοκιμή.</p>
      <label className="sr-only" htmlFor="trial-slider">Ρύθμιση κατανάλωσης δοκιμής</label>
      <input id="trial-slider" type="range" min="0" max="5000" step="10" value={sliderValue} onChange={e => onDraft({ ...draft, quantity_text: e.target.value, quantity_override: e.target.value })} />
      <div className="trial-shortcuts">{([-1, 1] as const).map(direction => <button key={direction} className="chip-button" disabled={shortcutQuantity(base, direction) === null} onClick={() => { const q = shortcutQuantity(base, direction)!; onDraft({ ...draft, quantity_text: q, quantity_override: q }); }}>{direction === -1 ? '−20%' : '+20%'} της αρχικής χρήσης</button>)}
        <button className="text-button" onClick={() => { const originalDraft = createTrialDraft(base); onDraft({ ...draft, quantity_text: originalDraft.quantity_text, quantity_override: null }); }}>Αρχικές kWh</button></div>
      {shortcutQuantity(base, 1) === null && <p className="field-help">Το +20% είναι ανενεργό επειδή θα ξεπερνούσε τις 5.000 kWh. Δεν περιορίζουμε την τιμή σιωπηρά.</p>}
      {draft.quantity_override === null && <p className="field-help">Χρησιμοποιείται η ακριβής αρχική κανονικοποίηση, πριν από στρογγυλοποίηση εμφάνισης.</p>}
      {base.meter_type === 'DUAL' && <div className="trial-zone">
        <label htmlFor="trial-share">Μερίδιο μειωμένης ζώνης (%)</label>
        <input id="trial-share" type="text" inputMode="decimal" value={draft.share_text} onChange={e => onDraft({ ...draft, share_text: e.target.value, share_override: e.target.value })} aria-describedby="trial-share-help trial-errors" aria-invalid={errors.some(e => e.field.includes('share'))} />
        <label className="sr-only" htmlFor="trial-share-slider">Ρύθμιση μεριδίου μειωμένης ζώνης</label>
        <input id="trial-share-slider" type="range" min="0" max="100" step="1" aria-valuetext={draft.share_text === '' && draft.share_override === null ? 'Άγνωστο μερίδιο — διάλεξε ρητά ποσοστό' : `${draft.share_text}% μειωμένη ζώνη`} value={/^\d+(?:[.,]\d{1,2})?$/.test(draft.share_text) ? Math.min(100, Number(draft.share_text.replace(',', '.'))) : 0} onChange={e => onDraft({ ...draft, share_text: e.target.value, share_override: e.target.value })} />
        <p id="trial-share-help" className="field-help">0–100%. Η αλλαγή kWh κρατά αυτό το μερίδιο σταθερό. {base.reduced_share === null ? 'Δεν έχει δηλωθεί κατανομή για θετική χρήση. Δώσε ρητά ποσοστό για να συγκρίνεις διζωνικές τιμές.' : 'Το αρχικό μερίδιο υπολογίζεται από τις δηλωμένες ζώνες.'}</p>
        <button className="text-button" onClick={() => { const d = createTrialDraft(base); onDraft({ ...draft, share_text: d.share_text, share_override: null }); }}>Επαναφορά αρχικής κατανομής</button>
      </div>}
      {base.meter_type === 'UNKNOWN' && <p className="inline-note">Με άγνωστη μέτρηση συγκρίνονται μόνο ενιαίες τιμές. Διόρθωσε τα αρχικά στοιχεία για αλλαγή τύπου μέτρησης.</p>}
      <div className="trial-conditions">{([['E_BILL', 'e_bill', 'Ηλεκτρονικός λογαριασμός'], ['DIRECT_DEBIT', 'direct_debit', 'Πάγια εντολή']] as const).filter(([id]) => relevant.includes(id)).map(([, key, title]) => <fieldset key={key}><legend>{title}</legend><div className="trial-radio-group">{(['YES', 'NO', 'UNKNOWN'] as const).map((answer: Answer) => <label key={answer}><input type="radio" name={`trial-${key}`} value={answer} checked={draft.answers[key] === answer} onChange={() => onDraft({ ...draft, answers: { ...draft.answers, [key]: answer } })} /><span>{answerLabels[answer]}</span></label>)}</div></fieldset>)}
      <p className="field-help">Επηρεάζουν: {affectedPrograms.join(', ')}. «Δεν γνωρίζω» δεν ενεργοποιεί έκπτωση. Δεν ενεργοποιείται πραγματική υπηρεσία.</p></div>
      <button className="outline-button" onClick={onReset}>Επαναφορά όλης της δοκιμής</button>
    </section>
    <div id="trial-errors">{errors.length > 0 && <div role="alert" className="trial-error"><strong>Δεν υπολογίζεται η δοκιμή</strong>{errors.map((e, i) => <p key={i}>{e.message}</p>)}<p>Διόρθωσε την τιμή για νέα ποσά και όρια. Τα αρχικά αποτελέσματα διατηρούνται.</p></div>}</div>
    {active && n && model && <>
      <section className="trial-outcome"><p className="mini-label">Δοκιμή · {formatExact(n.total_kwh_30)} kWh / 30 ημέρες</p>
        <h2>Πρώτα με την προτεραιότητά σου</h2><p data-testid="trial-global-winner" data-program-ids={model.primary.first_program_ids.join(',')}>{names(model.primary.first_program_ids)}</p>
        <p className="field-help">{globalChange?.status === 'UNCHANGED' ? 'Η πρώτη επιλογή στην κατηγορία σου παραμένει ίδια.' : `Αρχικά: ${names(globalChange?.before ?? null)}. Η σειρά της κατηγορίας σου άλλαξε με τις νέες παραδοχές.`}</p>
        {n.normal_kwh_30 !== null && <p className="field-help">Κανονική: {formatExact(n.normal_kwh_30)} kWh · Μειωμένη: {formatExact(n.reduced_kwh_30!)} kWh. Ίδια κατανομή για όλα τα προγράμματα.</p>}
        {n.allocation_source === 'ASSUMED_SHARE' && <p className="field-help">Υπόθεση κατανομής — δεν είναι μέτρηση ή πρόβλεψη.</p>}
        {changes.length > 0 ? <ul>{changes.map(line => <li key={line}>{line}</li>)}</ul> : <p className="field-help">Ίδιες παραδοχές με το αρχικό σενάριο.</p>}
      </section>
      <details className="trial-analysis"><summary>Αρχική και νέα σειρά με την προτεραιότητά σου</summary><h2>Αρχική σύγκριση</h2><ol className="trial-ranking">{original.ranked.map(({ entry, view }) => <li key={view.id}><span>{entry.dense_rank}. {label(view.id)}</span><strong>{formatMoney(view.total_cents!)} / 30 ημέρες</strong></li>)}</ol><h2>Δοκιμή</h2><ol className="trial-ranking">{model.ranked.map(({ entry, view }) => <li key={view.id} data-trial-ranked={view.id} data-cents={view.total_cents}><span>{entry.dense_rank}. {label(view.id)}</span><strong>{formatMoney(view.total_cents!)} / 30 ημέρες</strong>{entry.tied_program_ids.length > 1 && <small>Ίδιο κόστος στην ακρίβεια εμφάνισης</small>}</li>)}</ol></details>
      {n.current_contract?.identity_status === 'EXACT_DEMO' && <BaselineComparison result={active} />}
      <section className="fact-section"><h2>Σύγκριση δύο στη δοκιμή</h2><p className="field-help">Ο οικονομικότερος στο ζευγάρι μπορεί να διαφέρει από τον πρώτο όλης της κατηγορίας σου.</p>
        <div className="pair-selectors">{[0, 1].map(index => <div key={index}><label htmlFor={`trial-pair-${index}`}>{index === 0 ? 'Πρώτο πρόγραμμα δοκιμής' : 'Δεύτερο πρόγραμμα δοκιμής'}</label><select id={`trial-pair-${index}`} value={pair[index] ?? ''} onChange={e => onPair(index === 0 ? [e.target.value, pair[1] ?? ''] : [pair[0] ?? '', e.target.value])}><option value="" disabled>Επίλεξε πρόγραμμα</option>{options.map(v => <option key={v.id} value={v.id} disabled={pair[1 - index] === v.id}>{v.program.program_name}</option>)}</select></div>)}</div>
        <div className="winner-change" data-testid="winner-change" data-status={change?.status}>
          <strong>{change?.status === 'UNCHANGED' ? 'Δεν αλλάζει ο οικονομικότερος του ζευγαριού' : change?.status === 'BECAME_TIE' ? 'Οι δύο επιλογές ισοφαρίζουν στην ακρίβεια εμφάνισης' : change?.status === 'LEFT_TIE' ? 'Η αρχική ισοπαλία έληξε' : change?.status === 'CHANGED' ? 'Άλλαξε ο οικονομικότερος του ζευγαριού' : 'Δεν τεκμηριώνεται σύγκριση πριν και μετά'}</strong>
          <p>Αρχικά: {names(change?.before ?? null)} → Δοκιμή: {names(change?.after ?? null)}.</p>
          {movementExplanation && <p>{movementExplanation}</p>}
          {programChanges(initial, active, pair).map(p => <p key={p.id}>{label(p.id)}: {p.before === null ? 'μη υπολογίσιμο αρχικά' : formatMoney(p.before)} → {p.after === null ? 'μη υπολογίσιμο στη δοκιμή' : formatMoney(p.after)} / 30 ημέρες.{p.delta !== null && ` ${p.delta === 0 ? 'Καμία μεταβολή.' : `${p.delta > 0 ? 'Αύξηση' : 'Μείωση'} κατά ${formatMoney(Math.abs(p.delta))} στο ίδιο πρόγραμμα.`}`}</p>)}
          {selected.filter(v => v?.discount_rule && v.charges).map(v => <p key={v!.id}>{label(v!.id)}: {v!.evaluation.discount_evaluation?.status === 'APPLIED' ? 'όλοι οι όροι επιβεβαιώθηκαν· χρησιμοποιείται η μειωμένη τιμή αντί της βασικής.' : 'δεν επιβεβαιώνονται όλοι οι όροι· χρησιμοποιείται η βασική τιμή, χωρίς έκπτωση.'}</p>)}
          <p className="field-help">Ενέργεια = kWh × ενεργή τιμή κάθε ζώνης· προστίθεται μία φορά το πάγιο. Οι παρακάτω αναλύσεις δείχνουν τις τιμές και αν πληρούνται οι όροι. Οι διαφορές αφορούν το ίδιο πρόγραμμα πριν και μετά, όχι όφελος αλλαγής συμβολαίου.</p>
        </div>
        {pairReady ? <><PairFacts result={active} views={[selected[0]!, selected[1]!]} labelFor={label} />{selected.map(view => <details className="trial-breakdown" key={view!.id}><summary>Αναλυτικά: {label(view!.id)}</summary><CostBreakdown view={view!} /><DiscountFacts view={view!} /></details>)}</>
          : <div className="inline-note" data-testid="trial-unavailable">Δεν υπάρχουν δύο συμβατά, υπολογίσιμα προγράμματα. Δεν εμφανίζεται σημείο ισοφάρισης.{selected.filter(Boolean).map(v => !v!.charges && <p key={v!.id}>{label(v!.id)}: {v!.reason.join(' ')}</p>)}</div>}
      </section>
      <details className="trial-analysis"><summary>Πότε αλλάζει ο πρώτος της κατηγορίας σου;</summary><p className="field-help">{priorityLabels[base.priority]}. Ακριβείς μαθηματικές ισότητες πριν από στρογγυλοποίηση, με αμετάβλητους όρους και κατανομή. Τα άκρα εμφάνισης είναι στρογγυλοποιημένα.</p>
        {envelope?.status === 'AVAILABLE' ? <><p>Πλησιέστερη αλλαγή προς λιγότερη χρήση: {lowerBoundary ? `περίπου ${formatExact(lowerBoundary.q)} kWh — ${names(lowerBoundary.raw_winner_ids)} στο όριο.` : 'δεν υπάρχει μέσα στο εύρος του demo.'}</p><p>Πλησιέστερη αλλαγή προς περισσότερη χρήση: {upperBoundary ? `περίπου ${formatExact(upperBoundary.q)} kWh — ${names(upperBoundary.raw_winner_ids)} στο όριο.` : 'δεν υπάρχει μέσα στο εύρος του demo.'}</p>{envelope.intervals.map((interval, i) => <p key={i}>Μεταξύ {formatExact(interval.lower)} και {formatExact(interval.upper)} kWh / 30 ημέρες: {names(interval.raw_winner_ids)}.</p>)}{envelope.boundary_points.filter(point => point.raw_winner_ids.length > 1).map((point, i) => <p key={i}>Ισότητα περίπου στις {formatExact(point.q)} kWh: {names(point.raw_winner_ids)}.</p>)}{boundaries.length === 0 && <p>Δεν αλλάζει η οικονομικότερη επιλογή μεταξύ 0 και 5.000 kWh / 30 ημέρες με αυτούς τους όρους demo.</p>}</> : <p>Δεν υπολογίζονται όρια χωρίς υποστηριζόμενο γραμμικό μοντέλο και γνωστή κατανομή για θετική διζωνική χρήση.</p>}
      </details>
      <details className="trial-analysis"><summary>Αντέχει η αρχική επιλογή σε ένα εύρος χρήσης;</summary><p className="field-help">Επιλέγεις όρια, όχι διάστημα πρόβλεψης. Αρχικά: −20% έως +20% της αρχικής χρήσης. {shortcutQuantity(base, 1) === null ? 'Το πάνω όριο περιορίστηκε στις 5.000 kWh.' : ''} Η δοκιμή κρατά τους τωρινούς όρους και την κατανομή σταθερά.</p>
        {compare(base.total_kwh_30, fraction(0)) === 0 && <p className="field-help">Το αρχικό εύρος 0–0 εξετάζει μόνο το μηδέν. Άλλαξε τα όρια για ουσιαστικό έλεγχο χρήσης.</p>}
        <p className="field-help">Ο έλεγχος χρησιμοποιεί μη στρογγυλοποιημένα ποσά. Μια ισοπαλία εμφάνισης σε λεπτά μπορεί να μην παραμένει ακριβής ισότητα.</p>
        <div className="range-fields">{(['lower', 'upper'] as const).map(key => <div key={key}><label htmlFor={`range-${key}`}>{key === 'lower' ? 'Κάτω όριο (kWh)' : 'Πάνω όριο (kWh)'}</label><input id={`range-${key}`} inputMode="decimal" type="text" value={range[`${key}_text`]} aria-invalid={!bounds.ok} aria-describedby={!bounds.ok ? 'range-error' : precisionNote ? 'range-precision' : undefined} onChange={e => onRange({ ...range, [`${key}_text`]: e.target.value, [`${key}_override`]: e.target.value })} /></div>)}</div>
        {precisionNote && <><p className="field-help" id="range-precision" data-testid="range-precision">{precisionNote}</p><button className="text-button" onClick={() => onRange({ ...range, lower_override: range.lower_text, upper_override: range.upper_text })}>Χρήση των εμφανιζόμενων ορίων</button></>}
        {bounds.ok && compare(bounds.value[0], bounds.value[1]) === 0 && <p className="inline-note" data-testid="range-single-point">Τα δύο όρια είναι ίδια: ελέγχεται μόνο αυτό το σημείο, όχι εύρος κατανάλωσης.</p>}
        {!bounds.ok ? <p id="range-error" role="alert">{bounds.errors[0]?.message}</p> : rangeCheck?.status === 'AVAILABLE' ? rangeCheck.checks.map(check => <p key={check.program_id}>{label(check.program_id)}: {check.status === 'REMAINS_MINIMUM' ? 'παραμένει οικονομικότερο (ενδεχομένως ισότιμα) σε όλο το επιλεγμένο εύρος.' : check.status === 'NOT_ELIGIBLE' ? 'δεν είναι πλέον επιλέξιμο με αυτές τις παραδοχές.' : 'δεν παραμένει οικονομικότερο σε όλο το επιλεγμένο εύρος.'}</p>) : <p data-testid="range-not-computable">Δεν μπορεί να τεκμηριωθεί συμπέρασμα για αυτό το εύρος με τα διαθέσιμα δεδομένα.{rangeCheck?.status === 'NEEDS_EXPLICIT_SHARE' ? ' Δήλωσε πρώτα κατανομή ζωνών· μια μη υπολογίσιμη διζωνική επιλογή δεν αγνοείται στην απόδειξη.' : ''}</p>}
        <button className="text-button" onClick={() => onRange(createRangeDraft(base))}>Αρχικό εύρος</button>
      </details>
    </>}
  </div>;
}
