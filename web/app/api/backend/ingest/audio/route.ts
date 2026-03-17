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
    'language', 'process', 'student_level', 'duration_minutes',
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
    try {
        const formData = await request.formData()
        const file = formData.get('file') as File

        if (!file) {
            return NextResponse.json({ error: 'No audio file provided' }, { status: 400 })
        }

        // Forward the file and all optional fields to the backend
        const backendForm = new FormData()
        backendForm.append('file', file)
        for (const field of FORWARDED_FIELDS) {
            const value = formData.get(field)
            if (value !== null) backendForm.append(field, value as string)
        }

        // Forward Authorization header
        const authHeader = request.headers.get('Authorization')
        const headers: Record<string, string> = {}
        if (authHeader) {
            headers['Authorization'] = authHeader
        }

        const backendResponse = await fetchWithLongTimeout(`${BACKEND_URL}/ingest/audio`, {
            method: 'POST',
            body: backendForm as unknown as BodyInit,
            headers,
        })

        if (!backendResponse.ok) {
            const errorText = await backendResponse.text()
            console.error('Audio ingest error:', errorText)
            throw new Error(`Backend error: ${backendResponse.status}`)
        }

        const data = await backendResponse.json()
        return NextResponse.json(data)
    } catch (error) {
        console.error('Audio ingest proxy error:', error)
        return NextResponse.json(
            { error: 'Failed to transcribe audio', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
