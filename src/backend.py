from fastapi import FastAPI  # 引入 FastAPI 框架 / Import FastAPI framework
from fastapi.middleware.cors import CORSMiddleware  # 引入跨域中间件 / Import CORS middleware
from fastapi.staticfiles import StaticFiles  # 引入静态文件托管 / Import static files hosting
import random  # 引入随机数工具 / Import random for simulation
import datetime
import asyncio
import os
import logging
import re
import subprocess
from typing import List


app = FastAPI()


# Configure simple logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("factorymind")


# Runtime shared state (use app.state to avoid module-level globals and protect with a lock)
app.state.high_temp_count = 0
app.state.high_temp_lock = asyncio.Lock()
app.state.sample_count = 0
app.state.started_at = datetime.datetime.now(datetime.timezone.utc)


# --- [CORS Configuration / 跨域配置] ---
# 允许前端浏览器安全地从 Python 获取数据 / Allow frontend browser to fetch data securely
# Read allowed origins from environment variable ALLOWED_ORIGINS (comma separated).
# In development default to the local loopback and localhost origins only.
_allowed = os.environ.get(
    "ALLOWED_ORIGINS",
    "http://127.0.0.1:8080,http://localhost:8080",
)
allow_origins: List[str] = [o.strip() for o in _allowed.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_methods=["*"],  # 允许所有请求方式 / Allow all HTTP methods
    allow_headers=["*"],  # 允许所有请求头 / Allow all headers
)


# --- [V2.1 Logic Memory / 工业逻辑记忆] ---
# 记录连续高温次数，模拟工业“消抖”报警逻辑 / Record consecutive high temp counts


@app.get("/api/data")  # 定义数据接口路径 / Define API endpoint path
async def get_factory_telemetry():
    """异步获取数据函数 / Async function for data"""

    # 1. Simulate Sensors / 模拟传感器读数
    temp = round(random.uniform(28.0, 42.0), 1)  # 生成28-42度随机温度 / Generate 28-42C temp
    energy = round(random.uniform(40.0, 55.0), 1)  # 生成随机能耗 / Generate random energy
    production = random.randint(1200, 1500)  # 生成随机产量 / Generate random production
    vibration = round(random.uniform(1.2, 4.8), 2)

    # 2. V2.1 Business Logic / 核心业务逻辑判断
    # Use an asyncio.Lock to protect updates to shared state in concurrent requests
    async with app.state.high_temp_lock:
        app.state.sample_count += 1
        if temp > 38.0:  # 如果温度超过38度 / If temperature > 38C
            app.state.high_temp_count += 1  # 计数器加1 / Increment counter
        else:  # 否则 / Else
            app.state.high_temp_count = 0  # 计数器归零 / Reset counter

    # 3. Status Determination / 判定最终状态
    if app.state.high_temp_count >= 3:  # 连续3次高温判定为故障 / 3 consecutive high temps = Critical
        status_text = "CRITICAL: MOTOR OVERHEAT 🔧"  # 故障文本 / Critical text
        status_code = "error"  # 状态码 / Status code
    elif temp > 35.0:  # 超过35度判定为警告 / Over 35C = Warning
        status_text = "WARNING: HIGH TEMP 🟡"  # 警告文本 / Warning text
        status_code = "warning"  # 状态码 / Status code
    else:  # 正常运行 / Normal operation
        status_text = "RUNNING ✅"  # 正常文本 / Normal text
        status_code = "ok"  # 状态码 / Status code

    # Log telemetry for observability
    logger.info(
        "telemetry temp=%s energy=%s production=%s status=%s alert_count=%s",
        temp,
        energy,
        production,
        status_code,
        app.state.high_temp_count,
    )

    # 4. Return JSON Packet / 返回标准数据包
    return {
        "temperature": temp,  # 温度值
        "energy": energy,  # 能耗值
        "production": production,  # 产量值
        "vibration": vibration,
        "machine_id": "LINE-A / MOTOR-07",
        "sample_id": app.state.sample_count,
        "thresholds": {"temperature_warning": 35.0, "temperature_critical": 38.0},
        "status_text": status_text,  # 状态描述
        "status_code": status_code,  # 颜色代号
        "alert_count": app.state.high_temp_count,  # 报警计数
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),  # 服务器 UTC 时间 (ISO 8601)
    }


def _run_adb(*args: str) -> subprocess.CompletedProcess[str]:
    adb_path = os.environ.get("ADB_PATH", "adb")
    return subprocess.run(
        [adb_path, *args], capture_output=True, text=True, timeout=2, check=False
    )


def _read_phone_diagnostics() -> dict:
    try:
        devices = _run_adb("devices").stdout.splitlines()[1:]
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return {"status": "unavailable", "message": "ADB not installed or unreachable"}

    connected = []
    unauthorized = False
    for line in devices:
        parts = line.split()
        if len(parts) >= 2 and parts[1] == "device":
            connected.append(parts[0])
        elif len(parts) >= 2 and parts[1] == "unauthorized":
            unauthorized = True

    if not connected:
        status = "unauthorized" if unauthorized else "disconnected"
        message = "Allow USB debugging on the phone" if unauthorized else "Connect an Android phone via USB"
        return {"status": status, "message": message}

    serial = connected[0]
    try:
        model = _run_adb("-s", serial, "shell", "getprop", "ro.product.model").stdout.strip()
        manufacturer = _run_adb("-s", serial, "shell", "getprop", "ro.product.manufacturer").stdout.strip()
        battery = _run_adb("-s", serial, "shell", "dumpsys", "battery").stdout
    except subprocess.TimeoutExpired:
        return {"status": "unavailable", "message": "Phone diagnostics timed out"}

    level_match = re.search(r"level:\s*(\d+)", battery)
    temp_match = re.search(r"temperature:\s*(\d+)", battery)
    return {
        "status": "connected",
        "message": "Android diagnostics available",
        "serial": serial,
        "device": f"{manufacturer} {model}".strip() or "Android device",
        "battery_percent": int(level_match.group(1)) if level_match else None,
        "battery_temperature_c": round(int(temp_match.group(1)) / 10, 1) if temp_match else None,
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }


@app.get("/api/phone")
async def get_phone_diagnostics():
    """Return non-sensitive Android USB diagnostics without blocking the event loop."""
    return await asyncio.to_thread(_read_phone_diagnostics)


# --- [Health check / 健康检查] ---
@app.get("/health")
async def health_check():
    """Simple health endpoint for load balancers and readiness checks"""
    now = datetime.datetime.now(datetime.timezone.utc)
    return {
        "status": "ok",
        "service": "FactoryMind telemetry",
        "version": "3.0.0",
        "uptime_seconds": round((now - app.state.started_at).total_seconds(), 1),
        "timestamp": now.isoformat(),
    }


# --- [Static Files Hosting / 托管网页] ---
# 让 Python 兼职做网页服务器 / Let Python act as the web server
# Mount static directory using absolute path so server serves files regardless of current working directory
# Static files are stored at the repository root ./static. When running from src package,
# resolve the absolute path to that folder (one level above src).
_static_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "static"))
if not os.path.isdir(_static_dir):
    logger.warning("Static directory not found: %s", _static_dir)

app.mount("/", StaticFiles(directory=_static_dir, html=True), name="static")
