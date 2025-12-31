// lib/supabaseAdmin.ts
import { createClient } from "@supabase/supabase-js";

let supabase: any = null;

try {
  // Keep same behavior: create admin client only if env vars exist
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (url && serviceRole) {
    supabase = createClient(url, serviceRole, {
      auth: { persistSession: false },
    });
  } else {
    console.warn("[supabaseAdmin] Missing env; running in no-op mode.");
  }
} catch (e) {
  // If the package/env is missing at runtime, keep no-op mode
  console.warn("[supabaseAdmin] Package not installed; running in no-op mode.");
}

export default supabase;
