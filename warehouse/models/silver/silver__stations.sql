{{ config(materialized='table') }}

with src as (select * from {{ ref('bronze__ocm__poi') }}),
parsed as (
  select
    provider || ':' || json_extract_string(raw, '$.ID') as station_id,
    provider,
    json_extract_string(raw, '$.ID') as ext_id,
    coalesce(json_extract_string(raw, '$.AddressInfo.Title'), 'Unknown') as name,
    json_extract(raw, '$.AddressInfo.Latitude')::double  as lat,
    json_extract(raw, '$.AddressInfo.Longitude')::double as lng,
    json_extract_string(raw, '$.AddressInfo.Postcode')   as postcode,
    json_extract_string(raw, '$.OperatorInfo.Title')     as operator,
    json_extract(raw, '$.Connections')                   as connections_json,
    ingested_at
  from src
),
norm as (
  select
    station_id, provider, ext_id, name, lat, lng, postcode, operator, connections_json, ingested_at,
    (select any(lower(json_extract_string(c,'$.ConnectionType.Title')) like '%ccs%' or lower(json_extract_string(c,'$.ConnectionType.FormalName')) like '%ccs%' or lower(json_extract_string(c,'$.ConnectionType.Title')) like '%combo%') from json_each(connections_json) t(c)) as has_ccs,
    (select any(lower(json_extract_string(c,'$.ConnectionType.Title')) like '%chademo%') from json_each(connections_json) t(c)) as has_chademo,
    (select any(lower(json_extract_string(c,'$.ConnectionType.Title')) like '%type 2%' or lower(json_extract_string(c,'$.ConnectionType.FormalName')) like '%type 2%') from json_each(connections_json) t(c)) as has_type2,
    (select sum(coalesce(json_extract(c,'$.Quantity')::int,1)) from json_each(connections_json) t(c)) as n_connectors,
    (select sum(coalesce(json_extract(c,'$.PowerKW')::double,0.0)) from json_each(connections_json) t(c)) as kw_sum
  from parsed
)
select
  station_id, provider, ext_id, name, lat, lng, postcode, operator,
  connections_json as connectors,
  coalesce(has_ccs,false) as has_ccs,
  coalesce(has_chademo,false) as has_chademo,
  coalesce(has_type2,false) as has_type2,
  coalesce(n_connectors,0) as n_connectors,
  coalesce(kw_sum,0.0) as kw_sum,
  false as is_council,
  ingested_at as last_seen
from norm
where lat is not null and lng is not null
