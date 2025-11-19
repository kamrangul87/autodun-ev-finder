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

const cardStyle: React.CSSProperties = {
  flex: "1 1 220px",
  padding: "1rem 1.25rem",
  borderRadius: 12,
  border: "1px solid #e5e7eb",
  background: "#ffffff",
  boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
};

const cardTitleStyle: React.CSSProperties = {
  fontSize: "0.85rem",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "#6b7280",
  marginBottom: "0.5rem",
};

const cardValueStyle: React.CSSProperties = {
  fontSize: "1.1rem",
  fontWeight: 600,
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "0.5rem 0.75rem",
  borderBottom: "1px solid #e5e7eb",
  background: "#f9fafb",
  fontWeight: 600,
};

const tdStyle: React.CSSProperties = {
  padding: "0.5rem 0.75rem",
  borderBottom: "1px solid #f3f4f6",
};

export default function MLAdminPage() {
  const [runs, setRuns] = useState<MlRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/admin/ml-runs");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: ApiResponse = await res.json();
        setRuns(json.runs || []);
      } catch (e: any) {
        setError(e?.message || "Failed to load ml_runs");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const latest = runs[0] ?? null;

  return (
    <div style={{ padding: "2rem" }}>
      <h1 style={{ fontSize: "2rem", marginBottom: "1.5rem" }}>
        ML Training Status
      </h1>

      <p style={{ marginBottom: "1.5rem" }}>
        Overview of nightly ML retraining runs logged from GitHub Actions into
        Supabase <code>ml_runs</code>.
      </p>

      {loading && <p>Loading…</p>}

      {error && !loading && (
        <p style={{ color: "red", marginBottom: "1rem" }}>
          Error loading data: {error}
        </p>
      )}

      {!loading && !error && (
        <>
          {/* Summary cards */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "1rem",
              marginBottom: "2rem",
            }}
          >
            <div style={cardStyle}>
              <h2 style={cardTitleStyle}>Current model</h2>
              <p style={cardValueStyle}>{latest?.model_version ?? "—"}</p>
            </div>

            <div style={cardStyle}>
              <h2 style={cardTitleStyle}>Last run</h2>
              <p style={cardValueStyle}>
                {latest
                  ? new Date(latest.run_at).toLocaleString()
                  : "No runs yet"}
              </p>
            </div>

            <div style={cardStyle}>
              <h2 style={cardTitleStyle}>Total runs (shown)</h2>
              <p style={cardValueStyle}>{runs.length}</p>
            </div>
          </div>

          {/* Table of runs */}
          <section>
            <h2 style={{ fontSize: "1.25rem", marginBottom: "0.75rem" }}>
              Recent runs
            </h2>

            {runs.length === 0 ? (
              <p>No runs logged yet.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: "0.9rem",
                  }}
                >
                  <thead>
                    <tr>
                      <th style={thStyle}>ID</th>
                      <th style={thStyle}>Run at</th>
                      <th style={thStyle}>Model version</th>
                      <th style={thStyle}>Samples</th>
                      <th style={thStyle}>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((r) => (
                      <tr key={r.id}>
                        <td style={tdStyle}>{r.id}</td>
                        <td style={tdStyle}>
                          {new Date(r.run_at).toLocaleString()}
                        </td>
                        <td style={tdStyle}>{r.model_version}</td>
                        <td style={tdStyle}>{r.samples_used ?? "—"}</td>
                        <td style={tdStyle}>{r.notes ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
