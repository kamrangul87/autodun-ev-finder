// pages/admin/ml/[id].tsx
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

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

export default function MlRunDetailPage() {
  const router = useRouter();
  const { id } = router.query;

  const [run, setRun] = useState<MlRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        // Reuse the existing endpoint, then pick the run we need
        const res = await fetch("/api/admin/ml-runs");
        if (!res.ok) {
          throw new Error(`Failed to load ml_runs (status ${res.status})`);
        }

        const json: ApiResponse = await res.json();
        const numericId = Number(id);
        const found = json.runs?.find((r) => Number(r.id) === numericId) ?? null;

        if (!found) {
          setError(`Run with id ${id} not found`);
          setRun(null);
        } else {
          setRun(found);
        }
      } catch (err: any) {
        console.error("Failed to load ml run", err);
        setError(err?.message ?? "Failed to load ml run");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [id]);

  if (loading) {
    return <div className="p-6 text-sm">Loading ML run…</div>;
  }

  if (error) {
    return (
      <div className="p-6 space-y-3 text-sm">
        <button
          onClick={() => router.push("/admin/ml")}
          className="px-3 py-1 text-xs border rounded"
        >
          ← Back to ML runs
        </button>
        <div className="text-red-600">Error: {error}</div>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="p-6 space-y-3 text-sm">
        <button
          onClick={() => router.push("/admin/ml")}
          className="px-3 py-1 text-xs border rounded"
        >
          ← Back to ML runs
        </button>
        <div>ML run not found.</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <button
        onClick={() => router.push("/admin/ml")}
        className="px-3 py-1 text-xs border rounded"
      >
        ← Back to ML runs
      </button>

      <h1 className="text-2xl font-semibold">
        ML Run #{run.id}
      </h1>

      <div className="grid gap-4 md:grid-cols-2 text-sm">
        <div className="border rounded-lg p-4 space-y-2">
          <h2 className="font-semibold text-base">Run Info</h2>
          <div>
            <span className="font-medium">Model Version: </span>
            <span className="font-mono">{run.model_version}</span>
          </div>
          <div>
            <span className="font-medium">Run At: </span>
            <span>
              {run.run_at
                ? new Date(run.run_at).toLocaleString()
                : "—"}
            </span>
          </div>
          <div>
            <span className="font-medium">Samples Used: </span>
            <span>{run.samples_used ?? "—"}</span>
          </div>
        </div>

        <div className="border rounded-lg p-4 space-y-2">
          <h2 className="font-semibold text-base">Notes</h2>
          <p className="whitespace-pre-wrap">
            {run.notes || "No notes for this run."}
          </p>
        </div>
      </div>
    </div>
  );
}
