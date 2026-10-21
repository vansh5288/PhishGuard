"""Database engine and session configuration."""

from __future__ import annotations

import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATABASE_PATH = ROOT / "data" / "phishguard.db"


def get_connection() -> sqlite3.Connection:
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def initialize_database() -> None:
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with get_connection() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS scans (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                url TEXT NOT NULL,
                prediction TEXT NOT NULL,
                probability REAL NOT NULL,
                probabilities_json TEXT,
                malicious_probability REAL NOT NULL DEFAULT 0.0,
                features_json TEXT,
                explanation_json TEXT,
                risk TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        columns = {
            row["name"]
            for row in connection.execute("PRAGMA table_info(scans)").fetchall()
        }
        if "malicious_probability" not in columns:
            connection.execute(
                "ALTER TABLE scans ADD COLUMN malicious_probability REAL NOT NULL DEFAULT 0.0"
            )
            connection.execute(
                """
                UPDATE scans
                SET malicious_probability = CASE
                    WHEN prediction = 'LEGITIMATE' THEN 1.0 - probability
                    ELSE probability
                END
                """
            )
        if "probabilities_json" not in columns:
            connection.execute("ALTER TABLE scans ADD COLUMN probabilities_json TEXT")
        if "features_json" not in columns:
            connection.execute("ALTER TABLE scans ADD COLUMN features_json TEXT")
        if "explanation_json" not in columns:
            connection.execute("ALTER TABLE scans ADD COLUMN explanation_json TEXT")
        if "brand_match_status" not in columns:
            connection.execute("ALTER TABLE scans ADD COLUMN brand_match_status TEXT")
        if "matched_brand" not in columns:
            connection.execute("ALTER TABLE scans ADD COLUMN matched_brand TEXT")
        if "matched_domain" not in columns:
            connection.execute("ALTER TABLE scans ADD COLUMN matched_domain TEXT")
        if "brand_reasons_json" not in columns:
            connection.execute("ALTER TABLE scans ADD COLUMN brand_reasons_json TEXT")
        if "confidence" not in columns:
            connection.execute("ALTER TABLE scans ADD COLUMN confidence REAL")
        if "confidence_margin" not in columns:
            connection.execute("ALTER TABLE scans ADD COLUMN confidence_margin REAL")
        if "entropy" not in columns:
            connection.execute("ALTER TABLE scans ADD COLUMN entropy REAL")
        if "needs_review" not in columns:
            connection.execute("ALTER TABLE scans ADD COLUMN needs_review INTEGER DEFAULT 0")
        if "uncertainty_reasons_json" not in columns:
            connection.execute("ALTER TABLE scans ADD COLUMN uncertainty_reasons_json TEXT")
        if "stability_json" not in columns:
            connection.execute("ALTER TABLE scans ADD COLUMN stability_json TEXT")
