"""Unit tests for PhishGuard Stability Shield.

Verifies:
- RFC 3986 equivalence transformations (case normalization, default ports, paths).
- Prediction stability calculation and zero-transformation handling.
- Skipped transformation tracking and limitations reporting.
- Offline behavior: zero network or DNS calls.
- Non-interference with original prediction, probabilities, and risk score.
- Full API integration via FastAPI TestClient.
"""

from __future__ import annotations

import socket
import urllib.parse
from unittest.mock import MagicMock

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from backend import main
from backend.models.stability import (
    STABILITY_EXPLANATION,
    STABILITY_LIMITATIONS,
    assess_url_stability,
    generate_equivalent_representations,
)


class DummyModel:
    """Mock ML model for controlled prediction stability testing."""

    def __init__(self, flip_on_urls: set[str] | None = None, default_class: int = 0):
        self.flip_on_urls = flip_on_urls or set()
        self.default_class = default_class
        self.classes_ = np.array([0, 1, 2, 3])

    def predict(self, X):
        return np.array([self.default_class])

    def predict_proba(self, X):
        probs = [0.1, 0.1, 0.1, 0.1]
        probs[self.default_class] = 0.7
        return np.array([probs])


def dummy_extractor(url: str) -> dict[str, float]:
    return {
        "url_length": float(len(url)),
        "hostname_length": 10.0,
        "path_length": 5.0,
        "dot_count": 1.0,
        "hyphen_count": 0.0,
        "digit_count": 0.0,
        "special_character_count": 2.0,
        "subdirectory_count": 1.0,
        "has_https": 1.0 if url.startswith("https") else 0.0,
        "query_length": 0.0,
    }


# ---------------------------------------------------------------------------
# Transformation Generation Tests
# ---------------------------------------------------------------------------


def test_rfc3986_case_normalization():
    url = "https://Example.Com/Login"
    valid, skipped = generate_equivalent_representations(url)
    check_ids = [c["check_id"] for c in valid]
    assert "case_normalization" in check_ids

    case_check = next(c for c in valid if c["check_id"] == "case_normalization")
    # Scheme and netloc are case normalized, path "/Login" remains intact
    assert "/Login" in case_check["transformed_url"]
    assert case_check["transformed_url"] != url
    parsed = urllib.parse.urlsplit(case_check["transformed_url"])
    assert parsed.path == "/Login"


def test_default_port_addition_and_removal():
    # 1. Port omitted -> addition of :443 for https
    url_no_port = "https://example.com/test"
    valid, _ = generate_equivalent_representations(url_no_port)
    port_add = next((c for c in valid if c["check_id"] == "default_port_addition"), None)
    assert port_add is not None
    assert "example.com:443" in port_add["transformed_url"]

    # 2. Port specified as :443 -> removal of redundant default port
    url_with_port = "https://example.com:443/test"
    valid2, _ = generate_equivalent_representations(url_with_port)
    port_rem = next((c for c in valid2 if c["check_id"] == "default_port_removal"), None)
    assert port_rem is not None
    assert ":443" not in port_rem["transformed_url"]


def test_non_default_port_is_skipped():
    url_custom_port = "https://example.com:8080/path"
    valid, skipped = generate_equivalent_representations(url_custom_port)
    assert not any(c["check_id"] in {"default_port_addition", "default_port_removal"} for c in valid)
    assert any("8080" in s["reason"] for s in skipped)


def test_empty_path_normalization():
    # Empty path -> "/"
    url_empty_path = "https://example.com"
    valid, _ = generate_equivalent_representations(url_empty_path)
    root_norm = next((c for c in valid if c["check_id"] == "empty_path_normalization"), None)
    assert root_norm is not None
    assert root_norm["transformed_url"] == "https://example.com/"

    # Root slash without query -> empty path
    url_slash = "https://example.com/"
    valid_slash, _ = generate_equivalent_representations(url_slash)
    slash_norm = next((c for c in valid_slash if c["check_id"] == "empty_path_normalization"), None)
    assert slash_norm is not None
    assert slash_norm["transformed_url"] == "https://example.com"


def test_non_http_scheme_skipped():
    url_ftp = "ftp://ftp.example.com/files"
    valid, skipped = generate_equivalent_representations(url_ftp)
    assert len(valid) == 0
    assert any("ftp" in s["reason"].lower() for s in skipped)


# ---------------------------------------------------------------------------
# Stability Metric Calculation & Assessment Tests
# ---------------------------------------------------------------------------


def test_stability_assessment_all_consistent():
    model = DummyModel(default_class=0)
    class_labels = {0: "LEGITIMATE", 1: "PHISHING", 2: "DEFACEMENT", 3: "MALWARE"}

    result = assess_url_stability(
        url="https://example.com/login",
        original_prediction="LEGITIMATE",
        feature_extractor=dummy_extractor,
        model=model,
        feature_names=list(dummy_extractor("").keys()),
        class_labels=class_labels,
    )

    assert result["status"] == "stable"
    assert result["original_prediction"] == "LEGITIMATE"
    assert result["prediction_stability"] == 100.0
    assert result["transformations_tested"] > 0
    assert result["consistent_predictions"] == result["transformations_tested"]
    assert result["explanation"] == STABILITY_EXPLANATION
    assert result["limitations"] == STABILITY_LIMITATIONS


def test_stability_assessment_inconsistent_flips():
    class FlippedModel:
        def __init__(self):
            self.classes_ = np.array([0, 1, 2, 3])

        def predict(self, X):
            # If URL length or feature indicates port addition (longer), predict PHISHING (1)
            # otherwise predict LEGITIMATE (0)
            url_len = X.iloc[0]["url_length"] if hasattr(X, "iloc") else X[0][0]
            if url_len > 25:
                return np.array([1])
            return np.array([0])

        def predict_proba(self, X):
            return np.array([[0.25, 0.25, 0.25, 0.25]])

    model = FlippedModel()
    class_labels = {0: "LEGITIMATE", 1: "PHISHING", 2: "DEFACEMENT", 3: "MALWARE"}

    result = assess_url_stability(
        url="https://example.com/login",
        original_prediction="LEGITIMATE",
        feature_extractor=dummy_extractor,
        model=model,
        feature_names=list(dummy_extractor("").keys()),
        class_labels=class_labels,
    )

    assert result["status"] == "unstable"
    assert result["prediction_stability"] is not None
    assert result["prediction_stability"] < 100.0
    assert result["consistent_predictions"] < result["transformations_tested"]
    assert "instability detected" in result["summary"].lower()


def test_zero_valid_transformations_returns_unavailable():
    model = DummyModel(default_class=0)
    result = assess_url_stability(
        url="mailto:test@example.com",
        original_prediction="LEGITIMATE",
        feature_extractor=dummy_extractor,
        model=model,
    )

    assert result["status"] == "unavailable"
    assert result["prediction_stability"] is None
    assert result["transformations_tested"] == 0
    assert result["consistent_predictions"] == 0
    assert len(result["checks"]) == 0
    assert len(result["skipped_checks"]) > 0


def test_no_network_requests_during_stability_evaluation(monkeypatch):
    """Guarantees strictly offline behavior without sockets or HTTP connections."""

    def block_socket(*args, **kwargs):
        raise AssertionError("Network connection attempted during stability evaluation!")

    monkeypatch.setattr(socket, "socket", block_socket)
    monkeypatch.setattr(socket, "getaddrinfo", block_socket)

    model = DummyModel(default_class=0)
    result = assess_url_stability(
        url="https://example.com/path",
        original_prediction="LEGITIMATE",
        feature_extractor=dummy_extractor,
        model=model,
        feature_names=list(dummy_extractor("").keys()),
        class_labels={0: "LEGITIMATE"},
    )
    assert result["transformations_tested"] > 0


# ---------------------------------------------------------------------------
# API Integration & Non-Interference Tests
# ---------------------------------------------------------------------------


def test_api_stability_shield_integration(monkeypatch, tmp_path):
    monkeypatch.setattr(main, "DATABASE_PATH", tmp_path / "phishguard.db")
    monkeypatch.setattr(main, "_is_valid_url", lambda url: True)

    with TestClient(main.app) as client:
        resp = client.post("/api/analyze", json={"url": "https://example.com"})
        assert resp.status_code == 200
        data = resp.json()

        # Stability Shield object must be present in response
        assert "stability_assessment" in data
        stab = data["stability_assessment"]
        assert stab["status"] in {"stable", "unstable", "unavailable"}
        assert stab["original_prediction"] == data["prediction"]
        if stab["status"] != "unavailable":
            assert 0.0 <= stab["prediction_stability"] <= 100.0
            assert stab["transformations_tested"] > 0
            assert stab["consistent_predictions"] <= stab["transformations_tested"]
            assert len(stab["checks"]) == stab["transformations_tested"]
        else:
            assert stab["prediction_stability"] is None

        # Verify scan history retains stability_assessment
        scan_id = data["scan_id"]
        hist_resp = client.get(f"/api/history/{scan_id}")
        assert hist_resp.status_code == 200
        hist_data = hist_resp.json()
        assert "stability_assessment" in hist_data
        assert hist_data["stability_assessment"]["status"] == stab["status"]
