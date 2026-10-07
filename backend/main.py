"""PhishGuard FastAPI backend for real-time URL analysis."""

from __future__ import annotations

import ipaddress
import json
import logging
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
from backend.security.validator import is_safe_url
from ml.preprocessing.url_features import FEATURE_NAMES as CANONICAL_FEATURE_NAMES
from ml.preprocessing.url_features import extract_url_features, normalize_url

ROOT = FilePath(__file__).resolve().parents[1]
MODEL_PATH = ROOT / "models" / "final_model.pkl"
FEATURE_NAMES_PATH = ROOT / "ml" / "data" / "processed" / "feature_names.json"
FEATURE_DATA_PATH = ROOT / "ml" / "data" / "processed" / "feature_dataset.csv"
DATABASE_PATH = ROOT / "data" / "phishguard.db"

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
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?|https?:\/\/.*\.lovable\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AnalyzeRequest(BaseModel):
    url: str = Field(..., min_length=1, description="URL to analyze")


def _get_connection() -> sqlite3.Connection:
    database_module.DATABASE_PATH = DATABASE_PATH
    database_module.initialize_database()
    return database_module.get_connection()


def _serialize_scan_row(row: sqlite3.Row) -> dict[str, object]:
    scan = dict(row)
    features_json = scan.pop("features_json", None)
    scan["features"] = json.loads(features_json) if features_json else None
    explanation_json = scan.pop("explanation_json", None)
    scan["explanation"] = json.loads(explanation_json) if explanation_json else []
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
def get_history(limit: int = Query(default=20, ge=1, le=100)) -> dict[str, object]:
    with _get_connection() as connection:
        rows = connection.execute(
            "SELECT id, url, prediction, probability, malicious_probability, features_json, explanation_json, risk, created_at "
            "FROM scans ORDER BY id DESC LIMIT ?",
            (limit,),
        ).fetchall()
    scans = [_serialize_scan_row(row) for row in rows]
    return {"scans": scans, "total": len(scans)}


@app.get("/api/history/{scan_id}")
def get_scan(scan_id: int = FastApiPath(..., gt=0)) -> dict:
    with _get_connection() as connection:
        row = connection.execute(
            "SELECT id, url, prediction, probability, malicious_probability, features_json, explanation_json, risk, created_at "
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
            "threat_distribution": {"critical": 0, "high": 0, "medium": 0, "low": 0},
            "model_info": {},
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
        "threat_distribution": {
            "critical": int(row["critical_scans"] or 0),
            "high": int(row["high_scans"] or 0),
            "medium": int(row["medium_scans"] or 0),
            "low": int(row["low_scans"] or 0),
        },
        "model_info": {
            "name": type(MODEL).__name__,
            "feature_count": len(FEATURE_NAMES),
            "class_labels": list(CLASS_LABELS.values()),
            "metrics": MODEL_BUNDLE.get("evaluation_metrics", {}),
            "prediction_time": MODEL_BUNDLE.get("evaluation_metrics", {}).get(
                "Prediction Time"
            ),
        },
    }


@app.post("/api/analyze")
def analyze_url(request: AnalyzeRequest) -> dict:
    normalized_url = normalize_url(request.url)
    if not _is_valid_url(normalized_url):
        raise HTTPException(status_code=400, detail="Invalid URL")

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

        with _get_connection() as connection:
            cursor = connection.execute(
                """
                INSERT INTO scans (
                    url, prediction, probability, malicious_probability, features_json, explanation_json, risk, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    normalized_url,
                    predicted_label,
                    probability,
                    malicious_probability,
                    json.dumps(
                        {
                            name: int(feature_frame.iloc[0][name])
                            for name in FEATURE_NAMES
                        }
                    ),
                    json.dumps(explanation),
                    risk,
                    created_at,
                ),
            )
            scan_id = int(cursor.lastrowid)

        return {
            "scan_id": scan_id,
            "url": normalized_url,
            "prediction": predicted_label,
            "probability": probability,
            "malicious_probability": malicious_probability,
            "features": {
                name: int(feature_frame.iloc[0][name])
                for name in FEATURE_NAMES
            },
            "risk": risk,
            "explanation": explanation,
            "created_at": created_at,
        }
    except Exception as exc:
        logging.error("Failed to analyze URL '%s': %s", normalized_url, exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error") from None
