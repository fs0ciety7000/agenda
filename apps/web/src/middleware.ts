import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_PATHS = [
  '/login',
  '/register',
  '/invite',
  '/healthz',
  '/forgot-password',
  '/reset-password',
];

/**
 * Garde-fou de navigation uniquement (l'autorisation réelle est faite par l'API) :
 * sans cookie de session, on redirige vers /login en conservant la destination.
 */
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`)))
    return NextResponse.next();

  const hasSession = req.cookies.has('gn_at') || req.cookies.has('gn_rt');
  if (hasSession) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Exclut l'API proxifiée, les assets et les fichiers statiques.
  matcher: ['/((?!v1/|_next/|favicon.ico|.*\\.[a-z0-9]+$).*)'],
};
