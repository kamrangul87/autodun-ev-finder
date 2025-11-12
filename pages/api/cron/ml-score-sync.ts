// pages/api/cron/ml-score-sync.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cron endpoint to (lightly) sync/verify ML score pipeline connectivity.
 * Current behavior: safe no-op "ping" to Supabase to ensure credentials & network are OK.
 * You can later replace the PING with your actual sync logic.
 */

// Resolve Supabase server creds (do NOT require them — endpoint stays safe if missing)
const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";

const supabase: SupabaseClient | null =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
      })
    : null;

export default async function handler(
  _req: NextApiRequest,
  res: NextApiResponse
) {
  // If Supabase not configured, do nothing (safe no-op)
  if (!supabase) {
    return res
      .status(200)
      .json({ ok: true, rowsUpdated: 0, note: "Supabase not configured" });
  }

  try {
    // 🔎 Safe "ping": head count on a known table (adjust to any table that always exists)
    // Replace 'feedback' with any lightweight table available in your DB.
    const { error, count } = await supabase
      .from("feedback")
      .select("id", { count: "exact", head: true });

    if (error) {
      return res
        .status(500)
        .json({ ok: false, error: error.message ?? "Supabase error" });
    }

    // ✅ Placeholder response — no mutations performed
    return res.status(200).json({
      ok: true,
      rowsUpdated: 0,
      pingCount: count ?? null,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return res
      .status(500)
      .json({ ok: false, error: err?.message ?? "unknown error" });
  }
}
