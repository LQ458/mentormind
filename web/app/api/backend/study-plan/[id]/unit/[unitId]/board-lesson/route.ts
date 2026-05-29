export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; unitId: string } },
) {
  try {
    const { id, unitId } = params
    const body = await request.json().catch(() => ({}))
    const res = await fetch(
      `${BACKEND_URL}/study-plan/${id}/unit/${unitId}/board-lesson`,
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
    console.error('[board-lesson proxy] error:', err)
    return NextResponse.json(
      { error: 'Failed to start board lesson', details: err instanceof Error ? err.message : 'Unknown error' },
      { status: 502 },
    )
  }
}
