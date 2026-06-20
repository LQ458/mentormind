import { NextRequest, NextResponse } from 'next/server'
import { backendHeaders } from '../_auth'

export const dynamic = 'force-dynamic';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(request: NextRequest) {
  try {
    // Call real backend results endpoint
    const backendResponse = await fetch(`${BACKEND_URL}/results`, {
      headers: backendHeaders(request),
    })

    const resultsData = await backendResponse.json()
    return NextResponse.json(resultsData, { status: backendResponse.status })
  } catch (error) {
    console.error('Failed to get backend results:', error)
    return NextResponse.json(
      { error: 'Failed to get results', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 502 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Call real backend results endpoint (POST)
    const backendResponse = await fetch(`${BACKEND_URL}/results`, {
      method: 'POST',
      headers: backendHeaders(request, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    })

    if (!backendResponse.ok) {
      throw new Error(`Backend results error: ${backendResponse.status}`)
    }

    const resultsData = await backendResponse.json()
    return NextResponse.json(resultsData)
  } catch (error) {
    console.error('Failed to get backend results:', error)
    return NextResponse.json(
      { error: 'Failed to get results', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
