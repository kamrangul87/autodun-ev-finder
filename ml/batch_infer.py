import duckdb, pathlib, pandas as pd
from datetime import date

DB = "data/autodun.duckdb"
OUT = pathlib.Path("data/gold")
OUT.mkdir(parents=True, exist_ok=True)

def main():
    con = duckdb.connect(DB)
    df = con.execute("select * from gold.features_site_daily").df()
    con.close()
    
    # Stub reliability model
    rel = (0.4 + 0.05*df["n_connectors"].clip(0,10) + 0.1*df["has_ccs"].astype(int) + 0.05*df["has_type2"].astype(int)).clip(0,1)
    reliability = df[["station_id","date"]].copy()
    reliability["reliability"] = rel
    
    # Stub utilization model
    util = df[["station_id","date"]].copy()
    util["util_mean"] = (df["n_connectors"].clip(0,12)/12.0).round(3)
    util["util_p10"] = (util["util_mean"]*0.7).round(3)
    util["util_p90"] = (util["util_mean"]*1.3).clip(0,1).round(3)
    
    reliability.to_parquet(OUT/"reliability_daily.parquet", index=False)
    util.to_parquet(OUT/"utilization_daily.parquet", index=False)
    print("[ml] wrote data/gold/*.parquet")

if __name__ == "__main__":
    main()
