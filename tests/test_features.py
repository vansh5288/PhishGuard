import json
import socket
from pathlib import Path
from unittest.mock import patch

import numpy as np
import pandas as pd

from backend.main import FEATURE_NAMES, _extract_features
from backend.security.validator import is_safe_url
from ml.preprocessing.url_features import extract_url_features, normalize_url


def test_feature_names_and_values_are_valid():
    feature_names_path = Path(__file__).resolve().parents[1] / "ml" / "data" / "processed" / "feature_names.json"
    expected_features = json.loads(feature_names_path.read_text(encoding="utf-8"))
    assert FEATURE_NAMES == expected_features

    features = _extract_features("https://example.com")
    assert list(features.index) == expected_features
    assert pd.notna(features.to_numpy(dtype=float)).all()
    assert np.isfinite(features.to_numpy(dtype=float)).all()


def test_shared_url_features_match_live_inference():
    url = "https://example.com/account/login?ref=1"
    assert _extract_features(url).to_dict() == extract_url_features(url)


def test_scheme_less_urls_are_normalized_to_http():
    assert normalize_url("example.com/path") == "http://example.com/path"
    assert normalize_url("  //example.com/path  ") == "http://example.com/path"


def test_internal_url_targets_are_rejected():
    assert not is_safe_url("http://127.0.0.1")
    assert not is_safe_url("http://localhost")


def test_dns_failure_is_rejected(monkeypatch):
    monkeypatch.setattr(
        socket,
        "getaddrinfo",
        lambda *args, **kwargs: (_ for _ in ()).throw(socket.gaierror("unresolved")),
    )
    assert not is_safe_url("https://unresolvable.example")


def test_dns_resolution_to_private_address_is_rejected(monkeypatch):
    monkeypatch.setattr(
        socket,
        "getaddrinfo",
        lambda *args, **kwargs: [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("10.0.0.5", 443))
        ],
    )
    assert not is_safe_url("https://attacker.example")


def test_feature_extraction_normal_urls():
    url = "https://example.com/welcome/index.html?user=test"
    features = extract_url_features(url)
    assert features["url_length"] == len(url)
    assert features["hostname_length"] == len("example.com")
    assert features["has_https"] == 1
    assert features["dot_count"] == 2
    assert features["query_length"] == len("user=test")
    assert features["subdirectory_count"] == 1


def test_feature_extraction_long_urls():
    long_path = "/a" * 1500
    url = f"https://example.com{long_path}?token={'x' * 500}"
    features = extract_url_features(url)
    assert features["url_length"] == len(url)
    assert features["path_length"] == len(long_path)
    assert features["query_length"] == 506
    assert features["subdirectory_count"] == 1499


def test_feature_extraction_query_strings():
    url = "https://example.com/search?q=phishing+detector&lang=en&page=2"
    features = extract_url_features(url)
    assert features["query_length"] == len("q=phishing+detector&lang=en&page=2")
    assert features["digit_count"] >= 1


def test_feature_extraction_ip_address_hosts():
    url = "http://192.168.1.1:8080/admin"
    features = extract_url_features(url)
    assert features["hostname_length"] == len("192.168.1.1")
    assert features["has_https"] == 0
    assert features["digit_count"] >= 8
    assert features["dot_count"] == 3


def test_feature_extraction_internationalized_domains():
    url = "https://xn--e1afmkfd.xn--p1ai/path/login"
    features = extract_url_features(url)
    assert features["hostname_length"] == len("xn--e1afmkfd.xn--p1ai")
    assert features["hyphen_count"] >= 4
    assert features["dot_count"] == 1


def test_feature_extraction_malformed_and_empty_input():
    empty_features = extract_url_features("")
    assert empty_features["url_length"] == 0
    assert empty_features["hostname_length"] == 0
    assert empty_features["has_https"] == 0

    malformed_features = extract_url_features("not-a-valid-url")
    assert malformed_features["url_length"] == len("not-a-valid-url")
    assert isinstance(malformed_features["special_character_count"], int)


def test_feature_extraction_makes_no_network_requests(monkeypatch):
    def forbidden_network(*args, **kwargs):
        raise AssertionError("Network call attempted during feature extraction!")

    monkeypatch.setattr(socket, "getaddrinfo", forbidden_network)
    monkeypatch.setattr(socket, "socket", forbidden_network)

    url = "https://arbitrary-unreachable-domain-999.test/login"
    features = extract_url_features(url)
    assert features["hostname_length"] == len("arbitrary-unreachable-domain-999.test")

