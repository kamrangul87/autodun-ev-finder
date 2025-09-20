import { NextRequest } from "next/server";

export const dynamic = "force-dynamic"; // never prerender

export async function GET(req: NextRequest) {
  const qRaw = (req.nextUrl.searchParams.get("q") || "").trim();
  const latStr = req.nextUrl.searchParams.get("lat");
  const lonStr = req.nextUrl.searchParams.get("lon");
  const lat = latStr ? Number(latStr) : undefined;
  const lon = lonStr ? Number(lonStr) : undefined;

  if (!qRaw) {
    return json({ error: "q required" }, 400);
  }

  const q = normalizeUKPostcode(qRaw);

  // If we have a map center, create a small viewbox (≈30–40km) to bias results near the user.
  const viewbox = lat != null && lon != null ? makeViewbox(lon, lat, 0.35) : undefined;

  // Try, in order:
  // 1) GB postal code search (fast & precise)
  // 2) Bounded search near the map center (GB)
  // 3) "q, United Kingdom"
  // 4) Plain "q" (last resort)
  const tries: string[] = [];

  if (looksLikeUKPostcode(q)) {
    tries.push(
      withParams("https://nominatim.openstreetmap.org/search", {
        format: "json",
        limit: "1",
        countrycodes: "gb",
        postalcode: q,
      }),
    );
  }

  if (viewbox) {
    tries.push(
      withParams("https://nominatim.openstreetmap.org/search", {
        format: "json",
        limit: "1",
        countrycodes: "gb",
        q,
        viewbox,
        bounded: "1",
      }),
    );
  }

  tries.push(
    withParams("https://nominatim.openstreetmap.org/search", {
      format: "json",
      limit: "1",
      q: `${q}, United Kingdom`,
    }),
  );

  tries.push(
    withParams("https://nominatim.openstreetmap.org/search", {
      format: "json",
      limit: "1",
      q,
    }),
  );

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6500);

  try {
    for (const url of tries) {
      const r = await fetch(url, {
        headers: {
          "User-Agent": "Autodun EV Finder/1.0 (+contact@autodun.com)",
          Accept: "application/json",
        },
        cache: "no-store",
        signal: controller.signal,
      });
      if (!r.ok) continue;

      const arr = (await r.json()) as Array<{ lat: string; lon: string; display_name?: string }>;
      if (Array.isArray(arr) && arr.length) {
        const hit = arr[0];
        const hitLat = Number(hit.lat);
        const hitLon = Number(hit.lon);
        if (Number.isFinite(hitLat) && Number.isFinite(hitLon)) {
          clearTimeout(timer);
          return json({ lat: hitLat, lon: hitLon, display_name: hit.display_name, q: qRaw });
        }
      }
    }
    clearTimeout(timer);
    return json({ error: "location not found" }, 404);
  } catch (e: any) {
    clearTimeout(timer);
    const status = e?.name === "AbortError" ? 504 : 502;
    return json({ error: "geocode failed" }, status);
  }
}

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function looksLikeUKPostcode(s: string) {
  const t = s.toUpperCase().replace(/\s+/g, "");
  return /^[A-Z]{1,2}\d[A-Z0-9]?\d[A-Z]{2}$/.test(t);
}

function normalizeUKPostcode(input: string) {
  const s = input.toUpperCase().replace(/\s+/g, "");
  if (looksLikeUKPostcode(s)) return s.slice(0, s.length - 3) + " " + s.slice(-3);
  return input.trim();
}

function withParams(base: string, params: Record<string, string | number | undefined>) {
  const u = new URL(base);
  Object.entries(params).forEach(([k, v]) => {
    if (v != null) u.searchParams.set(k, String(v));
  });
  return u.toString();
}

function makeViewbox(centerLon: number, centerLat: number, delta: number) {
  // viewbox = minlon,minlat,maxlon,maxlat
  const minlon = centerLon - delta;
  const minlat = centerLat - delta;
  const maxlon = centerLon + delta;
  const maxlat = centerLat + delta;
  return `${minlon},${minlat},${maxlon},${maxlat}`;
}
