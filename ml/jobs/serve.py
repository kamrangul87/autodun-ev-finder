import os, json, joblib, pandas as pd
from pathlib import Path
from typing import Optional
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

REGISTRY = Path("ml/registry/station_score_v1")
MODEL_PATH, METRICS_PATH = REGISTRY/"model.pkl", REGISTRY/"metrics.json"
FEATURES = ["power_kw","n_connectors","has_fast_dc","rating","usage_score","has_geo"]

def check_key(header_key: Optional[str]):
    expected = os.getenv("AUTODUN_SCORER_KEY")
    if expected and header_key != expected:
        raise HTTPException(status_code=401, detail="invalid key")

class StationFeatures(BaseModel):
    power_kw: float = Field(..., ge=0)
    n_connectors: int = Field(..., ge=0)
    has_fast_dc: int = Field(..., ge=0, le=1)
    rating: float = Field(..., ge=0, le=5)
    usage_score: int = Field(..., ge=0, le=1)
    has_geo: int = Field(..., ge=0, le=1)

app = FastAPI(title="Autodun Station Scorer", version="1.0")

@app.on_event("startup")
def _load():
    if not MODEL_PATH.exists() or not METRICS_PATH.exists():
        os.system("python ml/features/build_features.py")
        os.system("python ml/models/train_station_score.py")
    app.state.model = joblib.load(MODEL_PATH)
    app.state.metrics = json.loads(METRICS_PATH.read_text())

@app.get("/health")
def health(): return {"ok": True}

@app.get("/version")
def version(): return {"model": "station_score_v1", "metrics": app.state.metrics}

@app.post("/score")
def score(payload: StationFeatures, x_autodun_key: Optional[str] = Header(default=None)):
    check_key(x_autodun_key)
    row = pd.DataFrame([{k: getattr(payload, k) for k in FEATURES}])
    pred = float(app.state.model.predict(row)[0])
    return {"score": max(0.0, min(1.0, pred)), "model": "station_score_v1", "features_used": FEATURES}
