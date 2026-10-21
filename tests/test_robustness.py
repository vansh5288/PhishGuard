"""Focused unit tests for the offline model robustness evaluation.

These tests verify that ``ml.evaluation.robustness.run_evaluation`` runs offline,
reuses the trained model (no retraining), produces a well-formed report, and
persists it under ``ml/evaluation/robustness_report.json``. No network requests
are made and the /api/analyze endpoint is untouched.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest
from sklearn.preprocessing import StandardScaler

from ml.evaluation.robustness import (
    FEATURE_DATASET_PATH,
    FEATURE_NAMES,
    MODEL_PATH,
    RANDOM_STATE,
    REPORT_PATH,
    _classification_metrics,
    _load_feature_dataset,
    _load_model_bundle,
    _missing_feature_sensitivity,
    _perturbation_sensitivity,
    _split_data,
    run_evaluation,
)

PROJECT_ROOT = Path(__file__).resolve().parents[1]


def test_model_bundle_loads():
    bundle = _load_model_bundle()
    assert "model" in bundle
    assert "scaler" in bundle
    assert hasattr(bundle["model"], "predict")
    assert hasattr(bundle["model"], "predict_proba")
    assert hasattr(bundle["model"], "classes_")


def test_feature_dataset_loads():
    data = _load_feature_dataset()
    assert not data.empty
    assert list(data.columns) == list(FEATURE_NAMES) + ["label"]
    assert set(data["label"].unique()) <= {0, 1, 2, 3}


def test_split_data_shapes():
    data = _load_feature_dataset()
    X_train, X_test, y_train, y_test = _split_data(data)
    assert X_train.shape[1] == len(FEATURE_NAMES)
    assert X_test.shape[1] == len(FEATURE_NAMES)
    assert len(X_train) == len(y_train)
    assert len(X_test) == len(y_test)
    # Stratified split preserves classes.
    assert set(np.unique(y_train)) <= {0, 1, 2, 3}
    assert set(np.unique(y_test)) <= {0, 1, 2, 3}


def test_classification_metrics_shape():
    y_true = [0, 1, 2, 3, 0, 1]
    y_pred = [0, 1, 2, 3, 0, 1]
    labels = [0, 1, 2, 3]
    metrics = _classification_metrics(np.array(y_true), np.array(y_pred), labels)
    assert "accuracy" in metrics
    assert "f1_macro" in metrics
    assert "per_class" in metrics
    assert "confusion_matrix" in metrics
    assert metrics["accuracy"] == 1.0


def test_perturbation_sensitivity_runs():
    bundle = _load_model_bundle()
    model = bundle["model"]
    scaler = bundle.get("scaler")
    data = _load_feature_dataset()
    _, X_test, _, y_test = _split_data(data)
    labels = [0, 1, 2, 3]
    result = _perturbation_sensitivity(model, scaler, X_test, y_test, labels)
    assert "prediction_flip_rate" in result
    assert 0.0 <= result["prediction_flip_rate"] <= 1.0
    assert "n_trials" in result


def test_missing_feature_sensitivity_runs():
    bundle = _load_model_bundle()
    model = bundle["model"]
    scaler = bundle.get("scaler")
    data = _load_feature_dataset()
    _, X_test, _, y_test = _split_data(data)
    result = _missing_feature_sensitivity(model, scaler, X_test, y_test)
    assert "prediction_flip_rate" in result
    assert 0.0 <= result["prediction_flip_rate"] <= 1.0
    assert "n_trials" in result


def test_run_evaluation_persists_report(tmp_path, monkeypatch):
    # Point REPORT_PATH at a temp file so we don't clobber the real report
    # during testing, but still exercise the full pipeline.
    import ml.evaluation.robustness as robustness

    tmp_report = tmp_path / "robustness_report.json"
    monkeypatch.setattr(robustness, "REPORT_PATH", tmp_report)
    monkeypatch.setattr(robustness, "EVALUATION_DIR", tmp_path)

    report = robustness.run_evaluation()
    assert tmp_report.is_file()

    persisted = json.loads(tmp_report.read_text(encoding="utf-8"))
    assert persisted["evaluation_type"] == "offline_robustness"
    assert "test_metrics" in persisted
    assert "perturbation_sensitivity" in persisted
    assert "missing_feature_sensitivity" in persisted
    assert "summary" in persisted
    assert persisted["n_features"] == len(FEATURE_NAMES)
    assert persisted["n_classes"] == 4
    assert (
        persisted["test_metrics"]["accuracy"]
        == persisted["perturbation_sensitivity"]["base_accuracy"]
        == persisted["missing_feature_sensitivity"]["base_accuracy"]
    )
    assert 0.0 <= persisted["summary"]["test_accuracy"] <= 1.0
    assert 0.0 <= persisted["summary"]["test_f1_macro"] <= 1.0


def test_run_evaluation_no_retraining():
    """Verify run_evaluation loads (not retrains) the existing model bundle."""
    model_before = _load_model_bundle()["model"]
    report = run_evaluation()
    model_after = _load_model_bundle()["model"]
    assert type(model_after) is type(model_before)
    assert report["summary"]["test_accuracy"] >= 0.0


def test_report_uses_four_classes():
    import ml.evaluation.robustness as robustness

    report = robustness.run_evaluation()
    assert report["n_classes"] == 4
    assert report["class_labels"] == {
        "0": "LEGITIMATE",
        "1": "PHISHING",
        "2": "DEFACEMENT",
        "3": "MALWARE",
    }


def test_sensitivity_evaluators_scale_original_and_perturbed_rows_consistently():
    class RecordingModel:
        def __init__(self):
            self.inputs = []

        def predict(self, values):
            self.inputs.append(np.asarray(values).copy())
            return np.zeros(len(values), dtype=int)

    raw_features = np.arange(40, dtype=float).reshape(4, 10)
    scaler = StandardScaler().fit(raw_features + 100)
    model = RecordingModel()
    labels = [0, 1, 2, 3]

    _perturbation_sensitivity(model, scaler, raw_features, np.zeros(4), labels)
    np.testing.assert_allclose(model.inputs[0], scaler.transform(raw_features))
    trial_indices = np.random.default_rng(RANDOM_STATE).choice(4, size=4, replace=False)
    for trial_index, row_index in enumerate(trial_indices):
        original_input = model.inputs[1 + trial_index * 2]
        np.testing.assert_allclose(
            original_input,
            scaler.transform(raw_features[row_index : row_index + 1]),
        )

    model.inputs.clear()
    _missing_feature_sensitivity(model, scaler, raw_features, np.zeros(4))
    np.testing.assert_allclose(model.inputs[0], scaler.transform(raw_features))
    trial_indices = np.random.default_rng(RANDOM_STATE).choice(4, size=4, replace=False)
    for trial_index, row_index in enumerate(trial_indices):
        original_input = model.inputs[1 + trial_index * 2]
        np.testing.assert_allclose(
            original_input,
            scaler.transform(raw_features[row_index : row_index + 1]),
        )
