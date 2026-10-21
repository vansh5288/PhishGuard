from fastapi.testclient import TestClient

from backend import main


def test_api_contract(monkeypatch, tmp_path):
    monkeypatch.setattr(main, "DATABASE_PATH", tmp_path / "phishguard.db")
    monkeypatch.setattr(
        main,
        "_is_valid_url",
        lambda url: url.endswith("example.com"),
    )
    with TestClient(main.app) as client:
        root_response = client.get("/")
        assert root_response.status_code == 200
        assert root_response.json() == {"message": "PhishGuard API is running"}
        cors_response = client.get(
            "/api/stats",
            headers={"Origin": "http://127.0.0.1:3000"},
        )
        assert cors_response.headers["access-control-allow-origin"] == "http://127.0.0.1:3000"

        analyze_response = client.post("/api/analyze", json={"url": "https://example.com"})
        assert analyze_response.status_code == 200
        payload = analyze_response.json()
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
        assert payload["prediction"] in {"LEGITIMATE", "PHISHING", "DEFACEMENT", "MALWARE"}
        assert 0.0 <= payload["probability"] <= 1.0
        assert 0.0 <= payload["malicious_probability"] <= 1.0
        assert abs(sum(payload["probabilities"].values()) - 1.0) < 1e-6
        assert payload["risk_score"] == payload["malicious_probability"]
        assert len(payload["features"]) == len(main.FEATURE_NAMES) == 10
        assert payload["risk"] in {"SAFE", "SUSPICIOUS", "PHISHING"}
        assert set(payload["uncertainty"]) == {
            "review_required",
            "predicted_class",
            "max_class_probability",
            "top_two_probability_margin",
            "reasons",
        }
        assert payload["uncertainty"]["predicted_class"] == payload["prediction"]
        assert isinstance(payload["uncertainty"]["review_required"], bool)
        assert isinstance(payload["uncertainty"]["reasons"], list)
        assert isinstance(payload["explanation"], list)
        assert payload["explanation"]
        assert all(set(item) == {"feature", "value", "shap_value", "impact"} for item in payload["explanation"])

        history_response = client.get("/api/history")
        assert history_response.status_code == 200
        history_payload = history_response.json()
        assert set(history_payload) == {"scans", "total"}
        assert history_payload["total"] == 1
        assert history_payload["scans"][0]["features"] == payload["features"]
        assert history_payload["scans"][0]["probabilities"] == payload["probabilities"]
        assert history_payload["scans"][0]["malicious_probability"] == payload["malicious_probability"]
        assert history_payload["scans"][0]["uncertainty"] == payload["uncertainty"]
        filtered_history = client.get(
            f"/api/history?prediction={payload['prediction']}&search=example.com&limit=1"
        )
        assert filtered_history.status_code == 200
        assert filtered_history.json()["total"] == 1
        assert len(filtered_history.json()["scans"]) == 1
        invalid_filter = client.get("/api/history?prediction=UNKNOWN")
        assert invalid_filter.status_code == 400

        single_response = client.get(f"/api/history/{payload['scan_id']}")
        assert single_response.status_code == 200
        assert single_response.json()["url"] == "https://example.com"
        assert single_response.json()["features"] == payload["features"]

        stats_response = client.get("/api/stats")
        assert stats_response.status_code == 200
        stats_payload = stats_response.json()
        assert stats_payload["total_scans"] == 1
        assert sum(
            stats_payload[name]
            for name in (
                "legitimate_scans",
                "phishing_scans",
                "defacement_scans",
                "malware_scans",
            )
        ) == 1
        assert stats_payload["model_info"]["feature_count"] == 10
        assert stats_payload["recent_trend"]

        config_response = client.get("/api/config")
        assert config_response.status_code == 200
        assert config_response.json()["url_fetching_enabled"] is False
        assert len(config_response.json()["feature_names"]) == 10
        assert len(client.get("/api/brands").json()["brands"]) > 0
        assert client.get("/api/evaluation").json()["evaluation_type"] == "offline_robustness"
        assert client.get("/api/robustness").json()["evaluation_type"] == "experimental_offline_domain_generalization"

        delete_response = client.delete(f"/api/history/{payload['scan_id']}")
        assert delete_response.status_code == 200
        assert delete_response.json() == {"message": "Scan deleted successfully", "scan_id": payload["scan_id"]}

        missing_response = client.get("/api/history/999999")
        assert missing_response.status_code == 404
        assert missing_response.json() == {"detail": "Scan not found"}

        invalid_response = client.post("/api/analyze", json={"url": "abc"})
        assert invalid_response.status_code == 400
        assert invalid_response.json() == {"detail": "Invalid URL"}

        empty_response = client.post("/api/analyze", json={"url": ""})
        assert empty_response.status_code in {400, 422}


def test_api_security_and_live_persistence(tmp_path, monkeypatch):
    db_file = tmp_path / "persistence_test.db"
    monkeypatch.setattr(main, "DATABASE_PATH", db_file)

    with TestClient(main.app) as client:
        # 1. SSRF and private IP rejection (without monkeypatching _is_valid_url)
        for unsafe_url in [
            "http://127.0.0.1",
            "http://localhost",
            "http://192.168.1.1/admin",
            "http://10.0.0.1/dashboard",
            "http://169.254.169.254/latest/meta-data",
            "http://metadata.google.internal",
            "http://intranet",
            "ftp://example.com",
            "javascript:alert(1)",
        ]:
            resp = client.post("/api/analyze", json={"url": unsafe_url})
            assert resp.status_code == 400, f"Expected 400 for unsafe URL: {unsafe_url}"
            assert resp.json()["detail"] == "Invalid URL"

        # 2. Real URL analysis
        safe_url = "https://example.com/login"
        resp = client.post("/api/analyze", json={"url": safe_url})
        assert resp.status_code == 200
        scan_data = resp.json()
        scan_id = scan_data["scan_id"]
        assert scan_data["prediction"] in {"LEGITIMATE", "PHISHING", "DEFACEMENT", "MALWARE"}
        assert len(scan_data["explanation"]) > 0

        # 3. Retrieve history and verify explanation persistence
        hist_resp = client.get("/api/history")
        assert hist_resp.status_code == 200
        items = hist_resp.json()["scans"]
        assert len(items) == 1
        assert items[0]["id"] == scan_id
        assert items[0]["explanation"] == scan_data["explanation"]

        # 4. Retrieve single scan detail
        detail_resp = client.get(f"/api/history/{scan_id}")
        assert detail_resp.status_code == 200
        assert detail_resp.json()["id"] == scan_id
        assert detail_resp.json()["explanation"] == scan_data["explanation"]

        # 5. Check stats
        stats_resp = client.get("/api/stats")
        assert stats_resp.status_code == 200
        assert stats_resp.json()["total_scans"] == 1

        # 6. Delete scan
        del_resp = client.delete(f"/api/history/{scan_id}")
        assert del_resp.status_code == 200

        # 7. Verify deletion
        assert client.get(f"/api/history/{scan_id}").status_code == 404
        stats_resp2 = client.get("/api/stats")
        assert stats_resp2.json()["total_scans"] == 0
