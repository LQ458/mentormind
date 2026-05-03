export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

export async function POST(req: NextRequest) {
  try {
    const body = await req.text()
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    const auth = req.headers.get('Authorization')
    if (auth) headers.Authorization = auth
    const res = await fetch(`${BACKEND_URL}/telemetry/event`, {
      method: 'POST',
      headers,
      body,
    })
    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error('[telemetry event proxy] error:', err)
    return NextResponse.json(
      { error: 'Failed to reach telemetry service' },
      { status: 502 },
    )
  }
}
