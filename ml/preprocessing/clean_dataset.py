"""Inspect, clean, and explore a raw phishing URL dataset."""

from __future__ import annotations

import argparse
import json
import logging
import re
from pathlib import Path
from urllib.parse import urlsplit

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns

from ml.preprocessing.url_features import FEATURE_NAMES, extract_url_features, normalize_url


PROJECT_ROOT = Path(__file__).resolve().parents[2]
RAW_DATA_DIR = PROJECT_ROOT / "ml" / "data" / "raw"
PROCESSED_DATA_DIR = PROJECT_ROOT / "ml" / "data" / "processed"
EDA_OUTPUT_DIR = PROCESSED_DATA_DIR / "eda"
DEFAULT_RAW_DATASET = RAW_DATA_DIR / "malicious_phish.csv"
RANDOM_STATE = 42

LABEL_ALIASES = {
    "legitimate": "Legitimate",
    "legit": "Legitimate",
    "benign": "Legitimate",
    "safe": "Legitimate",
    "phishing": "Phishing",
    "phish": "Phishing",
    "defacement": "Defacement",
    "malware": "Malware",
    "malicious": "Phishing",
    "suspicious": "Suspicious",
}
LABEL_CODES = {
    "Legitimate": 0,
    "Phishing": 1,
    "Defacement": 2,
    "Malware": 3,
    "Suspicious": 4,
}
CLASS_NAMES = {code: name for name, code in LABEL_CODES.items()}
URL_NAME_HINTS = {"url", "uri", "link", "website", "webaddress", "domain"}
LABEL_NAME_HINTS = {"label", "class", "target", "category", "status", "result"}
LOGGER = logging.getLogger("phishguard.clean_dataset")


def _normalized_text(value: object) -> str:
    """Normalize a column name or label for matching."""
    return re.sub(r"[^a-z0-9]+", "", str(value).strip().lower())


def _recognized_label(value: object) -> str | None:
    """Return a semantic label name when the source value is recognized."""
    if pd.isna(value):
        return None
    return LABEL_ALIASES.get(str(value).strip().lower())


def _url_name_score(column_name: object) -> int:
    normalized = _normalized_text(column_name)
    if normalized in URL_NAME_HINTS:
        return 5
    if any(hint in normalized for hint in URL_NAME_HINTS):
        return 3
    return 0


def _label_name_score(column_name: object) -> int:
    normalized = _normalized_text(column_name)
    return 4 if normalized in LABEL_NAME_HINTS else 0


def _looks_like_url(value: object) -> bool:
    if pd.isna(value):
        return False
    text = str(value).strip()
    try:
        parsed = urlsplit(text)
    except ValueError:
        return False
    return parsed.scheme.lower() in {"http", "https"} and bool(parsed.hostname)


def detect_columns(dataframe: pd.DataFrame) -> tuple[str, str]:
    """Detect URL and label columns or fail explicitly when ambiguous."""
    if dataframe.empty or len(dataframe.columns) < 2:
        raise ValueError("The input dataset must contain at least two columns and one row.")

    url_scores: dict[str, int] = {}
    label_scores: dict[str, int] = {}
    for column in dataframe.columns:
        values = dataframe[column].dropna()
        sample = values.head(200)
        url_ratio = float(sample.map(_looks_like_url).mean()) if not sample.empty else 0.0
        label_ratio = (
            float(sample.map(_recognized_label).notna().mean()) if not sample.empty else 0.0
        )
        url_scores[column] = _url_name_score(column) + (4 if url_ratio >= 0.5 else 0)
        label_scores[column] = _label_name_score(column) + (
            4 if label_ratio >= 0.5 else 0
        )

    url_candidates = sorted(url_scores.items(), key=lambda item: item[1], reverse=True)
    url_column, url_score = url_candidates[0]
    if url_score == 0 or (
        len(url_candidates) > 1 and url_candidates[1][1] == url_score
    ):
        raise ValueError(f"Could not uniquely detect the URL column: {url_scores}")

    label_scores.pop(url_column, None)
    label_candidates = sorted(label_scores.items(), key=lambda item: item[1], reverse=True)
    label_column, label_score = label_candidates[0]
    if label_score == 0 or (
        len(label_candidates) > 1 and label_candidates[1][1] == label_score
    ):
        raise ValueError(f"Could not uniquely detect the label column: {label_scores}")

    return str(url_column), str(label_column)


def _is_processable_url(value: str) -> tuple[bool, str]:
    """Check whether a string is structurally processable without fetching it."""
    if not value:
        return False, "empty URL"
    if any(character.isspace() for character in value):
        return False, "contains unescaped whitespace"
    try:
        parsed = urlsplit(value)
        hostname = parsed.hostname
        port = parsed.port
    except ValueError as error:
        return False, f"malformed URL: {error}"
    if parsed.scheme.lower() not in {"http", "https"}:
        return False, "missing or unsupported HTTP(S) scheme"
    if not hostname:
        return False, "missing hostname"
    if any(character.isspace() for character in hostname):
        return False, "hostname contains whitespace"
    if port is not None and not 1 <= port <= 65535:
        return False, "port is outside the valid range"
    return True, ""


def _url_features(url: str) -> dict[str, int]:
    """Calculate preliminary URL-level EDA variables."""
    return extract_url_features(url)


def _profile_dataset(dataframe: pd.DataFrame) -> None:
    """Print the requested initial dataset profile."""
    print(f"Dataset shape: {dataframe.shape}")
    print("\nFirst 10 rows:")
    print(dataframe.head(10).to_string(index=False))
    print("\nColumn names:")
    print(list(dataframe.columns))
    print("\nData types:")
    print(dataframe.dtypes.to_string())
    print("\nMissing values by column:")
    print(dataframe.isna().sum().to_string())
    print(f"\nExact duplicate records: {int(dataframe.duplicated().sum())}")
    print("\nUnique values in categorical columns:")
    for column in dataframe.select_dtypes(include=["object", "string", "category"]):
        unique_values = dataframe[column].dropna().unique().tolist()
        if len(unique_values) <= 30:
            print(f"  {column}: {unique_values}")
        else:
            print(f"  {column}: {len(unique_values)} unique values (showing first 30)")
            print(f"    {unique_values[:30]}")


def _label_map(series: pd.Series) -> tuple[pd.Series, dict[str, int]]:
    """Normalize recognized semantic labels into stable integer codes."""
    normalized = series.map(_recognized_label)
    unknown = sorted(
        {str(value).strip() for value in series.dropna() if _recognized_label(value) is None}
    )
    if unknown:
        raise ValueError(
            "Unrecognized/additional label values found: "
            f"{unknown}. No rows were discarded. Inspect the classes and explicitly "
            "extend LABEL_ALIASES/LABEL_CODES before producing a training dataset."
        )

    original_values = sorted({str(value).strip() for value in series.dropna()})
    mapping: dict[str, int] = {}
    for original_value in original_values:
        canonical_name = _recognized_label(original_value)
        if canonical_name is not None:
            mapping[original_value] = LABEL_CODES[canonical_name]
    encoded = normalized.map(LABEL_CODES).astype("Int64")
    return encoded, mapping


def _host_path_key(url: str) -> tuple[str, str, str] | None:
    """Build a conservative near-duplicate key while ignoring query/fragment."""
    try:
        parsed = urlsplit(url)
    except ValueError:
        return None
    if not parsed.hostname:
        return None
    path = (parsed.path or "/").rstrip("/") or "/"
    return parsed.scheme.lower(), parsed.hostname.lower(), path


def _near_duplicate_report(dataframe: pd.DataFrame) -> pd.DataFrame:
    """Summarize distinct URLs sharing scheme, host, and path."""
    rows: list[dict[str, object]] = []
    eligible = dataframe[["url", "label"]].drop_duplicates()
    eligible = eligible.assign(key=eligible["url"].map(_host_path_key))
    for key, group in eligible[eligible["key"].notna()].groupby("key", sort=True):
        distinct_urls = sorted(group["url"].unique().tolist())
        if len(distinct_urls) < 2:
            continue
        labels = sorted(group["label"].unique().tolist())
        rows.append(
            {
                "scheme": key[0],
                "hostname": key[1],
                "path": key[2],
                "distinct_url_count": len(distinct_urls),
                "distinct_label_count": len(labels),
                "labels": "|".join(CLASS_NAMES[int(label)] for label in labels),
                "example_urls": " | ".join(distinct_urls[:5]),
            }
        )
    return pd.DataFrame(
        rows,
        columns=[
            "scheme",
            "hostname",
            "path",
            "distinct_url_count",
            "distinct_label_count",
            "labels",
            "example_urls",
        ],
    ).sort_values(
        ["distinct_url_count", "hostname", "path"], ascending=[False, True, True]
    )


def _outlier_summary(feature_data: pd.DataFrame) -> list[str]:
    """Report high-end outliers without removing them."""
    findings: list[str] = []
    columns = {
        "url_length": "URL length",
        "digit_count": "digit count",
        "special_character_count": "special-character count",
    }
    for column, description in columns.items():
        q1, q3 = np.percentile(feature_data[column].to_numpy(), [25, 75])
        q1 = float(q1)
        q3 = float(q3)
        threshold = q3 + 3 * (q3 - q1)
        outliers = feature_data[feature_data[column] > threshold]
        examples = outliers.nlargest(3, column)[["url", column]]
        example_text = "; ".join(
            f"{row.url} ({int(getattr(row, column))})"
            for row in examples.itertuples(index=False)
        )
        findings.append(
            f"{description} outliers above {threshold:.1f}: {len(outliers)}; "
            f"retained in dataset. Examples: {example_text or 'none'}"
        )
    return findings


def _save_plots(feature_data: pd.DataFrame, class_counts: pd.Series) -> None:
    """Save meaningful class and URL-property visualizations."""
    EDA_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    class_order = [
        code for code in CLASS_NAMES if code in feature_data["label"].unique()
    ]
    class_labels = [CLASS_NAMES[code] for code in class_order]
    plot_data = feature_data.assign(
        class_name=feature_data["label"].map(CLASS_NAMES)
    )
    palette = {
        CLASS_NAMES[code]: color
        for code, color in zip(class_order, sns.color_palette("colorblind", len(class_order)))
    }

    fig, axis = plt.subplots(figsize=(8, 5))
    sns.barplot(
        x=[CLASS_NAMES[int(code)] for code in class_counts.index],
        y=class_counts.values,
        hue=[CLASS_NAMES[int(code)] for code in class_counts.index],
        palette=palette,
        legend=False,
        ax=axis,
    )
    axis.set(title="Phishing vs Legitimate", xlabel="Class", ylabel="URL count")
    fig.tight_layout()
    fig.savefig(EDA_OUTPUT_DIR / "class_distribution.png", dpi=160)
    plt.close(fig)

    fig, axis = plt.subplots(figsize=(10, 5))
    sns.histplot(
        data=plot_data,
        x="url_length",
        hue="class_name",
        hue_order=class_labels,
        palette=palette,
        bins=30,
        element="step",
        stat="count",
        common_norm=False,
        ax=axis,
    )
    axis.set(title="URL Length Distribution", xlabel="URL length (characters)")
    fig.tight_layout()
    fig.savefig(EDA_OUTPUT_DIR / "url_length_distribution.png", dpi=160)
    plt.close(fig)

    for feature, title, filename, ylabel in [
        ("url_length", "URL Length by Class", "url_length_by_class.png", "Characters"),
        (
            "special_character_count",
            "Special Characters per URL by Class",
            "special_characters_by_class.png",
            "Special characters per URL",
        ),
        ("digit_count", "Digits per URL by Class", "digit_distribution.png", "Digits"),
        ("dot_count", "Dots per URL by Class", "dot_distribution.png", "Dots"),
    ]:
        fig, axis = plt.subplots(figsize=(8, 5))
        sns.boxplot(
            data=plot_data,
            x="class_name",
            y=feature,
            order=class_labels,
            hue="class_name",
            hue_order=class_labels,
            palette=palette,
            legend=False,
            ax=axis,
        )
        axis.set(title=title, xlabel="Class", ylabel=ylabel)
        fig.tight_layout()
        fig.savefig(EDA_OUTPUT_DIR / filename, dpi=160)
        plt.close(fig)


def _write_data_dictionary(
    cleaned_data: pd.DataFrame, source_name: str
) -> pd.DataFrame:
    """Write column metadata for the cleaned dataset."""
    descriptions = {
        "url": "Whitespace-trimmed, structurally processable website URL.",
        "label": "Integer target class: 0=Legitimate, 1=Phishing, 2=Suspicious.",
    }
    rows = []
    for column in cleaned_data.columns:
        dtype = cleaned_data[column].dtype
        if column == "url":
            allowed_values = "Non-empty HTTP(S) URL string"
            source = source_name
        elif column == "label":
            present_labels = sorted(cleaned_data[column].unique().tolist())
            allowed_values = "|".join(
                f"{code}={CLASS_NAMES[int(code)]}" for code in present_labels
            )
            source = "Processed from source label column"
        else:
            allowed_values = ""
            source = source_name
        rows.append(
            {
                "column_name": column,
                "data_type": "string" if column == "url" else str(dtype),
                "description": descriptions.get(
                    column, f"Preserved source column '{column}'."
                ),
                "source": source,
                "allowed_values": allowed_values,
            }
        )
    dictionary = pd.DataFrame(rows)
    dictionary.to_csv(PROCESSED_DATA_DIR / "data_dictionary.csv", index=False)
    return dictionary


def run_cleaning(raw_path: Path) -> dict[str, object]:
    """Run data inspection, cleaning, validation, and exploratory analysis."""
    if not raw_path.is_file():
        raise FileNotFoundError(f"Raw dataset was not found: {raw_path}")

    original = pd.read_csv(raw_path)
    if original.empty:
        raise ValueError(f"Raw dataset contains no records: {raw_path}")
    _profile_dataset(original)
    url_column, label_column = detect_columns(original)
    print(f"\nDetected URL column: {url_column}")
    print(f"Detected label column: {label_column}")

    normalized_labels, label_mapping = _label_map(original[label_column])
    original_labels = sorted(
        {str(value).strip() for value in original[label_column].dropna()}
    )
    print("\nOriginal labels and mapping used:")
    for original_label in original_labels:
        code = label_mapping[original_label]
        print(f"  {original_label} -> {code} ({CLASS_NAMES[code]})")

    PROCESSED_DATA_DIR.mkdir(parents=True, exist_ok=True)
    EDA_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    work = original.copy()
    work[url_column] = work[url_column].astype("string").str.strip()
    missing_scheme_mask = (
        work[url_column].notna()
        & ~work[url_column].str.match(r"(?i)^https?://", na=False)
    )
    normalized_scheme_count = int(missing_scheme_mask.sum())
    work.loc[missing_scheme_mask, url_column] = work.loc[
        missing_scheme_mask, url_column
    ].map(normalize_url)
    work[label_column] = normalized_labels
    source_missing_values = int(original.isna().sum().sum())
    missing_url_mask = work[url_column].isna() | work[url_column].eq("")
    missing_url_count = int(missing_url_mask.sum())
    missing_label_count = int(work[label_column].isna().sum())
    present_url_rows = work.loc[~missing_url_mask].copy()
    labeled_url_rows = present_url_rows.loc[
        present_url_rows[label_column].notna()
    ].copy()

    duplicate_url_rows = int(present_url_rows[url_column].duplicated().sum())
    duplicate_percentage = (
        duplicate_url_rows / len(present_url_rows) * 100 if len(present_url_rows) else 0.0
    )
    exact_duplicate_records = int(original.duplicated().sum())
    duplicate_mask = present_url_rows[url_column].duplicated(keep="first")
    duplicate_label_counts = (
        present_url_rows.loc[duplicate_mask, label_column]
        .dropna()
        .value_counts()
        .sort_index()
    )

    conflict_mask = labeled_url_rows.groupby(url_column)[label_column].transform(
        "nunique"
    ) > 1
    conflicting_records = labeled_url_rows.loc[conflict_mask].copy()
    conflict_examples = conflicting_records[[url_column, label_column]].rename(
        columns={url_column: "url", label_column: "label"}
    )
    conflict_examples["label_name"] = conflict_examples["label"].map(CLASS_NAMES)
    conflict_groups = int(conflicting_records[url_column].nunique())
    conflict_record_count = len(conflicting_records)
    conflict_examples.to_csv(
        EDA_OUTPUT_DIR / "conflicting_url_labels.csv", index=False
    )

    url_presence = ~missing_url_mask
    validity = pd.Series(False, index=work.index, dtype=bool)
    invalid_reasons = pd.Series("", index=work.index, dtype="string")
    for row_index in work.index[url_presence]:
        value = str(work.at[row_index, url_column])
        is_valid, reason = _is_processable_url(value)
        validity.at[row_index] = is_valid
        invalid_reasons.at[row_index] = reason
    invalid_rows = work.loc[url_presence & ~validity].copy()
    invalid_url_count = len(invalid_rows)
    invalid_rows["invalid_reason"] = invalid_reasons.loc[invalid_rows.index]
    invalid_export = invalid_rows.rename(
        columns={url_column: "url", label_column: "label"}
    )
    invalid_export.to_csv(EDA_OUTPUT_DIR / "invalid_urls.csv", index=False)

    nonconflicting = labeled_url_rows.loc[~conflict_mask].copy()
    after_deduplication = nonconflicting.drop_duplicates(
        subset=[url_column], keep="first"
    ).copy()
    duplicate_rows_removed_from_training = len(nonconflicting) - len(after_deduplication)
    invalid_unique_mask = ~validity.loc[after_deduplication.index]
    cleaned_source = after_deduplication.loc[~invalid_unique_mask].copy()
    invalid_unique_rows_removed = int(invalid_unique_mask.sum())

    additional_columns = [
        column for column in original.columns if column not in {url_column, label_column}
    ]
    collisions = {
        str(column).strip().lower()
        for column in additional_columns
        if str(column).strip().lower() in {"url", "label"}
    }
    if collisions:
        raise ValueError(
            "Additional source columns conflict with required output columns "
            f"{sorted(collisions)}; resolve the column naming ambiguity explicitly."
        )
    cleaned = pd.DataFrame(
        {
            "url": cleaned_source[url_column].astype(str).to_numpy(),
            "label": cleaned_source[label_column].astype("int64").to_numpy(),
        },
        index=cleaned_source.index,
    )
    for column in additional_columns:
        cleaned[column] = cleaned_source[column]
    cleaned = cleaned.reset_index(drop=True)

    if cleaned_source.empty:
        raise ValueError(
            "No processable URL rows with recognized labels remain after cleaning."
        )

    feature_rows = [
        extract_url_features(url) for url in cleaned["url"].tolist()
    ]
    feature_data = pd.DataFrame(feature_rows, index=cleaned.index)
    feature_data = feature_data[list(FEATURE_NAMES)]
    feature_data["label"] = cleaned["label"]
    feature_data["url"] = cleaned["url"]

    processed_path = PROCESSED_DATA_DIR / "cleaned_urls.csv"
    cleaned.to_csv(processed_path, index=False)
    feature_dataset_path = PROCESSED_DATA_DIR / "feature_dataset.csv"
    feature_dataset = feature_data[list(FEATURE_NAMES) + ["label"]]
    feature_dataset.to_csv(feature_dataset_path, index=False)
    (PROCESSED_DATA_DIR / "feature_names.json").write_text(
        json.dumps(list(FEATURE_NAMES), indent=2) + "\n",
        encoding="utf-8",
    )
    _write_data_dictionary(cleaned, raw_path.name)

    near_duplicates = _near_duplicate_report(
        labeled_url_rows.rename(
            columns={url_column: "url", label_column: "label"}
        ).assign(label=lambda frame: frame["label"].astype("int64"))
    )
    near_duplicates.to_csv(EDA_OUTPUT_DIR / "near_identical_url_groups.csv", index=False)

    class_counts = cleaned["label"].value_counts().sort_index()
    class_percentages = class_counts / len(cleaned) * 100 if len(cleaned) else class_counts
    _save_plots(feature_data, class_counts)
    class_distribution = {
        CLASS_NAMES[int(code)]: {
            "count": int(count),
            "percentage": float(class_percentages.loc[code]),
        }
        for code, count in class_counts.items()
    }

    comparison_rows = []
    for code, group in feature_data.groupby("label", sort=True):
        comparison_rows.append(
            {
                "class": CLASS_NAMES[int(code)],
                "count": len(group),
                "average_url_length": float(group["url_length"].mean()),
                "median_url_length": float(group["url_length"].median()),
                "average_hostname_length": float(group["hostname_length"].mean()),
                "average_path_length": float(group["path_length"].mean()),
                "average_dots": float(group["dot_count"].mean()),
                "average_hyphens": float(group["hyphen_count"].mean()),
                "average_digits": float(group["digit_count"].mean()),
                "average_special_characters": float(
                    group["special_character_count"].mean()
                ),
                "average_subdirectories": float(group["subdirectory_count"].mean()),
            }
        )
    comparison = pd.DataFrame(comparison_rows)
    comparison.to_csv(EDA_OUTPUT_DIR / "class_url_characteristics.csv", index=False)
    feature_columns = list(FEATURE_NAMES)
    feature_summary = feature_data[feature_columns].describe().T.reset_index()
    feature_summary = feature_summary.rename(columns={"index": "feature"})
    feature_summary.to_csv(EDA_OUTPUT_DIR / "url_feature_summary.csv", index=False)

    outlier_findings = _outlier_summary(feature_data)
    row_removal_count = len(original) - len(cleaned)
    cross_label_near_groups = (
        int(near_duplicates["distinct_label_count"].gt(1).sum())
        if not near_duplicates.empty
        else 0
    )
    near_variant_groups = len(near_duplicates)

    report_lines = [
        "PHISHGUARD DATA CLEANING AND EDA REPORT",
        f"Source dataset: {raw_path}",
        f"Original dataset size: {len(original)} rows, {len(original.columns)} columns",
        f"Cleaned dataset size: {len(cleaned)} rows, {len(cleaned.columns)} columns",
        f"Rows removed overall: {row_removal_count}",
        f"Missing URL rows removed: {missing_url_count}",
        f"Missing label values: {missing_label_count}",
        f"URLs normalized with default http:// scheme: {normalized_scheme_count}",
        f"Total missing field values in raw data: {source_missing_values}",
        f"Duplicate URL rows identified: {duplicate_url_rows} "
        f"({duplicate_percentage:.2f}% of non-empty URL rows)",
        f"Exact duplicate records in raw data: {exact_duplicate_records}",
        "Duplicate URL rows by normalized class: "
        + (
            ", ".join(
                f"{CLASS_NAMES[int(code)]}={int(count)}"
                for code, count in duplicate_label_counts.items()
            )
            or "none"
        ),
        f"Duplicate URL rows removed from non-conflicting data: "
        f"{duplicate_rows_removed_from_training}",
        f"Conflicting URL groups: {conflict_groups}; "
        f"conflicting records excluded: {conflict_record_count}",
        f"Invalid/unprocessable URL records before de-duplication: {invalid_url_count}",
        f"Unique invalid URL rows excluded after de-duplication: "
        f"{invalid_unique_rows_removed}",
        "Final class distribution:",
    ]
    for class_name, statistics in class_distribution.items():
        report_lines.append(
            f"  {class_name}: {statistics['count']} "
            f"({statistics['percentage']:.2f}%)"
        )
    present_main_classes = [
        class_name
        for class_name in ("Legitimate", "Phishing")
        if class_name in class_distribution
    ]
    if len(present_main_classes) >= 2:
        counts = [
            class_distribution[name]["count"] for name in present_main_classes
        ]
        imbalance_ratio = max(counts) / min(counts)
        report_lines.append(f"Legitimate/phishing class imbalance ratio: {imbalance_ratio:.3f}:1")
    report_lines.extend(
        [
            "Potential leakage findings:",
            f"  Exact duplicate URL rows detected before cleaning: {duplicate_url_rows}; "
            "deduplicate before any train/test split.",
            f"  Same URL with conflicting labels: {conflict_groups} groups.",
            f"  Distinct URLs sharing scheme/host/path (query/fragment ignored): "
            f"{near_variant_groups} groups; "
            f"{cross_label_near_groups} cross-label groups. These are reported, "
            "not automatically removed; split by host/path groups during evaluation.",
            "  Near-identical URL examples: "
            + (
                " | ".join(
                    f"{row.hostname}{row.path} ({row.distinct_url_count} variants)"
                    for row in near_duplicates.head(5).itertuples(index=False)
                )
                if not near_duplicates.empty
                else "none"
            ),
            "  Direct target-feature leakage: "
            + (
                "no non-target source columns were present; the raw dataset "
                "contains only the URL and target label."
                if not additional_columns
                else "review preserved source columns alongside the target; "
                "the cleaned dataset retains them for manual review."
            ),
            "Important URL-level characteristics (calculated on cleaned rows):",
            comparison.to_string(index=False) if not comparison.empty else "  unavailable",
            "Outlier analysis (high values are retained):",
            *[f"  {finding}" for finding in outlier_findings],
            "Decision: retain unusual but processable URL outliers because they may "
            "carry phishing signals; review the reported invalid URLs separately.",
        ]
    )
    report_text = "\n".join(report_lines) + "\n"
    (EDA_OUTPUT_DIR / "eda_report.txt").write_text(report_text, encoding="utf-8")

    reloaded = pd.read_csv(processed_path)
    missing_urls_after = int(
        reloaded["url"].isna().sum()
        + reloaded["url"].fillna("").astype(str).str.strip().eq("").sum()
    )
    duplicate_urls_after = int(reloaded["url"].duplicated().sum())
    missing_labels_after = int(reloaded["label"].isna().sum())
    labels_normalized = set(reloaded["label"].dropna().tolist()).issubset(
        set(LABEL_CODES.values())
    )
    url_strings = bool(reloaded["url"].map(lambda value: isinstance(value, str)).all())
    class_distribution_known = bool(class_distribution)
    both_binary_classes_present = {0, 1}.issubset(set(reloaded["label"].tolist()))
    feature_values = feature_dataset[list(FEATURE_NAMES)].to_numpy(dtype=float)
    feature_dataset_valid = (
        list(feature_dataset.columns) == list(FEATURE_NAMES) + ["label"]
        and feature_values.shape == (len(cleaned), len(FEATURE_NAMES))
        and np.isfinite(feature_values).all()
        and set(feature_dataset["label"].unique()).issubset(set(LABEL_CODES.values()))
    )
    constant_features = [
        column for column in FEATURE_NAMES if feature_dataset[column].nunique() <= 1
    ]
    checks = {
        "No missing URLs": missing_urls_after == 0,
        "No duplicate URLs": duplicate_urls_after == 0,
        "No missing labels": missing_labels_after == 0,
        "Labels are normalized": labels_normalized,
        "URL column contains strings": url_strings,
        "Class distribution is known": class_distribution_known,
        "Legitimate and phishing classes are present": both_binary_classes_present,
        "Cleaned CSV reloads successfully": list(reloaded.columns) == list(cleaned.columns),
        "Processed feature columns match the canonical order": feature_dataset_valid,
    }
    ready = all(checks.values())

    print("\nNumerical class distribution:")
    for class_name, statistics in class_distribution.items():
        print(
            f"  {class_name}: {statistics['count']} "
            f"({statistics['percentage']:.2f}%)"
        )
    print(f"\nDuplicate URL percentage: {duplicate_percentage:.2f}%")
    print(
        f"Valid/processable URL records: {int(validity.sum())}; "
        f"invalid/unprocessable URL records: {invalid_url_count}"
    )
    print(f"Potential conflicting URL-label groups: {conflict_groups}")
    print(f"Distinct near-identical URL groups: {near_variant_groups}")
    print("\n" + report_text)
    print("========== PHISHGUARD DATASET VALIDATION ==========")
    print(f"\nRows: {len(reloaded)}")
    print(f"Columns: {', '.join(reloaded.columns)}")
    print(
        f"Feature dataset shape: {feature_dataset.shape}; "
        f"features per row: {len(FEATURE_NAMES)}"
    )
    print(f"Constant features retained for train/live compatibility: {constant_features}")
    print(f"\nMissing URLs: {missing_urls_after}")
    print(f"Duplicate URLs: {duplicate_urls_after}")
    print(f"Missing Labels: {missing_labels_after}")
    print(f"\nLegitimate: {class_distribution.get('Legitimate', {}).get('count', 0)}")
    print(f"Phishing: {class_distribution.get('Phishing', {}).get('count', 0)}")
    for check_name, passed in checks.items():
        print(f"{check_name}: {'PASS' if passed else 'FAIL'}")
    if ready:
        print("\nDataset status: READY FOR FEATURE ENGINEERING")
    else:
        print("\nDataset status: NOT READY FOR FEATURE ENGINEERING")

    return {
        "raw_path": raw_path,
        "processed_path": processed_path,
        "feature_dataset_path": feature_dataset_path,
        "original_rows": len(original),
        "cleaned_rows": len(cleaned),
        "duplicate_url_rows": duplicate_url_rows,
        "duplicate_percentage": duplicate_percentage,
        "missing_url_rows": missing_url_count,
        "invalid_url_rows": invalid_url_count,
        "conflicting_url_groups": conflict_groups,
        "class_distribution": class_distribution,
        "comparison": comparison,
        "validation": checks,
        "constant_features": constant_features,
        "ready": ready,
        "eda_output_dir": EDA_OUTPUT_DIR,
    }


def _default_raw_path() -> Path:
    """Return the configured project-relative source dataset."""
    if not DEFAULT_RAW_DATASET.is_file():
        raise FileNotFoundError(f"Configured raw dataset is missing: {DEFAULT_RAW_DATASET}")
    return DEFAULT_RAW_DATASET


def main() -> int:
    """Parse command-line arguments and run the reproducible data pipeline."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--input",
        type=Path,
        default=None,
        help="Input CSV path (defaults to malicious_phish.csv in ml/data/raw).",
    )
    arguments = parser.parse_args()
    raw_path = arguments.input or _default_raw_path()
    if not raw_path.is_absolute():
        raw_path = (Path.cwd() / raw_path).resolve()
    try:
        results = run_cleaning(raw_path)
    except (OSError, pd.errors.ParserError, ValueError) as error:
        LOGGER.error("Dataset cleaning failed: %s", error)
        return 1
    return 0 if results["ready"] else 1


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    raise SystemExit(main())
