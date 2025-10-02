"use client";
import { useState } from "react";
import Card from "../../components/nexus/Card";

export default function MotPredictorPage() {
  const [reg, setReg] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(null); setResult(null);
    try {
      const res = await fetch("/api/mot/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reg }),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      setResult(await res.json());
    } catch (err: any) {
      setError(err.message || "Failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">MOT Predictor</h1>
      <Card title="Check MOT pass probability">
        <form onSubmit={onSubmit} className="flex gap-3 items-center">
          <input
            value={reg}
            onChange={(e) => setReg(e.target.value.toUpperCase())}
            placeholder="e.g. AB12CDE"
            className="flex-1 border rounded-xl px-3 py-2"
          />
          <button disabled={!reg || loading} className="rounded-xl px-4 py-2 bg-black text-white disabled:opacity-50">
            {loading ? "Checking…" : "Predict"}
          </button>
        </form>
        {error && <p className="text-red-600 mt-3">Error: {error}</p>}
        {result && (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Card title="Probability">
              <p className="text-3xl font-semibold">{Math.round(result.passProbability * 100)}%</p>
              <p className="text-sm text-gray-600">chance to pass next MOT</p>
            </Card>
            <Card title="Signals">
              <ul className="list-disc list-inside text-sm">
                {result.topSignals.map((s: string, i: number) => <li key={i}>{s}</li>)}
              </ul>
            </Card>
          </div>
        )}
      </Card>
    </main>
  );
}
