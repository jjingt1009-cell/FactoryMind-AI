# FactoryMind AI

Real-time factory telemetry dashboard and API.

Badges: 
- CI: (see .github/workflows)
- License: MIT

## One-liner
A lightweight real-time telemetry platform built with FastAPI and Chart.js that demonstrates concurrency-safe alerting, health checks, and Dockerized deployment.

## Tech stack
- Python, FastAPI, uvicorn
- JavaScript, Chart.js, HTML/CSS
- Docker, docker-compose

## Features
- Real-time /api/data endpoint simulating telemetry
- Concurrency-safe debounce alarm: requires 3 consecutive high-temp readings to trigger a CRITICAL
- /health endpoint for loadbalancer/readiness checks
- Environment-driven CORS (ALLOWED_ORIGINS)
- Dockerfile and docker-compose for reproducible deployment

## Quick start (local)
1. Create a virtualenv and activate it:

   Windows (PowerShell):
   ```powershell
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   ```

   macOS / Linux:
   ```bash
   python -m venv .venv
   source .venv/bin/activate
   ```

2. Install dependencies:

   pip install -r requirements.txt

3. Run the app:

   python run.py --local

   This binds the app to 127.0.0.1 only, so only the current machine can access it.

   To make it accessible on your local network, run:

   python run.py --public

   If you want a single entry-point that starts the backend directly for the dashboard, run:

   python start_all.py --local

   On Windows, you can also use the one-click scripts:

   launch.bat
   desktop-launch.cmd
   start.bat
   powershell -ExecutionPolicy Bypass -File .\start.ps1

   For the most convenient experience, use:

   python launch.py --local

   It will start the backend and open the dashboard automatically in your browser.

4. Open browser: http://127.0.0.1:8080

## Docker
Build and run with Docker (requires Docker installed):

```bash
docker build -t factorymind .
docker run -p 8080:8080 factorymind
```

Or use docker-compose:

```bash
docker compose up --build
```

## API
- GET /health -> { status: "ok", timestamp }
- GET /api/data -> telemetry JSON (temperature, energy, production, status_text, status_code, alert_count, timestamp)

## Tests
Run the smoke tests (pytest):

```bash
pip install pytest
pytest -q
```

## For your resume
FactoryMind AI — Real‑time factory telemetry dashboard (FastAPI, Chart.js, Docker)
- Implemented concurrency-safe debounce alerting (asyncio.Lock + app.state) to reduce false alarms; added health checks and Docker support for reproducible deployments.

## License
MIT (see LICENSE)

---

Replace placeholder values (author name, demo links) before publishing the repository publicly.