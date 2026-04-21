export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

export async function POST(
  request: NextRequest,
  { params }: { params: { sessionId: string } },
) {
  try {
    const { sessionId } = params
    const body = await request.json().catch(() => ({}))
    const res = await fetch(
      `${BACKEND_URL}/board/session/${sessionId}/summary`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: request.headers.get('Authorization') || '',
        },
        body: JSON.stringify(body),
      },
    )
    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error('[board summary proxy] error:', err)
    return NextResponse.json(
      { error: 'Failed to request summary', details: err instanceof Error ? err.message : 'Unknown error' },
      { status: 502 },
    )
  }
}
