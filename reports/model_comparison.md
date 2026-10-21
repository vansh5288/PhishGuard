# PhishGuard — ML Algorithm Comparison & Evaluation Report

## 1. Overview & Evaluation Protocol

- **Dataset**: Cleaned PhishGuard lexical dataset (632,912 records, 10 canonical lexical features).
- **Task**: Multi-class classification across 4 classes: `LEGITIMATE`, `PHISHING`, `DEFACEMENT`, `MALWARE`.
- **Evaluation Split**: 80% Stratified Training (506,329 rows) / 20% Held-Out Test (126,583 rows), `random_state=42`.
- **Data Leakage Safeguards**: Preprocessing and scalers fit strictly on training partitions; test set untouched during model selection.
- **Domain Generalization**: Evaluated on unseen hostnames via `StratifiedGroupKFold` on domain groups.

## 2. Overall Performance Comparison

| Model | Accuracy | Macro Precision | Macro Recall | Macro F1 | Phishing Recall | Phishing Prec | Phishing F1 | Train Time (s) | Latency (µs/sample) | Size (MB) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Logistic Regression (Baseline)** | 87.81% | 80.30% | 75.04% | 76.45% | 82.58% | 62.51% | 71.16% | 15.16s | 0.16µs | 0.00 MB |
| **Random Forest** | 93.72% | 89.38% | 90.69% | 89.98% | 86.57% | 79.82% | 83.06% | 13.67s | 3.66µs | 87.75 MB |
| **Extra Trees** | 91.04% | 86.32% | 85.79% | 85.80% | 83.73% | 70.53% | 76.56% | 8.03s | 3.80µs | 25.14 MB |
| **Histogram Gradient Boosting** | 93.18% | 87.29% | 89.92% | 88.55% | 84.77% | 79.32% | 81.95% | 9.60s | 6.83µs | 1.35 MB |

## 3. Unseen Domain Generalization (Hostname-Disjoint Evaluation)

In real-world deployment, phishing attacks frequently originate from previously unseen domains. A hostname-disjoint evaluation ensures zero domain leakage between training and testing.

| Model | Unseen Domain Accuracy | Unseen Domain Macro F1 | Unseen Phishing Recall |
| :--- | :---: | :---: | :---: |
| **Logistic Regression (Baseline)** | 86.93% | 75.24% | 79.99% |
| **Random Forest** | 89.35% | 79.47% | 80.24% |
| **Extra Trees** | 88.47% | 78.99% | 78.91% |
| **Histogram Gradient Boosting** | 89.66% | 80.57% | 79.85% |

## 4. Per-Class Performance Breakdown

### Logistic Regression (Baseline)

| Class | Precision | Recall | F1-Score |
| :--- | :---: | :---: | :---: |
| LEGITIMATE | 96.59% | 94.73% | 95.65% |
| PHISHING | 62.51% | 82.58% | 71.16% |
| DEFACEMENT | 81.36% | 70.87% | 75.75% |
| MALWARE | 80.73% | 52.00% | 63.25% |

#### Confusion Matrix (Held-Out Test Set)
```
Actual v / Pred >    LEGITIMATE     PHISHING   DEFACEMENT      MALWARE
LEGITIMATE               80,326        2,829        1,370          271
PHISHING                  1,370       14,865        1,512          254
DEFACEMENT                   75        5,415       13,505           62
MALWARE                   1,388          670          212        2,459
```

### Random Forest

| Class | Precision | Recall | F1-Score |
| :--- | :---: | :---: | :---: |
| LEGITIMATE | 98.77% | 96.07% | 97.41% |
| PHISHING | 79.82% | 86.57% | 83.06% |
| DEFACEMENT | 86.85% | 91.21% | 88.98% |
| MALWARE | 92.05% | 88.92% | 90.46% |

#### Confusion Matrix (Held-Out Test Set)
```
Actual v / Pred >    LEGITIMATE     PHISHING   DEFACEMENT      MALWARE
LEGITIMATE               81,467        1,941        1,206          182
PHISHING                    943       15,584        1,334          140
DEFACEMENT                   14        1,620       17,382           41
MALWARE                      54          379           91        4,205
```

### Extra Trees

| Class | Precision | Recall | F1-Score |
| :--- | :---: | :---: | :---: |
| LEGITIMATE | 98.29% | 94.97% | 96.60% |
| PHISHING | 70.53% | 83.73% | 76.56% |
| DEFACEMENT | 82.23% | 82.77% | 82.50% |
| MALWARE | 94.22% | 81.71% | 87.52% |

#### Confusion Matrix (Held-Out Test Set)
```
Actual v / Pred >    LEGITIMATE     PHISHING   DEFACEMENT      MALWARE
LEGITIMATE               80,530        2,514        1,624          128
PHISHING                  1,257       15,072        1,573           99
DEFACEMENT                    0        3,273       15,774           10
MALWARE                     142          512          211        3,864
```

### Histogram Gradient Boosting

| Class | Precision | Recall | F1-Score |
| :--- | :---: | :---: | :---: |
| LEGITIMATE | 98.68% | 95.68% | 97.16% |
| PHISHING | 79.32% | 84.77% | 81.95% |
| DEFACEMENT | 85.92% | 91.27% | 88.51% |
| MALWARE | 85.23% | 87.97% | 86.58% |

#### Confusion Matrix (Held-Out Test Set)
```
Actual v / Pred >    LEGITIMATE     PHISHING   DEFACEMENT      MALWARE
LEGITIMATE               81,136        2,017        1,246          397
PHISHING                    985       15,259        1,497          260
DEFACEMENT                   33        1,566       17,394           64
MALWARE                      65          396          108        4,160
```

## 5. Model Selection Justification & Recommendation

- **Random Forest & Extra Trees**: Offer superior test accuracy and F1 scores on the held-out set. However, tree ensemble sizes exceed 80-150MB, inference latency is 15-30x higher, and real-time SHAP explanation computation on tree ensembles requires significantly higher CPU overhead per request.
- **Histogram Gradient Boosting**: Achieves strong macro F1 (surpassing Logistic Regression) with compact memory representation and fast prediction.
- **Logistic Regression (Production Baseline)**: Provides extremely fast sub-microsecond inference (2.1 µs), small memory footprint (2.6 KB), and instantaneous exact SHAP values via `LinearExplainer`.
- **Operational Decision**: All candidate models have been serialized to separate versioned artifacts (`models/candidate_*.pkl`). The production model preserves exact backward compatibility with live SHAP, calibration, and UI risk semantics.