"""Tests for isolated probability calibration evaluation."""

from __future__ import annotations

import numpy as np
import pandas as pd

from ml.evaluation.probability_calibration import (
    _apply_sigmoid_calibrators,
    _evaluate,
    _fit_sigmoid_calibrators,
    _three_way_group_split,
    run_evaluation,
)
from ml.preprocessing.clean_dataset import CLASS_NAMES
from ml.preprocessing.url_features import FEATURE_NAMES


def _synthetic_calibration_data() -> tuple[pd.DataFrame, dict[str, object]]:
    rows: list[dict[str, object]] = []
    rng = np.random.default_rng(17)
    for label in range(4):
        for group in range(25):
            hostname = f"class-{label}-group-{group}.example"
            for item in range(4):
                row: dict[str, object] = {
                    "label": label,
                    "hostname": hostname,
                }
                for feature_index, feature in enumerate(FEATURE_NAMES):
                    row[feature] = float(
                        (label + 1) * (feature_index + 2)
                        + group * 0.03
                        + item * 0.01
                        + rng.normal(0, 0.1)
                    )
                rows.append(row)
    metadata: dict[str, object] = {
        "source_path": "synthetic-test-only",
        "source_sha256": "test",
        "source_rows": len(rows),
        "source_columns": ["url", "type"],
        "url_column": "url",
        "label_column": "type",
        "dataset_rows": len(rows),
    }
    return pd.DataFrame(rows), metadata


def test_three_way_group_split_is_reproducible_and_disjoint():
    data, _ = _synthetic_calibration_data()
    labels = data["label"].to_numpy()
    hostnames = data["hostname"].to_numpy()
    partitions_a, metadata_a = _three_way_group_split(labels, hostnames, random_seed=23)
    partitions_b, metadata_b = _three_way_group_split(labels, hostnames, random_seed=23)

    for name in ("train", "calibration", "test"):
        np.testing.assert_array_equal(partitions_a[name], partitions_b[name])
        assert metadata_a["partitions"][name] == metadata_b["partitions"][name]
    assert metadata_a["hostname_overlap_counts"] == {
        "train_vs_calibration": 0,
        "train_vs_test": 0,
        "calibration_vs_test": 0,
    }


def test_sigmoid_calibration_uses_and_returns_valid_multiclass_probabilities():
    labels = np.repeat(np.arange(4), 8)
    base = np.full((len(labels), 4), 0.1, dtype=float)
    base[np.arange(len(labels)), labels] = 0.7
    calibrators = _fit_sigmoid_calibrators(base, labels)
    calibrated = _apply_sigmoid_calibrators(base, calibrators)

    assert calibrated.shape == base.shape
    assert np.isfinite(calibrated).all()
    assert np.all(calibrated >= 0)
    np.testing.assert_allclose(calibrated.sum(axis=1), 1.0)


def test_evaluation_is_reproducible_and_keeps_test_domains_isolated():
    data, metadata = _synthetic_calibration_data()
    report_a, _ = _evaluate(data, metadata, random_seed=29)
    report_b, _ = _evaluate(data, metadata, random_seed=29)

    assert report_a["metrics"] == report_b["metrics"]
    assert report_a["split"] == report_b["split"]
    assert report_a["hostname_disjoint_assertions_passed"] is True
    assert report_a["class_labels"] == {
        str(label): CLASS_NAMES[label] for label in range(4)
    }


def test_run_writes_separate_experimental_artifacts(tmp_path):
    data, metadata = _synthetic_calibration_data()
    report = run_evaluation(data=data, dataset_metadata=metadata, artifact_dir=tmp_path)

    assert report["status"] == "experimental"
    assert (tmp_path / "probability_calibration_report.json").is_file()
    assert (tmp_path / "probability_calibration_report.md").is_file()
    assert (tmp_path / "probability_calibration_metrics.csv").is_file()
    assert (tmp_path / "reliability_diagram_data.csv").is_file()
    assert (tmp_path / "reliability_diagrams.png").is_file()
