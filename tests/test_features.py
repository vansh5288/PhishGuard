import json
from pathlib import Path

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
