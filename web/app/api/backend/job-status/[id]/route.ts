import { NextResponse } from 'next/server'

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export async function GET(
    _request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const { id } = params
        const backendResponse = await fetch(`${BACKEND_URL}/job-status/${id}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
        })

        if (!backendResponse.ok) {
            const errorText = await backendResponse.text()
            console.error('Job status error:', errorText)
            throw new Error(`Backend error: ${backendResponse.status}`)
        }

        const data = await backendResponse.json()
        return NextResponse.json(data)
    } catch (error) {
        console.error('Job status error:', error)
        return NextResponse.json(
            { error: 'Failed to get job status', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
