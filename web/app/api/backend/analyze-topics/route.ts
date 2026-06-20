export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server'
import { backendHeaders } from '../_auth'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const headers = backendHeaders(request, { 'Content-Type': 'application/json' })

        const backendResponse = await fetch(`${BACKEND_URL}/analyze-topics`, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
        })

        if (!backendResponse.ok) {
            const errorText = await backendResponse.text()
            console.error('analyze-topics backend error:', errorText)
            throw new Error(`Backend error: ${backendResponse.status}`)
        }

        const data = await backendResponse.json()
        return NextResponse.json(data)
    } catch (error) {
        console.error('analyze-topics proxy error:', error)
        return NextResponse.json(
            { error: 'Failed to analyze topics', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
