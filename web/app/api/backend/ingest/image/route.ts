export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

export async function POST(request: Request) {
    console.log('📬 [PROXY] Image ingest request received (Streaming Mode)')
    try {
        const contentType = request.headers.get('content-type') || ''
        const authHeader = request.headers.get('Authorization')
        
        // Prepare headers for forwarding
        const headers: Record<string, string> = {
            'Content-Type': contentType,
        }
        if (authHeader) {
            headers['Authorization'] = authHeader
        }

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
