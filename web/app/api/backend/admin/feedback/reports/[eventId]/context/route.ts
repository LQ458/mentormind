export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { backendHeaders } from '../../../../../_auth'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(
  req: NextRequest,
  { params }: { params: { eventId: string } },
) {
  try {
    const search = req.nextUrl.search || ''
    const eventId = encodeURIComponent(params.eventId)
    const res = await fetch(`${BACKEND_URL}/admin/feedback/reports/${eventId}/context${search}`, {
      method: 'GET',
      headers: backendHeaders(req, { 'Content-Type': 'application/json' }),
    })
    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error('[admin feedback report context proxy] error:', err)
    return NextResponse.json(
      { error: 'Failed to reach feedback report context service' },
      { status: 502 },
    )
  }
}
