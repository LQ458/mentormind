import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  try {
    const res = await fetch(`${BACKEND_URL}/study-plan/my-plans`, {
      headers: {
        Authorization: req.headers.get('Authorization') || '',
      },
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error('[study-plan/my-plans proxy] error:', err)
    return NextResponse.json({ error: 'Failed to reach study-plan service' }, { status: 502 })
  }
}
