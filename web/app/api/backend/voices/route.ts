import { NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET() {
    try {
        const response = await fetch(`${BACKEND_URL}/voices`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
        })

        if (!response.ok) {
            throw new Error(`Backend error: ${response.status}`)
        }

        const data = await response.json()
        return NextResponse.json(data)
    } catch (error) {
        console.error('Failed to fetch voices:', error)
        return NextResponse.json(
            { error: 'Failed to fetch voices', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
