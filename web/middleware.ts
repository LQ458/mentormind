import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PROTECTED_PREFIXES = [
  '/dashboard',
  '/settings',
  '/ask',
  '/create',
  '/lessons',
  '/study-plan',
  '/seminar',
  '/knowledge-graph',
  '/analytics',
  '/board',
  '/admin',
]

function getSessionCookie(request: NextRequest): string | null {
  const token = request.cookies.get('mm_token')
  if (token?.value) return token.value
  const cookie = request.cookies.get('better-auth.session_token')
  if (cookie?.value) return cookie.value
  const sessionCookie = request.cookies.get('session_token')
  return sessionCookie?.value ?? null
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + '/'),
  )
  if (!isProtected) return NextResponse.next()

  const token = getSessionCookie(request)
  if (!token) {
    const signInUrl = new URL('/', request.url)
    signInUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(signInUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next|api|static|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
  ],
}
