# PhishGuard Stability Shield — Empirical Prediction Stability Evaluation Report

## Executive Summary

- **Total Benchmark Samples**: 1,000
- **Model Baseline Accuracy**: 53.40%
- **Overall Mean Prediction Stability**: 94.84%
- **Median Prediction Stability**: 100.00%
- **Strictly Stable Predictions (100% Consistent)**: 866 (86.60%)
- **Unstable Predictions (<100% Consistent)**: 134
- **Unavailable (Zero Valid Transforms)**: 0

### Key Security & Robustness Takeaways

> **Important Principle**: *Prediction Stability measures whether the model returns the same class for equivalent URL representations. A stable prediction can still be incorrect.*

1. **Lexical Representation Sensitivity**: Adding explicit default ports (e.g. `:443` on HTTPS or `:80` on HTTP) increases lexical character length, digit count, and punctuation delimiters. Because the baseline classifier relies heavily on lexical length and punctuation feature thresholds, default port addition has a measurable tendency to flip boundary classifications.
2. **Case Normalization Stability**: Hostname and scheme case normalization (RFC 3986 Section 6.2.2.1) preserves exact feature vector counts (length, dots, digits), maintaining 100% consistency across case variants.
3. **Independence of Stability and Correctness**: As shown in the 2x2 matrix below, a prediction can be stable yet incorrect (e.g., an evasive phishing URL consistently misclassified across all variants), or accurate yet unstable (correct on canonical representation but sensitive to representation formatting).

---

## Class-Wise Stability Breakdown

| Ground Truth Class | Samples | Baseline Accuracy | Mean Stability (%) | Stable (100%) | Unstable | Stable Rate |
|:---|:---:|:---:|:---:|:---:|:---:|:---:|
| **LEGITIMATE** | 250 | 5.60% | 96.67% | 231 | 19 | 92.40% |
| **PHISHING** | 250 | 82.80% | 96.14% | 226 | 24 | 90.40% |
| **DEFACEMENT** | 250 | 72.00% | 98.53% | 244 | 6 | 97.60% |
| **MALWARE** | 250 | 53.20% | 88.01% | 165 | 85 | 66.00% |

---

## Transformation Vulnerability Analysis

| Transformation Check | Total Tested | Consistent | Flipped Predictions | Flip Rate (%) |
|:---|:---:|:---:|:---:|:---:|
| `case_normalization` (Case Normalization) | 870 | 870 | 0 | 0.00% |
| `default_port_addition` (Default Port Addition) | 941 | 808 | 133 | 14.13% |
| `dot_segment_equivalence` (Dot Segment Equivalence) | 907 | 887 | 20 | 2.21% |
| `empty_path_normalization` (Empty Path Normalization) | 89 | 89 | 0 | 0.00% |
| `default_port_removal` (Default Port Removal) | 1 | 0 | 1 | 100.00% |

---

## Accuracy vs. Prediction Stability Matrix

| Category | Sample Count | Percentage of Benchmark | Diagnostic Meaning |
|:---|:---:|:---:|:---|
| **Correct & Stable** | 515 | 51.50% | Model prediction is accurate and resilient to URL representation variations. |
| **Correct but Unstable** | 19 | 1.90% | Original prediction is correct, but minor representation changes flip the verdict (borderline confidence). |
| **Incorrect & Stable** | 351 | 35.10% | Model is systematically incorrect across all equivalent representations. |
| **Incorrect & Unstable** | 115 | 11.50% | High uncertainty regime; both the original prediction and representation variants are volatile. |

---

## Evaluation Methodology & Limitations

- **Methodology**: Evaluates standards-compliant URL representations defined in RFC 3986 (URI Generic Syntax) and RFC 2616 (HTTP/1.1), including scheme/host case normalization, default port addition/removal (`:80`/`:443`), empty root path normalization, and self-referencing dot segment (`/./`) normalization.
- **Scope Limitations**: Evaluates standards-compliant lexical representation changes only (RFC 3986); does not evaluate server-side URL rewriting, symlinks, or network redirects.
- **Zero Network Execution**: All transformations and predictions execute strictly in-memory using the offline feature extractor and trained artifact, making zero external network or DNS queries.
