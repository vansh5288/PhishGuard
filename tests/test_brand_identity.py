"""Focused unit tests for the PhishGuard brand identity mismatch detector.

Pure offline tests: no network, no DNS, no changes to the validator or model.
"""

from __future__ import annotations

import json

import pytest

from backend.security import brand_identity
from backend.security.brand_identity import assess_brand_identity


def _status(url: str) -> str:
    return assess_brand_identity(url)["status"]


def test_exact_official_domain_is_domain_match():
    assert _status("https://google.com") == "domain_match"
    assert _status("http://paypal.com") == "domain_match"
    assert _status("https://www.amazon.com") == "domain_match"


def test_domain_match_returns_brand_and_domain():
    result = assess_brand_identity("https://accounts.google.com")
    assert result["status"] == "domain_match"
    assert result["hostname"] == "accounts.google.com"
    assert result["matched_brand"] == "Google"
    assert result["matched_domain"] == "google.com"
    assert result["reasons"]


def test_https_is_not_proof_of_authenticity():
    assert _status("https://paypal-security.evil.example") in {
        "possible_impersonation",
        "no_brand_signal",
    }


def test_genuine_subdomain_is_domain_match():
    assert _status("https://mail.google.com") == "domain_match"
    assert _status("https://support.microsoft.com") == "domain_match"
    assert _status("http://api.github.com") == "domain_match"


def test_subdomain_returns_top_level_domain():
    result = assess_brand_identity("https://drive.google.com")
    assert result["status"] == "domain_match"
    assert result["matched_domain"] == "google.com"
    assert result["matched_brand"] == "Google"


def test_deceptive_suffix_is_not_domain_match():
    result = assess_brand_identity("http://paypal.com.evil.example/login")
    assert result["status"] != "domain_match"
    assert result["hostname"] == "paypal.com.evil.example"


def test_deceptive_suffix_is_possible_impersonation():
    result = assess_brand_identity("http://paypal.com.evil.example/login")
    assert result["status"] == "possible_impersonation"
    assert result["matched_brand"] == "PayPal"
    assert "paypal" in " ".join(result["reasons"]).lower()


def test_brand_in_tld_position_is_not_match():
    result = assess_brand_identity("http://evil.paypal.com.evil.example")
    assert result["status"] != "domain_match"
    assert result["status"] == "possible_impersonation"


def test_brand_token_in_hostname_is_possible_impersonation():
    assert _status("http://paypal-security-login.example.com") == "possible_impersonation"
    assert _status("https://microsoft-account-update.example.net") == "possible_impersonation"


def test_lookalike_token_is_flagged():
    # Digit 1 -> l lookalike: paypa1 -> paypal
    assert _status("http://paypa1.com") == "possible_impersonation"
    # Digit 0 -> o lookalike: micros0ft -> microsoft
    assert _status("https://micros0ft.com") == "possible_impersonation"


def test_possible_impersonation_names_brand():
    result = assess_brand_identity("http://paypa1.com")
    assert result["status"] == "possible_impersonation"
    assert result["matched_brand"] == "PayPal"
    assert result["matched_domain"] is None


def test_brand_in_path_only_is_not_flagged():
    assert _status("https://evil.example.com/paypal/login") == "no_brand_signal"
    assert _status("https://attacker.com/?redirect=paypal.com") == "no_brand_signal"


def test_punycode_hostname_is_idn_warning():
    # Pure punycode with no brand token -> idn_warning
    result = assess_brand_identity("http://xn--example-9ab.example")
    assert result["status"] == "idn_warning"
    assert "xn--" in " ".join(result["reasons"])


def test_idn_without_brand_signal_is_idn_warning():
    result = assess_brand_identity("http://xn--example-9ab.com")
    assert result["status"] == "idn_warning"


def test_unknown_brand_is_no_brand_signal():
    assert _status("https://unknownbrand-example.com") == "no_brand_signal"
    assert _status("http://randomsite.net/page") == "no_brand_signal"


def test_ip_address_is_no_brand_signal():
    assert _status("http://192.168.1.1") == "no_brand_signal"
    assert _status("https://10.0.0.1/admin") == "no_brand_signal"


def test_empty_url_is_no_brand_signal():
    result = assess_brand_identity("")
    assert result["status"] == "no_brand_signal"
    assert result["hostname"] is None
    assert result["reasons"]


def test_malformed_url_is_no_brand_signal():
    result = assess_brand_identity("not a url at all")
    assert result["status"] == "no_brand_signal"
    assert result["hostname"] is None


def test_url_without_hostname_is_no_brand_signal():
    result = assess_brand_identity("http://")
    assert result["status"] == "no_brand_signal"
    assert result["hostname"] is None


def test_non_http_scheme_without_hostname_is_no_brand_signal():
    result = assess_brand_identity("ftp://")
    assert result["status"] == "no_brand_signal"
    assert result["hostname"] is None


def test_result_contains_expected_keys():
    result = assess_brand_identity("https://google.com")
    assert set(result) == {
        "status",
        "hostname",
        "matched_brand",
        "matched_domain",
        "reasons",
    }
    assert result["status"] in {
        "domain_match",
        "possible_impersonation",
        "idn_warning",
        "no_brand_signal",
    }
    assert isinstance(result["reasons"], list)


def test_domain_match_result_never_claims_phishing():
    result = assess_brand_identity("https://google.com")
    text = " ".join(result["reasons"]).lower()
    assert "phishing" not in text
    assert "definitely" not in text


@pytest.mark.parametrize(
    ("registry_contents", "error_type"),
    [
        ("", json.JSONDecodeError),
        ('{"brands": {}}', ValueError),
    ],
)
def test_unavailable_or_malformed_registry_is_not_reported_as_no_signal(
    monkeypatch, tmp_path, registry_contents, error_type
):
    registry_path = tmp_path / "brand_registry.json"
    registry_path.write_text(registry_contents, encoding="utf-8")
    monkeypatch.setattr(brand_identity, "REGISTRY_PATH", registry_path)

    with pytest.raises((RuntimeError, error_type)):
        assess_brand_identity("https://example.com")
