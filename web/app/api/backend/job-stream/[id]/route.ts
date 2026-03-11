import { NextRequest } from 'next/server'

// Force Next.js to NEVER cache this route or buffer the response
export const dynamic = 'force-dynamic'

export async function GET(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const { id } = params
        const url = `${process.env.BACKEND_URL || 'http://localhost:8000'}/job-stream/${id}`
        console.log(`[job-stream proxy] Fetching SSE from: ${url}`)

        // Fetch from backend using native Node.js fetch (passes streams through)
        const backendResponse = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'text/event-stream',
                'Cache-Control': 'no-store, no-cache, must-revalidate',
            },
            cache: 'no-store'
        })

        if (!backendResponse.ok) {
            console.error(`[job-stream proxy] Backend returned error: ${backendResponse.status}`)
            return new Response(`Backend Error: ${backendResponse.status}`, { status: backendResponse.status })
        }

        // Return the ReadableStream directly to the client as an EventStream
        return new Response(backendResponse.body, {
            status: 200,
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache, no-transform',
                'Connection': 'keep-alive',
                'Transfer-Encoding': 'chunked'
            }
        })
    } catch (error) {
        console.error('[job-stream proxy] Error:', error)
        return new Response('Internal Server Error', { status: 500 })
    }
}
