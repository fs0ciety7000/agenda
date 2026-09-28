import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_PATHS = [
  '/login',
  '/register',
  '/invite',
  '/healthz',
  '/forgot-password',
  '/reset-password',
  '/privacy',
  '/about',
  '/status',
];

/** Site vitrine (docs/deployment.md §15), figé au build ; vide = pas de redirection. */
const SITE_URL = (process.env.SITE_URL ?? '').replace(/\/+$/, '');

/**
 * Garde-fou de navigation uniquement (l'autorisation réelle est faite par l'API) :
 * sans cookie de session, on redirige vers /login en conservant la destination ; l'accueil
 * « / » d'un visiteur non connecté mène au site vitrine s'il est configuré.
 */
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`)))
    return NextResponse.next();

  const hasSession = req.cookies.has('gn_at') || req.cookies.has('gn_rt');
  if (hasSession) return NextResponse.next();

  // Redirection temporaire (302) : la même adresse sert l'app une fois connecté.
  if (pathname === '/' && SITE_URL) return NextResponse.redirect(`${SITE_URL}/`, 302);

  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Exclut l'API proxifiée, les assets et les fichiers statiques.
  matcher: ['/((?!v1/|_next/|favicon.ico|.*\\.[a-z0-9]+$).*)'],
};
