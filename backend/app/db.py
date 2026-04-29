import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from .config import get_settings


@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    settings = get_settings()
    Path(settings.database_path).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(settings.database_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    with connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS game_state (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                phase TEXT NOT NULL,
                active_block_id TEXT,
                visible_question_count INTEGER NOT NULL DEFAULT 0,
                revealed_block_id TEXT,
                scoring_submitted_block_id TEXT,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            INSERT OR IGNORE INTO game_state (
                id,
                phase,
                active_block_id,
                visible_question_count
            ) VALUES (1, 'lobby', NULL, 0);

            CREATE TABLE IF NOT EXISTS teams (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                code TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS participants (
                id TEXT PRIMARY KEY,
                team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
                display_name TEXT NOT NULL,
                role TEXT NOT NULL CHECK (role IN ('captain', 'member')),
                session_token TEXT NOT NULL UNIQUE,
                joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS answers (
                team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
                question_id TEXT NOT NULL,
                answer TEXT NOT NULL DEFAULT '',
                submitted_by_participant_id TEXT NOT NULL REFERENCES participants(id),
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (team_id, question_id)
            );

            CREATE TABLE IF NOT EXISTS scores (
                team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
                question_id TEXT NOT NULL,
                block_id TEXT NOT NULL,
                is_correct INTEGER NOT NULL DEFAULT 0,
                points_awarded INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (team_id, question_id)
            );
            """
        )
