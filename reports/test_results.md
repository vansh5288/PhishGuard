# PhishGuard Test and Integration Results

## Automated checks

### Python

Command:

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

Result: **88 passed, 4 warnings**. No test failures.

Warnings were from FastAPI/Starlette's `httpx` TestClient deprecation and SHAP colormap deprecations.

Coverage included API analysis and history, uncertainty thresholds/serialization, brand registry and integration behavior, old-schema database migration, URL validation and SSRF cases, domain-split leakage controls, probability calibration separation/reproducibility, and saved-model robustness scaling consistency.

### Frontend

Commands:

```powershell
Set-Location frontend
npm run lint
npm run build
```

Result: TypeScript lint passed and Vite production build passed. Vite emitted a non-blocking advisory that the minified JavaScript chunk is larger than 500 kB.

## Live integration checks

- Started FastAPI at `http://127.0.0.1:8000` and Vite at `http://127.0.0.1:3000`; both responded successfully.
- Analyzed `https://github.com/security` in the browser. The page rendered the original legitimate-class prediction, existing risk score, SHAP feature explanation, separate GitHub domain-match assessment, and neutral higher-confidence uncertainty state.
- Analyzed `https://github.com/?x=` in the browser to exercise a naturally uncertain result from the existing model. The page rendered the exact review warning, predicted class, maximum class probability, top-two probability margin, and reason. The result retained its independent class prediction, risk score, brand assessment, SHAP explanation, and feature list.
- Opened scan history and inspected the saved record. The history detail displayed uncertainty, brand identity, feature explanation, and model inputs.
- Checked the responsive page at a narrow viewport; the measured document width did not exceed the viewport width.

The browser checks use existing live local code and real model outputs. Neither submitted test URL was fetched as webpage content by the application.

## Production artifact integrity

`models/final_model.pkl`, `models/scaler.pkl`, and `ml/data/processed/feature_names.json` were not modified. The model/scaler and feature-order checks in the full suite also passed.

## Warnings and unresolved items

- Python dependency deprecation warnings listed above remain non-failing.
- Vite's large-bundle advisory remains; no bundle-splitting change was made as part of this audit.
- The uncertainty rule is an explicit review heuristic, not a calibrated guarantee.
