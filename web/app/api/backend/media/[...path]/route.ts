export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { backendHeaders } from '../../_auth'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';

export async function GET(
    request: NextRequest,
    { params }: { params: { path: string[] } }
) {
    try {
        // Reconstruct the original path from the array
        const mediaPath = params.path.join('/');


        console.log(`[Media Proxy] Fetching: ${BACKEND_URL}/media/${mediaPath}`);

        // Forward auth token/cookie and range headers
        const rangeHeader = request.headers.get('range') || ''
        const requestHeaders = backendHeaders(request, {
            'Range': rangeHeader,
        })

        // Call the FastAPI backend's media streaming endpoint
        // We pass the entire absolute path because the backend handles it that way
        const response = await fetch(`${BACKEND_URL}/media/${mediaPath}`, {
            method: 'GET',
            headers: requestHeaders,
        });

        if (!response.ok) {
            console.error(`[Media Proxy] Backend returned ${response.status} for ${mediaPath}`);
            return new NextResponse(`Media not found: ${response.status}`, { status: response.status });
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
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
