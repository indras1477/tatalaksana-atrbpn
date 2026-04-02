import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  
  // Allow login page
  if (pathname === '/e-sop-atrbpn/login' || pathname === '/login') {
    return NextResponse.next();
  }
  
  // Check token cookie for all other routes
  const token = request.cookies.get('token');
  if (!token) {
    return NextResponse.redirect(new URL('/e-sop-atrbpn/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};