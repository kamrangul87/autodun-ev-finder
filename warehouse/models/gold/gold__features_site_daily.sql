{{ config(materialized='table') }}

with s as (select * from {{ ref('silver__stations') }}),
days as (select * from range(current_date - 90, current_date + 1, interval 1 day)),
feat as (
  select
    s.station_id,
    (days as d)::date as date,
    s.n_connectors, s.kw_sum, s.has_ccs, s.has_chademo, s.has_type2,
    extract(dow from (days as d)) as dow,
    case when extract(month from (days as d)) in (12,1,2) then 'winter'
         when extract(month from (days as d)) in (3,4,5)  then 'spring'
         when extract(month from (days as d)) in (6,7,8)  then 'summer'
         else 'autumn' end as season
  from s, days
)
select * from feat
