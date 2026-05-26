import { type NextRequest, NextResponse } from 'next/server'
import { SignJWT } from 'jose'
import { auth } from '@/lib/auth'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    })

    if (!session?.user) {
      return NextResponse.json({ token: null }, { status: 401 })
    }

    const secret = new TextEncoder().encode(process.env.BETTER_AUTH_SECRET || 'change-me-in-production')

    const token = await new SignJWT({
      sub: session.user.id,
      email: session.user.email,
      name: session.user.name,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('24h')
      .sign(secret)

    return NextResponse.json({ token })
  } catch {
    return NextResponse.json({ token: null }, { status: 401 })
  }
}
