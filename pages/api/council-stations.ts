import type { NextApiRequest, NextApiResponse } from "next";
import { pointInPolygon } from "../../utils/geo";
import { debugLog } from "../../utils/debug";

export const dynamic = "force-dynamic";

interface Station {
  id: string;
  name: string;
  lat: number;
  lng: number;
  address?: string;
  borough?: string;
  [key: string]: any;
}

/**
 * API endpoint to get stations within a borough
 * Supports both borough name filtering and bbox/polygon filtering
 *
 * Query params:
 * - borough: Borough name (optional)
 * - bbox: Bounding box as "minLng,minLat,maxLng,maxLat" (optional)
 * - polygon: GeoJSON polygon coordinates (optional)
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { borough, bbox, polygon } = req.query;

  try {
    // Fetch stations from main API
    const protocol = (req.headers["x-forwarded-proto"] as string) || "http";
    const host = req.headers.host;
    const baseUrl = `${protocol}://${host}`;

    // Build stations API URL
    let stationsUrl = `${baseUrl}/api/stations`;
    if (bbox) {
      stationsUrl += `?bbox=${bbox}&tiles=2&limitPerTile=1000`;
    } else {
      // Default to full UK if no bbox
      stationsUrl += "?bbox=-8.649,49.823,1.763,60.845&tiles=4&limitPerTile=500";
    }

    debugLog("[council-stations] Fetching from:", stationsUrl);

    const stationsResponse = await fetch(stationsUrl, {
      headers: { "Cache-Control": "no-cache" },
    });

    if (!stationsResponse.ok) {
      throw new Error(`Stations API failed: ${stationsResponse.status}`);
    }

    const stationsData = await stationsResponse.json();
    let stations: Station[] = stationsData.features.map((f: any) => ({
      id: f.properties.id || f.properties.UUID,
      name: f.properties.title || f.properties.AddressInfo?.Title || "Unknown",
      lat: f.geometry.coordinates[1],
      lng: f.geometry.coordinates[0],
      address: f.properties.AddressInfo?.AddressLine1,
      borough: f.properties.AddressInfo?.Town || f.properties.AddressInfo?.County,
      ...f.properties,
    }));

    debugLog("[council-stations] Total stations fetched:", stations.length);

    // Filter by borough name if provided
    if (borough && typeof borough === "string") {
      const boroughLower = borough.toLowerCase();
      stations = stations.filter((s) => {
        const stationBorough = (s.borough || "").toLowerCase();
        const stationName = (s.name || "").toLowerCase();
        const stationAddress = (s.address || "").toLowerCase();

        return (
          stationBorough.includes(boroughLower) ||
          stationName.includes(boroughLower) ||
          stationAddress.includes(boroughLower)
        );
      });

      debugLog(
        "[council-stations] Filtered by borough:",
        borough,
        "→",
        stations.length
      );
    }

    // Filter by polygon if provided
    if (polygon && typeof polygon === "string") {
      try {
        const polygonCoords = JSON.parse(polygon);
        stations = stations.filter((s) =>
          pointInPolygon([s.lng, s.lat], polygonCoords)
        );

        debugLog("[council-stations] Filtered by polygon →", stations.length);
      } catch (err) {
        console.error("[council-stations] Invalid polygon:", err);
      }
    }

    // Return as GeoJSON
    const response = {
      type: "FeatureCollection",
      features: stations.map((s) => ({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [s.lng, s.lat],
        },
        properties: {
          id: s.id,
          title: s.name,
          AddressInfo: {
            Title: s.name,
            AddressLine1: s.address,
            Town: s.borough,
          },
          isCouncil: true,
        },
      })),
      count: stations.length,
      source: "council-filtered",
    };

    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.status(200).json(response);
  } catch (error) {
    console.error("[council-stations] Error:", error);
    res.status(500).json({
      error: "Failed to fetch council stations",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
