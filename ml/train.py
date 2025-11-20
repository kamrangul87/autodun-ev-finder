import json
import math
import os
import requests
from pathlib import Path

import csv
import numpy as np

ROOT = Path(__file__).resolve().parent
CSV_PATH = ROOT / "training_data.csv"
MODEL_PATH = ROOT / "model.json"


def load_training_data():
    if not CSV_PATH.exists():
        raise SystemExit(f"Training data not found: {CSV_PATH}")

    xs = []
    ys = []
    with CSV_PATH.open("r", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                power_kw = float(row["power_kw"])
                n_connectors = float(row["n_connectors"])
                has_fast_dc = float(row["has_fast_dc"])
                rating = float(row["rating"])
                has_geo = float(row["has_geo"])
                usage_score = float(row.get("usage_score", 0.0))
                label = float(row["label"])
            except (KeyError, ValueError):
                continue

            xs.append(
                [
                    power_kw,
                    n_connectors,
                    has_fast_dc,
                    rating,
                    has_geo,
                    usage_score,
                ]
            )
            ys.append(label)

    if not xs:
        raise SystemExit("No valid rows in training_data.csv")

    return np.array(xs, dtype=float), np.array(ys, dtype=float)


def compute_caps(X):
    power_kw_max = float(np.percentile(X[:, 0], 95))
    n_connectors_max = float(max(1.0, np.percentile(X[:, 1], 95)))
    rating_max = 5.0

    return {
        "power_kw_max": power_kw_max,
        "n_connectors_max": n_connectors_max,
        "rating_max": rating_max,
    }


def normalise_features(X, caps):
    Xn = X.copy().astype(float)
    power_cap = caps["power_kw_max"]
    conn_cap = caps["n_connectors_max"]
    rating_cap = caps["rating_max"]

    Xn[:, 0] = np.clip(Xn[:, 0] / max(power_cap, 1.0), 0, 1)
    Xn[:, 1] = np.clip(Xn[:, 1] / max(conn_cap, 1.0), 0, 1)
    Xn[:, 3] = np.clip(Xn[:, 3] / max(rating_cap, 1.0), 0, 1)
    Xn[:, 5] = np.clip(Xn[:, 5], 0, 1)

    return Xn


def fit_linear_model(X, y):
    ones = np.ones((X.shape[0], 1), dtype=float)
    Xb = np.hstack([X, ones])

    lam = 1e-3
    XtX = Xb.T @ Xb + lam * np.eye(Xb.shape[1])
    Xty = Xb.T @ y
    theta = np.linalg.solve(XtX, Xty)

    weights = theta[:-1]
    bias = theta[-1]
    return weights, float(bias)


# ---------------------------------------------------------
# ⭐ NEW — SIMPLE METRIC CALCULATIONS
# ---------------------------------------------------------
def compute_metrics(y_true, y_pred):
    # threshold predictions at 0.5 (model outputs 0–1)
    y_hat = (y_pred >= 0.5).astype(int)

    tp = int(np.sum((y_true == 1) & (y_hat == 1)))
    tn = int(np.sum((y_true == 0) & (y_hat == 0)))
    fp = int(np.sum((y_true == 0) & (y_hat == 1)))
    fn = int(np.sum((y_true == 1) & (y_hat == 0)))

    accuracy = (tp + tn) / max(len(y_true), 1)
    precision = tp / max((tp + fp), 1)
    recall = tp / max((tp + fn), 1)

    return {
        "accuracy": round(float(accuracy), 3),
        "precision": round(float(precision), 3),
        "recall": round(float(recall), 3),
    }


def main():
    print("🔧 Loading training data…")
    X, y = load_training_data()

    print(f"  → {len(X)} samples loaded")
    caps = compute_caps(X)
    Xn = normalise_features(X, caps)

    print("🔧 Fitting linear model…")
    weights, bias = fit_linear_model(Xn, y)

    # compute predictions for metrics
    y_pred = Xn @ weights + bias
    y_pred = np.clip(y_pred, 0, 1)

    metrics = compute_metrics(y, y_pred)

    model = {
        "version": os.environ.get("AUTODUN_MODEL_VERSION", "v2-manual"),
        "bias": bias,
        "caps": caps,
        "weights": {
            "power_kw": float(weights[0]),
            "n_connectors": float(weights[1]),
            "has_fast_dc": float(weights[2]),
            "rating": float(weights[3]),
            "has_geo": float(weights[4]),
            "usage_score": float(weights[5]),
        },
    }

    MODEL_PATH.write_text(json.dumps(model, indent=2))
    print(f"✅ Wrote model to {MODEL_PATH}")
    print("Metrics:", metrics)

    # ---------------------------------------------------------
    # ⭐ NEW — store metrics in ml_runs table
    # ---------------------------------------------------------
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

    if supabase_url and supabase_key:
        try:
            payload = {
                "model_version": model["version"],
                "samples_used": int(len(X)),
                "accuracy": metrics["accuracy"],
                "precision": metrics["precision"],
                "recall": metrics["recall"],
                "notes": "GitHub Actions nightly training",
            }

            resp = requests.post(
                f"{supabase_url}/rest/v1/ml_runs",
                headers={
                    "apikey": supabase_key,
                    "Authorization": f"Bearer {supabase_key}",
                    "Content-Type": "application/json",
                    "Prefer": "return=minimal",
                },
                json=payload,
                timeout=10,
            )

            if resp.status_code >= 300:
                print("⚠ Supabase insert failed:", resp.status_code, resp.text)
            else:
                print("✅ Logged run with metrics:", payload)

        except Exception as e:
            print("⚠ Could not insert ml_runs metrics:", e)
    else:
        print("ℹ Supabase credentials missing, skipping metrics logging.")


if __name__ == "__main__":
    main()
