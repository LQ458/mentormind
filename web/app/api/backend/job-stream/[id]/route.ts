import { NextRequest } from 'next/server'
import { backendHeaders } from '../../_auth'
import { backendErrorResponse, logBackendProxyError, proxyFailureResponse } from '../../_proxyErrors'

// Force Next.js to NEVER cache this route or buffer the response
export const dynamic = 'force-dynamic'

export async function GET(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const id = encodeURIComponent(params.id)
        const url = `${process.env.BACKEND_URL || 'http://localhost:8000'}/job-stream/${id}`

        // Forward auth token to backend. EventSource cannot set custom headers,
        // so the proxy also derives Authorization from the session cookie.
        const headers = backendHeaders(request, {
            'Accept': 'text/event-stream',
            'Cache-Control': 'no-store, no-cache, must-revalidate',
        })

        // Fetch from backend using native Node.js fetch (passes streams through)
        const backendResponse = await fetch(url, {
            method: 'GET',
            headers,
            cache: 'no-store'
        })

        if (!backendResponse.ok) {
            const errorText = await backendResponse.text()
            logBackendProxyError('job-stream proxy', backendResponse.status, errorText)
            return backendErrorResponse('Failed to stream job status', backendResponse.status)
        }

        // Return the ReadableStream directly to the client as an EventStream
        return new Response(backendResponse.body, {
            status: 200,
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache, no-transform',
                'Connection': 'keep-alive',
                'X-Accel-Buffering': 'no'
            }
        })
    } catch (error) {
        console.error('[job-stream proxy] Error:', error)
        return proxyFailureResponse('Failed to stream job status')
    }
}
