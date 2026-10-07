"""Train the selected PhishGuard classifier from processed URL features."""

from __future__ import annotations

import hashlib
import json
import pickle
from pathlib import Path
from time import perf_counter

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler, label_binarize

from ml.preprocessing.clean_dataset import CLASS_NAMES, DEFAULT_RAW_DATASET
from ml.preprocessing.url_features import FEATURE_NAMES

PROJECT_ROOT = Path(__file__).resolve().parents[2]
PROCESSED_DIR = PROJECT_ROOT / "ml" / "data" / "processed"
FEATURE_DATASET_PATH = PROCESSED_DIR / "feature_dataset.csv"
FEATURE_NAMES_PATH = PROCESSED_DIR / "feature_names.json"
MODEL_PATH = PROJECT_ROOT / "models" / "final_model.pkl"
SCALER_PATH = PROJECT_ROOT / "models" / "scaler.pkl"
RESULTS_PATH = PROCESSED_DIR / "model_results.csv"
CONFUSION_MATRIX_PATH = PROCESSED_DIR / "confusion_matrix.csv"
RANDOM_STATE = 42
TEST_SIZE = 0.2


def run_training() -> dict[str, object]:
    """Fit and persist Logistic Regression using the processed feature contract."""
    if not FEATURE_DATASET_PATH.is_file():
        raise FileNotFoundError(f"Processed feature dataset not found: {FEATURE_DATASET_PATH}")
    if not DEFAULT_RAW_DATASET.is_file():
        raise FileNotFoundError(f"Raw source dataset not found: {DEFAULT_RAW_DATASET}")

    feature_names = json.loads(FEATURE_NAMES_PATH.read_text(encoding="utf-8"))
    if feature_names != list(FEATURE_NAMES):
        raise ValueError("feature_names.json does not match the shared live feature order.")

    feature_data = pd.read_csv(FEATURE_DATASET_PATH)
    expected_columns = feature_names + ["label"]
    if list(feature_data.columns) != expected_columns:
        raise ValueError(
            f"Feature dataset columns differ from the training contract: "
            f"{list(feature_data.columns)}"
        )

    X = feature_data[feature_names].apply(pd.to_numeric, errors="raise")
    y = pd.to_numeric(feature_data["label"], errors="raise").astype(int)
    values = X.to_numpy(dtype=float)
    if values.shape[1] != len(FEATURE_NAMES) or not np.isfinite(values).all():
        raise ValueError("Training features have invalid dimensions or non-finite values.")

    classes = np.sort(y.unique())
    if len(classes) < 2 or any(int(value) not in CLASS_NAMES for value in classes):
        raise ValueError(f"Training labels are not supported: {classes.tolist()}")
    if set(classes.tolist()) != set(range(len(classes))):
        raise ValueError(f"Training labels must be contiguous from zero: {classes.tolist()}")

    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=TEST_SIZE,
        random_state=RANDOM_STATE,
        stratify=y,
    )
    scaler = StandardScaler()
    train_scaled = scaler.fit_transform(X_train)
    test_scaled = scaler.transform(X_test)

    model = LogisticRegression(
        max_iter=2000,
        class_weight={0: 1.0, 1: 1.5, 2: 1.5, 3: 2.0},
        random_state=RANDOM_STATE,
    )
    started_at = perf_counter()
    model.fit(train_scaled, y_train)
    training_seconds = perf_counter() - started_at

    started_at = perf_counter()
    predictions = model.predict(test_scaled)
    probabilities = model.predict_proba(test_scaled)
    prediction_seconds = (perf_counter() - started_at) / len(X_test)

    class_ids = model.classes_.astype(int)
    binary_targets = label_binarize(y_test, classes=class_ids)
    metrics = {
        "Accuracy": float(accuracy_score(y_test, predictions)),
        "Precision": float(
            precision_score(y_test, predictions, average="macro", zero_division=0)
        ),
        "Recall": float(recall_score(y_test, predictions, average="macro", zero_division=0)),
        "F1": float(f1_score(y_test, predictions, average="macro", zero_division=0)),
        "ROC-AUC": float(
            roc_auc_score(
                y_test,
                probabilities,
                labels=class_ids,
                multi_class="ovr",
                average="macro",
            )
        ),
        "PR-AUC": float(
            average_precision_score(binary_targets, probabilities, average="macro")
        ),
        "Training Time": float(training_seconds),
        "Prediction Time": float(prediction_seconds),
        "Training Accuracy": float(accuracy_score(y_train, model.predict(train_scaled))),
        "Testing Accuracy": float(accuracy_score(y_test, predictions)),
        "Training F1": float(
            f1_score(y_train, model.predict(train_scaled), average="macro", zero_division=0)
        ),
        "Testing F1": float(f1_score(y_test, predictions, average="macro", zero_division=0)),
    }

    labels = [int(value) for value in class_ids]
    label_names = [CLASS_NAMES[label] for label in labels]
    confusion = confusion_matrix(y_test, predictions, labels=labels)
    pd.DataFrame(confusion, index=label_names, columns=label_names).to_csv(
        CONFUSION_MATRIX_PATH, index_label="actual"
    )
    pd.DataFrame([{"Model": "Logistic Regression", **metrics}]).to_csv(
        RESULTS_PATH, index=False
    )

    dataset_hash = hashlib.sha256(DEFAULT_RAW_DATASET.read_bytes()).hexdigest()
    class_labels = {label: CLASS_NAMES[label].upper() for label in labels}
    training_metadata = {
        "dataset_path": DEFAULT_RAW_DATASET.relative_to(PROJECT_ROOT).as_posix(),
        "dataset_sha256": dataset_hash,
        "feature_names": feature_names,
        "class_labels": class_labels,
        "train_rows": len(X_train),
        "test_rows": len(X_test),
        "random_state": RANDOM_STATE,
        "test_size": TEST_SIZE,
    }
    bundle = {
        "model": model,
        "scaler": scaler,
        "feature_names": feature_names,
        "class_labels": class_labels,
        "training_metadata": training_metadata,
        "evaluation_metrics": metrics,
    }
    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    with MODEL_PATH.open("wb") as model_file:
        pickle.dump(bundle, model_file)
    with SCALER_PATH.open("wb") as scaler_file:
        pickle.dump(scaler, scaler_file)

    print(f"Dataset: {training_metadata['dataset_path']}")
    print(f"Dataset SHA-256: {dataset_hash}")
    print(f"Rows: {len(feature_data)}; train: {len(X_train)}; test: {len(X_test)}")
    print(f"Features ({len(feature_names)}): {feature_names}")
    print(f"Classes: {class_labels}")
    print(f"Metrics: {metrics}")
    print(f"Confusion matrix: {CONFUSION_MATRIX_PATH}")
    print(f"Model: {MODEL_PATH}")
    return {
        "model_path": MODEL_PATH,
        "dataset_hash": dataset_hash,
        "feature_names": feature_names,
        "class_labels": class_labels,
        "metrics": metrics,
        "confusion_matrix": confusion,
    }


if __name__ == "__main__":
    run_training()
