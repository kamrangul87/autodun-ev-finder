// pages/admin/ml.tsx
import React, { useEffect, useState } from "react";

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
        console.error("Failed to load ml_runs", err);
        setError(err?.message || "Failed to load ml_runs");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const currentModel = runs[0]?.model_version ?? "—";
  const lastRunAt = runs[0]?.run_at ?? null;
  const totalRuns = runs.length;
  const totalSamples = runs.reduce(
    (sum, r) =>
      sum + (typeof r.samples_used === "number" ? r.samples_used : 0),
    0
  );

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-6xl">
        {/* Title */}
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
          ML Training Status
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Overview of nightly ML retraining runs logged from GitHub Actions into
          Supabase{" "}
          <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">
            ml_runs
          </code>
          .
        </p>

        {/* Stat cards */}
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {/* Current model */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Current model
            </div>
            <div className="mt-2 text-xl font-semibold text-slate-900">
              {currentModel}
            </div>
          </div>

          {/* Last run */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Last run
            </div>
            <div className="mt-2 text-sm text-slate-900">
              {lastRunAt
                ? new Date(lastRunAt).toLocaleString("en-GB", {
                    dateStyle: "short",
                    timeStyle: "medium",
                  })
                : "No runs yet"}
            </div>
          </div>

          {/* Total runs + samples */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Total runs (shown) / Samples
            </div>
            <div className="mt-2 flex items-baseline gap-3">
              <span className="text-2xl font-semibold text-slate-900">
                {totalRuns}
              </span>
              <span className="text-sm text-slate-500">
                • {totalSamples} samples
              </span>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="mt-8 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">
              Recent runs
            </h2>
          </div>

          {loading && (
            <p className="mt-4 text-sm text-slate-600">Loading…</p>
          )}

          {error && !loading && (
            <p className="mt-4 text-sm text-red-600">
              Error loading data: {error}
            </p>
          )}

          {!loading && !error && runs.length === 0 && (
            <p className="mt-4 text-sm text-slate-600">No runs logged yet.</p>
          )}

          {!loading && !error && runs.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2">ID</th>
                    <th className="px-3 py-2">Run at</th>
                    <th className="px-3 py-2">Model version</th>
                    <th className="px-3 py-2">Samples</th>
                    <th className="px-3 py-2">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.id} className="border-b border-slate-100">
                      <td className="px-3 py-2 text-slate-700">{r.id}</td>
                      <td className="px-3 py-2 text-slate-700">
                        {new Date(r.run_at).toLocaleString("en-GB", {
                          dateStyle: "short",
                          timeStyle: "medium",
                        })}
                      </td>
                      <td className="px-3 py-2 text-slate-700">
                        {r.model_version}
                      </td>
                      <td className="px-3 py-2 text-slate-700">
                        {r.samples_used ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-slate-700">
                        {r.notes ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className="mt-4 text-xs text-slate-500">
          Data source: Supabase <code>ml_runs</code> (service role), updated by
          GitHub Actions workflow <code>train-ml.yml</code>.
        </p>
      </div>
    </div>
  );
}
