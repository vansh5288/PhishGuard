"""Integration tests for brand identity detection in the /api/analyze pipeline."""

from __future__ import annotations

import sqlite3
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from backend import main

def _monkeypatch_db(monkeypatch, tmp_path):
    db_path = tmp_path / "brand_integration.db"
    monkeypatch.setattr(main, "DATABASE_PATH", db_path)
    return db_path


def _allow_all(monkeypatch):
    monkeypatch.setattr(main, "_is_valid_url", lambda url: True)


def test_analyze_response_includes_brand_assessment(monkeypatch, tmp_path):
    _monkeypatch_db(monkeypatch, tmp_path)
    _allow_all(monkeypatch)
    with TestClient(main.app) as client:
        resp = client.post("/api/analyze", json={"url": "https://google.com"})
        assert resp.status_code == 200, resp.text
        payload = resp.json()
        assert "brand_assessment" in payload
        ba = payload["brand_assessment"]
        assert set(ba) == {"status", "hostname", "matched_brand", "matched_domain", "reasons"}
        assert ba["status"] == "domain_match"
        assert ba["matched_brand"] == "Google"
        assert ba["matched_domain"] == "google.com"
        assert isinstance(ba["reasons"], list)
        assert ba["reasons"]


def test_analyze_possible_impersonation(monkeypatch, tmp_path):
    _monkeypatch_db(monkeypatch, tmp_path)
    _allow_all(monkeypatch)
    with TestClient(main.app) as client:
        resp = client.post(
            "/api/analyze", json={"url": "https://paypa1-example.example.com"}
        )
        assert resp.status_code == 200, resp.text
        payload = resp.json()
        ba = payload["brand_assessment"]
        assert ba["status"] == "possible_impersonation"
        assert ba["matched_brand"] == "PayPal"


def test_brand_assessment_persisted_in_history(monkeypatch, tmp_path):
    _monkeypatch_db(monkeypatch, tmp_path)
    _allow_all(monkeypatch)
    with TestClient(main.app) as client:
        resp = client.post("/api/analyze", json={"url": "https://github.com"})
        assert resp.status_code == 200
        scan_id = resp.json()["scan_id"]

        hist = client.get("/api/history")
        assert hist.status_code == 200
        scans = hist.json()["scans"]
        assert len(scans) == 1
        ba = scans[0]["brand_assessment"]
        assert ba["status"] == "domain_match"
        assert ba["matched_brand"] == "GitHub"
        assert ba["matched_domain"] == "github.com"

        detail = client.get(f"/api/history/{scan_id}")
        assert detail.status_code == 200
        assert detail.json()["brand_assessment"]["status"] == "domain_match"


def test_brand_assessment_roundtrips_via_history(monkeypatch, tmp_path):
    _monkeypatch_db(monkeypatch, tmp_path)
    _allow_all(monkeypatch)
    with TestClient(main.app) as client:
        client.post("/api/analyze", json={"url": "https://microsoft.com"})
        hist = client.get("/api/history")
        stored = hist.json()["scans"][0]["brand_assessment"]
        detail = client.get(f"/api/history/{hist.json()['scans'][0]['id']}")
        assert detail.json()["brand_assessment"] == stored


def test_migration_from_pre_brand_schema(monkeypatch, tmp_path):
    db_path = tmp_path / "legacy.db"
    with sqlite3.connect(db_path) as connection:
        connection.execute(
            """
            CREATE TABLE scans (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                url TEXT NOT NULL,
                prediction TEXT NOT NULL,
                probability REAL NOT NULL,
                risk TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            "INSERT INTO scans (url, prediction, probability, risk, created_at) "
            "VALUES (?, ?, ?, ?, ?)",
            ("https://example.com", "LEGITIMATE", 0.9, "SAFE", "2025-01-01T00:00:00"),
        )

    monkeypatch.setattr(main, "DATABASE_PATH", db_path)
    main.database_module.initialize_database()

    with main.database_module.get_connection() as connection:
        cols = {
            row["name"]
            for row in connection.execute("PRAGMA table_info(scans)").fetchall()
        }
        for col in (
            "brand_match_status",
            "matched_brand",
            "matched_domain",
            "brand_reasons_json",
        ):
            assert col in cols, f"missing migrated column: {col}"

    with TestClient(main.app) as client:
        resp = client.get("/api/history")
        assert resp.status_code == 200
        scans = resp.json()["scans"]
        assert len(scans) == 1
        assert scans[0]["brand_assessment"]["status"] is None
        assert scans[0]["brand_assessment"]["reasons"] == []
        assert scans[0]["prediction"] == "LEGITIMATE"
        assert scans[0]["risk"] == "SAFE"
        assert scans[0]["uncertainty"] is None


def test_existing_analysis_fields_preserved(monkeypatch, tmp_path):
    _monkeypatch_db(monkeypatch, tmp_path)
    _allow_all(monkeypatch)
    with TestClient(main.app) as client:
        resp = client.post("/api/analyze", json={"url": "https://google.com"})
        assert resp.status_code == 200
        payload = resp.json()
        assert set(payload) == {
            "scan_id",
            "url",
            "prediction",
            "probability",
            "probabilities",
            "malicious_probability",
            "risk_score",
            "confidence",
            "confidence_margin",
            "entropy",
            "uncertainty_score",
            "uncertainty",
            "needs_review",
            "review_outcome",
            "uncertainty_reasons",
            "brand_assessment",
            "features",
            "risk",
            "explanation",
            "stability_assessment",
            "created_at",
        }
        assert payload["prediction"] in {
            "LEGITIMATE",
            "PHISHING",
            "DEFACEMENT",
            "MALWARE",
        }
        assert 0.0 <= payload["probability"] <= 1.0
        assert 0.0 <= payload["malicious_probability"] <= 1.0
        assert abs(sum(payload["probabilities"].values()) - 1.0) < 1e-6
        assert payload["risk_score"] == payload["malicious_probability"]
        assert len(payload["features"]) == len(main.FEATURE_NAMES) == 10
        assert payload["risk"] in {"SAFE", "SUSPICIOUS", "PHISHING"}
        assert isinstance(payload["explanation"], list)
        assert payload["explanation"]
        assert all(
            set(item) == {"feature", "value", "shap_value", "impact"}
            for item in payload["explanation"]
        )
        assert set(payload["brand_assessment"]) == {
            "status",
            "hostname",
            "matched_brand",
            "matched_domain",
            "reasons",
        }


def test_registry_failure_surfaces_assessment_error(monkeypatch, tmp_path):
    _monkeypatch_db(monkeypatch, tmp_path)
    _allow_all(monkeypatch)

    with patch(
        "backend.security.brand_identity._load_registry",
        side_effect=RuntimeError("registry unreadable"),
    ):
        with TestClient(main.app) as client:
            resp = client.post("/api/analyze", json={"url": "https://google.com"})
            assert resp.status_code == 200
            payload = resp.json()
            ba = payload["brand_assessment"]
            assert ba["status"] == "assessment_error"
            assert "unverified" in " ".join(ba["reasons"]).lower()
            assert ba["matched_brand"] is None
            assert ba["matched_domain"] is None
