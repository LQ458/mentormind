export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server'
import { backendHeaders } from '../_auth'
import { backendErrorResponse, logBackendProxyError, proxyFailureResponse } from '../_proxyErrors'

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
            logBackendProxyError('analyze-topics proxy', backendResponse.status, errorText)
            return backendErrorResponse('Failed to analyze topics', backendResponse.status)
        }

        const data = await backendResponse.json()
        return NextResponse.json(data)
    } catch (error) {
        console.error('analyze-topics proxy error:', error)
        return proxyFailureResponse('Failed to analyze topics')
    }
}
