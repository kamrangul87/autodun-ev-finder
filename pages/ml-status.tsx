// pages/ml-status.tsx
import React, { useEffect, useState } from "react";

type MlRun = {
  id: number;
  model_version: string;
  run_at: string;
  samples_used: number | null;
  notes: string | null;
  accuracy: number | null;
  precision: number | null;
  recall: number | null;
};

type ApiResponse = {
  runs: MlRun[];
};

export default function MlStatusPage() {
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
      } catch (err: unknown) {
        console.error(err);
        setError("Could not load model status. Please try again later.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const latest = runs[0];

  function fmtPct(x: number | null | undefined) {
    if (x == null) return "—";
    return `${Math.round(x * 100)}%`;
  }

  function fmtDate(iso: string | null | undefined) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  }

  return (
    <div
      style={{
        padding: 24,
        maxWidth: 900,
        margin: "0 auto",
        fontFamily: "Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <h1 style={{ fontSize: 26, fontWeight: 800, marginBottom: 8 }}>
        Autodun EV Finder · Model status
      </h1>

      <p style={{ maxWidth: 640, fontSize: 14, color: "#4b5563" }}>
        This page shows the current status of the machine learning model that scores
        EV charging feedback (good / bad / reliability). The model is retrained
        automatically from recent feedback data.
      </p>

      {loading && <p style={{ marginTop: 16 }}>Loading model status…</p>}
      {error && (
        <p style={{ marginTop: 16, color: "#b91c1c", fontWeight: 600 }}>{error}</p>
      )}

      {!loading && !error && latest && (
        <>
          {/* KPI cards */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              marginTop: 20,
              marginBottom: 20,
            }}
          >
            <KpiCard label="Current model" value={latest.model_version} />
            <KpiCard label="Last training run" value={fmtDate(latest.run_at)} />
            <KpiCard label="Samples used" value={latest.samples_used?.toString() ?? "—"} />
            <KpiCard label="Accuracy" value={fmtPct(latest.accuracy)} />
            <KpiCard label="Precision" value={fmtPct(latest.precision)} />
            <KpiCard label="Recall" value={fmtPct(latest.recall)} />
          </div>

          {latest.notes && (
            <div
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 12,
                padding: 12,
                marginBottom: 24,
                background: "#f9fafb",
                fontSize: 13,
              }}
            >
              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>
                Notes
              </div>
              <div>{latest.notes}</div>
            </div>
          )}

          {/* Recent runs table */}
          <div
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              padding: 12,
              background: "#fff",
            }}
          >
            <div
              style={{
                fontWeight: 800,
                fontSize: 15,
                marginBottom: 8,
              }}
            >
              Recent training runs
            </div>
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "separate",
                  borderSpacing: 0,
                  fontSize: 13,
                }}
              >
                <thead>
                  <tr>
                    <Th>ID</Th>
                    <Th>Run at</Th>
                    <Th>Model</Th>
                    <Th>Samples</Th>
                    <Th>Accuracy</Th>
                    <Th>Precision</Th>
                    <Th>Recall</Th>
                    <Th>Notes</Th>
                  </tr>
                </thead>
                <tbody>
                  {runs.slice(0, 20).map((run) => (
                    <tr key={run.id}>
                      <Td>{run.id}</Td>
                      <Td>{fmtDate(run.run_at)}</Td>
                      <Td>{run.model_version}</Td>
                      <Td>{run.samples_used ?? "—"}</Td>
                      <Td>{fmtPct(run.accuracy)}</Td>
                      <Td>{fmtPct(run.precision)}</Td>
                      <Td>{fmtPct(run.recall)}</Td>
                      <Td>{run.notes ?? "—"}</Td>
                    </tr>
                  ))}
                  {runs.length === 0 && (
                    <tr>
                      <Td colSpan={8}>No runs recorded yet.</Td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* Small presentational helpers */
function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: "10px 12px",
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        minWidth: 150,
        background: "#fff",
      }}
    >
      <div style={{ fontSize: 12, color: "#6b7280" }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800 }}>{value}</div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      style={{
        textAlign: "left",
        padding: "8px 6px",
        fontSize: 12,
        color: "#6b7280",
        borderBottom: "1px solid #e5e7eb",
        background: "#f9fafb",
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  colSpan,
}: {
  children: React.ReactNode;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      style={{
        padding: "6px 6px",
        borderBottom: "1px solid #f3f4f6",
        verticalAlign: "top",
      }}
    >
      {children}
    </td>
  );
}
