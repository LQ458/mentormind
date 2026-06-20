export const dynamic = 'force-dynamic'
import { NextRequest } from 'next/server'
import { backendHeaders } from '../../_auth'
import { backendJsonResponse, proxyFailureResponse } from '../../_proxyErrors'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  try {
    const res = await fetch(`${BACKEND_URL}/admin/metrics`, {
      method: 'GET',
      headers: backendHeaders(req),
      cache: 'no-store',
    })
    return await backendJsonResponse(res, 'admin metrics proxy')
  } catch (err) {
    console.error('[admin metrics proxy] error:', err)
    return proxyFailureResponse('Failed to fetch admin metrics')
  }
}
