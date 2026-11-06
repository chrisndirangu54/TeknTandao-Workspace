"""Private OR-Tools CVRPTW solver using an actual Valhalla road time matrix.

This service contains no tenant records, accounts, payment features or storage.
It accepts bounded, pseudonymous routing payloads from the Workspace backend.
"""
from __future__ import annotations

import hmac
import math
import os
from typing import Annotated

import httpx
from fastapi import FastAPI, Header, HTTPException
from ortools.constraint_solver import pywrapcp, routing_enums_pb2
from pydantic import BaseModel, ConfigDict, Field, model_validator

app = FastAPI(title="TeknTandao private logistics optimizer", version="0.1.0")


class Point(BaseModel):
    model_config = ConfigDict(extra="forbid")
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)


class Vehicle(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(pattern=r"^[A-Za-z0-9_-]{1,100}$")
    capacityGrams: int = Field(gt=0, le=100_000_000)


class Stop(Point):
    id: str = Field(pattern=r"^[A-Za-z0-9_-]{1,100}$")
    demandGrams: int = Field(gt=0, le=100_000_000)
    timeWindow: tuple[int, int]
    serviceMinutes: int = Field(ge=0, le=120)

    @model_validator(mode="after")
    def window_valid(self):
        start, end = self.timeWindow
        if not (0 <= start < end <= 1440):
            raise ValueError("Invalid delivery window")
        return self


class OptimizeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    model: str = "capacitated_vehicle_routing_time_windows"
    depot: Point
    vehicles: list[Vehicle] = Field(min_length=1, max_length=12)
    stops: list[Stop] = Field(min_length=1, max_length=30)

    @model_validator(mode="after")
    def ids_unique(self):
        if (len({v.id for v in self.vehicles}) != len(self.vehicles) or
            len({s.id for s in self.stops}) != len(self.stops)):
            raise ValueError("Duplicate vehicle or shipment identifier")
        if self.model != "capacitated_vehicle_routing_time_windows":
            raise ValueError("Unexpected optimization model")
        return self


def parse_valhalla_matrix(raw: dict, size: int) -> tuple[list[list[int]], list[list[float]]]:
    rows = raw.get("sources_to_targets")
    if not isinstance(rows, list) or len(rows) != size:
        raise ValueError("Valhalla matrix has an unexpected row count")
    times: list[list[int]] = []
    distances: list[list[float]] = []
    for i, row in enumerate(rows):
        if not isinstance(row, list) or len(row) != size:
            raise ValueError("Valhalla matrix has an unexpected column count")
        time_row, distance_row = [], []
        for j, cell in enumerate(row):
            if not isinstance(cell, dict):
                raise ValueError("Valhalla returned an unreachable road segment")
            seconds, distance = cell.get("time"), cell.get("distance")
            if not isinstance(seconds, (int, float)) or not math.isfinite(seconds) or seconds < 0:
                raise ValueError("Missing/invalid road travel time")
            if not isinstance(distance, (int, float)) or not math.isfinite(distance) or distance < 0:
                raise ValueError("Missing/invalid road distance")
            time_row.append(0 if i == j else max(1, math.ceil(seconds / 60)))
            distance_row.append(float(distance))  # Valhalla defaults to km
        times.append(time_row)
        distances.append(distance_row)
    return times, distances


async def valhalla_matrix(req: OptimizeRequest):
    base = os.environ.get("VALHALLA_URL", "").rstrip("/")
    # Server-controlled configuration only. The caller cannot choose an endpoint.
    if not base.startswith(("https://", "http://")):
        raise HTTPException(503, "Valhalla is not configured")
    locations = [req.depot, *req.stops]
    payload = {"sources": [p.model_dump(include={"lat", "lon"}) for p in locations],
               "targets": [p.model_dump(include={"lat", "lon"}) for p in locations],
               "costing": "auto"}
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=False, trust_env=False) as client:
            response = await client.post(f"{base}/sources_to_targets", json=payload)
            response.raise_for_status()
            return parse_valhalla_matrix(response.json(), len(locations))
    except (httpx.HTTPError, ValueError, KeyError) as exc:
        raise HTTPException(503, "Verified road network matrix unavailable") from exc


def solve(req: OptimizeRequest, times: list[list[int]], distances: list[list[float]]) -> dict:
    manager = pywrapcp.RoutingIndexManager(len(req.stops) + 1, len(req.vehicles), 0)
    routing = pywrapcp.RoutingModel(manager)
    demands = [0, *[s.demandGrams for s in req.stops]]
    service = [0, *[s.serviceMinutes for s in req.stops]]

    def arc(from_index, to_index):
        start = manager.IndexToNode(from_index)
        end = manager.IndexToNode(to_index)
        return times[start][end] + service[start]

    transit_id = routing.RegisterTransitCallback(arc)
    routing.SetArcCostEvaluatorOfAllVehicles(transit_id)
    demand_id = routing.RegisterUnaryTransitCallback(
        lambda index: demands[manager.IndexToNode(index)]
    )
    routing.AddDimensionWithVehicleCapacity(
        demand_id, 0, [v.capacityGrams for v in req.vehicles], True, "Payload"
    )
    routing.AddDimension(transit_id, 1440, 2880, True, "Time")
    clock = routing.GetDimensionOrDie("Time")
    for i, stop in enumerate(req.stops, 1):
        idx = manager.NodeToIndex(i)
        clock.CumulVar(idx).SetRange(*stop.timeWindow)
        routing.AddDisjunction([idx], 100_000)
    for vehicle in range(len(req.vehicles)):
        clock.CumulVar(routing.End(vehicle)).SetRange(0, 2880)

    search = pywrapcp.DefaultRoutingSearchParameters()
    search.first_solution_strategy = routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    search.local_search_metaheuristic = routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    search.time_limit.FromSeconds(5)
    search.log_search = False
    solution = routing.SolveWithParameters(search)
    if not solution:
        return {"routes": [], "unassigned": [
            {"shipmentId": stop.id, "reason": "no_feasible_solution"}
            for stop in req.stops], "solverStatus": "no_solution"}

    routes, assigned = [], set()
    for vehicle_index, vehicle in enumerate(req.vehicles):
        cursor = routing.Start(vehicle_index)
        route_stops, total_km, load_grams = [], 0.0, 0
        while not routing.IsEnd(cursor):
            following = solution.Value(routing.NextVar(cursor))
            current_node = manager.IndexToNode(cursor)
            next_node = manager.IndexToNode(following)
            total_km += distances[current_node][next_node]
            if next_node != 0:
                stop = req.stops[next_node - 1]
                eta = solution.Min(clock.CumulVar(following))
                route_stops.append({"shipmentId": stop.id, "etaMinutes": eta})
                load_grams += stop.demandGrams
                assigned.add(stop.id)
            cursor = following
        if route_stops:
            routes.append({
                "vehicleId": vehicle.id, "stops": route_stops,
                "distanceKm": round(total_km, 2),
                "durationMinutes": solution.Min(clock.CumulVar(cursor)),
                "loadGrams": load_grams
            })
    return {"routes": routes,
            "unassigned": [
                {"shipmentId": stop.id, "reason": "not_selected_within_constraints"}
                for stop in req.stops if stop.id not in assigned
            ],
            "solverStatus": "feasible_time_limited",
            "optimal": False,
            "matrix": "Valhalla roads; actual configured network; not guaranteed live traffic"}


@app.get("/health")
async def health():
    return {"status": "ready" if os.environ.get("VALHALLA_URL") and
            os.environ.get("LOGISTICS_OPTIMIZER_KEY") else "not_configured"}


@app.post("/v1/optimize")
async def optimize(req: OptimizeRequest,
                   x_logistics_service_key: Annotated[str | None, Header()] = None):
    expected = os.environ.get("LOGISTICS_OPTIMIZER_KEY", "")
    if not expected:
        raise HTTPException(503, "Solver key is not configured")
    if not x_logistics_service_key or not hmac.compare_digest(
        x_logistics_service_key, expected
    ):
        raise HTTPException(401, "Unauthorized")
    times, distances = await valhalla_matrix(req)
    return solve(req, times, distances)
