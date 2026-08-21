import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';

export async function updateSession(request: NextRequest) {
  // Server components cannot read the current path, and the access guard in
  // app/(app)/layout.tsx needs it. Forwarding it as a header is the supported
  // way to get it there.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-pathname', request.nextUrl.pathname);

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request: { headers: requestHeaders } });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isAppRoute = path.startsWith('/');
  const isAuthRoute = path.startsWith('/login');
  const isChangePassword = path.startsWith('/change-password');

  if (!user && isAppRoute && !isAuthRoute) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (user && isAuthRoute) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // A user still on the temporary password their admin set goes nowhere but
  // /change-password. Checked here rather than in a layout so no route — page,
  // server action target or API handler — can be reached around it.
  if (user && !isChangePassword && !isServerAsset(path)) {
    const { data: profile } = await supabase
      .from('users')
      .select('must_change_password')
      .eq('id', user.id)
      .single();

    if (profile?.must_change_password) {
      return NextResponse.redirect(new URL('/change-password', request.url));
    }
  }

  return response;
}

// Next's own endpoints and the auth callback must stay reachable, or the
// redirect above would break the very session it depends on.
function isServerAsset(path: string): boolean {
  return path.startsWith('/_next') || path.startsWith('/api/auth') || path === '/logout';
}
