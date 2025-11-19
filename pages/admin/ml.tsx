// pages/admin/ml.tsx
import React, { useEffect, useState } from "react";

type MlRun = {
  id: number;
  model_version: string;
  run_at: string;
  samples_used: number | null;
  notes: string | null;
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  borderBottom: "1px solid #eee",
  padding: "8px 6px",
  fontWeight: 600,
  fontSize: 12,
  textTransform: "uppercase",
  color: "#555",
};

const tdStyle: React.CSSProperties = {
  borderBottom: "1px solid #f1f1f1",
  padding: "8px 6px",
};

export default function AdminMlPage() {
  const [runs, setRuns] = useState<MlRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const res = await fetch("/api/admin/ml-runs");
        if (!res.ok) throw new Error("Failed to load ml_runs");
        const json = await res.json();
        setRuns(json.runs || []);
        setError(null);
      } catch (e: any) {
        setError(e?.message || "Failed to load ml_runs");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const latest = runs[0];

  return (
    <main style={{ padding: 24, maxWidth: 960, margin: "0 auto" }}>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>ML Training Status</h1>
      <p style={{ color: "#555", marginBottom: 24 }}>
        Overview of nightly ML retraining runs logged from GitHub Actions into
        Supabase <code>ml_runs</code>.
      </p>

      {loading && <p>Loading…</p>}
      {error && (
        <p style={{ color: "red", marginBottom: 16 }}>
          Error loading data: {error}
        </p>
      )}

      {!loading && !error && (
        <>
          <section
            style={{
              display: "flex",
              gap: 16,
              marginBottom: 24,
              flexWrap: "wrap",
            }}
          >
            <div
              style={{
                flex: "1 1 160px",
                border: "1px solid #eee",
                borderRadius: 8,
                padding: 16,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  textTransform: "uppercase",
                  color: "#777",
                  marginBottom: 4,
                }}
              >
                Current model
              </div>
              <div style={{ fontSize: 20, fontWeight: 600 }}>
                {latest?.model_version ?? "—"}
              </div>
            </div>

            <div
              style={{
                flex: "1 1 160px",
                border: "1px solid #eee",
                borderRadius: 8,
                padding: 16,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  textTransform: "uppercase",
                  color: "#777",
                  marginBottom: 4,
                }}
              >
                Last run
              </div>
              <div style={{ fontSize: 16 }}>
                {latest
                  ? new Date(latest.run_at).toLocaleString()
                  : "No runs yet"}
              </div>
            </div>

            <div
              style={{
                flex: "1 1 160px",
                border: "1px solid #eee",
                borderRadius: 8,
                padding: 16,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  textTransform: "uppercase",
                  color: "#777",
                  marginBottom: 4,
                }}
              >
                Total runs (shown)
              </div>
              <div style={{ fontSize: 20, fontWeight: 600 }}>{runs.length}</div>
            </div>
          </section>

          <section>
            <h2 style={{ fontSize: 18, marginBottom: 8 }}>Recent runs</h2>
            {runs.length === 0 ? (
              <p>No runs logged yet.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table
                  style={{
                    borderCollapse: "collapse",
                    width: "100%",
                    fontSize: 14,
                  }}
                >
                  <thead>
                    <tr>
                      <th style={thStyle}>Run at</th>
                      <th style={thStyle}>Model version</th>
                      <th style={thStyle}>Samples</th>
                      <th style={thStyle}>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((run) => (
                      <tr key={run.id}>
                        <td style={tdStyle}>
                          {new Date(run.run_at).toLocaleString()}
                        </td>
                        <td style={tdStyle}>{run.model_version}</td>
                        <td style={tdStyle}>{run.samples_used ?? "—"}</td>
                        <td style={tdStyle}>{run.notes ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
