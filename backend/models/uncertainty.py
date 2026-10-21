"""Uncertainty-aware prediction review utilities for PhishGuard.

This module is a small, testable utility that receives the raw probability
vector produced by the existing four-class Logistic Regression model and
computes uncertainty metrics. It does NOT retrain the model, does NOT alter
class predictions, does NOT reorder features, and does NOT claim that raw
model probabilities are calibrated probabilities.

Design principles:
  * Configurable thresholds with documented provisional defaults.
  * ``NEEDS_REVIEW`` when confidence is low or the top-two margin is thin;
    otherwise ``HIGHER_CONFIDENCE`` (which does NOT imply certainty).
  * Never auto-classifies an uncertain URL as legitimate.
  * Returns uncertainty information as a separate, additive object.
"""

from __future__ import annotations

from typing import Any

import numpy as np

# Provisional defaults. These are starting points and should be tuned using
# a held-out validation dataset before production deployment.
UNCERTAINTY_CONFIDENCE_THRESHOLD = 0.60
UNCERTAINTY_MARGIN_THRESHOLD = 0.15

# Review outcome labels. ``HIGHER_CONFIDENCE`` means the prediction cleared
# both thresholds; it does NOT mean the prediction is certain.
OUTCOME_NEEDS_REVIEW = "NEEDS_REVIEW"
OUTCOME_HIGHER_CONFIDENCE = "HIGHER_CONFIDENCE"

# Expected number of classes for the active PhishGuard model.
EXPECTED_NUM_CLASSES = 4


def _validate_probabilities(probabilities: Any) -> np.ndarray:
    """Validate and normalize a probability vector.

    Raises ``ValueError`` for malformed input. Does NOT alter the values
    beyond converting to a float NumPy array.
    """
    if probabilities is None:
        raise ValueError("Probability vector must not be None.")
    arr = np.asarray(probabilities, dtype=float).ravel()
    if arr.size == 0:
        raise ValueError("Probability vector must not be empty.")
    if arr.size != EXPECTED_NUM_CLASSES:
        raise ValueError(
            f"Expected {EXPECTED_NUM_CLASSES} class probabilities, "
            f"got {arr.size}."
        )
    if not np.all(np.isfinite(arr)):
        raise ValueError("Probability vector contains non-finite values.")
    if np.any(arr < 0.0) or np.any(arr > 1.0):
        raise ValueError("Probability values must be in the range [0, 1].")
    # Accept vectors that sum approximately to 1 (raw model output may have
    # tiny floating-point deviations). Do NOT rescale or claim calibration.
    if not np.isclose(arr.sum(), 1.0, rtol=1e-6, atol=1e-8):
        raise ValueError(
            f"Probability vector must sum to 1 (got {arr.sum():.6f}). "
            "Raw model outputs are not recalibrated."
        )
    return arr


def compute_uncertainty(
    probabilities: Any,
    class_labels: dict[int, str] | None = None,
    confidence_threshold: float = UNCERTAINTY_CONFIDENCE_THRESHOLD,
    margin_threshold: float = UNCERTAINTY_MARGIN_THRESHOLD,
) -> dict[str, Any]:
    """Compute uncertainty-aware review metrics for a probability vector.

    Parameters:
        probabilities: Raw class probabilities from the model's
            ``predict_proba`` output (length 4, sum ~ 1).
        class_labels: Optional mapping from class id to display label. Used
            only for human-readable reasons; does NOT alter predictions.
        confidence_threshold: If max probability is below this, flag review.
        margin_threshold: If top1 - top2 is below this, flag review.

    Returns a dict with:
        confidence: maximum class probability (raw, NOT calibrated).
        confidence_margin: difference between top two probabilities.
        entropy: Shannon entropy of the distribution (nats).
        uncertainty: 1 - confidence.
        review_outcome: ``NEEDS_REVIEW`` or ``HIGHER_CONFIDENCE``.
        needs_review: boolean review flag.
        reasons: human-readable explanation strings.

    The underlying class prediction is NOT modified by this function.
    """
    probs = _validate_probabilities(probabilities)

    sorted_probs = np.sort(probs)[::-1]
    confidence = float(sorted_probs[0])
    confidence_margin = (
        float(sorted_probs[0] - sorted_probs[1])
        if sorted_probs.size > 1
        else 0.0
    )
    entropy = float(-np.sum(probs * np.log(probs + 1e-12)))
    uncertainty = 1.0 - confidence

    needs_review = bool(
        confidence < confidence_threshold
        or confidence_margin < margin_threshold
    )
    review_outcome = (
        OUTCOME_NEEDS_REVIEW if needs_review else OUTCOME_HIGHER_CONFIDENCE
    )

    reasons: list[str] = []
    if confidence < confidence_threshold:
        reasons.append(
            f"Confidence {confidence:.3f} is below the review threshold "
            f"{confidence_threshold:.2f}."
        )
    if confidence_margin < margin_threshold:
        reasons.append(
            f"Top-two margin {confidence_margin:.3f} is below the review "
            f"threshold {margin_threshold:.2f}; classes are close."
        )
    if not needs_review:
        reasons.append(
            "Confidence and top-two margin clear review thresholds; "
            "prediction is higher confidence (not certain)."
        )
    if class_labels:
        top_class_id = int(np.argmax(probs))
        top_label = class_labels.get(top_class_id, str(top_class_id))
        reasons.append(
            f"Highest-probability class: {top_label} ({confidence:.3f})."
        )

    return {
        "confidence": confidence,
        "confidence_margin": confidence_margin,
        "entropy": entropy,
        "uncertainty": uncertainty,
        "review_outcome": review_outcome,
        "needs_review": needs_review,
        "reasons": reasons,
    }
