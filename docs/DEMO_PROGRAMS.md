# VoltWise — Φανταστικός κατάλογος DEMO-1

**ΕΚΠΑΙΔΕΥΤΙΚΟ DEMO — οι πάροχοι, τα προγράμματα, οι τιμές και οι όροι είναι φανταστικά. Δεν είναι πραγματικές προσφορές.**

Έκδοση δεδομένων DEMO-1 · Τεκμηρίωση 1.1, 03/11/2026. Διατηρούνται ακριβώς οι πέντε τιμολογιακές εγγραφές του PROJECT_SPEC.md §7. Προστέθηκε μόνο μεταδεδομένο υποστηριζόμενου μαθηματικού μοντέλου, χωρίς αλλαγή ποσών ή όρων. Δεν χρειάζεται έκτο πρόγραμμα για να δημιουργηθούν αλλαγές κατάταξης. Δεν χρησιμοποιούνται πραγματικά ονόματα ή λογότυπα παρόχων.

## 1. Κοινά πεδία

- catalog_id: VOLTWISE_FICTIONAL, program_revision: DEMO-1.
- calculation_model: LINEAR_V1 σε κάθε πρόγραμμα. Κλιμακωτές τιμές και μη υποστηριζόμενα μοντέλα απορρίπτονται, δεν προσεγγίζονται ως ενιαία τιμή.
- is_demo: true, is_real_offer: false σε κάθε πρόγραμμα.
- currency: EUR, reference_days: 30, vat_included: false.
- Όλες οι χρεώσεις παρακάτω αφορούν μόνο ενέργεια + πάγιο, χωρίς ΦΠΑ και άλλες επιβαρύνσεις.
- terms_revision: DEMO-1/ID/TERMS-1 για κάθε ID προγράμματος.
- activation_fee_cents = 0, deposit_cents = 0.
- exit_fee_terms: status KNOWN_ZERO, amount_cents 0, evidence_reference η αντίστοιχη terms_revision, unknown_reason null. Πρόκειται για ρητό κατασκευασμένο όρο των demo προϊόντων, όχι υπόθεση για την αγορά.
- Δεν υπάρχουν κλίμακες κατανάλωσης, πρόσθετες υπηρεσίες, δώρα, αναδρομικές ή σωρευτικές εκπτώσεις.

## 2. Οι πέντε εγγραφές

| program_id | provider_id / provider_name | program_name | price_type | fixed_rate_months / minimum_commitment_months | fixed_fee_cents_30 | pricing_basis / supported_meters | base_rates €/kWh | discount_rule_id |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A1 | DEMO_A / Πάροχος Α — Demo | Μικρό Πάγιο | FIXED | 12 / 12 | 200 | UNIFIED / SINGLE, DUAL, UNKNOWN | unified_rate 0,160 | null |
| A2 | DEMO_A / Πάροχος Α — Demo | Πολλές kWh | FIXED | 12 / 12 | 1000 | UNIFIED / SINGLE, DUAL, UNKNOWN | unified_rate 0,120 | null |
| B1 | DEMO_B / Πάροχος Β — Demo | Στιγμιότυπο | VARIABLE_SNAPSHOT | null / 0 | 400 | UNIFIED / SINGLE, DUAL, UNKNOWN | unified_rate 0,130 | null |
| C1 | DEMO_C / Πάροχος Γ — Demo | Με Προϋποθέσεις | FIXED | 12 / 12 | 300 | UNIFIED / SINGLE, DUAL, UNKNOWN | unified_rate 0,180 | C1_EBILL_AND_DD |
| D1 | DEMO_D / Πάροχος Δ — Demo | Δύο Ζώνες | FIXED | 12 / 12 | 600 | DUAL_ZONE / DUAL | normal_rate 0,170 · reduced_rate 0,080 | null |

UNIFIED: requires_allocation = false, zone rates = null. DUAL_ZONE: requires_allocation = true, unified_rate = null. Για FIXED, price_reference = DEMO_FIXED_TERMS. Για B1, price_reference = DEMO_SNAPSHOT_1: η τιμή του δεν είναι πρόβλεψη ή πραγματική σημερινή προσφορά.

## 3. Ο μοναδικός κανόνας έκπτωσης

| Πεδίο | Τιμή |
| --- | --- |
| discount_id / revision | C1_EBILL_AND_DD / DEMO-1 |
| applies_to / effect_type | ENERGY_RATE / REPLACE_RATE |
| condition_ids / match_mode | E_BILL, DIRECT_DEBIT / ALL |
| replacement_rates | unified_rate = 0,100 €/kWh |
| failure_behavior / stacking | KEEP_BASE_RATE / NONE |

| e_bill | direct_debit | Ενεργή τιμή C1 | Κατάσταση |
| --- | --- | --- | --- |
| YES | YES | 0,100 | APPLIED |
| YES | NO | 0,180 | NOT_MET |
| YES | UNKNOWN | 0,180 | UNCONFIRMED |
| NO | YES | 0,180 | NOT_MET |
| NO | NO | 0,180 | NOT_MET |
| NO | UNKNOWN | 0,180 | NOT_MET, με καταγραφή και άγνωστου όρου |
| UNKNOWN | YES | 0,180 | UNCONFIRMED |
| UNKNOWN | NO | 0,180 | NOT_MET, με καταγραφή και άγνωστου όρου |
| UNKNOWN | UNKNOWN | 0,180 | UNCONFIRMED |

Το πάγιο C1 παραμένει 3,00 €. Η βασική τιμή και η υπό όρους τιμή είναι σταθερές στους κατασκευασμένους 12μηνους όρους. Η απώλεια της έκπτωσης αλλάζει την εφαρμοζόμενη τιμή χωρίς να μετατρέπει το πρόγραμμα σε μεταβλητό τιμοκατάλογο.

## 4. Γιατί επαρκεί αυτό το σύνολο

Για μονή μέτρηση χωρίς πλήρη έκπτωση, οι ακριβείς συναρτήσεις κόστους σε ευρώ είναι:

| Πρόγραμμα | Κόστος για q kWh / 30 ημέρες | Σχεδιαστικός ρόλος |
| --- | --- | --- |
| A1 | 2 + 0,160q | Χαμηλό πάγιο, ακριβότερη kWh. |
| A2 | 10 + 0,120q | Υψηλότερο πάγιο, φθηνότερη kWh. |
| B1 | 4 + 0,130q | Ενδιάμεση επιλογή κόστους, με μεταβλητό χαρακτήρα τιμής. |
| C1 χωρίς έκπτωση | 3 + 0,180q | Δείχνει γιατί χρειάζεται έλεγχος προϋποθέσεων. |
| C1 με πλήρη έκπτωση | 3 + 0,100q | Ανατροπή κατάταξης όταν επιβεβαιωθούν και οι δύο όροι. |
| D1, γνωστό διζωνικό μερίδιο s | 6 + q(0,170 − 0,090s) | Η κατανομή ζωνών αλλάζει το αποτέλεσμα. Δεν εφαρμόζεται σε άγνωστο μετρητή/κατανομή. |

Χωρίς έκπτωση, οι σταθερές επιλογές A1/A2 εναλλάσσονται στις 200 kWh. Με όλες τις συγκρίσιμες επιλογές ενιαίας τιμής, ο πρώτος αλλάζει στα 200/3 και 600 kWh, όχι στις 200. Με ενεργή C1, A1/C1 αλλάζουν στα 50/3 kWh. Η D1 προσθέτει διαφορετική συμπεριφορά όταν μεταβληθεί το γνωστό/υποθετικό μερίδιο μειωμένης ζώνης.

Τα ακριβή ποσά και οι περιπτώσεις ισοπαλίας ελέγχονται στο VERIFIED_EXAMPLES.md. Οι ελεγχόμενες δοκιμές με άδειο/περιορισμένο κατάλογο ή ελλιπείς συμβατικούς όρους είναι ξεχωριστά test fixtures· δεν αποτελούν επιπλέον εμπορικά προϊόντα ή αλλαγές του DEMO-1.
