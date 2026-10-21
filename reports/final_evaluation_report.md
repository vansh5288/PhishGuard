# PhishGuard Final Integration Audit

## Scope and outcome

The audit covered four-class inference, the production feature contract and model artifact, SHAP output, brand identity statuses, uncertainty display and persistence, legacy database migration, optional frontend fields, URL/SSRF validation, offline experiment behavior, and application build/test checks.

**Outcome:** all final automated checks passed and the application was exercised through the local frontend and FastAPI backend. The experiments remain research-only; their results do not change production inference or establish live-world performance.

## Integration findings

- Live inference retains the four classes: legitimate, phishing, defacement, and malware.
- The ten-feature order remains `url_length`, `hostname_length`, `path_length`, `dot_count`, `hyphen_count`, `digit_count`, `special_character_count`, `subdirectory_count`, `has_https`, `query_length`.
- Neither `models/final_model.pkl` nor `models/scaler.pkl` nor `ml/data/processed/feature_names.json` was changed. Their checked SHA-256 values were, respectively, `2f688f40bd7fe0e70511ecb17d1d39934584cd327ad0f95751fc882fc73e1d03`, `eabb86badeab34fc7c609940d17c2fc66b8531ebf31409119d4adaba023b0e34`, and `8bad54c9259660fcc78d2bb539cc6006478be071add056c0a5c7e5365a9288cd`.
- SHAP feature explanations were present in live analysis and history detail; they remain tied to the existing classifier and are displayed separately from the brand signal, uncertainty assessment, and risk score.
- Brand matching, possible impersonation, unknown/no-signal, and registry-error handling are covered by tests. The live browser displayed a GitHub domain match independently of the model result.
- An uncertain live prediction displayed the required “ML prediction uncertain — additional verification recommended.” warning, class, maximum probability, top-two margin, and review reason. It remained distinct from the original class prediction and the risk score. A higher-confidence result is described as not guaranteed safe.
- History detail renders both uncertainty and brand data. Tests exercise migration from a pre-brand database schema and old records lacking uncertainty information; unavailable legacy assessments remain unavailable instead of receiving fabricated values.
- URL validation continues to reject private, loopback, reserved, blocked-local, and DNS-resolution-failure destinations. The validator does not fetch page content. No evaluation script visited, crawled, or fetched dataset URLs.
- The saved-model robustness evaluator was corrected so classification metrics, baseline sensitivity predictions, and perturbed inputs all use the same scaler transformation.

## Validation

| Check | Result |
|---|---|
| Full Python suite | `88 passed`; 4 warnings |
| Frontend TypeScript lint | Passed |
| Frontend production build | Passed; Vite reported the existing >500 kB minified-chunk advisory |
| Live API and frontend | Both responded locally |
| Browser analysis | Verified a higher-confidence result and an uncertain result |
| Browser history | Verified scan listing and detailed uncertainty/brand/SHAP sections |
| Responsive viewport | No horizontal overflow in the 312 CSS-pixel browser viewport |
| Offline domain evaluation | Completed; grouped hostname overlap asserted at zero |
| Offline calibration evaluation | Completed; no production integration recommended |
| Saved-model robustness evaluation | Completed; scaler-consistent metrics recorded |

The four test warnings are non-failing deprecations from FastAPI/Starlette and SHAP.

## Local commands

From the repository root in Windows PowerShell:

```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

In another terminal:

```powershell
Set-Location frontend
npm run dev
```

Run checks and offline studies:

```powershell
.\.venv\Scripts\python.exe -m pytest -q
Set-Location frontend
npm run lint
npm run build
Set-Location ..
.\.venv\Scripts\python.exe -m ml.evaluation.domain_robustness
.\.venv\Scripts\python.exe -m ml.evaluation.probability_calibration
.\.venv\Scripts\python.exe -m ml.evaluation.robustness
```

## Remaining limitations

- The uncertainty thresholds are provisional and operate on uncalibrated production model probabilities.
- The brand registry is manually curated and limited; a match is not proof of URL safety or authenticity, and no match is not proof of maliciousness.
- The offline model studies use the available labelled data and deterministic splits. They do not measure temporal drift or establish deployment suitability.
- The frontend build retains a Vite bundle-size advisory; this did not fail the production build.
