# FactoryMind - Industrial Telemetry Dashboard

A real-time industrial telemetry system with robotic arm control, diagnostics, and production monitoring built with FastAPI, Chart.js, and Web Audio API.

## Tech Stack
- **Backend:** Python 3.14, FastAPI, Uvicorn, asyncio, Pydantic, Pytest, Flake8
- **Frontend:** Cyberpunk Glassmorphism HUD, Vanilla JS (ES6+), Web Audio Synth, Chart.js, SVG Kinematics
- **Deployment:** Docker, Docker Compose

## Features
- **Dashboard UI:** Real-time monitoring with dark theme, animated gauges, and live charts
- **Telemetry:** Core sensor data (temperature, RPM, power, vibration, load, OEE)
- **Alerting:** 3-sample debounce logic to eliminate false alarms
- **Robot Arm:** 6-axis kinematics visualization with real hardware or digital twin simulation
- **Diagnostics:** Health scoring and anomaly detection with radar chart
- **SCADA Logs:** Event stream and audit trail for production monitoring
- **Controls:** Stress test, E-Stop, reset, and production line switching
- **CSV Export:** Generate operational reports on demand

## Quick Start (Local)

1. Create a virtual environment & install dependencies:
   ```powershell
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   ```

2. Start the application:
   - **One-click launch with browser auto-open (Recommended):**
     ```powershell
     python launch.py --local
     # or on Windows:
     launch.bat
     ```
   - **Start backend server only:**
     ```powershell
     python run.py --local
     # or for LAN access:
     python run.py --public
     ```
   - **PowerShell script:**
     ```powershell
     .\start.ps1
     ```

3. Open your browser: `http://127.0.0.1:8080`

## API Endpoints
- `GET /health` - Health status, version, uptime, and UTC timestamp
- `GET /api/data` - Real-time industrial telemetry packet (temperatures, RPM, power, vibration, OEE, alerts)
- `GET /api/scada-logs` - Live SCADA PLC event log stream
- `POST /api/control/stress` - Toggle simulated thermal stress overload
- `POST /api/control/estop` - Toggle emergency stop safety interlock
- `POST /api/control/reset` - Clear diagnostic counters and reset alarms
- `POST /api/control/line` - Switch target production node (`LINE-A`, `LINE-B`, `LINE-C`)

## Tests & Linting
Run smoke tests and code style checks:
```bash
python -m pytest -v
python -m flake8 --exclude=.venv,src/__pycache__,tests/__pycache__
```

## Docker Deployment
Build and run using Docker:
```bash
docker compose up --build
```

## License
MIT (see LICENSE)