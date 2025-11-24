"use client";

import React, { useMemo } from "react";

type Row = {
  ts: string | null;
  stationId: string | number | null;
  vote: string;
  source: string;
  lat: number | null;
  lng: number | null;
  mlScore: number | null; // 0..1
  modelVersion: string;
  userAgent: string;
};

type Props = {
  rows: Row[];
};

type Aggregated = {
  stationId: string;
  count: number;
  badCount: number;
  avgScorePct: number; // 0–100
  badPct: number; // 0–100
  lastTs: string | null;
  lastSource: string | null;
};

export default function WorstStations({ rows }: Props) {
  const items = useMemo<Aggregated[]>(() => {
    const byStation = new Map<string, Aggregated>();

    for (const r of rows) {
      const id = r.stationId != null ? String(r.stationId) : null;
      const score =
        typeof r.mlScore === "number" && Number.isFinite(r.mlScore)
          ? r.mlScore
          : null;

      if (!id || score == null) continue;

      let agg = byStation.get(id);
      if (!agg) {
        agg = {
          stationId: id,
          count: 0,
          badCount: 0,
          avgScorePct: 0,
          badPct: 0,
          lastTs: null,
          lastSource: null,
        };
        byStation.set(id, agg);
      }

      agg.count += 1;
      agg.avgScorePct += score * 100;

      // simple rule: score < 0.5 => “bad”
      if (score < 0.5) {
        agg.badCount += 1;
      }

      if (!agg.lastTs || (r.ts && r.ts > agg.lastTs)) {
        agg.lastTs = r.ts;
        agg.lastSource = r.source || null;
      }
    }

    const out: Aggregated[] = [];
    byStation.forEach((agg) => {
      if (agg.count === 0) return;
      agg.avgScorePct = agg.avgScorePct / agg.count;
      agg.badPct = agg.badCount > 0 ? (agg.badCount / agg.count) * 100 : 0;
      out.push({ ...agg });
    });

    // worst first (lowest average score)
    out.sort((a, b) => a.avgScorePct - b.avgScorePct);
    return out.slice(0, 10);
  }, [rows]);

  if (!items.length) {
    return (
      <div style={{ fontSize: 13, color: "#6b7280" }}>
        No stations to show yet. Try widening the date range or removing
        filters.
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontWeight: 800, marginBottom: 8 }}>
        Worst stations (by ML score)
      </div>
      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 12,
          }}
        >
          <thead>
            <tr>
              <th
                style={{
                  textAlign: "left",
                  padding: "6px 8px",
                  borderBottom: "1px solid #e5e7eb",
                  whiteSpace: "nowrap",
                }}
              >
                Station
              </th>
              <th
                style={{
                  textAlign: "left",
                  padding: "6px 8px",
                  borderBottom: "1px solid #e5e7eb",
                  whiteSpace: "nowrap",
                }}
              >
                Feedback
              </th>
              <th
                style={{
                  textAlign: "left",
                  padding: "6px 8px",
                  borderBottom: "1px solid #e5e7eb",
                  whiteSpace: "nowrap",
                }}
              >
                Avg score
              </th>
              <th
                style={{
                  textAlign: "left",
                  padding: "6px 8px",
                  borderBottom: "1px solid #e5e7eb",
                  whiteSpace: "nowrap",
                }}
              >
                Bad %
              </th>
              <th
                style={{
                  textAlign: "left",
                  padding: "6px 8px",
                  borderBottom: "1px solid #e5e7eb",
                  whiteSpace: "nowrap",
                }}
              >
                Last feedback
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.stationId}>
                <td
                  style={{
                    padding: "6px 8px",
                    borderBottom: "1px solid #f3f4f6",
                    whiteSpace: "nowrap",
                  }}
                >
                  {it.stationId}
                </td>
                <td
                  style={{
                    padding: "6px 8px",
                    borderBottom: "1px solid #f3f4f6",
                    whiteSpace: "nowrap",
                  }}
                >
                  {it.count}
                </td>
                <td
                  style={{
                    padding: "6px 8px",
                    borderBottom: "1px solid #f3f4f6",
                    whiteSpace: "nowrap",
                  }}
                >
                  {it.avgScorePct.toFixed(1)}%
                </td>
                <td
                  style={{
                    padding: "6px 8px",
                    borderBottom: "1px solid #f3f4f6",
                    whiteSpace: "nowrap",
                  }}
                >
                  {it.badPct.toFixed(0)}%
                </td>
                <td
                  style={{
                    padding: "6px 8px",
                    borderBottom: "1px solid #f3f4f6",
                    whiteSpace: "nowrap",
                  }}
                >
                  {it.lastTs ? (
                    <>
                      {it.lastTs.slice(0, 10)}
                      {it.lastSource ? ` · ${it.lastSource}` : ""}
                    </>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
