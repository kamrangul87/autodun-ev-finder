from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
import pandas as pd, pathlib

app = FastAPI(title="Autodun Nexus – Read-only API")

REL = pathlib.Path("exports/reliability_scores.parquet")
UTIL = pathlib.Path("exports/utilization_forecast.parquet")

def load(path: pathlib.Path):
    if not path.exists():
        raise HTTPException(503, f"{path.name} not ready")
    return pd.read_parquet(path)

@app.get("/scores")
def scores():
    return JSONResponse(load(REL).to_dict(orient="records"))

@app.get("/forecast")
def forecast():
    return JSONResponse(load(UTIL).to_dict(orient="records"))

@app.get("/health")
def health():
    return {"ok": REL.exists() and UTIL.exists()}
