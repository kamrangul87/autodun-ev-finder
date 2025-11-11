"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";

// Recharts (client-only)
const ResponsiveContainer = dynamic(
  () => import("recharts").then((m) => m.ResponsiveContainer),
  { ssr: false }
);
const BarChart = dynamic(() => import("recharts").then((m) => m.BarChart), { ssr: false });
const Bar = dynamic(() => import("recharts").then((m) => m.Bar), { ssr: false });
const XAxis = dynamic(() => import("recharts").then((m) => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import("recharts").then((m) => m.YAxis), { ssr: false });
const Tooltip = dynamic(() => import("recharts").then((m) => m.Tooltip), { ssr: false });
const Legend = dynamic(() => import("recharts").then((m) => m.Legend), { ssr: false });

const LineChart = dynamic(() => import("recharts").then((m) => m.LineChart), { ssr: false });
const Line = dynamic(() => import("recharts").then((m) => m.Line), { ssr: false });

const PieChart = dynamic(() => import("recharts").then((m) => m.PieChart), { ssr: false });
const Pie = dynamic(() => import("recharts").then((m) => m.Pie), { ssr: false });
const Cell = dynamic(() => import("recharts").then((m) => m.Cell), { ssr: false });

type Row = {
  ts: string;            // ISO date/time
  vote?: "good" | "neutral" | "bad" | string;
  mlScore?: number | string;
  source?: string;
};

type RangeKey = "7d" | "30d" | "all";

// ---------- CSV helpers ----------
function esc(v: any) {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function toCSV(headers: string[], rows: (string | number)[][]) {
  const lines = [headers.map(esc).join(",")];
  for (const r of rows) lines.push(r.map(esc).join(","));
  return lines.join("\r\n");
}
function downloadCSV(filename: string, csv: string) {
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

export default function AdminFeedbackCharts() {
  const [rows, setRows] = useState<Row[]>([]);
  const [range, setRange] = useState<RangeKey>("7d");
  const [loading, setLoading] = useState<boolean>(false);

  // Fetch once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const r = await fetch("/api/admin/feedback?limit=5000", { cache: "no-store" });
        const data = await r.json();
        if (cancelled) return;
        const items: Row[] = (data?.rows || data || []).map((d: any) => ({
          ts: d.ts ?? d.created_at ?? d.time ?? "",
          vote: (d.vote ?? "").toLowerCase(),
          mlScore: d.mlScore != null ? Number(d.mlScore) : null,
          source: d.source ?? "unknown",
        }));
        setRows(items.filter((x) => x.ts));
      } catch {}
      finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Date helpers
  const startCutoff = useMemo(() => {
    if (range === "all") return null;
    const now = new Date();
    const d = new Date(now);
    if (range === "7d") d.setDate(d.getDate() - 6);
    if (range === "30d") d.setDate(d.getDate() - 29);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [range]);

  const filtered = useMemo(() => {
    if (!startCutoff) return rows;
    return rows.filter((r) => {
      const t = new Date(r.ts);
      return !isNaN(t.getTime()) && t >= startCutoff!;
    });
  }, [rows, startCutoff]);

  // Aggregate by day (stacked + avg)
  const byDay = useMemo(() => {
    const map = new Map<string, { date: string; good: number; neutral: number; bad: number; avg: number; n: number }>();
    for (const r of filtered) {
      const d = new Date(r.ts);
      if (isNaN(d.getTime())) continue;
      const key = d.toISOString().slice(0, 10);
      if (!map.has(key)) map.set(key, { date: key, good: 0, neutral: 0, bad: 0, avg: 0, n: 0 });

      const bucket = map.get(key)!;
      const v = (r.vote || "").toLowerCase();
      if (v === "good") bucket.good += 1;
      else if (v === "bad") bucket.bad += 1;
      else bucket.neutral += 1;

      const ms = Number(r.mlScore);
      if (!isNaN(ms)) {
        bucket.avg = (bucket.avg * bucket.n + ms) / (bucket.n + 1);
        bucket.n += 1;
      }
    }
    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [filtered]);

  // By source (donut)
  const bySource = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of filtered) {
      const s = (r.source || "unknown").toLowerCase();
      map.set(s, (map.get(s) || 0) + 1);
    }
    return [...map.entries()].map(([name, value]) => ({ name, value }));
  }, [filtered]);

  // ---------- Export handlers ----------
  const dayLabels = byDay.map((d) => d.date);
  const stackedGood = byDay.map((d) => d.good);
  const stackedNeutral = byDay.map((d) => d.neutral);
  const stackedBad = byDay.map((d) => d.bad);
  const dayAvg = byDay.map((d) => +d.avg.toFixed(3));
  const sourceLabels = bySource.map((s) => s.name);
  const sourceValues = bySource.map((s) => s.value);

  const safeRangeTag = range === "all" ? "all" : range;
  const todayTag = new Date().toISOString().slice(0, 10);

  const exportDaily = () => {
    const rows = dayLabels.map((d, i) => [
      d,
      stackedGood[i] ?? 0,
      stackedNeutral[i] ?? 0,
      stackedBad[i] ?? 0,
      (stackedGood[i] ?? 0) + (stackedNeutral[i] ?? 0) + (stackedBad[i] ?? 0),
    ]);
    downloadCSV(
      `daily_feedback_${safeRangeTag}_${todayTag}.csv`,
      toCSV(["date", "positive", "neutral", "negative", "total"], rows)
    );
  };

  const exportAvg = () => {
    downloadCSV(
      `avg_ml_score_${safeRangeTag}_${todayTag}.csv`,
      toCSV(["date", "avg_ml_score"], dayLabels.map((d, i) => [d, dayAvg[i] ?? 0]))
    );
  };

  const exportSources = () => {
    downloadCSV(
      `sources_${safeRangeTag}_${todayTag}.csv`,
      toCSV(["source", "count"], sourceLabels.map((n, i) => [n, sourceValues[i] ?? 0]))
    );
  };

  const exportAll = () => {
    const a = toCSV(
      ["date", "positive", "neutral", "negative", "total"],
      dayLabels.map((d, i) => [
        d,
        stackedGood[i] ?? 0,
        stackedNeutral[i] ?? 0,
        stackedBad[i] ?? 0,
        (stackedGood[i] ?? 0) + (stackedNeutral[i] ?? 0) + (stackedBad[i] ?? 0),
      ])
    );
    const b = toCSV(
      ["date", "avg_ml_score"],
      dayLabels.map((d, i) => [d, dayAvg[i] ?? 0])
    );
    const c = toCSV(
      ["source", "count"],
      sourceLabels.map((n, i) => [n, sourceValues[i] ?? 0])
    );
    const merged =
      "Daily Feedback (stacked)\r\n" + a +
      "\r\n\r\nAvg ML Score by Day\r\n" + b +
      "\r\n\r\nFeedback by Source\r\n" + c + "\r\n";
    downloadCSV(`analytics_${safeRangeTag}_${todayTag}.csv`, merged);
  };

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="font-medium text-lg">Analytics</div>

        <div className="ml-auto flex gap-2">
          <button
            className={`px-3 py-1 rounded-full border ${range === "7d" ? "bg-black text-white" : "bg-white"}`}
            onClick={() => setRange("7d")}
          >7 days</button>
          <button
            className={`px-3 py-1 rounded-full border ${range === "30d" ? "bg-black text-white" : "bg-white"}`}
            onClick={() => setRange("30d")}
          >30 days</button>
          <button
            className={`px-3 py-1 rounded-full border ${range === "all" ? "bg-black text-white" : "bg-white"}`}
            onClick={() => setRange("all")}
          >All</button>
        </div>

        {/* Export buttons */}
        <div className="flex gap-2 w-full lg:w-auto">
          <button className="px-3 py-1 rounded-full border" onClick={exportDaily}>Export Daily</button>
          <button className="px-3 py-1 rounded-full border" onClick={exportAvg}>Export Avg ML</button>
          <button className="px-3 py-1 rounded-full border" onClick={exportSources}>Export Sources</button>
          <button className="px-3 py-1 rounded-full border" onClick={exportAll}>Export All</button>
        </div>
      </div>

      {loading && <div className="text-sm opacity-70 mb-3">Loading charts…</div>}

      {/* Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-3 rounded-2xl border">
          <div className="font-medium mb-2">Daily Feedback (stacked)</div>
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={byDay}>
                <XAxis dataKey="date" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="good" stackId="s" />
                <Bar dataKey="neutral" stackId="s" />
                <Bar dataKey="bad" stackId="s" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="p-3 rounded-2xl border">
          <div className="font-medium mb-2">Avg ML Score by Day</div>
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              <LineChart data={byDay}>
                <XAxis dataKey="date" />
                <YAxis domain={[0, 1]} />
                <Tooltip />
                <Line type="monotone" dataKey="avg" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        <div className="p-3 rounded-2xl border lg:col-span-1">
          <div className="font-medium mb-2">Feedback by Source</div>
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={bySource}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={2}
                >
                  {bySource.map((_e, i) => <Cell key={i} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-2 p-3 rounded-2xl border flex items-center justify-center text-sm opacity-60">
          Ready for next: “Top councils by feedback”, “Good/Bad heatmap”, etc.
        </div>
      </div>
    </div>
  );
}
