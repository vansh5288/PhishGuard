"""Focused unit tests for the uncertainty-aware prediction review utility.

Pure offline tests: no network, no DNS, no changes to the trained ML model.
"""

from __future__ import annotations

import math

import numpy as np
import pytest

from backend.models.uncertainty import (
    OUTCOME_HIGHER_CONFIDENCE,
    OUTCOME_NEEDS_REVIEW,
    UNCERTAINTY_CONFIDENCE_THRESHOLD,
    UNCERTAINTY_MARGIN_THRESHOLD,
    compute_uncertainty,
)

CLASS_LABELS = {0: "LEGITIMATE", 1: "PHISHING", 2: "DEFACEMENT", 3: "MALWARE"}


def _make_probs(values: list[float]) -> np.ndarray:
    arr = np.array(values, dtype=float)
    return arr / arr.sum()


def test_low_confidence_triggers_needs_review():
    probs = _make_probs([0.30, 0.25, 0.25, 0.20])
    result = compute_uncertainty(probs, class_labels=CLASS_LABELS)
    assert result["confidence"] == pytest.approx(0.30)
    assert result["review_outcome"] == OUTCOME_NEEDS_REVIEW
    assert result["needs_review"] is True
    assert any("confidence" in r.lower() for r in result["reasons"])


def test_confidence_equals_max_class_probability():
    probs = _make_probs([0.70, 0.10, 0.10, 0.10])
    result = compute_uncertainty(probs, class_labels=CLASS_LABELS)
    assert result["confidence"] == pytest.approx(0.70)


def test_close_margin_triggers_needs_review():
    probs = _make_probs([0.40, 0.38, 0.11, 0.11])
    result = compute_uncertainty(probs, class_labels=CLASS_LABELS)
    assert result["confidence_margin"] == pytest.approx(0.02)
    assert result["review_outcome"] == OUTCOME_NEEDS_REVIEW
    assert result["needs_review"] is True
    assert any("margin" in r.lower() for r in result["reasons"])


def test_confident_prediction_is_higher_confidence():
    probs = _make_probs([0.85, 0.05, 0.05, 0.05])
    result = compute_uncertainty(probs, class_labels=CLASS_LABELS)
    assert result["review_outcome"] == OUTCOME_HIGHER_CONFIDENCE
    assert result["needs_review"] is False
    assert any("higher confidence" in r.lower() for r in result["reasons"])


def test_higher_confidence_does_not_imply_certainty():
    reasons = compute_uncertainty(
        _make_probs([0.90, 0.03, 0.03, 0.04]), class_labels=CLASS_LABELS
    )["reasons"]
    assert not any("certainty" in r.lower() for r in reasons)


def test_all_classes_can_be_top():
    for class_id in range(4):
        probs = _make_probs([0.70, 0.10, 0.10, 0.10])
        # Move the dominant probability to each class position.
        probs = np.roll(probs, -class_id)
        result = compute_uncertainty(probs, class_labels=CLASS_LABELS)
        top_label = CLASS_LABELS[int(np.argmax(probs))]
        assert result["confidence"] == pytest.approx(0.70)
        assert any(top_label in r for r in result["reasons"])


def test_uncertainty_is_one_minus_confidence():
    probs = _make_probs([0.60, 0.20, 0.10, 0.10])
    result = compute_uncertainty(probs, class_labels=CLASS_LABELS)
    assert result["uncertainty"] == pytest.approx(1.0 - 0.60)


def test_confidence_margin_is_top1_minus_top2():
    probs = _make_probs([0.55, 0.30, 0.10, 0.05])
    result = compute_uncertainty(probs, class_labels=CLASS_LABELS)
    assert result["confidence_margin"] == pytest.approx(0.25)


def test_entropy_is_non_negative_and_bounded():
    probs = _make_probs([0.25, 0.25, 0.25, 0.25])
    result = compute_uncertainty(probs, class_labels=CLASS_LABELS)
    assert result["entropy"] >= 0.0
    assert result["entropy"] <= math.log(4) + 1e-9


def test_thresholds_are_positive_and_sane():
    assert 0.0 < UNCERTAINTY_CONFIDENCE_THRESHOLD < 1.0
    assert 0.0 < UNCERTAINTY_MARGIN_THRESHOLD < 1.0


def test_none_probabilities_raise():
    with pytest.raises(ValueError):
        compute_uncertainty(None)


def test_empty_probabilities_raise():
    with pytest.raises(ValueError):
        compute_uncertainty([])


def test_wrong_length_probabilities_raise():
    with pytest.raises(ValueError):
        compute_uncertainty([0.5, 0.5])


def test_non_finite_probabilities_raise():
    with pytest.raises(ValueError):
        compute_uncertainty([0.5, 0.5, 0.0, float("nan")])


def test_out_of_range_probabilities_raise():
    with pytest.raises(ValueError):
        compute_uncertainty([1.5, -0.5, 0.0, 0.0])


def test_probabilities_not_summing_to_one_raise():
    with pytest.raises(ValueError):
        compute_uncertainty([0.5, 0.5, 0.5, 0.5])


def test_custom_confidence_threshold():
    probs = _make_probs([0.50, 0.20, 0.20, 0.10])
    assert compute_uncertainty(probs, class_labels=CLASS_LABELS)["needs_review"] is True
    assert (
        compute_uncertainty(
            probs, class_labels=CLASS_LABELS, confidence_threshold=0.40
        )["needs_review"]
        is False
    )


def test_custom_margin_threshold():
    # Confidence 0.40 (< 0.60 default) but margin 0.01 (thin).
    probs = _make_probs([0.40, 0.39, 0.11, 0.10])
    # Default: confidence below 0.60 -> needs review regardless of margin.
    assert compute_uncertainty(probs, class_labels=CLASS_LABELS)["needs_review"] is True
    # With confidence_threshold=0.0, only margin matters: margin 0.01 < 0.15 -> review.
    assert (
        compute_uncertainty(
            probs,
            class_labels=CLASS_LABELS,
            confidence_threshold=0.0,
            margin_threshold=0.15,
        )["needs_review"]
        is True
    )
    # With a tiny margin threshold, 0.01 clears it -> higher confidence.
    assert (
        compute_uncertainty(
            probs,
            class_labels=CLASS_LABELS,
            confidence_threshold=0.0,
            margin_threshold=0.001,
        )["needs_review"]
        is False
    )


def test_does_not_claim_calibrated_probabilities():
    probs = _make_probs([0.80, 0.10, 0.05, 0.05])
    result = compute_uncertainty(probs, class_labels=CLASS_LABELS)
    text = " ".join(result["reasons"]).lower()
    assert "calibrated" not in text


def test_returns_separate_uncertainty_object():
    probs = _make_probs([0.80, 0.10, 0.05, 0.05])
    result = compute_uncertainty(probs, class_labels=CLASS_LABELS)
    assert set(result) == {
        "confidence",
        "confidence_margin",
        "entropy",
        "uncertainty",
        "review_outcome",
        "needs_review",
        "reasons",
    }
    assert isinstance(result["reasons"], list)
    assert result["review_outcome"] in {
        OUTCOME_NEEDS_REVIEW,
        OUTCOME_HIGHER_CONFIDENCE,
    }
