import json
import math
import os
import requests
from pathlib import Path

import csv

try:
    import numpy as np
except ImportError:
    raise SystemExit("Please run: pip install numpy")

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

    # power_kw
    Xn[:, 0] = np.clip(Xn[:, 0] / max(power_cap, 1.0), 0, 1)
    # n_connectors
    Xn[:, 1] = np.clip(Xn[:, 1] / max(conn_cap, 1.0), 0, 1)
    # rating
    Xn[:, 3] = np.clip(Xn[:, 3] / max(rating_cap, 1.0), 0, 1)
    # usage_score
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


def clamp01(x: float | None):
    if x is None:
        return None
    return max(0.0, min(1.0, float(x)))


def evaluate_model_leave_one_out(X_raw: np.ndarray, y_raw: np.ndarray):
    """
    Proper evaluation: leave-one-out cross validation.
    For each row i:
      - train on all rows except i
      - test on row i
    """
    n = len(X_raw)
    if n < 3:
        print("⚠ Not enough samples for evaluation; skipping metrics.")
        return {"accuracy": None, "precision": None, "recall": None}

    tp = fp = tn = fn = 0

    for i in range(n):
        mask = np.ones(n, dtype=bool)
        mask[i] = False

        X_train = X_raw[mask]
        y_train = y_raw[mask]
        X_test = X_raw[~mask]
        y_test = y_raw[~mask]

        # Normalise within this fold
        caps = compute_caps(X_train)
        X_train_n = normalise_features(X_train, caps)
        X_test_n = normalise_features(X_test, caps)

        weights, bias = fit_linear_model(X_train_n, y_train)

        scores = X_test_n @ weights + bias
        probs = np.clip(scores, 0, 1)
        preds = (probs >= 0.5).astype(float)

        for p, t in zip(preds, y_test):
            if t == 1 and p == 1:
                tp += 1
            elif t == 0 and p == 1:
                fp += 1
            elif t == 0 and p == 0:
                tn += 1
            elif t == 1 and p == 0:
                fn += 1

    total = tp + tn + fp + fn
    accuracy = (tp + tn) / total if total > 0 else None
    precision = tp / (tp + fp) if (tp + fp) > 0 else None
    recall = tp / (tp + fn) if (tp + fn) > 0 else None

    metrics = {
        "accuracy": clamp01(accuracy),
        "precision": clamp01(precision),
        "recall": clamp01(recall),
    }

    print("📊 Evaluation (leave-one-out):", metrics)
    return metrics


def main():
    print("🔧 Loading training data…")
    X, y = load_training_data()

    print(f"  → {len(X)} samples loaded")

    # Fit final model on ALL data (for production use)
    caps = compute_caps(X)
    Xn = normalise_features(X, caps)

    print("🔧 Fitting linear model…")
    weights, bias = fit_linear_model(Xn, y)

    w_power, w_conn, w_fast, w_rating, w_geo, w_usage = [float(w) for w in weights]

    model = {
        "version": os.environ.get("AUTODUN_MODEL_VERSION", "v2-manual"),
        "bias": bias,
        "caps": caps,
        "weights": {
            "power_kw": w_power,
            "n_connectors": w_conn,
            "has_fast_dc": w_fast,
            "rating": w_rating,
            "has_geo": w_geo,
            "usage_score": w_usage,
        },
    }

    # ✅ Write model.json as before
    MODEL_PATH.write_text(json.dumps(model, indent=2))
    print(f"✅ Wrote model to {MODEL_PATH}")
    print("   Version:", model["version"])
    print("   Caps:", model["caps"])
    print("   Weights:", model["weights"])

    # ✅ REAL metrics via leave-one-out CV
    metrics = evaluate_model_leave_one_out(X, y)

    # ✅ Log training run + metrics to Supabase ml_runs (best-effort)
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

    if supabase_url and supabase_key:
        try:
            payload = {
                "model_version": model["version"],
                "samples_used": int(len(X)),
                "notes": "GitHub Actions nightly training",
                "metrics_json": metrics,
                # also fill numeric columns if you created them
                "accuracy": metrics["accuracy"],
                "precision": metrics["precision"],
                "recall": metrics["recall"],
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
                print("⚠ Supabase ml_runs insert failed:", resp.status_code, resp.text)
            else:
                print("✅ Logged run to Supabase ml_runs with metrics")
        except Exception as e:
            print("⚠ Could not log ml_runs:", e)
    else:
        print("ℹ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set, skipping ml_runs log.")


if __name__ == "__main__":
    main()
