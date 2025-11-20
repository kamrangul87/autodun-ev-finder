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


def clamp01(x):
    return max(0.0, min(1.0, float(x)))


def predict_scores(Xn, weights, bias):
    """
    Use the fitted linear model to produce scores in [0,1].
    """
    raw = Xn @ weights + bias
    # clamp each score to [0,1]
    return np.vectorize(clamp01)(raw)


def compute_binary_metrics(y_true, scores, threshold=0.5):
    """
    Simple accuracy / precision / recall on a 0/1 label.

    y_true: array of 0/1 labels
    scores: model scores in [0,1]
    threshold: score >= threshold → predict 1
    """
    y_true = np.asarray(y_true).astype(int)
    y_pred = (np.asarray(scores) >= threshold).astype(int)

    assert y_true.shape == y_pred.shape

    tp = int(np.sum((y_true == 1) & (y_pred == 1)))
    tn = int(np.sum((y_true == 0) & (y_pred == 0)))
    fp = int(np.sum((y_true == 0) & (y_pred == 1)))
    fn = int(np.sum((y_true == 1) & (y_pred == 0)))

    n = len(y_true)
    accuracy = (tp + tn) / n if n > 0 else 0.0
    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0

    metrics = {
        "accuracy": float(accuracy),
        "precision": float(precision),
        "recall": float(recall),
        "tp": tp,
        "tn": tn,
        "fp": fp,
        "fn": fn,
        "samples_used": n,
    }
    return metrics


def main():
    print("🔧 Loading training data…")
    X, y = load_training_data()

    print(f"  → {len(X)} samples loaded")
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

    # ✅ NEW: compute scores + metrics
    print("🔍 Computing training metrics…")
    scores = predict_scores(Xn, weights, bias)
    metrics = compute_binary_metrics(y, scores, threshold=0.5)
    print(
        f"   Accuracy: {metrics['accuracy']:.3f}, "
        f"Precision: {metrics['precision']:.3f}, "
        f"Recall: {metrics['recall']:.3f}"
    )

    # ✅ Log training run to Supabase ml_runs (best-effort)
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

    if supabase_url and supabase_key:
        try:
            payload = {
                "model_version": model["version"],
                "samples_used": int(len(X)),
                "notes": "GitHub Actions nightly training",
                # metrics_json is what the admin UI reads
                "metrics_json": {
                    "accuracy": metrics["accuracy"],
                    "precision": metrics["precision"],
                    "recall": metrics["recall"],
                },
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
                print("✅ Logged run to Supabase ml_runs")
        except Exception as e:
            print("⚠ Could not log ml_runs:", e)
    else:
        print("ℹ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set, skipping ml_runs log.")


if __name__ == "__main__":
    main()
