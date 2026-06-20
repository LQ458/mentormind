export const dynamic = 'force-dynamic'
import { NextRequest } from 'next/server'
import { backendHeaders } from '../../../../_auth'
import { backendJsonResponse, proxyFailureResponse } from '../../../../_proxyErrors'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  try {
    const search = req.nextUrl.search || ''
    const res = await fetch(`${BACKEND_URL}/admin/feedback/reports/aggregate${search}`, {
      method: 'GET',
      headers: backendHeaders(req, { 'Content-Type': 'application/json' }),
    })
    return await backendJsonResponse(res, 'admin feedback reports aggregate proxy')
  } catch (err) {
    console.error('[admin feedback reports aggregate proxy] error:', err)
    return proxyFailureResponse('Failed to fetch feedback report aggregate')
  }
}
