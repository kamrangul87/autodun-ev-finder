import { useEffect, useRef, useState } from "react";

export type Filters = { conn?: string[]; minPower?: number; source?: "ocm" | "ocpi" | "all" };

export function useStations(
  bbox?: [number, number, number, number],
  filters?: Filters
): { data: any[]; loading: boolean; error?: string } {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!bbox) {
      setData([]);
      setLoading(false);
      setError(undefined);
      return;
    }
    setLoading(true);
    setError(undefined);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams({
        north: String(bbox[0]),
        south: String(bbox[1]),
        east: String(bbox[2]),
        west: String(bbox[3]),
      });
      if (filters?.minPower) params.set("minPower", String(filters.minPower));
      if (filters?.conn && filters.conn.length)
        params.set("conn", filters.conn.join(","));
      if (filters?.source) params.set("source", filters.source);
      fetch(`/api/stations?${params.toString()}`, { signal: controller.signal })
        .then(async (r) => {
          if (!r.ok) throw new Error("API error");
          return r.json();
        })
        .then((arr) => {
          setData(Array.isArray(arr) ? arr : []);
          setLoading(false);
        })
        .catch((e) => {
          if (controller.signal.aborted) return;
          setError(e?.message || String(e));
          setData([]);
          setLoading(false);
        });
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bbox?.join(), JSON.stringify(filters)]);

  return { data, loading, error };
}
