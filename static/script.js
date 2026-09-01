/**
 * FactoryMind - Industrial Telemetry Dashboard
 * Handles: audio synthesis, real-time charts, robot kinematics, SCADA controls
 */

// API Endpoints
const API_TELEMETRY = '/api/data';
const API_LOGS = '/api/scada-logs';
const API_ROBOT_STATE = '/api/robot/state';
const API_STRESS = '/api/control/stress';
const API_ESTOP = '/api/control/estop';
const API_RESET = '/api/control/reset';
const API_LINE = '/api/control/line';

// Global State Variables
let prodChart = null;                // Production and power chart
let aiRadarChart = null;             // AI diagnostics radar chart
let telemetryBuffer = [];            // Telemetry history buffer
let bufferCapacity = 15;             // Default time window (15s)
let isPaused = false;                // Telemetry polling paused
let isAudioEnabled = true;           // Audio effects enabled
let isAutoCycleRunning = true;       // Robot arm auto-cycle active
let isGripperClamped = true;         // Gripper state (true: clamped, false: open)
let isHardwareConnected = false;     // Real robot hardware connected

// Robot arm current position (X, Y, Z in mm and rotation angles)
let robotCoordinates = {
    x: 642.8,
    y: -120.4,
    z: 850.0,
    pitch: 45.0,
    roll: 0.0,
    yaw: 90.0
};
let currentLogFilter = 'ALL';        // Log filter level
let armAngleStep = 0;                // Animation phase


// Audio Synthesizer
let audioCtx = null;

// Initialize Web Audio API context
const initAudio = () => {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext && !audioCtx) {
            audioCtx = new AudioContext();
        }
    } catch (e) {
        console.warn('Audio init error:', e);
    }
};

// Play synthesized sound effects
const playSound = (type = 'click') => {
    if (!isAudioEnabled || !audioCtx) return;
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === 'click') {
        // Soft key press tone
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1400, now);
        osc.frequency.exponentialRampToValueAtTime(700, now + 0.04);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
        osc.start(now);
        osc.stop(now + 0.04);
    } else if (type === 'beep') {
        // Confirmation beep
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(980, now);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.08);
    } else if (type === 'alarm') {
        // Alarm/error tone
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.linearRampToValueAtTime(440, now + 0.15);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
    } else if (type === 'success') {
        // Success tone
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.setValueAtTime(659.25, now + 0.06);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
        osc.start(now);
        osc.stop(now + 0.16);
    }
};


// Clock and FPS Counter
const startClock = () => {
    const startTime = Date.now();
    setInterval(() => {
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
        const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

        const timeElem = document.getElementById("current-time");
        const dateElem = document.getElementById("current-date");
        if (timeElem) timeElem.innerText = timeStr;
        if (dateElem) dateElem.innerText = dateStr;

        const uptimeSec = Math.floor((Date.now() - startTime) / 1000);
        const upElem = document.getElementById("sidebar-uptime");
        if (upElem) upElem.innerText = `${uptimeSec}s`;
    }, 1000);
};

let lastFrameTime = performance.now();
let frameCount = 0;
const startFpsCounter = () => {
    const updateFps = () => {
        frameCount++;
        const now = performance.now();
        if (now - lastFrameTime >= 1000) {
            const fps = Math.round((frameCount * 1000) / (now - lastFrameTime));
            const fpsElem = document.getElementById('fps-val');
            if (fpsElem) fpsElem.innerText = `${fps} FPS`;
            frameCount = 0;
            lastFrameTime = now;
        }
        requestAnimationFrame(updateFps);
    };
    requestAnimationFrame(updateFps);
};


// Radial Progress Gauge
const setRadialProgress = (elementId, value, min, max) => {
    const circle = document.getElementById(elementId);
    if (!circle) return;
    const circumference = 263.89;
    const clamped = Math.min(Math.max(value, min), max);
    const percent = (clamped - min) / (max - min);
    const offset = circumference - (percent * circumference);
    circle.style.strokeDasharray = `${circumference}`;
    circle.style.strokeDashoffset = `${offset}`;
};


// Chart Initialization
const initCharts = () => {
    // Production and power dual-axis line chart
    const ctxProd = document.getElementById('productionChart');
    if (ctxProd) {
        const ctx2d = ctxProd.getContext('2d');
        const cyanGrad = ctx2d.createLinearGradient(0, 0, 0, 300);
        cyanGrad.addColorStop(0, 'rgba(0, 240, 255, 0.28)');
        cyanGrad.addColorStop(1, 'rgba(0, 240, 255, 0.01)');

        prodChart = new Chart(ctx2d, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Production Output (Units)',
                        yAxisID: 'yProduction',
                        data: [],
                        borderColor: '#00f0ff',
                        backgroundColor: cyanGrad,
                        borderWidth: 2.5,
                        pointBackgroundColor: '#00f0ff',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 1.5,
                        pointRadius: 3,
                        pointHoverRadius: 6,
                        fill: true,
                        tension: 0.35,
                    },
                    {
                        label: 'Active Power Draw (kW)',
                        yAxisID: 'yPower',
                        data: [],
                        borderColor: '#ffaa00',
                        backgroundColor: 'transparent',
                        borderWidth: 2,
                        borderDash: [5, 4],
                        pointBackgroundColor: '#ffaa00',
                        pointBorderColor: '#fff',
                        pointRadius: 2.5,
                        pointHoverRadius: 5,
                        fill: false,
                        tension: 0.2,
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 400 },
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            color: '#8b9bb4',
                            font: { family: 'JetBrains Mono', size: 10 },
                            boxWidth: 14,
                            usePointStyle: true,
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(3, 8, 16, 0.95)',
                        borderColor: '#00f0ff',
                        borderWidth: 1,
                        titleFont: { family: 'Orbitron', size: 11 },
                        bodyFont: { family: 'JetBrains Mono', size: 11 },
                        padding: 10,
                        displayColors: true,
                    }
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(0, 240, 255, 0.06)' },
                        ticks: { color: '#8b9bb4', font: { family: 'JetBrains Mono', size: 9 } }
                    },
                    yProduction: {
                        type: 'linear',
                        position: 'left',
                        grid: { color: 'rgba(0, 240, 255, 0.08)' },
                        ticks: { color: '#00f0ff', font: { family: 'JetBrains Mono', size: 9 } },
                        title: { display: true, text: 'UNITS', color: '#00f0ff', font: { size: 9 } }
                    },
                    yPower: {
                        type: 'linear',
                        position: 'right',
                        grid: { drawOnChartArea: false },
                        ticks: { color: '#ffaa00', font: { family: 'JetBrains Mono', size: 9 } },
                        title: { display: true, text: 'POWER (kW)', color: '#ffaa00', font: { size: 9 } }
                    }
                }
            }
        });
    }

    // AI diagnostics radar chart (5-axis sensor fusion)
    const ctxRadar = document.getElementById('aiRadarChart');
    if (ctxRadar) {
        aiRadarChart = new Chart(ctxRadar.getContext('2d'), {
            type: 'radar',
            data: {
                labels: [
                    'Temperature',
                    'Vibration',
                    'Acoustics',
                    'Flux',
                    'Harmonics'
                ],
                datasets: [
                    {
                        label: 'Live Signal Spectrum',
                        data: [82, 74, 88, 91, 85],
                        borderColor: '#00ff9d',
                        backgroundColor: 'rgba(0, 255, 157, 0.22)',
                        borderWidth: 2,
                        pointBackgroundColor: '#00ff9d',
                        pointRadius: 3,
                    },
                    {
                        label: 'Model Baseline Threshold',
                        data: [95, 95, 95, 95, 95],
                        borderColor: 'rgba(255, 170, 0, 0.45)',
                        backgroundColor: 'transparent',
                        borderWidth: 1.5,
                        borderDash: [4, 4],
                        pointRadius: 0,
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    r: {
                        angleLines: { color: 'rgba(0, 240, 255, 0.15)' },
                        grid: { color: 'rgba(0, 240, 255, 0.1)' },
                        pointLabels: {
                            color: '#8b9bb4',
                            font: { family: 'JetBrains Mono', size: 9 }
                        },
                        ticks: { display: false, min: 0, max: 100 }
                    }
                },
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: '#8b9bb4',
                            font: { family: 'JetBrains Mono', size: 9 },
                            usePointStyle: true,
                            boxWidth: 10
                        }
                    }
                }
            }
        });
    }
};


// Telemetry Data Synchronization
const syncWithBackend = async () => {
    if (isPaused) return;
    const reqStart = performance.now();
    try {
        const response = await fetch(API_TELEMETRY, { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const latency = Math.round(performance.now() - reqStart);

        // Update latency indicator
        const latElem = document.getElementById('latency-val');
        if (latElem) latElem.innerText = `${latency} ms`;

        // Update main metrics
        document.getElementById("temp").innerText = data.temperature.toFixed(1);
        document.getElementById("rpm").innerText = data.rpm.toLocaleString();
        document.getElementById("energy").innerText = data.energy.toFixed(1);
        document.getElementById("vibration").innerText = data.vibration.toFixed(2);
        document.getElementById("oee-val").innerText = data.oee_percent.toFixed(1);
        document.getElementById("load-val").innerText = `LOAD: ${data.load_percent.toFixed(1)}%`;
        document.getElementById("production").innerText = data.production.toLocaleString();
        document.getElementById("alert-count").innerText = String(data.alert_count).padStart(2, "0");
        document.getElementById("sample-count").innerText = `SAMPLE ${String(data.sample_id).padStart(4, "0")}`;
        document.getElementById("machine-id").innerText = data.machine_id;

        const updateTimeStr = new Date(data.timestamp).toLocaleTimeString([], { hour12: false });
        const lastUpElem = document.getElementById("last-update");
        if (lastUpElem) lastUpElem.innerText = `LAST SYNC: ${updateTimeStr} (UTC)`;

        // Update hardware connection status
        isHardwareConnected = !!data.robot_hardware_connected;
        const linkBadge = document.getElementById("robot-link-type");
        const modelDisplay = document.getElementById("robot-model-display");
        if (linkBadge) {
            if (isHardwareConnected) {
                linkBadge.className = "badge-status-ok";
                linkBadge.innerHTML = '<i class="fas fa-link"></i> HARDWARE LINKED (LIVE ROBOT)';
            } else {
                linkBadge.className = "badge-status-cyan";
                linkBadge.innerHTML = '<i class="fas fa-microchip"></i> DIGITAL TWIN (SIMULATION)';
            }
        }

        // 5.4 SVG 环形仪表盘刻度计算
        setRadialProgress("temp-gauge-circle", data.temperature, 20, 50);
        setRadialProgress("rpm-gauge-circle", data.rpm, 0, 3500);
        setRadialProgress("power-gauge-circle", data.energy, 0, 100);
        setRadialProgress("vibe-gauge-circle", data.vibration, 0, 10);
        setRadialProgress("oee-gauge-circle", data.oee_percent, 0, 100);

        // Update progress bars
        const tempBar = document.getElementById("temp-bar");
        if (tempBar) tempBar.style.width = `${Math.min(100, Math.max(0, (data.temperature / 50) * 100))}%`;

        const rpmBar = document.getElementById("rpm-bar");
        if (rpmBar) rpmBar.style.width = `${Math.min(100, Math.max(0, (data.rpm / 3500) * 100))}%`;

        const loadBar = document.getElementById("load-bar");
        if (loadBar) loadBar.style.width = `${data.load_percent}%`;

        const vibeBar = document.getElementById("vibe-bar");
        if (vibeBar) vibeBar.style.width = `${Math.min(100, (data.vibration / 8) * 100)}%`;

        const oeeBar = document.getElementById("oee-bar");
        if (oeeBar) oeeBar.style.width = `${data.oee_percent}%`;

        const alertBar = document.getElementById("alert-bar");
        if (alertBar) alertBar.style.width = `${(data.alert_count / 3) * 100}%`;

        // Update debounce indicators (0, 1, 2, 3 samples)
        const dp1 = document.getElementById("dp-1");
        const dp2 = document.getElementById("dp-2");
        const dp3 = document.getElementById("dp-3");
        if (dp1 && dp2 && dp3) {
            dp1.classList.toggle("active", data.alert_count >= 1);
            dp2.classList.toggle("active", data.alert_count >= 2);
            dp3.classList.toggle("active", data.alert_count >= 3);
        }

        // Update status label and color
        const statusLabel = document.getElementById("status");
        if (statusLabel) {
            statusLabel.innerText = data.status_text.replace(/[^\x00-\x7F]/g, '').trim();
            statusLabel.className = `status-main-label ${data.status_code}`;
        }

        // Update AI health diagnostics
        const aiHealth = document.getElementById("ai-health-score");
        if (aiHealth) aiHealth.innerText = Math.round(100 - data.anomaly_score);

        const aiProb = document.getElementById("ai-anomaly-prob");
        if (aiProb) aiProb.innerText = `${data.anomaly_score.toFixed(1)}%`;

        const aiRul = document.getElementById("ai-rul-val");
        if (aiRul) aiRul.innerText = `${data.rul_hours} HOURS`;

        // Update radar chart data
        if (aiRadarChart) {
            const thermalScore = Math.max(10, Math.min(99, 100 - (data.temperature - 28) * 4));
            const vibeScore = Math.max(10, Math.min(99, 100 - data.vibration * 12));
            const acousticScore = Math.max(15, Math.min(98, 95 - (data.rpm > 2500 ? 30 : 5)));
            const fluxScore = Math.max(20, Math.min(98, 96 - (data.load_percent > 85 ? 25 : 4)));
            const harmonicScore = Math.max(15, Math.min(99, data.oee_percent * 0.95));

            aiRadarChart.data.datasets[0].data = [
                Math.round(thermalScore),
                Math.round(vibeScore),
                Math.round(acousticScore),
                Math.round(fluxScore),
                Math.round(harmonicScore)
            ];
            aiRadarChart.update('none');
        }

        // Update system readings
        const subHydraulic = document.getElementById("sub-hydraulic");
        if (subHydraulic) {
            subHydraulic.innerText = `PRESSURE: ${data.pressure.toFixed(1)} BAR // TEMP: ${data.temperature.toFixed(1)}°C`;
        }

        // Update control button states
        const btnStress = document.getElementById("btn-stress-toggle");
        if (btnStress) {
            btnStress.classList.toggle("cyber-btn-danger", data.stress_mode);
            btnStress.querySelector("span").innerText = data.stress_mode ? "DISENGAGE STRESS TEST" : "SIMULATE STRESS OVERLOAD";
        }

        const btnEstop = document.getElementById("btn-estop-toggle");
        if (btnEstop) {
            btnEstop.classList.toggle("active", data.e_stop);
            btnEstop.querySelector("span").innerText = data.e_stop ? "RELEASE SAFETY E-STOP" : "EMERGENCY STOP (E-STOP)";
        }

        // Update line chart with telemetry buffer
        if (prodChart) {
            telemetryBuffer.push({
                time: updateTimeStr,
                production: data.production,
                energy: data.energy
            });
            if (telemetryBuffer.length > bufferCapacity) {
                telemetryBuffer.shift();
            }
            prodChart.data.labels = telemetryBuffer.map((d) => d.time);
            prodChart.data.datasets[0].data = telemetryBuffer.map((d) => d.production);
            prodChart.data.datasets[1].data = telemetryBuffer.map((d) => d.energy);
            prodChart.update('none');
        }

        // Update connection status
        document.getElementById('backend-status').innerText = 'HTTP/2 SYNCHRONIZED';
        document.getElementById('connection-label').innerText = data.e_stop ? 'E-STOP HALT' : (data.stress_mode ? 'STRESS TEST' : 'NODE ONLINE');
        document.getElementById('connection-dot').className = `status-dot ${data.status_code === 'error' ? 'offline' : ''}`;

        if (data.status_code === 'error') {
            playSound('alarm');
        }

    } catch (error) {
        console.error('Telemetry fetch error:', error);
        document.getElementById('backend-status').innerText = 'BUS DISCONNECTED';
        document.getElementById('connection-label').innerText = 'NODE OFFLINE';
        document.getElementById('connection-dot').className = 'status-dot offline';
        const statusLabel = document.getElementById("status");
        if (statusLabel) {
            statusLabel.innerText = 'OFFLINE';
            statusLabel.className = 'status-main-label offline';
        }
    }
};


// SCADA Event Logs
const syncScadaLogs = async () => {
    try {
        const response = await fetch(API_LOGS, { cache: 'no-store' });
        if (!response.ok) return;
        const logs = await response.json();
        const container = document.getElementById("scada-terminal-logs");
        if (!container) return;

        const filtered = logs.filter(log => {
            if (currentLogFilter === 'ALL') return true;
            if (currentLogFilter === 'WARN') return log.level === 'WARN' || log.level === 'CRITICAL';
            return true;
        });

        container.innerHTML = filtered.map(log => `
            <div class="terminal-row ${log.level}">
                <span class="term-time">${log.time}</span>
                <span class="term-tag">[${log.tag}]</span>
                <span class="term-msg">${log.msg}</span>
            </div>
        `).join('');
    } catch (e) {
        console.warn('SCADA log fetch error:', e);
    }
};


// Robot Kinematics and Hardware/Simulation Sync
const syncRobotState = async () => {
    try {
        const res = await fetch(API_ROBOT_STATE, { cache: 'no-store' });
        if (!res.ok) return;
        const state = await res.json();
        isHardwareConnected = !!state.hardware_connected;

        if (isHardwareConnected) {
            // Use real hardware data
            const j = state.joint_angles || [0, 0, 0];
            const link1 = document.getElementById("arm-link-1");
            const link2 = document.getElementById("arm-link-2");
            const link3 = document.getElementById("arm-link-3");
            if (link1 && j[0] !== undefined) link1.setAttribute("transform", `rotate(${j[0].toFixed(1)}, 300, 320)`);
            if (link2 && j[1] !== undefined) link2.setAttribute("transform", `rotate(${j[1].toFixed(1)}, 300, 200)`);
            if (link3 && j[2] !== undefined) link3.setAttribute("transform", `rotate(${j[2].toFixed(1)}, 420, 120)`);

            if (state.coordinates) {
                robotCoordinates = { ...robotCoordinates, ...state.coordinates };
                const cx = document.getElementById("coord-x");
                const cy = document.getElementById("coord-y");
                const cz = document.getElementById("coord-z");
                const cp = document.getElementById("coord-pitch");
                if (cx) cx.innerText = `${robotCoordinates.x.toFixed(1)} mm`;
                if (cy) cy.innerText = `${robotCoordinates.y.toFixed(1)} mm`;
                if (cz) cz.innerText = `${robotCoordinates.z.toFixed(1)} mm`;
                if (cp) cp.innerText = `${robotCoordinates.pitch.toFixed(1)}°`;
            }

            const modelDisplay = document.getElementById("robot-model-display");
            if (modelDisplay) modelDisplay.innerText = `// ${state.robot_model || 'PHYSICAL 6-AXIS ARM'}`;
        }
    } catch (e) {
        // 允许静默处理
    }
};

/** 机械臂连续运动学姿态动画 (仿真模式下运行) */
const animateRobotArm = () => {
    if (isAutoCycleRunning && !isHardwareConnected) {
        armAngleStep += 0.035;
        const j1Angle = Math.sin(armAngleStep) * 25 - 15;
        const j2Angle = Math.cos(armAngleStep * 0.8) * 30 + 40;
        const j3Angle = Math.sin(armAngleStep * 1.2) * 20 - 30;

        const link1 = document.getElementById("arm-link-1");
        const link2 = document.getElementById("arm-link-2");
        const link3 = document.getElementById("arm-link-3");

        if (link1) link1.setAttribute("transform", `rotate(${j1Angle.toFixed(1)}, 300, 320)`);
        if (link2) link2.setAttribute("transform", `rotate(${j2Angle.toFixed(1)}, 300, 200)`);
        if (link3) link3.setAttribute("transform", `rotate(${j3Angle.toFixed(1)}, 420, 120)`);

        // 空间坐标正向运动学仿真推算
        robotCoordinates.x = +(640 + Math.sin(armAngleStep) * 45).toFixed(1);
        robotCoordinates.y = +(-120 + Math.cos(armAngleStep) * 35).toFixed(1);
        robotCoordinates.z = +(850 + Math.sin(armAngleStep * 1.5) * 60).toFixed(1);
        robotCoordinates.pitch = +(45 + Math.sin(armAngleStep) * 15).toFixed(1);

        const cx = document.getElementById("coord-x");
        const cy = document.getElementById("coord-y");
        const cz = document.getElementById("coord-z");
        const cp = document.getElementById("coord-pitch");
        if (cx) cx.innerText = `${robotCoordinates.x} mm`;
        if (cy) cy.innerText = `${robotCoordinates.y} mm`;
        if (cz) cz.innerText = `${robotCoordinates.z} mm`;
        if (cp) cp.innerText = `${robotCoordinates.pitch}°`;
    }

    requestAnimationFrame(animateRobotArm);
};


// View Navigation
const initViewSwitcher = () => {
    const navItems = document.querySelectorAll('.nav-item');
    const views = document.querySelectorAll('.view-content');
    const title = document.getElementById('view-title');
    const desc = document.getElementById('view-desc');
    const tag = document.getElementById('view-tag');

    navItems.forEach((item, index) => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            playSound('click');
            const target = item.getAttribute('data-target');

            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');

            views.forEach(v => v.classList.remove('active'));
            const targetView = document.getElementById(target);
            if (targetView) targetView.classList.add('active');

            if (title) title.innerText = item.dataset.title;
            if (desc) desc.innerText = item.dataset.description;
            if (tag) tag.innerText = `SYSTEM VIEW // 0${index + 1}`;
        });
    });
};


// Interactive Controls and Event Listeners
const initControls = () => {
    // Audio toggle
    const audioBtn = document.getElementById('audio-toggle-btn');
    if (audioBtn) {
        audioBtn.addEventListener('click', () => {
            isAudioEnabled = !isAudioEnabled;
            if (isAudioEnabled) {
                initAudio();
                playSound('beep');
            }
            audioBtn.querySelector('.btn-micro-text').innerText = isAudioEnabled ? 'AUDIO ON' : 'AUDIO MUTED';
            const icon = document.getElementById('audio-icon');
            if (icon) icon.className = isAudioEnabled ? 'fas fa-volume-high' : 'fas fa-volume-xmark';
        });
    }

    // Fullscreen toggle
    const fsBtn = document.getElementById('fullscreen-btn');
    if (fsBtn) {
        fsBtn.addEventListener('click', () => {
            playSound('click');
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(err => console.warn(err));
            } else {
                document.exitFullscreen().catch(err => console.warn(err));
            }
        });
    }

    // Pause/resume polling
    const refreshToggle = document.getElementById('refresh-toggle');
    if (refreshToggle) {
        refreshToggle.addEventListener('click', (e) => {
            playSound('click');
            isPaused = !isPaused;
            e.currentTarget.classList.toggle('cyber-btn-amber', isPaused);
            e.currentTarget.innerHTML = isPaused
                ? '<i class="fas fa-play"></i> <span>RESUME</span>'
                : '<i class="fas fa-pause"></i> <span>PAUSE</span>';
        });
    }

    // Manual refresh
    const manualRefresh = document.getElementById('manual-refresh');
    if (manualRefresh) {
        manualRefresh.addEventListener('click', () => {
            playSound('beep');
            syncWithBackend();
            syncScadaLogs();
            syncRobotState();
        });
    }

    // Chart time window selection
    document.querySelectorAll('.range-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            playSound('click');
            document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            bufferCapacity = parseInt(btn.dataset.range, 10);
            if (telemetryBuffer.length > bufferCapacity) {
                telemetryBuffer = telemetryBuffer.slice(-bufferCapacity);
            }
        });
    });

    // Stress test toggle
    const btnStress = document.getElementById('btn-stress-toggle');
    if (btnStress) {
        btnStress.addEventListener('click', async () => {
            playSound('alarm');
            try {
                await fetch(API_STRESS, { method: 'POST' });
                syncWithBackend();
                syncScadaLogs();
            } catch (e) {
                console.error(e);
            }
        });
    }

    // E-Stop toggle
    const btnEstop = document.getElementById('btn-estop-toggle');
    if (btnEstop) {
        btnEstop.addEventListener('click', async () => {
            playSound('alarm');
            try {
                await fetch(API_ESTOP, { method: 'POST' });
                syncWithBackend();
                syncScadaLogs();
            } catch (e) {
                console.error(e);
            }
        });
    }

    // Reset alarms
    const btnReset = document.getElementById('btn-reset-alarms');
    if (btnReset) {
        btnReset.addEventListener('click', async () => {
            playSound('success');
            try {
                await fetch(API_RESET, { method: 'POST' });
                syncWithBackend();
                syncScadaLogs();
            } catch (e) {
                console.error(e);
            }
        });
    }

    // Machine line selector
    const machineSelect = document.getElementById('machine-select');
    if (machineSelect) {
        machineSelect.addEventListener('change', async (e) => {
            playSound('beep');
            try {
                await fetch(API_LINE, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ machine_id: e.target.value })
                });
                syncWithBackend();
                syncScadaLogs();
            } catch (err) {
                console.error(err);
            }
        });
    }

    // Log filter
    document.querySelectorAll('.term-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            playSound('click');
            document.querySelectorAll('.term-filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentLogFilter = btn.dataset.level;
            syncScadaLogs();
        });
    });

    // Robot arm auto-cycle and manual controls
    const btnAutoCycle = document.getElementById('btn-auto-cycle');
    if (btnAutoCycle) {
        btnAutoCycle.addEventListener('click', () => {
            playSound('click');
            isAutoCycleRunning = !isAutoCycleRunning;
            btnAutoCycle.classList.toggle('cyber-btn-ghost', !isAutoCycleRunning);
            btnAutoCycle.classList.toggle('cyber-btn-cyan', isAutoCycleRunning);
            btnAutoCycle.querySelector('span').innerText = isAutoCycleRunning ? 'AUTO CYCLE' : 'CYCLE PAUSED';
            const stateText = document.getElementById('robot-cycle-state');
            if (stateText) stateText.innerText = isAutoCycleRunning ? 'CYCLE RUNNING' : 'MANUAL HOLD';
        });
    }

    const btnGripper = document.getElementById('btn-gripper-toggle');
    if (btnGripper) {
        btnGripper.addEventListener('click', () => {
            playSound('beep');
            isGripperClamped = !isGripperClamped;
            const label = document.getElementById('gripper-label');
            if (label) label.innerText = isGripperClamped ? 'GRIPPER: CLAMPED' : 'GRIPPER: RELEASED';
            btnGripper.classList.toggle('cyber-btn-cyan', isGripperClamped);
        });
    }

    const btnCalibrate = document.getElementById('btn-calibrate');
    if (btnCalibrate) {
        btnCalibrate.addEventListener('click', () => {
            playSound('success');
            const stateText = document.getElementById('robot-cycle-state');
            if (stateText) stateText.innerText = 'CALIBRATING...';
            setTimeout(() => {
                if (stateText) stateText.innerText = 'CALIBRATION OK';
            }, 1200);
        });
    }

    // Manual jog controls (XYZ axis adjustment)
    document.querySelectorAll('.jog-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            playSound('beep');
            const axis = btn.dataset.axis;
            const dir = parseInt(btn.dataset.dir, 10);
            if (axis === 'x') robotCoordinates.x += dir * 10;
            if (axis === 'y') robotCoordinates.y += dir * 10;
            if (axis === 'z') robotCoordinates.z += dir * 10;

            const cx = document.getElementById("coord-x");
            const cy = document.getElementById("coord-y");
            const cz = document.getElementById("coord-z");
            if (cx) cx.innerText = `${robotCoordinates.x.toFixed(1)} mm`;
            if (cy) cy.innerText = `${robotCoordinates.y.toFixed(1)} mm`;
            if (cz) cz.innerText = `${robotCoordinates.z.toFixed(1)} mm`;
        });
    });

    const feedSlider = document.getElementById('feedrate-slider');
    if (feedSlider) {
        feedSlider.addEventListener('input', (e) => {
            const feedLabel = document.getElementById('feedrate-label');
            if (feedLabel) feedLabel.innerText = `${e.target.value}%`;
        });
    }

    // Report search and CSV export
    const reportSearch = document.getElementById('report-search-input');
    if (reportSearch) {
        reportSearch.addEventListener('input', (e) => {
            const q = e.target.value.toLowerCase();
            document.querySelectorAll('#audit-table-body tr').forEach(row => {
                const text = row.innerText.toLowerCase();
                row.style.display = text.includes(q) ? '' : 'none';
            });
        });
    }

    document.querySelectorAll('.tbl-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            playSound('click');
            document.querySelectorAll('.tbl-filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const status = btn.dataset.status;
            document.querySelectorAll('#audit-table-body tr').forEach(row => {
                if (status === 'ALL') {
                    row.style.display = '';
                } else {
                    row.style.display = row.innerText.includes(status) ? '' : 'none';
                }
            });
        });
    });

    const btnExportCsv = document.getElementById('btn-export-csv');
    if (btnExportCsv) {
        btnExportCsv.addEventListener('click', () => {
            playSound('success');
            const headers = ['Time Window', 'Batch ID', 'Machine Node', 'Output Units', 'Avg Power kW', 'Peak Temp C', 'OEE Index', 'Status'];
            const rows = [
                ['06:00 - 08:00', '#BAT-9021', 'LINE-A / MOTOR-07', '486', '44.2', '32.4', '96.8%', 'ON TARGET'],
                ['08:00 - 10:00', '#BAT-9022', 'LINE-A / MOTOR-07', '512', '46.8', '34.1', '95.4%', 'ON TARGET'],
                ['10:00 - 12:00', '#BAT-9023', 'LINE-A / MOTOR-07', '498', '45.0', '33.8', '96.1%', 'ON TARGET'],
                ['12:00 - 14:00', '#BAT-9024', 'LINE-A / MOTOR-07', '430', '51.2', '36.5', '92.3%', 'MONITOR'],
                ['14:00 - 16:00', '#BAT-9025', 'LINE-A / MOTOR-07', '534', '43.7', '31.9', '97.4%', 'ON TARGET']
            ];

            const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `FactoryMind_Audit_Report_${Date.now()}.csv`;
            link.click();
            URL.revokeObjectURL(link.href);
        });
    }
};


// Page Initialization
document.addEventListener("DOMContentLoaded", () => {
    initAudio();
    startClock();
    startFpsCounter();
    initCharts();
    initViewSwitcher();
    initControls();

    // 首次获取遥测、日志与机器人状态
    syncWithBackend();
    syncScadaLogs();
    syncRobotState();

    // 启动机械臂连续运动学动画
    requestAnimationFrame(animateRobotArm);

    // 设置定时轮询 (遥测 2s, 日志与机器人状态 3s)
    setInterval(() => {
        if (!isPaused) syncWithBackend();
    }, 2000);

    setInterval(() => {
        syncScadaLogs();
        syncRobotState();
    }, 3000);
});

