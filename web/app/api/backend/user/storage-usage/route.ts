import { NextRequest } from 'next/server'
import { backendHeaders } from '../../_auth'
import { backendJsonResponse, proxyFailureResponse } from '../../_proxyErrors'

export const dynamic = 'force-dynamic'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  try {
    const res = await fetch(`${BACKEND_URL}/user/storage-usage`, {
      headers: backendHeaders(req),
    })
    return await backendJsonResponse(res, 'user storage-usage proxy')
  } catch (err) {
    console.error('[user storage-usage proxy] error:', err)
    return proxyFailureResponse('Failed to fetch storage usage')
  }
}
