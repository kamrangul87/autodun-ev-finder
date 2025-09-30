// app/model1-heatmap/page.tsx
import dynamic from "next/dynamic";
import { useState } from "react";

// 👇 import the map client-only to avoid SSR/hydration issues
const ClientMap = dynamic(() => import("@/components/ClientMap"), {
  ssr: false,
  loading: () => <div style={{ height: "60vh" }} />,
});

const DEFAULT_CENTER: [number, number] = [51.5074, -0.1278]; // London
const DEFAULT_ZOOM = 11;

export default function Page() {
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showMarkers, setShowMarkers] = useState(true);
  const [showCouncil, setShowCouncil] = useState(true);
  const [stationsCount, setStationsCount] = useState(0);

  // Whatever you already use for heatmap tuning:
  const heatOptions = { intensity: 0.6, radius: 22, blur: 14 };

  return (
    <ClientMap
      initialCenter={DEFAULT_CENTER}
      initialZoom={DEFAULT_ZOOM}
      showHeatmap={showHeatmap}
      showMarkers={showMarkers}
      showCouncil={showCouncil}
      heatOptions={heatOptions}
      onStationsCount={setStationsCount}
    />
  );
}
