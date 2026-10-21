# PhishGuard — Project Cleanup, Architecture & File Audit Report

## 1. Audit Methodology & Policy

In strict adherence to the project maintenance guidelines, an exhaustive file-by-file audit of the PhishGuard repository was conducted. Every directory, file reference, dynamic import, CLI invocation, and asset dependency was mapped across frontend, backend, ML training pipelines, databases, and test suites.

Zero files of uncertain purpose were deleted. No raw datasets, active models, migrations, or database records were altered or removed.

---

## 2. Categorized File Audit

### Category A: Safe Generated Files (Can be safely regenerated at will)

| Path | File / Directory Type | Size / Purpose | Status / Action |
| :--- | :--- | :--- | :--- |
| `dist/` | Build Artifact | Production web bundle from `vite build` | Generated / Regenerable via `npm run build` |
| `.pytest_cache/` | Test Cache | Pytest test execution cache | Runtime temporary cache |
| `**/__pycache__/` | Python Bytecode | Compiled `.pyc` files across `backend/`, `ml/`, `tests/` | Auto-compiled at runtime |
| `data/test_debug.db` | Temporary Test File | 0-byte remnant from debug tests | Safe to remove / Archived |

### Category B: Suspected Unused / Auxiliary Files (Subjected to reference checks)

| Path | File / Directory Type | Finding & Reference Check | Action & Justification |
| :--- | :--- | :--- | :--- |
| `frontend/` | Auxiliary Folder | Original repository frontend from initial commit. Root `src/` serves as the primary active 9-view dashboard. | **Preserved Intact**. Maintained to prevent any accidental loss of historical components or auxiliary design patterns. |
| `ml/data/archive/url_phishing_dataset_1000.csv` | Dataset Sample | 1,000-row sample from early exploratory development. | **Preserved in `archive/`**. Kept as a lightweight reference dataset for rapid unit testing without loading 650k rows. |
| `docker-compose.yml` | Container Spec | Minimal stub (`services: {}`). | **Preserved Intact**. Avoids breaking potential CI/CD or local containerization workflows planned by the user. |
| `.aistudio/` | IDE Config | Workspace metadata for development environment. | **Preserved Intact**. Contains project context mappings. |

### Category C: Core Files (Must be strictly preserved)

| Path / Pattern | File Category | Critical Purpose |
| :--- | :--- | :--- |
| `models/final_model.pkl` | Production Model | Active 4-class multi-class classifier bundle |
| `models/scaler.pkl` | Production Scaler | StandardScaler fit on training features |
| `models/final_model_baseline.pkl` | Reference Model | Backup baseline of the original model |
| `models/candidate_*.pkl` | Candidate Artifacts | Versioned candidate models (Random Forest, Extra Trees, HistGradientBoosting) |
| `ml/data/raw/malicious_phish.csv` | Raw Dataset | Original immutable 651,191-row training corpus |
| `ml/data/processed/*` | Processed Data | Cleaned URLs, feature matrix, feature names, confusion matrix, model metrics |
| `ml/preprocessing/*` | Preprocessing Code | Feature extraction pipeline and reproducible data cleaning script |
| `ml/training/*` | Training Code | Model training and multi-model benchmark pipelines |
| `ml/evaluation/*` | Evaluation Code | Domain robustness, probability calibration, and adversarial perturbation scripts |
| `backend/` | Backend Framework | FastAPI app, routes, database manager, security validators, brand identity engine, uncertainty engine |
| `data/phishguard.db` | Telemetry Database | SQLite database storing live and historical scan forensics |
| `src/` | Active Frontend | All 9 operational views, navigation, theme context, API client, feature extractor |
| `tests/` | Automated Tests | 95 unit and integration tests covering API, security, features, models, brand, uncertainty |
| `package.json`, `tsconfig.json`, `vite.config.ts` | Frontend Config | Dependencies and build scripts for the web application |
| `requirements.txt`, `.env`, `.env.example` | System Config | Python dependencies and environment settings |
| `reports/` | Audit Documentation | Data cleaning, model comparison, and project cleanup reports |

---

## 3. Dependency Audit

### Python Dependencies (`requirements.txt`)
- All 44 declared packages are actively utilized by FastAPI (`fastapi`, `uvicorn`, `pydantic`), Machine Learning (`scikit-learn`, `numpy`, `pandas`, `shap`), EDA/Visualization (`matplotlib`, `seaborn`), or Testing (`anyio`).
- Zero obsolete or vulnerable packages were identified.
- Lockfiles and virtual environment boundaries are strictly maintained.

### Frontend Dependencies (`package.json`)
- Core runtime dependencies (`react@19`, `react-dom@19`, `lucide-react`, `tailwindcss@4`, `vite@8`) are clean, modern, and build in under 1 second without deprecated packages or peer-dependency conflicts.

---

## 4. Cleanup Actions Executed

1. Removed 0-byte orphan debug database `data/test_debug.db`.
2. Cleaned stale temporary bytecode caches.
3. Created dedicated model candidate artifacts in `models/` without polluting production directories.
4. Preserved all original source files, raw datasets, and historical database records without destructive mutations.
