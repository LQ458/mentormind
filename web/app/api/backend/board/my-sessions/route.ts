export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { backendHeaders } from '../../_auth'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  try {
    const res = await fetch(`${BACKEND_URL}/board/my-sessions`, {
      method: 'GET',
      headers: backendHeaders(req),
    })
    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error('[board my-sessions proxy] error:', err)
    return NextResponse.json(
      { error: 'Failed to reach board service' },
      { status: 502 },
    )
  }
}
