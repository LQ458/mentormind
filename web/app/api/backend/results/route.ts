import { NextRequest } from 'next/server'
import { backendHeaders } from '../_auth'
import { backendErrorResponse, backendJsonResponse, logBackendProxyError, proxyFailureResponse } from '../_proxyErrors'

export const dynamic = 'force-dynamic';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(request: NextRequest) {
  try {
    // Call real backend results endpoint
    const backendResponse = await fetch(`${BACKEND_URL}/results`, {
      headers: backendHeaders(request),
    })

    return await backendJsonResponse(backendResponse, 'results list proxy')
  } catch (error) {
    console.error('Failed to get backend results:', error)
    return proxyFailureResponse('Failed to get results')
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Call real backend results endpoint (POST)
    const backendResponse = await fetch(`${BACKEND_URL}/results`, {
      method: 'POST',
      headers: backendHeaders(request, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    })

    if (!backendResponse.ok) {
      const errorText = await backendResponse.text()
      logBackendProxyError('results create proxy', backendResponse.status, errorText)
      return backendErrorResponse('Failed to get results', backendResponse.status)
    }

    return await backendJsonResponse(backendResponse, 'results create proxy')
  } catch (error) {
    console.error('Failed to get backend results:', error)
    return proxyFailureResponse('Failed to get results')
  }
}
