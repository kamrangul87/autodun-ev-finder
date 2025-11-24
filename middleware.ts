// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const config = {
  // protect ALL /admin routes (e.g. /admin/feedback, /admin/ml, etc.)
  matcher: ["/admin/:path*"],
};

export default function middleware(req: NextRequest) {
  const user = process.env.ADMIN_USER || "";
  const pass = process.env.ADMIN_PASS || "";

  // If env vars are not set, skip auth (to avoid locking you out by mistake)
  if (!user || !pass) return NextResponse.next();

  const auth = req.headers.get("authorization");

  if (auth && auth.startsWith("Basic ")) {
    try {
      const [, b64] = auth.split(" ");
      const [u, p] = atob(b64).split(":");
      if (u === user && p === pass) {
        return NextResponse.next();
      }
    } catch {
      // ignore and fall through to 401
    }
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Autodun Admin"',
    },
  });
}
