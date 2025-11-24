// components/admin/ChartsClient.tsx
// Compact, tidy admin charts (fixed heights, responsive grid)
// Minimal, surgical changes: range toggles + stacked bars + source donut (no API changes)

import React, { useMemo, useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar, Line, Pie } from "react-chartjs-2";

/** Keep in sync with the page's FeedbackPoint type */
type FeedbackPoint = {
  id: string;
  stationName?: string;
  lat: number;
  lng: number;
  mlScore?: number;
  sentiment?: "positive" | "neutral" | "negative";
  source?: string;
  createdAt?: string; // ISO
};

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend
);

type Props = { points: FeedbackPoint[] };

// ───────────────── helpers ─────────────────
type RangeKey = "7" | "30" | "all";

function dayKey(ts?: string) {
  if (!ts) return "unknown";
  const d = new Date(ts);
  if (isNaN(+d)) return "unknown";
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function clampRange<T>(labels: string[], data: T[], range: RangeKey) {
  if (range === "all") return { labels, data };
  const keep = range === "7" ? 7 : 30;
  const start = Math.max(0, labels.length - keep);
  return { labels: labels.slice(start), data: data.slice(start) };
}

// ───────────────── transforms ─────────────────

/** Per-day counts split by sentiment */
function groupByDaySentiment(points: FeedbackPoint[]) {
  const map = new Map<string, { pos: number; neu: number; neg: number }>();
  for (const p of points) {
    const k = dayKey(p.createdAt);
    if (!map.has(k)) map.set(k, { pos: 0, neu: 0, neg: 0 });
    const row = map.get(k)!;
    const s = p.sentiment || "neutral";
    if (s === "positive") row.pos++;
    else if (s === "negative") row.neg++;
    else row.neu++;
  }
  const labels = Array.from(map.keys()).sort();
  const pos = labels.map((l) => map.get(l)!.pos);
  const neu = labels.map((l) => map.get(l)!.neu);
  const neg = labels.map((l) => map.get(l)!.neg);
  return { labels, pos, neu, neg };
}

/** Per-day average ML score */
function groupByDayAvg(points: FeedbackPoint[]): { labels: string[]; values: number[] } {
  const sum = new Map<string, number>();
  const cnt = new Map<string, number>();
  for (const p of points) {
    if (typeof p.mlScore !== "number" || !isFinite(p.mlScore)) continue;
    const k = dayKey(p.createdAt);
    sum.set(k, (sum.get(k) || 0) + p.mlScore);
    cnt.set(k, (cnt.get(k) || 0) + 1);
  }
  const labels = Array.from(sum.keys()).sort();
  const values = labels.map((l) => {
    const c = cnt.get(l) || 1;
    return (sum.get(l) || 0) / c;
  });
  return { labels, values };
}

/** Source mix (top 8, rest -> "other") */
function groupBySource(points: FeedbackPoint[]) {
  const bucket = new Map<string, number>();

  for (const p of points) {
    const raw = (p.source ?? "").trim();
    if (!raw || raw.toLowerCase() === "unknown") continue; // ❌ unknown / empty skip
    const k = raw.toLowerCase(); // e.g. "app", "admin"
    bucket.set(k, (bucket.get(k) ?? 0) + 1);
  }

  if (!bucket.size) {
    return { labels: [], values: [] };
  }

  const entries = Array.from(bucket.entries()).sort((a, b) => b[1] - a[1]);
  const TOP = 8;
  const top = entries.slice(0, TOP);
  const rest = entries.slice(TOP);
  const otherCount = rest.reduce((acc, [, v]) => acc + v, 0);
  if (otherCount > 0) top.push(["other", otherCount]);

  const labels = top.map(([k]) => k);
  const values = top.map(([, v]) => v);
  return { labels, values };
}

// ───────────────── datasets ─────────────────

function stackedBarData(
  labels: string[],
  pos: number[],
  neu: number[],
  neg: number[]
) {
  return {
    labels,
    datasets: [
      { label: "Positive", data: pos, stack: "s" },
      { label: "Neutral", data: neu, stack: "s" },
      { label: "Negative", data: neg, stack: "s" },
    ],
  };
}

function lineData(series: { labels: string[]; values: number[] }) {
  return {
    labels: series.labels,
    datasets: [
      {
        label: "Avg Score",
        data: series.values,
        tension: 0.3,
        pointRadius: 2,
        borderWidth: 2,
      },
    ],
  };
}

function donutData(series: { labels: string[]; values: number[] }) {
  return {
    labels: series.labels,
    datasets: [
      {
        label: "Count",
        data: series.values,
      },
    ],
  };
}

// ───────────────── chart options ─────────────────

const commonOpts = {
  responsive: true,
  maintainAspectRatio: false as const,
  animation: { duration: 200 },
  plugins: {
    legend: { position: "top" as const, labels: { boxWidth: 12 } },
    tooltip: { intersect: false, mode: "index" as const },
  },
  layout: { padding: { top: 8, right: 8, bottom: 0, left: 8 } },
};

const stackedBarOpts = {
  ...commonOpts,
  scales: {
    x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true } },
    y: { grid: { color: "rgba(0,0,0,0.05)" }, beginAtZero: true, stacked: true },
  },
};

const lineOpts = {
  ...commonOpts,
  scales: {
    x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true } },
    y: { grid: { color: "rgba(0,0,0,0.05)" }, suggestedMin: 0, suggestedMax: 1 },
  },
};

const donutOpts = {
  ...commonOpts,
  plugins: {
    ...commonOpts.plugins,
    legend: { position: "bottom" as const, labels: { boxWidth: 12 } },
  },
  cutout: "60%",
};

// ───────────────── UI wrappers ─────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={card}>
      <div style={cardHeader}>{title}</div>
      {children}
    </div>
  );
}

function ChartWrap({ children }: { children: React.ReactNode }) {
  return <div style={{ height: 260 }}>{children}</div>;
}

// Responsive, compact grid: 2–3 columns on wide screens, 1 column on narrow
const grid: React.CSSProperties = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
};

const card: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  background: "#fff",
  borderRadius: 12,
  padding: 12,
  minHeight: 320,
  display: "flex",
  flexDirection: "column",
};

const cardHeader: React.CSSProperties = {
  fontWeight: 800,
  marginBottom: 8,
};

const pillRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginBottom: 10,
};

const pillBtn = (active: boolean): React.CSSProperties => ({
  padding: "8px 10px",
  borderRadius: 10,
  border: active ? "1px solid #2563eb" : "1px solid #e5e7eb",
  background: active ? "#2563eb" : "#fff",
  color: active ? "#fff" : "#111827",
  fontWeight: 700,
  cursor: "pointer",
});

// ───────────────── component ─────────────────

export default function ChartsClient({ points }: Props) {
  const [range, setRange] = useState<RangeKey>("7");

  // Aggregates
  const daySent = useMemo(() => groupByDaySentiment(points), [points]);
  const dayAvg = useMemo(() => groupByDayAvg(points), [points]);
  const bySource = useMemo(() => groupBySource(points), [points]);

  // Apply range to day-series
  const s1 = clampRange(daySent.labels, daySent.pos, range);
  const s2 = clampRange(daySent.labels, daySent.neu, range);
  const s3 = clampRange(daySent.labels, daySent.neg, range);
  const sAvg = clampRange(dayAvg.labels, dayAvg.values, range);

  return (
    <div>
      {/* Range controls */}
      <div style={pillRow}>
        <div style={{ fontWeight: 800, marginRight: 6 }}>Range</div>
        <button style={pillBtn(range === "7")} onClick={() => setRange("7")}>
          7 days
        </button>
        <button style={pillBtn(range === "30")} onClick={() => setRange("30")}>
          30 days
        </button>
        <button style={pillBtn(range === "all")} onClick={() => setRange("all")}>
          All
        </button>
      </div>

      <div style={grid}>
        {/* Stacked bar by sentiment */}
        <Card title="Daily Feedback (stacked)">
          <ChartWrap>
            <Bar
              data={stackedBarData(
                s1.labels,
                s1.data as number[],
                s2.data as number[],
                s3.data as number[]
              )}
              options={stackedBarOpts}
            />
          </ChartWrap>
        </Card>

        {/* Avg ML score by day */}
        <Card title="Avg ML Score by Day">
          <ChartWrap>
            <Line
              data={lineData({ labels: sAvg.labels, values: sAvg.data as number[] })}
              options={lineOpts}
            />
          </ChartWrap>
        </Card>

        {/* Source donut */}
        <Card title="Feedback by Source">
          <ChartWrap>
            <Pie data={donutData(bySource)} options={donutOpts} />
          </ChartWrap>
        </Card>
      </div>
    </div>
  );
}
