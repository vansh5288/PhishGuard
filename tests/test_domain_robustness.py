"""Tests for offline domain-generalization evaluation helpers."""

from __future__ import annotations

import numpy as np

from ml.evaluation.domain_robustness import (
    _canonical_destination,
    _classification_metrics,
    _group_disjoint_split,
    _representation_variants,
)


def test_hostname_disjoint_split_has_no_overlap():
    hostnames = np.array(
        [f"{label}-{group}.example" for label in range(4) for group in range(5) for _ in range(2)]
    )
    labels = np.repeat(np.arange(4), 10)
    train, test, metadata = _group_disjoint_split(labels, hostnames)

    assert len(train) + len(test) == len(labels)
    assert not set(hostnames[train]) & set(hostnames[test])
    assert metadata["hostname_overlap_count"] == 0


def test_representation_variants_preserve_canonical_destination():
    url = "https://phishguard.example/login"
    variants = _representation_variants(url)

    assert variants
    assert all(_canonical_destination(url) == _canonical_destination(value) for value in variants.values())
    assert "scheme_case" in variants
    assert "hostname_case" in variants
    assert "explicit_default_port" in variants


def test_metrics_include_phishing_and_full_confusion_matrix():
    metrics = _classification_metrics(
        np.array([0, 1, 2, 3]),
        np.array([0, 1, 1, 3]),
    )

    assert metrics["accuracy"] == 0.75
    assert "phishing_precision" in metrics
    assert "phishing_recall" in metrics
    assert len(metrics["confusion_matrix"]) == 4
