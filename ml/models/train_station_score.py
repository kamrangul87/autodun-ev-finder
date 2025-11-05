import json, joblib, pandas as pd
from pathlib import Path
from sklearn.model_selection import train_test_split
from sklearn.metrics import r2_score, mean_squared_error
from sklearn.ensemble import RandomForestRegressor
try:
    from lightgbm import LGBMRegressor; USE_LGBM = True
except Exception:
    USE_LGBM = False

ARTIFACTS = Path("ml/artifacts"); ARTIFACTS.mkdir(parents=True, exist_ok=True)
REGISTRY = Path("ml/registry/station_score_v1"); REGISTRY.mkdir(parents=True, exist_ok=True)
FEATURES_PATH = ARTIFACTS / "features.parquet"
MODEL_PATH, METRICS_PATH = REGISTRY / "model.pkl", REGISTRY / "metrics.json"
FEATURES = ["power_kw","n_connectors","has_fast_dc","rating","usage_score","has_geo"]; TARGET = "target"

if not FEATURES_PATH.exists():
    raise SystemExit("Run: python ml/features/build_features.py first.")

df = pd.read_parquet(FEATURES_PATH)
X, y = df[FEATURES], df[TARGET]
Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.2, random_state=42)

model = LGBMRegressor(n_estimators=200, learning_rate=0.08, subsample=0.9, colsample_bytree=0.9, random_state=42) if USE_LGBM else RandomForestRegressor(n_estimators=300, random_state=42, n_jobs=-1)
model.fit(Xtr, ytr)
yp = model.predict(Xte)
metrics = {"framework": "lightgbm" if USE_LGBM else "sklearn-rf",
           "r2": float(r2_score(yte, yp)),
           "rmse": float(mean_squared_error(yte, yp, squared=False)),
           "n_train": int(len(Xtr)), "n_test": int(len(Xte)), "features": FEATURES}
joblib.dump(model, MODEL_PATH)
METRICS_PATH.write_text(json.dumps(metrics, indent=2))
print(f"Saved model → {MODEL_PATH.resolve()}")
print(f"Metrics → {METRICS_PATH.resolve()}")
print("Training complete:", metrics)
