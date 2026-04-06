import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Allow login page
  if (pathname === '/e-sop-atrbpn/login' || pathname === '/login') {
    return NextResponse.next();
  }

  // Allow static assets
  if (pathname.includes('/_next/') || pathname.includes('/favicon')) {
    return NextResponse.next();
  }

  // Force dynamic - don't use cache
  const response = NextResponse.next();
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};