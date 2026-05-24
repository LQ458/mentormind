import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'

const PROTECTED_PREFIXES = [
  '/dashboard',
  '/settings',
  '/create',
  '/lessons',
  '/study-plan',
  '/knowledge-graph',
  '/analytics',
  '/gaokao',
  '/board',
  '/admin',
]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + '/'),
  )
  if (!isProtected) return NextResponse.next()

  const session = await auth.api.getSession({
    headers: request.headers,
  })

  if (!session?.user) {
    const signInUrl = new URL('/auth/login', request.url)
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
