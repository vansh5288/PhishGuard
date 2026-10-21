"""Offline random-split and hostname-disjoint evaluation of the URL classifier.

This experiment reads the original labelled CSV and extracts the same ten
lexical features used by live inference. It never opens, crawls, or fetches a
URL and never loads or modifies the persisted production model.
"""

from __future__ import annotations

import hashlib
import json
from collections import Counter
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit, urlunsplit

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
)
from sklearn.model_selection import StratifiedGroupKFold, train_test_split
from sklearn.preprocessing import StandardScaler

from ml.preprocessing.clean_dataset import (
    CLASS_NAMES,
    DEFAULT_RAW_DATASET,
    _is_processable_url,
    _label_map,
    detect_columns,
)
from ml.preprocessing.url_features import FEATURE_NAMES, extract_url_features, normalize_url

PROJECT_ROOT = Path(__file__).resolve().parents[2]
EVALUATION_DIR = PROJECT_ROOT / "ml" / "evaluation"
JSON_REPORT_PATH = EVALUATION_DIR / "domain_robustness_report.json"
MARKDOWN_REPORT_PATH = EVALUATION_DIR / "domain_robustness_report.md"
METRICS_PATH = EVALUATION_DIR / "domain_robustness_metrics.csv"
CONFUSION_PATH = EVALUATION_DIR / "domain_robustness_confusion_matrices.csv"
CLASS_DISTRIBUTION_PATH = EVALUATION_DIR / "domain_robustness_class_distributions.csv"
VARIATIONS_PATH = EVALUATION_DIR / "domain_robustness_representation_variations.csv"

RANDOM_SEED = 42
TEST_SIZE = 0.2
GROUP_FOLDS = 5
VARIATION_SAMPLE_SIZE = 100
MODEL_SETTINGS: dict[str, Any] = {
    "class": "sklearn.linear_model.LogisticRegression",
    "max_iter": 2000,
    "class_weight": {"0": 1.0, "1": 1.5, "2": 1.5, "3": 2.0},
    "random_state": RANDOM_SEED,
    "scaler": "sklearn.preprocessing.StandardScaler, fit on training data only",
}
MODEL_LABELS = [0, 1, 2, 3]


def _hostname(url: str) -> str:
    """Return a normalized hostname for grouping; invalid URLs have no group."""
    try:
        return (urlsplit(url).hostname or "").lower().rstrip(".")
    except ValueError:
        return ""


def _load_labelled_urls() -> tuple[pd.DataFrame, dict[str, Any]]:
    """Load the raw labelled source and apply the project's documented cleaning."""
    if not DEFAULT_RAW_DATASET.is_file():
        raise FileNotFoundError(f"Raw labelled dataset not found: {DEFAULT_RAW_DATASET}")

    source = pd.read_csv(DEFAULT_RAW_DATASET)
    url_column, label_column = detect_columns(source)
    labels, label_mapping = _label_map(source[label_column])
    working = pd.DataFrame(
        {
            "url": source[url_column].astype("string").str.strip(),
            "label": labels,
        }
    )

    missing_scheme = working["url"].notna() & ~working["url"].str.match(
        r"(?i)^https?://", na=False
    )
    working.loc[missing_scheme, "url"] = working.loc[missing_scheme, "url"].map(
        normalize_url
    )

    missing_url = working["url"].isna() | working["url"].eq("")
    missing_label = working["label"].isna()
    present_labeled = working.loc[~missing_url & ~missing_label].copy()

    conflicting = present_labeled.groupby("url", sort=False)["label"].transform(
        "nunique"
    ) > 1
    conflicting_url_count = int(present_labeled.loc[conflicting, "url"].nunique())
    conflicting_row_count = int(conflicting.sum())
    nonconflicting = present_labeled.loc[~conflicting].copy()

    duplicate_url_count = int(nonconflicting["url"].duplicated().sum())
    clean = nonconflicting.drop_duplicates(subset=["url"], keep="first").copy()
    processable = clean["url"].map(
        lambda value: _is_processable_url(str(value))[0]
    )
    invalid_url_count = int((~processable).sum())
    clean = clean.loc[processable].copy()
    clean["label"] = clean["label"].astype(int)

    unsupported = sorted(set(clean["label"].unique()) - set(MODEL_LABELS))
    if unsupported:
        raise ValueError(
            "Raw labelled dataset includes classes outside the current four-class "
            f"model contract: {unsupported}. No class was silently discarded."
        )

    clean["hostname"] = clean["url"].map(_hostname)
    no_hostname = clean["hostname"].eq("")
    if no_hostname.any():
        raise ValueError(
            f"{int(no_hostname.sum())} cleaned rows lack a hostname after validation."
        )

    feature_frame = pd.DataFrame.from_records(
        [extract_url_features(url) for url in clean["url"]],
        columns=list(FEATURE_NAMES),
        index=clean.index,
    )
    clean = pd.concat([clean, feature_frame], axis=1).reset_index(drop=True)

    source_hash = hashlib.sha256(DEFAULT_RAW_DATASET.read_bytes()).hexdigest()
    metadata: dict[str, Any] = {
        "source_path": DEFAULT_RAW_DATASET.relative_to(PROJECT_ROOT).as_posix(),
        "source_sha256": source_hash,
        "source_rows": int(len(source)),
        "source_columns": [str(column) for column in source.columns],
        "source_column_types": {str(column): str(dtype) for column, dtype in source.dtypes.items()},
        "url_column": str(url_column),
        "label_column": str(label_column),
        "source_label_mapping": label_mapping,
        "missing_url_rows_excluded": int(missing_url.sum()),
        "missing_label_rows_excluded": int(missing_label.sum()),
        "invalid_url_rows_excluded": invalid_url_count,
        "conflicting_url_rows_excluded": conflicting_row_count,
        "conflicting_urls_excluded": conflicting_url_count,
        "duplicate_url_rows_excluded": duplicate_url_count,
        "normalized_missing_scheme_rows": int(missing_scheme.sum()),
        "dataset_rows": int(len(clean)),
        "unique_hostnames": int(clean["hostname"].nunique()),
    }
    return clean, metadata


def _class_distribution(labels: np.ndarray) -> dict[str, int]:
    counts = Counter(int(label) for label in labels)
    return {CLASS_NAMES[label]: int(counts.get(label, 0)) for label in MODEL_LABELS}


def _group_disjoint_split(
    labels: np.ndarray,
    hostnames: np.ndarray,
    random_seed: int = RANDOM_SEED,
) -> tuple[np.ndarray, np.ndarray, dict[str, Any]]:
    """Make a deterministic approximately stratified split by whole hostname."""
    group_class_counts = pd.DataFrame({"label": labels, "hostname": hostnames}).drop_duplicates()
    groups_per_class = group_class_counts.groupby("label")["hostname"].nunique()
    smallest_group_count = int(groups_per_class.min())
    n_splits = min(GROUP_FOLDS, smallest_group_count)
    if n_splits < 2:
        raise ValueError(
            "Hostname-disjoint evaluation cannot split each class across train "
            "and test: at least one class occurs on fewer than two hostnames."
        )

    splitter = StratifiedGroupKFold(
        n_splits=n_splits,
        shuffle=True,
        random_state=random_seed,
    )
    train_indices, test_indices = next(
        splitter.split(np.zeros(len(labels)), labels, groups=hostnames)
    )
    train_hosts = set(hostnames[train_indices])
    test_hosts = set(hostnames[test_indices])
    overlap = sorted(train_hosts & test_hosts)
    if overlap:
        raise AssertionError(
            f"Hostname leakage detected in grouped split: {overlap[:10]}"
        )
    return train_indices, test_indices, {
        "method": "StratifiedGroupKFold; first deterministic fold",
        "folds": n_splits,
        "requested_test_fraction": TEST_SIZE,
        "actual_test_fraction": float(len(test_indices) / len(labels)),
        "train_hostname_count": len(train_hosts),
        "test_hostname_count": len(test_hosts),
        "hostname_overlap_count": len(overlap),
        "groups_per_class": {
            CLASS_NAMES[int(label)]: int(count)
            for label, count in groups_per_class.items()
        },
    }


def _classification_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict[str, Any]:
    per_class_precision = precision_score(
        y_true, y_pred, labels=MODEL_LABELS, average=None, zero_division=0
    )
    per_class_recall = recall_score(
        y_true, y_pred, labels=MODEL_LABELS, average=None, zero_division=0
    )
    per_class_f1 = f1_score(
        y_true, y_pred, labels=MODEL_LABELS, average=None, zero_division=0
    )
    phishing_precision = precision_score(
        y_true, y_pred, labels=MODEL_LABELS, average=None, zero_division=0
    )[1]
    phishing_recall = recall_score(
        y_true, y_pred, labels=MODEL_LABELS, average=None, zero_division=0
    )[1]
    return {
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "macro_precision": float(
            precision_score(
                y_true, y_pred, labels=MODEL_LABELS, average="macro", zero_division=0
            )
        ),
        "macro_recall": float(
            recall_score(
                y_true, y_pred, labels=MODEL_LABELS, average="macro", zero_division=0
            )
        ),
        "macro_f1": float(
            f1_score(
                y_true, y_pred, labels=MODEL_LABELS, average="macro", zero_division=0
            )
        ),
        "phishing_precision": float(phishing_precision),
        "phishing_recall": float(phishing_recall),
        "per_class": {
            CLASS_NAMES[label]: {
                "precision": float(per_class_precision[index]),
                "recall": float(per_class_recall[index]),
                "f1": float(per_class_f1[index]),
                "support": int(np.sum(y_true == label)),
            }
            for index, label in enumerate(MODEL_LABELS)
        },
        "confusion_matrix": confusion_matrix(
            y_true, y_pred, labels=MODEL_LABELS
        ).tolist(),
        "confusion_matrix_labels": [CLASS_NAMES[label] for label in MODEL_LABELS],
    }


def _fit_and_evaluate(
    data: pd.DataFrame,
    train_indices: np.ndarray,
    test_indices: np.ndarray,
    split_metadata: dict[str, Any],
    experiment_name: str,
) -> dict[str, Any]:
    X = data[list(FEATURE_NAMES)].to_numpy(dtype=float)
    y = data["label"].to_numpy(dtype=int)
    X_train, X_test = X[train_indices], X[test_indices]
    y_train, y_test = y[train_indices], y[test_indices]

    train_classes = sorted(int(value) for value in np.unique(y_train))
    test_classes = sorted(int(value) for value in np.unique(y_test))
    missing_train_classes = [
        CLASS_NAMES[label] for label in MODEL_LABELS if label not in train_classes
    ]
    missing_test_classes = [
        CLASS_NAMES[label] for label in MODEL_LABELS if label not in test_classes
    ]

    split_metadata = {
        **split_metadata,
        "train_rows": int(len(train_indices)),
        "test_rows": int(len(test_indices)),
        "train_class_distribution": _class_distribution(y_train),
        "test_class_distribution": _class_distribution(y_test),
        "train_missing_classes": missing_train_classes,
        "test_missing_classes": missing_test_classes,
    }
    if missing_train_classes:
        return {
            "name": experiment_name,
            "status": "not_evaluated",
            "limitation": (
                "Training split lacks class(es): "
                + ", ".join(missing_train_classes)
                + "; the configured classifier cannot train a full four-class model."
            ),
            "split": split_metadata,
            "metrics": None,
        }

    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)
    model = LogisticRegression(
        max_iter=int(MODEL_SETTINGS["max_iter"]),
        class_weight={int(key): value for key, value in MODEL_SETTINGS["class_weight"].items()},
        random_state=RANDOM_SEED,
    )
    model.fit(X_train_scaled, y_train)
    predictions = model.predict(X_test_scaled)
    metrics = _classification_metrics(y_test, predictions)
    if missing_test_classes:
        limitation = (
            "Test split lacks class(es): "
            + ", ".join(missing_test_classes)
            + ". Metrics are retained using the fixed four-class label set; "
            "zero_division=0 applies to undefined class metrics."
        )
    else:
        limitation = None

    return {
        "name": experiment_name,
        "status": "evaluated",
        "limitation": limitation,
        "split": split_metadata,
        "metrics": metrics,
        "_model": model,
        "_scaler": scaler,
        "_test_indices": test_indices,
        "_test_predictions": predictions,
    }


def _canonical_destination(url: str) -> tuple[Any, ...]:
    parsed = urlsplit(url)
    scheme = parsed.scheme.lower()
    hostname = (parsed.hostname or "").lower().rstrip(".")
    port = parsed.port
    if port is None:
        port = 443 if scheme == "https" else 80 if scheme == "http" else None
    return (
        scheme,
        hostname,
        port,
        parsed.path or "/",
        parsed.query,
        parsed.fragment,
    )


def _representation_variants(url: str) -> dict[str, str]:
    """Create equivalent representations without changing URL resource semantics."""
    normalized = normalize_url(url)
    parsed = urlsplit(normalized)
    if parsed.scheme.lower() not in {"http", "https"} or not parsed.hostname:
        return {}
    if parsed.username is not None or parsed.password is not None:
        return {}

    host = parsed.hostname
    netloc = parsed.netloc
    base = urlunsplit(parsed)
    variants: dict[str, str] = {
        "scheme_case": f"{parsed.scheme.upper()}{base[len(parsed.scheme):]}",
    }

    if ":" not in host:
        uppercase_netloc = netloc.replace(host, host.upper(), 1)
        variants["hostname_case"] = urlunsplit(
            parsed._replace(netloc=uppercase_netloc)
        )

    default_port = 443 if parsed.scheme.lower() == "https" else 80
    if parsed.port is None:
        variants["explicit_default_port"] = urlunsplit(
            parsed._replace(netloc=f"{netloc}:{default_port}")
        )

    return {
        name: variant
        for name, variant in variants.items()
        if _canonical_destination(normalized) == _canonical_destination(variant)
    }


def _evaluate_representation_variations(
    data: pd.DataFrame,
    test_indices: np.ndarray,
    model: Any,
    scaler: Any,
) -> list[dict[str, Any]]:
    """Evaluate model stability on deterministic held-out equivalent URL forms."""
    if len(test_indices) == 0:
        return []
    rng = np.random.default_rng(RANDOM_SEED)
    sample_size = min(VARIATION_SAMPLE_SIZE, len(test_indices))
    selected = np.sort(rng.choice(test_indices, size=sample_size, replace=False))
    y_true = data["label"].to_numpy(dtype=int)
    records: list[dict[str, Any]] = []

    for variant_name in ("scheme_case", "hostname_case", "explicit_default_port"):
        originals: list[str] = []
        variants: list[str] = []
        labels: list[int] = []
        feature_equal_count = 0
        for index in selected:
            original = str(data.iloc[index]["url"])
            candidate = _representation_variants(original).get(variant_name)
            if candidate is None:
                continue
            original_features = extract_url_features(original)
            variant_features = extract_url_features(candidate)
            originals.append(original)
            variants.append(candidate)
            labels.append(int(y_true[index]))
            if original_features == variant_features:
                feature_equal_count += 1

        if not originals:
            records.append(
                {
                    "variation": variant_name,
                    "samples": 0,
                    "semantics_preserving": True,
                    "feature_vector_unchanged_fraction": None,
                    "prediction_flip_rate": None,
                    "original_accuracy": None,
                    "variant_accuracy": None,
                    "limitation": "No eligible held-out URLs for this transformation.",
                }
            )
            continue

        original_X = np.asarray(
            [list(extract_url_features(url).values()) for url in originals],
            dtype=float,
        )
        variant_X = np.asarray(
            [list(extract_url_features(url).values()) for url in variants],
            dtype=float,
        )
        original_predictions = model.predict(scaler.transform(original_X))
        variant_predictions = model.predict(scaler.transform(variant_X))
        labels_array = np.asarray(labels, dtype=int)
        records.append(
            {
                "variation": variant_name,
                "samples": len(originals),
                "semantics_preserving": True,
                "feature_vector_unchanged_fraction": float(
                    feature_equal_count / len(originals)
                ),
                "prediction_flip_rate": float(
                    np.mean(original_predictions != variant_predictions)
                ),
                "original_accuracy": float(
                    accuracy_score(labels_array, original_predictions)
                ),
                "variant_accuracy": float(
                    accuracy_score(labels_array, variant_predictions)
                ),
                "limitation": None,
            }
        )
    return records


def _write_markdown_report(report: dict[str, Any]) -> None:
    random_result = report["experiments"]["stratified_random"]
    grouped_result = report["experiments"]["hostname_disjoint"]
    lines = [
        "# PhishGuard Domain Generalization and Robustness (Experimental)",
        "",
        "> Experimental offline evaluation only. These results do not establish production performance or demonstrate an improvement.",
        "",
        "## Method",
        "",
        f"- Source: `{report['dataset']['source_path']}` ({report['dataset']['source_sha256']})",
        f"- Raw schema: columns `{', '.join(report['dataset']['source_columns'])}`; URL column `{report['dataset']['url_column']}`, label column `{report['dataset']['label_column']}`.",
        f"- Rows: {report['dataset']['source_rows']} raw; {report['dataset']['dataset_rows']} retained after the existing URL/label cleaning rules.",
        f"- Feature contract: the same ordered ten features used by live inference (`{', '.join(report['feature_names'])}`).",
        "- Model: fresh Logistic Regression fit independently for each split; StandardScaler fitted on training data only. The persisted production model and scaler were not loaded or changed.",
        f"- Settings: max_iter={report['model_settings']['max_iter']}, class_weight={report['model_settings']['class_weight']}, seed={report['random_seed']}.",
        "- No URLs were visited, crawled, or fetched. Test data was not used for fitting, feature selection, or threshold tuning.",
        "- Conflicting-label URL groups are excluded, matching the current preprocessing policy; exact duplicate URLs keep their first source row.",
        "",
        "## Evaluation",
        "",
        "| Experiment | Status | Train rows | Test rows | Hostname overlap | Accuracy | Macro precision | Macro recall | Macro F1 | Phishing precision | Phishing recall |",
        "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]

    for result in (random_result, grouped_result):
        metrics = result["metrics"]
        split = result["split"]
        if metrics is None:
            values = ["not reported"] * 6
        else:
            values = [
                f"{metrics['accuracy']:.4f}",
                f"{metrics['macro_precision']:.4f}",
                f"{metrics['macro_recall']:.4f}",
                f"{metrics['macro_f1']:.4f}",
                f"{metrics['phishing_precision']:.4f}",
                f"{metrics['phishing_recall']:.4f}",
            ]
        lines.append(
            "| "
            + " | ".join(
                [
                    result["name"],
                    result["status"],
                    str(split["train_rows"]),
                    str(split["test_rows"]),
                    str(split["hostname_overlap_count"]),
                    *values,
                ]
            )
            + " |"
        )
        if result["limitation"]:
            lines.extend(["", f"**Limitation ({result['name']}):** {result['limitation']}"])

    lines.extend(
        [
            "",
            "### Per-class test metrics",
            "",
            "| Experiment | Class | Precision | Recall | F1 | Support |",
            "|---|---|---:|---:|---:|---:|",
        ]
    )
    for result in (random_result, grouped_result):
        if result["metrics"] is None:
            continue
        for class_name, scores in result["metrics"]["per_class"].items():
            lines.append(
                f"| {result['name']} | {class_name} | {scores['precision']:.4f} | "
                f"{scores['recall']:.4f} | {scores['f1']:.4f} | {scores['support']} |"
            )

    lines.extend(
        [
            "",
            "All macro scores use the fixed four-class label set (Legitimate, Phishing, Defacement, Malware) and `zero_division=0`. Any absent class is explicitly listed below; its class-specific precision/recall and contribution to macro metrics require cautious interpretation.",
            "",
            "### Split class distributions",
            "",
            "| Experiment | Split | Legitimate | Phishing | Defacement | Malware |",
            "|---|---|---:|---:|---:|---:|",
        ]
    )
    for result in (random_result, grouped_result):
        for split_name in ("train", "test"):
            distribution = result["split"][f"{split_name}_class_distribution"]
            lines.append(
                f"| {result['name']} | {split_name} | "
                + " | ".join(str(distribution[CLASS_NAMES[label]]) for label in MODEL_LABELS)
                + " |"
            )

    grouped_overlap = grouped_result["split"]["hostname_overlap_count"]
    lines.extend(
        [
            "",
            f"Hostname-disjoint leakage check: **{grouped_overlap} overlapping hostnames**. The script asserts that this count is zero before fitting.",
            "",
            "### Confusion matrices",
            "",
            "Matrix row order is actual class and column order is predicted class, both: Legitimate, Phishing, Defacement, Malware.",
            "",
        ]
    )
    for result in (random_result, grouped_result):
        lines.extend(
            [
                f"#### {result['name']}",
                "",
            ]
        )
        metrics = result["metrics"]
        if metrics is None:
            lines.extend(["Not evaluated; no confusion matrix is available.", ""])
            continue
        labels = metrics["confusion_matrix_labels"]
        lines.extend(
            [
                "| Actual \\\\ Predicted | " + " | ".join(labels) + " |",
                "|---|" + "---:|" * len(labels),
            ]
        )
        for class_name, row in zip(labels, metrics["confusion_matrix"]):
            lines.append(f"| {class_name} | " + " | ".join(map(str, row)) + " |")
        lines.append("")

    lines.extend(
        [
            "## Offline representation variation check",
            "",
            "The deterministic sample comes only from the hostname-disjoint held-out set. Labels are inherited from each original row; no labels are generated. The tested forms vary scheme letter case, DNS hostname letter case, or add the scheme's default port. Each candidate is checked against a canonical URL destination before evaluation.",
            "",
            "| Variation | Samples | Feature vector unchanged | Prediction flip rate | Original accuracy | Variant accuracy |",
            "|---|---:|---:|---:|---:|---:|",
        ]
    )
    for item in report["representation_variations"]:
        vals = [
            "n/a" if item[key] is None else f"{item[key]:.4f}"
            for key in (
                "feature_vector_unchanged_fraction",
                "prediction_flip_rate",
                "original_accuracy",
                "variant_accuracy",
            )
        ]
        lines.append(
            f"| {item['variation']} | {item['samples']} | "
            + " | ".join(vals)
            + " |"
        )
        if item["limitation"]:
            lines.append(f"\nLimitation ({item['variation']}): {item['limitation']}")
    lines.extend(
        [
            "",
            "## Interpretation",
            "",
            "The random split estimates performance when URLs from known hostnames can appear on both sides. The hostname-disjoint split is the more direct test of generalization to unseen hostnames. Compare the full metric set and class distributions; do not treat the random-split score as evidence of domain generalization. Representation results measure sensitivity to the listed equivalent forms on this sample only and do not establish robustness to arbitrary URL changes.",
            "",
            "Outputs are reproducible from the raw dataset hash and seed. JSON contains complete metrics and split metadata; accompanying CSVs provide flat metrics, class distributions, confusion matrices, and variation results.",
            "",
        ]
    )
    MARKDOWN_REPORT_PATH.write_text("\n".join(lines), encoding="utf-8")


def run_evaluation() -> dict[str, Any]:
    """Run both fresh-model evaluations and persist reproducible artifacts."""
    EVALUATION_DIR.mkdir(parents=True, exist_ok=True)
    data, dataset_metadata = _load_labelled_urls()
    labels = data["label"].to_numpy(dtype=int)
    hostnames = data["hostname"].to_numpy(dtype=str)
    indices = np.arange(len(data))

    random_train, random_test = train_test_split(
        indices,
        test_size=TEST_SIZE,
        random_state=RANDOM_SEED,
        stratify=labels,
    )
    random_overlap = sorted(
        set(hostnames[random_train]) & set(hostnames[random_test])
    )
    random_result = _fit_and_evaluate(
        data,
        random_train,
        random_test,
        {
            "method": "train_test_split with stratify=label",
            "requested_test_fraction": TEST_SIZE,
            "actual_test_fraction": float(len(random_test) / len(indices)),
            "train_hostname_count": int(len(set(hostnames[random_train]))),
            "test_hostname_count": int(len(set(hostnames[random_test]))),
            "hostname_overlap_count": len(random_overlap),
        },
        "Stratified random",
    )

    group_train, group_test, group_metadata = _group_disjoint_split(labels, hostnames)
    group_result = _fit_and_evaluate(
        data,
        group_train,
        group_test,
        group_metadata,
        "Hostname-disjoint",
    )
    if group_result["split"]["hostname_overlap_count"] != 0:
        raise AssertionError("Hostname-disjoint evaluation contains hostname leakage.")

    if group_result["status"] == "evaluated":
        variations = _evaluate_representation_variations(
            data,
            group_test,
            group_result["_model"],
            group_result["_scaler"],
        )
    else:
        variations = []

    # Keep serialized output independent of fitted sklearn objects.
    for result in (random_result, group_result):
        for internal_key in ("_model", "_scaler", "_test_indices", "_test_predictions"):
            result.pop(internal_key, None)

    report: dict[str, Any] = {
        "evaluation_type": "experimental_offline_domain_generalization",
        "status": "experimental",
        "random_seed": RANDOM_SEED,
        "test_size": TEST_SIZE,
        "group_folds": GROUP_FOLDS,
        "dataset": dataset_metadata,
        "model_settings": MODEL_SETTINGS,
        "feature_names": list(FEATURE_NAMES),
        "feature_count": len(FEATURE_NAMES),
        "class_names": {str(label): CLASS_NAMES[label] for label in MODEL_LABELS},
        "class_distribution": _class_distribution(labels),
        "hostname_disjoint_leakage_assertion_passed": (
            group_result["split"]["hostname_overlap_count"] == 0
        ),
        "experiments": {
            "stratified_random": random_result,
            "hostname_disjoint": group_result,
        },
        "representation_variations": variations,
        "limitations": [
            "Experimental results are not production performance claims.",
            "The raw source labels and existing preprocessing rules determine the evaluated population.",
            "Macro metrics use the fixed four-class set; absent classes are reported per split.",
        ],
        "artifacts": {
            "json": JSON_REPORT_PATH.relative_to(PROJECT_ROOT).as_posix(),
            "markdown": MARKDOWN_REPORT_PATH.relative_to(PROJECT_ROOT).as_posix(),
            "metrics_csv": METRICS_PATH.relative_to(PROJECT_ROOT).as_posix(),
            "confusion_matrices_csv": CONFUSION_PATH.relative_to(PROJECT_ROOT).as_posix(),
            "class_distributions_csv": CLASS_DISTRIBUTION_PATH.relative_to(PROJECT_ROOT).as_posix(),
            "representation_variations_csv": VARIATIONS_PATH.relative_to(PROJECT_ROOT).as_posix(),
        },
    }

    metrics_rows = []
    confusion_rows = []
    distribution_rows = []
    for key, result in report["experiments"].items():
        split = result["split"]
        row: dict[str, Any] = {
            "experiment": result["name"],
            "status": result["status"],
            "train_rows": split["train_rows"],
            "test_rows": split["test_rows"],
            "train_hostname_count": split["train_hostname_count"],
            "test_hostname_count": split["test_hostname_count"],
            "hostname_overlap_count": split["hostname_overlap_count"],
            "limitation": result["limitation"],
        }
        if result["metrics"]:
            row.update(
                {
                    metric: result["metrics"][metric]
                    for metric in (
                        "accuracy",
                        "macro_precision",
                        "macro_recall",
                        "macro_f1",
                        "phishing_precision",
                        "phishing_recall",
                    )
                }
            )
            for class_name, scores in result["metrics"]["per_class"].items():
                for metric_name, value in scores.items():
                    row[f"{class_name.lower()}_{metric_name}"] = value
            matrix = result["metrics"]["confusion_matrix"]
            for actual_index, actual_name in enumerate(CLASS_NAMES[label] for label in MODEL_LABELS):
                for predicted_index, predicted_name in enumerate(CLASS_NAMES[label] for label in MODEL_LABELS):
                    confusion_rows.append(
                        {
                            "experiment": result["name"],
                            "actual": actual_name,
                            "predicted": predicted_name,
                            "count": matrix[actual_index][predicted_index],
                        }
                    )
        metrics_rows.append(row)
        for split_name in ("train", "test"):
            for class_name, count in split[f"{split_name}_class_distribution"].items():
                distribution_rows.append(
                    {
                        "experiment": result["name"],
                        "split": split_name,
                        "class": class_name,
                        "count": count,
                    }
                )

    pd.DataFrame(metrics_rows).to_csv(METRICS_PATH, index=False)
    pd.DataFrame(
        confusion_rows,
        columns=["experiment", "actual", "predicted", "count"],
    ).to_csv(CONFUSION_PATH, index=False)
    pd.DataFrame(distribution_rows).to_csv(CLASS_DISTRIBUTION_PATH, index=False)
    pd.DataFrame(report["representation_variations"]).to_csv(
        VARIATIONS_PATH, index=False
    )
    JSON_REPORT_PATH.write_text(
        json.dumps(report, indent=2, allow_nan=False) + "\n",
        encoding="utf-8",
    )
    _write_markdown_report(report)
    return report


if __name__ == "__main__":
    result = run_evaluation()
    print(f"Experimental report: {MARKDOWN_REPORT_PATH}")
    for experiment in result["experiments"].values():
        metrics = experiment["metrics"]
        print(f"{experiment['name']}: {experiment['status']}")
        if metrics:
            print(
                "  accuracy={accuracy:.4f} macro_f1={macro_f1:.4f} "
                "phishing_precision={phishing_precision:.4f} "
                "phishing_recall={phishing_recall:.4f}".format(**metrics)
            )
