export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server'
import { backendErrorResponse, logBackendProxyError, proxyFailureResponse } from '../_proxyErrors'

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
            const errorText = await response.text()
            logBackendProxyError('voices proxy', response.status, errorText)
            return backendErrorResponse('Failed to fetch voices', response.status)
        }

        const data = await response.json()
        return NextResponse.json(data)
    } catch (error) {
        console.error('Failed to fetch voices:', error)
        return proxyFailureResponse('Failed to fetch voices')
    }
}
