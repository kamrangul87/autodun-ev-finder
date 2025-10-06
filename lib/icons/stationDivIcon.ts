// lib/icons/stationDivIcon.ts
'use client';
import L from 'leaflet';

export function createStationDivIcon(size = 28) {
  const w = size, h = Math.round(size * 1.35);
  const svg = `
  <svg width="${w}" height="${h}" viewBox="0 0 32 44" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#3BA9FF"/>
        <stop offset="100%" stop-color="#0A74FF"/>
      </linearGradient>
    </defs>
    <path d="M16 0c8.3 0 15 6.7 15 15 0 10.5-12.4 19.6-14.4 28.2a1 1 0 0 1-1.2 0C13.4 34.6 1 25.5 1 15 1 6.7 7.7 0 16 0z" fill="url(#g)" stroke="#0B5ED7" stroke-width="1.2" />
    <circle cx="16" cy="15" r="8.5" fill="white" />
    <path d="M12.2 15h8v2.2c0 2.1-1.7 3.8-3.8 3.8h-0.4c-2.1 0-3.8-1.7-3.8-3.8V15zm1.1-4.6h1.6v3h-1.6v-3zm4.8 0h1.6v3h-1.6v-3z" fill="#0B5ED7"/>
  </svg>`.trim();

  return L.divIcon({
    className: 'station-pin',
    html: svg,
    iconSize: [w, h],
    iconAnchor: [w / 2, h - 2],
    popupAnchor: [0, -h + 8],
  });
}
