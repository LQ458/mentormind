export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server'
import http from 'http'
import https from 'https'

// Extend the default Next.js Route Handler timeout (60 s in production).
// Whisper transcription of a 30-min audio file can take 3-5 min on CPU.
export const maxDuration = 360 // seconds

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

// Fields forwarded from the client to the backend (all optional except file).
const FORWARDED_FIELDS = [
    'language', 'display_language', 'process', 'student_level', 'duration_minutes',
    'include_video', 'include_exercises', 'include_assessment',
    'target_audience', 'difficulty_level', 'voice_id', 'custom_requirements',
]

// Use a Node.js http.Agent with a long timeout so undici / Node fetch
// does not abort the connection mid-transfer for long transcription requests.
const httpAgent = new http.Agent({ keepAlive: true, timeout: 360_000 })
const httpsAgent = new https.Agent({ keepAlive: true, timeout: 360_000 })

async function fetchWithLongTimeout(url: string, init: RequestInit): Promise<Response> {
    const isHttps = url.startsWith('https')
    const agent = isHttps ? httpsAgent : httpAgent
    return fetch(url, { ...init, agent } as any)
}

export async function POST(request: Request) {
    console.log('📬 [PROXY] Audio ingest request received (Streaming Mode)')
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
        // We do NOT call request.formData() here.
        const backendResponse = await fetch(`${BACKEND_URL}/ingest/audio`, {
            method: 'POST',
            headers,
            body: request.body as any,
            // @ts-ignore - 'duplex' is required for streaming request bodies in some environments/undici
            duplex: 'half'
        })

        if (!backendResponse.ok) {
            const errorText = await backendResponse.text()
            console.error('Audio ingest backend error:', errorText)
            return NextResponse.json(
                { error: 'Backend error', details: errorText }, 
                { status: backendResponse.status }
            )
        }

        const data = await backendResponse.json()
        return NextResponse.json(data)
    } catch (error) {
        console.error('Audio ingest proxy streaming error:', error)
        return NextResponse.json(
            { error: 'Failed to proxy audio upload', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
