// server/db.ts
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

export async function insertScore(row: {
  station_id: string;
  score: number;
  model_version: string;
  lat?: number;
  lng?: number;
  council_code?: string;
}) {
  // table: station_scores (create if not exists)
  await supabase.from("station_scores").insert(row);
}

export async function insertAudit(action: string, meta?: any) {
  // table: admin_audit (create if not exists)
  await supabase.from("admin_audit").insert({ action, meta });
}
