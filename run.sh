#!/usr/bin/env bash
set -euo pipefail

# Install dependencies
if [ -f package.json ]; then npm i --silent; fi
python -m pip install --upgrade pip >/dev/null 2>&1 || true
python -m pip install -r requirements.txt >/dev/null 2>&1 || true

# Set dbt environment
export DBT_PROFILES_DIR="$(pwd)/warehouse"

# Create directories
mkdir -p data/bronze data/gold exports

# Run pipeline (allow failures to continue)
echo "[run.sh] Running ingest..."
python ingest/ocm_pull.py || true

echo "[run.sh] Running dbt..."
dbt build --project-dir warehouse || true

echo "[run.sh] Running ML inference..."
python ml/batch_infer.py || true

echo "[run.sh] Exporting data..."
python serve/export_jobs.py || true

# Start services
echo "[run.sh] Starting services..."
npx concurrently -k \
  "next dev -p 3000" \
  "uvicorn serve.app:app --host 0.0.0.0 --port 8000" \
  "node scripts/proxy-ml.js"
