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
    '/invite',
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

  // ── MFA gate ───────────────────────────────────────────────────────────────
  // MFA is required for Administrators (CHECKLIST.md section 5). This is the
  // one place it is forced, so there is no page an Administrator can reach at
  // aal1. An Administrator with no factor yet cannot reach aal2, so the same
  // rule produces forced enrolment and forced challenge.
  if (user && !isPublicRoute && !isApiRoute && !pathname.startsWith('/mfa')) {
    const { data: { session } } = await supabase.auth.getSession();
    const aal = readAalClaim(session?.access_token);

    if (aal !== 'aal2') {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('role, tenant_id')
        .eq('id', user.id)
        .maybeSingle();

      let mustMfa = profile?.role === 'admin';

      // A firm may additionally require it of everyone (tenants.require_mfa_all_users).
      if (!mustMfa && profile?.tenant_id) {
        const { data: tenant } = await supabase
          .from('tenants')
          .select('require_mfa_all_users')
          .eq('id', profile.tenant_id)
          .maybeSingle();
        mustMfa = tenant?.require_mfa_all_users === true;
      }

      if (mustMfa) {
        const url = request.nextUrl.clone();
        url.pathname = '/mfa';
        url.search = '';
        url.searchParams.set('next', pathname);
        return NextResponse.redirect(url);
      }
    }
  }

  // IMPORTANT: Always return supabaseResponse, not a new NextResponse.next()
  return supabaseResponse;
}

/**
 * Read the `aal` claim from an access token already validated by
 * supabase.auth.getUser() above. No signature check here on purpose — this is
 * reading a claim out of a token the auth server just vouched for, not
 * accepting an unverified one.
 */
function readAalClaim(token: string | undefined): string | null {
  if (!token) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(token.split('.')[1], 'base64').toString('utf8')
    );
    return typeof payload?.aal === 'string' ? payload.aal : null;
  } catch {
    return null;
  }
}
