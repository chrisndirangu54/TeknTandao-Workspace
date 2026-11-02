from fastapi.testclient import TestClient
from app import OptimizeRequest, parse_valhalla_matrix, solve, app

def test_requires_auth(monkeypatch):
    monkeypatch.setenv("LOGISTICS_OPTIMIZER_KEY", "example")
    assert TestClient(app).post("/v1/optimize", json={}).status_code == 422

def test_bad_valhalla_is_rejected():
    try:
        parse_valhalla_matrix({"sources_to_targets": [[{"time": None, "distance": None}]]}, 1)
        assert False
    except ValueError:
        pass

def test_solver_uses_actual_matrix_and_enforces_payload():
    request=OptimizeRequest.model_validate({
        "depot": {"lat": -1.28, "lon": 36.8},
        "vehicles": [{"id": "vehicle-1", "capacityGrams": 100000}],
        "stops": [
            {"id": "shipment-1", "lat": -1.3, "lon": 36.7,
             "demandGrams": 100000, "timeWindow": [0, 300], "serviceMinutes": 10},
            {"id": "shipment-2", "lat": -1.4, "lon": 36.6,
             "demandGrams": 100000, "timeWindow": [0, 300], "serviceMinutes": 10},
        ]
    })
    times=[[0,20,30],[20,0,12],[30,12,0]]
    distances=[[0,12,20],[12,0,7],[20,7,0]]
    result=solve(request,times,distances)
    assert len(result["routes"]) == 1
    assert len(result["routes"][0]["stops"]) == 1
    assert len(result["unassigned"]) == 1
    assert result["optimal"] is False
