/* =========================================================
   MindMirror AI — Client-side Application
   Navigation, data loading, form handling, and UI helpers.
   Chart rendering is in charts.js.

   Data persistence: localStorage (Netlify-compatible).
   AI features: Netlify Function (/.netlify/functions/ai)
                with client-side fallback analysis.
   ========================================================= */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const STORAGE_KEY = 'mindmirror_checkins';
const REPORTS_KEY = 'mindmirror_reports';
const AI_FUNCTION_URL = '/.netlify/functions/ai';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const state = {
    currentPage: 'dashboard',
    dashboardData: null,
    trendsData: null,
    insightsData: null,
    patternsData: null,
    weeklyReport: null,
    trendChart: null,
    trendRange: 30,
};

// ---------------------------------------------------------------------------
// localStorage Data Layer
// ---------------------------------------------------------------------------
function dbGetAll() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch { return []; }
}

function dbSaveAll(checkins) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(checkins));
}

function dbSaveCheckin(data) {
    const checkins = dbGetAll();
    const idx = checkins.findIndex(c => c.date === data.date);
    const entry = {
        date: data.date,
        mood: parseInt(data.mood),
        sleep_hours: parseFloat(data.sleep_hours),
        water_intake: parseInt(data.water_intake) || 0,
        exercise_minutes: parseInt(data.exercise_minutes) || 0,
        screen_time: parseFloat(data.screen_time) || 0,
        stress: parseInt(data.stress),
        notes: data.notes || '',
        created_at: new Date().toISOString(),
    };
    if (idx >= 0) {
        checkins[idx] = entry;
    } else {
        checkins.push(entry);
    }
    checkins.sort((a, b) => a.date.localeCompare(b.date));
    dbSaveAll(checkins);
    return entry;
}

function dbGetCheckin(dateStr) {
    return dbGetAll().find(c => c.date === dateStr) || null;
}

function dbGetRecent(days) {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    const startStr = start.toISOString().split('T')[0];
    const endStr = end.toISOString().split('T')[0];
    return dbGetAll().filter(c => c.date >= startStr && c.date <= endStr);
}

function dbGetRange(startStr, endStr) {
    return dbGetAll().filter(c => c.date >= startStr && c.date <= endStr);
}

function dbGetStats(days) {
    const checkins = dbGetRecent(days);
    if (!checkins.length) {
        return {
            count: 0, avg_mood: 0, avg_sleep: 0, avg_water: 0,
            avg_exercise: 0, avg_screen: 0, avg_stress: 0,
            mood_trend: 'neutral',
        };
    }
    const n = checkins.length;
    const avg = (arr, key) => Math.round((arr.reduce((s, c) => s + (c[key] || 0), 0) / n) * 10) / 10;

    let mood_trend = 'insufficient_data';
    if (n >= 14) {
        const recent = checkins.slice(-7).reduce((s, c) => s + c.mood, 0) / 7;
        const earlier = checkins.slice(-14, -7).reduce((s, c) => s + c.mood, 0) / 7;
        if (recent - earlier > 0.5) mood_trend = 'improving';
        else if (earlier - recent > 0.5) mood_trend = 'declining';
        else mood_trend = 'stable';
    }

    return {
        count: n,
        avg_mood: avg(checkins, 'mood'),
        avg_sleep: avg(checkins, 'sleep_hours'),
        avg_water: avg(checkins, 'water_intake'),
        avg_exercise: avg(checkins, 'exercise_minutes'),
        avg_screen: avg(checkins, 'screen_time'),
        avg_stress: avg(checkins, 'stress'),
        mood_trend,
    };
}

function dbGetTrends(days) {
    const checkins = dbGetRecent(days);
    return {
        labels: checkins.map(c => c.date),
        mood: checkins.map(c => c.mood),
        sleep: checkins.map(c => c.sleep_hours),
        water: checkins.map(c => c.water_intake),
        exercise: checkins.map(c => c.exercise_minutes),
        screen: checkins.map(c => c.screen_time),
        stress: checkins.map(c => c.stress),
    };
}

function dbSaveReport(weekStart, weekEnd, report) {
    try {
        const reports = JSON.parse(localStorage.getItem(REPORTS_KEY) || '[]');
        reports.push({ week_start: weekStart, week_end: weekEnd, report_json: report, created_at: new Date().toISOString() });
        localStorage.setItem(REPORTS_KEY, JSON.stringify(reports));
    } catch {}
}

// ---------------------------------------------------------------------------
// Local Fallback AI (ported from Python claude.py)
// ---------------------------------------------------------------------------
function localInsights(checkins, stats) {
    if (!checkins.length) {
        return '📝 No check-in data yet. Start logging your daily wellness to receive personalised insights!';
    }
    const insights = [];

    if (stats.avg_sleep < 6.5) {
        insights.push(
            '😴 **Low sleep average** — Your average sleep is below 6.5 hours. ' +
            'Research suggests 7-9 hours supports better mood and cognitive function. ' +
            'Consider a consistent bedtime routine.'
        );
    } else if (stats.avg_sleep >= 7.5) {
        insights.push(
            `🌙 **Great sleep habits!** — Averaging ${stats.avg_sleep.toFixed(1)} hours of sleep is excellent. Keep it up!`
        );
    }

    if (stats.avg_water < 1000) {
        insights.push(
            `💧 **Low hydration** — Averaging only ${Math.round(stats.avg_water)} ml of water per day. ` +
            'Aim for 2000 ml to support concentration and mood.'
        );
    } else if (stats.avg_water >= 2000) {
        insights.push(
            `💧 **Great hydration!** — Averaging ${Math.round(stats.avg_water)} ml per day is excellent. ` +
            'Staying hydrated supports focus and wellbeing.'
        );
    }

    if (stats.avg_stress >= 7) {
        insights.push(
            `🧘 **High stress detected** — Your average stress is ${stats.avg_stress}/10. ` +
            'Consider incorporating short breathing exercises or mindful breaks. ' +
            'If stress persists, speaking with a professional can help.'
        );
    } else if (stats.avg_stress <= 3) {
        insights.push(
            `✨ **Low stress levels** — Great job managing stress! ` +
            `Your average of ${stats.avg_stress}/10 shows effective coping.`
        );
    }

    if (stats.avg_exercise < 15) {
        insights.push(
            `🏃 **Exercise opportunity** — Averaging only ${Math.round(stats.avg_exercise)} minutes of exercise per day. ` +
            'Even 20 minutes of walking can boost mood and reduce stress.'
        );
    } else if (stats.avg_exercise >= 30) {
        insights.push(
            `💪 **Active lifestyle!** — Averaging ${Math.round(stats.avg_exercise)} minutes of exercise daily is fantastic. ` +
            'Physical activity is strongly linked to better mood and lower stress.'
        );
    }

    if (stats.avg_screen > 8) {
        insights.push(
            `📱 **High screen time** — Averaging ${stats.avg_screen.toFixed(1)} hours daily. ` +
            'Consider setting screen-free periods, especially before bedtime, ' +
            'as excessive screen time can impact sleep quality.'
        );
    }

    if (stats.mood_trend === 'improving') {
        insights.push('📈 **Mood trending up** — Your recent mood scores are improving. Whatever you\'re doing, keep it up!');
    } else if (stats.mood_trend === 'declining') {
        insights.push(
            '📉 **Mood dipping** — Your mood has trended downward recently. ' +
            'Review your sleep and stress patterns for possible causes. ' +
            'Consider reaching out to a support network or professional if this continues.'
        );
    }

    if (!insights.length) {
        insights.push('👍 **Looking good!** — Your wellness metrics are well balanced. Keep tracking to spot long-term patterns.');
    }

    const disclaimer = '\n\n---\n*These observations are based on your self-reported data and are not medical advice. ' +
        'If you have health concerns, please consult a qualified professional.*';

    return insights.join('\n\n') + disclaimer;
}

function localPatterns(checkins) {
    if (checkins.length < 3) {
        return '📊 Need at least 3 check-ins for meaningful pattern analysis. Keep tracking!';
    }
    const observations = [];

    const highSleep = checkins.filter(c => c.sleep_hours >= 7);
    const lowSleep = checkins.filter(c => c.sleep_hours < 7);
    if (highSleep.length && lowSleep.length) {
        const avgHS = highSleep.reduce((s, c) => s + c.mood, 0) / highSleep.length;
        const avgLS = lowSleep.reduce((s, c) => s + c.mood, 0) / lowSleep.length;
        if (avgHS - avgLS > 1) {
            observations.push(
                `🌙 **Sleep → Mood**: Days with 7+ hours of sleep show an average mood of ${avgHS.toFixed(1)} vs ${avgLS.toFixed(1)} on shorter nights.`
            );
        }
    }

    const exDays = checkins.filter(c => (c.exercise_minutes || 0) >= 20);
    const noEx = checkins.filter(c => (c.exercise_minutes || 0) < 20);
    if (exDays.length && noEx.length) {
        const avgEx = exDays.reduce((s, c) => s + c.mood, 0) / exDays.length;
        const avgNe = noEx.reduce((s, c) => s + c.mood, 0) / noEx.length;
        if (avgEx - avgNe > 0.5) {
            observations.push(
                `🏃 **Exercise → Mood**: Days with 20+ min exercise average mood ${avgEx.toFixed(1)} vs ${avgNe.toFixed(1)} on less active days.`
            );
        }
    }

    if (exDays.length && noEx.length) {
        const avgStressEx = exDays.reduce((s, c) => s + c.stress, 0) / exDays.length;
        const avgStressNe = noEx.reduce((s, c) => s + c.stress, 0) / noEx.length;
        if (avgStressNe - avgStressEx > 0.5) {
            observations.push(
                `💪 **Exercise → Stress**: Stress averages ${avgStressEx.toFixed(1)} on active days vs ${avgStressNe.toFixed(1)} on less active days.`
            );
        }
    }

    const highWater = checkins.filter(c => (c.water_intake || 0) >= 2000);
    const lowWater = checkins.filter(c => (c.water_intake || 0) < 2000);
    if (highWater.length && lowWater.length) {
        const avgHW = highWater.reduce((s, c) => s + c.mood, 0) / highWater.length;
        const avgLW = lowWater.reduce((s, c) => s + c.mood, 0) / lowWater.length;
        if (avgHW - avgLW > 0.5) {
            observations.push(
                `💧 **Hydration → Mood**: Days with 2000+ ml of water show mood ${avgHW.toFixed(1)} vs ${avgLW.toFixed(1)} on lower-hydration days.`
            );
        }
    }

    const highScreen = checkins.filter(c => (c.screen_time || 0) >= 6);
    const lowScreen = checkins.filter(c => (c.screen_time || 0) < 6);
    if (highScreen.length && lowScreen.length) {
        const avgSHS = highScreen.reduce((s, c) => s + c.sleep_hours, 0) / highScreen.length;
        const avgSLS = lowScreen.reduce((s, c) => s + c.sleep_hours, 0) / lowScreen.length;
        if (avgSLS - avgSHS > 0.5) {
            observations.push(
                `📱 **Screen Time → Sleep**: High screen time days average ${avgSHS.toFixed(1)}h sleep vs ${avgSLS.toFixed(1)}h on lower screen time days.`
            );
        }
    }

    const best = checkins.reduce((a, b) => b.mood > a.mood ? b : a);
    const worst = checkins.reduce((a, b) => b.mood < a.mood ? b : a);
    observations.push(
        `📅 **Best day**: ${best.date} (mood ${best.mood}/10, sleep ${best.sleep_hours}h, stress ${best.stress}/10)`
    );
    observations.push(
        `📅 **Toughest day**: ${worst.date} (mood ${worst.mood}/10, sleep ${worst.sleep_hours}h, stress ${worst.stress}/10)`
    );

    if (!observations.length) {
        observations.push('Keep tracking — more data will reveal clearer patterns! 📊');
    }

    const disclaimer = '\n\n---\n*Pattern analysis is based on self-reported data and is not medical advice.*';
    return observations.join('\n\n') + disclaimer;
}

function localWeeklyReport(checkins, stats) {
    const highlights = [];
    const patterns = [];
    const suggestions = [];

    if (stats.avg_mood >= 7) highlights.push(`Your average mood was a strong ${stats.avg_mood}/10 this period.`);
    if (stats.avg_sleep >= 7) highlights.push(`Great sleep consistency at ${stats.avg_sleep.toFixed(1)} hours average.`);
    if (stats.avg_water >= 2000) highlights.push(`Excellent hydration at ${Math.round(stats.avg_water)} ml per day.`);
    if (stats.avg_exercise >= 30) highlights.push(`Active lifestyle with ${Math.round(stats.avg_exercise)} minutes of daily exercise.`);

    if (stats.avg_stress > 6 && stats.avg_sleep < 7) patterns.push('High stress may be linked to lower sleep duration.');
    if (stats.avg_exercise > 30 && stats.avg_mood > 6) patterns.push('Your exercise habit correlates with above-average mood scores.');
    if (stats.avg_screen > 6 && stats.avg_sleep < 7) patterns.push('High screen time may be impacting sleep quality.');
    if (stats.avg_water < 1000 && stats.avg_stress > 5) patterns.push('Low hydration may be contributing to higher stress levels.');

    if (stats.avg_sleep < 7) suggestions.push('Aim for 7+ hours of sleep by setting a consistent bedtime.');
    if (stats.avg_exercise < 20) suggestions.push('Try adding a 20-minute walk on low-exercise days.');
    if (stats.avg_stress > 6) suggestions.push('Explore stress-reduction techniques like deep breathing or journalling.');
    if (stats.avg_water < 1500) suggestions.push('Set reminders to drink water throughout the day — aim for 2000 ml.');
    if (stats.avg_screen > 8) suggestions.push('Consider reducing screen time, especially in the hour before bed.');

    if (!highlights.length) highlights.push("You showed up and tracked your wellness — that's a win!");
    if (!patterns.length) patterns.push('Continue tracking for more pattern insights over time.');
    if (!suggestions.length) suggestions.push('Maintain your current healthy habits!');

    return {
        summary: `Weekly wellness summary based on ${stats.count} check-ins. Average mood: ${stats.avg_mood}/10, sleep: ${stats.avg_sleep.toFixed(1)}h, stress: ${stats.avg_stress}/10.`,
        highlights,
        patterns,
        suggestions,
        encouragement: 'Every day you check in is a step toward better self-awareness. Keep going! 🌟',
    };
}

// ---------------------------------------------------------------------------
// AI API Helper (Netlify Function with local fallback)
// ---------------------------------------------------------------------------
async function fetchAI(action, body) {
    try {
        const res = await fetch(`${AI_FUNCTION_URL}?action=${action}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (res.ok) {
            const data = await res.json();
            // If the function says to use local, fall back
            if (data.source === 'local') return null;
            return data;
        }
    } catch {}
    return null; // Fall back to local
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------
function initNav() {
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const page = tab.dataset.page;
            navigateTo(page);
            // Close mobile menu
            document.querySelector('.nav-tabs').classList.remove('open');
        });
    });
    // Hamburger
    const hamburger = document.querySelector('.hamburger');
    if (hamburger) {
        hamburger.addEventListener('click', () => {
            document.querySelector('.nav-tabs').classList.toggle('open');
        });
    }
}

function navigateTo(page) {
    state.currentPage = page;
    // Update tabs
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    const active = document.querySelector(`.nav-tab[data-page="${page}"]`);
    if (active) active.classList.add('active');
    // Update pages
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const target = document.getElementById(`page-${page}`);
    if (target) target.classList.add('active');
    // Load data
    switch (page) {
        case 'dashboard':  loadDashboard(); break;
        case 'checkin':    loadCheckinForm(); break;
        case 'trends':     loadTrends(); break;
        case 'insights':   loadInsights(); break;
        case 'patterns':   loadPatterns(); break;
        case 'report':     loadWeeklyReport(); break;
    }
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
async function loadDashboard() {
    const container = document.getElementById('dashboard-stats');
    const chartBox = document.getElementById('dashboard-chart');
    container.innerHTML = skeletonStats();

    try {
        const stats = dbGetStats(30);
        const checkins = dbGetRecent(30);
        state.dashboardData = { stats, checkins };

        if (stats.count === 0) {
            container.innerHTML = emptyState('📊', 'No data yet', 'Complete your first check-in to see your dashboard.');
            chartBox.innerHTML = '';
            return;
        }

        const s = stats;
        const trendIcon = s.mood_trend === 'improving' ? '↑' : s.mood_trend === 'declining' ? '↓' : '→';
        const trendClass = s.mood_trend === 'improving' ? 'up' : s.mood_trend === 'declining' ? 'down' : 'neutral';

        container.innerHTML = `
            <div class="glass-card stat-card">
                <span class="stat-icon">😊</span>
                <div class="stat-value">${s.avg_mood}</div>
                <div class="stat-label">Avg Mood</div>
                <div class="stat-trend ${trendClass}">${trendIcon} ${s.mood_trend.replace('_', ' ')}</div>
            </div>
            <div class="glass-card stat-card">
                <span class="stat-icon">🌙</span>
                <div class="stat-value">${s.avg_sleep}</div>
                <div class="stat-label">Avg Sleep (h)</div>
            </div>
            <div class="glass-card stat-card">
                <span class="stat-icon">💧</span>
                <div class="stat-value">${s.avg_water}</div>
                <div class="stat-label">Avg Water (ml)</div>
            </div>
            <div class="glass-card stat-card">
                <span class="stat-icon">💪</span>
                <div class="stat-value">${s.avg_exercise}</div>
                <div class="stat-label">Avg Exercise (min)</div>
            </div>
            <div class="glass-card stat-card">
                <span class="stat-icon">📱</span>
                <div class="stat-value">${s.avg_screen}</div>
                <div class="stat-label">Avg Screen (h)</div>
            </div>
            <div class="glass-card stat-card">
                <span class="stat-icon">🧘</span>
                <div class="stat-value">${s.avg_stress}</div>
                <div class="stat-label">Avg Stress</div>
            </div>
        `;

        // Mini chart (defined in charts.js)
        renderMiniChart(checkins);
    } catch (err) {
        container.innerHTML = errorState('Failed to load dashboard');
        console.error(err);
    }
}

// ---------------------------------------------------------------------------
// Check-in Form
// ---------------------------------------------------------------------------
function loadCheckinForm() {
    const today = new Date().toISOString().split('T')[0];
    const dateInput = document.getElementById('checkin-date');
    if (dateInput) dateInput.value = today;

    // Try to load today's check-in
    const data = dbGetCheckin(today);
    if (data) {
        populateForm(data);
        showToast('Loaded today\'s check-in', 'info');
    }
}

function populateForm(data) {
    setSlider('mood', data.mood);
    setSlider('stress', data.stress);
    const sleep = document.getElementById('sleep-input');
    if (sleep) sleep.value = data.sleep_hours;
    const water = document.getElementById('water-input');
    if (water) water.value = data.water_intake || 0;
    const exercise = document.getElementById('exercise-input');
    if (exercise) exercise.value = data.exercise_minutes || 0;
    const screen = document.getElementById('screen-input');
    if (screen) screen.value = data.screen_time || 0;
    const journal = document.getElementById('journal-input');
    if (journal) journal.value = data.notes || '';
}

function setSlider(name, value) {
    const slider = document.getElementById(`${name}-slider`);
    const display = document.getElementById(`${name}-value`);
    if (slider) slider.value = value;
    if (display) display.textContent = value;
}

function initSliders() {
    ['mood', 'stress'].forEach(name => {
        const slider = document.getElementById(`${name}-slider`);
        const display = document.getElementById(`${name}-value`);
        if (slider && display) {
            slider.addEventListener('input', () => {
                display.textContent = slider.value;
            });
        }
    });
}

async function submitCheckin() {
    const btn = document.getElementById('checkin-submit');
    btn.classList.add('btn-loading');
    btn.disabled = true;

    const payload = {
        date: document.getElementById('checkin-date').value,
        mood: parseInt(document.getElementById('mood-slider').value),
        sleep_hours: parseFloat(document.getElementById('sleep-input').value),
        water_intake: parseInt(document.getElementById('water-input').value) || 0,
        exercise_minutes: parseInt(document.getElementById('exercise-input').value) || 0,
        screen_time: parseFloat(document.getElementById('screen-input').value) || 0,
        stress: parseInt(document.getElementById('stress-slider').value),
        notes: document.getElementById('journal-input').value.trim(),
    };

    // Basic validation
    if (!payload.date) { showToast('Please select a date', 'error'); resetBtn(btn); return; }
    if (isNaN(payload.sleep_hours) || payload.sleep_hours < 0 || payload.sleep_hours > 24) {
        showToast('Sleep hours must be between 0 and 24', 'error'); resetBtn(btn); return;
    }
    if (payload.water_intake < 0 || payload.water_intake > 5000) {
        showToast('Water intake must be between 0 and 5000 ml', 'error'); resetBtn(btn); return;
    }
    if (payload.exercise_minutes < 0 || payload.exercise_minutes > 300) {
        showToast('Exercise must be between 0 and 300 minutes', 'error'); resetBtn(btn); return;
    }
    if (payload.screen_time < 0 || payload.screen_time > 24) {
        showToast('Screen time must be between 0 and 24 hours', 'error'); resetBtn(btn); return;
    }

    try {
        dbSaveCheckin(payload);
        showToast('Check-in saved! ✨', 'success');
        // Invalidate caches
        state.dashboardData = null;
        state.trendsData = null;
        state.insightsData = null;
        state.patternsData = null;
        state.weeklyReport = null;
    } catch (err) {
        showToast('Failed to save check-in', 'error');
        console.error(err);
    }
    resetBtn(btn);
}

function resetBtn(btn) {
    btn.classList.remove('btn-loading');
    btn.disabled = false;
}

// ---------------------------------------------------------------------------
// Trends
// ---------------------------------------------------------------------------
async function loadTrends() {
    const chartBox = document.getElementById('trends-chart-container');
    chartBox.innerHTML = '<canvas id="trends-chart"></canvas>';

    try {
        const data = dbGetTrends(state.trendRange);
        state.trendsData = data;

        if (!data.labels || data.labels.length === 0) {
            chartBox.innerHTML = emptyState('📈', 'No trend data', 'Add some check-ins to see your trends.');
            return;
        }
        // Render chart (defined in charts.js)
        renderTrendChart(data);
    } catch (err) {
        chartBox.innerHTML = errorState('Failed to load trends');
        console.error(err);
    }
}

function setTrendRange(days) {
    state.trendRange = days;
    document.querySelectorAll('.trend-range-btn').forEach(b => b.classList.remove('active'));
    const active = document.querySelector(`.trend-range-btn[data-days="${days}"]`);
    if (active) active.classList.add('active');
    loadTrends();
}

// ---------------------------------------------------------------------------
// Insights
// ---------------------------------------------------------------------------
async function loadInsights() {
    const container = document.getElementById('insights-content');
    container.innerHTML = skeletonText();

    try {
        const checkins = dbGetRecent(30);
        const stats = dbGetStats(30);

        // Try Netlify Function (Claude AI) first
        let source = 'local';
        let insightsText = '';

        const aiResult = await fetchAI('insights', { checkins: checkins.slice(-14), stats });
        if (aiResult && aiResult.insights) {
            insightsText = aiResult.insights;
            source = 'claude';
        } else {
            insightsText = localInsights(checkins, stats);
        }

        state.insightsData = { insights: insightsText, source };

        const badge = `<span class="source-badge ${source}">${source === 'claude' ? '🤖 Claude AI' : '📐 Local Analysis'}</span>`;

        container.innerHTML = `
            <div class="flex-between mb-2">
                ${badge}
                <button class="btn btn-secondary btn-sm" onclick="refreshInsights()">🔄 Refresh</button>
            </div>
            <div class="insight-content">${formatMarkdown(insightsText)}</div>
        `;
    } catch (err) {
        container.innerHTML = errorState('Failed to load insights');
        console.error(err);
    }
}

async function refreshInsights() {
    state.insightsData = null;
    loadInsights();
}

// ---------------------------------------------------------------------------
// Patterns
// ---------------------------------------------------------------------------
async function loadPatterns() {
    const container = document.getElementById('patterns-content');
    container.innerHTML = skeletonText();

    try {
        const checkins = dbGetAll();

        // Try Netlify Function (Claude AI) first
        let source = 'local';
        let patternsText = '';

        const aiResult = await fetchAI('patterns', { checkins: checkins.slice(-14) });
        if (aiResult && aiResult.patterns) {
            patternsText = aiResult.patterns;
            source = 'claude';
        } else {
            patternsText = localPatterns(checkins);
        }

        state.patternsData = { patterns: patternsText, source };

        const badge = `<span class="source-badge ${source}">${source === 'claude' ? '🤖 Claude AI' : '📐 Local Analysis'}</span>`;

        container.innerHTML = `
            <div class="flex-between mb-2">
                ${badge}
                <button class="btn btn-secondary btn-sm" onclick="refreshPatterns()">🔄 Refresh</button>
            </div>
            <div class="insight-content">${formatMarkdown(patternsText)}</div>
        `;
    } catch (err) {
        container.innerHTML = errorState('Failed to load patterns');
        console.error(err);
    }
}

async function refreshPatterns() {
    state.patternsData = null;
    loadPatterns();
}

// ---------------------------------------------------------------------------
// Weekly Report
// ---------------------------------------------------------------------------
async function loadWeeklyReport() {
    const container = document.getElementById('report-content');
    container.innerHTML = skeletonText();

    try {
        const today = new Date();
        const dayOfWeek = today.getDay();
        const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - mondayOffset);
        const weekStartStr = weekStart.toISOString().split('T')[0];
        const weekEndStr = today.toISOString().split('T')[0];

        const checkins = dbGetRange(weekStartStr, weekEndStr);
        const stats = dbGetStats(7);

        // Try Netlify Function (Claude AI) first
        let report;
        const aiResult = await fetchAI('weekly-report', { checkins: checkins.slice(-14), stats });
        if (aiResult && aiResult.report) {
            report = aiResult.report;
        } else {
            report = localWeeklyReport(checkins, stats);
        }

        // Cache report
        dbSaveReport(weekStartStr, weekEndStr, report);

        state.weeklyReport = { report, week_start: weekStartStr, week_end: weekEndStr };

        container.innerHTML = `
            <div class="mb-2" style="font-size:0.82rem; color:var(--text-muted);">
                Week of ${formatDateShort(weekStartStr)} — ${formatDateShort(weekEndStr)}
            </div>

            <div class="report-section">
                <div class="report-section-title">📋 Summary</div>
                <p style="font-size:0.95rem; line-height:1.7;">${escapeHtml(report.summary || '')}</p>
            </div>

            ${renderReportList('🌟 Highlights', report.highlights)}
            ${renderReportList('🔗 Patterns', report.patterns)}
            ${renderReportList('💡 Suggestions', report.suggestions)}

            ${report.encouragement ? `
                <div class="encouragement-box">${escapeHtml(report.encouragement)}</div>
            ` : ''}
        `;
    } catch (err) {
        container.innerHTML = errorState('Failed to load weekly report');
        console.error(err);
    }
}

function renderReportList(title, items) {
    if (!items || items.length === 0) return '';
    const lis = items.map(i => `<li>${escapeHtml(i)}</li>`).join('');
    return `
        <div class="report-section">
            <div class="report-section-title">${title}</div>
            <ul class="report-list">${lis}</ul>
        </div>
    `;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatDateShort(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatMarkdown(text) {
    if (!text) return '';
    // Simple markdown-like formatting
    return text
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/^- (.+)$/gm, '<li>$1</li>')
        .replace(/(<li>.*<\/li>\n?)+/gs, match => `<ul>${match}</ul>`)
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>')
        .replace(/^(.+)$/m, '<p>$1')
        .replace(/---/g, '<hr>');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3200);
}

function skeletonStats() {
    return Array(6).fill('').map(() => `
        <div class="glass-card stat-card">
            <div class="skeleton skeleton-line" style="width:40px;height:40px;border-radius:50%;margin:0 auto 12px"></div>
            <div class="skeleton skeleton-line" style="width:60%;margin:0 auto"></div>
            <div class="skeleton skeleton-line" style="width:40%;margin:4px auto 0"></div>
        </div>
    `).join('');
}

function skeletonText() {
    return `
        <div style="padding:1rem 0">
            <div class="skeleton skeleton-line" style="width:100%"></div>
            <div class="skeleton skeleton-line" style="width:85%"></div>
            <div class="skeleton skeleton-line" style="width:70%"></div>
            <div class="skeleton skeleton-line" style="width:90%;margin-top:20px"></div>
            <div class="skeleton skeleton-line" style="width:75%"></div>
            <div class="skeleton skeleton-line" style="width:60%"></div>
        </div>
    `;
}

function emptyState(icon, title, text) {
    return `
        <div class="empty-state">
            <span class="empty-state-icon">${icon}</span>
            <div class="empty-state-title">${title}</div>
            <p>${text}</p>
        </div>
    `;
}

function errorState(text) {
    return `
        <div class="empty-state">
            <span class="empty-state-icon">⚠️</span>
            <div class="empty-state-title">Oops!</div>
            <p>${text}</p>
        </div>
    `;
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    initNav();
    initSliders();
    navigateTo('dashboard');

    // Check-in submit
    const submitBtn = document.getElementById('checkin-submit');
    if (submitBtn) submitBtn.addEventListener('click', submitCheckin);

    // Trend range buttons
    document.querySelectorAll('.trend-range-btn').forEach(btn => {
        btn.addEventListener('click', () => setTrendRange(parseInt(btn.dataset.days)));
    });
});
