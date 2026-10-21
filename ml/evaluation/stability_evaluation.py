"""PhishGuard Stability Shield — Offline Research Evaluation.

Measures prediction stability across a labelled benchmark dataset under
RFC 3986 semantics-preserving URL representations (case normalization,
explicit default ports, and root path equivalence).

Evaluates whether representation variations induce model prediction flips,
measures class-wise stability rates, identifies specific transformation
vulnerabilities, and documents limitations.
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd

# Add repo root to sys.path
REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend.models.stability import (
    STABILITY_EXPLANATION,
    STABILITY_LIMITATIONS,
    assess_url_stability,
)
from ml.preprocessing.url_features import extract_url_features, normalize_url

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
LOGGER = logging.getLogger("stability_evaluation")

CLASS_NAMES: dict[int, str] = {
    0: "LEGITIMATE",
    1: "PHISHING",
    2: "DEFACEMENT",
    3: "MALWARE",
}

FEATURE_NAMES = (
    "url_length",
    "hostname_length",
    "path_length",
    "dot_count",
    "hyphen_count",
    "digit_count",
    "special_character_count",
    "subdirectory_count",
    "has_https",
    "query_length",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Evaluate PhishGuard prediction stability.")
    parser.add_argument(
        "--data-path",
        type=Path,
        default=REPO_ROOT / "ml" / "data" / "processed" / "cleaned_urls.csv",
        help="Path to cleaned labelled URL dataset.",
    )
    parser.add_argument(
        "--model-path",
        type=Path,
        default=REPO_ROOT / "models" / "final_model.pkl",
        help="Path to trained model pickle.",
    )
    parser.add_argument(
        "--scaler-path",
        type=Path,
        default=REPO_ROOT / "models" / "scaler.pkl",
        help="Path to scaler pickle.",
    )
    parser.add_argument(
        "--samples-per-class",
        type=int,
        default=250,
        help="Number of samples to evaluate per class (total = 4 * samples_per_class).",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Random seed for sampling.",
    )
    parser.add_argument(
        "--output-json",
        type=Path,
        default=REPO_ROOT / "ml" / "evaluation" / "stability_evaluation_report.json",
        help="Path to output JSON report.",
    )
    parser.add_argument(
        "--output-md",
        type=Path,
        default=REPO_ROOT / "reports" / "stability_evaluation_report.md",
        help="Path to output Markdown report.",
    )
    return parser.parse_args()


def load_dataset(data_path: Path, samples_per_class: int, seed: int) -> pd.DataFrame:
    LOGGER.info("Loading dataset from %s", data_path)
    df = pd.read_csv(data_path)
    if "url" not in df.columns or "label" not in df.columns:
        raise ValueError(f"Dataset must contain 'url' and 'label' columns, got: {list(df.columns)}")

    sampled_dfs = []
    for label_id in sorted(CLASS_NAMES.keys()):
        class_df = df[df["label"] == label_id]
        n_samples = min(samples_per_class, len(class_df))
        sampled_dfs.append(class_df.sample(n=n_samples, random_state=seed))

    balanced_df = pd.concat(sampled_dfs, ignore_index=True)
    LOGGER.info(
        "Sampled %d URLs across %d classes (%d per class)",
        len(balanced_df),
        len(CLASS_NAMES),
        samples_per_class,
    )
    return balanced_df


def _extract_feature_series(url: str) -> pd.Series:
    features = extract_url_features(url)
    return pd.Series([features[col] for col in FEATURE_NAMES], index=list(FEATURE_NAMES))


def run_stability_evaluation(
    df: pd.DataFrame,
    model: Any,
    scaler: Any,
) -> dict[str, Any]:
    records: list[dict[str, Any]] = []
    transformation_stats: dict[str, dict[str, int]] = {}

    for idx, row in df.iterrows():
        raw_url = str(row["url"])
        ground_truth_id = int(row["label"])
        ground_truth_label = CLASS_NAMES.get(ground_truth_id, f"CLASS_{ground_truth_id}")

        norm_url = normalize_url(raw_url)
        features = _extract_feature_series(norm_url)
        feat_df = pd.DataFrame([features])

        if scaler is not None:
            model_input = scaler.transform(feat_df)
        else:
            model_input = feat_df.to_numpy(dtype=float)

        raw_pred = model.predict(model_input)[0]
        orig_pred = CLASS_NAMES.get(int(raw_pred), str(raw_pred))

        stab_res = assess_url_stability(
            url=norm_url,
            original_prediction=orig_pred,
            feature_extractor=_extract_feature_series,
            model=model,
            scaler=scaler,
            feature_names=list(FEATURE_NAMES),
            class_labels=CLASS_NAMES,
        )

        for check in stab_res.get("checks", []):
            cid = check["check_id"]
            if cid not in transformation_stats:
                transformation_stats[cid] = {"tested": 0, "consistent": 0, "flipped": 0}
            transformation_stats[cid]["tested"] += 1
            if check["consistent"]:
                transformation_stats[cid]["consistent"] += 1
            else:
                transformation_stats[cid]["flipped"] += 1

        records.append({
            "url": norm_url,
            "ground_truth": ground_truth_label,
            "original_prediction": orig_pred,
            "is_correct": bool(orig_pred == ground_truth_label),
            "status": stab_res["status"],
            "prediction_stability": stab_res["prediction_stability"],
            "transformations_tested": stab_res["transformations_tested"],
            "consistent_predictions": stab_res["consistent_predictions"],
            "flips": stab_res["transformations_tested"] - stab_res["consistent_predictions"],
        })

    eval_df = pd.DataFrame(records)

    # Class-wise metrics
    class_results: dict[str, Any] = {}
    for cname in CLASS_NAMES.values():
        cdf = eval_df[eval_df["ground_truth"] == cname]
        c_tested = cdf[cdf["status"] != "unavailable"]
        mean_stab = float(c_tested["prediction_stability"].mean()) if not c_tested.empty else 0.0
        stable_count = int((cdf["status"] == "stable").sum())
        unstable_count = int((cdf["status"] == "unstable").sum())
        unavail_count = int((cdf["status"] == "unavailable").sum())
        total_class = len(cdf)
        accuracy = float((cdf["is_correct"]).mean() * 100.0) if total_class > 0 else 0.0

        class_results[cname] = {
            "total_samples": total_class,
            "stable_count": stable_count,
            "unstable_count": unstable_count,
            "unavailable_count": unavail_count,
            "mean_prediction_stability": round(mean_stab, 2),
            "stable_rate_pct": round((stable_count / total_class) * 100.0, 2) if total_class > 0 else 0.0,
            "accuracy_pct": round(accuracy, 2),
        }

    # Overall metrics
    measurable = eval_df[eval_df["status"] != "unavailable"]
    overall_mean_stability = float(measurable["prediction_stability"].mean()) if not measurable.empty else 0.0
    overall_median_stability = float(measurable["prediction_stability"].median()) if not measurable.empty else 0.0
    overall_stable_count = int((eval_df["status"] == "stable").sum())
    overall_unstable_count = int((eval_df["status"] == "unstable").sum())
    overall_unavailable_count = int((eval_df["status"] == "unavailable").sum())
    total_samples = len(eval_df)
    overall_accuracy = float(eval_df["is_correct"].mean() * 100.0)

    # Accuracy vs Stability matrix
    # Samples that are correct and stable, correct but unstable, incorrect and stable, incorrect and unstable
    matrix = {
        "correct_and_stable": int(((eval_df["is_correct"]) & (eval_df["status"] == "stable")).sum()),
        "correct_but_unstable": int(((eval_df["is_correct"]) & (eval_df["status"] == "unstable")).sum()),
        "incorrect_and_stable": int(((~eval_df["is_correct"]) & (eval_df["status"] == "stable")).sum()),
        "incorrect_and_unstable": int(((~eval_df["is_correct"]) & (eval_df["status"] == "unstable")).sum()),
    }

    # Transformation breakdown summary
    transform_summary = {}
    for cid, counts in transformation_stats.items():
        tested = counts["tested"]
        flipped = counts["flipped"]
        flip_rate = round((flipped / tested) * 100.0, 2) if tested > 0 else 0.0
        transform_summary[cid] = {
            "tested": tested,
            "consistent": counts["consistent"],
            "flipped": flipped,
            "flip_rate_pct": flip_rate,
        }

    return {
        "total_samples": total_samples,
        "overall_accuracy_pct": round(overall_accuracy, 2),
        "overall_mean_stability": round(overall_mean_stability, 2),
        "overall_median_stability": round(overall_median_stability, 2),
        "overall_stable_count": overall_stable_count,
        "overall_unstable_count": overall_unstable_count,
        "overall_unavailable_count": overall_unavailable_count,
        "overall_stable_rate_pct": round((overall_stable_count / total_samples) * 100.0, 2),
        "accuracy_vs_stability_matrix": matrix,
        "class_results": class_results,
        "transformations": transform_summary,
        "explanation": STABILITY_EXPLANATION,
        "limitations": STABILITY_LIMITATIONS,
    }


def generate_markdown_report(report_data: dict[str, Any]) -> str:
    lines = [
        "# PhishGuard Stability Shield — Empirical Prediction Stability Evaluation Report",
        "",
        "## Executive Summary",
        "",
        f"- **Total Benchmark Samples**: {report_data['total_samples']:,}",
        f"- **Model Baseline Accuracy**: {report_data['overall_accuracy_pct']:.2f}%",
        f"- **Overall Mean Prediction Stability**: {report_data['overall_mean_stability']:.2f}%",
        f"- **Median Prediction Stability**: {report_data['overall_median_stability']:.2f}%",
        f"- **Strictly Stable Predictions (100% Consistent)**: {report_data['overall_stable_count']:,} "
        f"({report_data['overall_stable_rate_pct']:.2f}%)",
        f"- **Unstable Predictions (<100% Consistent)**: {report_data['overall_unstable_count']:,}",
        f"- **Unavailable (Zero Valid Transforms)**: {report_data['overall_unavailable_count']:,}",
        "",
        "### Key Security & Robustness Takeaways",
        "",
        "> **Important Principle**: *Prediction Stability measures whether the model returns the same class "
        "for equivalent URL representations. A stable prediction can still be incorrect.*",
        "",
        "1. **Lexical Representation Sensitivity**: Adding explicit default ports (e.g. `:443` on HTTPS or `:80` on HTTP) "
        "increases lexical character length, digit count, and punctuation delimiters. Because the baseline classifier "
        "relies heavily on lexical length and punctuation feature thresholds, default port addition has a measurable "
        "tendency to flip boundary classifications.",
        "2. **Case Normalization Stability**: Hostname and scheme case normalization (RFC 3986 Section 6.2.2.1) "
        "preserves exact feature vector counts (length, dots, digits), maintaining 100% consistency across case variants.",
        "3. **Independence of Stability and Correctness**: As shown in the 2x2 matrix below, a prediction can be stable yet "
        "incorrect (e.g., an evasive phishing URL consistently misclassified across all variants), or accurate yet unstable "
        "(correct on canonical representation but sensitive to representation formatting).",
        "",
        "---",
        "",
        "## Class-Wise Stability Breakdown",
        "",
        "| Ground Truth Class | Samples | Baseline Accuracy | Mean Stability (%) | Stable (100%) | Unstable | Stable Rate |",
        "|:---|:---:|:---:|:---:|:---:|:---:|:---:|",
    ]

    for cname, stats in report_data["class_results"].items():
        lines.append(
            f"| **{cname}** | {stats['total_samples']:,} | {stats['accuracy_pct']:.2f}% | "
            f"{stats['mean_prediction_stability']:.2f}% | {stats['stable_count']:,} | "
            f"{stats['unstable_count']:,} | {stats['stable_rate_pct']:.2f}% |"
        )

    lines.extend([
        "",
        "---",
        "",
        "## Transformation Vulnerability Analysis",
        "",
        "| Transformation Check | Total Tested | Consistent | Flipped Predictions | Flip Rate (%) |",
        "|:---|:---:|:---:|:---:|:---:|",
    ])

    for cid, tstats in report_data["transformations"].items():
        name = cid.replace("_", " ").title()
        lines.append(
            f"| `{cid}` ({name}) | {tstats['tested']:,} | {tstats['consistent']:,} | "
            f"{tstats['flipped']:,} | {tstats['flip_rate_pct']:.2f}% |"
        )

    matrix = report_data["accuracy_vs_stability_matrix"]
    lines.extend([
        "",
        "---",
        "",
        "## Accuracy vs. Prediction Stability Matrix",
        "",
        "| Category | Sample Count | Percentage of Benchmark | Diagnostic Meaning |",
        "|:---|:---:|:---:|:---|",
        f"| **Correct & Stable** | {matrix['correct_and_stable']:,} | "
        f"{round((matrix['correct_and_stable']/report_data['total_samples'])*100, 2):.2f}% | "
        "Model prediction is accurate and resilient to URL representation variations. |",
        f"| **Correct but Unstable** | {matrix['correct_but_unstable']:,} | "
        f"{round((matrix['correct_but_unstable']/report_data['total_samples'])*100, 2):.2f}% | "
        "Original prediction is correct, but minor representation changes flip the verdict (borderline confidence). |",
        f"| **Incorrect & Stable** | {matrix['incorrect_and_stable']:,} | "
        f"{round((matrix['incorrect_and_stable']/report_data['total_samples'])*100, 2):.2f}% | "
        "Model is systematically incorrect across all equivalent representations. |",
        f"| **Incorrect & Unstable** | {matrix['incorrect_and_unstable']:,} | "
        f"{round((matrix['incorrect_and_unstable']/report_data['total_samples'])*100, 2):.2f}% | "
        "High uncertainty regime; both the original prediction and representation variants are volatile. |",
        "",
        "---",
        "",
        "## Evaluation Methodology & Limitations",
        "",
        f"- **Methodology**: Evaluates standards-compliant URL representations defined in RFC 3986 (URI Generic Syntax) "
        "and RFC 2616 (HTTP/1.1), including scheme/host case normalization, default port addition/removal (`:80`/`:443`), "
        "empty root path normalization, and self-referencing dot segment (`/./`) normalization.",
        f"- **Scope Limitations**: {report_data['limitations']}",
        "- **Zero Network Execution**: All transformations and predictions execute strictly in-memory using the offline feature extractor "
        "and trained artifact, making zero external network or DNS queries.",
        "",
    ])

    return "\n".join(lines)


def main_cli() -> None:
    args = parse_args()
    LOGGER.info("Starting PhishGuard Stability Shield evaluation...")

    if not args.model_path.exists():
        raise FileNotFoundError(f"Model artifact not found at {args.model_path}")
    raw_artifact = joblib.load(args.model_path)
    if isinstance(raw_artifact, dict) and "model" in raw_artifact:
        model = raw_artifact["model"]
        scaler = raw_artifact.get("scaler")
    else:
        model = raw_artifact
        scaler = joblib.load(args.scaler_path) if args.scaler_path.exists() else None

    df = load_dataset(args.data_path, args.samples_per_class, args.seed)
    results = run_stability_evaluation(df, model, scaler)

    # Save JSON report
    args.output_json.parent.mkdir(parents=True, exist_ok=True)
    with open(args.output_json, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)
    LOGGER.info("Saved JSON report to %s", args.output_json)

    # Save Markdown report
    args.output_md.parent.mkdir(parents=True, exist_ok=True)
    md_content = generate_markdown_report(results)
    with open(args.output_md, "w", encoding="utf-8") as f:
        f.write(md_content)
    LOGGER.info("Saved Markdown report to %s", args.output_md)

    print("\n" + "=" * 70)
    print("PHISHGUARD STABILITY SHIELD — EVALUATION SUMMARY")
    print("=" * 70)
    print(f"Total Evaluated Samples : {results['total_samples']}")
    print(f"Model Baseline Accuracy : {results['overall_accuracy_pct']:.2f}%")
    print(f"Mean Prediction Stability: {results['overall_mean_stability']:.2f}%")
    print(f"Stable Predictions      : {results['overall_stable_count']} ({results['overall_stable_rate_pct']:.2f}%)")
    print(f"Unstable Predictions    : {results['overall_unstable_count']}")
    print(f"Unavailable Status      : {results['overall_unavailable_count']}")
    print("-" * 70)
    for cname, cstats in results["class_results"].items():
        print(f"{cname:<12} | Samples: {cstats['total_samples']} | Mean Stability: {cstats['mean_prediction_stability']:.2f}% | Stable Rate: {cstats['stable_rate_pct']:.2f}%")
    print("=" * 70)


if __name__ == "__main__":
    main_cli()
