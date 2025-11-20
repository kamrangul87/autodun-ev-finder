import json
import os
import csv
from pathlib import Path

import requests

try:
    import numpy as np
except ImportError:
    raise SystemExit("Please run: pip install numpy")

ROOT = Path(__file__).resolve().parent
CSV_PATH = ROOT / "training_data.csv"
MODEL_PATH = ROOT / "model.json"


# ──────────────────────────
# Data loading
# ──────────────────────────


def load_training_data():
    """
    Load features + label from training_data.csv.

    Expected columns:
      power_kw, n_connectors, has_fast_dc, rating, has_geo, usage_score, label
    """
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
                label = float(row["label"])  # expected 0–1
            except (KeyError, ValueError):
                # Skip bad rows
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


# ──────────────────────────
# Feature scaling
# ──────────────────────────


def compute_caps(X: np.ndarray):
    """Compute clipping caps from the distribution (95th percentile)."""
    power_kw_max = float(np.percentile(X[:, 0], 95))
    n_connectors_max = float(max(1.0, np.percentile(X[:, 1], 95)))
    rating_max = 5.0

    return {
        "power_kw_max": power_kw_max,
        "n_connectors_max": n_connectors_max,
        "rating_max": rating_max,
    }


def normalise_features(X: np.ndarray, caps: dict) -> np.ndarray:
    """Normalise features into roughly 0–1 range, clipping outliers."""
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


# ──────────────────────────
# Linear model
# ──────────────────────────


def fit_linear_model(X: np.ndarray, y: np.ndarray):
    """Ridge-regularised linear regression."""
    ones = np.ones((X.shape[0], 1), dtype=float)
    Xb = np.hstack([X, ones])

    lam = 1e-3
    XtX = Xb.T @ Xb + lam * np.eye(Xb.shape[1])
    Xty = Xb.T @ y
    theta = np.linalg.solve(XtX, Xty)

    weights = theta[:-1]
    bias = theta[-1]
    return weights, float(bias)


def predict_scores(X: np.ndarray, weights: np.ndarray, bias: float) -> np.ndarray:
    """Raw linear predictions (before clamping)."""
    return X @ weights + bias


def clamp01(x: float) -> float:
    return max(0.0, min(1.0, float(x)))


# ──────────────────────────
# Train/test split + metrics
# ──────────────────────────


def train_test_split(X: np.ndarray, y: np.ndarray, test_ratio: float = 0.4):
    """
    Simple deterministic split so results are reproducible.

    Ensures at least 1 train and 1 test sample.
    """
    n = X.shape[0]
    if n < 2:
        raise SystemExit("Need at least 2 samples for train/test split")

    rng = np.random.default_rng(42)
    idx = rng.permutation(n)

    split = int(n * (1 - test_ratio))
    if split <= 0:
        split = 1
    if split >= n:
        split = n - 1

    train_idx = idx[:split]
    test_idx = idx[split:]

    return X[train_idx], X[test_idx], y[train_idx], y[test_idx]


def compute_classification_metrics(y_true_prob: np.ndarray, y_pred_prob: np.ndarray):
    """
    Turn continuous labels (0–1) into binary 0/1 using threshold 0.5,
    then compute accuracy, precision, recall.
    """
    # Convert probs into 0/1 labels
    y_true = (y_true_prob >= 0.5).astype(int)
    y_pred = (y_pred_prob >= 0.5).astype(int)

    tp = int(((y_pred == 1) & (y_true == 1)).sum())
    tn = int(((y_pred == 0) & (y_true == 0)).sum())
    fp = int(((y_pred == 1) & (y_true == 0)).sum())
    fn = int(((y_pred == 0) & (y_true == 1)).sum())

    total = tp + tn + fp + fn
    if total == 0:
        accuracy = None
    else:
        accuracy = (tp + tn) / total

    if tp + fp == 0:
        precision = None
    else:
        precision = tp / (tp + fp)

    if tp + fn == 0:
        recall = None
    else:
        recall = tp / (tp + fn)

    return accuracy, precision, recall


# ──────────────────────────
# Main training entrypoint
# ──────────────────────────


def main():
    print("🔧 Loading training data…")
    X_raw, y = load_training_data()
    print(f"  → {len(X_raw)} samples loaded")

    print("🔧 Computing normalisation caps…")
    caps = compute_caps(X_raw)
    X = normalise_features(X_raw, caps)

    print("🔧 Splitting into train/test…")
    X_train, X_test, y_train, y_test = train_test_split(X, y)
    print(f"  → Train: {len(X_train)}  |  Test: {len(X_test)}")

    print("🔧 Fitting linear model on train set…")
    weights, bias = fit_linear_model(X_train, y_train)
    w_power, w_conn, w_fast, w_rating, w_geo, w_usage = [float(w) for w in weights]

    # Save model.json (same as before)
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

    # ── NEW: evaluate on test split ─────────────────
    print("🔍 Evaluating on test set…")
    raw_scores = predict_scores(X_test, weights, bias)
    y_pred_prob = np.array([clamp01(v) for v in raw_scores], dtype=float)
    y_true_prob = y_test.astype(float)

    accuracy, precision, recall = compute_classification_metrics(
        y_true_prob, y_pred_prob
    )

    print("   Metrics (test set):")
    print("     Accuracy :", accuracy if accuracy is not None else "n/a")
    print("     Precision:", precision if precision is not None else "n/a")
    print("     Recall   :", recall if recall is not None else "n/a")

    metrics = {
        "accuracy": float(accuracy) if accuracy is not None else None,
        "precision": float(precision) if precision is not None else None,
        "recall": float(recall) if recall is not None else None,
    }

    # ── Log to Supabase ml_runs (best-effort) ───────
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

    if supabase_url and supabase_key:
        try:
            payload = {
                "model_version": model["version"],
                # keep total samples as before so charts don’t jump
                "samples_used": int(len(X_raw)),
                "notes": "GitHub Actions nightly training",
                "metrics_json": metrics,
                # optional numeric columns for convenience
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
                print("✅ Logged run to Supabase ml_runs")
        except Exception as e:
            print("⚠ Could not log ml_runs:", e)
    else:
        print("ℹ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set, skipping ml_runs log.")


if __name__ == "__main__":
    main()
