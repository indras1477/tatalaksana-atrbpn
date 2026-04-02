import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const BASE_PATH = '/e-sop-atrbpn';

export function middleware(request: NextRequest) {
  const token = request.cookies.get('token');
  const pathname = request.nextUrl.pathname;
  
  const isLoginPage = pathname === `${BASE_PATH}/login` || pathname === '/login';
  const isApi = pathname.startsWith(`${BASE_PATH}/api`) || pathname.startsWith('/api');

  // Allow access to login page and API
  if (isLoginPage || isApi) {
    return NextResponse.next();
  }

  // If no token and trying to access protected page, redirect to login
  if (!token) {
    return NextResponse.redirect(new URL(`${BASE_PATH}/login`, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};