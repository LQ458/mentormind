export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server'
import { backendHeaders } from '../_auth'
import { backendErrorResponse, logBackendProxyError, proxyFailureResponse } from '../_proxyErrors'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(request: NextRequest) {
    try {
        const headers = backendHeaders(request)

        const backendResponse = await fetch(`${BACKEND_URL}/lessons`, { headers })
        const data = await backendResponse.json()
        return NextResponse.json(data, { status: backendResponse.status })
    } catch (error) {
        console.error('Failed to fetch lessons:', error)
        return proxyFailureResponse('Failed to fetch lessons')
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
            const errorText = await backendResponse.text()
            logBackendProxyError('lessons bulk delete proxy', backendResponse.status, errorText)
            return backendErrorResponse('Failed to delete lessons', backendResponse.status)
        }

        const data = await backendResponse.json()
        return NextResponse.json(data)
    } catch (error) {
        console.error('Failed to delete all lessons:', error)
        return proxyFailureResponse('Failed to delete all lessons')
    }
}
