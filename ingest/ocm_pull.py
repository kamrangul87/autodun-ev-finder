import os, json, pathlib, requests
import pandas as pd
from datetime import datetime, timezone

OUT = pathlib.Path("data/bronze/ocm_poi.parquet")
OUT.parent.mkdir(parents=True, exist_ok=True)

def fetch():
    key = os.environ.get("OCM_API_KEY", "")
    params = {
        "countrycode":"GB",
        "boundingbox":"(49.823,-8.649),(60.845,1.763)",
        "maxresults":"4000",
        "compact":"true",
        "verbose":"false"
    }
    if key:
        params["key"] = key
    r = requests.get("https://api.openchargemap.io/v3/poi/", params=params, timeout=60)
    r.raise_for_status()
    return r.json()

def main():
    data = fetch()
    now = datetime.now(timezone.utc).isoformat()
    rows = [
        {
            "provider": "OCM",
            "ext_id": str(d.get("ID") or ""),
            "raw": json.dumps(d),
            "ingested_at": now
        }
        for d in data
    ]
    pd.DataFrame(rows).to_parquet(OUT, index=False)
    print(f"[ingest] wrote {len(rows)} → {OUT}")

if __name__ == "__main__":
    main()
