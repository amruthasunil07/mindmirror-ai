"""
MindMirror AI — Database Layer
SQLite database with async support for wellness check-in data.

Metrics tracked:
  - mood (1-10)
  - sleep_hours (0-24)
  - water_intake (ml, 0-5000)
  - exercise_minutes (0-300)
  - screen_time (hours, 0-24)
  - stress (1-10)
  - notes (optional text)
"""

import aiosqlite
import os
import json
from datetime import datetime, date, timedelta
from typing import Optional

DATABASE_PATH = os.getenv("DATABASE_PATH", "data/mindmirror.db")

# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------

SCHEMA = """
CREATE TABLE IF NOT EXISTS checkins (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    date             TEXT    NOT NULL UNIQUE,
    mood             INTEGER NOT NULL CHECK(mood BETWEEN 1 AND 10),
    sleep_hours      REAL    NOT NULL CHECK(sleep_hours BETWEEN 0 AND 24),
    water_intake     INTEGER NOT NULL DEFAULT 0 CHECK(water_intake BETWEEN 0 AND 5000),
    exercise_minutes INTEGER NOT NULL DEFAULT 0 CHECK(exercise_minutes BETWEEN 0 AND 300),
    screen_time      REAL    NOT NULL DEFAULT 0 CHECK(screen_time BETWEEN 0 AND 24),
    stress           INTEGER NOT NULL CHECK(stress BETWEEN 1 AND 10),
    notes            TEXT    DEFAULT '',
    created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS weekly_reports (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    week_start  TEXT    NOT NULL,
    week_end    TEXT    NOT NULL,
    report_json TEXT    NOT NULL,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
"""


async def get_db() -> aiosqlite.Connection:
    """Return an open database connection, creating schema if needed."""
    os.makedirs(os.path.dirname(DATABASE_PATH) or ".", exist_ok=True)
    db = await aiosqlite.connect(DATABASE_PATH)
    db.row_factory = aiosqlite.Row
    await db.executescript(SCHEMA)
    await db.commit()
    return db


# ---------------------------------------------------------------------------
# Check-in CRUD
# ---------------------------------------------------------------------------

async def save_checkin(data: dict) -> dict:
    """Insert or update a daily check-in. Returns the saved row."""
    db = await get_db()
    try:
        checkin_date = data.get("date", date.today().isoformat())
        await db.execute(
            """
            INSERT INTO checkins (date, mood, sleep_hours, water_intake, exercise_minutes, screen_time, stress, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(date) DO UPDATE SET
                mood=excluded.mood,
                sleep_hours=excluded.sleep_hours,
                water_intake=excluded.water_intake,
                exercise_minutes=excluded.exercise_minutes,
                screen_time=excluded.screen_time,
                stress=excluded.stress,
                notes=excluded.notes,
                created_at=datetime('now')
            """,
            (
                checkin_date,
                int(data["mood"]),
                float(data["sleep_hours"]),
                int(data.get("water_intake", 0)),
                int(data.get("exercise_minutes", 0)),
                float(data.get("screen_time", 0)),
                int(data["stress"]),
                data.get("notes", ""),
            ),
        )
        await db.commit()
        row = await db.execute_fetchall(
            "SELECT * FROM checkins WHERE date = ?", (checkin_date,)
        )
        return dict(row[0]) if row else data
    finally:
        await db.close()


async def get_checkin(checkin_date: str) -> Optional[dict]:
    """Fetch a single check-in by date string (YYYY-MM-DD)."""
    db = await get_db()
    try:
        rows = await db.execute_fetchall(
            "SELECT * FROM checkins WHERE date = ?", (checkin_date,)
        )
        return dict(rows[0]) if rows else None
    finally:
        await db.close()


async def get_checkins_range(start: str, end: str) -> list[dict]:
    """Fetch check-ins between two dates inclusive, ordered by date."""
    db = await get_db()
    try:
        rows = await db.execute_fetchall(
            "SELECT * FROM checkins WHERE date BETWEEN ? AND ? ORDER BY date",
            (start, end),
        )
        return [dict(r) for r in rows]
    finally:
        await db.close()


async def get_all_checkins() -> list[dict]:
    """Return every check-in, oldest first."""
    db = await get_db()
    try:
        rows = await db.execute_fetchall(
            "SELECT * FROM checkins ORDER BY date"
        )
        return [dict(r) for r in rows]
    finally:
        await db.close()


async def get_recent_checkins(days: int = 30) -> list[dict]:
    """Return the last N days of check-ins."""
    end = date.today().isoformat()
    start = (date.today() - timedelta(days=days)).isoformat()
    return await get_checkins_range(start, end)


# ---------------------------------------------------------------------------
# Statistics helpers
# ---------------------------------------------------------------------------

async def get_stats(days: int = 30) -> dict:
    """Compute aggregate stats over the last N days."""
    checkins = await get_recent_checkins(days)
    if not checkins:
        return {
            "count": 0,
            "avg_mood": 0,
            "avg_sleep": 0,
            "avg_water": 0,
            "avg_exercise": 0,
            "avg_screen": 0,
            "avg_stress": 0,
            "mood_trend": "neutral",
        }
    n = len(checkins)
    avg_mood = round(sum(c["mood"] for c in checkins) / n, 1)
    avg_sleep = round(sum(c["sleep_hours"] for c in checkins) / n, 1)
    avg_water = round(sum(c["water_intake"] for c in checkins) / n, 1)
    avg_exercise = round(sum(c["exercise_minutes"] for c in checkins) / n, 1)
    avg_screen = round(sum(c["screen_time"] for c in checkins) / n, 1)
    avg_stress = round(sum(c["stress"] for c in checkins) / n, 1)

    # Simple trend: compare last 7 vs previous 7
    if n >= 14:
        recent_mood = sum(c["mood"] for c in checkins[-7:]) / 7
        earlier_mood = sum(c["mood"] for c in checkins[-14:-7]) / 7
        if recent_mood - earlier_mood > 0.5:
            mood_trend = "improving"
        elif earlier_mood - recent_mood > 0.5:
            mood_trend = "declining"
        else:
            mood_trend = "stable"
    else:
        mood_trend = "insufficient_data"

    return {
        "count": n,
        "avg_mood": avg_mood,
        "avg_sleep": avg_sleep,
        "avg_water": avg_water,
        "avg_exercise": avg_exercise,
        "avg_screen": avg_screen,
        "avg_stress": avg_stress,
        "mood_trend": mood_trend,
    }


# ---------------------------------------------------------------------------
# Weekly report storage
# ---------------------------------------------------------------------------

async def save_weekly_report(week_start: str, week_end: str, report: dict) -> None:
    db = await get_db()
    try:
        await db.execute(
            "INSERT INTO weekly_reports (week_start, week_end, report_json) VALUES (?, ?, ?)",
            (week_start, week_end, json.dumps(report)),
        )
        await db.commit()
    finally:
        await db.close()


async def get_latest_weekly_report() -> Optional[dict]:
    db = await get_db()
    try:
        rows = await db.execute_fetchall(
            "SELECT * FROM weekly_reports ORDER BY created_at DESC LIMIT 1"
        )
        if rows:
            r = dict(rows[0])
            r["report_json"] = json.loads(r["report_json"])
            return r
        return None
    finally:
        await db.close()
