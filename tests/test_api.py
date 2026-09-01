from fastapi.testclient import TestClient
from src.backend import app

client = TestClient(app)


def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    payload = r.json()
    assert payload.get("status") == "ok"
    assert payload.get("version") == "3.5.0"
    assert "timestamp" in payload


def test_api_data():
    r = client.get("/api/data")
    assert r.status_code == 200
    data = r.json()
    expected_keys = [
        "temperature",
        "energy",
        "production",
        "vibration",
        "rpm",
        "pressure",
        "load_percent",
        "oee_percent",
        "anomaly_score",
        "rul_hours",
        "machine_id",
        "sample_id",
        "status_text",
        "status_code",
        "alert_count",
        "timestamp",
    ]
    for k in expected_keys:
        assert k in data, f"Missing expected key: {k}"

    assert isinstance(data["temperature"], (int, float))
    assert isinstance(data["energy"], (int, float))
    assert isinstance(data["production"], int)
    assert isinstance(data["rpm"], int)
    assert isinstance(data["vibration"], (int, float))


def test_control_endpoints():
    # Test stress test toggle
    r_stress = client.post("/api/control/stress")
    assert r_stress.status_code == 200
    assert "stress_mode" in r_stress.json()

    # Test e-stop toggle
    r_estop = client.post("/api/control/estop")
    assert r_estop.status_code == 200
    assert "e_stop" in r_estop.json()

    # Test reset
    r_reset = client.post("/api/control/reset")
    assert r_reset.status_code == 200
    assert r_reset.json().get("status") == "ok"

    # Test line switch
    r_line = client.post(
        "/api/control/line", json={"machine_id": "LINE-B / CNC-04"}
    )
    assert r_line.status_code == 200
    assert r_line.json().get("machine_id") == "LINE-B / CNC-04"

    # Test scada logs
    r_logs = client.get("/api/scada-logs")
    assert r_logs.status_code == 200
    assert isinstance(r_logs.json(), list)
    assert len(r_logs.json()) > 0


def test_robot_telemetry_endpoints():
    # 1. Test initial robot state (Digital Twin mode)
    r_state = client.get("/api/robot/state")
    assert r_state.status_code == 200
    state_data = r_state.json()
    assert "coordinates" in state_data
    assert "joint_angles" in state_data

    # 2. Test sending physical robot telemetry packet
    robot_payload = {
        "robot_model": "UR5e / Physical Arm Test",
        "status": "RUNNING",
        "coordinates": {
            "x": 650.0,
            "y": -110.0,
            "z": 820.0,
            "pitch": 45.0,
            "roll": 0.0,
            "yaw": 90.0,
        },
        "joint_angles": [-10.0, 40.0, -25.0, 0.0, 45.0, 90.0],
        "joint_torques": [15.0, 25.0, 18.0, 5.0, 4.0, 2.0],
        "joint_temperatures": [35.0, 36.0, 34.0, 31.0, 30.0, 29.0],
        "gripper_clamped": True,
    }
    r_post = client.post("/api/robot/telemetry", json=robot_payload)
    assert r_post.status_code == 200
    assert r_post.json().get("hardware_connected") is True

    # 3. Verify state was updated to hardware connected
    r_state_after = client.get("/api/robot/state")
    assert r_state_after.status_code == 200
    updated_state = r_state_after.json()
    assert updated_state.get("hardware_connected") is True
    assert updated_state.get("robot_model") == "UR5e / Physical Arm Test"
    assert updated_state["coordinates"]["x"] == 650.0
