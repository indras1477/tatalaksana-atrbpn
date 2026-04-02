import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const BASE_PATH = '/e-sop-atrbpn';

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Allow all /e-sop-atrbpn paths - don't check auth here
  // Let client-side handle the redirect
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};