import { NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

export async function DELETE() {
    try {
        const backendResponse = await fetch(`${BACKEND_URL}/lessons`, {
            method: 'DELETE',
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
