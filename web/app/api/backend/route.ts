import { NextResponse } from 'next/server'

const BACKEND_URL = 'http://localhost:8000'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { studentQuery, mode = 'batch' } = body

    // Call real backend API
    const backendResponse = await fetch(`${BACKEND_URL}/teach`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ studentQuery, mode }),
    })

    if (!backendResponse.ok) {
      const errorText = await backendResponse.text()
      console.error('Backend API error:', errorText)
      throw new Error(`Backend API error: ${backendResponse.status}`)
    }

    const response = await backendResponse.json()

    return NextResponse.json(response)
  } catch (error) {
    console.error('Backend API error:', error)
    return NextResponse.json(
      { error: 'Failed to process request', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function GET() {
  try {
    // Call real backend status endpoint
    const backendResponse = await fetch(`${BACKEND_URL}/status`)
    
    if (!backendResponse.ok) {
      throw new Error(`Backend status error: ${backendResponse.status}`)
    }

    const statusData = await backendResponse.json()
    return NextResponse.json(statusData)
  } catch (error) {
    console.error('Failed to get backend status:', error)
    // Fallback to simulated status
    return NextResponse.json({
      status: 'offline',
      version: '1.0.0',
      services: {
        deepseek: 'not_configured',
        funasr: 'simulated',
        paddle_ocr: 'simulated',
        tts: 'simulated'
      },
      cost_analysis: {
        monthly_budget: 160.00,
        current_month: 3.42,
        remaining: 156.58
      },
      error: 'Backend connection failed'
    })
  }
}