import numpy as np, pandas as pd
from pathlib import Path

ARTIFACTS = Path("ml/artifacts"); ARTIFACTS.mkdir(parents=True, exist_ok=True)
DATA_PATH = Path("data/stations.parquet")
OUT_PATH = ARTIFACTS / "features.parquet"
RNG = np.random.default_rng(42)

def synthesize(n=250):
    df = pd.DataFrame({
        "power_kw": RNG.uniform(3.0, 350.0, n),
        "n_connectors": RNG.integers(1, 12, n),
        "has_fast_dc": RNG.integers(0, 2, n),
        "rating": RNG.uniform(2.5, 5.0, n),
        "usage_score": RNG.integers(0, 2, n),
        "has_geo": RNG.integers(0, 2, n),
    })
    df["target"] = (
        0.002*df["power_kw"] + 0.05*df["n_connectors"] + 0.15*df["has_fast_dc"] +
        0.10*df["rating"] + 0.10*df["usage_score"] + 0.05*df["has_geo"] +
        RNG.normal(0, 0.05, n)
    ).clip(0, 1)
    return df

def load_or_synthesize():
    if DATA_PATH.exists():
        df = pd.read_parquet(DATA_PATH)
        cols = ["power_kw","n_connectors","has_fast_dc","rating","usage_score","has_geo","target"]
        missing = [c for c in cols if c not in df.columns]
        if missing: raise ValueError(f"stations.parquet missing columns: {missing}")
        return df[cols].copy()
    return synthesize()

if __name__ == "__main__":
    df = load_or_synthesize()
    df.to_parquet(OUT_PATH, index=False)
    print(f"Wrote features → {OUT_PATH.resolve()}  rows={len(df)}")
