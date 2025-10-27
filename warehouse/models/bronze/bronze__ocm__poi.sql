{{ config(materialized='view') }}
select provider, ext_id, json(raw) as raw, ingested_at
from read_parquet('data/bronze/ocm_poi.parquet')
