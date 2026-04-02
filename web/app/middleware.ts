import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const token = request.cookies.get('token');
  const isLoginPage = request.nextUrl.pathname === '/login';
  const isApi = request.nextUrl.pathname.startsWith('/api');

  // Allow access to login page and API
  if (isLoginPage || isApi) {
    return NextResponse.next();
  }

  // If no token and trying to access protected page, redirect to login
  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};