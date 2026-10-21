# PhishGuard Probability Calibration Evaluation (Experimental)

> Offline experimental evidence only. This report does not change production probabilities.

## Method

- Raw dataset: `ml/data/raw/malicious_phish.csv`; SHA-256 `d83ce942075dd63ed4d11560cfdcd9d512caa3d680e292f22cab484e8f074d01`.
- Raw schema columns: `url, type`; URL `url`, label `type`.
- Retained rows: 632912 of 651191; existing preprocessing removes malformed URLs, conflicting URL labels, and exact URL duplicates.
- Features: 10 live URL features in the recorded order.
- Base model: Logistic Regression, max_iter=2000, class_weight={'0': 1.0, '1': 1.5, '2': 1.5, '3': 2.0}, random seed=42.
- Scaler and base model are fitted only on training data. Calibration is fitted only on separate calibration data. Neither is refit on test data.
- Split seeds: outer grouped split=42; inner calibration split=43.
- Calibration: One-vs-rest sigmoid (Platt) regression on base-model probability logits; calibrated class probabilities are normalized to sum to one.
- No URLs were fetched, crawled, or visited. No production model artifacts were loaded or written.

## Leakage controls and partitions

| Partition | Rows | Hostnames | Legitimate | Phishing | Defacement | Malware |
|---|---:|---:|---:|---:|---:|---:|
| Train | 405064 | 124652 | 271348 | 57601 | 60982 | 15133 |
| Calibration | 101266 | 31247 | 67836 | 14401 | 15246 | 3783 |
| Final test | 126582 | 39015 | 84796 | 18000 | 19057 | 4729 |

Partitioning uses nested stratified group folds. Pairwise hostname overlap counts: `{"calibration_vs_test": 0, "train_vs_calibration": 0, "train_vs_test": 0}`. Final test domains are disjoint from both development partitions; assertions passed: **True**.

## Untouched final test results

Multiclass Brier score is the mean per-example sum of squared errors over the four one-hot class targets (lower is better; range 0–2). Top-label ECE is fixed-width 15-bin expected calibration error on the maximum predicted class probability and correctness. Classwise ECE is the macro mean of one-vs-rest 15-bin ECE values. Lower calibration scores are better.

| Method | Multiclass log loss | Multiclass Brier | Top-label ECE | Classwise ECE | Macro F1 |
|---|---:|---:|---:|---:|---:|
| uncalibrated | 0.756651 | 0.396902 | 0.104451 | 0.059115 | 0.591109 |
| sigmoid calibrated | 0.740881 | 0.389978 | 0.070180 | 0.048240 | 0.538090 |

Reliability diagrams: [reliability_diagrams.png](./reliability_diagrams.png). Underlying bin counts and observed frequencies: [reliability_diagram_data.csv](./reliability_diagram_data.csv).

## Integration assessment

Predeclared evidence rule: All of log loss, Brier score, and top-label ECE must improve on the untouched test set, while macro F1 declines by no more than 0.01.

**Assessment:** The held-out evidence does not support integrating this calibration method into production at this time.

Calibration is not expected to automatically improve argmax classification accuracy. Macro F1 is reported as a separate guardrail, not as a probability-calibration metric. A single split cannot establish deployment suitability.

## Limitations

- This is one deterministic split experiment, not cross-validation or a statistical confidence interval.
- Hostname-level grouping is only a proxy for unseen-domain generalization; dataset time drift and label quality are not addressed.
- The sigmoid calibrator is one-vs-rest and renormalizes class scores; it is not guaranteed to improve probability quality or preserve argmax predictions.
- Expected calibration errors depend on the fixed binning scheme and test-set composition.
- The ten lexical features contain no rich domain or page content; calibration cannot fix representation limits.
- Production model and prediction behavior are untouched.
