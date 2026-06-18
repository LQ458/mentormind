import { NextRequest } from 'next/server'

export function backendHeaders(
  req: NextRequest,
  base: Record<string, string> = {},
): Record<string, string> {
  const headers: Record<string, string> = { ...base }
  const explicitAuth = req.headers.get('Authorization')
  const cookieToken =
    req.cookies.get('mm_token')?.value ||
    req.cookies.get('better-auth.session_token')?.value ||
    req.cookies.get('session_token')?.value
  const auth = explicitAuth || (cookieToken ? `Bearer ${cookieToken}` : null)
  if (auth) headers.Authorization = auth
  return headers
}
