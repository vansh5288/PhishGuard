"""PhishGuard Stability Shield — Equivalent URL Prediction Consistency Checker.

Evaluates whether harmless, standards-compliant URL representation changes
(RFC 3986 case normalization, default port specification/removal, and path
equivalence) cause the trained ML model to alter its classification verdict.
All evaluations are performed locally without making network requests.
"""

from __future__ import annotations

import logging
from typing import Any, Callable
from urllib.parse import urlsplit, urlunsplit

import numpy as np
import pandas as pd

LOGGER = logging.getLogger("phishguard.stability")

STABILITY_EXPLANATION = (
    "Prediction Stability measures whether the model returns the same class "
    "for equivalent URL representations. A stable prediction can still be incorrect."
)
STABILITY_LIMITATIONS = (
    "Evaluates standards-compliant lexical representation changes only (RFC 3986); "
    "does not evaluate server-side URL rewriting, symlinks, or network redirects."
)


def generate_equivalent_representations(raw_url: str) -> tuple[list[dict[str, str]], list[dict[str, str]]]:
    """Generate strictly standards-compliant equivalent representations for a URL.

    Returns:
        valid_candidates: list of dicts with check_id, name, description, transformed_url.
        skipped_checks: list of dicts with check_id, name, reason.
    """
    valid: list[dict[str, str]] = []
    skipped: list[dict[str, str]] = []

    try:
        parts = urlsplit(raw_url)
    except Exception as exc:
        skipped.append({
            "check_id": "url_parsing",
            "name": "URL Parsing",
            "reason": f"Unable to parse URL structure: {exc}",
        })
        return valid, skipped

    scheme = (parts.scheme or "").lower()
    if scheme not in {"http", "https"}:
        skipped.append({
            "check_id": "scheme_check",
            "name": "Transport Scheme Check",
            "reason": f"Equivalence transformations are only defined for HTTP/HTTPS, got: '{scheme or 'none'}'",
        })
        return valid, skipped

    hostname = parts.hostname or ""
    if not hostname:
        skipped.append({
            "check_id": "hostname_check",
            "name": "Hostname Validation",
            "reason": "URL has no valid hostname; cannot establish safe representation equivalence",
        })
        return valid, skipped

    # 1. Scheme and Hostname Case Normalization (RFC 3986 Section 6.2.2.1)
    # RFC 3986 specifies scheme and host are case-insensitive.
    if any(c.islower() for c in parts.netloc):
        upper_netloc = parts.netloc.upper()
        upper_scheme = parts.scheme.upper()
        transformed = urlunsplit((upper_scheme, upper_netloc, parts.path, parts.query, parts.fragment))
        if transformed != raw_url:
            valid.append({
                "check_id": "case_normalization",
                "name": "Scheme & Hostname Case Normalization",
                "description": "RFC 3986 Section 6.2.2.1 case-insensitive scheme and authority normalization",
                "transformed_url": transformed,
            })
    elif any(c.isupper() for c in parts.netloc):
        lower_netloc = parts.netloc.lower()
        lower_scheme = parts.scheme.lower()
        transformed = urlunsplit((lower_scheme, lower_netloc, parts.path, parts.query, parts.fragment))
        if transformed != raw_url:
            valid.append({
                "check_id": "case_normalization",
                "name": "Scheme & Hostname Case Normalization",
                "description": "RFC 3986 Section 6.2.2.1 case-insensitive scheme and authority normalization",
                "transformed_url": transformed,
            })
    else:
        skipped.append({
            "check_id": "case_normalization",
            "name": "Scheme & Hostname Case Normalization",
            "reason": "Host contains no alphabetic characters suitable for case transformation",
        })

    # 2. Default Port Specification / Removal (RFC 3986 Section 6.2.3)
    default_port = 80 if scheme == "http" else 443
    if parts.port == default_port:
        # Explicit default port is present -> remove it
        userinfo = f"{parts.username}:{parts.password}@" if parts.username else ""
        netloc_no_port = f"{userinfo}{parts.hostname}"
        transformed = urlunsplit((parts.scheme, netloc_no_port, parts.path, parts.query, parts.fragment))
        if transformed != raw_url:
            valid.append({
                "check_id": "default_port_removal",
                "name": "Explicit Default Port Removal",
                "description": f"RFC 3986 Section 6.2.3 removal of redundant default port :{default_port}",
                "transformed_url": transformed,
            })
    elif parts.port is None:
        # Port omitted -> add explicit default port
        userinfo = f"{parts.username}:{parts.password}@" if parts.username else ""
        netloc_with_port = f"{userinfo}{parts.hostname}:{default_port}"
        transformed = urlunsplit((parts.scheme, netloc_with_port, parts.path, parts.query, parts.fragment))
        if transformed != raw_url:
            valid.append({
                "check_id": "default_port_addition",
                "name": "Explicit Default Port Addition",
                "description": f"RFC 3986 Section 6.2.3 explicit default port :{default_port} specification",
                "transformed_url": transformed,
            })
    else:
        skipped.append({
            "check_id": "default_port_normalization",
            "name": "Default Port Normalization",
            "reason": f"URL specifies non-default port :{parts.port}; modifying it would alter routing semantics",
        })

    # 3. Root Path Equivalence (RFC 3986 Section 6.2.3 / RFC 2616 Section 3.2.2)
    # An empty path is equivalent to "/" for HTTP/HTTPS URIs.
    if parts.path == "":
        transformed = urlunsplit((parts.scheme, parts.netloc, "/", parts.query, parts.fragment))
        if transformed != raw_url:
            valid.append({
                "check_id": "empty_path_normalization",
                "name": "Root Path Normalization (Empty to Slash)",
                "description": "RFC 2616 Section 3.2.2 / RFC 3986 normalization of empty HTTP path to '/'",
                "transformed_url": transformed,
            })
    elif parts.path == "/" and not parts.query and not parts.fragment:
        transformed = urlunsplit((parts.scheme, parts.netloc, "", parts.query, parts.fragment))
        if transformed != raw_url:
            valid.append({
                "check_id": "empty_path_normalization",
                "name": "Root Path Normalization (Slash to Empty)",
                "description": "RFC 2616 Section 3.2.2 / RFC 3986 root slash representation without query/fragment",
                "transformed_url": transformed,
            })
    else:
        # Non-empty subpath
        pass

    # 4. Dot-segment self-reference path normalization (RFC 3986 Section 6.2.2.3)
    if parts.path and parts.path.startswith("/") and len(parts.path) > 1 and "/./" not in parts.path:
        dot_path = f"/./{parts.path.lstrip('/')}"
        transformed = urlunsplit((parts.scheme, parts.netloc, dot_path, parts.query, parts.fragment))
        if transformed != raw_url:
            valid.append({
                "check_id": "dot_segment_equivalence",
                "name": "Dot-Segment Path Equivalence",
                "description": "RFC 3986 Section 6.2.2.3 dot-segment reference '/./' path equivalence",
                "transformed_url": transformed,
            })

    # 5. Empty query string delimiter
    if raw_url.endswith("?") and not parts.query:
        transformed = raw_url[:-1]
        valid.append({
            "check_id": "empty_query_delimiter",
            "name": "Empty Query Delimiter Removal",
            "description": "Removal of trailing empty '?' query delimiter",
            "transformed_url": transformed,
        })

    return valid, skipped


def assess_url_stability(
    url: str,
    original_prediction: str,
    feature_extractor: Callable[[str], pd.Series | dict[str, Any]],
    model: Any,
    scaler: Any = None,
    feature_names: list[str] | tuple[str, ...] | None = None,
    class_labels: dict[int, str] | None = None,
) -> dict[str, Any]:
    """Run PhishGuard Stability Shield assessment for a validated URL.

    Evaluates predictions across all valid semantics-preserving representations.
    Does NOT alter the original prediction or risk score. Does NOT make network calls.
    """
    valid_candidates, skipped_checks = generate_equivalent_representations(url)

    if not valid_candidates:
        return {
            "status": "unavailable",
            "original_prediction": original_prediction,
            "prediction_stability": None,
            "transformations_tested": 0,
            "consistent_predictions": 0,
            "checks": [],
            "skipped_checks": skipped_checks,
            "explanation": STABILITY_EXPLANATION,
            "limitations": STABILITY_LIMITATIONS,
            "summary": "No distinct semantics-preserving transformations could be established for this URL.",
        }

    checks: list[dict[str, Any]] = []
    consistent_count = 0

    for candidate in valid_candidates:
        transformed_url = candidate["transformed_url"]
        try:
            feats = feature_extractor(transformed_url)
            if isinstance(feats, pd.Series):
                feat_dict = feats.to_dict()
            else:
                feat_dict = dict(feats)

            names = list(feature_names) if feature_names else list(feat_dict.keys())
            feat_frame = pd.DataFrame([[feat_dict[k] for k in names]], columns=names)

            if scaler is not None:
                model_input = scaler.transform(feat_frame)
            else:
                model_input = feat_frame.to_numpy(dtype=float)

            pred_raw = model.predict(model_input)[0]
            if class_labels is not None:
                pred_label = class_labels.get(int(pred_raw), str(pred_raw))
            else:
                pred_label = str(pred_raw)

            probs_raw = model.predict_proba(model_input)[0]
            class_position = list(model.classes_).index(pred_raw)
            prob = float(probs_raw[class_position])

            is_consistent = (pred_label == original_prediction)
            if is_consistent:
                consistent_count += 1

            checks.append({
                "check_id": candidate["check_id"],
                "name": candidate["name"],
                "description": candidate["description"],
                "transformed_url": transformed_url,
                "predicted_class": pred_label,
                "probability": prob,
                "consistent": is_consistent,
            })
        except Exception as exc:
            LOGGER.warning(
                "Stability check '%s' failed for representation '%s': %s",
                candidate["check_id"],
                transformed_url,
                exc,
            )
            skipped_checks.append({
                "check_id": candidate["check_id"],
                "name": candidate["name"],
                "reason": f"Evaluation error: {exc}",
            })

    total_tested = len(checks)
    if total_tested == 0:
        return {
            "status": "unavailable",
            "original_prediction": original_prediction,
            "prediction_stability": None,
            "transformations_tested": 0,
            "consistent_predictions": 0,
            "checks": [],
            "skipped_checks": skipped_checks,
            "explanation": STABILITY_EXPLANATION,
            "limitations": STABILITY_LIMITATIONS,
            "summary": "All candidate equivalent representations failed during feature evaluation.",
        }

    stability_percentage = round((consistent_count / total_tested) * 100.0, 1)
    status = "stable" if stability_percentage == 100.0 else "unstable"

    if status == "stable":
        summary = (
            f"The model produced identical '{original_prediction}' predictions across all "
            f"{total_tested} tested standards-compliant representations."
        )
    else:
        flips = total_tested - consistent_count
        summary = (
            f"Prediction instability detected: {flips} of {total_tested} standards-compliant "
            f"equivalent representations resulted in a changed class verdict."
        )

    return {
        "status": status,
        "original_prediction": original_prediction,
        "prediction_stability": stability_percentage,
        "transformations_tested": total_tested,
        "consistent_predictions": consistent_count,
        "checks": checks,
        "skipped_checks": skipped_checks,
        "explanation": STABILITY_EXPLANATION,
        "limitations": STABILITY_LIMITATIONS,
        "summary": summary,
    }
