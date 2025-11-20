import json
import os
import requests
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent
CSV_PATH = ROOT / "training_data.csv"
MODEL_PATH = ROOT / "model.json"


def load_training_data():
    """
    Load ALL rows from training_data.csv.

    CSV format:
    power_kw,n_connectors,has_fast_dc,rating,has_geo,usage_score,label
    """
    if not CSV_PATH.exists():
        raise SystemExit(f"Training data not found: {CSV_PATH}")

    try:
        # Read numeric data, skip the header row
        data = np.loadtxt(CSV_PATH, delimiter=",", skiprows=1)
    except Exception as e:
        raise SystemExit(f"Failed to load training data from {CSV_PATH}: {e}")

    if data.ndim == 1:
        # single-row edge case
        data = data.reshape(1, -1)

    # data shape: (n_samples, 7)  -> 6 features + 1 label
    n_samples, n_cols = data.shape
    print(f"📁 DEBUG: loaded matrix from CSV: {n_samples} rows x {n_cols} cols")

    if n_cols < 7:
        raise SystemExit(
            f"Expected at least 7 columns in {CSV_PATH}, found {n_cols}"
        )

    X = data[:, :-1]  # first 6 columns
    y = data[:, -1]   # last column = label

    return X.astype(float), y.astype(float)


def compute_caps(X: np.ndarray):
    power_kw_max = float(np.percentile(X[:, 0], 95))
    n_connectors_max = float(max(1.0, np.percentile(X[:, 1], 95)))
    rating_max = 5.0

    return {
        "power_kw_max": power_kw_max,
        "n_connectors_max": n_connectors_max,
        "rating_max": rating_max,
    }


def normalise_features(X: np.ndarray, caps: dict) -> np.ndarray:
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


def fit_linear_model(X: np.ndarray, y: np.ndarray):
    ones = np.ones((X.shape[0], 1), dtype=float)
    Xb = np.hstack([X, ones])

    lam = 1e-3
    XtX = Xb.T @ Xb + lam * np.eye(Xb.shape[1])
    Xty = Xb.T @ y
    theta = np.linalg.solve(XtX, Xty)

    weights = theta[:-1]
    bias = theta[-1]
    return weights, float(bias)


def evaluate_model(X: np.ndarray, y: np.ndarray, weights: np.ndarray, bias: float):
    if len(X) == 0:
        return {"accuracy": None, "precision": None, "recall": None}

    logits = X @ weights + bias
    preds = (logits >= 0.5).astype(float)

    correct = float((preds == y).sum())
    accuracy = correct / float(len(y))

    tp = float(((preds == 1) & (y == 1)).sum())
    fp = float(((preds == 1) & (y == 0)).sum())
    fn = float(((preds == 0) & (y == 1)).sum())

    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / (tp + fn) > 0 and tp / (tp + fn) or 0.0

    return {
        "accuracy": accuracy,
        "precision": precision,
        "recall": recall,
    }


def main():
    print("🔧 Loading training data…")
    X, y = load_training_data()
    print(f"  → {len(X)} samples loaded (this should match CSV rows)")

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

    MODEL_PATH.write_text(json.dumps(model, indent=2))
    print(f"✅ Wrote model to {MODEL_PATH}")
    print("   Version:", model["version"])
    print("   Caps:", model["caps"])
    print("   Weights:", model["weights"])

    # ── real metrics with simple train/test split ──
    n = len(Xn)
    if n < 3:
        metrics = evaluate_model(Xn, y, weights, bias)
    else:
        rng = np.random.default_rng(42)
        perm = rng.permutation(n)
        split = max(1, int(n * 0.8))
        test_idx = perm[split:]

        X_test = Xn[test_idx]
        y_test = y[test_idx]

        metrics = evaluate_model(X_test, y_test, weights, bias)

    acc = metrics["accuracy"]
    prec = metrics["precision"]
    rec = metrics["recall"]

    print(
        f"📊 Computing training metrics…\n"
        f"   Accuracy: {acc:.3f}, Precision: {prec:.3f}, Recall: {rec:.3f}"
    )

    # ── log to Supabase ml_runs ──
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

    if supabase_url and supabase_key:
        payload = {
            "model_version": model["version"],
            "samples_used": int(len(X)),  # <-- will be 50 now
            "notes": "GitHub Actions nightly training",
            "metrics_json": {
                "accuracy": acc,
                "precision": prec,
                "recall": rec,
            },
            "accuracy": acc,
            "precision": prec,
            "recall": rec,
        }

        try:
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
