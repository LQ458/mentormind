export const dynamic = 'force-dynamic'
import { NextRequest } from 'next/server'
import { backendHeaders } from '../../_auth'
import { backendJsonResponse, proxyFailureResponse } from '../../_proxyErrors'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  try {
    const headers = backendHeaders(req, {
      'Content-Type': 'application/json',
    })
    const search = req.nextUrl.search || ''
    const res = await fetch(`${BACKEND_URL}/admin/feedback${search}`, {
      method: 'GET',
      headers,
    })
    return await backendJsonResponse(res, 'admin feedback proxy')
  } catch (err) {
    console.error('[admin feedback proxy] error:', err)
    return proxyFailureResponse('Failed to fetch feedback')
  }
}
