export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { backendHeaders } from '../../../../_auth'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  try {
    const search = req.nextUrl.search || ''
    const res = await fetch(`${BACKEND_URL}/admin/feedback/reports/aggregate${search}`, {
      method: 'GET',
      headers: backendHeaders(req, { 'Content-Type': 'application/json' }),
    })
    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error('[admin feedback reports aggregate proxy] error:', err)
    return NextResponse.json(
      { error: 'Failed to reach feedback report aggregate service' },
      { status: 502 },
    )
  }
}
