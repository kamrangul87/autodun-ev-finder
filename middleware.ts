// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const config = {
  matcher: ["/admin/:path*"],
};

export default function middleware(req: NextRequest) {
  // 🚫 No auth at all (for now)
  return NextResponse.next();
}
