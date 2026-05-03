export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(
  req: NextRequest,
  { params }: { params: { sessionId: string } },
) {
  try {
    const { sessionId } = params
    const res = await fetch(`${BACKEND_URL}/board/${sessionId}/state`, {
      method: 'GET',
      headers: {
        Authorization: req.headers.get('Authorization') || '',
      },
    })
    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error('[board state proxy] error:', err)
    return NextResponse.json(
      { error: 'Failed to reach board service' },
      { status: 502 },
    )
  }
}
