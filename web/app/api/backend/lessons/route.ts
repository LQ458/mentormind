export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server'
import { backendHeaders } from '../_auth'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(request: NextRequest) {
    try {
        const headers = backendHeaders(request)

        const backendResponse = await fetch(`${BACKEND_URL}/lessons`, { headers })
        const data = await backendResponse.json()
        return NextResponse.json(data, { status: backendResponse.status })
    } catch (error) {
        console.error('Failed to fetch lessons:', error)
        return NextResponse.json(
            { error: 'Failed to fetch lessons', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const headers = backendHeaders(request)

        const backendResponse = await fetch(`${BACKEND_URL}/lessons`, {
            method: 'DELETE',
            headers,
        })

        if (!backendResponse.ok) {
            throw new Error(`Backend delete error: ${backendResponse.status}`)
        }

        const data = await backendResponse.json()
        return NextResponse.json(data)
    } catch (error) {
        console.error('Failed to delete all lessons:', error)
        return NextResponse.json(
            { error: 'Failed to delete all lessons', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
