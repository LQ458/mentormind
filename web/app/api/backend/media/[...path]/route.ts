export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { backendHeaders } from '../../_auth'
import { backendErrorResponse, logBackendProxyError, proxyFailureResponse } from '../../_proxyErrors'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';

export async function GET(
    request: NextRequest,
    { params }: { params: { path: string[] } }
) {
    try {
        const backendMediaPath = params.path.map((segment) => encodeURIComponent(segment)).join('/');

        // Forward auth token/cookie and range headers
        const rangeHeader = request.headers.get('range') || ''
        const baseHeaders: Record<string, string> = {}
        if (rangeHeader) baseHeaders.Range = rangeHeader
        const requestHeaders = backendHeaders(request, baseHeaders)

        // Call the FastAPI backend's media endpoint with encoded path segments.
        const response = await fetch(`${BACKEND_URL}/media/${backendMediaPath}`, {
            method: 'GET',
            headers: requestHeaders,
        });

        if (!response.ok) {
            const errorText = await response.text()
            logBackendProxyError('media proxy', response.status, errorText)
            return backendErrorResponse('Failed to load media', response.status)
        }

        // Forward the response exactly as it came from FastAPI (with all video headers)
        const responseHeaders = new Headers(response.headers);

        // Create a streaming response
        return new NextResponse(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: responseHeaders
        });

    } catch (error) {
        console.error('[Media Proxy] Error:', error);
        return proxyFailureResponse('Failed to load media');
    }
}
