export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { backendHeaders } from '../../../_auth'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  try {
    const headers = backendHeaders(req, {
      'Content-Type': 'application/json',
    })
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
