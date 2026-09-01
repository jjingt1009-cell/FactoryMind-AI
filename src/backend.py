import asyncio
import datetime
import logging
import os
import random
from typing import Any, Dict, List, Optional
from pydantic import BaseModel

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# FactoryMind AI - Industrial Telemetry & SCADA System

app = FastAPI(
    title="FactoryMind Telemetry Engine",
    version="3.5.0",
    description="Real-time factory telemetry and control console",
)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("factorymind")

# Initialize default SCADA event logs
initial_scada_logs: List[Dict[str, Any]] = [
    {
        "id": 1,
        "time": datetime.datetime.now(
            datetime.timezone.utc
        ).strftime("%H:%M:%S"),
        "level": "INFO",
        "tag": "STARTUP",
        "msg": "System initialized and ready",
    },
    {
        "id": 2,
        "time": datetime.datetime.now(
            datetime.timezone.utc
        ).strftime("%H:%M:%S"),
        "level": "SUCCESS",
        "tag": "ROBOT_ARM",
        "msg": "Robot arm initialized and ready",
    },
]

# Shared application state (thread-safe with asyncio.Lock)
app.state.high_temp_count = 0
app.state.high_temp_lock = asyncio.Lock()
app.state.sample_count = 0
app.state.started_at = datetime.datetime.now(datetime.timezone.utc)
app.state.machine_id = "LINE-A / MOTOR-07"
app.state.e_stop = False
app.state.stress_mode = False
app.state.scada_logs = initial_scada_logs

# Robot arm hardware state (simulated if not connected)
app.state.robot_hardware_connected = False
app.state.robot_last_seen = None
app.state.robot_data = {
    "robot_model": "UR5e / 6-Axis Manipulator",
    "status": "SIMULATED_TWIN",
    "coordinates": {
        "x": 642.8,
        "y": -120.4,
        "z": 850.0,
        "pitch": 45.0,
        "roll": 0.0,
        "yaw": 90.0,
    },
    "joint_angles": [-15.0, 45.0, -30.0, 0.0, 45.0, 90.0],
    "joint_torques": [12.4, 24.8, 16.2, 5.1, 3.8, 1.9],
    "joint_temperatures": [35.2, 37.1, 34.8, 31.5, 30.8, 29.9],
    "gripper_clamped": True,
}

# ESP32 mobile robot hardware state
app.state.esp32_hardware_connected = False
app.state.esp32_last_seen = None
app.state.esp32_data = {
    "device_id": "ESP32-ROVER-01",
    "robot_type": "ESP32 Mobile AGV Rover",
    "status": "SIMULATED_TWIN",
    "battery_voltage": 11.8,
    "battery_percent": 88,
    "wifi_rssi": -58,
    "distance_cm": 45.2,
    "speed_left_rpm": 180,
    "speed_right_rpm": 182,
    "imu": {
        "pitch": 2.1,
        "roll": -1.4,
        "yaw": 128.5,
    },
    "temp_c": 28.6,
    "humidity_pct": 54.0,
    "headlight": True,
    "buzzer": False,
    "current_action": "STOP",
    "speed_pwm": 180,
}
app.state.esp32_command = {
    "action": "STOP",
    "speed_pwm": 180,
    "headlight": True,
    "buzzer": False,
}

# CORS configuration
_allowed = os.environ.get(
    "ALLOWED_ORIGINS",
    "http://127.0.0.1:8080,http://localhost:8080",
)
allow_origins: List[str] = [
    o.strip() for o in _allowed.split(",") if o.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Data Models

class LineChangeRequest(BaseModel):
    """Request model for switching active production line"""
    machine_id: str


class RobotCoordinatesModel(BaseModel):
    """3D position and orientation (XYZ + Euler angles)"""
    x: float
    y: float
    z: float
    pitch: float = 45.0
    roll: float = 0.0
    yaw: float = 90.0


class RobotTelemetryInput(BaseModel):
    """Robot arm telemetry data from physical hardware or ROS"""
    robot_model: Optional[str] = "Physical 6-Axis Arm"
    coordinates: RobotCoordinatesModel
    joint_angles: List[float]
    joint_torques: Optional[List[float]] = None
    joint_temperatures: Optional[List[float]] = None
    gripper_clamped: Optional[bool] = True
    status: Optional[str] = "RUNNING"


class ESP32IMUModel(BaseModel):
    """IMU orientation data (pitch, roll, yaw)"""
    pitch: float = 0.0
    roll: float = 0.0
    yaw: float = 0.0


class ESP32TelemetryInput(BaseModel):
    """ESP32 mobile robot telemetry data"""
    device_id: Optional[str] = "ESP32-ROVER-01"
    battery_voltage: Optional[float] = 12.0
    battery_percent: Optional[int] = 90
    wifi_rssi: Optional[int] = -60
    distance_cm: Optional[float] = 50.0
    speed_left_rpm: Optional[int] = 0
    speed_right_rpm: Optional[int] = 0
    imu: Optional[ESP32IMUModel] = None
    temp_c: Optional[float] = 27.0
    humidity_pct: Optional[float] = 50.0
    status: Optional[str] = "ONLINE"


class ESP32ControlRequest(BaseModel):
    """ESP32 control command (forward, backward, stop, etc.)"""
    action: str  # FORWARD, BACKWARD, LEFT, RIGHT, STOP, SPIN
    speed_pwm: Optional[int] = 180  # 0-255
    headlight: Optional[bool] = None
    buzzer: Optional[bool] = None


# Telemetry Endpoints

@app.get("/api/data")
async def get_factory_telemetry() -> Dict[str, Any]:
    """
    Get real-time factory telemetry (temperature, RPM, power, vibration, OEE)
    """
    async with app.state.high_temp_lock:
        app.state.sample_count += 1
        sample_id = app.state.sample_count
        machine_id = app.state.machine_id
        is_estop = app.state.e_stop
        is_stress = app.state.stress_mode

        # Check if robot hardware connection has timed out (>5 seconds)
        if app.state.robot_hardware_connected and app.state.robot_last_seen:
            now_dt = datetime.datetime.now(datetime.timezone.utc)
            delta = (now_dt - app.state.robot_last_seen).total_seconds()
            if delta > 5.0:
                app.state.robot_hardware_connected = False
                app.state.robot_data["status"] = "SIMULATED_TWIN"

        # Generate sensor readings based on current system state
        if is_estop:
            temp = round(random.uniform(23.0, 26.0), 1)
            energy = 2.4
            rpm = 0
            vibration = 0.05
            pressure = 1.1
            load_pct = 0.0
            production_increment = 0
            app.state.high_temp_count = 0
            status_text = "EMERGENCY STOP (SAFETY HALT) 🛑"
            status_code = "error"
            anomaly_score = 98.0
        elif is_stress:
            temp = round(random.uniform(39.5, 45.2), 1)
            energy = round(random.uniform(72.0, 88.5), 1)
            rpm = random.randint(2850, 3100)
            vibration = round(random.uniform(5.4, 7.8), 2)
            pressure = round(random.uniform(8.1, 9.4), 2)
            load_pct = round(random.uniform(92.0, 99.8), 1)
            production_increment = random.randint(18, 25)
            app.state.high_temp_count += 1
            status_text = "CRITICAL: THERMAL STRESS OVERLOAD 🔧"
            status_code = "error"
            anomaly_score = round(random.uniform(88.0, 96.0), 1)
        else:
            temp = round(random.uniform(29.0, 41.5), 1)
            energy = round(random.uniform(38.0, 56.0), 1)
            rpm = random.randint(1680, 1820)
            vibration = round(random.uniform(1.2, 4.6), 2)
            pressure = round(random.uniform(5.8, 6.6), 2)
            load_pct = round(random.uniform(62.0, 78.0), 1)
            production_increment = random.randint(8, 14)

            # Debounce logic: require 3 consecutive high-temp samples (>38°C) to trigger alert
            if temp > 38.0:
                app.state.high_temp_count += 1
            else:
                app.state.high_temp_count = 0

            if app.state.high_temp_count >= 3:
                status_text = "CRITICAL: MOTOR OVERHEAT 🔧"
                status_code = "error"
                anomaly_score = round(random.uniform(82.0, 92.0), 1)
            elif temp > 35.0:
                status_text = "WARNING: ELEVATED TEMP 🟡"
                status_code = "warning"
                anomaly_score = round(random.uniform(45.0, 68.0), 1)
            else:
                status_text = "RUNNING OPTIMAL ✅"
                status_code = "ok"
                anomaly_score = round(random.uniform(8.0, 22.0), 1)

        alert_count = app.state.high_temp_count

        # Calculate production count and OEE (Overall Equipment Effectiveness)
        base_prod = 1420 + (sample_id * 3) + production_increment
        oee = round(
            min(
                99.4,
                max(
                    50.0,
                    98.2 - (temp - 30.0) * 0.8 - (vibration * 1.5)
                )
            ),
            1,
        )
        rul_hours = max(24, int(720 - (alert_count * 90) - (temp * 4.2)))

        # Log events when anomalies occur
        if status_code != "ok" and (
            sample_id % 3 == 0 or is_stress or is_estop
        ):
            now_str = datetime.datetime.now(
                datetime.timezone.utc
            ).strftime("%H:%M:%S")
            log_level = "CRITICAL" if status_code == "error" else "WARN"
            app.state.scada_logs.append({
                "id": len(app.state.scada_logs) + 1,
                "time": now_str,
                "level": log_level,
                "tag": "THERMAL_MON" if temp > 35.0 else "SYS_EVENT",
                "msg": (
                    f"[{machine_id}] {status_text} | "
                    f"Temp: {temp}C, VIB: {vibration} mm/s"
                ),
            })
            if len(app.state.scada_logs) > 40:
                app.state.scada_logs.pop(0)

    now_utc = datetime.datetime.now(datetime.timezone.utc).isoformat()
    return {
        "temperature": temp,
        "energy": energy,
        "production": base_prod,
        "vibration": vibration,
        "rpm": rpm,
        "pressure": pressure,
        "load_percent": load_pct,
        "oee_percent": oee,
        "anomaly_score": anomaly_score,
        "rul_hours": rul_hours,
        "machine_id": machine_id,
        "sample_id": sample_id,
        "e_stop": is_estop,
        "stress_mode": is_stress,
        "robot_hardware_connected": app.state.robot_hardware_connected,
        "thresholds": {
            "temperature_warning": 35.0,
            "temperature_critical": 38.0
        },
        "status_text": status_text,
        "status_code": status_code,
        "alert_count": alert_count,
        "timestamp": now_utc,
    }


# Robot Hardware API

@app.post("/api/robot/telemetry")
async def ingest_robot_telemetry(data: RobotTelemetryInput) -> Dict[str, Any]:
    """
    Receive telemetry from physical robot hardware.
    When a real robot is connected, its controller pushes data here for live display.
    """
    async with app.state.high_temp_lock:
        app.state.robot_hardware_connected = True
        app.state.robot_last_seen = datetime.datetime.now(
            datetime.timezone.utc
        )
        app.state.robot_data = {
            "robot_model": data.robot_model or "Physical 6-Axis Arm",
            "status": "HARDWARE_CONNECTED",
            "coordinates": data.coordinates.model_dump(),
            "joint_angles": data.joint_angles,
            "joint_torques": data.joint_torques or [10.0] * len(
                data.joint_angles
            ),
            "joint_temperatures": data.joint_temperatures or [32.0] * len(
                data.joint_angles
            ),
            "gripper_clamped": (
                data.gripper_clamped
                if data.gripper_clamped is not None
                else True
            ),
        }
        now_str = datetime.datetime.now(
            datetime.timezone.utc
        ).strftime("%H:%M:%S")
        app.state.scada_logs.append({
            "id": len(app.state.scada_logs) + 1,
            "time": now_str,
            "level": "SUCCESS",
            "tag": "ROBOT_LINK",
            "msg": f"Hardware packet received from {data.robot_model}",
        })
    return {
        "status": "ok",
        "message": "Robot telemetry synchronized successfully",
        "hardware_connected": True,
    }


@app.get("/api/robot/state")
async def get_robot_state() -> Dict[str, Any]:
    """
    Get current robot state (position, joint angles, connection status)
    """
    async with app.state.high_temp_lock:
        is_hw = app.state.robot_hardware_connected
        data = dict(app.state.robot_data)
        data["hardware_connected"] = is_hw
    return data


# ESP32 Mobile Robot API

@app.post("/api/esp32/telemetry")
async def ingest_esp32_telemetry(data: ESP32TelemetryInput) -> Dict[str, Any]:
    """
    Receive telemetry from ESP32 mobile robot.
    Returns pending control commands for the robot to execute.
    """
    async with app.state.high_temp_lock:
        app.state.esp32_hardware_connected = True
        app.state.esp32_last_seen = datetime.datetime.now(
            datetime.timezone.utc
        )

        imu_dict = (
            data.imu.model_dump()
            if data.imu
            else {"pitch": 0.0, "roll": 0.0, "yaw": 0.0}
        )

        app.state.esp32_data = {
            "device_id": data.device_id or "ESP32-ROVER-01",
            "robot_type": "ESP32 Mobile AGV Rover",
            "status": data.status or "HARDWARE_CONNECTED",
            "battery_voltage": data.battery_voltage or 12.0,
            "battery_percent": data.battery_percent or 90,
            "wifi_rssi": data.wifi_rssi or -60,
            "distance_cm": data.distance_cm or 50.0,
            "speed_left_rpm": data.speed_left_rpm or 0,
            "speed_right_rpm": data.speed_right_rpm or 0,
            "imu": imu_dict,
            "temp_c": data.temp_c or 28.0,
            "humidity_pct": data.humidity_pct or 50.0,
            "headlight": app.state.esp32_command.get("headlight", True),
            "buzzer": app.state.esp32_command.get("buzzer", False),
            "current_action": app.state.esp32_command.get("action", "STOP"),
            "speed_pwm": app.state.esp32_command.get("speed_pwm", 180),
        }

        # Return pending control commands for the ESP32
        cmd = dict(app.state.esp32_command)

    return {
        "status": "ok",
        "message": "ESP32 telemetry received",
        "hardware_connected": True,
        "command": cmd,
    }


@app.get("/api/esp32/state")
async def get_esp32_state() -> Dict[str, Any]:
    """
    Get current ESP32 mobile robot state.
    If no hardware is connected, simulates telemetry data.
    """
    async with app.state.high_temp_lock:
        is_hw = app.state.esp32_hardware_connected
        now_dt = datetime.datetime.now(datetime.timezone.utc)

        # Check if ESP32 heartbeat has timed out (>5 seconds)
        if is_hw and app.state.esp32_last_seen:
            delta = (now_dt - app.state.esp32_last_seen).total_seconds()
            if delta > 5.0:
                app.state.esp32_hardware_connected = False
                is_hw = False
                app.state.esp32_data["status"] = "SIMULATED_TWIN"

        data = dict(app.state.esp32_data)
        data["hardware_connected"] = is_hw

        # If no hardware connected, generate simulated telemetry
        if not is_hw:
            step = app.state.sample_count
            act = app.state.esp32_command.get("action", "CRUISE")
            base_speed = (
                app.state.esp32_command.get("speed_pwm", 180)
                if act != "STOP"
                else 0
            )

            # Simulate distance sensor and orientation data
            sim_dist = round(
                45.0 + random.uniform(-10.0, 15.0), 1
            )
            sim_yaw = round((step * 4.5) % 360, 1)
            sim_pitch = round(random.uniform(-1.5, 2.0), 1)
            sim_roll = round(random.uniform(-1.0, 1.2), 1)

            data["distance_cm"] = sim_dist
            data["imu"] = {
                "pitch": sim_pitch,
                "roll": sim_roll,
                "yaw": sim_yaw,
            }
            data["speed_left_rpm"] = (
                int(base_speed * 0.95 + random.randint(-5, 5))
                if base_speed > 0
                else 0
            )
            data["speed_right_rpm"] = (
                int(base_speed * 0.97 + random.randint(-5, 5))
                if base_speed > 0
                else 0
            )
            data["battery_voltage"] = round(11.9 - (step * 0.001) % 0.8, 2)
            data["battery_percent"] = max(
                15, int(92 - (step * 0.05) % 30)
            )
            data["wifi_rssi"] = random.randint(-62, -54)
            data["current_action"] = act
            data["headlight"] = app.state.esp32_command.get("headlight", True)
            data["buzzer"] = app.state.esp32_command.get("buzzer", False)

    return data


@app.post("/api/esp32/control")
async def send_esp32_control(cmd: ESP32ControlRequest) -> Dict[str, Any]:
    """
    Send control command to ESP32 (forward, backward, lights, etc.)
    """
    async with app.state.high_temp_lock:
        app.state.esp32_command["action"] = cmd.action
        if cmd.speed_pwm is not None:
            app.state.esp32_command["speed_pwm"] = max(
                0, min(255, cmd.speed_pwm)
            )
        if cmd.headlight is not None:
            app.state.esp32_command["headlight"] = cmd.headlight
        if cmd.buzzer is not None:
            app.state.esp32_command["buzzer"] = cmd.buzzer

        now_str = datetime.datetime.now(
            datetime.timezone.utc
        ).strftime("%H:%M:%S")
        app.state.scada_logs.append({
            "id": len(app.state.scada_logs) + 1,
            "time": now_str,
            "level": "INFO",
            "tag": "ESP32_CMD",
            "msg": (
                f"Teleop -> {cmd.action} "
                f"(PWM={app.state.esp32_command['speed_pwm']})"
            ),
        })
    return {
        "status": "ok",
        "action": cmd.action,
        "speed_pwm": app.state.esp32_command["speed_pwm"],
        "message": f"Command '{cmd.action}' buffered for ESP32",
    }


@app.get("/api/esp32/command")
async def get_esp32_command() -> Dict[str, Any]:
    """
    Get pending control commands for ESP32 to execute
    """
    async with app.state.high_temp_lock:
        return dict(app.state.esp32_command)


# SCADA Control & Logging API

@app.get("/api/scada-logs")
async def get_scada_logs() -> List[Dict[str, Any]]:
    """Get the most recent 25 SCADA event logs"""
    return list(reversed(app.state.scada_logs[-25:]))


@app.post("/api/control/stress")
async def toggle_stress_test() -> Dict[str, Any]:
    """Toggle thermal stress test mode"""
    async with app.state.high_temp_lock:
        app.state.stress_mode = not app.state.stress_mode
        active = app.state.stress_mode
        now_str = datetime.datetime.now(
            datetime.timezone.utc
        ).strftime("%H:%M:%S")
        action = "ENGAGED" if active else "DISENGAGED"
        app.state.scada_logs.append({
            "id": len(app.state.scada_logs) + 1,
            "time": now_str,
            "level": "WARN" if active else "INFO",
            "tag": "STRESS_TEST",
            "msg": f"Operator {action} thermal stress test",
        })
    return {
        "status": "ok",
        "stress_mode": active,
        "message": f"Stress mode: {'ACTIVE' if active else 'INACTIVE'}",
    }


@app.post("/api/control/estop")
async def toggle_estop() -> Dict[str, Any]:
    """Toggle emergency stop (E-Stop) safety interlock"""
    async with app.state.high_temp_lock:
        app.state.e_stop = not app.state.e_stop
        active = app.state.e_stop
        now_str = datetime.datetime.now(
            datetime.timezone.utc
        ).strftime("%H:%M:%S")
        action = "TRIGGERED" if active else "RELEASED"
        app.state.scada_logs.append({
            "id": len(app.state.scada_logs) + 1,
            "time": now_str,
            "level": "CRITICAL" if active else "SUCCESS",
            "tag": "E_STOP",
            "msg": f"SAFETY INTERLOCK: E-STOP {action}",
        })
    return {
        "status": "ok",
        "e_stop": active,
        "message": f"E-Stop is now {'ENGAGED' if active else 'RELEASED'}",
    }


@app.post("/api/control/reset")
async def reset_alerts() -> Dict[str, Any]:
    """Reset all alarms, counters, and interlocks"""
    async with app.state.high_temp_lock:
        app.state.high_temp_count = 0
        app.state.stress_mode = False
        app.state.e_stop = False
        now_str = datetime.datetime.now(
            datetime.timezone.utc
        ).strftime("%H:%M:%S")
        app.state.scada_logs.append({
            "id": len(app.state.scada_logs) + 1,
            "time": now_str,
            "level": "SUCCESS",
            "tag": "SYS_RESET",
            "msg": "Operator reset SCADA diagnostics. Alarms cleared.",
        })
    return {
        "status": "ok",
        "message": "All diagnostic counters & interlocks reset"
    }


@app.post("/api/control/line")
async def change_line(req: LineChangeRequest) -> Dict[str, Any]:
    """Switch active production line (LINE-A, LINE-B, or LINE-C)"""
    async with app.state.high_temp_lock:
        app.state.machine_id = req.machine_id
        now_str = datetime.datetime.now(
            datetime.timezone.utc
        ).strftime("%H:%M:%S")
        app.state.scada_logs.append({
            "id": len(app.state.scada_logs) + 1,
            "time": now_str,
            "level": "INFO",
            "tag": "LINE_SELECT",
            "msg": f"Telemetry routed to node: {req.machine_id}",
        })
    return {"status": "ok", "machine_id": app.state.machine_id}


# Health Check Endpoint

@app.get("/health")
async def health_check() -> Dict[str, Any]:
    """System health status and uptime"""
    now = datetime.datetime.now(datetime.timezone.utc)
    return {
        "status": "ok",
        "service": "FactoryMind telemetry",
        "version": "3.5.0",
        "uptime_seconds": round(
            (now - app.state.started_at).total_seconds(), 1
        ),
        "timestamp": now.isoformat(),
    }


# Static Web Hosting
_static_dir = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "static")
)
if not os.path.isdir(_static_dir):
    logger.warning("Static directory not found: %s", _static_dir)
app.mount("/", StaticFiles(directory=_static_dir, html=True), name="static")
