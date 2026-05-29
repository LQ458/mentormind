export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    const auth = req.headers.get('Authorization')
    if (auth) headers.Authorization = auth
    const search = req.nextUrl.search || ''
    const res = await fetch(`${BACKEND_URL}/admin/feedback/aggregate${search}`, {
      method: 'GET',
      headers,
    })
    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error('[admin feedback aggregate proxy] error:', err)
    return NextResponse.json(
      { error: 'Failed to reach feedback service' },
      { status: 502 },
    )
  }
}
