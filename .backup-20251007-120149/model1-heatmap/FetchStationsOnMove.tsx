import { useEffect, useRef, useState } from "react";
import { Filters, useStations } from "../../lib/hooks/useStations";

export function FetchStationsOnMove({
  map,
  filters,
  setStations,
}: {
  map: any;
  filters?: Filters;
  setStations: (arr: any[]) => void;
}) {
  const [bbox, setBbox] = useState<[number, number, number, number] | undefined>();
  const { data } = useStations(bbox, filters);
  useEffect(() => {
    if (!map) return;
    const onMove = () => {
      const b = map.getBounds();
      setBbox([
        b.getNorth(),
        b.getSouth(),
        b.getEast(),
        b.getWest(),
      ]);
    };
    map.on("moveend", onMove);
    onMove();
    return () => map.off("moveend", onMove);
  }, [map]);
  useEffect(() => {
    setStations(data.filter((s) => s.lat && s.lng && s.id));
  }, [data, setStations]);
  return null;
}
