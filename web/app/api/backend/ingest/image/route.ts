export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server'
import { backendHeaders } from '../../_auth'

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
            console.error('Image ingest backend error:', errorText)
            return NextResponse.json(
                { error: 'Backend error', details: errorText }, 
                { status: backendResponse.status }
            )
        }

        const data = await backendResponse.json()
        return NextResponse.json(data)
    } catch (error) {
        console.error('Image ingest proxy streaming error:', error)
        return NextResponse.json(
            { error: 'Failed to proxy image upload', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
