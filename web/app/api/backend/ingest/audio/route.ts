import { NextResponse } from 'next/server'

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export async function POST(request: Request) {
    try {
        const formData = await request.formData()
        const file = formData.get('file') as File
        const language = formData.get('language') as string || 'zh'

        if (!file) {
            return NextResponse.json({ error: 'No audio file provided' }, { status: 400 })
        }

        // Forward the file to the backend
        const backendForm = new FormData()
        backendForm.append('file', file)
        backendForm.append('language', language)

        const backendResponse = await fetch(`${BACKEND_URL}/ingest/audio`, {
            method: 'POST',
            body: backendForm,
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
