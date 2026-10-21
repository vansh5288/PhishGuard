"""Brand identity mismatch detection for PhishGuard.

Pure offline heuristic reading backend/data/brand_registry.json.
Statuses: domain_match, possible_impersonation, idn_warning, no_brand_signal.
No network, no DNS, no changes to the URL validator.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

REGISTRY_PATH = Path(__file__).resolve().parents[1] / "data" / "brand_registry.json"

PUNYCODE_PREFIX = "xn--"

LOOKALIKE_MAP = str.maketrans({"0": "o", "1": "l", "3": "e", "5": "s", "7": "t"})


def _load_registry() -> dict[str, Any]:
    try:
        with REGISTRY_PATH.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
    except (OSError, json.JSONDecodeError, UnicodeDecodeError) as error:
        raise RuntimeError("Brand registry could not be read or parsed.") from error
    if not isinstance(data, dict):
        raise ValueError("Brand registry root must be a JSON object.")
    brands = data.get("brands", [])
    if not isinstance(brands, list):
        raise ValueError("Brand registry 'brands' must be a list.")
    if any(not isinstance(brand, dict) for brand in brands):
        raise ValueError("Brand registry entries must be JSON objects.")
    return {"brands": brands}


def _extract_hostname(url: str) -> str | None:
    if not isinstance(url, str):
        return None
    stripped = url.strip()
    if not stripped:
        return None
    try:
        parsed = urlsplit(stripped)
    except ValueError:
        return None
    hostname = parsed.hostname
    if not hostname:
        return None
    return hostname.lower()


def _is_punycode_label(label: str) -> bool:
    return label.startswith(PUNYCODE_PREFIX)


def _has_non_ascii(label: str) -> bool:
    try:
        label.encode("ascii")
        return False
    except UnicodeEncodeError:
        return True


def _normalize_lookalikes(token: str) -> str:
    return token.translate(LOOKALIKE_MAP)


def _tokenize_hostname(hostname: str) -> list[str]:
    tokens: list[str] = []
    for label in hostname.split("."):
        for part in label.split("-"):
            part = part.strip()
            if part:
                tokens.append(part)
    return tokens


def _is_subdomain_of(hostname: str, domain: str) -> bool:
    hostname = hostname.lower()
    domain = domain.lower()
    if hostname == domain:
        return True
    return hostname.endswith("." + domain)


def _official_domain_for(hostname: str, brand: dict[str, Any]) -> str | None:
    for domain in brand.get("official_domains", []):
        if not isinstance(domain, str):
            continue
        if _is_subdomain_of(hostname, domain.lower()):
            return domain
    return None


def _find_official_match(
    hostname: str, brands: list[dict[str, Any]]
) -> tuple[dict[str, Any] | None, str | None]:
    for brand in brands:
        matched_domain = _official_domain_for(hostname, brand)
        if matched_domain is not None:
            return brand, matched_domain
    return None, None


def _brand_identifiers(brand: dict[str, Any]) -> set[str]:
    identifiers: set[str] = set()
    brand_id = brand.get("id")
    if isinstance(brand_id, str) and brand_id:
        identifiers.add(brand_id.lower())
    for alias in brand.get("aliases", []):
        if isinstance(alias, str) and alias:
            identifiers.add(alias.lower())
    identifiers.discard("")
    return identifiers


def _find_brand_signal(
    hostname: str, brands: list[dict[str, Any]]
) -> dict[str, Any] | None:
    tokens = _tokenize_hostname(hostname)
    norm_tokens = [_normalize_lookalikes(t) for t in tokens]
    for brand in brands:
        identifiers = _brand_identifiers(brand)
        for norm in norm_tokens:
            if norm in identifiers:
                return brand
    return None


def _triggering_token(hostname: str, brand: dict[str, Any]) -> str | None:
    identifiers = _brand_identifiers(brand)
    for token in _tokenize_hostname(hostname):
        if _normalize_lookalikes(token) in identifiers:
            return token
    return None


def assess_brand_identity(url: str) -> dict[str, Any]:
    """Assess brand-identity signals for *url*.

    Pure function: reads only the local brand registry, performs no network
    requests and no DNS resolution.

    Returns:
        status: ``domain_match`` | ``possible_impersonation`` |
                ``idn_warning`` | ``no_brand_signal``
        hostname: the parsed hostname or ``None``
        matched_brand: brand display name when a brand is implicated
        matched_domain: the official domain matched (domain_match only)
        reasons: human-readable explanation strings
    """
    result: dict[str, Any] = {
        "status": "no_brand_signal",
        "hostname": None,
        "matched_brand": None,
        "matched_domain": None,
        "reasons": [],
    }

    hostname = _extract_hostname(url)
    result["hostname"] = hostname

    if not hostname:
        result["reasons"].append("No hostname could be parsed from the URL.")
        return result

    brands = _load_registry().get("brands", [])

    labels = hostname.split(".")
    idn_labels = [
        lab for lab in labels if _is_punycode_label(lab) or _has_non_ascii(lab)
    ]
    if idn_labels:
        result["reasons"].append(
            "Hostname contains internationalised/punycode label(s): "
            + ", ".join(idn_labels)
        )

    official_brand, matched_domain = _find_official_match(hostname, brands)
    if official_brand is not None:
        result["status"] = "domain_match"
        result["matched_brand"] = official_brand.get("name")
        result["matched_domain"] = matched_domain
        result["reasons"].append(
            "Hostname matches an official domain for "
            f"{official_brand.get('name')} ({matched_domain})."
        )
        if idn_labels:
            result["reasons"].append(
                "Note: the hostname also uses IDN/punycode labels; verify carefully."
            )
        return result

    signal_brand = _find_brand_signal(hostname, brands)
    if signal_brand is not None:
        token = _triggering_token(hostname, signal_brand)
        result["status"] = "possible_impersonation"
        result["matched_brand"] = signal_brand.get("name")
        result["matched_domain"] = None
        token_note = f" ('{token}')" if token else ""
        result["reasons"].append(
            "Hostname contains a brand-like token for "
            f"{signal_brand.get('name')}{token_note}, but is not an official "
            "domain for that brand."
        )
        return result

    if idn_labels:
        result["status"] = "idn_warning"
        result["reasons"].append(
            "IDN/punycode hostname detected with no official brand-domain match."
        )

    return result
