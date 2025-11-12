"use client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

/** Returns a Supabase client for the browser, or null if env keys are missing. */
export function supabaseBrowser(): SupabaseClient | null {
  if (_client) return _client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anon) {
    console.warn(
      "[supabase] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY — realtime disabled."
    );
    return null;
  }
  _client = createClient(url, anon, { auth: { persistSession: false } });
  return _client;
}
