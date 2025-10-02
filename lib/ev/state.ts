"use client";
import { useState } from "react";

export function useEvControls() {
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showMarkers, setShowMarkers] = useState(true);
  const [showPolygons, setShowPolygons] = useState(true);
  const [intensity, setIntensity] = useState(1.0); // 0–1
  const [radius, setRadius] = useState(18);        // px

  return {
    showHeatmap, setShowHeatmap,
    showMarkers, setShowMarkers,
    showPolygons, setShowPolygons,
    intensity, setIntensity,
    radius, setRadius
  };
}
