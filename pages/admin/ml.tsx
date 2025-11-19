<<<<<<< HEAD
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
=======
// serve/pages/admin/ml.tsx
import { useEffect, useState } from "react";

type Run = {
  id: number;
  model_version: string;
  run_at: string;
  samples_used: number;
  notes: string;
};

export default function MLAdmin() {
  const [runs, setRuns] = useState<Run[] | null>(null);

  useEffect(() => {
    fetch("/api/admin/ml-runs")
      .then((r) => r.json())
      .then((d) => setRuns(d.runs ?? []))
      .catch(() => setRuns([]));
  }, []);

  if (runs === null) {
    return (
      <div style={{ padding: 40 }}>
        <h1>ML Training Status</h1>
        <p>Loading ML run history…</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 40 }}>
      <h1>ML Training Status</h1>
      <p>
>>>>>>> c7c6b6d6 (feat(admin/ml): add ML admin page)
        Overview of nightly ML retraining runs logged from GitHub Actions into
        Supabase <code>ml_runs</code>.
      </p>

      <div
        style={{
          display: "flex",
          gap: 20,
          marginTop: 24,
          marginBottom: 32,
        }}
      >
        <div>
          <h3>Current model</h3>
          <p style={{ fontSize: 20, fontWeight: 600 }}>
            {runs[0]?.model_version ?? "—"}
          </p>
        </div>

        <div>
          <h3>Last run</h3>
          <p>
            {runs[0]?.run_at
              ? new Date(runs[0].run_at).toLocaleString()
              : "No runs yet"}
          </p>
        </div>

        <div>
          <h3>Total runs (shown)</h3>
          <p>{runs.length}</p>
        </div>
      </div>

      <h2>Recent runs</h2>

      {runs.length === 0 ? (
        <p>No runs logged yet.</p>
      ) : (
        <table
          cellPadding={8}
          style={{ marginTop: 16, borderCollapse: "collapse", width: "100%" }}
        >
          <thead>
            <tr>
              <th align="left">ID</th>
              <th align="left">Version</th>
              <th align="left">Run at</th>
              <th align="left">Samples</th>
              <th align="left">Notes</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id}>
                <td>{r.id}</td>
                <td>{r.model_version}</td>
                <td>{new Date(r.run_at).toLocaleString()}</td>
                <td>{r.samples_used}</td>
                <td>{r.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
