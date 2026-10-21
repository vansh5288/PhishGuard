"""Validation tests for the PhishGuard brand-domain registry.

These tests verify that ``backend/data/brand_registry.json`` is well-formed,
conforms to the expected schema, and can be loaded safely even when individual
brand records are missing optional fields. They do not perform any network
requests and do not inspect submitted URLs.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

REGISTRY_PATH = Path(__file__).resolve().parents[1] / "backend" / "data" / "brand_registry.json"

DOMAIN_RE = re.compile(r"^(?!\.)(?!.*\.\.)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.?$")


def _load_registry() -> dict:
    with REGISTRY_PATH.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def test_registry_file_exists_and_is_valid_json():
    assert REGISTRY_PATH.is_file(), f"Registry file not found: {REGISTRY_PATH}"
    registry = _load_registry()
    assert isinstance(registry, dict)


def test_registry_has_schema_version():
    registry = _load_registry()
    assert "schema_version" in registry
    assert isinstance(registry["schema_version"], str)
    assert registry["schema_version"] == "1.0"


def test_registry_has_brands_list():
    registry = _load_registry()
    assert "brands" in registry
    assert isinstance(registry["brands"], list)
    assert len(registry["brands"]) > 0


def test_each_brand_has_required_fields():
    registry = _load_registry()
    for brand in registry["brands"]:
        assert "id" in brand and isinstance(brand["id"], str) and brand["id"], "brand missing id"
        assert "name" in brand and isinstance(brand["name"], str) and brand["name"], "brand missing name"
        assert "official_domains" in brand, f"brand {brand.get('id')} missing official_domains"
        assert isinstance(brand["official_domains"], list), f"brand {brand.get('id')} official_domains not a list"
        assert len(brand["official_domains"]) > 0, f"brand {brand.get('id')} has no official_domains"


def test_official_domains_are_well_formed():
    registry = _load_registry()
    for brand in registry["brands"]:
        for domain in brand["official_domains"]:
            assert isinstance(domain, str), f"brand {brand['id']} has non-string domain"
            assert domain == domain.lower(), f"domain {domain!r} is not lowercase"
            assert " " not in domain, f"domain {domain!r} contains spaces"
            assert "://" not in domain, f"domain {domain!r} contains a scheme"
            assert "/" not in domain, f"domain {domain!r} contains a path"
            assert "." in domain, f"domain {domain!r} has no dot"
            assert DOMAIN_RE.match(domain), f"domain {domain!r} is not a valid hostname"


def test_no_duplicate_domains_across_brands():
    registry = _load_registry()
    seen: dict[str, str] = {}
    for brand in registry["brands"]:
        for domain in brand["official_domains"]:
            assert domain not in seen, (
                f"domain {domain!r} claimed by both {seen[domain]!r} and {brand['id']!r}"
            )
            seen[domain] = brand["id"]


def test_brand_ids_are_unique():
    registry = _load_registry()
    ids = [brand["id"] for brand in registry["brands"]]
    assert len(ids) == len(set(ids)), "duplicate brand ids found"


def test_initial_brands_present():
    registry = _load_registry()
    ids = {brand["id"] for brand in registry["brands"]}
    expected = {"google", "microsoft", "paypal", "amazon", "apple", "github"}
    assert expected.issubset(ids), f"missing expected brands: {expected - ids}"


def test_registry_handles_missing_optional_fields_safely():
    """A brand record missing optional fields should not break the schema."""
    registry = _load_registry()
    for brand in registry["brands"]:
        # Optional fields may be absent; code reading them should use .get().
        brand.get("aliases", [])
        brand.get("verification", {})
        brand["verification"].get("method", "unknown")
        brand["verification"].get("source", "unknown")
        brand["verification"].get("verified_at")
        brand["verification"].get("notes")


def test_registry_metadata_is_present():
    registry = _load_registry()
    meta = registry.get("registry", {})
    assert isinstance(meta, dict)
    assert "title" in meta
    assert "description" in meta
    assert "verification_method" in meta
    assert "data_sources" in meta
    assert isinstance(meta["data_sources"], list)
    assert "notes" in meta
    assert "not exhaustive" in meta["notes"].lower()
