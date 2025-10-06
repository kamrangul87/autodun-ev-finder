"use client";
import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";

export default function CouncilLayer() {
  const map = useMap();
  const layerRef = useRef<any>(null);
  const geoJsonRef = useRef<any>(null);

  useEffect(() => {
    if (!map.getPane("council")) {
      map.createPane("council");
    }
    const councilPane = map.getPane("council");
    if (councilPane) councilPane.style.zIndex = "450";
    fetch("/api/councils")
      .then((res) => res.json())
      .then((geojson) => {
        if (!geojson?.features?.length) {
          console.warn("[CouncilLayer] No council features loaded");
          return;
        }
        import("leaflet").then((L) => {
          const style = {
            color: "#ff7a00",
            weight: 2,
            opacity: 0.95,
            fill: false,
            dashArray: "6,4",
          };
          const highlight = {
            weight: 3,
            opacity: 1,
          };
          const layer = L.geoJSON(geojson, {
            pane: "council",
            style: () => style,
            onEachFeature: (feature, lyr) => {
              lyr.on({
                mouseover: () => (lyr as any).setStyle(highlight),
                mouseout: () => (lyr as any).setStyle(style),
              });
              const name = feature?.properties?.name || feature?.properties?.LAD23NM;
              if (name) {
                lyr.bindTooltip(name, {
                  direction: "top",
                  className: "council-tooltip",
                  sticky: true,
                });
              }
            },
          });
          layer.addTo(map);
          layerRef.current = layer;
        });
      });
    return () => {
      if (layerRef.current && map.hasLayer(layerRef.current)) {
        map.removeLayer(layerRef.current);
      }
    };
  }, [map]);
  return null;
}
