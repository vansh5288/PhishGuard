"""PhishGuard FastAPI backend for real-time URL analysis."""

from __future__ import annotations

import ipaddress
import json
import logging
import os
import pickle
import socket
import sqlite3
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path as FilePath
from urllib.parse import urlsplit

import numpy as np
import pandas as pd
import shap
from fastapi import FastAPI, HTTPException, Path as FastApiPath, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from backend.database import database as database_module
from backend.models.stability import assess_url_stability
from backend.models.uncertainty import (
    UNCERTAINTY_CONFIDENCE_THRESHOLD,
    UNCERTAINTY_MARGIN_THRESHOLD,
    compute_uncertainty,
)
from backend.security.brand_identity import assess_brand_identity
from backend.security.validator import is_safe_url
from ml.preprocessing.url_features import FEATURE_NAMES as CANONICAL_FEATURE_NAMES
from ml.preprocessing.url_features import extract_url_features, normalize_url

ROOT = FilePath(__file__).resolve().parents[1]
MODEL_PATH = ROOT / "models" / "final_model.pkl"
FEATURE_NAMES_PATH = ROOT / "ml" / "data" / "processed" / "feature_names.json"
FEATURE_DATA_PATH = ROOT / "ml" / "data" / "processed" / "feature_dataset.csv"
configured_database_path = FilePath(
    os.getenv("PHISHGUARD_DATABASE_PATH", str(ROOT / "data" / "phishguard.db"))
).expanduser()
DATABASE_PATH = (
    configured_database_path
    if configured_database_path.is_absolute()
    else ROOT / configured_database_path
)
BRAND_REGISTRY_PATH = ROOT / "backend" / "data" / "brand_registry.json"
EVALUATION_REPORT_PATH = ROOT / "ml" / "evaluation" / "robustness_report.json"
ROBUSTNESS_REPORT_PATH = ROOT / "ml" / "evaluation" / "domain_robustness_report.json"

with MODEL_PATH.open("rb") as model_file:
    MODEL_BUNDLE = pickle.load(model_file)

MODEL = MODEL_BUNDLE["model"]
SCALER = MODEL_BUNDLE.get("scaler")
FEATURE_NAMES = MODEL_BUNDLE.get("feature_names") or json.loads(FEATURE_NAMES_PATH.read_text(encoding="utf-8"))
if FEATURE_NAMES != list(CANONICAL_FEATURE_NAMES):
    raise RuntimeError("The model feature order does not match live URL feature extraction.")
if SCALER is not None and getattr(SCALER, "n_features_in_", len(FEATURE_NAMES)) != len(FEATURE_NAMES):
    raise RuntimeError("The scaler feature count does not match the model feature count.")
if getattr(MODEL, "n_features_in_", len(FEATURE_NAMES)) != len(FEATURE_NAMES):
    raise RuntimeError("The model feature count does not match live URL feature extraction.")

TRAINING_FEATURES = pd.read_csv(FEATURE_DATA_PATH)[FEATURE_NAMES].copy()

if SCALER is not None:
    TRAINING_VALUES = SCALER.transform(TRAINING_FEATURES)
else:
    TRAINING_VALUES = TRAINING_FEATURES.to_numpy(dtype=float)

CLASS_LABELS = {
    int(code): str(label)
    for code, label in MODEL_BUNDLE.get(
        "class_labels", {0: "LEGITIMATE", 1: "PHISHING"}
    ).items()
}
if set(int(value) for value in MODEL.classes_) - set(CLASS_LABELS):
    raise RuntimeError("The model contains class IDs without configured labels.")

if hasattr(MODEL, "coef_"):
    EXPLAINER = shap.LinearExplainer(MODEL, TRAINING_VALUES, feature_names=FEATURE_NAMES)
elif hasattr(MODEL, "tree_"):
    EXPLAINER = shap.TreeExplainer(MODEL, feature_names=FEATURE_NAMES)
else:
    EXPLAINER = shap.Explainer(MODEL, TRAINING_VALUES, feature_names=FEATURE_NAMES)

def _initialize_database() -> None:
    database_module.DATABASE_PATH = DATABASE_PATH
    database_module.initialize_database()


@asynccontextmanager
async def lifespan(app: FastAPI):
    _initialize_database()
    yield


app = FastAPI(title="PhishGuard API", lifespan=lifespan)
configured_origins = [
    origin.strip()
    for origin in os.getenv("PHISHGUARD_CORS_ORIGINS", "").split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=configured_origins,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Accept", "Content-Type"],
)


class AnalyzeRequest(BaseModel):
    url: str = Field(..., min_length=1, description="URL to analyze")


def _get_connection() -> sqlite3.Connection:
    database_module.DATABASE_PATH = DATABASE_PATH
    database_module.initialize_database()
    return database_module.get_connection()


def _serialize_scan_row(row: sqlite3.Row) -> dict[str, object]:
    scan = dict(row)
    probabilities_json = scan.pop("probabilities_json", None)
    scan["probabilities"] = (
        json.loads(probabilities_json) if probabilities_json else None
    )
    scan["risk_score"] = scan.get("malicious_probability")
    features_json = scan.pop("features_json", None)
    scan["features"] = json.loads(features_json) if features_json else None
    explanation_json = scan.pop("explanation_json", None)
    scan["explanation"] = json.loads(explanation_json) if explanation_json else []
    brand_reasons_json = scan.pop("brand_reasons_json", None)
    scan["brand_assessment"] = {
        "status": scan.pop("brand_match_status", None),
        "matched_brand": scan.pop("matched_brand", None),
        "matched_domain": scan.pop("matched_domain", None),
        "reasons": json.loads(brand_reasons_json) if brand_reasons_json else [],
    }
    uncertainty_reasons_json = scan.pop("uncertainty_reasons_json", None)
    if (
        scan.get("needs_review") is not None
        and scan.get("confidence") is not None
        and scan.get("confidence_margin") is not None
    ):
        scan["uncertainty"] = {
            "review_required": bool(scan["needs_review"]),
            "predicted_class": scan["prediction"],
            "max_class_probability": scan["confidence"],
            "top_two_probability_margin": scan["confidence_margin"],
            "reasons": (
                json.loads(uncertainty_reasons_json)
                if uncertainty_reasons_json
                else []
            ),
        }
    else:
        scan["uncertainty"] = None
    stability_json = scan.pop("stability_json", None)
    scan["stability_assessment"] = (
        json.loads(stability_json) if stability_json else None
    )
    return scan


def _is_valid_url(raw_url: str) -> bool:
    return is_safe_url(raw_url)


def _extract_features(url: str) -> pd.Series:
    feature_map = extract_url_features(url)
    return pd.Series([feature_map[name] for name in FEATURE_NAMES], index=FEATURE_NAMES)


def _risk_label(malicious_probability: float) -> str:
    if malicious_probability >= 0.70:
        return "PHISHING"
    if malicious_probability <= 0.30:
        return "SAFE"
    return "SUSPICIOUS"


@app.get("/")
def root() -> dict[str, str]:
    return {"message": "PhishGuard API is running"}


@app.get("/api/history")
def get_history(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    prediction: str | None = Query(default=None),
    search: str | None = Query(default=None, max_length=2048),
) -> dict[str, object]:
    supported_predictions = {"LEGITIMATE", "PHISHING", "DEFACEMENT", "MALWARE"}
    if prediction is not None and prediction.upper() not in supported_predictions:
        raise HTTPException(status_code=400, detail="Unsupported prediction filter")

    conditions: list[str] = []
    parameters: list[object] = []
    if prediction:
        conditions.append("prediction = ?")
        parameters.append(prediction.upper())
    if search:
        conditions.append("url LIKE ?")
        parameters.append(f"%{search}%")
    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    with _get_connection() as connection:
        total = connection.execute(
            f"SELECT COUNT(*) FROM scans {where_clause}",
            parameters,
        ).fetchone()[0]
        rows = connection.execute(
            "SELECT id, url, prediction, probability, probabilities_json, malicious_probability, confidence, "
            "confidence_margin, entropy, needs_review, uncertainty_reasons_json, "
            "features_json, explanation_json, "
            "brand_match_status, matched_brand, matched_domain, brand_reasons_json, risk, created_at, stability_json "
            f"FROM scans {where_clause} ORDER BY id DESC LIMIT ? OFFSET ?",
            [*parameters, limit, offset],
        ).fetchall()
    scans = [_serialize_scan_row(row) for row in rows]
    return {"scans": scans, "total": int(total)}


@app.get("/api/history/{scan_id}")
def get_scan(scan_id: int = FastApiPath(..., gt=0)) -> dict:
    with _get_connection() as connection:
        row = connection.execute(
            "SELECT id, url, prediction, probability, probabilities_json, malicious_probability, confidence, "
            "confidence_margin, entropy, needs_review, uncertainty_reasons_json, "
            "features_json, explanation_json, "
            "brand_match_status, matched_brand, matched_domain, brand_reasons_json, risk, created_at, stability_json "
            "FROM scans WHERE id = ?",
            (scan_id,),
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Scan not found")
    return _serialize_scan_row(row)


@app.delete("/api/history/{scan_id}")
def delete_scan(scan_id: int = FastApiPath(..., gt=0)) -> dict[str, str | int]:
    with _get_connection() as connection:
        cursor = connection.execute("DELETE FROM scans WHERE id = ?", (scan_id,))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Scan not found")
    return {"message": "Scan deleted successfully", "scan_id": scan_id}


@app.get("/api/stats")
def get_stats() -> dict[str, object]:
    with _get_connection() as connection:
        row = connection.execute(
            """
            SELECT
                COUNT(*) AS total_scans,
                SUM(CASE WHEN prediction = 'LEGITIMATE' THEN 1 ELSE 0 END) AS legitimate_scans,
                SUM(CASE WHEN prediction = 'PHISHING' THEN 1 ELSE 0 END) AS phishing_scans,
                SUM(CASE WHEN prediction = 'DEFACEMENT' THEN 1 ELSE 0 END) AS defacement_scans,
                SUM(CASE WHEN prediction = 'MALWARE' THEN 1 ELSE 0 END) AS malware_scans,
                SUM(CASE WHEN prediction != 'LEGITIMATE' THEN 1 ELSE 0 END) AS malicious_scans,
                SUM(CASE WHEN risk = 'SAFE' THEN 1 ELSE 0 END) AS safe_scans,
                SUM(CASE WHEN risk = 'SUSPICIOUS' THEN 1 ELSE 0 END) AS suspicious_scans,
                SUM(CASE WHEN malicious_probability >= 0.80 THEN 1 ELSE 0 END) AS critical_scans,
                SUM(CASE WHEN malicious_probability >= 0.60 AND malicious_probability < 0.80 THEN 1 ELSE 0 END) AS high_scans,
                SUM(CASE WHEN malicious_probability > 0.30 AND malicious_probability < 0.60 THEN 1 ELSE 0 END) AS medium_scans,
                SUM(CASE WHEN malicious_probability <= 0.30 THEN 1 ELSE 0 END) AS low_scans,
                AVG(probability) AS average_probability
            FROM scans
            """
        ).fetchone()
        trend_rows = connection.execute(
            """
            SELECT substr(created_at, 1, 10) AS date,
                   SUM(CASE WHEN prediction != 'LEGITIMATE' THEN 1 ELSE 0 END) AS malicious,
                   SUM(CASE WHEN prediction = 'LEGITIMATE' THEN 1 ELSE 0 END) AS legitimate,
                   COUNT(*) AS total
            FROM scans
            GROUP BY substr(created_at, 1, 10)
            ORDER BY date DESC
            LIMIT 14
            """
        ).fetchall()
    if row is None:
        return {
            "total_scans": 0,
            "legitimate_scans": 0,
            "phishing_scans": 0,
            "defacement_scans": 0,
            "malware_scans": 0,
            "malicious_scans": 0,
            "safe_scans": 0,
            "suspicious_scans": 0,
            "average_probability": 0.0,
            "recent_trend": [],
            "threat_distribution": {"critical": 0, "high": 0, "medium": 0, "low": 0},
            "model_info": {
                "name": type(MODEL).__name__,
                "feature_count": len(FEATURE_NAMES),
                "class_labels": [
                    CLASS_LABELS[int(class_id)] for class_id in MODEL.classes_
                ],
                "metrics": MODEL_BUNDLE.get("evaluation_metrics", {}),
                "prediction_time": MODEL_BUNDLE.get("evaluation_metrics", {}).get(
                    "Prediction Time"
                ),
            },
        }
    return {
        "total_scans": int(row["total_scans"] or 0),
        "legitimate_scans": int(row["legitimate_scans"] or 0),
        "phishing_scans": int(row["phishing_scans"] or 0),
        "defacement_scans": int(row["defacement_scans"] or 0),
        "malware_scans": int(row["malware_scans"] or 0),
        "malicious_scans": int(row["malicious_scans"] or 0),
        "safe_scans": int(row["safe_scans"] or 0),
        "suspicious_scans": int(row["suspicious_scans"] or 0),
        "average_probability": float(row["average_probability"] or 0.0),
        "recent_trend": [
            {
                "date": str(trend["date"]),
                "malicious": int(trend["malicious"] or 0),
                "legitimate": int(trend["legitimate"] or 0),
                "total": int(trend["total"] or 0),
            }
            for trend in reversed(trend_rows)
        ],
        "threat_distribution": {
            "critical": int(row["critical_scans"] or 0),
            "high": int(row["high_scans"] or 0),
            "medium": int(row["medium_scans"] or 0),
            "low": int(row["low_scans"] or 0),
        },
        "model_info": {
            "name": type(MODEL).__name__,
            "feature_count": len(FEATURE_NAMES),
            "class_labels": [
                CLASS_LABELS[int(class_id)] for class_id in MODEL.classes_
            ],
            "metrics": MODEL_BUNDLE.get("evaluation_metrics", {}),
            "prediction_time": MODEL_BUNDLE.get("evaluation_metrics", {}).get(
                "Prediction Time"
            ),
        },
    }


def _read_json_artifact(path: FilePath, artifact_name: str) -> dict[str, object]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError, UnicodeDecodeError) as exc:
        logging.error("Unable to load %s artifact at %s: %s", artifact_name, path, exc)
        raise HTTPException(
            status_code=503,
            detail=f"{artifact_name} artifact is unavailable",
        ) from exc
    if not isinstance(value, dict):
        raise HTTPException(
            status_code=503,
            detail=f"{artifact_name} artifact has an invalid format",
        )
    return value


@app.get("/api/brands")
def get_brand_registry() -> dict[str, object]:
    registry = _read_json_artifact(BRAND_REGISTRY_PATH, "Brand registry")
    return {
        "registry": registry.get("registry", {}),
        "brands": registry.get("brands", []),
    }


@app.get("/api/evaluation")
def get_model_evaluation() -> dict[str, object]:
    return _read_json_artifact(EVALUATION_REPORT_PATH, "Model evaluation")


@app.get("/api/robustness")
def get_robustness_results() -> dict[str, object]:
    return _read_json_artifact(ROBUSTNESS_REPORT_PATH, "Robustness evaluation")


@app.get("/api/config")
def get_application_config() -> dict[str, object]:
    return {
        "application": "PhishGuard",
        "classifier": type(MODEL).__name__,
        "feature_count": len(FEATURE_NAMES),
        "feature_names": FEATURE_NAMES,
        "class_labels": [
            CLASS_LABELS[int(class_id)] for class_id in MODEL.classes_
        ],
        "url_fetching_enabled": False,
        "database": "SQLite",
    }


@app.post("/api/analyze")
def analyze_url(request: AnalyzeRequest) -> dict:
    normalized_url = normalize_url(request.url)
    if not _is_valid_url(normalized_url):
        raise HTTPException(status_code=400, detail="Invalid URL")

    # --- Brand identity mismatch detection ---
    # Run after URL validation. Any registry/assessment failure is surfaced
    # as an explicit assessment_error status so it is never silently mistaken
    # for "no brand signal" (which could be misread as "safe").
    try:
        brand_assessment = assess_brand_identity(normalized_url)
    except Exception as exc:  # pragma: no cover - defensive
        logging.error(
            "Brand identity assessment failed for URL '%s': %s",
            normalized_url,
            exc,
            exc_info=True,
        )
        brand_assessment = {
            "status": "assessment_error",
            "hostname": None,
            "matched_brand": None,
            "matched_domain": None,
            "reasons": [
                "Brand identity assessment could not be completed; "
                "treat this result as unverified, not as safe."
            ],
            "error": str(exc),
        }

    try:
        features = _extract_features(normalized_url)
        feature_frame = pd.DataFrame([features])
        feature_frame = feature_frame[FEATURE_NAMES].copy()

        if SCALER is not None:
            model_input = SCALER.transform(feature_frame)
        else:
            model_input = feature_frame.to_numpy(dtype=float)

        if model_input.shape[1] != len(FEATURE_NAMES):
            raise ValueError("Feature mismatch between model input and trained feature order.")

        probabilities = MODEL.predict_proba(model_input)[0]
        prediction_index = int(MODEL.predict(model_input)[0])
        class_position = list(MODEL.classes_).index(prediction_index)
        probability = float(probabilities[class_position])
        predicted_label = CLASS_LABELS.get(int(prediction_index), str(prediction_index))

        # --- Uncertainty-aware prediction review ---
        # Delegates to the dedicated uncertainty module; the underlying class
        # prediction is NOT modified.
        uncertainty_info = compute_uncertainty(
            probabilities,
            class_labels=CLASS_LABELS,
        )
        confidence = uncertainty_info["confidence"]
        confidence_margin = uncertainty_info["confidence_margin"]
        entropy = uncertainty_info["entropy"]
        uncertainty = uncertainty_info["uncertainty"]
        needs_review = uncertainty_info["needs_review"]
        uncertainty_reasons = uncertainty_info["reasons"]

        raw_shap_values = (
            EXPLAINER.shap_values(model_input)
            if hasattr(MODEL, "coef_")
            else EXPLAINER(model_input).values
        )
        if isinstance(raw_shap_values, list):
            shap_values = np.asarray(raw_shap_values[class_position]).reshape(
                -1, len(FEATURE_NAMES)
            )[0]
        else:
            shap_array = np.asarray(raw_shap_values)
            if shap_array.ndim == 3:
                shap_values = shap_array[0, :, class_position]
            elif shap_array.ndim == 2:
                shap_values = shap_array[0]
            else:
                raise ValueError(f"Unsupported SHAP output shape: {shap_array.shape}")
        if shap_values.shape != (len(FEATURE_NAMES),):
            raise ValueError("SHAP output does not match the trained feature dimensions.")

        contributions = []
        for index, feature_name in enumerate(FEATURE_NAMES):
            feature_value = feature_frame.iloc[0][feature_name]
            value = int(feature_value) if float(feature_value).is_integer() else float(feature_value)
            contributions.append(
                {
                    "feature": feature_name,
                    "value": value,
                    "shap_value": float(shap_values[index]),
                }
            )

        explanation = sorted(
            contributions,
            key=lambda item: abs(item["shap_value"]),
            reverse=True,
        )[:5]
        explanation = [
            {
                "feature": item["feature"],
                "value": item["value"],
                "shap_value": item["shap_value"],
                "impact": "positive" if item["shap_value"] >= 0 else "negative",
            }
            for item in explanation
        ]

        legitimate_position = next(
            (
                index
                for index, value in enumerate(MODEL.classes_)
                if CLASS_LABELS[int(value)] == "LEGITIMATE"
            ),
            None,
        )
        legitimate_probability = (
            float(probabilities[legitimate_position])
            if legitimate_position is not None
            else 0.0
        )
        malicious_probability = 1.0 - legitimate_probability
        risk = _risk_label(malicious_probability)
        created_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")

        # --- PhishGuard Stability Shield: Equivalent URL Prediction Consistency Checker ---
        try:
            stability_assessment = assess_url_stability(
                url=normalized_url,
                original_prediction=predicted_label,
                feature_extractor=_extract_features,
                model=MODEL,
                scaler=SCALER,
                feature_names=FEATURE_NAMES,
                class_labels=CLASS_LABELS,
            )
        except Exception as exc:
            logging.error(
                "Stability assessment failed for URL '%s': %s",
                normalized_url,
                exc,
                exc_info=True,
            )
            stability_assessment = {
                "status": "unavailable",
                "original_prediction": predicted_label,
                "prediction_stability": None,
                "transformations_tested": 0,
                "consistent_predictions": 0,
                "checks": [],
                "skipped_checks": [{"check_id": "error", "name": "Internal Error", "reason": str(exc)}],
                "explanation": "Prediction Stability measures whether the model returns the same class for equivalent URL representations. A stable prediction can still be incorrect.",
                "limitations": "Evaluates standards-compliant lexical representation changes only (RFC 3986).",
                "summary": "Stability assessment could not be completed.",
            }

        with _get_connection() as connection:
            cursor = connection.execute(
                """
                INSERT INTO scans (
                    url, prediction, probability, probabilities_json, malicious_probability, confidence,
                    confidence_margin, entropy, needs_review, uncertainty_reasons_json,
                    brand_match_status, matched_brand, matched_domain, brand_reasons_json,
                    features_json, explanation_json, risk, created_at, stability_json
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    normalized_url,
                    predicted_label,
                    probability,
                    json.dumps({
                        CLASS_LABELS[int(class_id)]: float(class_probability)
                        for class_id, class_probability in zip(
                            MODEL.classes_,
                            probabilities,
                            strict=True,
                        )
                    }),
                    malicious_probability,
                    confidence,
                    confidence_margin,
                    entropy,
                    int(needs_review),
                    json.dumps(uncertainty_reasons),
                    brand_assessment.get("status"),
                    brand_assessment.get("matched_brand"),
                    brand_assessment.get("matched_domain"),
                    json.dumps(brand_assessment.get("reasons", [])),
                    json.dumps(
                        {
                            name: int(feature_frame.iloc[0][name])
                            for name in FEATURE_NAMES
                        }
                    ),
                    json.dumps(explanation),
                    risk,
                    created_at,
                    json.dumps(stability_assessment),
                ),
            )
            scan_id = int(cursor.lastrowid)

        return {
            "scan_id": scan_id,
            "url": normalized_url,
            "prediction": predicted_label,
            "probability": probability,
            "probabilities": {
                CLASS_LABELS[int(class_id)]: float(class_probability)
                for class_id, class_probability in zip(
                    MODEL.classes_,
                    probabilities,
                    strict=True,
                )
            },
            "malicious_probability": malicious_probability,
            "risk_score": malicious_probability,
            "features": {
                name: int(feature_frame.iloc[0][name])
                for name in FEATURE_NAMES
            },
            "risk": risk,
            "explanation": explanation,
            "created_at": created_at,
            "confidence": confidence,
            "confidence_margin": confidence_margin,
            "entropy": entropy,
            "uncertainty_score": uncertainty,
            "uncertainty": {
                "review_required": needs_review,
                "predicted_class": predicted_label,
                "max_class_probability": confidence,
                "top_two_probability_margin": confidence_margin,
                "reasons": uncertainty_reasons,
            },
            "needs_review": needs_review,
            "review_outcome": uncertainty_info["review_outcome"],
            "uncertainty_reasons": uncertainty_reasons,
            "brand_assessment": brand_assessment,
            "stability_assessment": stability_assessment,
        }
    except Exception as exc:
        logging.error("Failed to analyze URL '%s': %s", normalized_url, exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error") from None

