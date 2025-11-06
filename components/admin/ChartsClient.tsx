// components/admin/ChartsClient.tsx
// Compact, tidy admin charts (fixed heights, responsive grid)
// No spread on Map iterators (uses Array.from(...) to keep TS happy)

import React, { useMemo } from "react";
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
import { Bar, Line } from "react-chartjs-2";

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

export default function ChartsClient({ points }: Props) {
  const dayCounts = useMemo(() => groupByDayCount(points), [points]);
  const dayAvg = useMemo(() => groupByDayAvg(points), [points]);
  const bySource = useMemo(() => groupBySource(points), [points]);

  return (
    <div style={grid}>
      <Card title="Feedback Count by Day">
        <ChartWrap>
          <Bar data={barData(dayCounts)} options={barOpts} />
        </ChartWrap>
      </Card>

      <Card title="Avg ML Score by Day">
        <ChartWrap>
          <Line data={lineData(dayAvg)} options={lineOpts} />
        </ChartWrap>
      </Card>

      <Card title="Feedback by Source">
        <ChartWrap>
          <Bar data={barData(bySource)} options={barOpts} />
        </ChartWrap>
      </Card>
    </div>
  );
}

/* ─────────────── transforms ─────────────── */

function dayKey(ts?: string) {
  if (!ts) return "unknown";
  const d = new Date(ts);
  if (isNaN(+d)) return "unknown";
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function groupByDayCount(points: FeedbackPoint[]): { labels: string[]; values: number[] } {
  const map = new Map<string, number>();
  for (const p of points) {
    const k = dayKey(p.createdAt);
    map.set(k, (map.get(k) || 0) + 1);
  }
  const labels = Array.from(map.keys()).sort();
  const values = labels.map((l) => map.get(l) || 0);
  return { labels, values };
}

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

function groupBySource(points: FeedbackPoint[]): { labels: string[]; values: number[] } {
  const map = new Map<string, number>();
  for (const p of points) {
    const k = (p.source || "unknown").toLowerCase();
    map.set(k, (map.get(k) || 0) + 1);
  }
  // sort by count desc, cap top N, rest -> "other"
  const entries = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  const TOP = 8;
  const top = entries.slice(0, TOP);
  const rest = entries.slice(TOP);
  const otherCount = rest.reduce((acc, [, v]) => acc + v, 0);
  if (otherCount > 0) top.push(["other", otherCount]);
  const labels = top.map(([k]) => k);
  const values = top.map(([, v]) => v);
  return { labels, values };
}

/* ─────────────── datasets ─────────────── */

function barData(series: { labels: string[]; values: number[] }) {
  return {
    labels: series.labels,
    datasets: [
      {
        label: "Count",
        data: series.values,
        borderWidth: 1,
      },
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

/* ─────────────── chart options (small, readable) ─────────────── */

const commonOpts = {
  responsive: true,
  maintainAspectRatio: false as const, // allow fixed-height container
  animation: { duration: 200 },
  plugins: {
    legend: { position: "top" as const, labels: { boxWidth: 12 } },
    tooltip: { intersect: false, mode: "index" as const },
  },
  layout: { padding: { top: 8, right: 8, bottom: 0, left: 8 } },
};

const barOpts = {
  ...commonOpts,
  scales: {
    x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true } },
    y: { grid: { color: "rgba(0,0,0,0.05)" }, beginAtZero: true },
  },
};

const lineOpts = {
  ...commonOpts,
  scales: {
    x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true } },
    y: {
      grid: { color: "rgba(0,0,0,0.05)" },
      suggestedMin: 0,
      suggestedMax: 1,
    },
  },
};

/* ─────────────── UI wrappers ─────────────── */

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={card}>
      <div style={cardHeader}>{title}</div>
      {children}
    </div>
  );
}

function ChartWrap({ children }: { children: React.ReactNode }) {
  // Fixed, compact height prevents runaway canvases
  return <div style={{ height: 260 }}>{children}</div>;
}

/* ─────────────── styles ─────────────── */

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
