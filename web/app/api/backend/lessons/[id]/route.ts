import { NextRequest } from 'next/server'
import { backendHeaders } from '../../_auth'
import { backendErrorResponse, backendJsonResponse, logBackendProxyError, proxyFailureResponse } from '../../_proxyErrors'

export const dynamic = 'force-dynamic';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

export async function DELETE(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const id = encodeURIComponent(params.id)
        console.info('[lesson delete proxy] forwarding delete request')

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

        return await backendJsonResponse(backendResponse, 'lesson delete proxy')
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
        const id = encodeURIComponent(params.id)
        const headers = backendHeaders(request)
        const backendResponse = await fetch(`${BACKEND_URL}/lessons/${id}`, { headers })

        if (!backendResponse.ok) {
            const errorText = await backendResponse.text()
            logBackendProxyError('lesson read proxy', backendResponse.status, errorText)
            return backendErrorResponse(
                backendResponse.status === 404 ? 'Lesson not found' : 'Failed to fetch lesson',
                backendResponse.status,
            )
        }

        return await backendJsonResponse(backendResponse, 'lesson read proxy')
    } catch (error) {
        console.error('API proxy error:', error)
        return proxyFailureResponse('Failed to get lesson details')
    }
}
