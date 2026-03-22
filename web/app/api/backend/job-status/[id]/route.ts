import { NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

// Force Next.js to never cache this route (fixes infinite "processing" loop)
export const dynamic = 'force-dynamic';

export async function GET(
    _request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const { id } = params
        const url = `${BACKEND_URL}/job-status/${id}`
        console.log(`[job-status proxy] Fetching: ${url}`)

        // Prevent Next.js fetch() from caching the "processing" state
        const backendResponse = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-store, no-cache, must-revalidate'
            },
            cache: 'no-store'
        })

        if (!backendResponse.ok) {
            const errorText = await backendResponse.text()
            console.error('Job status error:', backendResponse.status, errorText)
            throw new Error(`Backend error: ${backendResponse.status}`)
        }

        const data = await backendResponse.json()
        console.log(`[job-status proxy] Backend returned status: ${data.status}`)
        return NextResponse.json(data)
    } catch (error) {
        console.error('Job status proxy error:', error)
        return NextResponse.json(
            { error: 'Failed to get job status', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
