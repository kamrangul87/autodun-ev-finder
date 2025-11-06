// components/admin/FeedbackCharts.tsx
"use client";
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, ArcElement, Tooltip, Legend, TimeScale
} from "chart.js";
import { Pie, Bar, Line } from "react-chartjs-2";
import type { FeedbackPoint } from "./FeedbackMap";

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement, BarElement,
  ArcElement, Tooltip, Legend, TimeScale
);

function countBy<T extends string | number | undefined>(arr: any[], key: (x:any)=>T) {
  const m = new Map<T, number>();
  for (const a of arr) {
    const k = key(a);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

export default function FeedbackCharts({ points }: { points: FeedbackPoint[] }) {
  const sentiments = ["positive", "neutral", "negative"] as const;
  const sentimentCounts = sentiments.map(s => points.filter(p => p.sentiment === s).length);

  const sourcesMap = countBy(points, (p)=> (p.source ?? "unknown"));
  const sourceLabels = Array.from(sourcesMap.keys());
  const sourceValues = Array.from(sourcesMap.values());

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
    const sum = arr.reduce((a,b)=>a+b,0);
    return Math.round((sum / Math.max(1, arr.length)) * 10) / 10;
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="p-4 rounded-2xl border border-gray-200 bg-white">
        <div className="font-semibold mb-3">Sentiment Breakdown</div>
        <Pie data={{ labels: ["Positive","Neutral","Negative"], datasets: [{ data: sentimentCounts }] }} />
      </div>
      <div className="p-4 rounded-2xl border border-gray-200 bg-white">
        <div className="font-semibold mb-3">Feedback by Source</div>
        <Bar data={{ labels: sourceLabels, datasets: [{ label: "Count", data: sourceValues }] }}
             options={{ responsive: true, maintainAspectRatio: false }} />
      </div>
      <div className="p-4 rounded-2xl border border-gray-200 bg-white">
        <div className="font-semibold mb-3">Avg ML Score by Day</div>
        <Line data={{ labels: dayLabels, datasets: [{ label: "Avg Score", data: dayAverages }] }}
              options={{ responsive: true, maintainAspectRatio: false }} />
      </div>
    </div>
  );
}
