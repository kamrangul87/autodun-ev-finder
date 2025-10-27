import pathlib, pandas as pd

IN_REL = pathlib.Path("data/gold/reliability_daily.parquet")
IN_UTIL = pathlib.Path("data/gold/utilization_daily.parquet")
OUT = pathlib.Path("exports")
OUT.mkdir(parents=True, exist_ok=True)

def main():
    rel = pd.read_parquet(IN_REL)
    util = pd.read_parquet(IN_UTIL)
    
    day = rel["date"].max()
    rel = rel[rel["date"]==day][["station_id","reliability"]]
    util = util[util["date"]==day][["station_id","util_mean","util_p10","util_p90"]]
    
    rel.to_parquet(OUT/"reliability_scores.parquet", index=False)
    rel.to_csv(OUT/"reliability_scores.csv", index=False)
    util.to_parquet(OUT/"utilization_forecast.parquet", index=False)
    util.to_csv(OUT/"utilization_forecast.csv", index=False)
    
    print(f"[export] wrote exports/* for {day}")

if __name__ == "__main__":
    main()
