export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { backendHeaders } from '../../../_auth'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(
  req: NextRequest,
  { params }: { params: { sessionId: string } },
) {
  try {
    const { sessionId } = params
    const res = await fetch(`${BACKEND_URL}/board/${sessionId}/state`, {
      method: 'GET',
      cache: 'no-store',
      headers: backendHeaders(req),
    })
    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, {
      status: res.status,
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (err) {
    console.error('[board state proxy] error:', err)
    return NextResponse.json(
      { error: 'Failed to reach board service' },
      { status: 502 },
    )
  }
}
