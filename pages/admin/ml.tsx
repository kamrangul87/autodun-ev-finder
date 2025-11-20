// pages/admin/ml.tsx
import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";

// Load chart only on client
const MlHistoryChart = dynamic(
  () =>
    import("../../components/ml/MlHistoryChart").then(
      (m) => m.MlHistoryChart
    ),
  { ssr: false }
);

type MlRun = {
  id: number;
  model_version: string;
  run_at: string;
  samples_used: number | null;
  notes: string | null;
};

type ApiResponse = {
  runs: MlRun[];
};

export default function AdminMlPage() {
  const [runs, setRuns] = useState<MlRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch("/api/admin/ml-runs");
        if (!res.ok) {
          throw new Error(`Failed to load ml_runs (status ${res.status})`);
        }

        const json: ApiResponse = await res.json();
        setRuns(json.runs ?? []);
      } catch (err: any) {
        console.error("Failed to load ml runs", err);
        setError(err?.message ?? "Failed to load ml runs");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  if (loading) {
    return <div className="p-6 text-sm">Loading ML runs…</div>;
  }

  if (error) {
    return (
      <div className="p-6 text-sm text-red-600">
        Error loading ML runs: {error}
      </div>
    );
  }

  if (!runs.length) {
    return (
      <div className="p-6 text-sm">
        No ML runs found yet.
      </div>
    );
  }

  const latest = runs[0];
  const totalSamples = runs.reduce(
    (sum, r) => sum + (r.samples_used ?? 0),
    0
  );

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-3xl font-bold">ML Training Status</h1>

      <p className="text-sm">
        Overview of nightly ML retraining runs logged from GitHub Actions into
        Supabase <code>ml_runs</code>.
      </p>

      <div className="space-y-2 text-sm">
        <div>
          <strong>Current model</strong>
          <br /> {latest.model_version}
        </div>
        <div>
          <strong>Last run</strong>
          <br />
          {latest.run_at
            ? new Date(latest.run_at).toLocaleString()
            : "—"}
        </div>
        <div>
          <strong>Total runs (shown) / Samples</strong>
          <br />
          {runs.length} • {totalSamples} samples
        </div>
      </div>

      <h2 className="text-xl font-semibold mt-6">Recent runs</h2>

      {/* 📊 NEW ML CHART INSERTED HERE */}
      <MlHistoryChart runs={runs} />

      <table className="min-w-full text-sm border border-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-3 py-2 text-left border-b">ID</th>
            <th className="px-3 py-2 text-left border-b">Run at</th>
            <th className="px-3 py-2 text-left border-b">Model version</th>
            <th className="px-3 py-2 text-left border-b">Samples</th>
            <th className="px-3 py-2 text-left border-b">Notes</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.id} className="hover:bg-gray-50">
              <td className="px-3 py-2 border-b">{run.id}</td>
              <td className="px-3 py-2 border-b">
                {run.run_at
                  ? new Date(run.run_at).toLocaleString()
                  : "—"}
              </td>
              <td className="px-3 py-2 border-b">{run.model_version}</td>
              <td className="px-3 py-2 border-b">
                {run.samples_used ?? "—"}
              </td>
              <td className="px-3 py-2 border-b">
                {run.notes || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="mt-4 text-xs text-slate-500">
        Data source: Supabase <code>ml_runs</code> (service role), updated by
        GitHub Actions workflow <code>train-ml.yml</code>.
      </p>
    </div>
  );
}
