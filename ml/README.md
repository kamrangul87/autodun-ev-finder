# Autodun ML Scorer (isolated)
Standalone FastAPI service to score EV stations. Separate from the main app.

## Quickstart
```bash
pip install -r requirements-ml.txt
python ml/features/build_features.py
python ml/models/train_station_score.py
uvicorn ml.jobs.serve:app --host 0.0.0.0 --port 8000
```

## Install & train
```bash
pip install -r requirements-ml.txt
python ml/features/build_features.py
python ml/models/train_station_score.py
```

## Run the API
```bash
export AUTODUN_SCORER_KEY=change-me   # optional but recommended
uvicorn ml.jobs.serve:app --host 0.0.0.0 --port 8000
```

## Test
```bash
# health
curl -s https://$REPLIT_URL/health

# score
curl -s -X POST https://$REPLIT_URL/score \
  -H "Content-Type: application/json" \
  -H "X-Autodun-Key: change-me" \
  -d '{"power_kw":50,"n_connectors":3,"has_fast_dc":1,"rating":4.6,"usage_score":1,"has_geo":1}'
```
