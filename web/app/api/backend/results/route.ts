import { NextResponse } from 'next/server'

const BACKEND_URL = 'http://localhost:8000'

export async function GET() {
  try {
    // Call real backend results endpoint
    const backendResponse = await fetch(`${BACKEND_URL}/results`)
    
    if (!backendResponse.ok) {
      throw new Error(`Backend results error: ${backendResponse.status}`)
    }

    const resultsData = await backendResponse.json()
    return NextResponse.json(resultsData)
  } catch (error) {
    console.error('Failed to get backend results:', error)
    // Return empty results if backend is unavailable
    return NextResponse.json({
      success: true,
      results: [],
      total: 0,
      timestamp: new Date().toISOString()
    })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    
    // Call real backend results endpoint (POST)
    const backendResponse = await fetch(`${BACKEND_URL}/results`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
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