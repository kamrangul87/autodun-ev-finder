// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const config = {
  matcher: ["/admin/:path*"],
};

export default function middleware(req: NextRequest) {
  // ✅ 1) Skip auth entirely when not in production
  if (process.env.NODE_ENV !== "production") {
    return NextResponse.next();
  }

  const user = process.env.ADMIN_USER || "";
  const pass = process.env.ADMIN_PASS || "";

  // ✅ 2) If creds not configured in prod, also don’t block
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
      // ignore parsing errors
    }
  }

  // ✅ 3) If wrong or missing, ask browser for Basic Auth
  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Secure Area"',
    },
  });
}
