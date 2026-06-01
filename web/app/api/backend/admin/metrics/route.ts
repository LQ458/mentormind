export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  try {
    const headers: Record<string, string> = {}
    const auth = req.headers.get('Authorization')
    if (auth) headers.Authorization = auth
    const res = await fetch(`${BACKEND_URL}/admin/metrics`, {
      method: 'GET',
      headers,
      cache: 'no-store',
    })
    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error('[admin metrics proxy] error:', err)
    return NextResponse.json(
      { error: 'Failed to reach metrics service' },
      { status: 502 },
    )
  }
}
