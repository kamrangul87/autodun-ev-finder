// components/ml/MlHistoryChart.tsx
"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type MlMetrics = {
  accuracy?: number | null;
  precision?: number | null;
  recall?: number | null;
};

type MlRun = {
  id: number;
  model_version: string;
  run_at: string;
  samples_used: number | null;
  notes: string | null;
  metrics_json?: MlMetrics | null;
};

export function MlHistoryChart({ runs }: { runs: MlRun[] }) {
  const data = [...runs]
    .sort(
      (a, b) => new Date(a.run_at).getTime() - new Date(b.run_at).getTime()
    )
    .map((r) => ({
      name: `#${r.id}`,
      samples: r.samples_used ?? 0,
      date: new Date(r.run_at).toLocaleString(),
      version: r.model_version,
    }));

  if (!data.length) return null;

  return (
    <div
      style={{
        width: "100%",
        height: 260,
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        padding: 16,
        marginBottom: 24,
      }}
    >
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
        ML Run Trend (Samples per run)
      </h2>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis />
          <Tooltip
            formatter={(value: any) => [`${value}`, "Samples"]}
            labelFormatter={(label, payload) => {
              const first: any =
                payload && payload.length > 0 ? payload[0] : null;
              const item: any = first?.payload;
              if (!item) return String(label);
              return `${item.date} | Version: ${item.version}`;
            }}
          />
          <Line type="monotone" dataKey="samples" strokeWidth={2} dot />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
