import sqlite3

from backend.database import database


def test_initialize_database_migrates_legacy_scans(monkeypatch, tmp_path):
    database_path = tmp_path / "legacy.db"
    with sqlite3.connect(database_path) as connection:
        connection.execute(
            """
            CREATE TABLE scans (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                url TEXT NOT NULL,
                prediction TEXT NOT NULL,
                probability REAL NOT NULL,
                risk TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            "INSERT INTO scans (url, prediction, probability, risk, created_at) "
            "VALUES (?, ?, ?, ?, ?)",
            ("https://example.com", "LEGITIMATE", 0.9, "SAFE", "2025-01-01T00:00:00"),
        )

    monkeypatch.setattr(database, "DATABASE_PATH", database_path)
    database.initialize_database()

    with database.get_connection() as connection:
        row = connection.execute(
            "SELECT malicious_probability, features_json FROM scans WHERE id = 1"
        ).fetchone()

    assert abs(row["malicious_probability"] - 0.1) < 1e-12
    assert row["features_json"] is None
