// components/admin/ChartsClient.tsx
"use client";

import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, ArcElement, Tooltip as CTooltip, Legend, TimeScale
} from "chart.js";
import { Pie, Bar, Line } from "react-chartjs-2";
import type { FeedbackPoint } from "./MapClient";

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, ArcElement, CTooltip, Legend, TimeScale
);

export default function ChartsClient({ points }: { points: FeedbackPoint[] }) {
  const sentiments: Array<"positive" | "neutral" | "negative"> = ["positive","neutral","negative"];
  const sentimentCounts = sentiments.map(s => points.filter(p => p.sentiment === s).length);

  const sourceMap = new Map<string, number>();
  for (const p of points) sourceMap.set(p.source ?? "unknown", (sourceMap.get(p.source ?? "unknown") ?? 0) + 1);
  const sourceLabels = Array.from(sourceMap.keys());
  const sourceValues = Array.from(sourceMap.values());

  const byDay = new Map<string, number[]>();
  for (const p of points) {
    if (!p.createdAt) continue;
    const day = p.createdAt.slice(0,10);
    if (!byDay.has(day)) byDay.set(day, []);
    if (typeof p.mlScore === "number") byDay.get(day)!.push(p.mlScore);
  }
  const dayLabels = Array.from(byDay.keys()).sort();
  const dayAverages = dayLabels.map(d => {
    const arr = byDay.get(d)!;
    const avg = arr.reduce((a,b)=>a+b,0)/Math.max(1, arr.length);
    return Math.round(avg * 100) / 100;
  });

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={panel}><div style={title}>Sentiment Breakdown</div><Pie data={{ labels:["Positive","Neutral","Negative"], datasets:[{ data: sentimentCounts }] }} /></div>
      <div style={panel}><div style={title}>Feedback by Source</div><Bar data={{ labels: sourceLabels, datasets:[{ label:"Count", data: sourceValues }] }} options={{ responsive:true, maintainAspectRatio:false }} /></div>
      <div style={panel}><div style={title}>Avg ML Score by Day</div><Line data={{ labels: dayLabels, datasets:[{ label:"Avg Score", data: dayAverages }] }} options={{ responsive:true, maintainAspectRatio:false }} /></div>
    </div>
  );
}

const panel: React.CSSProperties = { padding: 12, border: "1px solid #e5e7eb", background: "#fff", borderRadius: 12, minHeight: 260 };
const title: React.CSSProperties = { fontWeight: 700, marginBottom: 8 };
