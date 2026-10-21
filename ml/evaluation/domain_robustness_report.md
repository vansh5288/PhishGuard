# PhishGuard Domain Generalization and Robustness (Experimental)

> Experimental offline evaluation only. These results do not establish production performance or demonstrate an improvement.

## Method

- Source: `ml/data/raw/malicious_phish.csv` (d83ce942075dd63ed4d11560cfdcd9d512caa3d680e292f22cab484e8f074d01)
- Raw schema: columns `url, type`; URL column `url`, label column `type`.
- Rows: 651191 raw; 632912 retained after the existing URL/label cleaning rules.
- Feature contract: the same ordered ten features used by live inference (`url_length, hostname_length, path_length, dot_count, hyphen_count, digit_count, special_character_count, subdirectory_count, has_https, query_length`).
- Model: fresh Logistic Regression fit independently for each split; StandardScaler fitted on training data only. The persisted production model and scaler were not loaded or changed.
- Settings: max_iter=2000, class_weight={'0': 1.0, '1': 1.5, '2': 1.5, '3': 2.0}, seed=42.
- No URLs were visited, crawled, or fetched. Test data was not used for fitting, feature selection, or threshold tuning.
- Conflicting-label URL groups are excluded, matching the current preprocessing policy; exact duplicate URLs keep their first source row.

## Evaluation

| Experiment | Status | Train rows | Test rows | Hostname overlap | Accuracy | Macro precision | Macro recall | Macro F1 | Phishing precision | Phishing recall |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Stratified random | evaluated | 506329 | 126583 | 21988 | 0.7352 | 0.6689 | 0.5585 | 0.5830 | 0.4574 | 0.1447 |
| Hostname-disjoint | evaluated | 506330 | 126582 | 0 | 0.7441 | 0.6867 | 0.5693 | 0.5955 | 0.5072 | 0.1629 |

### Per-class test metrics

| Experiment | Class | Precision | Recall | F1 | Support |
|---|---|---:|---:|---:|---:|
| Stratified random | Legitimate | 0.7553 | 0.9337 | 0.8351 | 84796 |
| Stratified random | Phishing | 0.4574 | 0.1447 | 0.2199 | 18001 |
| Stratified random | Defacement | 0.6668 | 0.4064 | 0.5050 | 19057 |
| Stratified random | Malware | 0.7962 | 0.7492 | 0.7720 | 4729 |
| Hostname-disjoint | Legitimate | 0.7614 | 0.9394 | 0.8411 | 84796 |
| Hostname-disjoint | Phishing | 0.5072 | 0.1629 | 0.2466 | 18000 |
| Hostname-disjoint | Defacement | 0.6878 | 0.4215 | 0.5227 | 19057 |
| Hostname-disjoint | Malware | 0.7904 | 0.7534 | 0.7715 | 4729 |

All macro scores use the fixed four-class label set (Legitimate, Phishing, Defacement, Malware) and `zero_division=0`. Any absent class is explicitly listed below; its class-specific precision/recall and contribution to macro metrics require cautious interpretation.

### Split class distributions

| Experiment | Split | Legitimate | Phishing | Defacement | Malware |
|---|---|---:|---:|---:|---:|
| Stratified random | train | 339184 | 72001 | 76228 | 18916 |
| Stratified random | test | 84796 | 18001 | 19057 | 4729 |
| Hostname-disjoint | train | 339184 | 72002 | 76228 | 18916 |
| Hostname-disjoint | test | 84796 | 18000 | 19057 | 4729 |

Hostname-disjoint leakage check: **0 overlapping hostnames**. The script asserts that this count is zero before fitting.

### Confusion matrices

Matrix row order is actual class and column order is predicted class, both: Legitimate, Phishing, Defacement, Malware.

#### Stratified random

| Actual \\ Predicted | Legitimate | Phishing | Defacement | Malware |
|---|---:|---:|---:|---:|
| Legitimate | 79173 | 2034 | 3280 | 309 |
| Phishing | 14261 | 2605 | 539 | 596 |
| Defacement | 10475 | 835 | 7745 | 2 |
| Malware | 913 | 221 | 52 | 3543 |

#### Hostname-disjoint

| Actual \\ Predicted | Legitimate | Phishing | Defacement | Malware |
|---|---:|---:|---:|---:|
| Legitimate | 79657 | 1864 | 2974 | 301 |
| Phishing | 13835 | 2933 | 590 | 642 |
| Defacement | 10158 | 865 | 8032 | 2 |
| Malware | 964 | 121 | 81 | 3563 |

## Offline representation variation check

The deterministic sample comes only from the hostname-disjoint held-out set. Labels are inherited from each original row; no labels are generated. The tested forms vary scheme letter case, DNS hostname letter case, or add the scheme's default port. Each candidate is checked against a canonical URL destination before evaluation.

| Variation | Samples | Feature vector unchanged | Prediction flip rate | Original accuracy | Variant accuracy |
|---|---:|---:|---:|---:|---:|
| scheme_case | 100 | 1.0000 | 0.0000 | 0.8300 | 0.8300 |
| hostname_case | 100 | 1.0000 | 0.0000 | 0.8300 | 0.8300 |
| explicit_default_port | 99 | 0.0000 | 0.0303 | 0.8283 | 0.7980 |

## Interpretation

The random split estimates performance when URLs from known hostnames can appear on both sides. The hostname-disjoint split is the more direct test of generalization to unseen hostnames. Compare the full metric set and class distributions; do not treat the random-split score as evidence of domain generalization. Representation results measure sensitivity to the listed equivalent forms on this sample only and do not establish robustness to arbitrary URL changes.

Outputs are reproducible from the raw dataset hash and seed. JSON contains complete metrics and split metadata; accompanying CSVs provide flat metrics, class distributions, confusion matrices, and variation results.
