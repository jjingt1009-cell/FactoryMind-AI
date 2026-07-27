from fastapi.testclient import TestClient
from src.backend import app

client = TestClient(app)


def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    payload = r.json()
    assert payload.get("status") == "ok"
    assert "timestamp" in payload


def test_api_data():
    r = client.get("/api/data")
    assert r.status_code == 200
    data = r.json()
    expected_keys = ["temperature", "energy", "production", "status_text", "status_code", "alert_count", "timestamp"]
    for k in expected_keys:
        assert k in data
    # basic type checks
    assert isinstance(data["temperature"], (int, float))
    assert isinstance(data["energy"], (int, float))
    assert isinstance(data["production"], int)
