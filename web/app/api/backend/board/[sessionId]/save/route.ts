export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { backendHeaders } from '../../../_auth'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

export async function POST(
  req: NextRequest,
  { params }: { params: { sessionId: string } },
) {
  try {
    const { sessionId } = params
    const body = await req.text()
    const headers = backendHeaders(req, { 'Content-Type': 'application/json' })
    const res = await fetch(`${BACKEND_URL}/board/${sessionId}/save`, {
      method: 'POST',
      headers,
      body,
    })
    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error('[board save proxy] error:', err)
    return NextResponse.json(
      { error: 'Failed to reach board service' },
      { status: 502 },
    )
  }
}
