import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: Do NOT add any logic between createServerClient and auth.getUser()
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Debug logging
  const cookies = request.cookies.getAll();
  const sbCookies = cookies.filter(c => c.name.startsWith('sb-'));
  console.log(`[PROXY] ${pathname} | cookies: ${sbCookies.map(c => c.name).join(', ') || 'NONE'} | user: ${user?.email || 'NULL'} | error: ${authError?.message || 'none'}`);

  // Public routes - no auth required
  const publicRoutes = [
    '/',
    '/login',
    '/signup',
    '/forgot-password',
    '/reset-password',
    '/privacy',
    '/terms',
    '/legal/privacy',
    '/legal/terms',
    '/legal/eula',
  ];

  const isPublicRoute = publicRoutes.some(
    (route) => pathname === route || pathname.startsWith(route + '/')
  );
  const isApiRoute = pathname.startsWith('/api/');

  // If user is NOT authenticated and route is protected, redirect to login
  if (!user && !isPublicRoute && !isApiRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(url);
  }

  // If user IS authenticated and on login/signup, redirect to dashboard
  if (user && (pathname === '/login' || pathname === '/signup')) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  // IMPORTANT: Always return supabaseResponse, not a new NextResponse.next()
  return supabaseResponse;
}
