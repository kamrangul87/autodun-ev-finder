import { NextRequest } from "next/server";

export const dynamic = "force-dynamic"; // don't prerender

export async function GET(req: NextRequest) {
  const qRaw = (req.nextUrl.searchParams.get("q") || "").trim();
  if (!qRaw) {
    return new Response(JSON.stringify({ error: "q required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const q = normalizeUKPostcode(qRaw);

  // Prefer GB/postcodes first, then fall back to generic queries
  const tries = [
    `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=gb&postalcode=${encodeURIComponent(
      q
    )}`,
    `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`,
    `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=gb&q=${encodeURIComponent(
      q
    )}`,
  ];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);

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
        const lat = parseFloat(hit.lat);
        const lon = parseFloat(hit.lon);
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          return new Response(
            JSON.stringify({ lat, lon, display_name: hit.display_name, q: qRaw }),
            { headers: { "content-type": "application/json" } }
          );
        }
      }
    }

    return new Response(JSON.stringify({ error: "location not found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  } catch (e: any) {
    const status = e?.name === "AbortError" ? 504 : 502;
    return new Response(JSON.stringify({ error: "geocode failed" }), {
      status,
      headers: { "content-type": "application/json" },
    });
  } finally {
    clearTimeout(timer);
  }
}

function normalizeUKPostcode(input: string) {
  // Turn "ig45hr" -> "IG4 5HR" (keep original if it doesn't look like a UK postcode)
  const s = input.toUpperCase().replace(/\s+/g, "");
  if (s.length < 5 || s.length > 7) return input.trim();
  return s.slice(0, s.length - 3) + " " + s.slice(-3);
}
