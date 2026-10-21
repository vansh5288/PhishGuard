# PhishGuard Offline Research Results

All results here are **experimental**. They do not change the production model or establish production performance. The experiments use labelled source data and the live ten-feature extractor; they do not visit, crawl, or fetch URLs.

## Dataset and preprocessing

- Raw source: `ml/data/raw/malicious_phish.csv`
- Schema: `url,type`
- Source rows: 651,191
- Source SHA-256: `d83ce942075dd63ed4d11560cfdcd9d512caa3d680e292f22cab484e8f074d01`
- Labels: benign, phishing, defacement, malware (mapped to legitimate, phishing, defacement, malware)
- Rows retained by the documented preprocessing: 632,912. Invalid/unprocessable entries, URLs with conflicting labels, and duplicate URLs are handled by the existing preprocessing rules.
- Feature contract: `url_length`, `hostname_length`, `path_length`, `dot_count`, `hyphen_count`, `digit_count`, `special_character_count`, `subdirectory_count`, `has_https`, `query_length`.
- Shared model settings: Logistic Regression, `max_iter=2000`, class weights `{0: 1.0, 1: 1.5, 2: 1.5, 3: 2.0}`, random seed 42; training-only `StandardScaler`.

## Random and hostname-disjoint comparison

The same fresh Logistic Regression configuration was fitted separately for a stratified random split and a stratified hostname-disjoint split. Neither test set was used for training, feature selection, or threshold tuning. The grouped split explicitly asserted zero hostname overlap.

| Split | Train rows | Test rows | Hostname overlap | Accuracy | Macro precision | Macro recall | Macro F1 | Phishing precision | Phishing recall |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Stratified random | 506,329 | 126,583 | 21,988 | 0.7352 | 0.6689 | 0.5585 | 0.5830 | 0.4574 | 0.1447 |
| Hostname-disjoint | 506,330 | 126,582 | 0 | 0.7441 | 0.6867 | 0.5693 | 0.5955 | 0.5072 | 0.1629 |

The source output also contains per-class scores, split distributions, confusion matrices, and the representation-variation results. Despite somewhat higher aggregate scores in the grouped split for this seed, phishing recall remained low in both splits. A single split is not evidence of a general performance improvement.

Semantics-preserving representation checks used a fixed sample from the grouped held-out test split:

| Variation | Samples | Feature vector unchanged | Prediction flip rate |
|---|---:|---:|---:|
| Scheme letter case | 100 | 100% | 0.0000 |
| Hostname letter case | 100 | 100% | 0.0000 |
| Explicit default port | 99 | 0% | 0.0303 |

The default-port form is destination-equivalent but changed the current lexical feature vector; this finding is a representation sensitivity observation, not a claim of semantic label changes.

Detailed artifacts: [domain robustness report](../ml/evaluation/domain_robustness_report.md), JSON report, metrics CSV, class distributions, confusion matrices, and representation variation data under `ml/evaluation/`.

## Probability calibration comparison

The experiment used nested hostname-disjoint partitions: training 405,064 rows, calibration 101,266, and final test 126,582. Pairwise hostname overlap was zero. The base model and scaler were fitted only on training rows; one-vs-rest sigmoid calibrators were fitted only on the separate calibration rows. All comparisons below use the untouched test partition.

| Method | Multiclass log loss | Multiclass Brier | Top-label ECE | Classwise ECE | Macro F1 |
|---|---:|---:|---:|---:|---:|
| Uncalibrated | 0.756651 | 0.396902 | 0.104451 | 0.059115 | 0.591109 |
| Sigmoid calibrated | 0.740881 | 0.389978 | 0.070180 | 0.048240 | 0.538090 |

On this split, the listed probability metrics decreased after calibration, while macro F1 decreased by about 0.053. Under the experiment's predeclared guardrail, **the test evidence does not support production integration**. Calibration is not expected to automatically improve classification accuracy. These results are not a recommendation to change production probabilities.

Detailed artifacts, including reliability diagram, bin data, and metrics: [probability calibration report](../ml/evaluation/probability_calibration/probability_calibration_report.md).

## Existing saved-model robustness check

The separate robustness script uses the persisted model only for evaluation, reuses the current processed feature dataset, and does not retrain or replace the production artifact. It uses the same scaler transformation for reported classification metrics and for baseline/perturbed prediction comparisons.

- Test accuracy: 0.8781
- Test macro F1: 0.7645
- Prediction flip rate under small feature perturbation (`0.10` feature standard deviations, 200 held-out rows): 0.40
- Prediction flip rate when blanking 2 of 10 features (200 held-out rows): 0.50

The flip rates are sensitivity measures under the specific artificial perturbations, not accuracy estimates or evidence of robustness to real attacker behavior. Detailed output: `ml/evaluation/robustness_report.json`.

## Reproduction commands

From the repository root in Windows PowerShell:

```powershell
.\.venv\Scripts\python.exe -m ml.evaluation.domain_robustness
.\.venv\Scripts\python.exe -m ml.evaluation.probability_calibration
.\.venv\Scripts\python.exe -m ml.evaluation.robustness
```

These commands write research outputs only under `ml/evaluation/`; none writes to `models/final_model.pkl` or `models/scaler.pkl`.

## Limitations

- Results depend on the source dataset's labels and collection characteristics.
- Hostname grouping is only a proxy for unseen-domain generalization, not a temporal split or independent external benchmark.
- Only one deterministic seed/split was reported; confidence intervals and repeated-split variability were not estimated.
- The lexical ten-feature representation does not include page content or richer domain reputation signals.
- ECE depends on the specified 15 fixed-width bins.
- The robustness perturbations are synthetic and intentionally limited.
- These results do not demonstrate research novelty or justify a production model change.
