import { NextRequest, NextResponse } from 'next/server'
import { backendHeaders } from '../../_auth'
import { backendErrorResponse, logBackendProxyError, proxyFailureResponse } from '../../_proxyErrors'

export const dynamic = 'force-dynamic';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

export async function DELETE(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const id = params.id
        console.log(`🗑️ Proxying delete request for lesson: ${id}`)

        const headers = backendHeaders(request)

        const backendResponse = await fetch(`${BACKEND_URL}/lessons/${id}`, {
            method: 'DELETE',
            headers,
        })

        if (!backendResponse.ok) {
            const errorText = await backendResponse.text()
            logBackendProxyError('lesson delete proxy', backendResponse.status, errorText)
            return backendErrorResponse('Failed to delete lesson', backendResponse.status)
        }

        const response = await backendResponse.json()
        return NextResponse.json(response)
    } catch (error) {
        console.error('API proxy error:', error)
        return proxyFailureResponse('Failed to delete lesson')
    }
}

export async function GET(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const id = params.id
        const headers = backendHeaders(request)
        const backendResponse = await fetch(`${BACKEND_URL}/lessons/${id}`, { headers })

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
