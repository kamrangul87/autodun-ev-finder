import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const key = process.env.OCM_API_KEY || process.env.OPENCHARGEMAP_API_KEY;
  return NextResponse.json({
    hasOCMKey: !!(key && key.trim().length > 0),
    envVarUsed: process.env.OCM_API_KEY
      ? "OCM_API_KEY"
      : process.env.OPENCHARGEMAP_API_KEY
      ? "OPENCHARGEMAP_API_KEY"
      : null,
  });
}
