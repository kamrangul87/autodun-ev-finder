import json
import os
from pathlib import Path
import csv
import math

import requests

try:
    import numpy as np
except ImportError:
    raise SystemExit("Please run: pip install numpy")

ROOT = Path(__file__).resolve().parent
CSV_PATH = ROOT / "training_data.csv"
MODEL_PATH = ROOT / "model.json"


def load_training_data():
    """
    Load training data from training_data.csv

    Also print how many rows were loaded vs skipped so we can debug
    why Samples is still 5.
    """
    if not CSV_PATH.exists():
        raise SystemExit(f"Training data not found: {CSV_PATH}")

    xs = []
    ys = []
    skipped = 0

    with CSV_PATH.open("r", newline="") as f:
        reader = csv.DictReader(f)
        for idx, row in enumerate(reader, start=2):  # start=2 (row 1 is header)
            try:
                power_kw = float(row["power_kw"])
                n_connectors = float(row["n_connectors"])
                has_fast_dc = float(row["has_fast_dc"])
                rating = float(row["rating"])
                has_geo = float(row["has_geo"])
                usage_score = float(row["usage_score"])
                label = float(row["label"])
            except (KeyError, ValueError) as e:
                skipped += 1
                # Show the first few bad rows so you can fix CSV if needed
                if skipped <= 5:
                    print(
                        f"  ! Skipping bad row {idx}: {e} | raw={row}"
                    )
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
        raise SystemExit(
            "No valid rows in training_data.csv "
            "(all rows were skipped as bad)."
        )

    print(
        f"  → {len(xs)} samples loaded from CSV "
        f"(skipped {skipped} bad rows)"
    )

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
    # usage_score (already 0-1, but clamp for safety)
    Xn[:, 5] = np.clip(Xn[:, 5], 0, 1)

    return Xn


def fit_linear_model(X, y):
    """Simple ridge-regularized linear regression."""
    ones = np.ones((X.shape[0], 1), dtype=float)
    Xb = np.hstack([X, ones])

    lam = 1e-3
    XtX = Xb.T @ Xb + lam * np.eye(Xb.shape[1])
    Xty = Xb.T @ y
    theta = np.linalg.solve(XtX, Xty)

    weights = theta[:-1]
    bias = theta[-1]
    return weights, float(bias)


def clamp01(x: float) -> float:
    return max(0.0, min(1.0, float(x)))


def compute_metrics(y_true, scores, threshold: float = 0.5):
    """
    Compute accuracy / precision / recall using a 0/1 threshold.
    `scores` are continuous; we clamp them to [0,1] then threshold.
    """
    if len(y_true) == 0:
        return {"accuracy": 0.0, "precision": 0.0, "recall": 0.0}

    scores = np.array(scores, dtype=float)
    y_true = np.array(y_true, dtype=float)

    probs = np.vectorize(clamp01)(scores)
    y_pred = (probs >= threshold).astype(float)

    tp = float(np.sum((y_pred == 1) & (y_true == 1)))
    tn = float(np.sum((y_pred == 0) & (y_true == 0)))
    fp = float(np.sum((y_pred == 1) & (y_true == 0)))
    fn = float(np.sum((y_pred == 0) & (y_true == 1)))

    accuracy = (tp + tn) / max(tp + tn + fp + fn, 1.0)
    precision = tp / max(tp + fp, 1.0)
    recall = tp / max(tp + fn, 1.0)

    return {
        "accuracy": accuracy,
        "precision": precision,
        "recall": recall,
    }


def main():
    print("🔧 Loading training data…")
    X, y = load_training_data()  # prints how many loaded / skipped

    n_samples = len(X)
    print(f"  Total usable samples: {n_samples}")

    caps = compute_caps(X)
    Xn = normalise_features(X, caps)

    # ── Train/test split (deterministic so every run is comparable) ──
    np.random.seed(42)
    indices = np.arange(n_samples)
    np.random.shuffle(indices)

    split = max(1, int(0.8 * n_samples))  # 80% train, 20% test
    train_idx = indices[:split]
    test_idx = indices[split:]

    X_train, y_train = Xn[train_idx], y[train_idx]
    X_test, y_test = Xn[test_idx], y[test_idx]

    print("🔧 Fitting linear model…")
    weights, bias = fit_linear_model(X_train, y_train)

    w_power, w_conn, w_fast, w_rating, w_geo, w_usage = [
        float(w) for w in weights
    ]

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

    # ✅ Write model.json
    MODEL_PATH.write_text(json.dumps(model, indent=2))
    print(f"✅ Wrote model to {MODEL_PATH}")
    print("   Version:", model["version"])
    print("   Caps:", model["caps"])
    print("   Weights:", model["weights"])

    # ── Compute real metrics on the test split ──
    print("🔍 Computing training metrics on held-out test data…")
    test_scores = (X_test @ weights) + bias
    metrics = compute_metrics(y_test, test_scores, threshold=0.5)

    acc = metrics["accuracy"]
    prec = metrics["precision"]
    rec = metrics["recall"]

    print(
        f"   Accuracy: {acc:.3f}, Precision: {prec:.3f}, Recall: {rec:.3f}"
    )

    # ✅ Log training run to Supabase ml_runs (best-effort)
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

    if supabase_url and supabase_key:
        try:
            payload = {
                "model_version": model["version"],
                # count ALL usable samples, not just test split
                "samples_used": int(n_samples),
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
                print(
                    "⚠ Supabase ml_runs insert failed:",
                    resp.status_code,
                    resp.text,
                )
            else:
                print("✅ Logged run to Supabase ml_runs")
        except Exception as e:
            print("⚠ Could not log ml_runs:", e)
    else:
        print(
            "ℹ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set, "
            "skipping ml_runs log."
        )


if __name__ == "__main__":
    main()
