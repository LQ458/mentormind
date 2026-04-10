import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ planId: string }> }
) {
  try {
    const { planId } = await params
    const res = await fetch(`${BACKEND_URL}/gaokao/sessions/${planId}`, {
      headers: {
        Authorization: req.headers.get('Authorization') || '',
      },
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error('[gaokao/sessions proxy] error:', err)
    return NextResponse.json({ error: 'Failed to reach gaokao sessions service' }, { status: 502 })
  }
}
