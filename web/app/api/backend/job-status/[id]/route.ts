import { NextRequest } from 'next/server'
import { backendHeaders } from '../../_auth'
import { backendErrorResponse, backendJsonResponse, logBackendProxyError, proxyFailureResponse } from '../../_proxyErrors'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

// Force Next.js to never cache this route (fixes infinite "processing" loop)
export const dynamic = 'force-dynamic';

export async function GET(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const { id } = params
        const url = `${BACKEND_URL}/job-status/${id}`
        console.log(`[job-status proxy] Fetching: ${url}`)

        // Prevent Next.js fetch() from caching the "processing" state
        const headers = backendHeaders(request, {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store, no-cache, must-revalidate'
        })
        const backendResponse = await fetch(url, {
            method: 'GET',
            headers,
            cache: 'no-store'
        })

        if (!backendResponse.ok) {
            const errorText = await backendResponse.text()
            logBackendProxyError('job-status proxy', backendResponse.status, errorText)
            return backendErrorResponse('Failed to get job status', backendResponse.status)
        }

        const data = await backendResponse.clone().json().catch(() => null)
        console.log(`[job-status proxy] Backend returned status: ${data?.status ?? 'unknown'}`)
        return await backendJsonResponse(backendResponse, 'job-status proxy')
    } catch (error) {
        console.error('Job status proxy error:', error)
        return proxyFailureResponse('Failed to get job status')
    }
}
