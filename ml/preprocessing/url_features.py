"""Shared URL normalization and feature extraction for training and inference."""

from __future__ import annotations

from urllib.parse import urlsplit

FEATURE_NAMES = (
    "url_length",
    "hostname_length",
    "path_length",
    "dot_count",
    "hyphen_count",
    "digit_count",
    "special_character_count",
    "subdirectory_count",
    "has_https",
    "query_length",
)


def normalize_url(raw_url: str) -> str:
    """Add the dataset's default HTTP scheme when a URL omits one."""
    value = raw_url.strip()
    if not value:
        return value
    if value.startswith("//"):
        return f"http:{value}"
    if "://" in value:
        return value
    return f"http://{value}"


def extract_url_features(url: str) -> dict[str, int]:
    """Extract the fixed ordered lexical feature set used by the model."""
    parsed = urlsplit(url)
    hostname = parsed.hostname or ""
    path = parsed.path or ""
    path_segments = [segment for segment in path.strip("/").split("/") if segment]
    return {
        "url_length": len(url),
        "hostname_length": len(hostname),
        "path_length": len(path),
        "dot_count": url.count("."),
        "hyphen_count": url.count("-"),
        "digit_count": sum(character.isdigit() for character in url),
        "special_character_count": sum(not character.isalnum() for character in url),
        "subdirectory_count": max(len(path_segments) - 1, 0),
        "has_https": int(parsed.scheme.lower() == "https"),
        "query_length": len(parsed.query or ""),
    }
