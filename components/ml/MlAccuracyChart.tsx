// components/ml/MlAccuracyChart.tsx
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

export function MlAccuracyChart({ runs }: { runs: MlRun[] }) {
  const data = runs
    .filter((r) => r.metrics_json && r.metrics_json.accuracy != null)
    .sort(
      (a, b) => new Date(a.run_at).getTime() - new Date(b.run_at).getTime()
    )
    .map((r) => ({
      name: `#${r.id}`,
      accuracy: (r.metrics_json!.accuracy ?? 0) * 100, // 0–1 → %
      date: new Date(r.run_at).toLocaleString(),
      version: r.model_version,
    }));

  if (!data.length) return null; // no metrics yet → nothing shown

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
        Model Accuracy Over Time (%)
      </h2>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis domain={[0, 100]} />
          <Tooltip
            formatter={(value: any) => [
              `${Number(value).toFixed(1)}%`,
              "Accuracy",
            ]}
            labelFormatter={(label, payload) => {
              const first: any =
                payload && payload.length > 0 ? payload[0] : null;
              const item: any = first?.payload;
              if (!item) return String(label);
              return `${item.date} | Version: ${item.version}`;
            }}
          />
          <Line type="monotone" dataKey="accuracy" strokeWidth={2} dot />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
