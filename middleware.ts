import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  if (req.nextUrl.pathname === '/model1-heatmap') {
    return NextResponse.redirect(new URL('/', req.url), 308);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/model1-heatmap'],
};
