// lib/supabaseAdmin.ts
let supabase: any = null;

try {
  // lazy require so build doesn’t fail if package/env missing
  // eslint-disable-next-line
  const { createClient } = require("@supabase/supabase-js");

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
  console.warn("[supabaseAdmin] Package not installed; running in no-op mode.");
}

export default supabase;
