// components/admin/FeedbackCharts.tsx
"use client";

import { useMemo, useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, ArcElement, Tooltip, Legend, TimeScale
} from "chart.js";
import { Pie, Bar, Line } from "react-chartjs-2";
import type { FeedbackPoint } from "./FeedbackMap";

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, ArcElement, Tooltip, Legend, TimeScale
);

type RangeKey = "7d" | "30d" | "all";

function countBy<T extends string | number | undefined>(arr: any[], key: (x: any) => T) {
  const m = new Map<T, number>();
  for (const a of arr) {
    const k = key(a);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

// --- Safe access helpers (avoid TS errors on optional/unknown fields) ---
function getSentiment(p: FeedbackPoint): "positive" | "neutral" | "negative" {
  const s = String(
    (p as any)?.sentiment ??
    (p as any)?.vote ??
    ""
  ).toLowerCase();
  if (s === "positive" || s === "good") return "positive";
  if (s === "negative" || s === "bad") return "negative";
  return "neutral";
}

function getISODate(p: FeedbackPoint): string | null {
  const raw = String(
    (p as any)?.createdAt ??
    (p as any)?.ts ??
    (p as any)?.time ??
    ""
  );
  const d = new Date(raw);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function getMlScore(p: FeedbackPoint): number | null {
  const v = (p as any)?.mlScore ?? (p as any)?.mlscore ?? null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// --- CSV helpers ---
function esc(v: any) {
  // basic CSV escaping for commas/quotes/newlines
  const s = v == null ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function toCSV(headers: string[], rows: (string | number)[][]) {
  const lines = [headers.map(esc).join(",")];
  for (const r of rows) lines.push(r.map(esc).join(","));
  return lines.join("\r\n");
}
function downloadCSV(filename: string, csv: string) {
  // BOM so Excel opens UTF-8 correctly
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function FeedbackCharts({ points }: { points: FeedbackPoint[] }) {
  const [range, setRange] = useState<RangeKey>("7d");

  // Filter by date range
  const filtered = useMemo(() => {
    if (range === "all") return points ?? [];
    const now = new Date();
    const start = new Date(now);
    if (range === "7d") start.setDate(start.getDate() - 6);
    if (range === "30d") start.setDate(start.getDate() - 29);
    start.setHours(0, 0, 0, 0);

    return (points ?? []).filter((p) => {
      const raw = String(
        (p as any)?.createdAt ??
        (p as any)?.ts ??
        (p as any)?.time ??
        ""
      );
      const d = new Date(raw);
      return !isNaN(d.getTime()) && d >= start;
    });
  }, [points, range]);

  // Sentiment breakdown
  const sentiments = ["positive", "neutral", "negative"] as const;
  const sentimentCounts = useMemo(() => {
    const arr = [0, 0, 0];
    for (const p of filtered) {
      const s = getSentiment(p);
      if (s === "positive") arr[0] += 1;
      else if (s === "neutral") arr[1] += 1;
      else arr[2] += 1;
    }
    return arr;
  }, [filtered]);

  // Sources
  const sourcesMap = useMemo(
    () => countBy(filtered, (p) => ((p as any)?.source ?? "unknown")),
    [filtered]
  );
  const sourceLabels = useMemo(() => Array.from(sourcesMap.keys()), [sourcesMap]);
  const sourceValues = useMemo(() => Array.from(sourcesMap.values()), [sourcesMap]);

  // By-day aggregations for stacked bars and avg line
  const { dayLabels, stackedGood, stackedNeutral, stackedBad, dayAvg } = useMemo(() => {
    type Acc = { good: number; neutral: number; bad: number; sum: number; n: number };
    const map = new Map<string, Acc>();

    for (const p of filtered) {
      const day = getISODate(p);
      if (!day) continue;
      if (!map.has(day)) map.set(day, { good: 0, neutral: 0, bad: 0, sum: 0, n: 0 });

      const acc = map.get(day)!;
      const s = getSentiment(p);
      if (s === "positive") acc.good += 1;
      else if (s === "negative") acc.bad += 1;
      else acc.neutral += 1;

      const ms = getMlScore(p);
      if (ms !== null) {
        acc.sum += ms;
        acc.n += 1;
      }
    }

    const labels = Array.from(map.keys()).sort();
    const good = labels.map((d) => map.get(d)!.good);
    const neutral = labels.map((d) => map.get(d)!.neutral);
    const bad = labels.map((d) => map.get(d)!.bad);
    const avg = labels.map((d) => {
      const a = map.get(d)!;
      return a.n ? +(a.sum / a.n).toFixed(3) : 0;
    });

    return { dayLabels: labels, stackedGood: good, stackedNeutral: neutral, stackedBad: bad, dayAvg: avg };
  }, [filtered]);

  // --- Chart configs (no custom colors) ---
  const stackedData = {
    labels: dayLabels,
    datasets: [
      { label: "Positive", data: stackedGood, stack: "s" as const },
      { label: "Neutral", data: stackedNeutral, stack: "s" as const },
      { label: "Negative", data: stackedBad, stack: "s" as const },
    ],
  };
  const stackedOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: true }, tooltip: { enabled: true } },
    scales: { x: { stacked: true as const }, y: { stacked: true as const, ticks: { precision: 0 } } },
  };

  const lineData = {
    labels: dayLabels,
    datasets: [{ label: "Avg ML Score", data: dayAvg, tension: 0.25, pointRadius: 0 }],
  };
  const lineOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: true }, tooltip: { enabled: true } },
    scales: { y: { min: 0, max: 1 } },
  };

  const sourcePie = { labels: sourceLabels, datasets: [{ data: sourceValues }] };
  const sentimentPie = { labels: ["Positive", "Neutral", "Negative"], datasets: [{ data: sentimentCounts }] };

  // --- Export handlers ---
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
    const csv = toCSV(["date", "positive", "neutral", "negative", "total"], rows);
    downloadCSV(`daily_feedback_${safeRangeTag}_${todayTag}.csv`, csv);
  };

  const exportAvg = () => {
    const rows = dayLabels.map((d, i) => [d, dayAvg[i] ?? 0]);
    const csv = toCSV(["date", "avg_ml_score"], rows);
    downloadCSV(`avg_ml_score_${safeRangeTag}_${todayTag}.csv`, csv);
  };

  const exportSources = () => {
    const rows = sourceLabels.map((name, i) => [name, sourceValues[i] ?? 0]);
    const csv = toCSV(["source", "count"], rows);
    downloadCSV(`sources_${safeRangeTag}_${todayTag}.csv`, csv);
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
      sourceLabels.map((name, i) => [name, sourceValues[i] ?? 0])
    );
    const merged =
      "Daily Feedback (stacked)\r\n" +
      a +
      "\r\n\r\nAvg ML Score by Day\r\n" +
      b +
      "\r\n\r\nFeedback by Source\r\n" +
      c +
      "\r\n";
    downloadCSV(`analytics_${safeRangeTag}_${todayTag}.csv`, merged);
  };

  return (
    <div className="w-full">
      {/* Range + Export */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="font-medium text-lg">Analytics</div>

        <div className="ml-auto flex gap-2">
          <button
            className={`px-3 py-1 rounded-full border ${range === "7d" ? "bg-black text-white" : "bg-white"}`}
            onClick={() => setRange("7d")}
          >
            7 days
          </button>
          <button
            className={`px-3 py-1 rounded-full border ${range === "30d" ? "bg-black text-white" : "bg-white"}`}
            onClick={() => setRange("30d")}
          >
            30 days
          </button>
          <button
            className={`px-3 py-1 rounded-full border ${range === "all" ? "bg-black text-white" : "bg-white"}`}
            onClick={() => setRange("all")}
          >
            All
          </button>
        </div>

        <div className="flex gap-2 w-full lg:w-auto">
          <button className="px-3 py-1 rounded-full border" onClick={exportDaily}>Export Daily</button>
          <button className="px-3 py-1 rounded-full border" onClick={exportAvg}>Export Avg ML</button>
          <button className="px-3 py-1 rounded-full border" onClick={exportSources}>Export Sources</button>
          <button className="px-3 py-1 rounded-full border" onClick={exportAll}>Export All</button>
        </div>
      </div>

      {/* Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Stacked daily feedback */}
        <div className="p-4 rounded-2xl border border-gray-200 bg-white">
          <div className="font-semibold mb-3">Daily Feedback (stacked)</div>
          <div style={{ width: "100%", height: 260 }}>
            <Bar data={stackedData} options={stackedOpts} />
          </div>
        </div>

        {/* Avg ML score */}
        <div className="p-4 rounded-2xl border border-gray-200 bg-white">
          <div className="font-semibold mb-3">Avg ML Score by Day</div>
          <div style={{ width: "100%", height: 260 }}>
            <Line data={lineData} options={lineOpts} />
          </div>
        </div>
      </div>

      {/* Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        <div className="p-4 rounded-2xl border border-gray-200 bg-white">
          <div className="font-semibold mb-3">Feedback by Source</div>
          <div style={{ width: "100%", height: 260 }}>
            <Pie data={sourcePie} />
          </div>
        </div>

        <div className="p-4 rounded-2xl border border-gray-200 bg-white">
          <div className="font-semibold mb-3">Sentiment Breakdown</div>
          <div style={{ width: "100%", height: 260 }}>
            <Pie data={sentimentPie} />
          </div>
        </div>

        <div className="p-4 rounded-2xl border border-gray-200 bg-white flex items-center justify-center text-sm opacity-60">
          Ready for next: “Top councils by feedback”, “Good/Bad heatmap”, etc.
        </div>
      </div>
    </div>
  );
}
