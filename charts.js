/* =========================================================
   MindMirror AI — Chart Rendering Module
   Chart.js configuration and rendering for dashboard & trends.
   ========================================================= */

// ---------------------------------------------------------------------------
// Shared chart defaults
// ---------------------------------------------------------------------------
function chartDefaults(titleText, compact) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
            title: titleText ? { display: true, text: titleText, color: '#f0eef6', font: { size: 14, weight: 600 } } : { display: false },
            legend: {
                labels: {
                    color: '#a8a3c0',
                    usePointStyle: true,
                    pointStyle: 'circle',
                    padding: 16,
                    font: { size: compact ? 11 : 12 },
                },
            },
            tooltip: {
                backgroundColor: 'rgba(15,12,41,0.9)',
                titleColor: '#f0eef6',
                bodyColor: '#a8a3c0',
                borderColor: 'rgba(255,255,255,0.1)',
                borderWidth: 1,
                cornerRadius: 10,
                padding: 12,
            },
        },
        scales: {
            x: {
                grid: { color: 'rgba(255,255,255,0.04)' },
                ticks: { color: '#a8a3c0', font: { size: compact ? 10 : 11 }, maxRotation: 45 },
            },
            y: {
                min: 0, max: 10,
                grid: { color: 'rgba(255,255,255,0.04)' },
                ticks: { color: '#a8a3c0', stepSize: 2 },
            },
        },
    };
}

// ---------------------------------------------------------------------------
// Dashboard mini chart (Mood & Stress)
// ---------------------------------------------------------------------------
function renderMiniChart(checkins) {
    const ctx = document.getElementById('mini-chart');
    if (!ctx) return;

    const labels = checkins.map(c => formatDateShort(c.date));
    const config = {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Mood',
                    data: checkins.map(c => c.mood),
                    borderColor: '#7c5cfc',
                    backgroundColor: 'rgba(124,92,252,0.1)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 2,
                    pointHoverRadius: 5,
                    borderWidth: 2,
                },
                {
                    label: 'Stress',
                    data: checkins.map(c => c.stress),
                    borderColor: '#ff6b6b',
                    backgroundColor: 'rgba(255,107,107,0.05)',
                    fill: false,
                    tension: 0.4,
                    pointRadius: 2,
                    pointHoverRadius: 5,
                    borderWidth: 2,
                },
            ],
        },
        options: chartDefaults('Mood & Stress — Last 30 Days', true),
    };

    if (window._miniChart) window._miniChart.destroy();
    window._miniChart = new Chart(ctx, config);
}

// ---------------------------------------------------------------------------
// Trends chart (all 6 metrics)
// ---------------------------------------------------------------------------
function renderTrendChart(data) {
    const ctx = document.getElementById('trends-chart');
    if (!ctx) return;

    const labels = data.labels.map(formatDateShort);

    const config = {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Mood',
                    data: data.mood,
                    borderColor: '#7c5cfc',
                    backgroundColor: 'rgba(124,92,252,0.08)',
                    fill: true,
                    tension: 0.4,
                    borderWidth: 2.5,
                    pointRadius: 3,
                    pointHoverRadius: 6,
                    pointBackgroundColor: '#7c5cfc',
                },
                {
                    label: 'Stress',
                    data: data.stress,
                    borderColor: '#ff6b6b',
                    backgroundColor: 'rgba(255,107,107,0.05)',
                    fill: false,
                    tension: 0.4,
                    borderWidth: 2,
                    pointRadius: 3,
                    pointHoverRadius: 6,
                    pointBackgroundColor: '#ff6b6b',
                },
                {
                    label: 'Sleep (h)',
                    data: data.sleep,
                    borderColor: '#00e6a0',
                    backgroundColor: 'rgba(0,230,160,0.05)',
                    fill: false,
                    tension: 0.4,
                    borderWidth: 2,
                    pointRadius: 3,
                    pointHoverRadius: 6,
                    pointBackgroundColor: '#00e6a0',
                    yAxisID: 'y1',
                },
                {
                    label: 'Water (ml)',
                    data: data.water,
                    borderColor: '#00d4ff',
                    backgroundColor: 'rgba(0,212,255,0.05)',
                    fill: false,
                    tension: 0.4,
                    borderWidth: 2,
                    pointRadius: 3,
                    pointHoverRadius: 6,
                    pointBackgroundColor: '#00d4ff',
                    yAxisID: 'y2',
                    hidden: true,
                },
                {
                    label: 'Exercise (min)',
                    data: data.exercise,
                    borderColor: '#ffa726',
                    backgroundColor: 'rgba(255,167,38,0.05)',
                    fill: false,
                    tension: 0.4,
                    borderWidth: 2,
                    pointRadius: 3,
                    pointHoverRadius: 6,
                    pointBackgroundColor: '#ffa726',
                    yAxisID: 'y2',
                    hidden: true,
                },
                {
                    label: 'Screen (h)',
                    data: data.screen,
                    borderColor: '#e040fb',
                    backgroundColor: 'rgba(224,64,251,0.05)',
                    fill: false,
                    tension: 0.4,
                    borderWidth: 2,
                    pointRadius: 3,
                    pointHoverRadius: 6,
                    pointBackgroundColor: '#e040fb',
                    yAxisID: 'y1',
                    hidden: true,
                },
            ],
        },
        options: {
            ...chartDefaults('', false),
            scales: {
                x: {
                    grid: { color: 'rgba(255,255,255,0.04)' },
                    ticks: { color: '#a8a3c0', font: { size: 11 } },
                },
                y: {
                    min: 0, max: 10,
                    grid: { color: 'rgba(255,255,255,0.04)' },
                    ticks: { color: '#a8a3c0', stepSize: 2 },
                    title: { display: true, text: 'Score (1-10)', color: '#6b6588' },
                },
                y1: {
                    position: 'right',
                    min: 0, max: 14,
                    grid: { drawOnChartArea: false },
                    ticks: { color: '#00e6a0', stepSize: 2 },
                    title: { display: true, text: 'Hours', color: '#6b6588' },
                },
                y2: {
                    display: false,
                },
            },
        },
    };

    if (state.trendChart) state.trendChart.destroy();
    state.trendChart = new Chart(ctx, config);
}
