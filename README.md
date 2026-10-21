# PhishGuard — Machine Learning-Based Phishing Detection and Risk Analysis System

**Subtitle:** Machine Learning-Based Phishing Detection & Risk Analysis

PhishGuard is an explainable, machine-learning-based phishing detection system for URL risk analysis and offline robustness evaluation. It processes a submitted URL through the model's fixed 10-feature extraction pipeline and trained four-class classifier, with local SHAP attribution, uncertainty assessment, and an offline brand-registry check.

> **Important System Classification:** PhishGuard is an applied **machine learning classification system**, not a generative AI or large language model (LLM) application. The analyzer does not open or fetch the submitted web page. URL safety validation may perform DNS resolution to reject private or local destinations.

---

## 1. Machine Learning Architecture

PhishGuard retains and documents an empirically validated, four-class classification architecture:

### 1.1 Trained Classifier: 4-Class Logistic Regression
- **Algorithm:** Multi-Class Multinomial Logistic Regression (`L2` regularization penalty, `C=1.0`, `solver='lbfgs'`).
- **Target Classes (4-Class Label Mapping):**
  1. `0: LEGITIMATE` — URLs labelled legitimate in the training data.
  2. `1: PHISHING` — URLs labelled phishing in the training data.
  3. `2: DEFACEMENT` — URLs labelled defacement in the training data.
  4. `3: MALWARE` — URLs labelled malware in the training data.
- **Model Output:** The serialized scikit-learn model's `predict_proba` distribution. The implementation does not recalibrate these probabilities.

### 1.2 Model Confidence and Uncertainty
- **Confidence:** The highest raw class probability from `predict_proba`; this is not a calibrated probability or guarantee of correctness.
- **Top-2 Margin:** Difference between the two highest class probabilities.
- **Review flag:** The separate uncertainty component recommends review when confidence is below 0.60 or the margin is below 0.15. It does not change the model's predicted class.
- **Risk score:** `1 - P(LEGITIMATE)`, persisted as `malicious_probability`; it is not the probability of the winning malicious class alone.

---

## 2. 10-Feature URL Extraction Pipeline

The model input is the fixed ordered lexical feature vector below. The analyzer does not fetch page content; the URL safety validator may resolve the hostname for SSRF checks.

| # | Feature Name | Description & Extraction Logic | Security Significance |
|---|---|---|---|
| **01** | `url_length` | Total character count of full URI string | Phishing and dropper links frequently exceed 75+ characters to conceal redirection parameters. |
| **02** | `hostname_length` | Length of fully qualified domain name (FQDN) | High length indicates dynamic DNS, domain shadowing, or multi-tenant hosting. |
| **03** | `path_length` | Character length of the parsed path | A lexical measurement; not a standalone verdict. |
| **04** | `dot_count` | Number of periods in the full URL string | Includes periods outside the hostname. |
| **05** | `hyphen_count` | Number of hyphens in the full URL string | Includes hyphens outside the hostname. |
| **06** | `digit_count` | Number of digit characters in the full URL | Counts digits across all URL components. |
| **07** | `special_character_count` | Count of non-alphanumeric characters in the full URL | Computed by the shared extraction code. |
| **08** | `subdirectory_count` | Number of non-empty path segments minus one, floored at zero | It is not a raw slash count. |
| **09** | `has_https` | Boolean indicator (1 = HTTPS, 0 = otherwise) | A lexical scheme feature, not a certificate check. |
| **10** | `query_length` | Character length of parsed query string | Not query entropy. |

---

## 3. Supporting Detection Components (External to Classifier)

To provide clear, rigorous evidence to security reviewers, PhishGuard incorporates **supporting detection components** that operate alongside the ML classifier:

1. **Brand Mismatch & Typosquatting Detection:**
   - Evaluates submitted hostnames against the local, manually curated registry in `backend/data/brand_registry.json`.
   - Detects registry-domain matches, selected ASCII lookalike-token mappings, and IDN/punycode warnings. It does not implement Levenshtein-distance matching or live brand/domain monitoring.
   - *Architectural Note:* Brand matching is an **external supporting security check**, **not a capability automatically learned by the classifier weights**. It provides orthogonal verification to protect against zero-day lookalikes.

2. **Uncertainty & Ambiguity Assessment:**
   - Computes entropy, maximum class probability, and top-two margin from the raw class distribution.
   - *Architectural Note:* A review flag is an analyst recommendation only; the application does not automatically block traffic.

---

## 4. SHAP (SHapley Additive exPlanations) Explainability

PhishGuard uses SHAP with the loaded model and feature background data to produce the top local contributions for the predicted class. The API returns the extracted vector and SHAP values in its analysis response and persisted history. No SIEM/SOAR integration is configured.

---

## 5. Security & Judicial Guidance

> **Cautionary Guidance:** Machine learning model classification is an **algorithmic risk assessment** derived from heuristic and lexical feature vectors, not an authoritative judicial determination. **ML predictions do not guarantee that a website is safe or malicious.** They serve as prioritized risk indicators to assist security analysts, automated edge firewalls, and incident response personnel in triage decision-making.

---

## 6. Interface & Theme Architecture

PhishGuard provides a responsive SecOps dashboard with full support for Light Mode and Dark Mode:

- **Dark Mode (SecOps SOC Palette):** `#090D14` obsidian canvas, `#121824` cards, emerald `#10B981` indicators, cyan `#06B6D4` accents, and rose `#F43F5E` critical threat badges.
- **Light Mode (Executive Daytime Palette):** `#F8FAFC` slate canvas, `#FFFFFF` cards, `#E2E8F0` borders, `#16A34A` green indicators, `#0891B2` cyan accents, and `#0F172A` high-contrast typography.
- **Zero-Flash Storage:** Theme preferences persist via `phishguard_theme` in `localStorage` with backward-compatible fallbacks and system `prefers-color-scheme` detection.

---

## 7. Verification & Build

- **Frontend Unit Tests:** `npm test`
- **TypeScript Static Verification:** `npm run lint` (`tsc --noEmit`)
- **Production Build:** `npm run build` (`vite build`)

## 8. Run locally

Install the root frontend dependencies once with `npm install`. In separate PowerShell terminals from the repository root:

```powershell
.venv\Scripts\python.exe -m uvicorn backend.main:app --reload --port 8000
npm run dev
```

The frontend is the root Vite application (`index.html` and `src/`); `frontend/` contains a separate extracted UI and is not used by the root startup command. The frontend defaults to `http://localhost:8000`. Set `VITE_API_URL` to override that base URL. Optionally set `PHISHGUARD_CORS_ORIGINS` to a comma-separated list of allowed frontend origins; localhost and 127.0.0.1 development origins are also allowed. The database defaults to `data/phishguard.db`; optionally set `PHISHGUARD_DATABASE_PATH` to select a different SQLite file. Initialization applies additive migrations and preserves existing rows.

The persisted model evaluation and robustness reports are read from `ml/evaluation/` and `reports/`:
- **Data Cleaning Report:** [`reports/data_cleaning_report.md`](file:///c:/Users/Vansh%20Babbar/Desktop/PhishGuard/reports/data_cleaning_report.md)
- **Model Comparison Benchmark:** [`reports/model_comparison.md`](file:///c:/Users/Vansh%20Babbar/Desktop/PhishGuard/reports/model_comparison.md)
- **Project Cleanup Audit:** [`reports/project_cleanup.md`](file:///c:/Users/Vansh%20Babbar/Desktop/PhishGuard/reports/project_cleanup.md)

To run the full test suite and reproducible ML pipelines:
```powershell
# Run all unit and integration tests (95 tests)
.\.venv\Scripts\python.exe -m pytest

# Run reproducible dataset cleaning & EDA pipeline
.\.venv\Scripts\python.exe -m ml.preprocessing.clean_dataset

# Run model comparison pipeline across all 4 candidate algorithms
.\.venv\Scripts\python.exe -m ml.training.compare_models

# Run baseline model training
.\.venv\Scripts\python.exe -m ml.training.train_model
```

