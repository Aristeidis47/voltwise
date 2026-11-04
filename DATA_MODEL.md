# VoltWise — Μοντέλο δεδομένων

Έκδοση 1.6 · 03/11/2026 · Συνοδεύει το PROJECT_SPEC.md v1.7.

Στην ανασκόπηση προστέθηκε `PairComparison.global_comparison_status`, χωριστά από τη δυνατότητα υπολογισμού του συγκεκριμένου ζεύγους. Απαιτείται ρητό μερίδιο για συνολικές αποδείξεις με έγκυρη διζωνική υποψηφιότητα. Τα αρχικά και δοκιμαστικά δεδομένα μένουν αμετάβλητα κατά την ακύρωση επεξεργασίας: η ResultsFlow διατηρείται ανενεργή/κρυφή χωρίς διπλό ενεργό main ID, μέχρι ακύρωση ή νέα υποβολή. Δεν προστέθηκαν τιμές, forecast ή πεδία καθαρού οφέλους.

Προδιαγραφή δεδομένων, χωρίς υλοποίηση ή UI. Διατηρεί τον κατάλογο DEMO-1 και τις αποφάσεις του PROJECT_SPEC.md. Οι κανόνες εκτέλεσης ορίζονται στο [RECOMMENDATION_RULES.md](RECOMMENDATION_RULES.md), οι πλήρεις τιμές στο [DEMO_PROGRAMS.md](DEMO_PROGRAMS.md) και οι αναμενόμενες έξοδοι στο [VERIFIED_EXAMPLES.md](VERIFIED_EXAMPLES.md).

## 1. Τύποι, μονάδες και κοινές συμβάσεις

| Τύπος | Ακριβής σημασία |
| --- | --- |
| ID / Revision | Μη κενό αναγνωριστικό κειμένου. Οι αναφορές απαιτούν ακριβή αντιστοίχιση ID και έκδοσης, όχι μόνο ονόματος παρόχου. |
| InputKWh | Ακριβής μη αρνητικός δεκαδικός, έως δύο δεκαδικά, 0–50.000 για το σύνολο περιόδου. Αποθήκευση σε κανονική δεκαδική μορφή με τελεία, χωρίς διαχωριστή χιλιάδων. |
| InputShare | Ρητό ποσοστό 0–100, έως δύο δεκαδικά. Μετατρέπεται σε ακριβές κλάσμα s = ποσοστό/100. Δεν είναι πιθανότητα. |
| Exact | Ακριβής ρητός αριθμός, νοητά αριθμητής/θετικός παρονομαστής σε ανάγωγη μορφή. Για q = 30/7 δεν αντικαθίσταται από 4,29 πριν από τον υπολογισμό. Δεν απαιτείται συγκεκριμένη βιβλιοθήκη σε αυτό το στάδιο. |
| Rate | Ακριβής μη αρνητικός δεκαδικός σε €/kWh, έως έξι δεκαδικά. Στο DEMO-1 οι βασικές τιμές έχουν τρία δεκαδικά. |
| MoneyCents | Ακέραια λεπτά ευρώ. Χρεώσεις μη αρνητικές· διαφορές/διορθώσεις στρογγυλοποίησης μπορούν να έχουν πρόσημο. |
| Answer | YES, NO, UNKNOWN. Το UNKNOWN είναι απάντηση, όχι ελλείπον πεδίο. |
| null | Δεν υπάρχει ή δεν εφαρμόζεται. Δεν ισούται με 0, NO, μηδενική ρήτρα ή δωρεάν πρόγραμμα. |

Νόμισμα EUR, κοινή περίοδος 30 ημέρες, ποσά χωρίς ΦΠΑ. Ο τελικός αριθμητικός έλεγχος δεν βασίζεται σε δυαδικά floating-point κατά προσέγγιση. Στρογγυλοποίηση χρημάτων: πλησιέστερο λεπτό, μισό προς τα πάνω. Οι αρνητικές διαφορές προκύπτουν αφαιρώντας ήδη στρογγυλοποιημένα ποσά σε λεπτά.

Η είσοδος δέχεται κόμμα ή τελεία ως δεκαδικό σημείο και κανονικοποιείται πριν επικυρωθεί. Δεν αποδέχεται δύο διαφορετικούς διαχωριστές, χιλιάδες, εκθετική γραφή ή μη πεπερασμένους αριθμούς. Το όριο των δύο δεκαδικών αποφεύγει αμφίσημες καταχωρίσεις όπως «1.000»· για χίλιες kWh ζητείται «1000».

## 2. UserScenario — υποβληθέν προφίλ χρήστη

| Πεδίο | Τύπος / απαιτείται | Κανόνας |
| --- | --- | --- |
| scenario_id | ID, ναι | Αναγνωριστικό μέσα στη συνεδρία. |
| revision | Θετικός ακέραιος, ναι | Αλλάζει σε νέα υποβολή στοιχείων. |
| purpose | EXISTING_SUPPLY ή NEW_SUPPLY, ναι | Υπάρχον συμβόλαιο / νέα παροχή. |
| consumption_source | BILL_MANUAL, INDICATIVE ή DEMO_SAMPLE, ναι | Η προέλευση δεν πιστοποιεί την ακρίβεια του χρήστη. DEMO_SAMPLE μόνο αν ενεργοποιηθεί το προαιρετικό δείγμα. |
| indicative_preset | KWH_150, KWH_300, KWH_600, CUSTOM ή null | Μόνο όταν source = INDICATIVE. Δεν υπάρχει αυτόματη επιλογή. |
| meter_type | SINGLE, DUAL ή UNKNOWN, ναι | Δεν συνάγεται από τιμολόγιο ή πάροχο. |
| consumption | ConsumptionInput, ναι | Ένα από τα επιτρεπόμενα σχήματα της §3. |
| priority | LOWEST_SCENARIO_COST, FIXED_RATE ή NO_CLEAR_PREFERENCE, ναι | Η προτεραιότητα επιλέγει κύριο αποτέλεσμα, χωρίς κρυφά βάρη. |
| condition_answers | ConditionAnswers, ναι | e_bill και direct_debit, σύμφωνα με §5. |
| current_contract | ContractReference ή null | Μόνο για EXISTING_SUPPLY· στη νέα παροχή είναι πάντα null. |
| catalog_revision | Revision, ναι | DEMO-1 στο βασικό demo. |

Δεν υπάρχουν στοιχεία ταυτότητας, διεύθυνση, αριθμός παροχής, email ή τραπεζικά δεδομένα. Ελλιπής φόρμα είναι draft, όχι έγκυρο UserScenario. Όλα τα υποβληθέντα πεδία Answer απαιτούν ρητή απάντηση, ακόμη και UNKNOWN. Η συνεδρία δεν αποθηκεύεται σε backend ή μόνιμο προφίλ.

## 3. ConsumptionInput — αρχική κατανάλωση

Κοινό πεδίο `period_days`: ακέραιος 1–366. Για INDICATIVE είναι ακριβώς 30. Όλες οι ποσότητες μιας εγγραφής αφορούν τις ίδιες ημέρες.

| quantity_mode | Εισαγόμενα πεδία | Επιτρεπόμενο πλαίσιο |
| --- | --- | --- |
| TOTAL | total_kwh: InputKWh | SINGLE ή UNKNOWN. Επίσης DUAL με άγνωστη κατανομή. normal_kwh, reduced_kwh, reduced_share_percent είναι null. |
| SPLIT | normal_kwh και reduced_kwh: InputKWh | Μόνο DUAL. total_kwh είναι παράγωγο άθροισμα, όχι τρίτη ανεξάρτητη είσοδος. reduced_share_percent = null. |
| TOTAL_AND_SHARE | total_kwh: InputKWh, reduced_share_percent: InputShare | Μόνο DUAL σε INDICATIVE. Κανονική/μειωμένη κατανάλωση παράγονται, δεν εισάγονται ταυτόχρονα. |

Πρόσθετο πεδίο `allocation_source`: NOT_APPLICABLE για SINGLE/UNKNOWN, UNKNOWN για DUAL/TOTAL, REPORTED_SPLIT για DUAL/SPLIT, ASSUMED_SHARE για DUAL/TOTAL_AND_SHARE. Αντιφατικοί συνδυασμοί απορρίπτονται, δεν επιλέγεται αυθαίρετα ένα πεδίο ως πιο αξιόπιστο.

Το άθροισμα περιόδου δεν υπερβαίνει τις 50.000 kWh. Σε SPLIT δεν απαιτείται κάθε ζώνη να είναι θετική. Το 0 + 0 είναι γνωστή μηδενική κατανομή στο συγκεκριμένο σημείο, αλλά δεν ορίζει μερίδιο για θετική μελλοντική Δοκιμή.

## 4. NormalizedScenario και TrialScenario — παράγωγα δεδομένα

### 4.1 NormalizedScenario

| Πεδίο | Τύπος / σημασία |
| --- | --- |
| scenario_id, scenario_revision | Αναφορά στο υποβληθέν προφίλ. |
| purpose | EXISTING_SUPPLY ή NEW_SUPPLY, ώστε οι επεξηγήσεις baseline/ρήτρας να αφορούν μόνο τις σχετικές περιπτώσεις. |
| state_id | ID Αρχικής σύγκρισης ή Δοκιμής. Αποτρέπει σύγχυση παλιών/νέων αποτελεσμάτων. |
| reference_days | Πάντα 30. |
| original_period_days, original_total_kwh | Ακριβής προέλευση· δεν αντικαθίστανται από τη νέα q. |
| total_kwh_30 | Exact, q = 30Q/d, 0–5.000. |
| normal_kwh_30, reduced_kwh_30 | Exact ή null. Υπάρχουν μόνο για γνωστή κατανομή DUAL. |
| reduced_share | Exact στο [0,1] ή null. Σε SPLIT με Q > 0 είναι Qμ/Q. Με Q = 0 είναι null, εκτός αν δόθηκε ρητό μερίδιο. |
| allocation_source | Η προέλευση της ενεργής κατανομής, ποτέ σιωπηρά «μετρημένη» για μια υπόθεση. |
| meter_type, priority, condition_answers | Αντίγραφα των ενεργών παραδοχών. |
| normalization_label | Αριθμητικά τεκμήρια Q, d και q· η λεκτική μορφή παράγεται, δεν είναι ανεξάρτητη πηγή τιμών. |

### 4.2 TrialScenario

| Πεδίο | Τύπος / κανόνας |
| --- | --- |
| trial_id, base_scenario_id, base_revision | Αναφορές στην αμετάβλητη Αρχική σύγκριση. |
| total_kwh_30_override | Δεκαδικός 0–5.000 έως δύο δεκαδικά ή null. null σημαίνει διατήρηση της ακριβούς αρχικής q. |
| reduced_share_override_percent | InputShare ή null. Μόνο με meter_type = DUAL. Ρητή υπόθεση, ακόμη και αν αρχικά ήταν άγνωστη η κατανομή. |
| condition_answers | Πλήρες ζεύγος Answer για τη Δοκιμή, αρχικά αντίγραφο της Αρχικής. |
| range_lower_kwh_30, range_upper_kwh_30 | Ακριβή αριθμητικά άκρα στο [0,5.000], L ≤ U. Αρχικά 0,8q και 1,2q, περιορισμένα εμφανώς στο εύρος του demo. Η παράγωγη αρχική ακρίβεια δεν κόβεται σιωπηρά σε δύο δεκαδικά. |
| modified_fields | Παράγωγο σύνολο ονομάτων πεδίων που διαφέρουν από την Αρχική. |

Στην ενεργή Δοκιμή ισχύει το explicit share override, αλλιώς το αρχικό γνωστό share. Η αύξηση q από μηδέν χωρίς share δεν δημιουργεί κατανομή. Το meter_type και η priority αλλάζουν μόνο με νέα βασική υποβολή, όχι ως κρυφά overrides.

## 5. ConditionAnswers και DiscountRule

ConditionAnswers: ακριβώς δύο πεδία `e_bill: Answer` και `direct_debit: Answer`. Η σημασία τους είναι «δέχομαι τον όρο για αυτό το σενάριο», όχι ενεργοποίηση τραπεζικής υπηρεσίας ή απόδειξη παλιάς έκπτωσης.

| Πεδίο DiscountRule | Τύπος / κανόνας |
| --- | --- |
| discount_id | ID, π.χ. C1_EBILL_AND_DD. |
| revision | Revision, DEMO-1. |
| applies_to | ENERGY_RATE μόνο στο HW1. Δεν αλλάζει πάγιο. |
| condition_ids | Λίστα από E_BILL, DIRECT_DEBIT. Για C1 περιλαμβάνει και τα δύο. |
| match_mode | ALL. Κάθε απαιτούμενο πεδίο πρέπει να είναι YES. |
| effect_type | REPLACE_RATE. Ακριβής τιμή αντικατάστασης, όχι ποσοστό που προστίθεται σε άλλες εκπτώσεις. |
| replacement_rates | Ίδιο σχήμα ζωνών με το προϊόν. Για C1 unified = 0,100. |
| failure_behavior | KEEP_BASE_RATE. Η άρνηση/άγνοια δεν καταργεί το πρόγραμμα. |
| stacking | NONE. Το πολύ ένας κανόνας ανά προϊόν στο HW1. |
| explanation | Περιγραφή ανθρώπινα αναγνώσιμη, σύμφωνη με τα πεδία. |

DiscountEvaluation ως παράγωγο: discount_id, status APPLIED / NOT_MET / UNCONFIRMED, condition_evaluations ανά όρο, unmet_condition_ids, unknown_condition_ids, effective_rates. Αν συνυπάρχουν NO και UNKNOWN, status = NOT_MET, αλλά αναφέρονται και οι δύο αιτίες. Αν δεν υπάρχει κανόνας, status = NOT_APPLICABLE και discount_id = null. Δεν υπάρχουν AND/OR ερμηνείες ελεύθερου κειμένου.

## 6. Catalog και Program — δεδομένα προγραμμάτων

Catalog: catalog_id = VOLTWISE_FICTIONAL, revision = DEMO-1, currency = EUR, reference_days = 30, is_demo = true, is_real_offer = false, notice = «Φανταστικά δεδομένα για εκπαιδευτικό demo — δεν είναι πραγματικές προσφορές», programs = οι πέντε εγγραφές. Δεν υπάρχει ημερομηνία «ενημέρωσης αγοράς».

| Πεδίο Program | Τύπος / περιορισμός |
| --- | --- |
| calculation_model | Υποχρεωτικό LINEAR_V1. Μόνο πάγιο + γραμμική τιμή ενέργειας με σταθερούς όρους και μερίδιο. Άλλο μοντέλο αποκλείεται. |
| program_id | Μοναδικό A1, A2, B1, C1 ή D1. |
| program_revision | DEMO-1. |
| provider_id, provider_name, program_name | Ακριβή ονόματα του DEMO-1. Ο provider_id δεν αρκεί για baseline. |
| is_demo, is_real_offer | true, false σε κάθε εγγραφή, όχι μόνο στην κεφαλίδα. |
| currency, reference_days, vat_included | EUR, 30, false. |
| price_type | FIXED ή VARIABLE_SNAPSHOT. |
| fixed_rate_months | 12 για FIXED, null για VARIABLE_SNAPSHOT. Διάρκεια demo όρων, όχι forecast. |
| minimum_commitment_months | 12 για τα σταθερά demo, 0 για B1. Δεν συνεπάγεται από μόνο του ρήτρα. |
| price_reference | DEMO_FIXED_TERMS ή DEMO_SNAPSHOT_1. Δεν αναφέρεται πραγματικός μήνας αγοράς. |
| pricing_basis | UNIFIED ή DUAL_ZONE. |
| supported_meters | SINGLE, DUAL, UNKNOWN για UNIFIED· μόνο DUAL για DUAL_ZONE. |
| requires_allocation | false για UNIFIED, true για DUAL_ZONE. |
| fixed_fee_cents_30 | MoneyCents, ακριβώς ανά 30 ημέρες. |
| base_rates | UNIFIED: unified_rate και null zone rates. DUAL_ZONE: normal_rate, reduced_rate και null unified_rate. |
| discount_rule_id | C1_EBILL_AND_DD μόνο για C1, αλλιώς null. |
| terms_revision | DEMO-1/ID/TERMS-1, όπου ID το program_id. |
| exit_fee_terms | FeeEvidence, ρητά KNOWN_ZERO από τους συγκεκριμένους demo όρους. |
| activation_fee_cents, deposit_cents | 0, 0 σύμφωνα με τους κατασκευασμένους όρους. Δεν προστίθενται στο επαναλαμβανόμενο κόστος. |

Μη συμβατή δομή, άγνωστο discount_rule_id, διπλό program_id, ελλείπουσα ή αρνητική τιμή, λανθασμένη μονάδα/νόμισμα/περίοδος καθιστούν την εγγραφή μη υπολογίσιμη. Δεν μετατρέπονται σε 0. Δεν υπάρχουν ωριαίες τιμές, κλίμακες, δώρα ή φόροι σε αυτό το μοντέλο.

Η runtime επικύρωση Program, Rates και DiscountRule είναι κλειστή ως προς τα πεδία τους. Πρόσθετα πεδία όπως tiers ή minimum_kwh απορρίπτονται αντί να αγνοούνται. Το LINEAR_V1 είναι επιπλέον μεταδεδομένο υποστήριξης, χωρίς αλλαγή τιμών ή έκδοσης τιμολογιακών όρων DEMO-1.

## 7. ContractReference και FeeEvidence — σημερινό συμβόλαιο

Το ContractReference δεν είναι νέα φόρμα πραγματικού συμβολαίου. Στο HW1 δημιουργείται μόνο από ακριβή επιλογή demo προγράμματος. Οι παρακάτω καταστάσεις επιτρέπουν επίσης ασφαλή απόκριση σε ελλιπή δεδομένα.

| Πεδίο | Τύπος / σημασία |
| --- | --- |
| identity_status | EXACT_DEMO ή UNAVAILABLE. Στη δεύτερη περίπτωση pricing_data_status = INCOMPLETE και οι αναφορές προϊόντος/έκδοσης/όρων είναι null. |
| program_id, program_revision, terms_revision | Συμπληρωμένα και επιλυμένα στην ίδια γνωστή έκδοση για EXACT_DEMO, αλλιώς null. |
| pricing_data_status | COMPLETE ή INCOMPLETE. COMPLETE απαιτεί γνωστά πάγιο, τιμές, εκπτώσεις και τους όρους τους μέσω των παραπάνω αναφορών. |
| evidence_scope | FICTIONAL_SCENARIO. Δεν είναι επαλήθευση πραγματικού συμβολαίου. |
| exit_fee_evidence | FeeEvidence. Ανεξάρτητη πληρότητα από τις επαναλαμβανόμενες τιμές. |

FeeEvidence έχει ακριβώς τέσσερα πεδία: `status = KNOWN_ZERO / KNOWN_AMOUNT / UNKNOWN`, `amount_cents: MoneyCents ή null`, `evidence_reference: μη κενό κείμενο ή null`, `unknown_reason: CONTRACT_NOT_IDENTIFIED / TERMS_NOT_VERIFIED / AMOUNT_NOT_PROVIDED / AMOUNT_NOT_RESOLVED_FOR_CASE ή null`.

- KNOWN_ZERO: amount_cents = 0, evidence_reference μη null και unknown_reason = null. Δεν συμπεραίνεται από κενό πεδίο ή από λήξη που δεν γνωρίζουμε.
- KNOWN_AMOUNT: amount_cents > 0, evidence_reference μη null και unknown_reason = null. Η πηγή αφορά το ποσό που ισχύει στη συγκεκριμένη περίπτωση. Αόριστο «έως Χ €» ή μη επιλυμένος κλιμακωτός πίνακας δεν αρκεί.
- UNKNOWN: amount_cents = null και unknown_reason υποχρεωτικό. evidence_reference μπορεί να παραμένει null ή να δείχνει την ασαφή πηγή που δεν επιλύει το ποσό. Δεν επιτρέπεται υπολογισμός ρήτρας, χρόνου απόσβεσης ή καθαρού οφέλους.

Ο αρχικός κατάλογος έχει KNOWN_ZERO για όλα τα demo προϊόντα. Ελεγχόμενα παραδείγματα αβεβαιότητας δεν αλλάζουν αυτή την ιδιότητα του καταλόγου. Ακόμη και με KNOWN_AMOUNT, στο HW1 το ποσό θα αναφέρεται χωριστά ως εφάπαξ συμβατική πληροφορία· δεν υλοποιείται συνολική ανάλυση αλλαγής. Δεν υπάρχει πεδίο «πραγματική εξοικονόμηση» με συμπληρωμένη τιμή.

## 8. ProgramEvaluation — αποτέλεσμα ανά πρόγραμμα

| Πεδίο | Τύπος / περιεχόμενο |
| --- | --- |
| program_id, program_revision, state_id | Σύνδεση με πρόγραμμα και ενεργό σενάριο. |
| comparability_status | COMPARABLE, INVALID_PROGRAM_DATA ή INCOMPATIBLE_INPUT. |
| reason_codes | Λίστα συγκεκριμένων αιτιών, π.χ. METER_NOT_DUAL, ALLOCATION_UNKNOWN, MISSING_RATE. |
| discount_evaluation | Το αποτέλεσμα της §5 ή null αν δεν είναι υπολογίσιμο. |
| effective_rates | Οι τιμές που πράγματι χρησιμοποιήθηκαν ή null. |
| energy_lines | Λίστα EnergyLine: zone UNIFIED/NORMAL/REDUCED, quantity_kwh_30 Exact, rate Rate, amount_exact_eur Exact, amount_cents στρογγυλοποιημένο. |
| energy_total_exact_eur | Άθροισμα μη στρογγυλοποιημένων energy_lines. |
| energy_total_cents | Στρογγυλοποίηση του προηγούμενου αθροίσματος μία φορά. |
| energy_rounding_adjustment_cents | energy_total_cents − άθροισμα amount_cents των γραμμών. Προβάλλεται αν μη μηδενικό. |
| fixed_fee_cents_30 | Το πάγιο, χωριστά από ενέργεια. |
| total_exact_eur | Ακριβής ενέργεια + πάγιο. |
| total_cents | energy_total_cents + fixed_fee_cents_30. Ισοδύναμο με στρογγυλοποίηση total_exact_eur, επειδή το πάγιο είναι ακέραια λεπτά. |
| base_price_counterfactual_cents | Κόστος με βασική τιμή και ίδιες kWh. Δεν είναι παλιός λογαριασμός. |
| discount_effect_cents | base_price_counterfactual_cents − total_cents. Η επίδραση της έκπτωσης, όχι εξοικονόμηση αλλαγής. |
| baseline_comparison_status | AVAILABLE, NO_EXACT_CONTRACT, INCOMPLETE_CONTRACT ή BASELINE_NOT_COMPUTABLE. |
| baseline_difference_cents | MoneyCents ή null. baseline.total_cents − program.total_cents. |
| explanation_facts | Παραδοχές, τύπος τιμής, διάρκεια, συνιστώσες, όροι και αιτίες· όχι ανεξάρτητη αριθμητική βαθμολογία. |

Όταν δεν είναι COMPARABLE, όλα τα ποσά και οι τιμές υπολογισμού είναι null, όχι 0. Μια εγγραφή μπορεί να είναι COMPARABLE αλλά εκτός κατηγορίας σταθερής τιμής. Η διαφορά από baseline δεν επηρεάζει την κατάταξη.

## 9. RecommendationResult — κατηγορίες και συνολικό αποτέλεσμα

| Πεδίο | Τύπος / σημασία |
| --- | --- |
| result_id, state_id, scenario_revision, catalog_revision | Ακριβής ταυτότητα αναπαραγωγής. |
| status | READY, INVALID_INPUT, INVALID_CATALOG ή NO_COMPARABLE_PROGRAMS. |
| normalized_scenario | Το κοινό πλαίσιο ποσότητας/ημερών/όρων. |
| validation_errors | Πεδίο, κωδικός και συγκεκριμένη αιτία. Κενό όταν READY. |
| evaluations | Όλες οι ProgramEvaluation, μαζί με τις μη υπολογίσιμες. |
| cheapest_category | CategoryResult για CHEAPEST_SCENARIO. |
| fixed_category | CategoryResult για FIXED_RATE. |
| primary_category | FIXED_RATE αν priority = FIXED_RATE, αλλιώς CHEAPEST_SCENARIO. |
| category_relation | SAME_FIRST_SET, OVERLAPPING_FIRST_SETS, DIFFERENT_FIRST_SETS, ONE_CATEGORY_EMPTY, BOTH_EMPTY ή NOT_EVALUATED. Σύγκριση συνόλων ID, όχι μόνο της πρώτης γραμμής. Η τελευταία τιμή αφορά άκυρη είσοδο/κατάλογο χωρίς εκτέλεση σύγκρισης. |
| baseline_evaluation | Ανεξάρτητη αξιολόγηση ακριβούς τρέχοντος demo συμβολαίου ή null. Δεν απαιτείται να ανήκει στην κύρια κατηγορία. |
| switching_assessment | status = NOT_CALCULATED_HW1, net_savings_cents = null, exit_fee_evidence και αιτίες/όρια. |
| notices | Υποχρεωτική ένδειξη demo, πεδίο κόστους, snapshot-only όπου εφαρμόζεται, άγνωστη κατανομή/ρήτρα όπου υπάρχει. |

CategoryResult: category_id, status AVAILABLE / EMPTY / NOT_EVALUATED, ranked_entries, first_program_ids, exclusion_reasons. Κάθε ranked entry περιέχει program_id, total_cents, dense_rank, tied_program_ids. Οι ίδιες χρεώσεις δεν υπολογίζονται δεύτερη φορά ανά κατηγορία. INVALID_INPUT ή INVALID_CATALOG δίνει NOT_EVALUATED, όχι EMPTY που θα υπονοούσε έγκυρη σύγκριση.

Οι θέσεις είναι πυκνές: 1, 1, 2. Μέσα σε ισοβαθμία ID σε αύξουσα σταθερή σειρά· δεν υπάρχει μοναδικός νικητής εξαιτίας αυτής της σειράς. Οι κωδικοί EXCLUDED_VARIABLE_RATE, METER_NOT_DUAL κ.λπ. διατηρούν το επίπεδο της αιτίας: διαφορετική προτίμηση, ασύμβατα στοιχεία ή ελλιπή δεδομένα.

## 10. Αναλυτικά αποτελέσματα σεναρίων

| Οντότητα | Υποχρεωτικά πεδία |
| --- | --- |
| PairComparison | state_id, category_id, δύο program IDs, σταθερές παραδοχές, coefficients F/a, difference_cents = κόστος πρώτου ID μείον κόστος δεύτερου ID σε λεπτά, intersection_status, intersection_kwh Exact/null, lower_winner_ids, upper_winner_ids, globally_cheaper_program_ids_at_intersection. Το τελευταίο πεδίο αφορά το πλήρες υποψήφιο σύνολο της αναγραφόμενης category_id. |
| intersection_status | IN_RANGE, AT_ZERO, OUTSIDE_RANGE, NEGATIVE_INTERSECTION, PARALLEL_DIFFERENT ή IDENTICAL. Αν λείπουν στοιχεία/ζεύγος: NOT_COMPUTABLE και αιτία. |
| WinnerEnvelope | state_id, category_id, domain [0,5.000], status AVAILABLE / NEEDS_EXPLICIT_SHARE / NO_CANDIDATES, open_intervals με lower/upper Exact και raw_winner_ids, boundary_points με q Exact και raw_winner_ids. |
| RangeCheck | state_id, category_id, L/U Exact, initial_first_program_ids, ανά ID status REMAINS_MINIMUM / DOES_NOT_REMAIN / NOT_ELIGIBLE / NOT_EVALUATED και τεκμηρίωση διαστημάτων/ορίων. Αν δεν αρκεί η κατανομή: NEEDS_EXPLICIT_SHARE, χωρίς ψευδή θετική ένδειξη. |
| StateChange | base_state_id, trial_state_id, changed_assumptions, first_program_ids πριν/μετά και ανά ίδιο program_id before_cents / after_cents / delta_cents = after_cents − before_cents. Θετικό σημαίνει αύξηση κόστους. Μη συγκρίσιμη πλευρά → null με αιτία. |

`raw_winner_ids` σημαίνει ελάχιστο μη στρογγυλοποιημένο κόστος. Δεν συγχέεται με `first_program_ids`, που αναφέρεται στην ακρίβεια λεπτών. Η κενή τιμή δεν υποκαθιστά το «δεν υπάρχει μοναδική τομή». Κάθε αποτέλεσμα φέρει αναφορές στην ενεργή κατάσταση, ώστε να μην επαναχρησιμοποιείται όριο από προηγούμενους όρους.

## 11. Αμετάβλητοι κανόνες συνέπειας

1. qκ + qμ = q όταν υπάρχει γνωστή κατανομή. Ίδιες q/d/όροι για όλα τα προϊόντα μιας κατάστασης.
2. Άθροισμα εμφανιζόμενων γραμμών ενέργειας + διόρθωση = energy_total_cents. Ενέργεια + πάγιο = total_cents.
3. Κανένα ποσό χωρίς μονάδα, 30ήμερη βάση και ένδειξη μη πραγματικής προσφοράς.
4. Καμία σύγκριση παρόχου αντί ακριβούς προϊόντος/έκδοσης/όρων.
5. UNKNOWN δεν μετατρέπεται σε YES ή KNOWN_ZERO.
6. Κάθε αποτέλεσμα επαναϋπολογίζεται όταν αλλάξουν παραδοχές. Η Αρχική σύγκριση παραμένει αμετάβλητη μέχρι νέα υποβολή.
7. Καμία ετήσια εγγύηση, πιθανότητα ή AI score δεν παράγεται από αυτό το μοντέλο.

## 12. Αντιστοίχιση στον σκελετό TypeScript

Η πρώτη υλοποίηση βρίσκεται στο src/domain/types.ts. Τα προγράμματα είναι Readonly και οι ασύμβατες μορφές κατανάλωσης/rates διακρίνονται με discriminated unions. Στο Rates υπάρχει επιπλέον `basis` για ασφαλή narrowing· τα πεδία άλλης ζώνης απουσιάζουν αντί να μεταφέρονται ως null. Στο Evaluation τα αριθμητικά πεδία ομαδοποιούνται σε `charges: Charges | null`: έτσι μια ασύμβατη εγγραφή δεν μπορεί να παρερμηνευθεί ως εγγραφή με μηδενικές επιμέρους χρεώσεις.

Τα result/state IDs προκύπτουν από τις αναφορές σεναρίου/έκδοσης, ενώ το state_id Δοκιμής ενσωματώνει και τις ακριβείς ενεργές παραδοχές. Οι normalization_label, condition_evaluations και explanation_facts ανακτώνται από τα τυποποιημένα αριθμητικά δεδομένα και τις ενεργές απαντήσεις μέσω συναρτήσεων εξήγησης, χωρίς δεύτερη ανεξάρτητη αποθήκευση των ίδιων στοιχείων. Τα αναλυτικά αποτελέσματα χρησιμοποιούν `intervals` με ανοιχτά άκρα και χωριστά `boundary_points` για τις ακριβείς ισότητες. Οι βασικοί κανόνες και τα ποσά του μοντέλου παραμένουν αμετάβλητα.

Στις πρώτες οθόνες χρησιμοποιείται ξεχωριστό `FormDraft` στο src/app/onboarding.ts, με κενό string για αναπάντητες επιλογές και ακατέργαστο κείμενο για αριθμητικά πεδία. Αυτό δεν αποτελεί έγκυρο UserScenario. Οι manual και indicative ποσότητες κρατούνται χωριστά, ώστε ένα σύνολο 90 ημερών να μη μεταφερθεί σιωπηρά ως 30ήμερη υπόθεση. Η επικύρωση κατανάλωσης εκθέτει μόνο QuantityPreview και μηνύματα· οι εσωτερικές ουδέτερες τιμές που επιτρέπουν επανάχρηση του normalizer πριν από τις προτιμήσεις δεν γίνονται αποθηκευμένες απαντήσεις ούτε προτάσεις. Η toUserScenario απαιτεί όλες τις πραγματικές επιλογές πριν από υποβολή. Η αλλαγή μέτρησης καθαρίζει ασύμβατες χειροκίνητες ποσότητες/κατανομή και η αλλαγή σκοπού σε νέα παροχή καθαρίζει το baseline.

Για τα αποτελέσματα, το src/app/results.ts παράγει ProgramView και ενιαίο σύνολο featured IDs από τις πρώτες επιλογές των δύο κατηγοριών. Κάθε ID εμφανίζεται μία φορά στις προτεινόμενες κάρτες και φέρει όλες τις σχετικές ετικέτες· οι ισότιμοι πρώτοι δεν περικόπτονται. Οι χρεώσεις είναι αναφορές στο ίδιο Charges του Evaluation, όχι δεύτερος υπολογισμός. Το view κρατά conditions με πραγματικές απαντήσεις, baseline_text, αιτιολόγηση της σωστής κατηγορίας και null για άγνωστα ποσά. Η ResultsFlow κρατά μόνο κατάσταση πλοήγησης, επιλεγμένο ζεύγος και επέκταση λίστας. Το PairComparison.category_id είναι το ρητό scope σύγκρισης, ανεξάρτητο από το RecommendationResult.primary_category.

Στη Δοκιμή, η ResultsFlow κρατά επίσης `TrialDraft` και `RangeDraft` από src/app/trial.ts. Τα κείμενα πεδίων είναι χωριστά από τα nullable overrides: null σημαίνει διατήρηση της ακριβούς αρχικής ποσότητας/μεριδίου, ενώ κενό string είναι άκυρη αλλαγή. Οι προτεινόμενες άκρες εύρους παραμένουν ακριβείς μέχρι πραγματική επεξεργασία. Ο reducer κρατά `base_result` και `trial_result` χωριστά· άκυρη δοκιμή καθαρίζει trial_result και δεν προβάλλεται ως ενημερωμένη πρόταση. Οι αλλαγές νικητή συγκρίνουν πλήρη σύνολα IDs με στρογγυλοποιημένα λεπτά. Οι διαφορές πριν/μετά παράγονται μόνο ανά ίδιο program_id. Το WhatIf και το κοινό PairFacts διαβάζουν τα ίδια Charges/αναλυτικά αποτελέσματα, χωρίς δεύτερο τιμολογιακό υπολογισμό στο UI.

Οι προαιρετικές διαδρομές χρησιμοποιούν src/app/optional.ts, src/app/baseline.ts και src/data/demoBill.ts. Το FormDraft.source δέχεται πλέον και DEMO_SAMPLE και κρατά `sample_confirmed: boolean` αποκλειστικά για την επιβεβαίωση της φόρμας. Η επιβεβαίωση δεν είναι τιμολογιακό πεδίο και δεν προστίθεται στο UserScenario· υποβολή δείγματος επιτρέπεται μόνο μετά από αυτήν. Πραγματικές αλλαγές κατανάλωσης την καθαρίζουν, αλλαγές προτίμησης όχι. Η επεξεργασία ήδη υποβληθέντος δείγματος διατηρεί την πηγή και την επιβεβαίωση μέχρι αλλαγή τιμών. Η έξοδος από DEMO_SAMPLE καθαρίζει τις φανταστικές χειροκίνητες ποσότητες.

Η παράλειψη σημερινού συμβολαίου παραμένει null, ενώ «μόνο εταιρεία» αναπαρίσταται ως UNAVAILABLE με null ακριβή ταυτότητα/εκδόσεις και άγνωστη ρήτρα. Δεν αποθηκεύεται πραγματική εταιρεία ή προσωπικό στοιχείο. Το BaselineView αναφέρεται στα ίδια Evaluation/Charges και παραθέτει τις baseline_difference_cents. Η ρήτρα παρουσιάζεται από FeeEvidence, ανεξάρτητα από τη μηνιαία τιμολόγηση όταν οι ακριβείς όροι έχουν επιλυθεί αλλά λείπει κατανομή. Μη επιλυμένη έκδοση δεν αποκτά γνωστό μηδέν. Δεν προστέθηκαν νέες τιμές DEMO-1 ή πεδία καθαρού οφέλους.
