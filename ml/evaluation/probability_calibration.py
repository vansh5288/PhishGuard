"""Offline evaluation of multiclass probability calibration.

Uses the raw labelled URL dataset and live ten-feature extractor. The model is
fit only on a training partition, a one-vs-rest sigmoid calibrator is fit on a
separate calibration partition, and all reported comparisons use a final
hostname-disjoint test partition. Production model artifacts are never read or
written.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import f1_score, log_loss
from sklearn.preprocessing import StandardScaler

from ml.evaluation.domain_robustness import (
    MODEL_LABELS,
    MODEL_SETTINGS,
    _class_distribution,
    _group_disjoint_split,
    _load_labelled_urls,
)
from ml.preprocessing.clean_dataset import CLASS_NAMES
from ml.preprocessing.url_features import FEATURE_NAMES

PROJECT_ROOT = Path(__file__).resolve().parents[2]
ARTIFACT_DIR = PROJECT_ROOT / "ml" / "evaluation" / "probability_calibration"
JSON_REPORT_PATH = ARTIFACT_DIR / "probability_calibration_report.json"
MARKDOWN_REPORT_PATH = ARTIFACT_DIR / "probability_calibration_report.md"
METRICS_PATH = ARTIFACT_DIR / "probability_calibration_metrics.csv"
RELIABILITY_CSV_PATH = ARTIFACT_DIR / "reliability_diagram_data.csv"
RELIABILITY_PLOT_PATH = ARTIFACT_DIR / "reliability_diagrams.png"

RANDOM_SEED = 42
RELIABILITY_BINS = 15
CALIBRATOR_MAX_ITER = 1000
CALIBRATOR_C = 1.0
CALIBRATION_METHOD = (
    "One-vs-rest sigmoid (Platt) regression on base-model probability logits; "
    "calibrated class probabilities are normalized to sum to one."
)


def _three_way_group_split(
    labels: np.ndarray,
    hostnames: np.ndarray,
    random_seed: int = RANDOM_SEED,
) -> tuple[dict[str, np.ndarray], dict[str, Any]]:
    """Return deterministic stratified partitions with disjoint hostnames."""
    labels = np.asarray(labels, dtype=int)
    hostnames = np.asarray(hostnames, dtype=str)
    if labels.ndim != 1 or hostnames.ndim != 1 or len(labels) != len(hostnames):
        raise ValueError("labels and hostnames must be one-dimensional arrays of equal length.")
    if len(labels) == 0 or np.any(hostnames == ""):
        raise ValueError("Rows must be non-empty and have a hostname for grouped splitting.")

    development_indices, test_indices, outer_metadata = _group_disjoint_split(
        labels, hostnames, random_seed=random_seed
    )
    outer_metadata["random_seed"] = random_seed
    development_labels = labels[development_indices]
    development_hosts = hostnames[development_indices]
    train_local_indices, calibration_local_indices, inner_metadata = _group_disjoint_split(
        development_labels, development_hosts, random_seed=random_seed + 1
    )
    inner_metadata["random_seed"] = random_seed + 1
    partitions = {
        "train": development_indices[train_local_indices],
        "calibration": development_indices[calibration_local_indices],
        "test": test_indices,
    }

    hostname_sets = {
        name: set(hostnames[indices].tolist()) for name, indices in partitions.items()
    }
    for left, right in (("train", "calibration"), ("train", "test"), ("calibration", "test")):
        overlap = hostname_sets[left] & hostname_sets[right]
        if overlap:
            raise AssertionError(
                f"Hostname leakage between {left} and {right} partitions: "
                f"{len(overlap)} hostnames."
            )

    split_metadata: dict[str, Any] = {
        "method": (
            "Nested StratifiedGroupKFold; outer first fold reserves final test "
            "domains, inner first fold reserves calibration domains from development."
        ),
        "random_seed": random_seed,
        "outer": outer_metadata,
        "inner": inner_metadata,
        "hostname_overlap_counts": {
            f"{left}_vs_{right}": len(hostname_sets[left] & hostname_sets[right])
            for left, right in (
                ("train", "calibration"),
                ("train", "test"),
                ("calibration", "test"),
            )
        },
        "partitions": {
            name: {
                "rows": int(len(indices)),
                "hostname_count": len(hostname_sets[name]),
                "class_distribution": _class_distribution(labels[indices]),
                "missing_classes": [
                    CLASS_NAMES[label]
                    for label in MODEL_LABELS
                    if label not in set(labels[indices].tolist())
                ],
            }
            for name, indices in partitions.items()
        },
    }
    return partitions, split_metadata


def _fit_sigmoid_calibrators(
    probabilities: np.ndarray,
    labels: np.ndarray,
    classes: list[int] = MODEL_LABELS,
    random_seed: int = RANDOM_SEED,
) -> list[LogisticRegression]:
    """Fit independent sigmoid maps using calibration probabilities only."""
    probabilities = np.asarray(probabilities, dtype=float)
    labels = np.asarray(labels, dtype=int)
    if probabilities.ndim != 2 or probabilities.shape != (len(labels), len(classes)):
        raise ValueError("Calibration probability dimensions do not match labels/classes.")

    clipped = np.clip(probabilities, 1e-7, 1.0 - 1e-7)
    logits = np.log(clipped / (1.0 - clipped))
    calibrators: list[LogisticRegression] = []
    for class_index, class_label in enumerate(classes):
        binary_labels = (labels == class_label).astype(int)
        if len(np.unique(binary_labels)) != 2:
            raise ValueError(
                f"Calibration split must contain both positive and negative "
                f"examples for {CLASS_NAMES[class_label]}."
            )
        calibrator = LogisticRegression(
            C=CALIBRATOR_C,
            max_iter=CALIBRATOR_MAX_ITER,
            solver="lbfgs",
            random_state=random_seed,
        )
        calibrator.fit(logits[:, [class_index]], binary_labels)
        calibrators.append(calibrator)
    return calibrators


def _apply_sigmoid_calibrators(
    probabilities: np.ndarray,
    calibrators: list[LogisticRegression],
) -> np.ndarray:
    probabilities = np.asarray(probabilities, dtype=float)
    clipped = np.clip(probabilities, 1e-7, 1.0 - 1e-7)
    logits = np.log(clipped / (1.0 - clipped))
    calibrated = np.column_stack(
        [
            calibrator.predict_proba(logits[:, [class_index]])[:, 1]
            for class_index, calibrator in enumerate(calibrators)
        ]
    )
    row_sums = calibrated.sum(axis=1, keepdims=True)
    if not np.isfinite(calibrated).all() or np.any(row_sums <= 0):
        raise ValueError("Sigmoid calibration produced invalid probability values.")
    return calibrated / row_sums


def _top_label_calibration_error(
    labels: np.ndarray,
    probabilities: np.ndarray,
    n_bins: int = RELIABILITY_BINS,
) -> float:
    """Compute fixed-width expected calibration error for top-label confidence."""
    confidence = probabilities.max(axis=1)
    prediction = np.asarray(MODEL_LABELS)[probabilities.argmax(axis=1)]
    correct = (prediction == labels).astype(float)
    edges = np.linspace(0.0, 1.0, n_bins + 1)
    bin_ids = np.minimum(np.digitize(confidence, edges[1:-1]), n_bins - 1)
    error = 0.0
    for bin_index in range(n_bins):
        mask = bin_ids == bin_index
        if mask.any():
            error += float(mask.mean()) * abs(
                float(confidence[mask].mean()) - float(correct[mask].mean())
            )
    return error


def _classwise_calibration_error(
    labels: np.ndarray,
    probabilities: np.ndarray,
    n_bins: int = RELIABILITY_BINS,
) -> float:
    """Macro average of fixed-width one-vs-rest expected calibration errors."""
    edges = np.linspace(0.0, 1.0, n_bins + 1)
    errors: list[float] = []
    for class_index, class_label in enumerate(MODEL_LABELS):
        class_probabilities = probabilities[:, class_index]
        class_labels = (labels == class_label).astype(float)
        bin_ids = np.minimum(
            np.digitize(class_probabilities, edges[1:-1]), n_bins - 1
        )
        error = 0.0
        for bin_index in range(n_bins):
            mask = bin_ids == bin_index
            if mask.any():
                error += float(mask.mean()) * abs(
                    float(class_probabilities[mask].mean())
                    - float(class_labels[mask].mean())
                )
        errors.append(error)
    return float(np.mean(errors))


def _reliability_rows(
    labels: np.ndarray,
    probabilities_by_method: dict[str, np.ndarray],
    n_bins: int = RELIABILITY_BINS,
) -> list[dict[str, Any]]:
    edges = np.linspace(0.0, 1.0, n_bins + 1)
    rows: list[dict[str, Any]] = []
    for method, probabilities in probabilities_by_method.items():
        for class_index, class_label in enumerate(MODEL_LABELS):
            class_probabilities = probabilities[:, class_index]
            class_labels = (labels == class_label).astype(float)
            bin_ids = np.minimum(
                np.digitize(class_probabilities, edges[1:-1]), n_bins - 1
            )
            for bin_index in range(n_bins):
                mask = bin_ids == bin_index
                rows.append(
                    {
                        "method": method,
                        "class": CLASS_NAMES[class_label],
                        "bin": bin_index,
                        "bin_lower": float(edges[bin_index]),
                        "bin_upper": float(edges[bin_index + 1]),
                        "mean_predicted_probability": (
                            float(class_probabilities[mask].mean()) if mask.any() else None
                        ),
                        "observed_positive_fraction": (
                            float(class_labels[mask].mean()) if mask.any() else None
                        ),
                        "samples": int(mask.sum()),
                    }
                )
    return rows


def _multiclass_brier_score(
    labels: np.ndarray,
    probabilities: np.ndarray,
) -> float:
    targets = np.column_stack(
        [(labels == class_label).astype(float) for class_label in MODEL_LABELS]
    )
    return float(np.mean(np.sum((probabilities - targets) ** 2, axis=1)))


def _probability_metrics(
    labels: np.ndarray,
    probabilities: np.ndarray,
) -> dict[str, float]:
    predictions = np.asarray(MODEL_LABELS)[probabilities.argmax(axis=1)]
    return {
        "multiclass_log_loss": float(
            log_loss(labels, probabilities, labels=MODEL_LABELS)
        ),
        "multiclass_brier_score": _multiclass_brier_score(labels, probabilities),
        "top_label_calibration_error": _top_label_calibration_error(
            labels, probabilities
        ),
        "classwise_calibration_error": _classwise_calibration_error(
            labels, probabilities
        ),
        "macro_f1": float(
            f1_score(
                labels,
                predictions,
                labels=MODEL_LABELS,
                average="macro",
                zero_division=0,
            )
        ),
    }


def _plot_reliability_diagrams(rows: list[dict[str, Any]], path: Path) -> None:
    frame = pd.DataFrame(rows)
    fig, axes = plt.subplots(2, 2, figsize=(11, 9), sharex=True, sharey=True)
    for axis, class_name in zip(axes.flat, (CLASS_NAMES[label] for label in MODEL_LABELS)):
        class_frame = frame.loc[frame["class"] == class_name]
        axis.plot([0, 1], [0, 1], linestyle="--", color="#6B7280", label="Perfect calibration")
        for method, color in (
            ("uncalibrated", "#2563EB"),
            ("sigmoid_calibrated", "#DC2626"),
        ):
            subset = class_frame.loc[
                (class_frame["method"] == method)
                & class_frame["mean_predicted_probability"].notna()
            ]
            axis.plot(
                subset["mean_predicted_probability"],
                subset["observed_positive_fraction"],
                marker="o",
                markersize=3,
                linewidth=1.2,
                color=color,
                label=method.replace("_", " "),
            )
        axis.set_title(class_name)
        axis.set_xlim(0, 1)
        axis.set_ylim(0, 1)
        axis.set_xlabel("Mean predicted class probability")
        axis.set_ylabel("Observed class frequency")
        axis.grid(alpha=0.2)
        axis.legend(fontsize=8)
    fig.suptitle("Final hostname-disjoint test set: one-vs-rest reliability diagrams")
    fig.tight_layout()
    path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(path, dpi=160)
    plt.close(fig)


def _recommendation(
    uncalibrated: dict[str, float],
    calibrated: dict[str, float],
) -> dict[str, Any]:
    probability_metrics_improved = all(
        calibrated[key] < uncalibrated[key]
        for key in (
            "multiclass_log_loss",
            "multiclass_brier_score",
            "top_label_calibration_error",
        )
    )
    macro_f1_drop = uncalibrated["macro_f1"] - calibrated["macro_f1"]
    evidence_supports_trial = probability_metrics_improved and macro_f1_drop <= 0.01
    if evidence_supports_trial:
        conclusion = (
            "The held-out probability metrics support considering a controlled "
            "calibration integration trial. This experiment alone does not justify "
            "changing production predictions."
        )
    else:
        conclusion = (
            "The held-out evidence does not support integrating this calibration "
            "method into production at this time."
        )
    return {
        "criterion": (
            "All of log loss, Brier score, and top-label ECE must improve on the "
            "untouched test set, while macro F1 declines by no more than 0.01."
        ),
        "probability_metrics_improved": probability_metrics_improved,
        "macro_f1_change_calibrated_minus_uncalibrated": float(
            calibrated["macro_f1"] - uncalibrated["macro_f1"]
        ),
        "evidence_supports_controlled_trial": evidence_supports_trial,
        "conclusion": conclusion,
    }


def _evaluate(
    data: pd.DataFrame,
    dataset_metadata: dict[str, Any],
    random_seed: int = RANDOM_SEED,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    labels = data["label"].to_numpy(dtype=int)
    hostnames = data["hostname"].to_numpy(dtype=str)
    partitions, split_metadata = _three_way_group_split(
        labels, hostnames, random_seed=random_seed
    )

    for partition_name in ("train", "calibration"):
        missing = split_metadata["partitions"][partition_name]["missing_classes"]
        if missing:
            raise ValueError(
                f"{partition_name} partition lacks classes required for four-class "
                f"calibration: {missing}"
            )

    features = data[list(FEATURE_NAMES)].to_numpy(dtype=float)
    X_train = features[partitions["train"]]
    y_train = labels[partitions["train"]]
    X_calibration = features[partitions["calibration"]]
    y_calibration = labels[partitions["calibration"]]
    X_test = features[partitions["test"]]
    y_test = labels[partitions["test"]]

    scaler = StandardScaler()
    train_scaled = scaler.fit_transform(X_train)
    calibration_scaled = scaler.transform(X_calibration)
    test_scaled = scaler.transform(X_test)

    model = LogisticRegression(
        max_iter=int(MODEL_SETTINGS["max_iter"]),
        class_weight={
            int(key): value for key, value in MODEL_SETTINGS["class_weight"].items()
        },
        random_state=random_seed,
    )
    model.fit(train_scaled, y_train)
    if model.classes_.astype(int).tolist() != MODEL_LABELS:
        raise ValueError(
            f"Base model classes differ from expected class order: {model.classes_.tolist()}"
        )

    calibration_probabilities = model.predict_proba(calibration_scaled)
    calibrators = _fit_sigmoid_calibrators(
        calibration_probabilities, y_calibration, random_seed=random_seed
    )

    uncalibrated_probabilities = model.predict_proba(test_scaled)
    calibrated_probabilities = _apply_sigmoid_calibrators(
        uncalibrated_probabilities, calibrators
    )
    probabilities_by_method = {
        "uncalibrated": uncalibrated_probabilities,
        "sigmoid_calibrated": calibrated_probabilities,
    }
    metrics = {
        method: _probability_metrics(y_test, probabilities)
        for method, probabilities in probabilities_by_method.items()
    }
    recommendation = _recommendation(
        metrics["uncalibrated"], metrics["sigmoid_calibrated"]
    )
    reliability_rows = _reliability_rows(y_test, probabilities_by_method)

    report: dict[str, Any] = {
        "evaluation_type": "experimental_multiclass_probability_calibration",
        "status": "experimental",
        "dataset": dataset_metadata,
        "random_seed": random_seed,
        "class_labels": {str(label): CLASS_NAMES[label] for label in MODEL_LABELS},
        "feature_names": list(FEATURE_NAMES),
        "feature_count": len(FEATURE_NAMES),
        "model_settings": {
            **MODEL_SETTINGS,
            "random_state": random_seed,
        },
        "calibration_method": CALIBRATION_METHOD,
        "calibrator_settings": {
            "class": "sklearn.linear_model.LogisticRegression",
            "solver": "lbfgs",
            "C": CALIBRATOR_C,
            "max_iter": CALIBRATOR_MAX_ITER,
            "fit_data": "calibration partition only",
            "multiclass_combination": "independent one-vs-rest sigmoid scores renormalized to sum to one",
        },
        "reliability_bins": {
            "count": RELIABILITY_BINS,
            "strategy": "fixed-width bins over [0, 1]",
        },
        "split": split_metadata,
        "hostname_disjoint_assertions_passed": all(
            count == 0 for count in split_metadata["hostname_overlap_counts"].values()
        ),
        "metrics": metrics,
        "recommendation": recommendation,
        "limitations": [
            "This is one deterministic split experiment, not cross-validation or a statistical confidence interval.",
            "Hostname-level grouping is only a proxy for unseen-domain generalization; dataset time drift and label quality are not addressed.",
            "The sigmoid calibrator is one-vs-rest and renormalizes class scores; it is not guaranteed to improve probability quality or preserve argmax predictions.",
            "Expected calibration errors depend on the fixed binning scheme and test-set composition.",
            "The ten lexical features contain no rich domain or page content; calibration cannot fix representation limits.",
            "Production model and prediction behavior are untouched.",
        ],
    }
    return report, reliability_rows


def _write_markdown_report(report: dict[str, Any], path: Path) -> None:
    train = report["split"]["partitions"]["train"]
    calibration = report["split"]["partitions"]["calibration"]
    test = report["split"]["partitions"]["test"]
    metrics = report["metrics"]
    lines = [
        "# PhishGuard Probability Calibration Evaluation (Experimental)",
        "",
        "> Offline experimental evidence only. This report does not change production probabilities.",
        "",
        "## Method",
        "",
        f"- Raw dataset: `{report['dataset']['source_path']}`; SHA-256 `{report['dataset']['source_sha256']}`.",
        f"- Raw schema columns: `{', '.join(report['dataset']['source_columns'])}`; URL `{report['dataset']['url_column']}`, label `{report['dataset']['label_column']}`.",
        f"- Retained rows: {report['dataset']['dataset_rows']} of {report['dataset']['source_rows']}; existing preprocessing removes malformed URLs, conflicting URL labels, and exact URL duplicates.",
        f"- Features: {report['feature_count']} live URL features in the recorded order.",
        f"- Base model: Logistic Regression, max_iter={report['model_settings']['max_iter']}, class_weight={report['model_settings']['class_weight']}, random seed={report['random_seed']}.",
        "- Scaler and base model are fitted only on training data. Calibration is fitted only on separate calibration data. Neither is refit on test data.",
        f"- Split seeds: outer grouped split={report['split']['outer']['random_seed']}; inner calibration split={report['split']['inner']['random_seed']}.",
        f"- Calibration: {report['calibration_method']}",
        "- No URLs were fetched, crawled, or visited. No production model artifacts were loaded or written.",
        "",
        "## Leakage controls and partitions",
        "",
        "| Partition | Rows | Hostnames | Legitimate | Phishing | Defacement | Malware |",
        "|---|---:|---:|---:|---:|---:|---:|",
    ]
    for name, values in (("Train", train), ("Calibration", calibration), ("Final test", test)):
        distribution = values["class_distribution"]
        lines.append(
            f"| {name} | {values['rows']} | {values['hostname_count']} | "
            + " | ".join(str(distribution[CLASS_NAMES[label]]) for label in MODEL_LABELS)
            + " |"
        )
    lines.extend(
        [
            "",
            f"Partitioning uses nested stratified group folds. Pairwise hostname overlap counts: `{json.dumps(report['split']['hostname_overlap_counts'], sort_keys=True)}`. Final test domains are disjoint from both development partitions; assertions passed: **{report['hostname_disjoint_assertions_passed']}**.",
            "",
        ]
    )
    for name, values in (("Train", train), ("Calibration", calibration), ("Final test", test)):
        if values["missing_classes"]:
            lines.append(f"- **{name} partition lacks classes:** {', '.join(values['missing_classes'])}.")
    lines.extend(
        [
            "## Untouched final test results",
            "",
            "Multiclass Brier score is the mean per-example sum of squared errors over the four one-hot class targets (lower is better; range 0–2). Top-label ECE is fixed-width 15-bin expected calibration error on the maximum predicted class probability and correctness. Classwise ECE is the macro mean of one-vs-rest 15-bin ECE values. Lower calibration scores are better.",
            "",
            "| Method | Multiclass log loss | Multiclass Brier | Top-label ECE | Classwise ECE | Macro F1 |",
            "|---|---:|---:|---:|---:|---:|",
        ]
    )
    for method in ("uncalibrated", "sigmoid_calibrated"):
        value = metrics[method]
        lines.append(
            f"| {method.replace('_', ' ')} | {value['multiclass_log_loss']:.6f} | "
            f"{value['multiclass_brier_score']:.6f} | "
            f"{value['top_label_calibration_error']:.6f} | "
            f"{value['classwise_calibration_error']:.6f} | {value['macro_f1']:.6f} |"
        )
    recommendation = report["recommendation"]
    lines.extend(
        [
            "",
            "Reliability diagrams: [reliability_diagrams.png](./reliability_diagrams.png). Underlying bin counts and observed frequencies: [reliability_diagram_data.csv](./reliability_diagram_data.csv).",
            "",
            "## Integration assessment",
            "",
            f"Predeclared evidence rule: {recommendation['criterion']}",
            "",
            f"**Assessment:** {recommendation['conclusion']}",
            "",
            "Calibration is not expected to automatically improve argmax classification accuracy. Macro F1 is reported as a separate guardrail, not as a probability-calibration metric. A single split cannot establish deployment suitability.",
            "",
            "## Limitations",
            "",
        ]
    )
    lines.extend(f"- {limitation}" for limitation in report["limitations"])
    lines.append("")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines), encoding="utf-8")


def run_evaluation(
    data: pd.DataFrame | None = None,
    dataset_metadata: dict[str, Any] | None = None,
    artifact_dir: Path = ARTIFACT_DIR,
) -> dict[str, Any]:
    """Run the isolated calibration experiment and write artifacts separately."""
    if data is None or dataset_metadata is None:
        loaded_data, loaded_metadata = _load_labelled_urls()
        data = loaded_data
        dataset_metadata = loaded_metadata

    report, reliability_rows = _evaluate(data, dataset_metadata, RANDOM_SEED)
    artifact_dir.mkdir(parents=True, exist_ok=True)

    metrics_path = artifact_dir / METRICS_PATH.name
    reliability_csv_path = artifact_dir / RELIABILITY_CSV_PATH.name
    reliability_plot_path = artifact_dir / RELIABILITY_PLOT_PATH.name
    json_report_path = artifact_dir / JSON_REPORT_PATH.name
    markdown_report_path = artifact_dir / MARKDOWN_REPORT_PATH.name

    pd.DataFrame(
        [
            {"method": method, **values}
            for method, values in report["metrics"].items()
        ]
    ).to_csv(metrics_path, index=False)
    reliability_frame = pd.DataFrame(reliability_rows)
    reliability_frame.to_csv(reliability_csv_path, index=False)
    _plot_reliability_diagrams(reliability_rows, reliability_plot_path)
    report["artifacts"] = {
        "json": json_report_path.relative_to(PROJECT_ROOT).as_posix()
        if json_report_path.is_relative_to(PROJECT_ROOT)
        else str(json_report_path),
        "markdown": markdown_report_path.relative_to(PROJECT_ROOT).as_posix()
        if markdown_report_path.is_relative_to(PROJECT_ROOT)
        else str(markdown_report_path),
        "metrics_csv": metrics_path.relative_to(PROJECT_ROOT).as_posix()
        if metrics_path.is_relative_to(PROJECT_ROOT)
        else str(metrics_path),
        "reliability_csv": reliability_csv_path.relative_to(PROJECT_ROOT).as_posix()
        if reliability_csv_path.is_relative_to(PROJECT_ROOT)
        else str(reliability_csv_path),
        "reliability_plot": reliability_plot_path.relative_to(PROJECT_ROOT).as_posix()
        if reliability_plot_path.is_relative_to(PROJECT_ROOT)
        else str(reliability_plot_path),
    }
    json_report_path.write_text(
        json.dumps(report, indent=2, allow_nan=False) + "\n",
        encoding="utf-8",
    )
    _write_markdown_report(report, markdown_report_path)
    return report


if __name__ == "__main__":
    report = run_evaluation()
    print(f"Experimental report: {MARKDOWN_REPORT_PATH}")
    print(json.dumps(report["metrics"], indent=2))
    print(report["recommendation"]["conclusion"])
