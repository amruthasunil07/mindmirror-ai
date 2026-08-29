# 🪞 MindMirror AI

**Personal Wellness Tracker with AI-Powered Insights**

MindMirror AI helps you track daily mood, sleep, water intake, exercise, screen time, and stress — then uses Claude AI to discover patterns and provide actionable wellness suggestions.

> ⚠️ **Disclaimer**: MindMirror AI is a self-awareness tool, not a medical device. It does not diagnose diseases, predict medical conditions, prescribe medication, or provide medical treatment. If you have health concerns, please consult a qualified professional.

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| **Daily Check-in** | Log mood, sleep, water intake, exercise minutes, screen time, stress, and journal entries |
| **Dashboard** | At-a-glance view of your wellness averages and trends |
| **Trends** | Interactive Chart.js visualisations (7 / 30 / 90 / 365 days) |
| **AI Insights** | Claude-powered pattern analysis and wellness suggestions |
| **Pattern Explorer** | Deep correlation analysis across your full history |
| **Weekly Report** | Structured weekly summary with highlights and suggestions |
| **Local Fallback** | Rule-based analysis works even without an API key |

## 🛠️ Tech Stack

- **Backend**: Python 3.10+, FastAPI, SQLite (aiosqlite)
- **AI**: Anthropic Claude API (claude-sonnet-4-20250514)
- **Frontend**: Vanilla HTML/CSS/JS, Chart.js 4
- **Design**: Premium glassmorphism UI with dark theme

---

## 🚀 Quick Start

### 1. Clone & install

```bash
git clone <your-repo-url>
cd mindmirror-ai
pip install -r requirements.txt
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY (optional)
```

### 3. Run

```bash
python -m uvicorn app.main:app --reload
```

Open **http://localhost:8000** in your browser.

---

## 📁 Project Structure

```
mindmirror-ai/
├── app/
│   ├── __init__.py
│   ├── main.py          # FastAPI routes & app
│   ├── database.py      # SQLite models & queries
│   ├── claude.py         # Claude AI integration + fallback
│   └── static/
│       ├── index.html    # Single-page HTML
│       ├── css/
│       │   └── styles.css # Glassmorphism design system
│       └── js/
│           ├── app.js     # Client-side logic
│           └── charts.js  # Chart.js rendering
├── data/                 # SQLite database (auto-created)
├── requirements.txt
├── README.md
├── .gitignore
└── .env.example
```

## 🔑 Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | No | Enables Claude AI insights. Without it, the app uses local rule-based analysis. |
| `DATABASE_PATH` | No | SQLite database location (default: `data/mindmirror.db`) |

---

## 📜 License

MIT
