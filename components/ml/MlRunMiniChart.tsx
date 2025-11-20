// components/ml/MlRunMiniChart.tsx
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

type MlRun = {
  id: number;
  model_version: string;
  run_at: string;
  samples_used: number | null;
  notes: string | null;
};

export function MlRunMiniChart({ runs }: { runs: MlRun[] }) {
  if (!runs.length) return null;

  const data = runs
    .slice()
    .sort(
      (a, b) => new Date(a.run_at).getTime() - new Date(b.run_at).getTime()
    )
    .map((r) => ({
      name: `#${r.id}`,
      samples: r.samples_used ?? 0,
      date: new Date(r.run_at).toLocaleString(),
      version: r.model_version,
    }));

  return (
    <div
      style={{
        width: "100%",
        height: 220,
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        padding: 12,
        marginTop: 16,
      }}
    >
      <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
        Samples for this run vs previous
      </h3>
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
