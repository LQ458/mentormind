import { NextRequest, NextResponse } from 'next/server'
import { backendHeaders } from '../../_auth'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const res = await fetch(`${BACKEND_URL}/study-plan/library`, {
      headers: backendHeaders(req),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error('[study-plan/library proxy] error:', err)
    return NextResponse.json({ error: 'Failed to reach study-plan service' }, { status: 502 })
  }
}
