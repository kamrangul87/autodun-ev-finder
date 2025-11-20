// pages/admin/ml/[id].tsx
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

const MlRunMiniChart = dynamic(
  () =>
    import("../../../components/ml/MlRunMiniChart").then(
      (m) => m.MlRunMiniChart
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

const fmtPct = (v: number | null | undefined) =>
  v == null ? "n/a" : `${(v * 100).toFixed(1)}%`;

export default function MlRunDetailPage() {
  const router = useRouter();
  const { id } = router.query;

  const [current, setCurrent] = useState<MlRun | null>(null);
  const [previous, setPrevious] = useState<MlRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch("/api/admin/ml-runs");
        if (!res.ok) {
          throw new Error(`Failed to load ml_runs (status ${res.status})`);
        }

        const json: ApiResponse = await res.json();
        const runs = json.runs ?? [];

        const numericId = Number(id);

        const sorted = runs
          .slice()
          .sort(
            (a, b) =>
              new Date(a.run_at).getTime() - new Date(b.run_at).getTime()
          );

        const idx = sorted.findIndex((r) => Number(r.id) === numericId);
        if (idx === -1) {
          setError(`Run with id ${id} not found`);
          setCurrent(null);
          setPrevious(null);
        } else {
          setCurrent(sorted[idx] ?? null);
          setPrevious(idx > 0 ? sorted[idx - 1] : null);
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
      <div className="p-6" style={{ fontSize: 14 }}>
        <button
          onClick={() => router.push("/admin/ml")}
          style={{
            padding: "4px 10px",
            fontSize: 12,
            borderRadius: 4,
            border: "1px solid #d1d5db",
            marginBottom: 12,
            cursor: "pointer",
          }}
        >
          ← Back to ML runs
        </button>
        <div style={{ color: "#b91c1c" }}>Error: {error}</div>
      </div>
    );
  }

  if (!current) {
    return (
      <div className="p-6" style={{ fontSize: 14 }}>
        <button
          onClick={() => router.push("/admin/ml")}
          style={{
            padding: "4px 10px",
            fontSize: 12,
            borderRadius: 4,
            border: "1px solid #d1d5db",
            marginBottom: 12,
            cursor: "pointer",
          }}
        >
          ← Back to ML runs
        </button>
        <div>ML run not found.</div>
      </div>
    );
  }

  const logsUrl =
    "https://github.com/kamrangul87/autodun-ev-finder/actions/workflows/train-ml.yml";

  const samplesCurrent = current.samples_used ?? 0;
  const samplesPrev = previous?.samples_used ?? null;
  const samplesDelta =
    samplesPrev === null ? null : samplesCurrent - samplesPrev;

  const metricsCurrent = current.metrics_json || {};
  const metricsPrev = previous?.metrics_json || {};

  return (
    <div className="p-6" style={{ fontSize: 14 }}>
      <button
        onClick={() => router.push("/admin/ml")}
        style={{
          padding: "4px 10px",
          fontSize: 12,
          borderRadius: 4,
          border: "1px solid #d1d5db",
          marginBottom: 16,
          cursor: "pointer",
        }}
      >
        ← Back to ML runs
      </button>

      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
        ML Run #{current.id}
      </h1>

      <a
        href={logsUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: "inline-block",
          marginBottom: 20,
          fontSize: 13,
          textDecoration: "underline",
        }}
      >
        Open GitHub Actions logs
      </a>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 16,
          marginBottom: 16,
        }}
      >
        {/* Current run */}
        <div
          style={{
            flex: "1 1 260px",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            padding: 12,
          }}
        >
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
            Current Run
          </h2>
          <div>
            <strong>Model Version: </strong>
            <span>{current.model_version}</span>
          </div>
          <div>
            <strong>Run At: </strong>
            <span>
              {current.run_at
                ? new Date(current.run_at).toLocaleString()
                : "—"}
            </span>
          </div>
          <div>
            <strong>Samples Used: </strong>
            <span>{samplesCurrent}</span>
          </div>

          <div style={{ marginTop: 8 }}>
            <strong>Metrics:</strong>
            <div>Accuracy: {fmtPct(metricsCurrent.accuracy)}</div>
            <div>Precision: {fmtPct(metricsCurrent.precision)}</div>
            <div>Recall: {fmtPct(metricsCurrent.recall)}</div>
          </div>

          <div style={{ marginTop: 8 }}>
            <strong>Notes:</strong>
            <div>{current.notes || "No notes for this run."}</div>
          </div>
        </div>

        {/* Comparison */}
        <div
          style={{
            flex: "1 1 260px",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            padding: 12,
          }}
        >
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
            Comparison
          </h2>

          {previous ? (
            <>
              <div style={{ marginBottom: 6 }}>
                <strong>Previous Run:</strong> #{previous.id}
              </div>
              <div>
                <strong>Prev Model: </strong>
                <span>{previous.model_version}</span>
              </div>
              <div>
                <strong>Prev Samples: </strong>
                <span>{previous.samples_used ?? 0}</span>
              </div>

              <div style={{ marginTop: 10 }}>
                <strong>Changes:</strong>
                <ul style={{ marginTop: 4, paddingLeft: 18 }}>
                  <li>
                    Model:{" "}
                    {previous.model_version === current.model_version
                      ? "same"
                      : `changed (${previous.model_version} → ${current.model_version})`}
                  </li>
                  <li>
                    Samples:{" "}
                    {samplesDelta === null
                      ? "n/a"
                      : samplesDelta === 0
                      ? "no change"
                      : samplesDelta > 0
                      ? `+${samplesDelta}`
                      : `${samplesDelta}`}
                  </li>
                  <li>
                    Accuracy:{" "}
                    {metricsPrev.accuracy != null &&
                    metricsCurrent.accuracy != null
                      ? `${fmtPct(metricsPrev.accuracy)} → ${fmtPct(
                          metricsCurrent.accuracy
                        )}`
                      : "n/a"}
                  </li>
                  <li>
                    Precision:{" "}
                    {metricsPrev.precision != null &&
                    metricsCurrent.precision != null
                      ? `${fmtPct(metricsPrev.precision)} → ${fmtPct(
                          metricsCurrent.precision
                        )}`
                      : "n/a"}
                  </li>
                  <li>
                    Recall:{" "}
                    {metricsPrev.recall != null &&
                    metricsCurrent.recall != null
                      ? `${fmtPct(metricsPrev.recall)} → ${fmtPct(
                          metricsCurrent.recall
                        )}`
                      : "n/a"}
                  </li>
                </ul>
              </div>
            </>
          ) : (
            <div>No previous runs to compare.</div>
          )}
        </div>
      </div>

      <MlRunMiniChart
        runs={previous ? [previous, current] : [current]}
      />

      <p
        style={{
          marginTop: 16,
          fontSize: 12,
          color: "#6b7280",
        }}
      >
        Data source: Supabase <code>ml_runs</code>. For full pipeline logs, see
        the GitHub Actions workflow <code>train-ml.yml</code> in the
        repository.
      </p>
    </div>
  );
}
