let prodChart;
const API_ENDPOINT = '/api/data';
const telemetryHistory = [];
let isPaused = false;

const startClock = () => {
    setInterval(() => {
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        
        const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
        document.getElementById("current-time").innerText = timeStr;
        document.getElementById("current-date").innerText = now.toLocaleDateString();
    }, 1000);
};

const initChart = () => {
    const ctx = document.getElementById('productionChart').getContext('2d');
    prodChart = new Chart(ctx, {
        type: 'line', // 折线图 / Line chart
        data: {
            labels: [],
            datasets: [{
                label: 'Production Units',
                borderColor: '#e8b04b',
                backgroundColor: 'rgba(232, 176, 75, 0.12)',
                fill: true,
                tension: 0.35,
                pointRadius: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: false, grid: { color: 'rgba(160, 174, 180, .12)' } },
                x: { grid: { display: false } }
            },
            plugins: { legend: { display: false } }
        }
    });
};

const syncWithBackend = async () => {
    if (isPaused) return;
    try {
        const response = await fetch(API_ENDPOINT, { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        document.getElementById("temp").innerText = data.temperature;
        document.getElementById("energy").innerText = data.energy;
        document.getElementById("production").innerText = data.production.toLocaleString();
        document.getElementById("vibration").innerText = data.vibration.toFixed(2);
        document.getElementById("alert-count").innerText = String(data.alert_count).padStart(2, "0");
        document.getElementById("sample-count").innerText = `SAMPLE ${String(data.sample_id).padStart(4, "0")}`;
        document.getElementById("machine-id").innerText = data.machine_id;
        document.getElementById("last-update").innerText = new Date(data.timestamp).toLocaleTimeString([], { hour12: false });
        
        const statusLabel = document.getElementById("status");
        statusLabel.innerText = data.status_text.replace(/[^\x00-\x7F]/g, '').trim();
        statusLabel.className = `status-val ${data.status_code}`;

        if (prodChart) {
            telemetryHistory.push(data);
            if (telemetryHistory.length > 18) telemetryHistory.shift();
            prodChart.data.labels = telemetryHistory.map((item) => `#${item.sample_id}`);
            prodChart.data.datasets[0].data = telemetryHistory.map((item) => item.production);
            prodChart.update('none');
        }
        document.getElementById('backend-status').innerText = 'Live link';
        document.getElementById('connection-label').innerText = 'SYSTEM LIVE';
        document.getElementById('connection-dot').classList.remove('offline');

    } catch (error) {
        console.error('Backend link failed', error);
        const statusLabel = document.getElementById("status");
        if (statusLabel) {
            statusLabel.innerText = 'OFFLINE';
        }
        document.getElementById('backend-status').innerText = 'Link unavailable';
        document.getElementById('connection-label').innerText = 'SYSTEM OFFLINE';
        document.getElementById('connection-dot').classList.add('offline');
    }
};

const syncPhoneDiagnostics = async () => {
    try {
        const response = await fetch('/api/phone', { cache: 'no-store' });
        const phone = await response.json();
        document.getElementById('phone-message').innerText = phone.message;
        document.getElementById('phone-device').innerText = phone.device || '--';
        document.getElementById('phone-battery').innerText = phone.battery_percent == null ? '--' : `${phone.battery_percent}%`;
        document.getElementById('phone-temperature').innerText = phone.battery_temperature_c == null ? '--' : `${phone.battery_temperature_c}°C`;
        document.querySelector('.phone-panel').dataset.status = phone.status;
        document.getElementById('asset-phone-state').innerText = phone.status === 'connected' ? 'READY' : phone.status.toUpperCase();
    } catch (error) {
        document.getElementById('phone-message').innerText = 'Phone diagnostics unavailable';
        document.querySelector('.phone-panel').dataset.status = 'unavailable';
    }
};

const initViewSwitcher = () => {
    const navItems = document.querySelectorAll('.nav-item');
    const views = document.querySelectorAll('.view-content');
    const title = document.getElementById('view-title');

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const target = item.getAttribute('data-target');

            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');
            views.forEach(v => v.classList.remove('active'));
            document.getElementById(target).classList.add('active');

            title.innerText = item.dataset.title;
            document.getElementById('view-desc').innerText = item.dataset.description;
        });
    });
};

const initControls = () => {
    document.getElementById('refresh-toggle').addEventListener('click', (event) => {
        isPaused = !isPaused;
        event.currentTarget.classList.toggle('paused', isPaused);
        event.currentTarget.innerHTML = isPaused
            ? '<i class="fas fa-play"></i> Resume feed'
            : '<i class="fas fa-pause"></i> Pause feed';
    });
    document.getElementById('manual-refresh').addEventListener('click', syncWithBackend);
    document.querySelector('.outline-button').addEventListener('click', () => {
        const csv = 'Window,Output,Efficiency,Status\n06:00 - 10:00,486 units,96.1%,ON TARGET\n10:00 - 14:00,512 units,95.4%,ON TARGET\n14:00 - 18:00,430 units,92.3%,MONITOR';
        const link = document.createElement('a');
        link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
        link.download = 'factorymind-line-a-report.csv';
        link.click();
        URL.revokeObjectURL(link.href);
    });
};

document.addEventListener("DOMContentLoaded", () => {
    startClock();
    initChart();
    initViewSwitcher();
    initControls();
    syncWithBackend();
    syncPhoneDiagnostics();
    setInterval(() => { if (!isPaused) syncWithBackend(); }, 3000);
    setInterval(syncPhoneDiagnostics, 5000);
});