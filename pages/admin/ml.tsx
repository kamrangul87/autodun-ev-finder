// pages/admin/ml.tsx
import React, { useEffect, useState } from "react";
import Link from "next/link";

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

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">ML Runs</h1>

      <table className="min-w-full text-sm border border-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-3 py-2 text-left border-b">ID</th>
            <th className="px-3 py-2 text-left border-b">Model Version</th>
            <th className="px-3 py-2 text-left border-b">Run At</th>
            <th className="px-3 py-2 text-left border-b">Samples Used</th>
            <th className="px-3 py-2 text-left border-b">Notes</th>
            <th className="px-3 py-2 text-left border-b">Details</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.id} className="hover:bg-gray-50">
              <td className="px-3 py-2 border-b">{run.id}</td>
              <td className="px-3 py-2 border-b font-mono">
                {run.model_version}
              </td>
              <td className="px-3 py-2 border-b">
                {run.run_at ? new Date(run.run_at).toLocaleString() : "—"}
              </td>
              <td className="px-3 py-2 border-b">
                {run.samples_used ?? "—"}
              </td>
              <td className="px-3 py-2 border-b">
                {run.notes || "—"}
              </td>
              <td className="px-3 py-2 border-b">
                <Link
                  href={`/admin/ml/${run.id}`}
                  className="underline"
                >
                  View
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
