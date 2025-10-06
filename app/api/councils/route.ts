// app/api/councils/route.ts
import { NextResponse } from 'next/server';
import type { FeatureCollection } from 'geojson';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const ONS_URL = process.env.COUNCIL_GEO_URL ||
  'https://ons-inspire.esriuk.com/arcgis/rest/services/Administrative_Boundaries/Local_Authority_Districts_December_2023_UK_BGC/FeatureServer/0/query?where=UPPER(LAD23NM)%20LIKE%20%27%25LONDON%25%27&outFields=LAD23NM,LAD23CD&outSR=4326&f=geojson';
const STATIC_PATH = process.cwd() + '/data/london-boroughs.geojson';
let cachedGeoJson: FeatureCollection | null = null;
let lastFetch = 0;
const CACHE_MS = 86400 * 1000;


function emptyFC(): FeatureCollection {
  return { type: 'FeatureCollection', features: [] };
}

function logCouncilLoad(geojson: FeatureCollection, source: string) {
  if (geojson?.features?.length) {
    console.info(`[CouncilLayer] Loaded ${geojson.features.length} features from ${source}`);
  } else {
    console.warn(`[CouncilLayer] WARNING: No council features loaded from ${source}`);
  }
}

export async function GET() {
  const now = Date.now();
  if (cachedGeoJson && now - lastFetch < CACHE_MS) {
    logCouncilLoad(cachedGeoJson, 'cache');
    return NextResponse.json(cachedGeoJson, {
      headers: { 'Cache-Control': 's-maxage=86400, stale-while-revalidate=86400' }
    });
  }
  let geojson: FeatureCollection | null = null;
  let source = 'env';
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 10000);
    const upstream = await fetch(ONS_URL, { cache: 'no-store', signal: ac.signal });
    clearTimeout(t);
    if (upstream.ok) {
      geojson = await upstream.json();
      source = 'env';
    }
  } catch (e) {
    source = 'env-fail';
  }
  if (!geojson || !geojson.features?.length) {
    try {
      const fs = require('fs');
      const raw = fs.readFileSync(STATIC_PATH, 'utf8');
      geojson = JSON.parse(raw);
      source = 'static';
    } catch (e) {
      geojson = emptyFC();
      source = 'static-fail';
    }
  }
  cachedGeoJson = geojson;
  lastFetch = now;
  logCouncilLoad(geojson as FeatureCollection, source);
  return NextResponse.json(geojson, {
    headers: { 'Cache-Control': 's-maxage=86400, stale-while-revalidate=86400' }
  });
}
