# PhishGuard — Locally Trained ML Phishing URL Detection System

## 1. Project Overview

PhishGuard analyzes URLs and classifies each as legitimate, phishing, defacement, or malware. It combines a React + Vite frontend, a FastAPI backend, a trained machine-learning model, SHAP explanations, and a SQLite scan-history database.

The user enters a URL in the frontend. The backend validates and normalizes it, extracts the model's ten URL features, returns a four-class prediction and probabilities, computes a SHAP explanation, and stores the result and exact feature values in SQLite.

Phishing classification is produced by the locally trained model loaded from `models/final_model.pkl`. FastAPI exposes that local Python inference pipeline to the frontend; no external AI prediction service or API key is required.

## 2. Problem Statement

Phishing attacks are one of the most common cyber-security threats. Attackers create deceptive URLs that imitate trusted services such as banking, payment portals, and social platforms. These URLs are often visually similar to legitimate domains, but they are designed to steal credentials or spread malware.

Manual inspection of URLs is not scalable, and simple rule-based checks are often insufficient. Automated detection using machine learning helps detect suspicious patterns such as unusual URL length, repeated subdirectories, raw IP usage, missing HTTPS, suspicious lexical patterns, and excessive special characters.

## 3. Objectives

The project implements the following objectives:

- Classify URLs into legitimate, phishing, defacement, or malware.
- Validate URLs before model processing.
- Extract meaningful URL-based lexical and structural features.
- Train and use a machine learning classifier for classification.
- Provide model explainability using SHAP.
- Expose a FastAPI backend for analysis, history, deletion, and statistics.
- Store scan results in a local SQLite database.
- Provide a frontend dashboard for analysis, history, and statistics.
- Protect the backend from invalid or unsafe URLs and SSRF-style targets.

## 4. Features

The implemented project includes the following actual features:

- Frontend dashboard and analysis forms
- URL analysis using the live FastAPI backend
- Real-time prediction and probability output
- Scan history display
- Detailed scan inspection modal
- Statistics dashboard
- SHAP-based explanation of feature contributions
- SQLite database persistence for scan records
- URL validation to reject invalid or internal/private targets
- CORS support for frontend-to-backend communication

## 5. Technology Stack

### Frontend
- React
- Vite
- TypeScript
- Tailwind CSS-inspired styling
- Recharts for dashboard charts

### Backend
- FastAPI
- Python
- Pydantic models
- SQLite

### Machine Learning
- Python data stack: pandas, numpy
- scikit-learn
- Four-class Logistic Regression as the final model
- StandardScaler for feature scaling

### Explainability
- SHAP

### Database
- SQLite via Python sqlite3

## 6. System Architecture

Frontend
↓
FastAPI backend
↓
URL validation and safety checks
↓
Feature extraction
↓
ML model
↓
Prediction and probability output
↓
SHAP explanation
↓
SQLite scan history database
↓
Frontend display of results and analytics

## 7. ML Pipeline

The actual project pipeline is:

Dataset
↓
Cleaning and validation
↓
EDA and profile analysis
↓
Feature engineering
↓
Train/test split
↓
Model training
↓
Model evaluation
↓
Final model selection
↓
Prediction and SHAP explanation

The project includes ML preprocessing and EDA scripts in the ml/ directory, and the model artifacts are saved in the models/ directory.

The active source is [ml/data/raw/malicious_phish.csv](ml/data/raw/malicious_phish.csv) (651,191 rows). Its source labels are `benign`, `phishing`, `defacement`, and `malware`. The cleaner normalized scheme-less URLs to HTTP for processing, removed duplicate or conflicting URL records and invalid records, and retained 632,912 rows: 423,980 legitimate, 90,002 phishing, 95,285 defacement, and 23,645 malware. The original source CSV was not edited.

## 8. Features Used

The actual feature set used in the model is stored in the file [ml/data/processed/feature_names.json](ml/data/processed/feature_names.json) and matches the model bundle in [models/final_model.pkl](models/final_model.pkl).

The actual features are:

- url_length
- hostname_length
- path_length
- dot_count
- hyphen_count
- digit_count
- special_character_count
- subdirectory_count
- has_https
- query_length

These are URL- and domain-structure features derived from the submitted URL.

## 9. Model

The final trained model saved in the project is a Logistic Regression classifier with StandardScaler preprocessing.

This is verified from the saved model bundle in [models/final_model.pkl](models/final_model.pkl):

- Model type: LogisticRegression
- Scaler: StandardScaler
- Feature count: 10

The model was trained on 506,329 rows and evaluated on a stratified 126,583-row holdout set. The reported precision, recall, F1, ROC-AUC, and PR-AUC are macro-averaged across the four classes. Actual values are recorded in [ml/data/processed/model_results.csv](ml/data/processed/model_results.csv):

- Accuracy: 0.6236
- Macro precision: 0.5645
- Macro recall: 0.6821
- Macro F1-score: 0.5843
- Macro ROC-AUC (one-vs-rest): 0.8382
- Macro PR-AUC: 0.5843
- Training time: 6.0158 seconds
- Mean prediction time: 0.0000002532 seconds per test row

The test confusion matrix is available in [ml/data/processed/confusion_matrix.csv](ml/data/processed/confusion_matrix.csv).

The project’s final loaded model is Logistic Regression.

## 10. Explainable AI

SHAP is used for model explainability in the backend. In [backend/main.py](backend/main.py), the project loads the trained model and constructs an explainer based on the model type:

- Linear model: shap.LinearExplainer
- Tree-based model: shap.TreeExplainer
- Other model types: shap.Explainer

For each analyzed URL, the system computes class-specific SHAP values for the predicted class and returns the five largest absolute contributions. Each explanation item contains:

- feature
- value
- shap_value
- impact

This allows users to understand which URL characteristics contributed most strongly to the phishing decision.

## 11. API

The actual API is implemented in [backend/main.py](backend/main.py).

### Endpoints

- GET /
  - Returns: {"message": "PhishGuard API is running"}

- POST /api/analyze
  - Input: `{"url": "https://example.com"}` (example value)
  - Output includes: scan_id, url, prediction, predicted-class probability, malicious probability, exact model feature values, risk, explanation, and created_at

- GET /api/history
  - Returns scan list and total count as {"scans": [...], "total": ...}

- GET /api/history/{scan_id}
  - Returns a single scan record

- DELETE /api/history/{scan_id}
  - Deletes a scan and returns a success message

- GET /api/stats
  - Returns aggregated scan statistics

## 12. Database

The application uses SQLite.

Database setup is in [backend/database/database.py](backend/database/database.py). The table is created as:

- scans
  - id INTEGER PRIMARY KEY AUTOINCREMENT
  - url TEXT NOT NULL
  - prediction TEXT NOT NULL
  - probability REAL NOT NULL — probability of the predicted class
  - malicious_probability REAL NOT NULL — one minus the legitimate-class probability
  - features_json TEXT — the exact ten unscaled feature values used for inference
  - risk TEXT NOT NULL
  - created_at TEXT NOT NULL

This stores a record for every scan performed through the UI or API. Existing databases are migrated to add the malicious-probability and feature-value columns.

## 13. Security

The backend validates URLs before processing them. The main validation logic is in [backend/security/validator.py](backend/security/validator.py).

Actual protections include:

- Rejects empty or whitespace-containing URLs
- Rejects URLs missing an HTTP/HTTPS scheme
- Rejects malformed URLs
- Rejects localhost and empty hostnames
- Rejects private, loopback, link-local, reserved, multicast, or unspecified IP addresses
- Rejects invalid hostnames and unreachable DNS resolution cases
- Enforces a maximum length constraint

This prevents unsafe URLs and reduces SSRF-style abuse risk when evaluating externally supplied URLs.

## 14. Project Structure

Important project folders/files:

- [frontend/](frontend/) — existing React + Vite application
- [frontend/src/main.tsx](frontend/src/main.tsx) — frontend entry point
- [frontend/src/App.tsx](frontend/src/App.tsx) — app-level flow and tab state
- [frontend/src/services/api.ts](frontend/src/services/api.ts) — API client layer
- [frontend/index.html](frontend/index.html) — Vite HTML entry point
- [frontend/vite.config.ts](frontend/vite.config.ts) — Vite and React/Tailwind configuration
- [frontend/tsconfig.json](frontend/tsconfig.json) — TypeScript configuration
- [frontend/src/pages/AnalyzePage.tsx](frontend/src/pages/AnalyzePage.tsx) — URL analysis UI
- [frontend/src/pages/HistoryPage.tsx](frontend/src/pages/HistoryPage.tsx) — scan history UI
- [frontend/src/pages/DashboardPage.tsx](frontend/src/pages/DashboardPage.tsx) — metrics dashboard
- [frontend/src/pages/AnalyticsPage.tsx](frontend/src/pages/AnalyticsPage.tsx) — charts and analytics
- [backend/main.py](backend/main.py) — FastAPI backend entry point
- [backend/database/database.py](backend/database/database.py) — SQLite setup
- [backend/security/validator.py](backend/security/validator.py) — URL safety validation
- [ml/preprocessing/clean_dataset.py](ml/preprocessing/clean_dataset.py) — dataset cleaning and EDA logic
- [ml/preprocessing/url_features.py](ml/preprocessing/url_features.py) — shared normalization and canonical feature extraction
- [ml/training/train_model.py](ml/training/train_model.py) — single training and evaluation runner used by the notebook
- [ml/data/raw/malicious_phish.csv](ml/data/raw/malicious_phish.csv) — active raw four-class dataset
- [ml/data/processed/feature_names.json](ml/data/processed/feature_names.json) — model feature list
- [ml/data/processed/feature_dataset.csv](ml/data/processed/feature_dataset.csv) — engineered feature dataset
- [ml/data/processed/model_results.csv](ml/data/processed/model_results.csv) — evaluation results
- [models/final_model.pkl](models/final_model.pkl) — final trained model bundle
- [tests/test_api.py](tests/test_api.py) — API contract tests
- [tests/test_features.py](tests/test_features.py) — feature sanity tests
- [tests/test_model.py](tests/test_model.py) — model validation tests
- [requirements.txt](requirements.txt) — Python dependencies
- [frontend/package.json](frontend/package.json) — frontend dependencies and scripts
- [frontend/package-lock.json](frontend/package-lock.json) — npm dependency lockfile
- [data/phishguard.db](data/phishguard.db) — SQLite database

## 15. Installation

Install Python dependencies:

```bash
python -m pip install -r requirements.txt
```

Install frontend dependencies:

```bash
cd frontend
npm install
```

## 16. Running the Project

### Backend

```bash
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

Or, if using a Unix-like environment:

```bash
uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

### Frontend

```bash
cd frontend
npm run dev
```

The frontend reads `VITE_API_URL` from the project-root `.env` file (Vite exposes only `VITE_`-prefixed values to browser code). If it is unset, the API client falls back to `http://localhost:8000`. The frontend calls the local FastAPI endpoint; neither it nor the backend calls Gemini, OpenAI, Anthropic, or another external AI prediction service. `GEMINI_API_KEY` and other external AI keys are not required.

## 17. Example API Request

Example request (sample URL only):

```json
{
  "url": "https://github.com/security"
}
```

Example response (values are examples only):

```json
{
  "scan_id": 5,
  "url": "https://github.com/security",
  "prediction": "LEGITIMATE",
  "probability": 0.9984,
  "malicious_probability": 0.0016,
  "features": {
    "url_length": 27,
    "hostname_length": 10,
    "path_length": 9,
    "dot_count": 1,
    "hyphen_count": 0,
    "digit_count": 0,
    "special_character_count": 5,
    "subdirectory_count": 0,
    "has_https": 1,
    "query_length": 0
  },
  "risk": "SAFE",
  "explanation": [
    {
      "feature": "has_https",
      "value": 1.0,
      "shap_value": -2.06,
      "impact": "negative"
    }
  ],
  "created_at": "2026-10-06T20:00:00"
}
```

## 18. Limitations

The project has genuine limitations:

- It is URL-based and does not inspect the full HTML content of a website.
- The current feature set is focused on lexical and structural URL characteristics.
- The model is trained on the project dataset and is not a production-grade internet-scale classifier.
- The validation focuses on URL safety and basic SSRF risk checks, not full browser interaction or sandboxing.
- The measured four-class metrics are moderate and do not establish production readiness; the dataset and held-out split may not represent future URL distributions.

## 19. Future Scope

Realistic future improvements include:

- Add HTML content and DOM-based phishing detection.
- Add reputation-based or WHOIS-based checks.
- Use larger, more diverse phishing datasets.
- Add more model comparison and ensemble approaches.
- Add user authentication and admin dashboard features.
- Add deployment support with Docker and cloud hosting.

## 20. B.Tech Project Report Content

### 1. Abstract
PhishGuard is a URL classification system that distinguishes legitimate, phishing, defacement, and malware URLs. It uses ten URL features, Logistic Regression, SHAP, a FastAPI backend, a React frontend, and SQLite scan history.

### 2. Introduction
Phishing is a common cyber-security threat that tricks users into visiting fake websites or submitting sensitive information. The project addresses this problem by building an automated detection system using machine learning and explainable AI.

### 3. Problem Statement
Phishing URLs often mimic trusted brands, use misleading domain structures, and exploit user trust. A fast automated detection system is necessary to reduce risk and improve awareness.

### 4. Objectives
To detect phishing URLs, extract relevant features, train a reliable classifier, explain predictions, build API access, and provide a usable frontend interface.

### 5. Literature/Background
The project follows supervised multiclass learning using URL-based lexical and structural features. SHAP provides class-specific explanations for the predicted class. No external literature citations are embedded in the source project.

### 6. Proposed System
The proposed system accepts a URL, validates it, extracts features, runs a trained model, returns prediction and probability, stores the scan, and presents the result alongside SHAP-based explanations.

### 7. System Architecture
Frontend → API → Validation → Feature extraction → Model → Explanation → SQLite database → UI

### 8. Methodology
The project cleans the four-class source dataset, normalizes scheme-less URLs to HTTP, creates the canonical ten-feature vector, performs a stratified 80/20 train/test split, trains a class-weighted Logistic Regression model with StandardScaler, evaluates it, and explains live predictions with SHAP.

### 9. Dataset
The active dataset is [ml/data/raw/malicious_phish.csv](ml/data/raw/malicious_phish.csv), containing 651,191 source rows with `url` and `type` columns and four source classes. Cleaning retained 632,912 rows. The older 1,000-row dataset is archived at [ml/data/archive/url_phishing_dataset_1000.csv](ml/data/archive/url_phishing_dataset_1000.csv) and is not used to train the current model.

### 10. Data Preprocessing
The data is cleaned and processed using [ml/preprocessing/clean_dataset.py](ml/preprocessing/clean_dataset.py), including URL validation, label normalization, and deduplication steps.

### 11. Feature Engineering
Key URL/domain features include URL length, hostname length, path length, dot count, hyphen count, digit count, special-character count, subdirectory count, HTTPS indicator, and query length.

### 12. Machine Learning Models
The current training runner fits the selected Logistic Regression classifier with `class_weight="balanced"` and StandardScaler preprocessing for the four classes. The current run is not a comparison among multiple estimators.

### 13. Model Evaluation
The held-out test results are: accuracy 0.6236, macro precision 0.5645, macro recall 0.6821, macro F1 0.5843, macro ROC-AUC 0.8382, and macro PR-AUC 0.5843. The confusion matrix and full metric output are in `ml/data/processed/`.

### 14. Explainable AI
The backend computes SHAP contributions for the predicted class, sorts by absolute magnitude, and returns the top five feature contributions. SHAP supports explanations; it does not establish that the model is correct.

### 15. Backend/API
The backend exposes the analysis and history endpoints implemented in [backend/main.py](backend/main.py).

### 16. Database
The scan history is stored in SQLite using the scans table created in [backend/database/database.py](backend/database/database.py).

### 17. Security
The project validates input URLs and rejects unsafe/private loopback addresses using [backend/security/validator.py](backend/security/validator.py).

### 18. Frontend
The frontend is built with React + Vite and presents the dashboard, analysis flow, history, and analytics screens.

### 19. Results
Actual results currently available in the project output:

- Accuracy: 0.6236
- Macro precision: 0.5645
- Macro recall: 0.6821
- Macro F1-score: 0.5843
- Macro ROC-AUC: 0.8382
- Macro PR-AUC: 0.5843
- Confusion Matrix: available in [ml/data/processed/confusion_matrix.csv](ml/data/processed/confusion_matrix.csv)
- Training time: 6.0158 seconds for the recorded training run
- Mean prediction time: 0.0000002532 seconds per held-out test row

Confusion matrix (rows are actual labels; columns are predicted labels), from `ml/data/processed/confusion_matrix.csv`:

| Actual \ Predicted | Legitimate | Phishing | Defacement | Malware |
|---|---:|---:|---:|---:|
| Legitimate | 50,662 | 24,327 | 7,425 | 2,382 |
| Phishing | 2,459 | 12,999 | 1,059 | 1,484 |
| Defacement | 2,947 | 4,376 | 11,458 | 276 |
| Malware | 238 | 545 | 127 | 3,819 |

### 20. Limitations
The project is limited to URL-based analysis and a single dataset structure; it does not perform full browser-based inspection or large-scale deployment monitoring.

### 21. Future Scope
Add richer feature extraction, deeper classification, better deployment readiness, and real-world validation.

### 22. Conclusion
PhishGuard demonstrates a working phishing URL detection pipeline using machine learning, explainability, backend APIs, and a frontend user interface.

### 23. References
This project does not include external research citations in a formal report file. Any formal reference list should be added manually by the student based on the project source material and the relevant machine learning and cybersecurity references used during development.

## 21. Screenshot Checklist

Recommended screenshots to capture manually:

1. Landing/Dashboard
2. URL analysis screen
3. Legitimate URL result
4. Phishing URL result
5. SHAP explanation
6. Scan history
7. Scan details
8. Dashboard statistics
9. ML evaluation results
10. Confusion matrix
11. SHAP global explanation
12. API documentation / Swagger
13. Project folder structure

Note: These screenshots should be captured manually from the running project; they are not generated as part of the repository content.

## 22. PPT Content Outline

Slide 1 — Title

Slide 2 — Problem Statement

Slide 3 — Motivation

Slide 4 — Objectives

Slide 5 — Existing System

Slide 6 — Proposed System

Slide 7 — System Architecture

Slide 8 — Dataset & Preprocessing

Slide 9 — Feature Engineering

Slide 10 — ML Models

Slide 11 — Model Evaluation

Slide 12 — SHAP Explainable AI

Slide 13 — FastAPI Backend

Slide 14 — Database & Scan History

Slide 15 — Frontend

Slide 16 — Security

Slide 17 — Results & Demo

Slide 18 — Conclusion & Future Scope

## 23. Viva Questions and Answers

### Basic questions

1. Question: What does PhishGuard do?
   Short viva-friendly answer: It classifies a URL as legitimate, phishing, defacement, or malware.

2. Question: Why is phishing detection important?
   Short viva-friendly answer: Because phishing attacks trick users into revealing passwords or financial information.

3. Question: Why use machine learning?
   Short viva-friendly answer: Because many malicious URLs have patterns that are hard to spot manually but can be learned from data.

4. Question: What features are used?
   Short viva-friendly answer: URL length, number of dots, hyphen count, subdirectories, HTTPS status, and other structural features.

5. Question: What is the frontend used for?
   Short viva-friendly answer: It lets the user enter a URL and view predictions, SHAP output, and history.

6. Question: What does the backend do?
   Short viva-friendly answer: It validates the URL, extracts features, runs the model, and stores scan results.

7. Question: Why store history?
   Short viva-friendly answer: To review past analyses, compare results, and show dashboard statistics.

8. Question: What is SQLite?
   Short viva-friendly answer: It is a lightweight database used for local persistent storage.

9. Question: What is SHAP?
   Short viva-friendly answer: It explains which features contributed most to a prediction.

10. Question: What is the main limitation of this project?
   Short viva-friendly answer: It focuses on URL-based features and does not perform deep page-content or browser-based analysis.

### ML questions

1. Question: What is the final model used in the project?
   Short viva-friendly answer: Logistic Regression with StandardScaler.

2. Question: Why was this model selected?
   Short viva-friendly answer: It is the final saved model in the project and performs well on the current dataset.

3. Question: Why not use only accuracy?
   Short viva-friendly answer: Accuracy alone may hide class imbalance; precision, recall, F1, and ROC-AUC are also important.

4. Question: What is precision?
   Short viva-friendly answer: For a class, precision is the share of predictions for that class that are correct; the reported project metric is macro precision.

5. Question: What is recall?
   Short viva-friendly answer: For a class, recall is the share of actual examples of that class that were found; the reported project metric is macro recall.

6. Question: What is F1-score?
   Short viva-friendly answer: It balances precision and recall.

7. Question: What is ROC-AUC?
   Short viva-friendly answer: It measures how well predicted class probabilities separate the four classes; this project reports macro one-vs-rest ROC-AUC.

8. Question: What is PR-AUC?
   Short viva-friendly answer: It summarizes precision and recall over thresholds; this project reports macro PR-AUC across its four classes.

9. Question: Why is train/test evaluation important?
   Short viva-friendly answer: It helps check whether the model generalizes beyond the training data.

10. Question: What do you mean by model generalization?
   Short viva-friendly answer: It means the model performs well on new data, not just on the training set.

### Feature engineering questions

1. Question: What is feature engineering?
   Short viva-friendly answer: It is the process of converting raw data into meaningful inputs for the model.

2. Question: Why use URL length as a feature?
   Short viva-friendly answer: Phishing URLs are often longer and more complex than legitimate ones.

3. Question: Why check hyphen count?
   Short viva-friendly answer: Many phishing domains use hyphenated brand mimicry.

4. Question: Why check subdirectory count?
   Short viva-friendly answer: It helps detect deep or suspicious URL paths.

5. Question: Why check HTTPS status?
   Short viva-friendly answer: Many legitimate sites use HTTPS, but phishing links may not.

6. Question: Why count digits and special characters?
   Short viva-friendly answer: Suspicious URLs often use extra digits or symbols.

7. Question: Why is query length useful?
   Short viva-friendly answer: Unusual or large query strings can indicate tracking or malicious behavior.

8. Question: How do you extract features?
   Short viva-friendly answer: The URL is parsed using Python’s URL parsing utilities and numeric features are computed from the URL structure.

9. Question: Why is feature ordering important?
   Short viva-friendly answer: The model expects features in a fixed order; a mismatch can produce wrong predictions.

10. Question: What is the role of feature names JSON?
   Short viva-friendly answer: It keeps the feature array consistent between training and inference.

### SHAP questions

1. Question: What is SHAP?
   Short viva-friendly answer: SHAP explains which features most affected a prediction using contribution values.

2. Question: Why is explainability important?
   Short viva-friendly answer: It increases trust and makes it easier to understand the model’s decision.

3. Question: How is SHAP used in this project?
   Short viva-friendly answer: The backend computes SHAP values for the analyzed URL and returns the largest contributing features.

4. Question: Why not only show the prediction?
   Short viva-friendly answer: Users need to understand why a URL was flagged, not just what the model said.

5. Question: What does a negative SHAP value mean?
   Short viva-friendly answer: It pushes the prediction toward the legitimate class.

6. Question: What does a positive SHAP value mean?
   Short viva-friendly answer: It pushes the prediction toward phishing.

7. Question: Why are top contributions displayed?
   Short viva-friendly answer: They are the strongest signals and most useful for human interpretation.

8. Question: Does SHAP change the model?
   Short viva-friendly answer: No, it explains the model after prediction.

9. Question: Is SHAP model-agnostic?
   Short viva-friendly answer: In this project, the logic is adapted to the saved model type and uses SHAP explainers accordingly.

10. Question: Why is this useful in cybersecurity?
   Short viva-friendly answer: Security analysts can see which URL patterns are causing a phishing classification.

### FastAPI/backend questions

1. Question: What backend framework is used?
   Short viva-friendly answer: FastAPI.

2. Question: What does the backend do before prediction?
   Short viva-friendly answer: It validates the URL and checks safety constraints.

3. Question: What happens after validation?
   Short viva-friendly answer: It extracts features, calls the model, and returns prediction + explanation.

4. Question: How does the API store scan information?
   Short viva-friendly answer: It inserts the result into the SQLite scans table.

5. Question: What are the main endpoints?
   Short viva-friendly answer: /, /api/analyze, /api/history, /api/history/{id}, /api/stats, and delete history access.

6. Question: Why is FastAPI a good choice?
   Short viva-friendly answer: It is lightweight, fast, easy to define routes in, and works well with Python ML projects.

7. Question: How are API errors handled?
   Short viva-friendly answer: Invalid URLs produce 400 errors and missing scan records produce 404 errors.

8. Question: What is the root endpoint used for?
   Short viva-friendly answer: It confirms that the API is running.

9. Question: How does the app show the model output on the frontend?
   Short viva-friendly answer: The frontend calls the API and renders prediction, probability, and explanation.

10. Question: Is the backend doing the model work directly?
   Short viva-friendly answer: Yes, the backend loads the trained model and performs prediction using the extracted features.

### Database questions

1. Question: Which database is used?
   Short viva-friendly answer: SQLite.

2. Question: Why use SQLite here?
   Short viva-friendly answer: It is simple, local, and suitable for a small project with scan history.

3. Question: What table is used?
   Short viva-friendly answer: scans.

4. Question: What information is stored?
   Short viva-friendly answer: URL, prediction, probability, risk, and created_at.

5. Question: How is history retrieved?
   Short viva-friendly answer: The backend reads rows from the scans table and returns them to the frontend.

6. Question: What happens when a scan is deleted?
   Short viva-friendly answer: The database row is removed and the API returns a success message.

7. Question: Where is the database file stored?
   Short viva-friendly answer: In the data/ directory as phishguard.db.

8. Question: Why is the database important?
   Short viva-friendly answer: It lets the app maintain a persistent history and statistics page.

9. Question: Does the database store model artifacts?
   Short viva-friendly answer: No, only scan records are stored there.

10. Question: Can multiple users run it at once?
   Short viva-friendly answer: In this local project version, it is a simple SQLite database, so the main focus is a single local deployment.

### Security questions

1. Question: Why validate the URL before prediction?
   Short viva-friendly answer: To reject malformed or unsafe requests before using them in the model.

2. Question: What does the validator reject?
   Short viva-friendly answer: Empty URLs, unsupported protocols, invalid hostnames, and private/local IP addresses.

3. Question: How does it prevent SSRF-style issues?
   Short viva-friendly answer: It blocks private and loopback destinations and resolves hosts to verify they are not local addresses.

4. Question: What is an invalid URL handled as?
   Short viva-friendly answer: The API sends a 400 error with an invalid URL response.

5. Question: What happens if the URL is unreachable?
   Short viva-friendly answer: The project does not fetch the website itself; it validates the URL at the parsing and network-structure level and rejects unsafe cases without browsing the page.

6. Question: Is the app checking live website content?
   Short viva-friendly answer: No, the current project focuses on URL-based classification.

7. Question: Why is input length restricted?
   Short viva-friendly answer: To avoid oversized malicious inputs and reduce abuse risk.

8. Question: Why reject whitespace in the URL?
   Short viva-friendly answer: Such values are commonly malformed and not safe for processing.

9. Question: Why reject localhost or private IPs?
   Short viva-friendly answer: These addresses are usually internal and can indicate unsafe or non-public targets.

10. Question: Is this a complete security system?
   Short viva-friendly answer: It is a practical validation layer for this project, not a full enterprise web-security system.

### Project-specific questions

1. Question: Why did you choose phishing URL detection?
   Short viva-friendly answer: Because phishing is a serious cyber-security issue and URL-based detection is practical and easy to build as a project.

2. Question: Why machine learning?
   Short viva-friendly answer: Because patterns in phishing URLs can be learned from data and reused automatically.

3. Question: Why these features?
   Short viva-friendly answer: They capture measurable URL length, host/path structure, character counts, HTTPS, and query patterns available without downloading the page.

4. Question: Why was the final model selected?
   Short viva-friendly answer: Logistic Regression is the selected deployed model; its actual held-out metrics are recorded in the project, and they are not perfect.

5. Question: Why not use only accuracy?
   Short viva-friendly answer: Because accuracy alone can be misleading, especially in classification tasks where class balance matters.

6. Question: What is precision?
   Short viva-friendly answer: For one class, it is the proportion of that class's predictions that are correct.

7. Question: What is recall?
   Short viva-friendly answer: For one class, it is the proportion of actual examples of that class that the model identifies.

8. Question: What is F1-score?
   Short viva-friendly answer: It gives a balanced view of precision and recall.

9. Question: What is SHAP?
   Short viva-friendly answer: It shows which features contributed to the decision.

10. Question: How does a URL get analyzed?
   Short viva-friendly answer: The frontend sends it to the backend; the backend validates, extracts features, runs the model, computes the explanation, and returns the result.

## 24. 2-Minute Viva Explanation

PhishGuard classifies submitted URLs into four categories: legitimate, phishing, defacement, and malware. A user enters a URL, and the FastAPI backend normalizes a missing scheme to HTTP, validates the destination, and extracts the same ten URL features used during training. Those values are scaled and passed to a Logistic Regression classifier. The API returns the predicted class probability and a separate malicious probability, which is one minus the probability of the legitimate class.

The backend also computes SHAP contributions for the selected class, so the result includes the most influential input features rather than a generic rule-based explanation. Scan results and the exact feature vector are stored in SQLite and can be reviewed through history and statistics endpoints. The React frontend presents the prediction, confidence, SHAP explanation, and prior scans. The current classifier analyzes URL text only; it does not fetch or inspect page HTML.

## 25. 5-Minute Demo Script

1. Start backend.
   Student says: “I will start the FastAPI backend first so the ML prediction service is ready.”

2. Start frontend.
   Student says: “Now I will launch the React frontend so the dashboard is ready for analysis.”

3. Open dashboard.
   Student says: “This is the dashboard showing the main interface and access to analysis and history.”

4. Enter a URL.
   Student says: “I will enter a suspected phishing URL to test the system.”

5. Run analysis.
   Student says: “The frontend sends the URL to the backend, which validates it and runs the model.”

6. Explain prediction.
   Student says: “The classifier assigns this URL to one of four labels: legitimate, phishing, defacement, or malware. The label shown here is the model's predicted class.”

7. Explain probability.
   Student says: “This confidence is the probability of the predicted class. The malicious probability is a separate score calculated as one minus the probability of the legitimate class.”

8. Show SHAP explanation.
   Student says: “These are the largest SHAP contributions for the predicted class. The feature cards show the actual ten values used by the model.”

9. Open history.
   Student says: “The backend stores each scan in the SQLite database, and the history page lists all past results.”

10. Open scan details.
    Student says: “This details view shows the actual scan record, including the URL, classification, timestamp, and risk information.”

11. Show statistics.
    Student says: “The statistics page summarizes the four predicted classes and shows the saved model's held-out evaluation metrics.”

12. Explain architecture.
    Student says: “The flow is frontend → backend → validation → feature extraction → model → SHAP → database → UI.”

## 26. Final Project Checklist

- [ ] Frontend runs
- [ ] Backend runs
- [ ] Database works
- [ ] Model loads
- [ ] Feature extraction works
- [ ] Prediction works
- [ ] Probability works
- [ ] SHAP works
- [ ] History works
- [ ] Delete works
- [ ] Statistics work
- [ ] Security validation works
- [ ] Invalid URL handled
- [ ] CORS works
- [ ] No fake data
- [ ] No mock API
- [ ] README complete
- [ ] PPT content ready
- [ ] Report content ready
- [ ] Viva questions ready
- [ ] Demo flow ready

## 27. Final Notes

This README is based only on the actual implemented project. It intentionally avoids inventing metrics, screenshots, features, or architecture not present in the repository.
