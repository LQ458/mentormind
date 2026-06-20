export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server'
import { backendHeaders } from '../../_auth'
import { backendErrorResponse, logBackendProxyError, proxyFailureResponse } from '../../_proxyErrors'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

export async function POST(request: NextRequest) {
    console.log('📬 [PROXY] Image ingest request received (Streaming Mode)')
    try {
        const contentType = request.headers.get('content-type') || ''
        const headers = backendHeaders(request, { 'Content-Type': contentType })

        // Zero-Copy Proxy: Stream the request body directly to the backend
        const backendResponse = await fetch(`${BACKEND_URL}/ingest/image`, {
            method: 'POST',
            headers,
            body: request.body as any,
            // @ts-ignore
            duplex: 'half'
        })

        if (!backendResponse.ok) {
            const errorText = await backendResponse.text()
            logBackendProxyError('image ingest proxy', backendResponse.status, errorText)
            return backendErrorResponse('Image upload failed', backendResponse.status)
        }

        const data = await backendResponse.json()
        return NextResponse.json(data)
    } catch (error) {
        console.error('Image ingest proxy streaming error:', error)
        return proxyFailureResponse('Failed to proxy image upload')
    }
}
