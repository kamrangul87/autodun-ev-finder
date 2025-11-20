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

export function MlHistoryChart({ runs }: { runs: MlRun[] }) {
  // Convert Supabase rows → chart-friendly data
  const data = [...runs]
    .sort((a, b) => new Date(a.run_at).getTime() - new Date(b.run_at).getTime())
    .map((r) => ({
      name: `#${r.id}`,
      samples: r.samples_used ?? 0,
      date: new Date(r.run_at).toLocaleString(),
      version: r.model_version,
    }));

  return (
    <div className="w-full h-64 border rounded-lg p-4 mb-6">
      <h2 className="text-lg font-semibold mb-3">ML Run Trend (Samples)</h2>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis />
          <Tooltip
            formatter={(value: any) => [`${value}`, "Samples"]}
            labelFormatter={(label: any, payload: any[]) => {
              const item = payload?.[0]?.payload;
              return `${item.date} | Version: ${item.version}`;
            }}
          />
          <Line
            type="monotone"
            dataKey="samples"
            stroke="#8884d8"
            strokeWidth={2}
            dot
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
