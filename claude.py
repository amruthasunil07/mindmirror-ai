"""
MindMirror AI — Claude AI Integration
Uses the Anthropic Python SDK for wellness-focused AI insights.
Falls back to local rule-based analysis when the API key is unavailable.

IMPORTANT: All AI output is strictly limited to wellness pattern discovery.
This module does NOT diagnose diseases, predict medical conditions,
prescribe medication, or provide medical treatment.
"""

import os
import json
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Claude client (lazy-initialised)
# ---------------------------------------------------------------------------

_client = None


def _get_client():
    """Return an Anthropic client, or None if the key is missing."""
    global _client
    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key or api_key == "your_anthropic_api_key_here":
        return None
    if _client is None:
        try:
            import anthropic
            _client = anthropic.Anthropic(api_key=api_key)
        except Exception as exc:
            logger.warning("Failed to initialise Anthropic client: %s", exc)
            return None
    return _client


# ---------------------------------------------------------------------------
# System prompt — strictly scoped to wellness pattern discovery
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """\
You are MindMirror AI, a supportive wellness pattern analyst.

YOUR ROLE:
- Analyse self-reported mood, sleep, water intake, exercise minutes, screen time, stress, and notes.
- Identify correlations and patterns (e.g. "sleep above 7 h correlates with higher mood").
- Offer gentle, actionable wellness suggestions (e.g. breathing exercises, sleep hygiene tips, hydration reminders).
- Celebrate positive trends and encourage consistency.

STRICT BOUNDARIES — you MUST follow these:
- Do NOT diagnose any disease or medical condition.
- Do NOT predict medical outcomes.
- Do NOT prescribe or recommend any medication or medical treatment.
- Do NOT act as a therapist, psychiatrist, or medical professional.
- If the user's data suggests serious distress, recommend they speak to a qualified professional.
- Always remind the user that your observations are based on self-reported data and are not medical advice.

TONE: Warm, encouraging, concise. Use emoji sparingly for friendliness.
FORMAT: Return well-structured text. Use bullet points where appropriate.
"""


# ---------------------------------------------------------------------------
# Claude-powered functions
# ---------------------------------------------------------------------------

async def generate_insights(checkins: list[dict], stats: dict) -> str:
    """Generate AI insights from recent check-in data."""
    client = _get_client()
    if client is None:
        return _local_insights(checkins, stats)

    prompt = _build_insights_prompt(checkins, stats)
    try:
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1024,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}],
        )
        return response.content[0].text
    except Exception as exc:
        logger.error("Claude API error (insights): %s", exc)
        return _local_insights(checkins, stats)


async def generate_weekly_report(checkins: list[dict], stats: dict) -> dict:
    """Generate a structured weekly wellness report."""
    client = _get_client()
    if client is None:
        return _local_weekly_report(checkins, stats)

    prompt = _build_weekly_report_prompt(checkins, stats)
    try:
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1500,
            system=SYSTEM_PROMPT + "\nReturn ONLY valid JSON with keys: summary, highlights, patterns, suggestions, encouragement.",
            messages=[{"role": "user", "content": prompt}],
        )
        text = response.content[0].text
        # Try to parse JSON from the response
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            # Try to extract JSON from markdown code block
            if "```json" in text:
                json_str = text.split("```json")[1].split("```")[0].strip()
                return json.loads(json_str)
            elif "```" in text:
                json_str = text.split("```")[1].split("```")[0].strip()
                return json.loads(json_str)
            return {"summary": text, "highlights": [], "patterns": [], "suggestions": [], "encouragement": ""}
    except Exception as exc:
        logger.error("Claude API error (weekly report): %s", exc)
        return _local_weekly_report(checkins, stats)


async def analyse_patterns(checkins: list[dict]) -> str:
    """Deeper pattern analysis across the full check-in history."""
    client = _get_client()
    if client is None:
        return _local_patterns(checkins)

    prompt = _build_patterns_prompt(checkins)
    try:
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1200,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}],
        )
        return response.content[0].text
    except Exception as exc:
        logger.error("Claude API error (patterns): %s", exc)
        return _local_patterns(checkins)


# ---------------------------------------------------------------------------
# Prompt builders
# ---------------------------------------------------------------------------

def _build_insights_prompt(checkins: list[dict], stats: dict) -> str:
    data_summary = _summarise_checkins(checkins)
    return f"""Analyse the following wellness data and provide 3-5 key insights.

STATISTICS (last {stats.get('count', 0)} days):
- Average mood: {stats['avg_mood']}/10
- Average sleep: {stats['avg_sleep']} hours
- Average water intake: {stats['avg_water']} ml
- Average exercise: {stats['avg_exercise']} minutes
- Average screen time: {stats['avg_screen']} hours
- Average stress: {stats['avg_stress']}/10
- Mood trend: {stats['mood_trend']}

RECENT CHECK-INS:
{data_summary}

Please identify correlations between metrics and provide actionable suggestions."""


def _build_weekly_report_prompt(checkins: list[dict], stats: dict) -> str:
    data_summary = _summarise_checkins(checkins)
    return f"""Generate a weekly wellness report as JSON.

STATISTICS:
- Entries: {stats.get('count', 0)}
- Avg mood: {stats['avg_mood']}/10, Avg sleep: {stats['avg_sleep']}h
- Avg water: {stats['avg_water']} ml, Avg exercise: {stats['avg_exercise']} min
- Avg screen time: {stats['avg_screen']}h, Avg stress: {stats['avg_stress']}/10
- Mood trend: {stats['mood_trend']}

CHECK-INS:
{data_summary}

Return JSON with keys: summary (string), highlights (list of strings), patterns (list of strings), suggestions (list of strings), encouragement (string)."""


def _build_patterns_prompt(checkins: list[dict]) -> str:
    data_summary = _summarise_checkins(checkins)
    return f"""Perform a deep pattern analysis on the following wellness data.

Look for:
1. Correlations between sleep and mood
2. Impact of exercise minutes on stress and mood
3. Hydration patterns and their relationship to mood/stress
4. Screen time impact on sleep quality and stress
5. Weekly rhythms (weekday vs weekend patterns)
6. Notes sentiment themes

DATA ({len(checkins)} entries):
{data_summary}

Provide a thorough but concise analysis with specific observations."""


def _summarise_checkins(checkins: list[dict]) -> str:
    """Format check-ins into a compact text block for the prompt."""
    if not checkins:
        return "No check-in data available."
    lines = []
    for c in checkins[-14:]:  # Last 14 entries max to conserve tokens
        notes_snippet = (c.get("notes") or "")[:80]
        lines.append(
            f"  {c['date']}: mood={c['mood']}, sleep={c['sleep_hours']}h, "
            f"water={c['water_intake']}ml, exercise={c['exercise_minutes']}min, "
            f"screen={c['screen_time']}h, stress={c['stress']}"
            + (f", notes=\"{notes_snippet}\"" if notes_snippet else "")
        )
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Local rule-based fallback (no API key required)
# ---------------------------------------------------------------------------

def _local_insights(checkins: list[dict], stats: dict) -> str:
    """Generate rule-based insights without calling the Claude API."""
    if not checkins:
        return "📝 No check-in data yet. Start logging your daily wellness to receive personalised insights!"

    insights = []

    # Sleep-mood correlation
    if stats["avg_sleep"] < 6.5:
        insights.append(
            "😴 **Low sleep average** — Your average sleep is below 6.5 hours. "
            "Research suggests 7-9 hours supports better mood and cognitive function. "
            "Consider a consistent bedtime routine."
        )
    elif stats["avg_sleep"] >= 7.5:
        insights.append(
            "🌙 **Great sleep habits!** — Averaging {:.1f} hours of sleep is excellent. "
            "Keep it up!".format(stats["avg_sleep"])
        )

    # Hydration
    if stats["avg_water"] < 1000:
        insights.append(
            "💧 **Low hydration** — Averaging only {:.0f} ml of water per day. "
            "Aim for 2000 ml to support concentration and mood.".format(stats["avg_water"])
        )
    elif stats["avg_water"] >= 2000:
        insights.append(
            "💧 **Great hydration!** — Averaging {:.0f} ml per day is excellent. "
            "Staying hydrated supports focus and wellbeing.".format(stats["avg_water"])
        )

    # Stress check
    if stats["avg_stress"] >= 7:
        insights.append(
            "🧘 **High stress detected** — Your average stress is {}/10. "
            "Consider incorporating short breathing exercises or mindful breaks. "
            "If stress persists, speaking with a professional can help.".format(stats["avg_stress"])
        )
    elif stats["avg_stress"] <= 3:
        insights.append(
            "✨ **Low stress levels** — Great job managing stress! "
            "Your average of {}/10 shows effective coping.".format(stats["avg_stress"])
        )

    # Exercise
    if stats["avg_exercise"] < 15:
        insights.append(
            "🏃 **Exercise opportunity** — Averaging only {:.0f} minutes of exercise per day. "
            "Even 20 minutes of walking can boost mood and reduce stress.".format(stats["avg_exercise"])
        )
    elif stats["avg_exercise"] >= 30:
        insights.append(
            "💪 **Active lifestyle!** — Averaging {:.0f} minutes of exercise daily is fantastic. "
            "Physical activity is strongly linked to better mood and lower stress.".format(stats["avg_exercise"])
        )

    # Screen time
    if stats["avg_screen"] > 8:
        insights.append(
            "📱 **High screen time** — Averaging {:.1f} hours daily. "
            "Consider setting screen-free periods, especially before bedtime, "
            "as excessive screen time can impact sleep quality.".format(stats["avg_screen"])
        )

    # Mood trend
    if stats["mood_trend"] == "improving":
        insights.append("📈 **Mood trending up** — Your recent mood scores are improving. Whatever you're doing, keep it up!")
    elif stats["mood_trend"] == "declining":
        insights.append(
            "📉 **Mood dipping** — Your mood has trended downward recently. "
            "Review your sleep and stress patterns for possible causes. "
            "Consider reaching out to a support network or professional if this continues."
        )

    if not insights:
        insights.append(
            "👍 **Looking good!** — Your wellness metrics are well balanced. "
            "Keep tracking to spot long-term patterns."
        )

    disclaimer = "\n\n---\n*These observations are based on your self-reported data and are not medical advice. " \
                 "If you have health concerns, please consult a qualified professional.*"

    return "\n\n".join(insights) + disclaimer


def _local_weekly_report(checkins: list[dict], stats: dict) -> dict:
    """Generate a rule-based weekly report without the Claude API."""
    highlights = []
    patterns = []
    suggestions = []

    if stats["avg_mood"] >= 7:
        highlights.append("Your average mood was a strong {}/10 this period.".format(stats["avg_mood"]))
    if stats["avg_sleep"] >= 7:
        highlights.append("Great sleep consistency at {:.1f} hours average.".format(stats["avg_sleep"]))
    if stats["avg_water"] >= 2000:
        highlights.append("Excellent hydration at {:.0f} ml per day.".format(stats["avg_water"]))
    if stats["avg_exercise"] >= 30:
        highlights.append("Active lifestyle with {:.0f} minutes of daily exercise.".format(stats["avg_exercise"]))

    if stats["avg_stress"] > 6 and stats["avg_sleep"] < 7:
        patterns.append("High stress may be linked to lower sleep duration.")
    if stats["avg_exercise"] > 30 and stats["avg_mood"] > 6:
        patterns.append("Your exercise habit correlates with above-average mood scores.")
    if stats["avg_screen"] > 6 and stats["avg_sleep"] < 7:
        patterns.append("High screen time may be impacting sleep quality.")
    if stats["avg_water"] < 1000 and stats["avg_stress"] > 5:
        patterns.append("Low hydration may be contributing to higher stress levels.")

    if stats["avg_sleep"] < 7:
        suggestions.append("Aim for 7+ hours of sleep by setting a consistent bedtime.")
    if stats["avg_exercise"] < 20:
        suggestions.append("Try adding a 20-minute walk on low-exercise days.")
    if stats["avg_stress"] > 6:
        suggestions.append("Explore stress-reduction techniques like deep breathing or journalling.")
    if stats["avg_water"] < 1500:
        suggestions.append("Set reminders to drink water throughout the day — aim for 2000 ml.")
    if stats["avg_screen"] > 8:
        suggestions.append("Consider reducing screen time, especially in the hour before bed.")

    if not highlights:
        highlights.append("You showed up and tracked your wellness — that's a win!")
    if not patterns:
        patterns.append("Continue tracking for more pattern insights over time.")
    if not suggestions:
        suggestions.append("Maintain your current healthy habits!")

    return {
        "summary": "Weekly wellness summary based on {} check-ins. Average mood: {}/10, sleep: {:.1f}h, stress: {}/10.".format(
            stats["count"], stats["avg_mood"], stats["avg_sleep"], stats["avg_stress"]
        ),
        "highlights": highlights,
        "patterns": patterns,
        "suggestions": suggestions,
        "encouragement": "Every day you check in is a step toward better self-awareness. Keep going! 🌟",
    }


def _local_patterns(checkins: list[dict]) -> str:
    """Generate rule-based pattern analysis without the Claude API."""
    if len(checkins) < 3:
        return "📊 Need at least 3 check-ins for meaningful pattern analysis. Keep tracking!"

    # Compute simple correlations
    observations = []
    n = len(checkins)

    # Sleep-mood
    high_sleep = [c for c in checkins if c["sleep_hours"] >= 7]
    low_sleep = [c for c in checkins if c["sleep_hours"] < 7]
    if high_sleep and low_sleep:
        avg_mood_hs = sum(c["mood"] for c in high_sleep) / len(high_sleep)
        avg_mood_ls = sum(c["mood"] for c in low_sleep) / len(low_sleep)
        if avg_mood_hs - avg_mood_ls > 1:
            observations.append(
                f"🌙 **Sleep → Mood**: Days with 7+ hours of sleep show an average mood of "
                f"{avg_mood_hs:.1f} vs {avg_mood_ls:.1f} on shorter nights."
            )

    # Exercise-mood
    ex_days = [c for c in checkins if c.get("exercise_minutes", 0) >= 20]
    no_ex = [c for c in checkins if c.get("exercise_minutes", 0) < 20]
    if ex_days and no_ex:
        avg_mood_ex = sum(c["mood"] for c in ex_days) / len(ex_days)
        avg_mood_ne = sum(c["mood"] for c in no_ex) / len(no_ex)
        if avg_mood_ex - avg_mood_ne > 0.5:
            observations.append(
                f"🏃 **Exercise → Mood**: Days with 20+ min exercise average mood {avg_mood_ex:.1f} vs "
                f"{avg_mood_ne:.1f} on less active days."
            )

    # Exercise-stress
    if ex_days and no_ex:
        avg_stress_ex = sum(c["stress"] for c in ex_days) / len(ex_days)
        avg_stress_ne = sum(c["stress"] for c in no_ex) / len(no_ex)
        if avg_stress_ne - avg_stress_ex > 0.5:
            observations.append(
                f"💪 **Exercise → Stress**: Stress averages {avg_stress_ex:.1f} on active days vs "
                f"{avg_stress_ne:.1f} on less active days."
            )

    # Hydration-mood
    high_water = [c for c in checkins if c.get("water_intake", 0) >= 2000]
    low_water = [c for c in checkins if c.get("water_intake", 0) < 2000]
    if high_water and low_water:
        avg_mood_hw = sum(c["mood"] for c in high_water) / len(high_water)
        avg_mood_lw = sum(c["mood"] for c in low_water) / len(low_water)
        if avg_mood_hw - avg_mood_lw > 0.5:
            observations.append(
                f"💧 **Hydration → Mood**: Days with 2000+ ml of water show mood {avg_mood_hw:.1f} vs "
                f"{avg_mood_lw:.1f} on lower-hydration days."
            )

    # Screen time-sleep
    high_screen = [c for c in checkins if c.get("screen_time", 0) >= 6]
    low_screen = [c for c in checkins if c.get("screen_time", 0) < 6]
    if high_screen and low_screen:
        avg_sleep_hs = sum(c["sleep_hours"] for c in high_screen) / len(high_screen)
        avg_sleep_ls = sum(c["sleep_hours"] for c in low_screen) / len(low_screen)
        if avg_sleep_ls - avg_sleep_hs > 0.5:
            observations.append(
                f"📱 **Screen Time → Sleep**: High screen time days average {avg_sleep_hs:.1f}h sleep vs "
                f"{avg_sleep_ls:.1f}h on lower screen time days."
            )

    # Best and worst days
    best = max(checkins, key=lambda c: c["mood"])
    worst = min(checkins, key=lambda c: c["mood"])
    observations.append(
        f"📅 **Best day**: {best['date']} (mood {best['mood']}/10, sleep {best['sleep_hours']}h, stress {best['stress']}/10)"
    )
    observations.append(
        f"📅 **Toughest day**: {worst['date']} (mood {worst['mood']}/10, sleep {worst['sleep_hours']}h, stress {worst['stress']}/10)"
    )

    if not observations:
        observations.append("Keep tracking — more data will reveal clearer patterns! 📊")

    disclaimer = "\n\n---\n*Pattern analysis is based on self-reported data and is not medical advice.*"
    return "\n\n".join(observations) + disclaimer
