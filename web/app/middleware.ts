import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Izinkan halaman login & static assets
  if (
    pathname === '/e-sop-atrbpn/login' ||
    pathname === '/login' ||
    pathname.includes('/_next/') ||
    pathname.includes('/favicon')
  ) {
    return NextResponse.next();
  }

  // Cek token dari cookie
  const token = request.cookies.get('token')?.value;

  if (!token) {
    // Redirect ke login jika tidak ada token
    const loginUrl = new URL('/e-sop-atrbpn/login', request.url);
    const response = NextResponse.redirect(loginUrl);
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    return response;
  }

  const response = NextResponse.next();
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};