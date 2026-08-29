"""
MindMirror AI — FastAPI Application
Single-page wellness tracking app with Claude-powered insights.
"""

import os
import logging
from datetime import date, timedelta
from contextlib import asynccontextmanager

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles

from app.database import (
    save_checkin, get_checkin, get_all_checkins,
    get_recent_checkins, get_stats, get_checkins_range,
    save_weekly_report, get_latest_weekly_report,
)
from app.claude import generate_insights, generate_weekly_report, analyse_patterns

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# App lifespan
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("MindMirror AI starting up ✨")
    yield
    logger.info("MindMirror AI shutting down 🌙")


app = FastAPI(
    title="MindMirror AI",
    description="Personal Wellness Tracker with AI-powered Insights",
    version="1.0.0",
    lifespan=lifespan,
)

# Static files
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
# Also mount css/js at root level so relative paths (./css/, ./js/) work
app.mount("/css", StaticFiles(directory=os.path.join(STATIC_DIR, "css")), name="css")
app.mount("/js", StaticFiles(directory=os.path.join(STATIC_DIR, "js")), name="js")


# ---------------------------------------------------------------------------
# Pages
# ---------------------------------------------------------------------------

@app.get("/", response_class=HTMLResponse)
async def index():
    """Serve the single-page application."""
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))


# ---------------------------------------------------------------------------
# API — Check-ins
# ---------------------------------------------------------------------------

@app.post("/api/checkin")
async def api_save_checkin(request: Request):
    """Save or update a daily check-in."""
    data = await request.json()
    required = ["mood", "sleep_hours", "water_intake", "exercise_minutes", "screen_time", "stress"]
    for field in required:
        if field not in data:
            return JSONResponse({"error": f"Missing field: {field}"}, status_code=400)
    try:
        result = await save_checkin(data)
        return {"status": "ok", "checkin": result}
    except Exception as exc:
        logger.error("Error saving check-in: %s", exc)
        return JSONResponse({"error": str(exc)}, status_code=500)


@app.get("/api/checkin/{checkin_date}")
async def api_get_checkin(checkin_date: str):
    """Fetch a single check-in by date."""
    row = await get_checkin(checkin_date)
    if row:
        return row
    return JSONResponse({"error": "No check-in found"}, status_code=404)


@app.get("/api/checkin/today/current")
async def api_get_today():
    """Fetch today's check-in if it exists."""
    row = await get_checkin(date.today().isoformat())
    if row:
        return row
    return JSONResponse({"error": "No check-in for today"}, status_code=404)


@app.get("/api/checkins")
async def api_get_all_checkins():
    """Return all check-ins."""
    return await get_all_checkins()


@app.get("/api/checkins/recent")
async def api_get_recent(days: int = 30):
    """Return recent check-ins."""
    return await get_recent_checkins(days)


# ---------------------------------------------------------------------------
# API — Dashboard & Stats
# ---------------------------------------------------------------------------

@app.get("/api/dashboard")
async def api_dashboard():
    """Return dashboard data: stats + recent check-ins."""
    stats = await get_stats(30)
    recent = await get_recent_checkins(30)
    return {"stats": stats, "checkins": recent}


# ---------------------------------------------------------------------------
# API — AI Insights
# ---------------------------------------------------------------------------

@app.get("/api/insights")
async def api_insights(days: int = 30):
    """Generate AI-powered wellness insights."""
    checkins = await get_recent_checkins(days)
    stats = await get_stats(days)
    text = await generate_insights(checkins, stats)
    return {"insights": text, "source": "claude" if os.getenv("ANTHROPIC_API_KEY", "").strip() not in ("", "your_anthropic_api_key_here") else "local"}


@app.get("/api/patterns")
async def api_patterns():
    """Deep pattern analysis across all check-in history."""
    checkins = await get_all_checkins()
    text = await analyse_patterns(checkins)
    return {"patterns": text, "source": "claude" if os.getenv("ANTHROPIC_API_KEY", "").strip() not in ("", "your_anthropic_api_key_here") else "local"}


@app.get("/api/weekly-report")
async def api_weekly_report():
    """Generate (or fetch cached) weekly wellness report."""
    today = date.today()
    week_start = (today - timedelta(days=today.weekday())).isoformat()
    week_end = today.isoformat()

    checkins = await get_checkins_range(week_start, week_end)
    stats = await get_stats(7)
    report = await generate_weekly_report(checkins, stats)

    # Cache report
    try:
        await save_weekly_report(week_start, week_end, report)
    except Exception:
        pass  # Non-critical

    return {"report": report, "week_start": week_start, "week_end": week_end}


# ---------------------------------------------------------------------------
# API — Trends
# ---------------------------------------------------------------------------

@app.get("/api/trends")
async def api_trends(days: int = 30):
    """Return trend data optimised for Chart.js."""
    checkins = await get_recent_checkins(days)
    labels = [c["date"] for c in checkins]
    return {
        "labels": labels,
        "mood": [c["mood"] for c in checkins],
        "sleep": [c["sleep_hours"] for c in checkins],
        "water": [c["water_intake"] for c in checkins],
        "exercise": [c["exercise_minutes"] for c in checkins],
        "screen": [c["screen_time"] for c in checkins],
        "stress": [c["stress"] for c in checkins],
    }


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

@app.get("/api/health")
async def health():
    return {"status": "healthy", "version": "1.0.0"}
