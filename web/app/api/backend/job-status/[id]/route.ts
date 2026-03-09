import { NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(
    _request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const { id } = params
        const url = `${BACKEND_URL}/job-status/${id}`
        console.log(`[job-status proxy] Fetching: ${url}`)

        const backendResponse = await fetch(url, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
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
