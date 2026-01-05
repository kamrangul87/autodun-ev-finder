import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.EV_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.EV_SUPABASE_SERVICE_ROLE_KEY;

// Your upstream feed (replace tomorrow with your real source)
const UPSTREAM_URL = process.env.EV_UPSTREAM_URL; // e.g. your current feed or combined feeds

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing EV_SUPABASE_URL or EV_SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (!UPSTREAM_URL) {
  console.error("Missing EV_UPSTREAM_URL");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normStation(item) {
  // Adjust mapping to your upstream shape
  const lat = toNum(item.lat ?? item.latitude ?? item?.location?.lat);
  const lng = toNum(item.lng ?? item.longitude ?? item.lon ?? item?.location?.lng);

  if (lat == null || lng == null) return null;

  const source = String(item.source ?? item.provider ?? "unknown");
  const source_id = String(item.id ?? item.source_id ?? item.station_id ?? "");

  if (!source_id) return null;

  const connectorsDetailed = Array.isArray(item.connectorsDetailed) ? item.connectorsDetailed : [];
  const connectorsLegacy = Array.isArray(item.connectors) ? item.connectors : [];

  const connectors = connectorsDetailed.length
    ? connectorsDetailed.map((c) => ({
        type: String(c.type ?? ""),
        power_kw: toNum(c.powerKW ?? c.power_kw ?? c.power),
        quantity: Number.isFinite(Number(c.quantity ?? c.count)) ? Number(c.quantity ?? c.count) : 1,
        raw: c,
      }))
    : connectorsLegacy.map((c) => ({
        type: String(c.type ?? ""),
        power_kw: toNum(c.powerKW ?? c.power_kw ?? c.power),
        quantity: Number.isFinite(Number(c.quantity ?? c.count)) ? Number(c.quantity ?? c.count) : 1,
        raw: c,
      }));

  return {
    station: {
      source,
      source_id,
      name: item.name ?? item.title ?? "Charging location",
      address: item.address ?? item.location ?? "",
      postcode: item.postcode ?? item.post_code ?? "",
      city: item.city ?? "",
      lat,
      lng,
      raw: item,
      updated_at: new Date().toISOString(),
    },
    connectors,
  };
}

async function main() {
  const sourceLabel = "upstream"; // can become "ncr", etc

  // Create run row
  const runStart = new Date().toISOString();
  const runRes = await supabase
    .from("ev_ingestion_runs")
    .insert({ source: sourceLabel, status: "running", started_at: runStart })
    .select("id")
    .single();

  const runId = runRes.data?.id;
  if (!runId) throw new Error(`Failed to create run: ${runRes.error?.message}`);

  try {
    const r = await fetch(UPSTREAM_URL, { method: "GET" });
    if (!r.ok) throw new Error(`Upstream fetch failed: ${r.status}`);

    const raw = await r.json();
    const list = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.items)
      ? raw.items
      : Array.isArray(raw?.stations)
      ? raw.stations
      : Array.isArray(raw?.features)
      ? raw.features.map((f) => ({ ...(f.properties || {}), geometry: f.geometry }))
      : [];

    let inserted = 0;
    let updated = 0;

    for (const item of list) {
      const norm = normStation(item);
      if (!norm) continue;

      // upsert station by (source, source_id)
      const upsert = await supabase
        .from("ev_stations")
        .upsert(norm.station, { onConflict: "source,source_id" })
        .select("id")
        .single();

      if (upsert.error) continue;

      const stationId = upsert.data.id;

      // replace connectors (simple + safe)
      await supabase.from("ev_connectors").delete().eq("station_id", stationId);

      if (norm.connectors.length) {
        const rows = norm.connectors.map((c) => ({
          station_id: stationId,
          type: c.type || null,
          power_kw: c.power_kw ?? null,
          quantity: c.quantity ?? 1,
          raw: c.raw ?? null,
          updated_at: new Date().toISOString(),
        }));
        await supabase.from("ev_connectors").insert(rows);
      }

      // We can’t perfectly know insert vs update without extra read; count as updated for now
      updated++;
    }

    const finish = new Date().toISOString();
    await supabase
      .from("ev_ingestion_runs")
      .update({ status: "ok", finished_at: finish, inserted_count: inserted, updated_count: updated })
      .eq("id", runId);

    console.log("OK", { updated });
  } catch (e) {
    const finish = new Date().toISOString();
    await supabase
      .from("ev_ingestion_runs")
      .update({ status: "error", finished_at: finish, error: String(e?.message || e) })
      .eq("id", runId);
    throw e;
  }
}

main().catch((e) => {
  console.error("INGEST FAIL:", e);
  process.exit(1);
});
