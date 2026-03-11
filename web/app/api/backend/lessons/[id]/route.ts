import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

export async function DELETE(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const id = params.id
        console.log(`🗑️ Proxying delete request for lesson: ${id}`)

        const backendResponse = await fetch(`${BACKEND_URL}/lessons/${id}`, {
            method: 'DELETE',
        })

        if (!backendResponse.ok) {
            const errorText = await backendResponse.text()
            console.error('Backend delete error:', errorText)
            return NextResponse.json(
                { error: 'Failed to delete lesson on backend', details: errorText },
                { status: backendResponse.status }
            )
        }

        const response = await backendResponse.json()
        return NextResponse.json(response)
    } catch (error) {
        console.error('API proxy error:', error)
        return NextResponse.json(
            { error: 'Failed to proxy delete request', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}

export async function GET(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const id = params.id
        const backendResponse = await fetch(`${BACKEND_URL}/lessons/${id}`)

        if (!backendResponse.ok) {
            return NextResponse.json(
                { error: 'Lesson not found' },
                { status: backendResponse.status }
            )
        }

        const response = await backendResponse.json()
        return NextResponse.json(response)
    } catch (error) {
        console.error('API proxy error:', error)
        return NextResponse.json(
            { error: 'Failed to get lesson details' },
            { status: 500 }
        )
    }
}
