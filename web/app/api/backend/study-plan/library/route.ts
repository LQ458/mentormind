import { NextRequest } from 'next/server'
import { backendHeaders } from '../../_auth'
import { backendJsonResponse, proxyFailureResponse } from '../../_proxyErrors'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const res = await fetch(`${BACKEND_URL}/study-plan/library`, {
      headers: backendHeaders(req),
    })
    return await backendJsonResponse(res, 'study-plan/library proxy')
  } catch (err) {
    console.error('[study-plan/library proxy] error:', err)
    return proxyFailureResponse('Failed to fetch study-plan library')
  }
}
