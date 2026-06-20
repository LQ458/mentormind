import { NextRequest } from 'next/server'
import { backendHeaders } from '../../_auth'
import { backendJsonResponse, proxyFailureResponse } from '../../_proxyErrors'

export const dynamic = 'force-dynamic'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const params = url.searchParams.toString()
    const res = await fetch(`${BACKEND_URL}/user/media-context${params ? '?' + params : ''}`, {
      headers: backendHeaders(req),
    })
    return await backendJsonResponse(res, 'user media-context proxy')
  } catch (err) {
    console.error('[user media-context proxy] error:', err)
    return proxyFailureResponse('Failed to fetch media context')
  }
}
