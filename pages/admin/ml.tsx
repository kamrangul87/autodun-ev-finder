// pages/admin/ml.tsx
import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";

const MlHistoryChart = dynamic(
  () =>
    import("../../components/ml/MlHistoryChart").then(
      (m) => m.MlHistoryChart
    ),
  { ssr: false }
);

const MlAccuracyChart = dynamic(
  () =>
    import("../../components/ml/MlAccuracyChart").then(
      (m) => m.MlAccuracyChart
    ),
  { ssr: false }
);

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

  const latestMetrics = latest.metrics_json ?? {};
  const fmtPct = (v?: number | null) =>
    v != null ? `${(v * 100).toFixed(1)}%` : "n/a";

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-3xl font-bold">ML Training Status</h1>

      <p className="text-sm">
        Overview of nightly ML retraining runs logged from GitHub Actions into
        Supabase <code>ml_runs</code>.
      </p>

      {/* Summary block */}
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
        <div>
          <strong>Latest metrics</strong>
          <br />
          Accuracy: {fmtPct(latestMetrics.accuracy)} •{" "}
          Precision: {fmtPct(latestMetrics.precision)} •{" "}
          Recall: {fmtPct(latestMetrics.recall)}
        </div>
      </div>

      <h2 className="text-xl font-semibold mt-6">Recent runs</h2>

      {/* Accuracy chart (only shows once metrics exist) */}
      <MlAccuracyChart runs={runs} />

      {/* Samples chart */}
      <MlHistoryChart runs={runs} />

      <table className="min-w-full text-sm border border-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-3 py-2 text-left border-b">ID</th>
            <th className="px-3 py-2 text-left border-b">Run at</th>
            <th className="px-3 py-2 text-left border-b">Model version</th>
            <th className="px-3 py-2 text-left border-b">Samples</th>
            <th className="px-3 py-2 text-left border-b">Accuracy</th>
            <th className="px-3 py-2 text-left border-b">Precision</th>
            <th className="px-3 py-2 text-left border-b">Recall</th>
            <th className="px-3 py-2 text-left border-b">Notes</th>
            <th className="px-3 py-2 text-left border-b">Logs</th>
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
                {fmtPct(run.metrics_json?.accuracy ?? null)}
              </td>
              <td className="px-3 py-2 border-b">
                {fmtPct(run.metrics_json?.precision ?? null)}
              </td>
              <td className="px-3 py-2 border-b">
                {fmtPct(run.metrics_json?.recall ?? null)}
              </td>
              <td className="px-3 py-2 border-b">
                {run.notes || "—"}
              </td>
              <td className="px-3 py-2 border-b">
                <a
                  href="https://github.com/kamrangul87/autodun-ev-finder/actions/workflows/train-ml.yml"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  View logs
                </a>
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
