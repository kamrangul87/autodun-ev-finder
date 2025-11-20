// pages/api/admin/ml-runs.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

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
  metrics_json: MlMetrics | null;
};

type ApiOk = { runs: MlRun[] };
type ApiError = { error: string };

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase =
  url && serviceKey
    ? createClient(url, serviceKey, { auth: { persistSession: false } })
    : null;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiOk | ApiError>
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!supabase) {
    return res
      .status(500)
      .json({ error: "Supabase env not configured for ml_runs" });
  }

  try {
    const { data, error } = await supabase
      .from("ml_runs")
      .select(
        "id, model_version, run_at, samples_used, notes, metrics_json"
      )
      .order("run_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("[admin/ml-runs] Supabase error:", error.message);
      return res.status(500).json({ error: "Failed to load ml_runs" });
    }

    const runs: MlRun[] = (data ?? []).map((row: any) => ({
      id: row.id,
      model_version: row.model_version ?? "",
      run_at: row.run_at,
      samples_used: row.samples_used ?? null,
      notes: row.notes ?? null,
      metrics_json: row.metrics_json || null,
    }));

    return res.status(200).json({ runs });
  } catch (e: any) {
    console.error("[admin/ml-runs] Unexpected error:", e?.message || e);
    return res.status(500).json({ error: "Unexpected error" });
  }
}
