// lib/supabaseAdmin.ts
// Server-only Supabase Admin client (Service Role). Safe fallback to null.

let supabase: any = null;

try {
  // Use require inside try/catch (allowed). `import` here breaks TypeScript build.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
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
  console.warn("[supabaseAdmin] Package missing; running in no-op mode.");
}

export default supabase;
