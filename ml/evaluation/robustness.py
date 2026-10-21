"""Offline model robustness evaluation for PhishGuard.

Standalone, offline evaluation of the trained PhishGuard classifier. This
module does NOT retrain the model, does NOT touch the /api/analyze endpoint,
and makes no network requests.

  * Loads the persisted model bundle (models/final_model.pkl) and scaler.
  * Re-splits the processed feature dataset using the same stratified split
    contract as training.
  * Computes per-class and macro metrics on the held-out test set.
  * Runs feature-perturbation / missing-feature sensitivity checks.
  * Persists a JSON report under ml/evaluation/robustness_report.json.
"""

from __future__ import annotations

import hashlib
import json
import pickle
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
)
from sklearn.model_selection import train_test_split

from ml.preprocessing.clean_dataset import CLASS_NAMES
from ml.preprocessing.url_features import FEATURE_NAMES

PROJECT_ROOT = Path(__file__).resolve().parents[2]
PROCESSED_DIR = PROJECT_ROOT / "ml" / "data" / "processed"
FEATURE_DATASET_PATH = PROCESSED_DIR / "feature_dataset.csv"
FEATURE_NAMES_PATH = PROCESSED_DIR / "feature_names.json"
MODEL_PATH = PROJECT_ROOT / "models" / "final_model.pkl"
EVALUATION_DIR = PROJECT_ROOT / "ml" / "evaluation"
REPORT_PATH = EVALUATION_DIR / "robustness_report.json"

RANDOM_STATE = 42
TEST_SIZE = 0.2
PERTURBATION_SCALE = 0.10
MISSING_FEATURE_FRACTION = 0.25


def _load_model_bundle() -> dict[str, Any]:
    with MODEL_PATH.open("rb") as handle:
        return pickle.load(handle)


def _load_feature_dataset() -> pd.DataFrame:
    feature_names = json.loads(FEATURE_NAMES_PATH.read_text(encoding="utf-8"))
    if feature_names != list(FEATURE_NAMES):
        raise ValueError("feature_names.json does not match the shared live feature order.")
    data = pd.read_csv(FEATURE_DATASET_PATH)
    expected_columns = feature_names + ["label"]
    if list(data.columns) != expected_columns:
        raise ValueError(
            f"Feature dataset columns differ from the training contract: "
            f"{list(data.columns)}"
        )
    return data


def _split_data(data: pd.DataFrame) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    feature_names = json.loads(FEATURE_NAMES_PATH.read_text(encoding="utf-8"))
    X = data[feature_names].apply(pd.to_numeric, errors="raise").to_numpy(dtype=float)
    y = pd.to_numeric(data["label"], errors="raise").astype(int).to_numpy()
    return train_test_split(
        X,
        y,
        test_size=TEST_SIZE,
        random_state=RANDOM_STATE,
        stratify=y,
    )


def _classification_metrics(
    y_true: np.ndarray,
    y_pred: np.ndarray,
    labels: list[int],
) -> dict[str, Any]:
    label_names = [CLASS_NAMES[int(label)] for label in labels]
    return {
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "precision_macro": float(
            precision_score(y_true, y_pred, labels=labels, average="macro", zero_division=0)
        ),
        "recall_macro": float(
            recall_score(y_true, y_pred, labels=labels, average="macro", zero_division=0)
        ),
        "f1_macro": float(
            f1_score(y_true, y_pred, labels=labels, average="macro", zero_division=0)
        ),
        "per_class": {
            CLASS_NAMES[int(label)]: {
                "precision": float(
                    precision_score(
                        y_true, y_pred, labels=labels, average=None, zero_division=0
                    )[i]
                ),
                "recall": float(
                    recall_score(
                        y_true, y_pred, labels=labels, average=None, zero_division=0
                    )[i]
                ),
                "f1": float(
                    f1_score(
                        y_true, y_pred, labels=labels, average=None, zero_division=0
                    )[i]
                ),
            }
            for i, label in enumerate(labels)
        },
        "confusion_matrix": confusion_matrix(y_true, y_pred, labels=labels).tolist(),
        "confusion_matrix_labels": label_names,
    }


def _model_input(scaler: Any, features: np.ndarray) -> np.ndarray:
    if scaler is None:
        return features
    if hasattr(scaler, "feature_names_in_"):
        return scaler.transform(pd.DataFrame(features, columns=list(FEATURE_NAMES)))
    return scaler.transform(features)


def _perturbation_sensitivity(
    model: Any,
    scaler: Any,
    X_test: np.ndarray,
    y_test: np.ndarray,
    labels: list[int],
) -> dict[str, Any]:
    """Measure how predictions change under small feature perturbations."""
    test_input = _model_input(scaler, X_test)
    base_pred = model.predict(test_input)
    base_accuracy = float(accuracy_score(y_test, base_pred))

    rng = np.random.default_rng(RANDOM_STATE)
    n_features = X_test.shape[1]
    feature_stds = X_test.std(axis=0)
    feature_stds[feature_stds == 0] = 1.0

    flip_count = 0
    n_trials = min(200, len(X_test))
    trial_indices = rng.choice(len(X_test), size=n_trials, replace=False)

    for idx in trial_indices:
        original = X_test[idx].copy()
        perturb = rng.normal(0.0, PERTURBATION_SCALE, size=n_features) * feature_stds
        perturbed = original + perturb
        perturbed = np.nan_to_num(perturbed, nan=0.0, posinf=0.0, neginf=0.0)
        original_input = _model_input(scaler, original.reshape(1, -1))
        perturbed_input = _model_input(scaler, perturbed.reshape(1, -1))
        original_pred = int(model.predict(original_input)[0])
        perturbed_pred = int(model.predict(perturbed_input)[0])
        if original_pred != perturbed_pred:
            flip_count += 1

    flip_rate = float(flip_count / n_trials) if n_trials > 0 else 0.0
    return {
        "base_accuracy": base_accuracy,
        "perturbation_scale": PERTURBATION_SCALE,
        "n_trials": n_trials,
        "prediction_flip_rate": flip_rate,
    }


def _missing_feature_sensitivity(
    model: Any,
    scaler: Any,
    X_test: np.ndarray,
    y_test: np.ndarray,
) -> dict[str, Any]:
    """Measure how predictions change when a fraction of features are blanked."""
    test_input = _model_input(scaler, X_test)
    base_pred = model.predict(test_input)
    rng = np.random.default_rng(RANDOM_STATE)
    n_features = X_test.shape[1]
    n_missing = max(1, int(n_features * MISSING_FEATURE_FRACTION))
    n_trials = min(200, len(X_test))

    flip_count = 0
    trial_indices = rng.choice(len(X_test), size=n_trials, replace=False)

    for idx in trial_indices:
        original = X_test[idx].copy()
        missing_cols = rng.choice(n_features, size=n_missing, replace=False)
        corrupted = original.copy()
        corrupted[missing_cols] = 0.0
        corrupted = np.nan_to_num(corrupted, nan=0.0, posinf=0.0, neginf=0.0)
        original_input = _model_input(scaler, original.reshape(1, -1))
        corrupted_input = _model_input(scaler, corrupted.reshape(1, -1))
        original_pred = int(model.predict(original_input)[0])
        corrupted_pred = int(model.predict(corrupted_input)[0])
        if original_pred != corrupted_pred:
            flip_count += 1

    flip_rate = float(flip_count / n_trials) if n_trials > 0 else 0.0
    return {
        "base_accuracy": float(accuracy_score(y_test, base_pred)),
        "missing_feature_fraction": MISSING_FEATURE_FRACTION,
        "n_missing_features": n_missing,
        "n_trials": n_trials,
        "prediction_flip_rate": flip_rate,
    }

def run_evaluation() -> dict[str, Any]:
    """Run the full offline robustness evaluation and persist a report."""
    EVALUATION_DIR.mkdir(parents=True, exist_ok=True)

    bundle = _load_model_bundle()
    model = bundle["model"]
    scaler = bundle.get("scaler")
    class_labels = bundle.get("class_labels", {})
    training_metadata = bundle.get("training_metadata", {})
    evaluation_metrics = bundle.get("evaluation_metrics", {})

    labels = (
        sorted(int(k) for k in class_labels.keys())
        if class_labels
        else sorted(int(v) for v in getattr(model, "classes_", []))
    )

    data = _load_feature_dataset()
    X_train, X_test, y_train, y_test = _split_data(data)

    X_train_model = _model_input(scaler, X_train)
    X_test_model = _model_input(scaler, X_test)

    test_metrics = _classification_metrics(y_test, model.predict(X_test_model), labels)
    train_metrics = _classification_metrics(y_train, model.predict(X_train_model), labels)

    perturbation = _perturbation_sensitivity(model, scaler, X_test, y_test, labels)
    missing_feature = _missing_feature_sensitivity(model, scaler, X_test, y_test)

    dataset_hash = hashlib.sha256(
        (PROJECT_ROOT / "ml" / "data" / "raw" / "malicious_phish.csv").read_bytes()
    ).hexdigest()

    report: dict[str, Any] = {
        "evaluation_type": "offline_robustness",
        "random_state": RANDOM_STATE,
        "test_size": TEST_SIZE,
        "dataset_path": str(FEATURE_DATASET_PATH.relative_to(PROJECT_ROOT)),
        "dataset_sha256": dataset_hash,
        "model_path": str(MODEL_PATH.relative_to(PROJECT_ROOT)),
        "n_features": len(FEATURE_NAMES),
        "feature_names": list(FEATURE_NAMES),
        "n_classes": len(labels),
        "class_labels": {str(k): v for k, v in class_labels.items()},
        "class_names": CLASS_NAMES,
        "training_metadata": training_metadata,
        "bundled_evaluation_metrics": evaluation_metrics,
        "train_metrics": train_metrics,
        "test_metrics": test_metrics,
        "perturbation_sensitivity": perturbation,
        "missing_feature_sensitivity": missing_feature,
    }

    report["summary"] = {
        "test_accuracy": test_metrics["accuracy"],
        "test_f1_macro": test_metrics["f1_macro"],
        "perturbation_flip_rate": perturbation["prediction_flip_rate"],
        "missing_feature_flip_rate": missing_feature["prediction_flip_rate"],
    }

    with REPORT_PATH.open("w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2)

    return report


if __name__ == "__main__":
    report = run_evaluation()
    print(f"Report written to: {REPORT_PATH}")
    print(f"Test accuracy: {report['summary']['test_accuracy']:.4f}")
    print(f"Test F1 macro: {report['summary']['test_f1_macro']:.4f}")
    print(f"Perturbation flip rate: {report['summary']['perturbation_flip_rate']:.4f}")
    print(f"Missing-feature flip rate: {report['summary']['missing_feature_flip_rate']:.4f}")
