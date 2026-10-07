import pickle
from pathlib import Path

import pandas as pd

from backend.main import FEATURE_NAMES, MODEL, SCALER


def test_model_prediction_and_probability_are_valid():
    model_bundle = pickle.loads((Path(__file__).resolve().parents[1] / "models" / "final_model.pkl").read_bytes())
    assert hasattr(model_bundle["model"], "predict")
    assert hasattr(model_bundle["model"], "predict_proba")
    assert hasattr(model_bundle["model"], "classes_")
    assert model_bundle["class_labels"] == {
        0: "LEGITIMATE",
        1: "PHISHING",
        2: "DEFACEMENT",
        3: "MALWARE",
    }
    assert len(FEATURE_NAMES) == 10

    sample = {
        "url_length": 19,
        "hostname_length": 11,
        "path_length": 0,
        "dot_count": 2,
        "hyphen_count": 0,
        "digit_count": 0,
        "special_character_count": 4,
        "subdirectory_count": 0,
        "has_https": 1,
        "query_length": 0,
    }
    frame = pd.DataFrame([sample])[FEATURE_NAMES]
    model_input = SCALER.transform(frame) if SCALER is not None else frame.to_numpy(dtype=float)
    prediction = MODEL.predict(model_input)[0]
    probabilities = MODEL.predict_proba(model_input)[0]

    assert prediction in MODEL.classes_
    assert 0.0 <= probabilities.max() <= 1.0
    assert 0.0 <= probabilities.min() <= 1.0
